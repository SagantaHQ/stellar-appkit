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
export type ViewId = 'list' | 'connecting' | 'signing' | 'account' | 'error';

/** i18n key for each view's sheet-header title (connecting/signing keep the wallet name). */
export const VIEW_TITLES: Partial<Record<ViewId, string>> = {
  list: 'title.connect_wallet',
  account: 'title.account',
  error: 'error.title',
};
