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
export type ConnectErrorCode = -1 | -2 | -3 | -4;
export interface ConnectErrorShape {
    message: string;
    code: ConnectErrorCode;
    ext?: string[];
}
export declare class ConnectError extends Error implements ConnectErrorShape {
    readonly code: ConnectErrorCode;
    readonly ext?: string[];
    readonly walletId?: string;
    constructor(shape: ConnectErrorShape & {
        walletId?: string;
    });
    static internal(message: string, ext?: string[], walletId?: string): ConnectError;
    static externalService(message: string, ext?: string[], walletId?: string): ConnectError;
    static invalidRequest(message: string, ext?: string[], walletId?: string): ConnectError;
    static rejected(walletId?: string): ConnectError;
}
/**
 * Thrown by connect() when the wallet's live network doesn't match the
 * network the app is configured for. Kept as a distinct subclass (not just
 * a generic ConnectError with a network-shaped message) so UI code can
 * `instanceof` it and render "switch to Testnet in Freighter" with a retry
 * affordance instead of generic error copy.
 */
export declare class NetworkMismatchError extends ConnectError {
    readonly expectedNetwork: string;
    readonly actualNetwork: string;
    constructor(opts: {
        expectedNetwork: string;
        actualNetwork: string;
        walletId: string;
    });
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
    signedMessage: string;
    signerAddress: string;
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
    disconnect: {
        walletId: string;
    };
    /** The wallet extension itself reported a different selected account than the session on file. Reserved for adapters that can detect this — none currently poll for it (see client.ts watchNetwork/restore for the analogous network case). */
    accountChange: WalletAccount;
    /** The app switched which connected wallet/account is active — distinct from accountChange, which is the wallet changing under us. */
    accountSwitch: {
        walletId: string;
        address: string;
    };
    /** Fires whenever the full set of connected sessions changes (connect, disconnect, or switch) — convenient for an account-switcher UI to subscribe to once instead of three separate events. */
    sessionsChanged: ConnectSession[];
    networkChange: GetNetworkResult;
    /** Number of sign requests currently queued (including the one in flight) — see StellarAppKit's signature queueing. */
    signQueueChange: number;
    error: ConnectError;
}
//# sourceMappingURL=types.d.ts.map