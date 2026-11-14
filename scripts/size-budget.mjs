#!/usr/bin/env node
/**
 * Story 8 (T-025): bundle size budgets. Run after `npm run build` (`npm run size`).
 * Prints every emitted file with its gzip size and fails when a budget is exceeded.
 * Budgets live here, in one place; raise one only with a note in docs/DECISIONS.md (D-030).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = new URL('../dist/', import.meta.url).pathname;

/** KB. "initial" = what the first screen downloads: index.html + entry JS + entry CSS. */
export const BUDGET = {
  initialJsGzKb: 177, // 172 → 174: D-033 (QA batch 2026-11-13); 174 → 176: D-034 (Story 11 goal check on Home); 176 → 177: D-036 (top-left quick bar, Strength legend copy)
  initialCssGzKb: 16,
  /** Largest lazy chunk (gzip). */
  lazyChunkGzKb: 30,
  /** Everything the service worker precaches (raw bytes on the phone). */
  precacheKb: 1200,
};

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(DIST);

const kb = (n) => Math.round((n / 1024) * 10) / 10;
const rows = files
  .filter((f) => !f.endsWith('.map'))
  .map((f) => {
    const buf = readFileSync(f);
    return { file: relative(DIST, f), raw: buf.length, gz: /\.(js|css|html|svg|json|webmanifest)$/.test(f) ? gzipSync(buf, { level: 9 }).length : buf.length };
  })
  .sort((a, b) => b.gz - a.gz);

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const entry = (re) => rows.find((r) => re.test(r.file) && html.includes(r.file));
const js = entry(/\.js$/);
const css = entry(/\.css$/);
const lazy = rows.filter((r) => r.file.endsWith('.js') && r !== js && r.file.startsWith('assets/'));
const precache = rows.reduce((s, r) => s + r.raw, 0);

console.log('file'.padEnd(52), 'raw KB'.padStart(8), 'gzip KB'.padStart(8));
for (const r of rows) console.log(r.file.padEnd(52), String(kb(r.raw)).padStart(8), String(kb(r.gz)).padStart(8));

const checks = [
  ['initial JS (gzip)', kb(js?.gz ?? 0), BUDGET.initialJsGzKb],
  ['initial CSS (gzip)', kb(css?.gz ?? 0), BUDGET.initialCssGzKb],
  ['largest lazy chunk (gzip)', kb(Math.max(0, ...lazy.map((r) => r.gz))), BUDGET.lazyChunkGzKb],
  ['precache total (raw)', kb(precache), BUDGET.precacheKb],
];
let failed = false;
console.log('\nBudget');
for (const [name, value, max] of checks) {
  const ok = value <= max;
  failed ||= !ok;
  console.log(`${ok ? 'ok  ' : 'OVER'} ${name.padEnd(28)} ${String(value).padStart(7)} KB / ${max} KB`);
}
console.log('SIZE ' + JSON.stringify(Object.fromEntries(checks.map(([n, v]) => [n, v]))));
if (failed) {
  console.error('\nSize budget exceeded. Split the code, or raise the budget with a note in D-030.');
  process.exit(1);
}
