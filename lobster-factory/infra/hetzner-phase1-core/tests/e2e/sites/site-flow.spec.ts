/**
 * /ops/sites UI flows (SITE-FLOW-COMPLETION-PLAN.md §3 SF-J acceptance): create -> flow page renders nine steps; a closed
 * catalog switch reads 此步驟尚未開放 and cannot be pressed; preview -> confirm -> running -> done; the one-time admin
 * password shows once and is gone after a reload. SF-H: steps 4 and 8 have content (backup observation, hand ticks),
 * SF-I: mainwp and bridge have step bodies too, so nothing reads 尚未提供; polls never overlap. Every /api/ops/site-flow call is answered by the in-memory fake below
 * (page.route), so this tests the page, never the host; the engine is covered by next-admin lib/site-flow/__tests__.
 * Run against a dev server with no Supabase (.claude/launch.json "next-admin-ui-3903"):
 *   cd lobster-factory/infra/hetzner-phase1-core/tests && PLAYWRIGHT_SITES_URL=http://localhost:3903 npx playwright test --project sites
 * PLAYWRIGHT_SITES_SHOTS=<dir> also writes the desktop and 375 px screenshots.
 */
import { expect, test, type Page, type Route } from '@playwright/test';

const SITE = '6f1e2d3c-4b5a-4978-8a6b-5c4d3e2f1a0b';
const KEYS = ['preflight', 'create', 'wp_install', 'vhost', 'mainwp', 'bridge', 'open'] as const;
const TITLES: Record<string, string> = { preflight: '網址檢查', create: '建立網站主機', wp_install: '安裝 WordPress', vhost: '掛上網址', mainwp: '接上 MainWP', bridge: '接上 AI 控制通道', open: '正式開放' };

type StepState = 'not_started' | 'ready' | 'blocked' | 'running' | 'done' | 'failed' | 'not_available';

