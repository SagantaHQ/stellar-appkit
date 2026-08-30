# @saganta/stellar-appkit

> Unified Stellar wallet connections, Soroban, and transaction preview — the core SDK (no UI).

[![npm version](https://img.shields.io/npm/v/@saganta/stellar-appkit.svg)](https://www.npmjs.com/package/@saganta/stellar-appkit)
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
npm install @saganta/stellar-appkit
```

## Quick start

```ts
import {
  StellarAppKit,
  createFreighterConnector,
  createAlbedoConnector,
} from '@saganta/stellar-appkit';

const appkit = new StellarAppKit({
  network: 'TESTNET',
  connectors: [createFreighterConnector(), createAlbedoConnector()],
  appMetadata: {
    name: 'My App',
    url: 'https://app.example.com',
  },
});

// Connect a wallet
const session = await appkit.connect('freighter');

// Sign a transaction
const { signedTxXdr } = await appkit.signTransaction(xdr);

// Sign a message (SIWS)
const { message, signedMessage, signedData, signerAddress } = await appkit.signIn({
  statement: 'Sign in to My App',
  nonce: 'server-issued-nonce',
});
```

## What's included

- **`StellarAppKit`** — the core client. Manages wallet connections, sessions, signing queue, SIWS session lifecycle, and cross-tab sync.
- **Wallet connectors** — Freighter, Albedo, xBull, Ledger, WalletConnect. All tree-shakeable — import only what you use.
- **`defaultConnectors()`** — returns the 4 browser-side wallets (Freighter, Albedo, xBull, Ledger). WalletConnect is excluded (requires `projectId`).
- **`SorobanConnection`** — simulate → prepare → sign → submit as one `invoke()` call. Typed contract clients, RPC failover, fee estimation.
- **SIWS** — `signIn()` for manual sign-in, or pass a `SiwsConfig` for automatic sign-in flow with session persistence.
- **i18n** — 25 locales (English bundled, 24 lazy-loaded). `setLocale()`, `getLocale()`, `t()`, `onLocaleChange()`. `t()` runs on `intl-messageformat` and falls back to a built-in zero-dependency ICU formatter on engines without `Intl.PluralRules` (Hermes / React Native) — plural messages never leak their raw `{count, plural, …}` pattern.
- **`Networks`** — `Networks.PUBLIC`, `Networks.TESTNET`, `Networks.FUTURENET`, `Networks.STANDALONE`.

## Framework wrappers

The core SDK is UI-free. For the modal UI + framework hooks:

```bash
npm install @saganta/stellar-appkit-ui-web
```

Framework subpaths:
- `@saganta/stellar-appkit-ui-web/react` — React hooks (`useConnect`, `useSession`, `useSiwsSession`, `useLocale`, etc.)
- `@saganta/stellar-appkit-ui-web/vue` — Vue 3 composables
- `@saganta/stellar-appkit-ui-web/solid` — Solid hooks
- `@saganta/stellar-appkit-ui-web/svelte` — Svelte stores

## Server-side SIWS verification

```bash
npm install @saganta/stellar-appkit-siws-verify
```

```ts
import { verifySiws } from '@saganta/stellar-appkit-siws-verify';

const result = await verifySiws(
  { message, signedMessage, signerAddress, signedData },
  { expectedDomain: 'app.example.com', expectedNonce: nonce }
);
if (result.ok) {
  console.log(result.claims.address); // authenticated user
}
```

## Documentation

- **[Full docs](https://stellar-appkit.saganta.com)** — installation, quick start, API reference, guides
- **[Live demos](https://demos.stellar-appkit.saganta.com)** — 18 working Next.js examples
- **[Changelog](https://stellar-appkit.saganta.com/reference/changelog/)** — release history
- **[AI Integration](https://stellar-appkit.saganta.com/reference/ai-integration/)** — SKILL.md + llms.txt for AI coding tools

## License

MIT © [Saganta](https://github.com/SagantaHQ)
