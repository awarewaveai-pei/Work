const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { chromium } = require('playwright');
(async () => {
  const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'seedstar-popover-ratios-test-'));
  const calls = [], png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jTioAAAAASUVORK5CYII=', 'base64');
  const server = require('../server.cjs').createServer({ dataDir: path.join(evidence, 'data'), env: { OPENAI_API_KEY: 'test-only' }, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/images/generations'); calls.push(JSON.parse(options.body));
    return Response.json({ data: [{ b64_json: png.toString('base64') }] });
  } });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); p.setDefaultTimeout(7000);
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    await p.route('**/*', r => r.request().url().startsWith(base + '/') ? r.continue() : r.abort());
    await p.goto(base); await p.waitForFunction(() => SeedStar.generator?.controlsReady);
    await p.locator('[data-mode="image"]').click();
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      await p.setViewportSize(viewport);
      for (const panel of ['model', 'settings', 'skill']) {
        const trigger = p.locator('.dock [data-panel="' + panel + '"]');
        await trigger.click(); const close = p.getByRole('button', { name: '完成並關閉設定' });
        if (panel === 'settings') { await p.locator('[data-ratio="4:5"]').click(); await p.locator('[data-quality="2K"]').click(); }
        const bounds = await close.boundingBox(); assert(bounds.y >= 0 && bounds.y + bounds.height <= viewport.height);
        await close.click(); assert(await p.locator('#popover').isHidden());
        assert(await trigger.evaluate(el => el === document.activeElement));
      }
      await p.locator('.dock [data-panel="presets"]').click(); await p.locator('#closeModal').click(); assert(await p.locator('#modal').isHidden());
      await p.locator('[data-mode="reference"]').click(); await p.locator('.dock [data-panel="subtitle"]').click();
      await p.locator('[data-subtitle="開"]').click(); await p.getByRole('button', { name: '完成並關閉設定' }).click(); assert(await p.locator('#popover').isHidden());
      await p.locator('[data-mode="image"]').click(); await p.locator('.dock [data-panel="settings"]').click();
      await p.screenshot({ path: path.join(evidence, 'settings-' + viewport.width + '.png'), fullPage: true });
      await p.keyboard.press('Escape'); assert(await p.locator('#popover').isHidden());
      await p.locator('.dock [data-panel="settings"]').click(); await p.getByRole('heading', { name: '想生成什麼？' }).click(); assert(await p.locator('#popover').isHidden());
    }
    for (const ratio of ['4:5', '4:3']) {
      await p.locator('.dock [data-panel="settings"]').click(); await p.locator('[data-ratio="' + ratio + '"]').click(); await p.getByRole('button', { name: '完成並關閉設定' }).click();
      const draft = await p.evaluate(() => SeedStar.generator.getDraft()); await p.evaluate(d => SeedStar.generator.setDraft(d), draft);
      assert.equal((await p.evaluate(() => SeedStar.generator.getDraft())).ratio, ratio);
    }
    const outputs = require('../backend/generation-policy.cjs').imageOutputs;
    for (const ratio of ['4:5', '4:3']) for (const quality of ['1K', '2K', '4K']) {
      const response = await fetch(base + '/api/seedstar/generations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'image', prompt: '比例輸出測試', settings: { ratio, quality, imageLayout: 'center-crop' } }) });
      assert.equal(response.status, 202); let job = await response.json();
      for (let i = 0; i < 100 && !['succeeded', 'failed'].includes(job.status); i++) { await new Promise(r => setTimeout(r, 100)); job = await (await fetch(base + '/api/seedstar/generations/' + job.id)).json(); }
      assert.equal(job.status, 'succeeded', job.error);
      const bytes = Buffer.from(await (await fetch(base + job.result.url)).arrayBuffer());
      const dimensions = [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]; assert.deepEqual(dimensions, outputs[quality][ratio]);
      const [a, b] = ratio.split(':').map(Number); assert.equal(dimensions[0] * b, dimensions[1] * a);
      assert.equal(calls.at(-1).size, ratio === '4:5' ? '1024x1536' : '1536x1024');
    }
    assert.equal(calls.length, 6); assert.deepEqual(errors, []);
    console.log('PASS 桌面／手機五類設定可完成關閉、焦點返回、Escape與外部點擊；4:5／4:3 草稿與六種真實 PNG 尺寸／比例，保留供應商原圖（mock provider）');
    console.log('EVIDENCE ' + evidence);
  } finally { await browser.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });

