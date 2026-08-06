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
  extraBadges?: Array<{ label: string; description?: string; url?: string }>;
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
  raw: { xdr: string; networkPassphrase: string };
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
  raw: { authEntryXdr: string };
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

const SEP41_AMOUNT_METHODS = new Set(['transfer', 'mint', 'burn', 'transfer_from', 'burn_from', 'clawback']);

export async function buildTransactionPreview(
  xdr: string,
  networkPassphrase: string,
  opts: PreviewOptions = {}
): Promise<TransactionPreview> {
  const sdk = await import('@stellar/stellar-sdk');
  const parsed = sdk.TransactionBuilder.fromXDR(xdr, networkPassphrase);

  const isFeeBump = 'innerTransaction' in parsed;
  const tx = isFeeBump ? parsed.innerTransaction : parsed;

  const txRiskFlags: RiskFlag[] = [];
  if (isFeeBump) {
    txRiskFlags.push({
      severity: 'info',
      code: 'fee-bump',
      message: 'This is a fee-bump transaction — it pays the fee for and wraps another transaction.',
    });
  }

  const operations = tx.operations.map((op) => decodeOperation(op, sdk, opts));

  const preview: TransactionPreview = {
    sourceAccount: tx.source,
    fee: tx.fee,
    operations,
    riskFlags: txRiskFlags,
    raw: { xdr, networkPassphrase },
  };

  // Compute the fee estimate if the consumer opted in AND provided a
  // simulation response. We do this here (rather than in
  // SorobanConnection.previewInvoke) so consumers calling
  // buildTransactionPreview directly also get the estimate when they
  // pass a simulation.
  if (opts.includeFeeEstimate && opts.simulation) {
    const feeEstimate = computeFeeEstimate(tx.fee, tx.operations.length, opts.simulation);
    if (feeEstimate) preview.feeEstimate = feeEstimate;
  }

  return preview;
}

/**
 * Computes a FeeEstimate from the transaction's declared fee, operation
 * count, and a Soroban simulation response.
 *
 * The simulation response's `cost` field contains:
 *   - `cpuInstructions`: number of Soroban instructions consumed
 *   - `memoryBytes`: memory used
 *   - `resourceFeeCharged`: the actual Soroban resource fee in stroops
 *
 * For classic (non-Soroban) transactions, the simulation won't have a
 * `cost` field — we still compute the base fee breakdown, but
 * `sorobanResourceFee` and `sorobanInstructions` are undefined.
 *
 * All amounts are in stroops (1 XLM = 10,000,000 stroops).
 */
function computeFeeEstimate(declaredFee: string, operationCount: number, simulation: unknown): FeeEstimate | null {
  // declaredFee is the total fee on the TransactionEnvelope (in stroops).
  // For a non-fee-bump transaction, this is baseFee × operationCount +
  // any Soroban resource fee the builder already added. We treat the
  // per-operation base fee as declaredFee / operationCount (integer division).
  const totalDeclared = BigInt(declaredFee);
  const baseFeePerOp = operationCount > 0 ? totalDeclared / BigInt(operationCount) : 0n;
  const totalBaseFee = baseFeePerOp * BigInt(operationCount);

  // Try to extract Soroban resource fee + instruction count from the
  // simulation response. The shape varies a bit across SDK versions,
  // so we check several common paths.
  const sim = simulation as {
    cost?: { cpuInstructions?: string | number; memoryBytes?: string | number; resourceFeeCharged?: string | number };
    transactionData?: { resourceFee?: string | number };
  };

  let sorobanResourceFee: bigint | undefined;
  let sorobanInstructions: string | undefined;

  if (sim?.cost?.resourceFeeCharged !== undefined) {
    sorobanResourceFee = BigInt(String(sim.cost.resourceFeeCharged));
  } else if (sim?.transactionData?.resourceFee !== undefined) {
    // Older SDK versions exposed the resource fee on transactionData
    sorobanResourceFee = BigInt(String(sim.transactionData.resourceFee));
  }

  if (sim?.cost?.cpuInstructions !== undefined) {
    sorobanInstructions = String(sim.cost.cpuInstructions);
  }

  // The total fee the user pays = the declared fee on the transaction
  // (which already includes the Soroban resource fee if the builder
  // added it via prepareTransaction). If the simulation's resource
  // fee is HIGHER than what the builder added (rare, but possible if
  // the network's fee schedule changed), we use the simulation's
  // number as the more accurate estimate.
  let totalFee = totalDeclared;
  if (sorobanResourceFee !== undefined) {
    const builderAddedResourceFee = totalDeclared - totalBaseFee;
    if (sorobanResourceFee > builderAddedResourceFee) {
      totalFee = totalBaseFee + sorobanResourceFee;
    }
  }

  return {
    baseFee: baseFeePerOp.toString(),
    operationCount,
    totalBaseFee: totalBaseFee.toString(),
    sorobanResourceFee: sorobanResourceFee?.toString(),
    sorobanInstructions,
    totalFee: totalFee.toString(),
    totalFeeXlm: formatStroopsAsXlm(totalFee),
  };
}

