import { ConnectorRegistry } from './connectors/registry.js';
import { type ConnectSession, type ConnectStatus, type ConnectStorage, type SignMessageResult, type SignOptions, type SignTransactionResult, type SignTxOptions, type SignAuthEntryResult, type StellarAppKitEvents, type StellarNetwork, type WalletConnector, type WalletReachability } from './types.js';
import { type SignInOptions, type SignInResult } from './siws.js';
import { type PreviewHandler, type PreviewOptions } from './decode.js';
export interface StellarAppKitConfig {
    connectors: WalletConnector[];
    /** Network the app expects to operate on — used to validate the connected wallet's network. */
    network: StellarNetwork;
    /** Required for STANDALONE networks (no built-in passphrase to fall back on); optional override otherwise. Needed for transaction previews to decode against the right network. */
    networkPassphrase?: string;
    /** Defaults to localStorage on web. Pass a RN-backed implementation for React Native. */
    storage?: ConnectStorage;
    /** App identity surfaced in Sign-In With Stellar messages. */
    appMetadata?: {
        name: string;
        domain: string;
        uri: string;
    };
    /** Set false to disable cross-tab session sync (on by default, no-ops where BroadcastChannel isn't available anyway). */
    syncAcrossTabs?: boolean;
    /** Called before every signTransaction() with a decoded preview — return false to cancel before the wallet ever sees the request. `ui-web`'s modal sets this automatically when attached. */
    onPreviewTransaction?: PreviewHandler;
    /** Passed through to buildTransactionPreview() — verifiedContracts, largeTransferThreshold. */
    previewOptions?: PreviewOptions;
}
export interface AppKitConnectOptions {
    /**
     * If the wallet's live network doesn't match, poll until it does instead
     * of failing immediately — lets a "wrong network" moment resolve itself
     * once the user switches inside their wallet, without them needing to
     * click connect again.
     */
    autoRetryNetworkMismatch?: boolean;
    retryIntervalMs?: number;
    retryTimeoutMs?: number;
}
/**
 * The single object app code talks to. Wraps the connector registry, owns
 * connection state + persistence, and re-exports signIn() (SIWS) so a whole
 * app only ever needs one import.
 *
 * Supports connecting more than one wallet at once (e.g. Freighter *and*
 * Ledger simultaneously) — `session`/`activeConnector` always refer to
 * whichever one is currently active; `sessions` lists everything connected.
 */
export declare class StellarAppKit {
    readonly registry: ConnectorRegistry;
    readonly network: StellarNetwork;
    readonly appMetadata?: StellarAppKitConfig['appMetadata'];
    /** Called before every signTransaction() — set by ui-web automatically, or assign your own for a non-UI preview flow (e.g. logging, a CLI confirmation prompt). */
    onPreviewTransaction: PreviewHandler | null;
    previewOptions: PreviewOptions;
    private storage;
    private customNetworkPassphrase?;
    private emitter;
    private _status;
    private _sessions;
    private _activeWalletId;
    private tabSync;
    private signChain;
    private _pendingSignCount;
    constructor(config: StellarAppKitConfig);
    /** Number of sign requests currently queued, including the one in flight — see the signing queue notes on signTransaction(). */
    get pendingSignCount(): number;
    get status(): ConnectStatus;
    /** The active session, or null if nothing's connected. */
    get session(): ConnectSession | null;
    /** Every currently connected session, active or not. */
    get sessions(): ConnectSession[];
    get activeConnector(): WalletConnector | null;
    on<K extends keyof StellarAppKitEvents>(event: K, handler: (payload: StellarAppKitEvents[K]) => void): () => void;
    getWalletReachability(walletId: string): Promise<WalletReachability>;
    /**
     * Attempts to restore persisted session(s) on app start. Silently drops
     * (rather than throwing) any session whose wallet is no longer available
     * or whose address no longer matches — this is meant to be called once,
     * e.g. inside a provider's mount effect, without needing its own error
     * handling.
     */
    restore(): Promise<ConnectSession[]>;
    /**
     * Connects a wallet. Adding a second (third, ...) wallet while one is
     * already connected doesn't replace it — both stay connected, and the
     * newly connected one becomes active. Use switchAccount() to change
     * which one is active without disconnecting anything.
     */
    connect(walletId: string, opts?: AppKitConnectOptions): Promise<ConnectSession>;
    private ensureNetworkMatch;
    /**
     * Switches which connected wallet is active. If `address` is given and
     * differs from that wallet's current session address, the connector must
     * support listAccounts()/selectAccount() (hardware wallets, mainly) — for
     * everything else, omit `address` to just switch between already-connected
     * *wallets*.
     */
    switchAccount(walletId: string, address?: string): Promise<ConnectSession>;
    /** Disconnects one wallet (defaults to the active one). Other connected wallets, if any, are untouched — the most recently connected one becomes active. */
    disconnect(walletId?: string): Promise<void>;
    /** Disconnects every connected wallet. */
    disconnectAll(): Promise<void>;
    /** Releases resources held by the client (currently just the cross-tab sync channel) — call on unmount in long-lived SPAs if you're creating fresh clients repeatedly. */
    dispose(): void;
    /** Re-reads storage after another tab reported a change, and reconciles in-memory state against it. Never writes back to storage itself, to avoid a notify loop between tabs. */
    private resyncFromStorage;
    private readStorage;
    private persist;
    private setStatus;
    private requireActiveConnector;
    /**
     * Maps the StellarNetwork enum to its passphrase, needed to decode a
     * preview and to validate signing options. Requires an explicit
     * `networkPassphrase` in the config for STANDALONE networks, which have
     * no fixed passphrase to fall back on.
     */
    private resolveNetworkPassphrase;
    /**
     * Serializes sign requests so concurrent calls don't race the same
     * wallet extension — most can only handle one prompt at a time, and
     * racing them tends to fail the second (or both) rather than queue
     * sanely on its own. A burst of signTransaction() calls resolves one at
     * a time, in call order, instead of unpredictably.
     */
    private enqueueSign;
    /**
     * Signs a transaction. Queued alongside every other sign* call (see
     * enqueueSign) so concurrent requests resolve in order instead of
     * racing. If `onPreviewTransaction` is set (ui-web does this
     * automatically once attached), the transaction is decoded and the
     * handler is awaited *before* the wallet ever sees the request —
     * rejecting there throws the same way a wallet-side rejection would,
     * so callers don't need to special-case it. Pass `skipPreview: true` to
     * bypass this for a specific call (e.g. a flow you've already confirmed
     * through some other UI).
     */
    signTransaction(xdr: string, opts?: SignTxOptions & {
        skipPreview?: boolean;
    }): Promise<SignTransactionResult>;
    /** Queued alongside signTransaction()/signMessage() — see enqueueSign. Doesn't currently go through the preview flow (see README's "known gaps"). */
    signAuthEntry(authEntryXdr: string, opts?: SignOptions): Promise<SignAuthEntryResult>;
    /** Queued alongside signTransaction()/signAuthEntry() — see enqueueSign. */
    signMessage(message: string, opts?: SignOptions): Promise<SignMessageResult>;
    /** Sign-In With Stellar — see siws.ts for the message format. Also queued, since it's a signMessage() call under the hood. */
    signIn(opts: Omit<SignInOptions, 'connector' | 'network' | 'appMetadata'>): Promise<SignInResult>;
}
//# sourceMappingURL=client.d.ts.map