function fakeServer(opts: { open: boolean; slowPollMs?: number }) {
  const state: Record<string, { state: StepState; enabled: boolean; reason?: string | null; runId?: string | null }> = {};
  for (const k of KEYS) state[k] = { state: 'not_available', enabled: false };
  if (opts.open) {
    state.preflight = { state: 'done', enabled: true };
    state.create = { state: 'ready', enabled: true };
    state.wp_install = { state: 'blocked', enabled: true, reason: '需先完成：建立網站主機' };
    state.vhost = { state: 'not_started', enabled: false, reason: '此步驟尚未開放' };   // catalog switch off
    state.mainwp = { state: 'blocked', enabled: false, reason: '需先完成：掛上網址' };
    state.bridge = { state: 'blocked', enabled: false, reason: '需先完成：掛上網址' };
    state.open = { state: 'blocked', enabled: true, reason: '需先完成：掛上網址' };
  }
  const calls: string[] = [];
  let polls = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  const ticks: Record<string, { key: string; by: string; at: string; note: string } | null> = { uptime_monitor: null, wpvivid_remote: null, mail_setup: null };
  const panels = () => ({
    backup: { state: 'listed', detail: '已列入每日備份（主機登記檔在）', lastBackupAt: null },
    manual_checks: [
      { key: 'uptime_monitor', label: '已在 Uptime Kuma 加入這個網址的監控', where: 'Uptime Kuma 介面', tick: ticks.uptime_monitor },
      { key: 'wpvivid_remote', label: '已設定 WPvivid 遠端備份', where: 'WordPress 後台', tick: ticks.wpvivid_remote },
      { key: 'mail_setup', label: '已設定寄信（FluentSMTP）並寄出測試信', where: 'WordPress 後台', tick: ticks.mail_setup },
    ],
  });
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const steps = () => KEYS.map((key) => ({
    key, title: TITLES[key], enabled: state[key].enabled, state: state[key].state, reason: state[key].reason ?? null, observation: null,
    lastRun: state[key].runId ? { id: state[key].runId, status: 'running', started_at: '2026-11-22T00:00:00Z', ended_at: null, error_summary: null } : null,
  }));
  async function handle(route: Route) {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const body = req.postDataJSON?.() ?? null;
    calls.push(`${req.method()} ${path}${body?.action ? ` ${body.action}` : ''}`);
    if (path === '/api/ops/site-flow' && req.method() === 'POST') {
      return json(route, { ok: true, organization: { id: 'o1', slug: 'oracle-aware-wave-com', name: body.clientName, created: false }, site_id: SITE, site_created: true, environment_id: 'e1', host_slug: 'oracle-aware-wave-com', kept_keys: ['client_config.site_url'], flow_url: `/ops/sites/${SITE}` });
    }
    if (path === `/api/ops/site-flow/${SITE}` && req.method() === 'GET') {
      return json(route, { ok: true, site: { id: SITE, name: '算命站', organization_id: 'o1' }, environment: { id: 'e1', environment_type: 'production', hosting_provider: 'ks-aw-01-docker', base_url: 'https://oracle.aware-wave.com' }, steps: steps(), panels: panels() });
    }
    if (path === `/api/ops/site-flow/${SITE}/manual-checks`) {
      ticks[body.key] = body.checked ? { key: body.key, by: 'ops@aware-wave.com', at: '2026-11-22T02:00:00Z', note: body.note ?? '' } : null;
      return json(route, { ok: true });
    }
    if (path === `/api/ops/site-flow/${SITE}/create` && body?.action === 'plan') {
      return json(route, { ok: true, step: 'create', planHash: 'a'.repeat(64), plan: { summary: '建立網站容器與資料庫', items: [{ label: '容器', value: 'oracle-aware-wave-com-wp' }, { label: '內部埠', value: '127.0.0.1:8150' }], rollback: '刪除容器，保留資料卷', params: {} } });
    }
    if (path === `/api/ops/site-flow/${SITE}/create` && body?.action === 'execute') {
      state.create = { state: 'running', enabled: true, runId: 'run-1' };
      return json(route, { ok: true, outcome: 'running', jobId: 'sj-20261122000000-abcdef12', runId: 'run-1', stages: [] }, 202);
    }
    if (path === `/api/ops/site-flow/${SITE}/create` && body?.action === 'poll') {
      polls += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      if (opts.slowPollMs) {
        await new Promise((r) => setTimeout(r, opts.slowPollMs));
        inFlight -= 1;
        return json(route, { ok: true, run: { id: 'run-1', status: 'running', started_at: 'x', ended_at: null, error_summary: null } });
      }
      inFlight -= 1;
      state.create = { state: 'done', enabled: true, runId: null };
      state.wp_install = { state: 'ready', enabled: true };
      return json(route, { ok: true, run: { id: 'run-1', status: 'completed', started_at: 'x', ended_at: 'y', error_summary: null } });
    }
    if (path === `/api/ops/site-flow/${SITE}/wp_install` && body?.action === 'plan') {
      return json(route, { ok: true, step: 'wp_install', planHash: 'b'.repeat(64), plan: { summary: '安裝 WordPress 與外掛', items: [], rollback: '移除安裝', params: {} } });
    }
    if (path === `/api/ops/site-flow/${SITE}/wp_install` && body?.action === 'execute') {
      state.wp_install = { state: 'done', enabled: true };
      return json(route, { ok: true, outcome: 'completed', reason: null, runId: 'run-2', stages: [], reveal: { admin_password: 'Pw-ONLY-ONCE-123' } });
    }
    return json(route, { ok: false, error: 'unexpected' }, 500);
  }
  return { handle, calls, polls: () => polls, maxInFlight: () => maxInFlight, setRunning: (k: string) => { state[k] = { state: 'running', enabled: true, runId: 'run-1' }; } };
}

async function arm(page: Page, opts: { open: boolean; slowPollMs?: number }) {
  const fake = fakeServer(opts);
  await page.route('**/api/ops/site-flow**', fake.handle);
  return fake;
}

const shot = async (page: Page, name: string) => {
  const dir = process.env.PLAYWRIGHT_SITES_SHOTS;
  if (dir) await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
};

test('creating a site shows what was not applied, then opens the flow page', async ({ page }) => {
  const fake = await arm(page, { open: true });
  await page.goto('/ops/sites/new');
  await page.getByLabel('客戶名稱').fill('算命站');
  await page.getByLabel('網址').fill('https://Oracle.Aware-Wave.com');
  await expect(page.getByText('主機代號會是 oracle-aware-wave-com')).toBeVisible();
  await page.getByRole('button', { name: '建立', exact: true }).click();
  await expect(page.getByText('這些值沒有套用，因為客戶已經有設定：client_config.site_url')).toBeVisible();
  await page.getByRole('link', { name: '前往建站流程' }).click();
  await expect(page).toHaveURL(new RegExp(`/ops/sites/${SITE}$`), { timeout: 60_000 });   // first hit compiles the page
  expect(fake.calls[0]).toBe('POST /api/ops/site-flow');
});

