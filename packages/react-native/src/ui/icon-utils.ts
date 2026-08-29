/**
 * Pure wallet-icon resolution utilities — kept separate from the
 * <WalletIcon> component so they're unit-testable without a React Native
 * runtime.
 *
 * Design constraint: the RN package does NOT depend on react-native-svg (a
 * large native library), and RN's <Image> cannot rasterize SVG. So instead
 * of *rendering* SVG sources, we *resolve around* them:
 *
 *   1. an explicit wallet key (connector id / mobile wallet id) → the
 *      pre-rasterized PNG registry (./wallet-icons.ts)
 *   2. a source that is already a raster (PNG/JPEG/GIF/WebP data URI or a
 *      non-SVG https URL) → used as-is by <Image>
 *   3. a wallet display name (WalletConnect peer metadata) → the PNG
 *      registry by name
 *   4. anything else (SVG data URI / SVG URL with no registry match) →
 *      null → the branded letter-avatar fallback
 */

import { resolveWalletIconByKey, resolveWalletIconByName } from './wallet-icons.js';

/** How an icon source can be handled without an SVG library. */
export type IconKind = 'raster-data' | 'raster-url' | 'svg' | 'none';

/**
 * Classifies an icon source:
 * - `data:image/png|jpeg|gif|webp;base64,...` → 'raster-data' (RN <Image>)
 * - `https://.../*.svg` / `data:image/svg+xml,...` → 'svg' (needs registry)
 * - other `https://...` → 'raster-url' (RN <Image>)
 * - anything else → 'none'
 */
export function classifyIconSource(source: string): IconKind {
  if (source.startsWith('data:')) {
    if (source.startsWith('data:image/svg')) return 'svg';
    if (/^data:image\/(png|jpe?g|gif|webp|bmp)/i.test(source)) return 'raster-data';
    return 'none';
  }
  if (/^https?:\/\//i.test(source)) {
    return /\.svg(\?|#|$)/i.test(source) ? 'svg' : 'raster-url';
  }
  return 'none';
}

export interface ResolveWalletIconOptions {
  /** Raw icon source from connector meta / peer metadata — may be SVG. */
  source?: string | null;
  /** Explicit wallet key: connector id ("albedo") or mobile wallet id ("freighter-mobile"). */
  walletKey?: string | null;
  /** Wallet display name — used to match WC peer metadata to a known logo. */
  name?: string | null;
}

/**
 * Resolves the best renderable image URI for a wallet, or null when only
 * the letter-avatar fallback can be shown. Resolution order:
 * key → raster source → name.
 *
 * (Key wins over the source: list rows pass the authoritative id even when
 * the connector's own icon is an unrenderable SVG. The account view passes
 * no key, so a WalletConnect peer's PNG URL or name matches first.)
 */
export function resolveWalletIcon(options: ResolveWalletIconOptions): string | null {
  const { source, walletKey, name } = options;

  const byKey = resolveWalletIconByKey(walletKey);
  if (byKey) return byKey;

  if (source && classifyIconSource(source) !== 'none' && classifyIconSource(source) !== 'svg') {
    return source;
  }

  return resolveWalletIconByName(name);
}

/**
 * Deterministic hue-based background for the letter-avatar fallback — every
 * wallet gets a stable, distinct color derived from its name.
 */
export function fallbackBackgroundColor(label: string): string {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 45%, 38%)`;
}
