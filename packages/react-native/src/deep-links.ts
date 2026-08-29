/**
 * Mobile wallet deep-link registry for Stellar AppKit on React Native.
 *
 * This is the React Native answer to Solana Mobile's Wallet Adapter picker:
 * when the user taps a wallet in the modal, we embed the WalletConnect
 * pairing URI (`wc:...@2?relay-protocol=irn&symKey=...`) into the wallet's
 * own deep link and hand off to the OS. The wallet opens with the pairing
 * pre-loaded, the user approves, and the session completes over the
 * WalletConnect relay — no QR scan, no typing.
 *
 * ## Which wallets ship built-in?
 *
 * The four Stellar-first wallets with mobile apps registered against the
 * WalletConnect Stellar namespace (verified against the WalletConnect
 * Explorer registry, explorer-api.walletconnect.com, chains=stellar:pubnet):
 *
 * - Freighter   — freighterwallet://  (confirmed in stellar/freighter-mobile)
 * - LOBSTR      — lobstr://           (universal: https://lobstr.co/uni/wc)
 * - HOT Wallet  — hotwallet://        (universal: https://app.hot-labs.org)
 * - Scopuly     — scopuly://wc        (universal: https://app.scopuly.com/wc)
 *
 * Any other WalletConnect wallet (SafePal, Blockchain.com, and every other
 * multichain wallet that added the Stellar namespace) still connects through
 * the generic QR pairing view.
 *
 * ## Link format
 *
 * Built by `formatWalletConnectLink()` — byte-compatible with WalletConnect's
 * own modal (CoreUtil.formatNativeUrl/formatUniversalUrl in
 * @walletconnect/modal-core), which is the format every wallet registered in
 * the Explorer is tested against:
 *
 *     <native-link>/wc?uri=<encodeURIComponent(wc:...)>
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
  /** Display name shown in the wallet list and connecting view. */
  name: string;
  /**
   * Wallet icon. Prefer a pre-encoded `data:image/png;base64,...` (or jpeg)
   * literal — RN's `<Image>` renders those natively, no SVG dependency.
   * (SVG data URIs and https URLs also work through the modal's
   * `<WalletIcon>`, which resolves known wallets to bundled PNGs and falls
   * back to a branded letter avatar for anything else.)
   */
  icon: string;
  /**
   * The wallet's WalletConnect mobile-link entry, exactly as registered in
   * the WalletConnect Explorer — e.g. `hotwallet://`, `scopuly://wc`.
   * Defaults to `${scheme}://` when omitted.
   */
  link?: string;
  /**
   * Optional https universal link (e.g. `https://lobstr.co/uni/wc`) — used
   * as a fallback when the native scheme isn't registered on the device.
   */
  universal?: string;
  /** The wallet's registered URL scheme, e.g. `freighterwallet`. */
  scheme: string;
  /** Store links, used when the wallet isn't installed. */
  installUrl: { ios: string; android: string };
  /**
   * Fully overrides the built-in WalletConnect deep-link builder for this
   * wallet. Only needed if a wallet deviates from the `<link>/wc?uri=`
   * convention.
   */
  buildWalletConnectUri?: (wcUri: string) => string;
}

/**
 * Formats a WalletConnect pairing URI into a wallet's native deep link —
 * byte-compatible with WalletConnect's own modal (`CoreUtil.formatNativeUrl`
 * in @walletconnect/modal-core), so every Explorer-registered wallet gets
 * exactly the link shape it was tested against:
 *
 * - `freighterwallet://` → `freighterwallet://wc?uri=<encoded>`
 * - `scopuly://wc`       → `scopuly://wc/wc?uri=<encoded>`
 *
 * (Wallets read the `uri` query param; the path is theirs to ignore.)
 */
export function formatWalletConnectLink(nativeLink: string, wcUri: string): string {
  let safeAppUrl = nativeLink;
  if (!safeAppUrl.includes('://')) {
    // A bare scheme like "hotwallet" — normalize to "hotwallet://".
    safeAppUrl = safeAppUrl.replaceAll('/', '').replaceAll(':', '');
    safeAppUrl = `${safeAppUrl}://`;
  }
  if (!safeAppUrl.endsWith('/')) {
    safeAppUrl = `${safeAppUrl}/`;
  }
  return `${safeAppUrl}wc?uri=${encodeURIComponent(wcUri)}`;
}

/**
 * Formats a WalletConnect pairing URI into a wallet's https universal link
 * (same algorithm as CoreUtil.formatUniversalUrl). Non-http inputs are
 * delegated to the native formatter.
 */
