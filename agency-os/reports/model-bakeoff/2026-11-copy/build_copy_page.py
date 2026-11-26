import json, pathlib

SRC = pathlib.Path(r"D:\Work\agency-os\reports\model-bakeoff\2026-11-copy\results.json")
OUT = pathlib.Path(__file__).with_name("copy-bakeoff.html")
RATE = 32

INPUTS = {
    "script-forge": "主題「職場倦怠的 5 個警訊」，Instagram Reels，產一份完整腳本",
    "video-script": "把盲測選出的那篇文章改成 6 個場景的影片腳本",
    "product-copy": "一件 T 恤，設計是「水彩風格的山與月亮，寫著 breathe」",
    "humanize": "把那篇文章的前 1,500 字改得不像 AI 寫的",
    "market-analysis": "關鍵字「職場倦怠」",
    "content-plan": "身心療癒／藝術療癒部落格，台灣讀者，2026 年 12 月的選題",
    "syndicate": "把那篇文章改寫成 Facebook、Instagram、Threads 三則貼文",
    "outreach-mail": "範例名單：台北 12 人的瑜伽教室「晨光瑜伽」（虛構），推銷內容行銷代操",
}
NAMES = {
    "claude-opus-5-5": "Claude Opus 5.5", "claude-haiku-5-5": "Claude Haiku 5.5", "gpt-6.2-sol": "GPT-6.2 sol",
    "gpt-6.1-terra": "GPT-6.1 terra", "gpt-5.4-mini": "GPT-5.4 mini",
}

rows = json.loads(SRC.read_text(encoding="utf-8"))
order, groups = [], {}
for r in rows:
    k = r["surface"]
    if k not in groups:
        order.append(k)
        groups[k] = {"key": k, "label": r["label"], "input": INPUTS[k], "runs": []}
    groups[k]["runs"].append({
        "model": NAMES.get(r["model"], r["model"]), "cur": bool(r.get("isCurrent")), "sec": round(r["ms"] / 1000),
        "ntd": round(r["costUsd"] * RATE, 2), "sub": bool(r.get("viaSubscription")),
        "fmt": r.get("formatNote"), "ok": r.get("formatOk"), "text": r.get("text") or "",
    })
allgroups = [groups[k] for k in order]
# 商品文案重測（提示詞修正後，2026-11-23）：三件商品 × 兩個模型
retest = json.loads(pathlib.Path(r"D:\tmp\pc-retest.json").read_text(encoding="utf-8"))
for key in dict.fromkeys(r["product"] for r in retest):
    rs = [r for r in retest if r["product"] == key]
    g = {"key": "retest-" + key, "label": "重測 " + rs[0]["name"].split("（")[0], "input": rs[0]["name"] + "；文案指示：" + rs[0]["given"], "runs": []}
    for r in rs:
        u = r.get("usage") or {}
        cut = r.get("finish") == "length"
        g["runs"].append({
            "model": NAMES.get(r["model"], r["model"]), "cur": r["model"] == "claude-opus-5-5", "sec": round(r["ms"] / 1000),
            "ntd": round((u["prompt_tokens"] * 2e-6 + u["completion_tokens"] * 1e-5) * RATE, 2) if u else None,
            "sub": not u, "fmt": "沒寫出來：輸出上限 1,200 全被模型的思考用掉" if cut else "", "ok": not cut,
            "text": r["text"] or "（這一次沒有產出任何文字）",
        })
    allgroups.append(g)
data = json.dumps(allgroups, ensure_ascii=False).replace("</", "<\\/")

