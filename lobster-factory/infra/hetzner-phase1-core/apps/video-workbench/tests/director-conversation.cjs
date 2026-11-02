const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { chromium } = require('playwright');
const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'seedstar-director-chat-'));
(async () => {
  const calls = []; let failNext = false, nextDuration = 8, holdNext = false, unblock, started;
  const server = require('../server.cjs').createServer({ dataDir: path.join(evidence, 'data'), env: { OPENAI_API_KEY: 'test-only' }, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body); calls.push(body);
    const duration = nextDuration;
    if (holdNext) { holdNext = false; started(); await new Promise(r => { unblock = r; }); }
    if (failNext) { failNext = false; return Response.json({ error: { message: 'fixture unavailable' } }, { status: 503 }); }
    const input = require('./response-input.cjs')(body);
    return Response.json({ output_text: JSON.stringify({ reply: '採用暖光，想加入哪一種鏡頭？', choices: ['特寫'], stage: input.phase, script: input.phase === 'script' ? '0–4 秒：咖啡杯特寫。4–8 秒：鏡頭緩慢推近，蒸氣上升。' : '', duration }) });
  } });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const invalid = await fetch(base + '/api/seedstar/director/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', text: '測試' }], phase: 'consultation', images: [{ url: 'https://invalid.example/image.png' }] }) });
    assert.equal(invalid.status, 400); assert.equal(calls.length, 0);
    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); p.setDefaultTimeout(8000);
    const errors = [], generations = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.route('**/*', r => {
      if (r.request().method() === 'POST' && /\/generations(?:\/quote)?$/.test(new URL(r.request().url()).pathname)) { generations.push(r.request().url()); return r.abort(); }
      return r.request().url().startsWith(base + '/') ? r.continue() : r.abort();
    });
    await p.goto(base); await p.waitForFunction(() => SeedStar.generator?.controlsReady);
    await p.locator('[data-mode="director"]').click();
    const draft = await p.evaluate(() => SeedStar.generator.getDraft());
    draft.refs.director.images = [{ name: '咖啡參考', url: '/assets/test-image-1.png', purpose: '暖色光線' }];
    await p.evaluate(d => SeedStar.generator.setDraft(d), draft);
    await p.locator('#prompt').fill('八秒咖啡杯短片，無人物');
    await p.locator('[data-action="director-start"]').click();
    await p.locator('[data-director-choice]').first().waitFor();
    assert.equal(calls.length, 1); assert.equal(calls[0].input.find(message=>message.role==='user').content[1].type, 'input_image');
    assert.match(calls[0].input.find(message=>message.role==='user').content[1].image_url, /^data:image\/png;base64,/);
    await p.locator('[data-director-choice]').first().click();
    await p.waitForFunction(() => SeedStar.generator.getDraft().directorMessages.length === 4);
    assert.equal(require('./response-input.cjs')(calls[1]).messages.length, 3);
    failNext = true;
    await p.locator('[data-director-regenerate]').last().click();
    await p.waitForFunction(() => document.querySelectorAll('.director-message').length === 4 && !document.querySelector('.director-conversation [role="status"]'));
    assert.equal((await p.evaluate(() => SeedStar.generator.getDraft())).directorMessages.at(-1).role, 'assistant');
    assert.equal(await p.locator('#directorChatInput').inputValue(), '');
    await p.locator('[data-director-conversation-action="script"]').click();
    await p.locator('[data-director-conversation-action="edit"]').waitFor();
    await p.locator('[data-director-conversation-action="edit"]').click();
    assert.equal(await p.locator('#directorChatInput').inputValue(), '我想修改腳本：');
    await p.locator('#directorChatInput').fill('我想修改腳本：最後拉遠');
    await p.locator('#directorChatInput').press('Shift+Enter');
    assert.match(await p.locator('#directorChatInput').inputValue(), /\n/);
    await p.locator('#directorChatInput').press('Enter');
    await p.waitForFunction(() => SeedStar.generator.getDraft().directorMessages.at(-1)?.role === 'assistant');
    await p.locator('[data-action="director-to-video"]').click();
    for (const name of ['model', 'director-ratio', 'director-duration', 'director-quality', 'skill']) assert.equal(await p.locator('.director-conversation [data-panel="' + name + '"]').count(), 1, name);
    await p.locator('.director-conversation [data-panel="director-duration"]').click();
    assert.equal(await p.locator('[data-gen-duration="30"]').isDisabled(), true);
    await p.locator('[data-gen-duration="4"]').click();
    assert.equal((await p.evaluate(() => SeedStar.generator.getDraft())).directorLength, 4);
    await p.keyboard.press('Escape');
    const saved = await p.evaluate(() => SeedStar.generator.getDraft());
    await p.evaluate(d => SeedStar.generator.setDraft(d), saved);
    assert.deepEqual((await p.evaluate(() => SeedStar.generator.getDraft())).directorMessages, saved.directorMessages);
    await p.screenshot({ path: path.join(evidence, 'director-conversation.png'), fullPage: true });
    await p.locator('[data-director-reference]').last().click();
    assert.equal((await p.evaluate(() => SeedStar.generator.getDraft())).mode, 'reference');
    assert.match(await p.locator('#prompt').inputValue(), /咖啡杯特寫/);
    await p.locator('[data-mode="director"]').click();
    await p.locator('[data-director-conversation-action="new"]').click();
    const fresh = await p.evaluate(() => SeedStar.generator.getDraft());
    assert.equal(fresh.directorMessages.length, 0); assert.notEqual(fresh.directorConversationId, saved.directorConversationId);
    assert.equal(await p.locator('#prompt').inputValue(), '');
    const phaseDraft = { ...fresh, directorStage: 'chat', directorPhase: 'script', directorScript: '舊腳本', directorMessages: [{ role: 'user', text: '原始諮詢', phase: 'consultation' }, { role: 'assistant', text: '舊腳本', choices: [] }] };
    await p.evaluate(d => SeedStar.generator.setDraft(d), phaseDraft);
    await p.locator('[data-director-regenerate]').click();
    await p.waitForFunction(() => SeedStar.generator.getDraft().directorMessages.at(-1)?.role === 'assistant');
    assert.equal(require('./response-input.cjs')(calls.at(-1)).phase, 'consultation');
    holdNext = true; nextDuration = 12;
    const requestStarted = new Promise(r => { started = r; });
    await p.locator('#directorChatInput').fill('延遲測試'); await p.locator('[data-director-conversation-action="send"]').click(); await requestStarted;
    await p.locator('[data-mode="reference"]').click();
    await p.locator('[data-panel="settings"]').click(); await p.locator('[data-gen-duration="4"]').click(); await p.keyboard.press('Escape');
    unblock(); await p.waitForFunction(() => SeedStar.generator.getDraft().directorLength === 12);
    assert.equal((await p.evaluate(() => SeedStar.generator.getDraft())).duration, 4);
    await p.locator('[data-mode="director"]').click();
    holdNext = true; const staleStarted = new Promise(r => { started = r; });
    await p.locator('#directorChatInput').fill('舊對話延遲'); await p.locator('[data-director-conversation-action="send"]').click(); await staleStarted;
    await p.locator('[data-director-conversation-action="new"]').click();
    const staleResponse = p.waitForResponse(r => r.url().endsWith('/director/chat')); unblock(); await staleResponse;
    await p.waitForFunction(() => SeedStar.generator.getDraft().directorStage === 'input');
    assert.equal((await p.evaluate(() => SeedStar.generator.getDraft())).directorMessages.length, 0);
    await p.locator('#prompt').fill('新諮詢'); nextDuration = 30;
    await p.locator('[data-action="director-start"]').click(); await p.locator('[data-director-choice]').waitFor();
    assert.notEqual((await p.evaluate(() => SeedStar.generator.getDraft())).directorLength, 30);
    console.log('PASS 新對話、舊回覆隔離、重新生成沿用原階段、失敗不重填、非支援時長拒絕、切模式不污染時長');
    assert.equal(generations.length, 0); assert.deepEqual(errors, []);
    console.log('PASS 真實 API 接線、附圖視覺輸入、多輪上下文、失敗重試保留回覆、腳本修改、五項獨立設定、草稿、參考帶入；零影像生成');
    console.log('EVIDENCE ' + evidence);
  } finally { await browser.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });


