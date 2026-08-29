# @saganta/stellar-appkit-react-native

React Native support for [Stellar AppKit](https://github.com/SagantaHQ/stellar-appkit) — the same client, the same connectors, the same modal UX as the web SDK, adapted to native.

- **Deep-link-only pairing, full wallet registry** — every consumer wallet registered against WalletConnect's Stellar namespace ships built-in: the featured **Freighter, LOBSTR, HOT Wallet, Scopuly** plus 17 multichain wallets (SafePal, Blockchain.com, Arculus, Atomic Wallet, COCA, Trustee, MaxWallet, Zypto, Hero, UKey, ECOIN, SwiftEx, Panaroma, Kotai, Cryptokara, UKISS Hub, SOC) under a collapsible "More wallets" section. Tap one and we embed the pairing URI into its deep link (`freighterwallet://wc?uri=...`, WalletConnect-modal compatible) and hand off to the wallet app, Solana-Mobile-Adapter style — branded with the wallet's own name and icon throughout. On a phone the same device would have to scan a QR code, so the modal never renders one; a "Copy pairing code" fallback covers wallets with manual pairing fields.
- **True wallet names** — WalletConnect sessions capture the peer wallet's metadata, so the connecting and account views show "Freighter" or "HOT Wallet", never a generic "WalletConnect" label.
- **Albedo WebView bridge** — Albedo's web confirm flow, reproduced inside an in-app WebView (`window.opener` shim + synthetic MessageEvents — the exact popup protocol).
- **AsyncStorage persistence** — sessions survive app restarts via a first-class `ConnectStorage` adapter.
- **Full modal parity** — bottom-sheet modal (`@gorhom/bottom-sheet`), wallet list with live reachability, connecting/signing animations (same v1.9.50 timings as web, reduced-motion aware via `AccessibilityInfo`), account view, error states, i18n (25 locales).
- **Icons that render — no SVG library** — RN's `Image` can't rasterize SVG, so instead of pulling in `react-native-svg` (a large native dependency), every wallet logo is pre-rasterized as a compressed 128×128 palette PNG with alpha (~30 KB for all 21, bundled as base64 literals). `<WalletIcon>` resolves icons by wallet key → bundled PNG, renders raster sources natively, matches WalletConnect peer names ("Freighter" → Freighter logo), and falls back to a branded letter avatar.
- **`<QrCodeView>` remains exported** — a vendored pure-JS QR encoder drawn with plain React Native Views (no `react-native-qrcode-svg`) for apps that build their own tablet/desktop-style pairing screens; the modal itself doesn't use it.

## Install

```bash
npm install @saganta/stellar-appkit-react-native \
  @walletconnect/react-native-compat \
  @react-native-async-storage/async-storage \
  @gorhom/bottom-sheet \
  buffer react-native-get-random-values
# only if you use the Albedo WebView bridge:
npm install react-native-webview
# (no react-native-svg needed — icons are pre-rasterized PNGs)
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

## The mobile wallet flow

The modal's wallet list shows every wallet that can actually pair on a phone — deep link only, never a QR code (the same phone would have to scan it):

1. **Featured Stellar wallets** — Freighter, LOBSTR, HOT Wallet and Scopuly each get their own row in the primary section (when the WalletConnect connector is configured). Tapping one starts the pairing and deep-links straight into the wallet app — the whole flow (connecting view, account view, sign requests) is branded with that wallet's own name and icon, and falls back to the wallet's https universal link when the native scheme can't open. If neither works, the connecting view offers the store page and a "Copy pairing code" action for wallets with a manual pairing field.
2. **Registered connectors** — Albedo (WebView), right under the featured wallets.
3. **More wallets** — every other WalletConnect-registered mobile wallet (SafePal, Blockchain.com, Arculus, …) collapses under a "More wallets" expander, same deep-link flow.

The built-in registry (verified against the WalletConnect Explorer, `chains=stellar:pubnet`):

| Wallet | Native link | Universal link |
|---|---|---|
| Freighter | `freighterwallet://` | — |
| LOBSTR | `lobstr://` | `https://lobstr.co/uni/wc` |
| HOT Wallet | `hotwallet://` | `https://app.hot-labs.org` |
| Scopuly | `scopuly://wc` | `https://app.scopuly.com/wc` |
| SafePal | `safepalwallet://` | `https://link.safepal.io` |
| Blockchain.com | `blockchain-wallet://` | `https://login.blockchain.com/app` |
| Arculus Wallet | `arculuswc://` | `https://gw.arculus.co/app/wc` |
| Atomic Wallet | `atomicwallet://` | — |
| COCA Wallet | `wirexwallet://` | — |
| Trustee Wallet | `tw://` | `https://trusteeglobal.com/link/Pxxum8Yt` |
| MaxWallet | `maxwallet://` | — |
| Zypto | `zypto://` | — |
| Hero Wallet | `herowallet://wc` | `https://wallet.hero.io/signin/wc` |
| UKey Wallet | `ukey-wallet://` | `https://app.ukey.io/wc/connect` |
| ECOIN Wallet | `ecoinwallet://` | `https://ecoinwallet.org/link` |
| SwiftEx Wallet | `swiftEx://app.swiftexchange.io` | `https://app.swiftexchange.io/` |
| Panaroma Wallet | `panaromawallet://walletconnect` | — |
| Kotai Wallet | `kotaiwallet://` | — |
| Cryptokara | `cryptokara://StartScreen` | — |
| UKISS Hub | `ukisshub://` | — |
| SOC Wallet | `socwallet://` | `https://soc.socjsc.com/wc` |

Institutional custody platforms without consumer deep links (Anchorage, Utila, GK8) are intentionally excluded.

Add more wallets as they ship deep-link support — no AppKit release needed:

```ts
import { registerMobileWallet } from '@saganta/stellar-appkit-react-native';

registerMobileWallet({
  id: 'my-wallet',
  name: 'My Wallet',
  icon: myWalletIcon,          // data:image/png;base64,... renders best
  scheme: 'mywallet',
  installUrl: { ios: '...', android: '...' },
});
```

`buildWalletConnectDeepLink(id, uri)` then produces `mywallet://wc?uri=<encoded>` — byte-compatible with WalletConnect's own modal (`CoreUtil.formatNativeUrl`), the format every Explorer-registered wallet is tested against. Pass `link` for wallets whose registered native entry includes a path (like Scopuly's `scopuly://wc`) and `universal` for an https fallback.

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
| `.../ui` | `AppKitModal`, `useAppKit`, `WalletIcon`, themes (5 × dark/light) |
| `.../albedo` | `createAlbedoWebViewBridge` + `AlbedoWebViewScreen` (requires `react-native-webview`) |

## Requirements

React Native ≥ 0.73 · React ≥ 18 · `@walletconnect/react-native-compat` for WalletConnect. See `peerDependencies` for the full list.

Documentation: [stellar-appkit.saganta.com](https://stellar-appkit.saganta.com) · Web SDK: `@saganta/stellar-appkit-ui-web`
