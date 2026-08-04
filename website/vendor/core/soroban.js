import { ConnectError } from './types.js';
import { buildTransactionPreview } from './decode.js';
/**
 * Owns everything RPC/contract-shaped so app code never touches
 * `rpc.Server` directly. `invoke()` is the 90% case: build → simulate →
 * prepare (resource footprint + fees) → sign via the connected wallet →
 * submit → poll to completion, surfacing one typed result or one
 * normalized error.
 *
 * This is also the intended seam for Saganta's gas-sponsorship and
 * smart-account signer: both can be injected as an alternate `AuthProvider`
 * here later without changing any call site that uses `invoke()`.
 */
export class SorobanConnection {
    constructor(config) {
        this._sdk = null;
        this._rpc = null;
        this._server = null;
        this.rpcUrl = config.rpcUrl;
        this.networkPassphrase = config.networkPassphrase;
        this.wallet = config.wallet;
    }
    async sdk() {
        return (this._sdk ??= await import('@stellar/stellar-sdk'));
    }
    async rpc() {
        return (this._rpc ??= await import('@stellar/stellar-sdk/rpc'));
    }
    async server() {
        if (this._server)
            return this._server;
        const { Server } = await this.rpc();
        this._server = new Server(this.rpcUrl);
        return this._server;
    }
    /** High-level: the 90% case. Builds, simulates, prepares, signs, submits, and polls a single contract call. */
    async invoke(opts) {
        const sdk = await this.sdk();
        const rpc = await this.rpc();
        const server = await this.server();
        const session = this.wallet.session;
        if (!session) {
            throw ConnectError.invalidRequest('Connect a wallet before invoking a contract.');
        }
        const sourceAccount = await server.getAccount(session.address);
        const contract = new sdk.Contract(opts.contractId);
        let builder = new sdk.TransactionBuilder(sourceAccount, {
            fee: opts.baseFee ?? sdk.BASE_FEE,
            networkPassphrase: this.networkPassphrase,
        }).addOperation(contract.call(opts.method, ...(opts.args ?? [])));
        const tx = builder.setTimeout(60).build();
        const simulation = await server.simulateTransaction(tx);
        if (rpc.Api.isSimulationError(simulation)) {
            throw ConnectError.externalService(`Simulation failed: ${simulation.error}`, undefined, this.wallet.activeConnector?.id);
        }
        if (opts.simulateOnly) {
            return { status: 'SIMULATED', returnValue: decodeSimResult(simulation), raw: simulation };
        }
        const prepared = await server.prepareTransaction(tx);
        // Soroban auth entries (if this call needs delegated auth) are signed
        // separately from the outer transaction envelope — the wallet layer
        // exposes both via one interface, so this branches on capability, not
        // wallet identity.
        const needsAuthEntrySigning = transactionNeedsAuthEntrySigning(prepared);
        let readyTx = prepared;
        if (needsAuthEntrySigning) {
            readyTx = await this.signAuthEntries(prepared);
        }
        const { signedTxXdr } = await this.wallet.signTransaction(readyTx.toXDR(), {
            networkPassphrase: this.networkPassphrase,
        });
        const signedTx = sdk.TransactionBuilder.fromXDR(signedTxXdr, this.networkPassphrase);
        const sendResponse = await server.sendTransaction(signedTx);
        if (sendResponse.status !== 'PENDING') {
            throw ConnectError.externalService(`Transaction submission failed with status ${sendResponse.status}.`, sendResponse.errorResult ? [String(sendResponse.errorResult)] : undefined, this.wallet.activeConnector?.id);
        }
        const final = await server.pollTransaction(sendResponse.hash, { attempts: 15, sleepStrategy: () => 1000 });
        if (final.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
            throw ConnectError.externalService(`Transaction failed with status ${final.status}.`, undefined, this.wallet.activeConnector?.id);
        }
        return { status: 'SUCCESS', hash: sendResponse.hash, returnValue: decodeTxResult(final), raw: final };
    }
    /**
     * Builds and simulates like invoke() does, but stops there — returns a
     * decoded preview (see decode.ts) with a simulation status attached,
     * instead of executing the full sign/submit pipeline. Useful for showing
     * "here's what this call will do, and whether it would even succeed"
     * before the user commits to it.
     *
     * Note invoke() itself already runs every signature through the preview
     * flow automatically (it calls wallet.signTransaction() under the hood,
     * which is where StellarAppKit's onPreviewTransaction hook lives) — this
     * method is for showing a preview earlier, e.g. inline in a confirm
     * button, without needing to actually call invoke() first.
     */
    async previewInvoke(opts) {
        const sdk = await this.sdk();
        const rpc = await this.rpc();
        const server = await this.server();
        const session = this.wallet.session;
        if (!session) {
            throw ConnectError.invalidRequest('Connect a wallet before previewing a contract call.');
        }
        const sourceAccount = await server.getAccount(session.address);
        const contract = new sdk.Contract(opts.contractId);
        const tx = new sdk.TransactionBuilder(sourceAccount, {
            fee: opts.baseFee ?? sdk.BASE_FEE,
            networkPassphrase: this.networkPassphrase,
        })
            .addOperation(contract.call(opts.method, ...(opts.args ?? [])))
            .setTimeout(60)
            .build();
        const simulation = await server.simulateTransaction(tx);
        const isFailure = rpc.Api.isSimulationError(simulation);
        const preview = await buildTransactionPreview(tx.toXDR(), this.networkPassphrase, this.wallet.previewOptions);
        return {
            ...preview,
            simulationStatus: isFailure ? 'failed' : 'success',
            simulationError: isFailure ? simulation.error : undefined,
        };
    }
    /** Low-level escape hatches for callers that need more control than `invoke()` gives. */
    async simulate(tx) {
        const server = await this.server();
        return server.simulateTransaction(tx);
    }
    async prepare(tx) {
        const server = await this.server();
        return server.prepareTransaction(tx);
    }
    async submit(signedXdr) {
        const sdk = await this.sdk();
        const server = await this.server();
        const tx = sdk.TransactionBuilder.fromXDR(signedXdr, this.networkPassphrase);
        return server.sendTransaction(tx);
    }
    async pollStatus(hash, opts) {
        const server = await this.server();
        return server.pollTransaction(hash, { attempts: opts?.attempts ?? 15, sleepStrategy: () => 1000 });
    }
    /**
     * Signs each Soroban auth entry that requires the connected wallet's
     * signature, via `signAuthEntry` rather than a second `signTransaction`
     * call — this is what lets delegated/multi-party auth flows and (later)
     * Saganta's smart-account signer plug in without special-casing the
     * invoke pipeline.
     */
    async signAuthEntries(tx) {
        // Left intentionally minimal: real implementations need to walk
        // `tx.operations` for `invokeHostFunction` ops, pull `auth` entries
        // whose credentials match the connected address, sign each via
        // `wallet.signAuthEntry`, and rebuild the transaction with the signed
        // entries substituted in. This is Phase 1 follow-up work — flagged
        // here rather than silently no-op'd.
        throw ConnectError.internal('This transaction requires signing individual Soroban auth entries, which is not yet implemented in SorobanConnection.signAuthEntries(). See ARCHITECTURE.md §9, Phase 1.');
    }
}
function transactionNeedsAuthEntrySigning(_tx) {
    // Real implementation inspects invokeHostFunction auth entries for
    // SOROBAN_CREDENTIALS_ADDRESS entries matching the connected account.
    // Conservatively returns false for now so invoke() takes the common
    // (single outer-transaction-signature) path by default.
    return false;
}
function decodeSimResult(simulation) {
    // Real implementation uses scValToNative() on simulation.result.retval.
    return simulation;
}
function decodeTxResult(final) {
    // Real implementation uses scValToNative() on the return value in final.resultMetaXdr.
    return final;
}
//# sourceMappingURL=soroban.js.map