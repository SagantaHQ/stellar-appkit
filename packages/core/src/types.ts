/**
 * Unified wallet types for Stellar AppKit.
 *
 * The shape here deliberately mirrors SEP-43 (Standard Web Wallet API
 * Interface) rather than inventing a competing contract — SEP-43 is the
 * direction the ecosystem is converging on, so adapters that shim a
 * non-compliant wallet just need to map *into* this shape once.
 *
 * Spec reference: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0043.md
 */

export type StellarNetwork = 'PUBLIC' | 'TESTNET' | 'FUTURENET' | 'STANDALONE';

/**
 * Well-known Stellar network passphrases, exported as a convenient object
 * so apps don't need to import `@stellar/stellar-sdk` just for `Networks.TESTNET`.
 *
 * Passphrases are signature-critical — signing against the wrong network
 * produces a signature that's valid for that network but rejected by every
 * other. These values are verified byte-for-byte against
 * `@stellar/stellar-sdk`'s own `Networks` export.
 *
 * Usage:
 * ```ts
 * import { Networks } from '@saganta/stellar-appkit';
 *
 * const appkit = new StellarAppKit({
 *   network: 'TESTNET',
 *   networkPassphrase: Networks.TESTNET, // optional — inferred from `network` for PUBLIC/TESTNET/FUTURENET
 * });
 * ```
 *
 * The `StellarAppKit` constructor auto-resolves the passphrase from the
 * `network` field for the three well-known networks, so you only need to
 * pass `networkPassphrase` for `STANDALONE` networks (which have no
 * built-in passphrase).
 */
export const Networks = {
  PUBLIC: 'Public Global Stellar Network ; September 2015',
  TESTNET: 'Test SDF Network ; September 2015',
  FUTURENET: 'Test SDF Future Network ; October 2022',
  STANDALONE: 'Standalone Network ; February 2017',
} as const satisfies Record<StellarNetwork, string>;

/**
 * Resolves the network passphrase for a well-known network.
 * Returns `undefined` for `STANDALONE` (no built-in passphrase — must be
 * passed explicitly via `StellarAppKitConfig.networkPassphrase`).
 */
export function resolveNetworkPassphrase(network: StellarNetwork): string | undefined {
  if (network === 'STANDALONE') return undefined;
  return Networks[network];
}

/** Platforms a connector can run on. Used for UI filtering, not enforcement. */
export type ConnectorPlatform = 'browser-extension' | 'web' | 'react-native' | 'walletconnect' | 'hardware';

/**
 * Richer than a plain boolean, but honest about what each connector can
 * actually determine: 'not-installed' vs 'available' is reliably knowable
 * for every adapter, 'locked' only for wallets whose SDK exposes a real
 * unlock-state check (most browser-extension wallets don't — see the
 * per-adapter comments before assuming 'locked' is universally detected).
 */
export type WalletReachability = 'available' | 'locked' | 'not-installed' | 'unavailable';

export interface WalletAccountOption {
  address: string;
  /** e.g. "Account 0" or the derivation path, for wallets exposing multiple accounts (hardware wallets, mainly). */
  label?: string;
}

export interface WalletMeta {
  id: string;
  name: string;
  /** Absolute or bundled icon URL. UI packages render this in the wallet list. */
  icon: string;
  /** Where a user can install this wallet if isAvailable() is false. */
  installUrl?: {
    chrome?: string;
    firefox?: string;
    safari?: string;
    ios?: string;
    android?: string;
  };
  /** web+stellar: deep link scheme support, for SEP-7 fallback. */
  supportsSep7?: boolean;
  platforms: ConnectorPlatform[];
}

export interface WalletCapabilities {
  signTransaction: boolean;
  signAuthEntry: boolean;
  signMessage: boolean;
  /** Whether the wallet can submit the signed transaction itself. */
  submit: boolean;
}

/** SEP-43 error codes, verbatim. */
export type ConnectErrorCode =
  | -1 // internal wallet error
  | -2 // external service (Horizon, RPC, ...) error
  | -3 // invalid client request
  | -4; // user rejected