export function formatWalletConnectUniversalLink(universalLink: string, wcUri: string): string {
  if (!/^https?:\/\//i.test(universalLink)) {
    return formatWalletConnectLink(universalLink, wcUri);
  }
  let safeAppUrl = universalLink;
  if (!safeAppUrl.endsWith('/')) {
    safeAppUrl = `${safeAppUrl}/`;
  }
  return `${safeAppUrl}wc?uri=${encodeURIComponent(wcUri)}`;
}

function defaultBuildWalletConnectUri(wallet: MobileWalletDeepLink): (wcUri: string) => string {
  const nativeLink = wallet.link ?? `${wallet.scheme}://`;
  return (wcUri: string) => formatWalletConnectLink(nativeLink, wcUri);
}

/**
 * The built-in registry — every Stellar wallet with a mobile app and a
 * WalletConnect Stellar-namespace registration (see the module doc). Icons
 * are the wallets' official logos from the WalletConnect Explorer registry,
 * pre-encoded as base64 literals so they load instantly and work offline
 * (and so Metro never has to touch Buffer at import time).
 */

// Official Freighter logo (WalletConnect Explorer registry).
const FREIGHTER_ICON =
  'data:image/png;base64,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';

// Official LOBSTR logo (WalletConnect Explorer registry).
const LOBSTR_ICON =
  'data:image/png;base64,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';

// Official HOT Wallet logo (WalletConnect Explorer registry).
const HOT_WALLET_ICON =
  'data:image/jpeg;base64,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';

// Official Scopuly logo (WalletConnect Explorer registry).
const SCOPULY_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAMAAAAOusbgAAAB71BMVEVUbez///9OaOtTbOxNZ+tPaetSa+yfrfRQaexRauyhr/WntPV5jfDz9f50ifB3i/Dy9P57jvBPaOv3+P6grvTu8f2To/Nofu5Ra+xQauyClPFpf+7ByvhMZutVbuzi5vzu8P2DlfFacu3+/v9Wb+xheO1SbOzR2PpddO3I0PnQ1/qPn/Ovu/ZKZev29/59kPFmfO5fdu1yh++uufatufbl6fyOnvLGzvmAk/GZqPTv8v2Yp/S0v/dqgO7Z3/vn6/zw8/3t8P2jsPWUo/Pq7f3o6/zm6fxYcOxke+5geO17j/B2ivB8j/CUpPOElvHv8f35+v74+f719v5Zce14jPBug+/x8/2NnvL6+/77+/+VpPNTbexcdO1Zcu1Yce1OZ+t1ifB/kvFwhe9tgu+HmfKxvfaisPWFl/GRofO8xvjK0vn19/6QoPOdq/SNnfK4wveptfXT2fr8/P/f4/v7+/6ruPabqvSMnfKaqfSzvvfe4/vs7/2ksfWyvfbn6vz09f5dde1LZetKZOtjeu5yhu9xhu9vhO/Ayvi+yPi7xfe6xPert/acqvTw8v2otPX9/f/i5/zT2vqLnPKJmvLCy/ilsvXP1vrd4vu+x/jK0flsgu96jfCVpfO2wPeyvffZ3vtrge9sge/c4fuir/VXb+zL2DiqAAADHUlEQVR4nO2ZV1fbMBSANR27QCkxNIsATUIS9t57lb2hUOjee+9F99577x/aE9sZUEJ5kOxzevQ9WS/+jq58da9kAAQCgUAgEAgEAoFAIPgvCdq3U2yBl4b3dw3lKOZ7y2oghIXlZpudnnYY4WTA5GiTE5oXwnpqsvi1IW4i5opLHhjiY8hULxl4onsv50umejPSdK+6x26B1x/au4taMV+bnbgs8SJzU5gIr+lxVgghkgVe+uPX18d91HzvTCmEsKOMtdlFiLySV5lWtedutlsmppUN5waVYFIvIClGkTjAskhgXH0KQv9x4CVxSgYS9w3vF0PcybIsogb9pdlHM2PY3rQneKWct4a4iOGMceASTEbUm22Mr1UwXGMpv3G13p50ll819m1clff50+F+ttmEzi6r9WteyW54cx0liPHOFdxaEHnzi4zB9ASmbksYSHLfnaiXQ/MhBWoPvu+aRHIi1AWAdP1hmp+fFwCMEFqmzmPwwQh7rsPUpoeOxLxcmzxKUBSinZFiG+Wjmxy1WBmZWx/l893IFEmnIb5P+PVbGNkScylvLQJAnooO13Dr9PBiL4RZEbOrmIvZiZCSzKubMZ771qYyNs/bHedrd8s4iVePNkagd2gTW7Nim4BwrFryEuL16t6J4foNEXZWxdcZY5K6jqUZFenzKrja3Hzxnvaoum9E0yklvs4AMDVj0Lo0tKo71l1gys0s9Y8m98bNeczNeGkRXuTlOWdkpOiZUlVV1fHRxV6OZikcirzo9A6Hx+PxtNz66+jLLdpO34WCQ/sq7IrGMr0FNzNGVF6xmeH4bf+DuJlI85aYOz6FJWqJeSwrVJZoppS3GxtmCDe742Z/YV3TNqdZ5p+/cXzOEBZu4Xw/IPX26KbZ75HqTVL1KglhFedrTexrM2L9UWsbvO5n+rjGx3mZXXW6KHdSEykt4/q4kfeFqqtyQRO91HvrYLhbF7cC3klF00OH1Xevopck6Ar7M3oSZFzuCMTOEhgUz0JYmmnGfxHsdCaEFcvTR2Y8lvyEUhDivH0IBAKBQCAQCAQCgUAAmPEHASpec+LLELEAAAAASUVORK5CYII=';

