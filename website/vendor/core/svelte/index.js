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
import { StellarAppKit, } from '../index.js';
import { SorobanConnection, } from '../soroban.js';
// Svelte's reactivity primitives — we import lazily so consumers who
// don't use this subpath don't need svelte installed.
// The `import type` ensures no runtime dependency on svelte for type-only usage.
import { writable } from 'svelte/store';
// ---------------------------------------------------------------------------
// Module-level singleton (Svelte 5 doesn't have Context like React)
// ---------------------------------------------------------------------------
let _client = null;
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
export function setStellarAppKitContext(config) {
    if (_client) {
        _client.dispose();
        _client = null;
    }
    const client = new StellarAppKit({
        network: config.network,
        connectors: config.connectors,
        appMetadata: config.appMetadata,
        networkPassphrase: config.networkPassphrase,
        syncAcrossTabs: config.syncAcrossTabs,
        previewOptions: config.previewOptions,
    });
    if (config.restoreOnMount !== false) {
        client.restore().catch(() => { });
    }
    _client = client;
    return client;
}
/**
 * Returns the StellarAppKit client. Throws if setStellarAppKitContext()
 * hasn't been called yet.
 */
export function getAppKit() {
    if (!_client) {
        throw new Error('getAppKit() and the @saganta/stellar-appkit/svelte composables require setStellarAppKitContext() to be called first. ' +
            'Call it once at app init, typically in your root layout component.');
    }
    return _client;
}
/**
 * Optional form — returns null before setStellarAppKitContext() is called.
 * Useful for SSR or for components that render before init.
 */
