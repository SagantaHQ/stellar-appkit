import type { WalletConnector } from '../types.js';
/**
 * WalletConnect v2 (Reown) relay adapter — the single connector that covers
 * every wallet supporting the Stellar WC namespace (Lobstr, Hana, Hot
 * Wallet, and any wallet on both mobile and desktop that isn't a browser
 * extension). This is Phase 2 in the roadmap: it needs a real
 * `@walletconnect/sign-client` session (QR pairing on desktop, deep link on
 * mobile) wired in, session persistence via the injected `ConnectStorage`,
 * and `stellar_signXDR` / `stellar_signAndSubmitXDR` request methods per
 * the Stellar WC namespace.
 *
 * This file defines the adapter shape and wires up everything that doesn't
 * depend on the actual relay client, so implementing `initSession`/
 * `request` below is the only work left — the rest of the SDK (Soroban
 * layer, SIWS, UI) already knows how to talk to this connector once that's
 * in place, because it speaks the same WalletConnector interface as every
 * other adapter.
 */
export declare function createWalletConnectConnector(opts: {
    projectId: string;
    metadata: {
        name: string;
        description: string;
        url: string;
        icons: string[];
    };
}): WalletConnector;
//# sourceMappingURL=walletconnect.d.ts.map