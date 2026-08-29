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
│   ├── react-native/          # @saganta/stellar-appkit-react-native (Phase 3) — headless entry
│   │                            (defaultReactNativeConnectors, createAsyncStorage, deep-link registry)
│   │                            plus ./ui (AppKitModal), ./albedo (WebView bridge), ./polyfills
│   │                            subpath exports — same subpath pattern as core's framework wrappers
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
stellar-appkit-modal {
  --sak-color-bg: #09090B;
  --sak-color-surface: #18181B;
  --sak-color-border: #27272A;
  --sak-color-text: #FAFAFA;
  --sak-color-text-muted: #A1A1AA;
  --sak-color-accent: #6EE7B7;          /* overridden by the named theme */
  --sak-color-accent-text: #09090B;     /* text color on accent-filled buttons */
  --sak-radius-sm: 10px;
  --sak-radius-lg: 20px;
  --sak-font-display: 'Geist Sans', ui-sans-serif, system-ui;
  --sak-font-mono: 'Geist Mono', ui-monospace;
  --sak-shadow-elevated: 0 20px 60px rgba(0,0,0,0.65);
  --sak-logo-url: url('/brand/logo.svg');
  --sak-branding: 'show';   /* 'show' | 'hide' — "powered by" footer */
}
```

**Theme system (v1.9.x).** The modal ships **5 named themes**, each with a dark + light variant (10 theme objects total). Themes are built on top of a shared **zinc neutral base palette** — each named theme only overrides the accent color, so the rest of the palette stays consistent. See **§8.20** for the full theme registry, accent values, and `theme` attribute resolution rules.

| Theme | Accent (dark / light) | Notes |
|---|---|---|
| `minimal` (default) | `#FAFAFA` / `#18181B` (neutral) | No brand color — fits any project |
| `stellar` | `#6EE7B7` / `#0E9A6E` (Stellar green) | Stellar brand theme |
| `sky` | `#38BDF8` / `#0EA5E9` (light sky blue) | Open, friendly |
| `ocean` | `#60A5FA` / `#1D4ED8` (deep ocean blue) | Serious, financial |
| `sunset` | `#FB7185` / `#E11D48` (warm coral/pink) | Energetic, creative |

The `theme` attribute accepts a named theme (`theme="stellar"`), a `:light` suffix (`theme="sky:light"`), `auto` (follows `prefers-color-scheme`), or `dark`/`light` (backwards-compat → `minimalDark` / `minimalLight`). Omitted / unknown values fall back to `minimal` (dark variant).

**Default theme** (what ships before any customization) — `minimalDark`, a quiet editorial dark-mode palette built on zinc neutrals, with a near-white `#FAFAFA` accent (the primary CTA, the active wallet row, focus rings). The `minimal` accent is intentionally not a brand color — the modal looks native wherever it's embedded, instead of broadcasting "I am a Stellar app". Apps that want the Stellar brand look can switch to `theme="stellar"` for the green accent. The other named themes (`sky`, `ocean`, `sunset`) are accent-only variations on the same zinc base — pick the one that matches your product's palette.

