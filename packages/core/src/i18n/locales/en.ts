/**
 * English locale — the default, bundled locale for Stellar AppKit.
 *
 * This file is always statically imported (never lazy-loaded) so the modal
 * works immediately on first render without a flash of untranslated text.
 *
 * All other locales are lazy-loaded via dynamic import() on first call to
 * setLocale() — see loader.ts.
 *
 * STRING CONVENTIONS:
 * - Use ICU MessageFormat syntax for interpolation: {variableName}
 * - Use ICU plural syntax where applicable: {count, plural, one {...} other {...}}
 * - Keep strings concise — they're rendered in a modal with limited space
 * - Use ellipsis (…) for loading states, not three dots (...)
 * - Use sentence case for labels (first word capitalized, rest lowercase)
 *
 * DO NOT translate:
 * - Object keys (only values are translated)
 * - Variable names inside {braces}
 * - HTML tags like <strong> (they're rendered via innerHTML)
 * - Technical identifiers (XLM, URI, QR, etc.)
 */

export const en = {
  /** Footer + branding */
  footer: {
    powered_by: 'Powered by {brand}',
    brand_name: 'Stellar AppKit',
  },

  /** ARIA labels + title attributes — for screen readers + tooltips */
  aria: {
    close_dialog: 'Close',
    back: 'Back',
    copy_address: 'Copy address',
    click_to_copy: 'Click to copy address',
    more_options: 'More options',
    view_on_explorer: 'View on explorer',
  },

  /** Panel titles — shown in the modal header */
  title: {
    account: 'Account',
    choose_account: 'Choose an account',
    wrong_network: 'Wrong network',
    review_transaction: 'Review transaction',
    signing: 'Signing',
    connect_wallet: 'Connect a wallet',
  },

  /** Wallet list view — the initial wallet picker */
  wallet_list: {
    loading: 'Loading wallets…',
    empty: 'No wallets registered. Pass connectors into the StellarAppKit config.',
    not_installed: 'Not installed',
    install: 'Install',
    status: {
      connecting: 'Connecting…',
      locked: 'Locked',
      unavailable: 'Unavailable',
      installed: 'Installed',
      // Shown for WalletConnect — it's never "installed" in the browser-extension
      // sense; the user scans a QR code with a mobile wallet to pair.
      scan_qr: 'Scan QR Code',
    },
  },

  /** Connecting view — shown while waiting for the wallet to approve */
  connecting: {
    continue_in_wallet: 'Continue in {walletName}',
    accept_request: 'Accept connection request in the wallet',
    error_subtitle: 'Connection declined or failed. Try again or pick a different wallet.',
  },

  /** WalletConnect QR pairing view */
  wc: {
    scan_with: 'Scan with {walletName}',
    scan_instructions: 'Open Hana, Lobstr, or Hot Wallet and scan this QR code to connect.',
    open_in_wallet: 'Open in wallet app',
    open_failed: 'Couldn\'t open {walletName}. If it isn\'t installed, get the app below.',
    copy_uri: 'Copy URI',
    copied: 'Copied!',
    generating_code: 'Generating QR Code…',
    qr_failed: 'QR generation failed. Use the copy button below.',
  },

  /** Action buttons — reused across views */
  action: {
    try_again: 'Try again',
    cancel: 'Cancel',
    sign: 'Sign',
    approve: 'Approve',
    switch_wallet: 'Switch Wallet',
    disconnect: 'Disconnect',
    connect_wallet: 'Connect wallet',
  },

  /** Wallet name fallbacks */
  wallet: {
    fallback_name: 'Wallet',
    fallback_your_wallet: 'your wallet',
  },

  /** Account picker */
  account: {
    default_label: 'Account',
  },

  /** Connected view — balance, history, account info */
  connected: {
    pending_signatures: '{count, plural, one {# pending signature} other {# pending signatures}}',
    balance_label: 'XLM Balance',
    balance_unit: 'XLM',
    recent_activity: 'Recent Activity',
    no_transactions: 'No recent transactions',
    // "Get Testnet funds" button — only rendered when session.network === 'TESTNET'.
    // Opens the friendbot faucet (friendbot.stellar.org) with the connected address
    // and refreshes the balance after a short delay.
    get_testnet_funds: 'Get Testnet funds',
    // Banner shown for ~3s after the user clicks the button, confirming the
    // funding request was sent (friendbot typically credits within a few seconds).
    funds_requested: 'Funding requested — balance will update shortly',
  },

  /** Transaction history item defaults */
  tx: {
    default_type: 'Transaction',
    default_asset: 'XLM',
    unknown_asset: 'UNKNOWN',
    no_amount: '—',
  },

  /** Transaction preview view — shown before signing */
  preview: {
    title: {
      sign_message: 'Sign message',
      review_transaction: 'Review transaction',
    },
    subtitle: {
      sign_message: 'Sign this message to prove you own {walletName}. Canceling will dismiss the request.',
      review_transaction: 'Review the transaction details below. Approve to continue signing in {walletName}.',
    },
    from_account: 'From {address}',
    default_app_name: 'App',
  },

  /** Signing view — while the wallet processes the sign request */
  signing: {
    continue_in_wallet: 'Continue in {walletName}',
    subtitle: 'Approve the request in your wallet to continue',
    error_title: 'Signing rejected',
  },

  /** Sign-In With Stellar (SIWS) flow */
  siws: {
    title: 'Sign-In With Stellar',
    phase: {
      checking_session: 'Checking session…',
      fetching_nonce: 'Fetching secure nonce…',
      approve_in_wallet: 'Approve the sign-in request in {walletName}',
      verifying: 'Verifying your signature…',
    },
    error_title: 'Sign-in failed',
    error_default: 'Sign-in failed.',
    connect_wallet: 'Connect wallet',
    error_generic: 'Sign-in failed. Please try again.',
    error_too_many_attempts: 'Too many failed attempts ({maxRetries}). Please try again later.',
    error_verification_failed: 'Sign-in verification failed.',
    error_address_mismatch: 'Session address does not match connected wallet',
    error_network_mismatch: 'Session network does not match connected wallet',
    error_session_expired: 'Session has expired',
  },

  /** Network mismatch view — when wallet is on the wrong network */
  network_mismatch: {
    title: 'Wrong network',
    detail: 'This wallet is on {actualNetwork}, this app needs {expectedNetwork}.',
    detail_fallback: 'This wallet is on the wrong network.',
    action_hint: 'Switch networks in your wallet, then try again.',
  },

  /** Generic error view */
  error: {
    title: 'Something went wrong',
    default_message: 'Unknown error.',
    request_timed_out: 'Request timed out. Please try again.',
  },
} as const;

/**
 * The TypeScript type of the locale — used by all other locales for type safety.
 *
 * We widen the literal string types from `as const` to plain `string` so that
 * translated locale files can assign their own string values without TypeScript
 * complaining that e.g. `"正在加载钱包…"` isn't assignable to `"Loading wallets…"`.
 *
 * The type still enforces the SHAPE (keys, nesting structure) — a missing or
 * extra key in any locale file will be a compile-time error.
 */
type DeepWiden<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends readonly (infer U)[]
      ? U[]
      : T[K] extends object
        ? DeepWiden<T[K]>
        : T[K];
};

export type LocaleMessages = DeepWiden<typeof en>;
