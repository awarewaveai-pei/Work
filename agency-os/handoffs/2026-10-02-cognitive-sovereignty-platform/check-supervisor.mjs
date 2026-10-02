// Gate for platform-supervisor.html. Exit 1 when any rule of CONTRACT_TEMPLATE.md is broken.
// Usage (from repo root):  node agency-os/handoffs/2026-10-02-cognitive-sovereignty-platform/check-supervisor.mjs [--page <html>] [--root <repo root>] [--out <dir>]
// Writes full-page PNGs (8 views x 2 widths) and text-<view>.txt dumps to --out (default: OS temp dir). Read the dumps; green here is not a read-through.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => { const i = process.argv.indexOf('--' + name); return i > 0 ? path.resolve(process.argv[i + 1]) : fallback; };
const root = arg('root', path.resolve(here, '../../..'));
const pageFile = arg('page', path.join(here, 'platform-supervisor.html'));
const out = arg('out', path.join(os.tmpdir(), 'supervisor-check'));
mkdirSync(out, { recursive: true });

const require = createRequire(path.join(root, 'lobster-factory/infra/hetzner-phase1-core/tests/package.json'));
const { chromium } = require('@playwright/test');

// The artifact host wraps the file in a document skeleton; do the same here.
const wrapped = '<!doctype html><html><head><meta charset="utf8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + readFileSync(pageFile, 'utf8') + '</body></html>';
const wrappedPath = path.join(out, 'supervisor-wrapped.html');
writeFileSync(wrappedPath, wrapped);

const methods = path.join(root, 'agency-os/docs/AI_LEGO_Cognitive_Engineering_OS');
const contractFiles = readdirSync(path.join(methods, 'methods/contracts')).filter((f) => f.endsWith('.contract.yaml'));
const repo = {
  tools: contractFiles.filter((f) => !f.startsWith('stakeholder.')).length,   // stakeholder.regulator is a lens, not a tool
  art: contractFiles.filter((f) => f.startsWith('art_therapy.')).length,
  flows: readdirSync(path.join(methods, 'recipes/validated')).length,
};

const failures = [];
const report = [];
const rule = (label, name, bad) => {
  const list = Array.isArray(bad) ? bad : (bad ? [String(bad)] : []);
  report.push(`${label} ${name}=[${list.join(',')}]`);
  if (list.length) failures.push(`${label} ${name}: ${list.join(', ')}`);
};

