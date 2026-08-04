import type { WalletConnector } from '../types.js';
/**
 * Adapter for the Freighter browser extension via the official
 * `@stellar/freighter-api` package. That package's shape is already close
 * to SEP-43 (getAddress/signTransaction/signMessage/getNetworkDetails), so
 * this adapter is mostly a thin re-mapping rather than a shim.
 *
 * `@stellar/freighter-api` is a peer dependency — install it in the host
 * app, this file imports it lazily so `core` has no hard dependency on it.
 */
export declare function createFreighterConnector(): WalletConnector;
//# sourceMappingURL=freighter.d.ts.map