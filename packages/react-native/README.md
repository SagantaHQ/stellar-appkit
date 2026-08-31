# @saganta/stellar-appkit-react-native

React Native support for [Stellar AppKit](https://github.com/SagantaHQ/stellar-appkit) — the same client, the same connectors, the same modal UX as the web SDK, adapted to native.

- **Deep-link-only pairing, full wallet registry** — every consumer wallet registered against WalletConnect's Stellar namespace ships built-in: the featured **Freighter, LOBSTR, HOT Wallet, Scopuly** plus 17 multichain wallets (SafePal, Blockchain.com, Arculus, Atomic Wallet, COCA, Trustee, MaxWallet, Zypto, Hero, UKey, ECOIN, SwiftEx, Panaroma, Kotai, Cryptokara, UKISS Hub, SOC) under a collapsible "More wallets" section. Tap one and we embed the pairing URI into its deep link (`freighterwallet://wc-redirect/wc?uri=...`, byte-identical to WalletConnect's own modal) and hand off to the wallet app, Solana-Mobile-Adapter style — branded with the wallet's own name and icon throughout. On a phone the same device would have to scan a QR code, so the modal never renders one; a "Copy pairing code" fallback covers wallets with manual pairing fields.
- **True wallet names** — WalletConnect sessions capture the peer wallet's metadata, so the connecting and account views show "Freighter" or "HOT Wallet", never a generic "WalletConnect" label.
- **Albedo WebView bridge** — Albedo's web confirm flow, reproduced inside an in-app WebView (`window.opener` shim + synthetic MessageEvents — the exact popup protocol).
- **xBull WebView bridge** — xBull's web wallet (wallet.xbull.app), same trick: the nacl-box popup protocol reproduced inside an in-app WebView. xBull has no native app and isn't in the WalletConnect Explorer's Stellar namespace, so this is its only mobile surface — and it restores wallet-list parity with the web modal, where xBull is a featured connector.
- **Instant wallet taps (`warmUp()`)** — the WalletConnect connector exposes `warmUp()`: it pre-evaluates the `@walletconnect/sign-client` module tree and opens the relay WebSocket so the first tap is instant. Without it, Metro evaluates hundreds of WC modules synchronously on the tap — a multi-second freeze on debug builds. The modal warms up automatically at mount (app start for the always-mounted pattern) and again when it opens — both **deferred ~150ms** (`ui/warm-up.ts`): the SDK's module evaluation blocks the JS thread, and firing it in the open tick would freeze the sheet's layout/entrance animation, making the "Connect" tap look dead for 5-10 seconds before the sheet appears. Apps can also warm at app start (`client.registry.get('walletconnect')?.warmUp?.()`); it's idempotent.
- **AsyncStorage persistence** — sessions survive app restarts via a first-class `ConnectStorage` adapter.
- **Full modal parity (1:1 with the web modal)** — bottom-sheet modal (`@gorhom/bottom-sheet`) or **inline panel** (`mode="inline"`, web parity), web-metric wallet list with live reachability, the web's squircle dash-arc spinner (the traveling-dash rounded-square — not a circle — rebuilt with pure Views, same 2s/0.8s timings, reduced-motion aware via `AccessibilityInfo`), the web's back-arrow error header, connecting/signing/SIWS error variants with retry pills, network-mismatch view, "Powered by Stellar AppKit" footer, i18n (25 locales).
- **SIWS (Sign-In With Stellar)** — when `siwsConfig` is set on the client, the modal runs the automatic sign-in flow right after connect (checking session → fetching nonce → approve in wallet → verifying), with per-step timeouts, retry caps and disconnect-on-fail — the same flow, phases and copy as the web modal.
- **Icons that render — no SVG library** — RN's `Image` can't rasterize SVG, so instead of pulling in `react-native-svg` (a large native dependency), every wallet logo is pre-rasterized as a compressed 128×128 palette PNG with alpha (~30 KB for all 21, bundled as base64 literals). `<WalletIcon>` resolves icons by wallet key → bundled PNG, renders raster sources natively, matches WalletConnect peer names ("Freighter" → Freighter logo), and falls back to a branded letter avatar. The UI chrome icons (chevrons, close, alert, retry, checkmark) are likewise pure-View ports of the web's inline SVGs (`./ui` exports the icon set).
- **`<QrCodeView>` remains exported** — a vendored pure-JS QR encoder drawn with plain React Native Views (no `react-native-qrcode-svg`) for apps that build their own tablet/desktop-style pairing screens; the modal itself doesn't use it.

