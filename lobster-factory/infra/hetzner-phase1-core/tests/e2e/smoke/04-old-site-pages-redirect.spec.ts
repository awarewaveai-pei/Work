/**
 * Smoke 04 — the retired site-building pages answer with the one site flow.
 *
 * /onboard (建站精靈) and /build (Build Console) retired 2026-11-23 (card SF-P,
 * SITE-FLOW-COMPLETION-PLAN.md §1 row 2): next-admin next.config.ts redirects both, permanently (308), to
 * /ops/sites/new. A 404 here means the redirect is gone; a 200 means an old page came back.
 *
 * nginx auth_basic sits in front of the app, so the request carries OPS_BASIC_USER / OPS_BASIC_PASSWORD
 * (mcp/user-env.ps1). Missing credentials fail with a setup message instead of a silent skip.
 */
import { test, expect } from '@playwright/test';
import { opsBasicHttpCredentials } from '../helpers/env';

const creds = opsBasicHttpCredentials();
test.use({ httpCredentials: creds });

test.describe('retired site-building pages redirect to /ops/sites/new', () => {
  test.beforeAll(() => {
    expect(
      creds,
      'OPS_BASIC_USER / OPS_BASIC_PASSWORD not set. Add them to mcp/user-env.ps1 and re-run it so setx persists to User scope, then restart the shell.',
    ).toBeDefined();
  });

  for (const oldPath of ['/onboard', '/build']) {
    test(`GET ${oldPath} is a 308 to /ops/sites/new`, async ({ request }) => {
      const res = await request.get(oldPath, { maxRedirects: 0 });
      expect(res.status(), `${oldPath} returned ${res.status()}`).toBe(308);
      expect(new URL(res.headers()['location'] ?? '', 'http://x').pathname).toBe('/ops/sites/new');
    });
  }
});
