---
title: Introduction
description: One SDK for every Stellar wallet — real transaction previews, Soroban built in, and framework wrappers for React, Vue, Solid, and Svelte.
---

import { Card, CardGrid } from '@astrojs/starlight/components';

Stellar AppKit is a Web3Modal / Reown AppKit equivalent for Stellar. It provides one unified wallet API, a first-class Soroban layer, real transaction previews instead of raw XDR, and a themeable UI that works identically dropped into any site.

## Why this exists

Stellar already has solid wallet-connection plumbing — [SEP-43](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0043.md) is an emerging standard interface several wallets are converging on. But no existing library ships what Stellar AppKit does:

<CardGrid stagger>
  <Card title="Polished, themeable UI" icon="setting">
    Modal / bottom-sheet / inline presentation, every color/radius/font is a CSS custom property.
  </Card>
  <Card title="Transaction preview" icon="document">
    Decodes operations into plain language and flags risk *before* the wallet's own signature prompt.
  </Card>
  <Card title="First-class Soroban" icon="rocket">
    Simulate → prepare → sign → submit as one call, with typed contract clients and RPC failover.
  </Card>
  <Card title="Framework wrappers" icon="integration">
    React, Vue, Solid, and Svelte — same hooks, tree-shakable subpath exports.
  </Card>
</CardGrid>

## Key features

- **Wallet connectivity**: Freighter, Albedo, xBull, Ledger, WalletConnect — unified SEP-43 interface
- **Transaction preview**: every operation decoded, risk flags, contract verification badges, fee estimates
- **Soroban**: typed contract clients, RPC failover, balance-delta previews, auth-entry signing
- **SIWS**: Sign-In With Stellar with SEP-0053 support and server-side verifier
- **Framework wrappers**: React, Vue, Solid, Svelte — tree-shakable, same hook surface
- **UI**: Shadow DOM Web Component, modal/bottom-sheet/inline, draggable bottom-sheet with physics

## License

MIT — see [LICENSE](https://github.com/SagantaHQ/stellar-appkit/blob/main/LICENSE).
