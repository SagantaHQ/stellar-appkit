/**
 * Vue 3 Composition API bindings for @saganta/stellar-appkit.
 *
 * Mirrors the React wrapper's hook surface, translated to Vue's reactivity
 * primitives (ref/computed/readonly) instead of React's useState/useMemo.
 *
 * Architecture:
 *
 * 1. `provideStellarAppKit(config)` — call inside a component's setup()
 *    to construct a single StellarAppKit instance and provide() it to
 *    descendant components. Alternatively, `installStellarAppKit(app, config)`
 *    registers the client as a Vue plugin (app.provide) for use across
 *    the whole app via `app.use()`.
 *
 * 2. `useAppKit()`, `useSession()`, `useConnect()`, etc. — composables
 *    that inject() the client and return reactive refs. Each composable
 *    subscribes to the relevant slice of the client's event emitter and
 *    updates its ref on change.
 *
 * Tree-shakability: this subpath is a separate module — bundlers only
 * pull it in if the consumer actually imports `@saganta/stellar-appkit/vue`.
 *
 * SSR safety: the composables don't touch `window` or `localStorage` at
 * setup time. The underlying StellarAppKit instance accesses storage
 * lazily (only on actual connect/restore calls), so server-side render
 * won't crash on storage access.
 */
import { type InjectionKey, type Ref, type ComputedRef } from 'vue';
import { StellarAppKit, type ConnectSession, type ConnectStatus, type StellarAppKitEvents, type WalletConnector, type StellarNetwork, type PreviewOptions, type TransactionPreview, type AuthEntryPreview, type SignInResult, type SignMessageResult, type SignTransactionResult, type SignTxOptions, type SignOptions } from '../index.js';
import { SorobanConnection, type InvokeOptions, type InvokeResult } from '../soroban.js';
export declare const APPKIT_INJECTION_KEY: InjectionKey<StellarAppKit>;
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
    /** Restore any persisted session on mount. Default: true. */
    restoreOnMount?: boolean;
}
/**
 * Construct a StellarAppKit instance and provide() it to descendants.
 * Call this inside a root component's setup():
 *
 * ```ts
 * import { provideStellarAppKit } from '@saganta/stellar-appkit/vue';
 * export default defineComponent({
 *   setup() {
 *     provideStellarAppKit({ network: 'TESTNET', connectors: [...] });
 *     return {};
 *   }
 * });
 * ```
 *
 * Returns the client so the caller can also use it directly if needed.
 */
export declare function provideStellarAppKit(config: StellarAppKitConfig): StellarAppKit;
/**
 * Vue plugin form — for `app.use()`:
 *
 * ```ts
 * import { createApp } from 'vue';
 * import { StellarAppKitPlugin } from '@saganta/stellar-appkit/vue';
 * const app = createApp(App);
 * app.use(StellarAppKitPlugin, { network: 'TESTNET', connectors: [...] });
 * ```
 *
 * Note: when used as a plugin, `restoreOnMount` is honored by calling
 * `restore()` immediately on install. If you want to defer restore to a
 * specific component mount, use `provideStellarAppKit` instead.
 */
export declare const StellarAppKitPlugin: {
    install(app: {
        provide: (key: unknown, value: unknown) => void;
    }, config: StellarAppKitConfig): void;
};
/** Returns the StellarAppKit client instance. */
export declare function useAppKit(): StellarAppKit;
/** Reactive status: 'idle' | 'selecting' | 'connecting' | 'connected' | 'error'. */
export declare function useStatus(): Readonly<Ref<ConnectStatus>>;
/** Reactive active session (or null). */
export declare function useSession(): Readonly<Ref<ConnectSession | null>>;
/** Reactive list of all connected sessions (active + inactive). */
export declare function useSessions(): Readonly<Ref<ConnectSession[]>>;
/** Convenience: the active session's address (or null). */
export declare function useAddress(): ComputedRef<string | null>;
/** Reactive count of sign requests currently queued. */
export declare function usePendingSignCount(): Readonly<Ref<number>>;
export interface UseConnectResult {
    connect: (walletId: string) => Promise<ConnectSession>;
    disconnect: (walletId?: string) => Promise<void>;
    disconnectAll: () => Promise<void>;
    switchAccount: (walletId: string, address?: string) => Promise<ConnectSession>;
    connectors: ComputedRef<WalletConnector[]>;
    isConnected: ComputedRef<boolean>;
    isConnecting: Readonly<Ref<boolean>>;
    error: Readonly<Ref<StellarAppKitEvents['error'] | null>>;
}
export declare function useConnect(): UseConnectResult;
export interface UseSignResult<T> {
    sign: (...args: never[]) => Promise<T>;
    isSigning: Readonly<Ref<boolean>>;
    data: Readonly<Ref<T | null>>;
    error: Readonly<Ref<unknown>>;
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
    status: Readonly<Ref<"error" | "idle" | "invoking" | "success", "error" | "idle" | "invoking" | "success">>;
    lastResult: Readonly<import("vue").ShallowRef<InvokeResult | null, InvokeResult | null>>;
    error: Readonly<Ref<unknown, unknown>>;
    session: Readonly<Ref<ConnectSession | null, ConnectSession | null>>;
};
export declare function usePreviewTransaction(): {
    preview: Readonly<Ref<TransactionPreview | null>>;
    respond: (approve: boolean) => void;
    isPending: ComputedRef<boolean>;
};
export declare function usePreviewAuthEntry(): {
    preview: Readonly<Ref<AuthEntryPreview | null>>;
    respond: (approve: boolean) => void;
    isPending: ComputedRef<boolean>;
};
//# sourceMappingURL=index.d.ts.map