/** Formats an integer amount of stroops as a decimal XLM string (1 XLM = 10,000,000 stroops). */
function formatStroopsAsXlm(stroops: bigint): string {
  const negative = stroops < 0n;
  const abs = negative ? -stroops : stroops;
  const whole = abs / 10_000_000n;
  const frac = abs % 10_000_000n;
  const fracStr = frac.toString().padStart(7, '0').replace(/0+$/, '');
  const value = fracStr ? `${whole}.${fracStr}` : whole.toString();
  return `${negative ? '-' : ''}${value} XLM`;
}

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
export async function decodeSimulationDeltas(simulation: unknown): Promise<BalanceDelta[]> {
  if (!simulation || typeof simulation !== 'object') return [];

  const sim = simulation as { stateChanges?: unknown[] };
  if (!Array.isArray(sim.stateChanges)) return [];

  const sdk = await import('@stellar/stellar-sdk');
  const deltas: BalanceDelta[] = [];

  for (const raw of sim.stateChanges) {
    if (!raw || typeof raw !== 'object') continue;
    const change = raw as { type: number; key: unknown; before: unknown; after: unknown };

    // Skip entries with no key — the decoder can't do anything useful
    // without one, and a null key in the simulation response usually
    // means the server couldn't resolve the entry (which we shouldn't
    // crash on, just skip).
    if (change.key == null) continue;

    // The SDK's parsed response gives us xdr.LedgerKey / xdr.LedgerEntry
    // objects. The raw (un-parsed) response gives base64 strings —
    // handle both so this works regardless of which form the caller
    // passes (server.simulateTransaction returns the parsed form).
    let key: import('@stellar/stellar-sdk').xdr.LedgerKey;
    try {
      key = typeof change.key === 'string'
        ? sdk.xdr.LedgerKey.fromXDR(change.key, 'base64')
        : (change.key as import('@stellar/stellar-sdk').xdr.LedgerKey);
    } catch {
      continue;
    }

    let before: import('@stellar/stellar-sdk').xdr.LedgerEntry | null = null;
    let after: import('@stellar/stellar-sdk').xdr.LedgerEntry | null = null;
    try {
      before = change.before == null
        ? null
        : typeof change.before === 'string'
          ? sdk.xdr.LedgerEntry.fromXDR(change.before, 'base64')
          : (change.before as import('@stellar/stellar-sdk').xdr.LedgerEntry);
      after = change.after == null
        ? null
        : typeof change.after === 'string'
          ? sdk.xdr.LedgerEntry.fromXDR(change.after, 'base64')
          : (change.after as import('@stellar/stellar-sdk').xdr.LedgerEntry);
    } catch {
      // Malformed before/after — skip this entry rather than failing the whole list.
      continue;
    }

    const delta = decodeStateChange(key, before, after, change.type, sdk);
    if (delta) deltas.push(delta);
  }

  return deltas;
}

