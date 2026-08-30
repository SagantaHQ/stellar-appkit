/**
 * Focus return — put the integrating app back in front after the wallet
 * operation settles.
 *
 * THE MOBILE PROBLEM THIS SOLVES: appkit deep-links the user INTO their
 * wallet app (Freighter / LOBSTR / HOT Wallet / …) to approve a connect or
 * a sign request. The moment they approve or reject, the operation is done
 * — but the user is left staring at the WALLET app, because nothing pulls
 * them back. On both platforms a backgrounded app cannot force itself to
 * the foreground (iOS forbids it outright; Android 10+ blocks background
 * activity starts), so "focus my app" needs every sanctioned lever:
 *
 * 1. THE WALLET BOUNCES THE USER BACK (primary, cooperative wallets).
 *    `appMetadata.redirect` (core config) is carried verbatim into every
 *    WalletConnect session proposal as `proposer.metadata.redirect` — the
 *    Reown/WC "return to dapp" standard. Wallets that honor it open the
 *    link right after approve/reject, backgrounding themselves and
 *    re-focusing this app. This is the same mechanism MetaMask/Rainbow/
 *    Trust use, and it works on both iOS and Android because the WALLET
 *    (a foreground app) is doing the opening.
 *
 * 2. THE LIBRARY SELF-OPENS (best-effort fallback). When the operation
 *    settles while this app is backgrounded but its JS is still alive —
 *    common on Android for the seconds after the handoff, where the relay
 *    socket hasn't been reaped yet — `attachAppFocusReturn()` fires
 *    `Linking.openURL(ownScheme)` at the app's own deep link. Some Android
 *    builds honor that self-intent and reorder the task to the front;
 *    iOS (and Android versions enforcing background-activity-launch
 *    restrictions) refuse it and the attempt is a silent no-op. Success
 *    OR failure both count as "settled" — either way the user is done in
 *    the wallet and belongs back here.
 *
 * 3. THE USER RETURNS MANUALLY (the floor). Nothing above fired? The
 *    existing AppState foreground refresh (wc-foreground.ts) still
 *    guarantees the moment they swipe back, the relay restarts and the
 *    settled operation lands instantly.
 *
 * WHEN AN ATTEMPT IS SKIPPED: with no `redirect` configured there is no
 * target to open; while AppState is 'active' the app is already in front
 * (an in-app rejection must never yank focus); an error with nothing in
 * flight (no connect, no pending sign) is not an operation settling; and
 * a cooldown dedupes the error+queue double-report of a single failed
 * sign. Cold-start restores emit 'connect' too — if that ever fires while
 * backgrounded the attempt is harmless (the OS just refuses it).
 *
 * TWO SURFACES (same shape as wc-foreground.ts):
 * - `useAppFocusReturn(client)` — installed automatically by
 *   `<AppKitModal>`; no need to call this when rendering it.
 * - `attachAppFocusReturn(client)` — the standalone subscription for
 *   headless apps (no modal). Returns a detach function; one per client,
 *   please.
 */

import { useEffect } from 'react';
import { AppState, Linking } from 'react-native';
import type { StellarAppKit } from '@saganta/stellar-appkit';

/** The `appMetadata.redirect` shape (WC/Reown metadata standard). */
export type AppFocusRedirect = { native?: string; universal?: string };

/**
 * Minimum spacing between two actual open attempts. A failed sign reports
 * twice in quick succession (the 'error' event, then the sign-queue
 * decrement) — one open is enough. Far shorter than any wallet round trip,
 * so genuinely separate operations never collide.
 */
export const FOCUS_ATTEMPT_COOLDOWN_MS = 1000;

/**
 * Picks the URL to self-open for focus return, from `appMetadata.redirect`.
 *
 * `native` wins over `universal` on purpose: while the app is backgrounded,
 * opening an https universal link can land the user in the BROWSER instead
 * of the app when the domain lacks verified Android App Links / iOS
 * associated domains — worse than doing nothing. A bare scheme ("myapp")
 * is normalized to "myapp://" so integrators can pass either form.
 *
 * @returns the openable URL, or null when nothing usable is configured.
 */
