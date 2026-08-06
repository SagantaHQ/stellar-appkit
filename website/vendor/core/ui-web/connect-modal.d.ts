import type { StellarAppKit } from '../index.js';
export type PresentationMode = 'auto' | 'modal' | 'bottom-sheet' | 'inline';
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
    private lastError;
    private copyState;
    /** Which address was most recently copied — tracks the copy button's "copied!" feedback per-address. */
    private copiedAddress;
    private pendingAccountPicker;
    private pendingPreview;
    private releaseFocusTrap;
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
     * Fetches avatars for all connected sessions (and account-picker
     * accounts) in parallel, then re-renders. Uses the avatar cache so
     * already-fetched avatars aren't re-fetched. Called on sessionsChanged
     * and when the account picker appears.
     */
    private refreshAvatars;
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
    private defaultTitle;
    private renderBody;
    private renderWalletList;
    private renderAccountPicker;
    private renderConnected;
    private renderTransactionPreview;
    private renderNetworkMismatch;
    private renderError;
    private wireEvents;
}
//# sourceMappingURL=connect-modal.d.ts.map