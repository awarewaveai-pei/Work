// Real interaction test of the one-panel-at-a-time view and the one-section-at-a-time pages.
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
const p = await (await b.newContext({ viewport: { width: 1100, height: 900 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(pathToFileURL(path.join(dir, 'supervisor-wrapped.html')).href);
const visible = () => p.evaluate(() => [...document.querySelectorAll('#one-panels [data-panel]')].filter((e) => !e.hidden).map((e) => e.dataset.panel + ':' + (e.dataset.step || e.dataset.five || '')));
const out = [];
out.push('start visible=' + (await visible()).join(' | ') + ' height=' + await p.evaluate(() => document.documentElement.scrollHeight));
await p.screenshot({ path: path.join(dir, 'st-1.png') });
const seen = [];
for (let i = 0; i < 13; i++) { await p.click('#one-pager .next'); seen.push((await visible()).join('')); }
out.push('after 13 x next: ' + seen[12] + ' ; every click showed exactly one panel=' + seen.every((s) => s.split('steps:').length === 2));
out.push('max height over 14 steps=' + Math.max(...await p.evaluate(() => JOURNEY.map((s, i) => { document.querySelector(`#one-trail [data-chip="${i}"]`).click(); return document.documentElement.scrollHeight; }))));
await p.click('#one-trail [data-chip="3"]');
await p.screenshot({ path: path.join(dir, 'st-4.png') });
await p.evaluate(() => scrollTo(0, 400));
await p.screenshot({ path: path.join(dir, 'st-4-scrolled.png') });
await p.click('#one-tabs [data-tab="1"]');
out.push('tab 2 -> ' + (await visible()).join(' | ') + ' chips=' + await p.evaluate(() => document.querySelectorAll('#one-trail .tr').length));
await p.click('#one-trail [data-chip="4"]');
out.push('chip 5 of always -> ' + (await visible()).join(' | '));
await p.screenshot({ path: path.join(dir, 'st-always.png') });
await p.keyboard.press('ArrowRight');
out.push('arrow right -> ' + (await visible()).join(' | '));
await p.click('#one-tabs [data-tab="2"]');
out.push('tab 3 -> ' + (await visible()).join(' | '));
await p.click('#one-tabs [data-tab="3"]');
out.push('tab 4 -> ' + (await visible()).join(' | '));
// other views: default heights, and the accordion closes the previous section
const views = await p.evaluate(() => VIEWS);
for (const v of views) {
  const h = await p.evaluate((name) => { window.show(name, true); return document.documentElement.scrollHeight; }, v);
  const open = await p.evaluate((name) => [...document.querySelectorAll(`#v-${name} > .acc`)].map((e) => e.classList.contains('open') ? 1 : 0).join(''), v);
  out.push(`${v}: default height=${h} sections(open=1)=${open}`);
}
await p.evaluate(() => window.show('arch', true));
await p.click('#v-arch > .acc:nth-of-type(3) > h3');
out.push('arch after clicking 2nd section: ' + await p.evaluate(() => [...document.querySelectorAll('#v-arch > .acc')].map((e) => e.classList.contains('open') ? 1 : 0).join('')));
await p.screenshot({ path: path.join(dir, 'st-arch.png') });
out.push('page errors=' + errs.length + ' ' + errs.join(' | '));
console.log(out.join('\n'));
await b.close();
const ok = seen[12] === 'steps:13:回顧' && seen.every((s) => s.split('steps:').length === 2) && errs.length === 0;
if (!ok) { console.error('FAIL'); process.exit(1); }
console.log('PASS');
