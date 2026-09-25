import { defineConfig, devices } from '@playwright/test';
import path from 'path';

// All URLs are driven by env vars so the suite works against any environment
// without code changes. The runner script (scripts/playwright-runner.ps1) sets
// these before invoking `npx playwright test`.
const BASE_URL  = process.env.PLAYWRIGHT_BASE_URL  || 'https://app.aware-wave.com';
const API_URL   = process.env.PLAYWRIGHT_API_URL   || 'https://api.aware-wave.com';
const N8N_URL   = process.env.PLAYWRIGHT_N8N_URL   || 'https://n8n.aware-wave.com';
const CLIENT_URL = process.env.PLAYWRIGHT_CLIENT_URL || '';
const COGNITIVE_URL = process.env.PLAYWRIGHT_COS_URL || 'http://127.0.0.1:8421';

// Screenshot output dir — runner passes this; tests import from env.ts helper
const SCREENSHOTS_DIR = process.env.PLAYWRIGHT_SCREENSHOTS_DIR ||
  path.join(__dirname, 'test-results', 'screenshots');

export { BASE_URL, API_URL, N8N_URL, CLIENT_URL, SCREENSHOTS_DIR };

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  timeout: 30_000,
  reporter: [
    ['html',  { outputFolder: 'playwright-report', open: 'never' }],
    ['json',  { outputFile:   'playwright-results.json' }],
    ['list'],
  ],
  outputDir: 'test-results',

  use: {
    screenshot: 'only-on-failure',
    video:      'off',
    trace:      'on-first-retry',
    // Permissive ignore-HTTPS for self-signed staging certs
    ignoreHTTPSErrors: true,
  },

  projects: [
    // ── Smoke: fast post-deploy sanity (3-5 min) ──────────────────────────
    {
      name: 'smoke',
      testMatch: '**/smoke/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: BASE_URL,
      },
    },
    // ── QA: full UI flows — requires OPS_TEST_EMAIL/PASSWORD ─────────────
    {
      name: 'qa',
      testMatch: '**/qa/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: BASE_URL,
      },
    },
    // ── Client: WordPress site health, screenshots, error check ──────────
    {
      name: 'client',
      testMatch: '**/client/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: CLIENT_URL || BASE_URL,
      },
    },
    // ── Screenshot: headless full-page captures for delivery reports ──────
    {
      name: 'screenshot',
      testMatch: '**/screenshot/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: CLIENT_URL || BASE_URL,
      },
    },
    // ── A11y: WCAG 2.1 AA accessibility audit ─────────────────────────────
    {
      name: 'a11y',
      testMatch: '**/a11y/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: BASE_URL,
      },
    },
    // ── Perf: load timing and Core Web Vitals gate ────────────────────────
    {
      name: 'perf',
      testMatch: '**/perf/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: BASE_URL,
      },
    },
    {
      name: 'cognitive',
      testMatch: '**/cognitive/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: COGNITIVE_URL,
      },
    },
    // ── Mobile smoke: same smoke suite on a Pixel 5 viewport ─────────────
    {
      name: 'mobile-smoke',
      testMatch: '**/smoke/**/*.spec.ts',
      use: {
        ...devices['Pixel 5'],
        baseURL: BASE_URL,
      },
    },
  ],
});
