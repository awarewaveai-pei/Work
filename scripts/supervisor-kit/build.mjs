// 監工台共用版面：左側欄（標題、進度、各段連結與數量）＋右側單欄；手機時側欄在上。
// 各監工台的 build.mjs 只組段落；文字全在各自 data.mjs 的 COPY，數字全算出來（包在 data-computed，check 驗）。
// 步驟以 code（有就用）或 n 當鍵；有 group 的步驟才顯示「可同時做」列。System Foundry 產生的專案把本目錄原樣複製到 supervisor/kit/。
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const t = (s, v = {}) => esc(s).replace(/\{(\w+)\}/g, (_, k) => `<span data-computed>${esc(v[k])}</span>`);
export const key = (s) => s.code ?? s.n;
export const anchor = (s) => s.code ?? `s${s.n}`;
const riskClass = (r) => (r.startsWith('High') ? 'high' : r.startsWith('Medium') ? 'med' : 'low');

export function stepLink(STEPS, L, k) {
  const s = STEPS.find((x) => key(x) === k);
  if (!s) return esc(k); // 壞參照照樣渲染，交給 check 報錯，不在 build 丟例外
  return `<a href="#${anchor(s)}">${s.code ? esc(s.code) : t(L.item, { n: s.n })}</a>`;
}

export const section = (id, c, body) => `<section id="${id}"><h2>${esc(c.h)}</h2>${c.lead ? `<p class="lead">${esc(c.lead)}</p>` : ''}${body}</section>`;

export const yesNo = (NOW, L) => `<ul class="yn">${NOW.map((r) => `<li class="${r.state}"><b>${r.state === 'yes' ? esc(L.yes) : esc(L.no)}</b><span>${esc(r.what)}<small>${esc(r.ev)}</small></span></li>`).join('')}</ul>`;

// rows: { h, t, small? }（small 為已轉義 html）
export const ruleList = (rows) => `<ul class="yn rules">${rows.map((r) => `<li><b>${esc(r.h)}</b><span>${esc(r.t)}${r.small ? `<small>${r.small}</small>` : ''}</span></li>`).join('')}</ul>`;

// cardRef(s) → 執行卡位置字串
export function stepList(STEPS, L, cardRef) {
  const STATUS = { not_started: [L.todo, 'todo'], in_progress: [L.doing, 'doing'], done: [L.done, 'done'] };
  const groups = [...new Set(STEPS.map((s) => s.group))];
  return `<ol class="steps">${groups.map((g) => {
    const rows = STEPS.filter((s) => s.group === g);
    const head = g !== undefined && rows.length > 1 ? `<li class="grp">${esc(L.group)}${rows.map((s) => `<a href="#${anchor(s)}">${esc(s.code ?? s.n)}</a>`).join('、')}</li>` : '';
    return head + rows.map((s) => `<li class="step ${STATUS[s.status][1]}" id="${anchor(s)}">
    <div class="n">${s.n}</div>
    <div class="b">
      <p class="plain">${esc(s.plain)}</p>
      <p class="meta"><span class="pill st-${STATUS[s.status][1]}">${esc(STATUS[s.status][0])}</span><span class="pill risk-${riskClass(s.risk)}">${esc(L.risk)} ${esc(s.risk)}</span><span class="who">${esc(L.who)}：${esc(s.model)}</span>${s.waitFor ? `<span class="who wait">${esc(s.waitFor)}</span>` : ''}</p>
      <p class="donewhen"><b>${esc(L.evidence)}：</b>${esc(s.gate)}</p>${s.items ? `
      ${itemList(s.items, L)}` : ''}
      <details><summary>${esc(L.details)}：${s.code ? `${esc(s.code)} ` : ''}${esc(s.title)}</summary>
        ${[
    s.what && `<p>${esc(s.what)}</p>`,
    `<p><b>${esc(L.depends)}：</b>${s.depends.length ? s.depends.map((d) => stepLink(STEPS, L, d)).join('、') : esc(L.none)}${s.before ? `；${esc(s.before)}` : ''}</p>`,
    s.decided && `<p><b>${esc(L.decided)}：</b>${esc(s.decided)}</p>`,
    s.files && `<p><b>${esc(L.files)}：</b>${s.files.map((f) => `<code>${esc(f)}</code>`).join(' ')}</p>`,
    `<p><b>${esc(L.card)}：</b><code>${esc(cardRef(s))}</code></p>`,
    s.commit && `<p><b>${esc(L.doneAt)}：</b><code>${esc(s.commit)}</code></p>`,
  ].filter(Boolean).join('\n        ')}
      </details>
    </div></li>`).join('');
  }).join('')}</ol>`;
}

