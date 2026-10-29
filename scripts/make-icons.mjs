// Regenerates PNG icons from public/favicon.svg. Requires `sharp` (npx or global install).
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url));
// Full-bleed square for iOS (iOS applies its own corner mask) and maskable Android icons.
const square = Buffer.from(svg.toString().replace('rx="112"', 'rx="0"'));
for (const [name, size, src] of [['icon-192.png', 192, svg], ['icon-512.png', 512, square], ['apple-touch-icon.png', 180, square]]) {
  await sharp(src).resize(size, size).png().toFile(new URL(`../public/${name}`, import.meta.url).pathname);
  console.log('wrote', name);
}
