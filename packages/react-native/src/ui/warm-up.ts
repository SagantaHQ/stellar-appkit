/**
 * Deferred WalletConnect warm-up — keeps the SDK's cold-start cost OFF the
 * sheet-open tap AND off the app's startup window.
 *
 * THE PROBLEM THIS KILLS: the WC SignClient is created through a dynamic
 * `import('@walletconnect/sign-client')`. On React Native the FIRST import
 * evaluates the SDK's whole module tree synchronously on the JS thread —
 * hundreds of modules; on a debug Expo Go build that is *seconds* of frozen
 * JS. Two triggers used to pay it at the worst possible moments:
 *
 *   1. The sheet-open tap: the evaluation landed exactly between the
 *      "Connect" tap and the sheet's layout/entrance animation — the tap
 *      looked dead for 5-10s, then the sheet popped in.
 *   2. App start: the modal's MOUNT warm-up fired ~150ms after the first
 *      screen painted, freezing every JS-driven touch ("all buttons
 *      inactive for ~10 seconds") right as the user starts orienting.
 *
 * THE FIX: every warm-up the modal fires is gated twice — first behind
 * `InteractionManager.runAfterInteractions()` (in-flight animations /
 * interactions finish first; fires immediately when nothing is running),
 * then behind a settle timer whose length depends on the trigger:
 *
 *   - MOUNT (app start): WARM_UP_MOUNT_SETTLE_MS — the app's first paint,
 *     layout and entrance animations get a comfortable head start, and the
 *     user has a moment to settle in front of a fully interactive screen
 *     before the evaluation's JS-thread blockage begins.
 *   - OPEN (the Connect tap): WARM_UP_SETTLE_MS — just enough for the sheet
 *     to commit its views, receive onLayout, set its snap points and start
 *     the entrance animation (which runs on the UI thread and survives a
 *     JS-thread block).
 *
 * The cost itself is unavoidable (a synchronous require cannot be chunked),
 * which is why the RN README documents the eager-preload pattern for apps
 * that want ZERO startup freeze: fire the bare
 * `import('@walletconnect/sign-client')` at the very top of index.js —
 * Metro caches module instances, so the eval is paid once BEHIND THE SPLASH
 * (before React's first render) and every later warmUp()/connect() path
 * requires it instantly. That is what the RN demo does.
 *
 * `warmUp()` itself is idempotent and swallows errors — a failed warm-up
 * (e.g. offline) leaves the connector cold, and the next `connect()`
 * retries the init and surfaces the real error to the user.
 */

import { InteractionManager } from 'react-native';
import type { WalletConnector } from '@saganta/stellar-appkit';

/**
 * How long the warm-up waits after the triggering event fires it (modal
 * sheet open). Long enough for one or two frames — sheet commit, onLayout,
 * snap points, the entrance animation dispatch — and imperceptible for the
 * flow itself.
 */
export const WARM_UP_SETTLE_MS = 150;

/**
 * How long the MOUNT warm-up additionally waits after interactions settle
 * (app start for the always-mounted modal). The app's first screen renders,
 * lays out and becomes interactive well before the SDK's synchronous module
 * evaluation starts blocking the JS thread; users who tap during the window
 * still queue normally (the touch handlers run before the block begins or
 * after it clears — React batches, nothing is lost, only delayed).
 */
export const WARM_UP_MOUNT_SETTLE_MS = 2000;

/** Options for {@link scheduleWalletConnectWarmUp}. */
export interface WarmUpScheduleOptions {
  /**
   * Settle window override, in milliseconds. The modal passes
   * {@link WARM_UP_MOUNT_SETTLE_MS} for the mount trigger and lets the
   * open-transition default to {@link WARM_UP_SETTLE_MS}.
   */
  settleMs?: number;
}

/**
 * Schedules a deferred `warmUp()` on the WalletConnect connector. Safe on
 * any connector shape: undefined (no WC configured) and connectors without
 * a warmUp() (custom connectors) return a no-op cancel.
 *
 * The schedule is interaction-aware: the settle timer only starts once
 * `InteractionManager.runAfterInteractions()` reports the app idle (any
 * entrance/layout animations in flight complete first). When
 * InteractionManager is unavailable (exotic bundlers, test rigs), it
 * degrades to the plain settle timer.
 *
 * @returns a cancel function that stops the pending warm-up (used as the
 *   mount effect's cleanup so an unmounted modal never fires a stray
 *   warm-up; the SDK evaluation itself, once started, is not abortable).
 */
export function scheduleWalletConnectWarmUp(
  connector: WalletConnector | undefined,
  opts?: WarmUpScheduleOptions
): () => void {
  const warmUp = connector?.warmUp;
  if (typeof warmUp !== 'function') return () => undefined;
  const settleMs = opts?.settleMs ?? WARM_UP_SETTLE_MS;

  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const startSettleTimer = () => {
    if (cancelled) return;
    timer = setTimeout(() => {
      timer = null;
      try {
        void warmUp.call(connector)?.catch?.(() => undefined);
      } catch {
        // Best-effort by design — see the module notes on failed warm-ups.
      }
    }, settleMs);
  };

  const cancel = () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };

  // Interaction gate — see the module notes. Guarded for environments
  // without InteractionManager (the mock registry in tests, non-RN
  // bundlers); a throw here must never take the host app down.
  try {
    const im = InteractionManager as unknown as {
      runAfterInteractions?: (cb: () => void) => unknown;
    };
    if (typeof im?.runAfterInteractions === 'function') {
      // The cancelled flag (not the handle) is the source of truth: RN's
      // runAfterInteractions handle cancellation semantics vary by version,
      // so we simply ignore a late callback for a cancelled schedule.
      im.runAfterInteractions(startSettleTimer);
      return cancel;
    }
  } catch {
    // Fall through to the ungated timer below.
  }

  startSettleTimer();
  return cancel;
}