/**
 * Maps a single state change (key + before + after + type) into a
 * human-readable BalanceDelta. The XDR shape varies by entry kind
 * (account, trustline, contractData, offer, ...), so this switches on
 * `key.switch().name` and pulls the relevant fields off each.
 *
 * Note on types: stellar-sdk's `Int64` is a BigInt-like wrapper (extends
 * `Hyper` from `@stellar/js-xdr`) — call `.toBigInt()` to get a real
 * bigint out of it. Switching on `.name` returns the union of all
 * LedgerEntryType variants ('account' | 'trustline' | 'offer' | ...),
 * NOT a 'ledgerKey*' prefixed string.
 */
function decodeStateChange(
  key: import('@stellar/stellar-sdk').xdr.LedgerKey,
  before: import('@stellar/stellar-sdk').xdr.LedgerEntry | null,
  after: import('@stellar/stellar-sdk').xdr.LedgerEntry | null,
  type: number,
  sdk: typeof import('@stellar/stellar-sdk')
): BalanceDelta | null {
  // Guard against non-XDR key objects (e.g. a plain JS object that
  // doesn't have the .switch() method the XDR union types do). The
  // caller already filtered null/undefined, but a malformed entry with
  // a non-XDR object key can still slip through — better to skip it
  // than crash the whole decoder.
  if (typeof (key as { switch?: unknown }).switch !== 'function') return null;

  // type: 0 = create, 1 = update, 2 = delete (per stellar-xdr's LedgerEntryChangeType)
  const change: BalanceDelta['change'] = type === 0 ? 'created' : type === 2 ? 'deleted' : 'updated';

  const kind = key.switch().name;

  if (kind === 'account') {
    const accountKey = key.account();
    // accountId is a PublicKey; .ed25519() returns the 32-byte raw key Buffer.
    // StrKey.encodeEd25519PublicKey converts that to the G... string form.
    const pubKeyBuf = accountKey.accountId().ed25519();
    const address = sdk.StrKey.encodeEd25519PublicKey(pubKeyBuf);
    const beforeBal = int64ToBigInt(before?.data()?.account()?.balance());
    const afterBal = int64ToBigInt(after?.data()?.account()?.balance());
    return {
      kind: 'account',
      address,
      asset: 'XLM',
      change,
      summary: formatAccountDelta(address, beforeBal, afterBal, change),
      delta: beforeBal !== undefined && afterBal !== undefined
        ? (afterBal - beforeBal).toString()
        : undefined,
    };
  }

  if (kind === 'trustline') {
    const tlKey = key.trustLine();
    const account = sdk.StrKey.encodeEd25519PublicKey(tlKey.accountId().ed25519());
    const tlAsset = tlKey.asset();
    const assetKind = tlAsset.switch().name;
    let asset: string;
    if (assetKind === 'assetTypeCreditAlphanum4') {
      const alpha = tlAsset.alphaNum4();
      asset = `${alpha.assetCode().toString('utf8')}:${short(sdk.StrKey.encodeEd25519PublicKey(alpha.issuer().ed25519()))}`;
    } else if (assetKind === 'assetTypeCreditAlphanum12') {
      const alpha = tlAsset.alphaNum12();
      asset = `${alpha.assetCode().toString('utf8')}:${short(sdk.StrKey.encodeEd25519PublicKey(alpha.issuer().ed25519()))}`;
    } else {
      asset = 'liquidity pool share';
    }
    const beforeBal = int64ToBigInt(before?.data()?.trustLine()?.balance());
    const afterBal = int64ToBigInt(after?.data()?.trustLine()?.balance());
    return {
      kind: 'trustline',
      address: account,
      asset,
      change,
      summary: formatTrustlineDelta(account, asset, beforeBal, afterBal, change),
      delta: beforeBal !== undefined && afterBal !== undefined
        ? (afterBal - beforeBal).toString()
        : undefined,
    };
  }

  if (kind === 'contractData') {
    const cdKey = key.contractData();
    const contract = sdk.Address.fromScAddress(cdKey.contract()).toString();
    return {
      kind: 'contract',
      address: contract,
      change,
      summary: change === 'created'
        ? `Contract ${short(contract)}: storage entry created`
        : change === 'deleted'
          ? `Contract ${short(contract)}: storage entry deleted`
          : `Contract ${short(contract)}: storage entry updated`,
    };
  }

  if (kind === 'offer') {
    const offerId = key.offer().offerId().toString();
    return {
      kind: 'offer',
      change,
      summary: `${change === 'created' ? 'Created' : change === 'deleted' ? 'Deleted' : 'Updated'} offer #${offerId}`,
    };
  }

  if (kind === 'data') {
    const dataKey = key.data().dataName().toString('utf8');
    return {
      kind: 'data',
      change,
      summary: `${change === 'created' ? 'Set' : change === 'deleted' ? 'Removed' : 'Updated'} account data entry "${dataKey}"`,
    };
  }

  if (kind === 'claimableBalance') {
    const balanceId = key.claimableBalance().balanceId().toXDR('base64');
    return {
      kind: 'claimableBalance',
      change,
      summary: `${change === 'created' ? 'Created' : change === 'deleted' ? 'Claimed' : 'Updated'} claimable balance ${short(balanceId)}`,
    };
  }

  if (kind === 'liquidityPool') {
    return {
      kind: 'liquidityPool',
      change,
      summary: `${change === 'created' ? 'Created' : change === 'deleted' ? 'Deleted' : 'Updated'} liquidity pool`,
    };
  }

  return {
    kind: 'unknown',
    change,
    summary: `${change} an unrecognized ledger entry (${kind})`,
  };
}

