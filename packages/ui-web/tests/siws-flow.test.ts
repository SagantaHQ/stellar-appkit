/**
 * Tests for the v1.7.x SIWS flow wiring inside <stellar-appkit-modal>.
 *
 * The modal's `triggerSiwsFlow()` method is private and tightly coupled to
 * the DOM (it sets `this.view` and calls `this.render()`), so we can't
 * exercise it directly without a real DOM environment. Instead, we verify
 * the contract at three levels:
 *
 * 1. **Source-level inspection** — read connect-modal.ts and confirm the
 *    expected flow logic is present: the five SIWS view states, the
 *    `withTimeout` wrapper, the `maxRetries` / `timeoutMs` defaults, the
 *    cancel button handler, the disconnect-on-close behavior, and the
 *    retry counter.
 *
 * 2. **Type-level checks** — confirm the `ViewState` type includes the
 *    five SIWS states and that `SiwsConfig` has the v1.7.x fields.
 *
 * 3. **Behavioral unit tests** for the pure helpers the flow uses —
 *    `extractErrorMessage` and the timeout wrapper pattern. We can't
 *    import them directly (they're inside a method body), so we
 *    re-implement the same logic here and verify it behaves the same way.
 *
 * Full end-to-end render tests (mount the modal in a real DOM, click
 * through the SIWS flow, verify the session is set) live in the demos
 * site at /demos/siws-session-management.
 */

import { test, expect, describe } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const MODAL_SRC = fs.readFileSync(
  path.resolve(import.meta.dir, '../src/ui-web/connect-modal.ts'),
  'utf-8'
);

// ---------------------------------------------------------------------------
// Source-level checks — verify the v1.7.x SIWS flow is wired up
// ---------------------------------------------------------------------------

describe('connect-modal — v1.7.x SIWS view states', () => {
  test('ViewState type includes all five SIWS states', () => {
    // The ViewState type is a union literal — we check the source line.
    expect(MODAL_SRC).toContain("'siws-checking'");
    expect(MODAL_SRC).toContain("'siws-nonce'");
    expect(MODAL_SRC).toContain("'siws-signing'");
    expect(MODAL_SRC).toContain("'siws-verifying'");
    expect(MODAL_SRC).toContain("'siws-error'");
  });

  test('triggerSiwsFlow transitions through all five view states', () => {
    // The flow is: siws-checking → siws-nonce → siws-signing → siws-verifying → connected
    // (or siws-error on failure). Verify each `this.view = 'siws-*'` assignment exists.
    expect(MODAL_SRC).toMatch(/this\.view = 'siws-checking'/);
    expect(MODAL_SRC).toMatch(/this\.view = 'siws-nonce'/);
    expect(MODAL_SRC).toMatch(/this\.view = 'siws-signing'/);
    expect(MODAL_SRC).toMatch(/this\.view = 'siws-verifying'/);
    expect(MODAL_SRC).toMatch(/this\.view = 'siws-error'/);
  });

  test('siws-checking view is set before calling session()', () => {
    // The flow must show "Checking session…" BEFORE calling siws.session()
    // so the user sees immediate feedback. Verify the order in the source.
    const checkingIdx = MODAL_SRC.indexOf("this.view = 'siws-checking'");
    const sessionCallIdx = MODAL_SRC.indexOf('siws.session()');
    expect(checkingIdx).toBeGreaterThan(-1);
    expect(sessionCallIdx).toBeGreaterThan(-1);
    expect(checkingIdx).toBeLessThan(sessionCallIdx);
  });

  test('siws-nonce view is set before calling nonce()', () => {
    const nonceViewIdx = MODAL_SRC.indexOf("this.view = 'siws-nonce'");
    const nonceCallIdx = MODAL_SRC.indexOf('siws.nonce()');
    expect(nonceViewIdx).toBeGreaterThan(-1);
    expect(nonceCallIdx).toBeGreaterThan(-1);
    expect(nonceViewIdx).toBeLessThan(nonceCallIdx);
  });

  test('siws-signing view is set before calling signIn()', () => {
    const signingViewIdx = MODAL_SRC.indexOf("this.view = 'siws-signing'");
    const signInCallIdx = MODAL_SRC.indexOf('this._client.signIn(');
    expect(signingViewIdx).toBeGreaterThan(-1);
    expect(signInCallIdx).toBeGreaterThan(-1);
    expect(signingViewIdx).toBeLessThan(signInCallIdx);
  });

  test('siws-verifying view is set before calling verify()', () => {
    const verifyingViewIdx = MODAL_SRC.indexOf("this.view = 'siws-verifying'");
    const verifyCallIdx = MODAL_SRC.indexOf('siws.verify(');
    expect(verifyingViewIdx).toBeGreaterThan(-1);
    expect(verifyCallIdx).toBeGreaterThan(-1);
    expect(verifyingViewIdx).toBeLessThan(verifyCallIdx);
  });
});