- **Color** — zinc-950 `#09090B` background, zinc-900 `#18181B` surface, zinc-800 `#27272A` borders, zinc-50 `#FAFAFA` primary text, zinc-400 `#A1A1AA` muted text. The accent for `minimalDark` is `#FAFAFA` (near-white) with `#09090B` accent-text (the text on a solid accent fill is near-black for legibility on light accents).
- **Type** — Geist Sans for UI labels and wallet names, Geist Mono for addresses, hashes, and network names (matches how addresses are usually read — as data, not prose).
- **Signature element** — the connecting state doesn't use a generic spinner; it uses a single hairline circular arc that traces the outline of the selected wallet's icon tile, so "connecting" reads as *this specific wallet is being reached*, not a generic loading state.
- **Motion** — one orchestrated open/close transition (sheet slides from the trigger's edge on mobile, modal scales from 96%→100% with a backdrop fade on desktop), restrained hover states elsewhere, `prefers-reduced-motion` respected throughout.

Light mode is a first-class second token set (zinc-50 / zinc-100 / zinc-200 surfaces, zinc-900 text), not a naive inversion — surfaces, borders, and the accent are re-tuned separately. Every theme resolves to one of these two base palettes; only the accent + accent-text color change between named themes.

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
- **xBull** (best-effort): `signedData = base64(utf8(message))` — the xBull SDK's TypeScript interface declares a `fullMessage` field, but the actual runtime never populates it (verified against v0.4.0). The connector surfaces `utf8(message)` as a best-effort hypothesis; if xBull transforms the message before signing, the verifier's multi-candidate fallback (SHA-256, SHA-512, domain-prefixed hashes) may help, but xBull SIWS verification is not guaranteed without a custom `verifySignatureFn`.

`signInWithStellar()` threads `signedData` through into `SignInResult`, and the verifier (`verifySiws`) uses `signedData` when present, falling back to `utf8(message)` for backward compatibility with third-party connectors that haven't been updated yet. The fallback is correct for any direct signer (Freighter, Ledger, SEP-43) and fails loudly for transformative signers (Albedo, xBull) — which is the right thing to do rather than silently passing. No custom `verifySignatureFn` is needed for any supported wallet anymore.

Also fixes `decodeSignature`: the old regex heuristic could misfire on pure-alphanumeric base64 strings of even length. The new implementation tries base64 first (with a 64-byte length check), falls back to hex (also 64-byte length check).

### 6.2 Multi-candidate verification (Freighter hash-signing support)

Freighter v5+ has an experimental `isHashSigningEnabled` flag (declared in the freighter-api types as `ExperimentalFeatures.isHashSigningEnabled`). When on, Freighter signs SHA-256 of the message rather than the raw UTF-8 bytes. The freighter-api client is a thin messaging layer — it doesn't hash or transform the message itself; the hashing happens inside the extension's SUBMIT_BLOB handler, which isn't bundled in `node_modules`.

Since there's no public API to query `isHashSigningEnabled` at runtime, the verifier can't know which mode Freighter is in. The fix: `defaultVerifySignature` tries multiple candidate byte sequences and returns true if ANY matches:

1. `signedData` (if present) — the exact bytes the connector claims the wallet signed
2. `utf8(message)` — the raw UTF-8 bytes (correct for Freighter with hash-signing OFF, Ledger, SEP-43 direct signers)
3. `sha256(utf8(message))` — the SHA-256 hash (correct for Freighter with hash-signing ON)

This is slightly weaker cryptographically than verifying against a single known byte sequence — an attacker who could find a SHA-256 second-preimage for the message could pass verification. In practice this is not a realistic threat for SIWS: the message includes a server-issued nonce and expiry timestamp, so a second-preimage attack would need to produce a different message with the same SHA-256 hash AND the same nonce AND a valid expiry — which is computationally infeasible.

The alternative (failing verification for legitimate users whose wallet has hash-signing on) is worse than the small cryptographic tradeoff. Once Freighter exposes a public API to query `isHashSigningEnabled`, the connector can detect the mode and surface the correct `signedData` directly, eliminating the need for the multi-candidate fallback.

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

The preview is wired into `signTransaction()` via the `onPreviewTransaction` hook (set automatically when `<stellar-appkit-modal>` is attached, or assignable directly for non-UI flows). Returning `false` cancels the request before the wallet ever sees it, surfacing as a normal user-rejected error.

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

2. **`usePreviewTransaction` / `usePreviewAuthEntry` are first-class hooks** — the official examples don't have a preview flow. Ours surfaces the `onPreviewTransaction` / `onPreviewAuthEntry` payloads reactively, with a `respond(approve: boolean)` callback that resolves the pending preview. This lets apps build their own preview UI (instead of using `<stellar-appkit-modal>`) while still going through the same risk-flag pipeline.

### Framework-native modal components

In addition to the hooks, each wrapper ships a typed component wrapping the underlying `<stellar-appkit-modal>` Web Component. The component handles client assignment (from the same context as the hooks), prop-to-attribute forwarding, and event listening — so consumers don't have to manage refs and CustomEvents by hand.

| Wrapper | File | Component | Pattern |
|---|---|---|---|
| React | `src/react/modal.tsx` | `<StellarAppKitModal>` | `forwardRef` component with `useImperativeHandle` exposing `open()` / `close()` / `element` |
| Vue | `src/vue/modal.ts` | `<StellarAppKitModal>` | `defineComponent` with `expose()` for the imperative handle; emits `connect` / `disconnect` / `error` |
| Solid | `src/solid/modal.tsx` | `<StellarAppKitModal>` | `Component` with a `ref` callback prop yielding the imperative handle |
| Svelte | `src/svelte/modal.ts` | `use:stellarmodal` action | Svelte action on the raw `<stellar-appkit-modal>` element — the idiomatic Svelte pattern for wrapping Web Components |

**Shared prop types** live in `src/ui-web/modal-props.ts` and are re-exported by each wrapper. The `propsToAttributes()` helper translates camelCase props to the kebab-case attributes the Web Component expects.

**SSR safety contract:** the framework modal components deliberately do NOT import `connect-modal.ts` (the Web Component class). That class `extends HTMLElement`, which is undefined in pure-Node SSR/test contexts — importing it at module top-level would crash server-side rendering. Instead, consumers `import '@saganta/stellar-appkit/ui-web'` once at their app entry point to register the `<stellar-appkit-modal>` custom element. This keeps the framework wrappers fully SSR-safe and lets bundlers tree-shake the Web Component code out of server bundles. The 18 new modal-component tests verify this contract by importing each wrapper in a DOM-less bun:test environment — if any wrapper accidentally pulled in `connect-modal.ts`, the test would crash with `HTMLElement is not defined`.

**Why a Svelte action instead of a component:** Svelte renders unknown lowercase tags (like `<stellar-appkit-modal>`) as-is in templates, so wrapping it in a Svelte component would just add an extra layer of indirection without buying anything. Svelte actions (`use:stellarmodal`) are the idiomatic pattern for enhancing a DOM node — they're plain TS functions that take the node and return a destroy callback. This keeps the wrapper zero-runtime-overhead and avoids needing a Svelte compiler step in the build (the rest of the wrapper is plain TS).

### Dependency strategy — bundled vs. peer

The package.json has two classes of external packages, split by whether they have a singleton constraint:

**Bundled as regular `dependencies`** (auto-installed, version-locked, tree-shaken if unused):
- `@stellar/stellar-sdk` — core needs it for transaction building, Soroban RPC, and contract spec parsing. The public API takes XDR strings (not class instances), so `instanceof` issues don't apply even if the app installs a different major version — the library uses its own copy internally.
- `@stellar/freighter-api`, `@albedo-link/intent`, `@creit.tech/xbull-wallet-connect`, `@ledgerhq/hw-app-str` + `hw-transport-webhid` + `hw-transport-webusb`, `@walletconnect/sign-client` — wallet SDKs, only used by the corresponding connector. The app doesn't typically need these directly. All are lazy-imported inside the connector's `connect()` / `signTransaction()` methods, so bundlers tree-shake them out if the connector isn't imported.
- `@use-gesture/vanilla` + `motion` — gesture libraries for the draggable bottom-sheet. Lazy-imported inside `setupBottomSheetGestures()`, only called when `mode === 'bottomsheet'`. Apps that don't use bottom-sheet mode never load them.

**Kept as optional `peerDependencies`** (app installs the one it needs):
- `react`, `vue`, `solid-js`, `svelte` — framework wrappers. These have a hard singleton constraint: two copies of React in the same bundle break hooks (React's `useState` checks `React.__SECRET_INTERNALS` on the instance, and if there are two React copies, the hook call from one copy doesn't match the renderer from the other). The app already has its own framework instance, so bundling a second copy would cause exactly this failure mode. Keeping them as optional peer deps lets the app's single framework instance satisfy the wrapper.

This split means a consumer can do `npm install @saganta/stellar-appkit` and immediately use any connector without manually installing wallet SDKs — the only separate install is the framework wrapper they actually use (`npm install react react-dom` for the React wrapper, etc.).

**Version locking:** the `dependencies` use caret ranges (`^`) pinned to the major version we test against (e.g. `@stellar/freighter-api: ^4.1.0`). This ensures the installed version is at least the one we tested with, while allowing patch and minor updates for security fixes. Consumers who explicitly install an older major version would get a nested install — but the library's dynamic imports resolve to its own (compatible) copy, so it still works.

---

## 8.8 Soroban contract layer — typed clients, failover, badges, fee estimation

Four additions to the Soroban layer that close the gap between "works in a demo" and "production-grade":

### 1. Typed contract client (`packages/core/src/contract.ts`)

`SorobanConnection.contract<T>(contractId, { specEntries })` returns a `ContractClient<T>` whose methods are typed from the consumer's TS interface. Wraps `@stellar/stellar-sdk`'s `Spec` class (which parses a contract's WASM spec entries) and binds it to the connection's invoke pipeline, so every call goes through simulate → prepare → sign → submit → poll with the transaction preview flow intact.

```ts
interface TokenContract extends defineContractSpec<{
  transfer: (args: { from: string; to: string; amount: bigint }) => Promise<boolean>;
  balanceOf: (args: { id: string }) => Promise<bigint>;
}> {}

const token = soroban.contract<TokenContract>('C...', { specEntries });
await token.transfer({ from, to, amount: 100n });  // typed — wrong args caught at compile time
const balance = await token.simulate('balanceOf', { id });  // read-only, skips signing
```

The spec entries come from `stellar contract bindings typescript --contract-id C... --output-dir ...` — the consumer's contract bindings package exports them as base64 strings. `Spec.funcArgsToScVals(method, args)` does the native→ScVal conversion (Address → ScAddress, bigint → ScInt, arrays → Vec, etc.) based on the function's declared parameter types. `Spec.funcResToNative(method, returnValue)` does the reverse for the result.

### 2. RPC failover (`packages/core/src/rpc-failover.ts`)

`FailoverRpcServer` wraps multiple `rpc.Server` instances and proxies every method call, transparently failing over on network errors and HTTP 5xx responses. `SorobanConnectionConfig` accepts `rpcUrls: string[]` (plural) — the connection constructs a `FailoverRpcServer` internally and uses its `.asServer()` proxy anywhere a regular `rpc.Server` is expected.

**Failover policy** — fails over on:
- Network errors (fetch rejects — DNS failure, connection refused, timeout, ECONNRESET)
- HTTP 5xx responses
- JSON-RPC internal errors (-32603)

Does NOT fail over on:
- HTTP 4xx (client error — retrying won't help)
- Simulation errors (the transaction itself is invalid — that's a valid response)
- `sendTransaction` returning non-PENDING (network rejected the tx)

**Health tracking** — failed servers are marked unhealthy for 30s (configurable via `unhealthyCooldownMs`). Subsequent calls skip them entirely, avoiding timeout waits. After the cooldown, the server is retried. The first healthy server in the list is always preferred, so traffic shifts back to the primary when it recovers. `connection.getFailoverStatus()` returns the current health/failure-count for each server — useful for monitoring dashboards.

**Proxy design** — uses a JS `Proxy` to delegate every property access, so we automatically support any new method `stellar-sdk` adds to `rpc.Server`. No method list to maintain.

### 3. Contract verification badges (`PreviewOptions.contractMetadata`)

Apps maintain a registry of contracts they trust and pass it via `previewOptions.contractMetadata`. The decoder surfaces trust signals as `ContractBadge[]` on each `DecodedOperation` that touches a contract — separate from `riskFlags` (which flag danger), badges are positive signals.

```ts
previewOptions: {
  contractMetadata: new Map([
    ['CBETT2CX...', {
      name: 'USDC Token',
      publisher: 'Centre Consortium',
      verified: true,
      audited: true,
      auditUrl: 'https://example.com/audits/usdc.pdf',
      extraBadges: [{ label: 'Stellar Expert', url: '...' }],
    } as ContractMetadata],
  ]),
}
```

Surfaces as:
- `op.contractBadges` — array of `{ label, code, severity, url?, description? }`
- `op.summary` — uses the contract's `name` instead of its ID ("Call `transfer` on USDC Token" vs "Call `transfer` on contract CBETT2CX...")

`contractMetadata` accepts both `Map<string, ContractMetadata>` and `(contractId: string) => ContractMetadata | undefined` (for dynamic lookups — e.g. fetching from a backend registry). Independent of the existing `verifiedContracts` option (which drives the `unverified-contract` risk flag) — a contract can have a "Verified" badge but still be in the risk-flag set, or vice versa. The two signals serve different purposes: badges are display-only trust signals; risk flags affect the preview's approve/deny flow.

### 4. Pre-simulate fee estimation (`FeeEstimate`)

`previewInvoke()` and `estimateFee()` return a `FeeEstimate` with the full fee breakdown, computed from the simulation's `cost` field:

```ts
interface FeeEstimate {
  baseFee: string;              // per-op fee in stroops
  operationCount: number;
  totalBaseFee: string;         // baseFee × operationCount
  sorobanResourceFee?: string;  // CPU + memory + storage, from simulation
  sorobanInstructions?: string; // for gas-optimization display
  totalFee: string;             // total in stroops
  totalFeeXlm: string;          // human-readable, e.g. "0.00501 XLM"
}
```

`previewInvoke()` populates `feeEstimate` automatically (when `includeFeeEstimate: true` is set on `previewOptions`, which is the default). `estimateFee(xdr)` is a lower-level escape hatch for when you already have a built transaction and just want the fee number — it simulates internally and returns the estimate.

For classic (non-Soroban) transactions, the simulation won't have a `cost` field — we still compute the base fee breakdown, but `sorobanResourceFee` and `sorobanInstructions` are undefined. The total fee for a classic transaction is just `baseFee × operationCount`.

---

## 8.9 UI polish — avatars, copy-to-clipboard, spinner, badges

Four UI improvements that close the gap between "functional" and "production-grade":

### 1. Wallet-provided avatars (`packages/core/src/ui-web/avatar.ts`)

The `WalletConnector` interface now has an optional `getAvatar?()` method. Connectors that support profile pictures (e.g. a future smart-account wallet with passkey-linked identity) implement it; the modal renders the returned URL as an `<img>`.

When no avatar is available (the wallet doesn't implement `getAvatar`, or it returns null), the modal falls back to a **deterministic gradient** generated from the address — same address always produces the same gradient, so users see a consistent visual identity across sessions. The gradient uses two hues derived from the address's bytes (after the version-byte prefix, for more visual variety).

Opt-in **Stellar Expert avatars** via the `stellar-expert-avatars="true"` attribute on `<stellar-appkit-modal>`. This fetches a generated PNG from `api.stellar.expert/explorer/public/account/{address}/avatar` — a public third-party service. The `<img>` `onerror` handler falls back to the gradient if the service is down or the account has no avatar. Off by default because it's a third-party request.

Priority: wallet-provided avatar → Stellar Expert (if enabled) → generated gradient.

### 2. Copy-to-clipboard everywhere

Previously, copy-to-clipboard was only on the active account in the connected panel. Now every address display has a copy button with per-address "copied!" feedback:

- **Connected sessions** — each session row has its own copy button
- **Account picker** — each account option has a copy button (with `event.stopPropagation()` so clicking copy doesn't also select the account)
- **Transaction preview** — the source account has a copy button

The `copyState` tracks which address was most recently copied, so the "copied!" checkmark feedback is per-button rather than global — copying address A doesn't show a checkmark on address B.

### 3. Smooth loading spinner (the "square border-radius" bug)

The connecting-state spinner previously used `border-radius: 11px` (a rounded rectangle) on the `::after` pseudo-element. When rotated, a rounded-square border wobbles visibly — the corners trace a larger radius than the edges, creating an uneven spin.

Fix: `border-radius: 50%` (a perfect circle). A circle traces a constant radius when rotated, so the spin is smooth. The `inset: -2px` positions the circle 2px larger than the 36px tile, so it sits just outside the tile's border and traces around it.

### 4. Contract verification badges in preview

The `ContractBadge[]` from `previewOptions.contractMetadata` (added in §8.8) is now rendered inline on contract call operations in the transaction preview. Badges with a `url` (e.g. audit report links) are clickable — open in a new tab. Badge colors follow the severity field:
- `success` (Verified, Audited) — green
- `info` (Published by X, extra badges) — muted
- `warning` / `danger` — amber / red (rare for badges, but supported)

The fee estimate from §8.8 is also surfaced in the preview — `Fee 0.00501 XLM` instead of the raw stroops count, when `feeEstimate` is populated.

---

## 8.10 WAAPI animation engine — zero-dependency open/close transitions

The modal ships with a native Web Animations API (WAAPI) transition system — no `motion`, `gsap`, or any other animation library. WAAPI is supported in every modern browser (Chrome 84+, Firefox 75+, Safari 13.1+) and runs off the main thread for transform/opacity, so transitions stay smooth even when JS is busy.

### File structure

```
packages/ui-web/src/ui-web/animations/
  index.ts              # public exports
  types.ts              # AnimationPresetName, ModalAnimationOption, AnimationPreset
  resolver.ts           # resolveAnimation(option, defaultOpen, defaultClose)
  reduced-motion.ts     # SSR-safe prefers-reduced-motion check
  presets/
    index.ts            # none, fade, scale, slide-left, implode
    scale-blur.ts       # default modal preset
    slide-up.ts         # default bottom-sheet preset
```

### Presets

| Name | Open | Close | Used by default |
|---|---|---|---|
| `none` | instant | instant | — |
| `fade` | opacity 0→1 | opacity 1→0 | — |
| `scale` | opacity 0→1, scale .92→1 | opacity 1→0, scale 1→.94 | — |
| `scale-blur` | opacity 0→1, scale .92→1, blur 12px→0 | opacity 1→0, scale 1→.94, blur 0→12px | modal (desktop) |
| `slide-up` | translateY 100%→0, opacity 0→1 | translateY 0→100%, opacity 1→0 | bottom-sheet (mobile) |
| `slide-left` | translateX 80px→0, opacity 0→1 | translateX 0→80px, opacity 1→0 | — |
| `implode` | scale 1.25 + rotate 8deg + blur 20px → scale 1 | reverse, with -4deg rotation on exit | — |

### Resolution priority

The `getResolvedAnimations()` method picks the animation config in this order:

1. HTML attributes `animation-open` / `animation-close` (most specific — per-direction override)
2. HTML attribute `animation` (single preset for both directions)
3. `StellarAppKit` config: `modal.animation` (programmatic, set once at construction time)
4. Mode-based defaults: `scale-blur` for `modal` / desktop `auto`, `slide-up` for `bottomsheet` / mobile `auto`

This means a consumer can set a global default via config, then override per-modal via HTML attributes — useful for special cases (e.g. a hero "implode" animation on a marketing page, but `scale-blur` everywhere else).

### Interruption handling

A single `activeAnimation: Animation | null` field tracks the in-flight WAAPI animation. `cancelActiveAnimation()` is called at the start of both `open()` and `close()` — so if the user opens while a close is in flight (or vice versa), the previous animation is cancelled cleanly rather than fighting the new one.

A 500ms safety timeout on `close()` ensures the modal tears down even if `onfinish` doesn't fire (which can happen if the element is removed mid-animation).

### Accessibility — `prefers-reduced-motion`

Every preset's `enter`/`exit` calls `prefersReducedMotion()` first. If the user has `prefers-reduced-motion: reduce` enabled, the preset returns `null` — the modal opens/closes instantly with no transition. The check is SSR-safe (returns `false` in Node.js, since `window.matchMedia` doesn't exist there).

### Coexistence with the drag-to-dismiss spring

The bottom-sheet's drag gesture uses a **separate** custom spring engine (`springTo()`, ~30 lines, native `requestAnimationFrame`). The two systems don't conflict because:

- **WAAPI** handles *programmatic* open/close (user clicks a button, presses Escape, or `.close()` is called from code)
- **Spring** handles *user-initiated* drag-to-dismiss (user grabs the sheet and pulls it down)

When a drag-dismiss completes, the spring has already animated the panel off-screen — so `close(true)` is called with `skipAnimation=true` to bypass the WAAPI exit (otherwise the WAAPI animation would jump the panel back to translateY(0) and slide it down again, causing a visible flash).

### Drag-to-dismiss pointer-capture fix

The bottom-sheet gesture handler uses `panel.setPointerCapture(pointerId)` so it keeps receiving `pointermove` events even when the pointer leaves the panel's bounds (e.g. dragged past the top of the viewport). However, this capture also redirects `pointerup` to the panel — which means a `click` event on a child button (like the close X) might not fire correctly.

**Fix:** `onPointerDown` checks `e.target.closest('button, a, [data-action], input, select, textarea, [contenteditable="true"]')`. If the pointerdown originated on an interactive element, drag setup is skipped entirely — the click event fires normally on the button, and the gesture system stays out of the way. This also handles overflow menu items, copy buttons, and any future interactive elements added to the panel.

---

## 8.11 Zero-config default connectors

`StellarAppKitConfig.connectors` is now optional. If omitted (or empty), the constructor calls `defaultConnectors()` — exported from `@saganta/stellar-appkit` — which returns instances of every bundled browser-side connector that doesn't require constructor-time configuration:

- `createFreighterConnector()`
- `createAlbedoConnector()`
- `createXBullConnector()`
- `createLedgerConnector()`

**WalletConnect is excluded** because `createWalletConnectConnector()` requires a `projectId` from your WalletConnect Cloud dashboard. Apps that need WalletConnect pass an explicit `connectors` list:

```ts
new StellarAppKit({
  network: 'PUBLIC',
  connectors: [
    ...defaultConnectors(),
    createWalletConnectConnector({ projectId: '...', networkPassphrase: Networks.PUBLIC }),
  ],
});
```

The connector factories themselves are lightweight — each connector lazy-imports its underlying SDK (e.g. `@stellar/freighter-api`) inside its methods, so importing the factory at the top of `client.ts` doesn't pull the heavy SDK code into the bundle for apps that explicitly pass their own connector list and never call `defaultConnectors()`.

---

## 8.12 Wallet list "Installed" badge

The wallet list previously showed an empty sub-label for installed, available wallets — making it visually ambiguous whether a wallet was actually ready to use or just present in the registry. The fix:

- `available` wallets → green pill labeled **"Installed"** (green-200 background `#d1fae5`, green-700 text `#047857`, green-300 border `#a7f3d0`)
- `not-installed` wallets → "Install" button (unchanged)
- `locked` / `unavailable` / `connecting` → status text (unchanged)

The badge uses a fixed green palette (not the theme's accent color) so the "ready to use" signal is consistent across light and dark themes — green = go, regardless of branding.

---

## 8.13 Auto-derived `appMetadata` — `normalizeAppMetadata()`

The `StellarAppKitConfig.appMetadata` field previously required all three fields (`name`, `domain`, `uri`) to be set explicitly. This was boilerplate — in the browser, the domain and URI are almost always just the current page's hostname and origin.

### What's optional now

- `name` — still required (used in the SIWS message header and the modal header)
- `domain` — **optional**. If omitted, auto-derived from `window.location.hostname`
- `uri` — **optional**. If omitted, auto-derived from `window.location.origin`

### Auto-formatting

When the user does pass `domain` or `uri` explicitly, they're auto-formatted to the canonical shape:

- `domain: "https://example.com"` → `"example.com"` (protocol stripped)
- `domain: "example.com/path"` → `"example.com"` (path stripped)
- `uri: "example.com"` → `"https://example.com"` (protocol added)
- `uri: "http://localhost:3000"` → unchanged (already has a protocol)

This lets users write `appMetadata: { name: 'Example App' }` in the browser and have the SIWS message automatically include the correct domain + URI without hardcoding them.

### SSR safety

In Node.js (no `window`), omitted `domain` and `uri` remain `undefined`. The `signIn()` method checks for their presence and throws a clear error if they're missing:

```
signIn() requires appMetadata.domain and appMetadata.uri. They're auto-derived
from window.location in the browser, but you're likely running in SSR/Node.js
where window is undefined. Pass them explicitly:
appMetadata: { name: 'My App', domain: 'example.com', uri: 'https://example.com' }.
```

### Implementation

The `normalizeAppMetadata()` function is exported from `@saganta/stellar-appkit` so it can be called directly (e.g. in a server context where you want to normalize user input before passing it to `StellarAppKit`).

```ts
import { normalizeAppMetadata } from '@saganta/stellar-appkit';

const meta = normalizeAppMetadata({
  name: 'Example App',
  domain: 'https://example.com',  // will be stripped to "example.com"
  uri: 'example.com',             // will be prefixed with "https://"
});
// → { name: 'Example App', domain: 'example.com', uri: 'https://example.com' }
```

---

## 8.14 `Networks` object — no `@stellar/stellar-sdk` needed for passphrases

The `StellarAppKit` config requires a `network` field (`'PUBLIC' | 'TESTNET' | 'FUTURENET' | 'STANDALONE'`) and an optional `networkPassphrase`. For the three well-known networks, the passphrase is auto-resolved from `network` — but the WalletConnect connector requires `networkPassphrase` explicitly (it's sent to the wallet during session proposal).

Previously, apps had to `import { Networks } from '@stellar/stellar-sdk'` just to get the passphrase string — pulling in the entire Stellar SDK (~1.4 MB) at the import site, even though only a 50-byte string was needed.

### Fix

`@saganta/stellar-appkit` now exports a `Networks` object with the four well-known passphrases, verified byte-for-byte against `@stellar/stellar-sdk`'s own export:

```ts
import { Networks } from '@saganta/stellar-appkit';

Networks.PUBLIC    // 'Public Global Stellar Network ; September 2015'
Networks.TESTNET   // 'Test SDF Network ; September 2015'
Networks.FUTURENET // 'Test SDF Future Network ; October 2022'
Networks.STANDALONE // 'Standalone Network ; February 2017'
```

Also exports `resolveNetworkPassphrase(network)` — returns the passphrase for well-known networks, `undefined` for `STANDALONE` (which has no built-in passphrase).

The `client.ts` `resolveNetworkPassphrase()` private method now calls this helper instead of the old inline `WELL_KNOWN_PASSPHRASES` constant (which has been removed).

---

## 8.15 WalletConnect QR rendering — `qr-code-styling` + late-bound `onUri`

The WalletConnect connector generates a pairing URI that the user must scan as a QR code with their wallet app. Previously, the app had to render this QR code itself — the modal showed a generic "Continue in WalletConnect" spinner with no QR code, which was confusing.

### Fix — three-part solution

**1. `setOnUri(fn)` on the WC connector**

The connector now exposes a `setOnUri(handler)` method that overwrites the `onUri` callback at runtime. The modal calls this before `connect()` to intercept the URI:

```ts
const wcConnector = connector as WalletConnector & { setOnUri?: (fn) => void };
if (typeof wcConnector.setOnUri === 'function') {
  wcConnector.setOnUri((uri) => {
    this.wcPairingUri = uri;
    this.render();
  });
}
```

The `onUri` option on `createWalletConnectConnector()` is now **optional** — when omitted, it defaults to a no-op. The modal overrides it via `setOnUri()`.

**2. `qr-code-styling` for QR rendering**

The modal uses [`qr-code-styling@^1.9.2`](https://www.npmjs.com/package/qr-code-styling) to render the pairing URI as an inline SVG with rounded modules and dot-style finder pattern centers — matching Reown's QR aesthetic. (Earlier versions used `better-qr`; it was replaced with `qr-code-styling` because it supports the styled module types — `dotsOptions.type: 'rounded'`, `cornersSquareOptions.type: 'extra-rounded'`, `cornersDotOptions.type: 'dot'` — without writing a custom QR renderer.)

```ts
import QRCodeStyling from 'qr-code-styling';

const qr = new QRCodeStyling({
  width: 256,
  height: 256,
  type: 'svg',
  data: uri,
  margin: 8,
  qrOptions: { errorCorrectionLevel: 'H' },
  dotsOptions:            { color: '#202020', type: 'rounded' },         // rounded data modules
  cornersSquareOptions:   { color: '#202020', type: 'extra-rounded' },    // rounded finder pattern outer rings
  cornersDotOptions:      { color: '#202020', type: 'dot' },              // circular finder pattern inner dots
  backgroundOptions:      { color: '#ffffff' },
});
qr.append(wcCanvas);
```

The SVG is embedded directly in the shadow DOM — zero network dependency (no external API calls like `api.qrserver.com`), works offline, no privacy leak. The SVG scales crisply at any size. High error-correction (`'H'`) is used so the wallet logo can be overlaid in the center without breaking scanability.

`qr-code-styling` is a runtime dependency of `@saganta/stellar-appkit-ui-web` — declared in `packages/ui-web/package.json`'s `dependencies`, installed automatically, lazy-imported inside the modal only when the WC connector is registered, tree-shaken out otherwise.

**3. Connecting view replacement**

When `wcPairingUri` is set, the connecting view replaces the generic spinner with:
- The QR code SVG (in a white rounded frame)
- The wallet logo centered on the QR code
- "Scan with WalletConnect" title
- "Open Hana, Lobstr, or Hot Wallet and scan this QR code to connect." subtitle
- "Open in wallet app" deep link button (for mobile)
- "Copy URI" button (with "Copied!" feedback)

Before the URI arrives, the subtitle shows "Generating pairing code…" instead of the misleading "Accept connection request in the wallet".

---

## 8.16 Automatic SIWS authentication flow — `SiwsConfig`

When `siws?: SiwsConfig` is set on the `StellarAppKit` config, the modal automatically triggers a Sign-In With Stellar flow immediately after the wallet connects — without closing the wallet UI.

### `SiwsConfig` type

```ts
interface SiwsConfig {
  statement: string;
  signoutOnDisconnect?: boolean;  // default true
  disconnectOnFail?: boolean;     // default true
  maxRetries?: number;            // default 3
  timeoutMs?: number;             // default 15000
  session: () => Promise<SiwsSession | null | undefined>;
  nonce: () => Promise<string>;
  verify: (data, nonce, context: { address, network }) => Promise<SiwsSession | null | undefined>;
  signout: () => Promise<boolean> | boolean;
  refresh?: () => Promise<SiwsSession | null | undefined>;
}

interface SiwsSession {
  network: string;
  address: string;
  expiry: number;  // epoch ms
  metadata?: Record<string, unknown>;
}
```

### Flow

1. Wallet connects (extension popup or WalletConnect QR)
2. Modal shows "Checking session…" → calls `session()`. If existing session matches wallet's address + network + not expired → skip to connected view
3. Modal shows "Fetching nonce…" → calls `nonce()` (with timeout)
4. Modal shows "Approve the sign-in request in [Wallet]" → calls `signIn()` (wallet prompts)
5. Modal shows "Verifying your signature…" → calls `verify(data, nonce, context)` (with timeout). Must return `SiwsSession` or `null`
6. Session validation — returned session's `address` + `network` + `expiry` validated against connected wallet
7. Success → session stored in localStorage + `siwsSession` getter, connected view
8. Failure → error + "Try again" (max 3 retries) + Cancel button

### Session persistence

- SIWS session stored in `localStorage` (`saganta-appkit:siws-session`)
- Restored on `appkit.restore()` alongside wallet sessions
- `siwsSession` getter auto-clears expired sessions
- `siwsSessionChange` event fires on set/clear/expire

### API methods on `StellarAppKit`

- `appkit.siwsSession` — getter, `SiwsSession | null` (auto-expiry)
- `appkit.setSiwsSession(session)` — setter (called by modal after verify)
- `appkit.clearSiwsSession()` — clears session + calls `signout()` if configured
- `appkit.signOut()` — clears session + `signout()` + disconnect wallet
- `appkit.requireAuth()` — throws `ConnectError` if not authenticated
- `appkit.validateSession()` — calls `refresh()` (or `session()`) to validate against server
- `appkit.reauthenticate()` — clears session + triggers re-auth

### Hooks (React)

- `useSiwsSession()` — reactive `SiwsSession | null`
- `useIsAuthenticated()` — reactive `boolean`

### Security

- Address binding: session address must match connected wallet
- Network binding: session network must match connected wallet
- Expiry auto-check: getter auto-clears expired sessions
- Signout on disconnect: `signoutOnDisconnect` (default true) prevents orphaned server sessions
- Timeout: prevents hanging on unresponsive servers (15s default)
- Retry limiting: max 3 attempts (configurable)

### Implementation

- `siwsPending` flag — true when SIWS required but not succeeded
- `siwsRetryCount` — tracks retry attempts
- `siwsCancelled` — set when user clicks Cancel
- `triggerSiwsFlow()` — called after `selectWallet()` or `pickAccount()` succeeds
- `withTimeout()` — wraps `nonce()` and `verify()` calls
- `handleSiwsFailure()` — shows error, increments retry count, does NOT disconnect
- `close()` — checks `siwsPending` + `disconnectOnFail` → disconnects after modal close
- 5 view states: `siws-checking`, `siws-nonce`, `siws-signing`, `siws-verifying`, `siws-error`

---

## 8.17 xBull web wallet fallback

The xBull connector now always returns `'available'` from `getReachability()`, even when the extension isn't detected. The xBull SDK bridge (`@creit.tech/xbull-wallet-connect`) automatically falls back to the xBull web wallet (`https://wallet.xbull.app`) when `window.xBullSDK` is absent.

Previously, `getReachability()` returned `'not-installed'` when the extension wasn't detected, which showed an "Install" button instead of letting the user connect via the web wallet.

The `waitForXBullExtension()` function still polls for injection (up to 5s) before `connect()`/`sign()` calls — giving the extension time to inject its SDK. But if it doesn't appear, the bridge's web wallet fallback kicks in automatically.

---

## 8.18 WalletConnect `metadata` + `networkPassphrase` optional

`createWalletConnectConnector()` now accepts just `{ projectId: '...' }` — `metadata` and `networkPassphrase` are optional:

- **`metadata`**: when omitted, derived from `window.location` (browser): `name` from hostname, `url` from origin, `description` auto-generated, `icons` empty.
- **`networkPassphrase`**: when omitted, derived from the `StellarAppKit` config's `network` field via the `Networks` map. The `StellarAppKit` constructor injects the network into the WC connector via `_setNetwork()`.

This means you can now write:
```ts
createWalletConnectConnector({ projectId: '...' })
```
instead of being forced to pass `metadata: { name, description, url, icons }` and `networkPassphrase: Networks.TESTNET`.

---

## 8.19 AI-readable files — `SKILL.md` and `llms.txt`

The repo ships two AI-readable files at the root so AI coding assistants (Cursor, GitHub Copilot, Claude Code, Windsurf, Continue) can produce correct Stellar AppKit code on the first try without the user pasting docs into chat. Both are included in the published npm tarball alongside `dist/` and `src/`, so once a consumer app has `@saganta/stellar-appkit` in its `package.json`, agents can read `llms.txt` straight from `node_modules/@saganta/stellar-appkit/llms.txt`.

### 1. `SKILL.md` — structured AI skill file

Follows the [skill file convention](https://llmstxt.org/) with YAML frontmatter:

```yaml
---
name: stellar-appkit
description: Build Stellar/Soroban dApps with unified wallet connections, transaction previews, and Soroban contract calls. Use when building a Stellar dApp frontend that needs wallet connection, transaction signing, Soroban smart contract interaction, or Sign-In With Stellar authentication.
license: MIT
---
```

The `description` is the trigger sentence — it's what an agent reads first to decide whether to load the rest of the file. After the frontmatter, the body covers:

- **When to use this skill** — concrete trigger conditions
- **Installation** — core package + per-connector and per-framework peer deps
- **Core patterns** — copy-pasteable code for: basic connection, signing transactions, Soroban contract calls, typed contract client, SIWS (client + server), React hooks, transaction preview configuration, RPC failover, error handling
- **Key API reference** — quick method lists for `StellarAppKit`, `SorobanConnection`, `verifySiws`
- **Available connectors** — table with function names and peer deps
- **SIWS signing per wallet** — table mapping each wallet to what bytes it actually signs (the most common source of bugs, so it gets its own table)
- **Theming** — CSS custom properties with example values
- **Links** — GitHub, docs, npm

Skill-aware agents (Claude Code with skills loaded, custom agent runtimes that follow the skill convention) use this file as a skill. Plain agents just read it as Markdown — it works either way.

### 2. `llms.txt` — compact plain-text API index

Follows the [llms.txt convention](https://llmstxt.org/). About 250 lines, structured for token-efficient recall — an agent can read it once and have enough context to write correct code for ~90% of use cases. Sections: header, install, quick start, wallet connection, signing, Soroban, SIWS verification, framework wrappers (React/Vue/Solid/Svelte — one snippet each), transaction preview, theming, error handling, tree-shaking, links.

### Why both files

They cover different consumption modes:

| File | Audience | Format | Optimized for |
|---|---|---|---|
| `SKILL.md` | Skill-aware agents | YAML frontmatter + structured Markdown | Triggering — "should I use this skill?" decisions, with code snippets for common patterns |
| `llms.txt` | Any LLM that reads repo files | Plain text, compact | API surface recall — install commands, hook names, method signatures, connector table |

### Maintenance contract

Both files are kept in sync with the API **in the same commit that changes the API**. If a connector's `signedData` shape changes, both files are updated together. If a new method is added to `StellarAppKit`, both files list it. This is enforced by review, not by automation — but it's part of the PR checklist.

### Docs site companion files

The documentation site at [stellar-appkit.saganta.com](https://stellar-appkit.saganta.com) serves its own companion files:

- `https://stellar-appkit.saganta.com/llms.txt` — compact index of every docs page (one line per page with a link)
- `https://stellar-appkit.saganta.com/llms-full.txt` — the full docs content concatenated into a single file (~160 lines), so an agent can read the entire docs in one fetch
- `https://stellar-appkit.saganta.com/reference/ai-integration/` — a human-readable docs page explaining both files and the recommended agent workflow

These are maintained in the [docs repo](https://github.com/sagantaHQ/stellar-appkit-docs), separately from the library's own `SKILL.md` and `llms.txt`.

### Live demos site

The demos site at [demos.stellar-appkit.saganta.com](https://demos.stellar-appkit.saganta.com) hosts 14 working Next.js demos covering wallet connection, transaction signing, Soroban contract calls, SIWS authentication, and theming. Each demo is a real route in the [demos repo](https://github.com/sagantaHQ/stellar-appkit-demos), built with Next.js 15 + OpenNext for Cloudflare Workers.

---

## 8.20 Named theme registry — 5 themes × dark/light variants

Earlier versions of the modal shipped exactly one theme: a dark variant with a Stellar-green `#6EE7B7` accent, plus a light variant. The default `theme="dark"` was used by almost every consumer, so the modal's green-accent-on-graphite look became a recognizable brand signal — which is the wrong default for a drop-in component that's supposed to look native inside any host app.

### Design

The theme system is now a small registry of **5 named themes**, each with a **dark** and **light** variant (10 theme objects total). Each theme is built by overriding only the `colorAccent` + `colorAccentText` tokens on top of a shared base palette — no other token varies, so adding a new theme is a 2-line change in `tokens.ts`.

**Base palette — zinc neutrals.** Both dark and light variants share the same neutral foundation (Apple / Linear / Vercel style):

| Token | Dark (`DARK_BASE`) | Light (`LIGHT_BASE`) |
|---|---|---|
| `colorBg` | `#09090B` (zinc-950) | `#FFFFFF` |
| `colorSurface` | `#18181B` (zinc-900) | `#F8F8F8` |
| `colorSurfaceHover` | `#27272A` (zinc-800) | `#F1F1F1` |
| `colorBorder` | `#27272A` (zinc-800) | `#E4E4E7` (zinc-200) |
| `colorText` | `#FAFAFA` (zinc-50) | `#18181B` (zinc-900) |
| `colorTextMuted` | `#A1A1AA` (zinc-400) | `#71717A` (zinc-500) |
| `colorDanger` | `#DC2626` | `#DC2626` |
| `colorAccentText` | `#09090B` (always near-black on dark themes — legible on light accents) | `#FFFFFF` (always white on light themes — legible on dark accents) |

**Named themes — accent-only overrides.** Each named theme only supplies a `dark` and `light` accent color:

| Theme | Accent (dark) | Accent (light) | Vibe |
|---|---|---|---|
| `minimal` (default) | `#FAFAFA` (zinc-50) | `#18181B` (zinc-900) | No brand color — fits any project |
| `stellar` | `#6EE7B7` (Stellar mint) | `#0E9A6E` | Stellar brand green |
| `sky` | `#38BDF8` (sky-400) | `#0EA5E9` (sky-500) | Open, friendly blue |
| `ocean` | `#60A5FA` (blue-400) | `#1D4ED8` (blue-700) | Serious, financial deep blue |
| `sunset` | `#FB7185` (rose-400) | `#E11D48` (rose-600) | Energetic coral/pink |

The `minimal` theme deliberately uses a *neutral* accent (near-white on dark, near-black on light) so the modal reads as "just a UI element" rather than "a Stellar-branded widget". The accent is still semantically meaningful — it's the color of the primary CTA, the active wallet row, focus rings — it's just not a brand color. Apps that *want* the Stellar brand look opt in with `theme="stellar"`.

### `theme` attribute resolution

`resolveTheme()` in `connect-modal.ts` accepts:

- **Named theme** (`'minimal'` | `'stellar'` | `'sky'` | `'ocean'` | `'sunset'`) — resolves to the **dark** variant by default.
- **Named theme with `:light` suffix** (e.g. `'sky:light'`, `'ocean:dark'`) — explicit variant override. The suffix is optional for dark, required for light.
- **`'auto'`** — follows `prefers-color-scheme: light`, resolving to `minimalLight` when light is preferred, `minimalDark` otherwise. Always resolves to the `minimal` theme (not the consumer's named theme) so the auto behavior is predictable — apps that want a specific named theme with auto color-scheme should render two `<stellar-appkit-modal>` instances and toggle visibility from their own `matchMedia` listener.
- **`'dark'` or `'light'`** — **backwards-compat**. Both map to `minimalDark` / `minimalLight` respectively. Consumers on older versions of the SDK whose HTML still has `theme="dark"` will see the new minimal palette instead of the old green-accent dark theme. Apps that want the old green look should migrate to `theme="stellar"`.
- **Omitted / unknown** — falls back to `minimalDark`.

### Exports

Resolved theme objects are exported from `@saganta/stellar-appkit-ui-web`:

```ts
import {
  minimalDark, minimalLight,
  stellarDark, stellarLight,
  skyDark, skyLight,
  oceanDark, oceanLight,
  sunsetDark, sunsetLight,
  THEME_NAMES,        // ['minimal', 'stellar', 'sky', 'ocean', 'sunset']
  THEME_REGISTRY,     // Record<ThemeName, { dark: ConnectTheme; light: ConnectTheme }>
  darkTheme,          // @deprecated alias for minimalDark (backwards compat)
  lightTheme,         // @deprecated alias for minimalLight (backwards compat)
} from '@saganta/stellar-appkit-ui-web';
```

The deprecated `darkTheme` / `lightTheme` exports are kept so existing consumers' imports don't break — they now point at `minimalDark` / `minimalLight` (which uses the neutral accent, not the old green). Consumers who want the old green-accent look should migrate to `stellarDark`.

### Implementation notes

- `BASE_TOKENS` (radii, fonts) is shared by both `DARK_BASE` and `LIGHT_BASE` — those tokens don't change between modes.
- `darkVariant(name)` and `lightVariant(name)` build a theme by spreading the appropriate base and overriding `colorAccent` + `colorAccentText`. This keeps each theme definition to ~2 lines instead of duplicating ~15 tokens per theme.
- The stylesheet is cached by `themeKey = colorBg|colorAccent|colorText` — `buildStyles(theme)` (which generates a ~1000-line CSS string) only runs when the theme actually changes, not on every `render()`.
- Theme objects are also passed to `themeHostDeclarations(theme)` to seed `:host` defaults for `::slotted` content that can't reach a `var()` declared deeper in the sheet.

---

## 8.21 Balance + transaction-history polling

The connected view shows the wallet's XLM balance and the 5 most recent transactions. Both come from Horizon — `accounts/{address}` for the balance + trustlines, `accounts/{address}/transactions` for the history. Calling Horizon once on connect isn't enough: the user might receive funds, sign a transaction in another tab, or have a pending funding request (see §8.22) that hasn't posted yet.

### Polling design

- **Interval:** 10 seconds. Frequent enough to feel live (a received payment shows up within ~10s of the sender's submission), not so frequent that it hammers Horizon's public API (6 requests/minute per modal instance — well under the rate limit).
- **Silent mode:** the poller calls `refreshAccountData(silent = true)`. In silent mode, the existing `cachedBalance` and `cachedTxHistory` stay rendered while the fetch is in flight; the new values replace them when the fetch resolves. The skeleton-loading shimmer only appears on the **initial** fetch (when `cachedBalance` is null), not on polls. This prevents a 200ms flash of "Loading…" every 10 seconds, which would look broken.
- **Lifecycle:** polling starts when the modal opens (`open()` → `startBalancePolling()`) and stops on close (`close()` → `stopBalancePolling()`), disconnect, or `destroy()`. The poller is a `setInterval` ID held on the modal instance; `stopBalancePolling()` calls `clearInterval` and nulls the reference. Re-opening the modal starts a fresh interval.
- **Guard:** every poll tick checks `this._client?.session && this.isOpen` before calling `refreshAccountData(true)`. If the user disconnected (or closed the modal between the tick and the fetch), the poll is a no-op.
- **Refresh after signing:** separate from the 10s poller, the `signQueueChange` handler in `wireEvents()` fires when a `signTransaction()` / `signAuthEntry()` / `signMessage()` resolves. If the queue empties and no error is set, the modal schedules a one-shot `setTimeout(() => void this.refreshAccountData(true), 2000)` — a 2-second delay lets Horizon index the new transaction before the refetch, so the user sees the new balance + the new row in transaction history immediately after signing.

### Why not WebSocket / SSE

Horizon's public API doesn't expose a stable streaming endpoint for account balances that's broadly usable across all networks (Testnet / Public / Futurenet). Streaming is also more fragile for the modal's lifecycle (reconnect on tab focus, reconnection backoff, etc.) than a 10s poll. The poller adds 6 requests/minute — acceptable for the UX gain, and the silent mode means users never see the requests happening.

### Implementation

```ts
private startBalancePolling() {
  if (this.balancePollInterval) return; // already polling
  this.balancePollInterval = setInterval(() => {
    if (this._client?.session && this.isOpen) {
      void this.refreshAccountData(true); // silent — no loading flash
    }
  }, 10_000);
}

private stopBalancePolling() {
  if (this.balancePollInterval) {
    clearInterval(this.balancePollInterval);
    this.balancePollInterval = null;
  }
}
```

The poller is started in `open()` and stopped in `close()` / `destroy()` / on disconnect. The post-signing refresh is a one-shot `setTimeout(…, 2000)` in the `signQueueChange` handler — it's not part of the poller, and it fires regardless of whether the modal is still open (the next render will be visible when the user re-opens the modal).

---

## 8.22 Friendbot integration — "Get Testnet funds" button

The connected view, when `session.network === 'TESTNET'`, renders a "Get Testnet funds" button next to the balance. Clicking it funds the connected address with 10,000 XLM via [friendbot.stellar.org](https://friendbot.stellar.org) — Testnet's faucet. The button is **Testnet-only**: Futurenet has a separate faucet URL, Standalone has none, and Public obviously doesn't either. The check is `session.network === 'TESTNET'` (exact match), not a broader `isTestnet` predicate.

### Why `fetch()` and not `window.open`

Older versions opened `https://friendbot.stellar.org/?addr=...` in a new tab via `window.open()`. This was bad UX:

- The new tab showed a raw JSON response (the funding transaction envelope) — confusing to non-developers.
- The user had to close the new tab and manually refresh the modal to see the new balance.
- The friendbot URL was exposed in the tab bar, which made it look like the app was sending the user to a third-party site.

The fix is a `fetch()` call from inside the modal:

```ts
const url = `https://friendbot.stellar.org/?addr=${encodeURIComponent(session.address)}`;
const res = await fetch(url);
if (!res.ok) throw new Error(`friendbot returned ${res.status}`);
// friendbot returns a JSON transaction envelope on success — we discard it.
// The balance polls below will pick up the new XLM.
```

The user never leaves the modal. The fetch is fire-and-forget from the user's perspective: success or failure both lead to the same UX (banner clears after ~3.5s, balance polls run).

### UX flow

1. User clicks "Get Testnet funds".
2. Modal sets `this.fundsRequested = true` and re-renders, revealing a "Funding requested…" banner in the balance section.
3. `fetch(url)` runs. The banner stays visible during the fetch.
4. On success or failure (catch block — friendbot returns non-200, network error, CORS, etc.), the banner is cleared after a 3.5-second timeout. There's no error UI — friendbot is a convenience feature, not a critical flow; if it's down or rate-limited, the user can retry.
5. **Automatic balance refresh** — three one-shot `setTimeout`s at 3s, 6s, and 10s after the click each call `refreshAccountData()`. Friendbot typically credits within 2-5s, but Horizon's index can lag by another 1-2s. The 3s + 6s + 10s schedule catches the credit without the user having to manually refresh. Each timeout guards against the user disconnecting or switching wallets in the meantime (compares `current.address !== session.address` and bails if the address changed).

### Why not poll continuously until the balance changes

The 3-poll schedule is finite and predictable — friendbot either succeeds within ~10s or it doesn't (in which case the user should retry). An open-ended "poll until balance changes" loop would either need an upper bound (same outcome, more code) or risk running forever if friendbot silently fails. The 3-poll schedule is the simplest implementation that handles the normal case (funds arrive within 10s) and degrades gracefully (if they don't, the user sees no change and can click the button again).

### Implementation

```ts
this.root.querySelector('[data-action="get-testnet-funds"]')?.addEventListener('click', async () => {
  const session = this._client?.session;
  if (!session || session.network !== 'TESTNET') return;

  const url = `https://friendbot.stellar.org/?addr=${encodeURIComponent(session.address)}`;

  this.fundsRequested = true;
  this.render();

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`friendbot returned ${res.status}`);
  } catch {
    // Fetch failed (network error, CORS, or friendbot down).
    // The banner will clear after the timeout — no error UI needed
    // since this is a convenience feature, not a critical flow.
  }

  window.setTimeout(() => {
    this.fundsRequested = false;
    this.render();
  }, 3500);

  [3000, 6000, 10000].forEach((delay) => {
    window.setTimeout(() => {
      const current = this._client?.session;
      if (!current || current.address !== session.address) return;
      void this.refreshAccountData();
    }, delay);
  });
});
```

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
| 2.0 | Soroban contract layer (§8.8) — typed contract client (`ContractClient<T>` from `stellar contract bindings`), RPC failover (`FailoverRpcServer` with health tracking + cooldown), contract verification badges (`PreviewOptions.contractMetadata` → `ContractBadge[]`), pre-simulate fee estimation (`FeeEstimate` on `previewInvoke()` + `estimateFee()`). 26 new tests (contract, rpc-failover, badges+fee). Total suite now 121 tests. | **done** |
| 2.1 | UI polish (§8.9) — wallet-provided avatars (`getAvatar()` on `WalletConnector` + deterministic gradient fallback + opt-in Stellar Expert avatars), copy-to-clipboard on all address displays (connected, account picker, transaction preview), smooth loading spinner (border-radius: 50% fix for the square-wobble bug), contract verification badges + fee estimate rendered in the transaction preview UI. 8 new tests (avatar utilities). Total suite now 134 tests. | **done** |
| 2.6 | AI-readable files (§8.10) — `SKILL.md` (structured AI skill file with YAML frontmatter, trigger conditions, code patterns, API tables) and `llms.txt` (compact plain-text API index following the llmstxt.org convention) shipped at the repo root and in the npm tarball, so AI coding tools (Cursor, Copilot, Claude Code, Windsurf, Continue) can read the full API surface from `node_modules` or the raw GitHub URL. Docs site serves its own `llms.txt` / `llms-full.txt` companion files plus an `AI Integration` reference page. | **done** |
| 2.7 | Framework-native modal components (§8.7) — `<StellarAppKitModal>` React component (`forwardRef` + `useImperativeHandle`), Vue component (`defineComponent` + `expose`), Solid component (with `ref` callback), and Svelte `use:stellarmodal` action. Shared prop types in `src/ui-web/modal-props.ts`. Components deliberately do NOT import `connect-modal.ts` (the Web Component class extends HTMLElement, undefined in pure-Node SSR) — consumers `import '@saganta/stellar-appkit/ui-web'` once at app entry. 18 new tests covering module structure, default exports, SSR safety, and the `stellarmodal` action contract. Total suite now 155 tests. | **done** |
| 2.8 | Bundled dependencies (§8.7 Dependency strategy) — moved all wallet SDKs (`@stellar/freighter-api`, `@albedo-link/intent`, `@creit.tech/xbull-wallet-connect`, `@ledgerhq/*`, `@walletconnect/sign-client`), the Stellar SDK (`@stellar/stellar-sdk`), and gesture libraries (`@use-gesture/vanilla`, `motion`) from `peerDependencies` to `dependencies` in `packages/core/package.json`. Consumers now do a single `npm install @saganta/stellar-appkit` — no more manual wallet SDK installs, no version-mismatch breakage. Frameworks (`react`/`vue`/`solid-js`/`svelte`) remain as optional peer deps because of the singleton constraint (two React copies break hooks). Version bumped to 0.2.0. | **done** |
| 2 | `ui-web` Web Components + theming, default dark theme, network-mismatch/account-switcher/account-picker/transaction-preview views | **done** |
| 2.5 | WalletConnect v2 relay adapter (covers Lobstr/Hana/Hot Wallet + QR flow) | **done** |
| 3 | `react-native` — `@saganta/stellar-appkit-react-native` (subpath exports `./ui`, `./albedo`, `./polyfills`, mirroring core's wrapper pattern). Headless entry re-exports all of core plus `defaultReactNativeConnectors()` (WalletConnect relay + optional Albedo WebView), `createAsyncStorage()` persistence, an MWA-style mobile-wallet deep-link registry (built-ins verified against the WalletConnect Explorer: Freighter `freighterwallet://`, LOBSTR `lobstr://`, HOT Wallet `hotwallet://`, Scopuly `scopuly://wc`, plus https universal-link fallbacks; extensible via `registerMobileWallet()`), and `isReactNativeRuntime()`. `./ui` ships the full modal (`AppKitModal` on `@gorhom/bottom-sheet`, named mobile wallet list with per-wallet branding — the connecting/account views show the peer wallet's real name/icon via `getSessionPeer()`, never a generic “WalletConnect” label — plus a `<WalletIcon>` that renders every icon format incl. SVG data URIs via react-native-svg, deep-link-first WC pairing view with QR fallback, v1.9.50 animation timings with AccessibilityInfo reduced-motion, account/error views, all 10 themes, core i18n); `./albedo` bridges Albedo's web confirm flow through an origin-locked `react-native-webview`; `./polyfills` installs Buffer + `crypto.getRandomValues` + WC RN compat in one call. Core made Metro-safe (pre-encoded icon constants, adaptive WebCrypto SHA-256 with js-sha256 fallback). 36 package tests; total suite 348. Runnable Expo Go demo (no native build): [SagantaHQ/stellar-appkit-RN-demo](https://github.com/SagantaHQ/stellar-appkit-RN-demo). | **done** (on npm since v1.9.51) |
| 3.5 | **Lynx.js support** — first-class [Lynx.js](https://lynxjs.org/) bindings. Same connectors, same Soroban pipeline, same SIWS flow, but with native rendering performance via Lynx's React-like component model. | planned |
| 3.7 | **Social login** — email/passwordless social login (Google, GitHub, etc.) that creates a non-custodial Stellar wallet under the hood. No seed phrases, no extensions — just sign in and transact. | planned |
| 3.8 | **Compliance (built-in KYC)** — optional KYC layer integrating with identity verification providers. Apps requiring compliance can gate transactions behind KYC without a separate verification flow. | planned |
| 4 | Ledger Soroban auth-entry signing | **done** |
| 5 | Smart-account/passkey signer as a native `WalletConnector` (Saganta embedded wallet), gas-sponsorship hook in the Soroban invoke pipeline | later |

---

## 10. What's scaffolded in this pass

`packages/core` — fully typed, working TypeScript for: unified types, the SEP-43-aligned error model, the connector registry, four real adapters (Freighter, Albedo, xBull, Ledger) plus a stub WalletConnect adapter to fill in with the relay client, the `StellarAppKit` unified facade (multi-session at the API level — see §1.5 above; the built-in modal UI is single-wallet), `SorobanConnection`, and the SIWS client. Its `ui-web/` subdirectory (published as the `@saganta/stellar-appkit/ui-web` subpath — see §8) implements the full modal/bottom-sheet/inline UI including the network-mismatch and account-picker views (the multi-wallet switcher view was removed when the connected view was redesigned to be single-wallet — see §8.9). This is the foundation every remaining UI package will sit on — worth reviewing the interface shapes in `types.ts` before further UI work, since changing them later is the expensive kind of change.

**Note (Phase 4):** Soroban auth-entry signing is now fully implemented in `SorobanConnection.invoke()`. The pipeline uses `@stellar/stellar-base`'s `authorizeEntry()` helper, which handles `HashIdPreimage` construction, SHA-256 hashing, local signature verification, and `ScVal` wrapping. The `signAuthEntries()` method walks `tx.operations[].auth[]`, finds entries with `SOROBAN_CREDENTIALS_ADDRESS` credentials bound to the connected wallet's address, and signs each via `wallet.signAuthEntry(preimageBase64, opts)`. The `transactionNeedsAuthEntrySigning()` function detects whether any unsigned address-credential entries exist before the pipeline branches. Ledger's `signAuthEntry` is also implemented — it sends the raw preimage bytes to the device via `signSorobanAuthorization()` (the device hashes on-device). This closes the last known stub in the Soroban invoke pipeline.

**Note (xBull extension detection):** the xBull connector now polls for `globalThis.xBullSDK` injection before every bridge call (`connect()`, `signTransaction()`, `signMessage()`). The xBull extension injects `window.xBullSDK` asynchronously via a content script — without polling, our code can race ahead of the injection, causing the SDK's bridge to silently fall back to opening the xBull web wallet popup even though the extension IS installed. The poll waits up to 2 seconds (configurable via `XBULL_EXTENSION_INJECTION_TIMEOUT_MS`); `getReachability()` now returns `'not-installed'` when the extension isn't detected after the timeout, rather than always returning `'available'` (which was misleading — it relied on the web-wallet fallback being functional, but users with the extension installed expected the extension UI, not a popup).

**Note (Phase 3 — React Native):** the RN package lives at `packages/react-native`, published as `@saganta/stellar-appkit-react-native`. Its headless entry re-exports all of core unchanged, so the same connectors/sessions/Soroban/SIWS surface works on native; `defaultReactNativeConnectors()` registers only what makes sense on a phone (WalletConnect relay first, optional Albedo via the `./albedo` WebView bridge) instead of core's browser set, whose `typeof window` guards were written for SSR and are meaningless on RN (RN *defines* `window`). The mobile wallet handoff follows the Solana-Mobile-Adapter pattern: tapping a registered wallet embeds the `wc:` pairing URI into the wallet's own scheme (`freighterwallet://wc?uri=…`) and hands off via `Linking`; QR remains the fallback for wallets without a documented deep link (LOBSTR today). Two integration realities surfaced while building the Expo Go demo ([SagantaHQ/stellar-appkit-RN-demo](https://github.com/SagantaHQ/stellar-appkit-RN-demo)): (a) `react-native-get-random-values` is a native module absent from Expo Go — the demo shims `crypto.getRandomValues` from `expo-crypto` first so `installPolyfills()` never touches it; (b) Metro statically resolves every visible `import()`, so core's lazily-imported Trezor peers (`@trezor/connect-web`) must be installable or stubbed at bundle time, and `@stellar/stellar-sdk`'s native `exports` resolution picks its Node build (whose `eventsource` needs Node builtins) — the demo's `metro.config.js` documents both workarounds. Neither affects the web SDK; folding cleaner answers into core (e.g. an RN-trimmed re-export barrel) is a candidate for a follow-up release.
