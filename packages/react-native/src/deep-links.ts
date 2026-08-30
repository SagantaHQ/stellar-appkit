/**
 * Mobile wallet deep-link registry for Stellar AppKit on React Native.
 *
 * This is the React Native answer to Solana Mobile's Wallet Adapter picker:
 * when the user taps a wallet in the modal, we embed the WalletConnect
 * pairing URI (`wc:...@2?relay-protocol=irn&symKey=...`) into the wallet's
 * own deep link and hand off to the OS. The wallet opens with the pairing
 * pre-loaded, the user approves, and the session completes over the
 * WalletConnect relay — no QR scan, no typing. On a phone the SAME device
 * would have to scan the QR, so deep linking is the only pairing surface
 * the RN modal exposes (Solana-Mobile-Adapter style).
 *
 * ## Which wallets ship built-in?
 *
 * Every consumer wallet registered against the WalletConnect Explorer's
 * Stellar namespace (verified against explorer-api.walletconnect.com,
 * chains=stellar:pubnet) with a native mobile link:
 *
 * Featured (Stellar-first):
 * - Freighter   — freighterwallet://wc-redirect  (the wallet's Explorer-
 *   registered native link — freighter-mobile's deep-link handler silently
 *   ignores any URL that doesn't contain it; see the Freighter note below)
 * - LOBSTR      — lobstr://           (universal: https://lobstr.co/uni/wc)
 * - HOT Wallet  — hotwallet://        (universal: https://app.hot-labs.org)
 * - Scopuly     — scopuly://wc        (universal: https://app.scopuly.com/wc)
 *
 * Additional (multichain wallets that registered the Stellar namespace —
 * collapsible "More wallets" section in the modal): SafePal,
 * Blockchain.com, Arculus, Atomic Wallet, COCA, Trustee, MaxWallet, Zypto,
 * Hero, UKey, ECOIN, SwiftEx, Panaroma, Kotai, Cryptokara, UKISS Hub, SOC.
 *
 * Institutional custody platforms without consumer deep links (Anchorage,
 * Utila, GK8) and stale registrations are intentionally excluded; anything
 * else can be added at runtime with `registerMobileWallet()`.
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
 * e.g. `freighterwallet://wc-redirect/wc?uri=wc%3Aabc123%402%3Frelay-protocol%3Dirn...`
 *
 * ## Why the wallet's REGISTERED link (not its bare scheme)
 *
 * Wallets validate the URLs they're asked to open. Freighter Mobile's deep-
 * link handler (stellar/freighter-mobile, useWalletKitEventsManager.ts) starts
 * with `if (!url.includes(WALLET_KIT_MT_REDIRECT_NATIVE)) return;` — the
 * wallet's Reown-registered native redirect, `freighterwallet://wc-redirect`.
 * A bare `freighterwallet://wc?uri=...` link OPENS the app (the OS matches the
 * scheme) but is then silently dropped: no pairing, no connect prompt. The
 * mock dApp inside the freighter-mobile repo only exercises the DEV scheme
 * (`freighterdev://wc?uri=`), which is why the bare-scheme shape looks right
 * there but never worked against the production app. Every entry below uses
 * the exact `mobile.native` value from the WalletConnect Explorer
 * registration, so the built link is byte-identical to what WalletConnect's
 * own modal would open for that wallet.
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
   * Featured wallets render in the modal's primary "Stellar wallets"
   * section; everything else (including runtime `registerMobileWallet()`
   * entries, unless they opt in) collapses under "More wallets".
   */
  featured?: boolean;
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
 * - `freighterwallet://wc-redirect` → `freighterwallet://wc-redirect/wc?uri=<encoded>`
 * - `scopuly://wc`        → `scopuly://wc/wc?uri=<encoded>`
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
 * The built-in registry — every consumer wallet with a mobile app and a
 * WalletConnect Stellar-namespace registration (see the module doc). Icons
 * are the wallets' official logos from the WalletConnect Explorer registry,
 * pre-encoded as base64 literals so they load instantly and work offline
 * (and so Metro never has to touch Buffer at import time).
 *
 * Ordering matters: the four featured Stellar-first wallets register first,
 * then the additional multichain wallets alphabetically — `listMobileWallets()`
 * and friends preserve registration order.
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
  link: 'freighterwallet://wc-redirect',
  scheme: 'freighterwallet',
  installUrl: {
    ios: 'https://apps.apple.com/us/app/freighter/id6743947720',
    android: 'https://play.google.com/store/apps/details?id=org.stellar.freighterwallet',
  },
  featured: true,
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
  featured: true,
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
  featured: true,
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
  featured: true,
});

// --- Additional WalletConnect-registered wallets (multichain, Stellar-capable) ---
//
// Also verified against the WalletConnect Explorer registry (chains=
// stellar:pubnet) — every consumer wallet with a registered native mobile
// link. These render under the modal's collapsible "More wallets" section;
// deep-link pairing is identical to the featured wallets above. Icons are
// the wallets' Explorer logos pre-rasterized as 128x128 palette PNGs with
// alpha (tRNS) so they render correctly on light and dark themes.

