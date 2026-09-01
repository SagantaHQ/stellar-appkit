import { ConnectorRegistry } from './connectors/registry.js';
import { createFreighterConnector, createAlbedoConnector, createXBullConnector, createLedgerConnector, createRabetConnector, createKleverConnector, createHotWalletConnector } from './connectors/index.js';
import { TypedEmitter } from './events.js';
import { createWebStorage, SESSION_STORAGE_KEY } from './storage.js';
import { TabSync } from './tab-sync.js';
import {
  ConnectError,
  NetworkMismatchError,
  Networks,
  resolveNetworkPassphrase,
  SiwsConfig,
  SiwsError,
  SiwsErrorType,
  SiwsSession,
  type ConnectSession,
  type ConnectStatus,
  type ConnectStorage,
  type SignMessageResult,
  type SignOptions,
  type SignTransactionResult,
  type SignTxOptions,
  type SignAuthEntryResult,
  type SignRetriedKind,
  type StellarAppKitEvents,
  type StellarNetwork,
  type WalletConnector,
  type WalletReachability,
} from './types.js';
import { signInWithStellar, type SignInOptions, type SignInResult } from './siws.js';
import { setLocale, type LocaleCode } from './i18n/index.js';
import {
  buildTransactionPreview,
  buildAuthEntryPreview,
  type PreviewHandler,
  type AuthEntryPreviewHandler,
  type PreviewOptions,
  type TransactionPreview,
  type AuthEntryPreview,
} from './decode.js';

export interface StellarAppKitConfig {
  /**
   * Wallet connectors to register. Optional — if omitted (or empty),
   * defaults to all bundled browser-side connectors: Freighter, Albedo,
   * xBull, and Ledger. WalletConnect is NOT included by default because
   * it requires a `projectId` from your WalletConnect Cloud dashboard.
   *
   * Pass an explicit list to override the default, e.g. to add WalletConnect
   * or to restrict the wallet list to a subset.
   */
  connectors?: WalletConnector[];
  /** Network the app expects to operate on — used to validate the connected wallet's network. */
  network: StellarNetwork;
  /** Required for STANDALONE networks (no built-in passphrase to fall back on); optional override otherwise. Needed for transaction previews to decode against the right network. */
  networkPassphrase?: string;
  /** Defaults to localStorage on web. Pass a RN-backed implementation for React Native. */
  storage?: ConnectStorage;
  /**
   * App identity — follows the WalletConnect/Reown metadata standard.
   * The same object is used for:
   *   - SIWS messages (domain derived from `url`, `uri` = `url`)
   *   - WalletConnect session proposals (passed directly as WC `metadata`)
   *   - The modal's transaction preview app icon (`icons[0]`)
   *
   * Shape:
   * ```ts
   * appMetadata: {
   *   name: 'My App',
   *   description: 'A Stellar dApp',
   *   url: 'https://saganta.com',
   *   icons: ['https://saganta.com/icon.png'],
   * }
   * ```
   *
   * Only `name` is required. When `url` is omitted, derived from
   * `window.location.origin` (browser). `domain` for SIWS is derived
   * from `url` by stripping the protocol and path. `description` and
   * `icons` are optional but recommended for WalletConnect.
   *
   * `redirect` (optional, mobile focus-return): your app's own deep-link
   * target, following the WalletConnect/Reown metadata standard. It is
   * included verbatim in every WalletConnect session proposal, where a
   * cooperating mobile wallet reads it after the user approves or rejects
   * and opens it — which backgrounds the wallet and re-focuses your app
   * automatically (the standard mobile round trip). On React Native, the
   * `@saganta/stellar-appkit-react-native` modal also uses it as the
   * best-effort self-open target when an operation settles while your app
   * is backgrounded. Ignored on web. Example:
   * ```ts
   * appMetadata: {
   *   name: 'My App',
   *   url: 'https://myapp.com',
   *   redirect: { native: 'myapp://', universal: 'https://myapp.com' },
   * }
   * ```
   */
  appMetadata?: {
    name: string;
    description?: string;
    url?: string;
    icons?: string[];
    redirect?: { native?: string; universal?: string };
  };
  /** Set false to disable cross-tab session sync (on by default, no-ops where BroadcastChannel isn't available anyway). */
  syncAcrossTabs?: boolean;
  /**
   * Auto-connect on construction: schedules `restore()` immediately, so a
   * persisted wallet session reconnects (and, when `siws` is configured, a
   * still-valid SIWS session logs back in) without the app wiring its own
   * mount-effect `client.restore()` call. Fire-and-forget: restore() is
   * designed to silently drop anything it can't bring back. Default false —
   * apps that prefer explicit control keep calling `restore()` themselves
   * (calling both is harmless; the second restore sees the same storage).
   *
   * On React Native this is the "auto connect and login" switch: pair once,
   * then every app start resumes connected (and signed in, when SIWS is
   * configured and the session hasn't expired).
   */
  autoConnect?: boolean;
  /** Called before every signTransaction() with a decoded preview — return false to cancel before the wallet ever sees the request. `ui-web`'s modal sets this automatically when attached. */
  onPreviewTransaction?: PreviewHandler;
  /** Called before every signAuthEntry() with a decoded preview of the auth tree — return false to cancel before the wallet ever sees the request. Standalone auth-entry signing can grant broad contract permissions, so this preview is critical. */
  onPreviewAuthEntry?: AuthEntryPreviewHandler;
  /** Passed through to buildTransactionPreview() / buildAuthEntryPreview() — verifiedContracts, largeTransferThreshold. */
  previewOptions?: PreviewOptions;
  /**
   * Modal UI configuration. Passed through to the `@saganta/stellar-appkit-ui-web`
   * package when its `<stellar-appkit-modal>` element is attached. Currently
   * only `animation` is supported — set it to override the default open/close
   * transitions (`scale-blur` for modal, `slide-up` for bottom-sheet).
   *
   * The `animation` field accepts either a single preset name (applied to
   * both open and close) or `{ open, close }` for separate presets.
   * Presets: `'none' | 'fade' | 'scale' | 'scale-blur' | 'slide-up' | 'slide-left' | 'implode'`.
   */
  modal?: StellarAppKitModalConfig;
  /**
   * SIWS (Sign-In With Stellar) configuration for automatic authentication.
   * When set, the modal automatically triggers a SIWS sign-in immediately
   * after the wallet connects. See `SiwsConfig` for the full flow.
   */
  siws?: SiwsConfig;
  /**
   * UI locale for the modal + error messages. Defaults to `'en'` (English).
   *
   * English is bundled with the library; all other locales are lazy-loaded
   * via dynamic `import()` on first use. Pass a locale code here to set the
   * initial locale at app startup:
   *
   * ```ts
   * new StellarAppKit({
   *   network: 'TESTNET',
   *   locale: 'zh-CN', // ← modal renders in Simplified Chinese
   *   ...
   * });
   * ```
   *
   * To change the locale at runtime, call `setLocale('ja')` from the i18n
   * module, or use the `useSetLocale()` React hook.
   *
   * Supported codes: `'en' | 'zh-CN' | 'zh-TW' | 'es' | 'pt-BR' | 'ja' |
   * 'ko' | 'de' | 'fr' | 'ru' | 'ar' | 'hi' | 'it' | 'tr' | 'pl' | 'vi' |
   * 'id' | 'uk' | 'nl' | 'th' | 'he' | 'cs' | 'sv' | 'ro' | 'fa'`
   */
  locale?: LocaleCode;
}

