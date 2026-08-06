import type { WalletConnector } from '../types.js';
/**
 * Adapter for Albedo (`@albedo-link/intent`) — a popup/redirect-based
 * signer with no extension to install, so it's always "available" and is a
 * good default first option in the wallet list for users without a wallet
 * yet.
 *
 * Albedo does not expose a Soroban auth-entry intent as of this writing —
 * `signAuthEntry` is reported as unsupported via capabilities rather than
 * silently failing, so the Soroban layer can route auth-entry signing to a
 * different connector when Albedo is the active wallet.
 */
export declare function createAlbedoConnector(): WalletConnector;
//# sourceMappingURL=albedo.d.ts.map