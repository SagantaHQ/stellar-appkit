/**
 * xBull WebView bridge — the React Native implementation of
 * `XBullWebViewBridge` from the headless connector.
 *
 * Renders a full-screen modal WebView hosting the xBull web wallet
 * (https://wallet.xbull.app/connect) and reproduces the web popup protocol:
 *
 *  1. `injectedJavaScriptBeforeContentLoaded` shims `window.opener` — the
 *     wallet posts every reply through the bare `opener` global
 *     (`opener.postMessage({type, message, oneTimeCode, publicKey,
 *     success}, '*')`, verified against the live wallet bundle). The shim
 *     forwards those objects to RN via
 *     `window.ReactNativeWebView.postMessage(JSON.stringify(msg))`.
 *  2. Requests travel the other way as synthetic `MessageEvent`s — exactly
 *     what `window.open(...).postMessage(payload, '*')` would have delivered
 *     to the popup. The `origin` of each event is forged from the app's
 *     configured origin so the wallet displays the real requesting app.
 *  3. The user approves in xBull's own UI; the encrypted reply arrives at
 *     our shim.
 *
 * Security notes:
 * - The WebView is locked to `https://wallet.xbull.app/` (navigation guard)
 *  — the wallet may internally route to its own sub-pages (create-account,
 *  no-wallet, …), all on the same origin.
 * - Only encrypted, session-bound traffic crosses the boundary (nacl box,
 *  see the connector); the WebView never sees plaintext requests.
 * - One operation per screen instance — the connector closes the WebView
 *  after each request cycle, mirroring the web SDK's popup lifecycle.
 *
 * The screen carries a browser toolbar (WebViewToolbar): the current URL
 * chip with tap-to-copy, Reload, and Open-in-browser — the browser
 * affordances a bare WebView lacks.
 */

import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewNavigation, type WebViewMessageEvent } from 'react-native-webview';
import type { XBullWebViewBridge, XBullWalletHandle, XBullWalletMessage } from '../connectors/xbull-webview.js';
import { WebViewToolbar } from '../browser/WebViewToolbar.js';

/**
 * Creates the bridge object to pass to `createXBullWebViewConnector()` /
 * `defaultReactNativeConnectors({ xbullBridge })`. One active wallet screen
 * at a time; the modal hosting the WebView must be rendered by your app:
 *
 * ```tsx
 * const [xbullView, setXBullView] = useState<React.ReactElement | null>(null);
 * const xbullBridge = useMemo(() => createXBullWebViewBridge((el) => setXBullView(el)), []);
 * // ...register the connector with `bridge`, and render `{xbullView}` at your root.
 * ```
 */
export function createXBullWebViewBridge(
  render: (element: React.ReactElement | null) => void
): XBullWebViewBridge {
  return {
    openWallet(url, handlers) {
      return new Promise<XBullWalletHandle>((resolve) => {
        render(
          <XBullWebViewScreen
            url={url}
            onMessage={handlers.onMessage}
            onClosed={handlers.onClosed}
            onReady={resolve}
            onUnmount={() => render(null)}
          />
        );
      });
    },
  };
}

export interface XBullWebViewScreenProps {
  /** The wallet connect URL (already carries `public` + `session` params). */
  url: string;
  /** Called with every message the wallet posts (JSON-parsed). */
  onMessage: (msg: XBullWalletMessage) => void;
  /** Called when the user dismisses the WebView before completing. */
  onClosed: () => void;
  /** Called once the WebView ref is live — delivers the request handle. */
  onReady: (handle: XBullWalletHandle) => void;
  /** Unmounts this screen (the bridge's `render(null)`). */
  onUnmount: () => void;
  /** Light/dark chrome; defaults to dark like the web wallet. */
  dark?: boolean;
}

