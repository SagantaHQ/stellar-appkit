import { ConnectError, NetworkMismatchError } from '../index.js';
import { darkTheme, lightTheme, themeToCssDeclarations } from './tokens.js';
import { buildStyles } from './styles.js';
import { icons, genericWalletIcon } from './icons.js';
import { trapFocus } from './a11y.js';
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
        return ['mode', 'theme', 'branding', 'logo-src', 'title', 'auto-retry-network'];
    }
    constructor() {
        super();
        this._client = null;
        this.isOpen = false;
        /** True once the enter transition has run — later re-renders (wallet list loading, connect/error events) shouldn't replay it. */
        this.hasEnteredOpenState = false;
        this.view = 'wallet-list';
        this.walletList = [];
        this.connectingWalletId = null;
        this.lastError = null;
        this.copyState = 'idle';
        this.pendingAccountPicker = null;
        this.pendingPreview = null;
        this.releaseFocusTrap = null;
        this.clientUnsubscribers = [];
        this.mediaQuery = typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`) : null;
        this.handleGlobalKeydown = (e) => {
            if (e.key === 'Escape')
                this.close();
        };
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
        this.clientUnsubscribers.forEach((unsub) => unsub());
    }
    attributeChangedCallback() {
        this.render();
    }
    set client(client) {
        this.clientUnsubscribers.forEach((unsub) => unsub());
        this.clientUnsubscribers = [];
        this._client = client;
        if (client.onPreviewTransaction) {
            console.warn('[saganta-appkit] Overwriting an existing onPreviewTransaction handler with this modal\u2019s own preview UI.');
        }
        client.onPreviewTransaction = (preview) => this.showTransactionPreview(preview);
        this.clientUnsubscribers.push(client.on('connect', (session) => {
            this.dispatchEvent(new CustomEvent('sc-connect', { detail: session, bubbles: true, composed: true }));
            // Doesn't jump straight to 'connected' here — see selectWallet(), which
            // routes through the account picker first for multi-account wallets.
        }), client.on('disconnect', ({ walletId }) => {
            this.dispatchEvent(new CustomEvent('sc-disconnect', { detail: { walletId }, bubbles: true, composed: true }));
            this.view = client.sessions.length > 0 ? 'connected' : 'wallet-list';
            this.render();
        }), client.on('accountSwitch', () => {
            this.view = 'connected';
            this.render();
        }), client.on('sessionsChanged', () => {
            this.render();
        }), client.on('error', (err) => {
            this.lastError = err;
            this.view = err instanceof NetworkMismatchError ? 'network-mismatch' : 'error';
            this.dispatchEvent(new CustomEvent('sc-error', { detail: err, bubbles: true, composed: true }));
            this.render();
        }));
        this.view = client.session ? 'connected' : 'wallet-list';
        this.refreshWalletList();
    }
    get client() {
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
            const overlay = this.root.querySelector('.overlay');
            overlay?.setAttribute('data-open', 'true');
            this.hasEnteredOpenState = true;
            this.releaseFocusTrap = trapFocus(this.root, () => this.root.querySelector('.panel'));
        });
    }
    close() {
        if (this.getAttribute('mode') === 'inline')
            return;
        if (this.pendingPreview) {
            const { resolve } = this.pendingPreview;
            this.pendingPreview = null;
            resolve(false);
        }
        const overlay = this.root.querySelector('.overlay');
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
    async refreshWalletList() {
        if (!this._client)
            return;
        this.walletList = await this._client.registry.listReachability();
        this.render();
    }
    async selectWallet(connector) {
        if (!this._client)
            return;
        const reachability = await connector.getReachability();
        if (reachability === 'not-installed') {
            const installUrl = pickInstallUrl(connector);
            if (installUrl)
                window.open(installUrl, '_blank', 'noopener');
            return;
        }
        if (reachability === 'unavailable')
            return;
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
                    return;
                }
            }
            this.view = 'connected';
            this.render();
            // 'error'/'network-mismatch' views are set by the client's 'error' event handler above on failure.
        }
        finally {
            this.connectingWalletId = null;
        }
    }
    async pickAccount(address) {
        if (!this._client || !this.pendingAccountPicker)
            return;
        try {
            await this._client.switchAccount(this.pendingAccountPicker.connector.id, address);
            this.pendingAccountPicker = null;
            this.view = 'connected';
        }
        catch (err) {
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
    showTransactionPreview(preview) {
        const wasAlreadyOpen = this.isOpen;
        return new Promise((resolve) => {
            this.pendingPreview = { preview, resolve, wasAlreadyOpen };
            this.view = 'transaction-preview';
            if (!this.isOpen) {
                void this.open();
            }
            else {
                this.render();
            }
        });
    }
    resolvePreview(approved) {
        if (!this.pendingPreview)
            return;
        const { resolve, wasAlreadyOpen } = this.pendingPreview;
        resolve(approved);
        this.pendingPreview = null;
        if (wasAlreadyOpen) {
            this.view = this._client?.session ? 'connected' : 'wallet-list';
            this.render();
        }
        else {
            this.close();
        }
    }
    async copyAddress(address) {
        try {
            await navigator.clipboard.writeText(address);
            this.copyState = 'copied';
            this.render();
            window.setTimeout(() => {
                this.copyState = 'idle';
                this.render();
            }, 1500);
        }
        catch {
            /* clipboard permission denied — silently ignore, address is still visible to copy manually */
        }
    }
    computeEffectiveMode() {
        const attr = this.getAttribute('mode') ?? 'auto';
        if (attr === 'modal' || attr === 'bottom-sheet' || attr === 'inline')
            return attr;
        return this.mediaQuery?.matches ? 'bottom-sheet' : 'modal';
    }
    resolveTheme() {
        const attr = this.getAttribute('theme') ?? 'dark';
        const mode = attr === 'auto' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : attr;
        return mode === 'light' ? lightTheme : darkTheme;
    }
    render() {
        const effectiveMode = this.computeEffectiveMode();
        const theme = this.resolveTheme();
        const branding = this.getAttribute('branding') === 'hide' ? 'hide' : 'show';
        this.setAttribute('data-branding', branding);
        const styleTag = `<style>${themeHostDeclarations(theme)}\n${buildStyles(theme)}</style>`;
        const panelHtml = this.renderPanel(effectiveMode);
        if (effectiveMode === 'inline') {
            this.root.innerHTML = `${styleTag}<div class="inline-root">${panelHtml}</div>`;
        }
        else if (this.isOpen) {
            const openAttr = this.hasEnteredOpenState ? 'true' : 'false';
            this.root.innerHTML = `${styleTag}<div class="overlay" data-mode="${effectiveMode}" data-open="${openAttr}" role="presentation">${panelHtml}</div>`;
        }
        else {
            this.root.innerHTML = styleTag;
        }
        this.wireEvents(effectiveMode);
    }
    renderPanel(effectiveMode) {
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
    defaultTitle() {
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
    renderBody() {
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
    renderWalletList() {
        if (this.walletList.length === 0) {
            return `<div style="padding: 24px 12px; text-align: center; font-size: 13px; color: var(--sak-color-text-muted);">No wallets registered. Pass connectors into the StellarAppKit config.</div>`;
        }
        return this.walletList
            .map(({ connector, reachability }) => {
            const isConnecting = this.connectingWalletId === connector.id;
            const subLabel = isConnecting ? 'Connecting…'
                : reachability === 'not-installed' ? 'Install'
                    : reachability === 'locked' ? 'Locked'
                        : reachability === 'unavailable' ? 'Unavailable'
                            : '';
            const disabled = (this.view === 'connecting' && !isConnecting) || reachability === 'unavailable';
            return `
          <button class="wallet-row" data-action="select-wallet" data-wallet-id="${connector.id}" data-unavailable="${reachability !== 'available'}" ${disabled ? 'disabled' : ''}>
            <span class="wallet-tile ${isConnecting ? 'connecting' : ''}">
              <img src="${escapeAttr(connector.meta.icon)}" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
              <span style="display:none; width:18px; height:18px;">${genericWalletIcon}</span>
            </span>
            <span class="wallet-name">${escapeHtml(connector.meta.name)}</span>
            <span class="wallet-sub">${subLabel}</span>
          </button>
        `;
        })
            .join('');
    }
    renderAccountPicker() {
        const picker = this.pendingAccountPicker;
        if (!picker)
            return this.renderWalletList();
        return picker.accounts
            .map((account) => `
          <button class="wallet-row" data-action="pick-account" data-address="${escapeAttr(account.address)}">
            <span class="account-avatar" style="width:28px; height:28px; flex-shrink:0;"></span>
            <span style="min-width:0; text-align:left;">
              <span class="wallet-name" style="display:block;">${escapeHtml(account.label ?? 'Account')}</span>
              <span class="account-network" style="font-family: var(--sak-font-mono);">${truncateAddress(account.address)}</span>
            </span>
          </button>
        `)
            .join('');
    }
    renderConnected() {
        const sessions = this._client?.sessions ?? [];
        const activeWalletId = this._client?.activeConnector?.id;
        if (sessions.length === 0)
            return this.renderWalletList();
        const rows = sessions
            .map((session) => {
            const isActive = session.walletId === activeWalletId;
            return `
          <div class="account-row" data-active="${isActive}" style="${isActive ? '' : 'opacity:0.7;'}">
            <div class="account-avatar"></div>
            <div style="min-width:0; flex:1; cursor:${isActive ? 'default' : 'pointer'};" data-action="${isActive ? '' : 'switch-account'}" data-wallet-id="${session.walletId}">
              <div class="account-address">${truncateAddress(session.address)}</div>
              <div class="account-network">${escapeHtml(session.network)}${isActive ? ' · active' : ''}</div>
            </div>
            <div class="account-actions">
              ${isActive ? `<button class="icon-btn" data-action="copy-address" aria-label="Copy address">${this.copyState === 'copied' ? icons.check : icons.copy}</button>` : ''}
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
    renderTransactionPreview() {
        const pending = this.pendingPreview;
        if (!pending)
            return this.renderWalletList();
        const { preview } = pending;
        const txFlags = preview.riskFlags.map((flag) => riskFlagHtml(flag)).join('');
        const opsHtml = preview.operations
            .map((op, i) => {
            const opFlags = op.riskFlags.map((flag) => riskFlagHtml(flag)).join('');
            return `
          <div class="preview-op">
            <div class="preview-op-summary"><span class="preview-op-index">${i + 1}.</span> ${escapeHtml(op.summary)}</div>
            ${opFlags}
          </div>
        `;
        })
            .join('');
        return `
      <div class="preview">
        <div class="preview-meta">
          <span>From ${truncateAddress(preview.sourceAccount)}</span>
          <span>Fee ${preview.fee} stroops</span>
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
    renderNetworkMismatch() {
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
    renderError() {
        return `
      <div class="error-state">
        ${icons.alertCircle}
        <div class="error-title">Something went wrong</div>
        <div class="error-message">${escapeHtml(this.lastError?.message ?? 'Unknown error.')}</div>
        <button class="btn" data-action="retry" style="margin-top: 6px;">Try again</button>
      </div>
    `;
    }
    wireEvents(effectiveMode) {
        this.root.querySelector('[data-action="close"]')?.addEventListener('click', () => this.close());
        if (effectiveMode !== 'inline') {
            this.root.querySelector('.overlay')?.addEventListener('click', (e) => {
                if (e.target === e.currentTarget)
                    this.close();
            });
        }
        this.root.querySelectorAll('[data-action="select-wallet"]').forEach((el) => {
            el.addEventListener('click', () => {
                const walletId = el.dataset.walletId;
                const found = this.walletList.find((w) => w.connector.id === walletId);
                if (found)
                    this.selectWallet(found.connector);
            });
        });
        this.root.querySelectorAll('[data-action="pick-account"]').forEach((el) => {
            el.addEventListener('click', () => {
                const address = el.dataset.address;
                if (address)
                    this.pickAccount(address);
            });
        });
        this.root.querySelectorAll('[data-action="switch-account"]').forEach((el) => {
            el.addEventListener('click', () => {
                const walletId = el.dataset.walletId;
                if (walletId)
                    this._client?.switchAccount(walletId);
            });
        });
        this.root.querySelectorAll('[data-action="disconnect-one"]').forEach((el) => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const walletId = el.dataset.walletId;
                if (walletId)
                    this._client?.disconnect(walletId);
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
            if (this._client?.session)
                this.copyAddress(this._client.session.address);
        });
    }
}
function themeHostDeclarations(theme) {
    // Only used to seed :host defaults for the parts of the tree (like ::slotted content)
    // that can't reach a var()-with-fallback declared deeper in the sheet.
    return `:host { ${themeToCssDeclarations(theme)} }`;
}
function pickInstallUrl(connector) {
    const urls = connector.meta.installUrl;
    if (!urls)
        return null;
    return urls.chrome ?? urls.firefox ?? urls.safari ?? urls.android ?? urls.ios ?? null;
}
function riskFlagHtml(flag) {
    return `<div class="risk-flag risk-${flag.severity}">${escapeHtml(flag.message)}</div>`;
}
function truncateAddress(address) {
    if (address.length <= 12)
        return address;
    return `${address.slice(0, 5)}…${address.slice(-5)}`;
}
function escapeHtml(input) {
    return input.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function escapeAttr(input) {
    return escapeHtml(input);
}
if (!customElements.get('saganta-appkit-modal')) {
    customElements.define('saganta-appkit-modal', SagantaAppKitModal);
}
//# sourceMappingURL=connect-modal.js.map