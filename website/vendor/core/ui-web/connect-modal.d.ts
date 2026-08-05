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
    private pendingAccountPicker;
    private pendingPreview;
    private releaseFocusTrap;
    private clientUnsubscribers;
    private mediaQuery;
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