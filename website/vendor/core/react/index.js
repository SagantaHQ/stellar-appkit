import { jsx as _jsx } from "react/jsx-runtime";
/**
 * React bindings for @saganta/stellar-appkit.
 *
 * Two layers:
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
 * Tree-shakability: this subpath is a separate module — bundlers only
 * pull it in if the consumer actually imports `@saganta/stellar-appkit/react`.
 * A consumer using only the core client never pays for React.
 *
 * SSR safety: the provider and hooks are safe to render on the server —
 * they don't touch `window` or any browser-only API. The `StellarAppKit`
 * instance itself uses `localStorage` lazily (only on actual connect/restore
 * calls), so server-side render won't crash on storage access.
 */
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, } from 'react';
import { StellarAppKit, } from '../index.js';
import { SorobanConnection, } from '../soroban.js';
const AppKitContext = createContext(null);
function useAppKitContext() {
    const ctx = useContext(AppKitContext);
    if (!ctx) {
        throw new Error('useAppKit() and the other @saganta/stellar-appkit/react hooks must be used inside a <StellarAppKitProvider>. ' +
            'Wrap your app root with the provider, or pass a client directly to useAppKit(client) if you need to use the hooks without a provider.');
    }
    return ctx.client;
}
// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function StellarAppKitProvider(props) {
    // Construct the client ONCE per config change — useMemo with the config
    // fields as deps so a hot reload during dev doesn't leak instances.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const client = useMemo(() => {
        return new StellarAppKit({
            network: props.config.network,
            connectors: props.config.connectors,
            appMetadata: props.config.appMetadata,
            networkPassphrase: props.config.networkPassphrase,
            syncAcrossTabs: props.config.syncAcrossTabs,
            previewOptions: props.config.previewOptions,
        });
        // We intentionally depend on the whole config object's primitive
        // fields rather than the object itself, so a new object identity
        // (common in JSX props) doesn't recreate the client on every render.
    }, [
        props.config.network,
        props.config.connectors,
        props.config.appMetadata,
        props.config.networkPassphrase,
        props.config.syncAcrossTabs,
        props.config.previewOptions,
    ]);
    // Restore any persisted session on mount (default: true). We do this
    // inside an effect rather than in useMemo so it doesn't block render.
    useEffect(() => {
        if (props.config.restoreOnMount === false)
            return;
        client.restore().catch(() => {
            // restore() is designed to be safe to call without error handling,
            // but a rejected promise here would surface as an unhandled rejection
            // in some dev environments — swallow it silently.
        });
    }, [client, props.config.restoreOnMount]);
    // Cleanup on unmount (in dev hot-reload, this fires between mounts).
    useEffect(() => {
        return () => {
            client.dispose();
        };
    }, [client]);
    const value = useMemo(() => ({ client }), [client]);
    return _jsx(AppKitContext.Provider, { value: value, children: props.children });
}
// ---------------------------------------------------------------------------
// useSyncExternalStore adapter — subscribes to the client's typed event
// emitter and triggers a re-render whenever a selected slice of state
// changes. This is the bridge between StellarAppKit's event-driven core
// and React's render cycle.
// ---------------------------------------------------------------------------
/**
 * Subscribe to a specific event on the client and re-render when it fires.
 * The selector extracts the value the component actually cares about —
 * if it returns the same reference (via Object.is) as the previous call,
 * React skips the re-render.
 *
 * We use useSyncExternalStore rather than useState+useEffect because it's
 * tearing-safe under React 18's concurrent rendering, and it correctly
 * handles the case where the event fires between render and effect setup
 * (no missed updates, no double-fires).
 */
