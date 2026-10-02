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
    // Real state first: what the operator sees on opening the view, and how tall it is.
    const tall = await page.evaluate((name) => { window.show(name, true); scrollTo(0, 0); return document.documentElement.scrollHeight; }, v);
    await page.screenshot({ path: path.join(out, `${label}-${v}.png`), fullPage: true });
    // A view must not be a long scroll: every other view opens with at most one section expanded.
    // The one-page view is held to more, below: all of it fits one laptop screen.
    if (label === 'wide' && v !== 'one') rule(label, `${v}.too_long`, tall > 3200 ? tall + 'px' : '');
    const m = await page.evaluate((name) => {
      const el = document.getElementById('v-' + name);
      // Then open everything so the text checks and the dump cover the whole view.
      el.querySelectorAll('[data-panel]').forEach((d) => { d.hidden = false; });
      el.querySelectorAll('.acc').forEach((d) => d.classList.add('open'));
      el.querySelectorAll('details').forEach((d) => { d.open = true; });
      const text = el.innerText;
      const latin = (c) => new RegExp('(^|[^A-Z])' + c + '([^A-Z]|$)').test(text);
      // Reading text must not sit in a narrow column: a sentence that wraps to 3+ lines inside a block under
      // 300px wide at desktop width is "cramped". Pictures (the ring map, the bar charts) are exempt.
      const cramped = [];
      if (innerWidth >= 1000) for (const e of el.querySelectorAll('*')) {
        if (e.closest('.ring') || e.closest('nav') || e.closest('.bars')) continue;
        const nodes = [...e.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim().length >= 12);
        if (!nodes.length) continue;
        let blk = e;
        while (blk && getComputedStyle(blk).display.startsWith('inline')) blk = blk.parentElement;
        if (!blk || blk.getBoundingClientRect().width >= 300 || blk.getBoundingClientRect().width === 0) continue;
        const range = document.createRange();
        for (const n of nodes) {
          range.selectNodeContents(n);
          const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
          if (tops.size >= 3) cramped.push((e.closest('[class]')?.className || e.tagName).split(' ')[0] + ':' + n.textContent.trim().slice(0, 8));
        }
      }
      return {
        text,
        cramped: [...new Set(cramped.map((c) => c.split(':')[0]))].map((k) => k + '×' + cramped.filter((c) => c.startsWith(k + ':')).length),
        overflow: document.documentElement.scrollWidth > innerWidth,
        blocks: BLOCKS.map((b) => b.code).filter((c) => !latin(c)),
        alwaysOn: CROSS.map((x) => x.code).filter((c) => !text.includes(c)),
      };
    }, v);
    if (label === 'wide') writeFileSync(path.join(out, `text-${v}.txt`), m.text);
    rule(label, `${v}.overflow`, m.overflow ? 'yes' : '');
    rule(label, `${v}.cramped_text`, m.cramped);
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
    // Architecture: one owner per drawer; a stated handoff means the receiver reads a drawer the giver owns;
    // nobody both reads and never-reads a drawer; every drawer and every one of the 18 has a 'today' / wiring line.
    const arch = [];
    const ids = DRAWERS.map((d) => d.id);
    if (new Set(ids).size !== ids.length) arch.push('duplicate drawer id');
    for (const d of DRAWERS) { if (!codes.includes(d.owner)) arch.push('owner?' + d.id); if (!DRAWER_TODAY[d.id]) arch.push('today?' + d.id); }
    const owns = (c) => DRAWERS.filter((d) => d.owner === c).map((d) => d.id);
    const canRead = (c) => (DRAWER_READS[c] || []);
    for (const c of codes) if (!(c in DRAWER_READS)) arch.push('reads?' + c);
    for (const c of Object.keys(DRAWER_READS)) for (const id of DRAWER_READS[c]) if (id !== '*' && !ids.includes(id)) arch.push('unknown drawer ' + c + ':' + id);
    for (const c of Object.keys(DRAWER_NEVER)) for (const id of DRAWER_NEVER[c]) if (canRead(c).includes(id) || (canRead(c).includes('*'))) arch.push('reads and never-reads ' + c + ':' + id);
    for (const a of all) for (const c of names(flat(a.out))) {
      if (c === a.code || !owns(a.code).length) continue;
      if (!canRead(c).includes('*') && !owns(a.code).some((id) => canRead(c).includes(id))) arch.push('handoff without drawer ' + a.code + '->' + c);
    }
    for (const c of codes) if (!WIRING.some((w) => w[0] === c)) arch.push('wiring?' + c);
    for (const k of Object.keys(DRAWER_LIMIT)) { const [c, id] = k.split(':'); if (!canRead(c).includes(id)) arch.push('limit on a drawer not read ' + k); }
    // One journey, two pages: same steps in the same order. A section that promises the five always-on items shows exactly those five.
    const journey = [];
    const oneSteps = [...document.querySelectorAll('#one-steps [data-step]')].map((e) => e.dataset.step);
    const flowSteps = [...document.querySelectorAll('#steps [data-step]')].map((e) => e.dataset.step);
    const want = JOURNEY.map((s) => s.t);
    if (oneSteps.join('|') !== want.join('|')) journey.push('one-page shows ' + oneSteps.length + ' of ' + want.length + ' steps');
    if (flowSteps.join('|') !== want.join('|')) journey.push('walk-through shows ' + flowSteps.length + ' of ' + want.length + ' steps');
    const covered = new Set([...JOURNEY.map((s) => s.who), 'GOVERN', ...Object.keys(JOURNEY_ALWAYS)]);
    for (const c of codes) if (!covered.has(c)) journey.push('not in the journey: ' + c);
    if (JOURNEY.filter((s) => s.round === 'first').length !== 6) journey.push('first round is not 6 blocks');
    const five = CROSS.map((x) => x.code).join('|');
    for (const id of ['steps-always5', 'one-always5']) {
      const got = [...document.querySelectorAll('#' + id + ' [data-five]')].map((e) => e.dataset.five);
      if (got.join('|') !== five) journey.push(id + ' shows ' + got.length + ' of 5');
    }
    document.querySelectorAll('[data-cross5]').forEach((e, n) => { const k = e.querySelectorAll('.node').length; if (k !== 5) journey.push('five-card row #' + n + ' has ' + k); });
    // The tools page may hold nothing a contract card lacks: each row appears in the card of the block it belongs to.
    const toolsMissing = [];
    const ownerOf = (w) => TOOL_OWNER[w] || w;
    for (const r of [...TOOL_ROWS, ...FLOW_ROWS]) for (const w of r[0]) { const c = ownerOf(w); if (codes.includes(c) && !card(c).includes(r[2])) toolsMissing.push(c + ':' + r[2].slice(0, 12)); }
    for (const r of EXISTING_OTHER) for (const c of r[3]) if (!card(c).includes(r[2])) toolsMissing.push(c + ':' + r[0]);
    // Build order places all 18.
    window.show('progress', true);
    const chips = [...document.querySelectorAll('#order .bks .bk')].map((e) => e.textContent.trim());
    const notBuilt = codes.filter((c) => !chips.includes(c));
    // No counts typed by hand that the data already knows.
    const whole = VIEWS.map((v) => { window.show(v, true); return document.getElementById('v-' + v).innerText; }).join('\n');
    const typed = ['285', '18 份', '四樣', '寫好九條'].filter((s) => whole.includes(s));
    // One word per meaning: words retired when two contracts used them for different things.
    for (const s of ['同源合併', '同源群組', '來源地圖', '管道佔比', '來源身分卡']) if (whole.includes(s)) typed.push('retired word ' + s);
    if (!whole.includes(FACET_NAMES.length + ' 個面向')) typed.push('facet count');
    return { toolsMissing, journey, arch, empty, noHandBack, noNever, handoff, pkgs, north, notBuilt, typed, total: TOOL_TOTAL, art: TOOL_OF('SENSE'), contracts: all.length, whole };
  });
  rule(label, 'empty_fields', r.empty);
  rule(label, 'no_hand_back', r.noHandBack);
  rule(label, 'no_never_read', r.noNever);
  rule(label, 'handoff_unread', r.handoff);
  rule(label, 'package_step_unread', r.pkgs);
  rule(label, 'north_star_missing_from_contract', r.north);
  rule(label, 'tools_page_missing_from_contract', r.toolsMissing);
  rule(label, 'journey', r.journey);
  rule(label, 'architecture', r.arch);
  rule(label, 'not_in_build_order', r.notBuilt);
  rule(label, 'stale_typed_numbers', r.typed);
  rule(label, 'contract_count_not_18', r.contracts === 18 ? '' : r.contracts);
  rule(label, 'tool_total_vs_repo', r.total === repo.tools ? '' : `page ${r.total} repo ${repo.tools}`);
  rule(label, 'art_count_vs_repo', r.art === repo.art ? '' : `page ${r.art} repo ${repo.art}`);
  rule(label, 'workflow_count_vs_repo', r.whole.includes('登記檔裡是 ' + repo.flows + ' 條') ? '' : `repo ${repo.flows}`);
  rule(label, 'page_errors', errors);
  await ctx.close();
}
// The one-page view is one picture (operator 2026-10-03: pieces shown one after another read as unrelated pieces,
// and whatever scrolls away is forgotten). On a laptop screen, whichever item is picked, the page does not scroll:
// the whole route and the picked item are both in view. On a narrower screen at least the whole route stays in view.
for (const [w, h, all] of [[1536, 660, true], [1280, 660, true], [1100, 660, false]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(wrappedPath).href);
  const bad = await page.evaluate((all) => {
    show('one', true); scrollTo(0, 0);
    const out = [];
    const items = [...document.querySelectorAll('#one-route [data-k]')];
    if (items.length !== JOURNEY.length + 1 + CROSS.length + ONE_FAIL.length) out.push('route has ' + items.length + ' items');
    for (const b of items) {
      b.click();
      const shown = [...document.querySelectorAll('#one-panels [data-panel]')].filter((e) => !e.hidden);
      if (shown.length !== 1) out.push(b.dataset.k + ': ' + shown.length + ' panels');
      if (document.getElementById('one-route').getBoundingClientRect().bottom > innerHeight) out.push('route cut off');
      if (all && document.documentElement.scrollHeight > innerHeight) out.push(b.textContent.trim().slice(0, 10) + ':' + document.documentElement.scrollHeight);
    }
    return [...new Set(out)];
  }, all);
  rule(`${w}x${h}`, 'one.needs_scroll', bad);
  await ctx.close();
}
await browser.close();

console.log(report.filter((l) => !l.endsWith('=[]')).join('\n') || 'all rules empty');
console.log(`output: ${out}`);
if (failures.length) { console.error(`FAIL ${failures.length}`); process.exit(1); }
console.log('PASS');