const registry = new Map<string, MobileWalletDeepLink>();

function register(wallet: MobileWalletDeepLink): void {
  registry.set(wallet.id, wallet);
}

// --- Built-in wallets -------------------------------------------------------
//
// Data verified against the WalletConnect Explorer registry (chains=stellar:*)
// — `link` is the wallet's registered native mobile link, `universal` its
// registered https fallback, and installUrl its registered store links.

register({
  id: 'freighter-mobile',
  name: 'Freighter',
  icon: FREIGHTER_ICON,
  link: 'freighterwallet://',
  scheme: 'freighterwallet',
  installUrl: {
    ios: 'https://apps.apple.com/us/app/freighter/id6743947720',
    android: 'https://play.google.com/store/apps/details?id=org.stellar.freighterwallet',
  },
});

register({
  id: 'lobstr-mobile',
  name: 'LOBSTR',
  icon: LOBSTR_ICON,
  link: 'lobstr://',
  universal: 'https://lobstr.co/uni/wc',
  scheme: 'lobstr',
  installUrl: {
    ios: 'https://apps.apple.com/us/app/lobstr-stellar-wallet/id1404357892',
    android: 'https://play.google.com/store/apps/details?id=com.lobstr.client',
  },
});

register({
  id: 'hot-wallet-mobile',
  name: 'HOT Wallet',
  icon: HOT_WALLET_ICON,
  link: 'hotwallet://',
  universal: 'https://app.hot-labs.org',
  scheme: 'hotwallet',
  installUrl: {
    ios: 'https://apps.apple.com/us/app/hot-wallet/id6740916148',
    android: 'https://play.google.com/store/apps/details?id=app.herewallet.hot',
  },
});

register({
  id: 'scopuly-mobile',
  name: 'Scopuly',
  icon: SCOPULY_ICON,
  link: 'scopuly://wc',
  universal: 'https://app.scopuly.com/wc',
  scheme: 'scopuly',
  installUrl: {
    ios: 'https://apps.apple.com/us/app/scopuly-stellar-defi-wallet/id1383402218',
    android: 'https://play.google.com/store/apps/details?id=com.sdex.app',
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
 *   id: 'my-wallet',
 *   name: 'My Wallet',
 *   icon: myWalletIcon,          // data:image/png;base64,... works best
 *   scheme: 'mywallet',
 *   installUrl: { ios: '...', android: '...' },
 * });
 * ```
 *
 * `link` defaults to `${scheme}://` and the WalletConnect pairing link is
 * then built with the standard `<link>/wc?uri=` convention.
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
  const build = wallet.buildWalletConnectUri ?? defaultBuildWalletConnectUri(wallet);
  return build(wcUri);
}

/**
 * Builds the wallet's https universal pairing link (WalletConnect Explorer
 * `mobile.universal`), when the wallet registered one. Returns null when the
 * wallet has no universal link — fall back to `buildWalletConnectDeepLink()`.
 * Throws for unknown wallet ids, mirroring `buildWalletConnectDeepLink()`.
 */
export function buildWalletConnectUniversalLink(walletId: string, wcUri: string): string | null {
  const wallet = registry.get(walletId);
  if (!wallet) {
    throw new Error(
      `Unknown mobile wallet "${walletId}". Registered wallets: ${[...registry.keys()].join(', ')}. ` +
      'Register it first with registerMobileWallet().'
    );
  }
  if (!wallet.universal) return null;
  return formatWalletConnectUniversalLink(wallet.universal, wcUri);
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