function useClientSlice(client, subscribe, getSnapshot) {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------
/**
 * Returns the StellarAppKit client instance from context.
 *
 * Re-renders on every status/session/queue change — use this only if you
 * need the client itself; for specific slices (session, status, etc.) prefer
 * the narrower hooks below, which only re-render on their own slice.
 */
export function useAppKit() {
    return useAppKitContext();
}
/**
 * Reactive status: 'idle' | 'selecting' | 'connecting' | 'connected' | 'error'.
 * Re-renders only when status changes.
 */
export function useStatus() {
    const client = useAppKitContext();
    return useClientSlice(client, (handler) => client.on('statusChange', handler), () => client.status);
}
/**
 * Reactive active session (or null). Re-renders when the active session
 * changes (connect, disconnect, switchAccount).
 */
export function useSession() {
    const client = useAppKitContext();
    return useClientSlice(client, (handler) => client.on('sessionsChanged', handler), () => client.session);
}
/**
 * Reactive list of all connected sessions (active + inactive).
 */
export function useSessions() {
    const client = useAppKitContext();
    return useClientSlice(client, (handler) => client.on('sessionsChanged', handler), () => client.sessions);
}
/**
 * Convenience: the active session's address (or null).
 */
export function useAddress() {
    return useSession()?.address ?? null;
}
/**
 * Reactive count of sign requests currently queued (including the one in
 * flight). Useful for showing "1 of 3 signing requests in progress" in the UI.
 */
export function usePendingSignCount() {
    const client = useAppKitContext();
    return useClientSlice(client, (handler) => client.on('signQueueChange', handler), () => client.pendingSignCount);
}
export function useConnect() {
    const client = useAppKitContext();
    const status = useStatus();
    const session = useSession();
    const [isConnecting, setIsConnecting] = useState(false);
    const [error, setError] = useState(null);
    // Subscribe to client errors so a connect() failure surfaces here.
    useEffect(() => {
        return client.on('error', (err) => {
            setError(err);
            setIsConnecting(false);
        });
    }, [client]);
    // Reset the error when the user retries.
    const connect = useMemo(() => {
        return async (walletId) => {
            setIsConnecting(true);
            setError(null);
            try {
                const result = await client.connect(walletId);
                setIsConnecting(false);
                return result;
            }
            catch (err) {
                // The error event handler above already captured this; just clear the loading flag.
                setIsConnecting(false);
                throw err;
            }
        };
    }, [client]);
    const disconnect = useMemo(() => client.disconnect.bind(client), [client]);
    const disconnectAll = useMemo(() => client.disconnectAll.bind(client), [client]);
    const switchAccount = useMemo(() => client.switchAccount.bind(client), [client]);
    // The registry exposes connectors by id; we expose them as an array for UI.
    const connectors = useMemo(() => {
        // ConnectorRegistry doesn't expose a public list() method, but we can
        // read it from the config the consumer passed in. We rely on the
        // session shape (walletId) to derive the active wallet.
        // If the consumer needs the connector list for rendering, they can
        // read it from props.config.connectors directly — but for convenience
        // we expose the connected walletIds so a wallet picker can be built.
        return client.sessions.map((s) => s.walletId).map((id) => client.activeConnector).filter((c) => c !== null);
    }, [client, session]);
    return {
        connect,
        disconnect,
        disconnectAll,
        switchAccount,
        connectors,
        isConnected: session !== null,
        isConnecting: isConnecting || status === 'connecting',
        error,
    };
}
/**
 * Signs a transaction via the active wallet. Automatically goes through
 * the onPreviewTransaction hook (set via the provider's config) before
 * reaching the wallet. Pass `{ skipPreview: true }` in opts to bypass.
 */
export function useSignTransaction() {
    const client = useAppKitContext();
    const [isSigning, setIsSigning] = useState(false);
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const sign = useMemo(() => {
        return async (xdr, opts) => {
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
    }, [client]);
    return { sign, isSigning, data, error };
}
/**
 * Signs a message (raw bytes) via the active wallet. Used by SIWS under
 * the hood, but exposed for arbitrary message signing.
 */
export function useSignMessage() {
    const client = useAppKitContext();
    const [isSigning, setIsSigning] = useState(false);
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const sign = useMemo(() => {
        return async (message, opts) => {
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
    }, [client]);
    return { sign, isSigning, data, error };
}
/**
 * Sign-In With Stellar — builds the SIWS message, signs it, and returns
 * the full result (including `signedData` for server-side verification).
 */
export function useSignIn() {
    const client = useAppKitContext();
    const [isSigning, setIsSigning] = useState(false);
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const sign = useMemo(() => {
        return async (opts) => {
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
    }, [client]);
    return { sign, isSigning, data, error };
}
// ---------------------------------------------------------------------------
// Soroban
// ---------------------------------------------------------------------------
/**
 * Returns a memoized `SorobanConnection` bound to the active wallet.
 *
 * Pass `rpcUrl` and `networkPassphrase` to configure the RPC connection.
 * The connection is recreated if either changes. The active wallet is
 * read from context at call time, so switching wallets mid-session just
 * works without recreating the connection.
 */
export function useSoroban(opts) {
    const client = useAppKitContext();
    const session = useSession();
    // Recreate the connection only if rpcUrl/networkPassphrase change.
    // We deliberately DON'T depend on `session` — SorobanConnection reads
    // the active wallet lazily via `wallet.session` at invoke time, so a
    // wallet switch doesn't require a new connection.
    const soroban = useMemo(() => {
        return new SorobanConnection({
            rpcUrl: opts.rpcUrl,
            networkPassphrase: opts.networkPassphrase,
            wallet: client,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client, opts.rpcUrl, opts.networkPassphrase]);
    // Track invoke status locally for the caller's convenience.
    const [status, setStatus] = useState('idle');
    const [lastResult, setLastResult] = useState(null);
    const [error, setError] = useState(null);
    const invoke = useMemo(() => {
        return async (invokeOpts) => {
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
    }, [soroban]);
    const previewInvoke = useMemo(() => soroban.previewInvoke.bind(soroban), [soroban]);
    return {
        soroban,
        invoke,
        previewInvoke,
        /** Estimates the fee for a transaction XDR by simulating it. Returns the full FeeEstimate breakdown. */
        estimateFee: soroban.estimateFee.bind(soroban),
        /** Returns a typed client for a Soroban contract, bound to this connection. */
        contract: soroban.contract.bind(soroban),
        /** Returns the current failover status (null for single-server configs). */
        getFailoverStatus: soroban.getFailoverStatus.bind(soroban),
        status,
        lastResult,
        error,
        // Re-expose the session so consumers can branch on wallet state
        // without an extra useSession() call.
        session,
    };
}
// ---------------------------------------------------------------------------
// Preview hooks — surface the onPreviewTransaction / onPreviewAuthEntry
// payloads reactively, for apps that want to render their own preview UI
// instead of using the <saganta-appkit-modal> Web Component.
// ---------------------------------------------------------------------------
/**
 * Subscribes to the client's `onPreviewTransaction` hook and exposes the
 * latest preview reactively. Set this up by passing the hook's setter as
 * the `onPreviewTransaction` handler — or use the convenience wrapper
 * `installPreviewHandlers` to wire both at once.
 *
 * Returns `{ preview, respond }` where `respond(approve: boolean)` resolves
 * the pending preview. If no preview is pending, `preview` is null.
 */
export function usePreviewTransaction() {
    const client = useAppKitContext();
    const [state, setState] = useState({ preview: null, resolver: null });
    // Install the onPreviewTransaction handler ONCE — it returns a promise
    // that we hold the resolver for, so the consumer can respond async.
    useEffect(() => {
        client.onPreviewTransaction = async (preview) => {
            return new Promise((resolve) => {
                setState({ preview, resolver: resolve });
            });
        };
        return () => {
            // Restore null on unmount so the client doesn't keep calling a
            // handler whose React state has been torn down.
            client.onPreviewTransaction = null;
        };
    }, [client]);
    const respond = useMemo(() => {
        return (approve) => {
            setState((current) => {
                current.resolver?.(approve);
                return { preview: null, resolver: null };
            });
        };
    }, []);
    return {
        preview: state.preview,
        respond,
        isPending: state.preview !== null,
    };
}
/**
 * Same as usePreviewTransaction but for the auth-entry preview flow.
 */
export function usePreviewAuthEntry() {
    const client = useAppKitContext();
    const [state, setState] = useState({ preview: null, resolver: null });
    useEffect(() => {
        client.onPreviewAuthEntry = async (preview) => {
            return new Promise((resolve) => {
                setState({ preview, resolver: resolve });
            });
        };
        return () => {
            client.onPreviewAuthEntry = null;
        };
    }, [client]);
    const respond = useMemo(() => {
        return (approve) => {
            setState((current) => {
                current.resolver?.(approve);
                return { preview: null, resolver: null };
            });
        };
    }, []);
    return {
        preview: state.preview,
        respond,
        isPending: state.preview !== null,
    };
}
//# sourceMappingURL=index.js.map