// SafePal — Explorer logo, 1105B palette PNG with alpha.
const SAFEPAL_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAB/lBMVEUAAABKIe/49/9EGu7r6P2Qd/VaNPBqSfGzovl2V/ODZ/R9YfTi3P1hPfGrmPiYgfbFufrb1Pw/E+6kj/cAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABRnA/sAAAAgHRSTlMA/////////////////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABIzBbcAAAGCSURBVHja7ZntbsMgDEULhpDvttv7v+ukrevS1QTouEyK7vld6Z42Drbp6UQIIYQQQgghhBBCkpg/QAEKHFpA4jQREDN5nfPYQkCmq40xCV5Axmi8Gxo8gtx8lEB2PkggPx8jsJO/rT+YgEz5+QiBvfxR8CehDK4gv77ATr5T8qsLfOU7HxQWwTej2/cf3xItCCVwy3ed6N0RLfD9/HUB6Qy4Bu71FxHwFwN9C37qPyZgewM8B6SbbUpAMago4G1a4NmgtcCTQeNH8GxQswiDyxH4ZdD0NbSKQcuD6F4k/f8cxZsqfRdsM0oKbD4AacdJAbsIdCBJClywI1lSYF4EO5S6ZVdgDuDVTIbdX+AhH7SYmJ119TEftZqprEo+6BfoNPznERFarGZnp2G1fMhb4OOrcWixmhXlA07Csvz6vaAwv3o3LM2vPQ/47KsZzERUnl93Jnwhv+pUHM+/BsFfVku39jrraKTJbXnW7Tj/sKAABY4pQAghhBBCCCGEEHJwPgDT5Bke7bBNWAAAAABJRU5ErkJggg==';

// Blockchain.com — Explorer logo, 1131B palette PNG with alpha.
const BLOCKCHAIN_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAB/lBMVEUAAAD+/v68DE2zDCvaEj3yy9XrqrfYDDnDHVfVZo++E1Lz0dv55+v01+HUJFO3GDbtsr7yusbLV2zQZnniR2noaYXjnbPGLmbBOFLkV3a9KUXEQlrHSWDgN1znYn8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAArfgN6AAAAgHRSTlMA////////////////////////////////////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMpJJO8AAAGcSURBVHja7djZboMwEIXhNMbD5rA0zdL1/R8zBAxeMOlFO7YUnV/KFRfzCRGMvdshhBBCCCGEEEIIoV97+UMAAAAAAM8POJflOSFAXvZDF5kKIIv9WCHTAOb5jwScADP/gYARYM/fFvAB3PmbAjaAP39LwAVYz98QMAFC88MCHkB4flDAAlDNfqNGRboDZRUaX5Uy2kNYrwlVWUd5COs6SFjG1zUvQDbFSY84GIIZf2xbyQmQTZ7lxY90CFV50FdfWyGEI/hvwHeeDeXZuyFY48XUlQ9A4/yJ0GuCHt/P44eIDXCaAQMhf+vNhe5LWB1jAEZCp2/MpxBxAGQDRsLw6lNX4XVmA6jGFWT58DBKf/6H4vsX9JknCAE6zhcReYIAgHhfxZ5gDSDuxcgVrADEvxo6Ah9AMZZjW+ABKM73gCVwARTrg8QIHADF+yxfBDaAYm5MZoEFoLhbMy0wAIq9OZ0EC4Dib89HwQygFAcUd4EGUJojGpqXY0p1SNU1d0BL6Y7plJp+OCkFAAAAAOAFIIQQQgghhBBCCD15N9AUGuvH3Bp9AAAAAElFTkSuQmCC';

// Arculus Wallet — Explorer logo, 1125B palette PNG with alpha.
const ARCULUS_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAB/lBMVEUAAAARERH4+v0MCwsnJyfGx8t2d3k4ODm0tbnT1dlDQ0Slpqnm6OxWV1llZmjb3eGVlpmEhoi7vcEfHyB9foC+wMTe4OQ+P0A/QEFdXmCcnaCfoKMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACKEHHgAAAAgHRSTlMA////////////////////////////////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMpQ+msAAAGWSURBVHja7ZnrjoQgDEYHiqACinPb2/u/54KDJpPZ2fmxsU3W77xAT2xpCx4OAAAAAAAAAAAAAOAl6g9AAALbCxhpAUd7F+ilBeLuBQZZATLiAlZa4CwtMEkKEIkKEJ2iMklMgJQdtXefUgJkGp1pPdXPwSxAao6fDebIFJ8Mpe0EJn0ncB4N8aaguxcwnWcVIBOqwLHWgBt/TMJmAq7G15caluLEKaDeF4Fmdeo5UxDdg4DirAHyH+FBgPMYUtOOogJLF8p0EgK0doEiQDsUUNRKC9hVYFwFWI9hvwqEZQixTkNS1/L1U/ryqUYmk1iHUS6CoI+RKiUrLeswykUwTUF3w8m4aK0jaiyrQF+yX7bCkC2syePxalgFVG7FTb6aJ61tWQifZGDDlczP65CLWr/RXBQDs8CtE1wGrecnCvLMO2HtBMdFQA3sa/k8j9tVgP9iYm/bgE+/NcJNr2alDJtbF5K5G5ru5T608e3YBVmBfBKCrEA28MKP1ST+Wk7SAvhhAQEI7EQAAAAAAAAAAAAA4J/zDYV2Fex/LaU7AAAAAElFTkSuQmCC';

// Atomic Wallet — Explorer logo, 1609B palette PNG with alpha.
const ATOMIC_ICON =
  'data:image/png;base64,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';

// COCA Wallet — Explorer logo, 1062B palette PNG with alpha.
const COCA_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAB/lBMVEUAAAAzaPElVthCdfwqXeM9cfn+/v52mfWIp/bJ1/u1yPpchvHa4/3m7P1ljPCiufiYsvhAb+1+ofoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABodPgpAAAAgHRSTlMA////////////////////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABMhavUAAAFXSURBVHja7ZbbjoMgFADLcgS8td39/4/dSsUVY203engwM2nTUE1mIqBeLgAAAAAAAAAA8Ba7AwIIIICAQwKqHRBAwDkCTFU9PsPXjL+R9N/m0WMCdqAY4H02rO62bIB37mc+blxnSwY8/M6Fud+tFmgFRP+soInDri0VMPpdnfkXk6IYMPlt7g+FpmDhr+rXfpWAkPzVe79GQMjnf/LH24L1wVvdgORvnkOb+ePB3msGbPrT4mj1Ajb9plvszuMD7gt/l/ntOHK9WkDa8LcxoM+ueYEAc9ss0J+CjQIpswhfL4OrlNmGywLJCmS4ERnRDZCwUWBERP1ZsCz4nm4GUuhp+J8CnfeBv4JoFFPP90KJN6JUcH0KU0FtSgUY8TN/KmiM0hTIGn644IlY0JiV0/QCxLfZ0IQ1v2bAZxBAwCEBXzsggAACCCDgHAEAAAAAAAAAACfnF27TLADynuC7AAAAAElFTkSuQmCC';

