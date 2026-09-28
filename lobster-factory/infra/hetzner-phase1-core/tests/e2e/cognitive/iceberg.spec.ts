import { test, expect } from '@playwright/test';

test('login -> iceberg -> result page, cards in the mock order -> my projects -> the project -> the saved result', async ({ page }) => {
  test.setTimeout(600_000);   // a full result page (schema 1.1.0) takes 2-3 minutes, and the analysis may retry once
  const mockApi = process.env.COS_TEST_MOCK_API === '1';
  const tenant = mockApi ? 'tenant-local' : process.env.COS_TEST_TENANT_ID;
  const email = mockApi ? 'local@example.test' : process.env.COS_TEST_EMAIL;
  const password = mockApi ? 'local-only' : process.env.COS_TEST_PASSWORD;
  test.skip(!mockApi && (!tenant || !email || !password), 'COS_TEST_TENANT_ID / COS_TEST_EMAIL / COS_TEST_PASSWORD missing');
  let created: Record<string, unknown> | null = null;
  let tasks: Array<Record<string, unknown>> = [];
  let approval: Record<string, unknown> | null = null;
  const analysis = { interpretation_id: 'INTERP-LOCAL', method_id: 'systems.iceberg_model', status: 'DONE', requested_at: '2026-09-26T15:51:00Z', finished_at: '2026-09-26T15:52:00Z', error: null, judgment: null };
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
        body = created ? [created] : [];
      } else if (path === '/projects' && method === 'POST') {
        created = { project_id: 'PROJECT-LOCAL', name: JSON.parse(route.request().postData() ?? '{}').name, created_at: '2026-09-26T15:51:00Z', updated_at: '2026-09-26T15:52:00Z', analysis_count: 1, methods: ['systems.iceberg_model'], latest_analysis: analysis };
        body = created;
      } else if (path === '/projects/PROJECT-LOCAL') {
        body = created;
      } else if (path === '/projects/PROJECT-LOCAL/analyses') {
        body = [analysis];
      } else if (path === '/projects/PROJECT-LOCAL/sources') {
        body = [];
      } else if (path === '/projects/PROJECT-LOCAL/tasks' && method === 'POST') {
        tasks = (JSON.parse(route.request().postData() ?? '{}').tasks as Array<Record<string, string>>).map((task, index) => ({ task_id: `T${index}`, interpretation_id: 'INTERP-LOCAL', ...task, created_at: '2026-09-27T00:00:00Z', done: false, done_at: null }));
        body = tasks;
      } else if (path === '/projects/PROJECT-LOCAL/tasks') {
        body = tasks;
      } else if (path === '/projects/PROJECT-LOCAL/reruns') {
        body = [];
      } else if (path === '/methods/systems.iceberg_model/estimate') {
        body = { method_id: 'systems.iceberg_model', model: 'local-fixture', input_tokens: 10000, output_tokens: 5000, tokens: 15000, twd: 1, based_on: 0 };
      } else if (path === '/interpretations/INTERP-LOCAL/approval' && method === 'POST') {
        approval = { decision: JSON.parse(route.request().postData() ?? '{}').decision, at: '2026-09-27T00:05:00Z', by_name: 'local', reason: '' };
        body = approval;
      } else if (path === '/methods/systems.iceberg_model/interpret' && method === 'POST') {
        status = 202;
        body = { interpretation_id: 'INTERP-LOCAL', status: 'PENDING' };
      } else if (path === '/interpretations/INTERP-LOCAL') {
        body = { status: 'DONE', project_id: 'PROJECT-LOCAL', method_id: 'systems.iceberg_model', created_at: '2026-09-26T15:52:00Z', judgment: null, approval, cost_twd: 1, record: { events: ['release incidents'] }, manifest: [{ id: 'r/events/0', kind: 'record', path: 'r/events/0', value: 'release incidents' }], gate_results: [{ gate_id: 'citation_integrity', status: 'PASS' }], result: { interpretation_id: 'INTERP-LOCAL', method_id: 'systems.iceberg_model', summary: 'Recurring incident', findings: [{ id: 'F1', title: 'Visible event', text: 'Release incidents recur.', citations: ['r/events/0'], confidence: { level: 'mid', reason: 'record' } }], visual: { kind: 'layered', bindings: { levels: [{ label: 'r/events/0', path: 'r/events/0' }] } }, next_methods: [], next_steps: [], recommendations: [], gaps: [], model: 'local-fixture', usage: { input_tokens: 10, output_tokens: 20 }, provenance: { authorship_state: 'AI_GENERATED' } } };
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
  await expect(page.locator('#input')).toContainText('存到：新專案');   // opening the page makes no project; 執行分析 makes one
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
  await expect(page.locator('#input')).toContainText('要花多少');   // 花錢前先講: the cost, then a confirmation
  await page.getByRole('button', { name: '確認執行' }).click();
  const completed = await (await doneResponse).json() as { result: { findings: Array<{ citations: string[] }> } };
  await expect(page.locator('[data-section="0"]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-section]')).toHaveCount(11);   // header, ① … ⑨, approve (docs/mockups/iceberg-result-mock.html)
  // the approve card's buttons do what they say: 核准 marks the page approved (the pill and the source strip change)
  await expect(page.locator('#approve .btns button', { hasText: '匯出 PDF' })).toBeVisible();
  await page.locator('#approve .btns button', { hasText: '核准，存進專案' }).click();
  await expect(page.locator('[data-section="0"] .pill')).toHaveText('已核准', { timeout: 30_000 });
  await expect(page.locator('#approve .meta-bar')).toContainText('已核准');
  await expect(page.locator('#approve .btns button', { hasText: '核准，存進專案' })).toBeDisabled();
  await expect(page.locator('[data-section="7"]')).toBeVisible();   // ⑦ 解決方案
  await expect(page.getByRole('img', { name: '冰山模型四層圖' })).toBeVisible();
  const citationLinks = page.locator('[data-section="1"] .finding a[href^="#citation-"]');   // the findings' own [n]
  if (mockApi) await expect(citationLinks).toHaveCount(1);
  else await expect(citationLinks).toHaveCount(completed.result.findings.reduce((count, finding) => count + finding.citations.length, 0));

  // the analysis has its own address, and 我的專案 opens it again: the list -> the project -> the saved result
  await expect(page).toHaveURL(/\/projects\/[^/]+\/analyses\/INTERP-[^/]+$/);
  const saved = new URL(page.url()).pathname;
  const projectPath = saved.replace(/\/analyses\/.*$/, '');
  const projectName = await page.locator(`.crumbs a[href="${projectPath}"]`).innerText();
  expect(projectName).toMatch(/^冰山模型 \d{4}-\d{2}-\d{2} \d{2}:\d{2}( \(\d+\))?$/);
  await page.getByRole('navigation', { name: '主選單' }).getByRole('link', { name: '我的專案', exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  const row = page.locator('tbody tr').filter({ has: page.locator(`a[href="${projectPath}"]`) });
  await expect(row).toHaveCount(1);
  await expect(row.locator('td').nth(3)).toHaveText(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);   // 建立: date and time
  await row.locator(`a[href="${projectPath}"]`).click();
  await expect(page).toHaveURL(new RegExp(`${projectPath}$`));
  await expect(page.getByRole('heading', { level: 1, name: projectName })).toBeVisible();
  await page.locator(`a[href="${saved}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`${saved}$`));
  await expect(page.locator('[data-section]')).toHaveCount(11, { timeout: 30_000 });
  if (!mockApi) await expect(page.locator('#f-events')).not.toHaveValue('');   // the fields come back with what was analyzed
});
