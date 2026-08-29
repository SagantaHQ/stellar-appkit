/**
 * Squircle track geometry — the pure math behind the connecting/signing
 * spinner, ported 1:1 from ui-web's `.connecting-view__arc`:
 *
 *   <svg viewBox="0 0 88 88">
 *     <rect x="3" y="3" width="82" height="82" rx="20" ry="20"
 *           stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
 *           stroke-dasharray="120 240" />
 *   </svg>
 *   @keyframes sak-connecting-dash { to { stroke-dashoffset: -360; } }
 *   (2s linear infinite — .signing-view__arc runs the same dash at 0.8s)
 *
 * The web spinner is therefore NOT a circle: it is a rounded-square
 * ("squircle") outline with a ~120-unit dash comet traveling clockwise
 * around its perimeter. This module reproduces that exact geometry with
 * plain numbers so the React Native side can render it with ordinary
 * Views (no react-native-svg dependency) and bun can unit-test every
 * value against the SVG spec.
 *
 * How the RN rendering works (see SquircleArc.tsx):
 * the track is divided into short segments; each segment is a thin,
 * rounded View placed along the path. Every segment's OPACITY is driven
 * by one shared 0→1 progress value through a per-segment keyframe
 * interpolation that reproduces the exact painted fraction of the SVG
 * dash pattern at each point in the cycle. With enough segments the
 * comet's edges slide smoothly (per-segment opacity ramps act as
 * sub-segment "PWM"), and because every interpolation hangs off the
 * same native-driven Animated.Value, the whole spinner animates on the
 * UI thread at 60fps with zero JS involvement.
 */

/** The exact SVG numbers from ui-web styles.ts / connect-modal.ts. */
export const SQUIRCLE_SPEC = {
  /** viewBox side — the spinner renders 1:1 in dp. */
  box: 88,
  /** rect x/y. */
  x: 3,
  y: 3,
  /** rect width/height. */
  size: 82,
  /** corner radius (rx = ry). */
  radius: 20,
  /** stroke-width. */
  strokeWidth: 2.5,
  /** dasharray: painted dash length. */
  dash: 120,
  /** dasharray: gap length. */
  gap: 240,
  /** dash pattern period (dash + gap) — also the dashoffset travel per cycle. */
  period: 360,
  /** connecting-view__arc duration (reduced motion: 2.5s, see below). */
  connectingDurationMs: 2000,
  connectingReducedMotionDurationMs: 2500,
  /** signing-view__arc duration (no reduced-motion override on web). */
  signingDurationMs: 800,
  /** logo breathe duration (disabled under reduced motion). */
  breatheDurationMs: 2500,
  breatheScale: 1.06,
} as const;

/** Total perimeter of the rounded rect: 4·(size − 2r) + 2π·r. */
export function squirclePerimeter(spec = SQUIRCLE_SPEC): number {
  const { size, radius } = spec;
  return 4 * (size - 2 * radius) + 2 * Math.PI * radius;
}

/** A point on the SVG rect path, parameterized by arc length (clockwise). */
export interface PathPoint {
  x: number;
  y: number;
  /** Tangent angle in degrees (0 = +x, 90 = +y / screen-down). */
  angle: number;
}

/**
 * Exact arc-length parameterization of the SVG `<rect>` path.
 *
 * Per the SVG spec the rect path starts at (x + rx, y) — i.e. at the top
 * edge just after the top-left corner — and proceeds clockwise:
 * top edge → TR arc → right edge → BR arc → bottom edge → BL arc →
 * left edge → TL arc → close.
 */
