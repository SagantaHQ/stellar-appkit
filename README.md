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
- **Typed contract client** — `soroban.contract<T>('C...', { specEntries })` returns a typed client whose methods are derived from your TS interface, so `client.transfer({ from, to, amount })` is fully typed. No manual `xdr.ScVal` construction.
- **RPC failover** — pass `rpcUrls: [...]` instead of `rpcUrl: '...'` and the connection transparently fails over to the next provider on network/5xx errors, with 30s health cooldowns. Useful for production resilience against single-provider outages.
- **Contract verification badges** — `previewOptions.contractMetadata` lets your app surface "Verified", "Audited", "Published by X" badges on contracts in the preview UI, with audit URLs. Separate from `verifiedContracts` (risk flags) — badges are positive trust signals.
- **Pre-simulate fee estimation** — `previewInvoke()` and `estimateFee()` return a `FeeEstimate` with the base fee, Soroban resource fee, instruction count, and total in stroops + XLM — shown before the user signs, not just after.
- Low-level escape hatches (`simulate`, `prepare`, `submit`, `pollStatus`) for anything `invoke()` doesn't cover

**UI**
- `<saganta-appkit-modal>` — a Shadow DOM Web Component, framework-agnostic, zero runtime dependency
- Modal (desktop), bottom-sheet (mobile web), and inline (embedded, no overlay) presentation, auto-selected by viewport or forced via attribute
- Every color/radius/font is a themeable CSS custom property that crosses the shadow boundary — restyle from your own stylesheet, no JS API needed
- Account switcher, account picker (multi-account wallets), network-mismatch view, and transaction-preview view all built in

**Framework wrappers**
- React (`@saganta/stellar-appkit/react`) — `<StellarAppKitProvider>` + hooks (`useAppKit`, `useConnect`, `useSession`, `useSignTransaction`, `useSignMessage`, `useSignIn`, `useSoroban`, `usePreviewTransaction`, `usePreviewAuthEntry`) using `useSyncExternalStore` for tearing-safe reactivity under React 18 concurrent rendering
- Vue (`@saganta/stellar-appkit/vue`) — `StellarAppKitPlugin` (for `app.use()`) or `provideStellarAppKit()` + Composition API composables with the same surface, using `shallowRef` + `shallowReadonly` to avoid deep reactivity overhead
- Solid (`@saganta/stellar-appkit/solid`) — `<StellarAppKitProvider>` + hooks using `createSignal`/`createMemo`/`onCleanup` for fine-grained reactivity
- Svelte (`@saganta/stellar-appkit/svelte`) — `setStellarAppKitContext()` + store-based composables (`useSessionStore`, `useConnectStore`, ...) that work in both Svelte 4 and Svelte 5; short aliases (`useSession`, `useConnect`) are provided for Svelte 5 runes-style code
- Each wrapper is a separate subpath export — bundlers only pull in the framework code you actually import. A React app never pays for Vue/Svelte/Solid.

---

## Packages

| Package | What it is |
|---|---|
| [`@saganta/stellar-appkit`](./packages/core) | Unified Stellar wallet connections, Soroban, and transaction preview — the core SDK. Includes the themeable `<saganta-appkit-modal>` Web Component at the `/ui-web` subpath, plus framework wrappers at `/react`, `/vue`, `/solid`, `/svelte` — all separate entry points, so importing only the core client never pulls in UI or framework code. |
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

For testing an in-development version before it's published to npm, install directly from the GitHub repo. **The recommended path is Pattern 3 (local link) for active development** — direct git URLs work for the core package but not for siws-verify (it depends on core via a workspace symlink that a direct git install doesn't set up).

**Pattern 1 — Install a specific commit of the core package:**

