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
 * (same as the session for Freighter/Albedo/xBull). On a cold connector,
 * `getAddress()`/`getNetwork()` lazily rehydrate: the persisted topic is
 * checked against the SignClient's own session store
 * (`client.session.get(topic)` — persisted by the SDK in localStorage on
 * web / AsyncStorage via @walletconnect/react-native-compat on RN), and a
 * session that still exists re-arms the connector in place (topic, address,
 * peer metadata, approved methods). A session the wallet deleted (or that
 * expired) clears the persisted record and reports not-connected.
 * StellarAppKit.restore() drives this — it validates persisted sessions
 * through getAddress().
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

/**
 * Classifies a WalletConnect failure into the three kinds app/UI code can
 * actually react to.
 *
 * WHY THIS EXISTS: the WC SDK surfaces every wallet-side outcome as a raw
 * thrown object — Lobstr rejects a sign request with
 * `{ message: "Transaction cancelled by the user" }`, the SDK's own
 * delayed-promise rejects after the 5-minute TTL with
 * `Error("Request expired. Please try again.")`, and namespace-validation
 * failures throw "Missing or invalid. request() method: …". Before this
 * classifier all of those collapsed into either a generic
 * "The user rejected this request." (discarding the wallet's own words) or
 * an opaque internal error — while the raw messages only showed up as
 * ERROR-level SDK console noise, which made the library look like it was
 * ignoring WalletConnect entirely.
 */
export type WalletConnectErrorKind =
  | 'user-rejected' // the wallet (user) declined / cancelled the request
  | 'request-expired' // the WC 5-minute request TTL lapsed with no answer
  | 'other'; // relay, namespace validation, SDK internals, …

/** Robustly extracts a human message from the shapes the WC SDK throws. */
export function walletConnectErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; reason?: unknown; error?: { message?: unknown } | string };
    if (typeof e.message === 'string' && e.message) return e.message;
    if (typeof e.reason === 'string' && e.reason) return e.reason;
    if (typeof e.error === 'string') return e.error;
    if (e.error && typeof e.error === 'object' && typeof e.error.message === 'string') return e.error.message;
    try {
      return JSON.stringify(err);
    } catch {
      return 'Unknown WalletConnect error';
    }
  }
  return String(err);
}

/** Wallet-speak for "the user said no" across the ecosystem's wallets. */
const USER_REJECTION_PATTERNS = [
  /cancel/i,
  /reject/i,
  /denied/i,
  /declined/i,
  /dismissed/i,
  /user (?:said )?no/i,
];

/** The SDK's expiry phrasings — the delayed-promise timeout and the expirer. */
const REQUEST_EXPIRY_PATTERNS = [
  /request expired/i,
  /expired\.? try again/i,
  /expired request/i,
  /session (?:proposal |request )?expired/i,
];

/**
 * Classifies a WalletConnect error/rejection. Pure — safe to unit-test and
 * to call from any path (never throws, never touches SDK state).
 */
export function classifyWalletConnectError(err: unknown): {
  kind: WalletConnectErrorKind;
  message: string;
} {
  const message = walletConnectErrorMessage(err);
  if (REQUEST_EXPIRY_PATTERNS.some((p) => p.test(message))) {
    return { kind: 'request-expired', message };
  }
  if (USER_REJECTION_PATTERNS.some((p) => p.test(message))) {
    return { kind: 'user-rejected', message };
  }
  return { kind: 'other', message };
}

/**
 * Maps a classified WC failure to the ConnectError the app/UI sees — the
 * single place where "what happened" becomes "what the user reads".
 *
 * - user-rejected → code -4 with the WALLET'S OWN message preserved
 *   ("Transaction cancelled by the user" beats a generic "user rejected"
 *   — it's what the wallet actually told the user).
 * - request-expired → a plain-language explanation that the 5-minute WC
 *   window lapsed, not a scary internal error.
 * - anything else → internal error carrying the raw message.
 */