export function pointOnSquirclePath(s: number, spec = SQUIRCLE_SPEC): PathPoint {
  const { x, y, size, radius } = spec;
  const edge = size - 2 * radius; // straight-edge length (42)
  const corner = (Math.PI / 2) * radius; // corner-arc length (10π ≈ 31.416)
  const P = squirclePerimeter(spec);
  // Normalize s into [0, P)
  let u = s % P;
  if (u < 0) u += P;

  const ix = x + radius; // inner corner x (23)
  const iy = y + radius; // inner corner y (23)
  const x2 = x + size - radius; // 65
  const y2 = y + size - radius; // 65
  const deg = (rad: number) => (rad * 180) / Math.PI;

  // 8 sections in path order. Each: [start, end, resolver].
  if (u < edge) {
    // Top edge: (23,3) → (63,3), heading +x
    return { x: ix + u, y: y, angle: 0 };
  }
  u -= edge;
  if (u < corner) {
    // TR arc: center (65,23), from (65,3) to (85,23)
    const phi = u / radius;
    return { x: x2 + radius * Math.sin(phi), y: iy - radius * Math.cos(phi), angle: deg(phi) };
  }
  u -= corner;
  if (u < edge) {
    // Right edge: (85,23) → (85,65), heading +y
    return { x: x + size, y: iy + u, angle: 90 };
  }
  u -= edge;
  if (u < corner) {
    // BR arc: center (65,65), from (85,65) to (65,85)
    const phi = u / radius;
    return { x: x2 + radius * Math.cos(phi), y: y2 + radius * Math.sin(phi), angle: 90 + deg(phi) };
  }
  u -= corner;
  if (u < edge) {
    // Bottom edge: (65,85) → (23,85), heading −x
    return { x: x2 - u, y: y + size, angle: 180 };
  }
  u -= edge;
  if (u < corner) {
    // BL arc: center (23,65), from (23,85) to (3,65)
    const phi = u / radius;
    return { x: ix - radius * Math.sin(phi), y: y2 + radius * Math.cos(phi), angle: 180 + deg(phi) };
  }
  u -= corner;
  if (u < edge) {
    // Left edge: (3,65) → (3,23), heading −y
    return { x: x, y: y2 - u, angle: 270 };
  }
  u -= edge;
  // TL arc: center (23,23), from (3,23) back to (23,3)
  const phi = u / radius;
  return { x: ix - radius * Math.cos(phi), y: iy - radius * Math.sin(phi), angle: 270 + deg(phi) };
}

/** One renderable slice of the track. */
export interface TrackSegment {
  /** Arc-length window on the path, `a < b`, both within [0, perimeter). */
  a: number;
  b: number;
  /** Segment midpoint on the path (viewBox units). */
  cx: number;
  cy: number;
  /** Tangent angle at the midpoint (degrees) — the View's rotation. */
  angle: number;
  /** Segment length along the path (viewBox units). */
  length: number;
}

/**
 * Divides the squircle path into renderable segments: each straight edge
 * into `edgeDivisions` pieces, each corner arc into `cornerDivisions`
 * pieces. Straight-edge segments are geometrically EXACT (the edge is
 * straight); corner segments are chords whose sagitta stays well under
 * half a pixel at the defaults, invisible at stroke 2.5.
 */
export function buildSquircleTrack(
  edgeDivisions = 6,
  cornerDivisions = 4,
  spec = SQUIRCLE_SPEC
): TrackSegment[] {
  const P = squirclePerimeter(spec);
  const edge = spec.size - 2 * spec.radius;
  const corner = (Math.PI / 2) * spec.radius;
  const lengths: number[] = [];
  for (let i = 0; i < 4; i++) {
    for (let e = 0; e < edgeDivisions; e++) lengths.push(edge / edgeDivisions);
    for (let c = 0; c < cornerDivisions; c++) lengths.push(corner / cornerDivisions);
  }
  const segments: TrackSegment[] = [];
  let s = 0;
  for (const len of lengths) {
    const mid = pointOnSquirclePath(s + len / 2, spec);
    segments.push({ a: s, b: s + len, cx: mid.x, cy: mid.y, angle: mid.angle, length: len });
    s += len;
  }
  return segments;
}

