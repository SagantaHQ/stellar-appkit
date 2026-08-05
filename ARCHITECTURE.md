# Stellar AppKit — Architecture & Build Spec

**A cross-platform wallet-connection SDK for Stellar/Soroban.**
Web3Modal/Reown-AppKit-equivalent for Stellar, with a unified wallet API, a first-class Soroban layer, and a themeable UI that works identically across browser extensions, mobile web, and React Native.

---

## 0. Positioning — what already exists, and the actual gap

Before designing this, it's worth being precise about prior art so we build the 20% that's missing instead of re-solving a solved problem:

- **SEP-43 ("Standard Web Wallet API Interface")** is a draft Stellar standard that defines a common shape — `getAddress`, `signTransaction`, `signAuthEntry`, `signMessage`, `getNetwork` — with a shared error-code contract (`-1` internal, `-2` external service, `-3` invalid request, `-4` user rejected). Some wallets are converging on this natively; most aren't there yet, so real-world adapters still need per-wallet shims.
- **`@creit-tech/stellar-wallets-kit`** is a mature, MIT-licensed, headless connector library already covering xBull, Albedo, Freighter, Rabet, Lobstr, Hana, Hot Wallet, Klever, OneKey, Bitget, and WalletConnect. It deliberately ships **no UI** — "allowing developers handling the UI/UX in the way they want."
- **`@stellar/freighter-api`** is the official Freighter client, shaped close to SEP-43 already (`getAddress`, `requestAccess`, `signTransaction`, `getNetworkDetails`, `signMessage`).

**The gap isn't wallet connectivity — it's everything around it:** there is no Reown-AppKit-style product for Stellar that ships a polished, themeable, cross-platform (web *and* React Native) modal/bottom-sheet UI, a first-class Soroban contract-call layer, and a built-in Sign-In-With-Stellar flow, all behind one typed API. That's what Stellar AppKit is.

Two build strategies are viable for the connector layer itself:

| | Build our own adapters | Wrap stellar-wallets-kit |
|---|---|---|
| Speed to first release | Slower | Fast — connectivity is solved |
| Control over SEP-43 migration, error normalization, RN support | Full | Limited by their roadmap |
| Bundle size / dependency surface | Own choice | Inherit theirs |
| Risk | Re-discovering wallet-specific quirks | Coupling core infra to a third party |

**Recommendation:** build a thin, SEP-43-native core adapter layer ourselves (small surface area, ~5 methods, easy to keep current), with legacy shims for wallets not yet SEP-43-compliant. This keeps the differentiated layers (Soroban, UI, SIWS, theming, smart-account hooks) fully in our control, which matters given Saganta's roadmap (embedded wallets, gas sponsorship, smart accounts). The scaffold below follows that path; `stellar-wallets-kit` connectors can still be dropped in later as an escape hatch for long-tail wallets without blocking the core.

---

## 1. Monorepo layout

```
saganta-stellar-appkit/
├── packages/
│   ├── core/                 # framework-agnostic: adapters, unified API, Soroban, SIWS, state
│   │   └── src/ui-web/        # Web Components (Shadow DOM), modal/inline/bottom-sheet, themeable —
│   │                            published as the @saganta/stellar-appkit/ui-web subpath, not a
│   │                            separate package (see §8) — merging it eliminated a whole class of
│   │                            version-drift bug between two packages that were never used apart
│   ├── react/                 # React hooks + <ConnectProvider> (web) — not yet built
│   ├── react-native/          # RN hooks + <ConnectProvider> (Expo-compatible) — not yet built
│   ├── ui-react-native/         # RN bottom-sheet + modal + inline, themeable — not yet built
│   └── siws-verify/              # tiny server-side verifier for Sign-In With Stellar (Node/edge)
├── examples/
│   ├── next-app/
│   ├── vite-react/
│   └── expo-app/
└── ARCHITECTURE.md
```

`core` has zero DOM/RN dependency — it only needs a `Storage` and `crypto` shim injected per platform, which is what makes the same connection/session logic work identically in a browser tab and inside a React Native app.

---

## 2. Unified wallet interface

