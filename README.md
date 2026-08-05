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

Every connector is its own independently tree-shakeable module — pick one wallet or all of them, nothing you don't import ships in your bundle. Verified with a real code-splitting bundler config, not a naive single-file one: the initial chunk is 36.9kb with only Freighter imported and 43.3kb with Freighter, Albedo, and xBull all imported together — zero code for a wallet you don't import. The bigger weight (`@stellar/stellar-sdk`, ~1.4MB) is a separate chunk that only loads on the first actual sign or Soroban call, not part of that initial number.

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
- **Soroban balance-delta preview** — surfaces the actual balance changes (XLM, trustline assets) the network would apply, not just the intended amount decoded from call args
- **Auth-entry preview** — standalone `signAuthEntry()` calls are now decoded and risk-assessed before reaching the wallet, surfacing the contracts/functions being authorized
- Signature-request queueing — concurrent sign calls resolve in order instead of racing the wallet

**Identity**
- Sign-In With Stellar (SIWS) — a self-issued, SEP-43-based message-signing flow analogous to Sign-In With Ethereum, with a server-side verifier package
- **Unified `signedData` contract** — every connector surfaces the exact bytes the wallet signed, so SIWS verification works out of the box for Freighter, Albedo, xBull, and Ledger with no per-wallet custom verifier

**Soroban**
- One `invoke()` call covers build → simulate → prepare → sign → submit → poll
- Low-level escape hatches (`simulate`, `prepare`, `submit`, `pollStatus`) for anything `invoke()` doesn't cover

**UI**
- `<saganta-appkit-modal>` — a Shadow DOM Web Component, framework-agnostic, zero runtime dependency
- Modal (desktop), bottom-sheet (mobile web), and inline (embedded, no overlay) presentation, auto-selected by viewport or forced via attribute
- Every color/radius/font is a themeable CSS custom property that crosses the shadow boundary — restyle from your own stylesheet, no JS API needed
- Account switcher, account picker (multi-account wallets), network-mismatch view, and transaction-preview view all built in

---

## Packages

| Package | What it is |
|---|---|
| [`@saganta/stellar-appkit`](./packages/core) | Unified Stellar wallet connections, Soroban, and transaction preview — the core SDK. Includes the themeable `<saganta-appkit-modal>` Web Component at the `/ui-web` subpath — separate entry point, so importing only the core client never pulls in UI code. |
| [`@saganta/stellar-appkit-siws-verify`](./packages/siws-verify) | Server-side SIWS signature/envelope verification. |

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for the full design rationale, positioning against prior art, and the phased build roadmap.

---

## Installation

```bash
npm install @saganta/stellar-appkit
```

Wallet SDKs are peer dependencies — install the ones for the connectors you actually use:

```bash
npm install @stellar/stellar-sdk              # always — the base Stellar/Soroban SDK
npm install @stellar/freighter-api            # if using createFreighterConnector
npm install @albedo-link/intent               # if using createAlbedoConnector
npm install @creit.tech/xbull-wallet-connect  # if using createXBullConnector
npm install @ledgerhq/hw-app-str \
            @ledgerhq/hw-transport-webhid \
            @ledgerhq/hw-transport-webusb     # if using createLedgerConnector
```

### Installing the dev version directly from git

For testing an in-development version before it's published to npm, install directly from the GitHub repo. There are three patterns depending on what you're doing — **Pattern 3 is the recommended one** for active development, because monorepo workspace packages don't always install cleanly via direct git URLs.

**Pattern 1 — Install a specific commit (most reproducible):**

```bash
npm install SagantaHQ/stellar-appkit#<commit-sha> --save
```

This clones the repo at that commit, runs `npm install` for its own dependencies, and (if the install succeeds) runs the per-package `prepare` script to build `dist/`. If you hit "Cannot find module './dist/index.js'", the build didn't run — fall back to Pattern 3.

**Pattern 2 — Install from a branch (follows latest work):**

```bash
npm install SagantaHQ/stellar-appkit#main --save
```

Same as above but tracks `main`. Each `npm update @saganta/stellar-appkit` will pull the latest commit and rebuild. Useful for staying current, but your `package-lock.json` will point at whatever commit was current when you last ran install — commit it to lock a specific state.

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

For `@saganta/stellar-appkit-siws-verify`, repeat from `packages/siws-verify` instead. The siws-verify package depends on `@saganta/stellar-appkit` — linking both packages locally (or linking siws-verify and letting it find core via the workspace) works; trying to install siws-verify from a direct git URL alone will fail because the workspace dependency on core won't be set up.

**Troubleshooting git installs:**

- **"Cannot find module './dist/index.js'"** — the `prepare` script didn't run, so `dist/` wasn't built. This happens with `npm install` from git in some npm versions when the host has no build tooling, or when the install runs as root with `--unsafe-perm` off. Fix: clone the repo manually, run `bun install && bun run build` inside, then `npm link` as in Pattern 3.
- **"Cannot find module '@stellar/freighter-api'"** — the wallet SDK peer dependencies aren't auto-installed. Install them in your consumer app as listed above.
- **TypeScript types not picked up** — make sure your consumer app's `tsconfig.json` has `"moduleResolution": "Bundler"` or `"Node16"`/`"NodeNext"` (the package uses subpath exports that older resolutions don't follow).
- **`@saganta/stellar-appkit-siws-verify` fails to resolve `@saganta/stellar-appkit`** — the siws-verify package depends on core, but a direct git install doesn't set up the workspace symlink between them. Use Pattern 3 (local link) for siws-verify, or wait for the next npm publish.