/**
 * Coerces a stellar-sdk `Int64` (a Hyper wrapper) into a native bigint.
 * Returns undefined if the input is undefined (the optional-chaining on
 * `before?.data()?.account()?.balance()` can legitimately produce undefined).
 */
function int64ToBigInt(value: { toBigInt(): bigint } | undefined): bigint | undefined {
  return value === undefined ? undefined : value.toBigInt();
}

function formatAccountDelta(address: string, before: bigint | undefined, after: bigint | undefined, change: BalanceDelta['change']): string {
  if (change === 'created') return `New account ${short(address)} created with ${after !== undefined ? formatStroops(after) + ' XLM' : 'funding'}`;
  if (change === 'deleted') return `Account ${short(address)} merged away`;
  if (before !== undefined && after !== undefined) {
    const diff = after - before;
    const sign = diff >= 0n ? '+' : '';
    return `XLM balance ${short(address)}: ${formatStroops(before)} → ${formatStroops(after)} (${sign}${formatStroops(diff)})`;
  }
  return `XLM balance ${short(address)} updated`;
}

function formatTrustlineDelta(account: string, asset: string, before: bigint | undefined, after: bigint | undefined, change: BalanceDelta['change']): string {
  if (change === 'created') return `New trustline for ${asset} on ${short(account)}`;
  if (change === 'deleted') return `Removed trustline for ${asset} on ${short(account)}`;
  if (before !== undefined && after !== undefined) {
    const diff = after - before;
    const sign = diff >= 0n ? '+' : '';
    return `${asset} balance ${short(account)}: ${formatStroops(before)} → ${formatStroops(after)} (${sign}${formatStroops(diff)})`;
  }
  return `${asset} balance ${short(account)} updated`;
}

/** Formats an integer amount of stroops as a decimal XLM/asset-unit string (1 XLM = 10,000,000 stroops). */
function formatStroops(stroops: bigint): string {
  const negative = stroops < 0n;
  const abs = negative ? -stroops : stroops;
  const whole = abs / 10_000_000n;
  const frac = abs % 10_000_000n;
  const fracStr = frac.toString().padStart(7, '0').replace(/0+$/, '');
  const value = fracStr ? `${whole}.${fracStr}` : whole.toString();
  return negative ? `-${value}` : value;
}

