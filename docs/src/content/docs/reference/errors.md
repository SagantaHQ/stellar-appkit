---
title: Error Handling
description: Unified ConnectError class with SEP-43 error codes.
---

## ConnectError

All wallet errors are normalized into a single `ConnectError` class:

```ts
class ConnectError extends Error {
  code: -1 | -2 | -3 | -4  // SEP-43 error codes
  ext?: string[]
  walletId?: string
}
```

| Code | Meaning |
|---|---|
| `-1` | Internal wallet error |
| `-2` | External service error (Horizon, RPC) |
| `-3` | Invalid client request |
| `-4` | User rejected |

## NetworkMismatchError

```ts
class NetworkMismatchError extends ConnectError {
  expectedNetwork: string
  actualNetwork: string
}
```

Thrown by `connect()` when the wallet's live network doesn't match the app's configured network. Use `instanceof` to render a "switch to Testnet" prompt:

```ts
try {
  await appkit.connect('freighter');
} catch (err) {
  if (err instanceof NetworkMismatchError) {
    // Show "switch to Testnet" UI
  }
}
```

## Static constructors

```ts
ConnectError.internal(message, ext?, walletId?)     // code: -1
ConnectError.externalService(message, ext?, walletId?) // code: -2
ConnectError.invalidRequest(message, ext?, walletId?) // code: -3
ConnectError.rejected(walletId?)                    // code: -4
```
