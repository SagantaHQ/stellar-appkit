import { ConnectError } from '../types.js';
import { withNormalizedError } from './error-utils.js';
const WC_STORAGE_KEY = 'saganta-appkit:walletconnect-session';
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
        signAuthEntry: false, // WC Stellar namespace doesn't expose auth-entry signing
        signMessage: true,
        submit: false, // we use stellar_signXDR (sign only), not stellar_signAndSubmitXDR
    };
    let client = null;
    let sessionTopic = null;
    let cachedAddress = null;
    let cachedNetwork = null;
    /**
     * Lazy-imports @walletconnect/sign-client and initializes the SignClient
     * (if not already done). The client is a singleton — we only init once
     * per connector instance.
     */
    async function ensureClient() {
        if (client)
            return client;
        try {
            // @walletconnect/sign-client exports a SignClient class (default export).
            // We lazy-import it so apps that don't use WalletConnect don't need
            // the package installed.
            const mod = await import('@walletconnect/sign-client');
            const SignClient = mod.default;
            client = await SignClient.init({
                projectId: opts.projectId,
                metadata: opts.metadata,
                relayUrl: 'wss://relay.walletconnect.com',
            });
            // Listen for session deletion (wallet disconnected from their side)
            client.on('session_delete', (...args) => {
                const event = args[0];
                if (event?.topic === sessionTopic) {
                    sessionTopic = null;
                    cachedAddress = null;
                    cachedNetwork = null;
                }
            });
            return client;
        }
        catch (err) {
            throw ConnectError.internal(`Failed to initialize WalletConnect: ${err instanceof Error ? err.message : String(err)}. ` +
                'Make sure @walletconnect/sign-client is installed: npm install @walletconnect/sign-client', undefined, meta.id);
        }
    }
    const connector = {
        id: meta.id,
        meta,
        capabilities,
        async getReachability() {
            // WalletConnect is always "available" if a projectId is configured —
            // the relay is a cloud service, not an installed extension.
            return opts.projectId ? 'available' : 'unavailable';
        },
        async connect(_connectOpts) {
            return withNormalizedError(meta.id, async () => {
                const wc = await ensureClient();
                // Propose a session with the Stellar namespace
                const { uri, approval } = await wc.connect({
                    requiredNamespaces: {
                        stellar: {
                            chains: [`stellar:${opts.networkPassphrase}`],
                            methods: ['stellar_signXDR', 'stellar_signMessage', 'stellar_getAddress', 'stellar_getNetwork'],
                            events: [],
                        },
                    },
                });
                // Surface the URI for the app to render as a QR code or deep link
                if (uri)
                    opts.onUri(uri);
                // Wait for the wallet to approve — resolves with the session object
                const session = await approval();
                sessionTopic = session.topic;
                // Extract the address from the session's namespace accounts.
                // WC account format: "stellar:<networkPassphrase>:<address>"
                const stellarNamespace = session.namespaces?.stellar;
                if (!stellarNamespace?.accounts?.length) {
                    throw ConnectError.internal('WalletConnect session established but no Stellar account was provided by the wallet.', undefined, meta.id);
                }
                const accountStr = stellarNamespace.accounts[0] ?? '';
                const parts = accountStr.split(':');
                cachedAddress = parts[parts.length - 1] ?? null; // last segment is the address
                // Try to get the network from the wallet
                try {
                    const networkResult = await wc.request({
                        topic: sessionTopic,
                        request: { method: 'stellar_getNetwork', params: {} },
                    });
                    if (networkResult?.networkPassphrase) {
                        cachedNetwork = {
                            network: networkResult.network ?? 'UNKNOWN',
                            networkPassphrase: networkResult.networkPassphrase,
                        };
                    }
                }
                catch {
                    // Wallet doesn't support stellar_getNetwork — use the configured passphrase
                    cachedNetwork = {
                        network: 'UNKNOWN',
                        networkPassphrase: opts.networkPassphrase,
                    };
                }
                // Persist the session topic for restore on reload
                if (opts.storage) {
                    await opts.storage.setItem(WC_STORAGE_KEY, JSON.stringify({
                        topic: sessionTopic,
                        address: cachedAddress,
                    }));
                }
                return { address: cachedAddress, walletId: meta.id };
            });
        },
        async disconnect() {
            if (client && sessionTopic) {
                try {
                    await client.disconnect({
                        topic: sessionTopic,
                        reason: { code: 6000, message: 'User disconnected' },
                    });
                }
                catch {
                    // Session may already be deleted — ignore
                }
            }
            sessionTopic = null;
            cachedAddress = null;
            cachedNetwork = null;
            if (opts.storage) {
                await opts.storage.removeItem(WC_STORAGE_KEY);
            }
        },
        async getAddress() {
            if (!cachedAddress) {
                throw ConnectError.invalidRequest('WalletConnect is not connected — call connect() first.', undefined, meta.id);
            }
            return { address: cachedAddress };
        },
        async getNetwork() {
            if (!cachedNetwork) {
                throw ConnectError.invalidRequest('WalletConnect is not connected — call connect() first.', undefined, meta.id);
            }
            return cachedNetwork;
        },
        async signTransaction(xdr, signOpts) {
            return withNormalizedError(meta.id, async () => {
                if (!client || !sessionTopic) {
                    throw ConnectError.invalidRequest('WalletConnect is not connected — call connect() first.', undefined, meta.id);
                }
                const result = await client.request({
                    topic: sessionTopic,
                    request: {
                        method: 'stellar_signXDR',
                        params: {
                            xdr,
                            publicKey: signOpts?.address ?? cachedAddress ?? undefined,
                            network: signOpts?.networkPassphrase ?? opts.networkPassphrase,
                        },
                    },
                });
                if (result.error) {
                    throw ConnectError.internal(`WalletConnect sign error: ${result.error}`, undefined, meta.id);
                }
                if (!result.signedXDR) {
                    throw ConnectError.internal('WalletConnect returned no signed XDR.', undefined, meta.id);
                }
                return {
                    signedTxXdr: result.signedXDR,
                    signerAddress: cachedAddress,
                };
            });
        },
        async signAuthEntry() {
            throw ConnectError.invalidRequest('WalletConnect does not support signing Soroban auth entries via the Stellar WC namespace.', undefined, meta.id);
        },
        async signMessage(message, _signOpts) {
            return withNormalizedError(meta.id, async () => {
                if (!client || !sessionTopic) {
                    throw ConnectError.invalidRequest('WalletConnect is not connected — call connect() first.', undefined, meta.id);
                }
                // Try stellar_signMessage first (not all wallets support it)
                try {
                    const result = await client.request({
                        topic: sessionTopic,
                        request: {
                            method: 'stellar_signMessage',
                            params: {
                                message,
                                publicKey: cachedAddress ?? undefined,
                            },
                        },
                    });
                    if (result.error)
                        throw new Error(result.error);
                    if (!result.signedMessage)
                        throw new Error('No signedMessage in response');
                    return {
                        signedMessage: result.signedMessage,
                        signerAddress: cachedAddress,
                        // WalletConnect wallets that support stellar_signMessage should
                        // sign the raw UTF-8 bytes of the message — same as Freighter.
                        // If they don't, the verifier's multi-candidate fallback will
                        // try SHA-256, SHA-512, etc.
                        signedData: Buffer.from(message, 'utf-8').toString('base64'),
                    };
                }
                catch (err) {
                    // If stellar_signMessage isn't supported, fall back to signing
                    // the message as a transaction (wrap it in an invokeHostFunction
                    // op). This is a last resort — not all wallets will accept it.
                    throw ConnectError.invalidRequest(`WalletConnect wallet does not support stellar_signMessage: ${err instanceof Error ? err.message : String(err)}`, undefined, meta.id);
                }
            });
        },
    };
    return connector;
}
//# sourceMappingURL=walletconnect.js.map