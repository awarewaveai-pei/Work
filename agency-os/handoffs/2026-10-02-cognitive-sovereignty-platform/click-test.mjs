// Real interaction test of the one-page view (whole route on the right, the picked item beside it); the other views just render.
// Run check-supervisor.mjs first (it writes supervisor-wrapped.html into its --out folder), then:
//   node click-test.mjs [<that out folder>] [<repo root>]     defaults: <os temp>/supervisor-check, three levels up
// Screenshots (st-*.png) go to the same folder. Exit 1 when a step fails.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
const root = process.argv[3] ? path.resolve(process.argv[3]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const dir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(os.tmpdir(), 'supervisor-check');
const require = createRequire(path.join(root, 'lobster-factory/infra/hetzner-phase1-core/tests/package.json'));
const { chromium } = require('@playwright/test');
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 660 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(pathToFileURL(path.join(dir, 'supervisor-wrapped.html')).href);
const visible = () => p.evaluate(() => [...document.querySelectorAll('#one-panels [data-panel]')].filter((e) => !e.hidden).map((e) => e.dataset.panel).join('|'));
const current = () => p.evaluate(() => [...document.querySelectorAll('#one-route [aria-current="true"]')].map((e) => e.textContent.trim().replace(/\s+/g, ' ')).join('|'));
const out = [];
const checks = [];
out.push('start: ' + await visible() + ' marked=' + await current());
await p.screenshot({ path: path.join(dir, 'st-1.png') });
// next, next, ... through every item: one panel each time, and the route marks the same item
const n = await p.evaluate(() => document.querySelectorAll('#one-route [data-k]').length);
const seen = [];
for (let i = 1; i < n; i++) {
  await p.click('#one-panels [data-panel]:not([hidden]) .dp-nav .next');
  seen.push(await visible() + '/' + (await current()).split('|').length);
}
out.push(`after ${n - 1} x next: ${seen.at(-1)}`);
checks.push(['next walks every item, one panel and one mark each time', seen.length === 25 && seen.at(-1) === 'fail:5/1' && seen.every((s) => !s.includes('|') && s.endsWith('/1'))]);
await p.click('#one-steps [data-k="3"]');
const s4 = await visible();
out.push('click step 4: ' + s4);
checks.push(['clicking step 4 on the route shows step 4', s4 === 'steps:3']);
await p.screenshot({ path: path.join(dir, 'st-4.png') });
await p.click('#one-foot .fb');
const f = await visible(); const near = await p.evaluate(() => [...document.querySelectorAll('#one-steps .rs.near')].map((e) => e.textContent.trim().replace(/\s+/g, ' ')).join('|'));
out.push('click first trouble case: ' + f + ' step marked=' + near);
checks.push(['a trouble case shows beside and marks its step', f === 'fail:0' && near.startsWith('4蒐集')]);
await p.screenshot({ path: path.join(dir, 'st-fail.png') });
await p.click('#one-always5 [data-five]');
const a1 = await visible();
await p.keyboard.press('ArrowDown'); const a2 = await visible();
await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowUp'); const a0 = await visible();
out.push(`first of the five: ${a1}; arrow down: ${a2}; arrow up x2: ${a0}`);
checks.push(['the five and the arrow keys', a1 === 'always:1' && a2 === 'always:2' && a0 === 'always:0']);
const tallest = Math.max(...await p.evaluate(() => [...document.querySelectorAll('#one-route [data-k]')].map((x) => { x.click(); return document.documentElement.scrollHeight; })));
out.push(`tallest page over all items=${tallest} screen=660`);
checks.push(['no item makes the page scroll at 1280x660', tallest <= 660]);
// other views: they open fully (nothing folded); just make sure each one renders
const views = await p.evaluate(() => VIEWS);
for (const v of views) out.push(`${v}: height=${await p.evaluate((name) => { window.show(name, true); return document.documentElement.scrollHeight; }, v)}`);
checks.push(['nothing folded on the other views', await p.evaluate(() => document.querySelectorAll('.acc').length === 0)]);
out.push('page errors=' + errs.length + ' ' + errs.join(' | '));
checks.push(['no page errors', errs.length === 0]);
console.log(out.join('\n'));
await b.close();
const failed = checks.filter(([, ok]) => !ok).map(([k]) => k);
if (failed.length) { console.error('FAIL: ' + failed.join('; ')); process.exit(1); }
console.log('PASS ' + checks.length + ' checks');
