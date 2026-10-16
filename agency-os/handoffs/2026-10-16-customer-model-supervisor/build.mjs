// 從 data.mjs 產生 supervisor.html（claude.ai artifact 頁）。頁面不手改；數字全算出來。
//   node build.mjs      寫 supervisor.html
// 版面原則（操作者 2026-10-16「我看不懂」之後重做）：單欄、由上往下四個問題——現在怎樣？客戶有哪五種樣子？
// 要做哪幾件事？你要先定什麼？每段先給例子，白話在前、技術字在後面小字。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { META, DOORS, AXES, WAYS, NOW, STEPS, OPEN, SIDE } from './data.mjs';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const code = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
const STATUS = { not_started: ['還沒開始', 'todo'], in_progress: ['做到一半', 'doing'], done: ['做完了', 'done'] };
const riskClass = (r) => (r.startsWith('High') ? 'high' : r.startsWith('Medium') ? 'med' : 'low');

export function render() {
  const done = STEPS.filter((s) => s.status === 'done').length;
  const doing = STEPS.filter((s) => s.status === 'in_progress').length;
  const todo = STEPS.length - done - doing;
  const liveWays = WAYS.filter((w) => w.live).length;
  const axisOf = Object.fromEntries(AXES.map((a) => [a.key, a]));
  const val = (k, v) => axisOf[k].values.find((x) => x.v === v);

  const now = NOW.map((r) => `<li class="${r.state}"><b>${r.state === 'yes' ? '有' : '沒有'}</b><span>${esc(r.what)}<small>${code(r.ev)}</small></span></li>`).join('');

  const ways = WAYS.map((w, i) => `<article class="way ${w.live ? 'live' : ''}">
    <header><span class="k">${i + 1}</span><h3>${esc(w.name)}<small>${esc(w.zh)}</small></h3><span class="tag">${w.live ? '現在有' : '還沒有'}</span></header>
    <p class="story">${esc(w.story)}</p>
    <dl>${AXES.map((a) => `<div><dt>${esc(a.q)}</dt><dd>${esc(val(a.key, w[a.key]).plain)}<code>${esc(w[a.key])}</code></dd></div>`).join('')}</dl>
    <p class="note">${esc(w.note)}</p></article>`).join('');

  const steps = STEPS.map((s) => `<li class="step ${STATUS[s.status][1]}" id="s${s.n}">
    <div class="n">${s.n}</div>
    <div class="b">
      <p class="plain">${esc(s.plain)}</p>
      <p class="meta"><span class="pill st-${STATUS[s.status][1]}">${STATUS[s.status][0]}</span><span class="pill risk-${riskClass(s.risk)}">風險 ${esc(s.risk)}</span><span class="who">誰做：${esc(s.model)}</span>${s.waitFor ? `<span class="who">${esc(s.waitFor)}</span>` : ''}</p>
      <p class="donewhen"><b>做完的證據：</b>${code(s.gate)}</p>
      <details><summary>工程細節：${esc(s.title)}</summary>
        <p>${code(s.what)}</p>
        <p><b>先決：</b>${s.depends.length ? s.depends.map((d) => `第 ${d} 件`).join('、') : '無'}${s.before ? `；${esc(s.before)}` : ''}</p>
        <p><b>檔案：</b>${s.files.map((f) => `<code>${esc(f)}</code>`).join(' ')}</p>
        ${s.commit ? `<p><b>完成於：</b><code>${esc(s.commit)}</code></p>` : ''}
      </details>
    </div></li>`).join('');

  const open = OPEN.map((o) => `<li><div class="n">${o.n}</div><div class="b"><p class="plain">${esc(o.what)}</p><p class="meta"><span class="who">要在第 ${o.before} 件之前定</span><span class="who">出處：${esc(o.src)}</span></p></div></li>`).join('');

  const doors = DOORS.map((d) => `<li><b>${esc(d.name)}</b><span><code>${esc(d.host)}</code><br>${esc(d.who)}：${esc(d.does)}<small>登入：${esc(d.login)}</small></span></li>`).join('');
  const side = SIDE.map((x) => `<li><b>另外</b><span>${esc(x.what)}<small>${esc(x.when)}；${esc(x.src)}</small></span></li>`).join('');

  return `<title>${esc(META.title)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@700&family=IBM+Plex+Mono:wght@400&display=swap">
<style>
/* 單欄、一題一段。顏色只載意義：有／沒有、做完／沒做、風險高低。 */
:root{
  --bg:#f4f5f7; --paper:#ffffff; --ink:#1b2230; --muted:#5d6878; --line:#d8dde5; --accent:#2b4ea2;
  --todo:#8b95a5; --doing:#c2410c; --done:#1f7a3a; --no:#b42318; --high:#b42318; --med:#9a6700; --low:#1f7a3a;
  --display:"Noto Serif TC","Songti TC",serif; --body:"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif; --mono:"IBM Plex Mono",Menlo,Consolas,monospace;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#121722;--paper:#1b2231;--ink:#e7eaf1;--muted:#9aa5b6;--line:#2c3547;--accent:#92a9ea;--todo:#7c8698;--doing:#f49c5c;--done:#62c983;--no:#f0776b;--high:#f0776b;--med:#e4b84a;--low:#62c983;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#121722;--paper:#1b2231;--ink:#e7eaf1;--muted:#9aa5b6;--line:#2c3547;--accent:#92a9ea;--todo:#7c8698;--doing:#f49c5c;--done:#62c983;--no:#f0776b;--high:#f0776b;--med:#e4b84a;--low:#62c983;color-scheme:dark}
body{background:var(--bg);color:var(--ink);font-family:var(--body);line-height:1.6;font-size:16px}
.wrap{max-width:820px;margin:0 auto;padding-block:24px 56px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
h1{font-family:var(--display);font-size:28px;margin:0 0 6px;text-wrap:balance}
.sub{color:var(--muted);margin:0 0 22px;font-size:14px}
section{margin-bottom:36px}
section>h2{font-family:var(--display);font-size:21px;margin:0 0 4px;text-wrap:balance}
section>h2 .cnt{font-family:var(--body);font-size:14px;color:var(--muted);font-weight:400;margin-left:8px}
section>.lead{color:var(--muted);margin:0 0 14px;font-size:15px}
code{font-family:var(--mono);font-size:12.5px;background:var(--bg);border-radius:4px;padding:1px 5px;color:var(--muted)}
small{display:block;color:var(--muted);font-size:13px;font-weight:400}
/* 有／沒有 */
ul.yn{list-style:none;margin:0;padding:0;display:grid;gap:8px}
ul.yn li{display:grid;grid-template-columns:52px 1fr;gap:10px;background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:10px 12px;min-width:0}
ul.yn li b{font-size:15px;align-self:start}
ul.yn li.yes b{color:var(--done)}ul.yn li.no b{color:var(--no)}
ul.yn li span{min-width:0}
/* 五種樣子 */
.ways{display:grid;gap:12px}
.way{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:12px 14px;min-width:0;border-left:5px solid var(--todo)}
.way.live{border-left-color:var(--done)}
.way header{display:flex;align-items:center;gap:10px;margin-bottom:6px}
.way .k{width:26px;height:26px;border-radius:50%;background:var(--ink);color:var(--paper);text-align:center;line-height:26px;font-weight:700;font-size:13px;flex:none}
.way h3{margin:0;font-size:18px;flex:1;min-width:0}
.way .tag{font-size:13px;color:var(--todo);border:1px solid currentColor;border-radius:999px;padding:1px 9px;white-space:nowrap}
.way.live .tag{color:var(--done)}
.way .story{margin:0 0 10px;font-size:15px}
.way dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0;background:var(--bg);border-radius:8px;padding:8px 10px}
@media (max-width:560px){.way dl{grid-template-columns:1fr}}
.way dt{font-size:12.5px;color:var(--muted)}.way dd{margin:0;font-size:14px;font-weight:500}
.way dd code{display:block;margin-top:2px;background:transparent;padding:0;font-weight:400}
.way .note{margin:8px 0 0;font-size:13px;color:var(--muted)}
/* 七件事、待決 */
ol.steps{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.step,ol.steps li{display:grid;grid-template-columns:34px 1fr;gap:12px;background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:12px 14px;min-width:0}
.step .n,ol.steps li .n{width:30px;height:30px;border-radius:50%;background:var(--todo);color:#fff;text-align:center;line-height:30px;font-weight:700;font-size:14px}
.step.doing .n{background:var(--doing)}.step.done .n{background:var(--done)}
ol.open li .n{background:var(--accent)}
.b{min-width:0}
.plain{margin:0 0 6px;font-size:16px;font-weight:500}
.meta{margin:0 0 6px;display:flex;flex-wrap:wrap;gap:6px 10px;font-size:13px;align-items:center}
.pill{border-radius:999px;padding:1px 9px;border:1px solid currentColor;white-space:nowrap}
.st-todo{color:var(--todo)}.st-doing{color:var(--doing)}.st-done{color:var(--done)}
.risk-high{color:var(--high)}.risk-med{color:var(--med)}.risk-low{color:var(--low)}
.who{color:var(--muted)}
.donewhen{margin:0 0 6px;font-size:14px}
details{font-size:13.5px;color:var(--muted)}
details summary{cursor:pointer;color:var(--accent)}
details p{margin:6px 0 0}
details code{font-size:12px}
.prog{display:flex;gap:6px;height:10px;border-radius:999px;overflow:hidden;background:var(--line);margin:8px 0 14px}
.prog i{display:block;height:100%}.prog .d{background:var(--done)}.prog .g{background:var(--doing)}
/* 門、檔案 */
ul.doors{list-style:none;margin:0;padding:0;display:grid;gap:8px}
ul.doors li{display:grid;grid-template-columns:72px 1fr;gap:10px;background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:10px 12px;min-width:0;font-size:14.5px}
ul.doors li span{min-width:0}
.paths{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:13.5px}
.paths div{display:grid;grid-template-columns:150px 1fr;gap:8px;padding:4px 0;border-top:1px solid var(--line);min-width:0}
.paths div:first-child{border-top:0}
.paths code{word-break:break-all}
@media (max-width:560px){.paths div{grid-template-columns:1fr}}
:target{scroll-margin-top:12px;box-shadow:0 0 0 2px var(--accent)}
@media (prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}
</style>
<div class="wrap">
<h1>${esc(META.title)}</h1>
<p class="sub">客戶從哪裡進來、誰付錢、誰在按；系統還差哪幾件事。更新 ${esc(META.updated)}。</p>

<section id="now"><h2>一、現在怎樣</h2><p class="lead">今天查的實況。客戶進不來，也沒有人付錢；所有東西都是你自己用，或我們替客戶做。</p>
<ul class="yn">${now}</ul></section>

<section id="ways"><h2>二、客戶的五種樣子<span class="cnt" data-computed>${WAYS.length} 種，${liveWays} 種現在有</span></h2>
<p class="lead">每一種只要回答三個問題：裝在哪裡、錢從哪裡來、誰在按按鈕。程式只存這三個答案，所以以後多一種客戶，不用改程式。</p>
<div class="ways">${ways}</div></section>

<section id="steps"><h2>三、要做的事<span class="cnt" data-computed>${STEPS.length} 件：${done} 做完、${doing} 做到一半、${todo} 還沒開始</span></h2>
<p class="lead">照這個順序做，每一件做完才算數的證據都寫在卡上。風險 High 的要你說「go」才動。</p>
<div class="prog" data-computed><i class="d" style="width:${(done / STEPS.length) * 100}%"></i><i class="g" style="width:${(doing / STEPS.length) * 100}%"></i></div>
<ol class="steps">${steps}</ol></section>

<section id="open"><h2>四、你要先決定的<span class="cnt" data-computed>${OPEN.length} 件</span></h2><p class="lead">這些 agent 不能替你定。定了，對應那件事才能開工。</p>
<ol class="steps open">${open}</ol></section>

<section id="doors"><h2>五、客戶從哪個網址進來</h2><p class="lead">三個入口，各自登入；網址是設定，不寫死在程式。</p>
<ul class="doors">${doors}${side}</ul></section>

<section id="paths"><h2>六、檔案在哪</h2>
<div class="paths">
<div><b>計畫正本（七件事、三個問題）</b><code>${esc(META.adr017)}</code></div>
<div><b>三個入口</b><code>${esc(META.adr018)}</code></div>
<div><b>共用平台層／錢包</b><span><code>${esc(META.adr012)}</code><br><code>${esc(META.adr015)}</code></span></div>
<div><b>追蹤</b><span><code>${esc(META.tasks)}</code><br><code>${esc(META.worklog)}</code></span></div>
<div><b>這一頁</b><span><code>${esc(META.self)}</code><br>改 <code>data.mjs</code> → <code>node build.mjs</code> → <code>node check.mjs</code> → 重發同一個網址</span></div>
</div></section>
</div>
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  writeFileSync(path.join(here, 'supervisor.html'), render(), 'utf8');
  console.log('wrote supervisor.html');
}