HTML = r"""<title>八種文案模型比較</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
/* 版面：左邊八種功能的按鈕，右邊一次只看一種；上面一張小表，下面各模型的成品並排 */
:root{--bg:#f6f7f5;--panel:#ffffff;--ink:#1d2623;--mute:#5d6b66;--line:#d9dfdb;--accent:#0f6b5c;--accent-ink:#ffffff;--tag:#e6f0ed;--warn:#8a5a00;
  --sans:"Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#141917;--panel:#1c2320;--ink:#e6ece9;--mute:#9aa8a3;--line:#2f3a36;--accent:#5fc7b3;--accent-ink:#0c1512;--tag:#22302c;--warn:#e0b25a;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#141917;--panel:#1c2320;--ink:#e6ece9;--mute:#9aa8a3;--line:#2f3a36;--accent:#5fc7b3;--accent-ink:#0c1512;--tag:#22302c;--warn:#e0b25a;color-scheme:dark}
body{background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:16px;line-height:1.7}
.wrap{max-width:1280px;margin:0 auto;padding-block:24px 48px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
h1{font-size:1.5rem;margin:0 0 4px;text-wrap:balance}
.lead{color:var(--mute);margin:0 0 20px;max-width:46em}
.layout{display:grid;grid-template-columns:200px minmax(0,1fr);gap:24px;align-items:start}
nav{display:flex;flex-direction:column;gap:6px;position:sticky;top:calc(env(safe-area-inset-top,0px) + 12px)}
nav button{font:inherit;text-align:left;padding:9px 12px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--ink);cursor:pointer}
nav button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:600}
nav button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
main{min-width:0;display:flex;flex-direction:column;gap:16px}
h2{font-size:1.2rem;margin:0}
.given{color:var(--mute);margin:0}
.tablebox{overflow-x:auto;background:var(--panel);border:1px solid var(--line);border-radius:10px}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
th,td{padding:8px 12px;text-align:left;border-bottom:1px solid var(--line);white-space:nowrap}
tr:last-child td{border-bottom:0}
th{font-size:.82rem;color:var(--mute);font-weight:600}
.tag{display:inline-block;font-size:.75rem;padding:1px 8px;border-radius:999px;background:var(--tag);color:var(--accent);margin-left:6px;font-weight:600}
.cols{display:grid;gap:16px;grid-template-columns:repeat(var(--n),minmax(0,1fr))}
.col{min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.col h3{font-size:1rem;margin:0 0 8px;padding-bottom:8px;border-bottom:1px solid var(--line)}
.out{overflow-wrap:anywhere}
.out p{margin:0 0 .6em;white-space:pre-wrap}
.out .k{font-size:.8rem;color:var(--mute);font-weight:600;margin:.9em 0 .15em}
.out .item{border-left:2px solid var(--line);padding-left:10px;margin:0 0 .7em}
.note{color:var(--warn);font-size:.9rem;margin:0}
@media (max-width:860px){.layout{grid-template-columns:minmax(0,1fr)}nav{position:static;flex-direction:row;flex-wrap:wrap}.cols{grid-template-columns:minmax(0,1fr)}}
</style>
<div class="wrap">
  <h1>八種文案：現在用的模型和 GPT-6.2 sol 比較</h1>
  <p class="lead">每一種功能用同一份提示詞、同一個輸入，各模型寫一次。左邊選功能，右邊並排看成品。看完告訴監工每一種要用哪個模型。</p>
  <div class="layout">
    <nav id="nav" aria-label="功能"></nav>
    <main id="main"></main>
  </div>
</div>
<script id="d" type="application/json">__DATA__</script>
<script>
const D = JSON.parse(document.getElementById('d').textContent);
const nav = document.getElementById('nav'), main = document.getElementById('main');
const el = (t, c, s) => { const e = document.createElement(t); if (c) e.className = c; if (s != null) e.textContent = s; return e; };
function parse(text) {
  const m = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const body = m ? m[1] : text.trim();
  if (!/^[\[{]/.test(body)) return null;
  try { return JSON.parse(body); } catch { return null; }
}
function render(v, box) {
  if (v == null || v === '') return;
  if (Array.isArray(v)) { v.forEach((x) => { if (x && typeof x === 'object') { const it = el('div', 'item'); render(x, it); box.append(it); } else box.append(el('p', null, '・' + x)); }); return; }
  if (typeof v === 'object') { for (const [k, x] of Object.entries(v)) { if (x == null || x === '' || (Array.isArray(x) && !x.length)) continue; box.append(el('div', 'k', k)); render(x, box); } return; }
  box.append(el('p', null, String(v)));
}
function show(i) {
  const g = D[i];
  [...nav.children].forEach((b, j) => b.setAttribute('aria-pressed', j === i));
  main.replaceChildren();
  main.append(el('h2', null, g.label), el('p', 'given', '輸入：' + g.input));
  const tb = el('div', 'tablebox'), t = el('table');
  const hr = el('tr'); ['模型', '花多久', '一次的費用', '格式檢查'].forEach((h) => hr.append(el('th', null, h))); t.append(hr);
  g.runs.forEach((r) => {
    const tr = el('tr'), name = el('td', null, r.model);
    if (r.cur) name.append(el('span', 'tag', '現在用的'));
    const fmt = r.ok == null ? '不需要（自由文字）' : (r.ok ? '通過 ' : '沒過 ') + (r.fmt || '').split(/[；;]/)[0];
    tr.append(name, el('td', null, r.sec + ' 秒'), el('td', null, r.ntd == null ? '訂閱（沒花錢）' : 'NT$' + r.ntd.toFixed(2)), el('td', null, fmt));
    t.append(tr);
  });
  tb.append(t); main.append(tb);
  if (g.runs.some((r) => r.sub && r.ntd != null)) main.append(el('p', 'note', 'Claude 這次是用訂閱跑的，實際沒花錢；表上的費用是「如果走 API 會花多少」。'));
  const cols = el('div', 'cols'); cols.style.setProperty('--n', g.runs.length);
  g.runs.forEach((r) => {
    const c = el('section', 'col'), h = el('h3', null, r.model); if (r.cur) h.append(el('span', 'tag', '現在用的'));
    const out = el('div', 'out'), j = parse(r.text);
    if (j) render(j, out); else out.append(el('p', null, r.text));
    c.append(h, out); cols.append(c);
  });
  main.append(cols);
  try { localStorage.setItem('copy-bakeoff-tab', String(i)); } catch {}
}
D.forEach((g, i) => { const b = el('button', null, g.label); b.type = 'button'; b.id = 'tab-' + g.key; b.onclick = () => show(i); nav.append(b); });
let start = 0; try { start = Math.min(D.length - 1, Math.max(0, Number(localStorage.getItem('copy-bakeoff-tab')) || 0)); } catch {}
show(start);
</script>
"""
OUT.write_text(HTML.replace("__DATA__", data), encoding="utf-8", newline="\n")
print(OUT, len(HTML) + len(data), [(g, len(groups[g]["runs"])) for g in order][:3])
