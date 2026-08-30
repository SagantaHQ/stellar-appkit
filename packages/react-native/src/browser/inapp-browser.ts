/**
 * Themed in-app browser for wallet flows — the system-browser surface:
 * Chrome Custom Tabs on Android, SFSafariViewController on iOS.
 *
 * WHY this exists (the WebView can't always be the answer):
 *
 * - **Passkeys / WebAuthn** — WKWebView does not implement WebAuthn (Apple
 *   reserves the platform authenticator for apps with the web-browser
 *   entitlement; "Apple does not support FIDO2 … using a WKWebView"), and
 *   Android WebView has no platform authenticator either. Chrome Custom
 *   Tabs and SFSafariViewController DO — "SFSafariViewControllers already
 *   support WebAuthn, they do not need custom configuration". Any web
 *   wallet whose login needs a passkey must therefore be opened in the
 *   system-browser surface, not the in-app WebView.
 * - **Shared browser session** — Custom Tabs share Chrome's cookies and
 *   SFSafariViewController shares Safari's: a wallet the user already
 *   unlocked in their browser is already unlocked here. The WebView starts
 *   from a clean cookie jar every install.
 * - **Lighter** — no WebView heap in your process; the OS owns the tab.
 *
 * THE PREFERENCE CHAIN (prefer the Chrome Tab over the "heavy" WebView
 * whenever it exists, detected via the same library):
 *
 *   1. `react-native-inappbrowser-reborn` — Custom Tabs/SFSafariVC with the
 *      full styling surface (modal pageSheet presentation on iOS, themed
 *      toolbars on Android), `isAvailable()` Chrome-Tab detection and
 *      `openAuth()` redirect interception. Needs a dev client / standalone
 *      build (its native module is not part of Expo Go).
 *   2. `expo-web-browser` — the same OS surfaces with toolbar theming and
 *      `openAuthSessionAsync` redirect interception, bundled with Expo Go.
 *   3. External browser via `Linking` — always available, leaves the app.
 *
 * Adapters are INJECTED, not imported: Metro resolves every static
 * require at bundle time, so a library-level `require('react-native-…')`
 * would break apps that don't have the package installed. The app passes
 * whichever modules it has (the same dependency-injection pattern as the
 * Albedo/xBull WebView bridges):
 *
 * ```ts
 * import InAppBrowser from 'react-native-inappbrowser-reborn';
 * import * as ExpoWebBrowser from 'expo-web-browser';
 *
 * const browser = createThemedBrowserSession(
 *   { reborn: InAppBrowser, expo: ExpoWebBrowser },
 *   { theme: stellarDark }        // any ConnectThemeRN — restyles the tab
 * );
 *
 * // Themed modal browser — resolves when the user dismisses the tab.
 * await browser.open('https://stellar.expert');
 *
 * // Redirect-intercepting session (for wallets with redirect callbacks).
 * const result = await browser.openAuth(url, 'myapp://wallet-callback');
 * if (result.type === 'success') parseResult(result.url);
 *
 * // Chrome Tab present? (reborn.isAvailable() / getCustomTabsSupportingBrowsers)
 * if (await browser.isChromeTabsAvailable()) { … }
 * ```
 *
 * WHY THE WEBVIEW STAYS FOR ALBEDO/xBULL: their protocols are
 * postMessage-coupled end to end. Albedo's confirm page receives the intent
 * request only via `window.postMessage` (the /confirm URL takes no query
 * params) and replies to `window.opener`; xBull's connect page replies via
 * the bare `opener` global with no redirect fallback. A Custom Tab has no
 * `window.opener` and no message channel back to the app — the flow cannot
 * even start there. The WebView bridges (which shim `window.opener`) remain
 * the only completable in-app surface for those two wallets; every plain
 * http(s) handoff (explorer links, wallet install pages, docs) moves to
 * this themed browser, and any wallet that adds redirect callbacks plugs
 * straight into `openAuth()`.
 */

import { AppState, Linking, Platform } from 'react-native';

/** Theme tokens the browser surfaces can apply. Any `ConnectThemeRN` fits. */
export interface BrowserThemeTokens {
  /** Android toolbar / iOS bar background. */
  colorSurface: string;
  /** Android secondary toolbar (the bottom bar) background. */
  colorBg: string;
  /** Android navigation-bar divider hairline. */
  colorBorder: string;
  /** iOS controls tint (close button, ...). */
  colorAccent: string;
}

/**
 * The `react-native-inappbrowser-reborn` module surface this package uses —
 * structurally typed so the app injects whatever it has installed.
 * (Return types are intentionally loose: the session normalizes them.)
 */
