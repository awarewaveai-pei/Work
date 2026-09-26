import { test, expect } from '@playwright/test';

test('login -> iceberg -> result page, cards in the mock order', async ({ page }) => {
  test.setTimeout(600_000);   // a full result page (schema 1.1.0) takes 2-3 minutes, and the analysis may retry once
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
  await page.goto('/login', { waitUntil: 'networkidle' });   // a click before hydration submits the bare HTML form
  await page.getByLabel('Tenant ID').fill(tenant!);
  await page.getByLabel('Email').fill(email!);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page).toHaveURL(/\/$/);
  if (mockApi) {
    // the tool list and the tool page render on the server from GET /catalog, which page.route() cannot answer;
    // mock mode starts at the run page (client-side, every call goes through /api)
    await page.goto('/methods/systems.iceberg_model/run');
  } else {
    await page.getByRole('navigation', { name: '主選單' }).getByRole('link', { name: '工具', exact: true }).click();
    await page.getByPlaceholder(/知道名字就直接搜/).fill('冰山');
    await page.getByRole('link', { name: '冰山模型', exact: true }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: '冰山模型' })).toBeVisible();
    await page.getByRole('link', { name: /^開始/ }).first().click();
  }
  await expect(page).toHaveURL(/\/methods\/systems\.iceberg_model\/run$/);
  await expect(page.getByRole('heading', { level: 1, name: '冰山模型' })).toBeVisible();
  await expect(page.locator('.status').getByRole('button').first()).toBeVisible();   // the project the run is saved in
  // the header opens the tool's lesson in a new tab (docs/mockups/iceberg-result-mock.html .top > a.howto); the lesson is served
  const lesson = page.locator('.top a.howto');
  await expect(lesson).toHaveAttribute('href', '/learn/systems.iceberg_model');
  await expect(lesson).toHaveAttribute('target', '_blank');
  const lessonPage = await page.request.get('/learn/systems.iceberg_model');
  expect(lessonPage.status()).toBe(200);
  expect(await lessonPage.text()).toContain('開始：填你自己的案例');
  await page.getByRole('button', { name: '用示範案例填入' }).click();
  const doneResponse = page.waitForResponse(async (response) => {
    if (!/\/api\/interpretations\/INTERP-/.test(response.url()) || !response.ok()) return false;
    return (await response.json()).status === 'DONE';
  }, { timeout: 540_000 });
  await page.getByRole('button', { name: '執行分析' }).click();
  const completed = await (await doneResponse).json() as { result: { findings: Array<{ citations: string[] }> } };
  await expect(page.locator('[data-section="0"]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-section]')).toHaveCount(11);   // header, ① … ⑨, approve (docs/mockups/iceberg-result-mock.html)
  await expect(page.locator('[data-section="7"]')).toBeVisible();   // ⑦ 解決方案
  await expect(page.getByRole('img', { name: '冰山模型四層圖' })).toBeVisible();
  const citationLinks = page.locator('[data-section="1"] .finding a[href^="#citation-"]');   // the findings' own [n]
  if (mockApi) await expect(citationLinks).toHaveCount(1);
  else await expect(citationLinks).toHaveCount(completed.result.findings.reduce((count, finding) => count + finding.citations.length, 0));
});
