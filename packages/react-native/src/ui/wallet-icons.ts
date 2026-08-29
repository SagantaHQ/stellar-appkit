/**
 * Compressed PNG wallet icons for React Native.
 *
 * The web SDK ships its connector logos as SVG data URIs (browsers render
 * those natively), but React Native's <Image> cannot rasterize SVG — and we
 * deliberately do NOT depend on react-native-svg (large native library).
 * Instead, every SVG icon the RN modal can encounter is pre-rasterized here
 * as a 128×128 palette-quantized PNG (~0.2–1.7 KB each, ~7 KB total) that
 * RN's <Image> renders natively.
 *
 * Resolution order for a wallet icon (see icon-utils.ts → resolveWalletIcon):
 *   1. explicit wallet key (connector id / mobile wallet id)
 *   2. the icon source itself when it is already a raster (PNG/JPEG data
 *      URI or https URL) — mobile-registry icons and most WalletConnect
 *      peer-metadata icons take this path
 *   3. the wallet's display name (covers WC peers: "Freighter" → Freighter
 *      logo even when the peer ships an SVG URL we cannot render)
 *   4. letter-avatar fallback
 */

import { getMobileWallet, listMobileWallets } from '../deep-links.js';

/** connector id → pre-rasterized PNG data URI (compressed, 128×128). */
export const WALLET_PNG_ICONS: Readonly<Record<string, string>> = {
  // Albedo — converted from core connectors/albedo.ts SVG
  'albedo':
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAASFBMVEVMaXEAZbEAZbIAZrIAZbIAZrIAZbIAZbIAZLMAZrIAZrL/' +
    '//8Pb7fK3+9UmcxyqtWOu92rzeb7/f7w9vvf7PYgebw6icQwg8Hg16TJAAAACnRSTlMAyJir335G7wccK307SAAAAAlwSFlzAAA7' +
    'DgAAOw4BzLahgwAAAxpJREFUeNrtm8mWozAMRQWBMNrGhMD//2lXukIHB0hZyPjVot+SBVw8XMQ5FtFGymueJllRB0uRJWl+Lckr' +
    '5fUS8NEOxsWDocpPevqTIa8+v/25j/9G+DAK16yOkOy69/ppHSmXzUGokjpako2VUGV1xGQrgqqoo6aokO+/HoMyqaMnWa7EtAYk' +
    'Xez/GpJ/PigzDEA2T0Jeg5JjduBqL8IG4DkEZYEDKErcFnhthAsS4IKdga85AM/AYw5yLECO+QwsPwgJFiChDAuQkXATjKN0Gwjf' +
    'wFrhDYQA976/QwG6pumQAO2taW4tEMA0XzFAgOEBMOAAdPM3GgagvgEUCmBsnhlBAHYGsBiAez8DSGREIgnN6RAADwnNEciIZBKa' +
    'YwAAwxJgiA+gGyc6OoByAVRsgLF5yxgZwL4D2LgALwlJZURiCQllRGIJCWVEcgnJZERyCclkRAEkJJIRCSWklFBGJJSQMUIZkUxC' +
    'fdv2MhmRTELWxblHAejcdadlMiJZJfS4IKuMSCSh7n1ETASApYSmx4VJJCOSSEitaxN9OoBaD7iRVEYkkFD/XHJLFbBlRIJKyH68' +
    'eA6AUwnprXXBlREdl9Dtdfl2XEZ0vBLqdrjaEwGcSmh6XZ+OV0Ykr4RklREFqIRElREJfsf2os4CGBvPjCcBWF8Aew7A+ndsLxwZ' +
    'keh3bC/dGQBbv2N7YciIZL9jezEnAAwcgCE8gG5Y0cEBFA9AhQYYPe6ujsiIjkjIeCxTGxbAkVDfemxUXxnRAQlZr2HqQgK4Ehq9' +
    'FoqnjIgvocHTFSYggO+NDV9GxJbQp9Xl/KL4yYjYErLeu1WFAhj9JavZlRFxJTQwVosNA+BWQh1DGD4yIm4l9MM979zKiJgSUqwF' +
    '6yEjYlZCmlc3mAAAA++V3AEb5ACaO6kdb8SIVwlNPwNMvMpIeoxHnP8AVGCfX+APs8GP88EPNMKPdMIPtcKP9cIPNuOPdsMPt8OP' +
    '9+MbHOAtHvgmF3ibD77RCd/qBW92w7f74Rse8S2fMZte0/J3tv3+gsZnfOv3L2h+fy6GU9r/N5/1B3TicuhaaFEWAAAAAElFTkSu' +
    'QmCC',
  // HOT Wallet (web) — converted from core connectors/hot-wallet.ts SVG
  'hot-wallet':
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAAV1BMVEVMaXH2WSj5YC3zUyTzVibzVibqRBr0VSb2Wyn0Vib////3' +
    'WyrvTSD0Vyf4XizyUSPuSx77Yy/wTyLzVSbsSBz8ZjLrRRv5ooj2flr92c7+6eP/9vT7v63PpFd8AAAACnRSTlMA////WsjnlOYi' +
    'lhSsXQAAAAlwSFlzAAA7DgAAOw4BzLahgwAABXBJREFUeNrFm+l2qyAUhfUao5agCVRF4/s/53VgOEy2TRsO/9Ksur99BgZXyLLQ' +
    'aC5VWdc9GA9v/LNH6wwCR12X1aXJvjkuVe+N3+nnx6iry9fqTVX3f6yf54pgY/giDgHzf+VfDlqdBb9+u35OaX35mf2/1l9HOAhN' +
    'mUqf0jJQCU2dTn9NQ4Or7xOk1qfcIShT63NeotS/0ecc9MIFQ59zMx/UKPq8Tjf/BvV5IZPQYOkXvIkHIIV+IUNQo+kXdawFEukX' +
    'xSWcgWT6ew4w9bccNJj6RdH4JZBUfy2CClW/q9x1MLF+VzqzQGp9Vmc1pn7X1RmufscyXP2uy5D1AQCKPjMAafV3gIKBCKT3zxmM' +
    'QHJ9vmp3JgLp/R/2O3a0IUb+dwQJgJL/PQNsB0isXzB+uN/8bwA48w87/K8ACPnvVP7DAIn6n7EIwHv1OePMCoAH8P78Q3UfIEH+' +
    'rQS4AEn6n8EA2AAJ+z9YhEn7X45bhtX/Uh8ApOv/DugbgFT9DzNwAwDJ+1/qK4Bk/e/4VwAI/S/1D4CU67+jvwMk7P/O1d8AcPrf' +
    'APxGPxdi3IYQ+an/uP4tc/XHj32Mlr44/jhZ8kQszw81ntP40Pq8/zgZBOq7AK0DQKIAZJydBz9HovyfA9ziAK0DoCLvA/RT4NGz' +
    'OPT5qwCtA6Bz7wGIZ/jh468i0DoApvYcAGrpP32C1wBaBwBUvwPw0Omfxp5w2otF0+xZIEIP+c1i/kKh/j1z+08DwO5zABadc93/' +
    'QtXEvNdhp5qyU89jZiGA+gagdQCs/rcBhNLqwfyTTyAJYPoxAIc0uzGorwHaMwAnAjIAz96a/8isQwDnHwhwc8bdALRnALkNQGTV' +
    'jc78qwIjzPl3jQIACOlLgPYMILcBqPzwJO78L5Ow6PBv868BCOofAO0ZQG4DUKrq2lt/5L9O1vqnAcL6O0B7BpDbAGvYJ5UBR79T' +
    'OaBw/VPPi+hvAG0I4DlbQwFs6678ILz1j8vi6OH5KwJwNwBtECA4JgoAiL/+zqAK1fobBrgbgPbHANIn9df/CQKwE4B7HIB8CZDL' +
    'HAX2HxCAnQDc4wCE/DAC1v4HALATgHscgGiAcBHCGnj4+y9TA+wE4B4HIAZgtPZ/PQSYTBc45y8Zmwfc/3kA9zgAgQB5FEBORKO3' +
    '/1RTpLX/dAEc/c/M3f9+DaAmPG//q76w9r8OgKsPAEgUgFoAXE14vbv/nuHKq5Z+G8DTNwAkDpBTAMC5qsLF0ddg1v7fAvD1NQA5' +
    'AaAAYCt91anC0lf7gcU+f0CAgL4CICcAFADsvf94wv2f1FfN8SHs8w8ACOlLAHICQAGAnP1GfRThOv5Kf3HOXwYgqH8AkBMAGgDQ' +
    'btddsSAdJaPeFc/EOf9pgLD+DkBOAGgIoHjMkcn62bvnT/W8iP4GYJ9/bQAaAthOHmGCWXjn3zDAJwBwzt8WAA0B7HsPsoQWq94/' +
    'fwcBPgGAe/6HADQEoHpPuMfTSYTO/yGAzxhAbgPQEACY/sRiEjEvIvj+IQTwGQN44f3PQ74heUTef8TmvyDAq++fOsa6l/UBwMv6' +
    '8fc/39A3AEj6GgBLXwGg6Q9ZWn0XYTgA8PwfAIj+dwBM/xsAqv8VoEb1P1wdgNT+V4AS0/8wlFmF6X8YquyC6X8YLlmD6X8Y1h93' +
    '14j+1xrMVBGg+B+2HzZf8PxvJZAdOcDxv2dgzwGS/+H4eX9DkfzvPbCHAMn/oO/Z1Dj+r+aaD4r/AVz7qxD8D9alvzK9/9K57Jba' +
    '/9W7bpfW/zVw4RDT/3HlM2H+w5d/K5T6t6/9pvB/Pbt/XfF3+79WX179fqf/a9V85/J7/R7/1+9cfofX/9nfnX+u0ev//wE4j/05' +
    'vD15UwAAAABJRU5ErkJggg==',
  // Klever Wallet — converted from core connectors/klever.ts SVG
  'klever':
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAAY1BMVEVMaXEAY/sAVucAWewAVOYAVeYATNkAVOUAVeYAVeYAWOoA' +
    'TdoAS9cAU+MAUeEAVOUAUN8AX/QAT90AXfIAW+////8AYPcAXPAASdMAYvoAR9F9qfOdvvbf6vxMh+0kben2+f7GXCTCAAAACnRS' +
    'TlMA2P//n0bP5xx+gMiH8wAAAAlwSFlzAAA7DgAAOw4BzLahgwAAA/NJREFUeNrFm9uW4iAQRdFJQqIm0Z7RUeKl//8rh9ygINpD' +
    'xcipp16rH/YuKArIEiGeRVokq9XhdNFxcuNg4rcTf7v4Y+IXjY2UWVKkIjDSpCP3sQh/CJkEOOTF4XJZlm8EWoci/5lfnC6f5K/X' +
    '67L4afBXl0/zdciXE5FcYvB1JM9nfxWLv15nOZa/rmWO5dcTg9j8iUF0fl1nkPq3/LomayFF8Os6fTUBkfi1NP0Xw6/roSvnJxC/' +
    'rPInAxCRXw4b0wHGL+VkCcTll2Xq9YDY/LLtBScgv52DFMmvqpSsAQS/KmwJQPhVYtowhl9lowCIX8mhDaH4WuAE5e/3AsrXBgLL' +
    'ryoB5msBLH8vwHxfIDrfE4jPdwUAfEcAwacCED4RwPCtAIhvBFD8UQDG/xJgfi8A5HcCSH4rAOVrASz/S4D5RADDtwKB/HvTx93n' +
    'P5oxNhy+EQjNvzn2cfX5t+EfxzuLPwoEj78r8D5/K5jz7whM+d9cfi/AqD8qsAS/E+DUPxFYhN8KsNafFViGrwV4698ILMTfCmb/' +
    'mQi8yfcE/t//fIF3+a5AQP/1BN7mOwIh/d8VeJ9PBYL2H0dgAT4RCNv/qMASfCsQuP8SgUX4RiB0/7cCy/BHgeDzhxGYv/89Ewg/' +
    '/xgBwz827/B3gnn+ao7TuL/B7wQ4579nAt+P+fxWgHX+fCZwvG1m87UA7/xLBW7X8a/rbP5OMM/fROD6qI1BM5c/CISf/xun+Dd2' +
    'Lc7k9wKM+8cocOtX/+PbFOI8fifAuf+YPjBcf+62EGfxWwHW/csXKG0hzuJrAd79zxMoy9qUQTOHvxPM+6cr0NY+2RRm8IlA2P3X' +
    'EehX//1IC5HJtwKB928qMPZfszRvJZtvBELv/0TA9H9SiGz+KBD8/cEKkP2ntIXI5Z8F8/tH43b/of+ZfnS8M/m9AOP7iy8wLD1S' +
    'iCx+PwKc7z/Ni/2PFCIn/24EWN+fXAHS/kkhMvJvR4D3/csRoNuP3RgbRv7nnWB+f6MC7v5HCjGQ3w7AWXzq+1/A+HchUPx2+H2B' +
    'uPlPRyBy/mdfIHb+/ghg8rcCoPyNACr/UQCW/1kJbP6qEwDm3wkg89cCG2j+WkAi82+LUELzV5nIgPPfCSTI/JVKRIHMX6lCpMj8' +
    'ldI/LJbA/NW2/WEzMH/V/rA5xeXfzYCeA1j+ug92P++H5a/6n/fnJSp/NTz1KUD5K/PwTmLyty+NUkj+ijz7SwD5K+fRXxY//8x9' +
    '7CZj5+8/OaQGMfJX0weHEpl/Z5BFnP/nj38TSP07z35ljPyzn95fF/LT+W+L/z39lp/d//KQx+/yU+ef8Af4RZJJuV/q/qPn/eXz' +
    '/38y0HpNW2uN8wAAAABJRU5ErkJggg==',
  // Ledger — converted from core connectors/ledger.ts SVG
  'ledger':
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAAGFBMVEX///8AAABdXV3S0tLDw8NWVlaVlZW6uro7FicMAAAACXBI' +
    'WXMAADsOAAA7DgHMtqGDAAAAXUlEQVR42u3UsRGAIBAAQeQR+u/YgPxHAsdBdyu46EoBAADW1GMKAQIECBAgQIAAAQIECBAgQIAA' +
    'AQIECBAgQIAAAQJ+H3CmxvMBuS5AwIcDot3x2iUAAAAAANjRBfakBNe8ANoIAAAAAElFTkSuQmCC',
  // Rabet — converted from core connectors/rabet.ts SVG
  'rabet':
    'data:image/png;base64,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',
  // Trezor — converted from core connectors/trezor.ts SVG
  'trezor':
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAASFBMVEVMaXEZGRkZGRkZGRkZGRkZGRkZGRkZGRkdHR0aGhoaGhr/' +
    '//+NjY2EhISUlJT19fXh4eHS0tJjY2NRUVFBQUGenp4pKSmurq6x/DpRAAAACnRSTlMAWsg134KY7wccboDcoQAAAAlwSFlzAAA7' +
    'DgAAOw4BzLahgwAAAkRJREFUeNrtm9l6gyAQhREXFGMUUfP+b9qQpqlpLJAonLTOuXb5nYXhwxnGFlSmecEzITeTyHiRpyXzUpkU' +
    'G776DqNI3AxVHujtV4a8sn992Nd/IliskGQygrLkt88vZCQVi0aouIwmvhAJVSYjKnsgqISMKlEhv//RBiWX0cXnkVhIgIpZ/kuI' +
    'butBmWEAsi8n5BKkHJOBD7kIM8DVBKXAAYjSJwX6U9fWL6jtTr1PIjjWgL6rV6jrnWuBwwPHeqWOdh8wllovGOs6LEFqz4H+4stR' +
    'T69E2KTHS+z09jywhoDxfze8HuXD5QH2IOAOA7TDmjwbWocJOLPVgdP57nFdppsgOtnqARMOD+h1ANrhA8Fsdxv7TesAJuNF2wVW' +
    'ABPDa1db1zMIgAD+FoBuvKQDAQzKexegQwAMT2yLZgVkOwBlCvPRQ6YIq+0BtH9hNLbSmwM0TxTGcwlsNgc41PXBF2B+LQEQAAEQ' +
    'AAH8c4BGta1qYADTdYukJhDAbYumMADN9xasgQDM9qgKAjDbpLb7BIC7AB6E8DTEL0TwpZiqIQHsHOD+V879r5koAD9+JXX7A4C7' +
    'YH9ZAD+kgh/TmbBvR5+j4kAHlVKjj2qfOKxWQ7Djep+z4mDH9ZL+mBAAARAAARAAARDADgGiNDLBW7ngzWzwdj54QyO8pTMN21Tr' +
    'bmqFt/XCG5vxrd3w5nZ4ez9+wAE+4oEfcoGP+eAHnfCjXvBhN/y4H37gET/yiR96xY/9vsHgM370+w2G3z8VZvx/8V0fxfp1Yh8f' +
    'qzAAAAAASUVORK5CYII=',
  // WalletConnect — converted from core connectors/walletconnect.ts SVG
  'walletconnect':
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAAJ1BMVEUzlv////9Rpf9Anf/t9v/4/P/h8P+73P9irv91uP+j0P/O' +
    '5v+Gwf9JfUzXAAAACXBIWXMAADsOAAA7DgHMtqGDAAACSklEQVR42u2Z3bYCIQiF82fEQd//eU+dOq0aMcHBzg3f9V6wJxWFLhfD' +
    'MAzDMAzDMAzDMAxjkuD3igClACDWHL6bfMfkDkSo/kvZK7gOEfPy9Lmb/U6qSxdjL25IxGUWMiP9r4W6JL0HxybtC3796CSA8joE' +
    'dEKS6oHwyYnZFJfBRzcDqi3/5tx/OujlT4C17vvtSigdCajkJxcY9rdtHjKmRQ488XGF3F8ZCen5mlTb9Ll/WDf9bRCipMgdy2X0' +
    '2mdwWOHeKmb0ylWAU1x8Uc7/4iDyyiso539W4sQNiMr5Hw4SPyDK5DwHSXLBonL+21NUdsGffafnnS0MysK/fcz7xZG71ijaFMDd' +
    '8ygSso/F4xyPA7OFKCoMz3I+Cgzcioei0gjcUj4lHNbSULiXGcwJ84X5aw0Ch+O9m1n5r0L+AnxyEJoureeg6aeC8AVIBg5El7iR' +
    'Dor4ldi8gYnAgexSWUKYeIU3gUOnS2YIYaoPOAQOhdmNTeYfOQiF2Q9O57/eXFs/cEjMjrTNL3ii9x2EUZ/cF4pahJ4DRp9eNfJf' +
    'HUTq09r82AorLRS/iYjAZFjPFZ6fSiD5sZQwqbSI47lI5Q5wcM1kpnJHSNM9+ufAdUKo6eCt7H4qD3XJfO7YJ/cdnJyRdAK3fXrP' +
    'welpIRmYmhOQl5TGtJJwQD9+CAc609Im8Ja5QqVp7SHwlk8LTzn4FJYtPOFg0FnAkvwvDobdHcgGWhdZy87pLmFN/ntgdncbV/yJ' +
    'iVvxukLDMAzDMAzDMAzDMAzjxg/MghPTn79QiAAAAABJRU5ErkJggg==',
};

