/**
 * QrCodeView — renders a QR code with plain React Native Views.
 *
 * Replaces react-native-qrcode-svg (which requires react-native-svg) so the
 * package stays free of native SVG dependencies. The QR matrix is generated
 * by the vendored pure-JS encoder (./qr-matrix.ts) and drawn as merged dark
 * rectangles — pixel-crisp at any size, no image encoding, one View per run.
 */

import React, { useMemo } from 'react';
import { View } from 'react-native';
import { generateQrMatrix, qrMatrixToRects, type QrRect } from './qr-matrix.js';

export interface QrCodeViewProps {
  /** The payload to encode (e.g. a WalletConnect pairing URI). */
  value: string;
  /** Square size in dp. Default 200. */
  size?: number;
  /** Module color. Default '#000000'. */
  color?: string;
  /** Background color (quiet zone included). Default '#FFFFFF'. */
  backgroundColor?: string;
  /** Quiet-zone width in modules. 4 is the spec minimum. Default 4. */
  quietZone?: number;
  /** Optional a11y label; defaults to "QR code". */
  accessibilityLabel?: string;
}

interface Decomposed {
  rects: QrRect[];
  /** Full grid size in modules, quiet zone included. */
  total: number;
}

export function QrCodeView({
  value,
  size = 200,
  color = '#000000',
  backgroundColor = '#FFFFFF',
  quietZone = 4,
  accessibilityLabel = 'QR code',
}: QrCodeViewProps) {
  const { rects, total } = useMemo<Decomposed>(() => {
    if (!value) return { rects: [], total: 0 };
    const matrix = generateQrMatrix(value);
    return { rects: qrMatrixToRects(matrix), total: matrix.size + 2 * quietZone };
  }, [value, quietZone]);

  const modulePct = total > 0 ? 100 / total : 0;

  return (
    <View
      style={{ width: size, height: size, backgroundColor, overflow: 'hidden' }}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      {rects.map((rect, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: `${(quietZone + rect.x) * modulePct}%`,
            top: `${(quietZone + rect.y) * modulePct}%`,
            width: `${rect.w * modulePct}%`,
            height: `${rect.h * modulePct}%`,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}
