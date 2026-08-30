/**
 * shouldAutoClose — the pure half of the auto-minimize behavior
 * (ui/auto-close.ts; the wiring lives in AppKitModal.tsx).
 *
 * WHAT THIS PINS: when an operation the app requested through the modal
 * completes (a connect settles after the deep-link handoff, or the sign
 * queue drains cleanly), the sheet minimizes itself and focus returns to
 * the calling app — but ONLY then. The regressions these tests guard:
 *
 * - a modal (re)opened later for account management must NEVER self-close
 *   off a stale completion flag (the armed-flag lifecycle)
 * - inline panels never auto-close (no sheet to close)
 * - errors / rejections / in-flight views never auto-close (web parity —
 *   the user reads the outcome and acts on it)
 * - the confirmation flash is long enough to register, short enough to
 *   feel like focus simply returned to the app
 */

import { describe, expect, test } from 'bun:test';
import { AUTO_CLOSE_DELAY_MS, shouldAutoClose } from '../src/ui/auto-close.js';

const ready = {
  enabled: true,
  mode: 'bottomsheet' as const,
  armed: true,
  view: 'account',
  hasSession: true,
  sheetOpen: true,
};

describe('AUTO_CLOSE_DELAY_MS — the confirmation flash', () => {
  test('long enough to register, short enough to feel instant', () => {
    expect(AUTO_CLOSE_DELAY_MS).toBeGreaterThanOrEqual(500);
    expect(AUTO_CLOSE_DELAY_MS).toBeLessThanOrEqual(1500);
  });
});

describe('shouldAutoClose — the completion case (minimize + focus the app)', () => {
  test('armed connect/sign completion on the account view closes', () => {
    expect(shouldAutoClose(ready)).toBe(true);
  });

  test('the sheet must be open — completions while closed leave nothing to do', () => {
    expect(shouldAutoClose({ ...ready, sheetOpen: false })).toBe(false);
  });
});

describe('shouldAutoClose — what must NEVER auto-close', () => {
  test('disabled via autoCloseOnComplete={false} (web stay-on-account parity)', () => {
    expect(shouldAutoClose({ ...ready, enabled: false })).toBe(false);
  });

  test('inline panels (no sheet to close)', () => {
    expect(shouldAutoClose({ ...ready, mode: 'inline' })).toBe(false);
  });

  test('not armed — a modal (re)opened for account management never self-closes', () => {
    // THE regression: without the armed-flag lifecycle, a stale completion
    // from a previous sheet session would dismiss the sheet ~1s after the
    // user opened it to check their balance.
    expect(shouldAutoClose({ ...ready, armed: false })).toBe(false);
  });

  test('every in-flight view (the operation is still running)', () => {
    for (const view of ['list', 'connecting', 'preview', 'signing', 'error', 'network-mismatch']) {
      expect(shouldAutoClose({ ...ready, view })).toBe(false);
    }
  });

  test('every SIWS phase (the connect+sign-in flow is still finishing)', () => {
    for (const view of ['siws-checking', 'siws-nonce', 'siws-signing', 'siws-verifying', 'siws-error']) {
      expect(shouldAutoClose({ ...ready, view })).toBe(false);
    }
  });

  test('no live session — nothing to confirm on the account view', () => {
    // Defensive: a wallet disconnected in the same breath the sign drained
    // (disconnectOnFail, relay drop) — the account view can't even render.
    expect(shouldAutoClose({ ...ready, hasSession: false })).toBe(false);
  });
});
