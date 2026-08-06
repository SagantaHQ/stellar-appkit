/**
 * Shared prop types for the framework-native `<StellarAppKitModal>` components
 * (React, Vue, Solid, Svelte). Each framework's wrapper imports these so the
 * API surface is identical across wrappers — only the implementation language
 * differs.
 *
 * These props mirror the underlying `<saganta-appkit-modal>` Web Component's
 * observed attributes (`mode`, `theme`, `branding`, `logo-src`, `title`,
 * `auto-retry-network`, `stellar-expert-avatars`) and its `client` property.
 *
 * Design note: we don't accept the `client` as a prop here — the framework
 * modal components are designed to be used inside the corresponding provider
 * (`<StellarAppKitProvider>` for React/Solid, `provideStellarAppKit()` for
 * Vue, `setStellarAppKitContext()` for Svelte), which already owns the
 * client. If you need to use the modal without a provider, use the raw
 * Web Component directly with `modal.client = appkit`.
 */

import type { StellarAppKit } from '../index.js';

/**
 * Presentation mode for the modal — mirrors the Web Component's `mode` attribute.
 *
 * `'bottomsheet'` is the canonical spelling. `'bottom-sheet'` (with hyphen)
 * is accepted as a backwards-compatible alias and normalized internally.
 */
export type ModalMode = 'auto' | 'modal' | 'bottomsheet' | 'bottom-sheet' | 'inline';

/** Theme selection — mirrors the Web Component's `theme` attribute. */
export type ModalTheme = 'dark' | 'light';

/** Branding mode — mirrors the Web Component's `branding` attribute. */
export type ModalBranding = 'default' | 'minimal' | 'hidden';

/**
 * Shared prop shape for all four framework modal components.
 *
 * Every prop here maps directly to an attribute or property on the underlying
 * `<saganta-appkit-modal>` element, so refer to the Web Component's docs for
 * behavior details.
 */
export interface StellarAppKitModalProps {
  /**
   * Presentation mode.
   *
   * - `'auto'` (default) — modal on desktop, bottom-sheet on mobile web
   * - `'modal'` — always centered modal (desktop)
   * - `'bottomsheet'` — always draggable bottom-sheet (mobile). `'bottom-sheet'` (hyphen) also accepted.
   * - `'inline'` — embedded in-page, no overlay (always open)
   */
  mode?: ModalMode;

  /**
   * Theme — controls the built-in dark/light palette.
   * Override individual tokens via CSS custom properties on the host element.
   */
  theme?: ModalTheme;

  /**
   * Branding mode for the wallet list view.
   * - `'default'` — full branding (logo, title, footer link)
   * - `'minimal'` — title only
   * - `'hidden'` — no branding
   */
  branding?: ModalBranding;

  /** URL to a custom logo image (any format the browser supports). */
  logoSrc?: string;

  /** Title shown at the top of the modal (default: "Connect a wallet"). */
  title?: string;

  /**
   * When `true`, the modal will auto-poll the wallet's network after a
   * NetworkMismatchError and re-attempt connect once the user switches.
   */
  autoRetryNetwork?: boolean;

  /**
   * When `true`, fetches avatar images from Stellar Expert for connected
   * accounts that don't provide their own avatar via `getAvatar()`.
   */
  stellarExpertAvatars?: boolean;
}

/**
 * Imperative handle exposed by `ref` / `forwardRef` on the framework modal
 * components. Mirrors the public methods of the underlying Web Component
 * so consumers can programmatically open/close the modal without touching
 * the DOM directly.
 */
export interface StellarAppKitModalHandle {
  /** Open the modal. No-op in inline mode. */
  open(): Promise<void>;
  /** Close the modal. No-op in inline mode. */
  close(): void;
  /** The underlying Web Component instance — escape hatch for advanced use. */
  readonly element: HTMLElement & {
    client: StellarAppKit | null;
  };
}

/**
 * Event types fired by the modal component. These mirror the CustomEvents
 * dispatched by the underlying Web Component (`sc-connect`, `sc-disconnect`,
 * `sc-error`).
 */
export interface StellarAppKitModalEvents {
  /** Fired when a wallet connects (mirrors the client's `connect` event). */
  onConnect?: (session: import('../index.js').ConnectSession) => void;
  /** Fired when a wallet disconnects (mirrors the client's `disconnect` event). */
  onDisconnect?: (payload: { walletId: string }) => void;
  /** Fired when the client emits an error (e.g. user rejected, network mismatch). */
  onError?: (error: import('../index.js').ConnectError) => void;
}

/**
 * Translate the camelCase props to the kebab-case attribute names the Web
 * Component expects. Used by all four framework components.
 */
export function propsToAttributes(props: StellarAppKitModalProps): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (props.mode) attrs['mode'] = props.mode;
  if (props.theme) attrs['theme'] = props.theme;
  if (props.branding) attrs['branding'] = props.branding;
  if (props.logoSrc) attrs['logo-src'] = props.logoSrc;
  if (props.title) attrs['title'] = props.title;
  if (props.autoRetryNetwork !== undefined) attrs['auto-retry-network'] = props.autoRetryNetwork ? 'true' : 'false';
  if (props.stellarExpertAvatars !== undefined) attrs['stellar-expert-avatars'] = props.stellarExpertAvatars ? 'true' : 'false';
  return attrs;
}
