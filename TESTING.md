# Testing

## Running tests

```bash
# All packages
bun test

# Just the core package
bun run test:core

# Just the SIWS verifier
bun run test:siws-verify

# A single test file
bun test packages/siws-verify/tests/verifySiws.test.ts

# A single test by name (substring match)
bun test --test-name-pattern "threads signedData"
```

CI runs the same `bun test` command on every push and pull request — see
`.github/workflows/ci.yml`.

## What the test suite covers

### `packages/core/tests/siws.test.ts` (13 tests)

- **`buildSiwsMessage` format**: the message round-trips through
  `parseSiwsMessage` with every field intact. This is the canary for drift
  between the test helper's `buildSiwsMessage` copy and the library's
  internal one — if either changes without the other, the round-trip
  breaks.
- **`parseSiwsMessage` rejection cases**: empty input, missing domain
  header, missing address line, and graceful handling of absent optional
  fields.
- **`signInWithStellar` threading**: the `signedData` field flows from
  the connector's `signMessage()` return value into the `SignInResult`
  unchanged. Also covers backward-compat (connector omits `signedData`),
  error cases (connector doesn't support signMessage, signer address
  mismatch), and expiration defaults.

### `packages/core/tests/connectors/freighter.test.ts` (5 tests)

- `signMessage` returns `signedData = base64(utf8(message))` — the raw
  bytes Freighter signs.
- Message and opts are passed through to `@stellar/freighter-api`
  verbatim.
- Accepts both response shapes Freighter has shipped (raw Buffer and
  pre-encoded base64 string).
- Throws `ConnectError` on empty `signedMessage`.
- Normalizes wallet errors (e.g. "user rejected") into `ConnectError`.

### `packages/core/tests/connectors/albedo.test.ts` (5 tests)

- `signMessage` surfaces `res.signed_message` as `signedData` (base64 of
  hex-decoded bytes) — **the regression guard for the bug that motivated
  the unified `signedData` fix**.
- Does NOT fall back to the plaintext message as `signedData`.
- Passes `pubkey` through to the Albedo intent.
- Throws `ConnectError` when Albedo doesn't return `signed_message`.
- Normalizes thrown errors into `ConnectError`.

### `packages/core/tests/connectors/xbull.test.ts` (5 tests)

- `signMessage` uses `result.fullMessage` as `signedData` when present.
- Falls back to `result.message` when `fullMessage` is missing (older
  xBull SDK).
- Falls back to the input `message` when neither is in the response
  (defensive).
- Passes address and networkPassphrase opts through to the bridge.
- Normalizes thrown errors into `ConnectError`.

### `packages/siws-verify/tests/verifySiws.test.ts` (19 tests)

- **Positive cases**: each wallet profile (Freighter / Albedo / xBull)
  with `signedData` populated → verification succeeds.
- **Envelope checks**: rejects on invalid message, address mismatch,
  domain mismatch, nonce mismatch, expired message, invalid expiration
  date.
- **Signature verification failures**: tampered signature rejected for
  each wallet profile; mismatched `signedData` (connector reports the
  wrong bytes) rejected.
- **Backward compatibility**: `signedData` omitted → fallback path
  passes for direct signers (Freighter), fails loudly for transformative
  signers (Albedo, xBull).
- **Custom `verifySignatureFn`**: callback receives all four fields
  (`message`, `signedData`, `signature`, `address`); sync and async
  callbacks both work; custom result surfaces as `ok=true` or
  `ok=false`.
- **Claims shape**: verifies the full claims object on success.

### `packages/siws-verify/tests/decodeSignature.test.ts` (7 tests)

- Accepts base64-encoded signatures (Freighter/Ledger style).
- Accepts hex-encoded signatures (Albedo style), both lowercase and
  uppercase.
- Rejects truncated signatures (wrong byte count).
- Rejects garbage that is neither valid base64 nor valid hex.
- **Regression guard**: does not misfire on pure-alphanumeric base64
  signatures of even length (the old regex heuristic could).

## Test strategy

The tests use **real ed25519 keypairs** (via `@stellar/stellar-sdk`'s
`Keypair.random()`) and sign real messages with them, then verify with
the actual `verifySiws` function. This is an end-to-end test of the
verifier's cryptography, not a mock-based unit test — a bug in the
signature decoding or verification logic will be caught.

Wallet SDKs (`@stellar/freighter-api`, `@albedo-link/intent`,
`@creit.tech/xbull-wallet-connect`) are mocked with `bun:test`'s
`mock.module()` so the connector tests don't require a real wallet
extension. Each mock delegates to a per-test `fakeApi` object so tests
can control exactly what the wallet "returns" and assert how the
connector transforms it.

## Adding a new wallet connector

When you add a new connector, add a test file at
`packages/core/tests/connectors/<name>.test.ts` that covers at minimum:

1. `signMessage` returns `signedData` — base64 of the exact bytes the
   wallet signed. If the wallet signs the raw message, that's
   `base64(utf8(message))`. If it transforms the message first (like
   Albedo), surface the transformed bytes.
2. `signMessage` passes opts through to the underlying SDK.
3. `signMessage` normalizes SDK errors into `ConnectError`.
4. Add the wallet to the `PROFILES` array in
   `packages/siws-verify/tests/verifySiws.test.ts` with a
   `bytesSignedByWallet` function that simulates what the wallet signs.
   The existing positive/negative/backward-compat tests will then
   automatically cover the new wallet.