Every connector — native SEP-43 or shimmed — normalizes to one interface. This is intentionally the SEP-43 shape plus connection lifecycle and metadata, so we inherit the standard rather than inventing a competing one:

```ts
interface WalletConnector {
  readonly id: string;                 // 'freighter' | 'xbull' | 'albedo' | 'walletconnect' | ...
  readonly meta: WalletMeta;           // name, icon, deep-link scheme, install urls, platforms
  readonly capabilities: {
    signTransaction: boolean;
    signAuthEntry: boolean;             // needed for Soroban auth
    signMessage: boolean;               // needed for SIWS
    submit: boolean;
  };

  isAvailable(): Promise<boolean>;      // injected extension present / WC relay reachable
  connect(opts?: ConnectOptions): Promise<WalletAccount>;
  disconnect(): Promise<void>;

  getAddress(): Promise<{ address: string }>;
  getNetwork(): Promise<{ network: string; networkPassphrase: string }>;
  signTransaction(xdr: string, opts?: SignTxOptions): Promise<{ signedTxXdr: string; signerAddress: string }>;
  signAuthEntry(entryXdr: string, opts?: SignOptions): Promise<{ signedAuthEntry: string; signerAddress: string }>;
  signMessage(message: string, opts?: SignOptions): Promise<{ signedMessage: string; signerAddress: string }>;
}
```

Errors are normalized into a single `ConnectError` class carrying the SEP-43 `code` (`-1..-4`), a human `message`, and optional `ext[]` — so UI code never branches on wallet identity to decide how to render a failure.