export interface ConnectErrorShape {
  message: string;
  code: ConnectErrorCode;
  ext?: string[];
}

export class ConnectError extends Error implements ConnectErrorShape {
  readonly code: ConnectErrorCode;
  readonly ext?: string[];
  readonly walletId?: string;

  constructor(shape: ConnectErrorShape & { walletId?: string }) {
    super(shape.message);
    this.name = 'ConnectError';
    this.code = shape.code;
    this.ext = shape.ext;
    this.walletId = shape.walletId;
  }

  static internal(message: string, ext?: string[], walletId?: string) {
    return new ConnectError({ message, code: -1, ext, walletId });
  }
  static externalService(message: string, ext?: string[], walletId?: string) {
    return new ConnectError({ message, code: -2, ext, walletId });
  }
  static invalidRequest(message: string, ext?: string[], walletId?: string) {
    return new ConnectError({ message, code: -3, ext, walletId });
  }
  static rejected(walletId?: string) {
    return new ConnectError({
      message: 'The user rejected this request.',
      code: -4,
      walletId,
    });
  }
}

/**
 * Thrown by connect() when the wallet's live network doesn't match the
 * network the app is configured for. Kept as a distinct subclass (not just
 * a generic ConnectError with a network-shaped message) so UI code can
 * `instanceof` it and render "switch to Testnet in Freighter" with a retry
 * affordance instead of generic error copy.
 */
export class NetworkMismatchError extends ConnectError {
  readonly expectedNetwork: string;
  readonly actualNetwork: string;

  constructor(opts: { expectedNetwork: string; actualNetwork: string; walletId: string }) {
    super({
      message: `This wallet is set to ${opts.actualNetwork}, but this app expects ${opts.expectedNetwork}. Switch networks in your wallet and try again.`,
      code: -3,
      walletId: opts.walletId,
    });
    this.name = 'NetworkMismatchError';
    this.expectedNetwork = opts.expectedNetwork;
    this.actualNetwork = opts.actualNetwork;
  }
}

export interface WalletAccount {
  address: string;
  walletId: string;
}

export interface ConnectOptions {
  /** Hint for wallets with multiple accounts/networks configured. */
  network?: StellarNetwork;
}

export interface SignOptions {
  networkPassphrase?: string;
  address?: string;
}

export interface SignTxOptions extends SignOptions {
  submit?: boolean;
  submitUrl?: string;
}

export interface GetAddressResult {
  address: string;
}

export interface GetNetworkResult {
  network: string;
  networkPassphrase: string;
}

export interface SignTransactionResult {
  signedTxXdr: string;
  signerAddress: string;
}

export interface SignAuthEntryResult {
  signedAuthEntry: string;
  signerAddress: string;
}

export interface SignMessageResult {
  /** The signature itself — encoding varies per wallet (base64 for Freighter/Ledger, hex for Albedo). Decoded by the verifier. */
  signedMessage: string;
  signerAddress: string;
  /**
   * Base64 of the exact byte sequence that was passed to the wallet's
   * signing function. This is what the verifier must hash/verify against —
   * NOT necessarily the plaintext `message` argument the caller passed in.
   *
   * Why this exists: wallets do not all sign the same thing.
   *  - Freighter, Ledger, and SEP-43-compliant wallets sign the raw UTF-8
   *    bytes of the message string — `signedData` is just `base64(utf8(message))`.
   *  - Albedo signs a derived value (`signed_message`, a hash of pubkey +
   *    message produced server-side) rather than the raw message bytes —
   *    `signedData` is `base64(hexDecode(signed_message))`.
   *  - xBull signs a `fullMessage` that may include a wallet-added prefix —
   *    `signedData` is `base64(utf8(fullMessage))`.
   *
   * The connector is the only code that knows what bytes the wallet actually
   * signed; surfacing it here makes the verifier wallet-agnostic.
   *
   * Optional for backward compatibility with third-party connectors that
   * haven't been updated yet — the verifier falls back to
   * `Buffer.from(message, 'utf-8')` when `signedData` is absent.
   */
  signedData?: string;
}

