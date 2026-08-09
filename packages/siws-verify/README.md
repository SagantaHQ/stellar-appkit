# @saganta/stellar-appkit-siws-verify

> Server-side SIWS (Sign-In With Stellar) signature verification.

[![npm version](https://img.shields.io/npm/v/@saganta/stellar-appkit-siws-verify.svg)](https://www.npmjs.com/package/@saganta/stellar-appkit-siws-verify)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/sagantaHQ/stellar-appkit/blob/main/LICENSE)

---

## 📖 Official Docs  ·  🎮 Official Demos

| | Link |
|---|---|
| **📖 Official Docs** | **[stellar-appkit.saganta.com](https://stellar-appkit.saganta.com)** |
| **🎮 Official Demos** | **[demos.stellar-appkit.saganta.com](https://demos.stellar-appkit.saganta.com)** |
| **💻 GitHub** | **[github.com/sagantaHQ/stellar-appkit](https://github.com/sagantaHQ/stellar-appkit)** |

---

## Install

```bash
npm install @saganta/stellar-appkit-siws-verify
```

## Usage

```ts
import { verifySiws } from '@saganta/stellar-appkit-siws-verify';

// The client (browser) sends these after signing:
// { message, signedMessage, signerAddress, signedData }

const result = await verifySiws(
  { message, signedMessage, signerAddress, signedData },
  {
    expectedDomain: 'app.example.com',  // must match the domain in the SIWS message
    expectedNonce: nonce,               // the nonce you issued earlier
  }
);

if (result.ok) {
  // Verification succeeded — the user proved they own signerAddress
  console.log(result.claims.address);
  console.log(result.claims.expirationTime);

  // Set a session cookie, issue a JWT, etc.
} else {
  // Verification failed
  console.log(result.reason);

  // Enable debug mode to see exactly what was tried:
  // const result = await verifySiws(payload, { ...opts, debug: true });
  // console.log(result.diagnostics);
}
```

## How it works

Different Stellar wallets sign messages differently:
- **Freighter** signs `sha256("Stellar Signed Message:\n" + message)` (SEP-0053)
- **Albedo** signs a server-derived hash
- **xBull** signs raw UTF-8 bytes
- **Ledger** signs raw UTF-8 bytes (direct signer)

The `signedData` field (base64 of the exact bytes the wallet signed) is surfaced by every connector in `@saganta/stellar-appkit`. The verifier tries 8+ candidate byte sequences so you don't need per-wallet verification logic:

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
  // {
  //   signatureByteLength: 64,
  //   candidatesTried: [
  //     { label: 'signedData', byteLength: 32, verified: false },
  //     { label: 'utf8(message)', byteLength: 156, verified: false },
  //     { label: 'sha256(SEP-0053)', byteLength: 32, verified: true },
  //     ...
  //   ]
  // }
}
```

## API

```ts
function verifySiws(
  payload: {
    message: string;           // the SIWS message text
    signedMessage: string;     // base64 signature
    signerAddress: string;     // G... address
    signedData?: string;       // base64 of the exact bytes signed (optional but recommended)
  },
  opts: {
    expectedDomain: string;    // must match the domain in the SIWS message
    expectedNonce: string;     // the nonce you issued earlier
    debug?: boolean;           // default: false
  }
): Promise<{
  ok: boolean;
  claims?: {
    address: string;
    domain: string;
    nonce: string;
    issuedAt: string;
    expirationTime: string;
  };
  reason?: string;
  diagnostics?: { ... };
}>
```

## Documentation

- **[SIWS guide](https://stellar-appkit.saganta.com/core/siws/)** — full client + server flow, automatic SIWS, session lifecycle
- **[Live demos](https://demos.stellar-appkit.saganta.com)** — SIWS sign-in, session middleware, debug verification
- **[Full docs](https://stellar-appkit.saganta.com)** — complete documentation

## License

MIT © [Saganta](https://github.com/saganta)
