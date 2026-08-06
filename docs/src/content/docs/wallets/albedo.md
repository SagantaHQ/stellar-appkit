---
title: Albedo
description: Albedo wallet connector — no install required, popup-based signer.
---

## Setup

```ts
import { createAlbedoConnector } from '@saganta/stellar-appkit';

const albedo = createAlbedoConnector();
```

Requires `@albedo-link/intent` as a peer dependency.

## Features

- No install required — popup-based web signer
- `signTransaction`, `signMessage` supported
- `signAuthEntry` not supported (Albedo doesn't expose it)
- 60-second connection timeout (popup can be closed without resolving)

## SIWS signing

Albedo returns `signed_message` (hex-encoded derived hash) and `message_signature` (hex-encoded Ed25519 signature). The connector surfaces `signedData = base64(hexDecode(signed_message))` — the actual bytes Albedo signed.

> **Note**: stellar-wallets-kit explicitly refuses Albedo's `signMessage` as "not compatible with SEP-0043" because of the opaque server-side derivation. Our connector works by surfacing `signed_message`, but verification may break if Albedo changes their derivation.