/**
 * Every adapter — native SEP-43 or shimmed — implements this. This is the
 * one interface the rest of the SDK (Soroban layer, SIWS, UI) is written
 * against, so a new wallet only ever means one new file in `connectors/`.
 */
export interface WalletConnector {
  readonly id: string;
  readonly meta: WalletMeta;
  readonly capabilities: WalletCapabilities;

  getReachability(): Promise<WalletReachability>;
  connect(opts?: ConnectOptions): Promise<WalletAccount>;
  disconnect(): Promise<void>;

  getAddress(): Promise<GetAddressResult>;
  getNetwork(): Promise<GetNetworkResult>;
  signTransaction(xdr: string, opts?: SignTxOptions): Promise<SignTransactionResult>;
  signAuthEntry(authEntryXdr: string, opts?: SignOptions): Promise<SignAuthEntryResult>;
  signMessage(message: string, opts?: SignOptions): Promise<SignMessageResult>;

  /** Wallets that expose more than one account (hardware wallets, mainly) implement this pair; everything else omits both. */
  listAccounts?(): Promise<WalletAccountOption[]>;
  /** Switches which of listAccounts()'s addresses subsequent sign/getAddress calls act on. Only meaningful alongside listAccounts. */
  selectAccount?(address: string): Promise<void>;

  /**
   * Optional: eagerly initializes the connector's expensive machinery so a
   * later `connect()` starts instantly. The WalletConnect connector
   * implements this (dynamic SDK import + relay WebSocket handshake — the
   * cold-start cost that otherwise lands on the user's first tap, which on
   * React Native manifests as a multi-second freeze).
   *
   * Idempotent and safe to call repeatedly; implementations must swallow
   * errors (a failed warm-up leaves the connector cold — the next
   * `connect()` retries initialization and surfaces the real error).
   */
  warmUp?(): Promise<void>;

  /**
   * Optional: forces a relay transport restart — disconnect the socket,
   * reconnect, and resubscribe every stored topic so the relay re-delivers
   * any messages that queued while the connection was down.
   *
   * Only the WalletConnect connector implements this. WHY it exists: on
   * React Native the app is backgrounded the moment a wallet deep link
   * fires (connect pairing, sign request), and the OS kills or zombifies
   * the relay WebSocket. The WC SDK's own recovery paths are browser/Node
   * shaped — its ping watchdog only runs under Node (`process.versions.node`)
   * and its disconnect listener depends on `navigator.onLine` events, neither
   * of which exist on RN. When the wallet then approves, `session_settled`
   * (or the sign response) sits queued on the relay and never arrives —
   * `approval()` hangs forever and the modal stays on "Continue in wallet".
   *
   * The app (or the RN modal, which does this automatically) calls this on
   * AppState 'active'; the restart + resubscribe re-delivers the queued
   * message and the in-flight promise resolves. Implementations must be
   * fire-and-forget safe: never throw, never initialize a cold client, and
   * no-op when nothing relay-related is in flight.
   */
  refreshTransport?(): void;

  /**
   * Optional: cancels an in-flight `connect()` attempt on the user's
   * behalf (modal back arrow / sheet close while the connecting view is
   * up). Only the WalletConnect connector implements this.
   *
   * WHAT IT MUST DO beyond settling the connect() promise quickly with a
   * code -4 "cancelled" rejection: tear down the attempt's WalletConnect
   * PAIRING (signClient.disconnect on the pairing topic), which sends
   * wc_pairingDelete to the wallet — dismissing its still-pending approval
   * prompt — and prevents the wallet's late answer from arriving against a
   * record this side already discarded (the SDK's
   * "No matching key. proposal: …" ERROR-log cascade).
   *
   * Must be a no-op (never throw) when nothing is in flight.
   */
  abort?(reason?: unknown): void;

