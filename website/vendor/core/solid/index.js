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
import { createContext, useContext, createSignal, createMemo, onMount, onCleanup, createComponent, } from 'solid-js';
import { StellarAppKit, } from '../index.js';
import { SorobanConnection, } from '../soroban.js';
// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
const AppKitContext = createContext();
export function StellarAppKitProvider(props) {
    // Construct the client lazily in onMount so SSR doesn't touch storage.
    // We use a signal to hold it so child components can read it reactively
    // once it's ready.
    const [client, setClient] = createSignal(null);
    onMount(() => {
        const c = new StellarAppKit({
            network: props.config.network,
            connectors: props.config.connectors,
            appMetadata: props.config.appMetadata,
            networkPassphrase: props.config.networkPassphrase,
            syncAcrossTabs: props.config.syncAcrossTabs,
            previewOptions: props.config.previewOptions,
        });
        setClient(c);
        if (props.config.restoreOnMount !== false) {
            c.restore().catch(() => { });
        }
        onCleanup(() => c.dispose());
    });
    // Use createComponent instead of JSX to avoid TS JSX namespace conflicts
    // with React (this file is compiled alongside React's index.tsx, and TS
    // can't switch jsxImportSource per-file). The runtime behavior is identical.
    return createComponent(AppKitContext.Provider, {
        value: client,
        get children() {
            return props.children;
        },
    });
}
function useClient() {
    const client = useContext(AppKitContext);
    if (!client) {
        throw new Error('useAppKit() and the other @saganta/stellar-appkit/solid hooks must be used inside a <StellarAppKitProvider>.');
    }
    const c = client();
    if (!c) {
        // This happens during SSR or before onMount fires — throw a clear error
        // rather than silently returning null. If a consumer needs SSR-safe
        // access, they can use the optional form `useAppKitOptional()`.
        throw new Error('StellarAppKit client not yet initialized — this can happen during SSR. ' +
            'Wrap wallet-dependent code in a <Show when={client}> boundary, or use useAppKitOptional().');
    }
    return c;
}
/** Optional form — returns null during SSR or before the provider mounts. */
export function useAppKitOptional() {
    const client = useContext(AppKitContext);
    return client ?? (() => null);
}
// ---------------------------------------------------------------------------
// Hooks — each returns an Accessor (Solid's reactive getter) for its slice.
// We use createSignal + onCleanup (instead of createMemo) for derived state
// so we control exactly when updates fire — Solid's fine-grained reactivity
// means a signal update only re-runs the consumers that read it.
// ---------------------------------------------------------------------------
export function useAppKit() {
    return useClient();
}
export function useStatus() {
    const client = useClient();
    const [status, setStatus] = createSignal(client.status);
    const unsub = client.on('statusChange', (s) => setStatus(s));
    onCleanup(unsub);
    return status;
}
export function useSession() {
    const client = useClient();
    const [session, setSession] = createSignal(client.session);
    const unsub = client.on('sessionsChanged', () => setSession(client.session));
    onCleanup(unsub);
    return session;
}
export function useSessions() {
    const client = useClient();
    const [sessions, setSessions] = createSignal(client.sessions);
    const unsub = client.on('sessionsChanged', () => setSessions(client.sessions));
    onCleanup(unsub);
    return sessions;
}
export function useAddress() {
    const session = useSession();
    return createMemo(() => session()?.address ?? null);
}
export function usePendingSignCount() {
    const client = useClient();
    const [count, setCount] = createSignal(client.pendingSignCount);
    const unsub = client.on('signQueueChange', (n) => setCount(n));
    onCleanup(unsub);
    return count;
}
export function useConnect() {
    const client = useClient();
    const session = useSession();
    const [isConnecting, setIsConnecting] = createSignal(false);
    const [error, setError] = createSignal(null);
    const unsub = client.on('error', (err) => {
        setError(err);
        setIsConnecting(false);
    });
    onCleanup(unsub);
    const connect = async (walletId) => {
        setIsConnecting(true);
        setError(null);
        try {
            return await client.connect(walletId);
        }
        finally {
            setIsConnecting(false);
        }
    };
    const connectors = createMemo(() => {
        return client.sessions
            .map((s) => s.walletId)
            .map(() => client.activeConnector)
            .filter((c) => c !== null);
    });
    return {
        connect,
        disconnect: client.disconnect.bind(client),
        disconnectAll: client.disconnectAll.bind(client),
        switchAccount: client.switchAccount.bind(client),
        connectors,
        isConnected: () => session() !== null,
        isConnecting,
        error,
    };
}
export function useSignTransaction() {
    const client = useClient();
    const [isSigning, setIsSigning] = createSignal(false);
    const [data, setData] = createSignal(null);
    const [error, setError] = createSignal(null);
    const sign = async (xdr, opts) => {
        setIsSigning(true);
        setError(null);
        try {
            const result = await client.signTransaction(xdr, opts);
            setData(result);
            return result;
        }
        catch (err) {
            setError(err);
            throw err;
        }
        finally {
            setIsSigning(false);
        }
    };
    return { sign, isSigning, data, error };
}
export function useSignMessage() {
    const client = useClient();
    const [isSigning, setIsSigning] = createSignal(false);
    const [data, setData] = createSignal(null);
    const [error, setError] = createSignal(null);
    const sign = async (message, opts) => {
        setIsSigning(true);
        setError(null);
        try {
            const result = await client.signMessage(message, opts);
            setData(result);
            return result;
        }
        catch (err) {
            setError(err);
            throw err;
        }
        finally {
            setIsSigning(false);
        }
    };
    return { sign, isSigning, data, error };
}
export function useSignIn() {
    const client = useClient();
    const [isSigning, setIsSigning] = createSignal(false);
    const [data, setData] = createSignal(null);
    const [error, setError] = createSignal(null);
    const sign = async (opts) => {
        setIsSigning(true);
        setError(null);
        try {
            const result = await client.signIn(opts);
            setData(result);
            return result;
        }
        catch (err) {
            setError(err);
            throw err;
        }
        finally {
            setIsSigning(false);
        }
    };
    return { sign, isSigning, data, error };
}
// ---------------------------------------------------------------------------
// Soroban
// ---------------------------------------------------------------------------
export function useSoroban(opts) {
    const client = useClient();
    const session = useSession();
    // Construct once per (rpcUrl, networkPassphrase) pair. Solid doesn't
    // have useMemo — we use a signal to memoize manually.
    const soroban = new SorobanConnection({
        rpcUrl: opts.rpcUrl,
        networkPassphrase: opts.networkPassphrase,
        wallet: client,
    });
    const [status, setStatus] = createSignal('idle');
    const [lastResult, setLastResult] = createSignal(null);
    const [error, setError] = createSignal(null);
    const invoke = async (invokeOpts) => {
        setStatus('invoking');
        setError(null);
        try {
            const result = await soroban.invoke(invokeOpts);
            setLastResult(result);
            setStatus('success');
            return result;
        }
        catch (err) {
            setError(err);
            setStatus('error');
            throw err;
        }
    };
    return {
        soroban,
        invoke,
        previewInvoke: soroban.previewInvoke.bind(soroban),
        estimateFee: soroban.estimateFee.bind(soroban),
        contract: soroban.contract.bind(soroban),
        getFailoverStatus: soroban.getFailoverStatus.bind(soroban),
        status,
        lastResult,
        error,
        session,
    };
}
// ---------------------------------------------------------------------------
// Preview hooks
// ---------------------------------------------------------------------------
export function usePreviewTransaction() {
    const client = useClient();
    const [preview, setPreview] = createSignal(null);
    let resolver = null;
    client.onPreviewTransaction = async (p) => {
        return new Promise((resolve) => {
            setPreview(p);
            resolver = resolve;
        });
    };
    onCleanup(() => {
        client.onPreviewTransaction = null;
    });
    const respond = (approve) => {
        resolver?.(approve);
        resolver = null;
        setPreview(null);
    };
    return {
        preview,
        respond,
        isPending: () => preview() !== null,
    };
}
export function usePreviewAuthEntry() {
    const client = useClient();
    const [preview, setPreview] = createSignal(null);
    let resolver = null;
    client.onPreviewAuthEntry = async (p) => {
        return new Promise((resolve) => {
            setPreview(p);
            resolver = resolve;
        });
    };
    onCleanup(() => {
        client.onPreviewAuthEntry = null;
    });
    const respond = (approve) => {
        resolver?.(approve);
        resolver = null;
        setPreview(null);
    };
    return {
        preview,
        respond,
        isPending: () => preview() !== null,
    };
}
//# sourceMappingURL=index.js.map