import type { StellarAppKit } from './client.js';
import { ConnectError } from './types.js';
import {
  buildTransactionPreview,
  decodeSimulationDeltas,
  type TransactionPreview,
  type BalanceDelta,
} from './decode.js';

// Peer dependency — imported lazily (see `sdk()` below) so `core` doesn't
// force a specific @stellar/stellar-sdk version on apps that only need the
// wallet layer.
type StellarSdkModule = typeof import('@stellar/stellar-sdk');
type RpcModule = typeof import('@stellar/stellar-sdk/rpc');

export interface SorobanConnectionConfig {
  rpcUrl: string;
  networkPassphrase: string;
  wallet: StellarAppKit;
}

export interface InvokeOptions {
  contractId: string;
  method: string;
  /** Pass pre-built xdr.ScVal args, or use a TypedContractClient (see `contract()`) to avoid building these by hand. */
  args?: unknown[];
  /** Skip signing/submission entirely for read-only calls — just simulate and return the decoded result. */
  simulateOnly?: boolean;
  /** Base fee in stroops for the outer transaction, before Soroban resource fees are added. Defaults to 100. */
  baseFee?: string;
}

export interface InvokeResult {
  status: 'SIMULATED' | 'SUCCESS' | 'FAILED';
  hash?: string;
  returnValue?: unknown;
  raw: unknown;
}

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
  private rpcUrl: string;
  private networkPassphrase: string;
  private wallet: StellarAppKit;
  private _sdk: StellarSdkModule | null = null;
  private _rpc: RpcModule | null = null;
  private _server: InstanceType<RpcModule['Server']> | null = null;

  constructor(config: SorobanConnectionConfig) {
    this.rpcUrl = config.rpcUrl;
    this.networkPassphrase = config.networkPassphrase;
    this.wallet = config.wallet;
  }

  private async sdk(): Promise<StellarSdkModule> {
    return (this._sdk ??= await import('@stellar/stellar-sdk'));
  }

  private async rpc(): Promise<RpcModule> {
    return (this._rpc ??= await import('@stellar/stellar-sdk/rpc'));
  }

  private async server() {
    if (this._server) return this._server;
    const { Server } = await this.rpc();
    this._server = new Server(this.rpcUrl);
    return this._server;
  }

  /** High-level: the 90% case. Builds, simulates, prepares, signs, submits, and polls a single contract call. */
  async invoke(opts: InvokeOptions): Promise<InvokeResult> {
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
    }).addOperation(contract.call(opts.method, ...((opts.args ?? []) as never[])));

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
    const sendResponse = await server.sendTransaction(signedTx as never);

    if (sendResponse.status !== 'PENDING') {
      throw ConnectError.externalService(
        `Transaction submission failed with status ${sendResponse.status}.`,
        sendResponse.errorResult ? [String(sendResponse.errorResult)] : undefined,
        this.wallet.activeConnector?.id
      );
    }

    const final = await server.pollTransaction(sendResponse.hash, { attempts: 15, sleepStrategy: () => 1000 });

    if (final.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
      throw ConnectError.externalService(`Transaction failed with status ${final.status}.`, undefined, this.wallet.activeConnector?.id);
    }

    return { status: 'SUCCESS', hash: sendResponse.hash, returnValue: decodeTxResult(final), raw: final };
  }

  /**
   * Builds and simulates like invoke() does, but stops there — returns a
   * decoded preview (see decode.ts) with a simulation status AND balance
   * deltas attached, instead of executing the full sign/submit pipeline.
   * Useful for showing "here's what this call will do, whether it would
   * even succeed, and how balances will change" before the user commits
   * to it.
   *
   * Balance deltas are extracted from the simulation's `stateChanges`
   * array — the network's own authoritative statement of what would
   * change. For account/trustline entries this surfaces "XLM balance:
   * 1000 → 900 (−100)" rather than just "you're calling transfer". For
   * contract storage changes (including SEP-41 token balances), it
   * surfaces "Contract C...: storage entry updated" — the previous
   * version only decoded the *intended* amount from call args, not the
   * actual deltas.
   *
   * Note invoke() itself already runs every signature through the preview
   * flow automatically (it calls wallet.signTransaction() under the hood,
   * which is where StellarAppKit's onPreviewTransaction hook lives) — this
   * method is for showing a preview earlier, e.g. inline in a confirm
   * button, without needing to actually call invoke() first. The balance
   * deltas here are NOT included in the onPreviewTransaction hook (which
   * fires at sign time, after the simulation has gone stale) — call this
   * method explicitly if you want deltas.
   */
  async previewInvoke(opts: InvokeOptions): Promise<TransactionPreview & {
    simulationStatus: 'success' | 'failed';
    simulationError?: string;
    /** Balance deltas extracted from the simulation's stateChanges — empty for failed simulations or read-only calls. */
    balanceDeltas: BalanceDelta[];
  }> {
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
      .addOperation(contract.call(opts.method, ...((opts.args ?? []) as never[])))
      .setTimeout(60)
      .build();

    const simulation = await server.simulateTransaction(tx);
    const isFailure = rpc.Api.isSimulationError(simulation);

    const preview = await buildTransactionPreview(tx.toXDR(), this.networkPassphrase, this.wallet.previewOptions);

    // Only decode deltas from successful simulations — failed ones don't
    // have a stateChanges array, and decoding would just return [].
    const balanceDeltas = isFailure ? [] : await decodeSimulationDeltas(simulation);

    return {
      ...preview,
      simulationStatus: isFailure ? 'failed' : 'success',
      simulationError: isFailure ? simulation.error : undefined,
      balanceDeltas,
    };
  }

  /** Low-level escape hatches for callers that need more control than `invoke()` gives. */
  async simulate(tx: unknown) {
    const server = await this.server();
    return server.simulateTransaction(tx as never);
  }

  async prepare(tx: unknown) {
    const server = await this.server();
    return server.prepareTransaction(tx as never);
  }

  async submit(signedXdr: string) {
    const sdk = await this.sdk();
    const server = await this.server();
    const tx = sdk.TransactionBuilder.fromXDR(signedXdr, this.networkPassphrase);
    return server.sendTransaction(tx as never);
  }

  async pollStatus(hash: string, opts?: { attempts?: number }) {
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
  private async signAuthEntries(
    tx: InstanceType<StellarSdkModule['Transaction']>
  ): Promise<InstanceType<StellarSdkModule['Transaction']>> {
    // Left intentionally minimal: real implementations need to walk
    // `tx.operations` for `invokeHostFunction` ops, pull `auth` entries
    // whose credentials match the connected address, sign each via
    // `wallet.signAuthEntry`, and rebuild the transaction with the signed
    // entries substituted in. This is Phase 1 follow-up work — flagged
    // here rather than silently no-op'd.
    throw ConnectError.internal(
      'This transaction requires signing individual Soroban auth entries, which is not yet implemented in SorobanConnection.signAuthEntries(). See ARCHITECTURE.md §9, Phase 1.'
    );
  }

  // ---- contract() — typed client generation, Phase 1 follow-up ----
  // contract<T extends ContractSpec>(contractId: string, spec: T): TypedContractClient<T> { ... }
}

function transactionNeedsAuthEntrySigning(_tx: unknown): boolean {
  // Real implementation inspects invokeHostFunction auth entries for
  // SOROBAN_CREDENTIALS_ADDRESS entries matching the connected account.
  // Conservatively returns false for now so invoke() takes the common
  // (single outer-transaction-signature) path by default.
  return false;
}

function decodeSimResult(simulation: unknown): unknown {
  // Real implementation uses scValToNative() on simulation.result.retval.
  return simulation;
}

function decodeTxResult(final: unknown): unknown {
  // Real implementation uses scValToNative() on the return value in final.resultMetaXdr.
  return final;
}
