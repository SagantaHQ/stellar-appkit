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

That's it — all wallet SDKs (`@stellar/stellar-sdk`, `@stellar/freighter-api`, `@albedo-link/intent`, `@creit.tech/xbull-wallet-connect`, `@ledgerhq/*`, `@walletconnect/sign-client`) and gesture libraries (`@use-gesture/vanilla`, `motion`) are bundled as regular dependencies. They're installed automatically, version-locked to known-working ranges, and tree-shaken out of your bundle if you don't use the corresponding connector.

For framework wrappers (install the one for your framework — they're optional peer deps):
```bash
npm install react react-dom    # @saganta/stellar-appkit/react
npm install vue                # @saganta/stellar-appkit/vue
npm install solid-js           # @saganta/stellar-appkit/solid
npm install svelte             # @saganta/stellar-appkit/svelte
```

Frameworks must remain as peer deps because your app already has its own framework instance — two copies of React would break hooks. The wallet SDKs and gesture libs don't have this singleton constraint, so they're safe to bundle.

## Core patterns

### Basic wallet connection

```ts
import { StellarAppKit, createFreighterConnector } from '@saganta/stellar-appkit';
import '@saganta/stellar-appkit-ui-web';

const appkit = new StellarAppKit({
  network: 'TESTNET', // or 'PUBLIC'
  connectors: [createFreighterConnector()],
  appMetadata: { name: 'My App', domain: 'app.example.com', uri: 'https://app.example.com' },
});

const modal = document.querySelector('saganta-appkit-modal');
modal.client = appkit;

connectButton.addEventListener('click', () => modal.open());
await appkit.restore(); // resume persisted session
```

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
  statement: 'Sign in to My App',
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

Each framework wrapper ships a typed component wrapping the `<saganta-appkit-modal>` Web Component. Use it in place of the raw custom element when you want typed props, automatic client wiring, and event forwarding. **Always import `@saganta/stellar-appkit/ui-web` once at your app entry** to register the custom element — the framework wrappers don't import it themselves (keeps them SSR-safe).

**React:**

```tsx
import { useRef } from 'react';
import { StellarAppKitProvider, StellarAppKitModal, useAppKit } from '@saganta/stellar-appkit-ui-web/react';
import type { StellarAppKitModalHandle } from '@saganta/stellar-appkit-ui-web/react';
import '@saganta/stellar-appkit-ui-web'; // registers <saganta-appkit-modal>

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
      <StellarAppKitModal ref={ref} mode="auto" theme="dark" />
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
  <StellarAppKitModal ref="modal" mode="auto" theme="dark"
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
      <StellarAppKitModal ref={(h) => (handle = h)} mode="auto" theme="dark" />
      <button onClick={() => handle?.open()}>Connect</button>
    </>
  );
}
```

**Svelte** (uses a `use:stellarmodal` action on the raw `<saganta-appkit-modal>` element — most idiomatic for Svelte):

```svelte
<script lang="ts">
  import { setStellarAppKitContext, stellarmodal, openModal } from '@saganta/stellar-appkit-ui-web/svelte';
  import '@saganta/stellar-appkit-ui-web';
  setStellarAppKitContext({ network: 'TESTNET', connectors: [...] });
  let modalEl: HTMLElement;
</script>

<saganta-appkit-modal use:stellarmodal bind:this={modalEl} mode="auto" theme="dark"
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
- `StellarAppKitModal` (React/Solid/Vue) — typed component wrapping `<saganta-appkit-modal>`
- `stellarmodal` (Svelte) — `use:stellarmodal` action on the raw `<saganta-appkit-modal>` element
- `openModal(node)` / `closeModal(node)` (Svelte) — imperative helpers
- Props: `mode`, `theme`, `branding`, `logoSrc`, `title`, `autoRetryNetwork`, `stellarExpertAvatars`
- Events: `onConnect` / `onDisconnect` / `onError` (React/Solid), `@connect` / `@disconnect` / `@error` (Vue), `on:sc-connect` / `on:sc-disconnect` / `on:sc-error` (Svelte on raw element)
- Imperative handle: `open()`, `close()`, `element` (via `ref` in React/Solid/Vue)
- **Requires** `import '@saganta/stellar-appkit/ui-web'` once at app entry to register the custom element

## Available connectors

All wallet SDKs are bundled as regular dependencies — no manual install needed. Tree-shaken out of your bundle if the connector isn't imported.

| Connector | Function | Bundled SDK |
|---|---|---|
| Freighter | `createFreighterConnector()` | `@stellar/freighter-api` |
| Albedo | `createAlbedoConnector()` | `@albedo-link/intent` |
| xBull | `createXBullConnector()` | `@creit.tech/xbull-wallet-connect` |
| Ledger | `createLedgerConnector()` | `@ledgerhq/hw-app-str` + `hw-transport-webhid` + `hw-transport-webusb` |
| WalletConnect | `createWalletConnectConnector(opts)` | `@walletconnect/sign-client` |

## SIWS signing per wallet

| Wallet | What gets signed | `signedData` |
|---|---|---|
| Freighter | `sha256("Stellar Signed Message:\n" + message)` (SEP-0053) | Base64 of the hash |
| Albedo | `res.signed_message` (server-derived hash) | Base64 of hex-decoded bytes |
| xBull | `utf8(message)` (best-effort) | Base64 of UTF-8 bytes |
| Ledger | `utf8(message)` (direct signer) | Base64 of UTF-8 bytes |

## Theming

```css
saganta-appkit-modal {
  --sak-color-bg: #0B0D0E;
  --sak-color-surface: #14171A;
  --sak-color-accent: #6EE7B7;
  --sak-color-text: #F5F6F7;
  --sak-radius-lg: 20px;
  --sak-font-display: 'Geist Sans', sans-serif;
  --sak-font-mono: 'Geist Mono', monospace;
}
```

## Links

- [GitHub](https://github.com/SagantaHQ/stellar-appkit)
- [Documentation](https://stellar-appkit.saganta.com)
- [Live Demos](https://demos.stellar-appkit.saganta.com)
- [npm](https://www.npmjs.com/package/@saganta/stellar-appkit)
