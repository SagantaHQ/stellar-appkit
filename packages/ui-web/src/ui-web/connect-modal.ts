import type { StellarAppKit, WalletAccountOption, WalletReachability, TransactionPreview, RiskFlag } from '@saganta/stellar-appkit';
import { ConnectError, NetworkMismatchError, type WalletConnector } from '@saganta/stellar-appkit';
import { t, onLocaleChange } from '@saganta/stellar-appkit';
import QRCode from 'qrcode';
import { THEME_REGISTRY, THEME_NAMES, minimalDark, themeToCssDeclarations, type ConnectTheme, type ThemeName } from './tokens.js';
import { buildStyles } from './styles.js';
import { icons, genericWalletIcon, getWalletIconDataUri } from './icons.js';
import { trapFocus } from './a11y.js';
import { gradientFromAddress, stellarExpertAvatarUrl, fetchWalletAvatar } from './avatar.js';
import {
  ModalMotionAnimator,
  BottomsheetMotionAnimator,
  type AnimationPresetName,
} from './animations/motion-animator.js';
import { BottomsheetMotionDragController } from './animations/motion-drag-controller.js';
import { ModalSwipeController } from './animations/modal-swipe-controller.js';

// Re-export for backward compatibility
export type { AnimationPresetName };
export type ModalAnimationOption = AnimationPresetName | {
  open?: AnimationPresetName;
  close?: AnimationPresetName;
};

export type PresentationMode = 'auto' | 'modal' | 'bottomsheet' | 'bottom-sheet' | 'inline';
type EffectiveMode = 'modal' | 'bottomsheet' | 'inline';
type ViewState = 'wallet-list' | 'connecting' | 'account-picker' | 'connected' | 'network-mismatch' | 'transaction-preview' | 'signing' | 'error' | 'siws-checking' | 'siws-nonce' | 'siws-signing' | 'siws-verifying' | 'siws-error';

const MOBILE_BREAKPOINT_PX = 640;

/**
 * The WalletConnect logo used in the center of the QR code.
 * This is a dedicated 256x256 PNG (not the generic wallet icon) — it's
 * specifically sized + styled for the QR overlay. Pre-encoded base64 for
 * instant loading with no network request.
 */
const WC_QR_LOGO_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAMAAABrrFhUAAAAWlBMVEUUFBT////+/v4AAAAlJSWXl5f9/f0PDw8JCQkXFxcuLi4yMjIqKiodHR03Nzf39/fl5eXS0tLc3Nzu7u6tra3FxcWhoaG4uLhtbW16enqNjY1NTU1dXV2FhYWFd5HbAAAJ6UlEQVR42uzTwQ3EIBAEQXaBh52AJfIP9AI4S+bNVmcwJU2L4gGI4gGI4gGI4gGI4gGI4gGI4gGIv/LgXgBK7c90gQ+AzHjWPLb1ROYXwOoHtzYAZr/Hod19bgGMqx3ZNXYB2qEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/bMbTlxGAiiWlowGl1sfMfY+f/fXDGwEBZcTiCVEpT7gaQI1ahPpLE0WgAsABYA6k21AFgALAAWAAuABcACYAGwAEgCABGZfyIidU/vCoBIcdDeW2udc/HVax3UHQpvCIA5BB3j4kZG3g/M6qK3AkDEISYkiPyw+1i3bd11dd2u9/04GIhYy2xQojcCQEpbLxmz3bortlV+PZBNXpVN/TEyooK1QdbDuwAgE5xD1PDRFdXq/F2bfzoPKt8Wbe8AhMwr8yYAyOhMA9jVRSVfcsp8rdX5zc22WQ8AnGPzDgCMdpK+zCWdpJySsDn8rIoDAx0RvDyA4AG9lvQrCT+rfwyaHiDPrwyAWGtg6KrZ9Lfr4fBargHowPSaAEh5DYxNLr436ecYCK+qtYDX9IoAZO2PTfxXSpQHJIOtag84Jn41ACYjDF0u8R/XYSls14D14FcCwCZkQFud4z+HoOwBZ14JgPEKfSmjf1bCcNNY2ECvAoDYAt0m1rE/PyHxqfaAfxEApDV225vZ/+w6aAAb6AUAkAPajcT/QR2K4Q5aG04dAGVQjQz4hxWZtoAFJw2AKMO4lSn74zouA4eUARA79Pnk9H/+cVBoOJMuAAoe683M9H+uFm4HuGQBkNZov7b8V2d9+vVLD8RqhE0TAJMOqGfzT58LpVcwXwjyHWyKANic8s+mP/UAt2XRdPVBXVOUVX758zwBlx4Ayd9Fg7lFHJWXTdsPuJIdP+piu5HPrOYI9HCUGgAK8/klftWsR4i0zU5yNuAg39dFLuV+loBNDQD7Q/7NzI4+b/YZomJ0q4MiIyLi4F2WaUSNbTmHIBIYYSkpAOSwi8+/ud7GcGz6ayZDdG1AhiIFbwD0zamNMI2ygeakACiHVrwntzDS1wAfLwGnL4+01wYznZQIuoAKSQEgh71UgMnjbAuQDjxvxSFoYJBe2qRfB5/WDCANjkeAqdqXdx7BKvpyRXXArpiaBLIf9GnVAEUWY3WXQHyv3AEZm291VDOgvX+qOO4GKbGngDIWwz0CsTFUA5nHN7eVlGkMhfC7yT/AmdQeg5GAwxBXwe1wexiniL/tpzPc2Voez0MmuZ3gcRVkQuDKrsxgtXnwYkXhI4+O1/mjIaW3Ff5EYPVfC8Mrevx4fV1ZVqf8KR6GTgRsJPApfwcj91pPOLrywjTmt7CU5nH4VAd0HO85fw39VH5xJCFwdCzT7ggpBQcWAqf8VvI/SQBnx5IT7wkqxnG8kr+9Kn9PMEVxdCwBl3hXWLGxMt5j/mDU8zo7FoBN5l6AaKq2kweKaLWGZ3rAZtKxADxN2/wuANLOuUA8Nd5uu4fnB2wmPga07XR+c7L5PQDGApi8qCKNKK8esZnuN4HD/fx8sfktAMaB920P+AkCwXpL6hs28zcuWcYTjrjY/BIAchi38bN/qTm7rcZhGAiHyCD5dzkLpdBd3v81tzUsoiSVHCdO0xzu6Pk6mqZpbI2yA3B04S7W6vVj+sKEArcuVUcCppEBDl5z4pEvS1WHz5h+CQyraWoA139coZyCrrOk+0Uw9geG2hrAwvOL5/w0M+ZuWUxbAxATvPEKtfrmrCWmpQHYfX9Hvj23tcIZ07H0mRhqeQb4sx2K6gVaWgSD4xiHzQywDt65/VG9RLd+gOmnY/ACJkDARgbYwO9Yv0mD0cFheQx/Hh4CNjEADRzGmhXTpGMMEobK6xcwhhoYgAPhFRu1Fq2D+2YYdgAXNwANJL7ijGzVJygS7rNwAUP19XPn0C1/BlCCe27+jTRrSqRj5PpnOCDaeBT5lCDgagawAx717z+nqOZgHGNWMwAjuKfLb/ohXRNuWLiAcfNsPKUHfIuLIP8ICvEtpX5uddVjjITJF0Gz8EWQHXj7JTsgnL6WBsJbYPp8O2ywyY0QOt2BhLJwfnsFg9X180ZVtQHK4kOMbyW8KHyv18+YTsSI9TuyzRZDCV41B/z4FzcKKbJiDCmYvCXgqeFyWHfgHZwdqd/CvniEphcxwvnP9bcwgDdEnyQHHkakoyHYldXPmGFfBYOA4Q2qxlti6BQH+gO4szlHSwFgJ4To5mO4ftNsS6zcgbvD2aSnBUm4jIkDzEMvpSfB4Aq7wujhj+zA/cmBL+EuCxeKFTCRMYExcv3t+wKUOA6lSqfc2RSCryLGaRjWvYMu0EqtMd2BFwgxvxRV4f0ymB3YQOs1Rz0kzQETURd+/FsGs4cYaM32uANX4IAsPKeo/pZgnIqBaHDdgEQA8yhqegYT3UdeRhIOTsD0J0wowcSIK0dk0IH9rUhPmvBniAlifo2IIQ1j4voZIfKarj0ETXgwUIAxKibiigawA9oHvHtUPltnyEI9hm3EtUNSHN8SSxT/+QLBkJ2F4TDeVQzQ706033hcCHO1nCAa+TZPFm75J6USw2G81Q3QHdCFMwZDPebKSVEU1mjKcuk7hmoxzl47KksOebFbvtJNEc8zxo4mY/q8YL62AZYCO1Av3EKg6ZgU8fphaUum2AHeNMMRDE3FeIubSIuj6XjLs6j+CxiciNlOXD4Ku7Xlk99opmFwOwagMSxdE+4XwuCGBiYsmcAdK6XrJXA+MX0JZlsTI5al612/RTDdtgzgrqXa91UwsQiTcHOzw2r8gWee52M8Xn1maOxg6VL98zGbHZ3tbGDpozPfWGakg3sBs+XRWQ6Bqfmveozf8OgsSx/kdsrr76yM2fLobJZ+GJv5T+BpAsa6S5hE2xiclJ4n+t6PzfzTVMxhiPHgaCOTo3wImXJOwqszQXo0/zMJv/1ninad+z7H0AtDDLID/icmQriFh6oeD5/DZDxUU3nipnNMBw5v4rG6X5NFPMhEVRgcYG7jucJZ+v9pvpzbgiqKHWBu5MHK2YI8z3c8OLc1H3NDzxb/x94dpCAQA0EADIwwm2BA0ZP4/3cKi3h1YQU3ofoBfahDLoHp9SV8Xm+Xe8Q5f1Mz1HH195dJRuTek+ifmtH2BUr2tvRW90OuNQMuTJTMXpfD1JS/T20dIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADKpAEAAAAAAAAAAADwDaCWKVO3ArTTpGmbAB4xcV7t08EJACAMBEEQrCGQ/gsV3+bhO5nt4AYuPwAid9syCoDhvQCrdQXAKIG7zwUAAAAAAAAAAAAAAAAAAMABmPD+/ZAYx6gAAAAASUVORK5CYII=';

