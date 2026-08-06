import type { WalletConnector } from '../types.js';
export interface LedgerConnectorOptions {
    /** Preferred browser transport. Falls back to the other if the preferred one isn't supported. Defaults to 'webhid'. */
    preferredTransport?: 'webhid' | 'webusb';
    /** How many accounts listAccounts() derives. Defaults to 5 — each is a real device round-trip, so keep this modest. */
    accountCount?: number;
}
/**
 * Ledger hardware wallet via `@ledgerhq/hw-app-str`, transported over
 * WebHID or WebUSB. All three Ledger packages (`@ledgerhq/hw-app-str`,
 * `@ledgerhq/hw-transport-webhid`, `@ledgerhq/hw-transport-webusb`) are
 * bundled dependencies — installed automatically, no manual install needed.
 *
 * Neither WebHID nor WebUSB is universally supported (notably, Firefox
 * supports neither as of this writing) — `getReachability()` reflects
 * browser API support, not whether a device is actually plugged in, since
 * that can only be known by actually attempting a connection.
 *
 * ⚠️ Two things in this file are marked as needing verification against
 * the exact installed `@ledgerhq/hw-app-str` version rather than asserted
 * as certain — the `signTransaction` payload shape, and Soroban
 * auth-entry signing (stubbed, not faked — see `signAuthEntry` below).
 * Everything else (getPublicKey → address derivation, multi-account via
 * derivation path index, `Transaction.addSignature`) is confirmed against
 * the package's published docs and @stellar/stellar-sdk's real API.
 */
export declare function createLedgerConnector(options?: LedgerConnectorOptions): WalletConnector;
//# sourceMappingURL=ledger.d.ts.map