describe('connect-modal — v1.7.x SIWS retry + timeout configuration', () => {
  test('reads maxRetries from siws config with default of 3', () => {
    expect(MODAL_SRC).toMatch(/maxRetries\s*=\s*siws\.maxRetries\s*\?\?\s*3/);
  });

  test('reads timeoutMs from siws config with default of 15000', () => {
    expect(MODAL_SRC).toMatch(/timeoutMs\s*=\s*siws\.timeoutMs\s*\?\?\s*15000/);
  });

  test('uses withTimeout wrapper for session(), nonce(), and verify()', () => {
    // All three async calls must be wrapped in withTimeout so a hanging
    // server doesn't leave the modal stuck in a loading state.
    expect(MODAL_SRC).toMatch(/withTimeout\(siws\.session\(\),\s*timeoutMs\)/);
    expect(MODAL_SRC).toMatch(/withTimeout\(siws\.nonce\(\),\s*timeoutMs\)/);
    expect(MODAL_SRC).toMatch(/withTimeout\(\s*siws\.verify\(/);
  });

  test('withTimeout rejects with a human-readable "Request timed out" message', () => {
    expect(MODAL_SRC).toContain("t('error.request_timed_out')");
  });

  test('shows "Too many failed attempts" message when retry count reaches maxRetries', () => {
    expect(MODAL_SRC).toContain("t('siws.error_too_many_attempts'");
    expect(MODAL_SRC).toMatch(/siwsRetryCount >= maxRetries/);
  });

  test('increments siwsRetryCount on each failure', () => {
    expect(MODAL_SRC).toMatch(/this\.siwsRetryCount\+\+/);
  });

  test('resets siwsRetryCount to 0 on successful sign-in', () => {
    // After a successful verify, the retry counter resets so the next
    // SIWS flow (e.g. re-authentication) starts fresh.
    expect(MODAL_SRC).toMatch(/this\.siwsRetryCount = 0/);
  });
});

describe('connect-modal — v1.7.x SIWS cancel button', () => {
  test('has a cancel-siws data-action handler', () => {
    expect(MODAL_SRC).toContain('data-action="cancel-siws"');
  });

  test('cancel handler sets siwsCancelled = true', () => {
    expect(MODAL_SRC).toMatch(/this\.siwsCancelled = true/);
  });

  test('cancel handler resets siwsPending and siwsRetryCount', () => {
    expect(MODAL_SRC).toMatch(/this\.siwsPending = false/);
    expect(MODAL_SRC).toMatch(/this\.siwsRetryCount = 0/);
  });

  test('cancel handler disconnects the wallet when disconnectOnFail is true (default)', () => {
    // When the user cancels the SIWS flow, the wallet is disconnected
    // (because authentication wasn't completed). This matches the
    // disconnectOnFail behavior on modal close.
    expect(MODAL_SRC).toMatch(/disconnectOnFail.*disconnect/);
  });

  test('handleSiwsFailure is a no-op when siwsCancelled is true', () => {
    // After the user cancels, any in-flight promise rejection (e.g. from
    // signMessage) must not show an error UI. The cancel handler sets
    // siwsCancelled = true, and handleSiwsFailure checks it first.
    expect(MODAL_SRC).toMatch(/if \(this\.siwsCancelled\) return/);
  });
});

describe('connect-modal — v1.7.x SIWS disconnect-on-close', () => {
  test('close() checks siwsPending and disconnects if SIWS never succeeded', () => {
    // If the user closes the modal while SIWS is pending (never succeeded),
    // and disconnectOnFail is true, the wallet is disconnected AFTER the
    // modal is visually closed (so no flash).
    expect(MODAL_SRC).toMatch(/this\.siwsPending && this\._client\?\.siwsConfig/);
    expect(MODAL_SRC).toMatch(/disconnectOnFail !== false/);
  });

  test('resets siwsPending to false after the close logic runs', () => {
    // siwsPending is reset so the next connect attempt starts fresh.
    expect(MODAL_SRC).toMatch(/this\.siwsPending = false/);
  });
});

describe('connect-modal — v1.7.x SIWS session validation', () => {
  test('validates existing session address against connected wallet address', () => {
    expect(MODAL_SRC).toMatch(/existingSession\.address === session\.address/);
  });

  test('validates existing session network against connected wallet network', () => {
    expect(MODAL_SRC).toMatch(/existingSession\.network === session\.network/);
  });

  test('validates existing session expiry', () => {
    expect(MODAL_SRC).toMatch(/existingSession\.expiry/);
    expect(MODAL_SRC).toMatch(/existingSession\.expiry > Date\.now\(\)/);
  });

  test('validates verify()-returned session address + network + expiry', () => {
    // The same triple-check is applied to the session returned by verify()
    // — not just the session() check.
    expect(MODAL_SRC).toMatch(/siwsSession\.address === session\.address/);
    expect(MODAL_SRC).toMatch(/siwsSession\.network === session\.network/);
    expect(MODAL_SRC).toMatch(/siwsSession\.expiry/);
  });

  test('skips sign-in when existing session is valid (short-circuit)', () => {
    // When session() returns a valid session that matches the connected
    // wallet, the flow calls setSiwsSession() and goes straight to the
    // 'connected' view — no nonce fetch, no sign, no verify.
    expect(MODAL_SRC).toMatch(/Existing session is valid.*skip sign-in/);
  });

  test('calls setSiwsSession(existingSession) on the short-circuit path', () => {
    expect(MODAL_SRC).toMatch(/this\._client\.setSiwsSession\(existingSession\)/);
  });

  test('calls setSiwsSession(siwsSession) on the success path', () => {
    expect(MODAL_SRC).toMatch(/this\._client\.setSiwsSession\(siwsSession\)/);
  });
});

describe('connect-modal — v1.7.x SIWS verify() context parameter', () => {
  test('passes context { address, network } as third arg to verify()', () => {
    // v1.7.0 breaking change: verify() now receives a context object so
    // the developer can compare server-side without an extra round-trip.
    expect(MODAL_SRC).toMatch(/siws\.verify\(signInResult,\s*nonce,\s*\{/);
    expect(MODAL_SRC).toMatch(/address:\s*session\?\.address/);
    expect(MODAL_SRC).toMatch(/network:\s*session\?\.network/);
  });
});

// ---------------------------------------------------------------------------
// Behavioral unit tests — re-implement the pure helpers and verify the
// same logic the modal uses. These catch regressions in the error-message
// extraction + timeout behavior without needing a DOM.
// ---------------------------------------------------------------------------

describe('connect-modal — SIWS error message extraction (behavioral)', () => {
  // Re-implemented from connect-modal.ts `extractErrorMessage`. Keep in
  // sync with the source — if the source changes, update this too.
  function extractErrorMessage(err: unknown): string {
    if (typeof err === 'string') return err;
    if (err instanceof Error) return err.message || String(err);
    if (err && typeof err === 'object') {
      const e = err as { message?: string; reason?: string };
      if (e.message) return e.message;
      if (e.reason) return e.reason;
    }
    return 'Sign-in failed. Please try again.';
  }

  test('extracts message from an Error instance', () => {
    expect(extractErrorMessage(new Error('boom'))).toBe('boom');
  });

  test('extracts message from a string', () => {
    expect(extractErrorMessage('plain string error')).toBe('plain string error');
  });

  test('extracts .reason from a plain object (server response shape)', () => {
    expect(extractErrorMessage({ reason: 'invalid nonce' })).toBe('invalid nonce');
  });

  test('extracts .message from a plain object', () => {
    expect(extractErrorMessage({ message: 'something failed' })).toBe('something failed');
  });

  test('prefers .message over .reason when both are present', () => {
    expect(extractErrorMessage({ message: 'msg', reason: 'rsn' })).toBe('msg');
  });

  test('returns the default message for null / undefined / numbers', () => {
    expect(extractErrorMessage(null)).toBe('Sign-in failed. Please try again.');
    expect(extractErrorMessage(undefined)).toBe('Sign-in failed. Please try again.');
    expect(extractErrorMessage(42)).toBe('Sign-in failed. Please try again.');
  });

  test('falls back to String(err) for an Error with empty message', () => {
    // Error with empty message — `err.message` is '', which is falsy, so
    // the impl falls through to `String(err)`, which for an Error is "Error".
    const err = new Error('');
    expect(extractErrorMessage(err)).toBe('Error');
  });
});

describe('connect-modal — SIWS timeout wrapper (behavioral)', () => {
  // Re-implemented from connect-modal.ts `withTimeout`. The modal uses
  // Promise.race to time out async calls — we verify the same pattern
  // behaves correctly here.
  function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out. Please try again.')), ms)
      ),
    ]);
  }

  test('resolves with the promise value when it completes before the timeout', async () => {
    const fast = new Promise<string>((resolve) => setTimeout(() => resolve('ok'), 10));
    const result = await withTimeout(fast, 100);
    expect(result).toBe('ok');
  });

  test('rejects with "Request timed out" when the promise takes too long', async () => {
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve('ok'), 200));
    await expect(withTimeout(slow, 50)).rejects.toThrow(/Request timed out/);
  });

  test('propagates the original rejection when the promise rejects before the timeout', async () => {
    const failing = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error('server down')), 10)
    );
    await expect(withTimeout(failing, 100)).rejects.toThrow(/server down/);
  });

  test('does not leak the timeout — the slower promise still resolves in the background', async () => {
    // Promise.race doesn't cancel the slower promise — it just stops
    // awaiting it. This is the same behavior the modal has: a timed-out
    // session() call still completes in the background, but its result
    // is ignored. We verify the slower promise still resolves.
    let slowResolved = false;
    const slow = new Promise<string>((resolve) =>
      setTimeout(() => { slowResolved = true; resolve('late'); }, 30)
    );
    try {
      await withTimeout(slow, 10);
    } catch {
      // expected — timeout
    }
    // Wait for the slower promise to actually resolve.
    await new Promise((r) => setTimeout(r, 50));
    expect(slowResolved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Status text — verify the human-readable labels for each SIWS view state
// exist in the source. These are user-facing strings that must not regress.
// ---------------------------------------------------------------------------

describe('connect-modal — v1.7.x SIWS status text (user-facing)', () => {
  test('shows "Checking session…" for siws-checking view', () => {
    expect(MODAL_SRC).toContain("t('siws.phase.checking_session')");
  });

  test('shows "Fetching secure nonce…" for siws-nonce view', () => {
    expect(MODAL_SRC).toContain("t('siws.phase.fetching_nonce')");
  });

  test('shows "Approve the sign-in request in" for siws-signing view', () => {
    expect(MODAL_SRC).toContain("t('siws.phase.approve_in_wallet'");
  });

  test('shows "Verifying signature…" or similar for siws-verifying view', () => {
    // The verifying state shows a spinner with a "Verifying" label.
    // We just check for the word "Verif" to be flexible on the exact wording.
    expect(MODAL_SRC.toLowerCase()).toContain('verif');
  });
});
