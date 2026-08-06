import type { StellarAppKit, WalletAccountOption, WalletReachability, TransactionPreview, RiskFlag } from '../index.js';
import { ConnectError, NetworkMismatchError, type WalletConnector } from '../index.js';
import { darkTheme, lightTheme, themeToCssDeclarations, type ConnectTheme } from './tokens.js';
import { buildStyles } from './styles.js';
import { icons, genericWalletIcon, getWalletIconDataUri } from './icons.js';
import { trapFocus } from './a11y.js';
import { gradientFromAddress, stellarExpertAvatarUrl, fetchWalletAvatar } from './avatar.js';

export type PresentationMode = 'auto' | 'modal' | 'bottom-sheet' | 'inline';
type EffectiveMode = 'modal' | 'bottom-sheet' | 'inline';
type ViewState = 'wallet-list' | 'connecting' | 'account-picker' | 'connected' | 'network-mismatch' | 'transaction-preview' | 'error';

const MOBILE_BREAKPOINT_PX = 640;

/**
 * `<saganta-appkit-modal>` — the single UI entry point. Attach a
 * `StellarAppKit` instance via the `.client` property (not an attribute —
 * it isn't serializable), then call `.open()`. Presentation mode, theme,
 * and branding are all set via attributes so they can be authored in
 * plain HTML.
 *
 * Supports more than one wallet connected at once — the "connected" view
 * becomes a switcher once a second wallet is added via "Connect another".
 * Wallets that expose multiple accounts (Ledger, currently) show a
 * one-time picker right after connecting.
 *
 * Fires standard CustomEvents (`sc-connect`, `sc-disconnect`, `sc-error`)
 * mirroring the underlying client's events, so host apps that only have a
 * DOM reference to this element (e.g. from a template) don't need the
 * client instance to react to state changes.
 */
export class SagantaAppKitModal extends HTMLElement {
  static get observedAttributes() {
    return ['mode', 'theme', 'branding', 'logo-src', 'title', 'auto-retry-network', 'stellar-expert-avatars'];
  }

