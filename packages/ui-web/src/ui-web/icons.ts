import { freighterIconDataUri, xbullIconDataUri, hanaIconDataUri } from './wallet-icon-data.js';

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
 * Wallet icon data URIs. Uses the actual brand artwork (provided by the
 * user) for wallets where we have it, and stylized inline SVGs for the rest.
 *
 * The `meta.icon` field on each connector points to the wallet's official
 * icon URL — the modal tries that first (higher fidelity) and falls back
 * to these bundled data URIs via the `<img onerror>` handler.
 *
 * WalletConnect and Ledger icons are pre-encoded base64 (official brand
 * SVGs) so they load instantly with no network request. The Buffer.from
 * approach is avoided for these to keep them browser-safe (Buffer is a
 * Node.js global not available in all browser environments).
 */
export const walletIcons: Record<string, string> = {
  // Actual brand artwork (provided by the user)
  freighter: freighterIconDataUri,
  xbull: xbullIconDataUri,
  hana: hanaIconDataUri,

  // Official brand SVGs (pre-encoded base64 for browser safety)
  walletconnect: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAyNCIgaGVpZ2h0PSIxMDI0IiB2aWV3Qm94PSIwIDAgMTAyNCAxMDI0IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPgo8cmVjdCB3aWR0aD0iMTAyNCIgaGVpZ2h0PSIxMDI0IiBmaWxsPSIjMzM5NkZGIi8+CjxwYXRoIGQ9Ik0yODIuMjk4IDM2Ny4zOTRDNDA5Ljk4NiAyNDIuODY5IDYxNy4wMTUgMjQyLjg2OSA3NDQuNzAzIDM2Ny4zOTRMNzYwLjA3MSAzODIuMzhDNzY2LjQ1NiAzODguNjA1IDc2Ni40NTYgMzk4LjcwMSA3NjAuMDcxIDQwNC45MjZMNzA3LjUwMiA0NTYuMTkzQzcwNC4zMDkgNDU5LjMwNiA2OTkuMTM0IDQ1OS4zMDYgNjk1Ljk0MiA0NTYuMTkzTDY3NC43OTQgNDM1LjU3QzU4NS43MTMgMzQ4LjY5OCA0NDEuMjg4IDM0OC42OTggMzUyLjIwNyA0MzUuNTdMMzI5LjU1OCA0NTcuNjU1QzMyNi4zNjUgNDYwLjc2OCAzMjEuMTkxIDQ2MC43NjggMzE3Ljk5OCA0NTcuNjU1TDI2NS40MjkgNDA2LjM4OEMyNTkuMDQzIDQwMC4xNjMgMjU5LjA0MyAzOTAuMDY4IDI2NS40MjkgMzgzLjg0M0wyODIuMjk4IDM2Ny4zOTRaTTg1My40MjUgNDczLjQxOEw5MDAuMjExIDUxOS4wNDVDOTA2LjU5NiA1MjUuMjcgOTA2LjU5NiA1MzUuMzY1IDkwMC4yMTEgNTQxLjU5TDY4OS4yNDIgNzQ3LjMyOUM2ODIuODYgNzUzLjU1NyA2NzIuNTA4IDc1My41NTcgNjY2LjEyMyA3NDcuMzI5TDUxNi4zOTIgNjAxLjMxMkM1MTQuNzk1IDU5OS43NTQgNTEyLjIwOCA1OTkuNzU0IDUxMC42MTIgNjAxLjMxMkwzNjAuODgxIDc0Ny4zMjlDMzU0LjQ5OCA3NTMuNTU3IDM0NC4xNDcgNzUzLjU1NyAzMzcuNzYxIDc0Ny4zMjlMMTI2Ljc4OCA1NDEuNTg3QzEyMC40MDQgNTM1LjM2MiAxMjAuNDA0IDUyNS4yNjcgMTI2Ljc4OCA1MTkuMDQyTDE3My41NzYgNDczLjQxNUMxNzkuOTYgNDY3LjE5IDE5MC4zMTIgNDY3LjE5IDE5Ni42OTYgNDczLjQxNUwzNDYuNDMgNjE5LjQzNUMzNDguMDI2IDYyMC45OTIgMzUwLjYxMyA2MjAuOTkyIDM1Mi4yMSA2MTkuNDM1TDUwMS45MzcgNDczLjQxNUM1MDguMzIgNDY3LjE4NyA1MTguNjcyIDQ2Ny4xODcgNTI1LjA1NyA0NzMuNDE1TDY3NC43OTEgNjE5LjQzNUM2NzYuMzg3IDYyMC45OTIgNjc4Ljk3NSA2MjAuOTkyIDY4MC41NzEgNjE5LjQzNUw4MzAuMzA1IDQ3My40MThDODM2LjY4NyA0NjcuMTkgODQ3LjAzOSA0NjcuMTkgODUzLjQyNSA0NzMuNDE4WiIgZmlsbD0id2hpdGUiLz4KPC9zdmc+Cg==',

  ledger: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjggMTI4IiB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCI+PHJlY3Qgd2lkdGg9IjEyOCIgaGVpZ2h0PSIxMjgiIGZpbGw9IiNmZmZmZmYiLz48dGV4dCB4PSI2NCIgeT0iNjQiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGRvbWluYW50LWJhc2VsaW5lPSJjZW50cmFsIiBmb250LWZhbWlseT0iSW50ZXIsICdIZWx2ZXRpY2EgTmV1ZScsIEhlbHZldGljYSwgQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iODQiIGZvbnQtd2VpZ2h0PSI3MDAiIGZpbGw9IiMwMDAwMDAiPkw8L3RleHQ+PC9zdmc+',

  // Albedo — stylized "A" logo on sea blue background
  albedo: `data:image/svg+xml;base64,${Buffer.from(`<svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg"><rect width="128" height="128" rx="28" fill="#0066B2"/><path d="M64 26L96 98H82L75 80H53L46 98H32L64 26ZM58 68H70L64 52L58 68Z" fill="#fff"/></svg>`).toString('base64')}`,

  // Rabet — purple gradient with stylized "R" mark
  rabet: `data:image/svg+xml;base64,${Buffer.from(
    `<svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="rabet-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#7B2FBE"/>
          <stop offset="100%" stop-color="#4A1E73"/>
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="28" fill="url(#rabet-grad)"/>
      <text x="64" y="86" font-family="Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="64" font-weight="bold" fill="#fff" text-anchor="middle">R</text>
    </svg>`
  ).toString('base64')}`,

  // Klever — blue gradient with stylized "K" mark
  klever: `data:image/svg+xml;base64,${Buffer.from(
    `<svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="klever-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0066FF"/>
          <stop offset="100%" stop-color="#0044CC"/>
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="28" fill="url(#klever-grad)"/>
      <text x="64" y="88" font-family="Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="56" font-weight="bold" fill="#fff" text-anchor="middle">K</text>
    </svg>`
  ).toString('base64')}`,

  // HOT Wallet — orange/red gradient
  'hot-wallet': `data:image/svg+xml;base64,${Buffer.from(
    `<svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="hot-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#FF6B35"/>
          <stop offset="100%" stop-color="#E84118"/>
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="28" fill="url(#hot-grad)"/>
      <text x="64" y="90" font-family="Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="48" font-weight="bold" fill="#fff" text-anchor="middle">HOT</text>
    </svg>`
  ).toString('base64')}`,

  // Trezor — dark hardware wallet device icon
  trezor: `data:image/svg+xml;base64,${Buffer.from(
    `<svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
      <rect width="128" height="128" rx="28" fill="#1A1A1A"/>
      <rect x="30" y="20" width="68" height="88" rx="8" fill="none" stroke="#fff" stroke-width="4"/>
      <rect x="42" y="36" width="44" height="44" rx="4" fill="none" stroke="#fff" stroke-width="3"/>
      <circle cx="64" cy="58" r="6" fill="#fff"/>
      <rect x="56" y="70" width="16" height="4" rx="2" fill="#fff"/>
    </svg>`
  ).toString('base64')}`,
};

/**
 * Returns the bundled icon data-URI for a wallet ID, or undefined if no
 * bundled icon is available (in which case the caller falls back to
 * the generic wallet icon).
 */
export function getWalletIconDataUri(walletId: string): string | undefined {
  return walletIcons[walletId];
}
