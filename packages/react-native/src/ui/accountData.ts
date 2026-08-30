/**
 * Account data for the connected view — the RN port of the web modal's
 * refreshAccountData() + startBalancePolling() (ui-web connect-modal.ts).
 *
 * The web modal fetches through `@stellar/stellar-sdk`'s Horizon server
 * (dynamically imported). The RN package deliberately makes NO stellar-sdk
 * import — on Metro every dynamic import is inlined into the bundle, so
 * pulling the SDK here would bloat every app that renders the account view.
 * Plain `fetch` against the same Horizon REST endpoints returns the same
 * fields with a few kilobytes of code instead of megabytes:
 *
 *   GET /accounts/{addr}                     → sequence + balances[native]
 *   GET /accounts/{addr}/transactions?limit  → latest txs (hash/date/success)
 *   GET /transactions/{hash}/operations?limit=1 → first op type/amount/asset
 *
 * `useAccountData(client, active)` reproduces the web polling contract:
 * immediate fetch on connect (skeleton state until it lands), then a silent
 * refresh every 10s while the account view is showing, cleared on
 * disconnect. "Silent" = the previous values stay visible during the poll
 * (no loading flash), exactly like the web modal's `refreshAccountData(true)`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { t, type StellarAppKit } from '@saganta/stellar-appkit';

/** One row of the Recent Activity list (web cachedTxHistory entry). */
export interface TxHistoryItem {
  hash: string;
  type: string;
  amount: string;
  asset: string;
  date: string;
  success: boolean;
}

export interface AccountData {
  /** Formatted XLM balance ("123.45"), null while loading or unavailable. */
  balance: string | null;
  /** Latest transactions (max 5), newest first. */
  history: TxHistoryItem[];
}

const EMPTY: AccountData = { balance: null, history: [] };

/** Horizon base URL per network (web parity — PUBLIC vs everything-else). */
export function horizonUrl(network: string): string {
  return network === 'PUBLIC' ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org';
}

/**
 * Explorer base (web explorerUrl parity): stellarchain.io, testnet variant
 * for every non-PUBLIC network.
 */
export function explorerUrl(path: string, network: string): string {
  const base = network === 'PUBLIC' ? 'https://stellarchain.io' : 'https://testnet.stellarchain.io';
  return `${base}/${path}`;
}

/** Web truncateAddress: `GABC…XYZW` (5 + ellipsis + 5). */
export function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 5)}…${address.slice(-5)}`;
}

/**
 * Deterministic avatar colors from the address — the RN stand-in for the
 * web's CSS `linear-gradient(135deg, hsl(h1,…), hsl(h2,…))` (avatar.ts).
 * RN has no zero-dependency linear gradient, so both hues of the SAME hash
 * are exposed: `backgroundColor` blends them at a fixed 60/40 midpoint and
 * `h1`/`h2` can drive a two-tone ring or letter. Same address → same colors
 * on every device, which is the identity property the web gradient provides.
 */
export function avatarColorsFromAddress(address: string): {
  backgroundColor: string;
  h1: number;
  h2: number;
} {
  const chars = address.replace(/^G/, '').slice(2, 14);
  let h1 = 0;
  for (let i = 0; i < Math.min(chars.length, 6); i++) {
    h1 = (h1 + chars.charCodeAt(i) * 37) % 360;
  }
  let h2 = 0;
  for (let i = 6; i < chars.length; i++) {
    h2 = (h2 + chars.charCodeAt(i) * 37) % 360;
  }
  if (h2 === 0) h2 = (h1 + 60) % 360;
  // Blend the two hues toward a single tint — the closest static
  // approximation of a 135deg two-stop gradient at 42×42.
  const h = (h1 * 0.6 + h2 * 0.4) % 360;
  return { backgroundColor: `hsl(${Math.round(h)}, 65%, 50%)`, h1, h2 };
}

/** Web date format: "Aug 30" (en-US short month + day). */
function formatTxDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

interface HorizonTxRecord {
  id: string;
  hash: string;
  created_at: string;
  successful: boolean;
}

interface HorizonOpRecord {
  type: string;
  amount?: string;
  asset_type?: string;
  asset_code?: string;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Horizon ${res.status}`);
  return res.json();
}

