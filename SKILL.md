---
name: stellar-appkit
description: Build Stellar/Soroban dApps with unified wallet connections, transaction previews, and Soroban contract calls. Use when building a Stellar dApp frontend that needs wallet connection, transaction signing, Soroban smart contract interaction, or Sign-In With Stellar authentication.
license: MIT
---

# Stellar AppKit — AI Developer Skill

> **One SDK for every Stellar wallet.** Unified wallet API, real transaction previews, Soroban built in, framework wrappers for React/Vue/Solid/Svelte.

## When to use this skill

Use this skill when the user wants to:
- Build a Stellar or Soroban dApp frontend
- Connect Stellar wallets (Freighter, Albedo, xBull, Ledger, WalletConnect)
- Sign and submit transactions on the Stellar network
- Call Soroban smart contracts from a web app
- Implement Sign-In With Stellar (SIWS) authentication
- Show transaction previews with risk flags before signing
- Use React/Vue/Solid/Svelte hooks for wallet state management
- Build a wallet connection modal UI

## Installation

```bash
npm install @saganta/stellar-appkit @saganta/stellar-appkit-ui-web
```

That's it — all wallet SDKs (`@stellar/stellar-sdk`, `@stellar/freighter-api`, `@albedo-link/intent`, `@creit.tech/xbull-wallet-connect`, `@ledgerhq/*`, `@walletconnect/sign-client`) are bundled as regular dependencies. They're installed automatically, version-locked to known-working ranges, and tree-shaken out of your bundle if you don't use the corresponding connector.

The UI package has two runtime dependencies: `qr-code-styling@^1.9.2` (styled QR codes for the WalletConnect pairing view — rounded data modules, extra-rounded finder pattern outer rings, circular finder pattern inner dots) and `motion` (used by the optional animation presets). The bottom-sheet drag-to-dismiss still uses a custom 30-line spring engine built on native Pointer Events + `requestAnimationFrame` (no `@use-gesture/vanilla` needed), and the open/close transitions use native WAAPI (Web Animations API).

