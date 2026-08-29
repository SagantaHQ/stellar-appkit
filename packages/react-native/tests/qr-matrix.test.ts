import { test, expect, describe } from 'bun:test';
import {
  generateQrMatrix,
  qrMatrixToRects,
  rectsToGrid,
  type QrMatrix,
} from '../src/ui/qr/qr-matrix.js';

/** A realistic WalletConnect pairing URI (180 chars — version 9 at level M). */
const WC_URI =
  'wc:9c68a9f3a4d2e1b7c5f0a8d6e4b2c9f1a3d5e7b9c1f3a5d7e9b1c3f5@2?relay-protocol=irn&symKey=4a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5061728394a5b6c7d8e9f&expiry-timestamp=1756900000';

describe('generateQrMatrix — vendored encoder sanity', () => {
  test('module count follows 4·type + 17', () => {
    for (const value of ['HELLO', 'https://stellar.org', WC_URI]) {
      const m = generateQrMatrix(value);
      expect(m.size).toBe(4 * m.typeNumber + 17);
      expect(m.size).toBeGreaterThanOrEqual(21);
      expect(m.size).toBeLessThanOrEqual(177);
    }
  });

  test('finder patterns sit at three corners (TL, TR, BL — never BR)', () => {
    const m = generateQrMatrix('test');
    const { size, isDark } = m;
    const finderDark = (r0: number, c0: number) => {
      // Outer 7×7 border + 3×3 center must be dark; the 1-module ring
      // between them must be light.
      for (let i = 0; i < 7; i++) {
        if (!isDark(r0, c0 + i) || !isDark(r0 + 6, c0 + i)) return false;
        if (!isDark(r0 + i, c0) || !isDark(r0 + i, c0 + 6)) return false;
      }
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          if (!isDark(r0 + 2 + i, c0 + 2 + j)) return false;
        }
      }
      // the light ring between border and center
      if (isDark(r0 + 1, c0 + 1) || isDark(r0 + 1, c0 + 3) || isDark(r0 + 5, c0 + 2)) return false;
      return true;
    };
    expect(finderDark(0, 0)).toBe(true); // top-left
    expect(finderDark(0, size - 7)).toBe(true); // top-right
    expect(finderDark(size - 7, 0)).toBe(true); // bottom-left
    // …and NOT at the bottom-right corner.
    expect(finderDark(size - 7, size - 7)).toBe(false);
  });

  test('timing patterns alternate between finders', () => {
    const m = generateQrMatrix('timing check');
    for (let c = 8; c < m.size - 8; c++) {
      expect(m.isDark(6, c)).toBe(c % 2 === 0);
      expect(m.isDark(c, 6)).toBe(c % 2 === 0);
    }
  });

  test('deterministic: same value → identical matrix', () => {
    const a = generateQrMatrix(WC_URI);
    const b = generateQrMatrix(WC_URI);
    for (let r = 0; r < a.size; r++) {
      for (let c = 0; c < a.size; c++) {
        expect(a.isDark(r, c)).toBe(b.isDark(r, c));
      }
    }
  });

  test('longer WalletConnect URIs pick a larger version, never throw', () => {
    const long = WC_URI + '&methods=stellar_signAndSubmitTx,stellar_signTx&events=chainChanged,accountsChanged';
    const m = generateQrMatrix(long);
    expect(m.typeNumber).toBeGreaterThan(generateQrMatrix(WC_URI).typeNumber);
    expect(m.size).toBeLessThanOrEqual(177);
  });

  test('UTF-8 payloads encode (byte mode)', () => {
    const m = generateQrMatrix('währung ✓ 恒星');
    expect(m.size).toBeGreaterThanOrEqual(21);
  });
});

describe('qrMatrixToRects — View-friendly decomposition', () => {
  test('rects expand back to the exact matrix (inverse property)', () => {
    for (const value of ['HELLO WORLD', 'https://stellar.org', WC_URI]) {
      const m: QrMatrix = generateQrMatrix(value);
      const grid = rectsToGrid(qrMatrixToRects(m), m.size);
      for (let r = 0; r < m.size; r++) {
        for (let c = 0; c < m.size; c++) {
          expect(grid[r]![c]).toBe(m.isDark(r, c));
        }
      }
    }
  });

  test('rects are in-bounds, non-empty, and far fewer than raw modules', () => {
    const m = generateQrMatrix(WC_URI);
    const rects = qrMatrixToRects(m);
    let darkModules = 0;
    for (let r = 0; r < m.size; r++) {
      for (let c = 0; c < m.size; c++) if (m.isDark(r, c)) darkModules++;
    }
    for (const { x, y, w, h } of rects) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(w).toBeGreaterThanOrEqual(1);
      expect(h).toBeGreaterThanOrEqual(1);
      expect(x + w).toBeLessThanOrEqual(m.size);
      expect(y + h).toBeLessThanOrEqual(m.size);
    }
    // The whole point: several hundred Views instead of ~1,400 modules,
    // comfortably inside RN's comfort zone for a static (non-animated) subtree.
    expect(rects.length).toBeLessThan(darkModules / 2);
    expect(rects.length).toBeLessThan(700);
  });

  test('empty value produces no rects upstream (QrCodeView guards it)', () => {
    // The vendored encoder still generates a valid (empty) code — assert it
    // simply works; QrCodeView skips rendering for empty values.
    const m = generateQrMatrix('');
    expect(m.size).toBeGreaterThanOrEqual(21);
  });
});
