import type {
  WalletConnector,
  WalletMeta,
  WalletCapabilities,
  ConnectOptions,
  WalletAccount,
  GetAddressResult,
  GetNetworkResult,
  SignTxOptions,
  SignTransactionResult,
  SignOptions,
  SignAuthEntryResult,
  SignMessageResult,
  ConnectStorage,
} from '../types.js';
import { ConnectError } from '../types.js';
import { withNormalizedError } from './error-utils.js';

/**
 * WalletConnect v2 (Reown) relay adapter — the single connector that covers
 * every wallet supporting the Stellar WC namespace (Lobstr, Hana, Hot
 * Wallet, and any wallet on both mobile and desktop that isn't a browser
 * extension).
 *
 * Uses `@walletconnect/sign-client` as a bundled dependency (lazy-imported
 * so it's only loaded when the WalletConnect connector is actually used —
 * tree-shaken out otherwise).
 *
 * ## Flow
 *
 * 1. `connect()` calls `SignClient.init()` (if not already initialized),
 *    then `client.connect()` which returns a pairing URI.
 * 2. The URI is surfaced via the `onUri` callback — the app renders it
 *    as a QR code (desktop) or triggers a deep link (mobile).
 * 3. The wallet scans the QR / opens the deep link, approves the
 *    connection, and the `session_settled` event fires.
 * 4. `connect()` resolves with the wallet's address.
 * 5. `signTransaction()` sends a `stellar_signXDR` request over the
 *    WC relay and waits for the wallet's response.
 *
 * ## Session persistence
 *
 * The WC session topic is persisted via the injected `ConnectStorage`
 * (same as the session for Freighter/Albedo/xBull). On `restore()`,
 * the connector checks if the session is still active via
 * `client.session.get(topic)` and reconnects if so.
 *
 * ## Dependency
 *
 * `@walletconnect/sign-client` is a bundled dependency — installed
 * automatically with `@saganta/stellar-appkit`. No manual install needed.
 */

