// 從 data.mjs 產生 supervisor.html（claude.ai artifact 頁；平台會員與登入後介面）。頁面不手改；文字全在 data.mjs，數字全算出來。版面在 scripts/supervisor-kit。
//   node build.mjs      寫 supervisor.html
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { esc, t, page, section } from '../../../scripts/supervisor-kit/build.mjs';
import { META, COPY, STEPS, BATCHES, GO, RISKS, DECIDE } from './data.mjs';

const L = COPY.label;
const ST = { todo: [L.todo, 'todo'], doing: [L.doing, 'doing'], review: [L.review, 'review'], done: [L.done, 'done'] };
const RISK = { High: 'high', Medium: 'med', Low: 'low' };
const byId = new Map(STEPS.map((s) => [s.code, s]));
const inBatch = (b) => b.cards.map((c) => byId.get(c.id));
const count = (arr, stage) => arr.filter((s) => s.stage === stage).length;

const CSS = `.st-review{color:var(--accent)} .step.review .n{background:var(--accent)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:0 0 14px}
.stats div{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:10px 12px;min-width:0}
.stats b{display:block;font-size:22px;font-family:var(--display)} .stats span{color:var(--muted);font-size:13.5px}
ul.cur{list-style:none;margin:0 0 6px;padding:0;display:grid;gap:6px}
ul.cur li{display:flex;flex-wrap:wrap;gap:4px 8px;align-items:baseline;background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:8px 12px;min-width:0}
ul.cur a{color:var(--accent);font-family:var(--mono);font-size:13px}
.seen{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin:0 0 12px;font-size:15px}
.seen b{color:var(--accent)}
.bprog{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;margin:0 0 10px;font-size:14px;color:var(--muted)}
.card-id{font-family:var(--mono);font-size:12.5px;color:var(--muted);margin-right:6px}
.empty{background:var(--paper);border:1px dashed var(--line);border-radius:10px;padding:12px 14px;color:var(--muted);margin:0}
details.bd{margin:10px 0 0}
ol.go .n{background:var(--high)}`;

function cardLi(s) {
  const [stLabel, stCls] = ST[s.stage];
  const risk = s.risk;
  return `<li class="step ${stCls}" id="${esc(s.code)}">
    <div class="n">${s.n}</div>
    <div class="b">
      <p class="plain"><span class="card-id">${esc(s.code)}</span>${esc(s.plain)}</p>
      <p class="meta"><span class="pill st-${stCls}">${esc(stLabel)}</span><span class="pill risk-${RISK[risk]}">${esc(L.risk)}${esc(L[risk])}</span></p>
      <details><summary>${esc(L.details)}</summary>
        <p><b>${esc(L.after)}：</b>${s.after ? esc(s.after) : esc(L.none)}</p>
        <p><b>${esc(L.model)}：</b>${esc(s.model)}</p>${s.commit ? `
        <p><b>${esc(L.commit)}：</b><code>${esc(s.commit)}</code></p>` : ''}
      </details>
    </div></li>`;
}

function batchBody(b) {
  const cs = inBatch(b);
  const prog = `<p class="bprog"><span>${t('{done}／{n} 完成', { done: count(cs, 'done'), n: cs.length })}</span><span>${t('進行中 {n}', { n: count(cs, 'doing') })}</span><span>${t('待驗收 {n}', { n: count(cs, 'review') })}</span></p>`;
  const seen = `<p class="seen"><b>${esc(L.seen)}：</b>${esc(b.seen)}</p>`;
  const list = `<ol class="steps">${cs.map(cardLi).join('')}</ol>`;
  const more = `<details class="bd"><summary>${esc(L.accept)}與${esc(L.rollback)}</summary><p><b>${esc(L.accept)}：</b>${esc(b.accept)}</p><p><b>${esc(L.rollback)}：</b>${esc(b.rollback)}</p></details>`;
  return seen + prog + list + more;
}

