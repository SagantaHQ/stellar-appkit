---
title: Auth-Entry Signing
description: Soroban delegated auth entries are signed automatically inside the invoke pipeline.
---

## Overview

Soroban auth entries (delegated/multi-party auth) are signed automatically inside `SorobanConnection.invoke()`. Uses `@stellar/stellar-base`'s `authorizeEntry()` helper.

## How it works

1. `transactionNeedsAuthEntrySigning()` checks if any auth entry has `SOROBAN_CREDENTIALS_ADDRESS` credentials bound to the connected wallet's address with an unsigned signature
2. If yes, `signAuthEntries()` walks the auth entries and signs each via `wallet.signAuthEntry(preimageBase64, opts)`
3. `authorizeEntry()` handles: cloning, nonce, expiration, `HashIdPreimage` construction, SHA-256 hashing, local signature verification, and `ScVal` wrapping

## Wallet-facing contract

The wallet signs `SHA256(preimageBytes)` and returns the raw 64-byte Ed25519 signature:

```
signAuthEntry(preimageBase64) → { signedAuthEntry: signatureBase64, signerAddress }
```

The wallet does NOT need to know about `ScVal` wrapping — `authorizeEntry` handles that.

## Standalone signAuthEntry

You can also call `signAuthEntry()` standalone (e.g. for delegated auth flows where you have the unsigned entry XDR):

```ts
const result = await appkit.signAuthEntry(preimageBase64, {
  networkPassphrase: Networks.TESTNET,
});
```

This goes through the `onPreviewAuthEntry` hook (if set) before reaching the wallet — surfacing the contracts/functions being authorized with risk flags.
