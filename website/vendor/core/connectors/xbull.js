import { ConnectError } from '../types.js';
import { withNormalizedError } from './error-utils.js';
/**
 * Adapter for xBull, via the official `@creit.tech/xbull-wallet-connect`
 * package — confirmed against the package's own shipped `.d.ts` at v0.4.0,
 * which is more precise than (and in one place corrects) its README:
 * `signMessage()` genuinely exists and is implemented below, despite the
 * README not documenting it.
 *
 * Corrected from an earlier version of this file that assumed a
 * `window.xBullSDK` injected global with `getPublicKey`/`signXDR`/
 * `signAuthEntry`/`signMessage` methods. That shape doesn't exist — xBull's
 * real API is a `xBullWalletConnect` bridge class you instantiate, with
 * `connect()` (returns the public key directly), `sign({xdr, publicKey?,
 * network?})` (returns the signed XDR directly), and `signMessage(message,
 * opts?)`. There is no separate "get current address" call — `connect()`
 * is both. The bridge itself handles falling back to the xBull webapp when
 * the extension isn't installed, so there's no meaningful "not installed"
 * state to detect the way there is for Freighter — it behaves like Albedo
 * in that respect.
 *
 * Soroban auth-entry signing is still not supported here, but precisely
 * so: the shipped types show the underlying message protocol *does* have
 * an internal `xdrType: 'Transaction' | 'AuthEntry'` concept
 * (`ISignXDRRequestPayload`), but the public `sign()` method's parameters
 * (`ISignParams`) don't expose a way to select it — so there's no
 * reliable, documented way to ask for auth-entry signing specifically
 * through this public API today, as opposed to it simply not existing.
 */
export function createXBullConnector() {
    const meta = {
        id: 'xbull',
        name: 'xBull',
        icon: 'https://xbull.app/img/logo-icon.svg',
        installUrl: {
            chrome: 'https://chromewebstore.google.com/detail/xbull-wallet/omajpeaffjkigglnbfmhopaigbgihgeb',
        },
        platforms: ['browser-extension', 'web'],
    };
    const capabilities = {
        signTransaction: true,
        signAuthEntry: false, // not exposed by the public sign() API — see file header comment
        signMessage: true, // confirmed in the shipped .d.ts, despite the README omitting it
        submit: false,
    };
    let bridge = null;
    let cachedAddress = null;
    async function ensureBridge() {
        if (bridge)
            return bridge;
        const { xBullWalletConnect } = await import('@creit.tech/xbull-wallet-connect');
        bridge = new xBullWalletConnect();
        return bridge;
    }
    const connector = {
        id: meta.id,
        meta,
        capabilities,
        async getReachability() {
            // The bridge falls back to the xBull webapp automatically when the
            // extension isn't installed, so — like Albedo — there's no "not
            // installed" state to report, only whether this environment can run
            // the bridge at all (needs window for the popup/iframe it uses).
            return typeof window !== 'undefined' ? 'available' : 'unavailable';
        },
        async connect(_opts) {
            return withNormalizedError(meta.id, async () => {
                const b = await ensureBridge();
                // Both flags are required together per the real IConnectParams shape —
                // we need both capabilities, so this is explicit rather than relying
                // on whatever the library defaults to when the params object is omitted.
                const publicKey = await b.connect({ canRequestPublicKey: true, canRequestSign: true });
                cachedAddress = publicKey;
                return { address: publicKey, walletId: meta.id };
            });
        },
        async disconnect() {
            bridge?.closeConnections?.();
            bridge = null;
            cachedAddress = null;
        },
        async getAddress() {
            if (!cachedAddress) {
                throw ConnectError.invalidRequest('xBull is not connected — call connect() first.', undefined, meta.id);
            }
            return { address: cachedAddress };
        },
        async getNetwork() {
            // Not exposed by this library — the network is passed explicitly to
            // sign() instead of being something the bridge reports back.
            throw ConnectError.invalidRequest('xBull Wallet Connect does not expose a persistent network — pass networkPassphrase explicitly on each call.', undefined, meta.id);
        },
        async signTransaction(xdr, opts) {
            return withNormalizedError(meta.id, async () => {
                const b = await ensureBridge();
                const signerAddress = opts?.address ?? cachedAddress ?? undefined;
                const signedTxXdr = await b.sign({
                    xdr,
                    publicKey: signerAddress,
                    network: opts?.networkPassphrase,
                });
                if (!signerAddress) {
                    throw ConnectError.internal('Could not determine the signer address for this xBull transaction — call connect() first.', undefined, meta.id);
                }
                return { signedTxXdr, signerAddress };
            });
        },
        async signAuthEntry() {
            throw ConnectError.invalidRequest('xBull Wallet Connect does not support signing Soroban auth entries. Prompt the user to choose a different wallet for this action.', undefined, meta.id);
        },
        async signMessage(message, opts) {
            return withNormalizedError(meta.id, async () => {
                const b = await ensureBridge();
                const result = await b.signMessage(message, {
                    networkPassphrase: opts?.networkPassphrase,
                    address: opts?.address ?? cachedAddress ?? undefined,
                });
                return { signedMessage: result.signedMessage, signerAddress: result.signerAddress };
            });
        },
    };
    return connector;
}
//# sourceMappingURL=xbull.js.map