function nowBody() {
  const done = count(STEPS, 'done');
  const cur = BATCHES.find((b) => inBatch(b).some((s) => s.stage !== 'done'));
  const active = STEPS.filter((s) => s.stage === 'doing' || s.stage === 'review');
  const stats = `<div class="stats">
    <div><b>${t('{done}／{total}', { done, total: STEPS.length })}</b><span>張卡完成</span></div>
    <div><b>${t('{n}', { n: count(STEPS, 'doing') })}</b><span>張進行中</span></div>
    <div><b>${t('{n}', { n: count(STEPS, 'review') })}</b><span>張待驗收</span></div>
    <div><b>${t('{n}', { n: GO.length })}</b><span>項等你決定</span></div>
  </div>`;
  const where = cur
    ? `<p class="sub-h">現在在做</p><p class="plain"><a class="who" href="#${esc(cur.code)}">${esc(cur.no)}：${esc(cur.title)}</a></p>`
    : '<p class="sub-h">現在在做</p><p class="plain">全部完成。</p>';
  const list = active.length
    ? `<ul class="cur">${active.map((s) => `<li><a href="#${esc(s.code)}">${esc(s.code)}</a><span class="pill st-${ST[s.stage][1]}">${esc(ST[s.stage][0])}</span><span>${esc(s.plain)}</span></li>`).join('')}</ul>`
    : '<p class="empty">目前沒有進行中的卡。</p>';
  return stats + where + `<p class="sub-h">進行中與待驗收的卡</p>` + list;
}

function openBody() {
  const go = GO.length
    ? `<ol class="steps go">${GO.map((g, i) => {
      const s = byId.get(g.card);
      return `<li class="step"><div class="n">${i + 1}</div><div class="b"><p class="plain"><span class="card-id">${esc(g.card)}</span>${esc(s ? s.plain : '')}</p><p class="donewhen">${esc(g.what)}</p><p class="donewhen"><b>${esc(L.rollback)}：</b>${esc(g.rollback)}</p><p class="meta"><span class="pill risk-high">${esc(L.go)}</span></p></div></li>`;
    }).join('')}</ol>`
    : `<p class="empty">${esc(COPY.open.none)}</p>`;
  const dec = `<p class="sub-h">${esc(L.decideLead)}</p><ul class="yn rules">${DECIDE.map((d) => `<li><b>${esc(d.q)}</b><span>${esc(d.def)}<small>${esc(L.blocks)}：${esc(d.blocks)}</small></span></li>`).join('')}</ul>`;
  return go + dec;
}

function risksBody() {
  if (!RISKS.length) return `<p class="empty">${esc(COPY.risks.none)}</p>`;
  return `<ol class="steps">${RISKS.map((r, i) => {
    return `<li class="step"><div class="n">${i + 1}</div><div class="b"><p class="plain"><span class="card-id">${esc(r.card)}</span>${esc(r.said)}</p><p class="donewhen"><b>處理：</b>${esc(r.handling)}</p></div></li>`;
  }).join('')}</ol>`;
}

export function render() {
  const counts = { now: '', open: t(COPY.open.count, { n: GO.length }), risks: t(COPY.open.count, { n: RISKS.length }) };
  for (const b of BATCHES) { const cs = inBatch(b); counts[b.code] = t('{done}／{n}', { done: count(cs, 'done'), n: cs.length }); }
  const body = [
    section('now', COPY.now, nowBody()),
    section('open', COPY.open, openBody()),
    ...BATCHES.map((b) => section(b.code, { h: `${b.no}：${b.title}` }, batchBody(b))),
    section('risks', COPY.risks, risksBody()),
  ].join('\n\n');
  return page({ META, COPY, STEPS, OPEN: [], counts, body, css: CSS });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  writeFileSync(path.join(here, 'supervisor.html'), render(), 'utf8');
  console.log('wrote supervisor.html');
}
