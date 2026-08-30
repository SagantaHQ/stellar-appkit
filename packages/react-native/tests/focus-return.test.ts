/**
 * Tests for focus return — re-focusing the integrating app once the wallet
 * operation settles (connect success/failure, sign success/failure) while
 * the app sits backgrounded behind the wallet app. Covers the pure gating
 * policy (resolveAppFocusTarget / shouldAttemptAppFocus) and the
 * attachAppFocusReturn wiring installed by <AppKitModal>
 * (useAppFocusReturn) and exported for headless apps.
 *
 * react-native can't run under bun (Flow syntax), so this suite installs
 * the shared react-native mock registry first (tests/helpers/rn-mock.ts).
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { installReactNativeMock, resetRnState, rnState } from './helpers/rn-mock.js';

installReactNativeMock();

const {
  attachAppFocusReturn,
  resolveAppFocusTarget,
  shouldAttemptAppFocus,
  FOCUS_ATTEMPT_COOLDOWN_MS,
} = await import('../src/focus-return.js');

import type { StellarAppKit, ConnectSession, ConnectError } from '@saganta/stellar-appkit';

/**
 * A minimal event-emitting client mock — attachAppFocusReturn only needs
 * on() for the four events it subscribes to, plus pendingSignCount and
 * appMetadata. Handlers are collected so tests can emit the exact event
 * sequence the real client produces.
 */
function makeClient(opts: { redirect?: { native?: string; universal?: string }; pendingSignCount?: number } = {}) {
  const handlers: Record<string, Array<(payload: unknown) => void>> = {};
  const state = { pendingSignCount: opts.pendingSignCount ?? 0 };
  const client = {
    get appMetadata() {
      return opts.redirect ? { name: 'App', redirect: opts.redirect } : { name: 'App' };
    },
    on: (event: string, handler: (payload: unknown) => void) => {
      (handlers[event] ??= []).push(handler);
      return () => {
        const list = handlers[event] ?? [];
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      };
    },
    status: 'idle' as string,
  };
  Object.defineProperty(client, 'pendingSignCount', {
    get: () => state.pendingSignCount,
    set: (v: number) => {
      state.pendingSignCount = v;
    },
  });
  const emit = (event: string, payload?: unknown) => {
    for (const handler of [...(handlers[event] ?? [])]) handler(payload);
  };
  return { client: client as unknown as StellarAppKit, emit, state };
}

beforeEach(() => {
  resetRnState();
});

describe('resolveAppFocusTarget — picking the self-open URL', () => {
  test('prefers native over universal', () => {
    expect(resolveAppFocusTarget({ native: 'myapp://', universal: 'https://myapp.com' })).toBe('myapp://');
  });

  test('falls back to universal when native is absent', () => {
    expect(resolveAppFocusTarget({ universal: 'https://myapp.com' })).toBe('https://myapp.com');
  });

  test('normalizes a bare scheme to scheme:// (either form accepted)', () => {
    expect(resolveAppFocusTarget({ native: 'myapp' })).toBe('myapp://');
    expect(resolveAppFocusTarget({ native: 'myapp://' })).toBe('myapp://');
  });

  test('leaves URLs that already carry a scheme separator untouched', () => {
    expect(resolveAppFocusTarget({ native: 'exp+myapp://' })).toBe('exp+myapp://');
    expect(resolveAppFocusTarget({ native: 'exp://192.168.1.4:8081' })).toBe('exp://192.168.1.4:8081');
  });

  test('trims whitespace and ignores empty strings', () => {
    expect(resolveAppFocusTarget({ native: '  myapp://  ' })).toBe('myapp://');
    expect(resolveAppFocusTarget({ native: '', universal: '' })).toBeNull();
  });

  test('null/undefined/empty redirect → null (nothing to open)', () => {
    expect(resolveAppFocusTarget(undefined)).toBeNull();
    expect(resolveAppFocusTarget(null)).toBeNull();
    expect(resolveAppFocusTarget({})).toBeNull();
  });
});

describe('shouldAttemptAppFocus — the foreground gate', () => {
  test('attempts when backgrounded with a target', () => {
    expect(shouldAttemptAppFocus({ appState: 'background', target: 'myapp://' })).toBe(true);
  });

  test('never attempts while the app is active — in-app outcomes must not yank focus', () => {
    expect(shouldAttemptAppFocus({ appState: 'active', target: 'myapp://' })).toBe(false);
  });

  test('no target → never attempts (redirect not configured)', () => {
    expect(shouldAttemptAppFocus({ appState: 'background', target: null })).toBe(false);
  });

  test('cold-start AppState states (null/undefined/unknown) attempt — the OS just refuses if it disagrees', () => {
    expect(shouldAttemptAppFocus({ appState: null, target: 'myapp://' })).toBe(true);
    expect(shouldAttemptAppFocus({ appState: undefined, target: 'myapp://' })).toBe(true);
    expect(shouldAttemptAppFocus({ appState: 'unknown', target: 'myapp://' })).toBe(true);
  });
});

