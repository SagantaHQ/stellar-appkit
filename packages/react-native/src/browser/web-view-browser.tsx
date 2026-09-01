/**
 * In-app web browser — the WebView surface for plain http(s) handoffs
 * (explorer links, wallet install pages, docs, footer links).
 *
 * WHY the WebView and NOT Chrome Custom Tabs / SFSafariViewController
 * (the previous surface, since reverted):
 *
 * - **It can't complete wallet protocols.** A Custom Tab has no
 *   `window.opener` and no message channel back into the app — any
 *   postMessage-coupled flow (Albedo's confirm page, xBull's popup
 *   protocol) cannot even start there. Only the WebView bridges (which
 *   shim `window.opener`) can run those in-app.
 * - **It doesn't exist in Expo Go.** `react-native-inappbrowser-reborn`'s
 *   native module ships only in dev-client / standalone builds; the demo's
 *   primary environment is Expo Go, where every open silently degraded to
 *   the next surface anyway. The WebView works everywhere — Expo Go,
 *   dev-client, EAS, bare.
 * - **It stays in-app.** The URL chip (tap-to-copy), Reload and the
 *   toolbar affordances carry over from the Albedo/xBull screens, so
 *   explorer/install pages get the same browser chrome instead of
 *   bouncing the user out to the OS browser.
 *
 * The one real Custom-Tab advantage — WebAuthn passkeys (WKWebView does
 * not implement them) — is served by the toolbar's "Open in browser"
 * button: a page that needs a passkey is one tap away from the system
 * browser with its full feature set.
 *
 * The surface is INJECTED, not imported: Metro resolves every static
 * require at bundle time, so a library-level `require('react-native-webview')`
 * would break apps that don't have the package installed — the same
 * dependency-injection pattern as the Albedo/xBull bridges. The app renders
 * the screen element this module hands it (at the app root, so it can cover
 * whatever is on screen) and passes the session to the modal:
 *
 * ```tsx
 * const [browserView, setBrowserView] = useState<ReactElement | null>(null);
 * const browser = useMemo(() => createWebBrowser(setBrowserView), []);
 * // ...render {browserView} at the root, and:
 * <AppKitModal client={appkit} open={open} onClose={close} browser={browser} />
 *
 * await browser.open('https://stellar.expert'); // resolves 'closed' on dismiss
 * ```
 *
 * Albedo and xBull keep their dedicated WebView bridges (this module is for
 * plain pages, not protocols): their screens reset handshake state on
 * navigation and resolve one intent per open.
 */

import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { WebViewToolbar } from './WebViewToolbar.js';

/** http(s) URLs only — what the screen's navigation guard admits. */
export function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export interface WebBrowserScreenProps {
  /** The page to open — must be http(s). */
  url: string;
  /** User dismissed the browser (toolbar Cancel / back / Modal close). */
  onClose: () => void;
  /** Light/dark chrome; defaults to dark like the web modal. */
  dark?: boolean;
}

/**
 * The generic in-app browser page: full-screen Modal > toolbar + WebView.
 * Navigation is free within http(s) (install pages redirect around); every
 * other scheme is blocked — a page that wants a custom scheme is a job for
 * the toolbar's "Open in browser" button, not a silent OS handoff.
 */
export function WebBrowserScreen({ url, onClose, dark = true }: WebBrowserScreenProps) {
  const [currentUrl, setCurrentUrl] = useState(url);
  const [loading, setLoading] = useState(true);
  const webviewRef = useRef<React.ComponentRef<typeof WebView>>(null);

  const bg = dark ? '#09090B' : '#FFFFFF';

  const guardNavigation = useCallback((nav: WebViewNavigation): boolean => {
    return isHttpUrl(nav.url);
  }, []);

  const handleNavigationState = useCallback((nav: { url: string; loading: boolean }) => {
    setCurrentUrl(nav.url);
    setLoading(nav.loading);
  }, []);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: bg }]}>
        <WebViewToolbar
          url={currentUrl}
          dark={dark}
          cancelLabel="Close"
          onCancel={onClose}
          onReload={() => webviewRef.current?.reload()}
        />
        <WebView
          ref={webviewRef}
          source={{ uri: url }}
          onShouldStartLoadWithRequest={guardNavigation}
          onNavigationStateChange={handleNavigationState}
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          allowsBackForwardNavigationGestures
          textInteractionEnabled
          renderLoading={() => (
            <View style={[styles.loader, { backgroundColor: bg }]}>
              <ActivityIndicator />
            </View>
          )}
        />
        {loading && (
          <View style={[styles.loader, { backgroundColor: bg }]} pointerEvents="none">
            <ActivityIndicator />
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

/** Resolves once the user (or `close()`) dismissed the page. */
export type WebBrowserDismiss = 'closed';

/**
 * The in-app web browser session handed to `AppKitModal.browser` (and usable
 * directly). One page at a time — a new `open()` replaces the current page.
 */
export interface WebBrowserSession {
  /**
   * Opens an http(s) URL in the in-app WebView. Resolves `'closed'` when the
   * user dismisses the browser, when a new `open()` replaces this page, or
   * when `close()` is called. Non-http(s) URLs are refused: the promise
   * rejects (custom schemes are a `Linking` job, not a browser job).
   */
  open(url: string): Promise<WebBrowserDismiss>;
  /** Force-dismisses the current page, if any. */
  close(): void;
}

export interface CreateWebBrowserOptions {
  /** Light/dark chrome; defaults to dark like the web modal. */
  dark?: boolean;
}

/**
 * Creates the in-app web browser session. `render` receives the screen
 * element to mount at the app root (or `null` to unmount) — the same
 * element-injection contract as the Albedo/xBull bridges:
 *
 * ```tsx
 * const [el, setEl] = useState<ReactElement | null>(null);
 * const browser = useMemo(() => createWebBrowser(setEl), []);
 * // render {el} at the root
 * ```
 */
export function createWebBrowser(
  render: (element: React.ReactElement | null) => void,
  opts?: CreateWebBrowserOptions
): WebBrowserSession {
  let resolveCurrent: ((result: WebBrowserDismiss) => void) | null = null;

  const settle = (result: WebBrowserDismiss) => {
    const resolve = resolveCurrent;
    resolveCurrent = null;
    resolve?.(result);
  };

  const close = () => {
    if (!resolveCurrent) return;
    render(null);
    settle('closed');
  };

  return {
    open(url) {
      if (!isHttpUrl(url)) {
        // Custom schemes can't load in a WebView — refuse instead of
        // rendering a dead screen. (The modal never routes deep links here.)
        return Promise.reject(new Error(`The in-app browser only opens http(s) URLs, got: ${url}`));
      }
      // One page at a time: a pending open resolves — the user is moving on.
      if (resolveCurrent) {
        render(null);
        settle('closed');
      }
      return new Promise<WebBrowserDismiss>((resolve) => {
        resolveCurrent = resolve;
        render(
          <WebBrowserScreen
            url={url}
            dark={opts?.dark ?? true}
            onClose={() => {
              render(null);
              settle('closed');
            }}
          />
        );
      });
    },
    close,
  };
}