/**
 * `<stellar-appkit-modal>` — the single UI entry point. Attach a
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
// Use a conditional base class so the module can be imported during SSR
// (where HTMLElement is undefined) without throwing. In the browser,
// HTMLElement is available and the class extends it normally.
// In Node.js (SSR), the class extends a plain no-op base — it's never
// instantiated during SSR, so the missing DOM API doesn't matter.
const ModalBase = typeof HTMLElement !== 'undefined' ? HTMLElement : class {} as typeof HTMLElement;

export class SagantaAppKitModal extends ModalBase {
  static get observedAttributes() {
    return ['mode', 'theme', 'branding', 'logo-src', 'title', 'auto-retry-network', 'stellar-expert-avatars', 'explorer-url', 'animation', 'animation-open', 'animation-close'];
  }

  private root: ShadowRoot;
  private _client: StellarAppKit | null = null;
  private isOpen = false;
  /** True once the enter transition has run — later re-renders (wallet list loading, connect/error events) shouldn't replay it. */
  private hasEnteredOpenState = false;
  private view: ViewState = 'wallet-list';
  private walletList: { connector: WalletConnector; reachability: WalletReachability }[] = [];
  private connectingWalletId: string | null = null;

  /** WalletConnect pairing URI — set via the connector's setOnUri() hook
   *  before connect() is called. When non-null, the connecting view renders
   *  a QR code + deep link instead of the generic spinner. */
  private wcPairingUri: string | null = null;
  /** Pre-rendered QR code data URI for the WC pairing URI. Generated when the
   *  URI arrives (async) so the synchronous renderConnecting() can just inject it. */
  private wcQrDataUri: string | null = null;
  /** Error message from the last connect() or SIWS attempt — set when the
   *  client emits an 'error' event while view === 'connecting', or when
   *  the SIWS flow fails. Cleared on retry. */
  private connectingError: string | null = null;
  /** True when SIWS is configured but hasn't succeeded yet. When the user
   *  closes the modal with this flag true and disconnectOnFail is true,
   *  the wallet is disconnected — because the auth flow wasn't completed. */
  private siwsPending = false;
  /** The preview that was approved — kept so we can retry the sign after a wallet-side rejection. */
  private lastApprovedPreview: TransactionPreview | null = null;
  private lastError: ConnectError | null = null;
  private copyState: 'idle' | 'copied' = 'idle';
  /** Which address was most recently copied — tracks the copy button's "copied!" feedback per-address. */
  private copiedAddress: string | null = null;
  /** Cached XLM balance for the connected account (in lumens, e.g. "123.4567890"). */
  private cachedBalance: string | null = null;
  /** True for ~3s after the user clicks "Get Testnet funds" — shows a confirmation banner. */
  private fundsRequested = false;
  /** Number of sign requests currently queued, including the one in flight — see the signing queue notes on signTransaction(). */
  private _pendingSignCount = 0;
  private cachedTxHistory: Array<{ hash: string; type: string; amount: string; asset: string; date: string; success: boolean }> = [];
  private pendingAccountPicker: { connector: WalletConnector; accounts: WalletAccountOption[] } | null = null;
  private pendingPreview: { preview: TransactionPreview; resolve: (approved: boolean) => void; wasAlreadyOpen: boolean } | null = null;
  private releaseFocusTrap: (() => void) | null = null;
  private clientUnsubscribers: Array<() => void> = [];
  private localeUnsubscriber: (() => void) | null = null;
  private modalAnimator = new ModalMotionAnimator();
  private bottomsheetAnimator = new BottomsheetMotionAnimator();
  private dragController: BottomsheetMotionDragController | null = null;
  private swipeController: ModalSwipeController | null = null;
  private mediaQuery = typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`) : null;
  /** Cache of avatar URLs keyed by address — avoids re-fetching on every render. */
  private avatarCache: Map<string, string | null> = new Map();
  /** Pre-built CSS string — cached so we don't rebuild the 1000+ line stylesheet on every render(). */
  private cachedStyles: string | null = null;
  /** Cached theme hash — if the theme hasn't changed, we reuse cachedStyles. */
  private cachedThemeKey: string = '';
  /** Set of image URLs that have been preloaded into the browser cache.
      Prevents flash-of-empty-image when the modal first renders. */
  private preloadedImages: Set<string> = new Set();

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    if (this.getAttribute('mode') === 'inline') {
      this.isOpen = true;
      this.render();
    }
    // Re-render when the locale changes so all strings update immediately.
    this.localeUnsubscriber = onLocaleChange(() => {
      this.render();
    });
  }

  disconnectedCallback() {
    this.releaseFocusTrap?.();
    this.dragController?.destroy();
    this.dragController = null;
    this.swipeController?.destroy();
    this.swipeController = null;
    this.modalAnimator.destroy();
    this.bottomsheetAnimator.destroy();
    this.clientUnsubscribers.forEach((unsub) => unsub());
    this.localeUnsubscriber?.();
  }

  attributeChangedCallback(name: string) {
    // Animation attributes changed — re-render to pick up new presets
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
        // Haptic feedback on successful connection (Android — no-op on iOS)
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(15);
        }
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
        this.refreshAccountData();
      }),
      client.on('signQueueChange', () => {
        // When the sign queue empties during signing, check if there was
        // an error. The error event fires BEFORE signQueueChange (thanks
        // to the .catch() → .finally() chain in enqueueSign), so
        // connectingError is already set if the wallet rejected.
        if (this.view === 'signing' && client.pendingSignCount === 0) {
          if (!this.connectingError) {
            // Success — transition to connected view
            this.lastApprovedPreview = null;
            this.view = client.session ? 'connected' : 'wallet-list';
            this.render();
          }
          // If connectingError IS set, the error handler already re-rendered
          // the signing view with the error + retry/cancel buttons. We do
          // nothing here — the user decides what to do next.
        } else if (this.view === 'connected') {
          this.render();
        }
      }),
      client.on('error', (err) => {
        this.lastError = err;
        // If we're in the connecting view and the error isn't a network mismatch,
        // stay on the connecting view but show the error + "Try again" button.
        if (this.view === 'connecting' && this.connectingWalletId && !(err instanceof NetworkMismatchError)) {
          this.connectingError = err.message || String(err);
        } else if (this.view === 'signing') {
          // Signing was rejected or failed — show error with retry button.
          // Stay on the signing view but switch to error display.
          this.connectingError = err.message || String(err);
          // Don't change view — the signing view itself renders the error
          // when connectingError is set.
        } else {
          this.view = err instanceof NetworkMismatchError ? 'network-mismatch' : 'error';
        }
        this.dispatchEvent(new CustomEvent('sc-error', { detail: err, bubbles: true, composed: true }));
        // Haptic feedback on error (Android — no-op on iOS). Double-buzz
        // pattern (50ms pause + 50ms buzz) signals failure.
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate([30, 50, 30]);
        }
        this.render();
      })
    );

    this.view = client.session ? 'connected' : 'wallet-list';
    // Preload the wallet list immediately when the client is attached —
    // this runs on page load, not on first open(). By the time the user
    // clicks "Connect wallet", the reachability data is already cached
    // and the modal opens instantly with the full wallet list.
    void this.refreshWalletList();
    // Preload all wallet icons into the browser cache so they don't flash
    // when the modal first renders. Both the bundled data-URI icons (which
    // are instant since they're inline) and the remote URL icons (which
    // need a network fetch) are preloaded.
    this.preloadWalletIcons();
    // If there's a connected session, preload its avatar too.
    if (client.session) {
      this.preloadImage(stellarExpertAvatarUrl(client.session.address));
    }
  }

  /**
   * Preloads all registered wallet icons into the browser's image cache.
   * Uses new Image() to trigger the fetch without rendering — the browser
   * caches the decoded image so when the modal renders <img> tags, they
   * appear instantly without a flash of empty space.
   *
   * Handles both:
   * - Bundled data-URI icons (getWalletIconDataUri) — instant, but we
   *   preload anyway for consistency
   * - Remote URL icons (connector.meta.icon) — these are the ones that
   *   actually flash without preloading
   */
  private preloadWalletIcons(): void {
    if (!this._client) return;
    for (const connector of this._client.registry.list()) {
      // Try the bundled data-URI icon first (instant, no network)
      const dataUri = getWalletIconDataUri(connector.id);
      if (dataUri) {
        this.preloadImage(dataUri);
      }
      // Also preload the remote URL icon (may be different from the data URI)
      if (connector.meta.icon && connector.meta.icon !== dataUri) {
        this.preloadImage(connector.meta.icon);
      }
    }
    // Also preload the app logo if set
    const logoSrc = this.getAttribute('logo-src');
    if (logoSrc) {
      this.preloadImage(logoSrc);
    }
  }

  /**
   * Preloads a single image URL into the browser cache.
   * Creates an Image() object, sets its src, and discards it — the
   * browser caches the decoded image data. Subsequent <img> tags with
   * the same src will render instantly from cache.
   *
   * Skips data: URIs that are already inline (they don't need preloading,
   * but we do it anyway for consistency — it's a no-op for the browser).
   */
  private preloadImage(url: string): void {
    if (!url || this.preloadedImages.has(url)) return;
    if (typeof Image === 'undefined') return; // SSR guard
    this.preloadedImages.add(url);
    try {
      const img = new Image();
      img.src = url;
    } catch {
      // Silently ignore — if preloading fails, the <img onerror> handler
      // in the rendered HTML will fall back to the data-URI icon.
    }
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

    // Cancel any ongoing exit animation
    const effectiveMode = this.computeEffectiveMode();
    if (effectiveMode === 'bottomsheet') {
      this.bottomsheetAnimator.cancel();
    } else {
      this.modalAnimator.cancel();
    }

    this.isOpen = true;
    if (!this.pendingPreview && !this.pendingAccountPicker) {
      this.view = this._client.session ? 'connected' : 'wallet-list';
    }
    document.addEventListener('keydown', this.handleGlobalKeydown);

    // Render IMMEDIATELY with whatever walletList data we have.
    this.render();

    // Set data-open="true" for CSS state + accessibility
    this.hasEnteredOpenState = true;
    const overlayEl = this.root.querySelector<HTMLElement>('.overlay');
    if (overlayEl) {
      overlayEl.setAttribute('data-open', 'true');
    }

    // Motion animation — primary mechanism for smooth spring-based animations.
    const panel = this.root.querySelector<HTMLElement>('.panel');
    const overlay = this.root.querySelector<HTMLElement>('.overlay');
    if (panel && overlay) {
      const { open: openPreset } = this.getAnimationPreset();
      if (effectiveMode === 'bottomsheet') {
        this.bottomsheetAnimator.open(panel, overlay);
      } else {
        // Set initial opacity to prevent flash before Motion kicks in
        panel.style.opacity = '0';
        this.modalAnimator.open(panel, overlay, openPreset).then(() => {
          panel.style.opacity = '';
        }).catch(() => {
          panel.style.opacity = '';
        });
      }
    }

    this.releaseFocusTrap = trapFocus(this.root, () => this.root.querySelector<HTMLElement>('.panel'));

    // Fetch wallet reachability in the background — re-renders when done.
    if (!this.pendingPreview) {
      void this.refreshWalletList();
    }
  }

  /**
   * Close the modal/bottom-sheet.
   *
   * @param skipAnimation When `true`, skip the WAAPI exit animation and
   *   immediately tear down the modal. Used by the bottom-sheet drag-to-dismiss
   *   flow, where the spring has already animated the panel off-screen —
   *   playing the WAAPI exit on top would cause a visible jump back to
   *   translateY(0) before sliding down.
   */
  close(skipAnimation = false) {
    if (this.getAttribute('mode') === 'inline') return;
    // Don't close during signing — the user should see the result (success
    // or error) before the modal closes. If they want to cancel, they can
    // click "Cancel" on the preview or reject in their wallet.
    if (this.view === 'signing' && !this.connectingError) return;
    if (this.pendingPreview) {
      const { resolve } = this.pendingPreview;
      this.pendingPreview = null;
      resolve(false);
    }

    // Cancel any ongoing animation
    this.modalAnimator.cancel();
    this.bottomsheetAnimator.cancel();

    // Get the panel + overlay elements.
    const panel = this.root.querySelector<HTMLElement>('.panel');
    const overlay = this.root.querySelector<HTMLElement>('.overlay');

    // Set data-open="false" for accessibility state
    if (overlay) {
      overlay.setAttribute('data-open', 'false');
    }

    const { close: closePreset } = this.getAnimationPreset();
    const effectiveMode = this.computeEffectiveMode();

    const finishClose = () => {
      document.removeEventListener('keydown', this.handleGlobalKeydown);
      this.releaseFocusTrap?.();
      this.releaseFocusTrap = null;
      this.isOpen = false;
      this.hasEnteredOpenState = false;
      // Clean up the drag + swipe controllers so they get recreated fresh on next open()
      this.dragController?.destroy();
      this.dragController = null;
      this.swipeController?.destroy();
      this.swipeController = null;
      // Clear any inline styles left over from drag/animation
      if (panel) {
        panel.style.transform = '';
        panel.style.opacity = '';
        panel.style.transition = '';
        panel.style.filter = '';
      }
      if (overlay) overlay.style.opacity = '';

      // SIWS disconnect-on-close logic
      if (this.siwsPending && this._client?.siwsConfig) {
        const disconnectOnFail = this._client.siwsConfig.disconnectOnFail !== false;
        if (disconnectOnFail && this._client.session) {
          void this._client.disconnect().catch(() => {});
        }
      }
      this.siwsPending = false;

      this.render();
    };

    if (skipAnimation) {
      finishClose();
      return;
    }

    // Use the Motion animator for the close animation
    if (panel && overlay) {
      const closePromise = effectiveMode === 'bottomsheet'
        ? this.bottomsheetAnimator.close(panel, overlay)
        : this.modalAnimator.close(panel, overlay, closePreset);

      closePromise.then(finishClose).catch(finishClose);

      // Safety timeout in case the animation doesn't complete
      setTimeout(() => { if (this.isOpen) finishClose(); }, 600);
    } else {
      finishClose();
    }
  }

  /** Resolve animation preset name from attributes or defaults based on mode. */
  private getAnimationPreset(): { open: AnimationPresetName; close: AnimationPresetName } {
    const effectiveMode = this.computeEffectiveMode();
    const isMobileViewport = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`).matches;

    let defaultOpen: AnimationPresetName;
    let defaultClose: AnimationPresetName;
    if (effectiveMode === 'bottomsheet') {
      defaultOpen = 'slide-up';
      defaultClose = 'slide-up';
    } else if (isMobileViewport) {
      defaultOpen = 'scale';
      defaultClose = 'scale';
    } else {
      defaultOpen = 'scale-blur';
      defaultClose = 'scale-blur';
    }

    // Priority: HTML attrs > config > mode defaults
    const animAttr = this.getAttribute('animation');
    const openAttr = this.getAttribute('animation-open');
    const closeAttr = this.getAttribute('animation-close');

    const configAnim = this._client?.modalConfig?.animation as ModalAnimationOption | undefined;

    const open = (openAttr as AnimationPresetName) ??
      (typeof animAttr === 'string' ? animAttr as AnimationPresetName : undefined) ??
      (typeof configAnim === 'string' ? configAnim : configAnim?.open) ??
      defaultOpen;

    const close = (closeAttr as AnimationPresetName) ??
      (typeof animAttr === 'string' ? animAttr as AnimationPresetName : undefined) ??
      (typeof configAnim === 'string' ? configAnim : configAnim?.close) ??
      defaultClose;

    return { open, close };
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
   * Fetches avatars + balance + transaction history for the connected
   * account, then re-renders. Called on connect and sessionsChanged.
   */
  private async refreshAccountData() {
    if (!this._client) return;
    const session = this._client.session;
    if (!session) {
      this.cachedBalance = null;
      this.cachedTxHistory = [];
      return;
    }

    // Fetch avatar
    const connector = this._client.activeConnector;
    await this.fetchAvatar(session.address, connector);

    // Fetch XLM balance + transaction history from Horizon
    try {
      const sdk = await import('@stellar/stellar-sdk');
      const network = session.network;
      const horizonUrl = network === 'PUBLIC'
        ? 'https://horizon.stellar.org'
        : 'https://horizon-testnet.stellar.org';
      const horizon = new sdk.Horizon.Server(horizonUrl);

      // Balance
      try {
        const account = await horizon.loadAccount(session.address);
        const xlmBalance = account.balances.find(
          (b: { asset_type: string; balance: string }) => b.asset_type === 'native'
        );
        if (xlmBalance) {
          this.cachedBalance = parseFloat(xlmBalance.balance).toFixed(2);
        } else {
          this.cachedBalance = '0.00';
        }
      } catch {
        this.cachedBalance = '0.00';
      }

      // Transaction history (latest 5)
      try {
        const txs = await horizon.transactions().forAccount(session.address).limit(5).call();
        const history: Array<{ hash: string; type: string; amount: string; asset: string; date: string; success: boolean }> = [];

        for (const tx of txs.records) {
          // Determine transaction type from the operations
          let type = t('tx.default_type');
          let amount = '';
          let asset = t('tx.default_asset');

          try {
            const ops = await horizon.operations().forTransaction(tx.hash).limit(1).call();
            if (ops.records.length > 0) {
              const op = ops.records[0] as { type: string; amount?: string; asset_type?: string; asset_code?: string };
              type = op.type || t('tx.default_type');
              if (op.type === 'payment' || op.type === 'create_account') {
                amount = parseFloat(op.amount || '0').toFixed(2);
                if (op.asset_type && op.asset_type !== 'native') {
                  asset = op.asset_code || t('tx.unknown_asset');
                }
              }
            }
          } catch { /* skip if ops can't be loaded */ }

          const date = tx.created_at ? new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
          const success = tx.successful !== false;

          // For received payments, amount is positive; for sent, negative
          // (Horizon doesn't tell us direction easily, so we show it as-is)
          history.push({ hash: tx.hash, type, amount: amount || t('tx.no_amount'), asset, date, success });
        }

        this.cachedTxHistory = history;
      } catch {
        this.cachedTxHistory = [];
      }
    } catch {
      // stellar-sdk not available or network error — show without balance/history
      this.cachedBalance = null;
      this.cachedTxHistory = [];
    }

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
    this.connectingError = null;
    this.wcPairingUri = null; this.wcQrDataUri = null;
    this.view = 'connecting';
    this.render();

    // If the connector supports late-bound onUri (WalletConnect does),
    // hook in so we can render the pairing URI as a QR code in the
    // connecting view. This is what makes WC work inside the modal —
    // without it, the user sees a generic spinner with no QR code.
    const wcConnector = connector as WalletConnector & {
      setOnUri?: (fn: ((uri: string) => void) | null) => void;
    };
    if (typeof wcConnector.setOnUri === 'function') {
      wcConnector.setOnUri((uri: string) => {
        this.wcPairingUri = uri;
        this.wcQrDataUri = null; // reset any previous QR data URI
        // Pre-render the QR code as a data URI using the `qrcode` library.
        // Config follows Reown/AppKit's proven scannable approach:
        // - errorCorrectionLevel 'M' (15% redundancy) — the qrcode library
        //   default, dense enough for scanners but not overly dense like 'H'.
        //   Reown uses this level; 'H' (30%) makes the QR harder to scan
        //   because the modules are more tightly packed.
        // - margin: 2 — the quiet zone (white padding) that scanners need to
        //   detect the QR boundary. margin: 0 caused scanning failures.
        // - scale: 8 — generates the QR at its natural module size × 8 (not
        //   forcing an arbitrary pixel width). The container's CSS handles
        //   the displayed size, avoiding distortion.
        QRCode.toDataURL(uri, {
          margin: 2,
          scale: 8,
          color: { dark: '#000000', light: '#ffffff' },
          errorCorrectionLevel: 'M',
        }).then((dataUri: string) => {
          this.wcQrDataUri = dataUri;
          this.render();
        }).catch(() => {
          this.wcQrDataUri = null;
          this.render();
        });
        this.render();
      });
    }

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
          void this.refreshAccountData();
          return;
        }
      }

      this.view = 'connected';
      this.render();

      // If SIWS config is set, trigger the automatic sign-in flow.
      // This runs AFTER the connected view renders, so the user sees their
      // wallet connected, then immediately sees the SIWS loading state.
      if (this._client?.siwsConfig) {
        void this.triggerSiwsFlow();
      }
    } catch {
      // The client's 'error' event handler (wired in the client setter) already
      // set this.connectingError and re-rendered. We keep connectingWalletId
      // set so the header still shows the wallet name + back arrow + close
      // button on the error view — the user can retry or go back.
      // Only clear connectingWalletId if the error handler didn't set connectingError
      // (e.g. network mismatch which switches to a different view).
      if (this.view === 'connecting' && !this.connectingError) {
        this.connectingWalletId = null;
      this.wcPairingUri = null; this.wcQrDataUri = null;
        this.view = 'wallet-list';
        this.render();
      }
    } finally {
      // Clear connectingWalletId only if we successfully left the connecting view
      // (connected, account-picker, network-mismatch, or wallet-list).
      // If we're still on 'connecting' with an error, keep it so the header
      // shows the wallet name.
      if (this.view !== 'connecting') {
        this.connectingWalletId = null;
      this.wcPairingUri = null; this.wcQrDataUri = null;
      }
    }
  }

  private async pickAccount(address: string) {
    if (!this._client || !this.pendingAccountPicker) return;
    try {
      await this._client.switchAccount(this.pendingAccountPicker.connector.id, address);
      this.pendingAccountPicker = null;
      this.view = 'connected';
      this.render();
      // Trigger SIWS flow after account selection if configured
      if (this._client?.siwsConfig) {
        void this.triggerSiwsFlow();
      }
    } catch (err) {
      this.lastError = err instanceof ConnectError ? err : ConnectError.internal(String(err));
      this.view = 'error';
    }
    this.render();
  }

  /**
   * SIWS (Sign-In With Stellar) automatic authentication flow.
   *
   * Triggered after wallet connect succeeds (or after account picker) when
   * `siwsConfig` is set on the StellarAppKit instance. The flow is:
   *
   * 0. Check `session()` for existing valid session → skip if address+network match
   * 1. Show "Fetching nonce…" → call `siwsConfig.nonce()`
   * 2. Show "Sign in your wallet" → call `signIn({ statement, nonce })`
   * 3. Show "Verifying…" → call `siwsConfig.verify(result, nonce)` → returns SiwsSession
   * 4. Validate returned session: address must match wallet, network must match, expiry in future
   * 5. Store session on client → connected view (success), siwsPending = false
   * 6. If any step fails → show SIWS error view with "Try again" button.
   *    The wallet is NOT disconnected immediately — it stays connected so
   *    the user can retry. The wallet is only disconnected when the user
   *    closes the modal (via close()) if `disconnectOnFail` is true and
   *    `siwsPending` is still true (meaning SIWS never succeeded).
   */
  private siwsRetryCount = 0;
  private siwsCancelled = false;

  private async triggerSiwsFlow(): Promise<void> {
    if (!this._client?.siwsConfig) return;
    const siws = this._client.siwsConfig;
    const session = this._client.session;
    const maxRetries = siws.maxRetries ?? 3;
    const timeoutMs = siws.timeoutMs ?? 15000;
    this.siwsPending = true;
    this.siwsCancelled = false;

    // Helper: timeout wrapper
    const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
      return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(t('error.request_timed_out'))), ms)
        ),
      ]);
    };

    // Helper: extract a human-readable message from any error type
    const extractErrorMessage = (err: unknown): string => {
      if (typeof err === 'string') return err;
      if (err instanceof Error) return err.message || String(err);
      if (err && typeof err === 'object') {
        const e = err as { message?: string; reason?: string };
        if (e.message) return e.message;
        if (e.reason) return e.reason;
      }
      return t('siws.error_generic');
    };

    // Helper: handle SIWS failure — show error + retry, do NOT disconnect
    const handleSiwsFailure = async (err: unknown) => {
      if (this.siwsCancelled) return; // User cancelled — don't show error
      const msg = extractErrorMessage(err);
      this.siwsRetryCount++;
      this.siwsPending = true;

      if (this.siwsRetryCount >= maxRetries) {
        this.connectingError = t('siws.error_too_many_attempts', { maxRetries });
      } else {
        this.connectingError = msg;
      }
      this.view = 'siws-error';
      this.render();
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate([30, 50, 30]);
      }
    };

    try {
      // Step 0: Check for existing session
      this.view = 'siws-checking';
      this.connectingError = null;
      this.render();

      const existingSession = await withTimeout(siws.session(), timeoutMs);

      if (existingSession && session) {
        const addressMatches = existingSession.address === session.address;
        const networkMatches = existingSession.network === session.network;
        const notExpired = !existingSession.expiry || existingSession.expiry > Date.now();

        if (addressMatches && networkMatches && notExpired) {
          // Existing session is valid — skip sign-in
          this._client.setSiwsSession(existingSession);
          this.siwsPending = false;
          this.siwsRetryCount = 0;
          this.view = 'connected';
          this.render();
          return;
        }
      }

      // Step 1: Fetch nonce
      this.view = 'siws-nonce';
      this.render();

      const nonce = await withTimeout(siws.nonce(), timeoutMs);

      // Step 2: Sign in with the wallet
      this.view = 'siws-signing';
      this.render();

      const signInResult = await this._client.signIn({
        statement: siws.statement,
        nonce,
      });

      // Step 3: Verify the sign-in result → returns SiwsSession
      this.view = 'siws-verifying';
      this.render();

      const siwsSession = await withTimeout(
        siws.verify(signInResult, nonce, {
          address: session?.address ?? signInResult.signerAddress,
          network: session?.network ?? 'UNKNOWN',
        }),
        timeoutMs
      );

      if (!siwsSession) {
        await handleSiwsFailure(t('siws.error_verification_failed'));
        return;
      }

      // Step 4: Validate the returned session
      if (session) {
        const addressMatches = siwsSession.address === session.address;
        const networkMatches = siwsSession.network === session.network;
        const notExpired = !siwsSession.expiry || siwsSession.expiry > Date.now();

        if (!addressMatches || !networkMatches || !notExpired) {
          const reason = !addressMatches ? t('siws.error_address_mismatch')
            : !networkMatches ? t('siws.error_network_mismatch')
            : t('siws.error_session_expired');
          await handleSiwsFailure(reason);
          return;
        }
      }

      // Step 5: Store session on client + success
      this._client.setSiwsSession(siwsSession);
      this.siwsPending = false;
      this.siwsRetryCount = 0;
      this.view = 'connected';
      this.connectingError = null;
      this.render();
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(15);
      }
    } catch (err) {
      await handleSiwsFailure(err);
    }
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
    const { resolve, preview, wasAlreadyOpen } = this.pendingPreview;
    this.pendingPreview = null;

    if (approved) {
      // Don't close the modal — switch to the "signing" view which shows
      // "Continue in your wallet" with a spinner. The modal stays open
      // while the wallet processes the sign request. The signQueueChange
      // event or the error event will update the view.
      this.lastApprovedPreview = preview;
      this.view = 'signing';
      this.render();
    } else {
      // Rejected — go back to the previous view
      if (wasAlreadyOpen) {
        this.view = this._client?.session ? 'connected' : 'wallet-list';
        this.render();
      } else {
        this.close();
      }
    }

    resolve(approved);
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
        this.preloadImage(walletAvatar);
        return walletAvatar;
      }
    }

    // 2. Try Stellar Expert's public avatar API (opt-in via attribute).
    if (this.getAttribute('stellar-expert-avatars') === 'true') {
      const url = stellarExpertAvatarUrl(address);
      this.avatarCache.set(cacheKey, url);
      this.preloadImage(url);
      return url;
    }

    // 3. No avatar available — UI will use the gradient fallback.
    this.avatarCache.set(cacheKey, null);
    return null;
  }

  private computeEffectiveMode(): EffectiveMode {
    const attr = (this.getAttribute('mode') as PresentationMode) ?? 'auto';
    // Normalize: 'bottom-sheet' (legacy) → 'bottomsheet' (canonical).
    // Both spellings are accepted for backwards compatibility.
    if (attr === 'modal' || attr === 'bottomsheet' || attr === 'bottom-sheet' || attr === 'inline') {
      return attr === 'bottom-sheet' ? 'bottomsheet' : (attr as EffectiveMode);
    }
    // For 'auto' mode, check the viewport width directly. Using matchMedia
    // is more reliable than checking window.innerWidth because it accounts
    // for scrollbar width and responds to orientation changes. But on some
    // mobile browsers, the cached mediaQuery can be stale (especially after
    // orientation changes or address bar show/hide). We re-evaluate on every
    // call to ensure we get the current viewport state.
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`).matches ? 'bottomsheet' : 'modal';
    }
    // Fallback to innerWidth if matchMedia is not available
    if (typeof window !== 'undefined' && typeof window.innerWidth === 'number') {
      return window.innerWidth <= MOBILE_BREAKPOINT_PX ? 'bottomsheet' : 'modal';
    }
    return 'modal';
  }

  private resolveTheme(): ConnectTheme {
    // The theme attribute accepts:
    //   - A named theme: 'minimal' | 'stellar' | 'sky' | 'ocean' | 'sunset'
    //   - 'dark' (backwards compat — maps to minimalDark)
    //   - 'light' (backwards compat — maps to minimalLight)
    //   - 'auto' (follows prefers-color-scheme, defaults to minimal)
    //   - undefined / null (defaults to 'minimal')
    //
    // Named themes resolve to their dark variant by default. To get the light
    // variant, append ':light' (e.g. 'sky:light'). To follow the system color
    // scheme, use 'auto' (resolves to minimal dark/light based on prefers-color-scheme).
    const attr = this.getAttribute('theme') ?? 'minimal';

    // Backwards compatibility: old 'dark' / 'light' values map to minimal.
    if (attr === 'dark') return THEME_REGISTRY.minimal.dark;
    if (attr === 'light') return THEME_REGISTRY.minimal.light;

    // 'auto' follows the system color scheme (minimal dark/light).
    if (attr === 'auto') {
      const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
      return prefersLight ? THEME_REGISTRY.minimal.light : THEME_REGISTRY.minimal.dark;
    }

    // Named theme with optional ':light' suffix (e.g. 'sky:light', 'ocean:dark').
    // Default variant is dark.
    const [name, variant] = attr.split(':') as [string, 'dark' | 'light' | undefined];
    if (THEME_NAMES.includes(name as ThemeName)) {
      const themeName = name as ThemeName;
      const mode = variant === 'light' ? 'light' : 'dark';
      return THEME_REGISTRY[themeName][mode];
    }

    // Unknown theme — fall back to minimal dark (the default).
    return minimalDark;
  }

  private render() {
    const effectiveMode = this.computeEffectiveMode();
    const theme = this.resolveTheme();
    const branding = this.getAttribute('branding') === 'hide' ? 'hide' : 'show';
    this.setAttribute('data-branding', branding);

    // Cache the stylesheet — buildStyles() generates a ~1000-line CSS string
    // by calling v() 126 times. Without caching, this runs on EVERY render()
    // (every state change, every event, every animation frame). With caching,
    // it only runs when the theme actually changes.
    const themeKey = `${theme.colorBg}|${theme.colorAccent}|${theme.colorText}`;
    if (this.cachedStyles === null || this.cachedThemeKey !== themeKey) {
      this.cachedStyles = buildStyles(theme);
      this.cachedThemeKey = themeKey;
    }

    const styleTag = `<style>${themeHostDeclarations(theme)}\n${this.cachedStyles}</style>`;

    // Check if we can do a targeted update (just the body content) instead
    // of a full innerHTML replacement. This prevents image flash on re-renders
    // (e.g. when walletList loads, when connect fires) — the <img> elements
    // in the header and wallet list stay in the DOM and don't re-decode.
    const existingOverlay = this.root.querySelector('.overlay');
    const existingInline = this.root.querySelector('.inline-root');
    const existingPanel = existingOverlay?.querySelector('.panel') ?? existingInline?.querySelector('.panel');

    if (effectiveMode === 'inline') {
      if (existingInline && existingPanel) {
        // Targeted update: only replace the body content, preserving the panel shell
        this.updatePanelContent(existingPanel, effectiveMode);
      } else {
        // Full render: create the entire structure
        this.root.innerHTML = `${styleTag}<div class="inline-root">${this.renderPanel(effectiveMode)}</div>`;
        this.wireEvents(effectiveMode);
      }
    } else if (this.isOpen) {
      const openAttr = this.hasEnteredOpenState ? 'true' : 'false';
      if (existingOverlay && existingPanel) {
        // Targeted update: update data attributes + body content only
        existingOverlay.setAttribute('data-mode', effectiveMode);
        existingOverlay.setAttribute('data-open', openAttr);
        this.updatePanelContent(existingPanel, effectiveMode);
      } else {
        // Full render: create the entire structure
        this.root.innerHTML = `${styleTag}<div class="overlay" data-mode="${effectiveMode}" data-open="${openAttr}" role="presentation">${this.renderPanel(effectiveMode)}</div>`;
        this.wireEvents(effectiveMode);
      }
    } else {
      // Modal is closed — clear everything except the stylesheet
      this.root.innerHTML = styleTag;
    }
  }

  /**
   * Updates only the body content and header of an existing panel, without
   * replacing the entire innerHTML. This prevents <img> elements from being
   * destroyed and recreated on every state change (which causes a visible
   * flash as the browser re-decodes the base64 data URIs).
   *
   * Only re-renders the body if the view or wallet list actually changed —
   * determined by comparing a lightweight render key.
   */
  private updatePanelContent(panel: Element, effectiveMode: EffectiveMode) {
    // Update the drag handle (add/remove based on mode)
    const existingHandle = panel.querySelector('.drag-handle');
    if (effectiveMode === 'bottomsheet' && !existingHandle) {
      const handle = document.createElement('div');
      handle.className = 'drag-handle';
      panel.insertBefore(handle, panel.firstChild);
    } else if (effectiveMode !== 'bottomsheet' && existingHandle) {
      existingHandle.remove();
    }

    // Update header
    const existingHeader = panel.querySelector('.header, .header--connecting');
    const headerHtml = this.renderPanelHeader(effectiveMode);
    if (existingHeader) {
      // Only replace the header if its content changed (avoid unnecessary DOM mutations)
      const newHeaderEl = document.createElement('div');
      newHeaderEl.innerHTML = headerHtml;
      const newHeader = newHeaderEl.firstElementChild;
      if (newHeader && existingHeader.outerHTML !== newHeader.outerHTML) {
        existingHeader.replaceWith(newHeader);
      }
    } else {
      // No header yet — insert before body
      const body = panel.querySelector('.body');
      if (body) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = headerHtml;
        const newHeader = wrapper.firstElementChild;
        if (newHeader) panel.insertBefore(newHeader, body);
      }
    }

    // Update body content
    const existingBody = panel.querySelector('.body');
    if (existingBody) {
      const bodyHtml = this.renderBody();
      // Only update if content actually changed
      if (existingBody.innerHTML !== bodyHtml) {
        existingBody.innerHTML = bodyHtml;
      }
    }

    // Re-wire events for the updated content
    this.wireEvents(effectiveMode);
  }

  private renderPanel(effectiveMode: EffectiveMode): string {
    const title = this.getAttribute('title') ?? this.defaultTitle();
    return `
      <div class="panel" role="dialog" aria-modal="${effectiveMode !== 'inline'}" aria-label="${title}">
        ${effectiveMode === 'bottomsheet' ? '<div class="drag-handle"></div>' : ''}
        ${this.renderPanelHeader(effectiveMode)}
        <div class="body">${this.renderBody()}</div>
        <div class="footer">${t('footer.powered_by', { brand: '<a href="https://github.com/sagantaHQ/stellar-appkit" target="_blank" rel="noopener" style="color: var(--sak-color-accent); text-decoration: none;">Stellar AppKit</a>' })}</div>
      </div>
    `;
  }

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
  private explorerUrl(path: string, isTestnet: boolean): string {
    const custom = this.getAttribute('explorer-url');
    if (custom) {
      const base = custom.endsWith('/') ? custom.slice(0, -1) : custom;
      return `${base}/${path}`;
    }
    const defaultBase = isTestnet ? 'https://testnet.stellarchain.io' : 'https://stellarchain.io';
    return `${defaultBase}/${path}`;
  }

  private defaultTitle(): string {
    switch (this.view) {
      case 'connected': {
        // Show wallet icon + name instead of "Account"
        const connector = this._client?.activeConnector;
        if (connector) {
          const icon = getWalletIconDataUri(connector.id) ?? connector.meta.icon;
          return connector.meta.name;
        }
        return t('title.account');
      }
      case 'account-picker':
        return t('title.choose_account');
      case 'network-mismatch':
        return t('title.wrong_network');
      case 'transaction-preview':
        return t('title.review_transaction');
      case 'signing':
        return t('title.signing');
      default:
        return t('title.connect_wallet');
    }
  }

  private renderPanelHeader(effectiveMode: EffectiveMode): string {
    const showClose = effectiveMode !== 'inline';
    const title = this.getAttribute('title') ?? this.defaultTitle();
    const logoSrc = this.getAttribute('logo-src');

    // When connecting or in an error state, show the wallet name centered
    // with a back arrow on the left (back cancels the connecting state and
    // returns to the wallet list so the user can try another wallet).
    const isErrorView = this.view === 'connecting' || this.view === 'error' ||
      this.view === 'network-mismatch' || this.view === 'siws-error' ||
      (this.view === 'signing' && this.connectingError);
    if (isErrorView && (this.connectingWalletId || this.connectingError)) {
      const connector = this.connectingWalletId
        ? this._client?.registry.get(this.connectingWalletId)
        : this._client?.activeConnector;
      const walletName = connector?.meta.name ?? t('wallet.fallback_name');
      return `
        <div class="header header--connecting">
          <button class="icon-btn" data-action="cancel-connecting" aria-label="${t('aria.back')}">${icons.chevronLeft}</button>
          <span class="title">${escapeHtml(walletName)}</span>
          ${showClose ? `<button class="icon-btn" data-action="close" aria-label="${t('aria.close_dialog')}">${icons.close}</button>` : ''}
        </div>
      `;
    }

    // When connected, show wallet icon + name in the header instead of the app logo
    let headerBrand: string;
    if (this.view === 'connected' && this._client?.activeConnector) {
      const connector = this._client.activeConnector;
      const iconUrl = getWalletIconDataUri(connector.id) ?? connector.meta.icon;
      headerBrand = `
        <img src="${escapeAttr(iconUrl)}" alt="" class="header-wallet-icon"
             onerror="this.style.display='none'" />
        <span class="title">${escapeHtml(connector.meta.name)}</span>
      `;
    } else {
      headerBrand = `
        ${logoSrc ? `<img src="${escapeAttr(logoSrc)}" alt="" />` : '<slot name="logo"></slot>'}
        <span class="title">${escapeHtml(title)}</span>
      `;
    }

    return `
      <div class="header">
        <div class="brand">${headerBrand}</div>
        ${showClose ? `<button class="icon-btn" data-action="close" aria-label="${t('aria.close_dialog')}">${icons.close}</button>` : ''}
      </div>
    `;
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
      case 'signing':
        return this.renderSigning();
      case 'error':
        return this.renderError();
      case 'connecting':
        return this.renderConnecting();
      case 'siws-checking':
      case 'siws-nonce':
      case 'siws-signing':
      case 'siws-verifying':
        return this.renderSiwsLoading();
      case 'siws-error':
        return this.renderSiwsError();
      case 'wallet-list':
      default:
        return this.renderWalletList();
    }
  }

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
  private renderConnecting(): string {
    if (!this.connectingWalletId) return this.renderWalletList();
    const connector = this._client?.registry.get(this.connectingWalletId);
    if (!connector) return this.renderWalletList();

    const walletName = connector.meta.name;
    const iconUrl = getWalletIconDataUri(connector.id) ?? connector.meta.icon;
    const fallbackIcon = getWalletIconDataUri(connector.id);
    const onerrorHandler = fallbackIcon
      ? `this.src='${fallbackIcon}'; this.onerror=null;`
      : `this.style.display='none';`;

    const hasError = this.connectingError !== null;

    // WalletConnect special case: if we have a pairing URI, render a QR code
    // + deep link instead of the generic spinner. This is what makes WC
    // actually usable inside the modal — the user needs to scan a QR code,
    // not just see a "Continue in WalletConnect" message.
    const isWalletConnect = connector.id === 'walletconnect';
    const hasQrUri = !hasError && isWalletConnect && this.wcPairingUri !== null;

    if (hasQrUri) {
      const uri = this.wcPairingUri!;
      // Use the pre-rendered QR data URI (generated async when the URI arrived).
      // If it's not ready yet, show a loading state — it'll re-render when done.
      const qrImg = this.wcQrDataUri
        ? `<img src="${this.wcQrDataUri}" class="wc-qr-img" alt="" />`
        : `<div style="padding: 40px; color: var(--sak-color-text-muted); font-size: 12px; text-align: center;">${t('wc.generating_code')}</div>`;

      return `
        <div class="connecting-view connecting-view--wc">
          <div class="wc-qr-wrap">
            <div class="wc-qr-frame">
              ${qrImg}
            </div>
            <span class="wc-qr-logo">
              <span class="wc-qr-logo__img" style="background-image: url('${WC_QR_LOGO_DATA_URI}')"></span>
            </span>
          </div>
          <h2 class="connecting-view__title">${t('wc.scan_with', { walletName: escapeHtml(walletName) })}</h2>
          <p class="connecting-view__subtitle">${t('wc.scan_instructions')}</p>
          <div class="wc-actions">
            <a class="wc-deeplink" href="${escapeAttr(uri)}" target="_blank" rel="noopener">
              ${icons.externalLink}
              ${t('wc.open_in_wallet')}
            </a>
            <button class="wc-copy-uri" data-action="copy-wc-uri" data-uri="${escapeAttr(uri)}">
              ${icons.copy}
              ${t('wc.copy_uri')}
            </button>
          </div>
        </div>
      `;
    }

    const subtitle = hasError
      ? t('connecting.error_subtitle')
      : isWalletConnect
        ? t('wc.generating_code')
        : t('connecting.accept_request');

    const arcHtml = hasError
      ? '' // no spinner on error
      : `<svg class="connecting-view__arc" viewBox="0 0 88 88" fill="none" aria-hidden="true">
           <rect x="3" y="3" width="82" height="82" rx="20" ry="20"
                 stroke="currentColor"
                 stroke-width="2.5"
                 stroke-linecap="round"
                 stroke-dasharray="120 240" />
         </svg>`;

    const retryHtml = hasError
      ? `<button class="connecting-view__retry" data-action="retry-connecting">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
             <path d="M3 12a9 9 0 1 0 9-9" />
             <path d="M3 4v5h5" />
           </svg>
           ${t('action.try_again')}
         </button>`
      : '';

    // For WalletConnect, show "Generating QRCode…" as the title while waiting
    // for the pairing URI to arrive (instead of the generic "Continue in
    // WalletConnect"). Once the URI arrives, the QR view renders with its
    // own "Scan with WalletConnect" title.
    const titleKey = isWalletConnect && !hasQrUri
      ? t('wc.generating_code')
      : t('connecting.continue_in_wallet', { walletName: escapeHtml(walletName) });

    return `
      <div class="connecting-view ${hasError ? 'connecting-view--error' : ''}">
        <div class="connecting-view__logo-wrap">
          ${arcHtml}
          <img src="${escapeAttr(iconUrl)}" alt="" class="connecting-view__logo"
               onerror="${onerrorHandler}" />
        </div>
        <h2 class="connecting-view__title">${titleKey}</h2>
        <p class="connecting-view__subtitle">${escapeHtml(subtitle)}</p>
        ${retryHtml}
      </div>
    `;
  }

  private renderWalletList(): string {
    if (this.walletList.length === 0) {
      // If we have a client, the list is loading (reachability checks in flight).
      // Show a sleek loading placeholder instead of "No wallets registered".
      if (this._client) {
        return `<div style="padding: 32px 12px; text-align: center; font-size: 13px; color: var(--sak-color-text-muted);"><div class="wallet-list-loading"></div>${t('wallet_list.loading')}</div>`;
      }
      return `<div style="padding: 24px 12px; text-align: center; font-size: 13px; color: var(--sak-color-text-muted);">${t('wallet_list.empty')}</div>`;
    }

    return this.walletList
      .map(({ connector, reachability }) => {
        const isConnecting = this.connectingWalletId === connector.id;
        const notInstalled = reachability === 'not-installed';
        const installUrl = pickInstallUrl(connector);

        // Use the wallet's official icon URL first; fall back to our
        // bundled inline SVG data-URI if the URL fails to load.
        const fallbackIcon = getWalletIconDataUri(connector.id);
        const onerrorHandler = fallbackIcon
          ? `this.src='${fallbackIcon}'; this.onerror=null;`
          : `this.style.display='none'; this.nextElementSibling.style.display='flex';`;

        // For not-installed wallets, render an "Install" button on the right
        // instead of the subLabel. The row itself is still clickable (opens
        // the install URL) — the button is a visual affordance.
        if (notInstalled) {
          return `
            <button class="wallet-row wallet-row--not-installed" data-action="select-wallet" data-wallet-id="${connector.id}">
              <span class="wallet-tile" style="background-image: url('${escapeAttr(connector.meta.icon)}')">
              </span>
              <span class="wallet-name">${escapeHtml(connector.meta.name)}</span>
              <span class="wallet-sub">${t('wallet_list.not_installed')}</span>
              ${installUrl ? `<a class="wallet-install-btn" href="${escapeAttr(installUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation();">${t('wallet_list.install')}</a>` : ''}
            </button>
          `;
        }

        // For installed wallets, show status subLabel (Connecting… / Locked / Installed / etc.)
        // The "Installed" label makes it visually obvious which wallets are
        // ready to use vs. which need to be installed first (those show an
        // "Install" button instead of a subLabel — see the not-installed branch above).
        //
        // WalletConnect is special — it's never "installed" in the browser-extension
        // sense (it's a cloud relay). Showing "Installed" there is misleading, so
        // we swap the label to "Scan QR Code" to hint at the actual pairing flow.
        const isWalletConnect = connector.id === 'walletconnect';
        const subLabel =
          isConnecting ? t('wallet_list.status.connecting')
          : reachability === 'locked' ? t('wallet_list.status.locked')
          : reachability === 'unavailable' ? t('wallet_list.status.unavailable')
          : isWalletConnect ? t('wallet_list.status.scan_qr')
          : t('wallet_list.status.installed');
        const subLabelClass =
          isConnecting || reachability === 'locked' || reachability === 'unavailable'
            ? 'wallet-sub'
            : 'wallet-sub wallet-sub--installed';
        const disabled = (this.view === 'connecting' && !isConnecting) || reachability === 'unavailable';

        return `
          <button class="wallet-row" data-action="select-wallet" data-wallet-id="${connector.id}" data-unavailable="${reachability !== 'available'}" ${disabled ? 'disabled' : ''}>
            <span class="wallet-tile ${isConnecting ? 'connecting' : ''}" style="background-image: url('${escapeAttr(connector.meta.icon)}')">
            </span>
            <span class="wallet-name">${escapeHtml(connector.meta.name)}</span>
            <span class="${subLabelClass}">${subLabel}</span>
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
                <span class="wallet-name" style="display:block;">${escapeHtml(account.label ?? t('account.default_label'))}</span>
                <span class="account-network" style="font-family: var(--sak-font-mono);">${truncateAddress(account.address)}</span>
              </span>
              <button class="icon-btn" data-action="copy-address-inline" data-address="${escapeAttr(account.address)}" aria-label="${t('aria.copy_address')}" onclick="event.stopPropagation();">${isCopied ? icons.check : icons.copy}</button>
            </button>
          `;
        }
      )
      .join('');
  }

  private renderConnected(): string {
    const session = this._client?.session;
    if (!session) return this.renderWalletList();

    const gradient = gradientFromAddress(session.address);
    const avatarUrl = this.avatarCache.get(session.address);
    const avatarHtml = avatarUrl
      ? `<img src="${escapeAttr(avatarUrl)}" alt="" onerror="this.style.display='none'; this.parentElement.style.background='${gradient}';" />`
      : '';
    const isCopied = this.copiedAddress === session.address && this.copyState === 'copied';
    const isTestnet = session.network !== 'PUBLIC';
    const networkColor = isTestnet ? '#f59e0b' : '#6EE7B7';
    const networkLabel = session.network.toLowerCase();
    const pendingCount = this._client?.pendingSignCount ?? 0;
    const explorerUrl = this.explorerUrl(`account/${session.address}`, isTestnet);

    // Balance — skeleton shimmer while loading, then large number
    const balanceHtml = this.cachedBalance
      ? `<span class="balance-value">${escapeHtml(this.cachedBalance)}</span><span class="balance-unit">XLM</span>`
      : `<div class="balance-skeleton"></div>`;

    // "Get Testnet funds" button — only rendered on Testnet. friendbot.stellar.org
    // is a Testnet-only faucet (Futurenet has a separate faucet URL, Standalone has
    // none), so we gate on the exact 'TESTNET' network rather than the broader
    // isTestnet check (which would also match Futurenet / Standalone).
    const friendbotButton = session.network === 'TESTNET'
      ? `<button class="friendbot-btn" data-action="get-testnet-funds" title="Fund this address via friendbot.stellar.org">
           ${t('connected.get_testnet_funds')}
         </button>`
      : '';
    const fundsBanner = this.fundsRequested
      ? `<div class="funds-banner">${t('connected.funds_requested')}</div>`
      : '';

    // Pending signatures banner — only shows when pendingSignCount > 0
    const pendingBanner = pendingCount > 0
      ? `<div class="pending-banner">
           <span class="pending-spinner"></span>
           <span>${t('connected.pending_signatures', { count: pendingCount })}</span>
         </div>`
      : '';

    // Transaction history with explorer links + relative time
    const historyHtml = this.cachedTxHistory.length > 0
      ? this.cachedTxHistory.map((tx) => {
          const icon = tx.success ? '✓' : '✗';
          const iconClass = tx.success ? 'tx-success' : 'tx-failed';
          const txExplorerUrl = this.explorerUrl(`tx/${tx.hash}`, isTestnet);
          return `
            <a class="tx-row" href="${escapeAttr(txExplorerUrl)}" target="_blank" rel="noopener">
              <span class="tx-icon ${iconClass}">${icon}</span>
              <div class="tx-info">
                <span class="tx-type">${escapeHtml(tx.type)}</span>
                <span class="tx-date">${escapeHtml(tx.date)}</span>
              </div>
              <span class="tx-amount ${tx.amount.startsWith('-') ? 'tx-out' : 'tx-in'}">${escapeHtml(tx.amount)} ${escapeHtml(tx.asset)}</span>
              <span class="tx-external">${icons.externalLink}</span>
            </a>
          `;
        }).join('')
      : `<div class="tx-empty">${t('connected.no_transactions')}</div>`;

    return `
      <div class="account">
        <!-- Account header: avatar + address (clickable to copy) + network pill + overflow -->
        <div class="account-header">
          <div class="account-avatar" style="background: ${gradient};">${avatarHtml}</div>
          <div class="account-info">
            <div class="account-address-row" data-action="copy-address-inline" data-address="${escapeAttr(session.address)}" title="${t('aria.click_to_copy')}">
              <span class="account-address">${truncateAddress(session.address)}</span>
              <span class="account-copy-icon">${isCopied ? icons.check : icons.copy}</span>
            </div>
            <div class="account-meta">
              <span class="network-pill" style="--net-color: ${networkColor};">
                <span class="network-dot"></span>
                ${escapeHtml(networkLabel)}
              </span>
              <a class="explorer-link" href="${escapeAttr(explorerUrl)}" target="_blank" rel="noopener" title="${t('aria.view_on_explorer')}">
                ${icons.externalLink}
              </a>
            </div>
          </div>
          <button class="icon-btn" data-action="toggle-overflow" aria-label="${t('aria.more_options')}" title="${t('aria.more_options')}">
            <svg viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><circle cx="4" cy="10" r="2"/><circle cx="10" cy="10" r="2"/><circle cx="16" cy="10" r="2"/></svg>
          </button>
        </div>

        <!-- Overflow menu (hidden by default) -->
        <div class="overflow-menu" data-overflow="false">
          <button class="overflow-item" data-action="switch-wallet">
            ${icons.wallet}
            <span>${t('action.switch_wallet')}</span>
          </button>
          <button class="overflow-item overflow-danger" data-action="disconnect">
            ${icons.logOut}
            <span>${t('action.disconnect')}</span>
          </button>
        </div>

        <!-- Pending signature banner -->
        ${pendingBanner}

        <!-- Balance — large typography, no card border -->
        <div class="balance-section">
          <div class="balance-label">${t('connected.balance_label')}</div>
          <div class="balance-amount">${balanceHtml}</div>
          ${friendbotButton}
          ${fundsBanner}
        </div>

        <!-- Transaction history -->
        <div class="tx-history">
          <div class="tx-header">${t('connected.recent_activity')}</div>
          ${historyHtml}
        </div>
      </div>
    `;
  }

  private renderTransactionPreview(): string {
    const pending = this.pendingPreview;
    if (!pending) return this.renderWalletList();
    const { preview } = pending;

    const txFlags = preview.riskFlags.map((flag) => riskFlagHtml(flag)).join('');

    // Fee display — prefer the detailed estimate if available.
    const feeHtml = preview.feeEstimate
      ? `<span class="preview-fee">${escapeHtml(preview.feeEstimate.totalFeeXlm)} XLM</span>`
      : `<span class="preview-fee">${escapeHtml(preview.fee)} stroops</span>`;

    const isCopied = this.copiedAddress === preview.sourceAccount && this.copyState === 'copied';

    // App + wallet thumbnails (Reown-style two-thumbnail layout)
    const logoSrc = this.getAttribute('logo-src');
    const appName = this._client?.appMetadata?.name ?? 'App';
    const connector = this._client?.activeConnector;
    const walletIcon = connector ? (getWalletIconDataUri(connector.id) ?? connector.meta.icon) : '';
    const walletName = connector?.meta.name ?? 'Wallet';
    const appIconHtml = logoSrc
      ? `<img src="${escapeAttr(logoSrc)}" alt="" class="preview-thumb__img" />`
      : `<span class="preview-thumb__letter">${escapeHtml(appName.charAt(0).toUpperCase())}</span>`;
    const walletIconHtml = walletIcon
      ? `<img src="${escapeAttr(walletIcon)}" alt="" class="preview-thumb__img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><span style="display:none;" class="preview-thumb__letter">${escapeHtml(walletName.charAt(0).toUpperCase())}</span>`
      : `<span class="preview-thumb__letter">${escapeHtml(walletName.charAt(0).toUpperCase())}</span>`;

    // Determine the action label — "Sign" for messages/SIWS, "Approve" for transactions
    const isMessageSign = preview.operations.length === 1 && preview.operations[0]?.type === 'signMessage';
    const actionLabel = isMessageSign ? t('action.sign') : t('action.approve');
    const titleText = isMessageSign ? t('preview.title.sign_message') : t('preview.title.review_transaction');
    const subtitleText = isMessageSign
      ? t('preview.subtitle.sign_message', { walletName })
      : t('preview.subtitle.review_transaction', { walletName });

    // Operations list
    const opsHtml = preview.operations
      .map((op, i) => {
        const opFlags = op.riskFlags.map((flag) => riskFlagHtml(flag)).join('');
        const badgesHtml = op.contractBadges && op.contractBadges.length > 0
          ? `<div class="contract-badges">${op.contractBadges.map((b) => `<span class="contract-badge badge-${b.severity}"${b.url ? ` data-url="${escapeAttr(b.url)}"` : ''}>${escapeHtml(b.label)}</span>`).join('')}</div>`
          : '';
        return `
          <div class="preview-op">
            <div class="preview-op-summary">${escapeHtml(op.summary)}</div>
            ${badgesHtml}
            ${opFlags}
          </div>
        `;
      })
      .join('');

    return `
      <div class="preview">
        <!-- Thumbnails: app logo + wallet logo side by side -->
        <div class="preview-thumbs">
          <div class="preview-thumb preview-thumb--app">${appIconHtml}</div>
          <div class="preview-thumb__connector"></div>
          <div class="preview-thumb preview-thumb--wallet">${walletIconHtml}</div>
        </div>

        <!-- Title + subtitle -->
        <h2 class="preview-title">${escapeHtml(titleText)}</h2>
        <p class="preview-subtitle">${escapeHtml(subtitleText)}</p>

        <!-- Operations + risk flags -->
        ${opsHtml ? `<div class="preview-ops">${opsHtml}</div>` : ''}
        ${txFlags}

        <!-- Meta: source account + fee -->
        <div class="preview-meta">
          <span class="preview-meta-item">
            ${t('preview.from_account', { address: truncateAddress(preview.sourceAccount) })}
            <button class="icon-btn" data-action="copy-address-inline" data-address="${escapeAttr(preview.sourceAccount)}" aria-label="${t('aria.copy_address')}">${isCopied ? icons.check : icons.copy}</button>
          </span>
          ${feeHtml}
        </div>

        <!-- Actions: Cancel + Sign/Approve -->
        <div class="preview-actions">
          <button class="preview-btn preview-btn--cancel" data-action="reject-preview">${t('action.cancel')}</button>
          <button class="preview-btn preview-btn--approve" data-action="approve-preview">${escapeHtml(actionLabel)}</button>
        </div>
      </div>
    `;
  }

  /**
   * Signing view — shown after the user approves the transaction preview.
   * Displays "Continue in your wallet" with a spinner while the wallet
   * processes the sign request. If the wallet rejects, shows an error
   * with a "Try again" button that re-triggers the preview flow.
   */
  private renderSigning(): string {
    const connector = this._client?.activeConnector;
    const walletName = connector?.meta.name ?? t('wallet.fallback_your_wallet');
    const walletIcon = connector ? (getWalletIconDataUri(connector.id) ?? connector.meta.icon) : '';
    const fallbackIcon = connector ? getWalletIconDataUri(connector.id) : '';
    const onerrorHandler = fallbackIcon
      ? `this.src='${fallbackIcon}'; this.onerror=null;`
      : `this.style.display='none';`;

    // If there's an error (wallet rejected), show error state with retry
    if (this.connectingError) {
      return `
        <div class="signing-view signing-view--error">
          <div class="signing-view__icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M15 9l-6 6M9 9l6 6" />
            </svg>
          </div>
          <h2 class="signing-view__title">${t('signing.error_title')}</h2>
          <p class="signing-view__subtitle">${escapeHtml(this.connectingError)}</p>
          <div class="signing-view__actions">
            <button class="signing-view__cancel" data-action="cancel-signing-error">${t('action.cancel')}</button>
            <button class="signing-view__retry" data-action="retry-signing">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9" />
                <path d="M3 4v5h5" />
              </svg>
              ${t('action.try_again')}
            </button>
          </div>
        </div>
      `;
    }

    // Normal signing state — "Continue in your wallet"
    return `
      <div class="signing-view">
        <div class="signing-view__logo-wrap">
          <div class="signing-view__arc" aria-hidden="true"></div>
          <img src="${escapeAttr(walletIcon)}" alt="" class="signing-view__logo"
               onerror="${onerrorHandler}" />
        </div>
        <h2 class="signing-view__title">Continue in ${escapeHtml(walletName)}</h2>
        <p class="signing-view__subtitle">${t('signing.subtitle')}</p>
      </div>
    `;
  }

  /**
   * SIWS loading view — shown during nonce fetch, wallet signing, and
   * server verification. Each phase has a different subtitle + spinner.
   */
  private renderSiwsLoading(): string {
    const connector = this._client?.activeConnector;
    const walletName = connector?.meta.name ?? t('wallet.fallback_your_wallet');
    const iconUrl = connector ? (getWalletIconDataUri(connector.id) ?? connector.meta.icon) : '';
    const fallbackIcon = connector ? getWalletIconDataUri(connector.id) : '';
    const onerrorHandler = fallbackIcon
      ? `this.src='${fallbackIcon}'; this.onerror=null;`
      : `this.style.display='none';`;

    const subtitle =
      this.view === 'siws-checking' ? t('siws.phase.checking_session')
      : this.view === 'siws-nonce' ? t('siws.phase.fetching_nonce')
      : this.view === 'siws-signing' ? t('siws.phase.approve_in_wallet', { walletName: escapeHtml(walletName) })
      : t('siws.phase.verifying');

    return `
      <div class="connecting-view">
        <div class="connecting-view__logo-wrap">
          <svg class="connecting-view__arc" viewBox="0 0 88 88" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="82" height="82" rx="20" ry="20"
                  stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
                  stroke-dasharray="120 240" />
          </svg>
          <img src="${escapeAttr(iconUrl)}" alt="" class="connecting-view__logo"
               onerror="${onerrorHandler}" />
        </div>
        <h2 class="connecting-view__title">${t('siws.title')}</h2>
        <p class="connecting-view__subtitle">${escapeHtml(subtitle)}</p>
        <button class="connecting-view__cancel" data-action="cancel-siws">${t('action.cancel')}</button>
      </div>
    `;
  }

  /**
   * SIWS error view — shown when nonce fetch, signing, or verification
   * fails. Shows the extracted error message and a "Try again" button
   * that re-triggers the SIWS flow (or returns to wallet list if the
   * wallet was disconnected).
   */
  private renderSiwsError(): string {
    const connector = this._client?.activeConnector;
    const iconUrl = connector ? (getWalletIconDataUri(connector.id) ?? connector.meta.icon) : '';
    const fallbackIcon = connector ? getWalletIconDataUri(connector.id) : '';
    const onerrorHandler = fallbackIcon
      ? `this.src='${fallbackIcon}'; this.onerror=null;`
      : `this.style.display='none';`;

    const errorMsg = this.connectingError ?? t('siws.error_default');
    const isConnected = !!this._client?.session;

    return `
      <div class="connecting-view connecting-view--error">
        <div class="connecting-view__logo-wrap">
          <img src="${escapeAttr(iconUrl)}" alt="" class="connecting-view__logo"
               onerror="${onerrorHandler}" />
        </div>
        <h2 class="connecting-view__title">${t('siws.error_title')}</h2>
        <p class="connecting-view__subtitle">${escapeHtml(errorMsg)}</p>
        <button class="connecting-view__retry" data-action="retry-siws">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 9-9" />
            <path d="M3 4v5h5" />
          </svg>
          ${isConnected ? t('action.try_again') : t('siws.connect_wallet')}
        </button>
      </div>
    `;
  }

  private renderNetworkMismatch(): string {
    const err = this.lastError instanceof NetworkMismatchError ? this.lastError : null;
    return `
      <div class="error-state">
        ${icons.alertCircle}
        <div class="error-title">${t('network_mismatch.title')}</div>
        <div class="error-message">
          ${err ? t('network_mismatch.detail', { actualNetwork: `<strong>${escapeHtml(err.actualNetwork)}</strong>`, expectedNetwork: `<strong>${escapeHtml(err.expectedNetwork)}</strong>` }) : t('network_mismatch.detail_fallback')}
          ${t('network_mismatch.action_hint')}
        </div>
        <button class="btn" data-action="retry" style="margin-top: 6px;">${t('action.try_again')}</button>
      </div>
    `;
  }

  private renderError(): string {
    return `
      <div class="error-state">
        ${icons.alertCircle}
        <div class="error-title">${t('error.title')}</div>
        <div class="error-message">${escapeHtml(this.lastError?.message ?? t('error.default_message'))}</div>
        <button class="btn" data-action="retry" style="margin-top: 6px;">${t('action.try_again')}</button>
      </div>
    `;
  }

  private wireEvents(effectiveMode: EffectiveMode) {
    this.root.querySelector('[data-action="close"]')?.addEventListener('click', () => this.close());
    if (effectiveMode !== 'inline') {
      this.root.querySelector('.overlay')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) this.close();
      });
    }

    // Set up the Motion-based drag controller for bottom-sheet mode.
    // Only create once per open cycle — the controller uses event delegation
    // on the ShadowRoot, so it survives targeted content updates.
    if (effectiveMode === 'bottomsheet' && !this.dragController) {
      this.dragController = new BottomsheetMotionDragController({
        animator: this.bottomsheetAnimator,
        onDismiss: () => this.close(true),
      });
      this.dragController.attach(this.root);
    }

    // Set up the swipe-to-close controller for modal mode.
    // Allows the user to swipe in any direction to dismiss the modal.
    if (effectiveMode === 'modal' && !this.swipeController) {
      this.swipeController = new ModalSwipeController({
        onDismiss: () => this.close(true),
      });
      this.swipeController.attach(this.root);
    }

    this.root.querySelectorAll<HTMLElement>('[data-action="select-wallet"]').forEach((el) => {
      el.addEventListener('click', () => {
        const walletId = el.dataset.walletId;
        const found = this.walletList.find((w) => w.connector.id === walletId);
        if (found) this.selectWallet(found.connector);
      });
    });

    // Cancel the connecting state — returns to the wallet list without
    // rejecting the in-flight connect() promise (the promise will resolve
    // or reject on its own when the wallet responds, but the user has
    // navigated away by then).
    this.root.querySelector('[data-action="cancel-connecting"]')?.addEventListener('click', () => {
      this.connectingWalletId = null;
      this.wcPairingUri = null; this.wcQrDataUri = null;
      this.connectingError = null;
      this.view = 'wallet-list';
      this.render();
    });

    // Retry connecting — re-triggers selectWallet() for the same wallet.
    this.root.querySelector('[data-action="retry-connecting"]')?.addEventListener('click', () => {
      const walletId = this.connectingWalletId;
      if (!walletId) return;
      this.connectingError = null;
      const connector = this._client?.registry.get(walletId);
      if (connector) this.selectWallet(connector);
    });

    // Retry SIWS — if wallet is still connected, re-trigger the SIWS flow.
    // If wallet was disconnected (disconnectOnFail), go back to wallet list.
    this.root.querySelector('[data-action="retry-siws"]')?.addEventListener('click', () => {
      this.connectingError = null;
      this.siwsRetryCount = 0; // Reset retry count on manual retry
      if (this._client?.session) {
        void this.triggerSiwsFlow();
      } else {
        this.view = 'wallet-list';
        this.render();
      }
    });

    // Cancel SIWS flow — sets siwsCancelled flag so handleSiwsFailure is a no-op
    this.root.querySelector('[data-action="cancel-siws"]')?.addEventListener('click', () => {
      this.siwsCancelled = true;
      this.siwsPending = false;
      this.siwsRetryCount = 0;
      this.connectingError = null;
      if (this._client?.siwsConfig) {
        const disconnectOnFail = this._client.siwsConfig.disconnectOnFail !== false;
        if (disconnectOnFail && this._client.session) {
          void this._client.disconnect();
        }
      }
      this.view = 'wallet-list';
      this.render();
    });

    this.root.querySelectorAll<HTMLElement>('[data-action="pick-account"]').forEach((el) => {
      el.addEventListener('click', () => {
        const address = el.dataset.address;
        if (address) this.pickAccount(address);
      });
    });

    this.root.querySelector('[data-action="switch-wallet"]')?.addEventListener('click', async () => {
      // Properly disconnect the current wallet before showing the wallet list.
      // This closes the Ledger transport handle, clears the persisted session,
      // and prevents restore() from reconnecting both wallets on next load.
      if (this._client?.session) {
        await this._client.disconnect();
      }
      this.cachedBalance = null;
      this.cachedTxHistory = [];
      this.view = 'wallet-list';
      await this.refreshWalletList();
    });

    this.root.querySelector('[data-action="disconnect"]')?.addEventListener('click', async () => {
      await this._client?.disconnect();
      this.cachedBalance = null;
      this.cachedTxHistory = [];
    });

    // "Get Testnet funds" — opens friendbot.stellar.org in a new tab to fund the
    // connected address, then polls the balance a few times so the new XLM shows
    // up without the user having to manually refresh. friendbot typically credits
    // within 2-5 seconds, but Horizon's index can lag by another 1-2s, so we
    // retry at 3s + 6s + 10s after the click.
    this.root.querySelector('[data-action="get-testnet-funds"]')?.addEventListener('click', () => {
      const session = this._client?.session;
      if (!session || session.network !== 'TESTNET') return;

      // Open the faucet URL in a new tab. friendbot responds with a JSON envelope
      // (or HTML if the browser doesn't send Accept: application/json) — either
      // way, the user sees a success/failure response in the new tab.
      const url = `https://friendbot.stellar.org/?addr=${encodeURIComponent(session.address)}`;
      window.open(url, '_blank', 'noopener,noreferrer');

      // Show the "Funding requested…" banner for ~3.5s. Re-renders to reveal it.
      this.fundsRequested = true;
      this.render();
      window.setTimeout(() => {
        // Only clear if no other state change has happened in the meantime —
        // but since we re-render on every state change, this is safe.
        this.fundsRequested = false;
        this.render();
      }, 3500);

      // Poll the balance a few times so the new XLM appears automatically.
      // Each refreshAccountData() call sets cachedBalance and re-renders.
      [3000, 6000, 10000].forEach((delay) => {
        window.setTimeout(() => {
          // Bail if the user has disconnected or switched wallets in the meantime.
          const current = this._client?.session;
          if (!current || current.address !== session.address) return;
          void this.refreshAccountData();
        }, delay);
      });
    });

    // Overflow menu toggle
    this.root.querySelector('[data-action="toggle-overflow"]')?.addEventListener('click', () => {
      const menu = this.root.querySelector<HTMLElement>('.overflow-menu');
      if (menu) {
        const isOpen = menu.getAttribute('data-overflow') === 'true';
        menu.setAttribute('data-overflow', isOpen ? 'false' : 'true');
      }
    });

    // Legacy: still handle switch-account for multi-account wallets (Ledger)
    this.root.querySelectorAll<HTMLElement>('[data-action="switch-account"]').forEach((el) => {
      el.addEventListener('click', () => {
        const walletId = el.dataset.walletId;
        if (walletId) this._client?.switchAccount(walletId);
      });
    });

    this.root.querySelector('[data-action="approve-preview"]')?.addEventListener('click', () => this.resolvePreview(true));
    this.root.querySelector('[data-action="reject-preview"]')?.addEventListener('click', () => this.resolvePreview(false));

    // Retry signing — go back to the preview view so the user can approve again
    this.root.querySelector('[data-action="retry-signing"]')?.addEventListener('click', () => {
      this.connectingError = null;
      if (this.lastApprovedPreview) {
        // Re-show the preview — the user can approve again
        this.pendingPreview = {
          preview: this.lastApprovedPreview,
          resolve: () => { /* no-op — the actual retry happens via the sign queue */ },
          wasAlreadyOpen: true,
        };
        this.view = 'transaction-preview';
        this.render();
      } else {
        // No preview to retry — go back to connected view
        this.view = this._client?.session ? 'connected' : 'wallet-list';
        this.render();
      }
    });

    // Cancel from signing error — dismiss the error and go back to the
    // connected view (or wallet-list). The user chose not to retry.
    this.root.querySelector('[data-action="cancel-signing-error"]')?.addEventListener('click', () => {
      this.connectingError = null;
      this.lastApprovedPreview = null;
      this.view = this._client?.session ? 'connected' : 'wallet-list';
      this.render();
    });

    this.root.querySelector('[data-action="retry"]')?.addEventListener('click', () => {
      this.view = 'wallet-list';
      this.render();
    });
    this.root.querySelector('[data-action="copy-address"]')?.addEventListener('click', () => {
      if (this._client?.session) this.copyAddress(this._client.session.address);
    });

    // Copy WalletConnect pairing URI to clipboard (for manual QR generation
    // or debugging). The URI is in data-uri on the copy button.
    this.root.querySelector<HTMLElement>('[data-action="copy-wc-uri"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const uri = (e.currentTarget as HTMLElement)?.dataset?.uri;
      if (uri) {
        navigator.clipboard?.writeText(uri).catch(() => {});
        // Brief visual feedback — swap the copy icon for a check
        const btn = e.currentTarget as HTMLElement;
        const originalHTML = btn.innerHTML;
        btn.innerHTML = `${icons.check} <span>${t('wc.copied')}</span>`;
        setTimeout(() => { btn.innerHTML = originalHTML; }, 1500);
      }
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

// Guard: only define the custom element in browser environments where
// HTMLElement and customElements are available. This allows the module
// to be imported safely during SSR (Node.js) without throwing — the class
// declaration is hoisted but not evaluated until an instance is created.
// The `typeof` check prevents ReferenceError on `HTMLElement` which is
// undefined in Node.js.
if (typeof HTMLElement !== 'undefined' && typeof customElements !== 'undefined') {
  if (!customElements.get('stellar-appkit-modal')) {
    customElements.define('stellar-appkit-modal', SagantaAppKitModal);
  }
}
