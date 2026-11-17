const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { isolatedServer } = require('./isolated-server.cjs');
const { catalog } = require('../backend/visual-styles.cjs');
const STORE = 'awarewave-projects-screenshot-frontend-v1';
(async () => {
  assert.equal(catalog.length, 115);
  const { base } = await isolatedServer('vw-u46-'), browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage(); await page.goto(base); await page.waitForFunction(() => VideoWorkbench.router);
    const originals = Array.from({ length: 9 }, (_, style) => ({ id: 'legacy-' + style, title: '舊專案' + style, type: 'single', style, customStyle: style === 8 ? '自訂藍金色光' : '', ratio: '16:9', settings: {}, assets: { character: [], scene: [], prop: [] }, episodes: [{ id: 'e' + style, name: '一集', shots: [{ id: 's' + style, text: '原畫面', line: '原旁白', seconds: 5 }] }] }));
    await page.evaluate(async ({ STORE, originals }) => { await VideoWorkbench.ready; VideoWorkbench.storage.setItem(STORE, JSON.stringify({ current: null, episode: 0, projects: originals })); await VideoWorkbench.flush(); }, { STORE, originals });
    await page.locator('#projectsNav').click(); const frame = page.frameLocator('#projectsFrame');
    await frame.locator('[data-action=openProject]').first().waitFor();
    const migrated = await page.evaluate(STORE => JSON.parse(VideoWorkbench.storage.getItem(STORE)).projects, STORE);
    originals.forEach((old, i) => { assert.equal(migrated[i].style, i); assert.equal(migrated[i].styleId, 'legacy-' + i); assert.equal(migrated[i].customStyle, old.customStyle); assert.deepEqual(migrated[i].episodes, old.episodes); });
    await frame.locator('[data-action=openProject][data-id=legacy-8]').click(); await frame.getByRole('button', { name: /生成設定/ }).first().click();
    await frame.locator('[data-action=editStyle]').click();
    assert.equal(await frame.locator('[data-action=setProjectStyle]').count(), 115);
    assert.equal(await frame.locator('#project-style-input').inputValue(), '自訂藍金色光');
    if (process.env.VW_STYLE_SCREENSHOT) await page.screenshot({ path: process.env.VW_STYLE_SCREENSHOT });
    await frame.locator('[data-action=setProjectStyle][data-value=video-documentary]').click();
    const prompt = catalog.find(s => s.id === 'video-documentary').prompt;
    assert.equal(await frame.locator('#project-style-input').inputValue(), prompt);
    await frame.locator('[data-action=saveProjectStyle]').click();
    await page.reload(); await page.waitForFunction(() => VideoWorkbench.router); await page.locator('#projectsNav').click();
    await page.frameLocator('#projectsFrame').getByText(prompt, { exact: true }).waitFor();
    const p = await page.evaluate(STORE => JSON.parse(VideoWorkbench.storage.getItem(STORE)).projects.find(p => p.id === 'legacy-8'), STORE);
    assert.equal(p.styleId, 'video-documentary'); assert.equal(p.style, 8, '舊版回滾仍讀自訂與完整提示'); assert.equal(p.customStyle, prompt); assert.deepEqual(p.episodes, originals[8].episodes);
    console.log('PASS U4.6 real Edge: nine old indexes preserved with custom prompt/shots, all 115 choices, new style and reload');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
