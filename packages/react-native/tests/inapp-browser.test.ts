/**
 * Tests for the themed in-app browser session — the system-browser surface
 * (Chrome Custom Tabs / SFSafariViewController) that prefers the Chrome Tab
 * over the WebView whenever it exists.
 *
 * react-native can't run under bun (Flow syntax), so the suite installs the
 * package-standard mock first — same union surface as the other suites plus
 * Linking/AppState, which inapp-browser.ts uses for the external fallback.
 */

import { describe, expect, mock, test } from 'bun:test';

const linkingListeners: Record<string, Array<(event: { url: string }) => void>> = {};
const appStateListeners: Array<(state: string) => void> = [];

mock.module('react-native', () => ({
  Vibration: { vibrate: () => {} },
  StyleSheet: {
    create: (sheets: Record<string, unknown>) => sheets,
    hairlineWidth: 0.5,
  },
  Platform: {
    OS: 'android',
    select: (opts: Record<string, unknown>) => opts.android ?? opts.default ?? opts.ios,
  },
  Animated: {
    Value: class {},
    loop: () => ({ start: () => {}, stop: () => {} }),
    timing: () => ({}),
    parallel: () => ({ start: () => {}, stop: () => {} }),
    sequence: () => ({}),
  },
  AccessibilityInfo: {
    isReduceMotionEnabled: async () => false,
    addEventListener: () => ({ remove: () => {} }),
  },
  Easing: {
    linear: (x: number) => x,
    inOut: (x: number) => x,
    quad: (x: number) => x,
    bezier: () => (x: number) => x,
  },
  NativeModules: {},
  Linking: {
    openURL: mock(async () => undefined),
    addEventListener: (type: string, handler: (event: { url: string }) => void) => {
      linkingListeners[type] = [...(linkingListeners[type] ?? []), handler];
      return { remove: () => {} };
    },
  },
  AppState: {
    addEventListener: (handler: (state: string) => void) => {
      appStateListeners.push(handler);
      return { remove: () => {} };
    },
  },
}));

const {
  createThemedBrowserSession,
  buildRebornOptions,
  buildExpoOptions,
} = await import('../src/browser/inapp-browser.js');

import type { RebornBrowserLike, ExpoWebBrowserLike, ThemedBrowserOptions } from '../src/browser/inapp-browser.js';

const THEME = { colorSurface: '#18181B', colorBg: '#09090B', colorBorder: '#27272A', colorAccent: '#7C5CFC' };

function makeReborn(overrides: Partial<RebornBrowserLike> = {}): RebornBrowserLike {
  return {
    open: mock(async () => ({ type: 'cancel' as const })),
    openAuth: mock(async () => ({ type: 'cancel' as const })),
    close: mock(() => {}),
    closeAuth: mock(() => {}),
    isAvailable: mock(async () => true),
    warmup: mock(async () => undefined),
    ...overrides,
  };
}

