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
    /**
     * Trust/verification badges for contracts touched by this op, surfaced
     * from the `contractMetadata` preview option. Unlike `riskFlags` (which
     * flag danger), badges are positive signals — "verified by your app's
     * contract registry", "audited by Firm X", "published by Saganta", etc.
     *
     * Empty when no `contractMetadata` is configured, or when this op
     * doesn't touch a contract.
     */
    contractBadges?: ContractBadge[];
}
/**
 * A trust/verification badge for a contract, surfaced in the preview UI.
 * Multiple badges can apply to one contract (e.g. both "verified" and "audited").
 */
export interface ContractBadge {
    contractId: string;
    /** Short label for the badge — e.g. "Verified", "Audited", "Saganta". */
    label: string;
    /** Machine-readable code for the badge — e.g. 'verified', 'audited', 'publisher'. */
    code: string;
    /** Optional longer description, shown as a tooltip or expandable detail. */
    description?: string;
    /** Optional URL to the audit report, verification registry entry, etc. */
    url?: string;
    /** Visual severity — controls how the badge is rendered (e.g. green checkmark for 'verified'). */
    severity: 'success' | 'info' | 'warning' | 'danger';
}
/**
 * App-supplied metadata for a known contract, used to surface verification
 * badges in the preview UI. The consumer typically maintains a registry
 * of contracts their app supports (either hardcoded or fetched from a
 * backend) and passes it via `previewOptions.contractMetadata`.
 *
 * Example:
 *
 *   previewOptions: {
 *     contractMetadata: new Map([
 *       ['CBETT2CX...', {
 *         name: 'USDC Token',
 *         publisher: 'Centre Consortium',
 *         verified: true,
 *         audited: true,
 *         auditUrl: 'https://example.com/audits/usdc.pdf',
 *       } as ContractMetadata]),
 *     ]),
 *   }
 */
export interface ContractMetadata {
    /** Human-readable name for the contract — e.g. "USDC Token". */
    name?: string;
    /** Publisher/issuer of the contract — e.g. "Centre Consortium". */
    publisher?: string;
    /** Whether the app considers this contract verified (trusted). */
    verified?: boolean;
    /** Whether the contract has been independently audited. */
    audited?: boolean;
    /** URL to the audit report, if `audited` is true. */
    auditUrl?: string;
    /** Free-form additional badges — e.g. [{ label: 'Stellar Expert', url: '...' }]. */
    extraBadges?: Array<{
        label: string;
        description?: string;
        url?: string;
    }>;
}
export interface TransactionPreview {
    sourceAccount: string;
    fee: string;
    operations: DecodedOperation[];
    /** Transaction-wide flags (e.g. fee-bump) — most flags live per-operation in `operations[i].riskFlags`. */
    riskFlags: RiskFlag[];
    /**
     * Detailed fee breakdown, populated when `includeFeeEstimate: true`
     * is set in PreviewOptions AND a simulation response was passed in.
     * Otherwise undefined — the basic `fee` field above is always present
     * (it's the transaction's declared fee in stroops), but the breakdown
     * requires simulation to compute Soroban resource fees.
     *
     * All amounts are in stroops (1 XLM = 10,000,000 stroops).
     */
    feeEstimate?: FeeEstimate;
    raw: {
        xdr: string;
        networkPassphrase: string;
    };
}
/**
 * Detailed fee estimate for a Soroban transaction, computed from the
 * simulation response's `cost` field. Shown in the preview UI before
 * the user signs, so they know what the transaction will actually cost
 * — not just the declared base fee, but the full fee including Soroban
 * resource charges (CPU, memory, storage).
 *
 * All amounts are in stroops (1 XLM = 10,000,000 stroops).
 */
export interface FeeEstimate {
    /** The transaction's declared base fee (per operation), in stroops. */
    baseFee: string;
    /** Number of operations in the transaction. */
    operationCount: number;
    /** Total base fee = baseFee × operationCount, in stroops. */
    totalBaseFee: string;
    /**
     * Soroban resource fee (CPU + memory + storage), in stroops. Populated
     * from the simulation's `cost.resourceFeeCharged` field. Undefined for
     * non-Soroban transactions (classic payments, etc.) — they don't incur
     * resource fees.
     */
    sorobanResourceFee?: string;
    /**
     * The Soroban instruction count consumed by the simulation, if known.
     * Useful for showing "this call uses N instructions" in the preview UI
     * for users who care about gas optimization.
     */
    sorobanInstructions?: string;
    /**
     * The total estimated fee the user will pay, in stroops. This is the
     * sum of `totalBaseFee` + `sorobanResourceFee` (if present). Shown as
     * the headline number in the preview UI.
     */
    totalFee: string;
    /** The total fee converted to XLM, for human display (e.g. "0.00001 XLM"). */
    totalFeeXlm: string;
}
/**
 * Preview for a standalone Soroban auth-entry signature request (NOT a
 * full transaction). Auth entries are signed separately from the outer
 * transaction envelope in delegated / multi-party flows — a standalone
 * signAuthEntry() call grants one or more contracts permission to act on
 * the user's behalf, so this preview surfaces exactly which contracts
 * and functions are being authorized.
 *
 * The previous version of the SDK skipped the preview flow for
 * signAuthEntry() entirely, which meant a malicious app could quietly
 * obtain broad authorizations across multiple contracts without ever
 * showing the user what they were approving. This closes that gap.
 */
