import { ConnectError } from '../types.js';
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
export function createWalletConnectConnector(opts) {
    const meta = {
        id: 'walletconnect',
        name: 'WalletConnect',
        icon: 'https://raw.githubusercontent.com/WalletConnect/walletconnect-assets/master/Icon/Blue%20(Default)/Icon.svg',
        supportsSep7: true,
        platforms: ['web', 'react-native', 'walletconnect'],
    };
    const capabilities = {
        signTransaction: true,
        signAuthEntry: true,
        signMessage: true,
        submit: false,
    };
    let session = null;
    const connector = {
        id: meta.id,
        meta,
        capabilities,
        async getReachability() {
            // The relay is always reachable given network access — "available"
            // here just means the SDK is configured with a projectId.
            return opts.projectId ? 'available' : 'unavailable';
        },
        async connect(_connectOpts) {
            throw notImplemented('connect');
        },
        async disconnect() {
            session = null;
        },
        async getAddress() {
            requireSession();
            return { address: session.address };
        },
        async getNetwork() {
            requireSession();
            return { network: session.network, networkPassphrase: session.networkPassphrase };
        },
        async signTransaction(_xdr, _signOpts) {
            requireSession();
            throw notImplemented('signTransaction');
        },
        async signAuthEntry(_authEntryXdr, _signOpts) {
            requireSession();
            throw notImplemented('signAuthEntry');
        },
        async signMessage(_message, _signOpts) {
            requireSession();
            throw notImplemented('signMessage');
        },
    };
    function requireSession() {
        if (!session) {
            throw ConnectError.invalidRequest('No active WalletConnect session — call connect() first.', undefined, meta.id);
        }
    }
    return connector;
}
function notImplemented(method) {
    return ConnectError.internal(`WalletConnect adapter: "${method}" needs @walletconnect/sign-client wired up (Phase 2). See ARCHITECTURE.md §9.`, undefined, 'walletconnect');
}
//# sourceMappingURL=walletconnect.js.map