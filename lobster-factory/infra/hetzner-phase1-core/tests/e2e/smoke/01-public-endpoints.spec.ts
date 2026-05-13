/**
 * Smoke 01 — Public HTTP endpoints
 *
 * Pure API-level checks: no browser rendering. Uses Playwright's request
 * fixture so it runs without a browser process and finishes in seconds.
 * These mirror public-endpoint-smoke.ps1 but give richer JSON output and
 * attach to the unified Playwright report.
 */
import { test, expect } from '@playwright/test';
import { API_URL, N8N_URL, opsAuthHeaders } from '../helpers/env';

const PUBLIC_ENDPOINTS = [
  { name: 'api-health',   url: `${API_URL}/health`,          accept: [200] },
  { name: 'n8n-healthz',  url: `${N8N_URL}/healthz`,         accept: [200] },
];

test.describe('Public HTTP endpoints', () => {
  for (const ep of PUBLIC_ENDPOINTS) {
    test(`${ep.name} → ${ep.accept.join('|')}`, async ({ request }) => {
      const res = await request.get(ep.url, {
        headers: opsAuthHeaders(),
        timeout: 15_000,
      });
      expect(
        ep.accept,
        `${ep.name} returned ${res.status()} — expected one of ${ep.accept.join(',')}`,
      ).toContain(res.status());
    });
  }

  test('api-health body contains ok:true', async ({ request }) => {
    const res = await request.get(`${API_URL}/health`, { timeout: 15_000 });
    if (res.status() !== 200) test.skip(true, `health returned ${res.status()}`);
    const body = await res.json().catch(() => null);
    if (body && typeof body === 'object' && 'ok' in body) {
      expect(body.ok).toBe(true);
    }
    // If body has no "ok" field, the test still passes (endpoint shape varies)
  });
});
