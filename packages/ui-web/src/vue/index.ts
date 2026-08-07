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
 * 3. `<StellarAppKitModal>` — a Vue SFC-style component wrapping the
 *    underlying `<stellar-appkit-modal>` Web Component with typed props,
 *    emits (`connect`/`disconnect`/`error`), and an imperative `open()` /
 *    `close()` API via template refs. Re-exported from `./modal.ts`.
 *
 * Tree-shakability: this subpath is a separate module — bundlers only
 * pull it in if the consumer actually imports `@saganta/stellar-appkit/vue`.
 *
 * SSR safety: the composables don't touch `window` or `localStorage` at
 * setup time. The underlying StellarAppKit instance accesses storage
 * lazily (only on actual connect/restore calls), so server-side render
 * won't crash on storage access.
 */

import {
  ref,
  computed,
  shallowReadonly,
  onUnmounted,
  shallowRef,
  inject,
  provide,
  type InjectionKey,
  type Ref,
  type ComputedRef,
} from 'vue';
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
} from '@saganta/stellar-appkit';
import {
  SorobanConnection,
  type InvokeOptions,
  type InvokeResult,
} from '@saganta/stellar-appkit';

// ---------------------------------------------------------------------------
// Injection key + provide/install
// ---------------------------------------------------------------------------

export const APPKIT_INJECTION_KEY: InjectionKey<StellarAppKit> = Symbol('stellar-appkit');