const browser = await chromium.launch();
for (const [label, width] of [['wide', 1280], ['narrow', 400]]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(pathToFileURL(wrappedPath).href);
  const views = await page.evaluate(() => VIEWS);

  for (const v of views) {
    const m = await page.evaluate((name) => {
      window.show(name, true);
      const el = document.getElementById('v-' + name);
      el.querySelectorAll('details').forEach((d) => { d.open = true; });
      const text = el.innerText;
      const latin = (c) => new RegExp('(^|[^A-Z])' + c + '([^A-Z]|$)').test(text);
      return {
        text,
        overflow: document.documentElement.scrollWidth > innerWidth,
        blocks: BLOCKS.map((b) => b.code).filter((c) => !latin(c)),
        alwaysOn: CROSS.map((x) => x.code).filter((c) => !text.includes(c)),
      };
    }, v);
    await page.screenshot({ path: path.join(out, `${label}-${v}.png`), fullPage: true });
    if (label === 'wide') writeFileSync(path.join(out, `text-${v}.txt`), m.text);
    rule(label, `${v}.overflow`, m.overflow ? 'yes' : '');
    rule(label, `${v}.blocks_missing`, m.blocks);
    rule(label, `${v}.always_on_missing`, m.alwaysOn);
  }

  const r = await page.evaluate(() => {
    const all = [...BLOCKS, ...CROSS];
    const codes = all.map((b) => b.code);
    const flat = (v) => (Array.isArray(v) ? v.join(' ') : String(v || ''));
    const names = (s) => codes.filter((c) => (/^[A-Z]+$/.test(c) ? new RegExp('(^|[^A-Z])' + c + '([^A-Z]|$)').test(s) : s.includes(c)));
    const readsAll = ['LEARN', '共用紀錄'];
    const of = (c) => all.find((b) => b.code === c);

    // Every contract has all twelve fields.
    const empty = all.flatMap((b) => FIELDS.filter(([, f]) => b[f] === undefined || b[f] === '' || (Array.isArray(b[f]) && !b[f].length)).map(([k]) => b.code + ':' + k));
    // "AI may not / when it hands back" must say when it hands back; blocks must say what they never read.
    const noHandBack = all.filter((b) => !flat(b.aino).includes('交還控制')).map((b) => b.code);
    const noNever = BLOCKS.filter((b) => !flat(b.reads).includes('不讀')).map((b) => b.code);
    // Handoffs: A says it gives to X  =>  X's reads names A. Adjacent blocks of every package must connect.
    const handoff = [];
    for (const a of all) for (const c of names(flat(a.out))) {
      if (c === a.code || readsAll.includes(c)) continue;
      if (!names(flat(of(c).reads)).includes(a.code)) handoff.push(a.code + '->' + c);
    }
    const pkgs = [];
    for (const [k, , seq] of PK) for (let i = 1; i < seq.length; i++) {
      if (readsAll.includes(seq[i])) continue;
      if (!names(flat(of(seq[i]).reads)).includes(seq[i - 1])) pkgs.push(k + ':' + seq[i - 1] + '->' + seq[i]);
    }
    // The contract card is the only source: every north-star row must appear in the card of each block it names.
    window.show('contracts', true);
    const card = (c) => { const d = document.getElementById('b-' + c); d.open = true; return d.innerText; };
    const north = [];
    for (const c of Object.keys(TRAINS)) if (!card(c).includes(TRAINS[c])) north.push('trains:' + c);
    for (const [k, bs, d] of [...SCALES, ...CITIZEN, ...CAPS, ...CW_DEFENCE]) for (const c of bs) if (!card(c).includes(d)) north.push(k + ':' + c);
    for (const [k, d, bs] of MEASURE) for (const c of bs) if (!card(c).includes(d)) north.push('measure:' + k + ':' + c);
    for (const [c, at, df] of CW_BLOCKS) { const t = card(c); if (!t.includes(at) || !t.includes(df)) north.push('cw:' + c); }
    for (const [k, v] of [...CW.defs, ...CW.goals, ...CW.levels]) if (!card('規範與脈絡').includes(v)) north.push('cwdef:' + k);
    // Build order places all 18.
    window.show('progress', true);
    const chips = [...document.querySelectorAll('#order .bks .bk')].map((e) => e.textContent.trim());
    const notBuilt = codes.filter((c) => !chips.includes(c));
    // No counts typed by hand that the data already knows.
    const whole = VIEWS.map((v) => { window.show(v, true); return document.getElementById('v-' + v).innerText; }).join('\n');
    const typed = ['285', '18 份', '四樣', '寫好九條'].filter((s) => whole.includes(s));
    if (!whole.includes(FACET_NAMES.length + ' 個面向')) typed.push('facet count');
    return { empty, noHandBack, noNever, handoff, pkgs, north, notBuilt, typed, total: TOOL_TOTAL, art: TOOL_OF('SENSE'), contracts: all.length, whole };
  });
  rule(label, 'empty_fields', r.empty);
  rule(label, 'no_hand_back', r.noHandBack);
  rule(label, 'no_never_read', r.noNever);
  rule(label, 'handoff_unread', r.handoff);
  rule(label, 'package_step_unread', r.pkgs);
  rule(label, 'north_star_missing_from_contract', r.north);
  rule(label, 'not_in_build_order', r.notBuilt);
  rule(label, 'stale_typed_numbers', r.typed);
  rule(label, 'contract_count_not_18', r.contracts === 18 ? '' : r.contracts);
  rule(label, 'tool_total_vs_repo', r.total === repo.tools ? '' : `page ${r.total} repo ${repo.tools}`);
  rule(label, 'art_count_vs_repo', r.art === repo.art ? '' : `page ${r.art} repo ${repo.art}`);
  rule(label, 'workflow_count_vs_repo', r.whole.includes('登記檔裡是 ' + repo.flows + ' 條') ? '' : `repo ${repo.flows}`);
  rule(label, 'page_errors', errors);
  await ctx.close();
}
await browser.close();

console.log(report.filter((l) => !l.endsWith('=[]')).join('\n') || 'all rules empty');
console.log(`output: ${out}`);
if (failures.length) { console.error(`FAIL ${failures.length}`); process.exit(1); }
console.log('PASS');
