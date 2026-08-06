/**
 * SolidJS bindings for @saganta/stellar-appkit.
 *
 * Mirrors the React wrapper's hook surface, translated to Solid's
 * primitives (createSignal/createMemo/onCleanup) instead of React's
 * useState/useMemo/useEffect.
 *
 * Architecture:
 *
 * 1. `<StellarAppKitProvider>` — a Context provider that holds a single
 *    `StellarAppKit` instance for the app. Subscribes to the client's
 *    event emitter and pushes state changes into Solid's signals.
 *
 * 2. Hooks — `useAppKit`, `useConnect`, `useSession`, `useSignTransaction`,
 *    etc. Each pulls state from the provider via context and exposes
 *    reactive accessors (Solid's `() => T` pattern).
 *
 * Tree-shakability: this subpath is a separate module — bundlers only
 * pull it in if the consumer actually imports `@saganta/stellar-appkit/solid`.
 *
 * SSR safety: Solid renders synchronously by default, so the provider
 * constructs the client in onMount (not during render) to avoid touching
 * storage during SSR. The composables are safe to call during SSR — they
 * just return initial values until the client is mounted.
 */
import { type Accessor, type JSX } from 'solid-js';
import { StellarAppKit, type ConnectSession, type ConnectStatus, type StellarAppKitEvents, type WalletConnector, type StellarNetwork, type PreviewOptions, type TransactionPreview, type AuthEntryPreview, type SignInResult, type SignMessageResult, type SignTransactionResult, type SignTxOptions, type SignOptions } from '../index.js';
import { SorobanConnection, type InvokeOptions, type InvokeResult } from '../soroban.js';
export interface StellarAppKitProviderConfig {
    network: StellarNetwork;
    connectors: WalletConnector[];
    appMetadata?: {
        name: string;
        domain: string;
        uri: string;
    };
    networkPassphrase?: string;
    syncAcrossTabs?: boolean;
    previewOptions?: PreviewOptions;
    restoreOnMount?: boolean;
}
export declare function StellarAppKitProvider(props: {
    config: StellarAppKitProviderConfig;
    children: JSX.Element;
}): JSX.Element;
/** Optional form — returns null during SSR or before the provider mounts. */
export declare function useAppKitOptional(): Accessor<StellarAppKit | null>;
export declare function useAppKit(): StellarAppKit;
export declare function useStatus(): Accessor<ConnectStatus>;
export declare function useSession(): Accessor<ConnectSession | null>;
export declare function useSessions(): Accessor<ConnectSession[]>;
export declare function useAddress(): Accessor<string | null>;
export declare function usePendingSignCount(): Accessor<number>;
export interface UseConnectResult {
    connect: (walletId: string) => Promise<ConnectSession>;
    disconnect: (walletId?: string) => Promise<void>;
    disconnectAll: () => Promise<void>;
    switchAccount: (walletId: string, address?: string) => Promise<ConnectSession>;
    connectors: Accessor<WalletConnector[]>;
    isConnected: Accessor<boolean>;
    isConnecting: Accessor<boolean>;
    error: Accessor<StellarAppKitEvents['error'] | null>;
}
export declare function useConnect(): UseConnectResult;
export interface UseSignResult<T> {
    sign: (...args: never[]) => Promise<T>;
    isSigning: Accessor<boolean>;
    data: Accessor<T | null>;
    error: Accessor<unknown>;
}
export declare function useSignTransaction(): UseSignResult<SignTransactionResult> & {
    sign: (xdr: string, opts?: SignTxOptions & {
        skipPreview?: boolean;
    }) => Promise<SignTransactionResult>;
};
export declare function useSignMessage(): UseSignResult<SignMessageResult> & {
    sign: (message: string, opts?: SignOptions) => Promise<SignMessageResult>;
};
export declare function useSignIn(): UseSignResult<SignInResult> & {
    sign: (opts: {
        statement: string;
        nonce: string;
        expirationTime?: Date;
    }) => Promise<SignInResult>;
};
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
    estimateFee: (xdr: string) => Promise<import("../decode.js").FeeEstimate | null>;
    contract: <T extends import("../contract.js").ContractSpec = import("../contract.js").ContractSpec>(contractId: string, opts: {
        specEntries: string[] | import('@stellar/stellar-sdk').xdr.ScSpecEntry[];
    }) => import("../contract.js").ContractClient<T>;
    getFailoverStatus: () => Array<{
        url: string;
        healthy: boolean;
        failureCount: number;
    }> | null;
    status: Accessor<"error" | "idle" | "invoking" | "success">;
    lastResult: Accessor<InvokeResult | null>;
    error: Accessor<unknown>;
    session: Accessor<ConnectSession | null>;
};
export declare function usePreviewTransaction(): {
    preview: Accessor<TransactionPreview | null>;
    respond: (approve: boolean) => void;
    isPending: Accessor<boolean>;
};
export declare function usePreviewAuthEntry(): {
    preview: Accessor<AuthEntryPreview | null>;
    respond: (approve: boolean) => void;
    isPending: Accessor<boolean>;
};
//# sourceMappingURL=index.d.ts.map