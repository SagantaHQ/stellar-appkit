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
  StellarNetwork,
} from '../types.js';
import { ConnectError, resolveNetworkPassphrase as resolveNetworkPassphraseFromNetwork } from '../types.js';
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
  /** AbortController-style cleanup — kills the WebSocket relay. */
  abort?: (reason?: unknown) => void;
  /** Core relay transport — has its own disconnect method in newer WC versions. */
  core?: {
    relay?: {
      disconnect?: () => void;
      transporter?: {
        close?: () => void;
      };
    };
  };
};

/**
 * Fatal WC relay error codes that should NOT be retried.
 * When the relay closes the socket with one of these codes, retrying
 * will just fail again — we should surface the error to the user instead.
 *
 * See: https://walletconnect.com/2.0/specs/protocol/error-codes
 */
const FATAL_RELAY_ERROR_CODES = new Set([
  3000, // Project not found — invalid projectId
  3001, // Project blocked
  3002, // Project rate limited
  3003, // Project quota exceeded
]);

/**
 * Regex to detect fatal error messages that don't carry a code, e.g.
 * "Project not found" or "Invalid project id".
 */
const FATAL_ERROR_PATTERNS = [
  /project not found/i,
  /invalid project id/i,
  /project blocked/i,
  /project rate limited/i,
  /project quota exceeded/i,
  /unauthorized/i,
];

function isFatalRelayError(error: unknown): boolean {
  if (typeof error === 'string') {
    if (FATAL_ERROR_PATTERNS.some((p) => p.test(error))) return true;
    // Also check for "code: 3000" pattern in the string
    if (/code:?\s*3000/i.test(error)) return true;
    return false;
  }
  if (error && typeof error === 'object') {
    const e = error as { code?: number; message?: string; reason?: string };
    // Check numeric code
    if (typeof e.code === 'number' && FATAL_RELAY_ERROR_CODES.has(e.code)) return true;
    // Check message string for fatal patterns
    const msg = e.message ?? e.reason ?? '';
    if (typeof msg === 'string') {
      if (FATAL_ERROR_PATTERNS.some((p) => p.test(msg))) return true;
      // Also check for "code: 3000" in the message (WC SDK puts it there)
      if (/code:?\s*3000/i.test(msg)) return true;
      // Check for "code 3000" without colon
      if (/code\s*3000/i.test(msg)) return true;
    }
  }
  return false;
}

/**
 * The connected wallet's own identity, as reported by the wallet in the
 * WalletConnect session's `peer` metadata. Lets the UI show "Freighter" /
 * "LOBSTR" / "HOT Wallet" instead of the generic "WalletConnect" label.
 */
export interface WalletConnectPeerMetadata {
  /** The wallet's display name, e.g. "Freighter". */
  name: string;
  /** The wallet's homepage, when provided. */
  url: string | null;
  /** The wallet's icon (https URL), when provided. */
  icon: string | null;
}

export interface WalletConnectConnectorOptions {
  /** WalletConnect Cloud project ID — get one at cloud.walletconnect.com. */
  projectId: string;
  /**
   * App metadata shown in the wallet's connection approval dialog.
   *
   * Optional — when omitted, derived from:
   *   - `window.location` (browser): name from hostname, url from origin
   *   - The StellarAppKit config's `appMetadata` if available
   *
   * When provided, follows the Reown/WalletConnect metadata style:
   * ```ts
   * metadata: {
   *   name: 'My App',
   *   description: 'A Stellar dApp',
   *   url: 'https://saganta.com',
   *   icons: ['https://saganta.com/icon.png'],
   * }
   * ```
   * The `url` field is also used as the `uri` in SIWS messages.
   * The `icons[0]` field is used as the signing/preview app icon.
   * The `name` field is used as the app name in the connecting view.
   */
  metadata?: { name: string; description: string; url: string; icons: string[] };
  /**
   * Called with the WC pairing URI when a new connection is initiated.
   *
   * **When using `<stellar-appkit-modal>` (recommended):** the modal
   * intercepts this automatically via `setOnUri()` and renders the QR
   * code inside the connecting view using `better-qr` — you can omit
   * this entirely.
   *
   * Defaults to a no-op (`() => {}`).
   */
  onUri?: (uri: string) => void;
  /**
   * Optional storage for persisting the WC session topic across page
   * reloads. If provided, `restore()` will attempt to reconnect using
   * the saved topic. If not provided, sessions are lost on page reload.
   */
  storage?: ConnectStorage;
  /**
   * The Stellar network passphrase to include in the session proposal.
   *
   * Optional — when omitted, derived from the `network` field passed to
   * `StellarAppKit` config (e.g. `'TESTNET'` → `Networks.TESTNET`).
   * Only required for `STANDALONE` networks (which have no built-in
   * passphrase) or when you want to override the default.
   */
  networkPassphrase?: string;
}

const WC_STORAGE_KEY = 'saganta-appkit:walletconnect-session';

