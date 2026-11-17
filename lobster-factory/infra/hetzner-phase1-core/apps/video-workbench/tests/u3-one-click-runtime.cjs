const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { isolatedServer } = require('./isolated-server.cjs');
(async () => {
  const { base } = await isolatedServer('vw-u36-'), browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage(); await page.goto(base); await page.waitForFunction(() => VideoWorkbench.router);
    const result = await page.evaluate(async () => {
      await VideoWorkbench.ready;
      VideoWorkbench.router.activate = () => {}; // inspect the atomic handoff before a page can run it
      const input = { title: '一鍵交接', ratio: '4:5', characters: [], shots: [{ text: '畫面', line: '旁白', seconds: 5 }],
        intro: { kind: 'title', fields: { title: '片頭' }, seconds: 3 },
        autoRun: { runId: 'same-run', until: 'drafts', status: 'stopped', budgetTwd: 20, spentTwd: 3, baseSpentTwd: 3, fill: 'ai', ratios: ['4:5'], prices: { perPictureTwd: 1, perRatioTwd: 0 } },
      };
      const first = await VideoWorkbench.spine.create(input), second = await VideoWorkbench.spine.create(input);
      let refused = false;
      try { await VideoWorkbench.spine.create({ ...input, autoRun: { ...input.autoRun, runId: 'forbidden-run', until: 'full_auto' } }); } catch { refused = true; }
      const state = JSON.parse(VideoWorkbench.storage.getItem('awarewave-projects-screenshot-frontend-v1'));
      await VideoWorkbench.spine.setAutoRun({ ...first, autoRun: { ...input.autoRun, status: 'running' } });
      let replacementBlocked = false;
      try { await VideoWorkbench.spine.setAutoRun({ ...first, autoRun: { ...input.autoRun, runId: 'different-run', status: 'running' } }); } catch { replacementBlocked = true; }
      return { first, second, refused, replacementBlocked, projects: state.projects.filter((p) => p.title === '一鍵交接') };
    });
    assert.deepEqual(result.first, result.second);
    assert.equal(result.first.projectId, 'project-same-run', '與伺服器預算列使用同一個 source_ref');
    assert.equal(result.projects.length, 1, '交接重送不能開第二集或啟動第二趟付費工作');
    const p = result.projects[0], e = p.episodes[0];
    assert.equal(p.ratio, '4:5'); assert.equal(e.autoRun.until, 'drafts'); assert.equal(e.autoRun.baseSpentTwd, 3); assert.equal(e.intro.fields.title, '片頭');
    assert.equal(result.refused, true, '人按的一鍵不能設定 full_auto');
    assert.equal(result.replacementBlocked, true, '不能覆蓋同一集尚在執行的另一趟工作');
    console.log('PASS U3.6 runtime: atomic script/bookend/run handoff, retry idempotency, draft-only stop');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
