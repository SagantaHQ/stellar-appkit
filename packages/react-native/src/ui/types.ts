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
  | 'signing'
  | 'account'
  | 'error'
  | 'network-mismatch'
  | 'siws-checking'
  | 'siws-nonce'
  | 'siws-signing'
  | 'siws-verifying'
  | 'siws-error';

/** i18n key for each view's sheet-header title (connecting/signing keep the wallet name). */
export const VIEW_TITLES: Partial<Record<ViewId, string>> = {
  list: 'title.connect_wallet',
  account: 'title.account',
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
