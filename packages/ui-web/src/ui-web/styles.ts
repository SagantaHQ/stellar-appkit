import type { ConnectTheme } from './tokens.js';
import { CSS_VAR_NAMES } from './tokens.js';

function v(token: keyof ConnectTheme, theme: ConnectTheme): string {
  return `var(${CSS_VAR_NAMES[token]}, ${theme[token]})`;
}

/**
 * Builds the full stylesheet for the shadow root. Every value routes
 * through `var(--sak-*, <theme-default>)` rather than setting the vars on
 * `:host` — that's what lets a host page override any token with a plain
 * `stellar-appkit-modal { --sak-color-accent: ...; }` rule without fighting
 * shadow-boundary cascade specificity.
 */
export function buildStyles(theme: ConnectTheme): string {
  return `
    :host {
      all: initial;
      display: contents;
      font-family: ${v('fontDisplay', theme)};
      --sak-branding: show;
    }

    * { box-sizing: border-box; }

    .overlay {
      position: fixed;
      inset: 0;
      background: ${v('overlayColor', theme)};
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      display: flex;
      z-index: 2147483000;
      opacity: 0;
      transition: opacity 220ms ease;
    }
    .overlay[data-open="true"] { opacity: 1; }
    @media (prefers-reduced-motion: reduce) {
      .overlay { transition: none; backdrop-filter: none; -webkit-backdrop-filter: none; }
    }

    /* ---------- layout: modal (desktop) ---------- */
    .overlay[data-mode="modal"] { align-items: center; justify-content: center; padding: 24px; }
    .overlay[data-mode="modal"] .panel {
      width: 100%;
      max-width: 380px;
      border-radius: ${v('radiusLg', theme)};
      transform: scale(0.94) translateY(8px);
      opacity: 0;
      transition: transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 240ms ease;
    }
    .overlay[data-mode="modal"][data-open="true"] .panel { transform: scale(1) translateY(0); opacity: 1; }

    /* ---------- layout: bottom-sheet (mobile web + always on RN) ---------- */
    .overlay[data-mode="bottomsheet"] { align-items: flex-end; justify-content: center; padding: 0; }
    .overlay[data-mode="bottomsheet"] .panel {
      width: 100%;
      max-width: 560px;
      border-radius: ${v('radiusLg', theme)} ${v('radiusLg', theme)} 0 0;
      padding-bottom: env(safe-area-inset-bottom, 0px);
      transform: translateY(100%);
      transition: transform 320ms cubic-bezier(0.32, 0.72, 0, 1);
      touch-action: pan-y;
      overscroll-behavior: contain;
    }
    .overlay[data-mode="bottomsheet"][data-open="true"] .panel { transform: translateY(0); }
    .drag-handle {
      width: 36px;
      height: 5px;
      border-radius: 4px;
      background: ${v('colorBorder', theme)};
      margin: 10px auto 2px;
      cursor: grab;
      touch-action: none;
      transition: background 0.15s ease;
    }
    .drag-handle:active {
      cursor: grabbing;
      background: ${v('colorTextMuted', theme)};
    }
    .overlay[data-mode="modal"] .drag-handle { display: none; }

    @media (prefers-reduced-motion: reduce) {
      .overlay[data-mode="modal"] .panel,
      .overlay[data-mode="bottomsheet"] .panel { transition: none; }
    }

    /* ---------- layout: inline (no overlay, renders in page flow) ---------- */
    .inline-root .panel {
      border-radius: ${v('radiusLg', theme)};
      border: 1px solid ${v('colorBorder', theme)};
      max-width: 380px;
    }

    .panel {
      background: ${v('colorSurface', theme)};
      color: ${v('colorText', theme)};
      box-shadow: ${v('shadowElevated', theme)};
      overflow: hidden;
      display: flex;
      flex-direction: column;
      max-height: min(560px, 85vh);
      /* Use dynamic viewport height on mobile browsers that support it —
         fixes the panel being cut off by the address bar. dvh = dynamic
         viewport height (changes as the address bar shows/hides). */
      max-height: min(560px, 85dvh);
    }

    .header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 16px 18px 8px;
      flex-shrink: 0;
    }
    .header .brand { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
    .header .brand img, .header .brand ::slotted(*) { width: 22px; height: 22px; border-radius: 6px; display: block; }
    .header .title { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .icon-btn {
      all: unset;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: ${v('radiusSm', theme)};
      color: ${v('colorTextMuted', theme)};
      cursor: pointer;
      flex-shrink: 0;
      transition: background-color 180ms ease, color 180ms ease, transform 180ms ease;
    }
    .icon-btn:hover { background: ${v('colorSurfaceHover', theme)}; color: ${v('colorText', theme)}; }
    .icon-btn:active { transform: scale(0.9); }
    .icon-btn:focus-visible { outline: 2px solid ${v('colorAccent', theme)}; outline-offset: 1px; }
    .icon-btn svg { width: 16px; height: 16px; }

    /* Header variant for the connecting view: back arrow + centered title + close */
    .header--connecting {
      justify-content: space-between;
    }
    .header--connecting .title {
      text-align: center;
      flex: 1;
    }

    /* ---- Connecting view ---- */
    .connecting-view {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 32px 24px 28px;
      gap: 0;
    }
    /* Staggered entrance — each child fades in + slides up slightly,
       with a small delay between each for a cascading reveal. */
    .connecting-view > * {
      opacity: 0;
      animation: sak-connecting-enter 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    .connecting-view > *:nth-child(1) { animation-delay: 0ms; }
    .connecting-view > *:nth-child(2) { animation-delay: 80ms; }
    .connecting-view > *:nth-child(3) { animation-delay: 160ms; }
    .connecting-view > *:nth-child(4) { animation-delay: 240ms; }
    @keyframes sak-connecting-enter {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .connecting-view__logo-wrap {
      position: relative;
      width: 88px;
      height: 88px;
      margin-bottom: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .connecting-view__logo {
      width: 56px;
      height: 56px;
      border-radius: 12px;
      object-fit: contain;
      position: relative;
      z-index: 1;
      background: ${v('colorSurface', theme)};
      /* Subtle breathe — the logo gently scales up and down while
         waiting for the wallet to respond. Slow enough to feel calm,
         not anxious. */
      animation: sak-logo-breathe 2.8s ease-in-out infinite;
    }
    @keyframes sak-logo-breathe {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.06); }
    }
    /* The spinner — an SVG <rect> with stroke-dasharray that animates
       around the perimeter of the rounded-square border. A solid line
       segment travels around the rect, creating a "drawing the border"
       effect. Uses ease-in-out timing for a smoother, more organic feel
       than linear (which feels mechanical). */
    .connecting-view__arc {
      position: absolute;
      inset: 0;
      width: 88px;
      height: 88px;
      color: ${v('colorAccent', theme)};
      animation: sak-connecting-dash 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
    @keyframes sak-connecting-dash {
      to { stroke-dashoffset: -360; }
    }
    @media (prefers-reduced-motion: reduce) {
      .connecting-view__arc { animation-duration: 8s; }
      .connecting-view__logo { animation: none; }
      .connecting-view > * { animation: none; opacity: 1; }
    }
    .connecting-view__title {
      font-size: 17px;
      font-weight: 600;
      letter-spacing: -0.015em;
      color: ${v('colorText', theme)};
      margin: 0 0 8px;
      line-height: 1.3;
    }
    .connecting-view__subtitle {
      font-size: 14px;
      line-height: 1.5;
      color: ${v('colorTextMuted', theme)};
      margin: 0 0 32px;
      max-width: 280px;
    }
    .connecting-view__retry {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 18px;
      border-radius: 999px;
      border: 1px solid ${v('colorBorder', theme)};
      background: transparent;
      color: ${v('colorText', theme)};
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 200ms ease, border-color 200ms ease, transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .connecting-view__retry:hover {
      background: ${v('colorSurfaceHover', theme)};
      border-color: ${v('colorTextMuted', theme)};
      transform: translateY(-1px);
    }
    .connecting-view__retry:active {
      transform: translateY(0) scale(0.97);
    }
    .connecting-view__retry svg {
      width: 14px;
      height: 14px;
    }

    /* Error variant — the spinner arc is hidden, subtitle shows the error
       message, and the retry button is shown. The logo stays in place
       (no rotation) so the user sees which wallet failed. */
    .connecting-view--error .connecting-view__logo-wrap {
      margin-bottom: 24px;
    }
    .connecting-view--error .connecting-view__subtitle {
      color: ${v('colorDanger', theme)};
    }

    /* ---- WalletConnect QR view ---- */
    /* Shown when the WC connector fires onUri with a pairing URI.
       Replaces the generic spinner with a scannable QR code + deep link. */
    .connecting-view--wc {
      padding: 24px 20px 20px;
    }
    .wc-qr-wrap {
      position: relative;
      width: 220px;
      height: 220px;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .wc-qr-frame {
      width: 220px;
      height: 220px;
      border-radius: 16px;
      overflow: hidden;
      background: #fff;
      padding: 8px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .wc-qr-frame--error {
      background: ${v('colorSurface', theme)};
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .wc-qr-frame--error .wc-qr-fallback {
      display: flex !important;
    }
    .wc-qr-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      border-radius: 8px;
    }
    .wc-qr-logo {
      position: absolute;
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: #fff;
      padding: 4px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      z-index: 1;
    }
    .wc-actions {
      display: flex;
      gap: 8px;
      margin-top: 4px;
      flex-wrap: wrap;
      justify-content: center;
    }
    .wc-deeplink, .wc-copy-uri {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      text-decoration: none;
      cursor: pointer;
      transition: background-color 200ms ease, border-color 200ms ease;
      border: 1px solid ${v('colorBorder', theme)};
      background: ${v('colorSurface', theme)};
      color: ${v('colorText', theme)};
    }
    .wc-deeplink:hover, .wc-copy-uri:hover {
      background: ${v('colorSurfaceHover', theme)};
      border-color: ${v('colorAccent', theme)};
    }
    .wc-deeplink svg, .wc-copy-uri svg {
      width: 14px;
      height: 14px;
    }

    /* ---- Signing view (after preview is approved) ---- */
    /* Reuses the connecting-view layout but with different semantics:
       "Continue in your wallet" while the wallet processes the sign request. */
    .signing-view {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 32px 24px 28px;
    }
    .signing-view > * {
      opacity: 0;
      animation: sak-connecting-enter 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    .signing-view > *:nth-child(1) { animation-delay: 0ms; }
    .signing-view > *:nth-child(2) { animation-delay: 80ms; }
    .signing-view > *:nth-child(3) { animation-delay: 160ms; }
    .signing-view > *:nth-child(4) { animation-delay: 240ms; }
    .signing-view__logo-wrap {
      position: relative;
      width: 88px;
      height: 88px;
      margin-bottom: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .signing-view__logo {
      width: 56px;
      height: 56px;
      border-radius: 12px;
      object-fit: contain;
      position: relative;
      z-index: 1;
      background: ${v('colorSurface', theme)};
      animation: sak-logo-breathe 2.8s ease-in-out infinite;
    }
    .signing-view__arc {
      position: absolute;
      inset: 0;
      width: 88px;
      height: 88px;
      color: ${v('colorAccent', theme)};
      animation: sak-connecting-dash 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
    .signing-view__icon {
      color: ${v('colorDanger', theme)};
      margin-bottom: 16px;
    }
    .signing-view__title {
      font-size: 17px;
      font-weight: 600;
      letter-spacing: -0.015em;
      color: ${v('colorText', theme)};
      margin: 0 0 8px;
      line-height: 1.3;
    }
    .signing-view__subtitle {
      font-size: 14px;
      line-height: 1.5;
      color: ${v('colorTextMuted', theme)};
      margin: 0 0 32px;
      max-width: 280px;
    }
    .signing-view--error .signing-view__logo-wrap { display: none; }
    .signing-view--error .signing-view__subtitle {
      color: ${v('colorDanger', theme)};
      margin-bottom: 24px;
    }
    .signing-view__actions {
      display: flex;
      gap: 8px;
      justify-content: center;
    }
    .signing-view__cancel {
      padding: 8px 18px;
      border-radius: 999px;
      border: 1px solid ${v('colorBorder', theme)};
      background: transparent;
      color: ${v('colorText', theme)};
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 200ms ease, border-color 200ms ease;
    }
    .signing-view__cancel:hover {
      background: ${v('colorSurfaceHover', theme)};
      border-color: ${v('colorTextMuted', theme)};
    }
    .signing-view__retry {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 18px;
      border-radius: 999px;
      border: 1px solid ${v('colorBorder', theme)};
      background: transparent;
      color: ${v('colorText', theme)};
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 200ms ease, border-color 200ms ease, transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .signing-view__retry:hover {
      background: ${v('colorSurfaceHover', theme)};
      border-color: ${v('colorTextMuted', theme)};
      transform: translateY(-1px);
    }
    .signing-view__retry:active {
      transform: translateY(0) scale(0.97);
    }
    .signing-view__retry svg {
      width: 14px;
      height: 14px;
    }

    .body {
      padding: 4px 10px 12px;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: ${v('colorBorder', theme)} transparent;
    }

    /* Webkit (Chrome, Safari, Edge) — sleek custom scrollbar
     * Uses the theme's border color for the thumb (subtle, not distracting),
     * and the accent color on hover so the user can spot it when they need it.
     * The thumb is narrow (4px) and rounded, matching the panel's radius language.
     * Track is fully transparent — no secondary background stripe. */
    .body::-webkit-scrollbar { width: 6px; }
    .body::-webkit-scrollbar-track { background: transparent; }
    .body::-webkit-scrollbar-thumb {
      background: ${v('colorBorder', theme)};
      border-radius: 9999px;
      border: 1px solid transparent;
      background-clip: padding-box;
    }
    .body::-webkit-scrollbar-thumb:hover {
      background: ${v('colorAccent', theme)};
      background-clip: padding-box;
    }
    /* Hide the scrollbar when not hovered — fades in on hover (sleek, macOS-style) */
    .body { scrollbar-width: none; }
    .body:hover { scrollbar-width: thin; }
    .body::-webkit-scrollbar { width: 0; transition: width 0.2s ease; }
    .body:hover::-webkit-scrollbar { width: 6px; }
    /* Firefox fallback — always visible thin scrollbar (Firefox doesn't support hover-show) */
    @supports not selector(::-webkit-scrollbar) {
      .body { scrollbar-width: thin; }
    }

    /* ---------- wallet list ---------- */
    .wallet-list-loading {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 2px solid ${v('colorBorder', theme)};
      border-top-color: ${v('colorAccent', theme)};
      animation: sak-spin 0.8s linear infinite;
      margin: 0 auto 12px;
    }
    @keyframes sak-spin { to { transform: rotate(360deg); } }
    .wallet-row {
      all: unset;
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 10px 8px;
      border-radius: ${v('radiusMd', theme)};
      cursor: pointer;
      box-sizing: border-box;
      transition: background-color 180ms ease, transform 180ms ease;
    }
    .wallet-row:hover { background: ${v('colorSurfaceHover', theme)}; }
    .wallet-row:active { transform: scale(0.985); }
    .wallet-row:focus-visible { outline: 2px solid ${v('colorAccent', theme)}; outline-offset: -2px; }
    .wallet-row[data-unavailable="true"] { opacity: 0.55; }
    .wallet-tile {
      position: relative;
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: ${v('colorBg', theme)};
      border: 1px solid ${v('colorBorder', theme)};
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      overflow: hidden;
      transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    /* Wallet tile icon scales up subtly on row hover — feels responsive. */
    .wallet-row:hover .wallet-tile { transform: scale(1.08); }
    .wallet-tile img {
      width: 28px;
      height: 28px;
      object-fit: contain;
      border-radius: 7px;
      padding: 0;
    }
    .wallet-name { font-size: 14px; font-weight: 500; flex: 1; text-align: left; }
    .wallet-sub { font-size: 12px; color: ${v('colorTextMuted', theme)}; }
    /* "Installed" badge — outline style using the theme's accent color.
       Transparent background, accent-tinted border, accent-mixed text.
       Uses color-mix for contrast: text = accent 60% + theme text 40%,
       so it reads legibly on both light and dark surfaces without a
       separate light-mode override. The dot is a small accent-colored
       circle — static (no pulse) for a quiet, precise look. */
    .wallet-sub--installed {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 10px 3px 8px;
      border-radius: ${v('radiusSm', theme)};
      font-family: ${v('fontMono', theme)};
      font-size: 10.5px;
      font-weight: 600;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      white-space: nowrap;
      flex-shrink: 0;
      background: transparent;
      border: 1px solid color-mix(in srgb, ${v('colorAccent', theme)} 32%, transparent);
      color: color-mix(in srgb, ${v('colorAccent', theme)} 60%, ${v('colorText', theme)} 40%);
      transition: border-color 0.2s ease, color 0.2s ease;
    }
    .wallet-sub--installed::before {
      content: "";
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: ${v('colorAccent', theme)};
      flex-shrink: 0;
    }

    /* "Install" button for not-installed wallets — appears on the right
       side of the wallet row instead of the subLabel. The row itself is
       still clickable (opens the install URL); the button is a visual
       affordance that this wallet needs to be installed first. */
    .wallet-install-btn {
      display: inline-flex;
      align-items: center;
      padding: 5px 12px;
      border-radius: ${v('radiusSm', theme)};
      background: ${v('colorAccent', theme)};
      color: ${v('colorBg', theme)};
      font-size: 12px;
      font-weight: 600;
      text-decoration: none;
      flex-shrink: 0;
      transition: opacity 200ms ease, transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .wallet-install-btn:hover { opacity: 0.9; transform: scale(1.05); }
    .wallet-install-btn:active { transform: scale(0.95); }
    /* When a wallet isn't installed, don't dim the row — the Install button
       is the primary CTA, so it should be prominent. */
    .wallet-row--not-installed { opacity: 1; }
    .wallet-row--not-installed .wallet-sub { display: none; }

    /* connecting state: a conic-gradient "scanner" effect rotates around
     * the wallet tile's rounded-rectangle border. This gives a modern
     * loading-indicator feel (like AI dashboards) without the wobble of
     * a spinning border. The ::before is a conic gradient that sits 2px
     * outside the tile; ::after is a solid background that sits 2px inside,
     * so only the gradient ring is visible.
     *
     * Uses conic-gradient instead of border + border-radius because a
     * spinning border with border-radius wobbles — the corners trace a
     * different radius than the edges. A conic gradient on a rounded
     * rectangle traces smoothly because it's a fill, not a stroke. */
    .wallet-tile.connecting {
      position: relative;
      z-index: 0;
    }
    .wallet-tile.connecting::before {
      content: "";
      position: absolute;
      inset: -2px;
      border-radius: 12px;
      background: conic-gradient(
        from 0deg,
        transparent 0%,
        ${v('colorAccent', theme)} 25%,
        ${v('colorAccent', theme)} 40%,
        transparent 60%,
        transparent 100%
      );
      animation: sc-spin 1.2s linear infinite;
      z-index: -1;
    }
    .wallet-tile.connecting::after {
      content: "";
      position: absolute;
      inset: 1px;
      border-radius: 9px;
      background: ${v('colorBg', theme)};
      z-index: -1;
    }
    @media (prefers-reduced-motion: reduce) {
      .wallet-tile.connecting::before { animation-duration: 3s; }
    }
    @keyframes sc-spin { to { transform: rotate(360deg); } }

    /* ---------- connected state ---------- */
    .account {
      display: flex;
      flex-direction: column;
      gap: 20px;
      padding: 6px 10px 14px;
    }

    /* Header wallet icon in panel header */
    .header-wallet-icon {
      width: 20px;
      height: 20px;
      border-radius: 5px;
      display: block;
    }

    /* Account header — avatar + address (clickable) + network pill + overflow */
    .account-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 2px 0;
    }
    .account-header .account-avatar {
      width: 42px;
      height: 42px;
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .account-header .account-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 12px;
    }
    .account-info {
      flex: 1;
      min-width: 0;
    }
    .account-address-row {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
    }
    .account-address {
      font-family: ${v('fontMono', theme)};
      font-size: 14px;
      font-weight: 500;
    }
    .account-copy-icon {
      display: flex;
      opacity: 0;
      transition: opacity 0.15s ease;
    }
    .account-copy-icon svg { width: 14px; height: 14px; color: ${v('colorTextMuted', theme)}; }
    .account-address-row:hover .account-copy-icon { opacity: 1; }
    .account-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 4px;
    }
    .network-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      text-transform: capitalize;
      color: ${v('colorTextMuted', theme)};
      padding: 2px 8px;
      border-radius: 9999px;
      background: ${v('colorSurfaceHover', theme)};
    }
    .network-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--net-color, ${v('colorAccent', theme)});
    }
    .explorer-link {
      display: flex;
      opacity: 0.5;
      transition: opacity 0.15s ease;
    }
    .explorer-link:hover { opacity: 1; }
    .explorer-link svg { width: 14px; height: 14px; color: ${v('colorTextMuted', theme)}; }

    /* Overflow menu — hidden by default, toggled by ••• button */
    .overflow-menu {
      display: none;
      flex-direction: column;
      gap: 2px;
      padding: 6px;
      border-radius: ${v('radiusMd', theme)};
      background: ${v('colorSurfaceHover', theme)};
      border: 1px solid ${v('colorBorder', theme)};
    }
    .overflow-menu[data-overflow="true"] {
      display: flex;
    }
    .overflow-item {
      all: unset;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: ${v('radiusSm', theme)};
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      color: ${v('colorText', theme)};
      transition: background 0.15s ease;
    }
    .overflow-item:hover { background: ${v('colorBg', theme)}; }
    .overflow-item svg { width: 18px; height: 18px; color: ${v('colorTextMuted', theme)}; }
    .overflow-danger { color: #ef4444; }
    .overflow-danger svg { color: #ef4444; }

    /* Pending signature banner */
    .pending-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border-radius: ${v('radiusMd', theme)};
      background: rgba(110, 231, 183, 0.08);
      border: 1px solid rgba(110, 231, 183, 0.2);
      font-size: 13px;
      color: ${v('colorAccent', theme)};
    }
    .pending-spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(110, 231, 183, 0.2);
      border-top-color: ${v('colorAccent', theme)};
      border-radius: 50%;
      animation: sc-spin 0.8s linear infinite;
    }

    /* Balance — large typography, no card */
    .balance-section {
      padding: 0 2px;
    }
    .balance-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: ${v('colorTextMuted', theme)};
      margin-bottom: 6px;
    }
    .balance-amount {
      display: flex;
      align-items: baseline;
      gap: 6px;
    }
    .balance-value {
      font-size: 32px;
      font-weight: 700;
      font-family: ${v('fontMono', theme)};
      letter-spacing: -0.02em;
    }
    .balance-unit {
      font-size: 15px;
      color: ${v('colorTextMuted', theme)};
      font-weight: 500;
    }
    .balance-skeleton {
      width: 140px;
      height: 32px;
      border-radius: 6px;
      background: linear-gradient(90deg, ${v('colorSurfaceHover', theme)} 25%, ${v('colorBorder', theme)} 50%, ${v('colorSurfaceHover', theme)} 75%);
      background-size: 200% 100%;
      animation: skeleton-shimmer 1.5s ease-in-out infinite;
    }
    @keyframes skeleton-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    /* Transaction history */
    .tx-history {
      display: flex;
      flex-direction: column;
    }
    .tx-header {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: ${v('colorTextMuted', theme)};
      padding: 4px 0 8px;
    }
    .tx-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 8px;
      text-decoration: none;
      color: inherit;
      border-bottom: 1px solid ${v('colorBorder', theme)};
      transition: background 0.15s ease;
    }
    .tx-row:last-child { border-bottom: none; }
    .tx-row:hover { background: ${v('colorSurfaceHover', theme)}; }
    .tx-icon {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .tx-success {
      background: rgba(110, 231, 183, 0.15);
      color: ${v('colorAccent', theme)};
    }
    .tx-failed {
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
    }
    .tx-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .tx-type {
      font-size: 13px;
      font-weight: 500;
      text-transform: capitalize;
    }
    .tx-date {
      font-size: 11px;
      color: ${v('colorTextMuted', theme)};
      margin-top: 2px;
    }
    .tx-amount {
      font-size: 13px;
      font-family: ${v('fontMono', theme)};
      font-weight: 500;
    }
    .tx-in { color: ${v('colorAccent', theme)}; }
    .tx-out { color: ${v('colorText', theme)}; }
    .tx-external {
      display: flex;
      opacity: 0;
      transition: opacity 0.15s ease;
    }
    .tx-row:hover .tx-external { opacity: 0.5; }
    .tx-external svg { width: 14px; height: 14px; color: ${v('colorTextMuted', theme)}; }
    .tx-empty {
      padding: 24px 8px;
      text-align: center;
      font-size: 13px;
      color: ${v('colorTextMuted', theme)};
    }
    .btn {
      all: unset;
      box-sizing: border-box;
      font-family: ${v('fontDisplay', theme)};
      font-size: 13px;
      font-weight: 500;
      padding: 9px 14px;
      border-radius: ${v('radiusSm', theme)};
      text-align: center;
      cursor: pointer;
      border: 1px solid ${v('colorBorder', theme)};
    }
    .btn:hover { background: ${v('colorSurfaceHover', theme)}; }
    .btn:focus-visible { outline: 2px solid ${v('colorAccent', theme)}; outline-offset: 1px; }
    .btn-primary {
      background: ${v('colorAccent', theme)};
      color: ${v('colorAccentText', theme)};
      border-color: transparent;
      width: 100%;
    }
    .btn-primary:hover { filter: brightness(0.96); }

    /* ---------- error state ---------- */
    .error-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 10px;
      padding: 28px 20px;
    }
    .error-state svg { width: 28px; height: 28px; color: ${v('colorDanger', theme)}; }
    .error-title { font-size: 14px; font-weight: 600; }
    .error-message { font-size: 13px; color: ${v('colorTextMuted', theme)}; line-height: 1.5; }

    /* ---------- transaction preview (Reown-inspired redesign) ---------- */
    .preview {
      display: flex;
      flex-direction: column;
      gap: 0;
      padding: 8px 18px 20px;
      text-align: center;
    }

    /* Staggered entrance animation — each direct child fades in + slides up */
    .preview > * {
      opacity: 0;
      animation: sak-preview-enter 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    .preview > *:nth-child(1) { animation-delay: 0ms; }
    .preview > *:nth-child(2) { animation-delay: 60ms; }
    .preview > *:nth-child(3) { animation-delay: 120ms; }
    .preview > *:nth-child(4) { animation-delay: 180ms; }
    .preview > *:nth-child(5) { animation-delay: 240ms; }
    .preview > *:nth-child(6) { animation-delay: 300ms; }
    .preview > *:nth-child(7) { animation-delay: 360ms; }
    @keyframes sak-preview-enter {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @media (prefers-reduced-motion: reduce) {
      .preview > * { animation: none; opacity: 1; }
    }

    /* Thumbnails — app logo + wallet logo side by side with a connector line */
    .preview-thumbs {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0;
      padding: 20px 0 16px;
    }
    .preview-thumb {
      width: 56px;
      height: 56px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      flex-shrink: 0;
      position: relative;
    }
    .preview-thumb--app {
      background: ${v('colorSurface', theme)};
      border: 1px solid ${v('colorBorder', theme)};
    }
    .preview-thumb--wallet {
      background: ${v('colorSurface', theme)};
      border: 1px solid ${v('colorBorder', theme)};
    }
    .preview-thumb__img {
      width: 36px;
      height: 36px;
      object-fit: contain;
      border-radius: 8px;
    }
    .preview-thumb__letter {
      font-size: 20px;
      font-weight: 700;
      color: ${v('colorAccent', theme)};
    }
    /* Connector line between the two thumbnails */
    .preview-thumb__connector {
      width: 24px;
      height: 2px;
      background: ${v('colorBorder', theme)};
      flex-shrink: 0;
    }

    /* Title + subtitle */
    .preview-title {
      font-size: 17px;
      font-weight: 600;
      letter-spacing: -0.015em;
      color: ${v('colorText', theme)};
      margin: 0 0 6px;
      line-height: 1.3;
    }
    .preview-subtitle {
      font-size: 13.5px;
      line-height: 1.5;
      color: ${v('colorTextMuted', theme)};
      margin: 0 0 16px;
      max-width: 300px;
      margin-left: auto;
      margin-right: auto;
    }

    /* Operations list */
    .preview-ops {
      display: flex;
      flex-direction: column;
      gap: 6px;
      text-align: left;
      margin-bottom: 8px;
    }
    .preview-op {
      padding: 10px 12px;
      border-radius: ${v('radiusMd', theme)};
      background: ${v('colorBg', theme)};
      border: 1px solid ${v('colorBorder', theme)};
    }
    .preview-op-summary { font-size: 13px; line-height: 1.5; color: ${v('colorText', theme)}; }

    /* Meta: source account + fee */
    .preview-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: ${v('fontMono', theme)};
      font-size: 11.5px;
      color: ${v('colorTextMuted', theme)};
      padding: 8px 2px 0;
      gap: 8px;
      border-top: 1px solid ${v('colorBorder', theme)};
      margin-top: 8px;
    }
    .preview-meta-item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .preview-meta-item .icon-btn {
      padding: 2px;
      opacity: 0.6;
    }
    .preview-meta-item .icon-btn:hover {
      opacity: 1;
    }
    .preview-fee {
      font-weight: 500;
      color: ${v('colorText', theme)};
    }

    /* Actions: Cancel + Sign/Approve — full-width side by side */
    .preview-actions {
      display: flex;
      gap: 8px;
      margin-top: 16px;
    }
    .preview-btn {
      flex: 1;
      padding: 12px 16px;
      border-radius: ${v('radiusSm', theme)};
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid ${v('colorBorder', theme)};
      transition: background-color 200ms ease, border-color 200ms ease, transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .preview-btn:active {
      transform: scale(0.97);
    }
    .preview-btn--cancel {
      background: transparent;
      color: ${v('colorText', theme)};
    }
    .preview-btn--cancel:hover {
      background: ${v('colorSurfaceHover', theme)};
      border-color: ${v('colorTextMuted', theme)};
    }
    .preview-btn--approve {
      background: ${v('colorAccent', theme)};
      border-color: ${v('colorAccent', theme)};
      color: ${v('colorBg', theme)};
    }
    .preview-btn--approve:hover {
      opacity: 0.9;
    }

    /* contract verification badges — positive trust signals (Verified,
     * Audited, Published by X) surfaced from previewOptions.contractMetadata */
    .contract-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 6px;
    }
    .contract-badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 500;
      line-height: 1.4;
      border: 1px solid;
      cursor: default;
    }
    .contract-badge[data-url] { cursor: pointer; }
    .contract-badge[data-url]:hover { opacity: 0.8; }
    .badge-success {
      color: #16a34a;
      background: rgba(22, 163, 74, 0.1);
      border-color: rgba(22, 163, 74, 0.3);
    }
    .badge-info {
      color: ${v('colorTextMuted', theme)};
      background: ${v('colorSurfaceHover', theme)};
      border-color: ${v('colorBorder', theme)};
    }
    .badge-warning {
      color: #d97706;
      background: rgba(217, 119, 6, 0.1);
      border-color: rgba(217, 119, 6, 0.3);
    }
    .badge-danger {
      color: #dc2626;
      background: rgba(220, 38, 38, 0.1);
      border-color: rgba(220, 38, 38, 0.3);
    }

    .risk-flag {
      margin-top: 8px;
      padding: 8px 10px;
      border-radius: ${v('radiusSm', theme)};
      font-size: 12px;
      line-height: 1.5;
      border: 1px solid;
    }
    .risk-info {
      color: ${v('colorTextMuted', theme)};
      background: ${v('colorSurfaceHover', theme)};
      border-color: ${v('colorBorder', theme)};
    }
    .risk-warning {
      color: #B8860B;
      background: rgba(184, 134, 11, 0.1);
      border-color: rgba(184, 134, 11, 0.3);
    }
    .risk-danger {
      color: ${v('colorDanger', theme)};
      background: rgba(240, 153, 123, 0.12);
      border-color: rgba(240, 153, 123, 0.35);
    }

    /* ---------- footer ---------- */
    .footer {
      padding: 10px 16px;
      border-top: 1px solid ${v('colorBorder', theme)};
      font-size: 11px;
      color: ${v('colorTextMuted', theme)};
      text-align: center;
      flex-shrink: 0;
    }
    :host([data-branding="hide"]) .footer { display: none; }

    .sr-only {
      position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
    }
  `;
}
