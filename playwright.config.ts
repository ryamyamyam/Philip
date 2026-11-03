import { defineConfig, devices } from '@playwright/test';

/**
 * Primary target is WebKit (closest to iPhone Safari): `npx playwright install webkit` once.
 * The chromium-mobile project exists for environments where WebKit isn't installed.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/',
    trace: 'retain-on-failure',
    serviceWorkers: 'allow',
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    // WebKit: page.route() misses fetches from service-worker-controlled pages, so mocked Gemini
    // calls leaked to the real API. Block the SW here; offline is covered in Chromium (and skipped on WebKit).
    { name: 'webkit-iphone', use: { ...devices['iPhone 15'], serviceWorkers: 'block' } },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    },
  ],
});
