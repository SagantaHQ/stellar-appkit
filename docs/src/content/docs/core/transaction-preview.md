---
title: Transaction Preview
description: Every operation decoded, risk flags, contract badges, and fee estimates before the wallet's signature prompt.
---

## How it works

Every `signTransaction()` call is decoded and shown to the user *before* the wallet's own signature prompt. Attaching `<saganta-appkit-modal>` wires this up automatically.

```ts
const appkit = new StellarAppKit({
  network: 'PUBLIC',
  connectors: [createFreighterConnector()],
  previewOptions: {
    verifiedContracts: new Set(['CA...KNOWN_CONTRACT']),
    largeTransferThreshold: 1000,
    contractMetadata: new Map([
      ['CBETT2CX...', {
        name: 'USDC Token',
        publisher: 'Centre Consortium',
        verified: true,
        audited: true,
        auditUrl: 'https://example.com/audits/usdc.pdf',
      } as ContractMetadata],
    ]),
    includeFeeEstimate: true,
  },
});

// Without a UI package, supply your own handler:
appkit.onPreviewTransaction = async (preview) => {
  console.log(preview.operations.map((op) => op.summary));
  console.log(preview.riskFlags);
  console.log(preview.feeEstimate);
  console.log(preview.operations[0].contractBadges);
  return userConfirmedSomehow();
};

await appkit.signTransaction(xdr);
await appkit.signTransaction(xdr, { skipPreview: true }); // bypass
```

## Risk flags

| Flag | Severity | When |
|---|---|---|
| `account-merge` | danger | Always flagged — permanently closes the source account |
| `signer-change` | danger | Always flagged — common account-takeover pattern |
| `threshold-change` | warning | Changes future signing requirements |
| `large-transfer` | warning | Opt-in via `largeTransferThreshold` |
| `unverified-contract` | warning | Opt-in via `verifiedContracts` |
| `broad-auth-grant` | warning | Auth tree spans >1 contract or >3 invocations |
| `fee-bump` | info | Transaction is a fee-bump |

## Contract verification badges

When `contractMetadata` is configured, contracts touched by `invokeHostFunction` ops get a `contractBadges` array:

```ts
preview.operations[0].contractBadges = [
  { label: 'Verified', code: 'verified', severity: 'success' },
  { label: 'Audited', code: 'audited', severity: 'success',
    url: 'https://example.com/audits/usdc.pdf' },
  { label: 'Centre Consortium', code: 'publisher', severity: 'info' },
];
```

## Fee estimation

When `includeFeeEstimate: true` (default), the preview includes a `feeEstimate`:

```ts
preview.feeEstimate = {
  baseFee: '100',              // per-op fee in stroops
  operationCount: 1,
  totalBaseFee: '100',
  sorobanResourceFee: '50000', // CPU + memory + storage
  sorobanInstructions: '12345',
  totalFee: '50100',
  totalFeeXlm: '0.00501 XLM',
};
```

## Balance-delta preview (Soroban)

`SorobanConnection.previewInvoke()` returns balance deltas extracted from the simulation's `stateChanges`:

```ts
const preview = await soroban.previewInvoke({ contractId, method: 'transfer', args });
console.log(preview.balanceDeltas);
// [{ kind: 'account', asset: 'XLM', delta: '-1000000000',
//    summary: 'XLM balance GA...: 1000 → 900 (-100)' }]
```