// Trustee Wallet — Explorer logo, 1392B palette PNG with alpha.
const TRUSTEE_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAB/lBMVEUAAAD+/v5BM1I0KUQ9MVDvSpLFOnf///////8rIjvp5+r///////////9nMlnLx89SR2H///9SLU6Qipr///+alKNuZXp7coe1OnN5NmJmXHWuqbXX1dtMQV1cU2p2bYOJOWiinKvf3eG9ucPZRYfBvMaEfY9oL1WxQnvXP4DGQn/g3uMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADfC8vuAAAAgHRSTlMA/v//////jNP//w0qcf///0///7H//////////////////////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOOiZUUAAAKhSURBVHja7ZnZsqIwEEBv0kEgrCqouK93tv//v0EgCAyx1EpD1VSfJx6s6pN0JzGdry+CIAiCIAiCIAiCIAjiLTx/aieOw3pxnMSe+h5ieD/QhG5pBD7W6G32IjbKLEwd9jLO1Hz8gL1FYDq+zd7EHnX8xudgyj7AYB14zicCjjdeARguA599iD/EBEj8KXhWAdGazyV2FegzEB0ECNilEjcHuj3gtsjDc85zhfkZcyX2lsA23UMRnhcK/HCRaEWQ/FN3UbrmALyBAIiXm233l4kRAaeT930evB58y4HH63m7ChEEln3BlUMuEZkXaM/qAfgzREuAIQgsoXfo9ccYAkKEmVCfW2yBb2gErsgmk7CsDMHRBea1QF2Lx0nOrFiXgktsgZMSEJnV4DcUa1Ps0AU2oMZ/bQrMoCRm2AIRVPn/2YyfuWV8d40u8KfMvTg246+q8YO7RBdgcSXw6156k1XIwzCEWiDFF1hAWQLZqjT4AS48BCJ8gVQVAS8NJrNHfBASXyCq1yE/rjoC7p7hC8j4sfGHXYH5AAKN00Bw69pOQTSEwKUpYFkNATdmQwiwRw7uAhbXLkIsgRRaAqF2DWAJSHUQdgTcbzaMQH0kdwTEeSgBtRJLgZluDeIJqDO5EFAT4O4YkkDf3VQdCNZ1Vp8El57bKZqAjEuDsI7flwBDAknvxbj6WyBU/EXfr8xczfr7E5vqgiSqPVDidSg01/NTw0AT31CrTteg2IhqLeSnsMRsUGhbNDdeViIskBt12ibVeZGnAfgJu0/3pE134rDeorfpnvXpzrch+tXeZ31Kg88WYzerx2/Xj/9gMf6TzZt1gPBoNf6z3X1Hsl95uLSxHi6LWfADO9FaOIkdoD7dEgRBEARBEARBEARB/Jf8BbicJSG6ASt3AAAAAElFTkSuQmCC';

// MaxWallet — Explorer logo, 1416B palette PNG with alpha.
const MAXWALLET_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAB/lBMVEUAAAAWFhYVDQwbJi0bNDgdOk4nJywk5v88xc0lVlkbQkwkaJIqyfkm2f04ODgxJk0iSUsmeIkxuspGRkYoRHNG5e11af0dZnYwSYgpaGs0lptK+P1lZWUbHCQddYY3qP9MOoxXV1dOePd0dHSDg4MpWJArcnYzdM0wh4wyuv9Gh/9D2uEfm60fpLciHi8lW2Qmma84qK4k8f9RRqZIYtBC0tpyS9CHYv8bVV8bVmIhM1IvPHMlps46tbtcaO1oVtpkdP+PW/+QkJAdi5sjhqctis07h/g6l/xHNn9ERZdJVLddWdNzVOEcc38fj6I9WrZAk/9BzdR/TuIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA5LaVrAAAAgHRSTlMA/////////////////////////////////////////////////////////////////////////////////////////////////////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADF4ohsAAAK5SURBVHja7ZjnbuowFIDrQVYzaCABwmjYlNECLaNltNA97nz/h7lOQoUupe2PK5ur6nyC4ERI/nzsE8tnbw8AAAAAAAAAAAAAAAD4FPQPgAAIgAAIcBbAeH0VLYBRnp4XrtudTvu6MKZ5hEUKYERTHV3u92XZMOQAvZui2xz4CNBvttyXlXZhrFFCqDYudG1DNqYpIkRAaxt9o8MGvB4xa9BUVzf0G42/wHdZttlQt4SbpKZMgbfAuWxr7yw49lib6ud8BXBB1j7IOhzT93kLGNpHLx7+AgefCBx9dQG0ewE99n8LHPIW2A8FMHq9bLwTBAnQRjwIRiYMSdA8qSEUrwkRODliAmrWZh1mFRQ0g2s8q6JWIxRI8t4LblkWqE6LYs9hFqjnDeJBdg56djgFde6bEWXboKr0Gkjx2NhJi3hesAyULA03JMJbIOxA/aUq6iyjIFxzaj2HPaOtbAav/8BRoBokgTogyiDDBJAyazQc1rXdzThhCC7SvLPgNliJLeRlSU3BcYdg7Cn4gEVhFi6CepV3BA5ZCIiKSBxR9lFReKey0ZMTFv2LJu8IJDfybINJk3caxu7/jrFkSlL4G92mmxe8s+B+lekJ0zSlXELKFdlXylWip2cl3lmA6ndRF+VKpWiWl8whUamUE8VIr3TG/UWU/hnNcrGyNIvlpckEyuWimYtWSCnNXYDcreYgmHvTDCc/wVrRDMwJ/4NJtfluHkyuHgWcjEipRLb3T+YuEXE2TDZ/bBd4cn0xh9OnzaUW8eieCjod58+uJm/7993LvKj6gDS/ehMDf3QpiauQSM+b4T4dvUgiSzTHz+6ltb61hqPhseAi1anrPry2HxYLX3yVzHoZrWJgLX5buyjT5f0o7MdDP7+jOqFlra9QqgUBEAABEOAoAAAAAAAAAAAAAAAA8MX5A9Y6PxxI4+ReAAAAAElFTkSuQmCC';