/**
 * Painted length of the arc-length window [a, b) under the SVG dash
 * pattern at cycle fraction `t` ∈ [0, 1].
 *
 * The pattern is `dash` painted / `gap` blank, repeating with period
 * `dash + gap` along the path; animating stroke-dashoffset from 0 to
 * −period slides the pattern FORWARD along the path. A path position p
 * is painted iff (p − period·t) mod period ∈ [0, dash) — i.e. iff
 * p ∈ [period·t, period·t + dash) + k·period for some integer k.
 */
export function paintedLength(
  a: number,
  b: number,
  t: number,
  dash: number = SQUIRCLE_SPEC.dash,
  period: number = SQUIRCLE_SPEC.period
): number {
  const front = period * t; // window START (the comet's head-ward edge)
  let total = 0;
  // Any k whose window [front + k·period, front + dash + k·period) can
  // overlap [a, b). One loop either side of the bracket is enough.
  const kMin = Math.floor((a - front - dash) / period) - 1;
  const kMax = Math.floor((b - front) / period) + 1;
  for (let k = kMin; k <= kMax; k++) {
    const wStart = front + k * period;
    const wEnd = wStart + dash;
    const lo = Math.max(a, wStart);
    const hi = Math.min(b, wEnd);
    if (hi > lo) total += hi - lo;
  }
  return total;
}

/** Piecewise-linear opacity keyframes for one segment's Animated interpolation. */
export interface CometKeyframes {
  /** Cycle fractions (strictly increasing, starts at 0, ends at 1). */
  input: number[];
  /** Painted fraction 0..1 at each input. */
  output: number[];
}

/**
 * EXACT opacity keyframes for a segment: the painted fraction of [a, b)
 * is piecewise-linear in t, with slope changes exactly where a window
 * edge (front or front − dash) crosses a segment edge (a or b). We emit
 * those breakpoints (plus 0 and 1) and evaluate the true coverage at
 * each — no sampling, no approximation. Coverage is continuous, and
 * coverage(1) === coverage(0), so the loop seam is invisible.
 */
export function cometKeyframes(
  seg: Pick<TrackSegment, 'a' | 'b'>,
  dash: number = SQUIRCLE_SPEC.dash,
  period: number = SQUIRCLE_SPEC.period
): CometKeyframes {
  if (seg.b <= seg.a) return { input: [0, 1], output: [0, 0] };
  const events = new Set<number>([0, 1]);
  // Coverage changes slope where a window edge (front or front + dash)
  // crosses a segment edge (a or b): front ≡ a, b, a − dash, b − dash.
  for (const base of [seg.a, seg.b, seg.a - dash, seg.b - dash]) {
    let c = base % period;
    if (c < 0) c += period;
    // front ≡ base (mod period) → t = c/period and t = (c−period)/period
    events.add(c / period);
    events.add((c - period) / period);
  }
  const ts = [...events].filter((t) => t >= 0 && t <= 1).sort((p, q) => p - q);

  const input: number[] = [];
  const output: number[] = [];
  for (const t of ts) {
    const cov = paintedLength(seg.a, seg.b, t, dash, period) / (seg.b - seg.a);
    const lastIdx = input.length - 1;
    if (lastIdx >= 0 && t - input[lastIdx]! < 1e-9) {
      // Duplicate breakpoint (window edge crossing exactly at 0/1) — same
      // coverage by continuity; keep a single strictly-increasing entry.
      output[lastIdx] = cov;
      continue;
    }
    input.push(t);
    output.push(Math.min(1, Math.max(0, cov)));
  }
  if (input.length === 0) return { input: [0, 1], output: [0, 0] };
  return { input, output };
}

/**
 * The full static comet description: every track segment with its
 * precomputed keyframes. Pure and deterministic — computed once at
 * module load and shared by every SquircleArc instance.
 */
export interface CometSegment extends TrackSegment {
  keyframes: CometKeyframes;
}

function buildComet(): CometSegment[] {
  return buildSquircleTrack().map((seg) => ({ ...seg, keyframes: cometKeyframes(seg) }));
}

/** Shared, immutable — the spinner's entire geometry in one array. */
export const SQUIRCLE_COMET: CometSegment[] = buildComet();
