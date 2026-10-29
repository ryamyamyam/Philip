/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * Generates dist/sw.js with a precache list of every emitted file.
 * Hand-rolled instead of a PWA plugin to keep dependencies minimal.
 */
function serviceWorker(): Plugin {
  return {
    name: 'philip-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const publicFiles = ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'favicon.svg'];
      const precache = ['./', ...files.map((f) => `./${f}`), ...publicFiles.map((f) => `./${f}`)];
      const version = createHash('sha256').update(precache.join('|') + Date.now()).digest('hex').slice(0, 12);
      const template = readFileSync(new URL('./src/sw-template.js', import.meta.url), 'utf8');
      const source = template
        .replace('__PRECACHE__', JSON.stringify(precache))
        .replace('__VERSION__', JSON.stringify(version));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  // Relative base so the build works at https://<user>.github.io/<repo>/ for any repo name.
  base: './',
  define: { __APP_VERSION__: JSON.stringify((JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version) },
  plugins: [react(), serviceWorker()],
  build: { target: 'es2022', sourcemap: false },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
});