/**
 * Normalized display-name → icon key. Covers the names core connectors and
 * WalletConnect peers report ("Freighter Wallet", "LOBSTR", "HOT Wallet",
 * "WalletConnect", …). Keys resolve through resolveWalletIconByKey(), so
 * both built-in and registerMobileWallet()-registered wallets match.
 *
 * Registry names match peer names directly in resolveWalletIconByName();
 * these aliases cover the common variants (e.g. a peer reporting
 * "SafePal Wallet" when the registry entry is "SafePal").
 */
const NAME_ALIASES: Readonly<Record<string, string>> = {
  // Mobile wallets (icons live in the deep-link registry)
  freighter: 'freighter-mobile',
  'freighter wallet': 'freighter-mobile',
  lobstr: 'lobstr-mobile',
  'lobstr wallet': 'lobstr-mobile',
  'hot wallet': 'hot-wallet-mobile',
  hotwallet: 'hot-wallet-mobile',
  'hot': 'hot-wallet-mobile',
  scopuly: 'scopuly-mobile',
  // Additional WC-registered mobile wallets
  safepal: 'safepal-mobile',
  'safepal wallet': 'safepal-mobile',
  'blockchain.com': 'blockchain-mobile',
  'blockchain.com wallet': 'blockchain-mobile',
  'blockchain wallet': 'blockchain-mobile',
  arculus: 'arculus-mobile',
  atomic: 'atomic-mobile',
  coca: 'coca-mobile',
  trustee: 'trustee-mobile',
  hero: 'hero-mobile',
  ukey: 'ukey-mobile',
  ecoin: 'ecoin-mobile',
  swiftex: 'swiftex-mobile',
  panaroma: 'panaroma-mobile',
  kotai: 'kotai-mobile',
  ukiss: 'ukiss-mobile',
  soc: 'soc-mobile',
  // Web connectors (icons above)
  albedo: 'albedo',
  rabet: 'rabet',
  klever: 'klever',
  'klever wallet': 'klever',
  ledger: 'ledger',
  'ledger live': 'ledger',
  trezor: 'trezor',
  walletconnect: 'walletconnect',
  wc: 'walletconnect',
};

