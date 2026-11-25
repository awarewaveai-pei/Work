"""K12: build the blind side-by-side page from metrics.json (written by the temporary vitest runner).
Outputs article-bakeoff.html + articles.json (letter-keyed, no model names) + key.json (letter -> model, kept locally)."""
import json, pathlib, random, re

SRC = pathlib.Path(r"D:\Work\agency-os\reports\model-bakeoff\2026-11-article")
OUT = pathlib.Path(__file__).parent
rows = json.loads((SRC / "metrics.json").read_text(encoding="utf-8"))
ledger = [json.loads(l) for l in (SRC / "ledger.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
for r in rows:  # exact id or the vendor's dated id (gpt-5.4-2026-03-05), never a longer family name (gpt-5.4-mini)
    pat = re.compile(re.escape(r["model"]) + r"(-\d{4}-\d{2}-\d{2}|-\d{8})?$")
    mine = [l for l in ledger if l["route"] == "content/article-generate" and pat.match(l["model"])]
    r["costUsd"] = sum(float(l["cost_usd"]) for l in mine)
    r["ledgerRows"] = len(mine)
rows.sort(key=lambda r: r["model"])
letters = [chr(ord("A") + i) for i in range(len(rows))]
random.Random(20261122).shuffle(rows)

LABEL = {"gpt-6-luna": "GPT-6 luna", "gpt-5.4-nano": "GPT-5.4 nano", "gpt-5.4-mini": "GPT-5.4 mini", "gpt-6.1-terra": "GPT-6.1 terra",
         "gpt-6.2-sol": "GPT-6.2 sol", "gpt-5.4": "GPT-5.4", "gpt-5.5": "GPT-5.5", "gpt-6.2-astra": "GPT-6.2 astra",
         "claude-haiku-5-5": "Claude Haiku 5.5", "claude-sonnet-5-5": "Claude Sonnet 5.5", "claude-opus-5-5": "Claude Opus 5.5", "claude-fable-5-1": "Claude Fable 5.1"}


def clean_html(h: str) -> str:
    h = re.sub(r"<!--.*?-->", "", h, flags=re.S)                      # Gutenberg block comments
    h = re.sub(r"<script.*?</script>", "", h, flags=re.S | re.I)
    h = re.sub(r"\s(class|style|data-[a-z-]+|id)=\"[^\"]*\"", "", h)   # Kadence classes mean nothing here
    return h.strip()


articles, key = [], []
for letter, r in zip(letters, rows):
    articles.append({"id": letter, "html": clean_html(r["html"]), "seoTitle": r.get("seoTitle"), "metaDesc": r.get("metaDesc")})
    key.append({"id": letter, "model": r["model"], "label": LABEL.get(r["model"], r["model"]), "seconds": round((r.get("ms") or 0) / 1000),
                "words": r["words"], "seo": r["seoScore"], "seoPassed": r["seoPassed"], "seoTotal": r["seoTotal"], "seoFailed": r["seoFailed"],
                "twd": round(r["costUsd"] * 32, 2), "factMarks": r["factCheckMarks"], "truncated": r["truncated"], "error": r["generationError"],
                "ledgerRows": r["ledgerRows"]})
(OUT / "articles.json").write_text(json.dumps(articles, ensure_ascii=False), encoding="utf-8", newline="\n")
(OUT / "key.json").write_text(json.dumps(key, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")
(SRC / "key.json").write_text(json.dumps(key, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")

PAGE = r"""<title>文章模型盲測</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
/* Layout: one reading column; a sticky strip of letter buttons switches the article; the answer key sits closed at the end. */
:root {
  --bg: #f6f7f5; --panel: #ffffff; --ink: #1c2422; --muted: #5d6a66; --line: #d9dedb; --accent: #0f6b5c; --accent-ink: #ffffff; --mark: #fff3c4;
  --font-body: "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif;
  --font-data: ui-monospace, "SF Mono", Consolas, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #131816; --panel: #1b2220; --ink: #e6ece9; --muted: #9aa8a3; --line: #2e3835; --accent: #5cc9b4; --accent-ink: #0c1513; --mark: #4a4220; color-scheme: dark } }
:root[data-theme="dark"] { --bg: #131816; --panel: #1b2220; --ink: #e6ece9; --muted: #9aa8a3; --line: #2e3835; --accent: #5cc9b4; --accent-ink: #0c1513; --mark: #4a4220; color-scheme: dark }
body { background: var(--bg); color: var(--ink); font-family: var(--font-body); font-size: 16px; line-height: 1.75;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 20px 56px; }
.wrap { max-width: 46rem; margin-inline: auto; display: grid; gap: 20px; min-width: 0; }
h1 { font-size: 1.5rem; line-height: 1.3; margin: 0; text-wrap: balance; }
.lead { color: var(--muted); margin: 0; }
.facts { display: grid; gap: 4px; margin: 0; padding: 12px 14px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; font-size: .92rem; }
.facts div { display: flex; gap: 10px; flex-wrap: wrap; } .facts dt { color: var(--muted); min-width: 4.5em; } .facts dd { margin: 0; min-width: 0; }
.strip { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; background: var(--bg); padding-block: 10px; border-bottom: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--bg); }
.strip button { font: 600 1rem var(--font-data); min-width: 2.6rem; padding: 6px 0; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--ink); cursor: pointer; }
.strip button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.strip button:focus-visible, .nav button:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.strip .read { opacity: .55; }
.meta { font-size: .9rem; color: var(--muted); display: grid; gap: 2px; }
.meta b { color: var(--ink); font-weight: 600; }
article { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 20px 22px; min-width: 0; overflow-wrap: anywhere; }
article h1, article h2 { font-size: 1.25rem; line-height: 1.4; margin: 1.6em 0 .5em; } article h3 { font-size: 1.08rem; margin: 1.3em 0 .4em; }
article > :first-child { margin-top: 0; } article p { margin: 0 0 1em; } article ul, article ol { padding-left: 1.4em; margin: 0 0 1em; }
article table { border-collapse: collapse; width: 100%; font-size: .92rem; } article th, article td { border: 1px solid var(--line); padding: 6px 8px; text-align: left; vertical-align: top; }
article blockquote { margin: 0 0 1em; padding: 2px 14px; border-left: 3px solid var(--line); color: var(--muted); }
.tablewrap { overflow-x: auto; }
.nav { display: flex; justify-content: space-between; gap: 10px; } .nav button { font: inherit; padding: 8px 14px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--ink); cursor: pointer; }
details { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; }
summary { cursor: pointer; font-weight: 600; }
.key { overflow-x: auto; margin-top: 12px; } .key table { border-collapse: collapse; width: 100%; font-size: .9rem; font-variant-numeric: tabular-nums; }
.key th, .key td { border-bottom: 1px solid var(--line); padding: 6px 8px; text-align: right; white-space: nowrap; } .key th:nth-child(-n+2), .key td:nth-child(-n+2) { text-align: left; }
.key td.warn { background: var(--mark); }
.note { color: var(--muted); font-size: .88rem; margin: 10px 0 0; }
</style>
<div class="wrap">
  <header style="display:grid;gap:8px">
    <h1>同一個題目，__N__ 個模型各寫一篇</h1>
    <p class="lead">模型名稱先遮住。請一篇一篇看，挑出你覺得寫得好的，告訴我字母。看完再打開最下面的對照表。</p>
    <dl class="facts">
      <div><dt>題目</dt><dd>職場倦怠的 5 個警訊，你中了幾個？</dd></div>
      <div><dt>關鍵字</dt><dd>職場倦怠</dd></div>
      <div><dt>切入角度</dt><dd>列出倦怠常見徵兆與自我檢測方式，並提供調整工作界線的建議</dd></div>
      <div><dt>條件</dt><dd>繁體中文、中篇、不配圖；跟排程對 Aware Wave 站送出的內容相同，只換模型。2026-11-22 在正式站產生。</dd></div>
    </dl>
  </header>
  <nav class="strip" id="strip" aria-label="選文章"></nav>
  <div class="meta" id="meta"></div>
  <article id="art" aria-live="polite">載入中…</article>
  <div class="nav"><button type="button" id="prev">← 上一篇</button><button type="button" id="next">下一篇 →</button></div>
  <details id="reveal">
    <summary>看完再打開：每個字母是哪個模型、花多少、SEO 幾分</summary>
    <div class="key"><table id="key"><thead><tr><th>字母</th><th>模型</th><th>實際花費</th><th>耗時</th><th>字數</th><th>SEO 分數</th><th>未查證標記</th></tr></thead><tbody></tbody></table></div>
    <p class="note">實際花費取自成本帳本，以 32 換算成 NT$，不含每篇另外約 NT$0.2 的搜尋費。SEO 分數是系統自己的檢查（滿分 100）。未查證標記是 AI 自己標出「這句的數字或說法沒查證過」的次數。黃底代表被截斷或產生失敗。</p>
  </details>
</div>
<script>
const KEY = __KEY__;
let data = [], cur = 0; const seen = new Set();
const $ = (id) => document.getElementById(id);
function show(i) {
  cur = (i + data.length) % data.length; const a = data[cur]; seen.add(a.id);
  $("art").innerHTML = a.html.replace(/<table/g, '<div class="tablewrap"><table').replace(/<\/table>/g, "</table></div>");
  $("meta").innerHTML = "<div>文章 <b>" + a.id + "</b>（第 " + (cur + 1) + "／" + data.length + " 篇）</div>" + (a.seoTitle ? "<div>搜尋結果標題：<b></b></div><div>搜尋結果描述：<span></span></div>" : "");
  if (a.seoTitle) { $("meta").querySelector("div:nth-child(2) b").textContent = a.seoTitle; $("meta").querySelector("div:nth-child(3) span").textContent = a.metaDesc || ""; }
  for (const b of $("strip").children) { b.setAttribute("aria-pressed", String(b.dataset.id === a.id)); b.classList.toggle("read", seen.has(b.dataset.id) && b.dataset.id !== a.id); }
  if (location.hash.slice(1) !== a.id) history.replaceState(null, "", "#" + a.id);
  window.scrollTo({ top: 0 });
}
fetch("articles.json").then((r) => r.json()).then((rows) => {
  data = rows;
  for (const [i, a] of rows.entries()) { const b = document.createElement("button"); b.type = "button"; b.textContent = a.id; b.dataset.id = a.id; b.id = "pick-" + a.id; b.onclick = () => show(i); $("strip").appendChild(b); }
  const want = rows.findIndex((a) => a.id === location.hash.slice(1)); show(want >= 0 ? want : 0);
}).catch(() => { $("art").textContent = "文章讀不到，請重新整理。"; });
$("prev").onclick = () => show(cur - 1); $("next").onclick = () => show(cur + 1);
window.addEventListener("hashchange", () => { const i = data.findIndex((a) => a.id === location.hash.slice(1)); if (i >= 0 && i !== cur) show(i); });
const tb = $("key").querySelector("tbody");
for (const k of KEY) { const tr = document.createElement("tr"); const bad = k.truncated || k.error;
  const cells = [k.id, k.label, "NT$" + k.twd.toFixed(2), k.seconds + " 秒", k.words.toLocaleString(), k.seo + "（" + k.seoPassed + "／" + k.seoTotal + "）", String(k.factMarks) + (bad ? "　" + (k.error ? "產生失敗" : "被截斷") : "")];
  cells.forEach((c, i) => { const td = document.createElement("td"); td.textContent = c; if (bad && i === 6) td.className = "warn"; tr.appendChild(td); }); tb.appendChild(tr); }
</script>
"""
key_sorted = sorted(key, key=lambda k: k["id"])
html = PAGE.replace("__KEY__", json.dumps(key_sorted, ensure_ascii=False)).replace("__N__", str(len(rows)))
(OUT / "article-bakeoff.html").write_text(html, encoding="utf-8", newline="\n")
print("ok", len(rows), "articles;", sum(len(a["html"]) for a in articles), "html chars")
for k in key_sorted:
    print(k["id"], k["model"], f'NT${k["twd"]}', f'{k["seconds"]}s', k["words"], "seo", k["seo"], "marks", k["factMarks"], "rows", k["ledgerRows"], "TRUNC" if k["truncated"] else "", "ERR" if k["error"] else "")
