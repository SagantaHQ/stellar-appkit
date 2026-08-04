# Stellar AppKit

**A Web3Modal / Reown AppKit equivalent for Stellar** — one unified wallet API, a first-class Soroban layer, real transaction previews instead of raw XDR, and a themeable UI that works identically dropped into any site.

Built by [Saganta](https://github.com/saganta) as the wallet-connection layer of its Stellar/Soroban developer infrastructure (embedded wallets, gas sponsorship, smart accounts, payment APIs).

---

## Why this exists

Stellar already has solid wallet-connection plumbing — [SEP-43](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0043.md) is an emerging standard interface several wallets are converging on, and [`@creit-tech/stellar-wallets-kit`](https://github.com/Creit-Tech/Stellar-Wallets-Kit) is a mature, headless connector library covering most of the ecosystem. Neither ships what this does:

- A **polished, themeable, cross-platform UI** (modal / bottom-sheet / inline) — the existing connector libraries are deliberately headless, so "sleek out of the box" is a gap, not a solved problem.
- A **transaction preview** that decodes operations into plain language and flags risk *before* the wallet's own signature prompt — every wallet-connect kit passes raw XDR straight through today.
- A **first-class Soroban layer** — simulate → prepare → sign → submit as one call, with typed contract clients, instead of hand-rolling `rpc.Server` calls per app.
- **Multi-wallet sessions**, hardware wallet support, and network-mismatch recovery that goes further than "fail with a generic error."

Every connector is its own independently tree-shakeable module — pick one wallet or all of them, nothing you don't import ships in your bundle (verified: a Freighter-only build is 14.1kb; adding Albedo and xBull brings it to 20.2kb, with zero code for either when they're not imported).

---

## Features

**Wallet connectivity**
- Unified adapter interface aligned with SEP-43, so new wallets are one file, not a redesign
- Freighter, Albedo, xBull, and Ledger (WebHID/WebUSB) adapters, ready to use
- Multiple wallets connected simultaneously — switch the active one without disconnecting the others
- Hardware wallets with real multi-account support (derivation-path based) via `listAccounts()`/`selectAccount()`
- Richer-than-boolean reachability (`'available' | 'locked' | 'not-installed' | 'unavailable'`)
- Typed `NetworkMismatchError` with an optional auto-retry mode that polls until the user switches networks
- Cross-tab session sync via `BroadcastChannel` — connect in one tab, every other tab reflects it

**Signing & transaction UX**
- Human-readable transaction previews — every operation decoded, not just a summary
- Risk flags: account-merge and signer-changes are always flagged; large-transfer and unverified-contract checks are opt-in and app-configurable
- Soroban call preview backed by real simulation — see "this would fail" before signing anything
- Signature-request queueing — concurrent sign calls resolve in order instead of racing the wallet

**Soroban**
- One `invoke()` call covers build → simulate → prepare → sign → submit → poll
- Low-level escape hatches (`simulate`, `prepare`, `submit`, `pollStatus`) for anything `invoke()` doesn't cover

**Identity**
- Sign-In With Stellar (SIWS) — a self-issued, SEP-43-based message-signing flow analogous to Sign-In With Ethereum, with a server-side verifier package

**UI**
- `<saganta-appkit-modal>` — a Shadow DOM Web Component, framework-agnostic, zero runtime dependency
- Modal (desktop), bottom-sheet (mobile web), and inline (embedded, no overlay) presentation, auto-selected by viewport or forced via attribute
- Every color/radius/font is a themeable CSS custom property that crosses the shadow boundary — restyle from your own stylesheet, no JS API needed
- Account switcher, account picker (multi-account wallets), network-mismatch view, and transaction-preview view all built in

---

## Packages

| Package | What it is |
|---|---|
| [`@saganta/stellar-appkit`](./packages/core) | Core: connectors, the unified `StellarAppKit` client, `SorobanConnection`, transaction decoding/risk flags, SIWS. Framework- and DOM-agnostic. |
| [`@saganta/stellar-appkit-ui-web`](./packages/ui-web) | The themeable `<saganta-appkit-modal>` Web Component. |
| [`@saganta/stellar-appkit-siws-verify`](./packages/siws-verify) | Server-side SIWS signature/envelope verification. |

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for the full design rationale, positioning against prior art, and the phased build roadmap.

---

## Installation

```bash
npm install @saganta/stellar-appkit @saganta/stellar-appkit-ui-web
```

Wallet SDKs are peer dependencies — install the ones for the connectors you actually use:

```bash
npm install @stellar/stellar-sdk              # always — the base Stellar/Soroban SDK
npm install @stellar/freighter-api            # if using createFreighterConnector
npm install @albedo-link/intent               # if using createAlbedoConnector
npm install @ledgerhq/hw-app-str \
            @ledgerhq/hw-transport-webhid \
            @ledgerhq/hw-transport-webusb     # if using createLedgerConnector
```

xBull has no npm package — it injects `window.xBullSDK` directly, so `createXBullConnector` needs no install.

---

## Quick start

```ts
import {
  StellarAppKit,
  createFreighterConnector,
  createAlbedoConnector,
  createXBullConnector,
} from '@saganta/stellar-appkit';
import '@saganta/stellar-appkit-ui-web'; // registers <saganta-appkit-modal>

const appkit = new StellarAppKit({
  network: 'PUBLIC',
  connectors: [createFreighterConnector(), createAlbedoConnector(), createXBullConnector()],
  appMetadata: { name: 'My App', domain: 'app.example.com', uri: 'https://app.example.com' },
});

const modal = document.querySelector('saganta-appkit-modal');
modal.client = appkit; // wires up the UI — preview, account switcher, everything

document.getElementById('connect-button').addEventListener('click', () => modal.open());

await appkit.restore(); // resume a persisted session on page load, if any
```

```html
<saganta-appkit-modal mode="auto" theme="dark" title="Connect a wallet"></saganta-appkit-modal>
```

That's a working wallet connect flow. Everything past here is what you reach for as you need it.

---

## Wallets supported

| Wallet | Adapter | Status |
|---|---|---|
| Freighter | `createFreighterConnector()` | Ready — extension + mobile |
| Albedo | `createAlbedoConnector()` | Ready — no install required (popup-based) |
| xBull | `createXBullConnector()` | Ready — extension + PWA |
| Ledger | `createLedgerConnector()` | Ready for pubkey + plain tx signing; Soroban auth-entry signing is stubbed (see [Known limitations](#known-limitations)) |
| WalletConnect (Lobstr, Hana, Hot Wallet, mobile) | `createWalletConnectConnector()` | **Not yet implemented** — the adapter shape exists but every method throws; see the roadmap |

---

## Core concepts

### Multiple wallets, switching, and account picking

Connecting a second wallet doesn't replace the first — both stay connected.

```ts
await appkit.connect('freighter');
await appkit.connect('ledger'); // both connected now; Ledger is active

appkit.sessions;                       // every connected session
appkit.session;                        // the active one
await appkit.switchAccount('freighter'); // back to Freighter, Ledger stays connected

// Ledger exposes more than one derivable account:
const accounts = await appkit.registry.getOrThrow('ledger').listAccounts();
await appkit.switchAccount('ledger', accounts[2].address);
```

### Reachability and network handling

```ts
await appkit.getWalletReachability('freighter');
// 'available' | 'locked' | 'not-installed' | 'unavailable'

import { NetworkMismatchError } from '@saganta/stellar-appkit';
try {
  await appkit.connect('freighter');
} catch (err) {
  if (err instanceof NetworkMismatchError) {
    console.log(`Wallet is on ${err.actualNetwork}, app needs ${err.expectedNetwork}`);
  }
}
// Or resolve it automatically — polls until the user switches, instead of failing immediately:
await appkit.connect('freighter', { autoRetryNetworkMismatch: true });
```

Sessions persist across browser tabs automatically via `BroadcastChannel` where available — connecting or disconnecting in one tab reflects in every other open tab of the same origin. Disable with `syncAcrossTabs: false` in the config.

### Signing, transaction preview, and risk flags

Every `signTransaction()` call is decoded and shown to the user *before* the wallet's own signature prompt — this is the actual point of departure from "pass raw XDR to a popup." Attaching `<saganta-appkit-modal>` wires this up automatically.

```ts
const appkit = new StellarAppKit({
  network: 'PUBLIC',
  connectors: [createFreighterConnector()],
  previewOptions: {
    verifiedContracts: new Set(['CA...KNOWN_CONTRACT']), // omit to skip the unverified-contract check
    largeTransferThreshold: 1000,                        // in the asset's own units; omit to skip
  },
});

// Without a UI package, supply your own handler — a CLI prompt, a log line, whatever fits:
appkit.onPreviewTransaction = async (preview) => {
  console.log(preview.operations.map((op) => op.summary));
  console.log(preview.riskFlags); // account-merge and signer-change are always flagged, regardless of config
  return userConfirmedSomehow();
};

await appkit.signTransaction(xdr);                      // decoded, previewed, then sent to the wallet
await appkit.signTransaction(xdr, { skipPreview: true }); // bypass for a flow already confirmed elsewhere
```

Concurrent `signTransaction`/`signAuthEntry`/`signMessage` calls are queued and resolved in order rather than racing the wallet extension. `appkit.pendingSignCount` and the `signQueueChange` event expose queue depth.

### Soroban

```ts
import { SorobanConnection } from '@saganta/stellar-appkit';

const soroban = new SorobanConnection({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
  wallet: appkit,
});

// See what a call would do — and whether it would even succeed — before signing:
const preview = await soroban.previewInvoke({ contractId, method: 'transfer', args });
console.log(preview.simulationStatus, preview.operations[0].summary);

// Build, simulate, prepare, sign (previewed automatically), submit, and poll — one call:
const result = await soroban.invoke({ contractId, method: 'transfer', args });
```

### Sign-In With Stellar

```ts
const { message, signedMessage, signerAddress } = await appkit.signIn({
  statement: 'Sign in to My App',
  nonce: await fetch('/api/siws/nonce').then((r) => r.text()),
});
// POST { message, signedMessage, signerAddress } to your backend
```

```ts
// server side
import { verifySiws } from '@saganta/stellar-appkit-siws-verify';

const result = await verifySiws(payload, { expectedDomain: 'app.example.com', expectedNonce });
if (result.ok) { /* result.claims.address is verified */ }
```

### Theming

```html
<saganta-appkit-modal mode="auto" theme="dark" title="Connect a wallet"></saganta-appkit-modal>
<style>
  /* Overrides any token from the host page's own stylesheet — crosses the shadow boundary, no JS needed. */
  saganta-appkit-modal { --sak-color-accent: #d4537e; }
</style>
```

Every token (`--sak-color-bg`, `--sak-color-surface`, `--sak-color-accent`, `--sak-radius-*`, `--sak-font-*`, ...) has a sensible default and is fully overridable. `theme="light" | "dark" | "auto"` switches the base palette; individual tokens layer on top.

### The `<saganta-appkit-modal>` element

| Attribute | Values | Default |
|---|---|---|
| `mode` | `auto` \| `modal` \| `bottom-sheet` \| `inline` | `auto` (viewport-based) |
| `theme` | `dark` \| `light` \| `auto` | `dark` |
| `branding` | `show` \| `hide` | `show` |
| `logo-src` | image URL | — (falls back to `<slot name="logo">`) |
| `title` | string | contextual per view |
| `auto-retry-network` | `true` \| `false` | `false` |

| Method | |
|---|---|
| `.client = appkit` | Required — attaches a `StellarAppKit` instance and wires up preview/events |
| `.open()` | Opens the modal/bottom-sheet (no-op in `inline` mode) |
| `.close()` | Closes it |

Fires standard `CustomEvent`s (`sc-connect`, `sc-disconnect`, `sc-error`) mirroring the client's own events, so code with only a DOM reference to the element doesn't need the client instance to react to state changes.

---

## Demo

`examples/web-demo.html` loads the built packages directly as native ES modules — no bundler, no framework required to try it.

```bash
npm install && npm run build
npx serve .   # or: python3 -m http.server
# open http://localhost:<port>/examples/web-demo.html
```

It exercises a real `StellarAppKit` client (Freighter/Albedo/xBull/Ledger), live theme and presentation-mode switching, a second instance re-themed purely from the page's own CSS, an inline embed, a working SIWS flow, and a live transaction-preview flow (builds a real unsigned payment and calls `signTransaction()`).

---

## Project layout

```
packages/
  core/                  # @saganta/stellar-appkit
    src/
      types.ts            # WalletConnector interface, error model, events
      client.ts            # StellarAppKit — the client apps talk to
      connectors/            # freighter.ts, albedo.ts, xbull.ts, ledger.ts, walletconnect.ts, registry.ts
      soroban.ts               # SorobanConnection — invoke pipeline
      decode.ts                  # transaction decoding + risk flags
      siws.ts                      # Sign-In With Stellar client
      tab-sync.ts                    # BroadcastChannel cross-tab sync
      storage.ts, events.ts            # session persistence, typed event emitter
  ui-web/                # @saganta/stellar-appkit-ui-web
    src/
      connect-modal.ts    # the <saganta-appkit-modal> custom element
      tokens.ts, styles.ts  # design tokens and the generated stylesheet
      icons.ts, a11y.ts       # inline SVG icons, focus trap
  siws-verify/           # @saganta/stellar-appkit-siws-verify
    src/index.ts          # server-side SIWS verification
examples/
  web-demo.html          # no-bundler live demo
ARCHITECTURE.md          # design rationale, positioning, phased roadmap
```

---

## Setup (contributing to this repo)

```bash
npm install
npm run build       # builds every package
npm run typecheck   # typechecks every package
```

---

## Known limitations

Flagged explicitly rather than silently half-working:

- **WalletConnect adapter isn't implemented** — the shape exists (`createWalletConnectConnector`), every method throws with a pointer to what's needed. Blocks Lobstr, Hana, Hot Wallet, and mobile deep-linking.
- **Ledger Soroban auth-entry signing is stubbed** — reconstructing a valid `SorobanAuthorizationEntry` from a raw device signature needs a specific ScVal credentials structure that wasn't guessed at rather than risk shipping something that produces invalid auth entries. Plain transaction signing and public-key/multi-account derivation both work.
- **Ledger's `signTransaction` payload shape** is implemented against the most standard pattern but isn't 100% confirmed from published docs alone — worth checking against your installed `@ledgerhq/hw-app-str` version before production use.
- **"Locked" reachability isn't detected for Freighter or xBull** — neither SDK exposes a distinct unlock-state check, so both report `'available'` once installed, even if locked.
- **Soroban balance-delta preview is argument-based, not simulation-based** — recognized SEP-41 calls decode the intended amount directly from call arguments; the preview does not diff Soroban RPC simulation state changes, since that response shape isn't stable enough across protocol versions to rely on.
- **`signAuthEntry()` doesn't go through the preview flow** — only `signTransaction()` does today. A Soroban call made via `SorobanConnection.invoke()` is still covered (the outer transaction signature is previewed), but a standalone `signAuthEntry()` call bypasses it.
- **No React (or Vue/Svelte) wrapper yet** — `ui-web` is plain Web Components; a thin React wrapper is next on the roadmap, not yet built.
- **No React Native UI** — `core` is platform-agnostic already (inject a `ConnectStorage`), but there's no native bottom-sheet package yet.

---

## Roadmap

1. WalletConnect v2 relay adapter — Lobstr, Hana, Hot Wallet, mobile deep-linking
2. Thin React wrapper around `ui-web`
3. `ui-react-native` — bottom sheet, Expo compatibility
4. Ledger Soroban auth-entry signing
5. Smart-account/passkey signer as a native `WalletConnector` (Saganta's embedded wallet), gas-sponsorship hook in the Soroban invoke pipeline

Full detail in [ARCHITECTURE.md §9](./ARCHITECTURE.md#9-phased-roadmap).

---

## License

MIT
