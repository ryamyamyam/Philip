/**
 * Philip's ink stamps for the workout calendar (Story 6 §3.3, §3.5, T-020): original pixel art drawn
 * as an inline SVG grid, red ink, decorative only (the calendar cell's aria-label carries the meaning).
 * - `done`: a round teacher's stamp with a tick.
 * - `goal`: a "hanamaru" (flower circle). The large one carries よくできました ("well done").
 * Pixels are generated from simple shapes (ring, scalloped flower, spiral, tick) on a fixed grid, so
 * they stay crisp at any whole-pixel size (`shape-rendering: crispEdges`).
 */
import { useMemo } from 'react';

export type StampKind = 'done' | 'goal';
export type StampSize = 'cell' | 'large';

type Px = [number, number];

const near = (d: number, w: number) => Math.abs(d) <= w;

/** Distance from point p to segment ab. */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

/** Ink pixels for a stamp on an n×n grid (pure; exported for tests). */
export function stampPixels(kind: StampKind, n: number): Px[] {
  const out: Px[] = [];
  const c = (n - 1) / 2;
  const R = n / 2 - 0.6;
  const line = Math.max(0.55, n / 26);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = x - c;
      const dy = y - c;
      const r = Math.hypot(dx, dy);
      const th = Math.atan2(dy, dx);
      let ink = false;
      if (kind === 'done') {
        // Double ring on the large stamp only; at cell size the inner ring breaks up.
        ink = near(r - R, line) || (n >= 24 && near(r - (R - 2.2 * line - 0.4), line * 0.5));
        const s = n / 16;
        ink ||= segDist(x, y, c - 3.6 * s, c + 0.2 * s, c - 1.1 * s, c + 2.8 * s) <= line * 0.95;
        ink ||= segDist(x, y, c - 1.1 * s, c + 2.8 * s, c + 3.8 * s, c - 2.9 * s) <= line * 0.95;
      } else {
        // Scalloped flower outline: 5 petals.
        const petal = R * (0.82 + 0.18 * Math.abs(Math.cos((5 / 2) * th)));
        ink = near(r - petal, line);
        // Spiral inside: r = a + b·φ over about 1.6 turns.
        for (let k = 0; k < 2 && !ink; k++) {
          const phi = (th < 0 ? th + 2 * Math.PI : th) + k * 2 * Math.PI;
          const rs = 0.6 + (R * 0.62 * phi) / (3.2 * Math.PI);
          if (phi <= 3.2 * Math.PI && near(r - rs, line * 0.9)) ink = true;
        }
      }
      if (ink) out.push([x, y]);
    }
  }
  return out;
}

const GRID: Record<StampSize, number> = { cell: 16, large: 32 };

export function PixelStamp({ kind, size = 'cell', className }: { kind: StampKind; size?: StampSize; className?: string }) {
  const n = GRID[size];
  const px = useMemo(() => stampPixels(kind, n), [kind, n]);
  const kana = kind === 'goal' && size === 'large';
  const h = kana ? n + 9 : n;
  return (
    <svg
      className={`pm-stamp pm-stamp-${kind} pm-stamp-${size}${className ? ` ${className}` : ''}`}
      viewBox={`0 0 ${n} ${h}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {px.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />
      ))}
      {kana && (
        <text x={n / 2} y={n + 7.5} textAnchor="middle" className="pm-stamp-kana">
          よくできました
        </text>
      )}
    </svg>
  );
}
