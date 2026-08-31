/**
 * Progressive wallet-list reachability — the modal's anti-"dead air" layer.
 *
 * THE PROBLEM THIS KILLS: `ConnectorRegistry.listReachability()` waits for
 * EVERY connector's `getReachability()` before returning a single row
 * (Promise.all). Most checks are instant, but Freighter's installed-check
 * rides a 3-second timeout when the extension isn't present — so a user
 * who opens the modal shortly after page load (before the page-load
 * prefetch finished, or in an app that attaches the client on demand)
 * stares at a "Loading wallets…" spinner for the full window. On slow
 * machines and cold caches that reads as "the modal takes seconds to
 * open" even though the sheet itself painted instantly.
 *
 * THE FIX: paint every row IMMEDIATELY in a neutral `checking` state
 * (sorted exactly like the registry sorts: WalletConnect pinned first,
 * registration order otherwise), then settle each row's reachability the
 * moment its own promise resolves — a slow check delays only its own
 * row, never the list. Rows are keyed by identity (the same row object
 * is mutated), so `renderWalletList()` keeps stable DOM per row across
 * updates.
 *
 * Clicking a `checking` row is safe: the modal's `selectWallet()`
 * re-resolves reachability at click time before doing anything, so a
 * premature tap just pays the check once and then routes correctly
 * (connect, install URL, or nothing for unavailable wallets).
 *
 * Superseded runs are cancelled: starting a new tracking batch (the
 * client re-attaching, the modal re-opening) returns a cancel function
 * that stops the previous batch's pending callbacks from rendering —
 * stale `onUpdate` calls after a registry swap would otherwise paint
 * rows for connectors that are no longer registered.
 */

import type { WalletConnector, WalletReachability } from '@saganta/stellar-appkit';

/** A row's reachability while its real check is still in flight. */
export type WalletListReachability = WalletReachability | 'checking';

/** One wallet-list row — `reachability` starts as 'checking' and settles in place. */
export interface WalletListRow {
  connector: WalletConnector;
  reachability: WalletListReachability;
}

/**
 * Sorts rows the way `ConnectorRegistry.listReachability()` does:
 * WalletConnect pinned to the top (the one "always-available" relay —
 * it tells users they can pair a mobile wallet even with no extension
 * installed), everything else in registration order. The modal's
 * progressive list must not visibly re-order rows as reachability
 * lands, so the initial paint sorts with this and in-place updates
 * never move a row.
 */
export function sortWalletRows<T extends { connector: WalletConnector }>(rows: readonly T[]): T[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    if (a.connector.id === 'walletconnect' && b.connector.id !== 'walletconnect') return -1;
    if (b.connector.id === 'walletconnect' && a.connector.id !== 'walletconnect') return 1;
    return 0;
  });
  return sorted;
}

/**
 * Drives the progressive flow:
 * 1. `onUpdate` fires synchronously with every row in the `checking`
 *    state — the caller paints the full list immediately.
 * 2. Each connector's `getReachability()` is started right away (all in
 *    parallel); the moment one settles, its row is updated in place and
 *    `onUpdate` fires again. A rejected check settles as 'unavailable'
 *    (same contract as the registry's aggregate API).
 *
 * @returns a cancel function: stops pending callbacks from firing
 *   `onUpdate` (the rows array may already be owned by the caller —
 *   cancellation only freezes further updates, it doesn't rewind).
 */
export function trackWalletReachability(
  connectors: readonly WalletConnector[],
  onUpdate: (rows: WalletListRow[]) => void
): () => void {
  let cancelled = false;
  const rows = sortWalletRows(
    connectors.map((connector): WalletListRow => ({ connector, reachability: 'checking' }))
  );
  onUpdate(rows);
  for (const row of rows) {
    const settle = (reachability: WalletReachability) => {
      if (cancelled || row.reachability !== 'checking') return;
      row.reachability = reachability;
      onUpdate(rows);
    };
    try {
      row.connector
        .getReachability()
        .then(
          (r) => settle(r),
          () => settle('unavailable')
        );
    } catch {
      // A synchronously-throwing getReachability() — treated exactly like
      // the registry treats it: that wallet is simply unavailable.
      settle('unavailable');
    }
  }
  return () => {
    cancelled = true;
  };
}
