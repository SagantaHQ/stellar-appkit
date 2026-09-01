/**
 * scheduleWalletConnectWarmUp — the deferred WalletConnect pre-warm
 * (ui/warm-up.ts; the wiring lives in AppKitModal.tsx).
 *
 * WHAT THIS PINS: the WC SDK's module-tree evaluation blocks the JS thread
 * for seconds on debug React Native builds. If the modal fired `warmUp()`
 * in the same tick as the sheet-open tap, the sheet's layout/entrance
 * animation couldn't run until the blockage cleared — the user's "Connect"
 * tap looks dead for 5-10 seconds and then the sheet pops in. And if the
 * MOUNT warm-up fired in the first ticks of app start, the freshly-painted
 * first screen sat with every JS-driven touch frozen for the same window
 * ("all buttons inactive after load"). The regressions these tests guard:
 *
 * - warm-up NEVER fires synchronously with the trigger — the settle window
 *   lets the sheet commit + animate first
 * - the open settle window is long enough to cover the commit + onLayout +
 *   animation dispatch, short enough to be imperceptible
 * - the MOUNT settle window is substantially longer than the open one —
 *   app start is not a race the SDK evaluation is allowed to win
 * - nothing fires while an interaction/animation is still in flight
 *   (InteractionManager gate) — and the gate flushing starts the timer
 * - the cancel returned by the scheduler actually stops a pending warm-up
 *   (an unmounted modal must not fire a stray one), including one still
 *   waiting behind the interaction gate
 * - connectors without a warm-up (custom, or no WalletConnect configured)
 *   are inert — a no-op cancel, nothing thrown
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { installReactNativeMock, resetRnState, flushInteractions, rnState } from './helpers/rn-mock.js';

installReactNativeMock();

const { WARM_UP_MOUNT_SETTLE_MS, WARM_UP_SETTLE_MS, scheduleWalletConnectWarmUp } = await import(
  '../src/ui/warm-up.js'
);
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

beforeEach(() => {
  resetRnState();
});

describe('the settle windows', () => {
  test('open window: long enough for sheet commit + layout + animation dispatch, imperceptible otherwise', () => {
    // Two frames at 60fps is ~33ms; the sheet's mount path (commit, onLayout,
    // snap points, reanimated dispatch) lands comfortably inside 100ms. 150ms
    // keeps that margin while never being felt by the user.
    expect(WARM_UP_SETTLE_MS).toBeGreaterThanOrEqual(100);
    expect(WARM_UP_SETTLE_MS).toBeLessThanOrEqual(400);
  });

  test('mount window: substantially longer than the open window — app start is not a race the SDK evaluation wins', () => {
    // The mount warm-up fires at APP START: the first screen has just
    // painted and the user is starting to orient. A ~150ms window there
    // would freeze their very first interactions behind the evaluation.
    // >= 1s gives the startup render + entrance animations + the user's
    // first moment with a fully interactive screen; <= 3s keeps the
    // pre-warm early enough to beat a realistic first Connect tap.
    expect(WARM_UP_MOUNT_SETTLE_MS).toBeGreaterThanOrEqual(1000);
    expect(WARM_UP_MOUNT_SETTLE_MS).toBeLessThanOrEqual(3000);
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

  test('a mount-schedule waits out the longer window — the app-start path never fires at open speed', async () => {
    const connector = makeConnector(true);
    scheduleWalletConnectWarmUp(connector, { settleMs: WARM_UP_MOUNT_SETTLE_MS });
    // Past the OPEN window the mount warm-up must still not have fired.
    await settle(WARM_UP_SETTLE_MS + 30);
    expect(connector.calls).toBe(0);
    await settle(WARM_UP_MOUNT_SETTLE_MS - WARM_UP_SETTLE_MS + 60);
    expect(connector.calls).toBe(1);
  });

  test('nothing fires while an interaction is in flight — the gate flush starts the window, not the warm-up', async () => {
    rnState.holdInteractions = true; // e.g. an entrance animation is running
    const connector = makeConnector(true);
    scheduleWalletConnectWarmUp(connector);

    // While the animation runs, even the settle window elapsing must not
    // fire the warm-up (the timer hasn't even started).
    await settle(WARM_UP_SETTLE_MS + 30);
    expect(connector.calls).toBe(0);

    // The interaction completes — the settle window STARTS here; the
    // warm-up still doesn't fire with it.
    flushInteractions();
    expect(connector.calls).toBe(0);
    await settle(WARM_UP_SETTLE_MS + 30);
    expect(connector.calls).toBe(1);
  });

  test('cancel while still gated behind an interaction stops the warm-up entirely', async () => {
    rnState.holdInteractions = true;
    const connector = makeConnector(true);
    const cancel = scheduleWalletConnectWarmUp(connector);
    cancel(); // modal unmounted before the animation even finished
    flushInteractions(); // the queued callback runs — it must be a no-op
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
