/**
 * Ambient "world" surface (D-022), drawn as pixel art: simple shapes (ground, path, bushes, a tree,
 * a plate) are rasterized onto an 80×30 grid with a 1-cell dark outline, then each color becomes one
 * crisp path. Only for empty states, onboarding and the photo-analysis wait. Always decorative.
 * `analyzing` adds a magnifier that steps across the plate (still under reduced motion).
 */
const W = 80;
const H = 30;

type Fill = 'sky' | 'ground' | 'path' | 'shadow' | 'leaf' | 'leaf-2' | 'trunk' | 'plate' | 'plate-in' | 'food-a' | 'food-b' | 'food-c' | 'outline';
type Shape = { fill: Fill; outline: boolean; test: (x: number, y: number) => boolean };

const inEllipse = (cx: number, cy: number, rx: number, ry: number) => (x: number, y: number) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const inCircle = (cx: number, cy: number, r: number) => inEllipse(cx, cy, r, r);
const inRect = (x0: number, y0: number, x1: number, y1: number) => (x: number, y: number) => x >= x0 && x < x1 && y >= y0 && y < y1;
const groundY = (x: number) => 17 + 1.3 * Math.sin((x / W) * Math.PI * 2 + 0.6);
const pathCenter = (y: number) => 40 + (30 - y) * 1.25;
const pathHalf = (y: number) => 1.8 + (y - 17) * 0.32;

// Bottom → top.
const SHAPES: Shape[] = [
  { fill: 'ground', outline: true, test: (x, y) => y >= groundY(x) },
  { fill: 'path', outline: true, test: (x, y) => y >= 17.5 && Math.abs(x - pathCenter(y)) <= pathHalf(y) },
  { fill: 'shadow', outline: false, test: inEllipse(11, 21.6, 6.5, 1.2) },
  { fill: 'shadow', outline: false, test: inEllipse(70, 20.6, 5, 1) },
  { fill: 'shadow', outline: false, test: inEllipse(62.5, 24.2, 3.5, 0.8) },
  { fill: 'shadow', outline: false, test: inEllipse(23, 25.6, 2.8, 0.7) },
  { fill: 'shadow', outline: false, test: inEllipse(40, 23.6, 8, 1.1) },
  { fill: 'leaf', outline: true, test: inCircle(8.5, 18.5, 3.8) },
  { fill: 'leaf-2', outline: true, test: inCircle(13.5, 19.2, 3.2) },
  { fill: 'trunk', outline: true, test: inRect(69, 13, 71.5, 20.5) },
  { fill: 'leaf', outline: true, test: inCircle(70.2, 10.5, 5) },
  { fill: 'leaf-2', outline: true, test: inCircle(62.5, 22.2, 2.4) },
  { fill: 'leaf-2', outline: true, test: inCircle(23, 24.2, 1.9) },
  { fill: 'plate', outline: true, test: inEllipse(40, 21.6, 7.5, 2.4) },
  { fill: 'plate-in', outline: false, test: inEllipse(40, 21.4, 4.6, 1.3) },
  { fill: 'food-a', outline: false, test: inRect(37, 20.5, 39, 22) },
  { fill: 'food-b', outline: false, test: inRect(40, 20, 42, 21.5) },
  { fill: 'food-c', outline: false, test: inRect(42, 21, 44, 22) },
];

function raster(shapes: Shape[]): Fill[][] {
  const grid: Fill[][] = Array.from({ length: H }, () => Array<Fill>(W).fill('sky'));
  for (const s of shapes) {
    const hit = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && s.test(x + 0.5, y + 0.5);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!hit(x, y)) continue;
        const edge = s.outline && (!hit(x - 1, y) || !hit(x + 1, y) || !hit(x, y - 1) || (!hit(x, y + 1) && y + 1 < H));
        const row = grid[y];
        if (row) row[x] = edge ? 'outline' : s.fill;
      }
    }
  }
  return grid;
}

function toPaths(grid: Fill[][]): [Fill, string][] {
  const out = new Map<Fill, string>();
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const f = row[x] ?? 'sky';
      const start = x;
      while (x < row.length && row[x] === f) x++;
      out.set(f, (out.get(f) ?? '') + `M${start} ${y}h${x - start}v1h${start - x}z`);
    }
  });
  return [...out.entries()];
}

const SCENE = toPaths(raster(SHAPES));

// Magnifier: ring + glass + handle, its own little grid so it can step across.
const LENS = toPaths(
  raster([
    { fill: 'outline', outline: false, test: (x, y) => { const d = Math.hypot(x - 44, y - 14); return d <= 3.6 && d >= 2.4; } },
    { fill: 'plate-in', outline: false, test: inCircle(44, 14, 2.4) },
    { fill: 'outline', outline: false, test: (x, y) => x >= 46.5 && x <= 50 && Math.abs(y - 14 - (x - 44)) <= 0.9 },
  ]),
).filter(([f]) => f !== 'sky');

export function AmbientScene({ variant }: { variant: 'empty' | 'analyzing' }) {
  return (
    <svg
      className={`pm-world pm-world-${variant}`}
      viewBox={`0 0 ${W} ${H}`}
      shapeRendering="crispEdges"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      {SCENE.map(([f, d]) => (
        <path key={f} className={`pm-world-${f}`} d={d} />
      ))}
      {variant === 'analyzing' && (
        <g className="pm-world-lens">
          {LENS.map(([f, d]) => (
            <path key={f} className={`pm-world-${f}`} d={d} />
          ))}
        </g>
      )}
    </svg>
  );
}
