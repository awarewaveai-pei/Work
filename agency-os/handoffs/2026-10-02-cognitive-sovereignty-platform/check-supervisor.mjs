// Gate for platform-supervisor.html. Exit 1 when any rule of CONTRACT_TEMPLATE.md is broken.
// Usage (from repo root):  node agency-os/handoffs/2026-10-02-cognitive-sovereignty-platform/check-supervisor.mjs [--page <html>] [--root <repo root>] [--out <dir>]
// Writes full-page PNGs (8 views x 2 widths) and text-<view>.txt dumps to --out (default: OS temp dir). Read the dumps; green here is not a read-through.
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
      return {
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
    const north = [];
    for (const c of Object.keys(TRAINS)) if (!card(c).includes(TRAINS[c])) north.push('trains:' + c);
    for (const [k, bs, d] of [...SCALES, ...CITIZEN, ...CAPS, ...CW_DEFENCE, ...WAR_BEFORE]) for (const c of bs) if (!card(c).includes(d)) north.push(k + ':' + c);
    // Her framework (v0.1): every requirement is in the card of each block it names, and every step of her eight-step loop has a block.
    for (const [d, bs] of FRAME_REQ) for (const c of bs) if (!card(c).includes(d)) north.push('frame:' + c + ':' + d.slice(0, 10));
    for (const [s, ps] of LOOP) { if (!ps.length) north.push('loop step without a block: ' + s); for (const [c] of ps) if (!card(c).includes('「' + s + '」')) north.push('loop:' + s + ':' + c); }
    // Her five interface questions are in both cards that ask them, word for word from one list (2026-10-03).
    for (const q of INTERFACE_Q) for (const c of ['COLLAB', '規範與脈絡']) if (!card(c).includes(q)) north.push('interface question not in ' + c + ': ' + q.slice(0, 8));
    for (const [k, d, bs] of MEASURE) for (const c of bs) if (!card(c).includes(d)) north.push('measure:' + k + ':' + c);
    for (const [c, at, df] of CW_BLOCKS) { const t = card(c); if (!t.includes(at) || !t.includes(df)) north.push('cw:' + c); }
    for (const [k, v] of [...CW.defs, ...CW.goals, ...CW.levels]) if (!card('規範與脈絡').includes(v)) north.push('cwdef:' + k);
    // ...and every sentence on the north-star page is in some card (headings and data-nav navigation aside).
    const sq = (s) => s.replace(/\s+/g, '');
    const cardsText = sq(all.map((b) => card(b.code)).join('|'));
    const walker = document.createTreeWalker(document.getElementById('v-north'), NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.parentElement.closest('[data-nav], h2, h3, .bk, [data-cross5]')) continue;
      for (const s of n.textContent.split(/(?<=[。；])/)) { const k = sq(s); if (k.length >= 8 && !cardsText.includes(k)) north.push('sentence:' + k.slice(0, 20)); }
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
    for (const [k, parts] of SEVEN) for (const [owner, quote] of parts) for (const c of [].concat(owner)) if (!card(c).includes(quote)) seven.push(k + ':' + c);
    // One journey, two pages: same steps in the same order. A section that promises the five always-on items shows exactly those five.
    const journey = [];
    const oneSteps = [...document.querySelectorAll('#one-steps [data-step]')].map((e) => e.dataset.step);
    const flowSteps = [...document.querySelectorAll('#steps [data-step]')].map((e) => e.dataset.step);
    const want = JOURNEY.map((s) => s.t);
    if (oneSteps.join('|') !== want.join('|')) journey.push('one-page shows ' + oneSteps.length + ' of ' + want.length + ' steps');
    if (flowSteps.join('|') !== want.join('|')) journey.push('walk-through shows ' + flowSteps.length + ' of ' + want.length + ' steps');
    const covered = new Set([...JOURNEY.map((s) => s.who), ...ALWAYS_BLOCKS, ...Object.keys(JOURNEY_ALWAYS)]);
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
    for (const s of ['七道關卡', '建立任務', '每件任務', '我的任務', '共同紀錄', '案子的所在地', '找到的來源太少']) if (whole.includes(s)) typed.push('ambiguous word ' + s);
    if (!whole.includes(FACET_NAMES.length + ' 個面向')) typed.push('facet count');
    // The block count is written once (NB). Any "N 塊積木 / N 份積木合約 / N 格" on any page equals it; a position (第 N 塊),
    // the judgment card's 11 boxes and dated history are not counts of blocks (2026-10-03: 55 hand-typed 13s when block 14 came).
    if (NB !== BLOCKS.length) typed.push('NB ' + NB + ' but BLOCKS ' + BLOCKS.length);
    for (const m of whole.matchAll(/(第 )?(\d+) (塊積木|份積木合約|格(?!是))/g)) {
      const before = whole.slice(Math.max(0, m.index - 12), m.index);
      if (!m[1] && +m[2] !== NB && !/判斷卡|2026-/.test(before)) typed.push('block count typed by hand: ' + before.slice(-6) + m[0]);
    }
    // The blueprint's 任務 means the whole case in most boxes and one AI task in LEARN's: every box that uses it says which (round 5c).
    const taskBoxes = Object.keys(BP).filter((c) => BP[c].some((x) => /任務(?!卡)/.test(Array.isArray(x) ? x[0] + x[1].join('') : x)));
    for (const c of taskBoxes) if (!TASK_NOTE[c]) typed.push('任務 without a note: ' + c);
    for (const c of Object.keys(TASK_NOTE)) if (!taskBoxes.includes(c)) typed.push('任務 note on a box without 任務: ' + c);
    // Our own text (the twelve fields and 我們加的) says 案子; a bare 任務 is the blueprint's word only (round 5d).
    for (const b of all) {
      const own = [...FIELDS.map(([, f]) => [].concat(b[f] || []).join(' ')), ...(ADD[b.code] || []).map((x) => (Array.isArray(x) ? x[0] + x[1].join('') : x))].join(' ');
      if (/任務(?!卡)/.test(own)) typed.push('bare 任務 in ' + b.code);
    }
    return { toolRows, toolsMissing, journey, arch, purpose, seven, empty, noHandBack, noNever, handoff, pkgs, north, notBuilt, typed, total: TOOL_TOTAL, art: TOOL_OF('SENSE'), contracts: all.length, nb: NB, whole };
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
