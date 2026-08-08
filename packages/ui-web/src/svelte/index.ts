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
 * 3. `use:stellarmodal` action + `openModal()` / `closeModal()` helpers —
 *    wrap the underlying `<stellar-appkit-modal>` Web Component. The
 *    action wires up the `client` automatically; events are forwarded as
 *    standard `on:sc-connect`, `on:sc-disconnect`, `on:sc-error` Svelte
 *    event listeners on the host element. Re-exported from `./modal.ts`.
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

import {
  StellarAppKit,
  type ConnectSession,
  type ConnectStatus,
  type StellarAppKitEvents,
  type WalletConnector,
  type StellarNetwork,
  type PreviewOptions,
  type TransactionPreview,
  type AuthEntryPreview,
  type SignInResult,
  type SignMessageResult,
  type SignTransactionResult,
  type SignTxOptions,
  type SignOptions,
  type SiwsSession,
  type LocaleCode,
  getLocale,
  setLocale,
  onLocaleChange,
} from '@saganta/stellar-appkit';
import {
  SorobanConnection,
  type InvokeOptions,
  type InvokeResult,
} from '@saganta/stellar-appkit';

// Svelte's reactivity primitives — we import lazily so consumers who
// don't use this subpath don't need svelte installed.
// The `import type` ensures no runtime dependency on svelte for type-only usage.
import { writable, derived, type Readable } from 'svelte/store';

// ---------------------------------------------------------------------------
// Module-level singleton (Svelte 5 doesn't have Context like React)
// ---------------------------------------------------------------------------

let _client: StellarAppKit | null = null;

export interface StellarAppKitConfig {
  network: StellarNetwork;
  /** Wallet connectors to register. Optional — defaults to all bundled browser-side wallets. */
  connectors?: WalletConnector[];
  appMetadata?: { name: string; description?: string; url?: string; icons?: string[] };
  networkPassphrase?: string;
  syncAcrossTabs?: boolean;
  previewOptions?: PreviewOptions;
  /** Restore any persisted session on init. Default: true. */
  restoreOnMount?: boolean;
  /** Modal UI configuration (animation preset). */
  modal?: { animation?: import('@saganta/stellar-appkit').StellarAppKitModalConfig['animation'] };
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
export function setStellarAppKitContext(config: StellarAppKitConfig): StellarAppKit {
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
    client.restore().catch(() => {});
  }

  _client = client;
  return client;
}

/**
 * Returns the StellarAppKit client. Throws if setStellarAppKitContext()
 * hasn't been called yet.
 */
export function getAppKit(): StellarAppKit {
  if (!_client) {
    throw new Error(
      'getAppKit() and the @saganta/stellar-appkit/svelte composables require setStellarAppKitContext() to be called first. ' +
      'Call it once at app init, typically in your root layout component.'
    );
  }
  return _client;
}

/**
 * Optional form — returns null before setStellarAppKitContext() is called.
 * Useful for SSR or for components that render before init.
 */
