import type { WalletConnector } from '../types.js';
/**
 * Adapter for the Freighter browser extension via the official
 * `@stellar/freighter-api` package. That package's shape is already close
 * to SEP-43 (getAddress/signTransaction/signMessage/getNetworkDetails), so
 * this adapter is mostly a thin re-mapping rather than a shim.
 *
 * `@stellar/freighter-api` is a bundled dependency (listed in
 * `dependencies` in packages/core/package.json) — it's installed
 * automatically when you `npm install @saganta/stellar-appkit`, and
 * lazy-imported here so it's only loaded when the Freighter connector
 * is actually used (tree-shaken out otherwise).
 */
export declare function createFreighterConnector(): WalletConnector;
//# sourceMappingURL=freighter.d.ts.map