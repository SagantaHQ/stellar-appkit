# @saganta/stellar-appkit-react-native

React Native support for [Stellar AppKit](https://github.com/SagantaHQ/stellar-appkit) — the same client, the same connectors, the same modal UX as the web SDK, adapted to native.

- **WalletConnect mobile-first** — tap a wallet, we embed the pairing URI into its deep link (`freighterwallet://wc?uri=...`) and hand off to the wallet app, Solana-Mobile-Adapter style. QR remains the fallback for every other wallet (LOBSTR, desktop pairings).
- **Albedo WebView bridge** — Albedo's web confirm flow, reproduced inside an in-app WebView (`window.opener` shim + synthetic MessageEvents — the exact popup protocol).
- **AsyncStorage persistence** — sessions survive app restarts via a first-class `ConnectStorage` adapter.
- **Full modal parity** — bottom-sheet modal (`@gorhom/bottom-sheet`), wallet list with live reachability, connecting/signing animations (same v1.9.50 timings as web, reduced-motion aware via `AccessibilityInfo`), account view, error states, i18n (25 locales).

## Install

```bash
npm install @saganta/stellar-appkit-react-native \
  @walletconnect/react-native-compat \
  @react-native-async-storage/async-storage \
  @gorhom/bottom-sheet react-native-svg react-native-qrcode-svg \
  buffer react-native-get-random-values
# only if you use the Albedo WebView bridge:
npm install react-native-webview
```

## Setup

```ts
// index.js — FIRST import in the app
import { installPolyfills } from '@saganta/stellar-appkit-react-native/polyfills';
installPolyfills();
```

```tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useMemo } from 'react';
import {
  StellarAppKit,
  defaultReactNativeConnectors,
  createAsyncStorage,
} from '@saganta/stellar-appkit-react-native';
import { createAlbedoWebViewBridge } from '@saganta/stellar-appkit-react-native/albedo';
import { AppKitModal } from '@saganta/stellar-appkit-react-native/ui';

export const [albedoView, setAlbedoView] = useState<React.ReactElement | null>(null);

const appkit = new StellarAppKit({
  network: 'TESTNET',
  appMetadata: { name: 'My App', url: 'https://myapp.example' }, // url is required on RN (no window.location)
  storage: createAsyncStorage(AsyncStorage),                     // sessions persist across restarts
  connectors: defaultReactNativeConnectors({
    projectId: '<WalletConnect Cloud project ID>',
    storage: createAsyncStorage(AsyncStorage),
    albedoBridge: createAlbedoWebViewBridge(setAlbedoView),      // optional — requires react-native-webview
    albedoOrigin: 'https://myapp.example',
  }),
});

export function App() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button title="Connect" onPress={() => setOpen(true)} />
      {open && <AppKitModal client={appkit} open={open} onClose={() => setOpen(false)} />}
      {albedoView}
    </>
  );
}
```

## The WalletConnect mobile flow

When the user taps **WalletConnect**, the modal switches to a pairing view:

1. **Deep-link wallets first** — every wallet in the registry (Freighter Mobile out of the box) is offered as a one-tap handoff. The `wc:` pairing URI is embedded into `<scheme>://wc?uri=<encoded>` and opened with `Linking.openURL()`. The wallet opens with the pairing pre-loaded; approve there and the session completes over the WalletConnect relay.
2. **QR fallback** — for wallets without a registered deep link (LOBSTR today), toggle the QR and scan from the wallet app.

Add wallets as they ship deep-link support — no AppKit release needed:

```ts
import { registerMobileWallet } from '@saganta/stellar-appkit-react-native';

registerMobileWallet({
  id: 'lobstr-mobile',
  name: 'LOBSTR',
  icon: lobstrIcon,
  scheme: 'lobstr',
  installUrl: { ios: '...', android: '...' },
});
```

## Headless usage (no modal)

```ts
import { StellarAppKit, defaultReactNativeConnectors, buildWalletConnectDeepLink } from '@saganta/stellar-appkit-react-native';

const appkit = new StellarAppKit({
  network: 'TESTNET',
  appMetadata: { name: 'My App', url: 'https://myapp.example' },
  storage: createAsyncStorage(AsyncStorage),
  connectors: defaultReactNativeConnectors({
    projectId: '<project id>',
    onUri: (uri) => Linking.openURL(buildWalletConnectDeepLink('freighter-mobile', uri)),
  }),
});
```

## Why polyfills?

`@stellar/stellar-sdk` (v13) needs `Buffer`; ed25519 + WalletConnect need `crypto.getRandomValues`. Neither exists in Hermes/JSC. `installPolyfills()` installs both (plus the WalletConnect AsyncStorage shims) — core itself needs no polyfills at import time since v1.9.51.

## Subpath exports

| Entry | Contents |
|---|---|
| `@saganta/stellar-appkit-react-native` | Core re-exports + RN connector set, storage adapters, deep-link registry, platform detection |
| `.../polyfills` | `installPolyfills()` |
| `.../ui` | `AppKitModal`, `useAppKit`, themes (5 × dark/light) |
| `.../albedo` | `createAlbedoWebViewBridge` + `AlbedoWebViewScreen` (requires `react-native-webview`) |

## Requirements

React Native ≥ 0.73 · React ≥ 18 · `@walletconnect/react-native-compat` for WalletConnect. See `peerDependencies` for the full list.

Documentation: [stellar-appkit.saganta.com](https://stellar-appkit.saganta.com) · Web SDK: `@saganta/stellar-appkit-ui-web`