function decodeOperation(op: import('@stellar/stellar-sdk').Operation, sdk: typeof import('@stellar/stellar-sdk'), opts: PreviewOptions): DecodedOperation {
  const flags: RiskFlag[] = [];

  switch (op.type) {
    case 'payment': {
      const assetLabel = assetToLabel(op.asset);
      if (opts.largeTransferThreshold !== undefined && Number(op.amount) >= opts.largeTransferThreshold) {
        flags.push({ severity: 'warning', code: 'large-transfer', message: `This sends ${op.amount} ${assetLabel} — larger than the configured threshold.` });
      }
      return {
        type: op.type,
        summary: `Send ${op.amount} ${assetLabel} to ${short(op.destination)}`,
        details: { destination: op.destination, amount: op.amount, asset: assetLabel },
        riskFlags: flags,
      };
    }

    case 'createAccount':
      return {
        type: op.type,
        summary: `Create account ${short(op.destination)}, funded with ${op.startingBalance} XLM`,
        details: { destination: op.destination, startingBalance: op.startingBalance },
        riskFlags: flags,
      };

    case 'pathPaymentStrictSend': {
      const sendLabel = assetToLabel(op.sendAsset);
      const destLabel = assetToLabel(op.destAsset);
      return {
        type: op.type,
        summary: `Swap ${op.sendAmount} ${sendLabel} for at least ${op.destMin} ${destLabel}, sent to ${short(op.destination)}`,
        details: { sendAmount: op.sendAmount, sendAsset: sendLabel, destMin: op.destMin, destAsset: destLabel, destination: op.destination },
        riskFlags: flags,
      };
    }

    case 'pathPaymentStrictReceive': {
      const sendLabel = assetToLabel(op.sendAsset);
      const destLabel = assetToLabel(op.destAsset);
      return {
        type: op.type,
        summary: `Swap up to ${op.sendMax} ${sendLabel} for ${op.destAmount} ${destLabel}, sent to ${short(op.destination)}`,
        details: { sendMax: op.sendMax, sendAsset: sendLabel, destAmount: op.destAmount, destAsset: destLabel, destination: op.destination },
        riskFlags: flags,
      };
    }

    case 'changeTrust': {
      const label = 'getCode' in op.line ? assetToLabel(op.line) : 'a liquidity pool share';
      const removing = op.limit === '0';
      return {
        type: op.type,
        summary: removing ? `Remove trustline for ${label}` : `Add trustline for ${label}${op.limit !== '922337203685.4775807' ? ` (limit ${op.limit})` : ''}`,
        details: { asset: label, limit: op.limit },
        riskFlags: flags,
      };
    }

    case 'manageSellOffer':
    case 'manageBuyOffer': {
      const sellLabel = assetToLabel(op.selling);
      const buyLabel = assetToLabel(op.buying);
      const amount = op.type === 'manageBuyOffer' ? op.buyAmount : op.amount;
      const isCancel = amount === '0';
      return {
        type: op.type,
        summary: isCancel
          ? `Cancel offer #${op.offerId} (${sellLabel} → ${buyLabel})`
          : `${op.type === 'manageBuyOffer' ? 'Buy' : 'Sell'} ${amount} ${op.type === 'manageBuyOffer' ? buyLabel : sellLabel} at price ${op.price}`,
        details: { selling: sellLabel, buying: buyLabel, amount, price: op.price, offerId: op.offerId },
        riskFlags: flags,
      };
    }

    case 'accountMerge': {
      flags.push({
        severity: 'danger',
        code: 'account-merge',
        message: 'This permanently closes this account and transfers its entire remaining balance — it cannot be undone.',
      });
      return {
        type: op.type,
        summary: `Merge this account into ${short(op.destination)} — closes this account permanently`,
        details: { destination: op.destination },
        riskFlags: flags,
      };
    }

    case 'setOptions': {
      const changes: string[] = [];
      const details: Record<string, string> = {};
      if (op.signer) {
        changes.push('add or update a signer');
        flags.push({
          severity: 'danger',
          code: 'signer-change',
          message: 'This adds or changes an account signer — a common account-takeover pattern if you don\u2019t recognize why this app is requesting it.',
        });
      }
      if (op.masterWeight !== undefined) changes.push(`set master key weight to ${op.masterWeight}`);
      if (op.lowThreshold !== undefined || op.medThreshold !== undefined || op.highThreshold !== undefined) {
        changes.push('change signing thresholds');
        flags.push({ severity: 'warning', code: 'threshold-change', message: 'This changes how many signatures are required to authorize future transactions.' });
      }
      if (op.homeDomain !== undefined) {
        changes.push(`set home domain to "${op.homeDomain}"`);
        details.homeDomain = op.homeDomain;
      }
      return {
        type: op.type,
        summary: changes.length > 0 ? `Update account settings: ${changes.join(', ')}` : 'Update account settings',
        details,
        riskFlags: flags,
      };
    }

    case 'clawback':
      return {
        type: op.type,
        summary: `Claw back ${op.amount} ${assetToLabel(op.asset)} from ${short(op.from)}`,
        details: { from: op.from, amount: op.amount, asset: assetToLabel(op.asset) },
        riskFlags: flags,
      };

    case 'bumpSequence':
      return { type: op.type, summary: `Bump account sequence number to ${op.bumpTo}`, details: { bumpTo: op.bumpTo }, riskFlags: flags };

    case 'manageData':
      return {
        type: op.type,
        summary: op.value ? `Set account data entry "${op.name}"` : `Remove account data entry "${op.name}"`,
        details: { name: op.name },
        riskFlags: flags,
      };

    case 'createClaimableBalance':
      return {
        type: op.type,
        summary: `Create a claimable balance of ${op.amount} ${assetToLabel(op.asset)} for ${op.claimants.length} claimant(s)`,
        details: { amount: op.amount, asset: assetToLabel(op.asset) },
        riskFlags: flags,
      };

    case 'claimClaimableBalance':
      return { type: op.type, summary: `Claim balance ${short(op.balanceId)}`, details: { balanceId: op.balanceId }, riskFlags: flags };

    case 'invokeHostFunction':
      return decodeInvokeHostFunction(op, sdk, opts);

    default:
      return {
        type: op.type,
        summary: `${op.type} (no detailed preview available for this operation type)`,
        details: {},
        riskFlags: [{ severity: 'info', code: 'unrecognized-operation', message: `"${op.type}" isn't decoded in detail yet — review the raw transaction if unsure.` }],
      };
  }
}

