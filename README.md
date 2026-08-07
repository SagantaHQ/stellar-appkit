# Stellar AppKit

**A Web3Modal / Reown AppKit equivalent for Stellar** — one unified wallet API, a first-class Soroban layer, real transaction previews instead of raw XDR, and a themeable UI that works identically dropped into any site.

Built by [Saganta](https://github.com/saganta) as the wallet-connection layer of its Stellar/Soroban developer infrastructure (embedded wallets, gas sponsorship, smart accounts, payment APIs).

---

## Why this exists

Stellar already has solid wallet-connection plumbing — [SEP-43](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0043.md) is an emerging standard interface several wallets are converging on, and [`@creit-tech/stellar-wallets-kit`](https://github.com/Creit-Tech/Stellar-Wallets-Kit) is a mature, headless connector library covering most of the ecosystem. Neither ships what this does:

- A **polished, themeable, cross-platform UI** (modal / bottom-sheet / inline) — the existing connector libraries are deliberately headless, so "sleek out of the box" is a gap, not a solved problem.
- A **transaction preview** that decodes operations into plain language and flags risk *before* the wallet's own signature prompt — every wallet-connect kit passes raw XDR straight through today.
- A **first-class Soroban layer** — simulate → prepare → sign → submit as one call, with typed contract clients, instead of hand-rolling `rpc.Server` calls per app.
- **Network-mismatch recovery** that goes further than "fail with a generic error" — typed `NetworkMismatchError` with `expectedNetwork` / `actualNetwork`, plus an optional auto-retry mode that polls until the user switches networks. Hardware wallet support included (Ledger via WebHID/WebUSB, with multi-account derivation-path based account picking).

Every connector is its own independently tree-shakeable module — pick one wallet or all of them, nothing you don't import ships in your bundle. The initial chunk is approximately 40kb with only Freighter imported (numbers may have shifted with the addition of typed contract clients and RPC failover — re-verify with your bundler's analyzer). Framework wrappers (`/react`, `/vue`, `/solid`, `/svelte`) are separate subpath exports — a React app never ships Vue or Svelte code. The bigger weight (`@stellar/stellar-sdk`, ~1.4MB) is a separate chunk that only loads on the first actual sign or Soroban call, not part of that initial number.

---

## Features

**Wallet connectivity**
- Unified adapter interface aligned with SEP-43, so new wallets are one file, not a redesign
- Freighter, Albedo, xBull, and Ledger (WebHID/WebUSB) adapters, ready to use
- **Zero-config defaults** — omit `connectors` from the `StellarAppKit` config and all four browser-side wallets (Freighter, Albedo, xBull, Ledger) are auto-registered. WalletConnect is excluded from defaults because it requires a `projectId`.
- **`Networks` object exported from core** — `import { Networks } from '@saganta/stellar-appkit'` gives you `Networks.PUBLIC`, `Networks.TESTNET`, `Networks.FUTURENET`, `Networks.STANDALONE` without needing `@stellar/stellar-sdk`
- Hardware wallets with real multi-account support (derivation-path based) via `listAccounts()`/`selectAccount()`
- Richer-than-boolean reachability (`'available' | 'locked' | 'not-installed' | 'unavailable'`)
- Typed `NetworkMismatchError` with an optional auto-retry mode that polls until the user switches networks
- Cross-tab session sync via `BroadcastChannel` — connect in one tab, every other tab reflects it
- Multi-session client API (`sessions`, `switchAccount`) for apps that build their own wallet management UI — the built-in modal is single-wallet

**Signing & transaction UX**
- Human-readable transaction previews — every operation decoded, not just a summary
- Risk flags: account-merge and signer-changes are always flagged; large-transfer and unverified-contract checks are opt-in and app-configurable
- Soroban call preview backed by real simulation — see "this would fail" before signing anything
- **Soroban balance-delta preview** — surfaces the actual balance changes (XLM, trustline assets) the network would apply, not just the intended amount decoded from call args
- **Auth-entry preview** — standalone `signAuthEntry()` calls are now decoded and risk-assessed before reaching the wallet, surfacing the contracts/functions being authorized
- Signature-request queueing — concurrent sign calls resolve in order instead of racing the wallet

**Identity**
- Sign-In With Stellar (SIWS) — a self-issued, SEP-43-based message-signing flow analogous to Sign-In With Ethereum, with a server-side verifier package
- **Unified `signedData` contract** — every connector surfaces the exact bytes the wallet signed, so SIWS verification works out of the box for Freighter, Albedo, xBull, and Ledger with no per-wallet custom verifier

**Soroban**
- One `invoke()` call covers build → simulate → prepare → sign → submit → poll
- **Typed contract client** — `soroban.contract<T>('C...', { specEntries })` returns a typed client whose methods are derived from your TS interface, so `client.transfer({ from, to, amount })` is fully typed. No manual `xdr.ScVal` construction.
- **RPC failover** — pass `rpcUrls: [...]` instead of `rpcUrl: '...'` and the connection transparently fails over to the next provider on network/5xx errors, with 30s health cooldowns. Useful for production resilience against single-provider outages.
- **Contract verification badges** — `previewOptions.contractMetadata` lets your app surface "Verified", "Audited", "Published by X" badges on contracts in the preview UI, with audit URLs. Separate from `verifiedContracts` (risk flags) — badges are positive trust signals.
- **Pre-simulate fee estimation** — `previewInvoke()` and `estimateFee()` return a `FeeEstimate` with the base fee, Soroban resource fee, instruction count, and total in stroops + XLM — shown before the user signs, not just after.
- Low-level escape hatches (`simulate`, `prepare`, `submit`, `pollStatus`) for anything `invoke()` doesn't cover

**UI**
- `<stellar-appkit-modal>` — a Shadow DOM Web Component, framework-agnostic
- Modal (desktop), bottom-sheet (mobile web), and inline (embedded, no overlay) presentation, auto-selected by viewport or forced via attribute
- **WAAPI open/close animations** — zero-dependency transitions with sensible defaults (`scale-blur` for modal, `slide-up` for bottom-sheet), 7 presets (`none`, `fade`, `scale`, `scale-blur`, `slide-up`, `slide-left`, `implode`), `prefers-reduced-motion` support, and per-modal or per-app configurability
- **WalletConnect QR code rendered automatically** — when a WC connector is registered, the modal intercepts the pairing URI via `setOnUri()` and renders it as an inline SVG QR code using `better-qr` (zero network dependency, works offline). Includes a deep link button for mobile and a copy URI button. `onUri` is now optional — the modal handles everything.
- **Bottom-sheet drag-to-dismiss** — native Pointer Events + custom spring physics (no `@use-gesture`/`motion`), fades overlay in sync with the sheet, releases pointer on interactive elements so the close button always works
- **"Installed" badge** — wallet list clearly marks which wallets are ready to use vs. which need installation (with one-click install buttons for the latter)
- Every color/radius/font is a themeable CSS custom property that crosses the shadow boundary — restyle from your own stylesheet, no JS API needed
- Account switcher, account picker (multi-account wallets), network-mismatch view, and transaction-preview view all built in
- **Wallet-provided avatars** — connectors can implement `getAvatar()` to surface profile pictures; falls back to a deterministic gradient generated from the address. Opt-in Stellar Expert avatars via the `stellar-expert-avatars` attribute.
- **Copy-to-clipboard everywhere** — every address display (connected accounts, account picker, transaction preview source account) has a copy button with "copied!" feedback
- **Contract verification badges in preview** — Verified/Audited/Published-by badges (with audit URLs) rendered inline on contract call operations in the transaction preview
- **Smooth loading spinner** — the connecting-state spinner uses a perfect circular arc (border-radius: 50%), not a rounded-square border that wobbles when rotated

**Framework wrappers**
- React (`@saganta/stellar-appkit/react`) — `<StellarAppKitProvider>` + hooks (`useAppKit`, `useConnect`, `useSession`, `useSignTransaction`, `useSignMessage`, `useSignIn`, `useSoroban`, `usePreviewTransaction`, `usePreviewAuthEntry`) using `useSyncExternalStore` for tearing-safe reactivity under React 18 concurrent rendering. Also exports a `<StellarAppKitModal>` JSX component (with `forwardRef`) wrapping the underlying Web Component — typed props, event callbacks (`onConnect`/`onDisconnect`/`onError`), and an imperative handle (`open()`/`close()`/`element`).
- Vue (`@saganta/stellar-appkit/vue`) — `StellarAppKitPlugin` (for `app.use()`) or `provideStellarAppKit()` + Composition API composables with the same surface, using `shallowRef` + `shallowReadonly` to avoid deep reactivity overhead. Also exports a `<StellarAppKitModal>` SFC-style component (via `defineComponent`) with typed props and `@connect`/`@disconnect`/`@error` emits.
- Solid (`@saganta/stellar-appkit/solid`) — `<StellarAppKitProvider>` + hooks using `createSignal`/`createMemo`/`onCleanup` for fine-grained reactivity. Also exports a `<StellarAppKitModal>` component with typed props and a `ref` callback that yields the imperative handle.
- Svelte (`@saganta/stellar-appkit/svelte`) — `setStellarAppKitContext()` + store-based composables (`useSessionStore`, `useConnectStore`, ...) that work in both Svelte 4 and Svelte 5; short aliases (`useSession`, `useConnect`) are provided for Svelte 5 runes-style code. Also exports a `use:stellarmodal` Svelte action (the idiomatic way to wrap a Web Component in Svelte) plus `openModal(node)` / `closeModal(node)` / `isStellarAppKitModal(node)` helpers.
- Each wrapper is a separate subpath export — bundlers only pull in the framework code you actually import. A React app never pays for Vue/Svelte/Solid. The modal components deliberately do NOT import the Web Component class themselves (it would crash SSR); consumers `import '@saganta/stellar-appkit/ui-web'` once at app entry to register `<stellar-appkit-modal>`.

---

## Packages

| Package | What it is |
|---|---|
| [`@saganta/stellar-appkit`](./packages/core) | Core SDK — wallet connections, Soroban, transaction preview, SIWS client. Pure TypeScript, zero UI dependencies. Shared between Web and React Native. |
| [`@saganta/stellar-appkit-ui-web`](./packages/ui-web) | Web UI — `<stellar-appkit-modal>` Shadow DOM Web Component + framework wrappers (`/react`, `/vue`, `/solid`, `/svelte`). Zero-dependency spring physics for the draggable bottom-sheet. |
| [`@saganta/stellar-appkit-siws-verify`](./packages/siws-verify) | Server-side SIWS signature/envelope verification. |

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for the full design rationale, positioning against prior art, and the phased build roadmap. Full documentation is at **[stellar-appkit.saganta.com](https://stellar-appkit.saganta.com)**. Live demos are at **[demos.stellar-appkit.saganta.com](https://demos.stellar-appkit.saganta.com)**.

---

## Installation

```bash
# Core SDK (no UI)
npm install @saganta/stellar-appkit

# Web UI (modal + framework wrappers)
npm install @saganta/stellar-appkit-ui-web
```

The core package bundles all wallet SDKs and the Stellar SDK as regular dependencies. The UI package has zero runtime dependencies — the bottom-sheet spring physics is a custom 30-line engine built on native Pointer Events + requestAnimationFrame (no `@use-gesture/vanilla` or `motion` needed).

| What's bundled | Used by | Tree-shaken if |
|---|---|---|
| `@stellar/stellar-sdk` | Core (transaction building, Soroban RPC, contract spec) | Never — core needs it |
| `@stellar/freighter-api` | `createFreighterConnector()` | Freighter connector not imported |
| `@albedo-link/intent` | `createAlbedoConnector()` | Albedo connector not imported |
| `@creit.tech/xbull-wallet-connect` | `createXBullConnector()` | xBull connector not imported |
| `@ledgerhq/hw-app-str` + `hw-transport-webhid` + `hw-transport-webusb` | `createLedgerConnector()` | Ledger connector not imported |
| `@walletconnect/sign-client` | `createWalletConnectConnector()` | WalletConnect connector not imported |
| `@use-gesture/vanilla` + `motion` | `<stellar-appkit-modal>` bottom-sheet mode | Bottom-sheet mode not used |

### Framework peer dependencies

The only peer dependencies are the framework wrappers themselves — these are optional and only required if you use the corresponding subpath export (`/react`, `/vue`, `/solid`, `/svelte`). Install the one for your framework:

```bash
npm install react react-dom      # for @saganta/stellar-appkit-ui-web/react
npm install vue                  # for @saganta/stellar-appkit-ui-web/vue
npm install solid-js             # for @saganta/stellar-appkit-ui-web/solid
npm install svelte               # for @saganta/stellar-appkit-ui-web/svelte
```

Frameworks must remain as peer dependencies (not bundled) because your app already has its own framework instance — having two copies of React (for example) breaks hooks. The wallet SDKs and gesture libraries don't have this singleton constraint, so they're safe to bundle.

### Installing the dev version directly from git

For testing an in-development version before it's published to npm, install directly from the GitHub repo. **The recommended path is Pattern 3 (local link) for active development** — direct git URLs work for the core package but not for siws-verify (it depends on core via a workspace symlink that a direct git install doesn't set up).

**Pattern 1 — Install a specific commit of the core package:**

```bash
npm install sagantaHQ/stellar-appkit#<commit-sha> --save
```

This clones the repo at that commit and runs `npm install` for its dependencies. After install, you'll need to build `dist/` manually because npm's `prepare` script handling for workspace packages is unreliable:

```bash
# In your consumer app, find the cloned package and build it:
cd node_modules/@saganta/stellar-appkit
npm install   # if dependencies weren't installed (they should be, but occasionally aren't)
npx tsc -p tsconfig.json   # builds dist/
```

If this feels clunky, that's because it is — monorepo workspace packages aren't really designed for direct-from-git install. Use Pattern 3 instead.

**Pattern 2 — Install from a branch (follows latest work):**

```bash
npm install sagantaHQ/stellar-appkit#main --save
```

Same caveats as Pattern 1 — you'll still need to build `dist/` manually after install. Each `npm update @saganta/stellar-appkit` will pull the latest commit, but won't rebuild automatically.

**Pattern 3 — Local development with live reload (recommended while iterating):**

If you're modifying stellar-appkit and testing it in a separate consumer app, link the local checkout so changes rebuild and pick up instantly without reinstalling:

```bash
# In the stellar-appkit checkout:
cd stellar-appkit
bun install           # or npm install
bun run build         # produces dist/ in packages/core and packages/siws-verify

# Link the core package globally:
cd packages/core
npm link              # registers @saganta/stellar-appkit as a global symlink

# In your consumer app:
cd my-app
npm link @saganta/stellar-appkit
```

Now `my-app`'s `import { StellarAppKit } from '@saganta/stellar-appkit'` resolves to your local checkout. To rebuild after editing the source:

```bash
# In stellar-appkit/packages/core:
bun run build         # rebuilds dist/ — my-app picks up the change on next dev-server reload
```

For `@saganta/stellar-appkit-siws-verify`, repeat from `packages/siws-verify`:

```bash
cd stellar-appkit/packages/siws-verify
npm link              # registers @saganta/stellar-appkit-siws-verify globally

# In your consumer app:
cd my-app
npm link @saganta/stellar-appkit-siws-verify
```

The siws-verify package depends on `@saganta/stellar-appkit` — when both are linked locally, siws-verify will find core through the global symlink. (If only siws-verify is linked, it will fail to resolve core.)

**Troubleshooting git installs:**

- **"Cannot find module './dist/index.js'"** — `dist/` wasn't built. This is the expected state after a direct git install (Pattern 1 or 2) because npm's `prepare` script handling for workspace packages is unreliable. Fix: build it manually with `npx tsc -p tsconfig.json` inside the cloned package, or use Pattern 3 (local link) which makes the build step explicit.
- **"Cannot find module '@stellar/freighter-api'"** — this should not happen with `@saganta/stellar-appkit@0.2.0+` (wallet SDKs are now bundled as regular dependencies). If you're on an older version, either upgrade or install the SDK manually: `npm install @stellar/freighter-api`. If you're on 0.2.0+ and still see this, your `node_modules` is likely stale — run `rm -rf node_modules && npm install`.
- **TypeScript types not picked up** — make sure your consumer app's `tsconfig.json` has `"moduleResolution": "Bundler"` or `"Node16"`/`"NodeNext"` (the package uses subpath exports that older resolutions don't follow).
- **`@saganta/stellar-appkit-siws-verify` fails to resolve `@saganta/stellar-appkit`** — the siws-verify package depends on core, but a direct git install doesn't set up the workspace symlink between them. **siws-verify cannot be installed via direct git URL** — use Pattern 3 (local link) for it, or wait for the next npm publish.

