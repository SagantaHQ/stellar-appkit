/**
 * The shared react-native mock registry for this package's bun tests.
 *
 * WHY A SHARED SINGLETON: bun runs all test files in one process and
 * `mock.module()` registrations are global — whichever factory ran last
 * wins for the NEXT first-evaluation of a module that imports
 * 'react-native'. With per-file mock objects, a test file's behavioral
 * spies (AppState listeners, Clipboard, Share) could be swapped out from
 * under it by an interleaving file's registration mid-await. Returning the
 * SAME registry object from every factory kills the ordering problem: any
 * import of 'react-native' — from any file, at any time — links against
 * the identical object, and per-file behavior is configured by mutating
 * `rnState` instead of re-registering the module.
 *
 * The registry carries the UNION of every react-native export any module
 * under test links against (house rule — see ui-styles.test.ts).
 *
 * Behavioral pieces (AppState/Linking listener capture, Clipboard, Share)
 * read `rnState` at CALL time, so tests configure and reset behavior with
 * `rnState` + `resetRnState()` — never by re-mocking the module.
 */

import { mock } from 'bun:test';

export type AppStateHandler = (state: string) => void;
export type LinkingHandler = (event: { url: string }) => void;

/** Mutable behavioral state — configure directly in tests, reset in beforeEach. */
export const rnState = {
  /** Platform.OS — tests flip it ('ios' default; inapp-browser's Android Custom-Tabs paths need 'android'). */
  os: 'ios' as 'ios' | 'android',
  appStateListeners: [] as AppStateHandler[],
  linkingListeners: {} as Record<string, LinkingHandler[]>,
  /**
   * AppState.currentState — what focus-return reads to decide whether the
   * app is foregrounded. Defaults to 'active' (the common test posture);
   * backgrounded-app tests set 'background'.
   */
  appStateCurrent: 'active' as string | null | undefined,
  /** Linking.openURL(url) calls made since the last reset (focus-return tests assert on these). */
  openedUrls: [] as string[],
  /** When true, Linking.openURL rejects — the OS refusing a backgrounded self-open. */
  openUrlThrows: false,
  /** RN core Clipboard presence + behavior (see clipboard.ts). */
  hasClipboard: true,
  clipboardThrows: false,
  clipboardText: null as string | null,
  shareThrows: false,
  shareText: null as string | null,
  /**
   * InteractionManager gate (see warm-up.ts): when false (default),
   * runAfterInteractions fires its callback synchronously — RN's own
   * behavior when no interaction handles are in flight, and the posture
   * every pre-existing test was written against. When true, callbacks are
   * queued until flushInteractions() — the warm-up tests use it to pin the
   * "nothing fires while an animation is running" invariant.
   */
  holdInteractions: false,
  interactionQueue: [] as Array<() => void>,
};

export function resetRnState(): void {
  rnState.os = 'ios';
  rnState.appStateListeners = [];
  rnState.linkingListeners = {};
  rnState.appStateCurrent = 'active';
  rnState.openedUrls = [];
  rnState.openUrlThrows = false;
  rnState.hasClipboard = true;
  rnState.clipboardThrows = false;
  rnState.clipboardText = null;
  rnState.shareThrows = false;
  rnState.shareText = null;
  rnState.holdInteractions = false;
  rnState.interactionQueue = [];
}

/**
 * Releases every queued runAfterInteractions callback in registration
 * order — the "animations finished, app went idle" transition the warm-up
 * scheduler waits for. Only meaningful while holdInteractions is true.
 */
export function flushInteractions(): void {
  const queued = [...rnState.interactionQueue];
  rnState.interactionQueue = [];
  for (const cb of queued) cb();
}

/** Fires every registered AppState handler (simulates a foreground/background transition). */
export function emitAppState(state: string): void {
  for (const handler of [...rnState.appStateListeners]) handler(state);
}

/** Delivers a Linking 'url' event (simulates an OS deep-link redirect). */
export function emitLinkingUrl(url: string): void {
  for (const handler of [...(rnState.linkingListeners['url'] ?? [])]) handler({ url });
}

