/**
 * Geometry pins for the pure-View icon primitives (ui/icons.tsx).
 *
 * WHY SOURCE-LEVEL: these tests run under bun with no React Native
 * renderer, so they pin the geometry the same way the other UI wiring
 * tests do — by asserting the constants that determine what gets painted.
 * The bug that triggered this file: RetryIcon (the "reload" arrow shown
 * on every Try-again pill and the WebView toolbar's reload button) hid
 * TWO border quarters (top+left) and painted only a HALF ring where the
 * web SVG `M3 12a9 9 0 1 0 9-9` draws a ¾ ring — the icon read as a
 * broken half-circle ("the reload icon looks weird").
 *
 * The fixed construction (and what these tests keep true):
 * - stroke centered on the r=9 path: 20-unit box at (2,2), borderWidth 2,
 *   borderRadius 10 → border centerline exactly r=9 (outer 10, inner 8),
 *   matching the web SVG's stroked circle
 * - exactly ONE transparent quarter (the left), then a +45° rotation
 *   (clockwise) moves that gap from west to the top-left quarter
 *   (9:00→12:00) — precisely where the web arc opens
 */

import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ICONS_SRC = fs.readFileSync(
  path.resolve(import.meta.dir, '../src/ui/icons.tsx'),
  'utf-8'
);

/** Extracts a single exported component's source block. */
function componentSrc(name: string): string {
  const start = ICONS_SRC.indexOf(`export function ${name}`);
  expect(start).toBeGreaterThan(-1); // component must exist
  const next = ICONS_SRC.indexOf('\nexport function ', start + 1);
  return ICONS_SRC.slice(start, next === -1 ? undefined : next);
}

describe('RetryIcon — the ¾-ring "reload" arrow (web parity)', () => {
  const retry = componentSrc('RetryIcon');

  test('hides exactly ONE border quarter, never two (the half-ring regression)', () => {
    const transparentSides = (retry.match(/border(Top|Left|Right|Bottom)Color: 'transparent'/g) ?? []).length;
    expect(transparentSides).toBe(1);
    // And it's the LEFT quarter — the one the +45° rotation moves into the
    // top-left gap where the web arc opens.
    expect(retry).toContain("borderLeftColor: 'transparent'");
  });

  test('rotates the ring +45° so the gap lands on the top-left quarter', () => {
    // One quarter hidden (gap centered on 9:00/west, spanning 7:30→10:30);
    // rotate 45deg (clockwise on screen) moves it to 9:00→12:00 — the exact
    // opening of the web arc `M3 12a9 9 0 1 0 9-9` (start (3,12)=9:00,
    // end (12,3)=12:00, large-arc=1 → the 270° body through the bottom).
    expect(retry).toContain("rotate: '45deg'");
    // Only the RING rotates — the arrowhead bars must stay axis-aligned.
    expect(retry.match(/transform: \[/g)?.length).toBe(1);
  });

  test('centers the stroke on the r=9 path like the web SVG', () => {
    // Box 20 at (2,2) with borderWidth 2 → border centerline at
    // 10 − 1 = r=9 from the (12,12) center; web strokes the r=9 circle
    // with width 2 (outer r=10, inner r=8). The old 18-box at (3,3) drew
    // the whole stroke INSIDE r=9.
    expect(retry).toContain('const box = 20 * s');
    expect(retry).toContain('left: 2 * s');
    expect(retry).toContain('borderRadius: 10 * s');
    expect(retry).toContain('borderWidth: sw');
    expect(retry).toContain('const sw = 2 * s');
  });

  test("keeps the web arrowhead bracket `M3 4v5h5`", () => {
    // Vertical arm (3,4)→(3,9) and horizontal arm (3,9)→(8,9), stroke 2.
    expect(retry).toContain('<Bar x1={3} y1={4} x2={3} y2={9}');
    expect(retry).toContain('<Bar x1={3} y1={9} x2={8} y2={9}');
  });
});

describe('full-ring icons never grow gaps', () => {
  // AlertCircle (r=7 ring at 20 viewBox) and CircleX (r=10 ring at 24
  // viewBox) are complete circles — any transparent border side would
  // reproduce the half-ring bug in a different icon.
  test('AlertCircleIcon and CircleXIcon keep all four border sides solid', () => {
    for (const name of ['AlertCircleIcon', 'CircleXIcon']) {
      const src = componentSrc(name);
      expect(src).not.toMatch(/border(Top|Left|Right|Bottom)Color: 'transparent'/);
    }
  });
});