---

## Quick start

```ts
import { StellarAppKit } from '@saganta/stellar-appkit';
import '@saganta/stellar-appkit-ui-web'; // registers <stellar-appkit-modal>

// connectors is optional — defaults to Freighter, Albedo, xBull, Ledger
// domain + uri are optional too — auto-derived from window.location in the browser
const appkit = new StellarAppKit({
  network: 'PUBLIC',
  appMetadata: { name: 'Example App' },
});

const modal = document.querySelector('stellar-appkit-modal');
modal.client = appkit; // wires up the UI — preview, account switcher, everything

document.getElementById('connect-button').addEventListener('click', () => modal.open());

await appkit.restore(); // resume a persisted session on page load, if any
```

```html
<stellar-appkit-modal mode="auto" theme="dark" title="Connect a wallet"></stellar-appkit-modal>
```

That's a working wallet connect flow. Everything past here is what you reach for as you need it.

**Zero-config defaults:**
- **`connectors`** — omit to auto-register Freighter, Albedo, xBull, and Ledger. Use `defaultConnectors()` to extend the set with WalletConnect.
- **`appMetadata.domain` and `appMetadata.uri`** — omit to auto-derive from `window.location` (`hostname` and `origin`). If you pass them explicitly, they're auto-formatted: `"https://example.com"` as domain → `"example.com"`; `"example.com"` as uri → `"https://example.com"`.
- **Modal animations** — `scale-blur` for desktop modal, `slide-up` for mobile bottom-sheet, out of the box. Override via the `animation` attribute or `modal.animation` config.

