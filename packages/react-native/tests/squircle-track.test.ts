/**
 * Squircle track geometry tests — pin the RN spinner to the web SVG spec.
 *
 * The web spinner (ui-web `.connecting-view__arc`) is:
 *   <rect x=3 y=3 width=82 height=82 rx=20 stroke-width=2.5
 *         stroke-dasharray="120 240" />  in an 88×88 viewBox,
 * animated `stroke-dashoffset: 0 → −360` over 2s linear (0.8s for signing).
 *
 * These tests verify the pure-RN port (src/ui/squircle-track.ts) computes
 * the exact same geometry: perimeter, path parameterization, segment
 * coverage, and the conservation of painted length (the comet always
 * paints exactly 120 units — modulo the perimeter's <360 wrap clipping).
 */

import { describe, expect, test } from 'bun:test';
import {
  SQUIRCLE_COMET,
  SQUIRCLE_SPEC,
  buildSquircleTrack,
  cometKeyframes,
  paintedLength,
  pointOnSquirclePath,
  squirclePerimeter,
} from '../src/ui/squircle-track.js';

const P = squirclePerimeter();

describe('squircle spec — the exact web SVG numbers', () => {
  test('viewBox 88, rect 82 at offset 3, radius 20, stroke 2.5', () => {
    expect(SQUIRCLE_SPEC.box).toBe(88);
    expect(SQUIRCLE_SPEC.x).toBe(3);
    expect(SQUIRCLE_SPEC.y).toBe(3);
    expect(SQUIRCLE_SPEC.size).toBe(82);
    expect(SQUIRCLE_SPEC.radius).toBe(20);
    expect(SQUIRCLE_SPEC.strokeWidth).toBe(2.5);
  });

  test('dash pattern 120 on / 240 off, 360 per cycle', () => {
    expect(SQUIRCLE_SPEC.dash).toBe(120);
    expect(SQUIRCLE_SPEC.gap).toBe(240);
    expect(SQUIRCLE_SPEC.period).toBe(360);
  });

  test('durations: 2s connecting (2.5s reduced), 0.8s signing, 2.5s breathe', () => {
    expect(SQUIRCLE_SPEC.connectingDurationMs).toBe(2000);
    expect(SQUIRCLE_SPEC.connectingReducedMotionDurationMs).toBe(2500);
    expect(SQUIRCLE_SPEC.signingDurationMs).toBe(800);
    expect(SQUIRCLE_SPEC.breatheDurationMs).toBe(2500);
    expect(SQUIRCLE_SPEC.breatheScale).toBeCloseTo(1.06, 10);
  });
});

describe('path parameterization — the SVG rect path, clockwise', () => {
  test('perimeter = 4·(82−40) + 2π·20 = 168 + 40π', () => {
    expect(P).toBeCloseTo(4 * 42 + 2 * Math.PI * 20, 9);
    expect(P).toBeCloseTo(293.6637, 3);
  });

  test('starts at (x+rx, y) = (23, 3) heading right — SVG spec', () => {
    const start = pointOnSquirclePath(0);
    expect(start.x).toBeCloseTo(23, 9);
    expect(start.y).toBeCloseTo(3, 9);
    expect(start.angle).toBeCloseTo(0, 9);
  });

  test('clockwise: top edge → right edge → bottom edge → left edge', () => {
    // Rect spans x,y ∈ [3, 85]; corners bite 20 in → straight edges run
    // 23..65 on each axis, and the straight-edge length is 42.
    const midTop = pointOnSquirclePath(21); // middle of the 42-unit top edge
    expect(midTop.y).toBeCloseTo(3, 9);
    expect(midTop.x).toBeCloseTo(44, 9);

    const topEdgeEnd = pointOnSquirclePath(42); // (65, 3) — TR corner start
    expect(topEdgeEnd.x).toBeCloseTo(65, 9);
    expect(topEdgeEnd.y).toBeCloseTo(3, 9);

    const rightEdge = pointOnSquirclePath(42 + 10 * Math.PI + 21);
    expect(rightEdge.x).toBeCloseTo(85, 9); // x + size
    expect(rightEdge.angle).toBeCloseTo(90, 9); // heading down (+y)

    const bottomEdge = pointOnSquirclePath(2 * (42 + 10 * Math.PI) + 21);
    expect(bottomEdge.y).toBeCloseTo(85, 9); // y + size
    expect(bottomEdge.angle).toBeCloseTo(180, 9); // heading left

    const leftEdge = pointOnSquirclePath(3 * (42 + 10 * Math.PI) + 21);
    expect(leftEdge.x).toBeCloseTo(3, 9);
    expect(leftEdge.angle).toBeCloseTo(270, 9); // heading up
  });

  test('wraps: s = P lands back at the start with angle 360 ≡ 0', () => {
    const end = pointOnSquirclePath(P);
    expect(end.x).toBeCloseTo(23, 9);
    expect(end.y).toBeCloseTo(3, 9);
    expect(end.angle % 360).toBeCloseTo(0, 9);
  });

  test('negative s normalizes onto the path', () => {
    const p = pointOnSquirclePath(-1);
    expect(p.x).toBeCloseTo(pointOnSquirclePath(P - 1).x, 9);
    expect(p.y).toBeCloseTo(pointOnSquirclePath(P - 1).y, 9);
  });
});

