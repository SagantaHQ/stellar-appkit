/**
 * Mobile wallet deep-link registry for Stellar AppKit on React Native.
 *
 * This is the React Native answer to Solana Mobile's Wallet Adapter picker:
 * when the user taps a wallet in the pairing view, we embed the WalletConnect
 * pairing URI (`wc:...@2?relay-protocol=irn&symKey=...`) into the wallet's
 * own deep link and hand off to the OS. The wallet opens with the pairing
 * pre-loaded, the user approves, and the session completes over the
 * WalletConnect relay — no QR scan, no typing.
 *
 * Deep-link format (confirmed from stellar/freighter-mobile's own
 * mock-dapp and docs/best-practices/navigation.md):
 *
 *     <scheme>://wc?uri=<encodeURIComponent(wc:...)>
 *
 * e.g. `freighterwallet://wc?uri=wc%3Aabc123%402%3Frelay-protocol%3Dirn...`
 *
 * Every registered wallet may also be re-opened for later sign requests by
 * launching its bare scheme (the WalletConnect "sign request flow" — the
 * dApp sends the user back to the wallet they paired with).
 */

/** A Stellar mobile wallet that can be opened via deep link. */
export interface MobileWalletDeepLink {
  /** Unique id — namespaced to avoid colliding with core connector ids. */
  id: string;
  /** Display name shown in the pairing view. */
  name: string;
  /** Wallet icon (data URI or https URL). */
  icon: string;
  /** The wallet's registered URL scheme, e.g. `freighterwallet`. */
  scheme: string;
  /** Store links, used when the wallet isn't installed. */
  installUrl: { ios: string; android: string };
  /**
   * Builds the WalletConnect pairing deep link for this wallet.
   * The default works for wallets following the `scheme://wc?uri=` convention.
   */
  buildWalletConnectUri?: (wcUri: string) => string;
}

function defaultBuildWalletConnectUri(scheme: string): (wcUri: string) => string {
  return (wcUri: string) => `${scheme}://wc?uri=${encodeURIComponent(wcUri)}`;
}

/**
 * The built-in registry. v1 ships Freighter Mobile — the only Stellar wallet
 * with a publicly documented WalletConnect deep-link format today
 * (see github.com/stellar/freighter-mobile, mock-dapp/src/routes.ts).
 *
 * LOBSTR supports WalletConnect 2.0 via QR scan; add it (or any wallet) with
 * `registerMobileWallet()` once its deep-link format is confirmed.
 */
const FREIGHTER_MOBILE_ICON =
  'data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMTI4IDEyOCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgcng9IjI4IGZpbGw9IiMwZDllYTUiLz48cGF0aCBkPSJNMzQgMzZoNjB2MTBIMzR6IiBmaWxsPSIjZmZmIi8+PHBhdGggZD0iTTM0IDU0aDYwdjEwSDM0eiIgZmlsbD0iI2ZmZiIvPjxwYXRoIGQ9Ik0zNCA3Mmg2MHYxMEgzNHoiIGZpbGw9IiNmZmYiLz48L3N2Zz4=';

const registry = new Map<string, MobileWalletDeepLink>();

function register(wallet: MobileWalletDeepLink): void {
  registry.set(wallet.id, wallet);
}

// --- Built-in wallets -------------------------------------------------------

register({
  id: 'freighter-mobile',
  name: 'Freighter',
  icon: FREIGHTER_MOBILE_ICON,
  scheme: 'freighterwallet',
  installUrl: {
    ios: 'https://apps.apple.com/app/freighter/id6743947720',
    android: 'https://play.google.com/store/apps/details?id=org.stellar.freighterwallet',
  },
});

// --- Public API -------------------------------------------------------------

/**
 * Registers a mobile wallet deep link (or replaces an existing entry with the
 * same id). Use this to add wallets as they ship WalletConnect deep-link
 * support — no need to wait for an AppKit release:
 *
 * ```ts
 * registerMobileWallet({
 *   id: 'lobstr-mobile',
 *   name: 'LOBSTR',
 *   icon: lobstrIcon,
 *   scheme: 'lobstr',
 *   installUrl: { ios: '...', android: '...' },
 * });
 * ```
 */
export function registerMobileWallet(wallet: MobileWalletDeepLink): void {
  register({ ...wallet, id: wallet.id });
}

/** Lists all registered mobile wallets (registration order). */
export function listMobileWallets(): MobileWalletDeepLink[] {
  return [...registry.values()];
}

/** Looks up a registered wallet by id. */
export function getMobileWallet(id: string): MobileWalletDeepLink | undefined {
  return registry.get(id);
}

/**
 * Builds the WalletConnect pairing deep link for a registered wallet —
 * `freighterwallet://wc?uri=wc%3A...` — ready for `Linking.openURL()`.
 * Throws for unknown wallet ids so typos surface in development.
 */
export function buildWalletConnectDeepLink(walletId: string, wcUri: string): string {
  const wallet = registry.get(walletId);
  if (!wallet) {
    throw new Error(
      `Unknown mobile wallet "${walletId}". Registered wallets: ${[...registry.keys()].join(', ')}. ` +
        'Register it first with registerMobileWallet().'
    );
  }
  const build = wallet.buildWalletConnectUri ?? defaultBuildWalletConnectUri(wallet.scheme);
  return build(wcUri);
}

/**
 * Builds the bare "open this wallet app" link (no embedded URI) — used to
 * bring a paired wallet back to the foreground for a sign request, mirroring
 * the WalletConnect mobile-linking sign-request flow.
 */
export function buildOpenWalletAppLink(walletId: string): string {
  const wallet = registry.get(walletId);
  if (!wallet) {
    throw new Error(`Unknown mobile wallet "${walletId}".`);
  }
  return `${wallet.scheme}://`;
}

/**
 * Derives a wallet id from a raw deep link (reverse lookup by scheme) —
 * useful when handling an incoming `app://wc?uri=...` redirect.
 */
export function findWalletByDeepLink(deepLink: string): MobileWalletDeepLink | undefined {
  const scheme = deepLink.split(':')[0]?.toLowerCase();
  if (!scheme) return undefined;
  return listMobileWallets().find((w) => w.scheme.toLowerCase() === scheme);
}