// Zypto — Explorer logo, 1140B palette PNG with alpha.
const ZYPTO_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAB/lBMVEUAAAAAPleL/pUlc2gWXWEERVkbZWQxg25MqXlix4N66I1t1ocOU14hbWZWtn1DnXVbvYA8kXJfwoKA75AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADoCHPnAAAAgHRSTlMA/////////////////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABIzBbcAAAGlSURBVHja7ZjdcoMgEEajsICAP0nf/11roo20QWWm+eqM/c5NcreHdVkWLhdCCCGEEEIIIYQQskv1CyhAAQqcTkCM2sUITsD6uoCgUAK2LqTFCIgvFQgCEVB1MRoiYMsFzPkFGrfQHCGgk72uXwUiXMAlzek1A17wNfBcY+Uy27DCZ0C2NqdDCwxLCehcd1JYAa82C+Db90EI3GKyA1wu/q1CCszfV6xd7c4KKXCdSy/ce0G2AJKjCCBgp+V3004I2QTYCifQP/6YObCv9xLwboGu5Fg2sJlQrBTE79FTcbsdvxGwQPSFwxhIIN/5lviPJqV7gQlcC+KPu9OgBOJK4Omnk68kwQSyrX/szsO9KyRNCiWg1wrfjMufzigZaqBANgH+PhyoOWRsgEPpytUoOfsq5ZFTcb4HpeOpw47l2S+wdD5J7s4ggUwT8s/xSAf4xSRXAksBGPzNSG8ffR1coN24Af04ps1fvQ+EZsH/r+v5IQLt0U805Y9UDWgiKn2l+jCokawNRevXwJkw6l0iX8spQAEKvF2AEEIIIYQQQggh5OR8AkI+GmOUhHcIAAAAAElFTkSuQmCC';

// Hero Wallet — Explorer logo, 1359B palette PNG with alpha.
const HERO_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAB/lBMVEUAAAAkHDyQR/s7t/g0x/d5NvstIk0s1/ZKmPmmWP1xR/2GOf5Th/tqV/1aePtDp/lkZP2cUPwn5fhNK5FnOakrSHBWNI01K2grO2crk7IruNVFK29LZ85fb/yxYvwnHUMkxtUj8vsnNFUoV3kmYn87hcg3lc8xp9JSVc1tNtA3Q4YtZpAkd40xh7QmpLo3quJSM3tZSdBgcv82d69bLrJYNKpHeNV0QrODScg+NYVeN8BDgdSQUtAyUYYh0dhMVL1hOZV9RNIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAzJSlBAAAAgHRSTlMA//////////////////////////////////////////////////////////////////////////////////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD38Gg8AAAKASURBVHja7ZjZctpAEEUtASNhNiEkgRAxhM1gdhMWO872/z+VHs0IJIwrD6kZqpJ7Hnm5h1m6e3R3BwAAAAAAAAAAAAD+iPEXQAACEIDAfyDQva0Ae5lMmrcT6AYbx3mudlq3EWCN+0rFcT5Vy+WPFdQJsEbhXgpUy7a99/UKUHwhJUAGtZGvT4DtSqV3ArXceMC0CDDPNK8K5PKPQ6ZcgOLrHwnk8lZ7xpQKsEOxSPlpgee0QN5ye3OmTmD98HApMOlQfrIFJGC5n7/3lQlElJ8R2DQN9tSh/LRAT+EWvGVWYCeqMHvaZwTmCgWClMCX1F77X88Cbl/lIUy2QMZ3XyY/xDL4o0RgqfQaHmOBkowPNpVzM/LHPN9yh0oF1lzAE/HUDegapJqRH1K+xZQKsCSed4P4HooyIDuBv3RDxZUwSuJLGQHqBFKhpaMZBeIeZASoEwwMTc2oXrwqYFltDc2IyrG4CELASQnkeRVkygWijAC/hmcBK1OGVW3BW2YF4mZ0FphrEAhSAnEz2tunLciUYWWH8CTwmjQj2QkuyrCya3iMBQrTxumX/tYWAkMtAmsuMG1EjdOJn422ixUdgR7TIsBM06P43WuyBMy2x4tF2L4ow+oqYRBEgedNCwX5h7/VaqvVYxgufV3vgsA7/KKpwJRLQKMApx1qexkdjmbMVBxBORBbc20CP4v1emwQ78FM5lstbQK8FNRPezAW+W5b4+PUE6OhOe0aRkvm9wY6n+e8J3MFqoXbeBa9fJOp/0AhHomewVaU/34Q0PGJhj+TTcPP0yjEbvSRimazaHFtEtP3mY41fXwphQAEIAAB9QIAAAAAAAAAAAAA/zi/AXlpP7cxe0sZAAAAAElFTkSuQmCC';