// 步驟底下的每一項工作（選用；有 items 的監工台才顯示）。樣式由該頁的 css 參數給（ITEM_CSS），其他頁的輸出不變。
export const itemList = (items, L) => `<ul class="items">${items.map((it) => `<li class="${it.status}"><b>${it.status === 'done' ? '✓' : '○'}</b><span><code>${esc(it.id)}</code> ${esc(it.plain)}${it.commit ? ` <small>${esc(L.doneAt)} <code>${esc(it.commit)}</code></small>` : ''}</span></li>`).join('')}</ul>`;
export const ITEM_CSS = `ul.items{list-style:none;margin:2px 0 8px;padding:0;display:grid;gap:4px;font-size:14px}
ul.items li{display:grid;grid-template-columns:18px 1fr;gap:6px;min-width:0}
ul.items li b{color:var(--todo)} ul.items li.done b{color:var(--done)} ul.items li.done span{color:var(--muted)}
ul.items code{font-size:11.5px} ul.items small{display:inline;font-size:12px}`;

export function openList(OPEN, STEPS, C) {
  if (!OPEN.length) return `<p class="lead">${esc(C.none || '')}</p>`;
  return `<ol class="open">${OPEN.map((o) => {
    const s = STEPS.find((x) => key(x) === o.before) || { n: o.before, code: o.before };
    // options（選用）：操作者直接選的選項，pick＝推薦；detail＝選項細節所在的卡
    const opts = o.options ? `<ul class="opts">${o.options.map((x) => `<li class="${x.pick ? 'pick' : ''}"><b>${esc(x.k)}${x.pick ? ' ★' : ''}</b><span>${esc(x.t)}</span></li>`).join('')}</ul>` : '';
    return `<li><div class="n">${o.n}</div><div class="b"><p class="plain">${esc(o.what)}</p>${opts}<p class="meta"><a href="#${anchor(s)}" class="who">${t(C.before, { n: s.n, code: s.code })}</a><span class="who">${esc(C.src)}：${esc(o.src)}</span>${o.detail ? `<span class="who">${esc(o.detail)}</span>` : ''}</p></div></li>`;
  }).join('')}</ol>`;
}

export const OPEN_CSS = `ul.opts{list-style:none;margin:4px 0 6px;padding:0;display:grid;gap:4px;font-size:14px}
ul.opts li{display:grid;grid-template-columns:auto 1fr;gap:8px;min-width:0;color:var(--muted)} ul.opts li b{color:var(--todo);white-space:nowrap}
ul.opts li.pick{color:var(--ink)} ul.opts li.pick b{color:var(--done)}`;

// rows: [label, html]
export const pathRows = (rows) => `<div class="paths">${rows.map(([b, h]) => `<div><b>${esc(b)}</b>${h}</div>`).join('')}</div>`;