export interface StellarAppKitConfig {
  network: StellarNetwork;
  /** Wallet connectors to register. Optional — defaults to all bundled browser-side wallets. */
  connectors?: WalletConnector[];
  appMetadata?: { name: string; domain: string; uri: string };
  networkPassphrase?: string;
  syncAcrossTabs?: boolean;
  previewOptions?: PreviewOptions;
  /** Restore any persisted session on mount. Default: true. */
  restoreOnMount?: boolean;
  /** Modal UI configuration (animation preset). */
  modal?: { animation?: import('@saganta/stellar-appkit').StellarAppKitModalConfig['animation'] };
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
export function provideStellarAppKit(config: StellarAppKitConfig): StellarAppKit {
  const client = new StellarAppKit({
    network: config.network,
    connectors: config.connectors,
    appMetadata: config.appMetadata,
    networkPassphrase: config.networkPassphrase,
    syncAcrossTabs: config.syncAcrossTabs,
    previewOptions: config.previewOptions,
  });

  if (config.restoreOnMount !== false) {
    // restore() is async but we don't await it — Vue setup() can't be async
    // without Suspense, and we want this to be opt-in. The session will
    // appear reactively once restore() resolves (the client emits 'connect'
    // events for each restored session, which the composables pick up).
    client.restore().catch(() => {
      // Silently swallow — restore() is designed to be safe to call without
      // error handling; this just guards against unhandled promise rejection
      // warnings in strict dev environments.
    });
  }

  onUnmounted(() => client.dispose());
  provide(APPKIT_INJECTION_KEY, client);
  return client;
}

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
export const StellarAppKitPlugin = {
  install(app: { provide: (key: unknown, value: unknown) => void }, config: StellarAppKitConfig) {
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
    app.provide(APPKIT_INJECTION_KEY, client);
  },
};

function useClient(): StellarAppKit {
  const client = inject(APPKIT_INJECTION_KEY);
  if (!client) {
    throw new Error(
      'useAppKit() and the other @saganta/stellar-appkit/vue composables must be used inside a component tree where provideStellarAppKit() was called, ' +
      'or after app.use(StellarAppKitPlugin, ...).'
    );
  }
  return client;
}

// ---------------------------------------------------------------------------
// Composables — each returns a reactive Ref<T> (or computed) for its slice.
// We use shallowRef for objects whose identity changes (rather than deep
// reactivity) because the underlying client emits new object references on
// change — deep reactivity would be wasted overhead.
// ---------------------------------------------------------------------------

/** Returns the StellarAppKit client instance. */
export function useAppKit(): StellarAppKit {
  return useClient();
}

/** Reactive status: 'idle' | 'selecting' | 'connecting' | 'connected' | 'error'. */
export function useStatus(): Readonly<Ref<ConnectStatus>> {
  const client = useClient();
  const status = ref<ConnectStatus>(client.status);
  const unsub = client.on('statusChange', (s) => { status.value = s; });
  onUnmounted(unsub);
  return shallowReadonly(status);
}

/** Reactive active session (or null). */
export function useSession(): Readonly<Ref<ConnectSession | null>> {
  const client = useClient();
  const session = shallowRef<ConnectSession | null>(client.session);
  const unsub = client.on('sessionsChanged', () => { session.value = client.session; });
  onUnmounted(unsub);
  return shallowReadonly(session);
}

/** Reactive list of all connected sessions (active + inactive). */
export function useSessions(): Readonly<Ref<ConnectSession[]>> {
  const client = useClient();
  const sessions = shallowRef<ConnectSession[]>(client.sessions);
  const unsub = client.on('sessionsChanged', () => { sessions.value = client.sessions; });
  onUnmounted(unsub);
  return shallowReadonly(sessions);
}

/** Convenience: the active session's address (or null). */
export function useAddress(): ComputedRef<string | null> {
  const session = useSession();
  return computed(() => session.value?.address ?? null);
}

/** Reactive count of sign requests currently queued. */
export function usePendingSignCount(): Readonly<Ref<number>> {
  const client = useClient();
  const count = ref<number>(client.pendingSignCount);
  const unsub = client.on('signQueueChange', (n) => { count.value = n; });
  onUnmounted(unsub);
  return shallowReadonly(count);
}

// ---------------------------------------------------------------------------
// Connect / disconnect
// ---------------------------------------------------------------------------

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

export function useConnect(): UseConnectResult {
  const client = useClient();
  const session = useSession();
  const status = useStatus();
  const isConnecting = ref(false);
  const error = ref<StellarAppKitEvents['error'] | null>(null);

  const unsub = client.on('error', (err) => {
    error.value = err;
    isConnecting.value = false;
  });
  onUnmounted(unsub);

  const connect = async (walletId: string) => {
    isConnecting.value = true;
    error.value = null;
    try {
      return await client.connect(walletId);
    } finally {
      isConnecting.value = false;
    }
  };

  const connectors = computed<WalletConnector[]>(() => {
    // Expose connectors for the connected wallets; consumers building a
    // wallet picker should read the registered connectors from their
    // own config object (we don't have a public list() on the registry).
    return client.sessions
      .map((s) => s.walletId)
      .map((id) => client.activeConnector)
      .filter((c): c is WalletConnector => c !== null);
  });

  return {
    connect,
    disconnect: client.disconnect.bind(client),
    disconnectAll: client.disconnectAll.bind(client),
    switchAccount: client.switchAccount.bind(client),
    connectors,
    isConnected: computed(() => session.value !== null),
    isConnecting: shallowReadonly(isConnecting),
    error: shallowReadonly(error),
  };
}

// ---------------------------------------------------------------------------
// Signing composables — wrap the client's queued sign methods with
// reactive loading/error/result refs.
// ---------------------------------------------------------------------------

export interface UseSignResult<T> {
  sign: (...args: never[]) => Promise<T>;
  isSigning: Readonly<Ref<boolean>>;
  data: Readonly<Ref<T | null>>;
  error: Readonly<Ref<unknown>>;
}

export function useSignTransaction(): UseSignResult<SignTransactionResult> & {
  sign: (xdr: string, opts?: SignTxOptions & { skipPreview?: boolean }) => Promise<SignTransactionResult>;
} {
  const client = useClient();
  const isSigning = ref(false);
  const data = shallowRef<SignTransactionResult | null>(null);
  const error = ref<unknown>(null);

  const sign = async (xdr: string, opts?: SignTxOptions & { skipPreview?: boolean }) => {
    isSigning.value = true;
    error.value = null;
    try {
      const result = await client.signTransaction(xdr, opts);
      data.value = result;
      return result;
    } catch (err) {
      error.value = err;
      throw err;
    } finally {
      isSigning.value = false;
    }
  };

  return {
    sign,
    isSigning: shallowReadonly(isSigning),
    data: shallowReadonly(data),
    error: shallowReadonly(error),
  };
}

export function useSignMessage(): UseSignResult<SignMessageResult> & {
  sign: (message: string, opts?: SignOptions) => Promise<SignMessageResult>;
} {
  const client = useClient();
  const isSigning = ref(false);
  const data = shallowRef<SignMessageResult | null>(null);
  const error = ref<unknown>(null);

  const sign = async (message: string, opts?: SignOptions) => {
    isSigning.value = true;
    error.value = null;
    try {
      const result = await client.signMessage(message, opts);
      data.value = result;
      return result;
    } catch (err) {
      error.value = err;
      throw err;
    } finally {
      isSigning.value = false;
    }
  };

  return {
    sign,
    isSigning: shallowReadonly(isSigning),
    data: shallowReadonly(data),
    error: shallowReadonly(error),
  };
}

export function useSignIn(): UseSignResult<SignInResult> & {
  sign: (opts: { statement: string; nonce: string; expirationTime?: Date }) => Promise<SignInResult>;
} {
  const client = useClient();
  const isSigning = ref(false);
  const data = shallowRef<SignInResult | null>(null);
  const error = ref<unknown>(null);

  const sign = async (opts: { statement: string; nonce: string; expirationTime?: Date }) => {
    isSigning.value = true;
    error.value = null;
    try {
      const result = await client.signIn(opts);
      data.value = result;
      return result;
    } catch (err) {
      error.value = err;
      throw err;
    } finally {
      isSigning.value = false;
    }
  };

  return {
    sign,
    isSigning: shallowReadonly(isSigning),
    data: shallowReadonly(data),
    error: shallowReadonly(error),
  };
}

// ---------------------------------------------------------------------------
// Soroban
// ---------------------------------------------------------------------------

export function useSoroban(opts: { rpcUrl: string; networkPassphrase: string }) {
  const client = useClient();
  const session = useSession();

  // SorobanConnection reads the active wallet lazily at invoke time, so
  // a wallet switch doesn't require recreating the connection. We only
  // recreate if rpcUrl/networkPassphrase change.
  const soroban = new SorobanConnection({
    rpcUrl: opts.rpcUrl,
    networkPassphrase: opts.networkPassphrase,
    wallet: client,
  });
  onUnmounted(() => {
    // SorobanConnection doesn't currently hold resources that need explicit
    // teardown, but we hook this in case future versions do (websocket
    // event subscribers, etc.).
  });

  const status = ref<'idle' | 'invoking' | 'success' | 'error'>('idle');
  const lastResult = shallowRef<InvokeResult | null>(null);
  const error = ref<unknown>(null);

  const invoke = async (invokeOpts: InvokeOptions) => {
    status.value = 'invoking';
    error.value = null;
    try {
      const result = await soroban.invoke(invokeOpts);
      lastResult.value = result;
      status.value = 'success';
      return result;
    } catch (err) {
      error.value = err;
      status.value = 'error';
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
    status: shallowReadonly(status),
    lastResult: shallowReadonly(lastResult),
    error: shallowReadonly(error),
    session,
  };
}

// ---------------------------------------------------------------------------
// Preview composables — surface the onPreviewTransaction /
// onPreviewAuthEntry payloads reactively, for apps that want to render
// their own preview UI instead of using the <stellar-appkit-modal> Web Component.
// ---------------------------------------------------------------------------

export function usePreviewTransaction(): {
  preview: Readonly<Ref<TransactionPreview | null>>;
  respond: (approve: boolean) => void;
  isPending: ComputedRef<boolean>;
} {
  const client = useClient();
  const preview = shallowRef<TransactionPreview | null>(null);
  let resolver: ((approve: boolean) => void) | null = null;

  client.onPreviewTransaction = async (p) => {
    return new Promise<boolean>((resolve) => {
      preview.value = p;
      resolver = resolve;
    });
  };

  onUnmounted(() => {
    client.onPreviewTransaction = null;
  });

  const respond = (approve: boolean) => {
    resolver?.(approve);
    resolver = null;
    preview.value = null;
  };

  return {
    preview: shallowReadonly(preview),
    respond,
    isPending: computed(() => preview.value !== null),
  };
}

export function usePreviewAuthEntry(): {
  preview: Readonly<Ref<AuthEntryPreview | null>>;
  respond: (approve: boolean) => void;
  isPending: ComputedRef<boolean>;
} {
  const client = useClient();
  const preview = shallowRef<AuthEntryPreview | null>(null);
  let resolver: ((approve: boolean) => void) | null = null;

  client.onPreviewAuthEntry = async (p) => {
    return new Promise<boolean>((resolve) => {
      preview.value = p;
      resolver = resolve;
    });
  };

  onUnmounted(() => {
    client.onPreviewAuthEntry = null;
  });

  const respond = (approve: boolean) => {
    resolver?.(approve);
    resolver = null;
    preview.value = null;
  };

  return {
    preview: shallowReadonly(preview),
    respond,
    isPending: computed(() => preview.value !== null),
  };
}

// Re-export the modal component so it's available from
// `@saganta/stellar-appkit/vue` directly.
export {
  StellarAppKitModal,
  default as StellarAppKitModalDefault,
  type StellarAppKitModalProps,
  type StellarAppKitModalHandle,
  type StellarAppKitModalEvents,
} from './modal.js';
