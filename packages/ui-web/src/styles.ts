import type { ConnectTheme } from './tokens.js';
import { CSS_VAR_NAMES } from './tokens.js';

function v(token: keyof ConnectTheme, theme: ConnectTheme): string {
  return `var(${CSS_VAR_NAMES[token]}, ${theme[token]})`;
}

/**
 * Builds the full stylesheet for the shadow root. Every value routes
 * through `var(--sak-*, <theme-default>)` rather than setting the vars on
 * `:host` — that's what lets a host page override any token with a plain
 * `saganta-appkit-modal { --sak-color-accent: ...; }` rule without fighting
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
      display: flex;
      z-index: 2147483000;
      opacity: 0;
      transition: opacity 180ms ease;
    }
    .overlay[data-open="true"] { opacity: 1; }
    @media (prefers-reduced-motion: reduce) {
      .overlay { transition: none; }
    }

    /* ---------- layout: modal (desktop) ---------- */
    .overlay[data-mode="modal"] { align-items: center; justify-content: center; padding: 24px; }
    .overlay[data-mode="modal"] .panel {
      width: 100%;
      max-width: 380px;
      border-radius: ${v('radiusLg', theme)};
      transform: scale(0.96);
      opacity: 0;
      transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1), opacity 180ms ease;
    }
    .overlay[data-mode="modal"][data-open="true"] .panel { transform: scale(1); opacity: 1; }

    /* ---------- layout: bottom-sheet (mobile web + always on RN) ---------- */
    .overlay[data-mode="bottom-sheet"] { align-items: flex-end; justify-content: center; padding: 0; }
    .overlay[data-mode="bottom-sheet"] .panel {
      width: 100%;
      max-width: 560px;
      border-radius: ${v('radiusLg', theme)} ${v('radiusLg', theme)} 0 0;
      padding-bottom: env(safe-area-inset-bottom, 0px);
      transform: translateY(100%);
      transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    .overlay[data-mode="bottom-sheet"][data-open="true"] .panel { transform: translateY(0); }
    .drag-handle {
      width: 36px;
      height: 4px;
      border-radius: 4px;
      background: ${v('colorBorder', theme)};
      margin: 10px auto 2px;
    }
    .overlay[data-mode="modal"] .drag-handle { display: none; }

    @media (prefers-reduced-motion: reduce) {
      .overlay[data-mode="modal"] .panel,
      .overlay[data-mode="bottom-sheet"] .panel { transition: none; }
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
    }
    .icon-btn:hover { background: ${v('colorSurfaceHover', theme)}; color: ${v('colorText', theme)}; }
    .icon-btn:focus-visible { outline: 2px solid ${v('colorAccent', theme)}; outline-offset: 1px; }
    .icon-btn svg { width: 16px; height: 16px; }

    .body { padding: 4px 10px 12px; overflow-y: auto; }

    /* ---------- wallet list ---------- */
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
    }
    .wallet-row:hover { background: ${v('colorSurfaceHover', theme)}; }
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
    }
    .wallet-tile img { width: 22px; height: 22px; object-fit: contain; }
    .wallet-name { font-size: 14px; font-weight: 500; flex: 1; text-align: left; }
    .wallet-sub { font-size: 12px; color: ${v('colorTextMuted', theme)}; }

    /* connecting state: a hairline arc traces the selected wallet's tile outline, not a generic spinner */
    .wallet-tile.connecting::after {
      content: "";
      position: absolute;
      inset: -1px;
      border-radius: 11px;
      border: 1.5px solid transparent;
      border-top-color: ${v('colorAccent', theme)};
      border-right-color: ${v('colorAccent', theme)};
      animation: sc-spin 0.8s linear infinite;
    }
    @media (prefers-reduced-motion: reduce) {
      .wallet-tile.connecting::after { animation-duration: 1.6s; }
    }
    @keyframes sc-spin { to { transform: rotate(360deg); } }

    /* ---------- connected state ---------- */
    .account {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 6px 10px 14px;
    }
    .account-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border-radius: ${v('radiusMd', theme)};
      background: ${v('colorBg', theme)};
      border: 1px solid ${v('colorBorder', theme)};
    }
    .account-avatar {
      width: 36px; height: 36px; border-radius: 50%;
      background: ${v('colorAccent', theme)};
      flex-shrink: 0;
    }
    .account-address {
      font-family: ${v('fontMono', theme)};
      font-size: 13px;
      letter-spacing: -0.01em;
    }
    .account-network {
      font-size: 12px;
      color: ${v('colorTextMuted', theme)};
      margin-top: 2px;
    }
    .account-actions { display: flex; gap: 8px; margin-left: auto; }
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

    /* ---------- transaction preview ---------- */
    .preview { display: flex; flex-direction: column; gap: 12px; padding: 6px 10px 14px; }
    .preview-meta {
      display: flex;
      justify-content: space-between;
      font-family: ${v('fontMono', theme)};
      font-size: 12px;
      color: ${v('colorTextMuted', theme)};
      padding: 0 2px;
    }
    .preview-ops { display: flex; flex-direction: column; gap: 8px; }
    .preview-op {
      padding: 10px 12px;
      border-radius: ${v('radiusMd', theme)};
      background: ${v('colorBg', theme)};
      border: 1px solid ${v('colorBorder', theme)};
    }
    .preview-op-summary { font-size: 13.5px; line-height: 1.5; }
    .preview-op-index { color: ${v('colorTextMuted', theme)}; font-family: ${v('fontMono', theme)}; }
    .preview-actions { display: flex; gap: 8px; margin-top: 4px; }
    .preview-actions .btn { flex: 1; }

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