export interface AuthEntryPreview {
    /** Contract IDs the auth entry grants permission to (one per rootInvocation + sub-invocation). */
    authorizedContracts: string[];
    /** Functions being authorized (e.g. ['transfer', 'approve']). */
    authorizedFunctions: string[];
    /** Total invocation count (root + sub-invocations). >3 is flagged as a broad grant. */
    invocationCount: number;
    /** Risk flags derived from the auth tree — broad grants, unverified contracts, etc. */
    riskFlags: RiskFlag[];
    /** The raw auth entry XDR, for callers that want to log or display it. */
    raw: {
        authEntryXdr: string;
    };
}
/** Return true to proceed with the actual wallet signature request, false to cancel it (surfaces to the caller as a normal user-rejected error). */
export type PreviewHandler = (preview: TransactionPreview) => Promise<boolean>;
/** Return true to proceed with the auth-entry signature request, false to cancel. */
export type AuthEntryPreviewHandler = (preview: AuthEntryPreview) => Promise<boolean>;
export interface PreviewOptions {
    /** Contract IDs considered known/verified. Anything else touched by an invokeHostFunction op is flagged — omit entirely to skip this check (there's no built-in registry to fall back on). */
    verifiedContracts?: Set<string> | ((contractId: string) => boolean);
    /**
     * Richer contract metadata — name, publisher, verified/audited status,
     * audit URL, etc. When provided, contracts touched by invokeHostFunction
     * ops get a `contractBadges` array on the decoded op, which the preview
     * UI can render as trust signals (green checkmarks, audit links, etc.).
     *
     * This is a richer successor to `verifiedContracts` — if both are set,
     * `contractMetadata` takes precedence for badge rendering, but
     * `verifiedContracts` is still used for the `unverified-contract` risk
     * flag (backwards compat).
     */
    contractMetadata?: Map<string, ContractMetadata> | ((contractId: string) => ContractMetadata | undefined);
    /** Flags payments/transfers at or above this amount (in the asset's own units) as large. Omit to skip this check — "large" is inherently app-specific. */
    largeTransferThreshold?: number;
    /**
     * When true, buildTransactionPreview() will populate `feeEstimate` on
     * the returned preview IF a simulation response is passed via the
     * `simulation` field of PreviewOptions. Without a simulation, the fee
     * estimate can only include the base fee (no Soroban resource fees),
     * so we omit it entirely rather than show a misleading number.
     *
     * Default: false (consumers opt in by passing `includeFeeEstimate: true`
     * AND a simulation response).
     */
    includeFeeEstimate?: boolean;
    /**
     * Optional simulation response, used to compute the `feeEstimate` when
     * `includeFeeEstimate: true`. SorobanConnection.previewInvoke() passes
     * this automatically; consumers calling buildTransactionPreview()
     * directly can pass it themselves if they've already simulated.
     */
    simulation?: unknown;
}
export declare function buildTransactionPreview(xdr: string, networkPassphrase: string, opts?: PreviewOptions): Promise<TransactionPreview>;
/**
 * A single balance delta extracted from a Soroban simulation's
 * `stateChanges` array. Each entry describes what changed for one
 * account/contract/trustline/etc. — e.g. "your XLM balance went from
 * 1000 to 900 (−100)" or "trustline for USDC was created".
 *
 * For SEP-41 contract token balances, the contract ID and the holder
 * address are surfaced separately so the UI can render "Send 100 USDC
 * to G..." rather than "contract storage was modified".
 */
export interface BalanceDelta {
    /** What kind of ledger entry changed: 'account' (native XLM), 'trustline' (asset), 'contract' (contract data — incl. SEP-41 token balances), 'offer', 'data', 'claimableBalance', 'liquidityPool'. */
    kind: 'account' | 'trustline' | 'contract' | 'offer' | 'data' | 'claimableBalance' | 'liquidityPool' | 'unknown';
    /** Human-readable description of the change, e.g. "XLM balance: 1000 → 900 (−100)". */
    summary: string;
    /** The account/contract address affected, if applicable. */
    address?: string;
    /** Asset label for trustline changes, e.g. "USDC:G...". */
    asset?: string;
    /** Numeric delta (positive = increase, negative = decrease), when computable. */
    delta?: string;
    /** 'created' | 'updated' | 'deleted' — corresponds to the state change type. */
    change: 'created' | 'updated' | 'deleted';
}
/**
 * Extracts human-readable balance deltas from a Soroban
 * `simulateTransaction` success response.
 *
 * The previous version of the SDK surfaced only the *intended* amount
 * for SEP-41 token calls (decoded from call args), not the actual
 * balance changes the network would apply. This function walks the
 * simulation's `stateChanges` array — which is the network's own
 * authoritative statement of what would change — and produces a list
 * of deltas that can be shown in a preview UI as "your balance will
 * go from X to Y".
 *
 * Pass the simulation response object (the same one
 * `server.simulateTransaction()` returns, or that
 * `SorobanConnection.previewInvoke()` already calls internally).
 * Returns an empty array if the simulation has no state changes (e.g.
 * a read-only call) or if the response shape isn't recognized.
 */
export declare function decodeSimulationDeltas(simulation: unknown): Promise<BalanceDelta[]>;
/**
 * Builds a preview for a single Soroban auth entry (used when an app
 * calls signAuthEntry() standalone, rather than signing the whole
 * transaction). Surfaces the contract IDs and functions being
 * authorized, plus risk flags for broad grants and unverified
 * contracts.
 *
 * Auth entries are signed separately from the outer transaction
 * envelope in delegated / multi-party flows — a standalone
 * signAuthEntry() call can grant one or more contracts permission to
 * act on the user's behalf, so this preview is critical for not
 * silently approving broad authorization grants.
 */
export declare function buildAuthEntryPreview(authEntryXdr: string, opts?: PreviewOptions): Promise<AuthEntryPreview>;
//# sourceMappingURL=decode.d.ts.map