describe('track segments', () => {
  const track = buildSquircleTrack();

  test('tiles the whole perimeter exactly once (no gaps, no overlap)', () => {
    expect(track[0]!.a).toBe(0);
    expect(track[track.length - 1]!.b).toBeCloseTo(P, 9);
    for (let i = 1; i < track.length; i++) {
      expect(track[i]!.a).toBeCloseTo(track[i - 1]!.b, 9);
    }
  });

  test('segments stay short — comet edges stay sharp', () => {
    for (const seg of track) {
      expect(seg.length).toBeLessThanOrEqual(7.86); // 42/6 edges = 7, 10π/4 corners ≈ 7.85
    }
  });

  test('segment midpoints sit on the path with matching tangents', () => {
    for (const seg of track) {
      const mid = pointOnSquirclePath((seg.a + seg.b) / 2);
      expect(seg.cx).toBeCloseTo(mid.x, 6);
      expect(seg.cy).toBeCloseTo(mid.y, 6);
      expect(seg.angle).toBeCloseTo(mid.angle, 6);
    }
  });
});

describe('dash coverage — the comet', () => {
  test('at t=0 the painted length is exactly 120 (dash from path start)', () => {
    expect(paintedLength(0, P, 0)).toBeCloseTo(120, 9);
  });

  test('painted length is conserved at every t (120 units, ±wrap clipping)', () => {
    // The pattern paints 120 of every 360; the path is 293.67 long, so the
    // clipped total can dip slightly when the comet straddles the seam —
    // but never below 120 − (360 − P) and never above 120.
    for (let i = 0; i <= 72; i++) {
      const t = i / 72;
      const len = paintedLength(0, P, t);
      expect(len).toBeLessThanOrEqual(120 + 1e-9);
      expect(len).toBeGreaterThanOrEqual(120 - (360 - P) - 1e-9);
    }
  });

  test('t=0 and t=1 paint identically — seamless loop', () => {
    // Sample sub-windows so the comparison is local, not just the total.
    const N = 24;
    for (let i = 0; i < N; i++) {
      const a = (i * P) / N;
      const b = ((i + 1) * P) / N;
      expect(paintedLength(a, b, 1)).toBeCloseTo(paintedLength(a, b, 0), 9);
    }
  });

  test('the comet travels clockwise (forward along the path)', () => {
    // A window near the path start is unpainted at t=0 (dash covers
    // [0,120)), then becomes painted once the comet head slides forward
    // past it (front = 360t reaches ~180 at t=0.5 → window [180,300)).
    const nearStart = { a: P - 10, b: P };
    expect(paintedLength(nearStart.a, nearStart.b, 0)).toBeCloseTo(0, 9);
    expect(paintedLength(nearStart.a, nearStart.b, 0.5)).toBeGreaterThan(0);
  });
});

describe('comet keyframes — exact piecewise-linear opacity', () => {
  test('input range is strictly increasing and spans [0,1]', () => {
    for (const seg of SQUIRCLE_COMET) {
      const { input } = seg.keyframes;
      expect(input[0]!).toBe(0);
      expect(input[input.length - 1]!).toBe(1);
      for (let i = 1; i < input.length; i++) {
        expect(input[i]!).toBeGreaterThan(input[i - 1]!);
      }
    }
  });

  test('outputs are clamped fractions in [0,1]', () => {
    for (const seg of SQUIRCLE_COMET) {
      for (const o of seg.keyframes.output) {
        expect(o).toBeGreaterThanOrEqual(0);
        expect(o).toBeLessThanOrEqual(1);
      }
    }
  });

  test('keyframe coverage matches paintedLength at every breakpoint', () => {
    for (const seg of SQUIRCLE_COMET) {
      const { input, output } = seg.keyframes;
      for (let i = 0; i < input.length; i++) {
        const exact = paintedLength(seg.a, seg.b, input[i]!) / seg.length;
        expect(output[i]!).toBeCloseTo(exact, 4);
      }
    }
  });

  test('total lit length integrates to the dash length at any t', () => {
    // Sum over segments of (coverage × length) ≈ paintedLength(0, P, t).
    for (const t of [0, 0.13, 0.37, 0.5, 0.77, 0.999]) {
      let total = 0;
      for (const seg of SQUIRCLE_COMET) {
        // Linear interpolation between keyframes — what RN's Animated does.
        const { input, output } = seg.keyframes;
        let cov: number;
        if (t <= input[0]!) cov = output[0]!;
        else if (t >= input[input.length - 1]!) cov = output[output.length - 1]!;
        else {
          let j = 1;
          while (input[j]! < t) j++;
          const f = (t - input[j - 1]!) / (input[j]! - input[j - 1]!);
          cov = output[j - 1]! + f * (output[j]! - output[j - 1]!);
        }
        total += cov * seg.length;
      }
      expect(total).toBeCloseTo(paintedLength(0, P, t), 2);
    }
  });

  test('degenerate segment (zero length) does not explode', () => {
    const kf = cometKeyframes({ a: 5, b: 5 });
    expect(kf.input.length).toBeGreaterThan(0);
    expect(kf.output.every((o) => Number.isFinite(o))).toBe(true);
  });
});
