/**
 * Source-level wiring checks for the signing-error "Try again" flow — the
 * other half (the core machinery) lives in core's sign-retry.test.ts.
 *
 * WHAT THIS PINS: the modal's retry button used to re-show the approved
 * preview with a NO-OP resolve — approving it again switched the view to
 * 'signing' and left the user on a dead "Continue in your wallet" spinner
 * forever, because the wallet was never actually re-asked (reported as
 * "I click Try again and the modal closes / nothing happens", and with a
 * stale Freighter connection the user then saw the wallet's "Connection
 * not found" error with no way forward). The wiring that must stay:
 *
 * - the retry-signing handler's preview resolve drives the wallet again
 *   via client.retryLastSign() — a REAL re-drive, never a no-op
 * - a false return (nothing left to retry) falls back to the previous
 *   view instead of parking on a dead signing spinner
 * - the successful-retry event from the core is re-dispatched as a DOM
 *   sc-sign-retried event so apps can fold the retried result into state
 * - the react hooks listen for their own kind of retry — without that,
 *   a retried sign would succeed in the wallet while the hook kept
 *   showing the stale error
 */

import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const MODAL_SRC = fs.readFileSync(
  path.resolve(import.meta.dir, '../src/ui-web/connect-modal.ts'),
  'utf-8'
);
const REACT_SRC = fs.readFileSync(
  path.resolve(import.meta.dir, '../src/react/index.tsx'),
  'utf-8'
);
const VUE_SRC = fs.readFileSync(
  path.resolve(import.meta.dir, '../src/vue/index.ts'),
  'utf-8'
);
const SOLID_SRC = fs.readFileSync(
  path.resolve(import.meta.dir, '../src/solid/index.tsx'),
  'utf-8'
);
const SVELTE_SRC = fs.readFileSync(
  path.resolve(import.meta.dir, '../src/svelte/index.ts'),
  'utf-8'
);

describe('connect-modal — signing-error "Try again" wiring', () => {
  test('the retry preview resolve drives the wallet via client.retryLastSign()', () => {
    // The retry-signing handler must wire the re-shown preview's resolve to
    // retryLastSign() — the bug was a no-op resolve leaving the signing
    // spinner alive with nothing driving it.
    const handlerMatch = MODAL_SRC.match(
      /\[data-action="retry-signing"\][^}]*?addEventListener\('click', \(\) => \{([\s\S]*?)\n    \}\);/
    );
    expect(handlerMatch).not.toBeNull();
    const handler = handlerMatch![1];
    expect(handler).toContain('retryLastSign()');
    expect(handler).not.toMatch(/\/\* no-op/);
  });

  test('a no-op resolve never appears in the retry path', () => {
    // The literal regression marker: the old code had
    // `resolve: () => { /* no-op — the actual retry happens via the sign queue */ }`
    expect(MODAL_SRC).not.toContain('no-op — the actual retry');
  });

  test('a false retryLastSign() falls back to the previous view, not a dead spinner', () => {
    const handlerMatch = MODAL_SRC.match(
      /\[data-action="retry-signing"\][^}]*?addEventListener\('click', \(\) => \{([\s\S]*?)\n    \}\);/
    );
    expect(handlerMatch).not.toBeNull();
    const handler = handlerMatch![1];
    // The guard: when there's nothing to retry, land somewhere useful.
    expect(handler).toMatch(/retryLastSign\(\)\)/);
    expect(handler).toMatch(/view = this\._client\?\.session \? 'connected' : 'wallet-list'/);
  });

  test("the modal re-dispatches the core's signRetried event as a DOM sc-sign-retried event", () => {
    expect(MODAL_SRC).toContain("client.on('signRetried'");
    expect(MODAL_SRC).toContain("'sc-sign-retried'");
  });
});

describe('react hooks — retried-sign state folding', () => {
  test('the hooks subscribe to signRetried so a retried sign updates their state', () => {
    // Without this, the wallet could sign successfully on retry while the
    // hook (and the page rendering from it) kept showing the stale error —
    // the exact "signing fails, Try again, and the app still says it
    // failed" confusion.
    expect(REACT_SRC).toContain("client.on('signRetried'");
    expect(REACT_SRC).toMatch(/if \(e\.kind !== kind\) return/);
  });

  test('each sign hook filters its own retry kind', () => {
    expect(REACT_SRC).toContain("'transaction', setData, setError");
    expect(REACT_SRC).toContain("'message', setData, setError");
    expect(REACT_SRC).toContain("'signIn', setData, setError");
  });
});

describe('vue/solid/svelte sign hooks — retried-sign state folding', () => {
  // Same rationale as the react hooks above: without the listener, the
  // wallet could sign successfully on retry while the composable (and the
  // page rendering from it) kept showing the stale error.

  test('vue composables subscribe to signRetried and fold it into their refs', () => {
    expect(VUE_SRC).toContain("client.on('signRetried'");
    expect(VUE_SRC).toMatch(/if \(e\.kind !== kind\) return/);
    expect(VUE_SRC).toContain("'transaction', data, error");
    expect(VUE_SRC).toContain("'message', data, error");
    expect(VUE_SRC).toContain("'signIn', data, error");
  });

  test('solid hooks subscribe to signRetried and fold it into their signals', () => {
    expect(SOLID_SRC).toContain("client.on('signRetried'");
    expect(SOLID_SRC).toMatch(/if \(e\.kind !== kind\) return/);
    expect(SOLID_SRC).toContain("'transaction', setData, setError");
    expect(SOLID_SRC).toContain("'message', setData, setError");
    expect(SOLID_SRC).toContain("'signIn', setData, setError");
  });

  test('svelte stores subscribe to signRetried and fold it into their stores', () => {
    expect(SVELTE_SRC).toContain("client.on('signRetried'");
    expect(SVELTE_SRC).toMatch(/if \(e\.kind !== kind\) return/);
    expect(SVELTE_SRC).toContain("'transaction', data, error");
    expect(SVELTE_SRC).toContain("'message', data, error");
    expect(SVELTE_SRC).toContain("'signIn', data, error");
  });
});
