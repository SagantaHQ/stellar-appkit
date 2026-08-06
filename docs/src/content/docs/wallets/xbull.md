---
title: xBull
description: xBull wallet connector — extension + web wallet, with extension detection polling.
---

## Setup

```ts
import { createXBullConnector } from '@saganta/stellar-appkit';

const xbull = createXBullConnector();
```

Requires `@creit.tech/xbull-wallet-connect` as a peer dependency.

## Extension detection

The xBull extension injects `window.xBullSDK` asynchronously via a content script. The connector polls for injection (up to 5 seconds) before every bridge call, checking `window.xBullSDK`, `window.xBull`, and any `xBull*`-prefixed property.

If the extension is installed but no wallet has been set up (`isConnected: false`), the connector throws a friendly error:

> "xBull extension is installed but no wallet has been set up. Open the xBull extension in your browser toolbar and create or import a wallet, then try connecting again."

## SIWS signing (best-effort)

The xBull SDK's TypeScript interface declares `fullMessage` but the actual runtime never populates it. The connector surfaces `signedData = base64(utf8(message))` as a best-effort hypothesis — correct only if xBull signs the raw message verbatim.

If verification fails, use `debug: true` in `verifySiws()` to see all candidates tried.
