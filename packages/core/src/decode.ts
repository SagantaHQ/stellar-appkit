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
  raw: { xdr: string; networkPassphrase: string };
}

/** Return true to proceed with the actual wallet signature request, false to cancel it (surfaces to the caller as a normal user-rejected error). */
export type PreviewHandler = (preview: TransactionPreview) => Promise<boolean>;

export interface PreviewOptions {
  /** Contract IDs considered known/verified. Anything else touched by an invokeHostFunction op is flagged — omit entirely to skip this check (there's no built-in registry to fall back on). */
  verifiedContracts?: Set<string> | ((contractId: string) => boolean);
  /** Flags payments/transfers at or above this amount (in the asset's own units) as large. Omit to skip this check — "large" is inherently app-specific. */
  largeTransferThreshold?: number;
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

  return {
    sourceAccount: tx.source,
    fee: tx.fee,
    operations,
    riskFlags: txRiskFlags,
    raw: { xdr, networkPassphrase },
  };
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

  if (op.func.switch().name === 'hostFunctionTypeInvokeContract') {
    const invoke = op.func.invokeContract();
    const contractId = sdk.Address.fromScAddress(invoke.contractAddress()).toString();
    const functionName = typeof invoke.functionName() === 'string' ? (invoke.functionName() as string) : invoke.functionName().toString();
    const args = invoke.args().map((arg) => sdk.scValToNative(arg));

    details.contract = contractId;
    details.function = functionName;

    summary = `Call \`${functionName}\` on contract ${short(contractId)}`;

    if (SEP41_AMOUNT_METHODS.has(functionName) && args.length > 0) {
      // SEP-41 token calls put the amount last (transfer(from, to, amount), mint(to, amount), ...) — decode it directly from the args rather than simulating.
      const amountArg = args[args.length - 1];
      if (typeof amountArg === 'bigint' || typeof amountArg === 'number') {
        summary = `${capitalize(functionName)} ${amountArg} (raw units) via contract ${short(contractId)}`;
        details.amount = String(amountArg);
      }
    }

    const verified = checkVerified(contractId, opts.verifiedContracts);
    if (verified === false) {
      flags.push({ severity: 'warning', code: 'unverified-contract', message: `Contract ${short(contractId)} isn't in your list of verified contracts.` });
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

  return { type: op.type, summary, details, riskFlags: flags };
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