function decodeInvokeHostFunction(
  op: import('@stellar/stellar-sdk').Operation.InvokeHostFunction,
  sdk: typeof import('@stellar/stellar-sdk'),
  opts: PreviewOptions
): DecodedOperation {
  const flags: RiskFlag[] = [];
  const details: Record<string, string> = {};
  let summary = 'Invoke a Soroban host function';
  let badges: ContractBadge[] | undefined;

  if (op.func.switch().name === 'hostFunctionTypeInvokeContract') {
    const invoke = op.func.invokeContract();
    const contractId = sdk.Address.fromScAddress(invoke.contractAddress()).toString();
    const functionName = typeof invoke.functionName() === 'string' ? (invoke.functionName() as string) : invoke.functionName().toString();
    const args = invoke.args().map((arg) => sdk.scValToNative(arg));

    details.contract = contractId;
    details.function = functionName;

    // Surface the contract's human-readable name from contractMetadata
    // (if available) in the summary — "Call `transfer` on USDC Token"
    // reads much better than "Call `transfer` on contract CBETT2CX...".
    const metadata = lookupContractMetadata(contractId, opts.contractMetadata);
    const contractLabel = metadata?.name ?? short(contractId);
    summary = `Call \`${functionName}\` on ${contractLabel}`;

    if (SEP41_AMOUNT_METHODS.has(functionName) && args.length > 0) {
      // SEP-41 token calls put the amount last (transfer(from, to, amount), mint(to, amount), ...) — decode it directly from the args rather than simulating.
      const amountArg = args[args.length - 1];
      if (typeof amountArg === 'bigint' || typeof amountArg === 'number') {
        summary = `${capitalize(functionName)} ${amountArg} (raw units) via ${contractLabel}`;
        details.amount = String(amountArg);
      }
    }

    // Backwards-compat: the verifiedContracts set still drives the
    // unverified-contract RISK flag. If contractMetadata is also
    // provided, we additionally surface positive badges (verified,
    // audited, etc.) — but the risk flag and the badge are independent
    // signals, so a contract could be "verified" (badge) but not in
    // the verifiedContracts set (no risk flag), or vice versa.
    const verified = checkVerified(contractId, opts.verifiedContracts);
    if (verified === false) {
      flags.push({ severity: 'warning', code: 'unverified-contract', message: `Contract ${short(contractId)} isn't in your list of verified contracts.` });
    }

    // Surface positive trust signals as badges — verified, audited,
    // publisher, plus any free-form extras the consumer configured.
    if (metadata) {
      badges = buildContractBadges(contractId, metadata);
    }
  } else if (op.func.switch().name === 'hostFunctionTypeUploadContractWasm') {
    summary = 'Upload contract WASM code';
  } else {
    summary = 'Create a new contract';
  }

  if (op.auth && op.auth.length > 0) {
    const authFlag = assessAuthEntries(op.auth, sdk);
    if (authFlag) flags.push(authFlag);
  }

  return { type: op.type, summary, details, riskFlags: flags, contractBadges: badges };
}