// UKey Wallet — Explorer logo, 1401B palette PNG with alpha.
const UKEY_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAB/lBMVEUAAAD+/v4GBgbo6OrJycmZmZnW1tYnJydoaGi3t7cYGBg3Nzenp6dZWVlHR0d5eXmGhoa3uv9DS//W1/89Rv+Qlf9JUf9fZv9ob/98gv+Bhv+9wP/f4f8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAvnfmzAAAAgHRSTlMA/////////////////////////////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALX5R14AAAKqSURBVHja7ZjbcuMgDIZrgUGcnTTp+f2fc42EU2eyM3uxBc909F+kLr7QhySDpKcnkUgkEolEIpFIJBKJRCLRPzX9hwRAAATglwMoNxeMRwGoOXsA7/EYAFU8hOKMOigE0UJyB+ZAgfA3824UQIIt8MbF6Ez7R0MaA5BgYevFAskWZlgeCXoAFLavECAvTmu3ZABUTFD6AzjeprOAm+8ng2AdO8d1Bwi2bjaC1ftVbaGeSMqG3gAzGdIQVDsLZ8dPATSBzZ0BaIvKkhsM+pqDnmLR1oLtC+DIAYVCHT1gTUIEH+lVIRe4rgDo120qn8hUaFloAmElfoddAWymPFjDbfwu3wKYmhg1/tn2BDB0BpANBLNbD3qjW/brPw7AKWDTg6v5iLQPSfDTALE6X1U3MMq9FlA1ELEjAEe/xjreeXp7e8uE/gCTng4GqLp+1d+v65aKZRoL8Hw51T+ny/P+VhgJcGaAswA0AJfVOACz1kDqhdLv+rI+1htxwFcQGWBpTx/nz2n6PH+042dhgNj1KHbtFKaNqrfL6+vlTTXX0FXpuh7FHP4QtspkOr2/n6atDqH1uetlxJVAAQr4vM+NmhZUkZAbOhYkSF9atZS/fe0gE9ftTu7dmqXMZWjherRQiWrIO/cfQbfmlA0n8Blx7dKTop5Ab3XZiPkAmdEYvA+ovxsmA9i7MVEUeWWbIdU2jGw5edMboLUe9x26C9wVzq1v7RqCTLGuXUGeabtmztwZrBmYB3THynoiUMvandsQ6u/CKeGtGjEfMNY37+sFU8KlVWfOWzNmQmLCwxyAs8KMmhGtJ4CNj2MrNXBMF8Ma+FthrNd0CHHwoDLmtTHPCTHVgWWOB4xqzYzBem8Dzkam5QIgAALQFUAkEolEIpFIJBKJRCKR6JfrD/LMIJwc5YXzAAAAAElFTkSuQmCC';

// ECOIN Wallet — Explorer logo, 1308B palette PNG with alpha.
const ECOIN_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAB/lBMVEUAAABhM5b9+v1cMo9YLIxOKnlmR4r45/2xl87Gq+NoOaG5otOiirtTMXvUu+6ReK+mjMOHaKubh7F4V53lx/zp2fZuQqTCpdzKvNs+I2NeQ4R8apaBaJ6olb7Vw+lfTHliLpphSH99XKGDWaufe8Oeka2+n+MAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsVN+5AAAAgHRSTlMA//////////////////////////////////////////////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMUxnJgAAAJNSURBVHja7ZnbcuMgDIaLJTkEG5+SJml32+75/R9xBdjrJm7diw0wk+qbSQZ8Yf4InSB3d4IgCIIgCIIgCIIgCMKHqP9ABIgAEXCjAsAxTZDn/PXqSTILuHVxGsAsLroACKBxAhAByQ0yWICX7X/sdrufwQyYfgug3RTM1m2CgvRRANS79Ys9218pTC3AmINlAWyDPfH6JmEYIhGx8yE9fPEWaMhaQvKPL6Px2gI43OiX1l2nmfrp5H3gVD3xrKvratC6xKhh6JxNFytsy7gWAHb97bursz1aOveG6/sA0HHFAM0jxnRCfrkBet8Cxaa1F/F4ZQvg+hYUDXsAYuwoCAJOutILekAV0Ql94Z0EtA8E5EGfExigsTTHdEJQo4DBlm/VZzCoEgkguMSnIFSJBPx+KRfsXE0yibZgc79Z4IPAJLLAW3QWo1fDNQH3JR58rsglQFt2AMxogdKFglG5nHB/JKVKSOYDw/c5/B79N7dDuOgM4wlozxKRrwDGRWCyTMidx3hGedWmcylKKMDSjB9bC4tNiCfgWVcTRy7EfqCrFnImorEjySsAIicifv26AAuH2C0ZNDkt4OLuz7oPQNy2nFNOz4ewwFCFKjjUXe0+ddeDgthOiGoO/3A4rWw4mJJPxipqV+yd4N/b6et4PzAdx9wxPWI/ANN12JSAMQh4pvG6yqDCuFuA/nQ6T3t3Hi0aChXgm0lQDc/9Qfk6DLluSv1uA2Lmq1qAz31ZDfCZLYD4wc+XPyxEwM0IEARBEARBEARBEARBuHH+AiF3IIrjgJwDAAAAAElFTkSuQmCC';

