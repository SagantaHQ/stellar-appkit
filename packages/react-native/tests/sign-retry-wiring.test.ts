/**
 * Source-level wiring checks for the RN sheet's signing-error "Try again"
 * (the core machinery is pinned in core's sign-retry.test.ts; the web
 * modal's identical wiring is pinned in ui-web's sign-retry-wiring.test.ts).
 *
 * WHAT THIS PINS: the signing-error retry used to re-show the approved
 * preview with a NO-OP resolve — approving it again put the sheet on a
 * dead "Continue in your wallet" spinner because the wallet was never
 * actually re-asked. The wiring that must stay:
 *
 * - approving the re-shown preview calls client.retryLastSign() — a real
 *   re-drive through the sign queue, never a no-op resolve
 * - a false return (nothing left to retry) lands on the account view
 *   instead of parking the sheet on a dead signing spinner
 */

import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const MODAL_SRC = fs.readFileSync(
  path.resolve(import.meta.dir, '../src/ui/AppKitModal.tsx'),
  'utf-8'
);

describe('AppKitModal — signing-error "Try again" wiring', () => {
  test('the retry path drives the wallet via client.retryLastSign()', () => {
    const retryMatch = MODAL_SRC.match(/onRetry=\{\(\) => \{([\s\S]*?)\}\}/);
    expect(retryMatch).not.toBeNull();
    const retry = retryMatch![1];
    expect(retry).toContain('client.retryLastSign()');
    // The literal regression marker: the old no-op resolve.
    expect(retry).not.toContain('resolve: () => undefined');
  });

  test('a false retryLastSign() lands on the account view, not a dead spinner', () => {
    const retryMatch = MODAL_SRC.match(/onRetry=\{\(\) => \{([\s\S]*?)\}\}/);
    expect(retryMatch).not.toBeNull();
    const retry = retryMatch![1];
    expect(retry).toMatch(/if \(approved && !client\.retryLastSign\(\)\)/);
    expect(retry).toMatch(/setView\(client\.session \? 'account' : 'list'\)/);
  });

  test('the re-shown preview keeps disarming auto-close (a retry in progress must not auto-close the sheet)', () => {
    const retryMatch = MODAL_SRC.match(/onRetry=\{\(\) => \{([\s\S]*?)\}\}/);
    expect(retryMatch).not.toBeNull();
    const retry = retryMatch![1];
    expect(retry).toContain('setCompletionArmed(false)');
  });
});