test('nine steps all have content or a hand-check explanation; none reads 尚未提供', async ({ page }) => {
  await arm(page, { open: true });
  await page.goto(`/ops/sites/${SITE}`);
  await expect(page.locator('li[data-step]')).toHaveCount(9);
  await expect(page.getByText('第 9 步　正式開放')).toBeVisible();
  // 第 4 步 每日備份: an observation; 第 8 步 手動項目: three ticks with where to do them
  await expect(page.locator('li[data-step=n4]')).toContainText('已列入每日備份');
  await expect(page.locator('li[data-step=n8] input[type=checkbox]')).toHaveCount(3);
  await expect(page.locator('li[data-step=n8]')).toContainText('Uptime Kuma');
  // every step has a body (SF-I added mainwp and bridge): none reads 尚未提供, both name their prerequisite
  await expect(page.locator('li[data-step]').filter({ hasText: '尚未提供' })).toHaveCount(0);
  await expect(page.locator('li[data-step=mainwp]')).toContainText('需先完成：掛上網址');
  await expect(page.locator('li[data-step=bridge]')).toContainText('需先完成：掛上網址');
  // a prerequisite is named, never shown as an internal key
  await expect(page.locator('li[data-step=wp_install]')).toContainText('需先完成：建立網站主機');
  await shot(page, 'flow-sfh');
});

test('a hand tick is stored and shows who and when', async ({ page }) => {
  await arm(page, { open: true });
  await page.goto(`/ops/sites/${SITE}`);
  const item = page.locator('li[data-check=uptime_monitor]');
  await item.getByPlaceholder('備註（選填，勾選時一起存）').fill('監控名 oracle');
  await item.locator('input[type=checkbox]').click();   // controlled by the server's answer: checked after the re-read
  await expect(item).toContainText('您手動確認：ops@aware-wave.com');
  await expect(page.locator('li[data-step=n8]')).toContainText('1 / 3 已確認');
});

test('while a step runs the others cannot start, and polls never overlap', async ({ page }) => {
  const fake = await arm(page, { open: true, slowPollMs: 7000 });
  fake.setRunning('create');
  await page.goto(`/ops/sites/${SITE}`);
  await expect(page.locator('li[data-step=create]')).toContainText('執行中');
  await expect(page.locator('li[data-step=preflight] button')).toBeEnabled(); // a re-read is always allowed
  await page.waitForTimeout(16_000);   // 5 s interval vs 7 s answers: an interval timer would have stacked polls
  expect(fake.polls()).toBeGreaterThanOrEqual(1);
  expect(fake.maxInFlight()).toBe(1);
});

test('a closed catalog switch reads 此步驟尚未開放 and the button is disabled', async ({ page }) => {
  await arm(page, { open: true });
  await page.goto(`/ops/sites/${SITE}`);
  await expect(page.locator('li[data-step=create]')).toContainText('可以做');
  const btn = page.locator('li[data-step=vhost]').getByRole('button', { name: '此步驟尚未開放' });
  await expect(btn).toBeDisabled();
});

test('preview -> confirm -> running -> done, and the password shows once', async ({ page }) => {
  const fake = await arm(page, { open: true });
  await page.goto(`/ops/sites/${SITE}`);
  const create = page.locator('li[data-step=create]');
  await create.getByRole('button', { name: '看要做什麼' }).click();
  await expect(create).toContainText('oracle-aware-wave-com-wp');
  await expect(create).toContainText('出錯時：刪除容器，保留資料卷');
  await shot(page, 'flow-preview');
  await create.getByRole('button', { name: '確認執行' }).click();
  await expect(create).toContainText('執行中');
  await expect(create).toContainText('完成', { timeout: 15_000 });
  expect(fake.polls()).toBeGreaterThan(0);

  const wp = page.locator('li[data-step=wp_install]');
  await wp.getByLabel('管理員 email（也是登入帳號，60 字以內）').fill('ops@aware-wave.com');
  await wp.getByRole('button', { name: '看要做什麼' }).click();
  await wp.getByRole('button', { name: '確認執行' }).click();
  await expect(wp).toContainText('Pw-ONLY-ONCE-123');
  await expect(wp).toContainText('只顯示這一次');
  await shot(page, 'flow-done');

  await page.reload();
  await expect(page.locator('li[data-step=wp_install]')).toContainText('完成');
  await expect(page.getByText('Pw-ONLY-ONCE-123')).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  expect(stored).not.toContain('Pw-ONLY-ONCE-123');
});

test('375 px: both pages render (the shell sidebar does not collapse at this width, so the page column is narrow)', async ({ page }) => {
  await arm(page, { open: true });
  await page.setViewportSize({ width: 375, height: 812 });
  for (const [path, name] of [['/ops/sites/new', 'new-375'], [`/ops/sites/${SITE}`, 'flow-375']] as const) {
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    await shot(page, name);
  }
});
