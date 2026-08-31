/**
 * Tests for the MWA-style sign handoff — the auto-open of the paired wallet
 * app the moment a WalletConnect request is queued from this side.
 *
 * Two layers, pinned separately:
 *
 * 1. Target resolution (unit-tested here): resolveSignHandoffWalletId /
 *    buildSignHandoffLink pick the wallet the user chose during connect,
 *    fall back to the wallet the RESTORED session's peer metadata points
 *    back to (cold restart — no pick was made in this process), and return
 *    null for wallets that can't be re-opened at all.
 *
 * 2. The modal wiring (source-checked here, same pattern as
 *    sign-retry-wiring.test.ts): the auto-open effect must fire only on
 *    pendingSignCount INCREASES (drains and unrelated snapshot re-renders
 *    never re-open the wallet), only while the app is foregrounded, and
 *    behind the autoOpenWalletOnSign prop (default on) — plus the manual
 *    "Open in wallet app" button must now resolve for restored sessions
 *    too, not just a connect-time pick.
 *
 * The full end-to-end (Linking.openURL actually launching the wallet, the
 * 350ms dispatch delay letting the request reach the relay first) needs a
 * device — these pin the decisions that must not silently regress.
 */

import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  resolveSignHandoffWalletId,
  buildSignHandoffLink,
  findWalletByDeepLink,
  registerMobileWallet,
} from '../src/deep-links.js';

const MODAL_SRC = fs.readFileSync(
  path.resolve(import.meta.dir, '../src/ui/AppKitModal.tsx'),
  'utf-8'
);

describe('resolveSignHandoffWalletId — who gets the sign handoff', () => {
  test('the connect-time pick wins when it maps into the registry', () => {
    expect(resolveSignHandoffWalletId(null, 'freighter-mobile')).toBe('freighter-mobile');
    // Even when the peer names a different wallet, the pick is authoritative.
    expect(
      resolveSignHandoffWalletId({ native: 'lobstr://', universal: null }, 'freighter-mobile')
    ).toBe('freighter-mobile');
  });

  test('an unknown picked id falls back to the peer redirect (custom wallets can be unregistered)', () => {
    expect(resolveSignHandoffWalletId({ native: 'lobstr://', universal: null }, 'my-custom-wallet')).toBe('lobstr-mobile');
  });

  test('after a cold restart (no pick), the peer redirect names the wallet', () => {
    expect(resolveSignHandoffWalletId({ native: 'freighterwallet://wc-redirect', universal: 'https://freighter.app' }, null)).toBe(
      'freighter-mobile'
    );
    expect(resolveSignHandoffWalletId({ native: 'hotwallet://', universal: null }, null)).toBe('hot-wallet-mobile');
    expect(resolveSignHandoffWalletId({ native: 'scopuly://wc', universal: null }, null)).toBe('scopuly-mobile');
  });

  test('no target derivable → null (desktop wallets, no redirect, nothing picked)', () => {
    expect(resolveSignHandoffWalletId(null, null)).toBeNull();
    expect(resolveSignHandoffWalletId({ native: null, universal: null }, null)).toBeNull();
    // A peer scheme that isn't in the registry and wasn't picked.
    expect(resolveSignHandoffWalletId({ native: 'unknownwallet://', universal: null }, null)).toBeNull();
  });
});

describe('buildSignHandoffLink — the link the handoff opens', () => {
  test('registered wallets open their bare scheme (the WC sign-request convention)', () => {
    expect(buildSignHandoffLink('freighter-mobile', null)).toBe('freighterwallet://');
    expect(buildSignHandoffLink('lobstr-mobile', null)).toBe('lobstr://');
  });

  test('an unregistered wallet opens the peer\'s own native redirect verbatim', () => {
    expect(buildSignHandoffLink(null, { native: 'someotherscheme://session', universal: null })).toBe(
      'someotherscheme://session'
    );
  });

  test('nothing resolvable → null (caller keeps manual affordances only)', () => {
    expect(buildSignHandoffLink(null, null)).toBeNull();
    expect(buildSignHandoffLink(null, { native: null, universal: 'https://example.com' })).toBeNull();
  });

  test('runtime-registered wallets (registerMobileWallet) resolve like built-ins', () => {
    registerMobileWallet({
      id: 'test-handoff-wallet',
      name: 'Test Wallet',
      icon: 'data:image/png;base64,',
      scheme: 'testhandoff',
      installUrl: { ios: 'https://example.com', android: 'https://example.com' },
    });
    expect(resolveSignHandoffWalletId({ native: 'testhandoff://wc', universal: null }, null)).toBe('test-handoff-wallet');
    expect(buildSignHandoffLink('test-handoff-wallet', null)).toBe('testhandoff://');
    // The scheme reverse-lookup agrees (used for incoming links too).
    expect(findWalletByDeepLink('testhandoff://anything')?.id).toBe('test-handoff-wallet');
  });
});

describe('AppKitModal — auto-open wiring (source checks)', () => {
  test('the effect fires only on pendingSignCount increases, gated on the prop', () => {
    const effectMatch = MODAL_SRC.match(
      /if \(!autoOpenRef\.current \|\| count <= prev\) return;[\s\S]*?\}, \[state\.pendingSignCount, wcConnector\]\);/
    );
    expect(effectMatch).not.toBeNull();
    const effect = effectMatch![0];
    // The guard itself.
    expect(effect).toContain('count <= prev');
    expect(effect).toContain('autoOpenRef.current');
    // Foreground-only — never yank the user out of another app.
    expect(effect).toContain("AppState.currentState !== 'active'");
    // The dispatch delay that lets the request reach the relay first.
    expect(effect).toContain('SIGN_HANDOFF_DELAY_MS');
    // Silent failure — the manual button stays the fallback.
    expect(effect).toMatch(/Linking\.openURL\(link\)\.catch\(\(\) => undefined\)/);
  });

  test('a pending handoff timer never outlives the modal (unmount clears it)', () => {
    expect(MODAL_SRC).toMatch(/useEffect\(\s*\(\) => \(\) => \{\s*if \(handoffTimerRef\.current\) clearTimeout\(handoffTimerRef\.current\);/);
  });

  test('the manual "Open in wallet app" button resolves for restored sessions, not just connect-time picks', () => {
    // signHandoffWalletId (ref pick ?? peer-derived) drives onOpenWallet.
    expect(MODAL_SRC).toContain('signHandoffWalletId ? () => void reopenPairedWallet(signHandoffWalletId)');
    // And the peer fallback covers wallets outside the registry.
    expect(MODAL_SRC).toContain('signHandoffLink ? reopenSignHandoffWallet');
  });

  test('the prop exists and defaults ON (opt-out mirrors autoCloseOnComplete)', () => {
    expect(MODAL_SRC).toMatch(/autoOpenWalletOnSign = true,/);
    expect(MODAL_SRC).toMatch(/autoOpenWalletOnSign\?: boolean;/);
  });
});
