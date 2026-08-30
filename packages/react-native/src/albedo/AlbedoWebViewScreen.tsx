/**
 * Albedo WebView bridge — the React Native implementation of
 * `AlbedoWebViewBridge` from the headless entry.
 *
 * Renders a full-screen modal WebView hosting Albedo's confirm page and
 * reproduces the web popup protocol:
 *
 *  1. `injectedJavaScriptBeforeContentLoaded` shims `window.opener` so every
 *     `(window.opener || window.parent).postMessage(...)` Albedo makes is
 *     forwarded to RN via `window.ReactNativeWebView.postMessage`.
 *  2. Once the page signals readiness (`{albedo: {protocol}}`), we deliver
 *     the intent params as a synthetic `MessageEvent` — byte-for-byte what
 *     `window.open(...).postMessage(params, '*')` would have delivered.
 *  3. The user confirms in Albedo's own UI; the result arrives at our shim.
 *
 * The screen carries a browser toolbar (WebViewToolbar): the current URL
 * chip with tap-to-copy, Reload, and Open-in-browser — the browser
 * affordances a bare WebView lacks. Reload restarts the handshake: the
 * fresh page re-signals readiness and the intent params are re-delivered.
 *
 * Security notes:
 * - The WebView is locked to `https://albedo.link/` (navigation guard).
 * - `origin` is sent with the intent so Albedo can display the requesting
 *   app and run its stoplist check, exactly like on the web.
 * - The bridge resolves a single intent per open — no ambient session.
 */

import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewNavigation, type WebViewMessageEvent } from 'react-native-webview';
import type { AlbedoWebViewBridge } from '../connectors/albedo-webview.js';
import { ALBEDO_FRONTEND_URL } from '../connectors/albedo-webview.js';
import { WebViewToolbar } from '../browser/WebViewToolbar.js';

/**
 * Creates the bridge object to pass to `createAlbedoWebViewConnector()` /
 * `defaultReactNativeConnectors({ albedoBridge })`. One active intent at a
 * time; the modal hosting the WebView must be rendered by your app:
 *
 * ```tsx
 * const [bridgeEl, setBridgeEl] = useState<React.ReactElement | null>(null);
 * const bridge = useMemo(() => createAlbedoWebViewBridge((el) => setBridgeEl(el)), []);
 * // ...register connector with `bridge`, and render `{bridgeEl}` at your root.
 * ```
 */
export function createAlbedoWebViewBridge(
  render: (element: React.ReactElement | null) => void
): AlbedoWebViewBridge {
  return {
    openIntent(url, params) {
      return new Promise<Record<string, unknown>>((resolve, reject) => {
        render(
          <AlbedoWebViewScreen
            url={url}
            params={params}
            onResult={(result) => {
              render(null);
              resolve(result);
            }}
            onFail={(error) => {
              render(null);
              reject(error);
            }}
          />
        );
      });
    },
  };
}

export interface AlbedoWebViewScreenProps {
  url: string;
  params: Record<string, unknown>;
  onResult: (result: Record<string, unknown>) => void;
  onFail: (error: Error) => void;
  /** Light/dark chrome; defaults to dark like the web modal. */
  dark?: boolean;
}

export function AlbedoWebViewScreen({ url, params, onResult, onFail, dark = true }: AlbedoWebViewScreenProps) {
  const [ready, setReady] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(url);
  const sentRef = useRef(false);
  const webviewRef = useRef<React.ComponentRef<typeof WebView>>(null);

  const bg = dark ? '#09090B' : '#FFFFFF';
  const fg = dark ? '#FAFAFA' : '#18181B';

  // Shim installed before any page script runs: route Albedo's
  // opener.postMessage replies to the RN side.
  const openerShim = `
    (function () {
      var post = function (msg) {
        try { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch (e) {}
      };
      window.opener = { postMessage: post, closed: false, close: function () {} };
      window.parent = window.parent === window ? { postMessage: post } : window.parent;
    })();
    true;
  `;

  const deliverParams = useCallback(() => {
    if (sentRef.current) return;
    sentRef.current = true;
    // Synthetic MessageEvent — the exact shape Albedo's message listener
    // consumes (it reads data/origin; source is unused by the confirm flow).
    const payload = JSON.stringify(params).replace(/</g, '\\u003c');
    webviewRef.current?.injectJavaScript(
      `window.dispatchEvent(new MessageEvent('message', { data: ${payload}, origin: ${JSON.stringify(
        (params.__app_origin as string) ?? 'https://example.com'
      )} })); true;`
    );
  }, [params]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      const msg = parsed as Record<string, unknown>;
      // Readiness ping: (window.opener || window.parent).postMessage({albedo: {protocol}})
      if (msg && typeof msg === 'object' && 'albedo' in msg) {
        setReady(true);
        deliverParams();
        return;
      }
      // Intent response — matches the __reqid we sent.
      if (msg && typeof msg === 'object' && '__reqid' in msg) {
        onResult(msg);
      }
    },
    [deliverParams, onResult]
  );

  const guardNavigation = useCallback(
    (nav: WebViewNavigation): boolean => {
      // Lock the WebView to Albedo's origin.
      return nav.url.startsWith('https://albedo.link/');
    },
    []
  );

  // Navigation tracking feeds the toolbar's URL chip, and a fresh page load
  // (reload button, internal redirect) restarts the handshake: readiness
  // resets and the intent params are re-delivered when Albedo re-pings.
  const handleNavigationState = useCallback((nav: { url: string; loading: boolean }) => {
    setCurrentUrl(nav.url);
    if (nav.loading) {
      sentRef.current = false;
      setReady(false);
    }
  }, []);

  return (
    <Modal visible animationType="slide" onRequestClose={() => onFail(new Error('Albedo confirmation was closed before completing.'))}>
      <View style={[styles.container, { backgroundColor: bg }]}>
        <WebViewToolbar
          url={currentUrl}
          dark={dark}
          onCancel={() => onFail(new Error('Albedo confirmation was cancelled.'))}
          onReload={() => webviewRef.current?.reload()}
        />
        <WebView
          ref={webviewRef}
          source={{ uri: url }}
          injectedJavaScriptBeforeContentLoaded={openerShim}
          onMessage={handleMessage}
          onShouldStartLoadWithRequest={guardNavigation}
          onNavigationStateChange={handleNavigationState}
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
        {!ready && (
          <View style={[styles.loader, { backgroundColor: bg }]} pointerEvents="none">
            <ActivityIndicator />
            <Text style={{ color: fg, marginTop: 8 }}>Opening Albedo…</Text>
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