  /**
   * Optional: returns the connected wallet's own identity as reported by
   * relay-based connectors (WalletConnect) — the real wallet name and icon
   * ("Freighter", "LOBSTR", "HOT Wallet") rather than the connector's
   * generic label. Returns null when not connected or unknown. Direct
   * (non-relay) connectors omit this — their `meta` already IS the wallet.
   */
  getSessionPeer?(): { name: string; url: string | null; icon: string | null } | null;

  /**
   * Optional: registers a callback the connector fires when the WALLET
   * kills the connection from its side — WalletConnect's `session_delete`
   * (user tapped Disconnect inside the wallet) or `session_expire` (the
   * session TTL lapsed). This is the wallet-initiated counterpart of
   * `disconnect()`, which is the app asking the wallet to leave.
   *
   * Only relay-based connectors implement it. StellarAppKit wires it
   * automatically at construction (if present): the callback reconciles
   * the client's session map, drops the persisted session, and emits
   * `disconnect` + `sessionsChanged` so every listener — modals, hooks,
   * app code — sees the wallet leave exactly as if the app had called
   * `disconnect()` itself. Headless users who manage a connector directly
   * can register their own handler; the connector's own state and
   * persisted record are cleared either way.
   */
  setOnSessionInvalidated?(cb: (() => void) | null): void;

  /**
   * Optional: registers a callback the connector fires the moment a SIGN
   * request is dispatched to the relay — `stellar_signXDR`,
   * `stellar_signAuthEntry`, or `stellar_signMessage` — after its
   * connected + approved-method pre-checks passed, i.e. only when the
   * request is genuinely going out on the wire.
   *
   * This is the mobile auto-open-the-wallet-app trigger (MWA-style
   * handoff): by the time it fires, the app-side preview gate has already
   * resolved — the user tapped Sign/Approve in the app's preview modal —
   * so opening the paired wallet app lands the user straight in the
   * wallet's pending prompt. Deliberately NOT wired to the client's
   * `signQueueChange` event, which fires the moment the app calls
   * signTransaction() (BEFORE the preview consent) and would open the
   * wallet with nothing waiting in it.
   *
   * Only relay-based connectors (WalletConnect) implement it — direct
   * connectors surface their prompt themselves; there is no second app to
   * hand off to. Connector implementations swallow errors thrown by the
   * host callback so a misbehaving handler can never break the request
   * path. Headless hosts can use it for telemetry (which requests left,
   * when) the same way mobile UIs use it for the handoff.
   */
  setOnSignRequestDispatch?(cb: ((info: { method: string }) => void) | null): void;

  /**
   * Optional: returns a URL to the connected account's profile picture /
   * avatar, if the wallet supports one. Used by the UI to render an
   * avatar next to the address instead of a generic colored circle.
   *
   * Return `null` or `undefined` if no avatar is available — the UI
   * falls back to a generated gradient avatar based on the address.
   * Returning a string URL (data: or https:) causes the UI to render
   * an `<img>` tag for the avatar.
   *
   * Wallets that don't support avatars omit this method entirely.
   */
  getAvatar?(): Promise<{ url: string } | null>;
}

