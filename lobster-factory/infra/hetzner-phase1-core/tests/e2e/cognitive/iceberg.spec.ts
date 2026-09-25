import { test, expect } from '@playwright/test';

test('login -> iceberg -> result page sections including 5b', async ({ page }) => {
  test.setTimeout(180_000);
  const mockApi = process.env.COS_TEST_MOCK_API === '1';
  const tenant = mockApi ? 'tenant-local' : process.env.COS_TEST_TENANT_ID;
  const email = mockApi ? 'local@example.test' : process.env.COS_TEST_EMAIL;
  const password = mockApi ? 'local-only' : process.env.COS_TEST_PASSWORD;
  test.skip(!mockApi && (!tenant || !email || !password), 'COS_TEST_TENANT_ID / COS_TEST_EMAIL / COS_TEST_PASSWORD missing');
  if (mockApi) {
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
      const method = route.request().method();
      let body: unknown;
      let status = 200;
      const headers: Record<string, string> = {};
      if (path === '/auth/login' && method === 'POST') {
        body = { status: 'ok' };
        headers['set-cookie'] = 'cognitive_os_session=local-test; Path=/; SameSite=Lax';
      } else if (path === '/methods' && method === 'GET') {
        body = [{ method_id: 'systems.iceberg_model', status: 'ACTIVE', display: { name_zh: '冰山模型' } }];
      } else if (path === '/methods/systems.iceberg_model/form') {
        body = { method_id: 'systems.iceberg_model', display: { name_zh: '冰山模型' }, form: { fields: [], example: { input: {} } } };
      } else if (path === '/projects' && method === 'GET') {
        body = [];
      } else if (path === '/projects' && method === 'POST') {
        body = { project_id: 'PROJECT-LOCAL', name: '冰山模型 本機測試' };
      } else if (path === '/methods/systems.iceberg_model/interpret' && method === 'POST') {
        status = 202;
        body = { interpretation_id: 'INTERP-LOCAL', status: 'PENDING' };
      } else if (path === '/interpretations/INTERP-LOCAL') {
        body = { status: 'DONE', record: { events: ['release incidents'] }, manifest: [{ id: 'r/events/0', kind: 'record', path: 'r/events/0', value: 'release incidents' }], gate_results: [{ gate_id: 'citation_integrity', status: 'PASS' }], result: { interpretation_id: 'INTERP-LOCAL', method_id: 'systems.iceberg_model', summary: 'Recurring incident', findings: [{ id: 'F1', title: 'Visible event', text: 'Release incidents recur.', citations: ['r/events/0'], confidence: { level: 'mid', reason: 'record' } }], visual: { kind: 'layered', bindings: { levels: [{ label: 'r/events/0', path: 'r/events/0' }] } }, next_methods: [], next_steps: [], recommendations: [], gaps: [], model: 'local-fixture', usage: { input_tokens: 10, output_tokens: 20 }, provenance: { authorship_state: 'AI_GENERATED' } } };
      } else {
        status = 404;
        body = { detail: `Unexpected mock API request: ${method} ${path}` };
      }
      await route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });
    });
  }
  await page.goto('/login');
  await page.getByLabel('Tenant ID').fill(tenant!);
  await page.getByLabel('Email').fill(email!);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page).toHaveURL(/\/methods$/);
  await page.goto('/methods');
  await page.getByPlaceholder('搜尋工具').fill('iceberg');
  await page.getByRole('link', { name: '開始使用' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: '冰山模型' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '我的專案' }).locator('..').getByRole('button').first()).toBeVisible();
  await page.getByRole('button', { name: '用示範案例試一次' }).click();
  const doneResponse = page.waitForResponse(async (response) => {
    if (!/\/api\/interpretations\/INTERP-/.test(response.url()) || !response.ok()) return false;
    return (await response.json()).status === 'DONE';
  }, { timeout: 150_000 });
  await page.getByRole('button', { name: '開始解讀' }).click();
  const completed = await (await doneResponse).json() as { result: { findings: Array<{ citations: string[] }> } };
  await expect(page.locator('[data-section="0"]')).toBeVisible({ timeout: 150_000 });
  await expect(page.locator('[data-section]')).toHaveCount(10);
  await expect(page.locator('[data-section="5b"]')).toBeVisible();
  const citationLinks = page.locator('[data-section="1"] a[href^="#citation-"]');
  if (mockApi) await expect(citationLinks).toHaveCount(1);
  else await expect(citationLinks).toHaveCount(completed.result.findings.reduce((count, finding) => count + finding.citations.length, 0));
});