export function XBullWebViewScreen({
  url,
  onMessage,
  onClosed,
  onReady,
  onUnmount,
  dark = true,
}: XBullWebViewScreenProps) {
  const webviewRef = useRef<React.ComponentRef<typeof WebView>>(null);
  const [loaded, setLoaded] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(url);
  /** Guard: dismissal (user cancel, connector close) must fire exactly once. */
  const dismissedRef = useRef(false);
  /** Guard: the handle is published exactly once per screen instance. */
  const handlePublished = useRef(false);

  const bg = dark ? '#09090B' : '#FFFFFF';
  const fg = dark ? '#FAFAFA' : '#18181B';

  /** Single teardown path — notify the connector and unmount the screen. */
  const dismiss = useCallback(
    (byUser: boolean) => {
      if (dismissedRef.current) return;
      dismissedRef.current = true;
      if (byUser) onClosed();
      onUnmount();
    },
    [onClosed, onUnmount]
  );

  // Shim installed before any page script runs: route the wallet's
  // `opener.postMessage(...)` replies to the RN side. The wallet uses the
  // BARE `opener` identifier (not `window.opener`), which resolves to this
  // same object through the global scope.
  const openerShim = `
    (function () {
      var post = function (msg) {
        try {
          window.ReactNativeWebView.postMessage(
            typeof msg === 'string' ? msg : JSON.stringify(msg)
          );
        } catch (e) {}
      };
      window.opener = { postMessage: post, closed: false, close: function () {} };
    })();
    true;
  `;

  // Deliver the handle once the ref exists. postMessageToWallet injects a
  // synthetic MessageEvent — byte-for-byte the message event the web flow's
  // `popup.postMessage(payload, '*')` would have produced on this window.
  const publishHandle = useCallback(() => {
    if (webviewRef.current && !handlePublished.current) {
      handlePublished.current = true;
      onReady({
        postMessageToWallet: (msg: Record<string, unknown>, origin: string) => {
          const payload = JSON.stringify(msg).replace(/</g, '\\u003c');
          webviewRef.current?.injectJavaScript(
            `window.dispatchEvent(new MessageEvent('message', { data: ${payload}, origin: ${JSON.stringify(
              origin
            )} })); true;`
          );
        },
        close: () => dismiss(false),
      });
    }
  }, [onReady, dismiss]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      if (parsed && typeof parsed === 'object' && 'type' in (parsed as Record<string, unknown>)) {
        onMessage(parsed as XBullWalletMessage);
      }
    },
    [onMessage]
  );

  const guardNavigation = useCallback(
    (nav: WebViewNavigation): boolean => {
      // Lock the WebView to the xBull web wallet's origin. The wallet routes
      // itself to /connect/no-wallet, /create-account, … — same origin, fine.
      return nav.url.startsWith('https://wallet.xbull.app/');
    },
    []
  );

  // Navigation tracking feeds the toolbar's URL chip (and re-arms the
  // loading veil on every fresh page load).
  const handleNavigationState = useCallback((nav: { url: string; loading: boolean }) => {
    setCurrentUrl(nav.url);
    if (nav.loading) setLoaded(false);
  }, []);

  return (
    <Modal visible animationType="slide" onRequestClose={() => dismiss(true)}>
      <View style={[styles.container, { backgroundColor: bg }]}>
        <WebViewToolbar
          url={currentUrl}
          dark={dark}
          onCancel={() => dismiss(true)}
          onReload={() => webviewRef.current?.reload()}
        />
        <WebView
          ref={(r) => {
            webviewRef.current = r;
            publishHandle();
          }}
          source={{ uri: url }}
          injectedJavaScriptBeforeContentLoaded={openerShim}
          onMessage={handleMessage}
          onShouldStartLoadWithRequest={guardNavigation}
          onNavigationStateChange={handleNavigationState}
          onLoadStart={() => publishHandle()}
          onLoadEnd={() => setLoaded(true)}
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          allowsBackForwardNavigationGestures={false}
          textInteractionEnabled
          renderLoading={() => (
            <View style={[styles.loader, { backgroundColor: bg }]}>
              <ActivityIndicator />
            </View>
          )}
        />
        {!loaded && (
          <View style={[styles.loader, { backgroundColor: bg }]} pointerEvents="none">
            <ActivityIndicator />
            <Text style={{ color: fg, marginTop: 8 }}>Opening xBull…</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