/**
 * Modal UI config shape. Defined in core (not ui-web) so the core SDK
 * doesn't depend on ui-web types — the ui-web package accepts the same
 * shape via its own ModalAnimationOption type (which is structurally
 * compatible).
 */
export interface StellarAppKitModalConfig {
  /**
   * Animation preset for the modal open/close transitions.
   * - String: same preset for both open and close.
   * - Object: separate `open` and `close` presets.
   * - Undefined: defaults to `scale-blur` for modal mode, `slide-up` for bottom-sheet.
   */
  animation?:
    | 'none'
    | 'fade'
    | 'scale'
    | 'scale-blur'
    | 'slide-up'
    | 'slide-left'
    | 'implode'
    | { open?: 'none' | 'fade' | 'scale' | 'scale-blur' | 'slide-up' | 'slide-left' | 'implode';
        close?: 'none' | 'fade' | 'scale' | 'scale-blur' | 'slide-up' | 'slide-left' | 'implode' };
}

/**
 * Returns the default connector set: every bundled browser-side wallet that
 * doesn't require constructor-time configuration. WalletConnect is excluded
 * because it requires a `projectId`.
 *
 * Used when `StellarAppKitConfig.connectors` is omitted or empty.
 *
 * The connector factory functions themselves are lightweight — each
 * connector lazy-imports its underlying SDK (e.g. `@stellar/freighter-api`)
 * only when its methods are actually called, so importing the factories
 * at the top of this file does not pull heavy SDK code into the bundle
 * for apps that don't use the default set.
 */
export function defaultConnectors(): WalletConnector[] {
  return [
    createFreighterConnector(),
    createAlbedoConnector(),
    createXBullConnector(),
    createLedgerConnector(),
    createRabetConnector(),
    createKleverConnector(),
    createHotWalletConnector(),
  ];
}

/** The mobile focus-return piece of `appMetadata` — WC/Reown metadata standard. */
export type AppMetadataRedirect = { native?: string; universal?: string };

/** The full resolved `appMetadata` shape used internally (WC metadata standard). */
export type AppKitAppMetadata = {
  name: string;
  description?: string;
  url?: string;
  icons?: string[];
  redirect?: AppMetadataRedirect;
};

/**
 * Normalizes the user-provided `appMetadata` (WC metadata shape) into the
 * fully-resolved shape the SDK uses internally.
 *
 * Input shape (WalletConnect/Reown metadata standard):
 *   { name, description?, url?, icons?, redirect? }
 *
 * - `url` is auto-derived from `window.location.origin` when omitted (browser)
 * - `url` is auto-formatted: prefixed with `https://` if no protocol
 * - `domain` (for SIWS) is derived from `url` by stripping protocol + path
 * - `uri` (for SIWS) = `url`
 * - `redirect` values are trimmed and empty strings dropped
 *
 * The same object is passed directly to WalletConnect as its `metadata`.
 */
export function normalizeAppMetadata(
  meta: { name: string; description?: string; url?: string; icons?: string[]; redirect?: AppMetadataRedirect },
): AppKitAppMetadata {
  let { name, description, url, icons, redirect } = meta;

  // Auto-derive url from window.location when available (browser only)
  if (typeof window !== 'undefined' && window.location) {
    if (!url) url = window.location.origin || undefined;
  }

  // Auto-format url: ensure it has a protocol
  if (url) {
    url = url.trim();
    if (!/^[a-z]+:\/\//i.test(url)) {
      url = `https://${url}`;
    }
  }

  // Redirect: trim + drop empty strings so downstream code can rely on
  // "present string" meaning "configured".
  const trimmedRedirect: AppMetadataRedirect = {};
  if (redirect) {
    const native = redirect.native?.trim();
    const universal = redirect.universal?.trim();
    if (native) trimmedRedirect.native = native;
    if (universal) trimmedRedirect.universal = universal;
  }

  return {
    name,
    description,
    url,
    icons,
    redirect: trimmedRedirect.native || trimmedRedirect.universal ? trimmedRedirect : undefined,
  };
}