export function resolveAppFocusTarget(redirect: AppFocusRedirect | undefined | null): string | null {
  if (!redirect) return null;
  let target = (redirect.native && redirect.native.trim()) || (redirect.universal && redirect.universal.trim()) || '';
  if (!target) return null;
  // No scheme separator at all → treat as a bare scheme ("myapp" → "myapp://").
  if (!/^[a-z][a-z0-9+.-]*:/i.test(target)) target = `${target}://`;
  return target;
}

/**
 * Whether a focus attempt should actually be issued, given the app's
 * current visibility. Pure on purpose: the whole gating policy is testable
 * without a React Native renderer (same approach as wc-foreground.ts).
 *
 * @param opts.appState `AppState.currentState` — 'active' means the app is
 *                      already in front (an in-app rejection, or the wallet
 *                      already bounced us back): nothing to focus.
 * @param opts.target   the resolved self-open URL (resolveAppFocusTarget).
 * @returns true only when a target exists and the app isn't foregrounded.
 */
export function shouldAttemptAppFocus(opts: { appState: string | null | undefined; target: string | null }): boolean {
  return opts.target !== null && opts.appState !== 'active';
}

/** Opens the app's own deep link — best effort; OS refusals are swallowed. */
async function openAppFocusTarget(target: string): Promise<void> {
  try {
    await Linking.openURL(target);
  } catch {
    // The OS refused (backgrounded app, unregistered scheme, …) — that's
    // the documented best-effort nature of lever 2. Never crash over it.
  }
}

/**
 * Headless subscription: watches the client for operation completions and,
 * when one settles while the app is backgrounded, tries to re-focus the
 * app by opening its own deep link (see module doc — lever 2).
 *
 * ```ts
 * const detach = attachAppFocusReturn(appkit);
 * // ...on teardown / logout:
 * detach();
 * ```
 *
 * @returns a detach function removing every listener.
 */
export function attachAppFocusReturn(client: StellarAppKit): () => void {
  // Latched on statusChange('connecting'), cleared on the next settle.
  // connect() sets status 'error' BEFORE emitting 'error', so "is the
  // status connecting right now" is already false inside the error handler
  // — the latch remembers that a connect was in flight.
  let connectInFlight = false;
  // The sign-queue count as of the last event (init from the live client
  // so attaching mid-flow doesn't misread the first event).
  let lastSignCount = client.pendingSignCount;
  // Timestamp of the last ACTUAL open attempt (cooldown bookkeeping).
  let lastAttemptAt = 0;

  const attempt = (): void => {
    const now = Date.now();
    if (now - lastAttemptAt < FOCUS_ATTEMPT_COOLDOWN_MS) return;
    const target = resolveAppFocusTarget(client.appMetadata?.redirect);
    if (!target || !shouldAttemptAppFocus({ appState: AppState.currentState, target })) return;
    lastAttemptAt = now;
    void openAppFocusTarget(target);
  };

  const offs = [
    client.on('statusChange', (status) => {
      if (status === 'connecting') connectInFlight = true;
    }),
    // Connect settled — success (a restore emits this too; harmless: the
    // AppState gate skips it whenever the app is foregrounded).
    client.on('connect', () => {
      connectInFlight = false;
      attempt();
    }),
    // Failure path — a connect that was in flight or a sign still counted
    // as pending (the queue's finally-decrement runs AFTER this event).
    // Anything else (an error with nothing in flight) is not an operation
    // settling and must not yank the app around.
    client.on('error', () => {
      const operationSettled = connectInFlight || client.pendingSignCount > 0;
      connectInFlight = false;
      if (operationSettled) attempt();
    }),
    // Sign settled (success or failure) — the queue count dropped.
    client.on('signQueueChange', (count) => {
      const settled = count < lastSignCount;
      lastSignCount = count;
      if (settled) attempt();
    }),
  ];

  return () => offs.forEach((off) => off());
}

/**
 * React hook the `<AppKitModal>` installs for you — see
 * `attachAppFocusReturn`. No need to call this when rendering the modal.
 */
export function useAppFocusReturn(client: StellarAppKit): void {
  useEffect(() => attachAppFocusReturn(client), [client]);
}