// SwiftEx Wallet — Explorer logo, 1426B palette PNG with alpha.
const SWIFTEX_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAB/lBMVEUAAAD+/v4BOWYBFkwAJ1gACkIFQ2zZ4ueQp7kqNmSKmK0tY4YsVnmptsQuR29TdZNQaInk6u3X3ON5k6pueZbM1Ntvi6S5xdCEi6Nshp9DTnZKXICassLCy9UvXYBKV3xcgpsABD4hMF6gp7siLF0eNF8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxkX1qAAAAgHRSTlMA/////////////////////////////////////////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALgnVTUAAALDSURBVHja7ZjJcuMgEEDDIgljQKA1jvc4+f9fnO6WHGdymcMUuCrV7+BKdOEVNL3w8sIwDMMwDMMwDMMwDMP8E/EfsAALsAALZBZofBvC4NNzBEa7lRpQWu7tWFigO7SOVl9QSm3irSsk0PhpW0stJRqEuJe4PhGG25hdwJxqSWgtXX/ET/MuLA5VVakPm1lgKxcB1x4a+Nf3dsZdMXFD61fXTX6B+nQ54Hl3JkqKwWg6Csr9O0jkF5A9BcLuEYVK6fUyDkUEjMAoXAMBT1/T+avNIF7LCDRfy7t2t4PTv4dgU0ygRgV9mpdvPiwGqrBA+/jamlAVF3B/fSeBrqiAod3frWXgjQRsSQFceMI8sMPv5+ICNSbCgGmAYiE+Zwd6WF9O09DGd1VcgKqOqfVXMSwtQGcACk4/BMrmAbcYiDk+SUAHv370umgmtKsA1gKz9odUj1SCahgKlOO0CqBC3VNP7EkAy/FbZoFWyotw1BatzYD091S8gXRUxcwCk5RbtHCXqbf9IoFFcQKBs9hU1yGzwAHuXzJLWyTaZQ/wb1upq+2gKfCZBSAApYeOhArAHGgwwZwI8a8ayEMq5Z4LttgItPdmwMRTe1yqYbWHQPgRgzkEYPvlOH7vRmgv4BaMR7gJt+wCCS5AhLbUuOO3UQ2mggF34SPlH8162IKDiPDbN/dM+KkgAUEcVq8FZsPk4CJ0+AsjifXeDNiTBjEq9SMP55qOPRailJyW99FYKSca6AiULzOeT2QgLo/JaBAjTAfVUOp9ADKhrGfh3bJ+mKke/sjCWR8oIj4PQAK0NdQCaI0GrEX7kk80LRhoB0duYHlPw1ks+0YEdQhicAt1aD7j8tqWfqSalwBw0BLC+YfjE57p7P2BQEn7nHfCNNEDgZzS015Kmz4Em/itmAVYgAV+vQDDMAzDMAzDMAzDMMwv5w+YOitEU6BANwAAAABJRU5ErkJggg==';

// Panaroma Wallet — Explorer logo, 1043B palette PNG with alpha.
const PANAROMA_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAB/lBMVEUAAAA3cv83cv83cv83cv83cv83cv83cv83cv8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD7QCXKAAAAgHRSTlMA9w0tUHHRjLAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHzpeE0AAAFESURBVHja7dbdboMwDAXg+N/v/8Q7Dm23q6oX2dCk87UEAhI2TkK7FhERERERERERERERERHRP6DVdmsCLiKPDFT1pgR2Bp4iGTekUEigr90cvTLQv8ygnvHnUM2w6cLu2tx1WttXcEr3dnIUXHf82q2apKrkqlyK7krJ1Bmpwtnpzmbnh0FirZj5ELg9IkfkTJBYicCByriga3alWL8Sf89Iz2iErOxcXSgDJmcbHhlpZHahApUhej6++ywEPCxaFY8Ji2PLnjK0lRgu4qsYFPHz8R/LAC8mQxkcMSPNUI9wVB1ZuaZ345K4dR+v/7UO0uZtpPNO2s3zcK+L3XmePhXffo6/vHstY4g8zBWf8oqTCVw3U/e3iwvlx/QsDYtpjg0BxvjDVGPUfMv8nl+w72nAvxFERERERERERERERERE9Jkv/TwF2FWZgk0AAAAASUVORK5CYII=';

// Kotai Wallet — Explorer logo, 1535B palette PNG with alpha.
const KOTAI_ICON =
  'data:image/png;base64,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';

// Cryptokara — Explorer logo, 1367B palette PNG with alpha.
const CRYPTOKARA_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAB/lBMVEUAAAD+/v7ktRDrx0zv0nDy243m5uYFBQbW19fmuyYVFRX37cn25rD68ta1trbowTfFxsYlJSaGhoaZmZk5OTlERUZjY2PrzWN2dnZYWFioqKj14ZzhrQDe0aSqp5u7vMDaxHnQy7rm3sEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAROv9iAAAAgHRSTlMA/////////////////////////////////////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAANZgThcAAAKISURBVHja7ZjZbtwwDEVDat+8e5xZ0rT9/4/slZ30JQ0SoGMXSHkCKMK86IxEkdQ8PAiCIAiCIAiCIAiCIAgfQn+BCIiACIiACPw/AqUOnT1UIGmliIxe4ZZodOcDBZIKymRSYRMIimzvHg8TMIp1/a/C74+6eLaHxUBSBusX07Y4CB0YEXD5w9ffU0Al0qwMUYYAtmFw44G3QDNWbtUa+WTnb0Sn2NChAleqN6Di+5lo6v2heUArSrxNG3eCw2SPTUQ4e72ss9EN1MTT0ZmwzRRynTy6ZnX4BwJmjcBz9Ij/y+EC9fptfLgFOwUhAiDTp4JgH4GMzNPqT12DnTJhMFTYvCaCS0nze4lgJ4GM7J9RDStXsyj9bircqxrqkGo+2ghGvVsMdusHDOvtJq46sKnl0B/ZkqVw00VdS0qplJJwCl2cj+yIUJKTuXF44YbacB7eXoadm1KTXmdX5AV/ar5yW15qzL+5DC+5wM4DddOwp0BhVot+k5DU9iSw7mxj9NbWGKjDNrungLnlNQFxazgRXxVzyBjahMFYN0+uoz7G2Fyc6xvM+uauArp2vrj9hhfOxEa1WB7JsGDU/BRdLYnNOMQJ5cmNmLn5zgI14K+cUq47YBAPmTMqUlhwPN/jFKO1U+wdBLquww646a4CmVXO2WAfEptcdwB7X9AZq5AMP7lT52bkwqbvR+dRpB+beF8BMgGnvh7EghleRhhwJG1umbVFRzC4E7bBzSO6JF93YN4rDxiNc1fhR43zlCz9RNB7j1W97Xwd6iXo/PZU3kGgtC2OXi9dXbXBgs94F1aFbXVrEf2NrX/yC4kIiIAIiIAIiIAI3E1AEARBEARBEARBEAThi/ML5tkkxVd1Da0AAAAASUVORK5CYII=';