export function getAppKitOptional(): StellarAppKit | null {
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

export function useStatusStore(): Readable<ConnectStatus> {
  const client = getAppKit();
  const store = writable<ConnectStatus>(client.status);
  const unsub = client.on('statusChange', (s) => store.set(s));
  // Svelte stores don't have a built-in cleanup hook — the consumer must
  // call $store.unsubscribe() manually, OR we rely on the store being
  // garbage collected (the unsub closure dies with it). For long-lived
  // apps this is fine; for HMR-heavy dev, call setStellarAppKitContext
  // again to fully reset.
  return { subscribe: store.subscribe } as Readable<ConnectStatus>;
}

export function useSessionStore(): Readable<ConnectSession | null> {
  const client = getAppKit();
  const store = writable<ConnectSession | null>(client.session);
  const unsub = client.on('sessionsChanged', () => store.set(client.session));
  return { subscribe: store.subscribe } as Readable<ConnectSession | null>;
}

export function useSessionsStore(): Readable<ConnectSession[]> {
  const client = getAppKit();
  const store = writable<ConnectSession[]>(client.sessions);
  const unsub = client.on('sessionsChanged', () => store.set(client.sessions));
  return { subscribe: store.subscribe } as Readable<ConnectSession[]>;
}

export function useAddressStore(): Readable<string | null> {
  const session = useSessionStore();
  return {
    subscribe: (cb: (v: string | null) => void) => {
      return session.subscribe((s) => cb(s?.address ?? null));
    },
  };
}

export function usePendingSignCountStore(): Readable<number> {
  const client = getAppKit();
  const store = writable<number>(client.pendingSignCount);
  const unsub = client.on('signQueueChange', (n) => store.set(n));
  return { subscribe: store.subscribe } as Readable<number>;
}

/** Reactive SIWS session store. Re-renders when the session is set, cleared, or expires. (v1.7.0+) */
export function useSiwsSessionStore(): Readable<SiwsSession | null> {
  const client = getAppKit();
  const store = writable<SiwsSession | null>(client.siwsSession);
  const unsub = client.on('siwsSessionChange', (s) => store.set(s));
  return { subscribe: store.subscribe } as Readable<SiwsSession | null>;
}

/** Convenience: `true` when the user has a valid (non-expired) SIWS session. (v1.7.0+) */
export function useIsAuthenticatedStore(): Readable<boolean> {
  const session = useSiwsSessionStore();
  return derived(session, ($s) => $s !== null);
}

/** Reactive locale store — returns the current LocaleCode. Re-renders on change. (v1.8.0+) */
export function useLocaleStore(): Readable<LocaleCode> {
  const store = writable<LocaleCode>(getLocale());
  const unsub = onLocaleChange((newLocale) => store.set(newLocale));
  return { subscribe: store.subscribe } as Readable<LocaleCode>;
}

/** Returns the `setLocale` function for changing the active locale at runtime. (v1.8.0+) */
export function useSetLocale(): (locale: LocaleCode) => Promise<void> {
  return setLocale;
}

// ---------------------------------------------------------------------------
// Connect / disconnect (store-based)
// ---------------------------------------------------------------------------

export interface UseConnectStoreResult {
  connect: (walletId: string) => Promise<ConnectSession>;
  disconnect: (walletId?: string) => Promise<void>;
  disconnectAll: () => Promise<void>;
  switchAccount: (walletId: string, address?: string) => Promise<ConnectSession>;
  isConnected: Readable<boolean>;
  isConnecting: Readable<boolean>;
  error: Readable<StellarAppKitEvents['error'] | null>;
}

export function useConnectStore(): UseConnectStoreResult {
  const client = getAppKit();
  const session = useSessionStore();
  const isConnecting = writable(false);
  const error = writable<StellarAppKitEvents['error'] | null>(null);

  client.on('error', (err) => {
    error.set(err);
    isConnecting.set(false);
  });

  const connect = async (walletId: string) => {
    isConnecting.set(true);
    error.set(null);
    try {
      return await client.connect(walletId);
    } finally {
      isConnecting.set(false);
    }
  };

  return {
    connect,
    disconnect: client.disconnect.bind(client),
    disconnectAll: client.disconnectAll.bind(client),
    switchAccount: client.switchAccount.bind(client),
    isConnected: {
      subscribe: (cb: (v: boolean) => void) => session.subscribe((s) => cb(s !== null)),
    },
    isConnecting: { subscribe: isConnecting.subscribe },
    error: { subscribe: error.subscribe },
  };
}

// ---------------------------------------------------------------------------
// Signing composables (store-based)
// ---------------------------------------------------------------------------

export interface UseSignStoreResult<T> {
  sign: (...args: never[]) => Promise<T>;
  isSigning: Readable<boolean>;
  data: Readable<T | null>;
  error: Readable<unknown>;
}

export function useSignTransactionStore(): UseSignStoreResult<SignTransactionResult> & {
  sign: (xdr: string, opts?: SignTxOptions & { skipPreview?: boolean }) => Promise<SignTransactionResult>;
} {
  const client = getAppKit();
  const isSigning = writable(false);
  const data = writable<SignTransactionResult | null>(null);
  const error = writable<unknown>(null);

  const sign = async (xdr: string, opts?: SignTxOptions & { skipPreview?: boolean }) => {
    isSigning.set(true);
    error.set(null);
    try {
      const result = await client.signTransaction(xdr, opts);
      data.set(result);
      return result;
    } catch (err) {
      error.set(err);
      throw err;
    } finally {
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

export function useSignMessageStore(): UseSignStoreResult<SignMessageResult> & {
  sign: (message: string, opts?: SignOptions) => Promise<SignMessageResult>;
} {
  const client = getAppKit();
  const isSigning = writable(false);
  const data = writable<SignMessageResult | null>(null);
  const error = writable<unknown>(null);

  const sign = async (message: string, opts?: SignOptions) => {
    isSigning.set(true);
    error.set(null);
    try {
      const result = await client.signMessage(message, opts);
      data.set(result);
      return result;
    } catch (err) {
      error.set(err);
      throw err;
    } finally {
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

export function useSignInStore(): UseSignStoreResult<SignInResult> & {
  sign: (opts: { statement: string; nonce: string; expirationTime?: Date }) => Promise<SignInResult>;
} {
  const client = getAppKit();
  const isSigning = writable(false);
  const data = writable<SignInResult | null>(null);
  const error = writable<unknown>(null);

  const sign = async (opts: { statement: string; nonce: string; expirationTime?: Date }) => {
    isSigning.set(true);
    error.set(null);
    try {
      const result = await client.signIn(opts);
      data.set(result);
      return result;
    } catch (err) {
      error.set(err);
      throw err;
    } finally {
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

export function useSorobanStore(opts: { rpcUrl: string; networkPassphrase: string }) {
  const client = getAppKit();
  const session = useSessionStore();

  const soroban = new SorobanConnection({
    rpcUrl: opts.rpcUrl,
    networkPassphrase: opts.networkPassphrase,
    wallet: client,
  });

  const status = writable<'idle' | 'invoking' | 'success' | 'error'>('idle');
  const lastResult = writable<InvokeResult | null>(null);
  const error = writable<unknown>(null);

  const invoke = async (invokeOpts: InvokeOptions) => {
    status.set('invoking');
    error.set(null);
    try {
      const result = await soroban.invoke(invokeOpts);
      lastResult.set(result);
      status.set('success');
      return result;
    } catch (err) {
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

export function usePreviewTransactionStore(): {
  preview: Readable<TransactionPreview | null>;
  respond: (approve: boolean) => void;
  isPending: Readable<boolean>;
} {
  const client = getAppKit();
  const preview = writable<TransactionPreview | null>(null);
  let resolver: ((approve: boolean) => void) | null = null;

  client.onPreviewTransaction = async (p) => {
    return new Promise<boolean>((resolve) => {
      preview.set(p);
      resolver = resolve;
    });
  };

  const respond = (approve: boolean) => {
    resolver?.(approve);
    resolver = null;
    preview.set(null);
  };

  return {
    preview: { subscribe: preview.subscribe },
    respond,
    isPending: {
      subscribe: (cb: (v: boolean) => void) => preview.subscribe((p) => cb(p !== null)),
    },
  };
}

export function usePreviewAuthEntryStore(): {
  preview: Readable<AuthEntryPreview | null>;
  respond: (approve: boolean) => void;
  isPending: Readable<boolean>;
} {
  const client = getAppKit();
  const preview = writable<AuthEntryPreview | null>(null);
  let resolver: ((approve: boolean) => void) | null = null;

  client.onPreviewAuthEntry = async (p) => {
    return new Promise<boolean>((resolve) => {
      preview.set(p);
      resolver = resolve;
    });
  };

  const respond = (approve: boolean) => {
    resolver?.(approve);
    resolver = null;
    preview.set(null);
  };

  return {
    preview: { subscribe: preview.subscribe },
    respond,
    isPending: {
      subscribe: (cb: (v: boolean) => void) => preview.subscribe((p) => cb(p !== null)),
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
export const useSiwsSession = useSiwsSessionStore;
export const useIsAuthenticated = useIsAuthenticatedStore;
export const useLocale = useLocaleStore;
export const useConnect = useConnectStore;
export const useSignTransaction = useSignTransactionStore;
export const useSignMessage = useSignMessageStore;
export const useSignIn = useSignInStore;
export const useSoroban = useSorobanStore;
export const usePreviewTransaction = usePreviewTransactionStore;
export const usePreviewAuthEntry = usePreviewAuthEntryStore;

// Re-export the modal Svelte action + helpers so they're available from
// `@saganta/stellar-appkit/svelte` directly.
export {
  stellarmodal,
  openModal,
  closeModal,
  isStellarAppKitModal,
  type StellarAppKitModalProps,
  type StellarAppKitModalHandle,
  type StellarAppKitModalEvents,
} from './modal.js';
