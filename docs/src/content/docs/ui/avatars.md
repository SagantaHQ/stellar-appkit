---
title: Avatars
description: Wallet-provided avatars, Stellar Expert avatars, and deterministic gradient fallbacks.
---

## Overview

The modal shows an avatar next to each connected account. Three sources, in priority order:

1. **Wallet-provided avatar** — connectors can implement `getAvatar()` to return a profile picture URL
2. **Stellar Expert avatar** — opt-in via `stellar-expert-avatars="true"` attribute; fetches from `api.stellar.expert`
3. **Deterministic gradient** — generated from the address; same address always produces the same gradient

## Wallet-provided avatars

Connectors that support profile pictures implement the optional `getAvatar()` method:

```ts
interface WalletConnector {
  // ...
  getAvatar?(): Promise<{ url: string } | null>;
}
```

## Stellar Expert avatars

```html
<saganta-appkit-modal stellar-expert-avatars="true"></saganta-appkit-modal>
```

Fetches generated PNG avatars from `https://api.stellar.expert/explorer/public/account/{address}/avatar`. Falls back to the gradient on error. Off by default (third-party request).

## Gradient fallback

When no avatar is available, the modal generates a CSS gradient from the address bytes:

```ts
import { gradientFromAddress } from '@saganta/stellar-appkit/ui-web';

const gradient = gradientFromAddress('GA2C5RFPE6...');
// 'linear-gradient(135deg, hsl(142, 65%, 55%), hsl(202, 65%, 45%))'
```
