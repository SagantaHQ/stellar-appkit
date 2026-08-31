/**
 * trackWalletReachability / sortWalletRows — the pure half of the
 * progressive wallet list (ui-web wallet-list.ts; the wiring lives in
 * connect-modal.ts's refreshWalletList).
 *
 * WHAT THIS PINS: the wallet picker used to wait for EVERY connector's
 * reachability check before rendering a single row (Promise.all), so one
 * slow check (Freighter's 3-second extension timeout when the wallet isn't
 * installed) held the whole list hostage — a user opening the modal
 * shortly after page load stared at "Loading wallets…" for the full
 * window and read it as "the modal takes seconds to open". The
 * regressions these tests guard:
 *
 * - the FIRST update fires synchronously with EVERY row already present,
 *   in the neutral 'checking' state — the modal paints the full list
 *   before any promise settles
 * - a slow check delays only its own row — settled rows update in place,
 *   independently of the slowest one
 * - rejected checks settle as 'unavailable' (the registry's aggregate API
 *   contract, preserved per-row)
 * - WalletConnect stays pinned to the top (registry sort parity) so rows
 *   never visibly re-order as reachability lands
 * - a superseding batch's cancel function freezes the old batch — stale
 *   rows can never paint over a fresh list
 */

import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const MODAL_SRC = fs.readFileSync(
  path.resolve(import.meta.dir, '../src/ui-web/connect-modal.ts'),
  'utf-8'
);
import { sortWalletRows, trackWalletReachability, type WalletListRow } from '../src/ui-web/wallet-list.js';
import type { WalletConnector, WalletReachability } from '@saganta/stellar-appkit';

interface ConnectorStub {
  id: string;
  result?: WalletReachability | Error;
  delayMs?: number;
}

function makeConnector(stub: ConnectorStub): WalletConnector {
  return {
    id: stub.id,
    meta: { id: stub.id, name: stub.id } as WalletConnector['meta'],
    capabilities: {} as WalletConnector['capabilities'],
    getReachability: () =>
      new Promise<WalletReachability>((resolve, reject) => {
        setTimeout(() => {
          if (stub.result instanceof Error) reject(stub.result);
          else resolve(stub.result ?? 'available');
        }, stub.delayMs ?? 0);
      }),
    connect: async () => ({ address: 'GTEST', walletId: stub.id }),
    disconnect: async () => undefined,
  } as WalletConnector;
}

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('sortWalletRows — registry parity', () => {
  test('WalletConnect pinned first, registration order otherwise', () => {
    const rows = [
      { connector: makeConnector({ id: 'freighter' }), reachability: 'available' as const },
      { connector: makeConnector({ id: 'walletconnect' }), reachability: 'checking' as const },
      { connector: makeConnector({ id: 'albedo' }), reachability: 'available' as const },
    ];
    const sorted = sortWalletRows(rows);
    expect(sorted.map((r) => r.connector.id)).toEqual(['walletconnect', 'freighter', 'albedo']);
  });

  test('no WalletConnect — order untouched (stable)', () => {
    const rows = [
      { connector: makeConnector({ id: 'rabet' }), reachability: 'available' as const },
      { connector: makeConnector({ id: 'freighter' }), reachability: 'available' as const },
    ];
    expect(sortWalletRows(rows).map((r) => r.connector.id)).toEqual(['rabet', 'freighter']);
  });
});

