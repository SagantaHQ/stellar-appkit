/**
 * Deferred WalletConnect warm-up — keeps the SDK's cold-start cost OFF the
 * sheet-open tap.
 *
 * THE PROBLEM THIS KILLS: the WC SignClient is created through a dynamic
 * `import('@walletconnect/sign-client')`. On React Native the FIRST import
 * evaluates the SDK's whole module tree synchronously on the JS thread —
 * hundreds of modules; on a debug Expo Go build that is *seconds* of frozen
 * JS. If that evaluation is triggered in the same tick as the user's
 * "Connect" tap (the modal's open path, or a conditionally-mounted modal
 * whose first render IS the open), the bottom sheet's mount/layout/
 * entrance animation can't run until the blockage clears: the tap appears
 * dead for 5-10 seconds and THEN the sheet pops in.
 *
 * THE FIX: every warm-up the modal fires is deferred by WARM_UP_SETTLE_MS.
 * That window is enough for the sheet to commit its views, receive
 * onLayout, set its snap points and start the entrance animation (which
 * runs on the UI thread and survives a JS-thread block). The SDK
 * evaluation then freezes the JS thread with the sheet already visible —
 * the cost is paid behind a rendered UI instead of in front of a dead tap.
 *
 * The modal fires this on MOUNT (apps that always render <AppKitModal> —
 * the documented pattern — warm the SDK at app start, long before the
 * first tap) and again on the open transition (a no-op when already warm;
 * the deferred re-fire covers apps that mount the modal only while open).
 * `warmUp()` itself is idempotent and swallows errors — a failed warm-up
 * (e.g. offline) leaves the connector cold, and the next `connect()`
 * retries the init and surfaces the real error to the user.
 */

import type { WalletConnector } from '@saganta/stellar-appkit';

/**
 * How long the warm-up waits after the triggering event (modal mount /
 * sheet open) before starting the SDK module evaluation. Long enough for
 * one or two frames — sheet commit, onLayout, snap points, the entrance
 * animation dispatch — and imperceptible for the flow itself.
 */
export const WARM_UP_SETTLE_MS = 150;

/**
 * Schedules a deferred `warmUp()` on the WalletConnect connector. Safe on
 * any connector shape: undefined (no WC configured) and connectors without
 * a warmUp() (custom connectors) return a no-op cancel.
 *
 * @returns a cancel function that stops the pending timer (used as the
 *   mount effect's cleanup so an unmounted modal never fires a stray
 *   warm-up; the SDK evaluation itself, once started, is not abortable).
 */
export function scheduleWalletConnectWarmUp(connector: WalletConnector | undefined): () => void {
  const warmUp = connector?.warmUp;
  if (typeof warmUp !== 'function') return () => undefined;
  const timer = setTimeout(() => {
    try {
      void warmUp.call(connector)?.catch?.(() => undefined);
    } catch {
      // Best-effort by design — see the module notes on failed warm-ups.
    }
  }, WARM_UP_SETTLE_MS);
  return () => clearTimeout(timer);
}