export interface RebornBrowserLike {
  open(url: string, options?: Record<string, unknown>): Promise<{ type: string }>;
  openAuth(
    url: string,
    redirectUrl: string,
    options?: Record<string, unknown>
  ): Promise<{ type: string; url?: string }>;
  close(): void;
  closeAuth(): void;
  /** False when no Custom Tabs provider exists (Android) — the Chrome Tab detection. */
  isAvailable(): Promise<boolean>;
  warmup?(): Promise<unknown>;
  mayLaunchUrl?(url: string, extras?: unknown): void | Promise<unknown>;
}

/** The `expo-web-browser` module surface this package uses. */
export interface ExpoWebBrowserLike {
  openBrowserAsync(url: string, options?: Record<string, unknown>): Promise<{ type: string }>;
  openAuthSessionAsync(
    url: string,
    redirectUrl?: string | null,
    options?: Record<string, unknown>
  ): Promise<{ type: string; url?: string }>;
  dismissBrowser(): Promise<unknown>;
  /** Expo Go-compatible Chrome Tab detection (Android). */
  getCustomTabsSupportingBrowsersAsync?(): Promise<{
    preferredBrowserPackage?: string | null;
    browserPackages?: string[];
  }>;
  warmUpAsync?(browserPackage?: string): Promise<unknown>;
  mayInitWithUrlAsync?(url: string, browserPackage?: string): Promise<unknown>;
  coolDownAsync?(browserPackage?: string): Promise<unknown>;
}

/** Normalized auth-session result both adapters produce. */
export type AuthSessionShape =
  | { type: 'success'; url: string }
  | { type: 'cancel' | 'dismiss' };

/** Which system surface handled a call. */
export type BrowserSurface = 'reborn' | 'expo' | 'external';

export interface BrowserOpenResult {
  surface: BrowserSurface;
  /** 'cancel' — user dismissed the tab; 'opened' — external browser handed off. */
  type: 'cancel' | 'dismiss' | 'opened';
}

export type BrowserAuthResult =
  | { surface: BrowserSurface; type: 'success'; url: string }
  | { surface: BrowserSurface; type: 'cancel' | 'dismiss' };

export interface ThemedBrowserOptions {
  /** Theming for the browser chrome (toolbars, tints). */
  theme?: BrowserThemeTokens;
  /**
   * Modal presentation — iOS renders SFSafariViewController as a `pageSheet`
   * (the sheet-like partial cover) instead of full screen. Default: true.
   */
  modal?: boolean;
  /** iOS dismiss-button style. Default: 'close'. */
  dismissButtonStyle?: 'done' | 'close' | 'cancel';
  /**
   * Ask the browser not to reuse the previous session's cookies
   * (openAuth only; honored per-platform). Default: false.
   */
  ephemeralWebSession?: boolean;
}

export interface ThemedBrowserSession {
  /** The surface this session prefers (reborn > expo > external). */
  readonly surface: BrowserSurface;
  /**
   * Whether a Chrome Custom Tabs provider exists (Android) /
   * SFSafariViewController is usable (iOS — always true).
   * Detected through the SAME library that opens the tab: reborn's
   * `isAvailable()`, falling back to expo-web-browser's
   * `getCustomTabsSupportingBrowsersAsync()`.
   */
  isChromeTabsAvailable(): Promise<boolean>;
  /**
   * Opens an http(s) URL in the themed system browser and resolves when the
   * user dismisses it. Falls to the external browser when no in-app surface
   * is available. (Custom Tabs can't open custom schemes — wallet deep
   * links still go through `Linking`.)
   */
  open(url: string, opts?: ThemedBrowserOptions): Promise<BrowserOpenResult>;
  /**
   * Redirect-intercepting session for wallets with redirect callbacks: the
   * browser resolves as soon as the page navigates to `redirectUrl`
   * (a custom scheme of the app), with the full redirect URL returned —
   * result params included, however the wallet encodes them.
   */
  openAuth(url: string, redirectUrl: string, opts?: ThemedBrowserOptions): Promise<BrowserAuthResult>;
  /** Dismisses the presented browser (both adapters, whichever is showing). */
  close(): void;
  /** Pre-warms the browser process so the first open is instant. */
  warmup(): Promise<void>;
}

const DEFAULT_THEME: BrowserThemeTokens = {
  colorSurface: '#18181B',
  colorBg: '#09090B',
  colorBorder: '#27272A',
  colorAccent: '#7C5CFC',
};

/** Resolved option set shared by the builders. */
interface ResolvedOptions {
  theme: BrowserThemeTokens;
  modal: boolean;
  dismissButtonStyle: 'done' | 'close' | 'cancel';
  ephemeralWebSession: boolean;
}