See [The `<stellar-appkit-modal>` element](#the-stellar-appkit-modal-element) for the full list of animation presets.

---

## Wallets supported

| Wallet | Adapter | Default? | Status |
|---|---|---|---|
| Freighter | `createFreighterConnector()` | Yes | Ready — extension + mobile |
| Albedo | `createAlbedoConnector()` | Yes | Ready — no install required (popup-based) |
| xBull | `createXBullConnector()` | Yes | Ready — extension + PWA |
| Ledger | `createLedgerConnector()` | Yes | Ready for pubkey + plain tx signing; Soroban auth-entry signing is stubbed (see [Known limitations](#known-limitations)) |
| WalletConnect (Hana, Lobstr, Hot Wallet, mobile) | `createWalletConnectConnector()` | No (needs `projectId`) | Ready — QR pairing + `stellar_signXDR` / `stellar_signMessage` via `@walletconnect/sign-client` (bundled dep) |

**Default connectors** — omit `connectors` from the config to auto-register Freighter, Albedo, xBull, and Ledger. Use `defaultConnectors()` to extend the default set with WalletConnect.

### Connecting WalletConnect-based wallets (Hana, Lobstr, Hot Wallet)

WalletConnect is not in the default set because it requires a `projectId` from [WalletConnect Cloud](https://cloud.walletconnect.com/). Add it explicitly:

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
    ...defaultConnectors(), // Freighter, Albedo, xBull, Ledger
    createWalletConnectConnector({
      projectId: 'your-wc-cloud-project-id',
      metadata: {
        name: 'My App',
        description: 'A Stellar dApp',
        url: 'https://app.example.com',
        icons: ['https://app.example.com/icon.png'],
      },
      networkPassphrase: Networks.TESTNET,
      // onUri is OPTIONAL — the modal renders the QR code automatically
      // using better-qr. Only set it if you're building your own UI
      // (no modal) and need to render the QR code yourself.
    }),
  ],
});
```

When using `<stellar-appkit-modal>`, the WC pairing URI is intercepted automatically via `setOnUri()` and rendered as an inline SVG QR code using [`better-qr`](https://www.npmjs.com/package/better-qr) — zero network dependency, works offline. The connecting view shows "Generating pairing code…" briefly, then replaces the spinner with the QR code + a deep link button + a copy URI button.

If you're **not** using the modal (building your own UI), set `onUri` to render the QR code yourself:
```ts
onUri: (uri) => {
  // Use any QR library: qrcode.react, qrcode, better-qr, etc.
  setQrUri(uri);
}
```

[Hana Wallet](https://hanawallet.io/) (SDF's wallet, formerly Stellar Term) connects via WalletConnect — it doesn't expose a SEP-43 browser-extension API. The user scans the QR code with the Hana mobile app, or the deep link opens the Hana browser extension. See the [WalletConnect docs](https://stellar-appkit.saganta.com/wallets/walletconnect/) and [Hana Wallet docs](https://stellar-appkit.saganta.com/wallets/hana/) for the full flow.

`@walletconnect/sign-client` and `better-qr` are bundled dependencies — no manual install needed. They're lazy-imported inside the connector's methods, so they're tree-shaken out of your bundle if you don't use the WalletConnect connector.

---

## Core concepts

### Account picking (hardware wallets) and the multi-session API

The underlying `StellarAppKit` client supports keeping multiple wallets connected at the API level — connecting a second wallet doesn't replace the first, and `switchAccount(walletId)` flips the active one without disconnecting. **Note:** the built-in `<stellar-appkit-modal>` UI is single-wallet — connecting a new wallet through the modal replaces the previous one in the UI, even though the underlying API keeps both sessions alive. The multi-session API is intended for apps that build their own wallet management UI on top of the client.

```ts
// Hardware wallet account picking (Ledger exposes multiple derivable accounts):
const accounts = await appkit.registry.getOrThrow('ledger').listAccounts();
await appkit.switchAccount('ledger', accounts[2].address);

// Advanced: multi-session API (for apps with custom wallet management UI):
await appkit.connect('freighter');
await appkit.connect('ledger'); // both connected at the API level; Ledger is active

appkit.sessions;                       // every connected session
appkit.session;                        // the active one
await appkit.switchAccount('freighter'); // back to Freighter, Ledger stays connected
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

Every `signTransaction()` call is decoded and shown to the user *before* the wallet's own signature prompt — this is the actual point of departure from "pass raw XDR to a popup." Every `signAuthEntry()` call gets the same treatment, decoding the auth tree to surface the contracts/functions being authorized. Attaching `<stellar-appkit-modal>` wires both up automatically.

```ts
const appkit = new StellarAppKit({
  network: 'PUBLIC',
  connectors: [createFreighterConnector()],
  previewOptions: {
    verifiedContracts: new Set(['CA...KNOWN_CONTRACT']), // omit to skip the unverified-contract check
    largeTransferThreshold: 1000,                        // in the asset's own units; omit to skip
  },
});

// Without a UI package, supply your own handlers — a CLI prompt, a log line, whatever fits:
appkit.onPreviewTransaction = async (preview) => {
  console.log(preview.operations.map((op) => op.summary));
  console.log(preview.riskFlags); // account-merge and signer-change are always flagged, regardless of config
  return userConfirmedSomehow();
};
appkit.onPreviewAuthEntry = async (preview) => {
  // Standalone auth-entry signing grants contracts permission to act on
  // the user's behalf — this preview surfaces which contracts and functions.
  console.log(preview.authorizedContracts, preview.authorizedFunctions);
  console.log(preview.riskFlags); // broad-auth-grant + unverified-contract
  return userConfirmedSomehow();
};

await appkit.signTransaction(xdr);                      // decoded, previewed, then sent to the wallet
await appkit.signTransaction(xdr, { skipPreview: true }); // bypass for a flow already confirmed elsewhere
await appkit.signAuthEntry(authEntryXdr);               // auth tree decoded, previewed, then sent to the wallet
```

Concurrent `signTransaction`/`signAuthEntry`/`signMessage` calls are queued and resolved in order rather than racing the wallet extension. `appkit.pendingSignCount` and the `signQueueChange` event expose queue depth.

### Soroban

```ts
import { SorobanConnection, defineContractSpec } from '@saganta/stellar-appkit';

// Single-provider config:
const soroban = new SorobanConnection({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
  wallet: appkit,
});

// OR — multi-provider failover config (recommended for production):
const soroban = new SorobanConnection({
  rpcUrls: [
    'https://soroban-testnet.stellar.org',
    'https://rpc-failover.example.com',
    'https://rpc-backup.example.com',
  ],
  failoverOptions: {
    unhealthyCooldownMs: 30_000,
    onFailover: ({ from, to, method, error }) => {
      console.warn(`RPC failover for ${method}():`, error);
    },
  },
  networkPassphrase: Networks.TESTNET,
  wallet: appkit,
});

// See what a call would do, whether it would even succeed, how balances
// would change, and what it will cost — all before signing:
const preview = await soroban.previewInvoke({ contractId, method: 'transfer', args });
console.log(preview.simulationStatus, preview.operations[0].summary);
console.log(preview.balanceDeltas);
// e.g. [{ kind: 'account', asset: 'XLM', delta: '-1000000000',
//         summary: 'XLM balance GA...: 1000 → 900 (-100)' }]
console.log(preview.feeEstimate);
// e.g. { baseFee: '100', totalBaseFee: '100', sorobanResourceFee: '50000',
//        sorobanInstructions: '12345', totalFee: '50100', totalFeeXlm: '0.00501 XLM' }

// Just the fee estimate for an existing transaction:
const fee = await soroban.estimateFee(unsignedXdr);
console.log(fee.totalFeeXlm);  // "0.00501 XLM"

// Build, simulate, prepare, sign (previewed automatically), submit, and poll — one call:
const result = await soroban.invoke({ contractId, method: 'transfer', args });
```

#### Typed contract client

For contracts with a known spec (generated by `stellar contract bindings typescript`), use the typed client instead of passing raw `xdr.ScVal` args:

```ts
import { defineContractSpec } from '@saganta/stellar-appkit';

interface TokenContract extends defineContractSpec<{
  transfer: (args: { from: string; to: string; amount: bigint }) => Promise<boolean>;
  balanceOf: (args: { id: string }) => Promise<bigint>;
  symbol: () => Promise<string>;
}> {}

// specEntries comes from `stellar contract bindings typescript --contract-id C... --output-dir ...`
const token = soroban.contract<TokenContract>('CBETT2CX...', {
  specEntries: ['AAA==', 'BBB==', ...],
});

// Fully typed — wrong arg names or types are caught at compile time:
await token.transfer({ from: 'G...', to: 'G...', amount: 100n });  // ✓
// await token.transfer({ from: 'G...', to: 'G...', amount: '100' });
//   ^^^ TS error: 'string' is not assignable to 'bigint'

// Read-only calls skip signing entirely:
const balance = await token.simulate('balanceOf', { id: 'G...' });  // bigint
```

#### Contract verification badges

Surface trust signals (verified, audited, published by) in your preview UI by configuring `contractMetadata`:

```ts
const appkit = new StellarAppKit({
  network: 'PUBLIC',
  connectors: [createFreighterConnector()],
  previewOptions: {
    contractMetadata: new Map([
      ['CBETT2CXOWNPF5JYWBYB4BHNC4TPQEVABBKDDFE46S63JYXPUQK656HH', {
        name: 'USDC Token',
        publisher: 'Centre Consortium',
        verified: true,
        audited: true,
        auditUrl: 'https://example.com/audits/usdc.pdf',
      } as ContractMetadata],
    ]),
    includeFeeEstimate: true,  // populates feeEstimate on previews
  },
});

// Now every preview that touches this contract surfaces:
//   preview.operations[0].contractBadges = [
//     { label: 'Verified', code: 'verified', severity: 'success', ... },
//     { label: 'Audited',  code: 'audited',  severity: 'success',
//       url: 'https://example.com/audits/usdc.pdf', ... },
//     { label: 'Centre Consortium', code: 'publisher', severity: 'info', ... },
//   ]
// And the summary reads "Call `transfer` on USDC Token" instead of "Call `transfer` on contract CBETT2CX...".
```

### Sign-In With Stellar

```ts
const { message, signedMessage, signerAddress, signedData } = await appkit.signIn({
  statement: 'Sign in to Example App',
  nonce: await fetch('/api/siws/nonce').then((r) => r.text()),
});
// POST { message, signedMessage, signerAddress, signedData } to your backend
// — signedData is what the verifier needs to handle wallets (Albedo, xBull)
// that sign something other than the raw message bytes.
```

```ts
// server side
import { verifySiws } from '@saganta/stellar-appkit-siws-verify';

const result = await verifySiws(
  { message, signedMessage, signerAddress, signedData },  // signedData is optional — falls back to utf8(message)
  { expectedDomain: 'app.example.com', expectedNonce }
);
if (result.ok) { /* result.claims.address is verified */ }
```

No per-wallet custom verifier is needed — `verifySiws` works out of the box for Freighter, Ledger, Albedo, and xBull. The `signedData` field is what makes Albedo (which signs a server-derived hash) and xBull (which signs a prefixed `fullMessage`) verifiable without app-side special-casing. If a third-party connector doesn't populate `signedData`, the verifier falls back to `utf8(message)` — correct for any direct signer (Freighter, Ledger, SEP-43) and fails loudly for transformative signers, rather than silently passing.

### Theming

```html
<stellar-appkit-modal mode="auto" theme="dark" title="Connect a wallet"></stellar-appkit-modal>
<style>
  /* Overrides any token from the host page's own stylesheet — crosses the shadow boundary, no JS needed. */
  stellar-appkit-modal { --sak-color-accent: #d4537e; }
</style>
```

Every token (`--sak-color-bg`, `--sak-color-surface`, `--sak-color-accent`, `--sak-radius-*`, `--sak-font-*`, ...) has a sensible default and is fully overridable. `theme="light" | "dark" | "auto"` switches the base palette; individual tokens layer on top.

### Framework wrappers

If you'd rather use hooks than the Web Component UI, install the wrapper for your framework. Each is a separate subpath export — bundlers only ship the framework code you actually import.

**React:**

```bash
npm install react react-dom @saganta/stellar-appkit
```

```tsx
import { StellarAppKitProvider, useConnect, useSession, useSignTransaction } from '@saganta/stellar-appkit/react';
import { createFreighterConnector } from '@saganta/stellar-appkit';

export function App() {
  return (
    <StellarAppKitProvider config={{
      network: 'TESTNET',
      connectors: [createFreighterConnector()],
      appMetadata: { name: 'Example App' },
    }}>
      <WalletPanel />
    </StellarAppKitProvider>
  );
}

function WalletPanel() {
  const { connect, isConnected, isConnecting } = useConnect();
  const session = useSession();
  const { sign, isSigning } = useSignTransaction();

  if (!isConnected) {
    return <button disabled={isConnecting} onClick={() => connect('freighter')}>
      {isConnecting ? 'Connecting...' : 'Connect Freighter'}
    </button>;
  }
  return <p>Connected as {session?.address}</p>;
}
```

**Vue 3 (Composition API):**

```bash
npm install vue @saganta/stellar-appkit
```

```vue
<script setup lang="ts">
import { StellarAppKitPlugin, useConnect, useSession } from '@saganta/stellar-appkit/vue';
import { createFreighterConnector } from '@saganta/stellar-appkit';
import { createApp } from 'vue';

const app = createApp(App);
app.use(StellarAppKitPlugin, {
  network: 'TESTNET',
  connectors: [createFreighterConnector()],
  appMetadata: { name: 'Example App' },
});

// Or inside a component's setup():
import { provideStellarAppKit } from '@saganta/stellar-appkit/vue';
provideStellarAppKit({ network: 'TESTNET', connectors: [createFreighterConnector()] });

const { connect, isConnected, isConnecting } = useConnect();
const session = useSession();  // Readonly<Ref<ConnectSession | null>>
</script>

<template>
  <button v-if="!isConnected" :disabled="isConnecting" @click="connect('freighter')">
    {{ isConnecting ? 'Connecting...' : 'Connect Freighter' }}
  </button>
  <p v-else>Connected as {{ session?.address }}</p>
</template>
```

**Solid:**

```bash
npm install solid-js @saganta/stellar-appkit
```

```tsx
import { StellarAppKitProvider, useConnect, useSession } from '@saganta/stellar-appkit/solid';
import { createFreighterConnector } from '@saganta/stellar-appkit';
import type { JSX } from 'solid-js';

export function App(): JSX.Element {
  return (
    <StellarAppKitProvider config={{
      network: 'TESTNET',
      connectors: [createFreighterConnector()],
    }}>
      <WalletPanel />
    </StellarAppKitProvider>
  );
}

function WalletPanel(): JSX.Element {
  const { connect, isConnected, isConnecting } = useConnect();
  const session = useSession();
  return (
    <button disabled={isConnecting()} onClick={() => connect('freighter')}>
      {isConnecting() ? 'Connecting...' : 'Connect Freighter'}
    </button>
  );
}
```

**Svelte (4 or 5):**

```bash
npm install svelte @saganta/stellar-appkit
```

```svelte
<!-- +layout.svelte -->
<script lang="ts">
  import { setStellarAppKitContext, useConnect, useSession } from '@saganta/stellar-appkit/svelte';
  import { createFreighterConnector } from '@saganta/stellar-appkit';

  setStellarAppKitContext({
    network: 'TESTNET',
    connectors: [createFreighterConnector()],
    appMetadata: { name: 'Example App' },
  });

  const { connect, isConnected, isConnecting } = useConnect();
  const session = useSession();
</script>

<button disabled={$isConnecting} onClick={() => connect('freighter')}>
  {$isConnecting ? 'Connecting...' : 'Connect Freighter'}
</button>
{#if $isConnected}
  <p>Connected as {$session?.address}</p>
{/if}
```

All four wrappers share the same hook names (`useConnect`, `useSession`, `useSignTransaction`, `useSignMessage`, `useSignIn`, `useSoroban`, `usePreviewTransaction`, `usePreviewAuthEntry`) — only the reactivity primitives differ (React `useState`/`useSyncExternalStore`, Vue `ref`/`computed`, Solid `createSignal`/`createMemo`, Svelte stores). The full hook reference is in [ARCHITECTURE.md §11](./ARCHITECTURE.md#11-framework-wrappers).

#### Framework-native `<StellarAppKitModal>` components

In addition to the hooks, each wrapper ships a typed component wrapping the underlying `<stellar-appkit-modal>` Web Component. The component handles client assignment (from the same context as the hooks), prop-to-attribute forwarding, and event listening — so you don't have to manage refs and CustomEvents by hand.

**Important:** the framework modal components deliberately do NOT import the Web Component class themselves (the class `extends HTMLElement`, which is undefined in pure-Node SSR contexts — importing it at module top-level would crash server-side rendering). Consumers must `import '@saganta/stellar-appkit/ui-web'` once at their app entry point to register the `<stellar-appkit-modal>` custom element. This keeps the framework wrappers fully SSR-safe and lets bundlers tree-shake the Web Component code out of server bundles.

**React:**

```tsx
import { useRef } from 'react';
import { StellarAppKitProvider, StellarAppKitModal } from '@saganta/stellar-appkit/react';
import type { StellarAppKitModalHandle } from '@saganta/stellar-appkit/react';
import '@saganta/stellar-appkit/ui-web'; // registers <stellar-appkit-modal>

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
      <StellarAppKitModal ref={ref} mode="auto" theme="dark"
                          onConnect={(s) => console.log('connected', s)}
                          onError={(err) => console.error(err)} />
      <button onClick={() => ref.current?.open()}>Connect</button>
    </>
  );
}
```

**Vue:**

```vue
<script setup lang="ts">
  import { ref } from 'vue';
  import { provideStellarAppKit, StellarAppKitModal } from '@saganta/stellar-appkit/vue';
  import '@saganta/stellar-appkit/ui-web';
  provideStellarAppKit({ network: 'TESTNET', connectors: [...] });
  const modal = ref<InstanceType<typeof StellarAppKitModal>>();
</script>
<template>
  <StellarAppKitModal ref="modal" mode="auto" theme="dark"
                      @connect="(s) => console.log('connected', s)" />
  <button @click="modal?.open()">Connect</button>
</template>
```

**Solid:**

```tsx
import { StellarAppKitProvider, StellarAppKitModal } from '@saganta/stellar-appkit/solid';
import type { StellarAppKitModalHandle } from '@saganta/stellar-appkit/solid';
import '@saganta/stellar-appkit/ui-web';

function ModalHost() {
  let handle: StellarAppKitModalHandle | undefined;
  return (
    <>
      <StellarAppKitModal ref={(h) => (handle = h)} mode="auto" theme="dark" />
      <button onClick={() => handle?.open()}>Connect</button>
    </>
  );
}
```

**Svelte** — uses a `use:stellarmodal` action on the raw `<stellar-appkit-modal>` element, which is the most idiomatic pattern in Svelte for wrapping a Web Component:

```svelte
<script lang="ts">
  import { setStellarAppKitContext, stellarmodal, openModal } from '@saganta/stellar-appkit/svelte';
  import '@saganta/stellar-appkit/ui-web';
  setStellarAppKitContext({ network: 'TESTNET', connectors: [...] });
  let modalEl: HTMLElement;
</script>

<stellar-appkit-modal use:stellarmodal bind:this={modalEl} mode="auto" theme="dark"
                      on:sc-connect={(e) => console.log('connected', e.detail)} />
<button on:click={() => openModal(modalEl)}>Connect</button>
```

**Shared props** (all frameworks): `mode` (`'auto'|'modal'|'bottomsheet'|'inline'`), `theme` (`'dark'|'light'`), `branding` (`'default'|'minimal'|'hidden'`), `logoSrc` (URL), `title` (string), `autoRetryNetwork` (boolean), `stellarExpertAvatars` (boolean).

**Events** (all frameworks): `connect`, `disconnect`, `error` — mirroring the underlying client's events. React/Solid use `onConnect`/`onDisconnect`/`onError` callback props; Vue uses `@connect`/`@disconnect`/`@error` emits; Svelte uses `on:sc-connect`/`on:sc-disconnect`/`on:sc-error` on the raw element (since the action wraps the Web Component directly).

**Imperative handle** (React/Solid/Vue via `ref`): `open()` (no-op in inline mode), `close()`, and `element` (the underlying DOM node, escape hatch for advanced use). Svelte uses the `openModal(node)` / `closeModal(node)` helpers instead since the action pattern doesn't use refs.

### The `<stellar-appkit-modal>` element

| Attribute | Values | Default |
|---|---|---|
| `mode` | `auto` \| `modal` \| `bottom-sheet` \| `bottomsheet` \| `inline` | `auto` (viewport-based) |
| `theme` | `dark` \| `light` \| `auto` | `dark` |
| `branding` | `show` \| `hide` | `show` |
| `logo-src` | image URL | — (falls back to `<slot name="logo">`) |
| `title` | string | contextual per view |
| `auto-retry-network` | `true` \| `false` | `false` |
| `stellar-expert-avatars` | `true` \| `false` | `false` — when `true`, fetches generated avatars from `api.stellar.expert` for accounts that don't have a wallet-provided avatar. Falls back to a deterministic gradient on error. |
| `explorer-url` | base URL | `https://stellarchain.io` (mainnet) / `https://testnet.stellarchain.io` (testnet) |
| `animation` | `none` \| `fade` \| `scale` \| `scale-blur` \| `slide-up` \| `slide-left` \| `implode` | mode-based (see below) |
| `animation-open` | same as `animation` | inherits `animation`, else mode-based default |
| `animation-close` | same as `animation` | inherits `animation`, else mode-based default |

**Animation defaults** — when no `animation` / `animation-open` / `animation-close` attribute is set, the modal picks a sensible default based on `mode`:

- `mode="modal"` (or `auto` on desktop) → `scale-blur` (opacity 0→1, scale .92→1, blur 12px→0)
- `mode="bottomsheet"` (or `auto` on mobile) → `slide-up` (translateY 100%→0)
- `mode="inline"` → no animation (the panel is always rendered in place)

The close animation mirrors the open animation by default — closing a bottom-sheet slides it down rather than fading. The animation can also be configured programmatically via `StellarAppKit`'s config (`modal.animation`) — HTML attributes take priority, then the config, then the mode-based default.

Animation presets are zero-dependency WAAPI (Web Animations API) — no `motion`, no `gsap`, no extra bundle weight. `prefers-reduced-motion: reduce` is respected automatically (animations become no-ops). The bottom-sheet drag-to-dismiss gesture uses a separate custom spring engine (~30 lines, also zero-dependency) so dragging and WAAPI transitions don't conflict.

| Method | |
|---|---|
| `.client = appkit` | Required — attaches a `StellarAppKit` instance and wires up preview/events |
| `.open()` | Opens the modal/bottom-sheet (no-op in `inline` mode) |
| `.close(skipAnimation = false)` | Closes it. Pass `true` to skip the WAAPI exit animation (used internally by drag-to-dismiss). |

Fires standard `CustomEvent`s (`sc-connect`, `sc-disconnect`, `sc-error`) mirroring the client's own events, so code with only a DOM reference to the element doesn't need the client instance to react to state changes.

### Default connectors (zero-config)

`StellarAppKitConfig.connectors` is now **optional**. If you omit it (or pass an empty array), the SDK auto-registers every bundled browser-side wallet that doesn't require constructor-time configuration:

```ts
import { StellarAppKit } from '@saganta/stellar-appkit';
import '@saganta/stellar-appkit-ui-web';

// Zero-config — Freighter, Albedo, xBull, and Ledger are all registered automatically.
const appkit = new StellarAppKit({
  network: 'TESTNET',
  appMetadata: { name: 'Example App' },
});
```

The default set excludes **WalletConnect** because it requires a `projectId` from your WalletConnect Cloud dashboard — pass an explicit `connectors` list to include it:

```ts
import {
  StellarAppKit,
  createWalletConnectConnector,
  defaultConnectors,
} from '@saganta/stellar-appkit';

const appkit = new StellarAppKit({
  network: 'PUBLIC',
  connectors: [
    ...defaultConnectors(),
    createWalletConnectConnector({
      projectId: 'your-wc-project-id',
      networkPassphrase: Networks.PUBLIC,
    }),
  ],
});
```

`defaultConnectors()` is exported so you can extend rather than replace the default set.

### Wallet list — "Installed" badge

The wallet list now shows an **"Installed"** badge next to every wallet that's ready to use (reachability `available`). Wallets that aren't installed show an **"Install"** button instead. Locked or unavailable wallets still show their status text ("Locked", "Unavailable", "Connecting…"). This makes it instantly clear which wallets are usable vs. which need installation, without forcing the user to click each row.

---

## Demo

### Live demos

**[demos.stellar-appkit.saganta.com](https://demos.stellar-appkit.saganta.com)** — 14 working Next.js demos covering wallet connection, transaction signing, Soroban contract calls, SIWS authentication, and theming. Each demo is a real route you can copy into your own app. Built with Next.js 15 + OpenNext for Cloudflare.

### Local demo

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
      decode.ts                  # transaction decoding + risk flags + balance deltas
      siws.ts                      # Sign-In With Stellar client
      tab-sync.ts                    # BroadcastChannel cross-tab sync
      storage.ts, events.ts            # session persistence, typed event emitter
      ui-web/                            # @saganta/stellar-appkit/ui-web — separate subpath export, not bundled into the main entry
        connect-modal.ts                   # the <stellar-appkit-modal> custom element
        tokens.ts, styles.ts                 # design tokens and the generated stylesheet
        icons.ts, a11y.ts                      # inline SVG icons, focus trap
      react/                            # @saganta/stellar-appkit/react — provider + hooks
      vue/                              # @saganta/stellar-appkit/vue — plugin + composables
      solid/                            # @saganta/stellar-appkit/solid — provider + hooks
      svelte/                           # @saganta/stellar-appkit/svelte — context + stores
  siws-verify/           # @saganta/stellar-appkit-siws-verify
    src/index.ts          # server-side SIWS verification
examples/
  web-demo.html          # no-bundler live demo
ARCHITECTURE.md          # design rationale, positioning, phased roadmap
SKILL.md                 # AI skill file — trigger conditions + code patterns for AI agents
llms.txt                 # AI-readable API index (llmstxt.org convention)
```

Both `SKILL.md` and `llms.txt` ship at the repo root and inside the published npm tarball, so AI coding tools (Cursor, GitHub Copilot, Claude Code, Windsurf, Continue) can pick up the full API surface without you having to paste docs into chat. See [AI integration](#ai-integration) below.

---

## Setup (contributing to this repo)

```bash
bun install           # installs dependencies for every workspace package
bun run typecheck     # typechecks every package (core → build → siws-verify, in dependency order)
bun run build         # builds every package
bun test              # runs the full test suite (80 tests across 8 files, ~350ms)
```

CI (`.github/workflows/ci.yml`) runs the same typecheck → build → test pipeline on Linux and macOS on every push and pull request. A cross-platform check on macOS runs after the Linux job passes, to catch platform-specific path/encoding issues.

See [TESTING.md](./TESTING.md) for what each test file covers and how to add tests for a new wallet connector.

### Publishing

Each package's `package.json` has an explicit `"files": ["dist", "src"]`. This matters more than it looks: `dist/` is (correctly) gitignored, but with no `.npmignore` or `files` override, `npm publish` falls back to `.gitignore` rules too — which silently excluded `dist/` from every published tarball, shipping packages whose `main`/`types` fields pointed at files that didn't exist. Verify with `npm pack --dry-run` inside a package directory before publishing; it should list `dist/*` files, not just `src/*.ts`. (The published npm package includes `dist/`, so consumers installing from npm don't need to build — only consumers installing directly from a git URL do, see above.)

The workspace-internal dependency (`siws-verify` depends on `@saganta/stellar-appkit`) is pinned to `^0.2.0`, not a bare `*` — a real version range on a real published package, not just something that happens to resolve inside this monorepo via workspace linking. This monorepo publishes exactly two packages — `npm publish --workspaces` from the root handles both in one command (it automatically skips the root itself, since that's `"private": true`).

---

## AI integration

This repo ships two AI-readable files at the root, so AI coding assistants can write correct Stellar AppKit code on the first try without you having to paste half the docs into chat:

- **[`SKILL.md`](./SKILL.md)** — a structured AI skill file with YAML frontmatter (`name`, `description`, `license`) and a body covering trigger conditions, install commands, common code patterns (basic connection, signing, Soroban, typed contract client, SIWS, React hooks), API reference tables, the connectors table, the per-wallet SIWS signing table, theming, and links. Used by skill-aware agents (Claude Code with skills, custom agents).
- **[`llms.txt`](./llms.txt)** — a compact (~250-line) plain-text API index following the [llms.txt convention](https://llmstxt.org/). Sections: header, install, quick start, wallet connection, signing, Soroban, SIWS verification, framework wrappers, transaction preview, theming, error handling, tree-shaking, links. Read by any agent that reads repo files (Cursor, Continue, Copilot).

Both files are kept in sync with the API in the same commit that changes the API. The published npm tarball includes them, so once `@saganta/stellar-appkit` is in your `package.json`, agents can read `llms.txt` straight from `node_modules/@saganta/stellar-appkit/llms.txt`.

### How to load them

```bash
# From the raw GitHub URL (no install needed):
curl -O https://raw.githubusercontent.com/sagantaHQ/stellar-appkit/main/SKILL.md
curl -O https://raw.githubusercontent.com/sagantaHQ/stellar-appkit/main/llms.txt

# From node_modules (after npm install @saganta/stellar-appkit):
cat node_modules/@saganta/stellar-appkit/llms.txt
```

In Cursor: add `SKILL.md` to the project's always-included files, or use `@SKILL.md` in chat. In Claude Code: drop the file in your project and reference it in your prompt ("use the stellar-appkit skill to add a Freighter connect button"). For full docs context, point the agent at the docs site's own `llms-full.txt`:

```
https://stellar-appkit.saganta.com/llms.txt        # compact index of every docs page
https://stellar-appkit.saganta.com/llms-full.txt   # full docs content concatenated (~160 lines)
```

See the [AI Integration docs page](https://stellar-appkit.saganta.com/reference/ai-integration/) for the full agent workflow and per-tool setup notes.

---

## Known limitations

Flagged explicitly rather than silently half-working:

- **Ledger Soroban auth-entry signing is now implemented** — uses `@stellar/stellar-base`'s `authorizeEntry()` helper, which handles the `HashIdPreimage` construction, SHA-256 hashing, local signature verification, and `ScVal` wrapping. The Ledger connector's `signAuthEntry()` sends the raw preimage bytes to the device via `signSorobanAuthorization()`; the device hashes on-device and returns the signature. Works end-to-end inside `SorobanConnection.invoke()` — the invoke pipeline automatically detects auth entries that need signing and calls `signAuthEntry` before `signTransaction`.
- **Ledger's `signTransaction` payload shape** is implemented against the most standard pattern but isn't 100% confirmed from published docs alone — worth checking against your installed `@ledgerhq/hw-app-str` version before production use.
- **"Locked" reachability isn't detected for Freighter** — the freighter-api SDK doesn't expose a distinct unlock-state check, so it reports `'available'` once installed, even if locked. xBull's reachability now correctly reports `'not-installed'` when the extension isn't detected (previously always reported `'available'` due to the web-wallet fallback).
- **Freighter uses SEP-0053 message encoding** — Freighter signs `sha256("Stellar Signed Message:\n" + message)`, not the raw message bytes. The connector surfaces this hash as `signedData`, and the verifier tries it as the first candidate. Confirmed by reading the Freighter extension source (`extension/src/helpers/stellar.ts`). The verifier also includes `debug: true` mode that lists every candidate tried — use it to diagnose verification failures with other wallets.
- **xBull doesn't support Soroban auth-entry signing** — the underlying message protocol has an internal concept for it (`xdrType: 'Transaction' | 'AuthEntry'`), but the public `sign()` method doesn't expose a way to select it, so there's no reliable way to request it through the published SDK today.
- **No React Native UI** — `core` is platform-agnostic already (inject a `ConnectStorage`), but there's no native bottom-sheet package yet.

---

## Roadmap

1. `ui-react-native` — bottom sheet, Expo compatibility
2. Smart-account/passkey signer as a native `WalletConnector` (Saganta's embedded wallet), gas-sponsorship hook in the Soroban invoke pipeline

Full detail in [ARCHITECTURE.md §9](./ARCHITECTURE.md#9-phased-roadmap).

---

## License

MIT — see [LICENSE](./LICENSE). (Previously shipped under GPLv3; changed to MIT to match the SDK's intended use case of being embedded in other people's apps. GPLv3's copyleft would have required apps that embed this SDK to themselves be open-sourced, which is not the intent.)