const registry = {
  Vibration: { vibrate: () => {} },
  Linking: {
    openURL: async (url: string) => {
      rnState.openedUrls.push(url);
      if (rnState.openUrlThrows) throw new Error('unable to open URL');
      return undefined;
    },
    addEventListener: (type: string, handler: LinkingHandler) => {
      rnState.linkingListeners[type] = [...(rnState.linkingListeners[type] ?? []), handler];
      return { remove: () => {} };
    },
  },
  AppState: {
    get currentState(): string | null | undefined {
      return rnState.appStateCurrent;
    },
    addEventListener: (_type: string, handler: AppStateHandler) => {
      rnState.appStateListeners.push(handler);
      return {
        remove: () => {
          const idx = rnState.appStateListeners.indexOf(handler);
          if (idx >= 0) rnState.appStateListeners.splice(idx, 1);
        },
      };
    },
  },
  // InteractionManager — the warm-up scheduler's gate (ui/warm-up.ts).
  // Default posture: no interactions in flight → callbacks run inline, RN's
  // own behavior. holdInteractions=true queues them for flushInteractions().
  // Returns an object shaped like RN's cancellable handle; the scheduler
  // doesn't rely on it (the cancelled flag is the source of truth), it's
  // here for API fidelity.
  InteractionManager: {
    runAfterInteractions: (callback: () => void) => {
      if (rnState.holdInteractions) {
        rnState.interactionQueue.push(callback);
        return { cancel: () => {
          const idx = rnState.interactionQueue.indexOf(callback);
          if (idx >= 0) rnState.interactionQueue.splice(idx, 1);
        } };
      }
      callback();
      return { cancel: () => {} };
    },
  },
  NativeModules: {
    SettingsManager: { settings: { AppleLocale: 'fr_FR' } },
    I18nManager: { localeIdentifier: 'zh_CN' },
  },
  StyleSheet: {
    create: (sheets: Record<string, unknown>) => sheets,
    hairlineWidth: 0.5,
  },
  Platform: {
    get OS() {
      return rnState.os;
    },
    select: (opts: Record<string, unknown>) => opts[rnState.os] ?? opts.default ?? (rnState.os === 'ios' ? opts.android : opts.ios),
  },
  Animated: {
    Value: class {},
    loop: () => ({ start: () => {}, stop: () => {} }),
    timing: () => ({}),
    parallel: () => ({ start: () => {}, stop: () => {} }),
    sequence: () => ({}),
  },
  Easing: {
    linear: (x: number) => x,
    inOut: (x: number) => x,
    quad: (x: number) => x,
    bezier: () => (x: number) => x,
  },
  AccessibilityInfo: {
    isReduceMotionEnabled: async () => false,
    addEventListener: () => ({ remove: () => {} }),
  },
  Text: class {},
  View: class {},
  Pressable: class {},
  // Modal + ActivityIndicator — linked by the browser screens (Albedo/
  // xBull/WebBrowserScreen render full-screen Modals with a loading
  // overlay). Class stubs suffice: the element trees are never rendered
  // under bun, only constructed.
  Modal: class {},
  ActivityIndicator: class {},
  // The deprecated-but-universal core clipboard — optional at runtime; the
  // setString getter reads rnState per access so tests can simulate a
  // runtime where the export is gone.
  Clipboard: {
    get setString() {
      if (!rnState.hasClipboard) return undefined;
      return (text: string) => {
        if (rnState.clipboardThrows) throw new Error('clipboard unavailable');
        rnState.clipboardText = text;
      };
    },
  },
  Share: {
    share: async (opts: { message: string }) => {
      if (rnState.shareThrows) throw new Error('dismissed');
      rnState.shareText = opts.message;
      return { action: 'dismissedAction' as const };
    },
  },
};

/** Registers the shared react-native mock — call once at the top of each test file. */
export function installReactNativeMock(): void {
  mock.module('react-native', () => registry);
}