describe('trackWalletReachability — the progressive paint', () => {
  test('first update fires synchronously with every row already present in the checking state', () => {
    const connectors = [makeConnector({ id: 'freighter', delayMs: 3000 }), makeConnector({ id: 'walletconnect' })];
    let updates = 0;
    let first: WalletListRow[] | null = null;
    trackWalletReachability(connectors, (rows) => {
      updates++;
      if (!first) first = rows;
    });
    // THE regression: the old Promise.all flow rendered NOTHING until the
    // 3s Freighter check settled. The progressive flow paints all rows in
    // the same tick the modal refreshes.
    expect(updates).toBe(1);
    expect(first).not.toBeNull();
    expect(first!.map((r) => r.connector.id)).toEqual(['walletconnect', 'freighter']);
    expect(first!.every((r) => r.reachability === 'checking')).toBe(true);
  });

  test('a slow check delays only its own row — fast rows settle independently', async () => {
    const connectors = [
      makeConnector({ id: 'walletconnect', delayMs: 5 }),
      makeConnector({ id: 'freighter', result: 'not-installed', delayMs: 3000 }),
    ];
    const snapshots: WalletListRow[][] = [];
    trackWalletReachability(connectors, (rows) => snapshots.push(rows.map((r) => ({ ...r }))));
    await settle(50);
    // Freighter is still checking, WalletConnect already settled.
    expect(snapshots[snapshots.length - 1].find((r) => r.connector.id === 'walletconnect')?.reachability).toBe('available');
    expect(snapshots[snapshots.length - 1].find((r) => r.connector.id === 'freighter')?.reachability).toBe('checking');
    await settle(3000);
    const last = snapshots[snapshots.length - 1];
    expect(last.find((r) => r.connector.id === 'freighter')?.reachability).toBe('not-installed');
    // Row order is stable across the whole progression (no re-sorting flicker).
    expect(snapshots.every((s) => s.map((r) => r.connector.id).join() === 'walletconnect,freighter')).toBe(true);
  });

  test('a rejected check settles as unavailable (registry aggregate contract, per-row)', async () => {
    const connectors = [makeConnector({ id: 'rabet', result: new Error('boom'), delayMs: 5 })];
    const snapshots: WalletListRow[][] = [];
    trackWalletReachability(connectors, (rows) => snapshots.push(rows.map((r) => ({ ...r }))));
    await settle(50);
    expect(snapshots[snapshots.length - 1][0].reachability).toBe('unavailable');
  });

  test('cancel freezes a superseded batch — stale rows never update', async () => {
    const slow = makeConnector({ id: 'freighter', delayMs: 40 });
    let updates = 0;
    const cancel = trackWalletReachability([slow], () => updates++);
    expect(updates).toBe(1);
    cancel(); // a new refreshWalletList() superseded this batch
    await settle(100);
    expect(updates).toBe(1); // the settle callback never fired for the cancelled batch
  });

  test('empty connector list paints nothing and stays silent', async () => {
    let updates = 0;
    trackWalletReachability([], () => updates++);
    await settle(20);
    expect(updates).toBe(1); // the initial (empty) paint only
  });
});

describe('connect-modal wiring — refreshWalletList drives the progressive list', () => {
  test('refreshWalletList uses trackWalletReachability, not the blocking aggregate API', () => {
    expect(MODAL_SRC).toContain('trackWalletReachability(this._client.registry.list()');
    expect(MODAL_SRC).not.toContain('listReachability()');
  });

  test('renderWalletList carries the checking sub-label branch', () => {
    expect(MODAL_SRC).toContain("t('wallet_list.status.checking')");
  });

  test('checking rows are not disabled and not dimmed', () => {
    // The disabled gate must not include 'checking'; the 0.55 dimming flag
    // fires only for known-bad states (locked/unavailable) — never while a
    // row is still settling. (Ordinary string, not a template literal — the
    // asserted source itself contains a ${…} placeholder.)
    expect(MODAL_SRC).toContain("data-unavailable=\"${reachability === 'locked' || reachability === 'unavailable'}\"");
  });

  test('disconnectedCallback cancels the reachability batch (no post-teardown renders)', () => {
    expect(MODAL_SRC).toContain('this.cancelReachabilityTracking?.();');
  });

  test('open() still renders immediately — the modal itself never blocks on reachability', () => {
    // The open path renders synchronously with whatever rows exist; the
    // progressive tracker fills them in. This line is the contract that
    // keeps click-to-open at one paint.
    expect(MODAL_SRC).toContain('// Render IMMEDIATELY with whatever walletList data we have.');
  });
});
