---
title: WalletConnect
description: WalletConnect v2 relay adapter — QR pairing, mobile deep-linking, covers Lobstr/Hana/Hot Wallet.
---

## Setup

```ts
import { createWalletConnectConnector } from '@saganta/stellar-appkit';

const wc = createWalletConnectConnector({
  projectId: 'your-wc-cloud-project-id',
  metadata: { name: 'My App', description: '...', url: '...', icons: [] },
  onUri: (uri) => showQRCode(uri),
  networkPassphrase: Networks.TESTNET,
});
```

Requires `@walletconnect/sign-client` as a peer dependency.

## Flow

1. `connect()` calls `SignClient.init()` and `client.connect()` — returns a pairing URI
2. The URI is surfaced via the `onUri` callback — the app renders it as a QR code (desktop) or deep link (mobile)
3. The wallet scans the QR / opens the deep link, approves the connection
4. `connect()` resolves with the wallet's address

## Supported methods

- `stellar_signXDR` — transaction signing
- `stellar_signMessage` — message signing (with fallback error if unsupported)
- `stellar_getAddress` / `stellar_getNetwork` — session info

## Session persistence

The WC session topic is persisted via the injected `ConnectStorage`. On `restore()`, the connector checks if the session is still active.