/**
 * Looks up a contract's metadata from the PreviewOptions.contractMetadata
 * field — handles both the Map and the function form.
 */
function lookupContractMetadata(
  contractId: string,
  metadata: PreviewOptions['contractMetadata']
): ContractMetadata | undefined {
  if (!metadata) return undefined;
  if (metadata instanceof Map) return metadata.get(contractId);
  return metadata(contractId);
}

/**
 * Builds the badge array for a contract from its metadata. Each badge
 * is a separate entry — a contract can be both "Verified" and "Audited"
 * and "Published by Saganta", and the preview UI renders each one
 * independently.
 */
function buildContractBadges(contractId: string, meta: ContractMetadata): ContractBadge[] {
  const badges: ContractBadge[] = [];

  if (meta.verified) {
    badges.push({
      contractId,
      label: 'Verified',
      code: 'verified',
      description: meta.name ? `Verified: ${meta.name}` : 'This contract is in your app\'s verified registry.',
      severity: 'success',
    });
  }

  if (meta.audited) {
    badges.push({
      contractId,
      label: 'Audited',
      code: 'audited',
      description: 'This contract has been independently audited.',
      url: meta.auditUrl,
      severity: 'success',
    });
  }

  if (meta.publisher) {
    badges.push({
      contractId,
      label: meta.publisher,
      code: 'publisher',
      description: `Published by ${meta.publisher}`,
      severity: 'info',
    });
  }

  if (meta.extraBadges) {
    for (const extra of meta.extraBadges) {
      badges.push({
        contractId,
        label: extra.label,
        code: 'extra',
        description: extra.description,
        url: extra.url,
        severity: 'info',
      });
    }
  }

  return badges;
}

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
export async function buildAuthEntryPreview(
  authEntryXdr: string,
  opts: PreviewOptions = {}
): Promise<AuthEntryPreview> {
  const sdk = await import('@stellar/stellar-sdk');
  // Try base64 first (the most common encoding for XDR strings in
  // Stellar), fall back to hex if base64 fails. This matches what
  // SorobanAuthorizationEntry.fromXDR's auto-detection would do if the
  // TS overloads allowed omitting the format with a string input.
  let entry: import('@stellar/stellar-sdk').xdr.SorobanAuthorizationEntry;
  try {
    entry = sdk.xdr.SorobanAuthorizationEntry.fromXDR(authEntryXdr, 'base64');
  } catch {
    entry = sdk.xdr.SorobanAuthorizationEntry.fromXDR(authEntryXdr, 'hex');
  }

  const contractIds = new Set<string>();
  const functionNames: string[] = [];
  const riskFlags: RiskFlag[] = [];
  let invocationCount = 0;

  function walk(invocation: import('@stellar/stellar-sdk').xdr.SorobanAuthorizedInvocation) {
    invocationCount++;
    const fn = invocation.function();
    if (fn.switch().name === 'sorobanAuthorizedFunctionTypeContractFn') {
      const call = fn.contractFn();
      const contractId = sdk.Address.fromScAddress(call.contractAddress()).toString();
      const functionName = typeof call.functionName() === 'string'
        ? (call.functionName() as string)
        : call.functionName().toString();
      contractIds.add(contractId);
      functionNames.push(functionName);

      const verified = checkVerified(contractId, opts.verifiedContracts);
      if (verified === false) {
        riskFlags.push({
          severity: 'warning',
          code: 'unverified-contract',
          message: `Authorization grants permission to contract ${short(contractId)}, which isn't in your list of verified contracts.`,
        });
      }
    }
    invocation.subInvocations().forEach(walk);
  }

  walk(entry.rootInvocation());

  if (contractIds.size > 1 || invocationCount > 3) {
    riskFlags.push({
      severity: 'warning',
      code: 'broad-auth-grant',
      message: `This authorization spans ${contractIds.size} contract(s) across ${invocationCount} call(s) — review carefully if you expected a single, narrow action.`,
    });
  }

  return {
    authorizedContracts: Array.from(contractIds),
    authorizedFunctions: functionNames,
    invocationCount,
    riskFlags,
    raw: { authEntryXdr },
  };
}

