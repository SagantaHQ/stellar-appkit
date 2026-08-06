/**
 * Svelte 5 bindings for @saganta/stellar-appkit.
 *
 * Mirrors the React wrapper's hook surface, translated to Svelte's runes
 * ($state, $derived, $effect) for Svelte 5, with a fallback to stores
 * for Svelte 4 compatibility.
 *
 * Architecture:
 *
 * 1. `setStellarAppKitContext(client)` — call inside a root component's
 *    script to construct a single StellarAppKit instance and stash it in
 *    module-level state (Svelte 5 doesn't have React-style Context, but
 *    the runes model makes module-level singletons idiomatic).
 *
 * 2. `getAppKit()`, `useSession()`, `useConnect()`, etc. — functions
 *    that read the client and return reactive state via runes ($state)
 *    or stores (Svelte 4 fallback). Each subscribes to the relevant
 *    slice of the client's event emitter and updates on change.
 *
 * Tree-shakability: this subpath is a separate module — bundlers only
 * pull it in if the consumer actually imports `@saganta/stellar-appkit/svelte`.
 *
 * Svelte 5 vs Svelte 4: this file uses Svelte 5 runes ($state, $derived,
 * $effect) as the primary API. For Svelte 4 consumers, we also export
 * store-based equivalents (`useSessionStore`, `useConnectStore`, etc.)
 * that wrap the same logic in Svelte's writable store. The store-based
 * API works in both Svelte 4 and Svelte 5 (stores are still supported
 * in 5), so use that if you need to support both versions.
 *
 * SSR safety: the client is constructed lazily and storage access is
 * deferred to actual connect/restore calls, so SSR won't crash.
 */
import { StellarAppKit, type ConnectSession, type ConnectStatus, type StellarAppKitEvents, type WalletConnector, type StellarNetwork, type PreviewOptions, type TransactionPreview, type AuthEntryPreview, type SignInResult, type SignMessageResult, type SignTransactionResult, type SignTxOptions, type SignOptions } from '../index.js';
import { SorobanConnection, type InvokeOptions, type InvokeResult } from '../soroban.js';
import { type Readable } from 'svelte/store';
export interface StellarAppKitConfig {
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
    /** Restore any persisted session on init. Default: true. */
    restoreOnMount?: boolean;
}
/**
 * Construct the StellarAppKit client and stash it as a module-level singleton.
 * Call this once at app init — typically in your root +layout.svelte or
 * in a +page.svelte that wraps the app.
 *
 * ```svelte
 * <script lang="ts">
 *   import { setStellarAppKitContext } from '@saganta/stellar-appkit/svelte';
 *   import { createFreighterConnector } from '@saganta/stellar-appkit';
 *
 *   setStellarAppKitContext({
 *     network: 'TESTNET',
 *     connectors: [createFreighterConnector()],
 *     appMetadata: { name: 'My App', domain: 'localhost', uri: 'http://localhost:3000' },
 *   });
 * </script>
 * ```
 *
 * In Svelte 5 with runes, you'd typically call this at the top level of
 * your root component's <script> block. The client persists across
 * navigations because it's module-level, not component-scoped.
 *
 * If you call this multiple times (e.g. in dev with HMR), the previous
 * client is disposed first.
 */
export declare function setStellarAppKitContext(config: StellarAppKitConfig): StellarAppKit;
/**
 * Returns the StellarAppKit client. Throws if setStellarAppKitContext()
 * hasn't been called yet.
 */
export declare function getAppKit(): StellarAppKit;
/**
 * Optional form — returns null before setStellarAppKitContext() is called.
 * Useful for SSR or for components that render before init.
 */
export declare function getAppKitOptional(): StellarAppKit | null;
export declare function useStatusStore(): Readable<ConnectStatus>;
export declare function useSessionStore(): Readable<ConnectSession | null>;
export declare function useSessionsStore(): Readable<ConnectSession[]>;
export declare function useAddressStore(): Readable<string | null>;
export declare function usePendingSignCountStore(): Readable<number>;
export interface UseConnectStoreResult {
    connect: (walletId: string) => Promise<ConnectSession>;
    disconnect: (walletId?: string) => Promise<void>;
    disconnectAll: () => Promise<void>;
    switchAccount: (walletId: string, address?: string) => Promise<ConnectSession>;
    isConnected: Readable<boolean>;
    isConnecting: Readable<boolean>;
    error: Readable<StellarAppKitEvents['error'] | null>;
}
export declare function useConnectStore(): UseConnectStoreResult;
export interface UseSignStoreResult<T> {
    sign: (...args: never[]) => Promise<T>;
    isSigning: Readable<boolean>;
    data: Readable<T | null>;
    error: Readable<unknown>;
}
export declare function useSignTransactionStore(): UseSignStoreResult<SignTransactionResult> & {
    sign: (xdr: string, opts?: SignTxOptions & {
        skipPreview?: boolean;
    }) => Promise<SignTransactionResult>;
};
export declare function useSignMessageStore(): UseSignStoreResult<SignMessageResult> & {
    sign: (message: string, opts?: SignOptions) => Promise<SignMessageResult>;
};
export declare function useSignInStore(): UseSignStoreResult<SignInResult> & {
    sign: (opts: {
        statement: string;
        nonce: string;
        expirationTime?: Date;
    }) => Promise<SignInResult>;
};
export declare function useSorobanStore(opts: {
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
    status: {
        subscribe: (this: void, run: import("svelte/store").Subscriber<"error" | "idle" | "invoking" | "success">, invalidate?: import("svelte/store").Invalidator<"error" | "idle" | "invoking" | "success"> | undefined) => import("svelte/store").Unsubscriber;
    };
    lastResult: {
        subscribe: (this: void, run: import("svelte/store").Subscriber<InvokeResult | null>, invalidate?: import("svelte/store").Invalidator<InvokeResult | null> | undefined) => import("svelte/store").Unsubscriber;
    };
    error: {
        subscribe: (this: void, run: import("svelte/store").Subscriber<unknown>, invalidate?: import("svelte/store").Invalidator<unknown> | undefined) => import("svelte/store").Unsubscriber;
    };
    session: Readable<ConnectSession | null>;
};
export declare function usePreviewTransactionStore(): {
    preview: Readable<TransactionPreview | null>;
    respond: (approve: boolean) => void;
    isPending: Readable<boolean>;
};
export declare function usePreviewAuthEntryStore(): {
    preview: Readable<AuthEntryPreview | null>;
    respond: (approve: boolean) => void;
    isPending: Readable<boolean>;
};
export declare const useStatus: typeof useStatusStore;
export declare const useSession: typeof useSessionStore;
export declare const useSessions: typeof useSessionsStore;
export declare const useAddress: typeof useAddressStore;
export declare const usePendingSignCount: typeof usePendingSignCountStore;
export declare const useConnect: typeof useConnectStore;
export declare const useSignTransaction: typeof useSignTransactionStore;
export declare const useSignMessage: typeof useSignMessageStore;
export declare const useSignIn: typeof useSignInStore;
export declare const useSoroban: typeof useSorobanStore;
export declare const usePreviewTransaction: typeof usePreviewTransactionStore;
export declare const usePreviewAuthEntry: typeof usePreviewAuthEntryStore;
//# sourceMappingURL=index.d.ts.map