**Adapters ship in v1** (mirroring the ecosystem's actual coverage): Freighter (extension + mobile), xBull (PWA + extension), Albedo (no-install, web-based signer), Rabet, Lobstr (via WalletConnect), Hana (via WalletConnect), Hot Wallet, and a generic WalletConnect v2/Reown relay adapter that covers any wallet supporting the Stellar WC namespace. Hardware (Ledger) is a Phase-2 adapter since it needs a different transport model (WebHID/WebUSB, no RN support yet).

---

## 3. Soroban abstraction

A second facade sits next to the wallet layer and owns everything RPC/contract-shaped, so app code never touches `SorobanRpc.Server` directly:

```ts
class SorobanConnection {
  constructor(opts: { rpcUrl: string; networkPassphrase: string; wallet: StellarAppKit });

  // Low-level, still typed
  simulate(tx: Transaction): Promise<SimulateResult>;
  prepare(tx: Transaction): Promise<Transaction>;             // simulate + apply footprint/resource fees
  submit(signedXdr: string): Promise<SubmitResult>;
  pollStatus(hash: string, opts?: PollOptions): Promise<TxStatus>;

  // High-level: the 90% case
  invoke(opts: {
    contractId: string;
    method: string;
    args: xdr.ScVal[];
    simulateOnly?: boolean;         // read-only calls skip signing entirely
  }): Promise<InvokeResult>;

  // Typed contract client generation from a WASM spec / Stellar CLI bindings,
  // so `contract.transfer({ to, amount })` is possible instead of manual ScVal building
  contract<T extends ContractSpec>(contractId: string, spec: T): TypedContractClient<T>;
}
```

`invoke()` runs the full pipeline — build, simulate, prepare (resource footprint + fees), request signature via the connected `WalletConnector` (using `signTransaction`, or `signAuthEntry` when the call needs delegated Soroban auth entries), submit, and poll to completion — surfacing one typed result or one normalized error. This is also the seam where Saganta's gas-sponsorship and smart-account signer can later be injected as an alternate `AuthProvider`, without changing the call site.

---

## 4. Cross-platform UI architecture

The hard requirement — identical behavior on web (extension + mobile browser) and React Native — means the **state machine has to live in `core`**, and each platform only supplies a renderer.

```
┌─────────────────────────────┐
│   core: ConnectStateMachine │   idle → selecting → connecting → connected → error
│   (framework-agnostic)      │   session persistence, network watch, event bus
└──────────────┬───────────────┘
       ┌────────┴────────┐
       │                 │
┌──────▼──────┐   ┌───────▼────────┐
│  ui-web      │   │ ui-react-native │
│  Web Comps    │   │ RN components   │
│  (Shadow DOM) │   │                 │
└──────────────┘   └────────────────┘
```

- **`ui-web`** ships as framework-agnostic Web Components rendered in a Shadow DOM (style isolation — this is what makes it safe to drop into *any* site without CSS collisions), plus a thin `react` package that wraps them as idiomatic components/hooks for React apps (which covers the large majority of Stellar dApps).
- **`ui-react-native`** ships real RN primitives (`View`/`Animated`/`Pressable`, `@gorhom/bottom-sheet` for the sheet), not a WebView wrapper — needed for 120fps gesture-driven sheets and to avoid RN WebView/extension-injection dead ends.
- Both renderers consume the exact same `core` state machine, so "list of wallets, connecting spinner, error copy, session restore" behavior is defined once.

**Presentation modes**, selectable per call site:

| Mode | Trigger | Behavior |
|---|---|---|
| `modal` | default on desktop web | Centered dialog, backdrop, focus-trapped |
| `bottom-sheet` | default on mobile web + always on RN | Swipe-to-dismiss sheet, snap points, safe-area aware |
| `inline` | explicit `mode: 'inline'` | Renders the wallet list/connect UI directly in the page flow — no overlay, for embedded checkout-style flows |

Viewport detection (not UA sniffing) picks `modal` vs `bottom-sheet` automatically on web; it's always overridable via prop/attribute.

---

## 5. Theming — CSS-variable-driven, logo-swappable

Every visual value is a design token, exposed as CSS custom properties on web and a `Theme` object on RN, so a host app can restyle the whole thing without forking it:

```css
saganta-appkit-modal {
  --sak-color-bg: #0B0D0E;
  --sak-color-surface: #14171A;
  --sak-color-border: rgba(255,255,255,0.08);
  --sak-color-text: #F5F6F7;
  --sak-color-text-muted: #9AA0A6;
  --sak-color-accent: #6EE7B7;
  --sak-radius-sm: 10px;
  --sak-radius-lg: 20px;
  --sak-font-display: 'Geist Sans', ui-sans-serif, system-ui;
  --sak-font-mono: 'Geist Mono', ui-monospace;
  --sak-shadow-elevated: 0 20px 60px rgba(0,0,0,0.35);
  --sak-logo-url: url('/brand/logo.svg');
  --sak-branding: 'show';   /* 'show' | 'hide' — "powered by" footer */
}
```

```ts
// RN / JS equivalent
<ConnectProvider
  theme={{
    mode: 'dark',
    colors: { bg: '#0B0D0E', surface: '#14171A', accent: '#6EE7B7', text: '#F5F6F7' },
    radius: { sm: 10, lg: 20 },
    fonts: { display: 'GeistSans', mono: 'GeistMono' },
    logo: { uri: 'https://.../logo.svg', width: 28, height: 28 },
    showBranding: true,
  }}
/>
```

**Default theme** (what ships before any customization) — deliberately not one of the generic "AI-default" looks (cream+terracotta, near-black+acid-green, broadsheet-serif). Direction: a quiet, editorial dark-mode with a single considered accent and generous type — closer to a well-made trading terminal than a crypto-modal template:

- **Color** — near-black graphite `#0B0D0E` background, elevated surface `#14171A`, hairline borders at 8% white, primary text `#F5F6F7`, muted text `#9AA0A6`, one accent — a desaturated mint `#6EE7B7` used only for the active/selected state and the primary CTA, never decoratively.
- **Type** — Geist Sans for UI labels and wallet names, Geist Mono for addresses, hashes, and network names (matches how addresses are usually read — as data, not prose).
- **Signature element** — the connecting state doesn't use a generic spinner; it uses a single hairline circular arc that traces the outline of the selected wallet's icon tile, so "connecting" reads as *this specific wallet is being reached*, not a generic loading state.
- **Motion** — one orchestrated open/close transition (sheet slides from the trigger's edge on mobile, modal scales from 96%→100% with a backdrop fade on desktop), restrained hover states elsewhere, `prefers-reduced-motion` respected throughout.

Light mode is a first-class second token set (useful for Saganta's own site, which is light-mode/Pyth-inspired), not a naive inversion — surfaces, borders, and the accent are re-tuned separately.

---

## 6. Sign-In With Stellar (SIWS)

There's no ratified "SIWS" SEP yet (SEP-10 is anchor-oriented, server-per-anchor). We define a minimal, self-issued message format analogous to Sign-In With Ethereum, built on SEP-43's `signMessage`, so any app can add "Sign in with wallet" without standing up a SEP-10 auth server:

```
saganta-connect wants you to sign in with your Stellar account:
G...ADDRESS...

Statement: <app-defined, e.g. "Sign in to Saganta">
URI: https://app.example.com
Version: 1
Chain ID: pubnet | testnet
Nonce: <random, server-issued>
Issued At: 2026-08-02T10:00:00Z
Expiration Time: 2026-08-02T10:10:00Z
```

Client:

```ts
const { message, signedMessage, signerAddress } = await connect.signIn({
  domain: 'app.example.com',
  statement: 'Sign in to Saganta',
  nonce: await fetchNonceFromMyBackend(),
});
// POST { message, signedMessage, signerAddress } to your backend
```

`packages/siws-verify` provides the server-side counterpart — `verifySIWS(payload, { expectedDomain, expectedNonce })` — which checks expiry, domain binding, and the ed25519 signature against the claimed address, returning a plain boolean/claims object so it can sit in front of any session/JWT layer without dictating one. Apps that already run a SEP-10 anchor auth server can opt into that flow instead; `signIn()` accepts a `strategy: 'siws' | 'sep10'` flag.

### 6.1 The `signedData` contract — unified signature verification across wallets

The first version of `signIn()` returned `{ message, signedMessage, signerAddress }` but **not** the bytes the wallet actually signed. The verifier then guessed those bytes were `utf8(message)` — true for Freighter and Ledger (direct signers), but **wrong for Albedo** (signs a server-derived `signed_message` that the connector was discarding) and **wrong for xBull** (signs a `fullMessage` that may include a wallet-added prefix, also discarded). Result: SIWS verification failed for any transformative-signer wallet.

The fix is a unified four-field contract. Every connector now returns a fourth field on `SignMessageResult`:

```ts
interface SignMessageResult {
  signedMessage: string;  // signature (base64 or hex)
  signerAddress: string;  // G... address
  signedData?: string;    // base64 of the exact byte sequence the wallet signed
}
```

- **Freighter, Ledger** (direct signers): `signedData = base64(utf8(message))`
- **Albedo** (transformative): `signedData = base64(hexDecode(res.signed_message))` — the connector now surfaces what Albedo actually signed, instead of discarding it
- **xBull** (prefixed): `signedData = base64(utf8(result.fullMessage))` — the connector now surfaces the prefixed message, instead of discarding it

`signInWithStellar()` threads `signedData` through into `SignInResult`, and the verifier (`verifySiws`) uses `signedData` when present, falling back to `utf8(message)` for backward compatibility with third-party connectors that haven't been updated yet. The fallback is correct for any direct signer (Freighter, Ledger, SEP-43) and fails loudly for transformative signers (Albedo, xBull) — which is the right thing to do rather than silently passing. No custom `verifySignatureFn` is needed for any supported wallet anymore.

Also fixes `decodeSignature`: the old regex heuristic could misfire on pure-alphanumeric base64 strings of even length. The new implementation tries base64 first (with a 64-byte length check), falls back to hex (also 64-byte length check).

---

## 7. Mobile wallet connectivity

- **Mobile web → mobile wallet app:** WalletConnect v2 (Reown) relay — QR on desktop, deep link on mobile web, using the Stellar WC namespace already supported by Lobstr/Hana/xBull.
- **React Native → external wallet app:** same WC relay (RN has first-class WC v2 SDKs), plus SEP-7 (`web+stellar:`) URI fallback for wallets that support it without WC.
- **React Native → in-app embedded signer:** direct path, no deep link — this is the seam for Saganta's own embedded/smart-account wallet, which can register as a `WalletConnector` like any other and skip the deep-link round trip entirely.
- Session persistence uses an injected `Storage` interface (`localStorage`/`IndexedDB` shim on web, `AsyncStorage`/`SecureStore` on RN) so reconnect-on-relaunch behaves the same on both platforms.

---

## 8. Naming

**Decided:** `@saganta/stellar-appkit` (core, including the `/ui-web` subpath) and `@saganta/stellar-appkit-siws-verify`. Originally shipped as three packages — `core`, `ui-web`, and `siws-verify` — but `ui-web` was never usable without `core` and depended on it via a version range, which is exactly the kind of seam that drifts. Merged into one package with a subpath export instead: `@saganta/stellar-appkit/ui-web` is still a separate module a bundler only evaluates if actually imported (verified — see §9), so nothing about tree-shaking changed, but there's no longer a version-compatibility question between two things that were always installed together anyway. `siws-verify` stayed separate — it's genuinely different (server-side Node code, not browser client code) and genuinely optional in a different way. Product name in prose/UI: **Stellar AppKit**. Scoped under `@saganta` — positions this as part of the existing Saganta product line (embedded wallets, gas sponsorship, smart accounts, payment APIs) rather than a fully independent brand, while "Stellar AppKit" itself reads cleanly on its own in READMEs, the modal's branding footer, and anywhere it's mentioned without the `@saganta/` scope attached.

---

## 8.5 Transaction preview & risk architecture

The preview layer is the actual differentiator over passing raw XDR through to a signature popup. Three pieces compose it, all in `packages/core/src/decode.ts`:

**1. `buildTransactionPreview(xdr, networkPassphrase, opts)`** — decodes every operation in a transaction into a human-readable `DecodedOperation` with `summary`, `details`, and per-op `riskFlags`. Covers 12 operation types: payment, createAccount, pathPaymentStrictSend/Receive, changeTrust, manageSell/BuyOffer, accountMerge, setOptions, clawback, bumpSequence, manageData, createClaimableBalance, claimClaimableBalance, invokeHostFunction. Risk flags include:

- `account-merge` (danger) — always flagged; permanently closes the source account
- `signer-change` (danger) — always flagged; common account-takeover pattern
- `threshold-change` (warning) — changes future signing requirements
- `large-transfer` (warning) — opt-in via `previewOptions.largeTransferThreshold`
- `unverified-contract` (warning) — opt-in via `previewOptions.verifiedContracts`
- `broad-auth-grant` (warning) — auto-flagged when an auth tree spans >1 contract or >3 invocations
- `fee-bump` (info), `unrecognized-operation` (info)

The preview is wired into `signTransaction()` via the `onPreviewTransaction` hook (set automatically when `<saganta-appkit-modal>` is attached, or assignable directly for non-UI flows). Returning `false` cancels the request before the wallet ever sees it, surfacing as a normal user-rejected error.

**2. `decodeSimulationDeltas(simulation)`** — extracts human-readable `BalanceDelta[]` from a Soroban `simulateTransaction` success response's `stateChanges` array. Each delta describes what changed for one ledger entry: account balances (XLM), trustline balances (assets), contract storage, offers, data entries, claimable balances, liquidity pools. For balance updates, the delta includes the before → after transition and the signed difference, e.g. `"XLM balance GA...: 1000 → 900 (−100)"`. This is the network's own authoritative statement of what would change — far more reliable than the previous approach of decoding intended amounts from call args.

`SorobanConnection.previewInvoke()` calls this internally and returns `balanceDeltas` alongside `simulationStatus` and `simulationError`.

**3. `buildAuthEntryPreview(authEntryXdr, opts)`** — decodes a standalone Soroban `SorobanAuthorizationEntry` into an `AuthEntryPreview` surfacing `authorizedContracts`, `authorizedFunctions`, `invocationCount`, plus risk flags for broad grants and unverified contracts. This closes a previous gap where standalone `signAuthEntry()` calls bypassed the preview flow entirely — exactly the case where a risk preview matters most, since auth entries grant contracts permission to act on the user's behalf.

Wired into `signAuthEntry()` via the `onPreviewAuthEntry` hook, with the same `skipPreview: true` escape hatch as `signTransaction`. The `previewOptions` (verifiedContracts, largeTransferThreshold) are shared between the transaction preview and the auth-entry preview.

**4. Signature-request queueing** — every `sign*` call (`signTransaction`, `signAuthEntry`, `signMessage`, `signIn`) goes through `enqueueSign()`, which serializes requests via a Promise chain so concurrent calls resolve in call order rather than racing the wallet extension. The `signQueueChange` event and `pendingSignCount` getter expose queue depth — useful for showing "1 of 3 signing requests in progress" in the UI.

---

## 8.7 Framework wrappers

Four framework wrappers ship as subpath exports of `@saganta/stellar-appkit`, mirroring the `/ui-web` pattern: `/react`, `/vue`, `/solid`, `/svelte`. Each is a separate entry point in `package.json`'s `exports` field, so a bundler only pulls in the framework code the consumer actually imports — a React app never pays for Vue/Svelte/Solid.

**Why subpath exports instead of separate packages?** Same rationale as the `ui-web` merge in §8: separate packages drift. Each wrapper is a thin reactive binding over the framework-agnostic `StellarAppKit` client — keeping them in one package means one version, one CI, no cross-package drift. The framework packages (`react`, `vue`, `solid-js`, `svelte`) are optional peer dependencies, so consumers only install the one they need.

### Shared hook surface

All four wrappers expose the same hook names with the same semantics — only the reactivity primitives differ:

| Hook | Returns | React | Vue | Solid | Svelte |
|---|---|---|---|---|---|
| `useAppKit()` | `StellarAppKit` | direct | direct | direct | `getAppKit()` |
| `useStatus()` | `'idle' \| 'selecting' \| ...` | `useSyncExternalStore` | `ref` + `on('statusChange')` | `createSignal` | writable store |
| `useSession()` | `ConnectSession \| null` | `useSyncExternalStore` | `shallowRef` | `createSignal` | writable store |
| `useSessions()` | `ConnectSession[]` | `useSyncExternalStore` | `shallowRef` | `createSignal` | writable store |
| `useAddress()` | `string \| null` | derived | `computed` | `createMemo` | derived store |
| `usePendingSignCount()` | `number` | `useSyncExternalStore` | `ref` | `createSignal` | writable store |
| `useConnect()` | `{ connect, disconnect, ... }` | `useState` + handler | `ref` + handlers | `createSignal` + handlers | writables + handlers |
| `useSignTransaction()` | `{ sign, isSigning, data, error }` | `useState` | `writable` | `createSignal` | writables |
| `useSignMessage()` | same shape | same | same | same | same |
| `useSignIn()` | same shape | same | same | same | same |
| `useSoroban({ rpcUrl, networkPassphrase })` | `{ soroban, invoke, previewInvoke, status, ... }` | `useMemo` + `useState` | `new` + `ref` | `new` + `createSignal` | `new` + writables |
| `usePreviewTransaction()` | `{ preview, respond, isPending }` | `useState` + `useEffect` | `shallowRef` | `createSignal` | writable |
| `usePreviewAuthEntry()` | same shape | same | same | same | same |

### Per-framework design notes

**React (`/react`)** — uses `useSyncExternalStore` (React 18+) for the read-only reactive slices (`useStatus`, `useSession`, `useSessions`, `usePendingSignCount`) because it's tearing-safe under concurrent rendering, and correctly handles the case where an event fires between render and effect setup. The signing hooks (`useSignTransaction`, etc.) use `useState` because their state is local to the hook instance, not subscribed from the client. The provider constructs the client in `useMemo` (with config fields as deps so a hot reload during dev doesn't leak instances) and runs `restore()` in `useEffect` so it doesn't block render. `dispose()` is called on unmount.

**Vue (`/vue`)** — exposes two entry points: `StellarAppKitPlugin` (for `app.use()`) and `provideStellarAppKit()` (for component-tree-scoped setup). Uses `shallowRef` instead of `ref` for object-valued state (sessions, previews) because the underlying client emits new object references on change — deep reactivity would be wasted overhead. `shallowReadonly` wraps the refs to prevent consumers from mutating them while still allowing them to read nested fields. Each composable calls `onUnmounted` to unsubscribe from the client's event emitter.

**Solid (`/solid`)** — uses `createSignal` + `createMemo` + `onCleanup` for fine-grained reactivity. The provider constructs the client in `onMount` (not during render) to avoid touching `localStorage` during SSR. The `AppKitContext.Provider` is rendered via `createComponent` instead of JSX to avoid TS JSX namespace conflicts with the React wrapper in the same package (TS can't switch `jsxImportSource` per-file). `useAppKitOptional()` is provided for SSR-safe access — returns `null` before mount instead of throwing.

**Svelte (`/svelte`)** — uses Svelte's writable stores as the primary API because they work in both Svelte 4 and Svelte 5 (stores are still supported in 5). The client is a module-level singleton (`setStellarAppKitContext()`) because Svelte 5's runes model makes module-level state idiomatic, and Svelte 4 didn't have React-style Context anyway. Short aliases (`useSession` instead of `useSessionStore`) are exported for Svelte 5 runes-style code. The store's `subscribe` function cleans up implicitly when the store is garbage collected — for HMR-heavy dev, call `setStellarAppKitContext()` again to fully reset.

### Tree-shakability contract

Each wrapper is a separate subpath export in `package.json`:

```json
{
  "exports": {
    ".": "...",
    "./ui-web": "...",
    "./react": { "types": "./dist/react/index.d.ts", "import": "./dist/react/index.js" },
    "./vue":   { "types": "./dist/vue/index.d.ts",   "import": "./dist/vue/index.js" },
    "./solid": { "types": "./dist/solid/index.d.ts", "import": "./dist/solid/index.js" },
    "./svelte":{ "types": "./dist/svelte/index.d.ts","import": "./dist/svelte/index.js" }
  }
}
```

Vite, webpack, and Rollup all respect subpath exports — `import { StellarAppKit } from '@saganta/stellar-appkit'` never pulls in `dist/react/`, and `import { useConnect } from '@saganta/stellar-appkit/react'` never pulls in `dist/vue/` or `dist/solid/`. The framework packages themselves (`react`, `vue`, `solid-js`, `svelte`) are optional peer dependencies, so consumers only install the one they need.

### Reference patterns

The hook surface is synthesized from the official Stellar docs ([dapp-frontend tutorial](https://developers.stellar.org/docs/build/apps/dapp-frontend), the [dapp SKILL.md](https://skills.stellar.org/), and the `soroban-example-dapp`'s `hooks/` directory) plus the existing `StellarAppKit` API. Two notable differences from the official examples:

1. **Context provider instead of module-level singleton** — the official `soroban-example-dapp` uses a module-level `addressLookup` cache. We use a Context provider (React/Solid) / provide-inject (Vue) / module singleton (Svelte) so the client lifecycle is owned by the app root, not the import graph. This makes testing easier (inject a mock client) and supports multiple StellarAppKit instances in one app (rare but legitimate — e.g. a Testnet playground alongside a Mainnet dashboard).

2. **`usePreviewTransaction` / `usePreviewAuthEntry` are first-class hooks** — the official examples don't have a preview flow. Ours surfaces the `onPreviewTransaction` / `onPreviewAuthEntry` payloads reactively, with a `respond(approve: boolean)` callback that resolves the pending preview. This lets apps build their own preview UI (instead of using `<saganta-appkit-modal>`) while still going through the same risk-flag pipeline.

---

## 9. Phased roadmap

| Phase | Scope | Status |
|---|---|---|
| 0 | `core`: types, error model, connector registry, Freighter/Albedo/xBull adapters, unified `StellarAppKit` client | **done** |
| 1 | `core`: `SorobanConnection` (invoke pipeline, typed contract client), SIWS client + `siws-verify` | **done** (auth-entry signing within the pipeline is still a stub — see §10) |
| 1.5 | Multi-session client (connect several wallets at once, switch active), richer `getReachability()`, typed `NetworkMismatchError` with optional auto-retry, cross-tab session sync, Ledger hardware adapter with multi-account support | **done** |
| 1.75 | Transaction decoding (`decode.ts`) — human-readable operations, risk flags (account-merge, signer-change, large-transfer, unverified-contract, broad-auth-grant), an opt-in `onPreviewTransaction` hook wired into `signTransaction()`, signature-request queueing, `SorobanConnection.previewInvoke()` | **done** |
| 1.8 | Unified `signedData` SIWS contract (§6.1) — every connector surfaces the exact bytes the wallet signed; verifier works for Freighter/Ledger/Albedo/xBull with no custom `verifySignatureFn`. Simulation-based Soroban balance-delta preview (`decodeSimulationDeltas`). Auth-entry preview flow (`buildAuthEntryPreview` + `onPreviewAuthEntry`) wired into `signAuthEntry()`. CI suite: 80 tests, typecheck + build + test on Linux + macOS. | **done** |
| 1.9 | Framework wrappers (§8.7) — React (`/react`), Vue (`/vue`), Solid (`/solid`), Svelte (`/svelte`) as subpath exports. Shared hook surface (`useAppKit`, `useConnect`, `useSession`, `useSignTransaction`, `useSignMessage`, `useSignIn`, `useSoroban`, `usePreviewTransaction`, `usePreviewAuthEntry`) with per-framework reactivity primitives. Tree-shakable: each wrapper is a separate entry point; framework packages are optional peer deps. 15 wrapper tests covering module structure, provider/plugin surface, and tree-shakability contract. Total suite now 95 tests. | **done** |
| 2 | `ui-web` Web Components + theming, default dark theme, network-mismatch/account-switcher/account-picker/transaction-preview views | **done** |
| 2.5 | WalletConnect v2 relay adapter (covers Lobstr/Hana/Hot Wallet + QR flow) | next |
| 3 | `ui-react-native` — bottom sheet, deep-link handling, Expo compatibility | next |
| 4 | Ledger Soroban auth-entry signing | next |
| 5 | Smart-account/passkey signer as a native `WalletConnector` (Saganta embedded wallet), gas-sponsorship hook in the Soroban invoke pipeline | later |

---

## 10. What's scaffolded in this pass

`packages/core` — fully typed, working TypeScript for: unified types, the SEP-43-aligned error model, the connector registry, four real adapters (Freighter, Albedo, xBull, Ledger) plus a stub WalletConnect adapter to fill in with the relay client, the `StellarAppKit` unified facade (now multi-session — see §1.5 above), `SorobanConnection`, and the SIWS client. Its `ui-web/` subdirectory (published as the `@saganta/stellar-appkit/ui-web` subpath — see §8) implements the full modal/bottom-sheet/inline UI including the network-mismatch and account-switcher/picker views. This is the foundation every remaining UI package will sit on — worth reviewing the interface shapes in `types.ts` before further UI work, since changing them later is the expensive kind of change.

Two things are stubbed rather than faked, flagged clearly in code comments rather than silently half-working: `SorobanConnection`'s auth-entry signing within the `invoke()` pipeline, and Ledger's Soroban auth-entry signing specifically (`signAuthEntry` in `ledger.ts`) — both need the same underlying piece (constructing a valid `SorobanAuthorizationEntry` credentials structure from a raw signature), which is real Soroban-specific XDR work worth doing carefully rather than guessing at.

**Note (Phase 1.8):** standalone `signAuthEntry()` calls now go through a real preview flow (`buildAuthEntryPreview` + `onPreviewAuthEntry`, see §8.5) — what's still stubbed is the *signing* of those entries inside `SorobanConnection.invoke()`. The two are separate concerns: the preview decodes and risk-assesses whatever auth entry the app hands to `signAuthEntry()`, regardless of where it came from; the stub is about *producing* signed auth entries programmatically as part of the `invoke()` pipeline. A standalone `signAuthEntry()` call from app code (e.g. delegated auth flows where the app has the unsigned entry XDR in hand) now works end-to-end with preview.