  private root: ShadowRoot;
  private _client: StellarAppKit | null = null;
  private isOpen = false;
  /** True once the enter transition has run — later re-renders (wallet list loading, connect/error events) shouldn't replay it. */
  private hasEnteredOpenState = false;
  private view: ViewState = 'wallet-list';
  private walletList: { connector: WalletConnector; reachability: WalletReachability }[] = [];
  private connectingWalletId: string | null = null;
  private lastError: ConnectError | null = null;
  private copyState: 'idle' | 'copied' = 'idle';
  /** Which address was most recently copied — tracks the copy button's "copied!" feedback per-address. */
  private copiedAddress: string | null = null;
  private pendingAccountPicker: { connector: WalletConnector; accounts: WalletAccountOption[] } | null = null;
  private pendingPreview: { preview: TransactionPreview; resolve: (approved: boolean) => void; wasAlreadyOpen: boolean } | null = null;
  private releaseFocusTrap: (() => void) | null = null;
  private gestureDestroyer: { destroy: () => void } | null = null;
  private clientUnsubscribers: Array<() => void> = [];
  private mediaQuery = typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`) : null;
  /** Cache of avatar URLs keyed by address — avoids re-fetching on every render. */
  private avatarCache: Map<string, string | null> = new Map();

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    if (this.getAttribute('mode') === 'inline') {
      this.isOpen = true;
      this.render();
    }
  }

  disconnectedCallback() {
    this.releaseFocusTrap?.();
    this.gestureDestroyer?.destroy();
    this.clientUnsubscribers.forEach((unsub) => unsub());
  }

  attributeChangedCallback() {
    this.render();
  }

  set client(client: StellarAppKit) {
    this.clientUnsubscribers.forEach((unsub) => unsub());
    this.clientUnsubscribers = [];
    this._client = client;

    if (client.onPreviewTransaction) {
      console.warn('[saganta-appkit] Overwriting an existing onPreviewTransaction handler with this modal\u2019s own preview UI.');
    }
    client.onPreviewTransaction = (preview) => this.showTransactionPreview(preview);

    this.clientUnsubscribers.push(
      client.on('connect', (session) => {
        this.dispatchEvent(new CustomEvent('sc-connect', { detail: session, bubbles: true, composed: true }));
        // Doesn't jump straight to 'connected' here — see selectWallet(), which
        // routes through the account picker first for multi-account wallets.
      }),
      client.on('disconnect', ({ walletId }) => {
        this.dispatchEvent(new CustomEvent('sc-disconnect', { detail: { walletId }, bubbles: true, composed: true }));
        this.view = client.sessions.length > 0 ? 'connected' : 'wallet-list';
        this.render();
      }),
      client.on('accountSwitch', () => {
        this.view = 'connected';
        this.render();
      }),
      client.on('sessionsChanged', () => {
        this.refreshAvatars();
        this.render();
      }),
      client.on('error', (err) => {
        this.lastError = err;
        this.view = err instanceof NetworkMismatchError ? 'network-mismatch' : 'error';
        this.dispatchEvent(new CustomEvent('sc-error', { detail: err, bubbles: true, composed: true }));
        this.render();
      })
    );

    this.view = client.session ? 'connected' : 'wallet-list';
    this.refreshWalletList();
  }

  get client(): StellarAppKit | null {
    return this._client;
  }

  /** Opens the modal/bottom-sheet. No-op (with a console warning) for `mode="inline"`, which is always "open". */
  async open() {
    if (this.getAttribute('mode') === 'inline') {
      console.warn('[saganta-appkit] open() has no effect in inline mode — the panel is always rendered in place.');
      return;
    }
    if (!this._client) {
      throw new Error('[saganta-appkit] Set the `.client` property to a StellarAppKit instance before calling open().');
    }
    this.isOpen = true;
    if (!this.pendingPreview && !this.pendingAccountPicker) {
      this.view = this._client.session ? 'connected' : 'wallet-list';
    }
    document.addEventListener('keydown', this.handleGlobalKeydown);
    this.render();
    if (!this.pendingPreview) {
      // A preview already has its own decoded content ready to render — refreshing the wallet
      // list here would be wasted work and, worse, races a second render() against the one
      // showTransactionPreview() is about to trigger.
      await this.refreshWalletList();
    }

    requestAnimationFrame(() => {
      const overlay = this.root.querySelector<HTMLElement>('.overlay');
      overlay?.setAttribute('data-open', 'true');
      this.hasEnteredOpenState = true;
      this.releaseFocusTrap = trapFocus(this.root, () => this.root.querySelector<HTMLElement>('.panel'));
    });
  }

  close() {
    if (this.getAttribute('mode') === 'inline') return;
    if (this.pendingPreview) {
      const { resolve } = this.pendingPreview;
      this.pendingPreview = null;
      resolve(false);
    }
    const overlay = this.root.querySelector<HTMLElement>('.overlay');
    overlay?.setAttribute('data-open', 'false');
    document.removeEventListener('keydown', this.handleGlobalKeydown);
    this.releaseFocusTrap?.();
    this.releaseFocusTrap = null;
    window.setTimeout(() => {
      this.isOpen = false;
      this.hasEnteredOpenState = false;
      this.render();
    }, 200);
  }

  private handleGlobalKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.close();
  };

  private async refreshWalletList() {
    if (!this._client) return;
    this.walletList = await this._client.registry.listReachability();
    this.render();
  }

  /**
   * Fetches avatars for all connected sessions (and account-picker
   * accounts) in parallel, then re-renders. Uses the avatar cache so
   * already-fetched avatars aren't re-fetched. Called on sessionsChanged
   * and when the account picker appears.
   */
  private async refreshAvatars() {
    if (!this._client) return;

    // Collect all addresses that need avatars: connected sessions + account picker.
    const addressesToFetch: Array<{ address: string; connector: WalletConnector | null }> = [];
    for (const session of this._client.sessions) {
      addressesToFetch.push({
        address: session.address,
        connector: this._client.registry.get(session.walletId) ?? null,
      });
    }
    if (this.pendingAccountPicker) {
      for (const account of this.pendingAccountPicker.accounts) {
        addressesToFetch.push({
          address: account.address,
          connector: this.pendingAccountPicker.connector,
        });
      }
    }

    // Fetch in parallel — each call checks the cache first, so already-fetched
    // avatars return immediately.
    await Promise.all(
      addressesToFetch.map(({ address, connector }) => this.fetchAvatar(address, connector))
    );

    // Re-render with the now-populated avatar cache.
    this.render();
  }

  private async selectWallet(connector: WalletConnector) {
    if (!this._client) return;

    const reachability = await connector.getReachability();
    if (reachability === 'not-installed') {
      const installUrl = pickInstallUrl(connector);
      if (installUrl) window.open(installUrl, '_blank', 'noopener');
      return;
    }
    if (reachability === 'unavailable') return;

    this.connectingWalletId = connector.id;
    this.view = 'connecting';
    this.render();

    try {
      const autoRetry = this.getAttribute('auto-retry-network') === 'true';
      await this._client.connect(connector.id, { autoRetryNetworkMismatch: autoRetry });

      if (connector.listAccounts) {
        const accounts = await connector.listAccounts();
        if (accounts.length > 1) {
          this.pendingAccountPicker = { connector, accounts };
          this.view = 'account-picker';
          this.render();
          // Fetch avatars for the picker accounts in the background —
          // the initial render shows gradient fallbacks, then avatars
          // pop in once fetched.
          void this.refreshAvatars();
          return;
        }
      }

      this.view = 'connected';
      this.render();
      // 'error'/'network-mismatch' views are set by the client's 'error' event handler above on failure.
    } finally {
      this.connectingWalletId = null;
    }
  }

  private async pickAccount(address: string) {
    if (!this._client || !this.pendingAccountPicker) return;
    try {
      await this._client.switchAccount(this.pendingAccountPicker.connector.id, address);
      this.pendingAccountPicker = null;
      this.view = 'connected';
    } catch (err) {
      this.lastError = err instanceof ConnectError ? err : ConnectError.internal(String(err));
      this.view = 'error';
    }
    this.render();
  }

  /**
   * Installed as the client's onPreviewTransaction handler. Opens the
   * modal if it isn't already (a sign request can arrive from anywhere in
   * the app, not just from a click inside this modal), shows the decoded
   * operations + risk flags, and resolves once the user picks Approve or
   * Reject. The signature queue in StellarAppKit guarantees only one of
   * these is ever pending at a time, so there's no need to queue previews
   * client-side too.
   */
  private showTransactionPreview(preview: TransactionPreview): Promise<boolean> {
    const wasAlreadyOpen = this.isOpen;
    return new Promise<boolean>((resolve) => {
      this.pendingPreview = { preview, resolve, wasAlreadyOpen };
      this.view = 'transaction-preview';
      if (!this.isOpen) {
        void this.open();
      } else {
        this.render();
      }
    });
  }

  private resolvePreview(approved: boolean) {
    if (!this.pendingPreview) return;
    const { resolve, wasAlreadyOpen } = this.pendingPreview;
    resolve(approved);
    this.pendingPreview = null;
    if (wasAlreadyOpen) {
      this.view = this._client?.session ? 'connected' : 'wallet-list';
      this.render();
    } else {
      this.close();
    }
  }

  private async copyAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      this.copyState = 'copied';
      this.copiedAddress = address;
      this.render();
      window.setTimeout(() => {
        // Only clear the "copied" state if it's still for the same address
        // — a newer copy on a different address shouldn't be cleared by
        // an older timeout.
        if (this.copiedAddress === address) {
          this.copyState = 'idle';
          this.copiedAddress = null;
          this.render();
        }
      }, 1500);
    } catch {
      /* clipboard permission denied — silently ignore, address is still visible to copy manually */
    }
  }

  /**
   * Fetches the avatar URL for a given address + connector, with caching.
   * Returns null if no avatar is available (the UI falls back to a
   * generated gradient).
   *
   * Priority:
   * 1. Wallet-provided avatar (connector.getAvatar()) — highest priority,
   *    the wallet knows the user's profile picture.
   * 2. Stellar Expert avatar API (if `stellar-expert-avatars` attribute
   *    is set) — a public service that generates avatars for any Stellar
   *    account.
   * 3. null — the UI uses gradientFromAddress() as a fallback.
   */
  private async fetchAvatar(address: string, connector: WalletConnector | null): Promise<string | null> {
    const cacheKey = address;
    if (this.avatarCache.has(cacheKey)) {
      return this.avatarCache.get(cacheKey) ?? null;
    }

    // 1. Try the wallet's own avatar support first.
    if (connector) {
      const walletAvatar = await fetchWalletAvatar(connector);
      if (walletAvatar) {
        this.avatarCache.set(cacheKey, walletAvatar);
        return walletAvatar;
      }
    }

    // 2. Try Stellar Expert's public avatar API (opt-in via attribute).
    if (this.getAttribute('stellar-expert-avatars') === 'true') {
      const url = stellarExpertAvatarUrl(address);
      this.avatarCache.set(cacheKey, url);
      return url;
    }

    // 3. No avatar available — UI will use the gradient fallback.
    this.avatarCache.set(cacheKey, null);
    return null;
  }

  private computeEffectiveMode(): EffectiveMode {
    const attr = (this.getAttribute('mode') as PresentationMode) ?? 'auto';
    if (attr === 'modal' || attr === 'bottom-sheet' || attr === 'inline') return attr;
    return this.mediaQuery?.matches ? 'bottom-sheet' : 'modal';
  }

  private resolveTheme(): ConnectTheme {
    const attr = this.getAttribute('theme') ?? 'dark';
    const mode = attr === 'auto' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : attr;
    return mode === 'light' ? lightTheme : darkTheme;
  }

  private render() {
    const effectiveMode = this.computeEffectiveMode();
    const theme = this.resolveTheme();
    const branding = this.getAttribute('branding') === 'hide' ? 'hide' : 'show';
    this.setAttribute('data-branding', branding);

    const styleTag = `<style>${themeHostDeclarations(theme)}\n${buildStyles(theme)}</style>`;
    const panelHtml = this.renderPanel(effectiveMode);

    if (effectiveMode === 'inline') {
      this.root.innerHTML = `${styleTag}<div class="inline-root">${panelHtml}</div>`;
    } else if (this.isOpen) {
      const openAttr = this.hasEnteredOpenState ? 'true' : 'false';
      this.root.innerHTML = `${styleTag}<div class="overlay" data-mode="${effectiveMode}" data-open="${openAttr}" role="presentation">${panelHtml}</div>`;
    } else {
      this.root.innerHTML = styleTag;
    }

    this.wireEvents(effectiveMode);
  }

  private renderPanel(effectiveMode: EffectiveMode): string {
    const showClose = effectiveMode !== 'inline';
    const title = this.getAttribute('title') ?? this.defaultTitle();
    const logoSrc = this.getAttribute('logo-src');

    return `
      <div class="panel" role="dialog" aria-modal="${effectiveMode !== 'inline'}" aria-label="${title}">
        ${effectiveMode === 'bottom-sheet' ? '<div class="drag-handle"></div>' : ''}
        <div class="header">
          <div class="brand">
            ${logoSrc ? `<img src="${escapeAttr(logoSrc)}" alt="" />` : '<slot name="logo"></slot>'}
            <span class="title">${escapeHtml(title)}</span>
          </div>
          ${showClose ? `<button class="icon-btn" data-action="close" aria-label="Close">${icons.close}</button>` : ''}
        </div>
        <div class="body">${this.renderBody()}</div>
        <div class="footer">Powered by Stellar AppKit</div>
      </div>
    `;
  }

  private defaultTitle(): string {
    switch (this.view) {
      case 'connected':
        return (this._client?.sessions.length ?? 0) > 1 ? 'Accounts' : 'Account';
      case 'account-picker':
        return 'Choose an account';
      case 'network-mismatch':
        return 'Wrong network';
      case 'transaction-preview':
        return 'Review transaction';
      default:
        return 'Connect a wallet';
    }
  }

  private renderBody(): string {
    switch (this.view) {
      case 'connected':
        return this.renderConnected();
      case 'account-picker':
        return this.renderAccountPicker();
      case 'network-mismatch':
        return this.renderNetworkMismatch();
      case 'transaction-preview':
        return this.renderTransactionPreview();
      case 'error':
        return this.renderError();
      case 'connecting':
      case 'wallet-list':
      default:
        return this.renderWalletList();
    }
  }

  private renderWalletList(): string {
    if (this.walletList.length === 0) {
      return `<div style="padding: 24px 12px; text-align: center; font-size: 13px; color: var(--sak-color-text-muted);">No wallets registered. Pass connectors into the StellarAppKit config.</div>`;
    }

    return this.walletList
      .map(({ connector, reachability }) => {
        const isConnecting = this.connectingWalletId === connector.id;
        const subLabel =
          isConnecting ? 'Connecting…'
          : reachability === 'not-installed' ? 'Install'
          : reachability === 'locked' ? 'Locked'
          : reachability === 'unavailable' ? 'Unavailable'
          : '';
        const disabled = (this.view === 'connecting' && !isConnecting) || reachability === 'unavailable';

        // Use the wallet's official icon URL first; fall back to our
        // bundled inline SVG data-URI if the URL fails to load.
        const fallbackIcon = getWalletIconDataUri(connector.id);
        const onerrorHandler = fallbackIcon
          ? `this.src='${fallbackIcon}'; this.onerror=null;`
          : `this.style.display='none'; this.nextElementSibling.style.display='flex';`;

        return `
          <button class="wallet-row" data-action="select-wallet" data-wallet-id="${connector.id}" data-unavailable="${reachability !== 'available'}" ${disabled ? 'disabled' : ''}>
            <span class="wallet-tile ${isConnecting ? 'connecting' : ''}">
              <img src="${escapeAttr(connector.meta.icon)}" alt="" onerror="${onerrorHandler}" />
              ${fallbackIcon ? '' : `<span style="display:none; width:18px; height:18px;">${genericWalletIcon}</span>`}
            </span>
            <span class="wallet-name">${escapeHtml(connector.meta.name)}</span>
            <span class="wallet-sub">${subLabel}</span>
          </button>
        `;
      })
      .join('');
  }

  private renderAccountPicker(): string {
    const picker = this.pendingAccountPicker;
    if (!picker) return this.renderWalletList();

    return picker.accounts
      .map(
        (account) => {
          const gradient = gradientFromAddress(account.address);
          const avatarUrl = this.avatarCache.get(account.address);
          const avatarHtml = avatarUrl
            ? `<img src="${escapeAttr(avatarUrl)}" alt="" onerror="this.style.display='none'; this.parentElement.style.background='${gradient}';" />`
            : '';
          const isCopied = this.copiedAddress === account.address && this.copyState === 'copied';
          return `
            <button class="wallet-row" data-action="pick-account" data-address="${escapeAttr(account.address)}">
              <span class="account-avatar" style="background: ${gradient};">${avatarHtml}</span>
              <span style="min-width:0; text-align:left; flex:1;">
                <span class="wallet-name" style="display:block;">${escapeHtml(account.label ?? 'Account')}</span>
                <span class="account-network" style="font-family: var(--sak-font-mono);">${truncateAddress(account.address)}</span>
              </span>
              <button class="icon-btn" data-action="copy-address-inline" data-address="${escapeAttr(account.address)}" aria-label="Copy address" onclick="event.stopPropagation();">${isCopied ? icons.check : icons.copy}</button>
            </button>
          `;
        }
      )
      .join('');
  }

  private renderConnected(): string {
    const sessions = this._client?.sessions ?? [];
    const activeWalletId = this._client?.activeConnector?.id;
    if (sessions.length === 0) return this.renderWalletList();

    const rows = sessions
      .map((session) => {
        const isActive = session.walletId === activeWalletId;
        const gradient = gradientFromAddress(session.address);
        const avatarUrl = this.avatarCache.get(session.address);
        const avatarHtml = avatarUrl
          ? `<img src="${escapeAttr(avatarUrl)}" alt="" onerror="this.style.display='none'; this.parentElement.style.background='${gradient}';" />`
          : '';
        const isCopied = this.copiedAddress === session.address && this.copyState === 'copied';
        return `
          <div class="account-row" data-active="${isActive}" style="${isActive ? '' : 'opacity:0.7;'}">
            <div class="account-avatar" style="background: ${gradient};">${avatarHtml}</div>
            <div style="min-width:0; flex:1; cursor:${isActive ? 'default' : 'pointer'};" data-action="${isActive ? '' : 'switch-account'}" data-wallet-id="${session.walletId}">
              <div class="account-address">${truncateAddress(session.address)}</div>
              <div class="account-network">${escapeHtml(session.network)}${isActive ? ' · active' : ''}</div>
            </div>
            <div class="account-actions">
              <button class="icon-btn" data-action="copy-address-inline" data-address="${escapeAttr(session.address)}" aria-label="Copy address">${isCopied ? icons.check : icons.copy}</button>
              <button class="icon-btn" data-action="disconnect-one" data-wallet-id="${session.walletId}" aria-label="Disconnect">${icons.close}</button>
            </div>
          </div>
        `;
      })
      .join('');

    return `
      <div class="account">
        ${rows}
        <button class="btn" data-action="connect-another">+ Connect another wallet</button>
      </div>
    `;
  }

  private renderTransactionPreview(): string {
    const pending = this.pendingPreview;
    if (!pending) return this.renderWalletList();
    const { preview } = pending;

    const txFlags = preview.riskFlags.map((flag) => riskFlagHtml(flag)).join('');

    // Surface the fee estimate if available (populated by
    // SorobanConnection.previewInvoke when includeFeeEstimate is on).
    const feeHtml = preview.feeEstimate
      ? `<span>Fee ${preview.feeEstimate.totalFeeXlm}</span>`
      : `<span>Fee ${preview.fee} stroops</span>`;

    const isCopied = this.copiedAddress === preview.sourceAccount && this.copyState === 'copied';

    const opsHtml = preview.operations
      .map((op, i) => {
        const opFlags = op.riskFlags.map((flag) => riskFlagHtml(flag)).join('');
        // Surface contract badges if present (from previewOptions.contractMetadata)
        const badgesHtml = op.contractBadges && op.contractBadges.length > 0
          ? `<div class="contract-badges">${op.contractBadges.map((b) => `<span class="contract-badge badge-${b.severity}"${b.url ? ` data-url="${escapeAttr(b.url)}"` : ''}>${escapeHtml(b.label)}</span>`).join('')}</div>`
          : '';
        return `
          <div class="preview-op">
            <div class="preview-op-summary"><span class="preview-op-index">${i + 1}.</span> ${escapeHtml(op.summary)}</div>
            ${badgesHtml}
            ${opFlags}
          </div>
        `;
      })
      .join('');

    return `
      <div class="preview">
        <div class="preview-meta">
          <span class="preview-meta-item">
            From ${truncateAddress(preview.sourceAccount)}
            <button class="icon-btn" data-action="copy-address-inline" data-address="${escapeAttr(preview.sourceAccount)}" aria-label="Copy address">${isCopied ? icons.check : icons.copy}</button>
          </span>
          ${feeHtml}
        </div>
        ${txFlags}
        <div class="preview-ops">${opsHtml}</div>
        <div class="preview-actions">
          <button class="btn" data-action="reject-preview">Reject</button>
          <button class="btn btn-primary" data-action="approve-preview">Approve</button>
        </div>
      </div>
    `;
  }

  private renderNetworkMismatch(): string {
    const err = this.lastError instanceof NetworkMismatchError ? this.lastError : null;
    return `
      <div class="error-state">
        ${icons.alertCircle}
        <div class="error-title">Wrong network</div>
        <div class="error-message">
          ${err ? `This wallet is on <strong>${escapeHtml(err.actualNetwork)}</strong>, this app needs <strong>${escapeHtml(err.expectedNetwork)}</strong>.` : 'This wallet is on the wrong network.'}
          Switch networks in your wallet, then try again.
        </div>
        <button class="btn" data-action="retry" style="margin-top: 6px;">Try again</button>
      </div>
    `;
  }

  private renderError(): string {
    return `
      <div class="error-state">
        ${icons.alertCircle}
        <div class="error-title">Something went wrong</div>
        <div class="error-message">${escapeHtml(this.lastError?.message ?? 'Unknown error.')}</div>
        <button class="btn" data-action="retry" style="margin-top: 6px;">Try again</button>
      </div>
    `;
  }

  /**
   * Wires up the drag-to-dismiss gesture for the bottom-sheet using
   * @use-gesture/vanilla + motion. Lazy-imported so apps that don't use
   * bottom-sheet mode (or don't have the packages installed) don't pay
   * the cost.
   *
   * Behavior:
   * - Drag down on the sheet's header area (drag handle + header) moves the sheet
   * - Release with velocity > 0.5 or drag > 40% of sheet height → close
   * - Release otherwise → spring back to open position
   * - Only vertical dragging is enabled (horizontal swipes are ignored)
   * - Works with both touch and mouse pointers (for desktop testing)
   *
   * If the gesture packages aren't installed, this silently no-ops — the
   * bottom-sheet still works via the close button and backdrop tap.
   *
   * IMPORTANT: this must be called after every render() that touches the
   * bottom-sheet DOM, because render() replaces innerHTML and destroys the
   * element the gesture was bound to. wireEvents() calls this automatically.
   */
  private async setupBottomSheetGestures() {
    let gestureModule: typeof import('@use-gesture/vanilla') | null = null;
    let motionModule: typeof import('motion') | null = null;
    try {
      [gestureModule, motionModule] = await Promise.all([
        import('@use-gesture/vanilla'),
        import('motion'),
      ]);
    } catch {
      // Packages not installed — bottom-sheet works without gestures
      // (close button + backdrop tap still functional).
      return;
    }

    const panel = this.root.querySelector<HTMLElement>('.panel');
    if (!panel) return;

    // Use Gesture (the multi-gesture recognizer), NOT DragGesture.
    // DragGesture(target, handler, config) wraps the 2nd arg as { drag: handler }
    // and the Engine calls this.handler(state) as a FUNCTION — so the 2nd arg
    // must be a single function, not an object with onDrag/onDragStart/onDragEnd.
    //
    // Gesture(target, handlers, config) calls parseMergedHandlers internally,
    // which properly wraps onDrag/onDragStart/onDragEnd into a single function.
    const Gesture = (gestureModule as unknown as {
      Gesture: (el: HTMLElement, handlers: unknown, config?: unknown) => { destroy: () => void };
    }).Gesture;
    const animate = (motionModule as unknown as {
      animate: (el: HTMLElement, keyframes: unknown, opts?: unknown) => void;
    }).animate;

    let currentY = 0;
    let sheetHeight = 0;

    const measureSheet = () => {
      sheetHeight = panel.offsetHeight;
    };

    // Clean up any previous gesture handler (e.g. from a re-render)
    this.gestureDestroyer?.destroy();

    // Gesture(target, handlers, config):
    //   handlers = { onDragStart, onDrag, onDragEnd } — parseMergedHandlers
    //   wraps these into a single fn that the Engine calls as this.handler(state)
    //   config = { drag: { axis, filterTaps, pointer } } — nested under 'drag'
    const gesture = Gesture(panel, {
      onDragStart: () => {
        measureSheet();
        panel.style.transition = 'none';
        panel.style.willChange = 'transform';
      },
      onDrag: (state: { movement: [number, number] }) => {
        const my = state.movement[1];
        currentY = Math.max(0, my);
        panel.style.transform = `translateY(${currentY}px)`;
        const overlay = this.root.querySelector<HTMLElement>('.overlay');
        if (overlay && sheetHeight > 0) {
          const progress = currentY / sheetHeight;
          overlay.style.opacity = String(Math.max(0, 1 - progress * 0.7));
        }
      },
      onDragEnd: (state: { velocity: [number, number] }) => {
        const velocity = state.velocity;
        panel.style.willChange = 'auto';
        panel.style.transition = '';

        const shouldClose = velocity[1] > 0.5 || currentY > sheetHeight * 0.4;

        if (shouldClose) {
          animate(
            panel,
            { transform: `translateY(${sheetHeight + 100}px)` },
            { duration: 0.25, easing: 'ease-in' }
          );
          const overlay = this.root.querySelector<HTMLElement>('.overlay');
          if (overlay) {
            animate(overlay, { opacity: 0 }, { duration: 0.25 });
          }
          setTimeout(() => {
            this.close();
            panel.style.transform = '';
            currentY = 0;
          }, 250);
        } else {
          animate(
            panel,
            { transform: 'translateY(0px)' },
            { type: 'spring', stiffness: 300, damping: 30 }
          );
          const overlay = this.root.querySelector<HTMLElement>('.overlay');
          if (overlay) {
            animate(overlay, { opacity: 1 }, { type: 'spring', stiffness: 300, damping: 30 });
          }
          currentY = 0;
        }
      },
    }, {
      drag: {
        axis: 'y',
        filterTaps: true,
        pointer: { capture: true },
      },
    });

    this.gestureDestroyer = gesture;
  }

  private wireEvents(effectiveMode: EffectiveMode) {
    this.root.querySelector('[data-action="close"]')?.addEventListener('click', () => this.close());
    if (effectiveMode !== 'inline') {
      this.root.querySelector('.overlay')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) this.close();
      });
    }

    // Wire up the draggable bottom-sheet gesture when in bottom-sheet mode.
    // Uses @use-gesture/vanilla + motion (lazy-imported, optional peer deps)
    // so apps that don't use the bottom-sheet mode don't need them installed.
    if (effectiveMode === 'bottom-sheet') {
      void this.setupBottomSheetGestures();
    }

    this.root.querySelectorAll<HTMLElement>('[data-action="select-wallet"]').forEach((el) => {
      el.addEventListener('click', () => {
        const walletId = el.dataset.walletId;
        const found = this.walletList.find((w) => w.connector.id === walletId);
        if (found) this.selectWallet(found.connector);
      });
    });

    this.root.querySelectorAll<HTMLElement>('[data-action="pick-account"]').forEach((el) => {
      el.addEventListener('click', () => {
        const address = el.dataset.address;
        if (address) this.pickAccount(address);
      });
    });

    this.root.querySelectorAll<HTMLElement>('[data-action="switch-account"]').forEach((el) => {
      el.addEventListener('click', () => {
        const walletId = el.dataset.walletId;
        if (walletId) this._client?.switchAccount(walletId);
      });
    });

    this.root.querySelectorAll<HTMLElement>('[data-action="disconnect-one"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const walletId = el.dataset.walletId;
        if (walletId) this._client?.disconnect(walletId);
      });
    });

    this.root.querySelector('[data-action="connect-another"]')?.addEventListener('click', () => {
      this.view = 'wallet-list';
      this.render();
    });

    this.root.querySelector('[data-action="approve-preview"]')?.addEventListener('click', () => this.resolvePreview(true));
    this.root.querySelector('[data-action="reject-preview"]')?.addEventListener('click', () => this.resolvePreview(false));

    this.root.querySelector('[data-action="retry"]')?.addEventListener('click', () => {
      this.view = 'wallet-list';
      this.render();
    });
    this.root.querySelector('[data-action="copy-address"]')?.addEventListener('click', () => {
      if (this._client?.session) this.copyAddress(this._client.session.address);
    });

    // Copy-to-clipboard for any address displayed inline (account picker,
    // connected sessions, transaction preview source account). Each button
    // carries the address in data-address so we know which one to copy.
    this.root.querySelectorAll<HTMLElement>('[data-action="copy-address-inline"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const address = el.dataset.address;
        if (address) this.copyAddress(address);
      });
    });

    // Contract badges with a data-url (e.g. audit report links) open in a
    // new tab on click. Badges without data-url are display-only.
    this.root.querySelectorAll<HTMLElement>('.contract-badge[data-url]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = el.dataset.url;
        if (url) window.open(url, '_blank', 'noopener');
      });
    });
  }
}

function themeHostDeclarations(theme: ConnectTheme): string {
  // Only used to seed :host defaults for the parts of the tree (like ::slotted content)
  // that can't reach a var()-with-fallback declared deeper in the sheet.
  return `:host { ${themeToCssDeclarations(theme)} }`;
}

function pickInstallUrl(connector: WalletConnector): string | null {
  const urls = connector.meta.installUrl;
  if (!urls) return null;
  return urls.chrome ?? urls.firefox ?? urls.safari ?? urls.android ?? urls.ios ?? null;
}

function riskFlagHtml(flag: RiskFlag): string {
  return `<div class="risk-flag risk-${flag.severity}">${escapeHtml(flag.message)}</div>`;
}

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 5)}…${address.slice(-5)}`;
}

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

function escapeAttr(input: string): string {
  return escapeHtml(input);
}

if (!customElements.get('saganta-appkit-modal')) {
  customElements.define('saganta-appkit-modal', SagantaAppKitModal);
}
