# @saganta/stellar-appkit-ui-web

> Web UI for @saganta/stellar-appkit — Shadow DOM modal, framework wrappers for React, Vue, Solid, and Svelte.

[![npm version](https://img.shields.io/npm/v/@saganta/stellar-appkit-ui-web.svg)](https://www.npmjs.com/package/@saganta/stellar-appkit-ui-web)
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
npm install @saganta/stellar-appkit-ui-web @saganta/stellar-appkit
```

## What's included

### The `<stellar-appkit-modal>` Web Component

A Shadow DOM modal that handles wallet selection, transaction preview, signing, and the connected view. Works in any framework (or no framework).

```ts
import '@saganta/stellar-appkit-ui-web'; // registers <stellar-appkit-modal>

const modal = document.querySelector('stellar-appkit-modal');
modal.client = appkit;
await modal.open();
```

**Presentation modes:** `auto` (modal on desktop, bottom-sheet on mobile), `modal`, `bottomsheet`, `inline`.

**Animation presets:** `none`, `fade`, `scale`, `scale-blur`, `slide-up`, `slide-left`, `implode`. Separate open/close presets via object form.

**Instant wallet list (progressive reachability):** `open()` renders the full wallet list immediately — every row paints in a neutral "Checking…" state and settles in place the moment its own reachability check resolves (`ui-web/wallet-list.ts`). A slow check (e.g. Freighter's 3-second extension timeout when the wallet isn't installed) delays only its own row, never the modal or the list. Clicking a row before its check settles is safe — reachability is re-resolved at click time before anything happens.

**Theming:** 30+ CSS custom properties (`--sak-color-accent`, `--sak-radius-lg`, etc.) or the `theme="light|dark"` attribute.

### Framework wrappers

Each wrapper provides a `<StellarAppKitModal>` component + reactive hooks/composables/stores:

#### React

```tsx
import {
  StellarAppKitProvider,
  StellarAppKitModal,
  useConnect,
  useSession,
  useSiwsSession,
  useIsAuthenticated,
  useLocale,
  useSetLocale,
} from '@saganta/stellar-appkit-ui-web/react';

export function App() {
  return (
    <StellarAppKitProvider config={{
      network: 'TESTNET',
      appMetadata: { name: 'My App', url: 'https://app.example.com' },
    }}>
      <Header />
      <StellarAppKitModal mode="auto" theme="dark" />
    </StellarAppKitProvider>
  );
}
```

#### Vue 3

```ts
import { provideStellarAppKit, StellarAppKitModal } from '@saganta/stellar-appkit-ui-web/vue';
```

#### Solid

```tsx
import { StellarAppKitProvider, StellarAppKitModal } from '@saganta/stellar-appkit-ui-web/solid';
```

#### Svelte

```svelte
<script>
  import { stellarmodal } from '@saganta/stellar-appkit-ui-web/svelte';
</script>

<div use:stellarmodal={{ client: appkit, mode: 'auto' }} />
```

### Hooks / composables / stores

| Hook | Returns | Re-renders on |
|---|---|---|
| `useAppKit()` | The `StellarAppKit` client instance | Every status/session/queue change |
| `useSession()` | Active `ConnectSession \| null` | Connect / disconnect / switch |
| `useConnect()` | `{ connect, disconnect, isConnected, isConnecting }` | Status + error |
| `useSignTransaction()` | `{ sign, isSigning, data, error }` | Sign lifecycle |
| `useSignMessage()` | `{ sign, isSigning, data, error }` | Sign lifecycle |
| `useSignIn()` | `{ sign, isSigning, data, error }` | Sign lifecycle |
| `useSoroban()` | `{ invoke, previewInvoke, estimateFee, contract }` | Invoke lifecycle |
| `usePreviewTransaction()` | `{ preview, respond, isPending }` | Preview pending / resolved |
| `useSiwsSession()` | `SiwsSession \| null` (v1.7.0+) | SIWS session change |
| `useIsAuthenticated()` | `boolean` (v1.7.0+) | SIWS session change |
| `useLocale()` | `LocaleCode` (v1.8.0+) | Locale change |
| `useSetLocale()` | `(locale) => Promise<void>` (v1.8.0+) | Stable |

## Documentation

- **[Full docs](https://stellar-appkit.saganta.com)** — modal, bottom-sheet, animations, theming, all hooks
- **[Live demos](https://demos.stellar-appkit.saganta.com)** — modal modes, animations, theming showcase, i18n
- **[React guide](https://stellar-appkit.saganta.com/wrappers/react/)** — complete React walkthrough
- **[Modal docs](https://stellar-appkit.saganta.com/ui/modal/)** — all attributes, events, presentation modes

## License

MIT © [Saganta](https://github.com/saganta)