function resolveOptions(opts?: ThemedBrowserOptions): ResolvedOptions {
  return {
    theme: { ...DEFAULT_THEME, ...opts?.theme },
    modal: opts?.modal !== false,
    dismissButtonStyle: opts?.dismissButtonStyle ?? 'close',
    ephemeralWebSession: opts?.ephemeralWebSession ?? false,
  };
}

/**
 * Theme → `react-native-inappbrowser-reborn` option map:
 *
 * Android (Chrome Custom Tabs): themed toolbar + secondary toolbar +
 * navigation bar + divider hairline.
 * iOS (SFSafariViewController): `pageSheet` modal presentation, themed bar
 * tint, accent-tinted controls, close-style dismiss button.
 */
export function buildRebornOptions(opts?: ThemedBrowserOptions): Record<string, unknown> {
  const o = resolveOptions(opts);
  return {
    // Android — Chrome Custom Tabs
    toolbarColor: o.theme.colorSurface,
    secondaryToolbarColor: o.theme.colorBg,
    navigationBarColor: o.theme.colorSurface,
    navigationBarDividerColor: o.theme.colorBorder,
    enableUrlBarHiding: true,
    showTitle: false,
    // iOS — SFSafariViewController
    modalEnabled: o.modal,
    modalPresentationStyle: o.modal ? 'pageSheet' : 'fullScreen',
    preferredBarTintColor: o.theme.colorSurface,
    preferredControlTintColor: o.theme.colorAccent,
    dismissButtonStyle: o.dismissButtonStyle,
    readerMode: false,
    animated: true,
    ephemeralWebSession: o.ephemeralWebSession,
  };
}

/**
 * Theme → `expo-web-browser` option map (the same chrome via Expo Go's
 * module): Android toolbar colors, iOS `pageSheet` presentation + accent
 * controls. Each platform ignores the other's fields, so one flat object
 * is safe to pass.
 */
export function buildExpoOptions(opts?: ThemedBrowserOptions): Record<string, unknown> {
  const o = resolveOptions(opts);
  return {
    // Android — Chrome Custom Tabs
    toolbarColor: o.theme.colorSurface,
    secondaryToolbarColor: o.theme.colorBg,
    enableBarCollapsing: false,
    showTitle: false,
    enableDefaultShareMenuItem: false,
    createTask: true,
    // iOS — SFSafariViewController
    presentationStyle: o.modal ? 'pageSheet' : 'fullScreen',
    controlsColor: o.theme.colorAccent,
    dismissButtonStyle: o.dismissButtonStyle,
  };
}

/** Run an async adapter call, treating a sync throw or rejection as "unavailable". */
async function soft<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    // The adapter's native module is missing (reborn inside Expo Go), the
    // browser process died, or the platform refused the URL — the caller
    // falls to the next surface.
    return null;
  }
}

/**
 * Builds the themed in-app browser session. See the module docs for the
 * preference chain and the injection pattern.
 */
