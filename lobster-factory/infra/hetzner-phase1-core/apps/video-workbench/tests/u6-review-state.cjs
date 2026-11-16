// Plan U6: steps 11 審片 / 12 發布 read the main system, never a fixed word. (1) readReview: reviewed = all four QA kinds
// passed on every ratio file, for the checksum of that file; released = some ratio file has a Release for its checksum;
// a failed read is unknown (null), not "not done". (2) readPublished: deliveries and the newest outcome per platform of
// this video's Releases only. (3) stepStates has 12 steps and says "todo", not "optional", once a cut exists.
const assert = require("node:assert/strict");
const { readReview, readPublished } = require("../shared/jobs-view.js");
const Spine = require("../shared/episode-spine.js");

const KINDS = ["technical", "caption", "editorial", "rights"];
const passed = (cs, skip) => ({ items: KINDS.filter((k) => k !== skip).map((kind) => ({ kind, status: "passed", candidateChecksum: cs })) });
const server = (routes) => async (path) => {
  for (const [prefix, answer] of Object.entries(routes)) if (path.startsWith(prefix)) return typeof answer === "function" ? answer(path) : answer;
  throw new Error("unexpected " + path);
};

(async () => {
  const assets = { items: [{ id: "main", checksum_sha256: "m1", metadata: {} }, { id: "wide", checksum_sha256: "w1", metadata: { variantOf: "main" } }, { id: "other", checksum_sha256: "o1", metadata: {} }] };
  const qa = (reports) => (path) => reports[new URL(path, "http://x").searchParams.get("candidateAssetId")] ?? { items: [] };
  const base = { "/api/video/assets": assets, "/api/video/release": { items: [] } };

  assert.deepEqual(await readReview(server({ ...base, "/api/video/qa/reports": qa({ main: passed("m1"), wide: passed("w1") }) }), "org", "main"), { reviewed: true, released: false });
  assert.equal((await readReview(server({ ...base, "/api/video/qa/reports": qa({ main: passed("m1"), wide: passed("w1", "rights") }) }), "org", "main")).reviewed, false, "一個比例少一項就還沒審完");
  assert.equal((await readReview(server({ ...base, "/api/video/qa/reports": qa({ main: passed("OLD"), wide: passed("w1") }) }), "org", "main")).reviewed, false, "別個檔案的結果不算");
  const released = await readReview(server({ ...base, "/api/video/qa/reports": qa({ main: passed("m1"), wide: passed("w1") }), "/api/video/release": { items: [{ candidate_asset_id: "wide", candidate_checksum: "w1" }] } }), "org", "main");
  assert.deepEqual(released, { reviewed: true, released: true });
  assert.equal((await readReview(server({ ...base, "/api/video/qa/reports": qa({ main: passed("m1"), wide: passed("w1") }), "/api/video/release": { items: [{ candidate_asset_id: "wide", candidate_checksum: "STALE" }] } }), "org", "main")).released, false, "核准後檔案換過就不算");
  assert.equal(await readReview(server({ ...base, "/api/video/qa/reports": () => null }), "org", "main"), null, "讀不到＝未知，不是沒做");
  assert.equal(await readReview(server({ ...base, "/api/video/assets": { items: [] } }), "org", "main"), null);
  console.log("PASS 1 readReview");

  const where = await readPublished(server({
    "/api/video/projects?organizationId": { items: [{ id: "row" }] },
    "/api/video/projects?id=": {
      assets: assets.items,
      releases: [{ id: "r-main", candidate_asset_id: "main" }, { id: "r-other", candidate_asset_id: "other" }],
      deliveries: [{ release_id: "r-main", destination: "youtube", variant: null, status: "published" }, { release_id: "r-other", destination: "tiktok", variant: null, status: "published" }],
      outcomes: [{ release_id: "r-main", platform: "youtube", maturity: "7d", metrics: { views: 9 } }, { release_id: "r-main", platform: "youtube", maturity: "7d", metrics: { views: 1 } }, { release_id: "r-other", platform: "tiktok", maturity: "7d", metrics: { views: 5 } }],
    },
  }), "org", "proj-1", "main");
  assert.deepEqual(where, ["youtube：published", "youtube 成效（發布後 7 天）：觀看 9"], "只列這支影片的發布，成效取最新一筆");
  assert.deepEqual(await readPublished(server({ "/api/video/projects?organizationId": { items: [] } }), "org", "proj-1", "main"), [], "專案還沒有列＝沒發布過");
  assert.equal(await readPublished(server({ "/api/video/projects?organizationId": null }), "org", "proj-1", "main"), null);
  console.log("PASS 2 readPublished");

  const steps = (outputs) => Spine.stepStates({ shots: [], steps: [], outputs }, []);
  assert.equal(steps([]).length, 12);
  assert.deepEqual(steps([]).slice(10), ["optional", "optional"]);
  assert.deepEqual(steps([{ url: "u", jobId: "j", derivedFrom: null }]).slice(10), ["todo", "todo"]);
  console.log("PASS 3 stepStates 12 步");
})().catch((e) => (console.error(e), process.exit(1)));
