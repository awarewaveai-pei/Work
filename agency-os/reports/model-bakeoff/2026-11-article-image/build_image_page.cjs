// Builds the article-image bake-off page: downloads our own R2 images, shrinks them, embeds them.
const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");
const req = createRequire("D:/Worktrees/Work/sub-int/lobster-factory/infra/hetzner-phase1-core/apps/next-admin/package.json");
const sharp = req("sharp");

const OUT = "D:/Work/agency-os/reports/model-bakeoff/2026-11-article-image";
const data = JSON.parse(fs.readFileSync(path.join(OUT, "runs.json"), "utf8"));
const NTD = 32;
// blind letters (fixed shuffle); the old way is shown openly as the comparison
const LETTER = { "openai-low": "A", "codex-image": "B", "flux-schnell": "C", "nano-banana-2": "D", "flux-2-klein-4b": "E", "flux-dev": "F" };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function img(uuid, width) {
  const file = path.join(OUT, "img", `${uuid}.webp`);
  if (!fs.existsSync(file)) {
    const res = await fetch(data.urlPrefix + uuid + ".webp");
    if (!res.ok) throw new Error(`download ${uuid}: ${res.status}`);
    const small = await sharp(Buffer.from(await res.arrayBuffer())).resize({ width, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, small);
  }
  return "data:image/webp;base64," + fs.readFileSync(file).toString("base64");
}

(async () => {
  const runs = data.runs.filter((r) => r.kind !== "對照").sort((a, b) => LETTER[a.id].localeCompare(LETTER[b.id]));
  const old = data.runs.find((r) => r.kind === "對照");
  const price = (r) => (r.usdEach === 0 ? "NT$0" : "NT$" + (r.usdEach * NTD).toFixed(2));
  const secs = (ms) => Math.round(ms / 1000) + " 秒";
  let sections = "";
  for (const s of data.slots) {
    const isCover = s.key === "cover";
    let cards = "";
    for (const r of runs) {
      const src = await img(isCover ? r.laid : r.images[s.key][0], 760);
      cards += `<figure class="card"><img src="${src}" alt="來源 ${LETTER[r.id]} 的${esc(s.label)}" loading="lazy"><figcaption><b>來源 ${LETTER[r.id]}</b><span>${price(r)}／張 · ${secs(r.images[s.key][1])}</span></figcaption></figure>`;
    }
    const oldSrc = await img(old.images[s.key][0], 760);
    cards += `<figure class="card old"><img src="${oldSrc}" alt="改版前的做法畫出的${esc(s.label)}" loading="lazy"><figcaption><b>對照：改版前的做法</b><span>只給中文替代文字「${esc(s.alt)}」</span></figcaption></figure>`;
    sections += `<section><h2>${esc(s.label)}</h2>
${isCover ? `<p class="about">封面已套上新版型：短標題「${esc(data.cover.title)}」，副標「${esc(data.cover.subtitle)}」。色塊是預設顏色。</p>` : `<div class="para"><div class="ph">這張圖放在這一段</div><h3>${esc(s.heading)}</h3><p>${esc(s.text)}</p></div>`}
<p class="scene"><span>AI 寫給生圖模型的畫面描述</span>${esc(s.scene)}</p>
<div class="grid">${cards}</div></section>`;
  }
  // the English article: the three sources the operator kept (A, D, F)
  let en = "";
  for (const sl of data.en.slots) {
    const isCover = sl.key === "cover";
    let cards = "";
    for (const r of [...data.en.runs].sort((a, b) => LETTER[a.id].localeCompare(LETTER[b.id]))) {
      const uuid = isCover ? r.laid : r.images[sl.key] && r.images[sl.key][0];
      if (!uuid) { cards += `<figure class="card"><figcaption><b>來源 ${LETTER[r.id]}</b><span>這一張沒有留下來（見上方說明）</span></figcaption></figure>`; continue; }
      cards += `<figure class="card"><img src="${await img(uuid, 760)}" alt="來源 ${LETTER[r.id]} 的${esc(sl.label)}" loading="lazy"><figcaption><b>來源 ${LETTER[r.id]}</b><span>NT$${(r.usdEach * NTD).toFixed(2)}／張 · ${secs((r.images[sl.key] || r.images.cover)[1])}</span></figcaption></figure>`;
    }
    en += `<section><h2>${esc(sl.label)}</h2>
${isCover ? `<p class="about">短標題「${esc(data.en.cover.title)}」，副標「${esc(data.en.cover.subtitle)}」。</p>` : `<div class="para"><div class="ph">這張圖放在這一段</div><h3>${esc(sl.heading)}</h3><p>${esc(sl.text)}</p></div>`}
<p class="scene"><span>AI 寫給生圖模型的畫面描述</span>${esc(sl.scene)}</p>
<div class="grid">${cards}</div></section>`;
  }
  const key = runs.map((r) => `<tr><td>來源 ${LETTER[r.id]}</td><td>${esc(r.label)}</td><td>${esc(r.kind)}</td><td>${price(r)}</td><td>${secs(Object.values(r.images).reduce((a, i) => a + i[1], 0) / 4)}</td><td>${esc(r.note || "")}</td></tr>`).join("");
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>文章配圖實測</title>
<style>
:root{--bg:#f6f5f1;--card:#fff;--ink:#1d1d1b;--mute:#5f5e5a;--line:#dcdad2;--accent:#0f6e56;--soft:#e9f3ee;--warn:#8a4b12;--warnbg:#faeeda}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#171716;--card:#222220;--ink:#eceae4;--mute:#a9a7a0;--line:#3a3a37;--accent:#5dcaa5;--soft:#1c2b26;--warn:#f0c27a;--warnbg:#3a2a12}}
:root[data-theme="dark"]{--bg:#171716;--card:#222220;--ink:#eceae4;--mute:#a9a7a0;--line:#3a3a37;--accent:#5dcaa5;--soft:#1c2b26;--warn:#f0c27a;--warnbg:#3a2a12}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.7 system-ui,"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif}
main{max-width:1180px;margin:0 auto;padding:28px 16px 64px}
h1{font-size:26px;margin:0 0 6px}h2{font-size:21px;margin:44px 0 10px;padding-top:18px;border-top:1px solid var(--line)}h3{font-size:16px;margin:2px 0 4px}
.lead{color:var(--mute);margin:0 0 14px;max-width:70ch}
.how{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 18px;max-width:78ch}.how li{margin:2px 0}
.about{color:var(--mute);margin:0 0 8px}
.para{background:var(--soft);border-radius:12px;padding:12px 16px;max-width:78ch;margin:0 0 10px}.para p{margin:0}.ph{font-size:13px;color:var(--accent)}
.scene{font-size:14px;color:var(--mute);margin:0 0 14px;max-width:90ch}.scene span{display:block;font-size:13px;color:var(--ink)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.card{margin:0;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}.card img{display:block;width:100%;height:auto}
.card figcaption{padding:8px 12px 10px;display:flex;flex-direction:column;gap:2px}.card b{font-size:16px}.card span{font-size:13px;color:var(--mute)}
.card.old{border-style:dashed}.card.old b{color:var(--warn)}
details{margin-top:48px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 18px}summary{cursor:pointer;font-weight:600}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;margin-top:10px;font-size:14px}td,th{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;white-space:nowrap}
.note{background:var(--warnbg);color:var(--warn);border-radius:12px;padding:10px 16px;max-width:78ch;margin-top:14px}
</style></head><body><main>
<h1>文章配圖實測</h1>
<p class="lead">目的：哪一個來源畫得出符合文章內容的圖。2026-11-25 在正式站實跑。素材是用現在上線的做法新寫的一篇「職場倦怠」文章。</p>
<div class="how"><b>怎麼看</b><ul>
<li>每一區是文章裡的一個放圖位置。上面是那一段的文字，下面是六個來源各畫的一張。</li>
<li>六個來源拿到的是同一句畫面描述、同一個風格（照片感）。差別只在來源。</li>
<li>來源名稱先遮成 A 到 F，避免先入為主。對照表在最下面，點開才看得到。</li>
<li>每區最後一張虛線框的是「改版前的做法」：只把中文替代文字丟給模型。</li>
<li>價錢是每張的實際單價。</li></ul></div>
<p class="note">請看兩件事：圖跟那一段的內容有沒有關係；圖上有沒有亂碼字或奇怪的地方。</p>
${sections}
<h1 style="margin-top:64px">英文文章也測了一次</h1>
<p class="lead">你問中英文是不是都測過。上面那篇是中文。這裡補一篇英文文章「workplace burnout」，六個來源都測。</p>
<p class="note">${esc(data.en.note)}</p>
${en}
<details><summary>對照表（看完再點開）</summary><div class="tw"><table><tr><th>編號</th><th>來源</th><th>類型</th><th>每張</th><th>平均每張耗時</th><th>備註</th></tr>${key}</table></div>
<p class="about">一篇文章要四到五張。這次付費部分一共花了約 NT$${(data.runs.reduce((a, r) => a + r.usdEach * 4, 0) * NTD).toFixed(0)}，另外寫素材文章約 NT$2。</p></details>
</main></body></html>`;
  fs.writeFileSync(path.join(OUT, "image-bakeoff.html"), html);
  console.log("ok", (html.length / 1e6).toFixed(2) + " MB", fs.readdirSync(path.join(OUT, "img")).length, "images");
})().catch((e) => { console.error(e); process.exit(1); });