/** Cross-platform storage shim — localStorage on web, AsyncStorage/SecureStore on RN. */
export interface ConnectStorage {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

export type ConnectStatus = 'idle' | 'selecting' | 'connecting' | 'connected' | 'error';

export interface ConnectSession {
  walletId: string;
  address: string;
  network: StellarNetwork;
  connectedAt: number;
}

export interface StellarAppKitEvents {
  statusChange: ConnectStatus;
  connect: ConnectSession;
  /** Which wallet was disconnected — was `void`; now meaningful now that more than one wallet can be connected at once. */
  disconnect: { walletId: string };
  /** The wallet extension itself reported a different selected account than the session on file. Reserved for adapters that can detect this — none currently poll for it (see client.ts watchNetwork/restore for the analogous network case). */
  accountChange: WalletAccount;
  /** The app switched which connected wallet/account is active — distinct from accountChange, which is the wallet changing under us. */
  accountSwitch: { walletId: string; address: string };
  /** Fires whenever the SIWS session changes (set, cleared, expired). Payload is `SiwsSession | null`. */
  siwsSessionChange: SiwsSession | null;
  /** Fires whenever the full set of connected sessions changes (connect, disconnect, or switch) — convenient for an account-switcher UI to subscribe to once instead of three separate events. */
  sessionsChanged: ConnectSession[];
  networkChange: GetNetworkResult;
  /** Number of sign requests currently queued (including the one in flight) — see StellarAppKit's signature queueing. */
  signQueueChange: number;
  error: ConnectError;
  /**
   * A wallet-side sign that failed once and was successfully re-driven via
   * retryLastSign() (the modal's "Try again"). Payload is `{ kind, result }` —
   * which sign API the retry re-drove, and its result. The original promise
   * the app awaited has already rejected and cannot be resurrected, so apps
   * that want the retried result subscribe to this event (the ui-web
   * re-dispatches it as a DOM `sc-sign-retried` event; the
   * react/vue/solid/svelte hooks fold matching kinds back into their state).
   */
  signRetried: { kind: SignRetriedKind; result: unknown };
}

/** Which sign API a 'signRetried' event re-drove — lets per-API consumers filter. */
export type SignRetriedKind = 'transaction' | 'authEntry' | 'message' | 'signIn';

/**
 * SIWS session — the authenticated session returned by the server after
 * successful sign-in verification. Stored locally and accessible via
 * `appkit.siwsSession`.
 */
export interface SiwsSession {
  /** Network name (e.g. 'TESTNET', 'PUBLIC'). Must match the connected wallet's network. */
  network: string;
  /** The connected wallet's address. Must match the connected wallet's address. */
  address: string;
  /** Session expiry timestamp (epoch ms). If in the past, session is expired. */
  expiry: number;
  /** Extra metadata from the server (username, avatar, roles, etc.). */
  metadata?: Record<string, unknown>;
}

/**
 * SIWS (Sign-In With Stellar) configuration for automatic authentication.
 *
 * When set on the `StellarAppKit` config, the modal automatically triggers
 * a SIWS sign-in immediately after the wallet connects — without closing
 * the wallet UI. The flow is:
 *
 * 1. User connects wallet (extension popup or WC QR)
 * 2. Modal calls `session()` to check for an existing valid session
 *    - If session exists, not expired, and matches the wallet's address +
 *      network → skip sign-in, go straight to connected view
 *    - If session is null/expired/mismatch → proceed to step 3
 * 3. Modal shows "Fetching nonce…" → calls `nonce()`
 * 4. Modal shows "Sign in your wallet" → calls `signIn()` (wallet prompts)
 * 5. Modal shows "Verifying…" → calls `verify(result, nonce)`
 *    - `verify` must return a `SiwsSession` on success, `null`/`undefined` on failure
 *    - The returned session's `address` and `network` are validated against
 *      the connected wallet before accepting it
 * 6. If verify returns a valid session → store it, go to connected view
 * 7. If any step fails:
 *    - Shows the error message + "Try again" button (wallet stays connected)
 *    - If `disconnectOnFail` is `true` (default): when the user closes the
 *      modal and SIWS hasn't succeeded, the wallet is disconnected
 *
 * On wallet disconnect:
 * - If `signoutOnDisconnect` is `true` (default): calls `signout()` before
 *   disconnecting the wallet, clearing the server session
 * - The local SIWS session is always cleared on disconnect
 */
export interface SiwsConfig {
  /** Human-readable statement shown in the SIWS message (e.g. "Sign in to My App"). */
  statement: string;

  /**
   * When `true` (default): calls `signout()` before disconnecting the wallet,
   * clearing the server-side session. The local SIWS session is also cleared.
   * When `false`: the wallet is disconnected without calling `signout()` —
   * the server session stays alive (useful for multi-device sessions).
   */
  signoutOnDisconnect?: boolean;

