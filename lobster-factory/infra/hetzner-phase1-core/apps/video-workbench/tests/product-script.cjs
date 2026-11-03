const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { chromium } = require('playwright');
(async () => {
  const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'vw-product-script-')), calls = [];
  let failNext = false;
  const server = require('../server.cjs').createServer({ dataDir: path.join(evidence, 'data'), env: { OPENAI_API_KEY: 'test-only' }, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const input = require('./response-input.cjs')(JSON.parse(options.body)); calls.push(input);
    if (failNext) { failNext = false; return Response.json({ error: { message: 'fixture failure' } }, { status: 503 }); }
    return Response.json({ output_text: JSON.stringify(input.proposal ? { style: '暖色自然光', shots: [{ time: '0–4 秒', text: '杯身特寫' + (input.refine || ''), dialogue: '讓每天從一杯咖啡開始' }, { time: '4–8 秒', text: '展示杯柄', dialogue: '' }] } : { proposals: [{ title: '咖啡時光', tag: '生活', opening: '清晨的咖啡', benefit: '便於拿取', scene: '桌面', description: '暖光' }] }) });
  } });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); p.setDefaultTimeout(8000);
    const errors = [], generations = []; p.on('pageerror', e => errors.push(e.message));
    await p.route('**/*', r => {
      if (/\/generations(?:\/quote)?$/.test(new URL(r.request().url()).pathname) && r.request().method() === 'POST') { generations.push(r.request().url()); return r.abort(); }
      return r.request().url().startsWith(base + '/') ? r.continue() : r.abort();
    });
    await p.goto(base); await p.waitForFunction(() => VideoWorkbench.generator?.controlsReady);
    const d = await p.evaluate(() => VideoWorkbench.generator.getDraft());
    Object.assign(d, { mode: 'product', productStep: 1, productData: { title: '咖啡杯', description: '未勾選的秘密文案' }, productTexts: ['陶瓷杯身', '未勾選的秘密文案'], productSelectedTexts: [0] });
    await p.evaluate(d => VideoWorkbench.generator.setDraft(d), d);
    await p.locator('[data-action="product-generate-proposals"]').click();
    await p.locator('[data-action="product-to-script"]').waitFor();
    assert.equal(JSON.stringify(calls[0]).includes('未勾選的秘密文案'), false);
    await p.locator('[data-action="product-to-script"]').click();
    await p.locator('[data-product-dialogue="0"]').waitFor();
    assert.equal(await p.locator('[data-product-script]').count(), 2);
    assert.match(await p.locator('#productDialogueEstimate').innerText(), /口白/);
    for (const refine of ['shorten', 'hook', 'natural']) {
      const count = calls.length;
      await p.locator('[data-product-refine="' + refine + '"]').click();
      await p.waitForFunction(count => document.querySelector('[data-product-script="0"]')?.value.endsWith(count), refine);
      assert.equal(calls.length, count + 1); assert.equal(calls.at(-1).refine, refine);
    }
    await p.locator('[data-product-dialogue="0"]').fill('保留手動口白');
    await p.locator('#productScriptStyle').fill('保留手動風格');
    failNext = true;
    await p.locator('[data-product-refine="natural"]').click();
    await p.getByRole('alert').waitFor();
    assert.equal(await p.locator('[data-product-dialogue="0"]').inputValue(), '保留手動口白');
    assert.equal(await p.locator('#productScriptStyle').inputValue(), '保留手動風格');
    await p.getByRole('alert').getByRole('button', { name: '關閉' }).click();
    await p.locator('[data-action="product-add-script"]').click();
    assert.equal(await p.locator('[data-product-script]').count(), 3);
    await p.getByRole('button', { name: '刪除分鏡 3', exact: true }).click();
    assert.equal(await p.locator('[data-product-script]').count(), 2);
    const saved = await p.evaluate(() => VideoWorkbench.generator.getDraft());
    await p.evaluate(d => VideoWorkbench.generator.setDraft(d), saved);
    assert.equal(await p.locator('[data-product-dialogue="0"]').inputValue(), '保留手動口白');
    assert.equal(generations.length, 0); assert.deepEqual(errors, []);
    await p.screenshot({ path: path.join(evidence, 'product-script.png'), fullPage: true });
    console.log('PASS 已選文案限定、真實腳本 API、逐鏡畫面／口白／時間、三種修改、失敗保留草稿、新增刪除與保存；零影像生成');
    console.log('EVIDENCE ' + evidence);
  } finally { await browser.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
