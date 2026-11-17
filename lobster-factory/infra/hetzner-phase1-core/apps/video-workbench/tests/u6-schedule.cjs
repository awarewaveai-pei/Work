const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { isolatedServer } = require('./isolated-server.cjs');
(async () => {
  const { base } = await isolatedServer('vw-u65-'), browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage(), org = '11111111-1111-4111-8111-111111111111', movie = '11111111-1111-4111-8111-111111111112';
    await page.route('**/api/vw/capabilities', async (r) => r.fulfill({ json: { ...await (await r.fetch()).json(), mainSystem: { organizationId: org } } }));
    await page.route('**/api/video/projects?**', r => r.fulfill({ json: { items: [{ id: movie, title: '排程片', source: 'content_topic', source_ref: 'topic', updated_at: new Date().toISOString() }] } }));
    await page.route('**/schedule**', r => r.fulfill({ contentType: 'text/html', body: '<h1>自動排程</h1>' }));
    await page.goto(base); await page.waitForFunction(() => VideoWorkbench.router);
    await page.locator('#scheduleNav').click(); await page.frameLocator('#scheduleFrame').getByText('自動排程').waitFor();
    await page.locator('#projectsNav').click(); await page.frameLocator('#projectsFrame').getByText('接手編輯', { exact: true }).click();
    await page.waitForFunction(movie => document.getElementById('scheduleFrame').getAttribute('src')?.includes('project=' + movie), movie);
    assert.match(await page.locator('#scheduleFrame').getAttribute('src'), new RegExp('project=' + movie));
    const result = await page.evaluate(async movie => {
      VideoWorkbench.router.activate = () => {};
      const input = { title: '接手片', ratio: '9:16', characters: [], sourceProjectId: movie, shots: [{ text: '海', line: '第一句', seconds: 5 }, { text: '山', line: '第二句', seconds: 5 }] };
      const first = await VideoWorkbench.spine.create(input), second = await VideoWorkbench.spine.create(input);
      const state = JSON.parse(VideoWorkbench.storage.getItem('awarewave-projects-screenshot-frontend-v1'));
      const p = state.projects.find(p => p.id === first.projectId);
      return { first, second, importedFrom: p.importedFrom, shots: p.episodes[0].shots, autoRun: p.episodes[0].autoRun };
    }, movie);
    assert.deepEqual(result.first, result.second); assert.equal(result.importedFrom, movie); assert.equal(result.shots.length, 2); assert.equal(result.shots[1].line, '第二句'); assert.equal(result.autoRun, undefined);
    console.log('PASS U6.5 sidebar, topic card entry, two actual scenes, repeated handoff resumes one episode, no autoRun');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
