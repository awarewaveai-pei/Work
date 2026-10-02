// Lists every "N 個／條／項…" on the supervisor page with its sentence, view by view and card by card.
// A count is a hole when the reader cannot see which N things it means (operator 2026-10-03: 「要怎麼知道哪 116 個？」).
// Read the list and fix every hole: name the members in the same card or section, or say where they are listed.
//   node count-sweep.mjs [--page <html>] [--root <repo root>] [--out <file>]     default out: <os temp>/count-sweep.txt
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? path.resolve(process.argv[i + 1]) : d; };
const root = arg('root', path.resolve(here, '../../..'));
const page = arg('page', path.join(here, 'platform-supervisor.html'));
const outFile = arg('out', path.join(os.tmpdir(), 'count-sweep.txt'));
const require = createRequire(path.join(root, 'lobster-factory/infra/hetzner-phase1-core/tests/package.json'));
const { chromium } = require('@playwright/test');
const wrapped = path.join(os.tmpdir(), 'count-sweep-page.html');
writeFileSync(wrapped, '<!doctype html><html><head><meta charset="utf8"></head><body>' + readFileSync(page, 'utf8') + '</body></html>');
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await p.goto(pathToFileURL(wrapped).href);
const rows = await p.evaluate(() => {
  const out = [];
  const re = /(\d[\d,]*)\s*(個|條|項|種|格|塊|道|類|步|份|堂|層|組|件|樣|面向|題|站|節|輪|版|張|頁|篇|欄|句)/g;
  const scan = (where, text) => {
    for (const s of text.split(/(?<=[。；\n])/)) for (const m of s.matchAll(re)) {
      const i = s.indexOf(m[0]);
      if (i > 0 && s[i - 1] === '第') continue;   // 第 N 步 / 第 N 版 point at one thing, not a set
      out.push([where, m[0], s.trim().replace(/\s+/g, ' ').slice(0, 150)]);
    }
  };
  for (const v of VIEWS) {
    window.show(v, true);
    const el = document.getElementById('v-' + v);
    el.querySelectorAll('[data-panel]').forEach((d) => { d.hidden = false; });
    if (v === 'contracts') for (const d of el.querySelectorAll('details.cc')) { d.open = true; scan('card ' + d.id.slice(2), d.innerText); }
    else scan(v, el.innerText);
  }
  return out;
});
await b.close();
const uniq = [...new Map(rows.map((r) => [r.join('|'), r])).values()];
writeFileSync(outFile, uniq.map((r) => r.join('\t')).join('\n'), 'utf8');
console.log(`${uniq.length} counts -> ${outFile}`);
