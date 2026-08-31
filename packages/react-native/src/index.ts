/**
 * @saganta/stellar-appkit-react-native — headless entry.
 *
 * Re-exports everything from core (the services layer is platform-agnostic)
 * plus the React Native additions:
 *
 * - `defaultReactNativeConnectors()` — WC + optional Albedo(WebView) set
 * - `createAsyncStorage()` — AsyncStorage-backed `ConnectStorage`
 * - deep-link registry — MWA-style wallet handoff (`freighterwallet://wc-redirect/wc?uri=...`)
 * - `isReactNativeRuntime()` — real RN detection (RN defines `window`!)
 * - `attachWalletConnectForegroundRefresh()` — headless zombie-socket fix:
 *   restarts the WC relay on every AppState 'active' so pairing/sign
 *   approvals that settled while the app was backgrounded (behind the
 *   wallet app) actually get delivered
 * - `attachAppFocusReturn()` — headless focus return: re-opens the app's
 *   own deep link (`appMetadata.redirect`) when the wallet operation
 *   settles while the app is backgrounded, so the user lands back in the
 *   app instead of staring at the wallet. The modal installs this itself
 *
 * UI (modal) lives in `@saganta/stellar-appkit-react-native/ui`, polyfills in
 * `@saganta/stellar-appkit-react-native/polyfills`, the Albedo WebView screen
 * in `@saganta/stellar-appkit-react-native/albedo` — separate subpaths so
 * apps only bundle what they import.
 */

export * from '@saganta/stellar-appkit';

export {
  defaultReactNativeConnectors,
  createAlbedoWebViewConnector,
  createXBullWebViewConnector,
  XBULL_WALLET_URL,
  type ReactNativeConnectorsOptions,
  type AlbedoWebViewBridge,
  type AlbedoWebViewConnectorOptions,
  type XBullWebViewBridge,
  type XBullWalletHandle,
  type XBullWalletMessage,
  type XBullWebViewConnectorOptions,
  ALBEDO_FRONTEND_URL,
} from './connectors/index.js';

export {
  createAsyncStorage,
  createMemoryStorage,
  type KeyValueLikeStorage,
} from './storage.js';

export {
  registerMobileWallet,
  listMobileWallets,
  getMobileWallet,
  buildWalletConnectDeepLink,
  buildWalletConnectUniversalLink,
  buildOpenWalletAppLink,
  findWalletByDeepLink,
  formatWalletConnectLink,
  formatWalletConnectUniversalLink,
  resolveSignHandoffWalletId,
  buildSignHandoffLink,
  type MobileWalletDeepLink,
  type WalletPeerRedirect,
} from './deep-links.js';

export { isReactNativeRuntime } from './platform.js';

export {
  attachWalletConnectForegroundRefresh,
} from './wc-foreground.js';

export {
  attachAppFocusReturn,
  resolveAppFocusTarget,
  shouldAttemptAppFocus,
  FOCUS_ATTEMPT_COOLDOWN_MS,
  type AppFocusRedirect,
} from './focus-return.js';

export {
  detectDeviceLocale,
  applyDeviceLocale,
  normalizeToDeviceLocale,
} from './locale.js';

export {
  createThemedBrowserSession,
  buildRebornOptions,
  buildExpoOptions,
  type BrowserThemeTokens,
  type BrowserSurface,
  type BrowserOpenResult,
  type BrowserAuthResult,
  type ThemedBrowserOptions,
  type ThemedBrowserSession,
  type RebornBrowserLike,
  type ExpoWebBrowserLike,
  type AuthSessionShape,
} from './browser/inapp-browser.js';
