/**
 * Decodes a transaction into human-readable operations plus risk flags,
 * for showing a real preview before a signature request reaches the
 * wallet — this is the actual differentiator over passing raw XDR through
 * to a signature popup. See ARCHITECTURE.md's positioning section.
 *
 * Every field this file reads off a decoded `Operation` (asset, amount,
 * destination, etc.) is confirmed against @stellar/stellar-sdk's own type
 * declarations, not assumed — the one place this file is deliberately
 * conservative is Soroban invoke calls: amounts are only surfaced for
 * SEP-41 token calls recognized by function name (`transfer`, `mint`,
 * `burn`, ...), decoded straight from the call arguments. It does not
 * attempt to diff Soroban RPC simulation state changes — that response
 * shape varies enough across protocol versions that guessing at it felt
 * riskier than just not claiming it. `SorobanConnection.previewInvoke()`
 * layers a simulation success/failure check on top of this for Soroban
 * calls specifically, which is a narrower, more defensible claim.
 */
export type RiskSeverity = 'info' | 'warning' | 'danger';
export interface RiskFlag {
    severity: RiskSeverity;
    code: string;
    message: string;
}
export interface DecodedOperation {
    /** Raw stellar-sdk operation type string, e.g. 'payment', 'invokeHostFunction'. */
    type: string;
    summary: string;
    details: Record<string, string>;
    riskFlags: RiskFlag[];
}
export interface TransactionPreview {
    sourceAccount: string;
    fee: string;
    operations: DecodedOperation[];
    /** Transaction-wide flags (e.g. fee-bump) — most flags live per-operation in `operations[i].riskFlags`. */
    riskFlags: RiskFlag[];
    raw: {
        xdr: string;
        networkPassphrase: string;
    };
}
/** Return true to proceed with the actual wallet signature request, false to cancel it (surfaces to the caller as a normal user-rejected error). */
export type PreviewHandler = (preview: TransactionPreview) => Promise<boolean>;
export interface PreviewOptions {
    /** Contract IDs considered known/verified. Anything else touched by an invokeHostFunction op is flagged — omit entirely to skip this check (there's no built-in registry to fall back on). */
    verifiedContracts?: Set<string> | ((contractId: string) => boolean);
    /** Flags payments/transfers at or above this amount (in the asset's own units) as large. Omit to skip this check — "large" is inherently app-specific. */
    largeTransferThreshold?: number;
}
export declare function buildTransactionPreview(xdr: string, networkPassphrase: string, opts?: PreviewOptions): Promise<TransactionPreview>;
//# sourceMappingURL=decode.d.ts.map