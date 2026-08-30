/**
 * Shared types for the React Native modal UI.
 *
 * Extracted from AppKitModal.tsx so each view file (./views/*) and the
 * orchestrator (./AppKitModal.tsx) can import them without a circular
 * dependency on the component file.
 */

import type { WalletConnector, WalletReachability } from '@saganta/stellar-appkit';

/** One row of the registered-connector list (Albedo, …). */
export interface WalletRow {
  connector: WalletConnector;
  reachability: WalletReachability;
  available?: boolean;
}

/** Which wallet the connecting/account views should be branded with. */
export interface WalletBranding {
  name: string;
  icon: string | null;
  /** Registry/connector key for icon resolution (mobile wallet id or connector id). */
  key: string | null;
}

/** The modal's internal view state machine. */
export type ViewId =
  | 'list'
  | 'connecting'
  | 'preview'
  | 'signing'
  | 'account'
  | 'error'
  | 'network-mismatch'
  | 'siws-checking'
  | 'siws-nonce'
  | 'siws-signing'
  | 'siws-verifying'
  | 'siws-error';

/** i18n key for each view's sheet-header title (connecting/signing/preview
 * keep their own in-view titles — web shows the wallet name / preview title). */
export const VIEW_TITLES: Partial<Record<ViewId, string>> = {
  list: 'title.connect_wallet',
  account: 'title.account',
  preview: 'title.review_transaction',
  error: 'error.title',
  'network-mismatch': 'title.wrong_network',
  'siws-checking': 'siws.title',
  'siws-nonce': 'siws.title',
  'siws-signing': 'siws.title',
  'siws-verifying': 'siws.title',
  'siws-error': 'siws.error_title',
};

/** SIWS phases share one component + one title. */
export const SIWS_PHASES: readonly ViewId[] = [
  'siws-checking',
  'siws-nonce',
  'siws-signing',
  'siws-verifying',
] as const;

/** Which views use the web `.header--connecting` (back arrow + wallet name + close). */
export function usesBackHeader(view: ViewId, hasError: boolean): boolean {
  return (
    view === 'connecting' ||
    view === 'network-mismatch' ||
    view === 'siws-error' ||
    (view === 'signing' && hasError) ||
    (view === 'error' && hasError)
  );
}

/**
 * Decides which view the modal lands on when it (re-)opens.
 *
 * Web `open()` parity (ui-web connect-modal.ts):
 *
 * ```ts
 * if (!this.pendingPreview && !this.pendingAccountPicker) {
 *   this.view = this._client.session ? 'connected' : 'wallet-list';
 * }
 * ```
 *
 * A sign request awaiting the user's decision owns the view — the modal is
 * often opening *because* the sign arrived (apps auto-open on
 * `pendingSignCount > 0`), so resetting to the account view would orphan the
 * pending preview and hang the sign queue forever. The two RN extensions are
 * the same principle for flows the web only ever runs with the modal open:
 *
 * - **Sign queue in flight** (preview already approved, `skipPreview`, or the
 *   app installed its own instant-approve preview handler) → re-enter the
 *   signing view, which tells the user where the request is waiting.
 * - **SIWS mid-flow** → restore the active phase (RN can restore a session
 *   from storage at app start with the sheet closed; the web never faces
 *   that because connecting always happens inside the modal).
 */
export function resolveViewOnOpen(opts: {
  /** A transaction/message preview is awaiting the user's Approve/Reject. */
  pendingPreview: boolean;
  /** Sign requests queued, including the one in flight. */
  pendingSignCount: number;
  /** Active SIWS phase, or null (siws-error is deliberately excluded — the
   *  web resets away from read errors on reopen too). */
  siwsPhase: string | null;
  /** True while the SIWS flow is actively running (not on its error view). */
  siwsBusy: boolean;
  /** Whether a wallet session exists. */
  hasSession: boolean;
}): ViewId {
  if (opts.pendingPreview) return 'preview';
  if (opts.pendingSignCount > 0 && !opts.siwsBusy) return 'signing';
  if (opts.siwsBusy && opts.siwsPhase && opts.siwsPhase.startsWith('siws-')) {
    return opts.siwsPhase as ViewId;
  }
  return opts.hasSession ? 'account' : 'list';
}