export function createWalletConnectConnector(opts: WalletConnectConnectorOptions): WalletConnector {
  // App metadata injected by StellarAppKit constructor — same object as
  // appMetadata in the config (WC metadata shape). When set, used directly
  // as the WC metadata (no need for opts.metadata).
  let appkitAppMetadata: { name: string; description?: string; url?: string; icons?: string[] } | undefined;

  // Resolve metadata — priority: opts.metadata > appkitAppMetadata > window.location
  function resolveMetadata(): { name: string; description: string; url: string; icons: string[] } {
    if (opts.metadata) return opts.metadata;
    // Use the appMetadata from StellarAppKit config if available
    if (appkitAppMetadata) {
      return {
        name: appkitAppMetadata.name,
        description: appkitAppMetadata.description || `${appkitAppMetadata.name} — Stellar dApp`,
        url: appkitAppMetadata.url || 'https://example.com',
        icons: appkitAppMetadata.icons || [],
      };
    }
    // Derive from window.location
    if (typeof window !== 'undefined' && window.location) {
      const host = window.location.hostname || 'localhost';
      const origin = window.location.origin || 'http://localhost';
      return {
        name: host,
        description: `${host} — Stellar dApp`,
        url: origin,
        icons: [],
      };
    }
    // SSR fallback
    return {
      name: 'Stellar AppKit App',
      description: 'A Stellar dApp',
      url: 'https://example.com',
      icons: [],
    };
  }

  // Resolve networkPassphrase — use opts.networkPassphrase if provided,
  // otherwise derive from the Networks map based on the StellarAppKit
  // config's `network` field (injected by the constructor via appkitRef).
  let appkitNetwork: string | undefined;
  function resolveNetworkPassphrase(): string {
    if (opts.networkPassphrase) return opts.networkPassphrase;
    // Try to resolve from the appkit network (set via _setNetwork)
    if (appkitNetwork) {
      const passphrase = resolveNetworkPassphraseFromNetwork(appkitNetwork as StellarNetwork);
      if (passphrase) return passphrase;
    }
    // Fallback to TESTNET
    return 'Test SDF Network ; September 2015';
  }

  /**
   * Converts a Stellar network name to the WalletConnect chain ID format.
   * WC Stellar namespace uses `stellar:<network>` where <network> is the
   * lowercase network name: `pubnet`, `testnet`, `futurenet`.
   *
   * This is DIFFERENT from the network passphrase — the passphrase is a
   * long string like "Test SDF Network ; September 2015", but the WC chain
   * ID is just `stellar:testnet`.
   *
   * Freighter Mobile and other WC-compatible wallets reject sessions with
   * invalid chain IDs, so this mapping is critical for mobile connectivity.
   */
  function resolveWcChainId(): string {
    const network = (appkitNetwork ?? 'TESTNET').toUpperCase();
    switch (network) {
      case 'PUBLIC':
        return 'stellar:pubnet';
      case 'TESTNET':
        return 'stellar:testnet';
      case 'FUTURENET':
        return 'stellar:futurenet';
      case 'STANDALONE':
        // Standalone doesn't have a WC chain ID — fall back to testnet
        return 'stellar:testnet';
      default:
        return 'stellar:testnet';
    }
  }

  const meta: WalletMeta = {
    id: 'walletconnect',
    name: 'WalletConnect',
    // Official WalletConnect brand SVG (pre-encoded base64 for instant load)
    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAyNCIgaGVpZ2h0PSIxMDI0IiB2aWV3Qm94PSIwIDAgMTAyNCAxMDI0IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPgo8cmVjdCB3aWR0aD0iMTAyNCIgaGVpZ2h0PSIxMDI0IiBmaWxsPSIjMzM5NkZGIi8+CjxwYXRoIGQ9Ik0yODIuMjk4IDM2Ny4zOTRDNDA5Ljk4NiAyNDIuODY5IDYxNy4wMTUgMjQyLjg2OSA3NDQuNzAzIDM2Ny4zOTRMNzYwLjA3MSAzODIuMzhDNzY2LjQ1NiAzODguNjA1IDc2Ni40NTYgMzk4LjcwMSA3NjAuMDcxIDQwNC45MjZMNzA3LjUwMiA0NTYuMTkzQzcwNC4zMDkgNDU5LjMwNiA2OTkuMTM0IDQ1OS4zMDYgNjk1Ljk0MiA0NTYuMTkzTDY3NC43OTQgNDM1LjU3QzU4NS43MTMgMzQ4LjY5OCA0NDEuMjg4IDM0OC42OTggMzUyLjIwNyA0MzUuNTdMMzI5LjU1OCA0NTcuNjU1QzMyNi4zNjUgNDYwLjc2OCAzMjEuMTkxIDQ2MC43NjggMzE3Ljk5OCA0NTcuNjU1TDI2NS40MjkgNDA2LjM4OEMyNTkuMDQzIDQwMC4xNjMgMjU5LjA0MyAzOTAuMDY4IDI2NS40MjkgMzgzLjg0M0wyODIuMjk4IDM2Ny4zOTRaTTg1My40MjUgNDczLjQxOEw5MDAuMjExIDUxOS4wNDVDOTA2LjU5NiA1MjUuMjcgOTA2LjU5NiA1MzUuMzY1IDkwMC4yMTEgNTQxLjU5TDY4OS4yNDIgNzQ3LjMyOUM2ODIuODYgNzUzLjU1NyA2NzIuNTA4IDc1My41NTcgNjY2LjEyMyA3NDcuMzI5TDUxNi4zOTIgNjAxLjMxMkM1MTQuNzk1IDU5OS43NTQgNTEyLjIwOCA1OTkuNzU0IDUxMC42MTIgNjAxLjMxMkwzNjAuODgxIDc0Ny4zMjlDMzU0LjQ5OCA3NTMuNTU3IDM0NC4xNDcgNzUzLjU1NyAzMzcuNzYxIDc0Ny4zMjlMMTI2Ljc4OCA1NDEuNTg3QzEyMC40MDQgNTM1LjM2MiAxMjAuNDA0IDUyNS4yNjcgMTI2Ljc4OCA1MTkuMDQyTDE3My41NzYgNDczLjQxNUMxNzkuOTYgNDY3LjE5IDE5MC4zMTIgNDY3LjE5IDE5Ni42OTYgNDczLjQxNUwzNDYuNDMgNjE5LjQzNUMzNDguMDI2IDYyMC45OTIgMzUwLjYxMyA2MjAuOTkyIDM1Mi4yMSA2MTkuNDM1TDUwMS45MzcgNDczLjQxNUM1MDguMzIgNDY3LjE4NyA1MTguNjcyIDQ2Ny4xODcgNTI1LjA1NyA0NzMuNDE1TDY3NC43OTEgNjE5LjQzNUM2NzYuMzg3IDYyMC45OTIgNjc4Ljk3NSA2MjAuOTkyIDY4MC41NzEgNjE5LjQzNUw4MzAuMzA1IDQ3My40MThDODM2LjY4NyA0NjcuMTkgODQ3LjAzOSA0NjcuMTkgODUzLjQyNSA0NzMuNDE4WiIgZmlsbD0id2hpdGUiLz4KPC9zdmc+Cg==',
    supportsSep7: true,
    platforms: ['web', 'react-native', 'walletconnect'],
  };

  const capabilities: WalletCapabilities = {
    signTransaction: true,
    signAuthEntry: true, // Freighter Mobile + other WC wallets support stellar_signAuthEntry
    signMessage: true,
    submit: false, // we use stellar_signXDR (sign only), not stellar_signAndSubmitXDR
  };

  let client: WCClient | null = null;
  /**
   * In-flight (or resolved) `SignClient.init()` promise — memoized so that
   * concurrent callers (a background `warmUp()` racing a user-initiated
   * `connect()`) share ONE initialization instead of each evaluating the
   * `@walletconnect/sign-client` module tree and opening its own relay
   * WebSocket. Nulled on failure (so the next call retries) and by
   * `teardownClient()`.
   */
  let clientInitPromise: Promise<WCClient> | null = null;
  let sessionTopic: string | null = null;
  let cachedAddress: string | null = null;
  let cachedNetwork: { network: string; networkPassphrase: string } | null = null;
  /**
   * The methods the wallet actually approved in the settled session's
   * Stellar namespace. Newer @walletconnect/sign-client releases (>= 2.17)
   * validate every request() method against the session namespaces and log
   * ERROR-level output ("Missing or invalid. request() method: ...") before
   * throwing — so we track what the session granted and only send requests
   * it can satisfy.
   */
  let grantedMethods = new Set<string>();
  /**
   * The connected wallet's own metadata (from the WC session's `peer`),
   * captured when the session settles so the UI can show the real wallet
   * name — "Freighter", "LOBSTR", "HOT Wallet" — instead of the generic
   * "WalletConnect" connector name. Null until a session settles.
   */
  let peerMetadata: WalletConnectPeerMetadata | null = null;

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
  let onUriHandler: ((uri: string) => void) | null = opts.onUri ?? (() => {});

  /**
   * Aborts an in-flight connect() attempt. Set when the user cancels, when
   * or when a fatal relay error is detected.
   * connect() checks this after every await and bails out if set.
   */
  let connectAborted: boolean = false;
  // No connect timeout — the user can take as long as they need to scan
  // the QR and approve in their wallet. We only abort on fatal relay errors.
  /** When a fatal relay error fires, we store the message here so connect()
   *  can include it in the thrown ConnectError. */
  let fatalErrorMessage: string | null = null;

  /** Timeout for waiting for the wallet to approve the pairing — 60s. */

  /**
   * Tears down the WC client's WebSocket relay and clears the singleton.
   * Called on disconnect, on fatal error, and on connect timeout — without
   * this, the WC SDK keeps an open WebSocket that retries forever even after
   * the user has navigated away or the project ID is invalid.
   */
  function teardownClient(): void {
    if (!client) return;
    try {
      // 1. Call transportClose() on the relayer — this sets
      //    transportExplicitlyClosed=true and clears the reconnect timeout,
      //    stopping the WC SDK's auto-reconnect heartbeat from reopening
      //    the socket. This is the ONLY reliable way to stop the retry loop.
      const relayer = (client as {
        core?: { relayer?: {
          transportClose?: () => Promise<void>;
          transporter?: { close?: () => void };
          connected?: boolean;
        } };
      }).core?.relayer;

      if (typeof relayer?.transportClose === 'function') {
        // Fire and forget — we don't need to wait for this
        void relayer.transportClose();
      }
      // Also try transporter.close() as a fallback
      if (typeof relayer?.transporter?.close === 'function') {
        relayer.transporter.close();
      }

      // 2. Call client.abort() if available — fully tears down the SignClient
      if (typeof client.abort === 'function') {
        client.abort({ message: 'Connector teardown', code: 7000 });
      }
    } catch {
      // Ignore — best-effort cleanup
    }
    client = null;
    clientInitPromise = null;
    sessionTopic = null;
  }

  /**
   * Lazy-imports @walletconnect/sign-client and initializes the SignClient
   * (if not already done). The client is a singleton — we only init once
   * per connector instance. Concurrent callers await the same in-flight
   * promise (see `clientInitPromise`).
   */
  async function ensureClient(): Promise<WCClient> {
    if (client) return client;
    if (connectAborted) {
      throw ConnectError.rejected(meta.id);
    }
    if (!clientInitPromise) {
      // Reset on failure so a later connect()/warmUp() retries instead of
      // caching a rejection forever.
      clientInitPromise = initClient().catch((err) => {
        clientInitPromise = null;
        throw err;
      });
    }
    return clientInitPromise;
  }

  /** The one-shot init: dynamic import + SignClient.init + event wiring. */
  async function initClient(): Promise<WCClient> {
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
        metadata: resolveMetadata(),
        relayUrl: 'wss://relay.walletconnect.com',
      });

      // Listen for session deletion (wallet disconnected from their side)
      client.on('session_delete', (...args: unknown[]) => {
        const event = args[0] as { topic?: string };
        if (event?.topic === sessionTopic) {
          sessionTopic = null;
          cachedAddress = null;
          cachedNetwork = null;
          peerMetadata = null;
          grantedMethods = new Set();
        }
      });

      // CRITICAL: Listen for relay transport errors that are FATAL — e.g.
      // "Project not found" (code 3000) when the projectId is invalid.
      // Without this, the WC SDK keeps retrying the WebSocket connection
      // forever, flooding the console with "Fatal socket error" logs.
      // We detect fatal errors and abort the connect() attempt immediately,
      // tearing down the client so the relay socket is closed.
      //
      // The WC SDK v2 emits these events on the core relayer:
      //   - 'relayer_error' — fires with the error object
      //   - 'relayer_transport_closed' — fires when the WebSocket closes
      //
      // The "Fatal socket error" message is logged internally by the WC SDK
      // (not emitted as an event), so we can't intercept it directly — but
      // we CAN intercept the 'relayer_error' event that fires alongside it.
      const onRelayError = (...args: unknown[]) => {
        const error = args[0];
        // If we've already detected a fatal error, ignore subsequent events
        // (the WC SDK may fire multiple before the transport fully closes)
        if (connectAborted) return;

        if (isFatalRelayError(error)) {
          const msg = typeof error === 'string'
            ? error
            : (error as { message?: string })?.message ?? String(error);
          fatalErrorMessage = msg;
          // Mark the connect attempt as aborted so connect() bails out
          connectAborted = true;

          // Remove our event listeners before teardown — prevents re-entry
          // while the async transportClose() is in flight.
          try {
            client?.removeListener?.('relayer_error', onRelayError);
            client?.removeListener?.('relayer_transport_closed', onRelayError);
            client?.removeListener?.('error', onRelayError);
            const core = (client as { core?: { relayer?: { removeListener?: (e: string, h: (...a: unknown[]) => void) => void; events?: { removeListener?: (e: string, h: (...a: unknown[]) => void) => void } } } }).core;
            core?.relayer?.removeListener?.('relayer_error', onRelayError);
            core?.relayer?.removeListener?.('relayer_transport_closed', onRelayError);
            core?.relayer?.removeListener?.('error', onRelayError);
            core?.relayer?.events?.removeListener?.('relayer_error', onRelayError);
            core?.relayer?.events?.removeListener?.('relayer_transport_closed', onRelayError);
            core?.relayer?.events?.removeListener?.('error', onRelayError);
          } catch {
            // Ignore — best-effort
          }

          // Tear down the client to stop the retry loop
          teardownClient();
        }
      };

      // The 'relayer_error' event fires when the relay returns an error
      // (e.g. "Project not found"). We also catch 'relayer_transport_closed'
      // because some fatal errors close the transport before the error
      // event fires.
      client.on('relayer_error', onRelayError);
      client.on('relayer_transport_closed', onRelayError);

      // Also listen on the core relayer directly — the WC SDK emits the
      // 'relayer_error' event on client.core.relayer.events, NOT on the
      // SignClient itself. The SignClient only forwards session_* events.
      // Without this, fatal errors like "Project not found" (code 3000)
      // never reach our handler and the SDK keeps retrying forever.
      //
      // We try multiple access paths because the WC SDK version differences
      // mean the EventEmitter might be at:
      //   - client.core.relayer.on() (proxy to events.on)
      //   - client.core.relayer.events.on() (direct EventEmitter access)
      //   - client.core.relay.on() (older alias)
      const core = (client as {
        core?: {
          relayer?: {
            on?: (e: string, h: (...a: unknown[]) => void) => void;
            events?: { on?: (e: string, h: (...a: unknown[]) => void) => void };
          };
          relay?: {
            on?: (e: string, h: (...a: unknown[]) => void) => void;
            events?: { on?: (e: string, h: (...a: unknown[]) => void) => void };
          };
        };
      }).core;

      const eventTargets = [
        core?.relayer,
        core?.relayer?.events,
        core?.relay,
        core?.relay?.events,
      ].filter(Boolean) as { on?: (e: string, h: (...a: unknown[]) => void) => void }[];

      for (const target of eventTargets) {
        if (typeof target?.on === 'function') {
          target.on('relayer_error', onRelayError);
          target.on('relayer_transport_closed', onRelayError);
          // Also try 'error' (the raw provider event name)
          target.on('error', onRelayError);
        }
      }

      return client;
    } catch (err) {
      // If the error is fatal (e.g. invalid projectId), don't leave the
      // client around — tear it down so the relay socket is closed.
      if (isFatalRelayError(err)) {
        teardownClient();
      }
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

    /**
     * Pre-initializes the WalletConnect SignClient: evaluates the
     * `@walletconnect/sign-client` module tree and opens the relay WebSocket
     * so a later `connect()` starts instantly.
     *
     * Why this matters on React Native: the first `connect()` otherwise pays
     * the entire cold-start cost on the tap — Metro evaluates the WC SDK
     * module tree (hundreds of modules, seconds on a debug build, blocking
     * the JS thread) and `SignClient.init()` then awaits the relay WebSocket
     * handshake. Users perceive a multi-second dead freeze between tapping
     * a wallet and anything happening. Calling `warmUp()` at app start (or
     * when the wallet picker opens) moves all of that off the interaction.
     *
     * Errors are swallowed by design — a failed warm-up (e.g. offline) leaves
     * the connector cold, and the next `connect()` retries the init and
     * surfaces the real error to the user.
     */
    async warmUp(): Promise<void> {
      try {
        await ensureClient();
      } catch {
        // Silent by design — see doc comment above.
      }
    },

    async connect(_connectOpts?: ConnectOptions): Promise<WalletAccount> {
      return withNormalizedError(meta.id, async () => {
        // Reset abort flag at the start of each connect attempt
        connectAborted = false;
        fatalErrorMessage = null;

        const wc = await ensureClient();
        if (connectAborted) {
          throw ConnectError.invalidRequest(
            fatalErrorMessage
              ? `WalletConnect relay error: ${fatalErrorMessage}. Check your projectId at cloud.walletconnect.com.`
              : 'WalletConnect connection aborted — relay error (check your projectId).',
            undefined,
            meta.id
          );
        }

        // Create the abort promise EARLY — before wc.connect() — because
        // wc.connect() can hang if the relay is unreachable (e.g. invalid
        // projectId). The fatal error fires asynchronously during wc.connect(),
        // and without racing against the abort promise, we'd hang forever.
        const abortPromise = new Promise<never>((_, reject) => {
          const checkAbort = () => {
            if (connectAborted) {
              reject(new Error('__WC_ABORTED__'));
              return;
            }
            setTimeout(checkAbort, 200);
          };
          checkAbort();
        });

        // Helper: creates a ConnectError from the current fatalErrorMessage
        const makeAbortError = () => ConnectError.invalidRequest(
          fatalErrorMessage
            ? `WalletConnect relay error: ${fatalErrorMessage}. Check your projectId at cloud.walletconnect.com.`
            : 'WalletConnect connection aborted — relay error (check your projectId).',
          undefined,
          meta.id
        );

        // Propose a session with the Stellar namespace.
        // Race against abortPromise — if the relay fires a fatal error
        // during wc.connect() (e.g. "Project not found"), the abort promise
        // rejects first and we surface the error instead of hanging forever.
        let uri: string;
        let approval: () => Promise<unknown>;
        try {
          const result = await Promise.race([
            wc.connect({
              // NOTE: `requiredNamespaces` is deprecated in
              // @walletconnect/sign-client >= 2.17 — it prints
              // "requiredNamespaces are deprecated and are automatically
              // assigned to optionalNamespaces" and merges the two (union)
              // before proposing anyway, so we propose everything as optional
              // namespaces directly. On the wire this is identical to the
              // old required + optional split.
              //
              // The method list is the documented Stellar WalletConnect set
              // (Freighter Mobile, LOBSTR, Hana, HOT Wallet — see
              // docs.freighter.app/mobile-walletconnect):
              //   stellar_signXDR / stellar_signAndSubmitXDR /
              //   stellar_signMessage / stellar_signAuthEntry
              // plus stellar_getNetwork, which only some wallets implement.
              // Wallets approve the subset they support; we verify what made
              // it through after the session settles (below).
              optionalNamespaces: {
                stellar: {
                  chains: [resolveWcChainId()],
                  methods: [
                    'stellar_signXDR',
                    'stellar_signAndSubmitXDR',
                    'stellar_signMessage',
                    'stellar_signAuthEntry',
                    'stellar_getNetwork',
                  ],
                  events: ['accountsChanged'],
                },
              },
            }),
            abortPromise,
          ]).catch((err) => {
            if (err instanceof Error && err.message === '__WC_ABORTED__') {
              throw makeAbortError();
            }
            throw err;
          });
          uri = (result as { uri: string }).uri;
          approval = (result as { approval: () => Promise<unknown> }).approval;
        } catch (err) {
          // The connect() call itself can fail with a fatal relay error
          // (e.g. "Project not found") — detect and surface it.
          if (isFatalRelayError(err)) {
            teardownClient();
            throw ConnectError.invalidRequest(
              `WalletConnect relay error: ${err instanceof Error ? err.message : String(err)}. ` +
              'Check your projectId at cloud.walletconnect.com.',
              undefined,
              meta.id
            );
          }
          if (err instanceof ConnectError) throw err;
          throw err;
        }

        if (connectAborted) {
          throw makeAbortError();
        }

        // Surface the URI for the app to render as a QR code or deep link.
        // Uses the late-bound handler (may have been overwritten by the modal).
        if (uri && onUriHandler) onUriHandler(uri);

        // Wait for the wallet to approve — NO TIMEOUT.
        // The user may take as long as they need to scan the QR code and
        // approve in their wallet. We only abort if:
        //   1. A fatal relay error fires (e.g. invalid projectId → "Project
        //      not found", relay unreachable, etc.)
        //   2. The user cancels (connectAborted is set by the caller)
        // The abort promise rejects immediately when connectAborted becomes
        // true (checked every 200ms by the polling loop).
        const session = await Promise.race([
            approval() as Promise<{
              topic: string;
              namespaces: Record<string, {
                accounts: string[];
                methods?: string[];
              }>;
            }>,
            abortPromise,
          ]).catch((err) => {
            // If the abort promise rejected, convert to ConnectError
            if (err instanceof Error && err.message === '__WC_ABORTED__') {
              const reason = fatalErrorMessage
                ? `WalletConnect relay error: ${fatalErrorMessage}. Check your projectId at cloud.walletconnect.com.`
                : 'WalletConnect connection aborted — relay error (check your projectId).';
              throw ConnectError.invalidRequest(reason, undefined, meta.id);
            }
            throw err;
          });

          if (connectAborted) {
            const reason = fatalErrorMessage
              ? `WalletConnect relay error: ${fatalErrorMessage}. Check your projectId at cloud.walletconnect.com.`
              : 'WalletConnect connection aborted — relay error (check your projectId).';
            throw ConnectError.invalidRequest(reason, undefined, meta.id);
          }

          sessionTopic = session.topic;

          // Capture the peer wallet's metadata — the REAL wallet name and icon
          // ("Freighter", "LOBSTR", "HOT Wallet", ...), not the generic
          // "WalletConnect" label. Every WC wallet sends this on session settle;
          // the UI reads it via getSessionPeer() to brand the connecting/account
          // views after the user picked a specific wallet.
          const peer = (session as { peer?: { metadata?: { name?: string; url?: string; icons?: string[] } } }).peer?.metadata;
          if (peer?.name) {
            peerMetadata = {
              name: peer.name,
              url: peer.url || null,
              icon: peer.icons?.[0] || null,
            };
          } else {
            peerMetadata = null;
          }

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

          // Capture the methods the wallet actually approved — every request()
          // below is pre-checked against this set so we never trigger the
          // sign-client's namespace-validation errors.
          grantedMethods = new Set(stellarNamespace.methods ?? []);

          // Verify the wallet approved the base signing method.
          // signTransaction() speaks stellar_signXDR; a session without it
          // can't sign anything for us, so fail now with a clear error
          // instead of a cryptic namespace-validation error on the first
          // sign request. (Recommended by the Freighter Mobile WC docs.)
          if (!grantedMethods.has('stellar_signXDR')) {
            throw ConnectError.internal(
              'WalletConnect session established but the wallet did not approve the ' +
              `stellar_signXDR method (approved methods: ${[...grantedMethods].join(', ') || 'none'}). ` +
              'Reconnect with a wallet that supports Stellar WalletConnect signing.',
              undefined,
              meta.id
            );
          }

          // Try to get the network from the wallet — but only when the
          // settled session actually approved stellar_getNetwork. Most
          // Stellar WC wallets (Freighter Mobile included — see
          // docs.freighter.app) implement only the four signing methods, and
          // newer sign-client releases validate every request() method
          // against the session namespaces, logging ERROR + throwing
          // "Missing or invalid. request() method: stellar_getNetwork" for
          // methods that were never approved. When the method wasn't
          // approved we skip the request entirely and fall back to the
          // app's configured network — same outcome, zero error noise.
          const configuredPassphrase = resolveNetworkPassphrase();
          const configuredNetwork = appkitNetwork ?? 'TESTNET';
          const useConfiguredNetwork = () => {
            cachedNetwork = {
              network: configuredNetwork,
              networkPassphrase: configuredPassphrase,
            };
          };
          if (!grantedMethods.has('stellar_getNetwork')) {
            // Wallet didn't approve stellar_getNetwork — use the app's
            // configured network. This is the most common case.
            useConfiguredNetwork();
          } else {
            try {
              const networkResult = await wc.request({
                topic: sessionTopic,
                chainId: resolveWcChainId(),
                request: { method: 'stellar_getNetwork', params: {} },
              }) as { network?: string; networkPassphrase?: string };
              if (networkResult?.networkPassphrase) {
                cachedNetwork = {
                  network: networkResult.network ?? configuredNetwork,
                  networkPassphrase: networkResult.networkPassphrase,
                };
              } else {
                // Wallet responded but didn't include networkPassphrase
                useConfiguredNetwork();
              }
            } catch {
              // The method was approved but the round-trip failed (timeout,
              // wallet error) — fall back to the app's configured network.
              useConfiguredNetwork();
            }
          }

          // Persist the session topic for restore on reload
          if (opts.storage) {
            await opts.storage.setItem(WC_STORAGE_KEY, JSON.stringify({
              topic: sessionTopic,
              address: cachedAddress,
              peerMetadata,
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
      // Tear down the relay socket so it stops retrying.
      // Without this, the WC SDK keeps the WebSocket open and retries
      // forever even after disconnect.
      teardownClient();
      cachedAddress = null;
      cachedNetwork = null;
      peerMetadata = null;
      grantedMethods = new Set();
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
        // Pre-check the approved methods — newer sign-client releases log
        // ERROR and throw for methods the session didn't approve.
        if (!grantedMethods.has('stellar_signXDR')) {
          throw ConnectError.invalidRequest(
            'WalletConnect wallet does not support stellar_signXDR ' +
            `(approved methods: ${[...grantedMethods].join(', ') || 'none'}).`,
            undefined,
            meta.id
          );
        }
        const result = await client.request({
          topic: sessionTopic,
          chainId: resolveWcChainId(),
          request: {
            method: 'stellar_signXDR',
            params: {
              xdr,
              publicKey: signOpts?.address ?? cachedAddress ?? undefined,
              network: signOpts?.networkPassphrase ?? opts.networkPassphrase,
            },
          },
        }) as Record<string, unknown>;

        // WC errors can be objects { code, message } or strings
        if (result && typeof result === 'object' && 'error' in result) {
          const err = result.error;
          const errMsg = typeof err === 'string'
            ? err
            : (err as { message?: string })?.message ?? JSON.stringify(err);
          throw ConnectError.internal(`WalletConnect sign error: ${errMsg}`, undefined, meta.id);
        }
        const signedXDR = result.signedXDR as string | undefined;
        if (!signedXDR) {
          throw ConnectError.internal('WalletConnect returned no signed XDR.', undefined, meta.id);
        }

        return {
          signedTxXdr: signedXDR,
          signerAddress: cachedAddress!,
        };
      });
    },

    async signAuthEntry(authEntryXdr: string, signOpts?: SignOptions): Promise<SignAuthEntryResult> {
      return withNormalizedError(meta.id, async () => {
        if (!client || !sessionTopic) {
          throw ConnectError.invalidRequest('WalletConnect is not connected — call connect() first.', undefined, meta.id);
        }

        // Optional method — only call it when the session approved it, so
        // wallets without support get a clean error instead of triggering
        // the sign-client's namespace validation ERROR logs.
        if (!grantedMethods.has('stellar_signAuthEntry')) {
          throw ConnectError.invalidRequest(
            'WalletConnect wallet does not support stellar_signAuthEntry ' +
            '(this method is optional — the wallet did not approve it during pairing).',
            undefined,
            meta.id
          );
        }

        // stellar_signAuthEntry — supported by Freighter Mobile and other
        // WC-compatible Stellar wallets (SEP-43). The wallet signs the
        // SHA-256 hash of the SorobanAuthorizationEntry preimage.
        //
        // Request params: { entryXdr } — base64-encoded HashIdPreimage XDR
        // Response: { signedAuthEntry, signerAddress }
        const result = await client.request({
          topic: sessionTopic,
          chainId: resolveWcChainId(),
          request: {
            method: 'stellar_signAuthEntry',
            params: {
              entryXdr: authEntryXdr,
              publicKey: signOpts?.address ?? cachedAddress ?? undefined,
            },
          },
        }) as Record<string, unknown>;

        // WC errors can be objects { code, message } or strings
        if (result && typeof result === 'object' && 'error' in result) {
          const err = result.error;
          const errMsg = typeof err === 'string'
            ? err
            : (err as { message?: string })?.message ?? JSON.stringify(err);
          throw ConnectError.internal(`WalletConnect signAuthEntry error: ${errMsg}`, undefined, meta.id);
        }
        const signedAuthEntry = result.signedAuthEntry as string | undefined;
        if (!signedAuthEntry) {
          throw ConnectError.internal('WalletConnect returned no signed auth entry.', undefined, meta.id);
        }

        return {
          signedAuthEntry,
          signerAddress: (result.signerAddress as string) ?? cachedAddress!,
        };
      });
    },

    async signMessage(message: string, _signOpts?: SignOptions): Promise<SignMessageResult> {
      return withNormalizedError(meta.id, async () => {
        if (!client || !sessionTopic) {
          throw ConnectError.invalidRequest('WalletConnect is not connected — call connect() first.', undefined, meta.id);
        }

        // stellar_signMessage — an optional WC method (not in the Reown-published
        // spec, but supported by Freighter Mobile, Hana, Lobstr, etc.).
        //
        // Optional method — only call it when the session approved it, so
        // wallets without support get a clean error instead of triggering
        // the sign-client's namespace validation ERROR logs.
        if (!grantedMethods.has('stellar_signMessage')) {
          throw ConnectError.invalidRequest(
            'WalletConnect wallet does not support stellar_signMessage ' +
            '(this method is optional — the wallet did not approve it during pairing).',
            undefined,
            meta.id
          );
        }

        // Per SWK's implementation, params should be { message } only —
        // no publicKey field. SWK sends exactly { message: string }.
        // Response: { signature: string, signerAddress?: string }
        //
        // Some wallets (Hana/Lobstr) return { signedMessage } instead of
        // { signature } — we check both field names.
        try {
          const result = await client.request({
            topic: sessionTopic,
            chainId: resolveWcChainId(),
            request: {
              method: 'stellar_signMessage',
              params: {
                message,
              },
            },
          }) as Record<string, unknown>;

          // WC errors can be objects { code, message } or strings — handle both
          if (result && typeof result === 'object' && 'error' in result) {
            const err = result.error;
            const errMsg = typeof err === 'string'
              ? err
              : (err as { message?: string })?.message
                ? (err as { message: string }).message
                : JSON.stringify(err);
            throw new Error(errMsg);
          }

          // Check all known response field names
          const signature =
            (result.signature as string) ??
            (result.signedMessage as string) ??
            (result.signedMsg as string) ??
            (result.sig as string);
          if (!signature) {
            throw new Error(
              `No signature in response. Response keys: ${Object.keys(result).join(', ')}`
            );
          }

          return {
            signedMessage: signature,
            signerAddress: cachedAddress!,
            // WalletConnect wallets that support stellar_signMessage should
            // sign the raw UTF-8 bytes of the message — same as Freighter.
            // If they don't, the verifier's multi-candidate fallback will
            // try SHA-256, SHA-512, etc.
            signedData: Buffer.from(message, 'utf-8').toString('base64'),
          };
        } catch (err) {
          // Parse the error properly — WC SDK throws objects, not just Errors
          let errMsg: string;
          if (err instanceof Error) {
            errMsg = err.message;
          } else if (typeof err === 'string') {
            errMsg = err;
          } else if (err && typeof err === 'object') {
            const e = err as { message?: string; reason?: string; code?: number };
            errMsg = e.message ?? e.reason ?? `WC error (code: ${e.code ?? 'unknown'})`;
          } else {
            errMsg = String(err);
          }

          // Distinguish between "method not supported" (WC protocol error)
          // and "wallet rejected the request" (user declined, domain
          // mismatch, etc). Don't say "does not support" if the wallet
          // actually processed the request but rejected it.
          const isMethodNotSupported =
            errMsg.toLowerCase().includes('method not found') ||
            errMsg.toLowerCase().includes('not supported') ||
            errMsg.toLowerCase().includes('not approved') === false &&
            (errMsg.toLowerCase().includes('missing') && errMsg.toLowerCase().includes('method'));

          if (isMethodNotSupported) {
            throw ConnectError.invalidRequest(
              `WalletConnect wallet does not support stellar_signMessage (this method is optional — the wallet may not implement it). Error: ${errMsg}`,
              undefined,
              meta.id
            );
          } else {
            // The wallet DOES support stellar_signMessage but rejected the
            // request (user declined, untrusted domain, network mismatch, etc.)
            throw ConnectError.internal(
              `WalletConnect signMessage rejected: ${errMsg}`,
              undefined,
              meta.id
            );
          }
        }
      });
    },

    /**
     * The connected wallet's own metadata (name/icon from the WC session's
     * `peer`), when a session is settled. Lets UIs show the real wallet name
     * — "Freighter", "LOBSTR", "HOT Wallet" — instead of the generic
     * "WalletConnect" connector label. Returns null when not connected or
     * when the wallet didn't send peer metadata.
     */
    getSessionPeer(): WalletConnectPeerMetadata | null {
      return peerMetadata;
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

  /**
   * Internal method called by StellarAppKit constructor to inject the
   * network (e.g. 'TESTNET') so the connector can resolve the passphrase
   * via Networks map when networkPassphrase is not explicitly provided.
   */
  (connector as WalletConnector & { _setNetwork?: (network: string) => void })._setNetwork = (network: string) => {
    appkitNetwork = network;
  };

  /**
   * Internal method called by StellarAppKit constructor to inject the
   * appMetadata (WC metadata shape) so the connector can use it directly
   * as the WC metadata when opts.metadata is not provided.
   */
  (connector as WalletConnector & { _setAppMetadata?: (meta: { name: string; description?: string; url?: string; icons?: string[] }) => void })._setAppMetadata = (meta: { name: string; description?: string; url?: string; icons?: string[] }) => {
    appkitAppMetadata = meta;
  };

  return connector;
}