// Lazy SDK types — we import the SignClient dynamically to avoid forcing
// a hard dependency. The `any` types here are intentional: we don't want
// to import the WC types at compile time (they might not be installed).
type WCClient = {
  init: (opts: unknown) => Promise<WCClient>;
  connect: (opts: unknown) => Promise<{ uri: string; approval: () => Promise<unknown> }>;
  request: (opts: unknown) => Promise<unknown>;
  disconnect: (opts: unknown) => Promise<void>;
  session: {
    get: (topic: string) => unknown | undefined;
    keys: () => string[];
    delete: (topic: string, reason: unknown) => Promise<void>;
  };
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

export interface WalletConnectConnectorOptions {
  /** WalletConnect Cloud project ID — get one at cloud.walletconnect.com. */
  projectId: string;
  /** App metadata shown in the wallet's connection approval dialog. */
  metadata: { name: string; description: string; url: string; icons: string[] };
  /**
   * Called with the WC pairing URI when a new connection is initiated.
   * The app renders this as a QR code (desktop) or opens it as a deep
   * link (mobile). Required — without this, the user can't scan the
   * pairing code.
   */
  onUri: (uri: string) => void;
  /**
   * Optional storage for persisting the WC session topic across page
   * reloads. If provided, `restore()` will attempt to reconnect using
   * the saved topic. If not provided, sessions are lost on page reload.
   */
  storage?: ConnectStorage;
  /** The Stellar network passphrase to include in the session proposal. */
  networkPassphrase: string;
}

const WC_STORAGE_KEY = 'saganta-appkit:walletconnect-session';

export function createWalletConnectConnector(opts: WalletConnectConnectorOptions): WalletConnector {
  const meta: WalletMeta = {
    id: 'walletconnect',
    name: 'WalletConnect',
    icon: 'https://raw.githubusercontent.com/WalletConnect/walletconnect-assets/master/Icon/Blue%20(Default)/Icon.svg',
    supportsSep7: true,
    platforms: ['web', 'react-native', 'walletconnect'],
  };

  const capabilities: WalletCapabilities = {
    signTransaction: true,
    signAuthEntry: false, // WC Stellar namespace doesn't expose auth-entry signing
    signMessage: true,
    submit: false, // we use stellar_signXDR (sign only), not stellar_signAndSubmitXDR
  };

  let client: WCClient | null = null;
  let sessionTopic: string | null = null;
  let cachedAddress: string | null = null;
  let cachedNetwork: { network: string; networkPassphrase: string } | null = null;

  /**
   * Late-bound URI handler. The constructor-time `opts.onUri` is copied here,
   * but the modal can overwrite this at runtime (before calling connect())
   * to intercept the pairing URI and render a QR code inside the modal itself.
   *
   * This is what makes WalletConnect work inside <stellar-appkit-modal> without
   * the app having to render its own QR code — the modal sets this property
   * to its own handler, then calls connect(), and the URI flows into the
   * modal's connecting view where the QR is rendered.
   */
  let onUriHandler: ((uri: string) => void) | null = opts.onUri ?? null;

  /**
   * Lazy-imports @walletconnect/sign-client and initializes the SignClient
   * (if not already done). The client is a singleton — we only init once
   * per connector instance.
   */
  async function ensureClient(): Promise<WCClient> {
    if (client) return client;
    try {
      // @walletconnect/sign-client v2 exports SignClient as a named export
      // (mod.SignClient), NOT as the default export. The default export is
      // just a plain object, not a class — using it throws "init is not a
      // function". We check both shapes for maximum compatibility.
      const mod = await import('@walletconnect/sign-client') as unknown as {
        SignClient?: { init: (opts: unknown) => Promise<WCClient> };
        default?: { init: (opts: unknown) => Promise<WCClient> };
      };
      const SignClient = mod.SignClient ?? mod.default;
      if (!SignClient || typeof SignClient.init !== 'function') {
        throw new Error('SignClient.init is not a function — unexpected @walletconnect/sign-client export shape.');
      }
      client = await SignClient.init({
        projectId: opts.projectId,
        metadata: opts.metadata,
        relayUrl: 'wss://relay.walletconnect.com',
      });

      // Listen for session deletion (wallet disconnected from their side)
      client.on('session_delete', (...args: unknown[]) => {
        const event = args[0] as { topic?: string };
        if (event?.topic === sessionTopic) {
          sessionTopic = null;
          cachedAddress = null;
          cachedNetwork = null;
        }
      });

      return client;
    } catch (err) {
      throw ConnectError.internal(
        `Failed to initialize WalletConnect: ${err instanceof Error ? err.message : String(err)}. ` +
        'Make sure @walletconnect/sign-client is installed: npm install @walletconnect/sign-client',
        undefined,
        meta.id
      );
    }
  }

  const connector: WalletConnector = {
    id: meta.id,
    meta,
    capabilities,

    async getReachability() {
      // WalletConnect is always "available" if a projectId is configured —
      // the relay is a cloud service, not an installed extension.
      return opts.projectId ? 'available' : 'unavailable';
    },

    async connect(_connectOpts?: ConnectOptions): Promise<WalletAccount> {
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

        // Surface the URI for the app to render as a QR code or deep link.
        // Uses the late-bound handler (may have been overwritten by the modal).
        if (uri && onUriHandler) onUriHandler(uri);

        // Wait for the wallet to approve — resolves with the session object
        const session = await approval() as {
          topic: string;
          namespaces: Record<string, {
            accounts: string[];
            methods?: string[];
          }>;
        };

        sessionTopic = session.topic;

        // Extract the address from the session's namespace accounts.
        // WC account format: "stellar:<networkPassphrase>:<address>"
        const stellarNamespace = session.namespaces?.stellar;
        if (!stellarNamespace?.accounts?.length) {
          throw ConnectError.internal(
            'WalletConnect session established but no Stellar account was provided by the wallet.',
            undefined,
            meta.id
          );
        }
        const accountStr = stellarNamespace.accounts[0] ?? '';
        const parts = accountStr.split(':');
        cachedAddress = parts[parts.length - 1] ?? null; // last segment is the address

        // Try to get the network from the wallet
        try {
          const networkResult = await wc.request({
            topic: sessionTopic,
            request: { method: 'stellar_getNetwork', params: {} },
          }) as { network?: string; networkPassphrase?: string };
          if (networkResult?.networkPassphrase) {
            cachedNetwork = {
              network: networkResult.network ?? 'UNKNOWN',
              networkPassphrase: networkResult.networkPassphrase,
            };
          }
        } catch {
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

        return { address: cachedAddress!, walletId: meta.id };
      });
    },

    async disconnect() {
      if (client && sessionTopic) {
        try {
          await client.disconnect({
            topic: sessionTopic,
            reason: { code: 6000, message: 'User disconnected' },
          });
        } catch {
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

    async getAddress(): Promise<GetAddressResult> {
      if (!cachedAddress) {
        throw ConnectError.invalidRequest('WalletConnect is not connected — call connect() first.', undefined, meta.id);
      }
      return { address: cachedAddress };
    },

    async getNetwork(): Promise<GetNetworkResult> {
      if (!cachedNetwork) {
        throw ConnectError.invalidRequest('WalletConnect is not connected — call connect() first.', undefined, meta.id);
      }
      return cachedNetwork;
    },

    async signTransaction(xdr: string, signOpts?: SignTxOptions): Promise<SignTransactionResult> {
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
        }) as { signedXDR?: string; error?: string };

        if (result.error) {
          throw ConnectError.internal(`WalletConnect sign error: ${result.error}`, undefined, meta.id);
        }
        if (!result.signedXDR) {
          throw ConnectError.internal('WalletConnect returned no signed XDR.', undefined, meta.id);
        }

        return {
          signedTxXdr: result.signedXDR,
          signerAddress: cachedAddress!,
        };
      });
    },

    async signAuthEntry(): Promise<SignAuthEntryResult> {
      throw ConnectError.invalidRequest(
        'WalletConnect does not support signing Soroban auth entries via the Stellar WC namespace.',
        undefined,
        meta.id
      );
    },

    async signMessage(message: string, _signOpts?: SignOptions): Promise<SignMessageResult> {
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
          }) as { signedMessage?: string; error?: string };

          if (result.error) throw new Error(result.error);
          if (!result.signedMessage) throw new Error('No signedMessage in response');

          return {
            signedMessage: result.signedMessage,
            signerAddress: cachedAddress!,
            // WalletConnect wallets that support stellar_signMessage should
            // sign the raw UTF-8 bytes of the message — same as Freighter.
            // If they don't, the verifier's multi-candidate fallback will
            // try SHA-256, SHA-512, etc.
            signedData: Buffer.from(message, 'utf-8').toString('base64'),
          };
        } catch (err) {
          // If stellar_signMessage isn't supported, fall back to signing
          // the message as a transaction (wrap it in an invokeHostFunction
          // op). This is a last resort — not all wallets will accept it.
          throw ConnectError.invalidRequest(
            `WalletConnect wallet does not support stellar_signMessage: ${err instanceof Error ? err.message : String(err)}`,
            undefined,
            meta.id
          );
        }
      });
    },
  };

  /**
   * Late-bound URI handler setter. The modal calls this before connect()
   * to intercept the pairing URI and render a QR code inside the modal.
   *
   * This is a non-standard extension on the WalletConnect connector only —
   * other connectors don't need it because they don't use QR pairing.
   * The modal checks for its existence with `typeof connector.setOnUri === 'function'`
   * before calling it.
   */
  (connector as WalletConnector & { setOnUri?: (fn: ((uri: string) => void) | null) => void }).setOnUri = (fn: ((uri: string) => void) | null) => {
    onUriHandler = fn;
  };

  return connector;
}