// UKISS Hub — Explorer logo, 1007B palette PNG with alpha.
const UKISS_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAB/lBMVEUAAAD+/v4BAQHc3Ny0tLSmpqYWFhaMjIzIyMjr6+uamponJydpaWl0dHQ8PDxHR0dWVlYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADbVInSAAAAgHRSTlMA/////////////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJSwCHoAAAEgSURBVHja7dndsoIgFEDhENjxo9X7P204ZuAZnXNRQFPr644uWqOMg7vTCQAAAAAAAP9SLyCAgG8L0NaazNp1fV7O31hfLeAsQ0ncsmy2y0OoF7D9oUEvy+7PsiWAAAIIIIAAAn4uQBPAJhw6H0pNlFJsHqCc9yp9HrRqHtDszYgAAj47wDvjdL8AN87v6DKaTgFhHRHIuWaAOQooy6aaI5q4H6Av5aqpOKS6pWu8EzBtsm71ZkQq7AfEw7357gB9PTgRycE9ePucMEjXE1F62oydA7YzwR4ByhUFvvWpeCmIfa/A+tifN34OkJYByoer9DmWF3txushzWO3SsbycYbcISJdBO5PH9dbkSb7V9QM8f9kQ8FsBAAAAAAAAX+4O4LoYVlD/w2kAAAAASUVORK5CYII=';

// SOC Wallet — Explorer logo, 1249B palette PNG with alpha.
const SOC_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAB/lBMVEUAAAD+/v4jSpkcRJY2WaLM1efm6vOnt9ZXdbFGZ6mUp85th7tKltHY4vCFmsYsUZ16kcK2w922yePDzeNrqtp6s9692u9boNZjf7eKvOIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADA1baNAAAAgHRSTlMA/////////////////////////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIt95dsAAAISSURBVHja7ZjJdoMwDEWLRwwxBDK0/f8fLdgO2EFpF0Usct7bcVjoIl9kw8cHgiAIgiAIgiAIgiAI8meqfwQAAAAAAADAAGA8Xcqeu67R/ABtL9ymzHi9eaOklKLWzACtFEIq81T/NKWy0y0hxcAKYHoxV7ElwHUGuGsR7inPCeBjkbYEuM0A/iLjzTPrEqhQw5UA/vN0+g6rM0exAtShyrME1d1Xtu8jgPCcAF18TL19DY0xqQesAEOoIRtyFBDt2R2AtrAQpOYdRI6yMEYf8RZUX6HNvaGGsdwOif0BmijahQCgBN0f4NnCy6B/e0X3B/B9bmGjpunv7EsHObbj3MLYdBn7QTnIAdCuFuo0+kTvXzjIARAtlOPC8lCCHJIMAONqoXt0ICw8uU1wHMkWC5cViGUpB1kOpS48qVtGQloR0kEWgGShXxWY6na0gywAycIh9nyRgN6oOQAuSfxMgVkC+qjCAWCibW1SIPXBOspBni+jaGEfKysrMo5nB3kAMvnmR85U2DjIA2BzgCYNoBR9BEBhn87Hwfa4zAJgsqargmfjINPn+dr0cC5YeTYOMgGcZSFdLV86yASQWairYk/QxwAsqx4PRjo34phfNE4ue1Bx2R4FMAqZf58M6VL5w35SDfP/GFk/3nobLp0+8C+ZsV0zFpfdgP+EAAAAAADwvgAIgiAIgiAIgiAIgiBvnh+oqRmpBcoErgAAAABJRU5ErkJggg==';

register({
  id: 'safepal-mobile',
  name: "SafePal",
  icon: SAFEPAL_ICON,
  link: 'safepalwallet://',
  universal: 'https://link.safepal.io',
  scheme: 'safepalwallet',
  installUrl: { ios: 'https://apps.apple.com/app/safepal-wallet/id1548297139', android: 'https://play.google.com/store/apps/details?id=io.safepal.wallet' },
});

register({
  id: 'blockchain-mobile',
  name: "Blockchain.com",
  icon: BLOCKCHAIN_ICON,
  link: 'blockchain-wallet://',
  universal: 'https://login.blockchain.com/app',
  scheme: 'blockchain-wallet',
  installUrl: { ios: 'https://apps.apple.com/us/app/blockchain-bitcoin-wallet/id493253309', android: 'https://play.google.com/store/apps/details?id=piuk.blockchain.android' },
});

register({
  id: 'arculus-mobile',
  name: "Arculus Wallet",
  icon: ARCULUS_ICON,
  link: 'arculuswc://',
  universal: 'https://gw.arculus.co/app/wc',
  scheme: 'arculuswc',
  installUrl: { ios: 'https://apps.apple.com/us/app/arculus-wallet/id1575425801', android: 'https://play.google.com/store/apps/details?id=co.arculus.wallet.android&hl=en_US&gl=US' },
});

register({
  id: 'atomic-mobile',
  name: "Atomic Wallet",
  icon: ATOMIC_ICON,
  link: 'atomicwallet://',
  scheme: 'atomicwallet',
  installUrl: { ios: 'https://apps.apple.com/us/app/atomic-wallet/id1478257827', android: 'https://play.google.com/store/apps/details?id=io.atomicwallet' },
});

