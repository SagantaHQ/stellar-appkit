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
  type MobileWalletDeepLink,
} from './deep-links.js';

export { isReactNativeRuntime } from './platform.js';

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