export function createThemedBrowserSession(
  adapters: { reborn?: RebornBrowserLike; expo?: ExpoWebBrowserLike },
  defaults?: ThemedBrowserOptions
): ThemedBrowserSession {
  const surface: BrowserSurface = adapters.reborn ? 'reborn' : adapters.expo ? 'expo' : 'external';

  const withDefaults = (opts?: ThemedBrowserOptions): ThemedBrowserOptions => {
    const merged: ThemedBrowserOptions = { ...defaults, ...opts };
    // Theme merges key-by-key so a per-call partial theme (or no theme at
    // all) keeps the default tokens for everything it doesn't override.
    const theme: BrowserThemeTokens = { ...DEFAULT_THEME };
    if (defaults?.theme) Object.assign(theme, defaults.theme);
    if (opts?.theme) Object.assign(theme, opts.theme);
    merged.theme = theme;
    return merged;
  };

  /** reborn present AND its browser actually available on this device? */
  const rebornReady = async (): Promise<boolean> => {
    if (!adapters.reborn) return false;
    return (await soft(() => adapters.reborn!.isAvailable())) === true;
  };

  async function openViaReborn(url: string, options: Record<string, unknown>): Promise<BrowserOpenResult | null> {
    if (!(await rebornReady())) return null;
    const result = await soft(() => adapters.reborn!.open(url, options));
    if (!result) return null;
    return { surface: 'reborn', type: result.type === 'dismiss' ? 'dismiss' : 'cancel' };
  }

  async function openViaExpo(url: string, options: Record<string, unknown>): Promise<BrowserOpenResult | null> {
    if (!adapters.expo) return null;
    const result = await soft(() => adapters.expo!.openBrowserAsync(url, options));
    if (!result) return null;
    // expo-web-browser resolves {type:'cancel'} when dismissed ('opened' on web).
    return { surface: 'expo', type: result.type === 'opened' ? 'opened' : 'cancel' };
  }

  async function openExternal(url: string): Promise<BrowserOpenResult> {
    await Linking.openURL(url);
    return { surface: 'external', type: 'opened' };
  }

  async function openAuthViaReborn(
    url: string,
    redirectUrl: string,
    options: Record<string, unknown>
  ): Promise<BrowserAuthResult | null> {
    if (!(await rebornReady())) return null;
    const result = await soft(() => adapters.reborn!.openAuth(url, redirectUrl, options));
    if (!result) return null;
    if (result.type === 'success' && typeof result.url === 'string') {
      return { surface: 'reborn', type: 'success', url: result.url };
    }
    return { surface: 'reborn', type: result.type === 'dismiss' ? 'dismiss' : 'cancel' };
  }

  async function openAuthViaExpo(
    url: string,
    redirectUrl: string,
    options: Record<string, unknown>
  ): Promise<BrowserAuthResult | null> {
    if (!adapters.expo) return null;
    const result = await soft(() => adapters.expo!.openAuthSessionAsync(url, redirectUrl, options));
    if (!result) return null;
    if (result.type === 'success' && typeof result.url === 'string') {
      return { surface: 'expo', type: 'success', url: result.url };
    }
    return { surface: 'expo', type: result.type === 'dismiss' ? 'dismiss' : 'cancel' };
  }

  /**
   * Last-resort auth session with no in-app browser: hand the URL to the
   * external browser and watch for a Linking `url` event back into the app
   * (compact port of reborn's polyfill — resolves success on the redirect,
   * cancel when the user returns without one).
   */
  function openAuthExternal(url: string, redirectUrl: string): Promise<BrowserAuthResult> {
    const opened = soft(() => Promise.resolve(Linking.openURL(url)).then(() => undefined));
    return new Promise<BrowserAuthResult>((resolve) => {
      let settled = false;
      const done = (result: BrowserAuthResult) => {
        if (settled) return;
        settled = true;
        urlSub?.remove?.();
        appStateSub?.remove?.();
        resolve(result);
      };
      const onUrl = (event: { url: string }) => {
        if (event.url && event.url.startsWith(redirectUrl)) {
          done({ surface: 'external', type: 'success', url: event.url });
        }
      };
      const onAppState = (state: string) => {
        if (state === 'active') done({ surface: 'external', type: 'cancel' });
      };
      const urlSub = Linking.addEventListener?.('url', onUrl);
      const appStateSub = AppState.addEventListener?.('change', onAppState);
      if (!urlSub && !appStateSub) {
        // No event APIs at all (exotic runtime) — nothing to wait for.
        opened.then(() => done({ surface: 'external', type: 'cancel' }));
      }
    });
  }

  return {
    surface,

    async isChromeTabsAvailable(): Promise<boolean> {
      // iOS: SFSafariViewController ships with the OS — always available.
      if (Platform.OS === 'ios') return true;
      if (await rebornReady()) return true;
      if (adapters.expo?.getCustomTabsSupportingBrowsersAsync) {
        const support = await soft(() => adapters.expo!.getCustomTabsSupportingBrowsersAsync!());
        if (support) {
          return (support.browserPackages?.length ?? 0) > 0 || Boolean(support.preferredBrowserPackage);
        }
      }
      return false;
    },

    async open(url, opts) {
      const rebornOptions = buildRebornOptions(withDefaults(opts));
      const expoOptions = buildExpoOptions(withDefaults(opts));
      return (
        (await openViaReborn(url, rebornOptions)) ??
        (await openViaExpo(url, expoOptions)) ??
        (await openExternal(url))
      );
    },

    async openAuth(url, redirectUrl, opts) {
      const rebornOptions = buildRebornOptions(withDefaults(opts));
      const expoOptions = buildExpoOptions(withDefaults(opts));
      return (
        (await openAuthViaReborn(url, redirectUrl, rebornOptions)) ??
        (await openAuthViaExpo(url, redirectUrl, expoOptions)) ??
        (await openAuthExternal(url, redirectUrl))
      );
    },

    close() {
      try {
        adapters.reborn?.close();
        adapters.reborn?.closeAuth();
      } catch {
        /* native module missing — nothing is showing */
      }
      void Promise.resolve(adapters.expo?.dismissBrowser()).catch(() => undefined);
    },

    async warmup() {
      if (adapters.reborn && (await rebornReady())) {
        if (adapters.reborn.warmup) await soft(() => adapters.reborn!.warmup!());
        return;
      }
      if (adapters.expo?.warmUpAsync) await soft(() => adapters.expo!.warmUpAsync!());
    },
  };
}
