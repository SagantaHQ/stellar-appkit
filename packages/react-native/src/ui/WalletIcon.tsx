/**
 * WalletIcon — renders every wallet-icon format the SDK encounters on
 * React Native, which plain `<Image>` cannot:
 *
 * - `data:image/png;base64,...` / jpeg / gif / webp → RN `<Image>` (native)
 * - `data:image/svg+xml;base64,...` → base64-decoded and rendered with
 *   `<SvgXml>` from react-native-svg (RN `<Image>` can't rasterize SVG)
 * - `data:image/svg+xml;utf8,...` / `%3Csvg...` → unescaped → `<SvgXml>`
 * - `https://.../*.svg` → `<SvgUri>` (remote SVG)
 * - `https://...` (png/jpg/…) → RN `<Image>`
 * - null / undefined / render error → branded letter-avatar fallback
 *
 * This is why icons "didn't show" before: every connector in core ships an
 * SVG data-URI icon, and `<Image source={{ uri: 'data:image/svg+xml;...' }}>`
 * silently renders nothing on RN.
 *
 * The source classification/decoding logic lives in ./icon-utils.ts (pure,
 * unit-tested); this file is the rendering layer.
 */

import React, { useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SvgUri, SvgXml } from 'react-native-svg';
import {
  classifyIconSource,
  decodeSvgDataUri,
  fallbackBackgroundColor,
  type IconKind,
} from './icon-utils.js';

export interface WalletIconProps {
  /** The icon source — data URI or https URL. May be null/undefined. */
  source: string | null | undefined;
  /** Fallback label (wallet name) for the letter avatar. */
  fallbackLabel?: string;
  /** Icon size in dp (square). Default 40. */
  size?: number;
  /** Corner radius in dp. Default 12. */
  radius?: number;
  /** Text color on the letter-avatar fallback background. */
  accentTextColor?: string;
}

// Memoized per-URI SVG XML cache (icons re-render on every sheet open).
const svgCache = new Map<string, string>();
function cachedSvgXml(uri: string): string | null {
  const cached = svgCache.get(uri);
  if (cached !== undefined) return cached;
  const xml = decodeSvgDataUri(uri);
  if (xml !== null && svgCache.size < 128) svgCache.set(uri, xml);
  return xml;
}

export function WalletIcon({
  source,
  fallbackLabel = '?',
  size = 40,
  radius = 12,
  accentTextColor = '#FFFFFF',
}: WalletIconProps) {
  const [failed, setFailed] = useState(false);
  const kind: IconKind = source ? classifyIconSource(source) : 'none';
  const svgXml = useMemo(
    () => (kind === 'svg-data' && source ? cachedSvgXml(source) : null),
    [kind, source]
  );

  const boxStyle = { width: size, height: size, borderRadius: radius };
  const letter = (fallbackLabel.trim()[0] ?? '?').toUpperCase();

  // 1. Raster data URI / remote raster → plain Image (RN-native support)
  if ((kind === 'raster-data' || kind === 'raster-url') && source && !failed) {
    return (
      <Image
        source={{ uri: source }}
        style={boxStyle}
        resizeMode="cover"
        accessible
        accessibilityLabel={fallbackLabel}
        onError={() => setFailed(true)}
      />
    );
  }

  // 2. SVG data URI → decode → SvgXml
  if (kind === 'svg-data' && svgXml && !failed) {
    return (
      <View style={[boxStyle, styles.overflowHidden]}>
        <SvgXml xml={svgXml} width={size} height={size} onError={() => setFailed(true)} />
      </View>
    );
  }

  // 3. Remote SVG → SvgUri
  if (kind === 'svg-url' && source && !failed) {
    return (
      <View style={[boxStyle, styles.overflowHidden]}>
        <SvgUri uri={source} width={size} height={size} onError={() => setFailed(true)} />
      </View>
    );
  }

  // 4. Fallback — branded letter avatar
  return (
    <View
      style={[boxStyle, styles.fallback, { backgroundColor: fallbackBackgroundColor(fallbackLabel) }]}
      accessible
      accessibilityLabel={fallbackLabel}
    >
      <Text style={[styles.fallbackText, { color: accentTextColor, fontSize: Math.round(size * 0.42) }]}>
        {letter}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overflowHidden: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackText: { fontWeight: '700' },
});
