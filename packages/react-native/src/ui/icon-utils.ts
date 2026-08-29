/**
 * Pure wallet-icon source utilities — kept separate from the <WalletIcon>
 * component so they're unit-testable without a React Native runtime.
 *
 * Classifies every icon source the SDK produces (core connectors ship SVG
 * data URIs; the mobile wallet registry ships PNG/JPEG data URIs; WC peer
 * metadata ships https URLs) and decodes SVG data URIs to XML for
 * react-native-svg.
 */

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const b64Lookup = new Map<string, number>();
for (let i = 0; i < B64_ALPHABET.length; i++) b64Lookup.set(B64_ALPHABET[i]!, i);

/** Pure-JS base64 → UTF-8 string. No Buffer/atob dependency (Hermes-safe). */
export function decodeBase64(input: string): string {
  const clean = input.replace(/[^A-Za-z0-9+/=]/g, '');
  let out = '';
  for (let i = 0; i < clean.length; i += 4) {
    const c1 = b64Lookup.get(clean[i] ?? '');
    const c2 = b64Lookup.get(clean[i + 1] ?? '');
    const c3 = b64Lookup.get(clean[i + 2] ?? '');
    const c4 = b64Lookup.get(clean[i + 3] ?? '');
    if (c1 === undefined || c2 === undefined) break;
    const n = (c1 << 18) | (c2 << 12) | ((c3 ?? 0) << 6) | (c4 ?? 0);
    out += String.fromCharCode((n >> 16) & 0xff);
    if (clean[i + 2] && clean[i + 2] !== '=') out += String.fromCharCode((n >> 8) & 0xff);
    if (clean[i + 3] && clean[i + 3] !== '=') out += String.fromCharCode(n & 0xff);
  }
  // UTF-8 decode (wallet SVGs occasionally contain multi-byte chars).
  try {
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return new TextDecoder().decode(bytes);
  } catch {
    return out;
  }
}

/** How an icon source should be rendered. */
export type IconKind = 'raster-data' | 'svg-data' | 'svg-url' | 'raster-url' | 'none';

/**
 * Classifies an icon source:
 * - `data:image/png|jpeg|gif|webp;base64,...` → 'raster-data' (RN Image)
 * - `data:image/svg+xml;base64,...` / `;utf8,` → 'svg-data' (SvgXml)
 * - `https://.../*.svg` → 'svg-url' (SvgUri)
 * - other `https://...` → 'raster-url' (RN Image)
 * - anything else → 'none' (letter-avatar fallback)
 */
export function classifyIconSource(source: string): IconKind {
  if (source.startsWith('data:')) {
    if (source.startsWith('data:image/svg')) return 'svg-data';
    if (/^data:image\/(png|jpe?g|gif|webp|bmp)/i.test(source)) return 'raster-data';
    return 'none';
  }
  if (/^https?:\/\//i.test(source)) {
    return /\.svg(\?|#|$)/i.test(source) ? 'svg-url' : 'raster-url';
  }
  return 'none';
}

/** Decodes an SVG data URI (base64 or utf8/URL-encoded) to its XML text. */
export function decodeSvgDataUri(uri: string): string | null {
  const commaIndex = uri.indexOf(',');
  if (commaIndex < 0) return null;
  const meta = uri.slice(0, commaIndex);
  const payload = uri.slice(commaIndex + 1);
  let xml: string;
  if (meta.includes('base64')) {
    xml = decodeBase64(payload);
  } else {
    // utf8 or URL-encoded payload ("%3Csvg..." → "<svg...")
    try {
      xml = decodeURIComponent(payload);
    } catch {
      xml = payload;
    }
  }
  const result = xml.trim().startsWith('<') ? xml : null;
  return result;
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