/**
 * Derives the SIWS `domain` from the appMetadata `url` by stripping the
 * protocol and path. E.g. `"https://app.example.com/path"` → `"app.example.com"`.
 */
export function deriveDomainFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  let domain = url.trim().replace(/^[a-z]+:\/\//i, '');
  const slashIdx = domain.indexOf('/');
  if (slashIdx >= 0) domain = domain.slice(0, slashIdx);
  return domain || undefined;
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

interface StoredSessionsV1 {
  v: 1;
  activeWalletId: string | null;
  sessions: ConnectSession[];
}

const DEFAULT_RETRY_INTERVAL_MS = 1500;
const DEFAULT_RETRY_TIMEOUT_MS = 30_000;
const SIWS_SESSION_STORAGE_KEY = 'saganta-appkit:siws-session';

/**
 * The single object app code talks to. Wraps the connector registry, owns
 * connection state + persistence, and re-exports signIn() (SIWS) so a whole
 * app only ever needs one import.
 *
 * Supports connecting more than one wallet at once (e.g. Freighter *and*
 * Ledger simultaneously) — `session`/`activeConnector` always refer to
 * whichever one is currently active; `sessions` lists everything connected.
 */
export class StellarAppKit {
  readonly registry: ConnectorRegistry;
  readonly network: StellarNetwork;
  readonly appMetadata?: StellarAppKitConfig['appMetadata'];

  /** Called before every signTransaction() — set by ui-web automatically, or assign your own for a non-UI preview flow (e.g. logging, a CLI confirmation prompt). */
  onPreviewTransaction: PreviewHandler | null = null;
  /** Called before every signAuthEntry() — same contract as onPreviewTransaction, but for standalone auth-entry signing. Returns false to cancel before the wallet sees the request. */
  onPreviewAuthEntry: AuthEntryPreviewHandler | null = null;
  previewOptions: PreviewOptions;

  private storage: ConnectStorage;
  private customNetworkPassphrase?: string;
  private emitter = new TypedEmitter<StellarAppKitEvents>();
  private _status: ConnectStatus = 'idle';
  private _sessions = new Map<string, ConnectSession>(); // keyed by walletId
  private _activeWalletId: string | null = null;
  private tabSync: TabSync | null = null;
  private signChain: Promise<void> = Promise.resolve();
  private _pendingSignCount = 0;
  /**
   * The last FAILED wallet-side sign that "Try again" can re-drive — armed
   * by runRetryableSign() only when the wallet call itself rejects (never
   * for preview rejections), cleared on success / new sign / disconnect.
   * See retryLastSign().
   */
  private retryableSign: { rerun: () => void } | null = null;

  constructor(config: StellarAppKitConfig) {
    this.registry = new ConnectorRegistry();
    // Default to all bundled browser-side connectors when none are provided.
    // Lets apps skip the boilerplate of `connectors: [createFreighterConnector(), …]`
    // and still get a full wallet picker in the modal.
    const connectors = config.connectors && config.connectors.length > 0
      ? config.connectors
      : defaultConnectors();
    this.registry.registerMany(connectors);
    this.network = config.network;

    // Normalize appMetadata first so we can inject it into WC connectors
    this.appMetadata = config.appMetadata ? normalizeAppMetadata(config.appMetadata) : undefined;

    // Inject the network and appMetadata into WalletConnect connectors so
    // they can resolve the passphrase via the Networks map and use the
    // appMetadata directly as WC metadata (no need for opts.metadata).
    for (const connector of connectors) {
      const wc = connector as WalletConnector & {
        _setNetwork?: (n: string) => void;
        _setAppMetadata?: (m: { name: string; description?: string; url?: string; icons?: string[] }) => void;
        setOnSessionInvalidated?: (cb: (() => void) | null) => void;
      };
      if (typeof wc._setNetwork === 'function') {
        wc._setNetwork(config.network);
      }
      if (typeof wc._setAppMetadata === 'function' && this.appMetadata) {
        wc._setAppMetadata(this.appMetadata);
      }
      // Wallet-initiated disconnect propagation: relay-based connectors
      // (WalletConnect) can be killed from the WALLET side — the user taps
      // Disconnect inside the wallet app, and session_delete arrives over
      // the relay (delivered while we run; on React Native typically on the
      // next foregrounding, where the modal restarts the transport). Without
      // this wiring the connector cleared only its OWN state and the client
      // kept serving a dead session: status 'connected', account view up,
      // until the next sign request blew up. See handleExternalDisconnect.
      if (typeof wc.setOnSessionInvalidated === 'function') {
        wc.setOnSessionInvalidated(() => this.handleExternalDisconnect(connector.id));
      }
    }
    this.storage = config.storage ?? createWebStorage();
    this.customNetworkPassphrase = config.networkPassphrase;
    this.onPreviewTransaction = config.onPreviewTransaction ?? null;
    this.onPreviewAuthEntry = config.onPreviewAuthEntry ?? null;
    this.previewOptions = config.previewOptions ?? {};
    this.modalConfig = config.modal;
    this.siwsConfig = config.siws;

    // Set the initial locale if the config specifies one. This triggers the
    // lazy-load of the locale file (if non-English) — we don't await it here
    // because the constructor can't be async. The modal will re-render when
    // the locale finishes loading (via the localechange event).
    if (config.locale && config.locale !== 'en') {
      void setLocale(config.locale);
    }

    if (config.syncAcrossTabs !== false) {
      this.tabSync = new TabSync(SESSION_STORAGE_KEY, () => {
        void this.resyncFromStorage();
      });
    }

    // Auto-connect: schedule restore() so persisted sessions (and a valid
    // SIWS session, when configured) come back without the app wiring a
    // mount effect. Restore never throws by design; the catch is pure
    // belt-and-braces for storage adapters that reject outside its try/catch.
    if (config.autoConnect) {
      void this.restore().catch(() => undefined);
    }
  }

  /** Modal UI config from StellarAppKitConfig.modal — read by ui-web when attached. */
  readonly modalConfig?: StellarAppKitModalConfig;

  /** SIWS config from StellarAppKitConfig.siws — read by ui-web for auto sign-in. */
  readonly siwsConfig?: SiwsConfig;

  /** The current SIWS session, or null if not authenticated. Set by the modal
   *  after successful verify(), cleared on disconnect. Accessible via
   *  `appkit.siwsSession` for app code to check auth status. */
  private _siwsSession: SiwsSession | null = null;

  /** Get the current SIWS session (null if not authenticated or expired). */
  get siwsSession(): SiwsSession | null {
    if (!this._siwsSession) return null;
    // Check expiry
    if (this._siwsSession.expiry && Date.now() > this._siwsSession.expiry) {
      this._siwsSession = null;
      return null;
    }
    return this._siwsSession;
  }

  /** Set the SIWS session (called by the modal after successful verify()). */
  setSiwsSession(session: SiwsSession | null): void {
    this._siwsSession = session;
    // Persist to storage so it survives page reloads
    if (session) {
      void this.storage.setItem(SIWS_SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      void this.storage.removeItem(SIWS_SESSION_STORAGE_KEY);
    }
    this.emitter.emit('siwsSessionChange', session);
    this.emitter.emit('sessionsChanged', this.sessions);
  }

  /** Clear the SIWS session + call signout() if configured. Called on disconnect. */
  async clearSiwsSession(): Promise<void> {
    const wasAuthenticated = this._siwsSession !== null;
    this._siwsSession = null;
    void this.storage.removeItem(SIWS_SESSION_STORAGE_KEY);
    if (wasAuthenticated) {
      this.emitter.emit('siwsSessionChange', null);
    }
    if (wasAuthenticated && this.siwsConfig) {
      const signoutOnDisconnect = this.siwsConfig.signoutOnDisconnect !== false;
      if (signoutOnDisconnect) {
        try {
          await this.siwsConfig.signout();
        } catch {
          // Silently ignore — signout failure shouldn't block disconnect
        }
      }
    }
  }

  /**
   * Manually sign out — clears the SIWS session, calls `signout()`, and
   * disconnects the wallet. Use this for "Log out" buttons in your app.
   */
  async signOut(): Promise<void> {
    await this.clearSiwsSession();
    if (this._activeWalletId) {
      await this.disconnect();
    }
  }

  /**
   * Throws if not authenticated. Use to guard actions that require auth.
   * ```ts
   * await appkit.requireAuth();
   * await appkit.signTransaction(xdr);
   * ```
   */
  requireAuth(): void {
    if (!this.siwsSession) {
      throw ConnectError.invalidRequest(
        'Authentication required. Call signIn() or connect with SIWS configured.'
      );
    }
  }

  /**
   * Validate the current session against the server. Calls `refresh()` (or
   * `session()` if `refresh` is not configured) to get a fresh session from
   * the server. If the session is invalid/expired/mismatched, triggers a
   * new SIWS sign-in flow.
   *
   * Returns the validated session, or null if not authenticated.
   */
  async validateSession(): Promise<SiwsSession | null> {
    if (!this.siwsConfig || !this.session) return null;

    const checkFn = this.siwsConfig.refresh ?? this.siwsConfig.session;
    let serverSession: SiwsSession | null | undefined = null;

    try {
      serverSession = await checkFn();
    } catch {
      serverSession = null;
    }

    if (!serverSession) {
      // Session invalid — clear and trigger re-auth
      this.setSiwsSession(null);
      return null;
    }

    // Validate address + network + expiry
    const session = this.session;
    if (session) {
      const addressMatches = serverSession.address === session.address;
      const networkMatches = serverSession.network === session.network;
      const notExpired = !serverSession.expiry || serverSession.expiry > Date.now();

      if (!addressMatches || !networkMatches || !notExpired) {
        this.setSiwsSession(null);
        return null;
      }
    }

    this.setSiwsSession(serverSession);
    return serverSession;
  }

  /**
   * Force re-authentication — clears the current session and triggers a
   * fresh SIWS sign-in flow. Useful for privilege escalation (e.g.,
   * "Confirm it's you to complete this transaction").
   *
   * The modal (if attached) will show the SIWS flow automatically.
   * Returns a promise that resolves when the SIWS flow completes.
   */
  async reauthenticate(): Promise<void> {
    this.setSiwsSession(null);
    // The modal listens to siwsSessionChange — if we set it to null,
    // it should trigger the SIWS flow. But for programmatic use without
    // the modal, we emit a special event.
    this.emitter.emit('siwsSessionChange', null);
  }

  /** Restore persisted SIWS session from storage (called on app init). */
  private async restoreSiwsSession(): Promise<void> {
    try {
      const stored = await this.storage.getItem(SIWS_SESSION_STORAGE_KEY);
      if (stored) {
        const session = JSON.parse(stored) as SiwsSession;
        // Check expiry
        if (!session.expiry || session.expiry > Date.now()) {
          this._siwsSession = session;
          this.emitter.emit('siwsSessionChange', session);
        } else {
          // Expired — clear it
          void this.storage.removeItem(SIWS_SESSION_STORAGE_KEY);
        }
      }
    } catch {
      // Corrupted storage — ignore
    }
  }

  /** Number of sign requests currently queued, including the one in flight — see the signing queue notes on signTransaction(). */
  get pendingSignCount(): number {
    return this._pendingSignCount;
  }

  get status(): ConnectStatus {
    return this._status;
  }

  /** The active session, or null if nothing's connected. */
  get session(): ConnectSession | null {
    return this._activeWalletId ? this._sessions.get(this._activeWalletId) ?? null : null;
  }

  /** Every currently connected session, active or not. */
  get sessions(): ConnectSession[] {
    return Array.from(this._sessions.values());
  }

  get activeConnector(): WalletConnector | null {
    return this._activeWalletId ? this.registry.get(this._activeWalletId) ?? null : null;
  }

  on<K extends keyof StellarAppKitEvents>(event: K, handler: (payload: StellarAppKitEvents[K]) => void) {
    return this.emitter.on(event, handler);
  }

  async getWalletReachability(walletId: string): Promise<WalletReachability> {
    return this.registry.getOrThrow(walletId).getReachability();
  }

  /**
   * Attempts to restore persisted session(s) on app start. Silently drops
   * (rather than throwing) any session whose wallet is no longer available
   * or whose address no longer matches — this is meant to be called once,
   * e.g. inside a provider's mount effect, without needing its own error
   * handling.
   */
  async restore(): Promise<ConnectSession[]> {
    const stored = await this.readStorage();
    if (!stored) return [];

    const restored: ConnectSession[] = [];
    for (const saved of stored.sessions) {
      const connector = this.registry.get(saved.walletId);
      if (!connector) continue;
      try {
        if ((await connector.getReachability()) === 'not-installed') continue;
        const { address } = await connector.getAddress();
        if (address !== saved.address) continue;
        this._sessions.set(saved.walletId, saved);
        restored.push(saved);
      } catch {
        // Wallet not actually reachable right now (locked, extension context not ready yet, etc.) — skip it silently.
      }
    }

    this._activeWalletId =
      stored.activeWalletId && this._sessions.has(stored.activeWalletId)
        ? stored.activeWalletId
        : (restored[restored.length - 1]?.walletId ?? null);

    if (restored.length > 0) {
      this.setStatus('connected');
      restored.forEach((session) => this.emitter.emit('connect', session));
      this.emitter.emit('sessionsChanged', this.sessions);

      // Restore persisted SIWS session (if any)
      if (this.siwsConfig) {
        await this.restoreSiwsSession();
      }
    }

    await this.persist();
    return restored;
  }

  /**
   * Connects a wallet. Adding a second (third, ...) wallet while one is
   * already connected doesn't replace it — both stay connected, and the
   * newly connected one becomes active. Use switchAccount() to change
   * which one is active without disconnecting anything.
   */
  async connect(walletId: string, opts: AppKitConnectOptions = {}): Promise<ConnectSession> {
    const connector = this.registry.getOrThrow(walletId);
    this.setStatus('connecting');

    try {
      const reachability = await connector.getReachability();
      if (reachability === 'not-installed') {
        throw ConnectError.internal(`${connector.meta.name} isn't installed.`, undefined, walletId);
      }
      if (reachability === 'unavailable') {
        throw ConnectError.internal(`${connector.meta.name} isn't available right now.`, undefined, walletId);
      }

      const account = await connector.connect({ network: this.network });
      await this.ensureNetworkMatch(connector, walletId, opts);

      const session: ConnectSession = {
        walletId,
        address: account.address,
        network: this.network,
        connectedAt: Date.now(),
      };

      this._sessions.set(walletId, session);
      this._activeWalletId = walletId;
      await this.persist();

      this.setStatus('connected');
      this.emitter.emit('connect', session);
      this.emitter.emit('sessionsChanged', this.sessions);
      return session;
    } catch (err) {
      this.setStatus('error');
      const connectError = err instanceof ConnectError ? err : ConnectError.internal(String(err), undefined, walletId);
      this.emitter.emit('error', connectError);
      throw connectError;
    }
  }

  private async ensureNetworkMatch(connector: WalletConnector, walletId: string, opts: AppKitConnectOptions): Promise<void> {
    if (this.network === 'STANDALONE') return; // nothing meaningful to compare against

    const check = async (): Promise<boolean> => {
      const { network } = await connector.getNetwork().catch(() => ({ network: this.network }));
      return !network || network.toUpperCase() === this.network;
    };

    if (await check()) return;

    if (!opts.autoRetryNetworkMismatch) {
      const { network } = await connector.getNetwork().catch(() => ({ network: 'unknown' }));
      throw new NetworkMismatchError({ expectedNetwork: this.network, actualNetwork: network, walletId });
    }

    const interval = opts.retryIntervalMs ?? DEFAULT_RETRY_INTERVAL_MS;
    const timeout = opts.retryTimeoutMs ?? DEFAULT_RETRY_TIMEOUT_MS;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      await sleep(interval);
      if (await check()) return;
    }

    const { network } = await connector.getNetwork().catch(() => ({ network: 'unknown' }));
    throw new NetworkMismatchError({ expectedNetwork: this.network, actualNetwork: network, walletId });
  }

  /**
   * Switches which connected wallet is active. If `address` is given and
   * differs from that wallet's current session address, the connector must
   * support listAccounts()/selectAccount() (hardware wallets, mainly) — for
   * everything else, omit `address` to just switch between already-connected
   * *wallets*.
   */
  async switchAccount(walletId: string, address?: string): Promise<ConnectSession> {
    const existing = this._sessions.get(walletId);
    if (!existing) {
      throw ConnectError.invalidRequest(`${walletId} isn't connected — call connect() first.`);
    }

    let session = existing;

    if (address && address !== existing.address) {
      const connector = this.registry.getOrThrow(walletId);
      if (!connector.selectAccount) {
        throw ConnectError.invalidRequest(`${connector.meta.name} doesn't support switching accounts within one session.`);
      }
      await connector.selectAccount(address);
      const { address: confirmed } = await connector.getAddress();
      session = { ...existing, address: confirmed };
      this._sessions.set(walletId, session);
    }

    this._activeWalletId = walletId;
    await this.persist();

    this.emitter.emit('accountSwitch', { walletId, address: session.address });
    this.emitter.emit('sessionsChanged', this.sessions);
    return session;
  }

  /** Disconnects one wallet (defaults to the active one). Other connected wallets, if any, are untouched — the most recently connected one becomes active. */
  async disconnect(walletId?: string): Promise<void> {
    const targetId = walletId ?? this._activeWalletId;
    if (!targetId) return;

    // Any pending "Try again" for this wallet's sign is dead — the wallet
    // half can't run without the connection it was signed with.
    if (targetId === this._activeWalletId) this.retryableSign = null;

    // Clear SIWS session + call signout() if configured (before disconnect)
    await this.clearSiwsSession();

    const connector = this.registry.get(targetId);
    await connector?.disconnect().catch(() => void 0);
    this._sessions.delete(targetId);

    if (this._activeWalletId === targetId) {
      const remaining = Array.from(this._sessions.values());
      this._activeWalletId = remaining[remaining.length - 1]?.walletId ?? null;
    }

    await this.persist();
    this.setStatus(this._sessions.size > 0 ? 'connected' : 'idle');
    this.emitter.emit('disconnect', { walletId: targetId });
    this.emitter.emit('sessionsChanged', this.sessions);
  }

  /** Disconnects every connected wallet. */
  async disconnectAll(): Promise<void> {
    const walletIds = Array.from(this._sessions.keys());
    for (const id of walletIds) {
      await this.registry.get(id)?.disconnect().catch(() => void 0);
    }
    this._sessions.clear();
    this._activeWalletId = null;
    this.retryableSign = null; // all pending "Try again"s are dead
    await this.persist();
    this.setStatus('idle');
    walletIds.forEach((walletId) => this.emitter.emit('disconnect', { walletId }));
    this.emitter.emit('sessionsChanged', this.sessions);
  }

  /**
   * Reconciles the client after a WALLET-initiated disconnect — invoked by
   * connectors through the setOnSessionInvalidated wiring (WalletConnect's
   * session_delete / session_expire) when the user kills the session from
   * inside the wallet, as opposed to disconnect(), which is the app asking
   * the wallet to leave.
   *
   * The connector has already cleared its own state (and its persisted
   * record) by the time this runs, so — unlike disconnect() — we don't call
   * connector.disconnect() (nothing left to disconnect, and the wallet
   * already knows). Everything else mirrors disconnect(): the session is
   * dropped from the map AND from persisted storage, a pending "Try again"
   * for this wallet dies with it, the most recently connected remaining
   * wallet becomes active, and `disconnect` + `sessionsChanged` fire so
   * modals/hooks/app code see the wallet leave in real time.
   *
   * Synchronous-first by design: the session is removed from the map before
   * any await so a burst of session_delete + session_expire for the same
   * topic (the relay can deliver both) reconciles exactly once.
   */
  private handleExternalDisconnect(walletId: string): void {
    if (!this._sessions.has(walletId)) return; // nothing to reconcile (or already done)
    this._sessions.delete(walletId);

    if (this._activeWalletId === walletId) {
      const remaining = Array.from(this._sessions.values());
      this._activeWalletId = remaining[remaining.length - 1]?.walletId ?? null;
      // The wallet half of any pending "Try again" for the active wallet
      // just died with the connection — the retry can't run without it.
      this.retryableSign = null;
    }

    void (async () => {
      await this.clearSiwsSession().catch(() => void 0);
      await this.persist();
      this.setStatus(this._sessions.size > 0 ? 'connected' : 'idle');
      this.emitter.emit('disconnect', { walletId });
      this.emitter.emit('sessionsChanged', this.sessions);
    })().catch(() => undefined);
  }

  /** Releases resources held by the client (currently just the cross-tab sync channel) — call on unmount in long-lived SPAs if you're creating fresh clients repeatedly. */
  dispose(): void {
    this.tabSync?.close();
  }

  /** Re-reads storage after another tab reported a change, and reconciles in-memory state against it. Never writes back to storage itself, to avoid a notify loop between tabs. */
  private async resyncFromStorage(): Promise<void> {
    const stored = await this.readStorage();
    const storedIds = new Set((stored?.sessions ?? []).map((s) => s.walletId));
    const currentIds = new Set(this._sessions.keys());

    // Sessions that appeared in another tab.
    for (const saved of stored?.sessions ?? []) {
      if (currentIds.has(saved.walletId)) continue;
      const connector = this.registry.get(saved.walletId);
      if (!connector) continue;
      try {
        const { address } = await connector.getAddress();
        if (address !== saved.address) continue;
        this._sessions.set(saved.walletId, saved);
        this.emitter.emit('connect', saved);
      } catch {
        /* not actually reachable from this tab right now — skip */
      }
    }

    // Sessions that disappeared in another tab.
    for (const walletId of currentIds) {
      if (storedIds.has(walletId)) continue;
      this._sessions.delete(walletId);
      this.emitter.emit('disconnect', { walletId });
    }

    if (stored?.activeWalletId !== this._activeWalletId && stored?.activeWalletId && this._sessions.has(stored.activeWalletId)) {
      this._activeWalletId = stored.activeWalletId;
      const session = this._sessions.get(stored.activeWalletId);
      if (session) this.emitter.emit('accountSwitch', { walletId: session.walletId, address: session.address });
    } else if (this._activeWalletId && !this._sessions.has(this._activeWalletId)) {
      const remaining = Array.from(this._sessions.values());
      this._activeWalletId = remaining[remaining.length - 1]?.walletId ?? null;
    }

    this.setStatus(this._sessions.size > 0 ? 'connected' : 'idle');
    this.emitter.emit('sessionsChanged', this.sessions);
  }

  private async readStorage(): Promise<StoredSessionsV1 | null> {
    const raw = await this.storage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<StoredSessionsV1>;
      if (parsed.v !== 1 || !Array.isArray(parsed.sessions)) return null;
      return parsed as StoredSessionsV1;
    } catch {
      return null;
    }
  }

  private async persist(): Promise<void> {
    const payload: StoredSessionsV1 = {
      v: 1,
      activeWalletId: this._activeWalletId,
      sessions: this.sessions,
    };
    await this.storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
    this.tabSync?.notify();
  }

  private setStatus(status: ConnectStatus) {
    this._status = status;
    this.emitter.emit('statusChange', status);
  }

  private requireActiveConnector(): WalletConnector {
    const connector = this.activeConnector;
    if (!connector) {
      throw ConnectError.invalidRequest('No wallet is connected. Call connect(walletId) first.');
    }
    return connector;
  }

  /**
   * Maps the StellarNetwork enum to its passphrase, needed to decode a
   * preview and to validate signing options. Requires an explicit
   * `networkPassphrase` in the config for STANDALONE networks, which have
   * no fixed passphrase to fall back on.
   */
  private resolveNetworkPassphrase(): string {
    if (this.customNetworkPassphrase) return this.customNetworkPassphrase;
    const passphrase = resolveNetworkPassphrase(this.network);
    if (!passphrase) {
      throw ConnectError.invalidRequest(
        'STANDALONE networks need an explicit `networkPassphrase` in the StellarAppKit config to build transaction previews.'
      );
    }
    return passphrase;
  }

  /**
   * Serializes sign requests so concurrent calls don't race the same
   * wallet extension — most can only handle one prompt at a time, and
   * racing them tends to fail the second (or both) rather than queue
   * sanely on its own. A burst of signTransaction() calls resolves one at
   * a time, in call order, instead of unpredictably.
   */
  private enqueueSign<T>(fn: () => Promise<T>): Promise<T> {
    this._pendingSignCount++;
    this.emitter.emit('signQueueChange', this._pendingSignCount);

    // A new sign supersedes any retryable sign left over from a previous
    // failure — "Try again" always re-drives the LAST request, never a
    // stale one hidden behind a newer call.
    this.retryableSign = null;

    const result = this.signChain.then(fn, fn);
    this.signChain = result.then(
      () => undefined,
      () => undefined
    );

    // Chain: result → emit error (if failed) → finally (decrement queue)
    // The error event fires BEFORE signQueueChange so the modal's error
    // handler can set connectingError before the queue handler checks it.
    return result
      .catch((err) => {
        // Emit an error event so the modal (and any other listeners) can
        // react to sign failures — e.g. show "Signing rejected" with a
        // retry button.
        const connectError = err instanceof ConnectError ? err : ConnectError.internal(String(err));
        this.emitter.emit('error', connectError);
        throw err;
      })
      .finally(() => {
        this._pendingSignCount--;
        this.emitter.emit('signQueueChange', this._pendingSignCount);
      });
  }

  // ---- Wallet-sign retry ("Try again" on the signing-error view) ----
  // The modals re-show the approved preview after a failed wallet sign; when
  // the user approves it again, they call retryLastSign(), which re-drives
  // the WALLET-SIDE half of the request through the normal queue (all the
  // usual signQueueChange / error events fire, so the modal views behave
  // exactly as they did the first time). The preview is NOT re-run — the
  // user just re-approved it in the modal.

  /**
   * Runs the wallet-side half of a sign request. On failure, records the
   * rerun for retryLastSign(). The app-facing promise still rejects
   * normally — the retry result is delivered via the 'signRetried' event
   * because the original promise cannot be settled twice.
   *
   * Preview rejections never reach this wrapper (they throw before the
   * wallet call), so a preview the user declined can never be bypassed by
   * a retry.
   */
  private runRetryableSign<T>(walletCall: () => Promise<T>, kind: SignRetriedKind): Promise<T> {
    return walletCall().then(
      (result) => {
        this.retryableSign = null;
        return result;
      },
      (err) => {
        this.retryableSign = { rerun: () => this.redriveSign(walletCall, kind) };
        throw err;
      }
    );
  }

  /** Re-enqueues a recorded wallet-side sign and emits 'signRetried' on success. Fire-and-forget — the result reaches apps via the event, not a promise. */
  private redriveSign<T>(walletCall: () => Promise<T>, kind: SignRetriedKind): void {
    void this.enqueueSign(() => this.runRetryableSign(walletCall, kind)).then(
      (result) => {
        this.emitter.emit('signRetried', { kind, result });
      },
      () => {
        // The error event already fired inside enqueueSign and the modal is
        // showing the signing-error view with the fresh wallet message; the
        // retry was re-armed by runRetryableSign for another "Try again".
      }
    );
  }

  /**
   * Re-drives the last FAILED wallet-side sign (the "Try again" button on the
   * modals' signing-error view). The wallet is asked again through the normal
   * sign queue — every signQueueChange / error event fires, the modal flows
   * back through the signing view exactly as it did the first time, and a
   * successful retry emits 'signRetried' with the result.
   *
   * Returns false when there's nothing to retry (the last sign succeeded, a
   * newer sign superseded it, or the session was torn down) — callers treat
   * that as "fall back to the previous view".
   */
  retryLastSign(): boolean {
    const entry = this.retryableSign;
    if (!entry) return false;
    this.retryableSign = null;
    entry.rerun();
    return true;
  }

  // ---- Unified signing API — proxies to whichever wallet is active, so app code never branches on wallet identity ----

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
  signTransaction(xdr: string, opts?: SignTxOptions & { skipPreview?: boolean }): Promise<SignTransactionResult> {
    return this.enqueueSign(async () => {
      const connector = this.requireActiveConnector();

      // Inject the network passphrase if not explicitly provided in opts.
      // This is critical for Freighter — when networkPassphrase is undefined,
      // Freighter defaults to Main Net, causing a "wrong network" error even
      // when the transaction was built for Testnet.
      const resolvedOpts = {
        ...opts,
        networkPassphrase: opts?.networkPassphrase ?? this.resolveNetworkPassphrase(),
      };

      if (this.onPreviewTransaction && !opts?.skipPreview) {
        const preview: TransactionPreview = await buildTransactionPreview(xdr, resolvedOpts.networkPassphrase, this.previewOptions);
        const approved = await this.onPreviewTransaction(preview);
        if (!approved) throw ConnectError.rejected(connector.id);
      }

      // Wallet-side half — a failure here arms retryLastSign() ("Try again").
      return this.runRetryableSign(() => connector.signTransaction(xdr, resolvedOpts), 'transaction');
    });
  }

  /**
   * Signs a Soroban auth entry. Queued alongside every other sign* call
   * (see enqueueSign). If `onPreviewAuthEntry` is set, the auth entry is
   * decoded and the handler is awaited *before* the wallet ever sees the
   * request — rejecting there throws the same way a wallet-side rejection
   * would, so callers don't need to special-case it. Pass `skipPreview:
   * true` to bypass for a specific call (e.g. a flow already confirmed
   * through some other UI).
   *
   * The preview surfaces the contract IDs and functions being authorized,
   * plus risk flags for broad grants and unverified contracts — this
   * closes a previous gap where standalone signAuthEntry() calls could
   * silently grant broad contract permissions without user review.
   */
  signAuthEntry(authEntryXdr: string, opts?: SignOptions & { skipPreview?: boolean }): Promise<SignAuthEntryResult> {
    return this.enqueueSign(async () => {
      const connector = this.requireActiveConnector();

      if (this.onPreviewAuthEntry && !opts?.skipPreview) {
        const preview: AuthEntryPreview = await buildAuthEntryPreview(authEntryXdr, this.previewOptions);
        const approved = await this.onPreviewAuthEntry(preview);
        if (!approved) throw ConnectError.rejected(connector.id);
      }

      // Wallet-side half — a failure here arms retryLastSign() ("Try again").
      return this.runRetryableSign(() => connector.signAuthEntry(authEntryXdr, opts), 'authEntry');
    });
  }

  /** Queued alongside signTransaction()/signAuthEntry() — see enqueueSign. */
  signMessage(message: string, opts?: SignOptions & { skipPreview?: boolean }): Promise<SignMessageResult> {
    return this.enqueueSign(async () => {
      const connector = this.requireActiveConnector();

      if (this.onPreviewTransaction && !opts?.skipPreview) {
        const session = this.session;
        const preview: TransactionPreview = {
          sourceAccount: session?.address ?? 'unknown',
          fee: '0',
          operations: [{
            type: 'signMessage',
            summary: `Sign message: "${message.length > 100 ? message.slice(0, 100) + '…' : message}"`,
            details: { message },
            riskFlags: [],
          }],
          riskFlags: [],
          raw: { xdr: '', networkPassphrase: this.resolveNetworkPassphrase() },
        };
        const approved = await this.onPreviewTransaction(preview);
        if (!approved) throw ConnectError.rejected(connector.id);
      }

      // Wallet-side half — a failure here arms retryLastSign() ("Try again").
      return this.runRetryableSign(() => connector.signMessage(message, opts), 'message');
    });
  }

  /** Sign-In With Stellar — see siws.ts for the message format. Also queued, since it's a signMessage() call under the hood. */
  signIn(opts: Omit<SignInOptions, 'connector' | 'network' | 'appMetadata'> & { skipPreview?: boolean }): Promise<SignInResult> {
    const connector = this.requireActiveConnector();
    if (!this.appMetadata) {
      throw ConnectError.invalidRequest(
        'signIn() requires appMetadata.name to be set in the StellarAppKit config. ' +
        'url is auto-derived from window.location in the browser, but name must be provided explicitly.'
      );
    }
    // Derive domain and uri from the appMetadata url (WC metadata shape)
    const domain = deriveDomainFromUrl(this.appMetadata.url);
    const uri = this.appMetadata.url;
    if (!domain || !uri) {
      throw ConnectError.invalidRequest(
        `signIn() requires appMetadata.url. It's auto-derived from window.location in the browser, ` +
        `but you're likely running in SSR/Node.js where window is undefined. Pass it explicitly: ` +
        `appMetadata: { name: 'My App', url: 'https://example.com' }.`
      );
    }
    return this.enqueueSign(async () => {
      // Show the preview UI before signing (unless skipPreview is set)
      if (this.onPreviewTransaction && !opts.skipPreview) {
        const session = this.session;
        const preview: TransactionPreview = {
          sourceAccount: session?.address ?? 'unknown',
          fee: '0',
          operations: [{
            type: 'signMessage',
            summary: `Sign in to ${this.appMetadata!.name}`,
            details: { statement: opts.statement, nonce: opts.nonce },
            riskFlags: [],
          }],
          riskFlags: [],
          raw: { xdr: '', networkPassphrase: this.resolveNetworkPassphrase() },
        };
        const approved = await this.onPreviewTransaction(preview);
        if (!approved) throw ConnectError.rejected(connector.id);
      }

      // Wallet-side half — a failure here arms retryLastSign() ("Try again").
      return this.runRetryableSign(
        () =>
          signInWithStellar({
            ...opts,
            connector,
            network: this.network,
            appMetadata: {
              name: this.appMetadata!.name,
              domain,
              uri,
            },
          }),
        'signIn'
      );
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
