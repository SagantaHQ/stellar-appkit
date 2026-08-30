/**
 * resolveViewOnOpen — the modal's open-transition view resolver (web open()
 * parity). The regression this pins:
 *
 * An app (like the demo) auto-opens the modal when a sign request enters the
 * queue. The old open-reset unconditionally set the view to account/list,
 * which ORPHANED the pending transaction preview — the preview promise never
 * settled, the sign queue hung at 1 forever, and the user was left staring
 * at the account view with a "{count, plural, …}" banner spinner. The web
 * modal's open() guards against exactly this:
 *
 *   if (!this.pendingPreview && !this.pendingAccountPicker) {
 *     this.view = this._client.session ? 'connected' : 'wallet-list';
 *   }
 *
 * (ui-web connect-modal.ts) — in-flight flows own the view.
 */

import { describe, expect, test } from 'bun:test';
import { resolveViewOnOpen } from '../src/ui/types.js';

const quiet = { pendingPreview: false, pendingSignCount: 0, siwsPhase: null, siwsBusy: false };

describe('resolveViewOnOpen — quiet modal (web open() parity)', () => {
  test('connected → account view', () => {
    expect(resolveViewOnOpen({ ...quiet, hasSession: true })).toBe('account');
  });

  test('no session → wallet list', () => {
    expect(resolveViewOnOpen({ ...quiet, hasSession: false })).toBe('list');
  });
});

describe('resolveViewOnOpen — a pending preview owns the view (the bug fix)', () => {
  test('preview wins over everything, including a session', () => {
    expect(
      resolveViewOnOpen({ ...quiet, pendingPreview: true, hasSession: true })
    ).toBe('preview');
  });

  test('preview wins over an in-flight sign queue and a running SIWS flow', () => {
    expect(
      resolveViewOnOpen({
        pendingPreview: true,
        pendingSignCount: 2,
        siwsPhase: 'siws-nonce',
        siwsBusy: true,
        hasSession: true,
      })
    ).toBe('preview');
  });
});

describe('resolveViewOnOpen — sign queue in flight without a preview', () => {
  test('queue > 0 → signing view (skipPreview / already-approved sign)', () => {
    expect(
      resolveViewOnOpen({ ...quiet, pendingSignCount: 1, hasSession: true })
    ).toBe('signing');
    expect(
      resolveViewOnOpen({ ...quiet, pendingSignCount: 3, hasSession: true })
    ).toBe('signing');
  });

  test('queue > 0 while SIWS runs → the SIWS phase wins (its signIn IS the queued sign)', () => {
    expect(
      resolveViewOnOpen({
        ...quiet,
        pendingSignCount: 1,
        siwsPhase: 'siws-signing',
        siwsBusy: true,
        hasSession: true,
      })
    ).toBe('siws-signing');
  });

  test('queue === 0 never selects signing', () => {
    expect(resolveViewOnOpen({ ...quiet, hasSession: false })).toBe('list');
  });
});

describe('resolveViewOnOpen — SIWS mid-flow restore', () => {
  test.each(['siws-checking', 'siws-nonce', 'siws-signing', 'siws-verifying'] as const)(
    'active phase %s is restored when the modal opens mid-flow',
    (phase) => {
      expect(
        resolveViewOnOpen({
          ...quiet,
          siwsPhase: phase,
          siwsBusy: true,
          hasSession: true,
        })
      ).toBe(phase);
    }
  );

  test('siws-error does NOT own the view — the web resets away from read errors on reopen', () => {
    expect(
      resolveViewOnOpen({
        ...quiet,
        siwsPhase: 'siws-error',
        siwsBusy: false,
        hasSession: true,
      })
    ).toBe('account');
  });

  test('a non-siws phase string is ignored defensively', () => {
    expect(
      resolveViewOnOpen({
        ...quiet,
        siwsPhase: 'signing',
        siwsBusy: true,
        hasSession: true,
      })
    ).toBe('account');
  });
});