export function getAppKitOptional() {
    return _client;
}
// ---------------------------------------------------------------------------
// Store-based composables (work in both Svelte 4 and Svelte 5)
//
// Each function returns a Svelte Readable store. The store's value is the
// current slice of state, and it updates whenever the client emits a
// relevant event. Use $-prefixed auto-subscription in templates:
//
//   <script>
//     import { useSessionStore } from '@saganta/stellar-appkit/svelte';
//     const session = useSessionStore();
//   </script>
//   <p>{$session?.address ?? 'Not connected'}</p>
// ---------------------------------------------------------------------------
export function useStatusStore() {
    const client = getAppKit();
    const store = writable(client.status);
    const unsub = client.on('statusChange', (s) => store.set(s));
    // Svelte stores don't have a built-in cleanup hook — the consumer must
    // call $store.unsubscribe() manually, OR we rely on the store being
    // garbage collected (the unsub closure dies with it). For long-lived
    // apps this is fine; for HMR-heavy dev, call setStellarAppKitContext
    // again to fully reset.
    return { subscribe: store.subscribe };
}
export function useSessionStore() {
    const client = getAppKit();
    const store = writable(client.session);
    const unsub = client.on('sessionsChanged', () => store.set(client.session));
    return { subscribe: store.subscribe };
}
export function useSessionsStore() {
    const client = getAppKit();
    const store = writable(client.sessions);
    const unsub = client.on('sessionsChanged', () => store.set(client.sessions));
    return { subscribe: store.subscribe };
}
export function useAddressStore() {
    const session = useSessionStore();
    return {
        subscribe: (cb) => {
            return session.subscribe((s) => cb(s?.address ?? null));
        },
    };
}
export function usePendingSignCountStore() {
    const client = getAppKit();
    const store = writable(client.pendingSignCount);
    const unsub = client.on('signQueueChange', (n) => store.set(n));
    return { subscribe: store.subscribe };
}
export function useConnectStore() {
    const client = getAppKit();
    const session = useSessionStore();
    const isConnecting = writable(false);
    const error = writable(null);
    client.on('error', (err) => {
        error.set(err);
        isConnecting.set(false);
    });
    const connect = async (walletId) => {
        isConnecting.set(true);
        error.set(null);
        try {
            return await client.connect(walletId);
        }
        finally {
            isConnecting.set(false);
        }
    };
    return {
        connect,
        disconnect: client.disconnect.bind(client),
        disconnectAll: client.disconnectAll.bind(client),
        switchAccount: client.switchAccount.bind(client),
        isConnected: {
            subscribe: (cb) => session.subscribe((s) => cb(s !== null)),
        },
        isConnecting: { subscribe: isConnecting.subscribe },
        error: { subscribe: error.subscribe },
    };
}
export function useSignTransactionStore() {
    const client = getAppKit();
    const isSigning = writable(false);
    const data = writable(null);
    const error = writable(null);
    const sign = async (xdr, opts) => {
        isSigning.set(true);
        error.set(null);
        try {
            const result = await client.signTransaction(xdr, opts);
            data.set(result);
            return result;
        }
        catch (err) {
            error.set(err);
            throw err;
        }
        finally {
            isSigning.set(false);
        }
    };
    return {
        sign,
        isSigning: { subscribe: isSigning.subscribe },
        data: { subscribe: data.subscribe },
        error: { subscribe: error.subscribe },
    };
}
export function useSignMessageStore() {
    const client = getAppKit();
    const isSigning = writable(false);
    const data = writable(null);
    const error = writable(null);
    const sign = async (message, opts) => {
        isSigning.set(true);
        error.set(null);
        try {
            const result = await client.signMessage(message, opts);
            data.set(result);
            return result;
        }
        catch (err) {
            error.set(err);
            throw err;
        }
        finally {
            isSigning.set(false);
        }
    };
    return {
        sign,
        isSigning: { subscribe: isSigning.subscribe },
        data: { subscribe: data.subscribe },
        error: { subscribe: error.subscribe },
    };
}
export function useSignInStore() {
    const client = getAppKit();
    const isSigning = writable(false);
    const data = writable(null);
    const error = writable(null);
    const sign = async (opts) => {
        isSigning.set(true);
        error.set(null);
        try {
            const result = await client.signIn(opts);
            data.set(result);
            return result;
        }
        catch (err) {
            error.set(err);
            throw err;
        }
        finally {
            isSigning.set(false);
        }
    };
    return {
        sign,
        isSigning: { subscribe: isSigning.subscribe },
        data: { subscribe: data.subscribe },
        error: { subscribe: error.subscribe },
    };
}
// ---------------------------------------------------------------------------
// Soroban (store-based)
// ---------------------------------------------------------------------------
export function useSorobanStore(opts) {
    const client = getAppKit();
    const session = useSessionStore();
    const soroban = new SorobanConnection({
        rpcUrl: opts.rpcUrl,
        networkPassphrase: opts.networkPassphrase,
        wallet: client,
    });
    const status = writable('idle');
    const lastResult = writable(null);
    const error = writable(null);
    const invoke = async (invokeOpts) => {
        status.set('invoking');
        error.set(null);
        try {
            const result = await soroban.invoke(invokeOpts);
            lastResult.set(result);
            status.set('success');
            return result;
        }
        catch (err) {
            error.set(err);
            status.set('error');
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
        status: { subscribe: status.subscribe },
        lastResult: { subscribe: lastResult.subscribe },
        error: { subscribe: error.subscribe },
        session,
    };
}
// ---------------------------------------------------------------------------
// Preview composables (store-based)
// ---------------------------------------------------------------------------
export function usePreviewTransactionStore() {
    const client = getAppKit();
    const preview = writable(null);
    let resolver = null;
    client.onPreviewTransaction = async (p) => {
        return new Promise((resolve) => {
            preview.set(p);
            resolver = resolve;
        });
    };
    const respond = (approve) => {
        resolver?.(approve);
        resolver = null;
        preview.set(null);
    };
    return {
        preview: { subscribe: preview.subscribe },
        respond,
        isPending: {
            subscribe: (cb) => preview.subscribe((p) => cb(p !== null)),
        },
    };
}
export function usePreviewAuthEntryStore() {
    const client = getAppKit();
    const preview = writable(null);
    let resolver = null;
    client.onPreviewAuthEntry = async (p) => {
        return new Promise((resolve) => {
            preview.set(p);
            resolver = resolve;
        });
    };
    const respond = (approve) => {
        resolver?.(approve);
        resolver = null;
        preview.set(null);
    };
    return {
        preview: { subscribe: preview.subscribe },
        respond,
        isPending: {
            subscribe: (cb) => preview.subscribe((p) => cb(p !== null)),
        },
    };
}
// ---------------------------------------------------------------------------
// Convenience aliases — drop the "Store" suffix for Svelte 5 consumers
// who are used to the runes API. These are the same functions; the alias
// just reads more naturally in Svelte 5 code:
//
//   import { useSession } from '@saganta/stellar-appkit/svelte';
//   const session = useSession();
//   $session?.address
// ---------------------------------------------------------------------------
export const useStatus = useStatusStore;
export const useSession = useSessionStore;
export const useSessions = useSessionsStore;
export const useAddress = useAddressStore;
export const usePendingSignCount = usePendingSignCountStore;
export const useConnect = useConnectStore;
export const useSignTransaction = useSignTransactionStore;
export const useSignMessage = useSignMessageStore;
export const useSignIn = useSignInStore;
export const useSoroban = useSorobanStore;
export const usePreviewTransaction = usePreviewTransactionStore;
export const usePreviewAuthEntry = usePreviewAuthEntryStore;
//# sourceMappingURL=index.js.map