function makeExpo(overrides: Partial<ExpoWebBrowserLike> = {}): ExpoWebBrowserLike {
  return {
    openBrowserAsync: mock(async () => ({ type: 'cancel' })),
    openAuthSessionAsync: mock(async () => ({ type: 'cancel' as const })),
    dismissBrowser: mock(async () => undefined),
    getCustomTabsSupportingBrowsersAsync: mock(async () => ({
      preferredBrowserPackage: 'com.android.chrome',
      browserPackages: ['com.android.chrome'],
    })),
    warmUpAsync: mock(async () => undefined),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Option builders — the theme → browser-chrome mapping
// ---------------------------------------------------------------------------

describe('buildRebornOptions — themed Chrome Custom Tabs / SFSafariVC', () => {
  test('maps theme tokens onto Android toolbar + iOS modal styling', () => {
    const opts = buildRebornOptions({ theme: THEME });
    // Android — Chrome Custom Tabs
    expect(opts.toolbarColor).toBe(THEME.colorSurface);
    expect(opts.secondaryToolbarColor).toBe(THEME.colorBg);
    expect(opts.navigationBarColor).toBe(THEME.colorSurface);
    expect(opts.navigationBarDividerColor).toBe(THEME.colorBorder);
    // iOS — modal pageSheet + themed tints
    expect(opts.modalEnabled).toBe(true);
    expect(opts.modalPresentationStyle).toBe('pageSheet');
    expect(opts.preferredBarTintColor).toBe(THEME.colorSurface);
    expect(opts.preferredControlTintColor).toBe(THEME.colorAccent);
    expect(opts.dismissButtonStyle).toBe('close');
  });

  test('modal: false switches iOS to fullScreen; non-modal is opt-in', () => {
    expect(buildRebornOptions({ theme: THEME, modal: false }).modalPresentationStyle).toBe('fullScreen');
    expect(buildRebornOptions({ theme: THEME, modal: false }).modalEnabled).toBe(false);
  });

  test('falls back to built-in tokens when no theme is given', () => {
    const opts = buildRebornOptions();
    expect(typeof opts.toolbarColor).toBe('string');
    expect(opts.toolbarColor).toMatch(/^#/);
    expect(opts.modalPresentationStyle).toBe('pageSheet');
  });

  test('ephemeralWebSession is off by default and pass-through when set', () => {
    expect(buildRebornOptions().ephemeralWebSession).toBe(false);
    expect(buildRebornOptions({ ephemeralWebSession: true }).ephemeralWebSession).toBe(true);
  });
});

describe('buildExpoOptions — the Expo Go surface, same chrome', () => {
  test('maps theme tokens onto the expo-web-browser option set', () => {
    const opts = buildExpoOptions({ theme: THEME });
    expect(opts.toolbarColor).toBe(THEME.colorSurface);
    expect(opts.secondaryToolbarColor).toBe(THEME.colorBg);
    expect(opts.presentationStyle).toBe('pageSheet');
    expect(opts.controlsColor).toBe(THEME.colorAccent);
    expect(opts.dismissButtonStyle).toBe('close');
    expect(opts.modalEnabled).toBeUndefined(); // expo has no modalEnabled — separate maps per adapter
  });
});

// ---------------------------------------------------------------------------
// Surface preference — reborn > expo > external, with live availability
// ---------------------------------------------------------------------------

describe('createThemedBrowserSession — surface preference chain', () => {
  test('prefers reborn when injected (surface label)', () => {
    const session = createThemedBrowserSession({ reborn: makeReborn(), expo: makeExpo() });
    expect(session.surface).toBe('reborn');
  });

  test('expo when reborn is absent', () => {
    expect(createThemedBrowserSession({ expo: makeExpo() }).surface).toBe('expo');
  });

  test('external when neither adapter is injected', () => {
    expect(createThemedBrowserSession({}).surface).toBe('external');
  });

  test('open() uses reborn when its browser is available', async () => {
    const reborn = makeReborn();
    const expo = makeExpo();
    const session = createThemedBrowserSession({ reborn, expo });
    const result = await session.open('https://stellar.expert');
    expect(result).toEqual({ surface: 'reborn', type: 'cancel' });
    expect(reborn.open).toHaveBeenCalledTimes(1);
    expect(expo.openBrowserAsync).not.toHaveBeenCalled();
    // The themed option map was passed through.
    const passed = (reborn.open as ReturnType<typeof mock>).mock.calls[0]![1] as Record<string, unknown>;
    expect(passed.toolbarColor).toBeDefined();
  });

  test('open() falls to expo when reborn reports no browser (isAvailable=false)', async () => {
    const reborn = makeReborn({ isAvailable: mock(async () => false) });
    const expo = makeExpo();
    const session = createThemedBrowserSession({ reborn, expo });
    const result = await session.open('https://stellar.expert');
    expect(result).toEqual({ surface: 'expo', type: 'cancel' });
    expect(reborn.open).not.toHaveBeenCalled();
    expect(expo.openBrowserAsync).toHaveBeenCalledTimes(1);
  });

  test('open() falls to expo when reborn THROWS — the Expo Go case (native module missing)', async () => {
    const reborn = makeReborn({
      // In Expo Go, RNInAppBrowser is undefined → isAvailable() throws.
      isAvailable: mock(() => {
        throw new TypeError("Cannot read property 'isAvailable' of undefined");
      }),
    });
    const expo = makeExpo();
    const session = createThemedBrowserSession({ reborn, expo });
    const result = await session.open('https://stellar.expert');
    expect(result.surface).toBe('expo');
    expect(expo.openBrowserAsync).toHaveBeenCalledTimes(1);
  });

  test('open() falls to the external browser when every in-app surface fails', async () => {
    const expo = makeExpo({
      openBrowserAsync: mock(() => {
        throw new Error('no browser activity');
      }),
    });
    const session = createThemedBrowserSession({ expo });
    const result = await session.open('https://stellar.expert');
    expect(result).toEqual({ surface: 'external', type: 'opened' });
  });

  test('open() with no adapters opens via Linking', async () => {
    const session = createThemedBrowserSession({});
    const result = await session.open('https://stellar.expert');
    expect(result).toEqual({ surface: 'external', type: 'opened' });
  });

  test('defaults theme + per-call overrides both reach the adapter', async () => {
    const reborn = makeReborn();
    const session = createThemedBrowserSession(
      { reborn },
      { theme: THEME, dismissButtonStyle: 'done' }
    );
    await session.open('https://x.dev');
    let passed = (reborn.open as ReturnType<typeof mock>).mock.calls[0]![1] as Record<string, unknown>;
    expect(passed.toolbarColor).toBe(THEME.colorSurface);
    expect(passed.dismissButtonStyle).toBe('done');

    await session.open('https://x.dev', { theme: { ...THEME, colorSurface: '#FFFFFF' } });
    passed = (reborn.open as ReturnType<typeof mock>).mock.calls[1]![1] as Record<string, unknown>;
    expect(passed.toolbarColor).toBe('#FFFFFF');
    // Key-by-key merge: the rest of the default theme survives.
    expect(passed.secondaryToolbarColor).toBe(THEME.colorBg);
  });
});

// ---------------------------------------------------------------------------
// openAuth — redirect interception through the same chain
// ---------------------------------------------------------------------------

describe('openAuth — redirect-intercepting sessions', () => {
  test('reborn success carries the redirect URL', async () => {
    const reborn = makeReborn({
      openAuth: mock(async () => ({ type: 'success' as const, url: 'myapp://cb?pubkey=GXYZ&sig=abc' })),
    });
    const session = createThemedBrowserSession({ reborn });
    const result = await session.openAuth('https://wallet.example/connect', 'myapp://cb');
    expect(result).toEqual({ surface: 'reborn', type: 'success', url: 'myapp://cb?pubkey=GXYZ&sig=abc' });
  });

  test('expo success when reborn is unavailable', async () => {
    const reborn = makeReborn({ isAvailable: mock(async () => false) });
    const expo = makeExpo({
      openAuthSessionAsync: mock(async () => ({ type: 'success' as const, url: 'myapp://cb?ok=1' })),
    });
    const session = createThemedBrowserSession({ reborn, expo });
    const result = await session.openAuth('https://wallet.example/connect', 'myapp://cb');
    expect(result).toEqual({ surface: 'expo', type: 'success', url: 'myapp://cb?ok=1' });
  });

  test('dismiss/cancel pass through normalized', async () => {
    const reborn = makeReborn({ openAuth: mock(async () => ({ type: 'dismiss' as const })) });
    const session = createThemedBrowserSession({ reborn });
    expect(await session.openAuth('https://w', 'myapp://cb')).toEqual({ surface: 'reborn', type: 'dismiss' });
  });

  test('external fallback resolves success on the Linking url event', async () => {
    const session = createThemedBrowserSession({});
    const pending = session.openAuth('https://wallet.example/connect', 'myapp://cb');
    // Simulate the OS delivering the redirect back into the app.
    await new Promise((r) => setTimeout(r, 5));
    for (const handler of linkingListeners['url'] ?? []) {
      handler({ url: 'myapp://cb?signed=xyz' });
    }
    expect(await pending).toEqual({ surface: 'external', type: 'success', url: 'myapp://cb?signed=xyz' });
  });
});

// ---------------------------------------------------------------------------
// Chrome Tab detection — "when chrometab exists we use chrometab"
// ---------------------------------------------------------------------------

describe('isChromeTabsAvailable — Chrome Tab detection via the same library', () => {
  test('true when reborn reports availability (its own isAvailable())', async () => {
    const session = createThemedBrowserSession({ reborn: makeReborn() });
    expect(await session.isChromeTabsAvailable()).toBe(true);
  });

  test('false when reborn is missing and expo lists no Custom Tabs browsers', async () => {
    const expo = makeExpo({
      getCustomTabsSupportingBrowsersAsync: mock(async () => ({ browserPackages: [] })),
    });
    const session = createThemedBrowserSession({ expo });
    expect(await session.isChromeTabsAvailable()).toBe(false);
  });

  test('true via expo getCustomTabsSupportingBrowsersAsync when reborn is absent', async () => {
    const expo = makeExpo();
    const session = createThemedBrowserSession({ expo });
    expect(await session.isChromeTabsAvailable()).toBe(true);
  });

  test('false when every detector fails or is absent', async () => {
    expect(await createThemedBrowserSession({}).isChromeTabsAvailable()).toBe(false);
    const expo = makeExpo({
      getCustomTabsSupportingBrowsersAsync: mock(() => {
        throw new Error('unsupported');
      }),
    });
    expect(await createThemedBrowserSession({ expo }).isChromeTabsAvailable()).toBe(false);
  });

  test('reborn throwing (Expo Go) degrades to the expo detector', async () => {
    const reborn = makeReborn({ isAvailable: mock(() => { throw new Error('no native module'); }) });
    const session = createThemedBrowserSession({ reborn, expo: makeExpo() });
    expect(await session.isChromeTabsAvailable()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// close / warmup
// ---------------------------------------------------------------------------

describe('close + warmup', () => {
  test('close() dismisses whichever adapter may be showing, never throws', () => {
    const reborn = makeReborn();
    const expo = makeExpo();
    const session = createThemedBrowserSession({ reborn, expo });
    session.close();
    expect(reborn.close).toHaveBeenCalledTimes(1);
    expect(reborn.closeAuth).toHaveBeenCalledTimes(1);
    expect(expo.dismissBrowser).toHaveBeenCalledTimes(1);

    const broken = makeReborn({
      close: mock(() => { throw new Error('native gone'); }),
    });
    expect(() => createThemedBrowserSession({ reborn: broken }).close()).not.toThrow();
  });

  test('warmup() warms the ready surface and is a no-op without adapters', async () => {
    const reborn = makeReborn();
    const session = createThemedBrowserSession({ reborn });
    await session.warmup();
    expect(reborn.warmup).toHaveBeenCalledTimes(1);

    const expoOnly = makeExpo();
    await createThemedBrowserSession({ expo: expoOnly }).warmup();
    expect(expoOnly.warmUpAsync).toHaveBeenCalledTimes(1);

    await createThemedBrowserSession({}).warmup(); // no adapters — no crash
  });
});

// ---------------------------------------------------------------------------
// ThemedBrowserOptions passthrough of an app theme object (ConnectThemeRN shape)
// ---------------------------------------------------------------------------

describe('theme compatibility', () => {
  test('a ConnectThemeRN-shaped object slots straight in as the browser theme', () => {
    const connectTheme = {
      ...THEME,
      colorText: '#FAFAFA',
      colorTextMuted: '#A1A1AA',
      colorSurfaceHover: '#27272A',
      colorDanger: '#DC2626',
      colorAccentText: '#FFFFFF',
      radiusSm: 10,
      radiusMd: 14,
      radiusLg: 20,
    };
    const opts: ThemedBrowserOptions = { theme: connectTheme };
    expect(buildRebornOptions(opts).toolbarColor).toBe(connectTheme.colorSurface);
    expect(buildExpoOptions(opts).controlsColor).toBe(connectTheme.colorAccent);
  });
});
