---
title: Contract Badges
description: Surface verified, audited, and published-by badges on contracts in the preview UI.
---

## Overview

Apps maintain a registry of contracts they trust and pass it via `previewOptions.contractMetadata`. The decoder surfaces trust signals as `ContractBadge[]` on each `DecodedOperation`.

## Configuration

```ts
const appkit = new StellarAppKit({
  network: 'PUBLIC',
  connectors: [createFreighterConnector()],
  previewOptions: {
    contractMetadata: new Map([
      ['CBETT2CXOWNPF5JYWBYB4BHNC4TPQEVABBKDDFE46S63JYXPUQK656HH', {
        name: 'USDC Token',
        publisher: 'Centre Consortium',
        verified: true,
        audited: true,
        auditUrl: 'https://example.com/audits/usdc.pdf',
        extraBadges: [{ label: 'Stellar Expert', url: 'https://stellar.expert/...' }],
      } as ContractMetadata],
    ]),
  },
});
```

## Badge types

| Badge | Severity | When |
|---|---|---|
| Verified | success | `metadata.verified === true` |
| Audited | success | `metadata.audited === true` (clickable audit URL) |
| Publisher | info | `metadata.publisher` is set |
| Extra | info | `metadata.extraBadges[]` entries |

## Dynamic lookups

`contractMetadata` accepts a function for dynamic lookups (e.g. fetching from a backend):

```ts
previewOptions: {
  contractMetadata: (contractId) => {
    return fetch(`/api/contracts/${contractId}`).then(r => r.json());
  },
}
```