For framework wrappers (install the one for your framework — they're optional peer deps):
```bash
npm install react react-dom    # @saganta/stellar-appkit/react
npm install vue                # @saganta/stellar-appkit/vue
npm install solid-js           # @saganta/stellar-appkit/solid
npm install svelte             # @saganta/stellar-appkit/svelte
```

Frameworks must remain as peer deps because your app already has its own framework instance — two copies of React would break hooks. The wallet SDKs don't have this singleton constraint, so they're safe to bundle.

## Core patterns

### Basic wallet connection

```ts
import { StellarAppKit } from '@saganta/stellar-appkit';
import '@saganta/stellar-appkit-ui-web';

// connectors is optional — defaults to Freighter, Albedo, xBull, Ledger
// domain + uri are optional too — auto-derived from window.location in the browser
const appkit = new StellarAppKit({
  network: 'TESTNET', // or 'PUBLIC'
  appMetadata: { name: 'Example App' },
});

const modal = document.querySelector('stellar-appkit-modal');
modal.client = appkit;

connectButton.addEventListener('click', () => modal.open());
await appkit.restore(); // resume persisted session
```

**Zero-config defaults:**
- **`connectors`** — omit to auto-register Freighter, Albedo, xBull, Ledger. WalletConnect excluded (requires `projectId`). Use `defaultConnectors()` to extend.
- **`appMetadata`** follows the WC metadata standard: `{ name, description?, url?, icons? }`. Same object fed directly to WalletConnect. `domain` for SIWS derived from `url` (strip protocol+path), `uri` = `url`. Auto-derived from `window.location.origin` when omitted. In SSR, pass `url` explicitly.

### Signing transactions

```ts
// Goes through the preview flow (onPreviewTransaction) before reaching the wallet
const result = await appkit.signTransaction(unsignedXdr);
// Skip preview for already-confirmed flows
const result = await appkit.signTransaction(unsignedXdr, { skipPreview: true });
```

### Soroban contract calls

```ts
import { SorobanConnection } from '@saganta/stellar-appkit';

const soroban = new SorobanConnection({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  wallet: appkit,
});

// Full pipeline: build → simulate → prepare → sign → submit → poll
const result = await soroban.invoke({
  contractId: 'CBETT2CX...',
  method: 'transfer',
  args: [fromAddress, toAddress, amount],
});

// Preview before signing
const preview = await soroban.previewInvoke({ contractId, method, args });
console.log(preview.balanceDeltas);  // [{ kind: 'account', delta: '-100', ... }]
console.log(preview.feeEstimate);     // { totalFeeXlm: '0.00501 XLM', ... }
```

### Typed contract client

```ts
import { defineContractSpec } from '@saganta/stellar-appkit';

interface TokenContract extends defineContractSpec<{
  transfer: (args: { from: string; to: string; amount: bigint }) => Promise<boolean>;
  balanceOf: (args: { id: string }) => Promise<bigint>;
}> {}

const token = soroban.contract<TokenContract>('CBETT2CX...', {
  specEntries: ['AAA==', 'BBB=='], // from `stellar contract bindings typescript`
});

await token.transfer({ from, to, amount: 100n }); // fully typed
const balance = await token.simulate('balanceOf', { id }); // read-only
```

### Sign-In With Stellar

```ts
// Client side
const { message, signedMessage, signerAddress, signedData } = await appkit.signIn({
  statement: 'Sign in to Example App',
  nonce: await fetch('/api/nonce').then(r => r.text()),
});

// Server side
import { verifySiws } from '@saganta/stellar-appkit-siws-verify';

const result = await verifySiws(
  { message, signedMessage, signerAddress, signedData },
  { expectedDomain: 'app.example.com', expectedNonce }
);
if (result.ok) { /* result.claims.address is verified */ }
```

#### Automatic SIWS authentication flow

Set `siws` on the `StellarAppKit` config and the modal auto-triggers sign-in after wallet connect. Full session lifecycle:

```ts
const appkit = new StellarAppKit({
  network: 'TESTNET',
  siws: {
    statement: 'Sign in to Example App',
    signoutOnDisconnect: true,  // default
    disconnectOnFail: true,     // default
    maxRetries: 3,              // default
    timeoutMs: 15000,           // default
    session: async () => (await fetch('/api/siws/session')).json() || null,
    nonce: async () => (await fetch('/api/siws/nonce')).text(),
    verify: async (data, nonce, ctx) => {
      const res = await fetch('/api/siws/verify', {
        method: 'POST', body: JSON.stringify({ ...data, nonce, ...ctx }),
      });
      return res.ok ? res.json() : null; // → SiwsSession | null
    },
    signout: async () => (await fetch('/api/siws/logout', { method: 'POST' })).ok,
    refresh: async () => (await fetch('/api/siws/refresh')).json() || null, // optional
  },
});
```

Flow: check session → fetch nonce → sign in wallet → verify (returns SiwsSession) → validate address+network+expiry → store persistently.

API:
- `appkit.siwsSession` — SiwsSession | null (auto-expiry)
- `appkit.signOut()` — clear session + signout() + disconnect
- `appkit.requireAuth()` — throws if not authenticated
- `appkit.validateSession()` — refresh from server, returns SiwsSession | null
- `appkit.reauthenticate()` — force re-auth
- `useSiwsSession()` / `useIsAuthenticated()` — React hooks
- `siwsSessionChange` event — fires on session set/clear/expire

### React hooks

```tsx
import { StellarAppKitProvider, useConnect, useSession, useSoroban } from '@saganta/stellar-appkit-ui-web/react';

function App() {
  return (
    <StellarAppKitProvider config={{ network: 'TESTNET', connectors: [...] }}>
      <WalletPanel />
    </StellarAppKitProvider>
  );
}

function WalletPanel() {
  const { connect, isConnected } = useConnect();
  const session = useSession();
  const { invoke, soroban } = useSoroban({ rpcUrl: '...', networkPassphrase: '...' });

  if (!isConnected) return <button onClick={() => connect('freighter')}>Connect</button>;
  return <p>{session?.address}</p>;
}
```

### Framework modal components

Each framework wrapper ships a typed component wrapping the `<stellar-appkit-modal>` Web Component. Use it in place of the raw custom element when you want typed props, automatic client wiring, and event forwarding. **Always import `@saganta/stellar-appkit/ui-web` once at your app entry** to register the custom element — the framework wrappers don't import it themselves (keeps them SSR-safe).

**React:**

```tsx
import { useRef } from 'react';
import { StellarAppKitProvider, StellarAppKitModal, useAppKit } from '@saganta/stellar-appkit-ui-web/react';
import type { StellarAppKitModalHandle } from '@saganta/stellar-appkit-ui-web/react';
import '@saganta/stellar-appkit-ui-web'; // registers <stellar-appkit-modal>

function App() {
  return (
    <StellarAppKitProvider config={{ network: 'TESTNET', connectors: [...] }}>
      <ModalHost />
    </StellarAppKitProvider>
  );
}

function ModalHost() {
  const ref = useRef<StellarAppKitModalHandle>(null);
  return (
    <>
      <StellarAppKitModal ref={ref} mode="auto" theme="minimal" />
      <button onClick={() => ref.current?.open()}>Connect</button>
    </>
  );
}
```

**Vue:**

```vue
<script setup lang="ts">
  import { ref } from 'vue';
  import { provideStellarAppKit, StellarAppKitModal } from '@saganta/stellar-appkit-ui-web/vue';
  import '@saganta/stellar-appkit-ui-web';
  provideStellarAppKit({ network: 'TESTNET', connectors: [...] });
  const modal = ref<InstanceType<typeof StellarAppKitModal>>();
</script>

<template>
  <StellarAppKitModal ref="modal" mode="auto" theme="minimal"
                      @connect="(s) => console.log('connected', s)" />
  <button @click="modal?.open()">Connect</button>
</template>
```

**Solid:**

```tsx
import { StellarAppKitProvider, StellarAppKitModal } from '@saganta/stellar-appkit-ui-web/solid';
import type { StellarAppKitModalHandle } from '@saganta/stellar-appkit-ui-web/solid';
import '@saganta/stellar-appkit-ui-web';

function ModalHost() {
  let handle: StellarAppKitModalHandle | undefined;
  return (
    <>
      <StellarAppKitModal ref={(h) => (handle = h)} mode="auto" theme="minimal" />
      <button onClick={() => handle?.open()}>Connect</button>
    </>
  );
}
```

**Svelte** (uses a `use:stellarmodal` action on the raw `<stellar-appkit-modal>` element — most idiomatic for Svelte):

```svelte
<script lang="ts">
  import { setStellarAppKitContext, stellarmodal, openModal } from '@saganta/stellar-appkit-ui-web/svelte';
  import '@saganta/stellar-appkit-ui-web';
  setStellarAppKitContext({ network: 'TESTNET', connectors: [...] });
  let modalEl: HTMLElement;
</script>

<stellar-appkit-modal use:stellarmodal bind:this={modalEl} mode="auto" theme="minimal"
                      on:sc-connect={(e) => console.log('connected', e.detail)} />
<button on:click={() => openModal(modalEl)}>Connect</button>
```

### Transaction preview configuration

```ts
const appkit = new StellarAppKit({
  network: 'PUBLIC',
  connectors: [...],
  previewOptions: {
    verifiedContracts: new Set(['CA...KNOWN_CONTRACT']),
    largeTransferThreshold: 1000,
    contractMetadata: new Map([
      ['CBETT2CX...', { name: 'USDC', verified: true, audited: true, auditUrl: '...' }],
    ]),
    includeFeeEstimate: true,
  },
  onPreviewTransaction: async (preview) => {
    // Show preview UI, return true to approve, false to reject
    return true;
  },
});
```

### RPC failover

```ts
const soroban = new SorobanConnection({
  rpcUrls: [
    'https://soroban-testnet.stellar.org',
    'https://rpc-backup.example.com',
  ],
  failoverOptions: {
    unhealthyCooldownMs: 30_000,
    onFailover: ({ method, error }) => console.warn(`Failover: ${error}`),
  },
  networkPassphrase: Networks.TESTNET,
  wallet: appkit,
});
```

### Error handling

```ts
import { ConnectError, NetworkMismatchError } from '@saganta/stellar-appkit';

try {
  await appkit.connect('freighter');
} catch (err) {
  if (err instanceof NetworkMismatchError) {
    // err.expectedNetwork, err.actualNetwork
  }
  if (err instanceof ConnectError) {
    // err.code: -1 (internal), -2 (external), -3 (invalid request), -4 (rejected)
  }
}
```

## Key API reference

### StellarAppKit
- `connect(walletId, opts?)` — connect a wallet
- `disconnect(walletId?)` — disconnect
- `signTransaction(xdr, opts?)` — sign (with preview)
- `signMessage(message, opts?)` — sign raw message
- `signIn(opts)` — SIWS sign-in
- `signAuthEntry(xdr, opts?)` — Soroban auth entry
- `session` — active ConnectSession
- `pendingSignCount` — queued sign requests
- `on(event, handler)` — event subscription

### SorobanConnection
- `invoke(opts)` — full pipeline (build → sign → submit → poll)
- `previewInvoke(opts)` — simulate + decode (no signing)
- `estimateFee(xdr)` — fee breakdown
- `contract<T>(id, { specEntries })` — typed client
- `getFailoverStatus()` — RPC health

### verifySiws
- `verifySiws(payload, opts)` — server-side SIWS verification
- `opts.debug: true` — diagnostics dump on failure
- Multi-candidate verification (8+ byte sequences tried)

### Framework modal components
- `StellarAppKitModal` (React/Solid/Vue) — typed component wrapping `<stellar-appkit-modal>`
- `stellarmodal` (Svelte) — `use:stellarmodal` action on the raw `<stellar-appkit-modal>` element
- `openModal(node)` / `closeModal(node)` (Svelte) — imperative helpers
- Props: `mode`, `theme`, `branding`, `logoSrc`, `title`, `autoRetryNetwork`, `stellarExpertAvatars`, `animation`, `animationOpen`, `animationClose`
- Events: `onConnect` / `onDisconnect` / `onError` (React/Solid), `@connect` / `@disconnect` / `@error` (Vue), `on:sc-connect` / `on:sc-disconnect` / `on:sc-error` (Svelte on raw element)
- Imperative handle: `open()`, `close(skipAnimation?)`, `element` (via `ref` in React/Solid/Vue)
- **Requires** `import '@saganta/stellar-appkit-ui-web'` once at app entry to register the custom element
- **Animation presets**: `none`, `fade`, `scale`, `scale-blur` (default modal), `slide-up` (default bottom-sheet), `slide-left`, `implode` — zero-dependency WAAPI, respects `prefers-reduced-motion`
- **Animation config priority**: HTML attributes (`animation-open` / `animation-close`) > `animation` attribute > `StellarAppKit` config (`modal.animation`) > mode-based default

## Available connectors

All wallet SDKs are bundled as regular dependencies — no manual install needed. Tree-shaken out of your bundle if the connector isn't imported.

| Connector | Function | Bundled SDK | Default? |
|---|---|---|---|
| Freighter | `createFreighterConnector()` | `@stellar/freighter-api` | Yes |
| Albedo | `createAlbedoConnector()` | `@albedo-link/intent` | Yes |
| xBull | `createXBullConnector()` | `@creit.tech/xbull-wallet-connect` | Yes |
| Ledger | `createLedgerConnector()` | `@ledgerhq/hw-app-str` + `hw-transport-webhid` + `hw-transport-webusb` | Yes |
| WalletConnect | `createWalletConnectConnector(opts)` | `@walletconnect/sign-client` | No (requires `projectId`) |

`defaultConnectors()` returns `[Freighter, Albedo, xBull, Ledger]` — used automatically when `connectors` is omitted from the `StellarAppKit` config.

### WalletConnect-based wallets (Hana, Lobstr, Hot Wallet)

WalletConnect covers every Stellar wallet that isn't a browser extension — Hana, Lobstr, Hot Wallet, and any mobile wallet. It requires a `projectId` from [WalletConnect Cloud](https://cloud.walletconnect.com/):

```ts
import {
  StellarAppKit,
  createWalletConnectConnector,
  defaultConnectors,
  Networks,
} from '@saganta/stellar-appkit';

const appkit = new StellarAppKit({
  network: 'TESTNET',
  connectors: [
    ...defaultConnectors(),
    createWalletConnectConnector({
      projectId: 'your-wc-cloud-project-id',
      metadata: { name: 'My App', description: '...', url: '...', icons: [] },
      networkPassphrase: Networks.TESTNET,
      // onUri is OPTIONAL — the modal renders the QR code automatically
      // using qr-code-styling (styled with rounded modules + dot-style
      // finder pattern centers). Only set it if building your own UI.
    }),
  ],
});
```

**When using `<stellar-appkit-modal>` (recommended):** the QR code is rendered automatically — the modal intercepts the pairing URI via `setOnUri()` and renders it as an inline SVG via [`qr-code-styling`](https://www.npmjs.com/package/qr-code-styling). The styling matches Reown's QR aesthetic: rounded data modules (`dotsOptions.type: 'rounded'`), extra-rounded finder pattern outer rings (`cornersSquareOptions.type: 'extra-rounded'`), and circular finder pattern inner dots (`cornersDotOptions.type: 'dot'`). You can omit `onUri` entirely.

**When building your own UI (no modal):** set `onUri` to render the QR code yourself (use `qr-code-styling`, `qrcode.react`, or `qrcode` — `better-qr` was used in older versions and is no longer bundled).

**Hana Wallet** (SDF's wallet) connects exclusively via WalletConnect — it doesn't expose a SEP-43 browser-extension API.

**`Networks` export:** `import { Networks } from '@saganta/stellar-appkit'` — no need to import `@stellar/stellar-sdk` just for `Networks.TESTNET`. Includes `PUBLIC`, `TESTNET`, `FUTURENET`, `STANDALONE`.

## SIWS signing per wallet

| Wallet | What gets signed | `signedData` |
|---|---|---|
| Freighter | `sha256("Stellar Signed Message:\n" + message)` (SEP-0053) | Base64 of the hash |
| Albedo | `res.signed_message` (server-derived hash) | Base64 of hex-decoded bytes |
| xBull | `utf8(message)` (best-effort) | Base64 of UTF-8 bytes |
| Ledger | `utf8(message)` (direct signer) | Base64 of UTF-8 bytes |

## Theming

The modal ships with **5 named themes**, each with a dark and light variant (10 theme objects total). Themes are built on a shared **zinc neutral base palette** (`#09090B` / `#FFFFFF` bg, `#18181B` / `#F8F8F8` surface, `#FAFAFA` / `#18181B` text) — each named theme only overrides the accent color, so the rest of the palette stays consistent.

| Theme | Accent (dark / light) | Vibe |
|---|---|---|
| `minimal` (default) | `#FAFAFA` / `#18181B` (neutral) | Fits any project — no brand color, looks native wherever it's embedded |
| `stellar` | `#6EE7B7` / `#0E9A6E` (Stellar green) | Stellar brand theme |
| `sky` | `#38BDF8` / `#0EA5E9` (light sky blue) | Open and friendly |
| `ocean` | `#60A5FA` / `#1D4ED8` (deep ocean blue) | Serious, financial |
| `sunset` | `#FB7185` / `#E11D48` (warm coral/pink) | Energetic, creative |

The `theme` attribute accepts:
- A named theme: `theme="minimal"`, `theme="stellar"`, `theme="sky"`, `theme="ocean"`, `theme="sunset"` (resolves to the dark variant by default)
- A named theme with `:light` suffix: `theme="sky:light"`, `theme="ocean:light"`
- `theme="auto"` — follows `prefers-color-scheme` (resolves to `minimal` dark/light)
- `theme="dark"` or `theme="light"` (backwards compat — both map to `minimalDark` / `minimalLight`)
- Omitted / unknown — defaults to `minimal` (dark)

```html
<stellar-appkit-modal mode="auto" theme="minimal"></stellar-appkit-modal>
<stellar-appkit-modal mode="auto" theme="stellar"></stellar-appkit-modal>
<stellar-appkit-modal mode="auto" theme="sky:light"></stellar-appkit-modal>
<stellar-appkit-modal mode="auto" theme="auto"></stellar-appkit-modal>
```

Override individual tokens via CSS custom properties on the host element — they cross the Shadow DOM boundary, no JS API needed:

```css
stellar-appkit-modal {
  --sak-color-bg: #09090B;
  --sak-color-surface: #18181B;
  --sak-color-accent: #6EE7B7;
  --sak-color-text: #FAFAFA;
  --sak-radius-lg: 20px;
  --sak-font-display: 'Geist Sans', sans-serif;
  --sak-font-mono: 'Geist Mono', monospace;
}
```

You can also import the resolved theme objects directly (useful for non-UI code that needs the same colors):

```ts
import { minimalDark, stellarLight, skyDark, THEME_NAMES } from '@saganta/stellar-appkit-ui-web';
```

## Built-in wallet UX features

The `<stellar-appkit-modal>` ships with several quality-of-life features wired into the connected view — no config needed:

- **"Get Testnet funds" button** — when the connected network is `TESTNET`, a button appears next to the balance that calls [`friendbot.stellar.org`](https://friendbot.stellar.org) via `fetch()` (no `window.open` — the user stays in the modal). Shows a "Funding requested…" banner, then polls the balance at 3s / 6s / 10s after the click so the new XLM appears automatically without a manual refresh. The button is Testnet-only — Futurenet / Standalone / Public don't render it.
- **Balance + transaction-history polling** — while the modal is open and a wallet is connected, the modal silently refreshes the balance and recent transactions every **10 seconds** (silent = no skeleton-loading flash; the cached values stay visible until the new fetch resolves). Polling starts when the modal opens and stops on close/disconnect. After any successful `signTransaction()`, the modal also refreshes the balance + history 2 seconds later so the new transaction shows up immediately.
- **WalletConnect pinned to top** — when a WalletConnect connector is registered, it's sorted to the top of the wallet list (it's the only "always-available" connector since it's a relay, not a browser extension) and its sub-label reads "Scan QR Code" instead of "Installed".
- **Ledger icon** — the Ledger wallet row uses a bundled inline SVG: white background with a black "L" wordmark at `font-weight: 400` (Inter / Helvetica Neue / Helvetica / Arial).

## Links

- [GitHub](https://github.com/sagantaHQ/stellar-appkit)
- [Documentation](https://stellar-appkit.saganta.com)
- [Live Demos](https://demos.stellar-appkit.saganta.com)
- [npm](https://www.npmjs.com/package/@saganta/stellar-appkit)
