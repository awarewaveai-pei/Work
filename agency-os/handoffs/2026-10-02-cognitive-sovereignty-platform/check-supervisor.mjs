// Gate for platform-supervisor.html. Exit 1 when any rule of CONTRACT_TEMPLATE.md is broken.
// Usage (from repo root):  node agency-os/handoffs/2026-10-02-cognitive-sovereignty-platform/check-supervisor.mjs [--page <html>] [--root <repo root>] [--out <dir>]
// Writes full-page PNGs (every view x 2 widths) and text-<view>.txt dumps to --out (default: OS temp dir). Read the dumps; green here is not a read-through.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { buildBlock, pageBlock } from './gen-tools-data.mjs';

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
  // family of every tool file (the family decides which block a tool belongs to), and every workflow file id
  families: Object.fromEntries(Object.entries(contractFiles.filter((f) => !f.startsWith('stakeholder.')).reduce((m, f) => {
    const fam = (readFileSync(path.join(methods, 'methods/contracts', f), 'utf8').match(/^family:\s*(\S+)/m) || [])[1] || '?';
    m[fam] = (m[fam] || 0) + 1; return m;
  }, {}))),
  recipes: readdirSync(path.join(methods, 'recipes/validated')).map((f) => f.replace(/\.recipe\.yaml$/, '')),
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
    // Real state first: what the operator sees on opening the view. (The one-page view has its own rule below:
    // all of it fits one laptop screen. The other views stay fully open -- she never asked to fold them.)
    await page.evaluate((name) => { window.show(name, true); scrollTo(0, 0); }, v);
    await page.screenshot({ path: path.join(out, `${label}-${v}.png`), fullPage: true });
    const m = await page.evaluate((name) => {
      const el = document.getElementById('v-' + name);
      // Then open everything so the text checks and the dump cover the whole view.
      el.querySelectorAll('[data-panel]').forEach((d) => { d.hidden = false; });
      el.querySelectorAll('details').forEach((d) => { d.open = true; });
      const text = el.innerText;
      const latin = (c) => new RegExp('(^|[^A-Z])' + c + '([^A-Z]|$)').test(text);
      // Reading text must not sit in a narrow column: a sentence that wraps to 3+ lines inside a block under
      // 300px wide at desktop width is "cramped". Pictures (the ring map, the bar charts) are exempt.
      const cramped = [];
      if (innerWidth >= 1000) for (const e of el.querySelectorAll('*')) {
        if (e.closest('.ring') || e.closest('nav') || e.closest('.bars .track, .bars .who')) continue;   // only the chart itself; text under a bar is reading text
        const nodes = [...e.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim().length >= 12);
        if (!nodes.length) continue;
        // Measure the width the text itself gets, not its box: text put into a narrow grid track sits in a wide box
        // (round 11: the decided page's sub-lists went into the 24px mark column and the page grew to 18,000px).
        const range = document.createRange();
        for (const n of nodes) {
          range.selectNodeContents(n);
          const rects = [...range.getClientRects()].filter((r) => r.width > 0);
          const tops = new Set(rects.map((r) => Math.round(r.top)));
          if (tops.size >= 3 && Math.max(0, ...rects.map((r) => r.width)) < 300) cramped.push((e.closest('[class]')?.className || e.tagName).split(' ')[0] + ':' + n.textContent.trim().slice(0, 8));
        }
      }
      // ...nor side by side: two blocks in one row that each hold a sentence of 40+ characters.
      const side = [];
      const longText = (k) => [k, ...k.querySelectorAll('*')].some((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length >= 40));
      if (innerWidth >= 1000) for (const e of el.querySelectorAll('*')) {
        if (e.closest('.ring, nav')) continue;
        const kids = [...e.children].filter((k) => k.getBoundingClientRect().height > 0 && longText(k));
        for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
          const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
          if (Math.abs(a.top - b.top) < 4 && Math.abs(a.left - b.left) > 40) side.push((e.className || e.tagName).split(' ')[0]);
        }
      }
      // One order (2026-10-03: by relation, written once in BLOCKS/CROSS). Chips side by side and 「、」 lists of codes follow it on
      // every page; chips joined by → are a sequence (a package, the first round) and keep their own order (round 8: N8m4).
      const ORDERL = [...BLOCKS.map((b) => b.code), ...CROSS.map((x) => x.code)];
      const order = [];
      for (const parent of new Set([...el.querySelectorAll('.bk')].map((b) => b.parentElement))) {
        const kids = [...parent.children].filter((k) => k.classList.contains('bk') && ORDERL.includes(k.textContent.trim()));
        if (kids.length < 2 || parent.textContent.includes('→')) continue;
        const ix = kids.map((k) => ORDERL.indexOf(k.textContent.trim()));
        if (ix.some((x, i) => i && x < ix[i - 1])) order.push(kids.map((k) => k.textContent.trim()).join('/'));
      }
      // A list split over several boxes is still one list: the renderer marks its box [data-set] (round 9: the arch reader
      // lists and the record page's 全程 rows were sorted box by box, not as one list).
      for (const box of el.querySelectorAll('[data-set]')) {
        const cs = [...box.querySelectorAll('.bk')].map((k) => k.textContent.trim()).filter((c) => ORDERL.includes(c));
        const ix = cs.map((c) => ORDERL.indexOf(c));
        if (ix.some((x, i) => i && x < ix[i - 1])) order.push('[set] ' + cs.join('/'));
      }
      const tok = ORDERL.slice().sort((a, b) => b.length - a.length).join('|');
      const sep = '、| ?和 ?| ?或 ?|／';
      for (const mm of text.matchAll(new RegExp('(?<![A-Za-z])(?:' + tok + ')(?:(?:' + sep + ')(?:' + tok + '))+(?![A-Za-z])', 'g'))) {
        const ix = mm[0].split(new RegExp(sep)).map((c) => ORDERL.indexOf(c));
        if (ix.some((x, i) => i && x < ix[i - 1])) order.push(mm[0]);
      }
      return {
        order: [...new Set(order)],
        side: [...new Set(side)],
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
    rule(label, `${v}.long_text_side_by_side`, m.side);
    rule(label, `${v}.blocks_missing`, m.blocks);
    rule(label, `${v}.always_on_missing`, m.alwaysOn);
    rule(label, `${v}.out_of_block_order`, m.order);
  }

  const r = await page.evaluate((repo) => {
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
    const has = (c, x) => card(c).includes(plain(x));
    const north = [];
    for (const c of Object.keys(TRAINS)) if (!has(c, TRAINS[c])) north.push('trains:' + c);
    for (const [k, bs, d] of [...SCALES, ...CITIZEN, ...CAPS, ...CW_DEFENCE, ...WAR_BEFORE]) for (const c of bs) if (!has(c, d)) north.push(k + ':' + c);
    // Her framework (v0.1): every requirement is in the card of each block it names, and every step of her eight-step loop has a block.
    for (const [d, bs] of FRAME_REQ) for (const c of bs) if (!has(c, d)) north.push('frame:' + c + ':' + d.slice(0, 10));
    // Every section a framework row cites has a row in the v0.1 table (computed from the data, 2026-10-03 round 7).
    for (const r of FRAME_REQ) if (!V01.some((v) => v[0] === r[2])) north.push('v0.1 section without a table row: ' + r[2]);
    // Every package has an owner for each judgment-sovereignty check: a block in it, a always-on item, or the content-block list.
    for (const [k, , bs] of PK) for (const [name, parts] of SEVEN) if (!parts.some(([o]) => Array.isArray(o) || CROSS.some((x) => x.code === o) || bs.includes(o))) north.push('package ' + k + ' has no owner for ' + name);
    for (const [s, ps] of LOOP) { if (!ps.length) north.push('loop step without a block: ' + s); for (const [c] of ps) if (!has(c, '「' + s + '」')) north.push('loop:' + s + ':' + c); }
    // Her five interface questions are in both cards that ask them, word for word from one list (2026-10-03).
    for (const q of INTERFACE_Q) for (const c of ['COLLAB', '規範與脈絡']) if (!has(c, q)) north.push('interface question not in ' + c + ': ' + q.slice(0, 8));
    for (const [k, d, bs] of MEASURE) for (const c of bs) if (!has(c, d)) north.push('measure:' + k + ':' + c);
    // The north page says 「N 塊各自…」: every block has a row in TRAINS and in CW_BLOCKS.
    for (const b of BLOCKS) { if (!TRAINS[b.code]) north.push('trains: no row for ' + b.code); if (!CW_BLOCKS.some((x) => x[0] === b.code)) north.push('cw: no row for ' + b.code); }
    // The blueprint table is computed from the section number after each blueprint line (round 8: written by hand, 9 rows missed
    // cards). Every number has a row, and every section has a home (a card or a page).
    for (const b of all) for (const x of cardText(b)) for (const ref of bpRefs(x)) if (!BP_ROWS.some((row) => row[0] === bpRow(ref))) north.push('blueprint section without a row: ' + b.code + ' ' + ref);
    for (const row of document.querySelectorAll('#cover [data-sec]')) if (row.dataset.sec !== '0' && /沒有寫進卡片$/.test(row.innerText.trim())) north.push('blueprint section with no home: ' + row.dataset.sec);
    for (const [c, at, df] of CW_BLOCKS) { if (!has(c, at) || !has(c, df)) north.push('cw:' + c); }
    for (const [k, v] of [...CW.defs, ...CW.goals, ...CW.levels]) if (!has('規範與脈絡', v)) north.push('cwdef:' + k);
    // ...and every sentence on the north-star page is in some card (headings and data-nav navigation aside).
    const sq = (s) => s.replace(/\s+/g, '');
    const cardsText = sq(all.map((b) => card(b.code)).join('|'));
    const walker = document.createTreeWalker(document.getElementById('v-north'), NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.parentElement.closest('[data-nav], h2, h3, .bk, [data-cross5]')) continue;
      for (const s of n.textContent.split(/(?<=[。；])/)) { const k = sq(plain(s)); if (k.length >= 8 && !cardsText.includes(k)) north.push('sentence:' + k.slice(0, 20)); }
    }
    // Tools: each row's count, recounted from the repo by family; every family in exactly one row.
    const toolRows = [];
    const famRow = {};
    for (const r of TOOL_ROWS) {
      const groups = r[3] || [];
      for (const [label, fams] of groups) {
        const n = fams.reduce((s, f) => s + (repo.families[f] || 0), 0);
        if (groups.length > 1 && !r[2].includes(label + ' ' + n)) toolRows.push(label + ' should be ' + n);
        for (const f of fams) { if (famRow[f]) toolRows.push('family in two rows: ' + f); famRow[f] = r[0].join(); }
      }
      const n = groups.flatMap((g) => g[1]).reduce((s, f) => s + (repo.families[f] || 0), 0);
      if (n !== r[1]) toolRows.push(r[0].join() + ' says ' + r[1] + ', repo ' + n);
    }
    for (const f of Object.keys(repo.families)) if (!famRow[f]) toolRows.push('family in no row: ' + f);
    // Workflows: every file in exactly one row; each row's count equals its files.
    const seen = FLOW_ROWS.flatMap((r) => r[3] || []);
    for (const r of FLOW_ROWS) if ((r[3] || []).length !== r[1]) toolRows.push('workflow row ' + r[0].join() + ' says ' + r[1] + ', lists ' + (r[3] || []).length);
    for (const id of repo.recipes) if (seen.filter((x) => x === id).length !== 1) toolRows.push('workflow file listed ' + seen.filter((x) => x === id).length + ' times: ' + id);
    for (const id of seen) if (!repo.recipes.includes(id)) toolRows.push('workflow file not in repo: ' + id);
    const internal = FLOWS.filter((f) => f[2] === 'internal').map((f) => f[0]).sort().join();
    const inRow = (FLOW_ROWS.find((r) => r[0][0] === '不給一般使用者') || [, , , []])[3].slice().sort().join();
    if (internal !== inRow) toolRows.push('internal workflows: registry ' + internal + ' / row ' + inRow);
    // Architecture: one owner per drawer; a stated handoff means the receiver reads a drawer the giver owns;
    // nobody both reads and never-reads a drawer; every drawer and every block and each of the five has a 'today' / wiring line.
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
    // Work outside a case has no 協作合約 and no 開案資料 (round 10: the daily calibration was missing from the list of such calls).
    const outside = [...new Set(DRAWERS.filter((d) => ['練習', '帶領', '個人'].includes(d.where)).map((d) => d.owner))].sort().join();
    if (outside !== OUT_CASE_CALLS.map((x) => x[0]).sort().join()) arch.push('calls outside a case: drawers ' + outside + ' / list ' + OUT_CASE_CALLS.map((x) => x[0]).join());
    // What a card writes is its drawers (round 10: 個人歷程 held two items LEARN's card did not list).
    for (const d of DRAWERS) if (!has(d.owner, d.has)) arch.push('drawer contents not on its writer card: ' + d.id);
    // One order for the blocks and one for the five (2026-10-03: arranged by relation, not by when they were added);
    // the lists written out by hand follow it.
    const order = [...BLOCKS.map((b) => b.code), ...CROSS.map((x) => x.code)];
    const inOrder = (list, name) => { const ix = list.filter((c) => order.includes(c)).map((c) => order.indexOf(c)); if (ix.some((v, i) => i && v < ix[i - 1])) arch.push(name + ' not in block order'); };
    inOrder(WIRING.map((w) => w[0]), 'WIRING');
    inOrder(TOOL_ROWS.map((r) => r[0][0]), 'TOOL_ROWS');
    for (const l of LAYERS) inOrder(l[3], 'LAYERS ' + l[1]);
    inOrder(ALWAYS_BLOCKS, 'ALWAYS_BLOCKS');
    inOrder(FLOW_ROWS.map((r) => r[0][0]), 'FLOW_ROWS');
    inOrder(SEES_CONTENT, 'SEES_CONTENT');
    for (const r of WAR_BEFORE) inOrder(r[1], 'WAR_BEFORE ' + r[0]);   // its sentence names the blocks in the order of its chips
    for (const k of Object.keys(DRAWER_LIMIT)) { const [c, id] = k.split(':'); if (!canRead(c).includes(id)) arch.push('limit on a drawer not read ' + k); }
    // Data collected for one purpose goes only to that purpose (critic round 5c): every reader of a drawer that holds where
    // someone is says which items it reads, and the places a card says it reads are the places the architecture page gives it.
    // Your provisional stance on a norm (規範與脈絡's fourth check) is held to the same rule (round 5e: MAP could read it).
    const PLACE = [['發生地', /發生地|發生在哪裡/], ['你在哪裡', /你在哪裡|你所在地|你自己在哪裡/], ['當事人各在哪裡', /當事人各在哪裡/], ['參與者在哪裡', /參與者在哪裡/], ['暫定立場', /暫定立場/]];
    const places = (s) => PLACE.filter(([, re]) => re.test(s)).map(([k]) => k).join('、');
    const placeDrawers = DRAWERS.filter((d) => places(d.has));
    const purpose = [];
    for (const d of placeDrawers) for (const c of Object.keys(DRAWER_READS)) if (DRAWER_READS[c].includes(d.id) && !DRAWER_LIMIT[c + ':' + d.id]) purpose.push(c + ' reads all of ' + d.name);
    for (const b of all) {
      const archSays = placeDrawers.filter((d) => canRead(b.code).includes(d.id)).map((d) => DRAWER_LIMIT[b.code + ':' + d.id] || d.has).join(' ');
      const cardSays = [].concat(b.reads).filter((s) => !/^絕不讀/.test(s)).join(' ');
      if (places(archSays) !== places(cardSays)) purpose.push(b.code + ': card [' + places(cardSays) + '] / architecture [' + places(archSays) + ']');
    }
    // The one-page says the same places as the architecture page (round 5d: 規範與脈絡's summary left out 你在哪裡).
    const archPlaces = (c) => places(placeDrawers.filter((d) => canRead(c).includes(d.id)).map((d) => DRAWER_LIMIT[c + ':' + d.id] || d.has).join(' '));
    const onePage = [...Object.entries(JOURNEY_ALWAYS), ...JOURNEY.map((s) => [s.who, [...s.you, ...s.sys, ...s.ai]])];
    for (const [c, ls] of onePage) {
      const said = places(ls.filter((s) => s.includes('讀')).join(' '));
      if (said && said !== archPlaces(c)) purpose.push('one-page ' + c + ': [' + said + '] / architecture [' + archPlaces(c) + ']');
    }
    // Each of the seven judgment-sovereignty checks has one owner, and the owner's card carries the sentence (round 5c).
    const seven = SEVEN.length === 7 ? [] : ['not seven: ' + SEVEN.length];
    for (const [k, parts] of SEVEN) for (const [owner, quote] of parts) for (const c of [].concat(owner)) if (!has(c, quote)) seven.push(k + ':' + c);
    // One journey, two pages: same steps in the same order. A section that promises the five always-on items shows exactly those five.
    const journey = [];
    const oneSteps = [...document.querySelectorAll('#one-steps [data-step]')].map((e) => e.dataset.step);
    const flowSteps = [...document.querySelectorAll('#steps [data-step]')].map((e) => e.dataset.step);
    const want = JOURNEY.map((s) => s.t);
    if (oneSteps.join('|') !== want.join('|')) journey.push('one-page shows ' + oneSteps.length + ' of ' + want.length + ' steps');
    if (flowSteps.join('|') !== want.join('|')) journey.push('walk-through shows ' + flowSteps.length + ' of ' + want.length + ' steps');
    const covered = new Set([...JOURNEY.map((s) => s.who), ...ALWAYS_BLOCKS, ...Object.keys(JOURNEY_ALWAYS)]);
    for (const c of codes) if (!covered.has(c)) journey.push('not in the journey: ' + c);
    if (JOURNEY.filter((s) => s.round === 'first').length !== FIRST_MAX) journey.push('first round is not ' + FIRST_MAX + ' blocks');
    for (const [k, , bs] of PK) if (bs.length > FIRST_MAX) journey.push('package longer than the first-round limit: ' + k);
    // The blocks there from start to end: one list, both pages (round 8: the walk-through showed GOVERN only, the one-page both).
    const always = (sel) => [...document.querySelectorAll(sel)].map((e) => e.dataset.always).join('|');
    if (always('#steps-govern [data-always]') !== ALWAYS_BLOCKS.join('|') || always('#one-band [data-always]') !== ALWAYS_BLOCKS.join('|')) journey.push('start-to-end blocks: walk-through ' + always('#steps-govern [data-always]') + ' / one-page ' + always('#one-band [data-always]'));
    const five = CROSS.map((x) => x.code).join('|');
    for (const id of ['steps-always5', 'one-always5']) {
      const got = [...document.querySelectorAll('#' + id + ' [data-five]')].map((e) => e.dataset.five);
      if (got.join('|') !== five) journey.push(id + ' shows ' + got.length + ' of 5');
    }
    document.querySelectorAll('[data-cross5]').forEach((e, n) => { const k = e.querySelectorAll('.node').length; if (k !== 5) journey.push('five-card row #' + n + ' has ' + k); });
    // The tools page may hold nothing a contract card lacks: each row appears in the card of the block it belongs to.
    const toolsMissing = [];
    const ownerOf = (w) => TOOL_OWNER[w] || w;
    for (const r of [...TOOL_ROWS, ...FLOW_ROWS]) for (const w of r[0]) { const c = ownerOf(w); if (codes.includes(c) && !has(c, r[2])) toolsMissing.push(c + ':' + r[2].slice(0, 12)); }
    for (const r of EXISTING_OTHER) for (const c of r[3]) if (!has(c, r[2])) toolsMissing.push(c + ':' + r[0]);
    // Build order places every block and each of the five.
    window.show('progress', true);
    const chips = [...document.querySelectorAll('#order .bks .bk')].map((e) => e.textContent.trim());
    const notBuilt = codes.filter((c) => !chips.includes(c));
    // No counts typed by hand that the data already knows.
    const whole = VIEWS.map((v) => { window.show(v, true); return document.getElementById('v-' + v).innerText; }).join('\n');
    const typed = ['285', '18 份', '四樣', '寫好九條'].filter((s) => whole.includes(s));
    // One word per meaning: words retired when two contracts used them for different things.
    for (const s of ['同源合併', '同源群組', '來源地圖', '管道佔比', '來源身分卡']) if (whole.includes(s)) typed.push('retired word ' + s);
    // One word, one meaning (critic round 5): 關卡 = the three architecture gates; 任務 = one action (任務卡), the whole is a 案子;
    // COLLAB's record is 群組紀錄 (共用紀錄 is the case record); 所在地 is split into 發生地 and 你在哪裡; a thin result counts 出處.
    for (const s of ['七道關卡', '建立任務', '每件任務', '我的任務', '共同紀錄', '案子的所在地', '找到的來源太少', '受影響的人', '找不找得到出處', '出處是不是彼此獨立', '參與者沒有多做一步', '管的是參與者', '把它開成一個案子']) if (whole.includes(s)) typed.push('ambiguous word ' + s);
    if (!whole.includes(FACET_NAMES.length + ' 個面向')) typed.push('facet count');
    // The block count is written once (NB). Any "N 塊積木 / N 份積木合約 / N 格" on any page equals it; a position (第 N 塊),
    // the judgment card's 11 boxes and dated history are not counts of blocks (2026-10-03: 55 hand-typed 13s when block 14 came).
    if (NB !== BLOCKS.length) typed.push('NB ' + NB + ' but BLOCKS ' + BLOCKS.length);
    for (const m of whole.matchAll(/(第 )?(\d+) (塊積木|份積木合約|格(?!是))/g)) {
      const before = whole.slice(Math.max(0, m.index - 12), m.index);
      if (!m[1] && +m[2] !== NB && !/判斷卡|2026-/.test(before)) typed.push('block count typed by hand: ' + before.slice(-6) + m[0]);
    }
    // A named set written out in brackets on any page has exactly its members (round 9: 「外殼」 had three member lists).
    for (const [nm, ms] of [['外殼', LAYERS[1][3]], ['基本安全', GOVERN_FIRST], ['研究與治理', GOVERN_LATER]])
      for (const mm of whole.matchAll(new RegExp(nm + '（([^）]*)）', 'g'))) if (mm[1] !== ms.join('、')) typed.push('named set ' + nm + '（' + mm[1] + '）');
    // ...and the four norm checks and VERIFY's three things, wherever they are written out (round 10: three wordings each).
    for (const mm of whole.matchAll(/四個檢查：([^。]*)。/g)) if (mm[1] !== NORM_CHECKS.join('；')) typed.push('named set 四個檢查：' + mm[1].slice(0, 30));
    for (const mm of whole.matchAll(/找得到出處、[^，。；\n]*/g)) if (mm[0] !== THREE.join('、')) typed.push('named set 三件事：' + mm[0]);
    // The worked example is one set of data: SENSE's example is EX_CARDS, and its labels are the kinds SENSE offers (round 9).
    if (BLOCKS.find((b) => b.code === 'SENSE').example !== EX_CARDS) typed.push('SENSE example is not EX_CARDS');
    for (const [k] of EX_CARDS) if (!CARD_KINDS.includes(k)) typed.push('example card kind not offered: ' + k);
    // The first-round limit is written once (FIRST_MAX): 「第一輪…N 塊」 and 「不算在 N 塊裡」 on any page equal it.
    for (const mm of whole.matchAll(/(第一輪[^。；\n]{0,14}?|不算在 )(\d+) 塊/g)) if (+mm[2] !== FIRST_MAX) typed.push('first-round limit typed as ' + mm[0]);
    // A block's number written next to its code is the number in BLOCKS (2026-10-03: renumbered twice in one day).
    for (const mm of whole.matchAll(/(?<![\d.])(\d{1,2})\s?([A-Z]{3,})(?![A-Za-z])|(?<![A-Za-z])([A-Z]{3,}) (\d{1,2})(?![\d.])/g)) {
      const n = +(mm[1] || mm[4]), b = BLOCKS.find((x) => x.code === (mm[2] || mm[3]));
      if (b && b.n !== n) typed.push('block number: ' + mm[0].replace(/\s/, ' '));
    }
    // One word on the cards (round 16): 案子 is the whole case, 任務卡 is ACT's card. Cards no longer show which lines quote the
    // blueprint, so the blueprint's 任務 is written as what it means there (案子, or "the thing handed to the AI" in LEARN).
    const itemText = (x) => (Array.isArray(x) ? x[0] + x[1].join('') : String(x));
    for (const b of all) for (const x of cardItems(b)) if (/任務(?!卡)/.test(itemText(x))) typed.push('任務 on a card (write 案子 or what it means): ' + b.code + ': ' + itemText(x).slice(0, 12));
    // A card is its twelve fields (2026-10-03: not boxes by source) and shows no source tags (she: 「不用」).
    if (document.querySelectorAll('#v-contracts .cc .bp').length) typed.push('a source box on a contract card');
    for (const b of all) { const t = card(b.code); if (plain(t) !== t) typed.push('source tag shown on ' + b.code + ': ' + (t.match(/（[^（）]*）/g) || []).find((g) => plain(g) !== g)); }
    // ...checked a second way that does not reuse plain() (round 16 M3: plain(t) !== t only fails when the renderer skips plain):
    // any bracket on a card that names a source document or a section is a visible tag.
    const TAG_SEEN = /（[^（）]*(?:增補 A\d|藍圖 ?第? ?\d|第 \d+(?:\.\d+)? 節|研究線總計畫|講稿|》第)[^（）]*）/g;
    for (const b of all) for (const g of card(b.code).match(TAG_SEEN) || []) typed.push('source tag visible on ' + b.code + ': ' + g.slice(0, 24));
    for (const w of ['藍圖已經寫明的要求', '藍圖沒寫、我們加的', '北極星對這一塊的要求', '判斷主權框架對這一塊', '現有的東西裡歸這一塊', '「藍圖要求」']) if (whole.includes(w)) typed.push('retired box name ' + w);
    // One list of what is still undecided (round 8: the 「帶領」 question sat only inside a settled entry). Every line on any page
    // that says 還沒定／等你定／等你決定 is covered by a line of the decided page's list (its pattern) or is listed there word for word;
    // a settled entry may point to the list but must be covered too.
    // Wordings beyond 還沒定 (round 9: 「等你看」「看過再定」「你還沒看過」 slipped past).
    const PENDING_WORDS = /還沒定|等你定|等你決定|等你看|再定|還沒看過|還沒逐/;
    const pending = [];
    const openList = document.getElementById('open').innerText.replace(/\s+/g, '');
    // A line the OPEN list already covers is not listed a second time under 「從卡上自動列出」 (round 16 M1).
    for (const li of document.querySelectorAll('#open ul.pend li')) if (OPEN.some(([, re]) => re && re.test(li.innerText))) pending.push('listed twice: ' + li.innerText.slice(0, 40));
    // ...and judged on the stored line, which still has the section numbers the OPEN patterns match.
    const pendTexts = [...document.querySelectorAll('#open ul.pend li')].map((li) => li.innerText.replace(/\s+/g, ''));
    for (const b of all) for (const raw of cardText(b)) if (PENDING_WORDS.test(raw) && OPEN.some(([, re]) => re && re.test(raw)) && pendTexts.some((t) => t.endsWith(plain(raw).replace(/\s+/g, '')))) pending.push('listed twice: ' + b.code + ': ' + plain(raw).slice(0, 30));
    for (const v of VIEWS) {
      window.show(v, true);
      const el = document.getElementById('v-' + v);
      el.querySelectorAll('details').forEach((d) => { d.open = true; });
      el.querySelectorAll('[data-panel]').forEach((d) => { d.hidden = false; });
      const ol = document.getElementById('open');
      if (v === 'decided') ol.style.display = 'none';
      const tx = el.innerText;
      ol.style.display = '';
      for (const line of tx.split('\n')) {
        if (!PENDING_WORDS.test(line)) continue;
        if (!OPEN.some(([, re]) => re && re.test(line)) && !openList.includes(line.replace(/\s+/g, ''))) pending.push(v + ': ' + line.trim().slice(0, 40));
      }
    }
    return { toolRows, toolsMissing, journey, arch, purpose, seven, empty, noHandBack, noNever, handoff, pkgs, north, notBuilt, typed, pending, total: TOOL_TOTAL, art: TOOL_OF('SENSE'), contracts: all.length, nb: NB, whole };
  }, repo);
  rule(label, 'empty_fields', r.empty);
  rule(label, 'tool_rows_vs_repo', r.toolRows);
  rule(label, 'no_hand_back', r.noHandBack);
  rule(label, 'no_never_read', r.noNever);
  rule(label, 'handoff_unread', r.handoff);
  rule(label, 'package_step_unread', r.pkgs);
  rule(label, 'north_star_missing_from_contract', r.north);
  rule(label, 'tools_page_missing_from_contract', r.toolsMissing);
  rule(label, 'journey', r.journey);
  rule(label, 'architecture', r.arch);
  rule(label, 'data_for_one_purpose', r.purpose);
  rule(label, 'sovereignty_check_owner', r.seven);
  rule(label, 'not_in_build_order', r.notBuilt);
  rule(label, 'stale_typed_numbers', r.typed);
  rule(label, 'undecided_not_on_the_list', r.pending);
  rule(label, 'contract_count', r.contracts === r.nb + 5 ? '' : `${r.contracts} contracts for ${r.nb} blocks and the five`);
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
    if (items.length !== JOURNEY.length + ALWAYS_BLOCKS.length + CROSS.length + ONE_FAIL.length) out.push('route has ' + items.length + ' items');
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
// Every tool and workflow is named on the page from a block generated out of the repo; it must be current.
rule('repo', 'tools_block_out_of_date', pageBlock(readFileSync(pageFile, 'utf8')) === buildBlock(root) ? '' : 'run gen-tools-data.mjs --write');

console.log(report.filter((l) => !l.endsWith('=[]')).join('\n') || 'all rules empty');
console.log(`output: ${out}`);
if (failures.length) { console.error(`FAIL ${failures.length}`); process.exit(1); }
console.log('PASS');
