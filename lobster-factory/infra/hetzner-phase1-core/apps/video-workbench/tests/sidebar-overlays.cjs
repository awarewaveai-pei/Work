const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { chromium } = require('playwright');
(async () => {
  const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'vw-sidebar-test-'));
  const server = require('../server.cjs').createServer({ dataDir: path.join(evidence, 'data'), env: {}, fetchImpl: async () => { throw Error('Provider forbidden'); } });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const p = await browser.newPage(); p.setDefaultTimeout(5000); const errors = [], polls = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.route('**/*', r => {
      if (/\/generations\/sidebar-running$/.test(r.request().url())) { polls.push(r.request().url()); return r.fulfill({ json: { id: 'sidebar-running', status: 'running' } }); }
      return r.request().url().startsWith(base + '/') ? r.continue() : r.abort();
    });
    await p.goto(base); await p.waitForFunction(() => VideoWorkbench.router?.activate && VideoWorkbench.generator?.controlsReady);
    await p.evaluate(() => VideoWorkbench.assets.save({ id: 'sidebar-image', name: '預覽測試', kind: 'image', type: 'image/png', url: '/assets/test-image-1.png' }));
    const navs = ['generator', 'director', 'tools', 'projects', 'storyboards', 'templates', 'workflows', 'characters', 'skills', 'assets', 'history'];
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      await p.setViewportSize(viewport);
      for (const [index, name] of navs.entries()) {
        await p.locator('#generatorNav').click();
        if (index % 3 === 0) await p.locator('.dock [data-panel="presets"]').click();
        else if (index % 3 === 1) { await p.locator('[data-action="library"]').click(); await p.locator('[data-picker-preview="sidebar-image"]').click(); }
        else await p.evaluate(() => VideoWorkbench.showJob({ id: 'sidebar-running', type: 'image', status: 'running', progress: 1, input: { prompt: '測試' } }));
        const target = p.locator('#' + name + 'Nav'); await target.scrollIntoViewIfNeeded();
        assert(await target.evaluate(button => { const r = button.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return hit === button || button.contains(hit); }), name + ' intercepted');
        await target.click();
        assert.equal(await p.evaluate(() => VideoWorkbench.router.active), name);
        assert(await p.locator('#modal').isHidden()); assert.equal(await p.locator('.asset-workspace,.job-view').count(), 0);
        assert(await p.locator('#popover').isHidden());
      }
      await p.locator('#generatorNav').click(); await p.locator('.dock [data-panel="settings"]').click(); await p.locator('#toolsNav').click();
      assert(await p.locator('#popover').isHidden());
      await p.locator('#generatorNav').click(); await p.locator('[data-action="library"]').click();
      await p.screenshot({ path: path.join(evidence, 'sidebar-' + viewport.width + '.png'), fullPage: true });
      await p.locator('#generatorNav').click();
    }
    await new Promise(r => setTimeout(r, 2200)); assert.equal(polls.length, 0, 'closed job kept polling');
    assert.deepEqual(errors, []);
    require('./storyboards-baseline.cjs').checkStoryboardsBaseline();
    console.log('PASS 桌面／手機 11 個導覽入口在設定、素材預覽及任務浮層開啟後仍可點擊；切頁關閉浮層、取消素材選擇、停止任務視窗輪詢；分鏡靈感保護檔不變');
    console.log('EVIDENCE ' + evidence);
  } finally { await browser.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
