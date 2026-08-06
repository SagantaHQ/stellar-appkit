import type { StellarAppKit } from './client.js';
import { type TransactionPreview, type BalanceDelta, type FeeEstimate } from './decode.js';
import { ContractClient, type ContractSpec } from './contract.js';
import { FailoverRpcServer } from './rpc-failover.js';
type RpcModule = typeof import('@stellar/stellar-sdk/rpc');
export interface SorobanConnectionConfig {
    /**
     * Primary RPC URL. If `rpcUrls` is also provided, this is ignored —
     * use one or the other.
     */
    rpcUrl?: string;
    /**
     * Multiple RPC URLs for failover. The first healthy one is preferred;
     * on a network/5xx error, the next is tried, and so on. Failed
     * servers are marked unhealthy for 30s before being retried.
     *
     * Mutually exclusive with `rpcUrl` and `rpc` — if both are set,
     * `rpcUrls` takes precedence.
     */
    rpcUrls?: string[];
    /**
     * Pre-constructed RPC server (or failover wrapper) to use directly.
     * Mutually exclusive with `rpcUrl` and `rpcUrls` — if set, takes
     * precedence over both. Useful for tests where you want to inject a
     * mock server.
     */
    rpc?: InstanceType<RpcModule['Server']>;
    /**
     * Optional failover configuration — only used when `rpcUrls` is set.
     * Pass `unhealthyCooldownMs` and `onFailover` here.
     */
    failoverOptions?: Omit<ConstructorParameters<typeof FailoverRpcServer>[0], 'servers'>;
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
export declare class SorobanConnection {
    private rpcUrl?;
    private rpcUrls?;
    private injectedRpc?;
    private failoverOptions?;
    private networkPassphrase;
    private wallet;
    private _sdk;
    private _rpc;
    private _server;
    private _failover;
    constructor(config: SorobanConnectionConfig);
    private sdk;
    private rpc;
    private server;
    /**
     * Returns the current failover status, if the connection was configured
     * with `rpcUrls`. Returns null for single-server configs. Useful for
     * dashboards / monitoring UIs that want to show which RPC provider is
     * currently being used.
     */
    getFailoverStatus(): Array<{
        url: string;
        healthy: boolean;
        failureCount: number;
    }> | null;
    /** High-level: the 90% case. Builds, simulates, prepares, signs, submits, and polls a single contract call. */
    invoke(opts: InvokeOptions): Promise<InvokeResult>;
    /**
     * Builds and simulates like invoke() does, but stops there — returns a
     * decoded preview (see decode.ts) with a simulation status, balance
     * deltas, AND a fee estimate attached, instead of executing the full
     * sign/submit pipeline. Useful for showing "here's what this call will
     * do, whether it would even succeed, how balances will change, and what
     * it will cost" before the user commits to it.
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
     * The fee estimate is extracted from the simulation's `cost` field —
     * the network's own statement of what the call will cost, including
     * Soroban resource fees (CPU + memory + storage). Shown as
     * `feeEstimate.totalFeeXlm` (e.g. "0.00001 XLM") for headline display.
     *
     * Note invoke() itself already runs every signature through the preview
     * flow automatically (it calls wallet.signTransaction() under the hood,
     * which is where StellarAppKit's onPreviewTransaction hook lives) — this
     * method is for showing a preview earlier, e.g. inline in a confirm
     * button, without needing to actually call invoke() first. The balance
     * deltas and fee estimate here are NOT included in the
     * onPreviewTransaction hook (which fires at sign time, after the
     * simulation has gone stale) — call this method explicitly if you want
     * them.
     */
    previewInvoke(opts: InvokeOptions): Promise<TransactionPreview & {
        simulationStatus: 'success' | 'failed';
        simulationError?: string;
        /** Balance deltas extracted from the simulation's stateChanges — empty for failed simulations or read-only calls. */
        balanceDeltas: BalanceDelta[];
    }>;
    /**
     * Estimates the fee for a given transaction XDR by simulating it.
     * Returns the full FeeEstimate breakdown — base fee, Soroban resource
     * fee, instruction count, total in stroops and XLM.
     *
     * This is a lower-level escape hatch than previewInvoke() — use it when
     * you already have a built transaction (e.g. from a contract.Client
     * call) and just want the fee number, without the full preview.
     *
     * For Soroban transactions, the simulation is required to compute the
     * resource fee — without it, we can only return the declared base fee.
     * For classic (non-Soroban) transactions, the simulation is optional
     * (there's no resource fee), but passing one doesn't hurt.
     */
    estimateFee(xdr: string): Promise<FeeEstimate | null>;
    /**
     * Returns a typed client for a Soroban contract, bound to this
     * connection. Methods on the client are typed from the consumer's
     * TS interface (`T`), so `client.transfer({ from, to, amount })` is
     * fully typed — wrong arg names, missing fields, or wrong types are
     * caught at compile time.
     *
     * Each method delegates to `invoke()`, so it goes through the same
     * simulate → prepare → sign → submit → poll pipeline, with the
     * transaction preview flow and signature-request queueing intact.
     *
     * @param contractId The contract's address (C... form)
     * @param spec The contract's spec — either a parsed Spec object, or
     *             an array of base64 spec entry strings (from `stellar
     *             contract bindings typescript`)
     *
     * @example
     *   interface TokenContract extends defineContractSpec<{
     *     transfer: (args: { from: string; to: string; amount: bigint }) => Promise<boolean>;
     *     balanceOf: (args: { id: string }) => Promise<bigint>;
     *   }> {}
     *
     *   const token = soroban.contract<TokenContract>('C...', {
     *     specEntries: ['AAA==', 'BBB==', ...],
     *   });
     *   await token.transfer({ from, to, amount });  // typed
     */
    contract<T extends ContractSpec = ContractSpec>(contractId: string, opts: {
        specEntries: string[] | import('@stellar/stellar-sdk').xdr.ScSpecEntry[];
    }): ContractClient<T>;
    /** Low-level escape hatches for callers that need more control than `invoke()` gives. */
    simulate(tx: unknown): Promise<import("@stellar/stellar-sdk/rpc").Api.SimulateTransactionResponse>;
    prepare(tx: unknown): Promise<import("@stellar/stellar-sdk").Transaction<import("@stellar/stellar-sdk").Memo<import("@stellar/stellar-sdk").MemoType>, import("@stellar/stellar-sdk").Operation[]>>;
    submit(signedXdr: string): Promise<import("@stellar/stellar-sdk/rpc").Api.SendTransactionResponse>;
    pollStatus(hash: string, opts?: {
        attempts?: number;
    }): Promise<import("@stellar/stellar-sdk/rpc").Api.GetTransactionResponse>;
    /**
     * Signs each Soroban auth entry that requires the connected wallet's
     * signature, via `wallet.signAuthEntry()` rather than a second
     * `signTransaction` call.
     *
     * Uses `@stellar/stellar-base`'s `authorizeEntry()` helper, which handles:
     *   - Cloning the entry (so the caller's object isn't mutated)
     *   - Setting `signatureExpirationLedger` (to latestLedger + 100)
     *   - Building the `HashIdPreimage` (networkId + nonce + invocation + expiration)
     *   - Hashing it with SHA-256
     *   - Calling our signer callback with the preimage
     *   - Verifying the returned signature locally (guards against buggy/malicious wallets)
     *   - Wrapping the signature into the correct `ScVal` structure
     *     (`scvVec([scvMap({public_key, signature})])`)
     *   - Reinserting it into `credentials().address().signature()`
     *
     * The wallet-facing contract: `signAuthEntry(preimageBase64, opts)` →
     * `{signedAuthEntry: signatureBase64, signerAddress}`. The wallet signs
     * `SHA256(preimageBytes)` and returns the raw 64-byte Ed25519 signature.
     * The wallet does NOT need to know about ScVal wrapping — `authorizeEntry`
     * handles that.
     *
     * Only entries with `SOROBAN_CREDENTIALS_ADDRESS` credentials bound to
     * the connected wallet's address AND with `signature() === scvVoid`
     * (not already signed) are signed. Source-account credentials and
     * entries bound to other addresses are left untouched.
     */
    private signAuthEntries;
}
export {};
//# sourceMappingURL=soroban.d.ts.map