describe('attachAppFocusReturn — completion wiring', () => {
  test('connect success while backgrounded → opens the app deep link', () => {
    const { client, emit } = makeClient({ redirect: { native: 'myapp://' } });
    rnState.appStateCurrent = 'background';
    attachAppFocusReturn(client);

    emit('connect', {} as ConnectSession);

    expect(rnState.openedUrls).toEqual(['myapp://']);
  });

  test('connect success while foregrounded → skipped (already in front)', () => {
    const { client, emit } = makeClient({ redirect: { native: 'myapp://' } });
    rnState.appStateCurrent = 'active';
    attachAppFocusReturn(client);

    emit('connect', {} as ConnectSession);

    expect(rnState.openedUrls).toEqual([]);
  });

  test('connect failure while backgrounded → still opens (failure counts as settled)', () => {
    // The real client's exact sequence: setStatus('connecting') →
    // setStatus('error') → emit('error').
    const { client, emit } = makeClient({ redirect: { native: 'myapp://' } });
    rnState.appStateCurrent = 'background';
    attachAppFocusReturn(client);

    emit('statusChange', 'connecting');
    emit('statusChange', 'error');
    emit('error', {} as ConnectError);

    expect(rnState.openedUrls).toEqual(['myapp://']);
  });

  test('sign success while backgrounded → queue decrement opens', () => {
    const { client, emit } = makeClient({ redirect: { native: 'myapp://' } });
    rnState.appStateCurrent = 'background';
    attachAppFocusReturn(client);

    emit('signQueueChange', 1);
    emit('signQueueChange', 0);

    expect(rnState.openedUrls).toEqual(['myapp://']);
  });

  test('sign failure while backgrounded → one open (error + decrement deduped by the cooldown)', () => {
    const { client, emit, state } = makeClient({ redirect: { native: 'myapp://' } });
    rnState.appStateCurrent = 'background';
    attachAppFocusReturn(client);

    state.pendingSignCount = 1;
    emit('signQueueChange', 1);
    // enqueueSign order: error event fires while the count still includes
    // the failing sign, then the finally-decrement emits the drop.
    emit('error', {} as ConnectError);
    state.pendingSignCount = 0;
    emit('signQueueChange', 0);

    expect(rnState.openedUrls).toEqual(['myapp://']);
  });

  test('a second, later sign still opens — the cooldown dedupes bursts, not flows', async () => {
    const { client, emit } = makeClient({ redirect: { native: 'myapp://' } });
    rnState.appStateCurrent = 'background';
    attachAppFocusReturn(client);

    emit('signQueueChange', 1);
    emit('signQueueChange', 0);

    // Cross the cooldown window (1000ms) — a fresh operation must open again.
    const realNow = Date.now;
    const now = { value: realNow() + FOCUS_ATTEMPT_COOLDOWN_MS + 10 };
    globalThis.Date.now = () => now.value;
    try {
      emit('signQueueChange', 1);
      emit('signQueueChange', 0);
    } finally {
      globalThis.Date.now = realNow;
    }

    expect(rnState.openedUrls).toEqual(['myapp://', 'myapp://']);
  });

  test('unrelated error with nothing in flight → no open (not an operation settling)', () => {
    const { client, emit } = makeClient({ redirect: { native: 'myapp://' } });
    rnState.appStateCurrent = 'background';
    attachAppFocusReturn(client);

    emit('error', {} as ConnectError);

    expect(rnState.openedUrls).toEqual([]);
  });

  test('sign queue INCREASING alone never opens (request enqueued, not settled)', () => {
    const { client, emit } = makeClient({ redirect: { native: 'myapp://' } });
    rnState.appStateCurrent = 'background';
    attachAppFocusReturn(client);

    emit('signQueueChange', 1);
    emit('signQueueChange', 2);

    expect(rnState.openedUrls).toEqual([]);
  });

  test('no redirect configured → settles open nothing (wallet-side bounce remains via session metadata)', () => {
    const { client, emit } = makeClient({});
    rnState.appStateCurrent = 'background';
    attachAppFocusReturn(client);

    emit('connect', {} as ConnectSession);
    emit('signQueueChange', 1);
    emit('signQueueChange', 0);

    expect(rnState.openedUrls).toEqual([]);
  });

  test('an OS refusing the open (iOS background self-open) is swallowed silently', async () => {
    const { client, emit } = makeClient({ redirect: { native: 'myapp://' } });
    rnState.appStateCurrent = 'background';
    rnState.openUrlThrows = true;
    attachAppFocusReturn(client);

    expect(() => emit('connect', {} as ConnectSession)).not.toThrow();
    // The rejection is async — let it land before the process checks handlers.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rnState.openedUrls).toEqual(['myapp://']);
  });

  test('detaches cleanly — no opens after the returned function runs', () => {
    const { client, emit } = makeClient({ redirect: { native: 'myapp://' } });
    rnState.appStateCurrent = 'background';
    const detach = attachAppFocusReturn(client);

    emit('connect', {} as ConnectSession);
    detach();
    emit('signQueueChange', 1);
    emit('signQueueChange', 0);

    expect(rnState.openedUrls).toEqual(['myapp://']);
  });

  test('attaching mid-flow reads the live pending count (first event is not misread as a settle)', () => {
    const { client, emit, state } = makeClient({ redirect: { native: 'myapp://' }, pendingSignCount: 2 });
    rnState.appStateCurrent = 'background';
    attachAppFocusReturn(client);

    // A third request enqueues while attached: 2 → 3 is not a settle.
    state.pendingSignCount = 3;
    emit('signQueueChange', 3);
    expect(rnState.openedUrls).toEqual([]);

    // One resolves: 3 → 2 is a settle.
    state.pendingSignCount = 2;
    emit('signQueueChange', 2);
    expect(rnState.openedUrls).toEqual(['myapp://']);
  });
});
