const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { isolatedServer } = require('./isolated-server.cjs');
const STORE = 'awarewave-projects-screenshot-frontend-v1', ORG = '11111111-1111-4111-8111-111111111111';
(async () => {
  const { base } = await isolatedServer('vw-u64-');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  let phase = 0, paid = 0;
  try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/*', (r) => r.request().url().startsWith(base + '/') ? r.continue() : r.abort());
    await page.route('**/api/vw/capabilities', async (r) => r.fulfill({ json: { ...await (await r.fetch()).json(), mainSystem: { organizationId: ORG, externalAudioAllowed: true } } }));
    await page.route('**/api/video/assets?**', (r) => r.fulfill(phase === 3 ? { status: 503, json: {} } : { json: { items: [{ id: 'asset', checksum_sha256: 'hash', metadata: {} }] } }));
    await page.route('**/api/video/qa/reports?**', (r) => r.fulfill({ json: { items: ['technical', 'caption', 'editorial', 'rights'].map((kind) => ({ kind, candidateChecksum: 'hash', status: phase ? 'passed' : 'failed' })) } }));
    await page.route('**/api/video/release?**', (r) => r.fulfill({ json: { items: [] } }));
    await page.route('**/api/video/draft-outcome?**', (r) => r.fulfill({ json: { drafts: phase === 2 ? [{ id: 'draft' }] : [], articles: [], socialUrl: 'https://social.example/' } }));
    await page.route('**/api/video/projects?**', (r) => r.fulfill({ json: { items: [] } }));
    await page.route('**/api/vw/generations', (r) => { if (r.request().method() === 'POST') paid++; return r.fulfill({ json: [] }); });
    await page.goto(base); await page.waitForFunction(() => VideoWorkbench.router);
    await page.evaluate(async ({ STORE }) => {
      await VideoWorkbench.ready;
      const job = { id: 'cut-job', type: 'video', status: 'succeeded', input: { settings: { ratio: '16:9' }, link: { projectId: 'p', episodeId: 'e', target: 'output' } }, result: { url: '/generated/11111111-1111-4111-8111-111111111111.mp4', ratio: '16:9', assetId: 'asset' } };
      VideoWorkbench.generations.get = async () => job; VideoWorkbench.generations.list = async () => [job];
      VideoWorkbench.storage.setItem(STORE, JSON.stringify({ current: 'p', episode: 0, projects: [{ id: 'p', title: '測試', type: 'single', ratio: '16:9', style: 0, settings: {}, assets: { character: [], scene: [], prop: [] }, episodes: [{ id: 'e', name: '第 1 集', shots: [{ id: 's', text: '畫面', line: '旁白', image: '/generated/11111111-1111-4111-8111-111111111111.png' }], outputs: [{ url: job.result.url, jobId: job.id, editRevision: null }] }] }] }));
      await VideoWorkbench.flush(); await VideoWorkbench.notifyNext(job);
    }, { STORE });
    await page.locator('#projectsNav').click();
    const frame = page.frameLocator('#projectsFrame');
    const check = async (key) => {
      await frame.locator('[data-vw-next-surface=header] [data-next-key=' + key + ']').waitFor();
      await frame.locator('[data-output-next] [data-next-key=' + key + ']').waitFor();
      await page.locator('[data-vw-next-surface=notification] [data-next-key=' + key + ']').waitFor();
    };
    await check('review');
    for (const [state, key] of [[1, 'release'], [2, 'done']]) {
      phase = state; await page.evaluate(() => window.postMessage({ type: 'vw:workflow-changed' }, location.origin)); await check(key);
    }
    phase = 3; await page.evaluate(() => window.postMessage({ type: 'vw:workflow-changed' }, location.origin));
    await frame.locator('[data-vw-next-surface=header]').filter({ hasText: '主系統狀態暫時讀不到' }).waitFor();
    await page.locator('[data-vw-next-surface=notification]').filter({ hasText: '主系統狀態暫時讀不到' }).waitFor();
    await page.evaluate(async () => {
      await new Promise((resolve) => { const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/styles/tools.css'; css.onload = resolve; document.head.append(css); });
      const stage = document.createElement('div'); stage.className = 'editor-stage'; stage.style.cssText = 'position:fixed;left:300px;top:100px;width:200px;height:150px';
      const text = document.createElement('div'); text.textContent = '剪輯文字'; text.style.cssText = 'position:absolute;inset:0;z-index:120'; stage.append(text); document.body.append(stage);
      VideoWorkbench.showJob({ id: 'technical-long-job-id', type: 'video', status: 'running', input: {} });
    });
    await page.locator('.job-view').filter({ hasText: '處理中' }).waitFor();
    const overlay = await page.evaluate(() => ({ covers: document.querySelector('.job-view').contains(document.elementFromPoint(400, 150)), text: document.querySelector('.job-view').textContent }));
    assert.equal(overlay.covers, true, '剪輯文字不得穿透任務面板');
    assert.doesNotMatch(overlay.text, /technical-long-job-id|running/);
    await page.locator('[data-job-close]').click();
    assert.equal(paid, 0); assert.deepEqual(errors, []);
    console.log('PASS U6.4 Playwright: header, card and completion notice change together; unknown state, no paid submission');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
