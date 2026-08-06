/** Small hand-drawn SVG icons. Kept as raw strings (not a webfont) so the package has zero external asset dependencies. */

export const icons = {
  close: `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 5L15 15M15 5L5 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,

  chevronLeft: `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 15L7 10L12 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  copy: `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="7" y="7" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M13 7V5.5C13 4.67157 12.3284 4 11.5 4H5.5C4.67157 4 4 4.67157 4 5.5V11.5C4 12.3284 4.67157 13 5.5 13H7" stroke="currentColor" stroke-width="1.5"/></svg>`,

  check: `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 10.5L8 14.5L16 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  externalLink: `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 5H15V12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 5L6 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,

  wallet: `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="6" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M3 8.5H17" stroke="currentColor" stroke-width="1.5"/><circle cx="13.5" cy="12" r="1" fill="currentColor"/></svg>`,

  alertCircle: `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M10 6.5V10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="10" cy="13.2" r="0.9" fill="currentColor"/></svg>`,

  logOut: `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 4H5.5C4.67157 4 4 4.67157 4 5.5V14.5C4 15.3284 4.67157 16 5.5 16H8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M13 13.5L16.5 10L13 6.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 10H8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
} as const;

/** Generic fallback tile shown when a wallet's own icon URL fails to load. */
export const genericWalletIcon = icons.wallet;

/**
 * Inline SVG data-URI icons for each supported wallet. These are bundled
 * in the package so the modal always has an icon to show, even when the
 * wallet's external icon URL is unreachable (CDN down, CORS, offline).
 *
 * The `meta.icon` field on each connector still points to the wallet's
 * official icon URL (higher fidelity) — the modal tries that first and
 * falls back to these inline SVGs via the `<img onerror>` handler.
 *
 * Each icon is a self-contained SVG string (no external references) that
 * can be used directly as an `<img src>` or inlined as innerHTML.
 */
export const walletIcons: Record<string, string> = {
  freighter: `<svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg"><rect width="128" height="128" rx="28" fill="#7B2FF7"/><path d="M38 42h52a8 8 0 018 8v8H30v-8a8 8 0 018-8z" fill="#fff" opacity="0.9"/><path d="M30 58h68v8a4 4 0 01-4 4H34a4 4 0 01-4-4v-8z" fill="#fff" opacity="0.7"/><path d="M42 70h44a6 6 0 016 6v18a6 6 0 01-6 6H42a6 6 0 01-6-6V76a6 6 0 016-6z" fill="#fff"/><circle cx="50" cy="84" r="4" fill="#7B2FF7"/><circle cx="64" cy="84" r="4" fill="#7B2FF7"/><circle cx="78" cy="84" r="4" fill="#7B2FF7"/></svg>`,

  albedo: `<svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="al" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#FFB800"/><stop offset="100%" stop-color="#FF6B00"/></linearGradient></defs><rect width="128" height="128" rx="28" fill="url(#al)"/><path d="M64 28L78 56L106 64L78 72L64 100L50 72L22 64L50 56Z" fill="#fff" opacity="0.95"/><circle cx="64" cy="64" r="8" fill="#FF6B00"/></svg>`,

  xbull: `<svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg"><rect width="128" height="128" rx="28" fill="#0F4C81"/><path d="M38 44C38 40 40 38 44 38h12c4 0 6 2 6 6v8l8-6 8 6v-8c0-4 2-6 6-6h12c4 0 6 2 6 6v36c0 4-2 6-6 6h-12c-4 0-6-2-6-6v-8l-8 6-8-6v8c0 4-2 6-6 6H44c-4 0-6-2-6-6V44z" fill="#fff"/><circle cx="50" cy="52" r="3" fill="#0F4C81"/><circle cx="78" cy="52" r="3" fill="#0F4C81"/><path d="M54 70c4 4 16 4 20 0" stroke="#0F4C81" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg>`,

  ledger: `<svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg"><rect width="128" height="128" rx="28" fill="#000"/><rect x="42" y="30" width="18" height="58" rx="3" fill="#fff"/><rect x="42" y="92" width="18" height="6" rx="2" fill="#fff" opacity="0.6"/><path d="M60 30h26c4 0 6 2 6 6v52c0 4-2 6-6 6H60V30z" fill="#fff" opacity="0.85"/><circle cx="72" cy="52" r="4" fill="#000"/><circle cx="72" cy="68" r="3" fill="#000" opacity="0.5"/></svg>`,

  walletconnect: `<svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg"><rect width="128" height="128" rx="28" fill="#3B99FC"/><path d="M40 48c13-12.5 34-12.5 47 0l1.5 1.5c0.8 0.8 0.8 2 0 2.8L84 56.5c-0.8 0.8-2 0.8-2.8 0l-2-2c-9-8.5-23.5-8.5-32.5 0l-2 2c-0.8 0.8-2 0.8-2.8 0L38.5 52.3c-0.8-0.8-0.8-2 0-2.8L40 48z" fill="#fff"/><path d="M50 58c7.5-7 19.5-7 27 0l1.5 1.5c0.8 0.8 0.8 2 0 2.8L75.5 65c-0.8 0.8-2 0.8-2.8 0l-2-2c-4.5-4-11.5-4-16 0l-2 2c-0.8 0.8-2 0.8-2.8 0L48.5 62.3c-0.8-0.8-0.8-2 0-2.8L50 58z" fill="#fff" opacity="0.9"/><path d="M60 68c2-2 5-2 7 0l2 2c0.8 0.8 0.8 2 0 2.8l-4 4c-0.8 0.8-2 0.8-2.8 0l-4-4c-0.8-0.8-0.8-2 0-2.8L60 68z" fill="#fff"/></svg>`,
};

/**
 * Returns the inline SVG data-URI for a wallet ID, or undefined if no
 * bundled icon is available (in which case the caller falls back to
 * the generic wallet icon).
 */
export function getWalletIconDataUri(walletId: string): string | undefined {
  const svg = walletIcons[walletId];
  if (!svg) return undefined;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}
