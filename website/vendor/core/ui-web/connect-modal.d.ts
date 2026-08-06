import type { StellarAppKit } from '../index.js';
export type PresentationMode = 'auto' | 'modal' | 'bottomsheet' | 'bottom-sheet' | 'inline';
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
export declare class SagantaAppKitModal extends HTMLElement {
    static get observedAttributes(): string[];
    private root;
    private _client;
    private isOpen;
    /** True once the enter transition has run — later re-renders (wallet list loading, connect/error events) shouldn't replay it. */
    private hasEnteredOpenState;
    private view;
    private walletList;
    private connectingWalletId;
    /** Error message from the last connect() attempt — set when the client emits an 'error' event while view === 'connecting'. Cleared on retry. */
    private connectingError;
    private lastError;
    private copyState;
    /** Which address was most recently copied — tracks the copy button's "copied!" feedback per-address. */
    private copiedAddress;
    /** Cached XLM balance for the connected account (in lumens, e.g. "123.4567890"). */
    private cachedBalance;
    /** Cached transaction history for the connected account (latest 5). */
    private cachedTxHistory;
    private pendingAccountPicker;
    private pendingPreview;
    private releaseFocusTrap;
    private gestureDestroyer;
    private clientUnsubscribers;
    private mediaQuery;
    /** Cache of avatar URLs keyed by address — avoids re-fetching on every render. */
    private avatarCache;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    attributeChangedCallback(): void;
    set client(client: StellarAppKit);
    get client(): StellarAppKit | null;
    /** Opens the modal/bottom-sheet. No-op (with a console warning) for `mode="inline"`, which is always "open". */
    open(): Promise<void>;
    close(): void;
    private handleGlobalKeydown;
    private refreshWalletList;
    /**
     * Fetches avatars + balance + transaction history for the connected
     * account, then re-renders. Called on connect and sessionsChanged.
     */
    private refreshAccountData;
    private selectWallet;
    private pickAccount;
    /**
     * Installed as the client's onPreviewTransaction handler. Opens the
     * modal if it isn't already (a sign request can arrive from anywhere in
     * the app, not just from a click inside this modal), shows the decoded
     * operations + risk flags, and resolves once the user picks Approve or
     * Reject. The signature queue in StellarAppKit guarantees only one of
     * these is ever pending at a time, so there's no need to queue previews
     * client-side too.
     */
    private showTransactionPreview;
    private resolvePreview;
    private copyAddress;
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
    private fetchAvatar;
    private computeEffectiveMode;
    private resolveTheme;
    private render;
    private renderPanel;
    /**
     * Builds an explorer URL for an account or transaction.
     *
     * Defaults:
     * - Mainnet (PUBLIC): https://stellarchain.io
     * - Testnet: https://testnet.stellarchain.io
     *
     * Override with the `explorer-url` attribute — set it to your preferred
     * explorer's base URL (with or without a trailing slash). The `path`
     * argument is appended to the base.
     *
     * Examples:
     *   explorer-url="https://stellar.expert/explorer/public"
     *   → https://stellar.expert/explorer/public/account/GA...
     *
     *   explorer-url="https://my-explorer.com/" (trailing slash)
     *   → https://my-explorer.com/account/GA...
     *
     *   (no attribute, mainnet)
     *   → https://stellarchain.io/account/GA...
     *
     *   (no attribute, testnet)
     *   → https://testnet.stellarchain.io/account/GA...
     */
    private explorerUrl;
    private defaultTitle;
    private renderPanelHeader;
    private renderBody;
    /**
     * Dedicated connecting view — shown while the wallet's connect() promise
     * is in flight, or when it fails. Two variants:
     *
     * Normal (connecting):
     *   [wallet logo with spinner arc]
     *   Continue in [Wallet]
     *   Accept connection request in the wallet
     *
     * Error (connection failed):
     *   [wallet logo — no spinner]
     *   Continue in [Wallet]
     *   Connection declined or failed
     *   [↻ Try again]
     *
     * The "Try again" button only appears on the error variant. It re-triggers
     * selectWallet() for the same connector. The header keeps the wallet name
     * + back arrow + close in both variants so the user can always navigate away.
     */
    private renderConnecting;
    private renderWalletList;
    private renderAccountPicker;
    private renderConnected;
    private renderTransactionPreview;
    private renderNetworkMismatch;
    private renderError;
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
    private setupBottomSheetGestures;
    private wireEvents;
}
//# sourceMappingURL=connect-modal.d.ts.map