---
title: Quick Start
description: Get a working wallet connect flow in about ten lines of code.
---

## Basic setup

```ts
import {
  StellarAppKit,
  createFreighterConnector,
  createAlbedoConnector,
  createXBullConnector,
} from '@saganta/stellar-appkit';
import '@saganta/stellar-appkit/ui-web'; // registers <saganta-appkit-modal>

const appkit = new StellarAppKit({
  network: 'PUBLIC',
  connectors: [createFreighterConnector(), createAlbedoConnector(), createXBullConnector()],
  appMetadata: { name: 'My App', domain: 'app.example.com', uri: 'https://app.example.com' },
});

const modal = document.querySelector('saganta-appkit-modal');
modal.client = appkit; // wires up the UI — preview, account switcher, everything

connectButton.addEventListener('click', () => modal.open());

await appkit.restore(); // resume a persisted session on page load, if any
```

```html
<saganta-appkit-modal mode="auto" theme="dark" title="Connect a wallet"></saganta-appkit-modal>
```

That's a working wallet connect flow with:
- Modal (desktop) / bottom-sheet (mobile) / inline (embedded) presentation
- Transaction preview with risk flags before every signature
- Multiple wallets connected simultaneously
- Cross-tab session sync

## Next steps

- [Wallet Connection](../core/wallet-connection/) — multi-wallet sessions, account switching
- [Transaction Preview](../core/transaction-preview/) — risk flags, contract badges, fee estimates
- [Soroban Integration](../core/soroban/) — typed contract clients, RPC failover, invoke pipeline
- [Framework Wrappers](../wrappers/react/) — React, Vue, Solid, Svelte hooks
