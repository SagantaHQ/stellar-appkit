---
title: Freighter
description: Freighter wallet connector — extension + mobile, SEP-0053 message signing.
---

## Setup

```ts
import { createFreighterConnector } from '@saganta/stellar-appkit';

const freighter = createFreighterConnector();
```

Requires `@stellar/freighter-api` as a peer dependency.

## Features

- Extension + mobile support
- `signTransaction`, `signAuthEntry`, `signMessage` — all SEP-43 compliant
- SEP-0053 message signing: signs `sha256("Stellar Signed Message:\n" + message)`
- `signedData` = base64 of the SEP-0053 hash (so the verifier can verify directly)
- Auth-entry signing via `signSorobanAuthorization` (Freighter extension v5+)

## SIWS verification

Freighter uses SEP-0053 message encoding — confirmed by reading the extension source at `extension/src/helpers/stellar.ts`:

```ts
SIGN_MESSAGE_PREFIX = "Stellar Signed Message:\n";
encodeSep53Message = (message) => sha256(prefix + utf8(message));
```

The connector surfaces `signedData = base64(sha256("Stellar Signed Message:\n" + message))`, and the verifier tries this as the primary candidate.