const CSS = `/* 左側欄＋右側單欄內容；手機時側欄在上。顏色只載意義：有／沒有、狀態、風險。 */
:root{
  --bg:#f4f5f7; --paper:#ffffff; --ink:#1b2230; --muted:#5d6878; --line:#d8dde5; --accent:#2b4ea2; --rail:#e9ecf1;
  --todo:#8b95a5; --doing:#c2410c; --done:#1f7a3a; --no:#b42318; --high:#b42318; --med:#9a6700; --low:#1f7a3a; --onDot:#ffffff;
  --display:"Noto Serif TC","Songti TC",serif; --body:"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif; --mono:"IBM Plex Mono",Menlo,Consolas,monospace;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#121722;--paper:#1b2231;--ink:#e7eaf1;--muted:#9aa5b6;--line:#2c3547;--accent:#92a9ea;--rail:#171d2a;--todo:#7c8698;--doing:#f49c5c;--done:#62c983;--no:#f0776b;--high:#f0776b;--med:#e4b84a;--low:#62c983;--onDot:#121722;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#121722;--paper:#1b2231;--ink:#e7eaf1;--muted:#9aa5b6;--line:#2c3547;--accent:#92a9ea;--rail:#171d2a;--todo:#7c8698;--doing:#f49c5c;--done:#62c983;--no:#f0776b;--high:#f0776b;--med:#e4b84a;--low:#62c983;--onDot:#121722;color-scheme:dark}
body{background:var(--bg);color:var(--ink);font-family:var(--body);line-height:1.6;font-size:16px}
.shell{display:grid;grid-template-columns:240px minmax(0,1fr);min-height:100%}
@media (max-width:820px){.shell{grid-template-columns:1fr}}
aside{background:var(--rail);border-right:1px solid var(--line);padding-block:24px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:16px}
@media (max-width:820px){aside{border-right:0;border-bottom:1px solid var(--line);padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:16px}}
aside .in{position:sticky;top:calc(env(safe-area-inset-top,0px) + 16px)}
@media (max-width:820px){aside .in{position:static}}
aside h1{font-family:var(--display);font-size:20px;margin:0 0 4px;text-wrap:balance}
aside .upd{color:var(--muted);font-size:12.5px;margin:0 0 14px}
.bar{display:flex;height:8px;border-radius:999px;overflow:hidden;background:var(--line);margin:0 0 16px}
.bar i{display:block;height:100%}.bar .d{background:var(--done)}.bar .g{background:var(--doing)}
nav{display:grid;gap:2px}
@media (max-width:820px){nav{grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}}
nav a{display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:7px 10px;border-radius:8px;color:var(--ink);text-decoration:none;font-size:15px}
nav a:hover,nav a:focus-visible{background:var(--paper);outline:none}
nav a small{color:var(--muted);font-size:12.5px;white-space:nowrap}
main{min-width:0;max-width:820px;padding-block:24px 56px;padding-left:24px;padding-right:max(16px,env(safe-area-inset-right,0px))}
@media (max-width:820px){main{padding-left:max(16px,env(safe-area-inset-left,0px))}}
.sub{color:var(--muted);margin:0 0 24px;font-size:15px}
section{margin-bottom:36px;scroll-margin-top:16px}
section>h2{font-family:var(--display);font-size:21px;margin:0 0 4px}
section>.lead{color:var(--muted);margin:0 0 14px;font-size:15px}
.sub-h{font-size:15px;margin:14px 0 8px;color:var(--muted);font-weight:500}
code{font-family:var(--mono);font-size:12.5px;background:var(--bg);border-radius:4px;padding:1px 5px;color:var(--muted)}
small{display:block;color:var(--muted);font-size:13px;font-weight:400}
ul.yn{list-style:none;margin:0;padding:0;display:grid;gap:8px}
ul.yn li{display:grid;grid-template-columns:64px 1fr;gap:10px;background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:10px 12px;min-width:0}
ul.yn li.yes b{color:var(--done)}ul.yn li.no b{color:var(--no)}
ul.yn li span{min-width:0}
ul.yn.rules li{grid-template-columns:130px 1fr}ul.yn.rules li b{color:var(--accent)}
ul.yn.rules small a{color:var(--accent)}
ol.steps{list-style:none;margin:0;padding:0;display:grid;gap:10px}
ol.steps li.grp{color:var(--muted);font-size:13.5px;padding:4px 2px 0}
ol.steps li.grp a{color:var(--accent)}
ol.open{list-style:none;margin:0;padding:0;display:grid;gap:10px}
ol.steps li.step,ol.open li{display:grid;grid-template-columns:34px 1fr;gap:12px;background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:12px 14px;min-width:0;scroll-margin-top:16px}
ol.steps .n,ol.open .n{width:30px;height:30px;border-radius:50%;background:var(--todo);color:var(--onDot);text-align:center;line-height:30px;font-weight:700;font-size:14px}
.step.doing .n{background:var(--doing)}.step.done .n{background:var(--done)}
ol.open .n{background:var(--accent)}
.b{min-width:0}
.plain{margin:0 0 6px;font-size:16px;font-weight:500}
.meta{margin:0 0 6px;display:flex;flex-wrap:wrap;gap:6px 10px;font-size:13px;align-items:center}
.pill{border-radius:999px;padding:1px 9px;border:1px solid currentColor;white-space:nowrap}
.st-todo{color:var(--todo)}.st-doing{color:var(--doing)}.st-done{color:var(--done)}
.risk-high{color:var(--high)}.risk-med{color:var(--med)}.risk-low{color:var(--low)}
.who{color:var(--muted)} a.who{color:var(--accent)} .wait{color:var(--med)}
.donewhen{margin:0 0 6px;font-size:14px}
details{font-size:13.5px;color:var(--muted)}
details summary{cursor:pointer;color:var(--accent)}
details p{margin:6px 0 0}
details a{color:var(--accent)}
details code{font-size:12px;word-break:break-all}
.paths{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:13.5px}
.paths div{display:grid;grid-template-columns:130px 1fr;gap:8px;padding:5px 0;border-top:1px solid var(--line);min-width:0}
.paths div:first-child{border-top:0}
.paths code{word-break:break-all}
@media (max-width:560px){.paths div{grid-template-columns:1fr}}
:target{box-shadow:0 0 0 2px var(--accent)}
@media (prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}`;