## Install

```bash
npm install @saganta/stellar-appkit-react-native \
  @walletconnect/react-native-compat \
  @react-native-async-storage/async-storage \
  @gorhom/bottom-sheet \
  buffer react-native-get-random-values
# only if you use the Albedo and/or xBull WebView bridges:
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
import { createXBullWebViewBridge } from '@saganta/stellar-appkit-react-native/xbull';
import { AppKitModal } from '@saganta/stellar-appkit-react-native/ui';

export const [albedoView, setAlbedoView] = useState<React.ReactElement | null>(null);
export const [xbullView, setXBullView] = useState<React.ReactElement | null>(null);

const appkit = new StellarAppKit({
  network: 'TESTNET',
  appMetadata: {
    name: 'My App',
    url: 'https://myapp.example', // url is required on RN (no window.location)
    // Optional (mobile focus-return): your app's own deep link, carried in
    // WC session proposals so cooperating wallets re-focus your app after
    // approve/reject — and used by the RN modal as its self-open target
    // when an operation settles while the app is backgrounded.
    redirect: { native: 'myapp://', universal: 'https://myapp.example' },
  },
  storage: createAsyncStorage(AsyncStorage),                     // sessions persist across restarts
  connectors: defaultReactNativeConnectors({
    projectId: '<WalletConnect Cloud project ID>',
    storage: createAsyncStorage(AsyncStorage),
    albedoBridge: createAlbedoWebViewBridge(setAlbedoView),      // optional — requires react-native-webview
    albedoOrigin: 'https://myapp.example',
    xbullBridge: createXBullWebViewBridge(setXBullView),         // optional — web-wallet-list parity with xBull
    xbullOrigin: 'https://myapp.example',
  }),
});

export function App() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button title="Connect" onPress={() => setOpen(true)} />
      {open && <AppKitModal client={appkit} open={open} onClose={() => setOpen(false)} />}
      {albedoView}
      {xbullView}
    </>
  );
}
```

### Presentation modes

`<AppKitModal>` renders one of two presentations — the same modes the web
modal offers:

- **`mode="bottomsheet"` (default)** — the `@gorhom/bottom-sheet` overlay:
  backdrop, drag handle, swipe-to-dismiss. `open` presents/dismisses it.
- **`mode="inline"`** — the panel renders in place, like the web's
  `mode="inline"`: a bordered card (radiusLg + 1px `colorBorder` outline)
  embedded in your screen, no overlay and no close button. The `open` prop
  is ignored (the panel is always visible); the view state machine (wallet
  list → connecting → account) lives inside the panel just like the sheet.

```tsx
// Inline — for users who don't want a bottom sheet:
<AppKitModal client={appkit} mode="inline" open onClose={() => {}} theme={stellarDark} />
```

Optional header branding (web `title` / `logo-src` attributes):

```tsx
<AppKitModal client={appkit} open={open} onClose={close} title="My Wallet" logo={require('./logo.png')} />
```

### Auto-close on success

Bottom-sheet mode **closes itself when — and only when — the operation your
app requested completes successfully**. The user approves in the wallet app
(HOT Wallet, Freighter, …), returns to your app, gets a short "connected"
flash on the account view (~0.9s), and the sheet slides away — no extra
dismissal tap:

- **Connect** settles (including the deep-link return, and the SIWS
  sign-in run to its end when `siwsConfig` is set) → sheet closes.
- **Signing** completes (the sign queue drains cleanly) → sheet closes.
- **Never on failure** — rejected connects/signs, expired requests and
  network mismatches keep web parity: the user reads the error variant and
  picks Cancel / Try again. Success is the ONLY trigger.
- **Never while the user is driving** — switching wallets, the back arrow,
  declining a preview, cancelling SIWS, or even tapping into the account
  panel (copy address, Get Testnet funds, explorer links) all cancel the
  auto-close: taking control means keeping control.
- **Reopening never self-closes** — the completion flag resets on every
  sheet open/close, so a modal reopened later for account management stays
  put.