```bash
npm install SagantaHQ/stellar-appkit#<commit-sha> --save
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
npm install SagantaHQ/stellar-appkit#main --save
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
- **"Cannot find module '@stellar/freighter-api'"** — the wallet SDK peer dependencies aren't auto-installed. Install them in your consumer app as listed above.
- **TypeScript types not picked up** — make sure your consumer app's `tsconfig.json` has `"moduleResolution": "Bundler"` or `"Node16"`/`"NodeNext"` (the package uses subpath exports that older resolutions don't follow).
- **`@saganta/stellar-appkit-siws-verify` fails to resolve `@saganta/stellar-appkit`** — the siws-verify package depends on core, but a direct git install doesn't set up the workspace symlink between them. **siws-verify cannot be installed via direct git URL** — use Pattern 3 (local link) for it, or wait for the next npm publish.

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
      appMetadata: { name: 'My App', domain: 'app.example.com', uri: 'https://app.example.com' },
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
  appMetadata: { name: 'My App', domain: 'app.example.com', uri: 'https://app.example.com' },
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
    appMetadata: { name: 'My App', domain: 'app.example.com', uri: 'https://app.example.com' },
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
      decode.ts                  # transaction decoding + risk flags + balance deltas
      siws.ts                      # Sign-In With Stellar client
      tab-sync.ts                    # BroadcastChannel cross-tab sync
      storage.ts, events.ts            # session persistence, typed event emitter
      ui-web/                            # @saganta/stellar-appkit/ui-web — separate subpath export, not bundled into the main entry
        connect-modal.ts                   # the <saganta-appkit-modal> custom element
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

Each package's `package.json` has an explicit `"files": ["dist", "src"]`. This matters more than it looks: `dist/` is (correctly) gitignored, but with no `.npmignore` or `files` override, `npm publish` falls back to `.gitignore` rules too — which silently excluded `dist/` from every published tarball, shipping packages whose `main`/`types` fields pointed at files that didn't exist. Verify with `npm pack --dry-run` inside a package directory before publishing; it should list `dist/*` files, not just `src/*.ts`. (The published npm package includes `dist/`, so consumers installing from npm don't need to build — only consumers installing directly from a git URL do, see above.)

The workspace-internal dependency (`siws-verify` depends on `@saganta/stellar-appkit`) is pinned to `^0.1.0`, not a bare `*` — a real version range on a real published package, not just something that happens to resolve inside this monorepo via workspace linking. This monorepo publishes exactly two packages — `npm publish --workspaces` from the root handles both in one command (it automatically skips the root itself, since that's `"private": true`).

---

## Known limitations

Flagged explicitly rather than silently half-working:

- **WalletConnect adapter isn't implemented** — the shape exists (`createWalletConnectConnector`), every method throws with a pointer to what's needed. Blocks Lobstr, Hana, Hot Wallet, and mobile deep-linking.
- **Ledger Soroban auth-entry signing is stubbed** — reconstructing a valid `SorobanAuthorizationEntry` from a raw device signature needs a specific ScVal credentials structure that wasn't guessed at rather than risk shipping something that produces invalid auth entries. Plain transaction signing and public-key/multi-account derivation both work. (Standalone `signAuthEntry()` from app-supplied XDR works end-to-end with preview — only the *production* of signed auth entries inside `SorobanConnection.invoke()` is stubbed.)
- **Ledger's `signTransaction` payload shape** is implemented against the most standard pattern but isn't 100% confirmed from published docs alone — worth checking against your installed `@ledgerhq/hw-app-str` version before production use.
- **"Locked" reachability isn't detected for Freighter** — the freighter-api SDK doesn't expose a distinct unlock-state check, so it reports `'available'` once installed, even if locked. xBull's reachability now correctly reports `'not-installed'` when the extension isn't detected (previously always reported `'available'` due to the web-wallet fallback).
- **Freighter hash-signing mode** — Freighter v5+ has an experimental `isHashSigningEnabled` flag that, when on, causes the wallet to sign SHA-256 of the message rather than the raw UTF-8 bytes. The verifier tries both `utf8(message)` and `sha256(utf8(message))` as candidates, so SIWS verification works regardless of the flag's state. There's a small cryptographic tradeoff (an attacker who could find a SHA-256 second-preimage could pass verification), but this is not a realistic threat for SIWS (the message includes a server-issued nonce and expiry).
- **xBull doesn't support Soroban auth-entry signing** — the underlying message protocol has an internal concept for it (`xdrType: 'Transaction' | 'AuthEntry'`), but the public `sign()` method doesn't expose a way to select it, so there's no reliable way to request it through the published SDK today.
- **No React Native UI** — `core` is platform-agnostic already (inject a `ConnectStorage`), but there's no native bottom-sheet package yet.

---

## Roadmap

1. WalletConnect v2 relay adapter — Lobstr, Hana, Hot Wallet, mobile deep-linking
2. `ui-react-native` — bottom sheet, Expo compatibility
3. Ledger Soroban auth-entry signing
4. Smart-account/passkey signer as a native `WalletConnector` (Saganta's embedded wallet), gas-sponsorship hook in the Soroban invoke pipeline

Full detail in [ARCHITECTURE.md §9](./ARCHITECTURE.md#9-phased-roadmap).

---

## License

GPL-3.0-or-later — see [LICENSE](./LICENSE). (Earlier drafts of this README said MIT; that was wrong, not a deliberate relicensing — the committed `LICENSE` file has always been GPLv3. Worth a deliberate decision if an SDK meant to be embedded in other people's apps is what you actually want under copyleft terms, since that has real implications for anyone adopting it.)
