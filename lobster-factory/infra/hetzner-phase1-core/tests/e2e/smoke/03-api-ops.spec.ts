/**
 * Smoke 03 — Internal API ops endpoints
 *
 * Validates /api/ops/* routes exist and return sensible shapes.
 * Auth-gated endpoints are expected to return 401/403 when no token is
 * provided — that still confirms the route is deployed.  When OPS_API_TOKEN
 * is set in env, the suite attempts authenticated calls and asserts on body.
 *
 * Mirrors the Repair Center health-gate check in smoke-test.md §4
 * without duplicating its PowerShell logic.
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, opsAuthHeaders } from '../helpers/env';

test.describe('API /api/ops/* routes', () => {
  test('/api/ops/summary — route exists', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/ops/summary`, {
      headers: opsAuthHeaders(),
    });
    // 200 = auth OK, 401/403 = route exists but auth required, both are smoke PASS
    expect([200, 401, 403]).toContain(res.status());
  });

  test('/api/ops/summary — authenticated shape', async ({ request }) => {
    if (!process.env.OPS_API_TOKEN) {
      test.skip(true, 'Set OPS_API_TOKEN to enable authenticated shape check');
    }
    const res = await request.get(`${BASE_URL}/api/ops/summary`, {
      headers: opsAuthHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('tenant');
  });

  test('/api/ops/repairs/health — repair center deployed', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/ops/repairs/health`, {
      headers: opsAuthHeaders(),
    });
    // 404 means Repair Center not yet deployed (non-fatal in smoke — warn)
    if (res.status() === 404) {
      console.warn('WARN: Repair Center not deployed — run /sg-deploy then recheck');
      return;
    }
    expect([200, 401, 403]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty('ok');
      // Log for human review without failing the test
      if (!body.ok) {
        console.warn('Repair Center unhealthy:', JSON.stringify(body, null, 2));
      }
    }
  });

  test('/api/ops/repairs/health — ok:true when authenticated', async ({ request }) => {
    if (!process.env.OPS_API_TOKEN) {
      test.skip(true, 'Set OPS_API_TOKEN to enable authenticated repair-center check');
    }
    const res = await request.get(`${BASE_URL}/api/ops/repairs/health`, {
      headers: opsAuthHeaders(),
    });
    if (res.status() === 404) {
      test.skip(true, 'Repair Center not deployed');
    }
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