register({
  id: 'coca-mobile',
  name: "COCA Wallet",
  icon: COCA_ICON,
  link: 'wirexwallet://',
  scheme: 'wirexwallet',
  installUrl: { ios: 'https://apps.apple.com/app/coca-crypto-and-defi/id1594165139', android: 'https://play.google.com/store/apps/details?id=com.wirex.wallet' },
});

register({
  id: 'trustee-mobile',
  name: "Trustee Wallet",
  icon: TRUSTEE_ICON,
  link: 'tw://',
  universal: 'https://trusteeglobal.com/link/Pxxum8Yt',
  scheme: 'tw',
  installUrl: { ios: 'https://apps.apple.com/app/trustee-wallet/id1462924276', android: 'https://play.google.com/store/apps/details?id=com.trusteewallet' },
});

register({
  id: 'maxwallet-mobile',
  name: "MaxWallet",
  icon: MAXWALLET_ICON,
  link: 'maxwallet://',
  scheme: 'maxwallet',
  installUrl: { ios: 'https://apps.apple.com/es/app/6670610349', android: 'https://play.google.com/store/apps/details?id=com.maxwallet.cc' },
});

register({
  id: 'zypto-mobile',
  name: "Zypto",
  icon: ZYPTO_ICON,
  link: 'zypto://',
  scheme: 'zypto',
  installUrl: { ios: 'https://apps.apple.com/app/zypto-all-in-one-crypto-wallet/id6463755992', android: 'https://play.google.com/store/apps/details?id=com.zypto&gl=US' },
});

register({
  id: 'hero-mobile',
  name: "Hero Wallet",
  icon: HERO_ICON,
  link: 'herowallet://wc',
  universal: 'https://wallet.hero.io/signin/wc',
  scheme: 'herowallet',
  installUrl: { ios: 'https://apps.apple.com/us/app/hero-wallet-hero-io/id6757118686', android: 'https://play.google.com/store/apps/details?id=io.hero.wallet' },
});

register({
  id: 'ukey-mobile',
  name: "UKey Wallet",
  icon: UKEY_ICON,
  link: 'ukey-wallet://',
  universal: 'https://app.ukey.io/wc/connect',
  scheme: 'ukey-wallet',
  installUrl: { ios: 'https://apps.apple.com/fr/app/ukey-crypto-bitcoin-wallet/id6758265264', android: 'https://play.google.com/store/apps/details?id=app.ukey.io' },
});

register({
  id: 'ecoin-mobile',
  name: "ECOIN Wallet",
  icon: ECOIN_ICON,
  link: 'ecoinwallet://',
  universal: 'https://ecoinwallet.org/link',
  scheme: 'ecoinwallet',
  installUrl: { ios: '', android: 'https://play.google.com/store/apps/details?id=org.ecoinwallet&referrer=utm_source%3Dwalletconnect%26utm_medium%3Dreown%26utm_content%3Dlink' },
});

register({
  id: 'swiftex-mobile',
  name: "SwiftEx Wallet",
  icon: SWIFTEX_ICON,
  link: 'swiftEx://app.swiftexchange.io',
  universal: 'https://app.swiftexchange.io/',
  scheme: 'swiftEx',
  installUrl: { ios: 'https://apps.apple.com/app/swiftex-wallet/id6759080930', android: 'https://play.google.com/store/apps/details?id=org.app.swiftEx.wallet&pcampaignid=web_share' },
});

register({
  id: 'panaroma-mobile',
  name: "Panaroma Wallet",
  icon: PANAROMA_ICON,
  link: 'panaromawallet://walletconnect',
  scheme: 'panaromawallet',
  installUrl: { ios: '', android: 'http://play.google.com/store/apps/details?id=com.panaroma.wallet' },
});

register({
  id: 'kotai-mobile',
  name: "Kotai Wallet",
  icon: KOTAI_ICON,
  link: 'kotaiwallet://',
  scheme: 'kotaiwallet',
  installUrl: { ios: 'https://apps.apple.com/br/app/kotai-wallet/id6757885160', android: 'https://play.google.com/store/apps/details?id=com.kotaiwallet.app.android' },
});

register({
  id: 'cryptokara-mobile',
  name: "Cryptokara",
  icon: CRYPTOKARA_ICON,
  link: 'cryptokara://StartScreen',
  scheme: 'cryptokara',
  installUrl: { ios: '', android: 'https://play.google.com/store/apps/details?id=com.cryptokara&hl=en_US' },
});

register({
  id: 'ukiss-mobile',
  name: "UKISS Hub",
  icon: UKISS_ICON,
  link: 'ukisshub://',
  scheme: 'ukisshub',
  installUrl: { ios: '', android: 'https://play.google.com/store/apps/details?id=io.ukiss.uhub.mobile' },
});

register({
  id: 'soc-mobile',
  name: "SOC Wallet",
  icon: SOC_ICON,
  link: 'socwallet://',
  universal: 'https://soc.socjsc.com/wc',
  scheme: 'socwallet',
  installUrl: { ios: 'https://apps.apple.com/vn/app/soc-wallet/id6752928371?l=vi SOC Wallet', android: '' },
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

/** Lists the featured wallets — the modal's primary "Stellar wallets" section. */
export function listFeaturedMobileWallets(): MobileWalletDeepLink[] {
  return listMobileWallets().filter((wallet) => wallet.featured);
}

/** Lists the non-featured wallets — the modal's collapsible "More wallets" section. */
export function listAdditionalMobileWallets(): MobileWalletDeepLink[] {
  return listMobileWallets().filter((wallet) => !wallet.featured);
}

/** Looks up a registered wallet by id. */
export function getMobileWallet(id: string): MobileWalletDeepLink | undefined {
  return registry.get(id);
}

/**
 * Builds the WalletConnect pairing deep link for a registered wallet —
 * `freighterwallet://wc-redirect/wc?uri=wc%3A...` — ready for `Linking.openURL()`.
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