The sheet closing is the whole mechanism: whatever your app shows behind it
becomes visible again. Getting the *app itself* foregrounded when the user
is still sitting in the wallet app is a separate, cooperating feature — see
[Returning focus to your app after the operation](#returning-focus-to-your-app-after-the-operation).

Want the web modal's behavior instead (stay open on the account view)?
Opt out per instance:

```tsx
<AppKitModal client={appkit} open={open} onClose={close} autoCloseOnComplete={false} />
```

Inline panels are exempt automatically (there's no sheet to close). If the
app is still backgrounded when the operation settles, the dismissal runs
the moment the sheet can — either way, when the user switches back, the
sheet is gone and your app's UI is what's waiting.

### Transaction preview (web 1:1)

The modal installs itself as the client's `onPreviewTransaction` handler —
exactly like the web modal — so every `signTransaction()` / `signMessage()` /
`signIn()` first shows the decoded preview **before the wallet ever sees the
request**: app + wallet thumbnails, "Sign message" vs "Review transaction"
copy, one card per operation with risk flags, the mono source-account + fee
meta row, and Cancel / Sign / Approve actions.

- **Sign** → the signing view ("Continue in {wallet}") while the wallet prompts.
  When the session was paired with a mobile wallet (deep-link handoff), the
  signing view also shows an **"Open in wallet app"** button — the same deep
  link the connect flow uses — because a WalletConnect mobile wallet sits in
  the background until the user switches apps (browser wallets pop their
  prompt over the page by themselves).
- **Cancel** → back to the account view; the sign promise rejects with the
  standard user-rejected error (the modal doesn't route it to the error view).
- **Try again** (after a wallet rejection) → re-shows the approved preview.

While a sign is in flight the sheet can't be swiped or backdrop-dismissed —
web `close()` parity: the user should see the result before the modal closes
(the signing view's error variant re-enables dismissal with its own Cancel /
Try-again actions). And a preview pending when the sheet goes away resolves
as **rejected** (never a hung sign queue) — again mirroring the web.

The open transition is flow-aware the same way the web `open()` is: a modal
that (re-)opens while a preview awaits the user's decision lands on the
**preview**, a sign already in flight lands on the **signing view**, and a
running SIWS phase is restored — only a quiet modal resets to the account
view / wallet list. This matters because apps typically auto-open the modal
when `pendingSignCount` rises; an unconditional reset would orphan the
preview and hang the sign queue forever.

To bring your own preview UI, set `client.onPreviewTransaction` yourself — the
modal detects an existing handler at mount, warns, and leaves it in place.
Apps that want a specific call to skip the preview can pass
`{ skipPreview: true }` to the sign call.

### Connected account view (web 1:1)

The connected view is the full web account panel: deterministic avatar +
tap-to-copy address, network pill (amber testnet / green public), explorer
link, overflow menu (Switch Wallet / Disconnect), pending-signature banner,
XLM balance with skeleton state and a silent 10s poll, "Get Testnet funds"
(friendbot, TESTNET only) with the 3s funding banner, and the Recent
Activity list with per-tx explorer links. Balance + history are fetched with
plain `fetch` against Horizon REST (no stellar-sdk in the bundle), same
endpoints and degradation rules as the web modal.

### i18n — all 25 locales

Every string in the modal resolves through the core i18n module and the sheet
re-renders on `setLocale()`. To follow the device language at app start:

```ts
import { applyDeviceLocale, detectDeviceLocale } from '@saganta/stellar-appkit-react-native';

// Reads NativeModules (no extra dependency), maps e.g. "fr_FR" → 'fr',
// "zh_CN" → 'zh-CN'; unsupported languages leave the locale untouched.
await applyDeviceLocale();
```

`detectDeviceLocale()` returns the mapped `LocaleCode | null` without
switching; `normalizeToDeviceLocale(raw)` is the pure mapping if you roll
your own detection.

### SIWS — Sign-In With Stellar

Set `siws` on the client config and the modal handles the whole
authentication UX after connect, phase for phase like the web modal
(`useSiwsFlow` is also exported if you build your own UI):

```ts
const appkit = new StellarAppKit({
  // ...
  siws: {
    statement: 'Sign in to My App',
    session: async () => (await fetch('/api/siws/session')).json(),
    nonce: async () => (await fetch('/api/siws/nonce')).text(),
    verify: async (data, nonce) => {
      const res = await fetch('/api/siws/verify', { method: 'POST', body: JSON.stringify({ ...data, nonce }) });
      return res.ok ? res.json() : null;
    },
  },
});
```

The flow: **Checking session… → Fetching secure nonce… → Approve the
sign-in request in {wallet} → Verifying your signature…**, each step with a
per-step timeout (`timeoutMs`, default 15s). Failures show the
"Sign-in failed" view with the extracted error and a Try-again pill;
retries are capped (`maxRetries`, default 3) after which the message
becomes "Too many failed attempts". Cancelling (or dismissing the modal
before sign-in succeeds) disconnects the wallet when
`disconnectOnFail` is true (the default) — exactly the web semantics.

### Themed in-app browser (Chrome Custom Tabs / SFSafariViewController)

`createThemedBrowserSession()` opens web URLs on the **system-browser
surface** — Chrome Custom Tabs on Android, SFSafariViewController on iOS —
styled like a modal from your theme, with a preference chain that always
picks the best available browser and falls back gracefully:

1. **`react-native-inappbrowser-reborn`** — full styling (modal `pageSheet`
   on iOS, themed toolbars on Android), `isAvailable()` Chrome-Tab
   detection and `openAuth()` redirect interception. Native module — needs
   a dev client / standalone build, **not Expo Go**.
2. **`expo-web-browser`** — the same OS surfaces with toolbar theming;
   bundled **with Expo Go**, so the chain always has an in-app browser
   there.
3. **External browser** via `Linking` — last resort, always available.

```ts
import InAppBrowser from 'react-native-inappbrowser-reborn';   // optional
import * as ExpoWebBrowser from 'expo-web-browser';

const browser = createThemedBrowserSession(
  { reborn: InAppBrowser, expo: ExpoWebBrowser },  // inject what you have
  { theme: stellarDark }                            // any ConnectThemeRN
);

// Pass it to the modal — explorer links, wallet install pages and the
// footer link then open in the themed tab instead of leaving the app:
<AppKitModal client={appkit} open={open} onClose={close} browser={browser} />;

// Or drive it directly — resolves when the user dismisses the tab.
await browser.open('https://testnet.stellarchain.io/account/G…');

// Redirect-intercepting session (wallets with redirect callbacks):
const result = await browser.openAuth(walletUrl, 'myapp://wallet-callback');
if (result.type === 'success') parseResult(new URL(result.url));

// Chrome Tab present on this device?
if (await browser.isChromeTabsAvailable()) { /* prefer the tab */ }
```

**Why the system browser and not the WebView** — passkeys: WKWebView does
not implement WebAuthn (Apple reserves the platform authenticator for
browser-entitled apps) and Android WebView has none either, while Chrome
Custom Tabs and SFSafariViewController support passkeys out of the box.
They also share the system browser's cookie jar — a wallet the user
already unlocked in their browser is already unlocked in the tab.

**Why Albedo and xBull still use the WebView** — their protocols are
`postMessage`-coupled end to end (Albedo's confirm page receives the
intent request only via `window.postMessage` and replies to
`window.opener`; xBull replies through the bare `opener` global with no
redirect fallback). A Custom Tab has no `window.opener` and no message
channel back into the app, so those flows cannot run there — the WebView
bridges (which shim `window.opener`) stay. Every plain http(s) handoff
moves to the themed browser, and any wallet that adds redirect callbacks
plugs straight into `openAuth()`.

## The mobile wallet flow

The modal's wallet list shows every wallet that can actually pair on a phone — deep link only, never a QR code (the same phone would have to scan it):

1. **Featured Stellar wallets** — Freighter, LOBSTR, HOT Wallet and Scopuly each get their own row in the primary section (when the WalletConnect connector is configured). Tapping one starts the pairing and deep-links straight into the wallet app — the whole flow (connecting view, account view, sign requests) is branded with that wallet's own name and icon, and falls back to the wallet's https universal link when the native scheme can't open. If neither works, the connecting view offers the store page and a "Copy pairing code" action for wallets with a manual pairing field.
2. **Registered connectors** — Albedo (WebView) and xBull (WebView), right under the featured wallets.
3. **More wallets** — every other WalletConnect-registered mobile wallet (SafePal, Blockchain.com, Arculus, …) collapses under a "More wallets" expander, same deep-link flow.

The built-in registry (verified against the WalletConnect Explorer, `chains=stellar:pubnet`):

| Wallet | Native link | Universal link |
|---|---|---|
| Freighter | `freighterwallet://wc-redirect` | — |
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

`buildWalletConnectDeepLink(id, uri)` then produces `<registered-link>/wc?uri=<encoded>` — byte-compatible with WalletConnect's own modal (`CoreUtil.formatNativeUrl`), the format every Explorer-registered wallet is tested against. Pass `link` for wallets whose registered native entry includes a path (like Scopuly's `scopuly://wc` or Freighter's `freighterwallet://wc-redirect`) and `universal` for an https fallback.

> **Use the wallet's REGISTERED link, not its bare scheme.** Some wallets validate the URL they're asked to open: Freighter Mobile's deep-link handler silently ignores anything that doesn't contain its Reown-registered redirect (`freighterwallet://wc-redirect`), so a `freighterwallet://wc?uri=...` link opens the app and then does nothing — no pairing prompt. The Explorer entry (`mobile.native`) is the source of truth; every built-in wallet ships its exact value.

### Sign requests: the wallet opens itself — but only after consent

Connecting isn't the only handoff — every WalletConnect request your app fires afterwards (a `signTransaction()`, a `signAuthEntry()`, a SIWS prompt, even a "Try again" after a rejection) opens the paired wallet app automatically, Mobile Wallet Adapter style. But the handoff happens at the RIGHT moment: after the user taps **Sign/Approve** in the app's preview modal and the request is actually on the wire. The wallet is never opened before the consent — the trigger is the connector's dispatch notification (fired after the preview gate and after its pre-checks), not the sign queue, which starts counting the moment your code calls `signTransaction()`, i.e. while the user is still reading the preview.

The full sequence with `autoOpenWalletOnSign` (default on):

1. Your code calls `signTransaction()` → the preview modal opens in YOUR app.
2. The user reviews the transaction and taps **Sign**/`Approve` — that's the consent.
3. The WalletConnect `session_request` is dispatched to the relay.
4. A short settle window passes (350ms — lets the publish land on the WebSocket before the OS freezes it in the background) and, if the request hasn't settled in the meantime, the paired wallet app opens. The user lands straight in its pending approval prompt; no detour past a "Continue in wallet" screen with a button they must now tap.

- **A request that settles inside the window cancels the handoff.** A fast failure (dead session, unapproved method — the error event fires and the queue drains) or a wallet that answered before the app could switch: either way there is nothing waiting in the wallet to open for, and your user is already looking at the result.
- **Only while your app is foregrounded.** A sign that lands while the app is backgrounded never yanks the wallet (or anything else) to the front.
- **Only when a target is derivable.** The wallet the user picked during connect, or — after an app restart, when no pick happened in this process — the wallet the restored WalletConnect session's peer metadata points back to (its `redirect.native` scheme is captured at settle time and persisted with the session record). Wallets with no resolvable target (desktop, unregistered) keep the manual button.
- **Failures are silent.** `Linking.openURL` rejections are swallowed — the "Open in wallet app" button on the signing view remains as the fallback, and it resolves for restored sessions too.

Opt out per instance if you want the manual handoff back:

```tsx
<AppKitModal client={appkit} open={open} onClose={close} autoOpenWalletOnSign={false} />
```

Headless apps can drive the same resolution themselves with `resolveSignHandoffWalletId(peer, pickedWalletId)` and `buildSignHandoffLink(walletId, peer)` (both exported from the package root).

## Returning focus to your app after the operation

The deep-link handoff above puts the user inside the wallet app to approve (or reject). The moment they answer, the task is done — the user belongs back in YOUR app, not still staring at Freighter/LOBSTR/HOT Wallet. Neither OS lets a backgrounded app force itself to the foreground (iOS forbids it outright, Android 10+ blocks background activity starts), so AppKit pulls every sanctioned lever for you:

1. **The wallet bounces the user back (primary).** Set your app's deep link in `appMetadata.redirect` — it rides the WalletConnect session proposal (`proposer.metadata.redirect`, the Reown/WC "return to dapp" standard). Cooperating wallets open it right after approve/reject, backgrounding themselves and re-focusing your app. This is the same mechanism MetaMask/Rainbow/Trust use on both platforms, because it's the WALLET (a foreground app) doing the opening.
2. **The library self-opens (best-effort fallback).** When the operation settles while your app is backgrounded but its JS is still alive (common on Android for the first seconds after the handoff, before the OS reaps the relay socket), the modal re-opens your own deep link — some Android builds honor that self-intent and reorder your task to the front; iOS and stricter Android builds refuse it and the attempt is a silent no-op. Both success AND failure count as settled — either way the user is done in the wallet.
3. **The user returns manually (the floor).** If nothing above fired, the AppState foreground refresh (the zombie-socket fix) guarantees the instant they swipe back, the relay restarts and the settled operation lands.

```ts
const appkit = new StellarAppKit({
  network: 'TESTNET',
  appMetadata: {
    name: 'My App',
    url: 'https://myapp.example',
    // Your app's own deep link — registered in app.json (Expo: `scheme`)
    // or AndroidManifest.xml / Info.plist. A bare scheme is normalized
    // ("myapp" → "myapp://").
    redirect: { native: 'myapp://', universal: 'https://myapp.example' },
  },
  // ...
});
```

The modal installs this automatically (no wiring). Headless apps get the same behavior with `attachAppFocusReturn(appkit)`. With no `redirect` configured there is nothing to self-open — you still keep lever 3, and in-app outcomes (rejecting a preview at the account screen, an SIWS cancel) never steal focus because attempts only fire while the app is backgrounded.

> **Wallet support varies.** Whether the automatic bounce-back (lever 1) happens is up to each wallet — AppKit advertises the redirect to every wallet, but only wallets implementing the Reown redirect behavior act on it. Test with your target wallets; for the rest, levers 2–3 still land the user back in the app the moment they switch.

## Wallet-side disconnects propagate to the library

When the user disconnects from **inside the wallet** (its own settings screen, a "forget this dapp" action), the session is dead on the wallet's side — and the library now treats it that way too. The WalletConnect `session_delete` (and `session_expire` when the ~7-day session TTL lapses) is delivered over the relay — on React Native typically the moment your app foregrounds again, since the relay transport restart re-delivers messages that queued while the app was backgrounded — and core reconciles exactly like an app-initiated `disconnect()`:

- the session is dropped from the client (memory **and** persisted storage — a cold restart will not resurrect it),
- `disconnect` and `sessionsChanged` events fire, the status flips (`connected` → `idle` when it was the only wallet),
- any SIWS session is cleared (the `signout()` hook runs when configured),
- a pending "Try again" for that wallet dies with the connection.

The modal needs no wiring for this: its existing `disconnect` listener flips the sheet off the account view back to the wallet list. Headless clients get the events directly. Before this propagation, the connector cleared only its own private state and the client kept serving the dead session — status `'connected'`, account view up — until the next sign request failed with "WalletConnect is not connected — call connect() first".

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

## Expo Go development: disable lazy bundle splitting

The core SDK lazy-loads its heavy dependencies (`@walletconnect/sign-client`,
`@stellar/stellar-sdk`, `@stellar/freighter-api`, …) with dynamic `import()` — great for web
bundle size, but **React Native 0.86+ / Expo SDK 57 dev clients request bundles with
`?lazy=true`, which makes Metro split every dynamic import into a separate runtime-fetched
bundle with its own module-id space**. If Metro restarts or the graph drifts between the main
bundle and a split bundle (cache clear, `node_modules` churn), the ids no longer line up and
the app crashes mid-connect with:

```
ERROR  [Error: Requiring unknown module "1407". If you are sure the module exists,
try restarting Metro. You may also want to run `yarn` or `npm install`.]
```

— usually right after a long secondary build like
`Bundled 30868ms node_modules/@walletconnect/sign-client/dist/index.js (1308 modules)`.

The fix is one line of Metro config — strip `lazy=true` so the whole graph ships as a single
inline bundle (no runtime bundle fetches, no id contract, and the first connect stops blocking
on a cold split-bundle build):

```js
// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);

const baseRewriteRequestUrl = config.server.rewriteRequestUrl;
config.server.rewriteRequestUrl = (url) => {
  const rewritten = baseRewriteRequestUrl ? baseRewriteRequestUrl(url) : url;
  if (!/[?&]lazy=true\b/.test(rewritten)) return rewritten;
  const isRelative = rewritten.startsWith('/');
  const parsed = new URL(rewritten, isRelative ? 'https://acme.dev' : undefined);
  if (parsed.searchParams.get('platform') === 'web') return rewritten; // web dev uses split chunks
  parsed.searchParams.delete('lazy');
  return isRelative ? parsed.pathname + parsed.search : parsed.href;
};

module.exports = config;
```

The [RN demo](https://github.com/SagantaHQ/stellar-appkit-rn-expo-demo) ships this. Production
builds (`expo export`) are unaffected — splitting is a dev-server behavior.

## Metro deep-import warnings (`@noble/hashes`, `uint8arrays`, `multiformats`)

Every WalletConnect-on-Metro app prints up to five of these on each cold start:

```
WARN  Attempted to import the module ".../uint8arrays/cjs/src/from-string.js" which is not
listed in the "exports" of ".../uint8arrays" under the requested subpath
"./cjs/src/from-string.js". Falling back to file-based resolution.
```

— the same warning for `multiformats/cjs/src/basics.js`, `@noble/hashes/crypto.js`, and a
nested `@noble/curves/node_modules/@noble/hashes/crypto.js`. They are **cosmetic** (Metro
falls back to file-based resolution and lands on the exact file it had already picked), but
they look like errors.

**Root cause:** those packages publish `exports` maps whose condition targets are nested CJS
files — `"./from-string" → "./cjs/src/from-string.js"`, `"./crypto" → "./crypto.js"` — that are
not themselves keys of the `exports` map. Metro expands the target, re-validates it against
the same map, fails, warns, then falls back. (`@noble/curves` lists both `./ed25519` and
`./ed25519.js`, which is why it never warns.)

**Fix:** resolve those specifiers straight to their files in `metro.config.js`, skipping the
exports re-validation entirely — same modules, zero warnings (this also covers older
WalletConnect releases that request the deep paths literally):

```js
// metro.config.js — add to your existing config
const fs = require('node:fs');
const path = require('node:path');

const DEEP_CJS_PACKAGES = new Set(['@noble/hashes', 'uint8arrays', 'multiformats']);

function splitPkgSub(moduleName) {
  const parts = moduleName.split('/');
  if (moduleName.startsWith('@')) {
    if (parts.length < 3) return null;
    return { pkg: `${parts[0]}/${parts[1]}`, sub: parts.slice(2).join('/') };
  }
  if (parts.length < 2) return null;
  return { pkg: parts[0], sub: parts.slice(1).join('/') };
}

function nearestPackageDir(originDir, pkg) {
  let dir = originDir;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', pkg);
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function resolveDeepCjs(originModulePath, moduleName) {
  const split = splitPkgSub(moduleName);
  if (!split || !DEEP_CJS_PACKAGES.has(split.pkg)) return null;
  const pkgDir = nearestPackageDir(path.dirname(originModulePath), split.pkg);
  if (!pkgDir) return null;
  const withExt = /\.(js|cjs|mjs)$/.test(split.sub) ? split.sub : `${split.sub}.js`;
  for (const rel of [withExt, path.join('cjs/src', withExt), path.join('esm/src', withExt)]) {
    const filePath = path.join(pkgDir, rel);
    if (fs.existsSync(filePath)) return { type: 'sourceFile', filePath };
  }
  return null;
}

// inside your config setup, before the default resolution:
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (context.originModulePath) {
    const direct = resolveDeepCjs(context.originModulePath, moduleName);
    if (direct) return direct;
  }
  return context.resolveRequest(context, moduleName, platform);
};
```

**Optional dedupe:** `@noble/curves` and `@walletconnect/relay-auth` pin old `@noble/hashes`
versions (1.7.x), so package managers nest duplicate copies. A single shared 1.8.0 keeps one
crypto implementation in the bundle:

```jsonc
// package.json — "overrides" (npm/bun) or "resolutions" (yarn)
"overrides": { "@noble/hashes": "1.8.0" }
```

The [RN demo](https://github.com/SagantaHQ/stellar-appkit-rn-expo-demo) ships both.

## WalletConnect error logs — what they mean and what the library does with them

Testing against HOT Wallet or LOBSTR you'll see lines like these in the Metro terminal:

```
ERROR {"level": 50, "msg": "No matching key. proposal: 1788082186770263"}
ERROR {"level": 50, "msg": "onRelayMessage() -> failed to process an inbound message: <base64>"}
ERROR {"level": 50, "msg": "Pending session not found for topic e98b1781…"}
ERROR {"level": 50, "msg": "Request expired. Please try again."}
ERROR {"level": 50, "msg": "Transaction cancelled by the user"}
```

These are the WC SDK's **internal pino logger**, not exceptions from the library — but each one
has a precise meaning, and the library now handles all of them:

| Log line | What actually happened | What the library does |
|---|---|---|
| `No matching key. proposal: <id>` | A message arrived for a proposal this side already discarded — the SDK's crypto keychain has no key for its pairing topic | Mostly eliminated at the source: abandoned connect attempts now **disconnect their pairing** (`abort()` + every failure path), so late wallet answers die at the relay instead of crashing against a missing key |
| `onRelayMessage() -> failed to process…` | The decrypt/processing failure for that same stale delivery | Same — vanishes with the ghost pairing |
| `Pending session not found for topic …` | The settle message for that orphaned proposal | Same |
| `Request expired. Please try again.` | The SDK's 5-minute delayed-promise TTL lapsed — the wallet never answered (this rejection is *thrown* to `signClient.request()`/`approval()`, not just logged) | Classified: `connect()`/`signTransaction()`/`signMessage()`/`signAuthEntry()` reject with a plain-language `ConnectError` (code -1) — *"Request expired — the wallet did not respond within WalletConnect's 5-minute window. Open the wallet, then try again."* — which the modal shows on its connecting/signing error variant |
| `Transaction cancelled by the user` | The wallet's JSON-RPC rejection (you tapped Cancel/Reject in the wallet — LOBSTR's exact wording) | Classified: the sign/connect call rejects with a code -4 `ConnectError` carrying **the wallet's own message**, so the app sees *what the user actually did* instead of a generic "user rejected" |

Two behavior changes back the table:

- **Cancelling the connect actually cancels it.** The connecting view's back arrow (and closing
  the sheet mid-connect) now calls the WalletConnect connector's `abort()`: the in-flight
  `connect()` rejects within ~200 ms with a suppressed code -4 (no surprise error view later),
  and the pairing is disconnected — which also dismisses the wallet's still-pending approval
  prompt. Before, the attempt kept running silently and died five minutes later as a
  "Request expired" error on whatever screen you were on by then.
- **The SDK's console noise is now optional.** `createWalletConnectConnector({ logger })`
  accepts a WC logger level; `logger: 'silent'` hides every SDK log line (including the
  ERROR-level chatter above) without affecting the typed `ConnectError`s your app receives.
  Headless apps can also use the exported `classifyWalletConnectError()` /
  `walletConnectErrorMessage()` helpers to build their own error UX on top.

## Subpath exports

| Entry | Contents |
|---|---|
| `@saganta/stellar-appkit-react-native` | Core re-exports + RN connector set, storage adapters, deep-link registry, platform detection |
| `.../polyfills` | `installPolyfills()` |
| `.../ui` | `AppKitModal` (bottom-sheet + inline modes), `useAppKit`, `useSiwsFlow`, `WalletIcon`, `SquircleArc` + squircle-track geometry, pure-View icon set, themes (5 × dark/light) |
| `.../albedo` | `createAlbedoWebViewBridge` + `AlbedoWebViewScreen` (requires `react-native-webview`) |
| `.../xbull` | `createXBullWebViewBridge` + `XBullWebViewScreen` — the xBull web-wallet popup protocol in a WebView (requires `react-native-webview`) |

## Modal internals (for contributors)

`src/ui/` keeps every screen in its own file for easy management — `AppKitModal.tsx` is only the
orchestrator (state machine, connect actions, bottom-sheet shell):

```
src/ui/
  AppKitModal.tsx        orchestrator — view state machine, error routing (web parity),
                        deep-link handoff, sheet/inline shells, footer
  styles.ts              shared design system (port of the web modal's CSS)
  types.ts               shared view types + back-header resolution
  squircle-track.ts      pure geometry of the web spinner (SVG rect path + dash math)
  SquircleArc.tsx        the spinner component — pure Views, native-driven opacity PWM
  icons.tsx              pure-View ports of the web's inline SVG chrome icons
  useSiws.ts             SIWS flow hook (web triggerSiwsFlow port)
  animations.ts          breathe / dash loop / entrance stagger (web timings)
  views/
    HeaderView.tsx       header variants: brand | connecting-back | connected-wallet
    WalletListView.tsx   wallet picker — flat rows, featured + "More wallets" expander
    WalletRowView.tsx    one wallet row (.wallet-row port: tile | name | status)
    ConnectingView.tsx   connecting view (+ error variant + retry pill)
    SigningView.tsx      signing view (+ 0.8s arc, error variant with Cancel/Try again)
    SiwsView.tsx         SIWS phases + error view
    AccountView.tsx      connected account
    ErrorView.tsx        generic error + network mismatch (web .error-state)
```

The wallet listing mirrors the web modal's design: 40dp squircle tiles with a soft drop shadow,
14/500 names, an "Installed" outline badge with an accent dot, accent Install pills for
not-installed wallets, and 0.55 dimming for unavailable ones. The connecting/signing/SIWS
views mirror the web `.connecting-view` metrics (88×88 wrap, 56×56 squircle logo, 17/600
title, 14/1.5 muted subtitle capped at 280, 999-radius pills), and the header swaps to the
web `.header--connecting` (back arrow + wallet name) while connecting or on errors.

## Requirements

React Native ≥ 0.73 · React ≥ 18 · `@walletconnect/react-native-compat` for WalletConnect. See `peerDependencies` for the full list.

Documentation: [stellar-appkit.saganta.com](https://stellar-appkit.saganta.com) · Web SDK: `@saganta/stellar-appkit-ui-web`
