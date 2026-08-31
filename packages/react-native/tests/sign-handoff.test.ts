/**
 * Tests for the MWA-style sign handoff — the auto-open of the paired
 * wallet app AFTER the user consents to the request.
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
 *    sign-retry-wiring.test.ts): the handoff arms ONLY on the connector's
 *    setOnSignRequestDispatch notification — the moment a sign request is
 *    actually dispatched to the relay, which is AFTER the preview gate
 *    (the user tapped Sign/Approve) — NEVER on the sign queue count
 *    increasing (that fires when the app calls signTransaction(), before
 *    the user consented; opening the wallet there was the consent-gating
 *    bug). A request that settles within the 350ms window cancels the
 *    handoff; the open itself only happens while foregrounded, and it is
 *    silent on failure — the manual "Open in wallet app" button stays.
 *
 * The core side (when the notification fires: post pre-checks, post
 * preview; never for getNetwork; detach) is unit-tested in
 * packages/core/tests/connectors/walletconnect.test.ts. The full
 * end-to-end (Linking.openURL actually launching the wallet, the settle
 * window letting the publish land) needs a device — these pin the
 * decisions that must not silently regress.
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
  test('the handoff arms on the connector DISPATCH notification, not the sign queue', () => {
    // The subscription: the connector notifies the modal the moment a sign
    // request is dispatched to the relay (post-consent, post pre-checks) —
    // that is the ONLY thing that arms the handoff.
    const subMatch = MODAL_SRC.match(
      /setOnSignRequestDispatch[\s\S]*?\n[ \t]*setter\(\(\) => armSignHandoffRef\.current\(\)\);\n[ \t]*return \(\) => setter\(null\);/
    );
    expect(subMatch).not.toBeNull();
    // The arming callback — gated on the prop, resolving the target from
    // the connect-time pick or the restored session's peer redirect.
    const armMatch = MODAL_SRC.match(
      /const armSignHandoff = useCallback\(\(\) => \{[\s\S]*?Linking\.openURL\(link\)\.catch\(\(\) => undefined\);[\s\S]*?\}, \[wcConnector\]\);/
    );
    expect(armMatch).not.toBeNull();
    const arm = armMatch![0];
    // The prop gate (opt-out).
    expect(arm).toContain('if (!autoOpenRef.current) return');
    // Foreground-only — never yank the user out of another app.
    expect(arm).toContain("AppState.currentState !== 'active'");
    // The settle window that lets the request reach the relay first.
    expect(arm).toContain('SIGN_HANDOFF_DELAY_MS');
    // Silent failure — the manual button stays the fallback.
    expect(arm).toMatch(/Linking\.openURL\(link\)\.catch\(\(\) => undefined\)/);
    // The target resolution survives cold restarts (peer fallback).
    expect(arm).toContain('resolveSignHandoffWalletId(peer, pairedMobileWalletId.current)');
  });

  test('CONSENT GATING: nothing arms on pendingSignCount increases (the old pre-consent trigger is gone)', () => {
    // The regression this file guards: the wallet used to open the moment
    // the app CALLED signTransaction() (queue count 0→1) — before the
    // preview modal's Sign/Approve consent. The increase-triggered effect
    // must not come back.
    expect(MODAL_SRC).not.toMatch(/count <= prev\) return;/);
    // The queue count is still watched — but ONLY to CANCEL an armed
    // handoff when the request settles (count decreases).
    const watcher = MODAL_SRC.match(
      /const lastSignCountRef = useRef\(0\);[\s\S]*?\}, \[state\.pendingSignCount\]\);/
    );
    expect(watcher).not.toBeNull();
    expect(watcher![0]).toContain('const decreased = count < lastSignCountRef.current');
    expect(watcher![0]).toContain('if (decreased) cancelSignHandoffRef.current();');
  });

  test('a sign failure inside the settle window cancels the handoff (error event cancels immediately)', () => {
    // The error listener runs cancelSignHandoffRef BEFORE its early
    // returns — every sign failure path cancels, even the suppressed
    // "user rejected" ones (a no-op when nothing is armed).
    const errListener = MODAL_SRC.match(
      /client\.on\('error', \(err\) => \{[\s\S]*?previewJustRejected\.current && err instanceof ConnectError/
    );
    expect(errListener).not.toBeNull();
    expect(errListener![0]).toContain('cancelSignHandoffRef.current();');
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