function wcErrorToConnectError(err: unknown, walletId: string): ConnectError {
  const { kind, message } = classifyWalletConnectError(err);
  if (kind === 'user-rejected') {
    return new ConnectError({
      message: message || 'The user rejected this request in the wallet.',
      code: -4,
      walletId,
    });
  }
  if (kind === 'request-expired') {
    return new ConnectError({
      message:
        'Request expired — the wallet did not respond within WalletConnect\u2019s ' +
        '5-minute window. Open the wallet, then try again.',
      code: -1,
      walletId,
    });
  }
  return ConnectError.internal(message || 'Unknown WalletConnect error', undefined, walletId);
}

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
  /**
   * The wallet's own declared deep links (WalletConnect `redirect`
   * metadata) — `native` is a custom scheme that re-opens the WALLET app,
   * `universal` its https fallback. Mobile UIs use these to hand off to
   * the wallet for a pending sign request (and back) without knowing the
   * wallet's scheme a priori — the session itself carries it.
   *
   * Null/absent when the wallet didn't declare redirects (desktop wallets,
   * older wallets) or before a session settles. Persisted alongside the
   * rest of the peer record so a cold-restarted app can still hand off.
   */
  redirect?: { native: string | null; universal: string | null } | null;
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
   *   redirect: { native: 'myapp://', universal: 'https://myapp.com' },
   * }
   * ```
   * The `url` field is also used as the `uri` in SIWS messages.
   * The `icons[0]` field is used as the signing/preview app icon.
   * The `name` field is used as the app name in the connecting view.
   *
   * The `redirect` field (WalletConnect metadata standard) tells cooperating
   * mobile wallets which deep link re-opens THIS app — the wallet opens it
   * after the user approves/rejects, backgrounding itself and returning
   * focus to the dapp. Ignored by wallets that don't support it.
   */
  metadata?: { name: string; description: string; url: string; icons: string[]; redirect?: { native?: string; universal?: string } };
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
  /**
   * WalletConnect SDK logger level — passed straight to
   * `SignClient.init({ logger })`.
   *
   * The WC SDK logs its internal chatter (stale relay deliveries, pairing
   * cleanups, request expiries) at ERROR level through pino, so on React
   * Native terminals those lines show up as
   * `{"level": 50, "msg": "No matching key. proposal: …"}` even when
   * nothing is wrong from the app's perspective. Set `'silent'` to hide
   * ALL SDK console output (including genuine relay errors — everything
   * that matters to the flow is still surfaced as typed ConnectErrors),
   * `'error'` to keep the default, `'warn'`/`'info'`/`'debug'`/`'trace'`
   * for progressively noisier diagnostics.
   *
   * Optional — when omitted, the SDK default applies.
   */
  logger?: 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
}

const WC_STORAGE_KEY = 'saganta-appkit:walletconnect-session';

export function createWalletConnectConnector(opts: WalletConnectConnectorOptions): WalletConnector {
  // App metadata injected by StellarAppKit constructor — same object as
  // appMetadata in the config (WC metadata shape). When set, used directly
  // as the WC metadata (no need for opts.metadata).
  let appkitAppMetadata: {
    name: string;
    description?: string;
    url?: string;
    icons?: string[];
    redirect?: { native?: string; universal?: string };
  } | undefined;

  // Resolve metadata — priority: opts.metadata > appkitAppMetadata > window.location
  function resolveMetadata(): {
    name: string;
    description: string;
    url: string;
    icons: string[];
    redirect?: { native?: string; universal?: string };
  } {
    if (opts.metadata) return opts.metadata;
    // Use the appMetadata from StellarAppKit config if available
    if (appkitAppMetadata) {
      return {
        name: appkitAppMetadata.name,
        description: appkitAppMetadata.description || `${appkitAppMetadata.name} — Stellar dApp`,
        url: appkitAppMetadata.url || 'https://example.com',
        icons: appkitAppMetadata.icons || [],
        ...(appkitAppMetadata.redirect ? { redirect: appkitAppMetadata.redirect } : {}),
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
   * Late-bound wallet-initiated-disconnect handler — fires when the WALLET
   * kills the session from its side (`session_delete` delivered over the
   * relay, or `session_expire` when the ~7-day TTL lapses), as opposed to
   * disconnect(), which is the app asking the wallet to leave.
   *
   * StellarAppKit's constructor wires this automatically: the callback
   * reconciles the client's session map, drops the persisted session,
   * emits `disconnect` + `sessionsChanged`, and flips the status — so a
   * wallet-side disconnect is reflected everywhere (modal views, hooks,
   * persisted storage) exactly like an app-initiated one. Without it the
   * connector only cleared its OWN state: the client kept serving a dead
   * session (status 'connected', account view up) until the next sign
   * blew up with "call connect() first".
   *
   * NOT fired for self-initiated disconnects — the SDK echoes our own
   * `session_delete` back through this handler, and the client's
   * disconnect() path already emits its own events (a second callback
   * here would double-fire them).
   */
  let onSessionInvalidatedHandler: (() => void) | null = null;

  /**
   * Late-bound sign-request dispatch handler — fires at the exact moment a
   * SIGN request leaves for the relay (`stellar_signXDR` /
   * `stellar_signAuthEntry` / `stellar_signMessage`), AFTER the connector's
   * connected + approved-method pre-checks passed and therefore only when
   * the request is genuinely going out on the wire.
   *
   * This is the mobile auto-open hook (MWA-style handoff): by the time it
   * fires, the app-side preview gate has ALREADY been passed — the user
   * tapped Sign/Approve in the app's preview modal — so opening the paired
   * wallet app now lands the user straight in the wallet's pending prompt
   * with the request actually waiting. The previous trigger (the client's
   * signQueueChange / pendingSignCount increase) fired the moment the app
   * CALLED signTransaction(), i.e. BEFORE the preview consent — the wallet
   * opened with nothing to approve while the user was still reading the
   * preview in the app.
   *
   * The host callback is guarded: a throwing handler must never break the
   * request path itself. NOT fired for connect-time requests
   * (stellar_getNetwork) — those drive their own deep link via setOnUri.
   */
  let onSignRequestDispatchHandler: ((info: { method: string }) => void) | null = null;

  /** Fire the dispatch handler (best-effort — see doc above). */
  const notifySignDispatch = (method: string): void => {
    if (!onSignRequestDispatchHandler) return;
    try {
      onSignRequestDispatchHandler({ method });
    } catch {
      // Host callback failure must never break the sign request itself.
    }
  };

  /**
   * True while THIS side is disconnecting (connector.disconnect()) — the
   * SDK emits `session_delete` locally for our own deletion, and that echo
   * must not be reported as a wallet-initiated invalidation.
   */
  let selfDisconnecting = false;

  /**
   * Aborts an in-flight connect() attempt. Set when the user cancels
   * (abort() — the modal's back arrow) or when a fatal relay error is
   * detected. connect() checks this after every await and bails out.
   */
  let connectAborted: boolean = false;
  /**
   * Why an in-flight connect() was aborted — 'user' (the app called
   * abort(), e.g. the modal's back arrow) vs 'fatal' (a fatal relay error
   * like an invalid projectId). connect() maps each to a DIFFERENT error:
   * a user cancel is a clean code -4 rejection, a fatal relay error stays
   * an invalidRequest with the relay's message.
   */
  let abortReason: 'user' | 'fatal' | null = null;
  /**
   * When a fatal relay error fires, we store the message here so connect()
   * can include it in the thrown ConnectError.
   */
  let fatalErrorMessage: string | null = null;

  /**
   * True while a connect()'s pairing is waiting for the wallet to approve.
   * refreshTransport() checks this: a foregrounding app must restart the
   * relay while the approval wait is live (the wallet may have settled the
   * session while we were suspended), not just when a session already
   * exists.
   */
  let connectInFlight = false;

  /**
   * The pairing topic of the CURRENT connect() attempt, parsed from the
   * `wc:<topic>@2?…` URI. Tracked so a failed/abandoned attempt can
   * disconnect the pairing — see cleanupAbandonedPairing().
   */
  let activePairingTopic: string | null = null;

  /**
   * Disconnects the current connect attempt's pairing, best-effort.
   *
   * WHY THIS MATTERS — the ghost-pairing cascade. Before this cleanup, an
   * abandoned connect() left its pairing alive: the modal's back arrow
   * just reset the UI and "kept the promise running". The user then
   * retried, a NEW pairing+proposal went out, and when the wallet finally
   * answered the OLD proposal, its messages arrived for a topic/record
   * this side had already discarded. The SDK logged the whole cascade at
   * ERROR level —
   *   "No matching key. proposal: <id>"          (crypto keychain miss)
   *   "onRelayMessage() -> failed to process…"   (the decrypt failure)
   *   "Pending session not found for topic …"    (the orphaned settle)
   * — while the NEW proposal never got answered and eventually died with
   * "Request expired. Please try again."
   *
   * `signClient.disconnect({ topic: <pairing> })` deletes the pairing on
   * BOTH sides (it sends wc_pairingDelete to the wallet, which also
   * dismisses the wallet's still-pending approval prompt) and
   * unsubscribes the topic, so late approvals die at the relay instead of
   * crashing against a missing key here.
   *
   * Fire-and-forget by design: never awaited by callers (a dead relay
   * must not stall the error path), never throws.
   */
  function cleanupAbandonedPairing(): void {
    const topic = activePairingTopic;
    activePairingTopic = null;
    if (!topic || !client) return;
    try {
      void client
        .disconnect({ topic, reason: { code: 6000, message: 'User disconnected' } })
        .catch(() => undefined);
    } catch {
      // Best-effort — a cleanup must never mask the real error.
    }
  }

  /** Parses the pairing topic out of a `wc:<topic>@2?…` pairing URI. */
  function pairingTopicFromUri(uri: string): string | null {
    const m = /^wc:([0-9a-f]+)@/i.exec(uri);
    return m?.[1] ?? null;
  }

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

  /**
   * In-flight (or settled) cold-start rehydration — memoized so concurrent
   * getAddress()/getNetwork() calls (StellarAppKit.restore() can fire both)
   * share ONE rehydration instead of racing each other. Nulled when it
   * settles so a failed attempt can retry later.
   */
  let rehydratePromise: Promise<void> | null = null;

  /**
   * Rehydrates a persisted WC session on a cold connector — the read half
   * of the `WC_STORAGE_KEY` persistence connect() writes.
   *
   * WHY THIS IS LAZY (and not a restore() method): StellarAppKit.restore()
   * validates every persisted session through `connector.getAddress()` —
   * there is no connector-level restore hook. So getAddress()/getNetwork()
   * call this when their cached state is empty, BEFORE deciding they're not
   * connected. On success the connector is fully usable again (sign
   * requests, peer metadata, approved methods); StellarAppKit.restore()
   * then keeps the session it already has on file.
   *
   * What makes it SAFE:
   * - Storage first, SDK second: without a persisted topic this returns
   *   without ever paying the SignClient init (the multi-second RN
   * cold-start stays a warmUp()/connect()-only cost).
   * - The SDK's own session store decides liveness: `session.get(topic)`
   *   returns the session only if it still exists (the WC SDK persists its
   *   store — localStorage on web, AsyncStorage via
   *   @walletconnect/react-native-compat on RN — and expires sessions
   *   server-side after ~7 days). A missing session clears our persisted
   *   key and returns: the caller throws its normal "not connected".
   * - Best-effort by design — any error just leaves the connector cold.
   */
  async function restoreFromStorage(): Promise<void> {
    if (cachedAddress) return; // already live (or rehydrated)
    if (!opts.storage) return; // never persisted — nothing to restore
    if (!rehydratePromise) {
      rehydratePromise = (async () => {
        let raw: string | null;
        try {
          raw = await opts.storage!.getItem(WC_STORAGE_KEY);
        } catch {
          return; // storage unavailable — stay cold
        }
        if (!raw) return;

        let saved: {
          topic?: string;
          address?: string;
          peerMetadata?: WalletConnectPeerMetadata | null;
        };
        try {
          saved = JSON.parse(raw);
        } catch {
          try { await opts.storage!.removeItem(WC_STORAGE_KEY); } catch { /* best-effort */ }
          return; // corrupt record — drop it
        }
        if (!saved.topic || !saved.address) return;

        try {
          // The SDK init is the expensive part — only paid when a persisted
          // session actually exists (see doc). Shares the memoized
          // clientInitPromise with warmUp()/connect().
          const wc = await ensureClient();

          const session = wc.session.get(saved.topic) as {
            topic?: string;
            expiry?: number;
            namespaces?: { stellar?: { accounts?: string[]; methods?: string[] } };
            peer?: { metadata?: { name?: string; url?: string; icons?: string[]; redirect?: { native?: string; universal?: string } } };
          } | undefined;

          // Expired-on-paper sessions get the same treatment as deleted
          // ones: the SDK's expirer usually prunes them from the store, but
          // a device that was offline past the ~7-day TTL can still hold
          // the record — rehydrating it would hand the app a session the
          // relay refuses the moment it's used.
          const expired = typeof session?.expiry === 'number' && session.expiry > 0 && session.expiry * 1000 < Date.now();

          if (!session || session.topic !== saved.topic || expired) {
            // Wallet deleted the session / it expired — drop our record so
            // the next restore doesn't repeat this lookup.
            try { await opts.storage!.removeItem(WC_STORAGE_KEY); } catch { /* best-effort */ }
            return;
          }

          sessionTopic = saved.topic;
          cachedAddress = saved.address;

          // Peer metadata: prefer our stored copy, fall back to the SDK's.
          if (saved.peerMetadata?.name) {
            peerMetadata = saved.peerMetadata;
          } else {
            const peer = session.peer?.metadata;
            peerMetadata = peer?.name
              ? {
                  name: peer.name,
                  url: peer.url || null,
                  icon: peer.icons?.[0] || null,
                  redirect: peer.redirect
                    ? { native: peer.redirect.native ?? null, universal: peer.redirect.universal ?? null }
                    : null,
                }
              : null;
          }

          grantedMethods = new Set(session.namespaces?.stellar?.methods ?? []);

          // Network: the wallet reported it at settle time, but that answer
          // wasn't persisted — adopt the app's configured network, exactly
          // like connect() does when the wallet didn't approve
          // stellar_getNetwork.
          cachedNetwork = {
            network: appkitNetwork ?? 'TESTNET',
            networkPassphrase: resolveNetworkPassphrase(),
          };
        } catch {
          // Init failed (offline, bad projectId, …) — leave the record in
          // place; a later call retries the rehydration.
        }
      })().finally(() => {
        rehydratePromise = null;
      });
    }
    await rehydratePromise;
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
        ...(opts.logger ? { logger: opts.logger } : {}),
      });

      // Listen for the wallet deleting / expiring the session from ITS side.
      // Clears EVERYTHING the connector knows about the session — including
      // the persisted record, so a cold restart doesn't try to rehydrate a
      // session the wallet already killed. Without the storage removal the
      // record lingered until the next rehydration attempt noticed the SDK
      // store no longer had the topic.
      //
      // It also notifies the host via onSessionInvalidatedHandler so
      // StellarAppKit can reconcile its OWN session map (drop the session,
      // emit disconnect/sessionsChanged, flip the status) — the user
      // disconnecting inside the wallet must disconnect the library too,
      // not just this connector's private state. Skipped while
      // selfDisconnecting: our disconnect() already drives the client-side
      // teardown, and the SDK's local echo of our own deletion must not
      // double-fire those events.
      const handleSessionInvalidated = (...args: unknown[]) => {
        const event = args[0] as { topic?: string };
        if (event?.topic === sessionTopic) {
          sessionTopic = null;
          cachedAddress = null;
          cachedNetwork = null;
          peerMetadata = null;
          grantedMethods = new Set();
          if (opts.storage) {
            void Promise.resolve(opts.storage.removeItem(WC_STORAGE_KEY)).catch(() => undefined);
          }
          if (!selfDisconnecting && onSessionInvalidatedHandler) {
            try {
              onSessionInvalidatedHandler();
            } catch {
              // Host callback failure must never break the cleanup above.
            }
          }
        }
      };
      // session_delete — the wallet explicitly disconnected (or echoed our
      // own deletion; the flag above sorts those apart).
      client.on('session_delete', handleSessionInvalidated);
      // session_expire — the ~7-day session TTL lapsed while we weren't
      // looking. Same reconciliation: the session is equally gone.
      client.on('session_expire', handleSessionInvalidated);

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
          abortReason = 'fatal';

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

    /**
     * Forces a relay transport restart: disconnect the socket, reconnect,
     * resubscribe every stored topic. The relay (IRN) keeps messages queued
     * for subscribed topics (~24h TTL), so a restart re-delivers anything
     * published while the connection was dead.
     *
     * WHY THIS EXISTS — the React Native zombie socket. The moment a wallet
     * deep link fires (connect pairing or a sign request handoff), the OS
     * backgrounds this app and kills or zombifies the relay WebSocket. The
     * WC SDK's own recovery paths never fire on RN:
     *
     *   - its ping watchdog only starts under Node
     *     (`typeof process.versions.node === 'string'` — false on Hermes),
     *   - its online/offline listener depends on `navigator.onLine` /
     *     `global.NetInfo`, neither of which exists on a bare RN runtime,
     *   - and RN's WebSocket doesn't always surface the OS-level socket
     *     death, so the JS object can keep reporting readyState OPEN while
     *     the TCP connection is long gone.
     *
     * The wallet then approves in its own app, the relay queues
     * `session_settle` (or the sign response) for the pairing topic, and
     * nothing delivers it: `approval()` hangs forever and the modal stays on
     * "Continue in {wallet}" with a spinner — even though the wallet side
     * shows a successful connection.
     *
     * The fix is driven from the outside: the RN modal (or a headless app
     * via `attachWalletConnectForegroundRefresh()`) calls this on every
     * AppState 'active'. `restartTransport()` is the SDK's own
     * disconnect→reconnect→resubscribe path; on reconnect the subscriber
     * batch-subscribes all stored topics and the relay re-delivers the
     * queued message, which resolves the in-flight approval()/request().
     *
     * Fire-and-forget by design: never throws, never initializes a cold
     * client (a warm-up is a separate concern), and no-ops when nothing
     * relay-related is live — an idle connector has nothing to resubscribe
     * (transportOpen is even a no-op without topics).
     */
    refreshTransport(): void {
      // No client yet (or torn down) — nothing to refresh. Deliberately do
      // NOT ensureClient() here: a cold connector has no subscriptions, so
      // a restart would be a pure cost.
      if (!client) return;
      // Nothing WalletConnect-related in flight: no pairing approval wait,
      // no live session (and therefore no sign requests either). Skip —
      // restarting here would only churn a healthy socket for nothing.
      if (!connectInFlight && !sessionTopic) return;

      const relayer = (client as {
        core?: {
          relayer?: {
            restartTransport?: () => Promise<void>;
            transportDisconnect?: () => Promise<void>;
            transportOpen?: () => Promise<void>;
          };
        };
      }).core?.relayer;
      if (!relayer) return;

      try {
        if (typeof relayer.restartTransport === 'function') {
          // The SDK's own restart path — confirmOnlineStateOrThrow (a no-op
          // on RN without global.NetInfo) → resetTransport → transportOpen →
          // subscriber.start() resubscribes everything. Its rejections are
          // expected under transient offline foregrounds — swallow them; the
          // SDK's internal reconnect machinery keeps retrying either way.
          void relayer.restartTransport().catch(() => undefined);
          return;
        }
        // Older SDK without restartTransport: manual equivalent. The two
        // hops are sequenced (not parallel) on purpose — transportOpen()
        // connects AND resubscribes; firing it before the old socket is
        // closed would race two providers on one subscriber set.
        void (async () => {
          try {
            await relayer.transportDisconnect?.();
            await relayer.transportOpen?.();
          } catch {
            // Best-effort — the SDK retries on its own schedules.
          }
        })();
      } catch {
        // Never let a liveness nudge become a user-visible error.
      }
    },

    async connect(_connectOpts?: ConnectOptions): Promise<WalletAccount> {
      // connectInFlight gates refreshTransport(): while a pairing approval
      // wait is live, a foregrounding app must restart the relay even though
      // no session exists yet (see refreshTransport).
      connectInFlight = true;
      // Retires the abort-poll loop below when this attempt settles — the
      // inner callback closes over this flag.
      let stopAbortPoll = false;
      try {
        return await withNormalizedError(meta.id, async () => {
        // Reset abort flag at the start of each connect attempt
        connectAborted = false;
        abortReason = null;
        fatalErrorMessage = null;

        // Helper: builds the ConnectError for the CURRENT abort state —
        // a user cancel is a clean code -4 rejection (the modal suppresses
        // the follow-up error event), a fatal relay error keeps the
        // invalidRequest shape with the relay's own message.
        const makeAbortError = () =>
          abortReason === 'user'
            ? new ConnectError({
                message: 'Connection cancelled by the user.',
                code: -4,
                walletId: meta.id,
              })
            : ConnectError.invalidRequest(
                fatalErrorMessage
                  ? `WalletConnect relay error: ${fatalErrorMessage}. Check your projectId at cloud.walletconnect.com.`
                  : 'WalletConnect connection aborted — relay error (check your projectId).',
                undefined,
                meta.id
              );

        const wc = await ensureClient();
        if (connectAborted) {
          throw makeAbortError();
        }

        // Create the abort promise EARLY — before wc.connect() — because
        // wc.connect() can hang if the relay is unreachable (e.g. invalid
        // projectId). The fatal error fires asynchronously during wc.connect(),
        // and without racing against the abort promise, we'd hang forever.
        //
        // The poll stops via stopAbortPoll (connect()-scoped) once the
        // attempt settles either way — without it the loop reschedules
        // itself forever, leaking one immortal timer per connect() (on RN
        // that's a 200ms wakeup for the rest of the app's life, per attempt).
        const abortPromise = new Promise<never>((_, reject) => {
          const checkAbort = () => {
            if (connectAborted) {
              reject(new Error('__WC_ABORTED__'));
              return;
            }
            if (stopAbortPoll) return;
            setTimeout(checkAbort, 200);
          };
          checkAbort();
        });

        // Helper: creates a ConnectError from the current abort state
        // (see makeAbortError above — reason-aware).

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
          // Track this attempt's pairing so ANY failure below can disconnect
          // it (see cleanupAbandonedPairing) — leaving it alive is what
          // produces the SDK's "No matching key. proposal: …" cascade when
          // the wallet eventually answers an abandoned proposal.
          activePairingTopic =
            (result as { pairingTopic?: string }).pairingTopic ??
            (uri ? pairingTopicFromUri(uri) : null);
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

        // Wait for the wallet to approve — NO TIMEOUT of our own.
        // The user may take as long as they need to scan the QR code and
        // approve in their wallet. The SDK's own delayed promise still
        // rejects after the 5-minute proposal TTL ("Request expired…"),
        // and we abort early if:
        //   1. A fatal relay error fires (e.g. invalid projectId → "Project
        //      not found", relay unreachable, etc.)
        //   2. The user cancels (abort() sets connectAborted)
        // The abort promise rejects immediately when connectAborted becomes
        // true (checked every 200ms by the polling loop).
        //
        // Rejections are CLASSIFIED (wcErrorToConnectError): a wallet-side
        // rejection ("User rejected the proposal") becomes a code -4 with
        // the wallet's own message, and the SDK's expiry becomes a plain
        // "Request expired" explanation instead of raw SDK-speak.
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
              throw makeAbortError();
            }
            throw wcErrorToConnectError(err, meta.id);
          });

          if (connectAborted) {
            throw makeAbortError();
          }

          sessionTopic = session.topic;

          // Capture the peer wallet's metadata — the REAL wallet name and icon
          // ("Freighter", "LOBSTR", "HOT Wallet", ...), not the generic
          // "WalletConnect" label. Every WC wallet sends this on session settle;
          // the UI reads it via getSessionPeer() to brand the connecting/account
          // views after the user picked a specific wallet. The peer's own
          // `redirect` deep links ride along so a later sign handoff can
          // re-open the wallet app even after a cold restart.
          const peer = (session as { peer?: { metadata?: { name?: string; url?: string; icons?: string[]; redirect?: { native?: string; universal?: string } } } }).peer?.metadata;
          if (peer?.name) {
            peerMetadata = {
              name: peer.name,
              url: peer.url || null,
              icon: peer.icons?.[0] || null,
              redirect: peer.redirect
                ? { native: peer.redirect.native ?? null, universal: peer.redirect.universal ?? null }
                : null,
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

          // The pairing carries the settled session now — it must NOT be
          // disconnected by a later cleanup; only failed attempts abandon it.
          activePairingTopic = null;

          return { address: cachedAddress!, walletId: meta.id };
        });
      } catch (err) {
        // The attempt failed — abandon its pairing so a late wallet
        // approval lands on a disconnected topic instead of producing the
        // SDK's "No matching key. proposal: …" cascade (see
        // cleanupAbandonedPairing). (User-initiated aborts already
        // disconnected it in abort(); the second call is a no-op.)
        cleanupAbandonedPairing();
        throw err;
      } finally {
        stopAbortPoll = true;
        connectInFlight = false;
      }
    },

    /**
     * Cancels an in-flight connect() — the user backed out of the
     * connecting view (modal back arrow / sheet close) or the app wants to
     * give up on the pairing.
     *
     * What this does that a plain UI reset doesn't:
     * 1. connect() rejects promptly with a code -4 "cancelled" ConnectError
     *    (within one 200ms abort-poll tick) — instead of the promise
     *    floating for the SDK's full 5-minute proposal TTL and THEN throwing
     *    "Request expired" at an unsuspecting screen.
     * 2. The attempt's pairing is disconnected immediately — the wallet's
     *    still-pending approval prompt is dismissed via wc_pairingDelete and
     *    its eventual answer dies at the relay, instead of arriving here as
     *    the SDK's "No matching key. proposal: …" ERROR-log cascade.
     *
     * No-op when nothing is in flight.
     */
    abort(): void {
      if (!connectInFlight) return;
      connectAborted = true;
      abortReason = 'user';
      cleanupAbandonedPairing();
    },

    async disconnect() {
      // Mark this as SELF-initiated before touching the SDK: it echoes our
      // own deletion back as a local session_delete event, and that echo
      // must not fire onSessionInvalidatedHandler (the client's disconnect()
      // path already tears down sessions and emits its own events — a second
      // round would double-fire them).
      selfDisconnecting = true;
      try {
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
        sessionTopic = null;
        cachedAddress = null;
        cachedNetwork = null;
        peerMetadata = null;
        grantedMethods = new Set();
        if (opts.storage) {
          await opts.storage.removeItem(WC_STORAGE_KEY);
        }
      } finally {
        selfDisconnecting = false;
      }
    },

    async getAddress(): Promise<GetAddressResult> {
      if (!cachedAddress) {
        // Cold start — a persisted session may exist (see restoreFromStorage).
        // Rehydrate before deciding we're not connected; StellarAppKit's
        // restore() validates sessions through this very call.
        await restoreFromStorage();
      }
      if (!cachedAddress) {
        throw ConnectError.invalidRequest('WalletConnect is not connected — call connect() first.', undefined, meta.id);
      }
      return { address: cachedAddress };
    },

    async getNetwork(): Promise<GetNetworkResult> {
      if (!cachedNetwork) {
        await restoreFromStorage();
      }
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
        let result: Record<string, unknown>;
        try {
          // The mobile handoff hook: the user already approved the preview
          // (client-side consent) and every pre-check above passed — this
          // request is about to hit the relay, so the paired wallet app
          // may be opened to meet it.
          notifySignDispatch('stellar_signXDR');
          result = await client.request({
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
        } catch (err) {
          // The SDK's delayed promise rejects here on wallet rejections
          // (Lobstr: { message: "Transaction cancelled by the user" }) and
          // on the 5-minute TTL lapse ("Request expired. Please try
          // again.") — classify instead of leaking raw SDK-speak.
          throw wcErrorToConnectError(err, meta.id);
        }

        // Some wallets return the error IN-BAND (a resolved { error })
        // instead of rejecting — classify those exactly the same way.
        if (result && typeof result === 'object' && 'error' in result) {
          throw wcErrorToConnectError(result.error, meta.id);
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
        let result: Record<string, unknown>;
        try {
          // Mobile handoff hook — see stellar_signXDR above.
          notifySignDispatch('stellar_signAuthEntry');
          result = await client.request({
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
        } catch (err) {
          // Classified like signTransaction — see the notes there.
          throw wcErrorToConnectError(err, meta.id);
        }

        // In-band { error } responses — classified the same way.
        if (result && typeof result === 'object' && 'error' in result) {
          throw wcErrorToConnectError(result.error, meta.id);
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
          // Mobile handoff hook — see stellar_signXDR above. Covers SIWS
          // too: signIn() lands here through connector.signMessage.
          notifySignDispatch('stellar_signMessage');
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

          // WC errors can be objects { code, message } or strings —
          // classified exactly like a thrown rejection.
          if (result && typeof result === 'object' && 'error' in result) {
            throw wcErrorToConnectError(result.error, meta.id);
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
          // Classify FIRST — a wallet rejection ("Transaction cancelled by
          // the user") becomes a code -4 with the wallet's own words, the
          // SDK's 5-minute TTL lapse becomes the plain "Request expired"
          // explanation. Method-support failures fall through to the
          // targeted invalidRequest below.
          const classified = classifyWalletConnectError(err);
          if (classified.kind !== 'other') {
            throw wcErrorToConnectError(err, meta.id);
          }

          const errMsg = classified.message;

          // Distinguish between "method not supported" (WC protocol error)
          // and any other failure. Don't say "does not support" if the
          // wallet actually processed the request but rejected it.
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
            // The wallet DOES support stellar_signMessage but the request
            // failed for another reason (relay, serialization, …).
            throw ConnectError.internal(
              `WalletConnect signMessage failed: ${errMsg}`,
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
   * Late-bound wallet-initiated-disconnect handler setter. StellarAppKit's
   * constructor calls this on every connector that has it; the handler then
   * fires when the WALLET kills the session (session_delete / session_expire),
   * so the client can reconcile its session map and emit disconnect events.
   *
   * This is a non-standard extension on the WalletConnect connector only —
   * direct connectors have no wallet side that could disconnect from under
   * us. The client checks for its existence with
   * `typeof connector.setOnSessionInvalidated === 'function'` before calling.
   */
  (connector as WalletConnector & { setOnSessionInvalidated?: (fn: (() => void) | null) => void }).setOnSessionInvalidated = (fn: (() => void) | null) => {
    onSessionInvalidatedHandler = fn;
  };

  /**
   * Late-bound sign-request dispatch handler setter. The mobile UI calls
   * this to learn the exact moment a sign request leaves for the relay —
   * which is AFTER the app-side preview gate resolved (the user consented)
   * and after the connector's connected + approved-method pre-checks, so
   * the notification only ever means "this request is on the wire now".
   *
   * This is the auto-open-the-wallet-app trigger for the MWA-style mobile
   * handoff — deliberately NOT the client's signQueueChange event, which
   * fires the moment the app CALLS signTransaction() (before the preview
   * consent) and would open the wallet with nothing waiting in it. The
   * handler receives the WC method name so hosts can distinguish request
   * kinds if they ever need to.
   *
   * This is a non-standard extension on the WalletConnect connector only —
   * direct connectors (browser extensions, WebViews) surface their prompt
   * themselves; there is no second app to hand off to. The mobile modal
   * checks for its existence with `typeof connector.setOnSignRequestDispatch
   * === 'function'` before calling.
   */
  (connector as WalletConnector & { setOnSignRequestDispatch?: (fn: ((info: { method: string }) => void) | null) => void }).setOnSignRequestDispatch = (fn: ((info: { method: string }) => void) | null) => {
    onSignRequestDispatchHandler = fn;
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
  (connector as WalletConnector & { _setAppMetadata?: (meta: {
    name: string;
    description?: string;
    url?: string;
    icons?: string[];
    redirect?: { native?: string; universal?: string };
  }) => void })._setAppMetadata = (meta: {
    name: string;
    description?: string;
    url?: string;
    icons?: string[];
    redirect?: { native?: string; universal?: string };
  }) => {
    appkitAppMetadata = meta;
  };

  return connector;
}