/**
 * Fetches balance + latest 5 transactions for an address. Mirrors the web
 * modal's per-tx operation lookup (one extra request per tx, capped at the
 * same 5). Failures degrade exactly like the web code: balance falls back
 * to null (skeleton) and history to [] when the account has no txs yet —
 * a 404 on a fresh account simply means "no data", not an error state.
 */
export async function fetchAccountData(address: string, network: string): Promise<AccountData> {
  const base = horizonUrl(network);
  let balance: string | null = null;
  let history: TxHistoryItem[] = [];

  try {
    const account = (await fetchJson(`${base}/accounts/${address}`)) as {
      balances?: { asset_type: string; balance: string }[];
    };
    const native = account.balances?.find((b) => b.asset_type === 'native');
    balance = native ? parseFloat(native.balance).toFixed(2) : '0.00';
  } catch {
    balance = null;
  }

  try {
    const txs = (await fetchJson(`${base}/accounts/${address}/transactions?limit=5&order=desc`)) as {
      records?: HorizonTxRecord[];
    };
    const records = txs.records ?? [];
    const rows = await Promise.all(
      records.map(async (tx): Promise<TxHistoryItem> => {
        let type = t('tx.default_type');
        let amount = '';
        let asset = t('tx.default_asset');
        try {
          const ops = (await fetchJson(`${base}/transactions/${tx.hash}/operations?limit=1`)) as {
            records?: HorizonOpRecord[];
          };
          const op = ops.records?.[0];
          if (op) {
            type = op.type || t('tx.default_type');
            if (op.type === 'payment' || op.type === 'create_account') {
              amount = parseFloat(op.amount || '0').toFixed(2);
              if (op.asset_type && op.asset_type !== 'native') {
                asset = op.asset_code || t('tx.unknown_asset');
              }
            }
          }
        } catch {
          /* ops unavailable — row falls back to defaults, like the web modal */
        }
        return {
          hash: tx.hash,
          type,
          amount: amount || t('tx.no_amount'),
          asset,
          date: tx.created_at ? formatTxDate(tx.created_at) : '',
          success: tx.successful !== false,
        };
      })
    );
    history = rows;
  } catch {
    history = [];
  }

  return { balance, history };
}

/**
 * Funds an address via the Testnet friendbot faucet (web get-testnet-funds
 * parity — same GET, same silent failure handling).
 */
export async function fundViaFriendbot(address: string): Promise<boolean> {
  try {
    const res = await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Balance + tx-history state for the connected account, polled every 10s
 * while `active` is true (the modal keeps it true only on the account view
 * — web parity: no polling during signing/preview/SIWS/list).
 *
 * @param client the AppKit client (session source)
 * @param active whether the account view is currently visible
 */
export function useAccountData(client: StellarAppKit, active: boolean): AccountData & {
  /** True while the initial fetch is running (drives the skeleton). */
  loading: boolean;
  /** Requests an immediate silent refresh (e.g. after friendbot funding). */
  refresh: () => void;
} {
  const [data, setData] = useState<AccountData>(EMPTY);
  const [loading, setLoading] = useState(false);
  const address = client.session?.address ?? null;
  const network = client.session?.network ?? 'TESTNET';
  // Guard against setState after unmount during an in-flight poll.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(
    async (silent: boolean) => {
      if (!address) return;
      if (!silent) setLoading(true);
      try {
        const next = await fetchAccountData(address, network);
        if (alive.current) setData(next);
      } finally {
        if (alive.current && !silent) setLoading(false);
      }
    },
    [address, network]
  );

  // Initial fetch on connect + reset on disconnect.
  useEffect(() => {
    if (!address) {
      setData(EMPTY);
      return;
    }
    setData((prev) => ({ ...EMPTY, balance: null, history: [] }));
    void load(false);
  }, [address, network, load]);

  // 10s silent polling while the account view is visible (web interval).
  useEffect(() => {
    if (!active || !address) return;
    const timer = setInterval(() => void load(true), 10_000);
    return () => clearInterval(timer);
  }, [active, address, load]);

  const refresh = useCallback(() => {
    void load(true);
  }, [load]);

  return { ...data, loading, refresh };
}
