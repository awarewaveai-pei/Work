// Card U9 (docs/video-unify-plan-20261116.md §4 U9, §10 X3). Zero real network.
// 1 X3: the Story Bible import takes a URL only under a base next-admin answered (our R2); a look-alike host and any
//   other host are refused before any lookup; the stock import (hosts = Pexels) still refuses our R2.
// 2 寫回這一集 (EpisodeSpine.setShots): the script's cast joins the project (one already there by its key stays as is)
//   and each shot is bound to the character its scene names; the series is set once.
// 3 套用核准版本 (backend/story-bible.cjs apply): a reference id the main system does not answer as this organization's
//   is never fetched; this organization's picture is imported once and pairs back to the same asset id on 存成.
const assert = require("node:assert/strict"), path = require("node:path"), { EventEmitter } = require("node:events");
const { fetchMedia } = require("../backend/url-import.cjs");
const Spine = require("../shared/episode-spine.js");
const { createStoryBible } = require("../backend/story-bible.cjs");

const R2 = "https://pub-ours.r2.dev", VIDEO = "https://video.example-cdn.com";
const jpeg = Buffer.from([255, 216, 255, 224, 0, 16]);
let lookups = 0;
const lookup = async () => (lookups++, [{ address: "93.184.216.34", family: 4 }]);
const request = (url, options, onResponse) => {
  const req = new EventEmitter();
  req.destroy = (error) => { if (error) req.emit("error", error); req.emit("close"); };
  req.end = () => queueMicrotask(() => {
    const res = new EventEmitter();
    res.statusCode = 200; res.headers = { "content-type": "image/jpeg" }; res.destroy = () => req.emit("close");
    onResponse(res); res.emit("data", jpeg); res.emit("end"); req.emit("close");
  });
  return req;
};

