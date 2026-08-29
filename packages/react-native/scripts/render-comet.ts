/**
 * ASCII smoke test — renders the squircle comet at several cycle fractions
 * so the geometry can be eyeballed without a device. Run:
 *   bun run scripts/render-comet.ts
 */
import { SQUIRCLE_COMET, paintedLength, pointOnSquirclePath, squirclePerimeter } from '../src/ui/squircle-track.js';

const P = squirclePerimeter();
const GRID = 44;

function covAt(seg: (typeof SQUIRCLE_COMET)[number], t: number): number {
  const { input, output } = seg.keyframes;
  if (t <= input[0]!) return output[0]!;
  if (t >= input[input.length - 1]!) return output[output.length - 1]!;
  let j = 1;
  while (input[j]! < t) j++;
  const f = (t - input[j - 1]!) / (input[j]! - input[j - 1]!);
  return output[j - 1]! + f * (output[j]! - output[j - 1]!);
}

function frame(t: number): string {
  const rows: string[][] = Array.from({ length: GRID }, () => Array.from({ length: GRID }, () => ' '));
  const N = 600;
  for (let i = 0; i < N; i++) {
    const s = (i / N) * P;
    const seg = SQUIRCLE_COMET.find((sg) => s >= sg.a && s < sg.b);
    if (!seg) continue;
    const cov = covAt(seg, t);
    if (cov <= 0.15) continue;
    const p = pointOnSquirclePath(s);
    const gx = Math.round((p.x / 88) * (GRID - 1));
    const gy = Math.round((p.y / 88) * (GRID - 1));
    rows[gy]![gx] = cov > 0.6 ? '█' : cov > 0.3 ? '▓' : '░';
  }
  return rows.map((r) => r.join('')).join('\n');
}

for (const t of [0, 0.15, 0.35, 0.5, 0.75, 0.9]) {
  console.log(`\n=== t = ${t} (painted: ${paintedLength(0, P, t).toFixed(1)} / ${P.toFixed(1)}) ===`);
  console.log(frame(t));
}
