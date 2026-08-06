---
title: Sign-In With Stellar
description: A self-issued auth flow with server-side verification, SEP-0053 signing support, and debug diagnostics.
---

## Client-side sign-in

```ts
const { message, signedMessage, signerAddress, signedData } = await appkit.signIn({
  statement: 'Sign in to My App',
  nonce: await fetch('/api/siws/nonce').then((r) => r.text()),
});
// POST { message, signedMessage, signerAddress, signedData } to your backend
```

## Server-side verification

```ts
import { verifySiws } from '@saganta/stellar-appkit-siws-verify';

const result = await verifySiws(
  { message, signedMessage, signerAddress, signedData },
  { expectedDomain: 'app.example.com', expectedNonce }
);
if (result.ok) {
  // result.claims.address is the authenticated user
}
```

## How signing works per wallet

| Wallet | What gets signed | `signedData` |
|---|---|---|
| Freighter | `sha256("Stellar Signed Message:\n" + message)` (SEP-0053) | Base64 of the hash |
| Albedo | `res.signed_message` (server-derived hash) | Base64 of hex-decoded bytes |
| xBull | `utf8(message)` (best-effort — SDK doesn't expose fullMessage) | Base64 of UTF-8 bytes |
| Ledger | `utf8(message)` (direct signer) | Base64 of UTF-8 bytes |

## Multi-candidate verification

The verifier tries 8+ candidate byte sequences because wallets don't all sign the same thing:

1. `signedData` (if present)
2. `utf8(message)` — raw bytes
3. `sha256("Stellar Signed Message:\n" + message)` — SEP-0053 (Freighter)
4. `sha256(message)` — generic prehash
5. `sha512(message)` — SHA-512 prehash
6. `sha512(message)` truncated to 32 bytes
7. `sha256("\x00" + message)` — null-byte domain prefix
8. `utf8(message with CRLF)` — Windows line endings

## Debug mode

When verification fails, enable `debug: true` to see exactly what was tried:

```ts
const result = await verifySiws(payload, {
  expectedDomain: 'localhost',
  expectedNonce: nonce,
  debug: true,
});
if (!result.ok) {
  console.log(result.diagnostics);
  // { signatureByteLength: 64, candidatesTried: [...] }
}
```