(async () => {
  const bases = [R2, VIDEO];
  for (const bad of [R2 + ".attacker.tld/a.jpg", "https://example.com/a.jpg", "http://pub-ours.r2.dev/a.jpg", R2])
    await assert.rejects(() => fetchMedia(bad, { kinds: ["image"], bases, lookup, request }), /不是可匯入的素材來源/, bad);
  await assert.rejects(() => fetchMedia(R2 + "/designs/a.jpg", { kinds: ["image"], hosts: ["images.pexels.com"], lookup, request }), /不是可匯入的素材來源/);
  assert.equal(lookups, 0, "名單外的網址不該查 DNS");
  assert.equal((await fetchMedia(R2 + "/designs/a.jpg", { kinds: ["image"], bases, lookup, request })).ext, "jpg");
  console.log("PASS 1 自家儲存匯入只收主系統給的 base 底下的網址（仿冒主機、其他主機、http 都拒）；圖庫匯入仍不收 R2");

  const projects = [{ id: "p1", assets: { character: [{ id: "c-old", key: "char_1", name: "小美（專案改過）", refs: ["/generated/a.png"] }], scene: [], prop: [] },
    episodes: [{ id: "e1", shots: [{ id: "s0", text: "舊" }] }] }];
  assert.equal(Spine.setShots(projects, { projectId: "p1", episodeId: "e1", storyBibleSeries: "series_1",
    shots: [{ text: "一", line: "", character: "char_1" }, { text: "二", line: "", character: "char_2" }, { text: "三", line: "" }],
    characters: [{ key: "char_1", name: "小美", refs: [] }, { key: "char_2", name: "阿明", role: "配角", refs: ["https://r2/b.png"] }] }), true);
  const [p] = projects, cast = p.assets.character;
  assert.deepEqual(cast.map((c) => [c.key, c.name]), [["char_1", "小美（專案改過）"], ["char_2", "阿明"]], "已有的角色照專案的；沒有的加進來");
  assert.deepEqual(p.episodes[0].shots.map((s) => s.characterIds), [["c-old"], [cast[1].id], undefined], "鏡頭綁回場景點名的角色");
  assert.equal(p.storyBibleSeries, "series_1");
  Spine.setShots(projects, { projectId: "p1", episodeId: "e1", shots: [], storyBibleSeries: "series_2" });
  assert.equal(p.storyBibleSeries, "series_1", "專案已有系列就不換");
  // The top page's own store keeps items as one array with kind (shared/models.js project): same result in that shape.
  const flat = [{ id: "p2", assets: [{ id: "c-x", kind: "character", key: "char_1", name: "小美", references: [] }, { id: "s-x", kind: "scene", name: "店" }], episodes: [{ id: "e2", shots: [] }] }];
  Spine.setShots(flat, { projectId: "p2", episodeId: "e2", shots: [{ text: "一", character: "char_1" }, { text: "二", character: "char_2" }], characters: [{ key: "char_2", name: "阿明", refs: [] }] });
  assert.ok(Array.isArray(flat[0].assets));
  const added = flat[0].assets.find((a) => a.key === "char_2");
  assert.deepEqual([added.kind, flat[0].episodes[0].shots.map((s) => s.characterIds[0])], ["character", ["c-x", added.id]]);
  console.log("PASS 2 寫回這一集：角色帶入（已有的不動）、鏡頭綁回角色、系列只設一次");

  const ORG = "11111111-1111-4111-8111-111111111111", OURS = "22222222-2222-4222-8222-222222222222", THEIRS = "33333333-3333-4333-8333-333333333333";
  const index = {}, asked = [];
  const main = {
    organizationId: () => ORG,
    storageBases: async () => bases,
    // the main system answers this organization's rows only
    ownAssets: async ({ assetIds = [], objectUrls = [] }) => (asked.push(...assetIds), [
      { assetId: OURS, objectUrl: R2 + "/designs/ours.jpg", checksumSha256: "x" }].filter((r) => assetIds.includes(r.assetId) || objectUrls.includes(r.objectUrl))),
    localsOf: (id) => Object.keys(index).filter((u) => index[u].assetId === id),
    adopt: (url, entry) => (index[url] = entry),
    entryOf: (url) => index[url] || null,
  };
  let fetched = 0, n = 0;
  const bible = createStoryBible({ main, appDir: path.join(__dirname, "../../next-admin"), store: () => "/generated/" + "0".repeat(8) + "-" + ++n + ".jpg", exists: () => true,
    urlImport: { underBase: require("../backend/url-import.cjs").underBase, fetchMedia: async (url, o) => (fetched++, fetchMedia(url, { ...o, lookup, request })) } });
  const doc = { schemaVersion: "1.0.0", seriesId: "series_1", characters: [{ id: "char_1", name: "小美", role: "主角", referenceAssetIds: [OURS, THEIRS], rightsNote: "自拍" }], locations: [], props: [],
    continuity: { currentState: [], prohibitions: ["短髮"], openThreads: [] }, episode: { episodeId: "ep_1", premise: "x", hook: "x", beats: ["x"], stateDelta: {} }, provenance: { capabilityVersion: "1.0.0", sourceArtifactIds: [] } };
  const got = await bible.apply({ document: doc, production: { character: [{ id: "c-old", key: "char_1", name: "舊名", descr: "專案自己的描述", refs: [] }] } });
  assert.equal(got.skipped, 1, "別組織的參考圖不帶入");
  assert.equal(fetched, 1, "只抓這個組織的那一張");
  const item = got.production.character[0];
  assert.deepEqual([item.name, item.descr, item.refs.length], ["小美", "專案自己的描述", 1]);
  await bible.apply({ document: doc, production: got.production });
  assert.equal(fetched, 1, "同一張不重抓");
  const back = await bible.draft({ base: doc, production: got.production, seriesId: "series_1", title: "t" });
  assert.deepEqual(back.missing, []);
  assert.deepEqual(back.document.characters[0].referenceAssetIds, [OURS], "存回同一個資產編號");
  assert.equal(back.document.characters[0].rightsNote, "自拍");
  console.log("PASS 3 套用核准版本：別組織的參考圖不抓；自家的匯入一次，存回時對回同一個資產編號");
  // A locally edited reference must not replace the approved picture used for comparison.
  const posts = [], notices = [];
  const window = {
    VideoWorkbench: { capabilities: { mainSystem: { organizationId: ORG } },
      request: async (route, body) => route === "/bible/apply"
        ? { production: { character: [{ key: "char_1", refs: ["/approved.jpg"] }] } }
        : { urls: Object.fromEntries(body.urls.map((u) => [u, "https://ours.test" + u])) } },
    VideoWorkbenchPrices: { unit: () => "NT$1" }, confirm: () => true,
  };
  const fetch = async (url, options) => {
    if (options?.method !== "POST") return { ok: true, json: async () => ({ items: [{ series_id: "series_1", status: "approved", revision: 1, document_json: doc }] }) };
    const body = JSON.parse(options.body); posts.push(body);
    return { ok: true, json: async () => body.quote ? { usd: 1, pairs: 1 } : { results: [] } };
  };
  require("node:vm").runInNewContext(require("node:fs").readFileSync(path.join(__dirname, "../scripts/projects-bible.js"), "utf8"), { window, fetch });
  const local = { storyBibleSeries: "series_1", assets: { character: [{ id: "c1", key: "char_1", refs: ["/unapproved.jpg"] }] } };
  await window.ProjectBible.act("bibleCheck", local, { id: "e1", shots: [{ image: "/shot.jpg", characterIds: ["c1"] }] }, null, { render() {}, notify: (s) => notices.push(s) });
  assert.deepEqual(notices, []);
  assert.equal(posts.at(-1)?.pairs[0].referenceImageUrl, "https://ours.test/approved.jpg");
  assert.deepEqual(local.assets.character[0].refs, ["/unapproved.jpg"], "比對不得修改專案參考圖");
  console.log("PASS 4 一致性比對使用核准版定裝照，不使用專案後來改過的參考圖");
})().catch((e) => { console.error(e); process.exitCode = 1; });
