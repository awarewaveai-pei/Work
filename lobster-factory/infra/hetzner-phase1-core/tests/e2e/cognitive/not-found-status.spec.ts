import { test, expect, type APIRequestContext } from '@playwright/test';
import { DEMOS } from '../../../../../../Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/toolsheets.generated';

// An address under (shell) that names nothing answers HTTP 404, one that names something 200 (cognitive-web middleware.ts +
// lib/known-address.ts: decided before (shell)/loading.tsx starts streaming, which used to fix every status at 200). A page
// load = a plain GET with no RSC header, as a crawler or monitor sends it. Tools, lessons and demos need no session (the
// catalog comes from the API, so the API must be up); projects need a real one: the server asks the API with the cookie.
const status = async (request: APIRequestContext, path: string) => (await request.get(path, { maxRedirects: 0, timeout: 300_000 })).status();

test('an unknown tool, lesson or demo domain is a 404; a real one is a 200', async ({ page, context, baseURL }) => {
  test.setTimeout(900_000);   // the dev server compiles each route on first hit
  await context.addCookies([{ name: 'cognitive_os_session', value: 'local-test', url: baseURL! }]);
  const [method, [demo]] = Object.entries(DEMOS)[0];
  const cases: Array<[string, number]> = [
    ['/methods/systems.iceberg_model', 200], ['/methods/no-such-tool', 404], ['/methods/constructor', 404],
    ['/learn/systems.iceberg_model', 200], ['/learn/no-such-lesson', 404],
    ['/learn/workflow/life-decision-v1', 200], ['/learn/workflow/no-such-lesson', 404],
    [demo.href, 200], [`${demo.href}/no-such-domain`, 404], ['/projects/demo/no-such-tool', 404],
  ];
  for (const [path, expected] of cases) expect(await status(page.request, path), path).toBe(expected);
  // a real page load of an unknown one: 404, and still the not-found content
  const response = await page.goto(`/projects/demo/${method}/no-such-domain`);
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'This page could not be found.' })).toBeVisible({ timeout: 120_000 });
});

test('an unknown project is a 404; the signed-in person\'s own project is a 200', async ({ page }) => {
  test.setTimeout(600_000);
  const [tenant, email, password] = [process.env.COS_TEST_TENANT_ID, process.env.COS_TEST_EMAIL, process.env.COS_TEST_PASSWORD];
  test.skip(!tenant || !email || !password, 'COS_TEST_TENANT_ID / COS_TEST_EMAIL / COS_TEST_PASSWORD missing (the project check asks the real API)');
  expect((await page.request.post('/api/auth/login', { data: { tenant_id: tenant, email, password } })).ok()).toBe(true);
  const projects = (await (await page.request.get('/api/projects')).json()) as Array<{ project_id: string }>;
  test.skip(!projects.length, 'the test account has no project to open (read-only check: none is created)');
  const own = `/projects/${encodeURIComponent(projects[0].project_id)}`;
  const cases: Array<[string, number]> = [
    [own, 200], [`${own}/govern`, 200], [`${own}/analyses/no-such-analysis`, 404],
    ['/projects/no-such-project', 404], ['/projects/no-such-project/govern', 404], ['/projects/new', 200],
  ];
  for (const [path, expected] of cases) expect(await status(page.request, path), path).toBe(expected);
});