  /**
   * Controls when the wallet is disconnected on SIWS failure:
   *
   * - `true` (default): The wallet stays connected while the user sees the
   *   error + "Try again" button. Only when the user **closes the modal**
   *   and SIWS hasn't succeeded, the wallet is disconnected.
   *
   * - `false`: The wallet is never disconnected, even if SIWS fails and the
   *   user closes the modal. The wallet stays connected without auth.
   */
  disconnectOnFail?: boolean;

  /**
   * Async function that checks for an existing session. Called immediately
   * after the wallet connects, BEFORE the sign-in flow.
   *
   * - Return a `SiwsSession` if a valid session exists → the SDK checks
   *   that `address` matches the connected wallet and `expiry` is in the
   *   future. If both match, sign-in is skipped.
   * - Return `null` or `undefined` if no session → proceeds with sign-in.
   *
   * Example:
   * ```ts
   * session: async () => {
   *   const res = await fetch('/api/siws/session');
   *   if (!res.ok) return null;
   *   return res.json();
   * }
   * ```
   */
  session: () => Promise<SiwsSession | null | undefined>;

  /**
   * Async function that fetches a server-issued nonce. Called after
   * `session()` returns null/expired, but before `signIn()`.
   *
   * Example:
   * ```ts
   * nonce: async () => {
   *   const res = await fetch('/api/siws/nonce');
   *   return res.text();
   * }
   * ```
   */
  nonce: () => Promise<string>;

  /**
   * Async function that verifies the SIWS result after the wallet signs.
   * Called with the `SignInResult` and the nonce from `nonce()`.
   *
   * Must return a `SiwsSession` on success (the SDK validates the returned
   * session's `address` and `network` against the connected wallet).
   * Return `null` or `undefined` on failure, or throw an Error with a
   * message for the user.
   *
   * Example:
   * ```ts
   * verify: async (data, nonce) => {
   *   const res = await fetch('/api/siws/verify', {
   *     method: 'POST',
   *     body: JSON.stringify({ ...data, nonce }),
   *   });
   *   if (!res.ok) return null;
   *   return res.json(); // → SiwsSession
   * }
   * ```
   */
  verify: (data: { message: string; signedMessage: string; signerAddress: string; signedData?: string; issuedAt: string; expirationTime: string }, nonce: string, context: { address: string; network: string }) => Promise<SiwsSession | null | undefined>;

  /**
   * Function that logs the user out from the server. Called before wallet
   * disconnect when `signoutOnDisconnect` is `true` (default), and when
   * `appkit.signOut()` is called manually.
   *
   * Should clear the server-side session (e.g. delete the session cookie
   * or token). Return `true` on success, `false` on failure. Errors are
   * silently ignored — the wallet is disconnected regardless.
   */
  signout: () => Promise<boolean> | boolean;

  /**
   * Optional: refresh the session before it expires. Called periodically
   * (or when the user calls `appkit.validateSession()`) to get a fresh
   * session from the server without requiring a new sign-in.
   *
   * If omitted, `validateSession()` falls back to calling `session()`.
   */
  refresh?: () => Promise<SiwsSession | null | undefined>;

  /** Max retry attempts on SIWS failure (default 3). After this, the user sees "Too many attempts." */
  maxRetries?: number;

  /** Timeout in ms for nonce() and verify() calls (default 15000). */
  timeoutMs?: number;
}

/** Error types for SIWS failures — used for programmatic error handling. */
export type SiwsErrorType =
  | 'session-check-failed'
  | 'nonce-fetch-failed'
  | 'sign-rejected'
  | 'verify-failed'
  | 'session-mismatch'
  | 'session-expired'
  | 'timeout'
  | 'max-retries-exceeded'
  | 'cancelled';

/** Error thrown by SIWS flow with a discriminated type. */
export class SiwsError extends Error {
  readonly type: SiwsErrorType;
  constructor(type: SiwsErrorType, message: string) {
    super(message);
    this.name = 'SiwsError';
    this.type = type;
  }
}