/** lowercases, trims, collapses whitespace — " HOT  Wallet " → "hot wallet". */
export function normalizeWalletName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Resolves a wallet icon by key — a core connector id ("albedo",
 * "walletconnect") or a mobile-registry id ("freighter-mobile"). Returns
 * null for unknown keys.
 */
export function resolveWalletIconByKey(key: string | null | undefined): string | null {
  if (!key) return null;
  const png = WALLET_PNG_ICONS[key];
  if (png) return png;
  const mobile = getMobileWallet(key);
  return mobile?.icon ?? null;
}

/**
 * Resolves a wallet icon from a display name (e.g. a WalletConnect peer's
 * name). Checks the alias table first, then the registered mobile wallets'
 * names, then the built-in PNG icon keys. Case/whitespace insensitive.
 */
export function resolveWalletIconByName(name: string | null | undefined): string | null {
  if (!name) return null;
  const normalized = normalizeWalletName(name);
  const aliased = NAME_ALIASES[normalized];
  if (aliased) {
    const icon = resolveWalletIconByKey(aliased);
    if (icon) return icon;
  }
  // Registered mobile wallets (incl. custom registerMobileWallet() entries).
  for (const wallet of listMobileWallets()) {
    if (normalizeWalletName(wallet.name) === normalized) return wallet.icon;
  }
  // Connector names that match a built-in PNG key directly.
  return WALLET_PNG_ICONS[normalized] ?? null;
}
