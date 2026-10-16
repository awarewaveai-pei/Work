// 從 data.mjs 產生 supervisor.html（claude.ai artifact 頁）。頁面不手改；數字全算出來。
//   node build.mjs      寫 supervisor.html
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { META, DOORS, AXES, WAYS, NOW, STEPS, OPEN, SIDE, LOG } from './data.mjs';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const code = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
const STATUS = { not_started: ['未開始', 'todo'], in_progress: ['進行中', 'doing'], done: ['完成', 'done'] };
const riskClass = (r) => (r.startsWith('High') ? 'high' : r.startsWith('Medium') ? 'med' : 'low');

export function render() {
  const done = STEPS.filter((s) => s.status === 'done').length;
  const doing = STEPS.filter((s) => s.status === 'in_progress').length;
  const axisOf = Object.fromEntries(AXES.map((a) => [a.key, a]));
  const zhOf = (k, v) => axisOf[k].values.find((x) => x.v === v).zh;

  const mapSteps = STEPS.map((s) => `<a class="ms ${STATUS[s.status][1]}" href="#s${s.n}"><b>${s.n}</b><span>${esc(s.title)}</span></a>`).join('');
  const mapWays = WAYS.map((w) => `<span class="chip ${w.live ? 'live' : ''}">${esc(w.name)}</span>`).join('');

  const doors = DOORS.map((d) => `<tr><th>${esc(d.name)}</th><td><code>${esc(d.host)}</code></td><td>${esc(d.who)}</td><td>${esc(d.does)}</td><td>${esc(d.login)}</td></tr>`).join('');

  const axes = AXES.map((a) => `<div class="axis ${a.key}"><h4>${esc(a.name)}<small>${esc(a.where)}</small></h4><ul>${a.values.map((v) => `<li><code>${esc(v.v)}</code> ${esc(v.zh)}</li>`).join('')}</ul></div>`).join('');

  const ways = WAYS.map((w) => `<tr><th>${esc(w.name)}<small>${esc(w.zh)}</small></th>
    <td><code class="deployment">${esc(w.deployment)}</code></td><td><code class="money">${esc(w.money)}</code></td><td><code class="actor">${esc(w.actor)}</code></td>
    <td>${esc(w.note)}</td><td class="st ${w.live ? 'yes' : 'no'}">${w.live ? '在跑' : '還沒'}</td></tr>`).join('');

  const now = NOW.map((r) => `<tr><td class="st ${r.state}">${r.state === 'yes' ? '有' : '沒有'}</td><th>${esc(r.what)}</th><td>${code(r.ev)}</td></tr>`).join('');

  const steps = STEPS.map((s) => `<article class="step ${STATUS[s.status][1]}" id="s${s.n}">
    <header><span class="n">${s.n}</span><h3>${esc(s.title)}</h3><span class="pill st-${STATUS[s.status][1]}">${STATUS[s.status][0]}</span><span class="pill risk-${riskClass(s.risk)}">${esc(s.risk)}</span></header>
    <p>${code(s.what)}</p>
    <dl>
      <dt>檔案</dt><dd>${s.files.map((f) => `<code>${esc(f)}</code>`).join(' ')}</dd>
      <dt>閘（紅燈條件）</dt><dd>${code(s.gate)}</dd>
      <dt>先決</dt><dd>${s.depends.length ? s.depends.map((d) => `<a href="#s${d}">步驟 ${d}</a>`).join('、') : '無'}${s.before ? `；${esc(s.before)}` : ''}${s.waitFor ? `；${esc(s.waitFor)}` : ''}</dd>
      <dt>建議模型</dt><dd>${esc(s.model)}</dd>
      ${s.commit ? `<dt>完成於</dt><dd><code>${esc(s.commit)}</code></dd>` : ''}
    </dl></article>`).join('');

  const open = OPEN.map((o) => `<li><b>待決 ${o.n}</b> ${esc(o.what)}<small>要在<a href="#s${o.before}">步驟 ${o.before}</a>之前定；${esc(o.src)}</small></li>`).join('');
  const side = SIDE.map((x) => `<li>${esc(x.what)}<small>${esc(x.when)}；${esc(x.src)}</small></li>`).join('');
  const log = LOG.map((l) => `<tr><td><code>${esc(l.c)}</code></td><td>${esc(l.what)}</td><td>${esc(l.verdict)}</td></tr>`).join('');

  return `<title>${esc(META.title)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* 版面：左邊一張圖固定不動（門 → 軸 → 方式 → 步驟），右邊是細節；手機上下疊。顏色只載意義：狀態、風險、三條軸各一色。 */
:root{
  --bg:#f3f5f8; --paper:#ffffff; --ink:#1a2330; --muted:#5b6778; --line:#d9dee6; --accent:#2f4fa8;
  --todo:#8b95a5; --doing:#c2410c; --done:#1f7a3a; --high:#b42318; --med:#9a6700; --low:#1f7a3a;
  --deployment:#2f4fa8; --money:#8a6d00; --actor:#7b3fa0;
  --display:"Noto Serif TC","Songti TC",serif; --body:"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif; --mono:"IBM Plex Mono",Menlo,Consolas,monospace;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#111622;--paper:#1a2130;--ink:#e6eaf2;--muted:#9aa6b8;--line:#2b3446;--accent:#8fa6ea;--todo:#7b8597;--doing:#f59e5b;--done:#5fc77e;--high:#f0776b;--med:#e4b84a;--low:#5fc77e;--deployment:#8fa6ea;--money:#e4b84a;--actor:#c58fe6;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#111622;--paper:#1a2130;--ink:#e6eaf2;--muted:#9aa6b8;--line:#2b3446;--accent:#8fa6ea;--todo:#7b8597;--doing:#f59e5b;--done:#5fc77e;--high:#f0776b;--med:#e4b84a;--low:#5fc77e;--deployment:#8fa6ea;--money:#e4b84a;--actor:#c58fe6;color-scheme:dark}
body{background:var(--bg);color:var(--ink);font-family:var(--body);line-height:1.55;font-size:15px}
.wrap{max-width:1280px;margin:0 auto;padding-block:20px 48px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
h1{font-family:var(--display);font-size:26px;margin:0 0 4px;text-wrap:balance}
.sub{color:var(--muted);margin:0 0 18px;font-size:13px}
.cols{display:grid;grid-template-columns:320px minmax(0,1fr);gap:24px;align-items:start}
@media (max-width:880px){.cols{grid-template-columns:1fr}}
.map{position:sticky;top:env(safe-area-inset-top,0px);background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:14px;min-width:0}
@media (max-width:880px){.map{position:static}}
.map h2{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0 0 8px}
.map .row{margin-bottom:12px}
.map .arrow{color:var(--muted);text-align:center;font-size:12px;margin:-4px 0 6px}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{border:1px solid var(--line);border-radius:999px;padding:2px 10px;font-size:13px;color:var(--muted)}
.chip.live{border-color:var(--done);color:var(--done)}
.chip.ax{color:var(--ink)}.chip.deployment{border-color:var(--deployment)}.chip.money{border-color:var(--money)}.chip.actor{border-color:var(--actor)}
.ms{display:grid;grid-template-columns:22px 1fr;gap:8px;align-items:start;padding:5px 6px;border-radius:6px;text-decoration:none;color:var(--ink);font-size:13px}
.ms:hover,.ms:focus-visible{background:var(--bg);outline:none}
.ms b{display:inline-block;width:20px;height:20px;border-radius:50%;text-align:center;line-height:20px;font-size:12px;color:#fff;background:var(--todo)}
.ms.doing b{background:var(--doing)}.ms.done b{background:var(--done)}
.ms span{min-width:0}
.prog{font-size:13px;color:var(--muted);margin-top:6px}
.prog b{color:var(--ink)}
main{min-width:0}
section{margin-bottom:28px}
section>h2{font-family:var(--display);font-size:19px;margin:0 0 4px}
section>.lead{color:var(--muted);margin:0 0 12px;font-size:14px}
.tbl{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--paper)}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{text-align:left;vertical-align:top;padding:8px 10px;border-top:1px solid var(--line)}
thead th{border-top:0;color:var(--muted);font-weight:500;font-size:12px;letter-spacing:.04em}
tbody th{font-weight:700;white-space:nowrap}
tbody th small{display:block;font-weight:400;color:var(--muted);font-size:12px;white-space:normal}
code{font-family:var(--mono);font-size:12.5px;background:var(--bg);border-radius:4px;padding:1px 5px}
code.deployment{color:var(--deployment)}code.money{color:var(--money)}code.actor{color:var(--actor)}
.st{font-weight:700;white-space:nowrap}.st.yes{color:var(--done)}.st.no{color:var(--todo)}
.axes{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
.axis{background:var(--paper);border:1px solid var(--line);border-left-width:4px;border-radius:10px;padding:10px 12px;min-width:0}
.axis.deployment{border-left-color:var(--deployment)}.axis.money{border-left-color:var(--money)}.axis.actor{border-left-color:var(--actor)}
.axis h4{margin:0 0 6px;font-size:15px}.axis h4 small{display:block;font-weight:400;color:var(--muted);font-size:12px}
.axis ul{margin:0;padding-left:0;list-style:none}.axis li{padding:3px 0;font-size:14px}
.steps{display:grid;gap:12px}
.step{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:12px 14px;min-width:0;border-left:4px solid var(--todo)}
.step.doing{border-left-color:var(--doing)}.step.done{border-left-color:var(--done)}
.step header{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:6px}
.step .n{width:26px;height:26px;border-radius:50%;background:var(--todo);color:#fff;text-align:center;line-height:26px;font-weight:700;font-size:13px}
.step.doing .n{background:var(--doing)}.step.done .n{background:var(--done)}
.step h3{margin:0;font-size:16px;flex:1 1 240px;min-width:0}
.pill{border-radius:999px;padding:1px 9px;font-size:12px;border:1px solid currentColor}
.st-todo{color:var(--todo)}.st-doing{color:var(--doing)}.st-done{color:var(--done)}
.risk-high{color:var(--high)}.risk-med{color:var(--med)}.risk-low{color:var(--low)}
.step p{margin:0 0 8px;font-size:14px}
.step dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;margin:0;font-size:13px}
.step dt{color:var(--muted)}.step dd{margin:0;min-width:0}
.step a{color:var(--accent)}
ol.open,ul.side{margin:0;padding-left:20px}
ol.open li,ul.side li{margin-bottom:8px}
ol.open small,ul.side small{display:block;color:var(--muted);font-size:12px}
ol.open a{color:var(--accent)}
footer{color:var(--muted);font-size:12px;margin-top:24px}
footer code{font-size:11.5px}
:target{scroll-margin-top:12px;box-shadow:0 0 0 2px var(--accent)}
@media (prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}
</style>
<div class="wrap">
<h1>${esc(META.title)}</h1>
<p class="sub">客戶從哪扇門進來、錢從哪裡來、誰在操作；程式該照什麼順序建。更新 ${esc(META.updated)}。事實正本：ADR 017、ADR 018；這頁只放狀態與指向。</p>
<div class="cols">
<aside class="map">
  <h2>一張圖</h2>
  <div class="row"><div class="chips" data-computed>${DOORS.map((d) => `<span class="chip">${esc(d.name)}</span>`).join('')}</div></div>
  <div class="arrow">↓ 進來之後，程式只存三條軸</div>
  <div class="row"><div class="chips">${AXES.map((a) => `<span class="chip ax ${a.key}">${esc(a.name)}</span>`).join('')}</div></div>
  <div class="arrow">↓ 對外講的方式是組合（綠框＝現在在跑）</div>
  <div class="row"><div class="chips" data-computed>${mapWays}</div></div>
  <div class="arrow">↓ 要把它變成程式的順序</div>
  <div class="row">${mapSteps}</div>
  <p class="prog" data-computed>${STEPS.length} 個步驟：<b>${done}</b> 完成、<b>${doing}</b> 進行中、<b>${STEPS.length - done - doing}</b> 未開始</p>
</aside>
<main>
<section id="now"><h2>現在真的在跑的</h2><p class="lead">今天查的實況，不是計畫。</p>
<div class="tbl"><table><thead><tr><th></th><th>什麼</th><th>證據</th></tr></thead><tbody>${now}</tbody></table></div></section>

<section id="steps"><h2>順序</h2><p class="lead">ADR 017「順序」。每步完成＝它的閘紅得起來；High 的步驟要操作者 go。</p>
<div class="steps">${steps}</div></section>

<section id="open"><h2>操作者要先決定的</h2><p class="lead">agent 不能替你定；定了再開對應步驟。</p><ol class="open">${open}</ol></section>

<section id="ways"><h2>對外五種方式 ＝ 三軸的組合</h2><p class="lead">加方式＝加一列，不改程式；產品程式只問 <code>can(主體, feature_key, actor)</code>。</p>
<div class="tbl"><table><thead><tr><th>方式</th><th>A 部署</th><th>B 錢從哪來</th><th>C 誰在按</th><th>備註</th><th>現況</th></tr></thead><tbody>${ways}</tbody></table></div></section>

<section id="axes"><h2>三條軸</h2><p class="lead">各在自己的地方；值存文字，加值不改 schema。</p><div class="axes">${axes}</div></section>

<section id="doors"><h2>三扇門</h2><p class="lead">ADR 018 §1。網址由設定組出來，程式不寫死。</p>
<div class="tbl"><table><thead><tr><th>門</th><th>網址</th><th>給誰</th><th>做什麼</th><th>登入</th></tr></thead><tbody>${doors}</tbody></table></div></section>

<section id="side"><h2>一起改、不是順序步驟</h2><ul class="side">${side}</ul></section>

<section id="log"><h2>紀錄</h2><p class="lead">今天誰改了什麼，含猜錯的那次。</p>
<div class="tbl"><table><thead><tr><th>commit</th><th>做了什麼</th><th>結果</th></tr></thead><tbody>${log}</tbody></table></div></section>

<footer>正本：<code>${esc(META.adr017)}</code>　<code>${esc(META.adr018)}</code>　追蹤：<code>${esc(META.tasks)}</code>　本頁由 <code>agency-os/handoffs/2026-10-16-customer-model-supervisor/build.mjs</code> 從 <code>data.mjs</code> 產生，<code>check.mjs</code> 驗規則。</footer>
</main>
</div>
</div>
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  writeFileSync(path.join(here, 'supervisor.html'), render(), 'utf8');
  console.log('wrote supervisor.html');
}
