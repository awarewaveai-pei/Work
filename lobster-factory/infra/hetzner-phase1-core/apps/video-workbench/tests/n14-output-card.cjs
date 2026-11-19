// N14 成片卡: (1) 「發布到哪」 is told by the article as it is now, in plain words, never by a code or the receipt's status;
// (2) only the newest version is open, and 完成：… is written only for a version that has its own deliveries.
const assert = require("node:assert/strict");
const { readPublished, expandedOutputs, outputSummary, deliveredText } = require("../shared/jobs-view.js");

const server = (outcome) => async (path) => {
  if (path.startsWith("/api/video/projects?organizationId")) return { items: [{ id: "row" }] };
  if (path.startsWith("/api/video/projects?id=")) return {
    assets: [{ id: "main", metadata: {} }],
    releases: [{ id: "r1", candidate_asset_id: "main" }],
    // the old receipt: a draft recorded as published, with the internal variant code
    deliveries: [{ release_id: "r1", destination: "wordpress", variant: "default:post-57", status: "published" }],
    outcomes: [],
  };
  if (path.startsWith("/api/video/draft-outcome")) return outcome;
  throw new Error("unexpected " + path);
};
const where = (outcome) => readPublished(server(outcome), "org", "proj", "main");

(async () => {
  // 回執是 published 但文章仍是 draft → 網站草稿〈…〉，不露 default:post-57、不寫 published
  assert.deepEqual(await where({ drafts: [], articles: [{ title: "夏季新品", state: "draft" }] }), ["網站草稿〈夏季新品〉"]);
  assert.deepEqual(await where({ drafts: [{ id: "a" }, { id: "b" }, { id: "c" }], articles: [{ title: "夏季新品", state: "published" }] }), ["網站文章〈夏季新品〉（已發布）", "社群草稿 ×3"]);
  assert.deepEqual(await where({ drafts: [], articles: [{ title: "文章 #57", untitled: true, state: "draft" }] }), ["網站草稿"], "標題讀不到就只寫「網站草稿」");
  assert.deepEqual(await where(null), ["網站草稿"], "文章那邊讀不到：舊回執照草稿字樣，不寫 published、不露代號");
  // 別的投遞也不露 variant 代號（postiz／default:youtube -> youtube）
  const other = async (d) => readPublished(async (path) => path.startsWith("/api/video/projects?organizationId") ? { items: [{ id: "row" }] } : path.startsWith("/api/video/projects?id=") ? { assets: [{ id: "main", metadata: {} }], releases: [{ id: "r1", candidate_asset_id: "main" }], deliveries: [{ release_id: "r1", ...d }], outcomes: [] } : { drafts: [], articles: [] }, "org", "proj", "main");
  assert.deepEqual(await other({ destination: "postiz", variant: "default:youtube", status: "published" }), ["youtube：已發布"]);
  assert.deepEqual(await other({ destination: "youtube", variant: null, status: "scheduled" }), ["youtube：已排程"]);
  assert.deepEqual(await where({ drafts: [], articles: [{ title: "預約文", state: "scheduled" }] }), ["網站文章〈預約文〉（已排程）"]);
  console.log("PASS 1 發布到哪的字樣");

  assert.deepEqual(expandedOutputs(3), [false, false, true], "預設只展開最新一版");
  assert.deepEqual(expandedOutputs(3, [0]), [true, false, true], "人按開的舊版才展開");
  assert.deepEqual(expandedOutputs(1), [true]);
  assert.equal(outputSummary({ at: "2026-11-19T04:00:00Z" }, 0, false), "第 1 版・11/19・展開");
  assert.equal(outputSummary({}, 1, true), "第 2 版・收合", "沒有時間就不寫日期");
  assert.equal(deliveredText({ drafted: true, drafts: [{}, {}, {}], articles: [{}] }), "完成：已建 3 個社群草稿、1 篇文章");
  assert.equal(deliveredText({ drafted: false, drafts: [], articles: [] }), "", "這一版沒有交付回執：不寫完成");
  assert.equal(deliveredText(null), "");
  console.log("PASS 2 只展開最新一版、完成只標在有交付的那一版");
})().catch((e) => (console.error(e), process.exit(1)));