// counts：各 nav 鍵右側的小字（已轉義 html）；steps／open 由 kit 算。css：該頁專屬樣式。
// steps.count 可用 {done} {doing} {parked} {total}；parked＝有 waitFor（等第一個這類客戶才做）且未完成的步驟。
// parkedOutOfBar：進度條分母不算 parked（選用；不設＝舊行為，其他監工台輸出不變）。
export function page({ META, COPY, STEPS, OPEN, counts = {}, body, css = '', parkedOutOfBar = false }) {
  const done = STEPS.filter((s) => s.status === 'done').length;
  const doing = STEPS.filter((s) => s.status === 'in_progress').length;
  const parked = STEPS.filter((s) => s.status !== 'done' && s.waitFor).length;
  const barTotal = parkedOutOfBar ? STEPS.length - parked : STEPS.length;
  const c = { steps: t(COPY.steps.count, { done, doing, parked, total: STEPS.length }), open: t(COPY.open.count, { n: OPEN.length }), ...counts };
  const nav = Object.entries(COPY.nav).map(([k, label]) => `<a href="#${k}"><span>${esc(label)}</span><small>${c[k] ?? ''}</small></a>`).join('');
  return `<title>${esc(META.title)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@700&family=IBM+Plex+Mono:wght@400&display=swap">
<style>
${CSS}${css ? `\n${css}` : ''}
</style>
<div class="shell">
<aside><div class="in">
  <h1>${esc(META.title)}</h1>
  <p class="upd">${t(COPY.updated, { date: META.updated })}</p>
  <div class="bar" data-computed><i class="d" style="width:${(done / barTotal) * 100}%"></i><i class="g" style="width:${(doing / barTotal) * 100}%"></i></div>
  <nav>${nav}</nav>
</div></aside>
<main>
<p class="sub">${t(COPY.sub, { total: STEPS.length })}</p>
${body}
</main>
</div>
`;
}