---

## Quick start

```ts
import {
  StellarAppKit,
  createFreighterConnector,
  createAlbedoConnector,
  createXBullConnector,
} from '@saganta/stellar-appkit';
import '@saganta/stellar-appkit/ui-web'; // registers <saganta-appkit-modal>

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

Every `signTransaction()` call is decoded and shown to the user *before* the wallet's own signature prompt — this is the actual point of departure from "pass raw XDR to a popup." Every `signAuthEntry()` call gets the same treatment, decoding the auth tree to surface the contracts/functions being authorized. Attaching `<saganta-appkit-modal>` wires both up automatically.

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
import { SorobanConnection } from '@saganta/stellar-appkit';

const soroban = new SorobanConnection({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
  wallet: appkit,
});

// See what a call would do, whether it would even succeed, and how balances
// would change — all before signing:
const preview = await soroban.previewInvoke({ contractId, method: 'transfer', args });
console.log(preview.simulationStatus, preview.operations[0].summary);
console.log(preview.balanceDeltas);
// e.g. [{ kind: 'account', asset: 'XLM', delta: '-1000000000',
//         summary: 'XLM balance GA...: 1000 → 900 (-100)' }]

// Build, simulate, prepare, sign (previewed automatically), submit, and poll — one call:
const result = await soroban.invoke({ contractId, method: 'transfer', args });
```

### Sign-In With Stellar

```ts
const { message, signedMessage, signerAddress, signedData } = await appkit.signIn({
  statement: 'Sign in to My App',
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
      ui-web/                            # @saganta/stellar-appkit/ui-web — separate subpath export, not bundled into the main entry
        connect-modal.ts                   # the <saganta-appkit-modal> custom element
        tokens.ts, styles.ts                 # design tokens and the generated stylesheet
        icons.ts, a11y.ts                      # inline SVG icons, focus trap
  siws-verify/           # @saganta/stellar-appkit-siws-verify
    src/index.ts          # server-side SIWS verification
examples/
  web-demo.html          # no-bundler live demo
ARCHITECTURE.md          # design rationale, positioning, phased roadmap
```

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

Each package's `package.json` has an explicit `"files": ["dist", "src"]` and a `"prepare": "tsc -p tsconfig.json"` script. This matters more than it looks: `dist/` is (correctly) gitignored, but with no `.npmignore` or `files` override, `npm publish` falls back to `.gitignore` rules too — which silently excluded `dist/` from every published tarball, shipping packages whose `main`/`types` fields pointed at files that didn't exist. The `prepare` script also runs on `npm install` from a git URL, so direct-from-git installs build `dist/` automatically (see "Installing the dev version directly from git" above). Verify with `npm pack --dry-run` inside a package directory before publishing; it should list `dist/*` files, not just `src/*.ts`.

The workspace-internal dependency (`siws-verify` depends on `@saganta/stellar-appkit`) is pinned to `^0.1.0`, not a bare `*` — a real version range on a real published package, not just something that happens to resolve inside this monorepo via workspace linking. This monorepo publishes exactly two packages — `npm publish --workspaces` from the root handles both in one command (it automatically skips the root itself, since that's `"private": true`).

---

## Known limitations

Flagged explicitly rather than silently half-working:

- **WalletConnect adapter isn't implemented** — the shape exists (`createWalletConnectConnector`), every method throws with a pointer to what's needed. Blocks Lobstr, Hana, Hot Wallet, and mobile deep-linking.
- **Ledger Soroban auth-entry signing is stubbed** — reconstructing a valid `SorobanAuthorizationEntry` from a raw device signature needs a specific ScVal credentials structure that wasn't guessed at rather than risk shipping something that produces invalid auth entries. Plain transaction signing and public-key/multi-account derivation both work. (Standalone `signAuthEntry()` from app-supplied XDR works end-to-end with preview — only the *production* of signed auth entries inside `SorobanConnection.invoke()` is stubbed.)
- **Ledger's `signTransaction` payload shape** is implemented against the most standard pattern but isn't 100% confirmed from published docs alone — worth checking against your installed `@ledgerhq/hw-app-str` version before production use.
- **"Locked" reachability isn't detected for Freighter or xBull** — neither SDK exposes a distinct unlock-state check, so both report `'available'` once installed, even if locked.
- **xBull doesn't support Soroban auth-entry signing** — the underlying message protocol has an internal concept for it (`xdrType: 'Transaction' | 'AuthEntry'`), but the public `sign()` method doesn't expose a way to select it, so there's no reliable way to request it through the published SDK today.
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

GPL-3.0-or-later — see [LICENSE](./LICENSE). (Earlier drafts of this README said MIT; that was wrong, not a deliberate relicensing — the committed `LICENSE` file has always been GPLv3. Worth a deliberate decision if an SDK meant to be embedded in other people's apps is what you actually want under copyleft terms, since that has real implications for anyone adopting it.)
