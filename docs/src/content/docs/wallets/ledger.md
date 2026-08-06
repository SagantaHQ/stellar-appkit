---
title: Ledger
description: Ledger hardware wallet connector — WebHID/WebUSB, multi-account, Soroban auth-entry signing.
---

## Setup

```ts
import { createLedgerConnector } from '@saganta/stellar-appkit';

const ledger = createLedgerConnector();
```

Requires `@ledgerhq/hw-app-str`, `@ledgerhq/hw-transport-webhid`, and `@ledgerhq/hw-transport-webusb` as peer dependencies.

## Features

- WebHID / WebUSB transport
- Multi-account support via derivation paths (`listAccounts()` / `selectAccount()`)
- `signTransaction`, `signMessage`, `signAuthEntry` — all supported
- Soroban auth-entry signing via `signSorobanAuthorization` (device hashes on-device)

## Auth-entry signing

The Ledger Stellar app's `signSorobanAuthorization(path, preimageBytes)` receives the raw preimage bytes, hashes on-device with SHA-256, and returns the 64-byte Ed25519 signature. The connector returns `base64(signature)` — same contract as Freighter.
