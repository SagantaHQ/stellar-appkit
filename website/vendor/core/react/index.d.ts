/**
 * React bindings for @saganta/stellar-appkit.
 *
 * Three layers:
 *
 * 1. `<StellarAppKitProvider>` — a Context provider that holds a single
 *    `StellarAppKit` instance for the app. Subscribes to the client's
 *    event emitter and pushes state changes into React's reconciler via
 *    `useSyncExternalStore`. Mount this once at the app root.
 *
 * 2. Hooks — `useAppKit`, `useConnect`, `useSession`, `useSignTransaction`,
 *    `useSignMessage`, `useSignIn`, `useSoroban`, `usePreviewTransaction`,
 *    `usePreviewAuthEntry`. Each pulls state from the provider via context
 *    and re-renders on the relevant slice of state change.
 *
 * 3. `<StellarAppKitModal>` — a JSX component wrapping the underlying
 *    `<saganta-appkit-modal>` Web Component with typed props, event
 *    handlers, and an imperative `ref` handle. Re-exported from
 *    `./modal.tsx` so consumers can do `import { StellarAppKitModal }`
 *    from the same subpath.
 *
 * Tree-shakability: this subpath is a separate module — bundlers only
 * pull it in if the consumer actually imports `@saganta/stellar-appkit/react`.
 * A consumer using only the core client never pays for React.
 *
 * SSR safety: the provider and hooks are safe to render on the server —
 * they don't touch `window` or any browser-only API. The `StellarAppKit`
 * instance itself uses `localStorage` lazily (only on actual connect/restore
 * calls), so server-side render won't crash on storage access. The
 * `<StellarAppKitModal>` component renders a custom element tag during SSR,
 * which is safe (it just renders the tag, no client connection).
 */
import { type ReactNode } from 'react';
export { StellarAppKitModal, default as StellarAppKitModalDefault, type StellarAppKitModalProps, type StellarAppKitModalHandle, type StellarAppKitModalEvents, type StellarAppKitModalComponentProps, } from './modal.js';
import { StellarAppKit, type ConnectSession, type ConnectStatus, type StellarAppKitEvents, type WalletConnector, type StellarNetwork, type PreviewOptions, type TransactionPreview, type AuthEntryPreview, type SignInResult, type SignMessageResult, type SignTransactionResult, type SignTxOptions, type SignOptions } from '../index.js';
import { SorobanConnection, type InvokeOptions, type InvokeResult } from '../soroban.js';
export interface StellarAppKitProviderConfig {
    /** Stellar network the app expects to operate on. */
    network: StellarNetwork;
    /** Wallet connectors to register. */
    connectors: WalletConnector[];
    /** App identity surfaced in SIWS messages. Required if you use useSignIn(). */
    appMetadata?: {
        name: string;
        domain: string;
        uri: string;
    };
    /** Required for STANDALONE networks; optional override otherwise. */
    networkPassphrase?: string;
    /** Set false to disable cross-tab session sync (on by default). */
    syncAcrossTabs?: boolean;
    /** Verified-contracts / large-transfer-threshold, shared by both preview hooks. */
    previewOptions?: PreviewOptions;
    /** Restore any persisted session on mount. Default: true. */
    restoreOnMount?: boolean;
}
export declare function StellarAppKitProvider(props: {
    config: StellarAppKitProviderConfig;
    children: ReactNode;
}): import("react").JSX.Element;
/**
 * Returns the StellarAppKit client instance from context.
 *
 * Re-renders on every status/session/queue change — use this only if you
 * need the client itself; for specific slices (session, status, etc.) prefer
 * the narrower hooks below, which only re-render on their own slice.
 */
export declare function useAppKit(): StellarAppKit;
/**
 * Reactive status: 'idle' | 'selecting' | 'connecting' | 'connected' | 'error'.
 * Re-renders only when status changes.
 */
export declare function useStatus(): ConnectStatus;
/**
 * Reactive active session (or null). Re-renders when the active session
 * changes (connect, disconnect, switchAccount).
 */
export declare function useSession(): ConnectSession | null;
/**
 * Reactive list of all connected sessions (active + inactive).
 */
export declare function useSessions(): ConnectSession[];
/**
 * Convenience: the active session's address (or null).
 */
export declare function useAddress(): string | null;
/**
 * Reactive count of sign requests currently queued (including the one in
 * flight). Useful for showing "1 of 3 signing requests in progress" in the UI.
 */
