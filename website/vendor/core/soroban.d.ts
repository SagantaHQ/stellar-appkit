import type { StellarAppKit } from './client.js';
import { type TransactionPreview } from './decode.js';
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
export declare class SorobanConnection {
    private rpcUrl;
    private networkPassphrase;
    private wallet;
    private _sdk;
    private _rpc;
    private _server;
    constructor(config: SorobanConnectionConfig);
    private sdk;
    private rpc;
    private server;
    /** High-level: the 90% case. Builds, simulates, prepares, signs, submits, and polls a single contract call. */
    invoke(opts: InvokeOptions): Promise<InvokeResult>;
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
    previewInvoke(opts: InvokeOptions): Promise<TransactionPreview & {
        simulationStatus: 'success' | 'failed';
        simulationError?: string;
    }>;
    /** Low-level escape hatches for callers that need more control than `invoke()` gives. */
    simulate(tx: unknown): Promise<import("@stellar/stellar-sdk/rpc").Api.SimulateTransactionResponse>;
    prepare(tx: unknown): Promise<import("@stellar/stellar-base").Transaction<import("@stellar/stellar-base").Memo<import("@stellar/stellar-base").MemoType>, import("@stellar/stellar-base").Operation[]>>;
    submit(signedXdr: string): Promise<import("@stellar/stellar-sdk/rpc").Api.SendTransactionResponse>;
    pollStatus(hash: string, opts?: {
        attempts?: number;
    }): Promise<import("@stellar/stellar-sdk/rpc").Api.GetTransactionResponse>;
    /**
     * Signs each Soroban auth entry that requires the connected wallet's
     * signature, via `signAuthEntry` rather than a second `signTransaction`
     * call — this is what lets delegated/multi-party auth flows and (later)
     * Saganta's smart-account signer plug in without special-casing the
     * invoke pipeline.
     */
    private signAuthEntries;
}
//# sourceMappingURL=soroban.d.ts.map