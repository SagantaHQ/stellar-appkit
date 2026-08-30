/**
 * Auto-close on successful operation completion — the mobile deep-link UX.
 *
 * THE BEHAVIOR (deliberate RN deviation from the web modal, documented in
 * ARCHITECTURE.md): when a wallet was opened *by the app* — a connect the
 * modal drove (wallet list tap → deep-link handoff → approval in the wallet
 * app) or a sign request the wallet answered — and that operation completes
 * SUCCESSFULLY, the sheet closes itself. No extra dismissal tap, no
 * "connected" view sitting on top of the thing the user was doing.
 * Success is the ONLY trigger: failures, rejections and expiries never
 * auto-close (web error-routing parity — the user reads the outcome and
 * acts on it).
 *
 * On mobile this is the pattern every native flow uses (Solana Mobile
 * Adapter, WalletConnect's own mobile linking): the user just confirmed in
 * the wallet app, so the round trip is *done* — the fastest path back to
 * the app is the sheet closing itself. On web the modal intentionally stays
 * open on the account view (the connected panel with balance/history is a
 * feature there); RN keeps that panel one `openAppKit()` away, it just
 * doesn't park itself in front of the app after an operation resolves.
 * (Foregrounding the app itself when the user is still sitting in the
 * wallet app is a separate feature — focus-return.ts.)
 *
 * WHAT COUNTS AS "SUCCESS" (arming — see AppKitModal.tsx):
 * - a modal-driven connect settles (`finishConnect` — the connect promise
 *   resolved; covers the deep-link return from HOT Wallet / Freighter / …
 *   and the Albedo WebView screen)
 * - the sign queue drains from the signing view with no error
 * SIWS phases do not re-arm anything: the connect arm survives them, so the
 * sheet closes once after the *whole* connect+sign-in flow finishes (and a
 * `siws-error` view never auto-closes — the user is reading it).
 *
 * WHAT NEVER AUTO-CLOSES (web parity — the user must see the outcome):
 * - failed connects (connecting view's error variant) and rejected signs
 *   (signing view's error variant with Cancel / Try again) — including
 *   expired WalletConnect requests and every other error outcome
 * - the generic error and network-mismatch views
 * - a preview awaiting the user's decision, and anything the user navigated
 *   to themselves (switch wallet, back arrow, disconnect, SIWS cancel) —
 *   those disarm the flag: taking control means keeping control
 *
 * THE ARMED-FLAG LIFECYCLE: armed is set only at completion sites while the
 * sheet is open, and reset on every sheet open/close transition — so a modal
 * re-opened later for account management can never self-close off a stale
 * completion, and a sheet the app force-closed mid-flow leaves nothing
 * armed behind.
 */

/**
 * How long the account view stays up after a successful operation before
 * the sheet minimizes — long enough to register the "connected ✓" /
 * signed flash (the wallet app itself already showed the success state),
 * short enough to feel like focus simply returned to the app.
 */
export const AUTO_CLOSE_DELAY_MS = 900;

/**
 * Whether the auto-close timer should be running, given the modal's current
 * snapshot. Pure on purpose: every wiring rule above is testable without a
 * React Native renderer (same approach as `resolveViewOnOpen`).
 *
 * @param opts.enabled      the `autoCloseOnComplete` prop (default true)
 * @param opts.mode         presentation mode — inline panels have no sheet
 *                          to close, so they never auto-minimize
 * @param opts.armed        a modal-driven operation completed (see above)
 * @param opts.view         the modal's current view
 * @param opts.hasSession   whether a wallet session is live
 * @param opts.sheetOpen    whether the sheet is presented (`effectiveOpen`)
 */
export function shouldAutoClose(opts: {
  enabled: boolean;
  mode: 'bottomsheet' | 'inline';
  armed: boolean;
  view: string;
  hasSession: boolean;
  sheetOpen: boolean;
}): boolean {
  if (!opts.enabled) return false;
  if (opts.mode === 'inline') return false;
  if (!opts.sheetOpen) return false;
  if (!opts.armed) return false;
  // 'account' is the single completion landing view: the sign-drain effect
  // and finishConnect both settle there, and SIWS-done returns to it. Every
  // other view either belongs to a flow still running (connecting, signing,
  // preview, siws-*) or is one the user must act on (errors) — none of them
  // may close the sheet out from under the user.
  if (opts.view !== 'account') return false;
  // Defensive: a sign can only drain with a session, but if the wallet got
  // disconnected in the same breath (disconnectOnFail, relay drop), the
  // account view can't render anyway — nothing to confirm, don't close.
  return opts.hasSession;
}