export declare function usePendingSignCount(): number;
export interface UseConnectResult {
    /** Connect a wallet by id. Resolves to the new session. */
    connect: (walletId: string) => Promise<ConnectSession>;
    /** Disconnect one wallet (defaults to the active one). */
    disconnect: (walletId?: string) => Promise<void>;
    /** Disconnect every connected wallet. */
    disconnectAll: () => Promise<void>;
    /** Switch which connected wallet is active. */
    switchAccount: (walletId: string, address?: string) => Promise<ConnectSession>;
    /** List of registered connectors — for rendering a wallet picker. */
    connectors: WalletConnector[];
    /** True if any session is active. */
    isConnected: boolean;
    /** True while a connect() call is in flight. */
    isConnecting: boolean;
    /** The most recent ConnectError, if any. Cleared on next successful connect. */
    error: StellarAppKitEvents['error'] | null;
}
export declare function useConnect(): UseConnectResult;
export interface UseSignResult<T> {
    /** Trigger the sign call. Resolves to the result or throws. */
    sign: (...args: never[]) => Promise<T>;
    /** True while a sign call is in flight (this hook's call only). */
    isSigning: boolean;
    /** The most recent successful result, if any. */
    data: T | null;
    /** The most recent error, if any. Cleared on next successful sign. */
    error: unknown;
}
/**
 * Signs a transaction via the active wallet. Automatically goes through
 * the onPreviewTransaction hook (set via the provider's config) before
 * reaching the wallet. Pass `{ skipPreview: true }` in opts to bypass.
 */
export declare function useSignTransaction(): UseSignResult<SignTransactionResult> & {
    sign: (xdr: string, opts?: SignTxOptions & {
        skipPreview?: boolean;
    }) => Promise<SignTransactionResult>;
};
/**
 * Signs a message (raw bytes) via the active wallet. Used by SIWS under
 * the hood, but exposed for arbitrary message signing.
 */
export declare function useSignMessage(): UseSignResult<SignMessageResult> & {
    sign: (message: string, opts?: SignOptions) => Promise<SignMessageResult>;
};
/**
 * Sign-In With Stellar — builds the SIWS message, signs it, and returns
 * the full result (including `signedData` for server-side verification).
 */
export declare function useSignIn(): UseSignResult<SignInResult> & {
    sign: (opts: {
        statement: string;
        nonce: string;
        expirationTime?: Date;
    }) => Promise<SignInResult>;
};
/**
 * Returns a memoized `SorobanConnection` bound to the active wallet.
 *
 * Pass `rpcUrl` and `networkPassphrase` to configure the RPC connection.
 * The connection is recreated if either changes. The active wallet is
 * read from context at call time, so switching wallets mid-session just
 * works without recreating the connection.
 */
export declare function useSoroban(opts: {
    rpcUrl: string;
    networkPassphrase: string;
}): {
    soroban: SorobanConnection;
    invoke: (invokeOpts: InvokeOptions) => Promise<InvokeResult>;
    previewInvoke: (opts: InvokeOptions) => Promise<TransactionPreview & {
        simulationStatus: 'success' | 'failed';
        simulationError?: string;
        balanceDeltas: import("../decode.js").BalanceDelta[];
    }>;
    /** Estimates the fee for a transaction XDR by simulating it. Returns the full FeeEstimate breakdown. */
    estimateFee: (xdr: string) => Promise<import("../decode.js").FeeEstimate | null>;
    /** Returns a typed client for a Soroban contract, bound to this connection. */
    contract: <T extends import("../contract.js").ContractSpec = import("../contract.js").ContractSpec>(contractId: string, opts: {
        specEntries: string[] | import('@stellar/stellar-sdk').xdr.ScSpecEntry[];
    }) => import("../contract.js").ContractClient<T>;
    /** Returns the current failover status (null for single-server configs). */
    getFailoverStatus: () => Array<{
        url: string;
        healthy: boolean;
        failureCount: number;
    }> | null;
    status: "error" | "idle" | "invoking" | "success";
    lastResult: InvokeResult | null;
    error: unknown;
    session: ConnectSession | null;
};
/**
 * Subscribes to the client's `onPreviewTransaction` hook and exposes the
 * latest preview reactively. Set this up by passing the hook's setter as
 * the `onPreviewTransaction` handler — or use the convenience wrapper
 * `installPreviewHandlers` to wire both at once.
 *
 * Returns `{ preview, respond }` where `respond(approve: boolean)` resolves
 * the pending preview. If no preview is pending, `preview` is null.
 */
export declare function usePreviewTransaction(): {
    preview: TransactionPreview | null;
    respond: (approve: boolean) => void;
    isPending: boolean;
};
/**
 * Same as usePreviewTransaction but for the auth-entry preview flow.
 */
export declare function usePreviewAuthEntry(): {
    preview: AuthEntryPreview | null;
    respond: (approve: boolean) => void;
    isPending: boolean;
};
//# sourceMappingURL=index.d.ts.map