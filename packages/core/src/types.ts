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
  /** Fires whenever the full set of connected sessions changes (connect, disconnect, or switch) — convenient for an account-switcher UI to subscribe to once instead of three separate events. */
  sessionsChanged: ConnectSession[];
  networkChange: GetNetworkResult;
  /** Number of sign requests currently queued (including the one in flight) — see StellarAppKit's signature queueing. */
  signQueueChange: number;
  error: ConnectError;
}

/**
 * SIWS (Sign-In With Stellar) configuration for automatic authentication.
 *
 * When set on the `StellarAppKit` config, the modal automatically triggers
 * a SIWS sign-in immediately after the wallet connects — without closing
 * the wallet UI. The flow is:
 *
 * 1. User connects wallet (extension popup or WC QR)
 * 2. Modal shows "Fetching nonce…" → calls `nonce()`
 * 3. Modal shows "Sign in your wallet" → calls `signIn()` (wallet prompts)
 * 4. Modal shows "Verifying…" → calls `verify(result, nonce)`
 * 5. If verify returns `true` → connected view (success)
 * 6. If verify returns `false` or any step fails:
 *    - If `disconnectOnFail` is `true` (default), disconnects the wallet
 *    - Shows the error message to the user with a "Try again" button
 *
 * Error messages are extracted from any error type (Error, string, object
 * with `message` property, ConnectError) so the user always sees a
 * meaningful message.
 */
export interface SiwsConfig {
  /** Human-readable statement shown in the SIWS message (e.g. "Sign in to My App"). */
  statement: string;
  /**
   * When `true` (default), disconnects the wallet entirely if SIWS fails
   * at any step (nonce fetch, sign, verify). When `false`, the wallet
   * stays connected but the SIWS error is shown.
   */
  disconnectOnFail?: boolean;
  /**
   * Async function that fetches a server-issued nonce. Called after the
   * wallet connects but before `signIn()`. The modal shows a loading
   * spinner while this is in flight.
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
   * Called with the `SignInResult` and the nonce from `nonce()`. The
   * modal shows a "Verifying…" spinner while this is in flight.
   *
   * Must return `true` for success, `false` for failure (or throw an
   * Error with a message). If it returns `false` without throwing, the
   * user sees "Sign-in verification failed."
   *
   * Example:
   * ```ts
   * verify: async (data, nonce) => {
   *   const res = await fetch('/api/siws/verify', {
   *     method: 'POST',
   *     body: JSON.stringify({ ...data, nonce }),
   *   });
   *   return res.ok;
   * }
   * ```
   */
  verify: (data: { message: string; signedMessage: string; signerAddress: string; signedData?: string; issuedAt: string; expirationTime: string }, nonce: string) => Promise<boolean>;
}
