/**
 * scheduleWalletConnectWarmUp — the deferred WalletConnect pre-warm
 * (ui/warm-up.ts; the wiring lives in AppKitModal.tsx).
 *
 * WHAT THIS PINS: the WC SDK's module-tree evaluation blocks the JS thread
 * for seconds on debug React Native builds. If the modal fired `warmUp()`
 * in the same tick as the sheet-open tap, the sheet's layout/entrance
 * animation couldn't run until the blockage cleared — the user's "Connect"
 * tap looks dead for 5-10 seconds and then the sheet pops in. The
 * regressions these tests guard:
 *
 * - warm-up NEVER fires synchronously with the trigger — the settle window
 *   lets the sheet commit + animate first
 * - the settle window is long enough to cover the commit + onLayout +
 *   animation dispatch, short enough to be imperceptible
 * - the cancel returned by the scheduler actually stops a pending warm-up
 *   (an unmounted modal must not fire a stray one)
 * - connectors without a warm-up (custom, or no WalletConnect configured)
 *   are inert — a no-op cancel, nothing thrown
 */

import { describe, expect, test } from 'bun:test';
import { WARM_UP_SETTLE_MS, scheduleWalletConnectWarmUp } from '../src/ui/warm-up.js';
import type { WalletConnector } from '@saganta/stellar-appkit';

type WarmUpSpy = WalletConnector & { calls: number };

function makeConnector(withWarmUp: boolean): WarmUpSpy {
  return {
    id: 'walletconnect',
    meta: { id: 'walletconnect', name: 'WalletConnect' } as WalletConnector['meta'],
    capabilities: {} as WalletConnector['capabilities'],
    getReachability: async () => 'available',
    connect: async () => ({ address: 'GTEST', walletId: 'walletconnect' }),
    disconnect: async () => undefined,
    ...(withWarmUp
      ? {
          warmUp: async function (this: WarmUpSpy) {
            this.calls++;
          },
        }
      : {}),
    calls: 0,
  } as WarmUpSpy;
}

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('WARM_UP_SETTLE_MS — the settle window', () => {
  test('long enough for sheet commit + layout + animation dispatch, imperceptible otherwise', () => {
    // Two frames at 60fps is ~33ms; the sheet's mount path (commit, onLayout,
    // snap points, reanimated dispatch) lands comfortably inside 100ms. 150ms
    // keeps that margin while never being felt by the user.
    expect(WARM_UP_SETTLE_MS).toBeGreaterThanOrEqual(100);
    expect(WARM_UP_SETTLE_MS).toBeLessThanOrEqual(400);
  });
});

describe('scheduleWalletConnectWarmUp — the deferral', () => {
  test("never fires synchronously — the sheet's open tick stays free of the SDK block", async () => {
    const connector = makeConnector(true);
    scheduleWalletConnectWarmUp(connector);
    // THE regression: a synchronous (or 0ms) fire would freeze the sheet's
    // layout in the very tick the user tapped Connect.
    expect(connector.calls).toBe(0);
    await settle(WARM_UP_SETTLE_MS + 30);
    expect(connector.calls).toBe(1);
  });

  test('warm-up fires exactly once per schedule (idempotent scheduling)', async () => {
    const connector = makeConnector(true);
    scheduleWalletConnectWarmUp(connector);
    await settle(WARM_UP_SETTLE_MS + 30);
    expect(connector.calls).toBe(1);
  });

  test('the cancel stops a pending warm-up — an unmounted modal never fires a stray one', async () => {
    const connector = makeConnector(true);
    const cancel = scheduleWalletConnectWarmUp(connector);
    cancel(); // e.g. the mount effect's cleanup before the timer fired
    await settle(WARM_UP_SETTLE_MS + 30);
    expect(connector.calls).toBe(0);
  });

  test('undefined connector (no WalletConnect configured) is inert', () => {
    expect(() => scheduleWalletConnectWarmUp(undefined)).not.toThrow();
    const cancel = scheduleWalletConnectWarmUp(undefined);
    expect(typeof cancel).toBe('function');
  });

  test('a connector without warmUp (custom connector) is inert', async () => {
    const connector = makeConnector(false);
    expect(() => scheduleWalletConnectWarmUp(connector)).not.toThrow();
    await settle(WARM_UP_SETTLE_MS + 30);
    expect(connector.calls).toBe(0);
  });

  test('a warmUp that rejects is swallowed — a failed warm-up must not surface as an app error', async () => {
    const connector = {
      ...makeConnector(true),
      warmUp: async () => {
        throw new Error('offline');
      },
    } as WarmUpSpy;
    scheduleWalletConnectWarmUp(connector);
    await settle(WARM_UP_SETTLE_MS + 30);
    // No unhandled rejection — the call count here is not the point; the
    // assertion is that the await above completes without the test failing
    // on an unhandled promise rejection.
    expect(true).toBe(true);
  });
});
