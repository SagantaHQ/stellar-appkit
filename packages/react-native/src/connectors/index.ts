/**
 * Default connector set for React Native.
 *
 * Core's `defaultConnectors()` registers the seven browser-side connectors
 * (Freighter extension, Albedo popup, xBull bridge, Ledger WebHID, Rabet,
 * Klever, HOT). Their `typeof window` guards were written for SSR — React
 * Native *defines* `window`, so on RN they'd all claim to be available and
 * then fail at connect time inside popup/extension code paths.
 *
 * On RN the wallet surface is different by nature:
 * - **WalletConnect** is THE mobile path — Freighter Mobile and LOBSTR pair
 *   over the WalletConnect relay; the pairing URI is delivered via `onUri`,
 *   which the RN modal turns into a deep link (Solana-Mobile-Adapter-style)
 *   or a QR code.
 * - **Albedo (WebView)** bridges Albedo's web confirm flow into an in-app
 *   WebView — register it only if you also install `react-native-webview`
 *   and pass a bridge (the `./albedo` entry provides one).
 *
 * Browser extensions and hardware transports are simply not registered —
 * their reachability then reports `not-installed`/`unavailable` honestly if
 * an app ever registers them manually.
 */

import {
  createWalletConnectConnector,
  type WalletConnector,
  type ConnectStorage,
} from '@saganta/stellar-appkit';
import { createAlbedoWebViewConnector, type AlbedoWebViewBridge } from './albedo-webview.js';

export interface ReactNativeConnectorsOptions {
  /** WalletConnect Cloud project ID — required (cloud.walletconnect.com). */
  projectId: string;
  /**
   * Receives the `wc:` pairing URI when a connection starts. The RN modal
   * sets this itself; headless apps use it to open a wallet deep link
   * (`buildWalletConnectDeepLink()`) or render a QR code.
   */
  onUri?: (uri: string) => void;
  /** Session persistence — pass your `createAsyncStorage(...)` adapter here. */
  storage?: ConnectStorage;
  /** WalletConnect app metadata override (defaults to the client's appMetadata). */
  metadata?: { name: string; description: string; url: string; icons: string[] };
  /**
   * Albedo WebView bridge. When omitted, the Albedo (WebView) connector is
   * NOT registered — you'd need `react-native-webview` installed anyway.
   * The `@saganta/stellar-appkit-react-native/albedo` entry exports a ready
   * bridge implementation.
   */
  albedoBridge?: AlbedoWebViewBridge;
  /** The app's origin for the Albedo intent (Albedo shows it to the user). */
  albedoOrigin?: string;
}

/**
 * The React Native default connector set: WalletConnect (+ optional
 * Albedo WebView). Order matters — WalletConnect is pinned first by the
 * registry's sort, matching the web modal's behavior.
 */
export function defaultReactNativeConnectors(opts: ReactNativeConnectorsOptions): WalletConnector[] {
  const connectors: WalletConnector[] = [
    createWalletConnectConnector({
      projectId: opts.projectId,
      onUri: opts.onUri,
      storage: opts.storage,
      metadata: opts.metadata,
    }),
  ];

  if (opts.albedoBridge) {
    connectors.push(
      createAlbedoWebViewConnector({
        bridge: opts.albedoBridge,
        origin: opts.albedoOrigin ?? 'https://example.com',
      })
    );
  }

  return connectors;
}

export { createAlbedoWebViewConnector, ALBEDO_FRONTEND_URL } from './albedo-webview.js';
export type { AlbedoWebViewBridge, AlbedoWebViewConnectorOptions } from './albedo-webview.js';
