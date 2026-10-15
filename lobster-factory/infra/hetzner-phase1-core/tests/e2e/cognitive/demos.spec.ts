import { test, expect } from '@playwright/test';
import { DEMOS } from '../../../../../../Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/toolsheets.generated';

// Every free 示範分析 page DEMOS lists (fixtures/demo, template §6) opens as the full read-only result page: the nine
// sections and the approve card, the demo strip, no page error. An unknown domain is a 404, and the first demo's old
// address (/projects/demo/iceberg) still lands on it. Mock mode needs no API: the pages read their checked-in fixture.
test('every demo result page opens with its nine sections, read-only', async ({ page, context, baseURL }) => {
  test.setTimeout(900_000);   // the dev server compiles the route on first hit
  const mockApi = process.env.COS_TEST_MOCK_API === '1';
  if (mockApi) {
    await context.addCookies([{ name: 'cognitive_os_session', value: 'local-test', url: baseURL! }]);
    await page.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  } else {
    const [tenant, email, password] = [process.env.COS_TEST_TENANT_ID, process.env.COS_TEST_EMAIL, process.env.COS_TEST_PASSWORD];
    test.skip(!tenant || !email || !password, 'COS_TEST_TENANT_ID / COS_TEST_EMAIL / COS_TEST_PASSWORD missing');
    expect((await page.request.post('/api/auth/login', { data: { tenant_id: tenant, email, password } })).ok()).toBe(true);
  }
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  const entries = Object.entries(DEMOS).flatMap(([method, list]) => list.map((entry) => ({ method, ...entry })));
  expect(entries.length).toBeGreaterThan(0);
  for (const entry of entries) {
    await page.goto(entry.href, { timeout: 300_000 });
    await expect(page.locator('[data-section="approve"]'), entry.href).toBeVisible({ timeout: 120_000 });
    const sections = await page.locator('[data-section]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-section')));
    expect(sections, entry.href).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'approve']);
    await expect(page.getByText('示範分析（免費，不花錢）'), entry.href).toBeVisible();
    await expect(page.locator(`[data-method="${entry.method}"]`).first(), entry.href).toBeAttached();   // card ② is this tool's picture
  }
  // an unknown domain is the not-found page, status 404 (cognitive-web middleware.ts; not-found-status.spec.ts covers the rest)
  expect((await page.goto(`/projects/demo/${entries[0].method}/no-such-domain`))?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'This page could not be found.' })).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('[data-section]')).toHaveCount(0);
  await page.goto('/projects/demo/iceberg');
  await expect(page).toHaveURL(/\/projects\/demo\/systems\.iceberg_model$/);
  expect(errors).toEqual([]);
});