function assessAuthEntries(auth: import('@stellar/stellar-sdk').xdr.SorobanAuthorizationEntry[], sdk: typeof import('@stellar/stellar-sdk')): RiskFlag | null {
  const contractIds = new Set<string>();
  let invocationCount = 0;

  function walk(invocation: import('@stellar/stellar-sdk').xdr.SorobanAuthorizedInvocation) {
    invocationCount++;
    const fn = invocation.function();
    if (fn.switch().name === 'sorobanAuthorizedFunctionTypeContractFn') {
      const call = fn.contractFn();
      contractIds.add(sdk.Address.fromScAddress(call.contractAddress()).toString());
    }
    invocation.subInvocations().forEach(walk);
  }

  auth.forEach((entry) => walk(entry.rootInvocation()));

  if (contractIds.size > 1 || invocationCount > 3) {
    return {
      severity: 'warning',
      code: 'broad-auth-grant',
      message: `This authorization spans ${contractIds.size} contract(s) across ${invocationCount} call(s) — review carefully if you expected a single, narrow action.`,
    };
  }
  return null;
}

function checkVerified(contractId: string, verified?: PreviewOptions['verifiedContracts']): boolean | null {
  if (!verified) return null; // no verification source configured — skip the check rather than flag everything
  if (typeof verified === 'function') return verified(contractId);
  return verified.has(contractId);
}

function assetToLabel(asset: import('@stellar/stellar-sdk').Asset): string {
  return asset.isNative() ? 'XLM' : `${asset.getCode()}:${short(asset.getIssuer())}`;
}

function short(id: string): string {
  return id.length <= 12 ? id : `${id.slice(0, 5)}…${id.slice(-5)}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
