// Plan U5.3 一鍵成片 + U5.4 片頭接成一支 (§9, §12 tests), pure: the runner's next move (EpisodeSpine.autoRunNext) and
// what a quick render job becomes on the way to the main system (backend/quick-render.cjs request).
// - missing pictures are made, a shot that has one never again; reopening the page mid-run sends nothing twice
// - a template intro renders once per (template, fields, pictures, seconds, ratio): a second output reuses it
// - an intro that failed stops the run there (retryable), with no quick render sent
// - until "script" | "video" | "drafts" each stop where they should; the limit stops the run at the step that would pass it
// - a button a person presses never reaches publishing: autonomy is guided or auto_after_render, never full_auto
const assert = require("node:assert/strict");
const spine = require("../shared/episode-spine.js");
const quick = require("../backend/quick-render.cjs");

const TEMPLATES = [{ id: "scale-bg-text-slideup", label: "背景放大＋標題上滑", seconds: { min: 3, def: 5, max: 30 }, fields: [{ key: "imageUrl", type: "image", required: true }, { key: "text", max: 80, required: true }, { key: "logoUrl", type: "image" }] },
  { id: "square-only", label: "只有方形", ratios: ["1:1"], seconds: { min: 3, def: 5, max: 30 }, fields: [] }];
const pic = (n) => "/generated/0000000" + n + "-0000-4000-8000-000000000000.png";
const project = { id: "p1", title: "豆花店" };
const episode = (over = {}) => ({
  id: "e1",
  shots: [{ id: "s1", text: "店門口", line: "第一句", image: pic(1) }, { id: "s2", text: "豆花", line: "第二句" }, { id: "s3", text: "老闆", line: "第三句" }],
  ...over,
});
const run = (over = {}) => spine.normalizeAutoRun({ until: "video", budgetTwd: 100, fill: "ai", ratios: ["16:9"], tts: null, embedSiteId: null, prices: { perPictureTwd: 2, perRatioTwd: 0 }, ...over });
const job = (id, input, status = "running", result) => ({ id, status, input, createdAt: "2026-11-17T00:00:0" + id.length + "Z", ...(result ? { result } : {}) });

// ── shapes: one shape for intro/outro, one for autoRun ──
const projects = [{ id: "p1", episodes: [episode()] }];
assert.equal(spine.setBookends(projects, { projectId: "p1", episodeId: "e1", intro: { kind: "template", templateId: "scale-bg-text-slideup", transition: "crossfade" } }, TEMPLATES), true);
assert.deepEqual(projects[0].episodes[0].intro, { kind: "template", templateId: "scale-bg-text-slideup", fields: {}, references: {}, seconds: 5, transition: "crossfade", transitionSeconds: 0.5 });
assert.equal(spine.setBookends(projects, { projectId: "p1", episodeId: "e1", outro: { kind: "title", fields: { title: "" } } }, TEMPLATES), false, "an empty title card is refused");
assert.equal(spine.setBookends(projects, { projectId: "p1", episodeId: "e1", intro: { kind: "none" } }, TEMPLATES), true);
assert.equal("intro" in projects[0].episodes[0], false, "kind none removes it");
assert.equal(spine.normalizeAutoRun({ until: "publish", budgetTwd: 1, fill: "ai", ratios: ["16:9"], prices: { perPictureTwd: 1, perRatioTwd: 1 } }), null);
// a child's stale whole-list write keeps the top page's copy of the spine fields
const kept = spine.keepSpine([{ id: "p1", episodes: [{ id: "e1", intro: { kind: "title" }, autoRun: run() }] }], [{ id: "p1", episodes: [{ id: "e1" }] }]);
assert.ok(kept[0].episodes[0].intro && kept[0].episodes[0].autoRun);

// ── 1. missing pictures, made once; reopening the page sends nothing again ──
let e = episode({ autoRun: run() });
let next = spine.autoRunNext(project, e, [], TEMPLATES);
assert.deepEqual(next, { do: "fill", shotIds: ["s2", "s3"], costTwd: 4 }, "the shot that has a picture is not made again");
const fills = [job("f2", { link: { episodeId: "e1", target: "shot:s2" } }), job("f3", { link: { episodeId: "e1", target: "shot:s3" } })];
e.autoRun.jobIds = ["f2", "f3"];
e.autoRun.spentTwd = 4;
assert.deepEqual(spine.autoRunNext(project, e, fills, TEMPLATES), { do: "wait" }, "page reopened while the pictures are made: wait, send nothing");
fills[0].status = "failed";
fills[0].error = { message: "供應商錯誤" };
assert.equal(spine.autoRunNext(project, e, fills, TEMPLATES).do, "stop", "a picture that failed stops the run");
fills[0].status = "succeeded";
e.shots[1].image = pic(2);
e.shots[2].image = pic(3);

// ── 2. template intro: rendered once, reused ──
e.intro = spine.normalizeBookend({ kind: "template", templateId: "scale-bg-text-slideup", transition: "crossfade" }, TEMPLATES);
next = spine.autoRunNext(project, e, fills, TEMPLATES);
assert.equal(next.do, "bookend");
assert.deepEqual(next.input.settings, { templateId: "scale-bg-text-slideup", fields: { text: "豆花店" }, seconds: 5, ratio: "16:9", fps: 30 });
assert.deepEqual(next.input.references, { imageUrl: { url: pic(1) } }, "empty fields come from the episode");
const introUrl = "/generated/11111111-1111-4111-8111-111111111111.mp4";
const earlier = job("old-intro", next.input, "succeeded", { url: introUrl, assetId: "a-intro" }); // made in an earlier run
next = spine.autoRunNext(project, e, [...fills, earlier], TEMPLATES);
assert.equal(next.do, "render", "the same intro already exists: no second template job");
assert.deepEqual(next.bookends, { "16:9": { transition: "crossfade", transitionSeconds: 0.5, intro: { kind: "template", url: introUrl } } });
const renderBookends = next.bookends;
// failed intro: stop there, nothing rendered
const failedIntro = job("bad-intro", { ...earlier.input }, "failed");
failedIntro.error = { message: "片頭模板渲染失敗：逾時" };
next = spine.autoRunNext(project, e, [...fills, failedIntro], TEMPLATES);
assert.deepEqual(next, { do: "stop", step: "intro", reason: "片頭失敗：片頭模板渲染失敗：逾時" });
// a template that cannot make the chosen ratio is caught before anything is sent
assert.match(spine.bookendJob(project, { ...e, intro: { kind: "template", templateId: "square-only", seconds: 5 } }, "intro", "16:9", TEMPLATES).problem, /不支援 16:9/);

// ── 3. the render, its stop point, and the limit ──
const jobs = spine.quickRenderJobs(project, e, { ratios: ["16:9"], until: "video", bookends: renderBookends });
assert.equal(jobs[0].settings.until, "video");
const main = { assetOf: (u) => ({ [pic(1)]: "a1", [pic(2)]: "a2", [pic(3)]: "a3", [introUrl]: "a-intro" })[u] || null, organizationId: () => "org" };
const sent = quick.request({ ...jobs[0], link: { projectId: "p1" } }, main, () => 1);
assert.equal(sent.autonomy, "guided");
assert.deepEqual([sent.intro, sent.transition, sent.transitionSeconds], [{ kind: "template", assetId: "a-intro" }, "crossfade", 0.5]);
e.autoRun.jobIds.push("r1");
assert.deepEqual(spine.autoRunNext(project, e, [...fills, earlier, job("r1", jobs[0])], TEMPLATES), { do: "wait" }, "送出還不是完成，也不能重送");
assert.deepEqual(spine.autoRunNext(project, e, [...fills, earlier, job("r1", jobs[0], "succeeded")], TEMPLATES), { do: "done" });
const forgotten = episode({ shots: readyShots(), autoRun: run() });
function readyShots() { return [{ id: "s1", text: "圖", line: "旁白", image: pic(1) }]; }
const accepted = job("accepted", { ...spine.quickRenderJobs(project, forgotten, { ratios: ["16:9"] })[0], runId: forgotten.autoRun.runId });
assert.deepEqual(spine.autoRunNext(project, forgotten, [accepted], TEMPLATES), { do: "wait" }, "回應遺失、jobIds 還沒寫入，也能由 runId 找回已接受任務");
accepted.status = "failed";
assert.equal(spine.autoRunNext(project, forgotten, [accepted], TEMPLATES).do, "stop", "已送任務之後失敗，仍顯示停點");
accepted.status = "succeeded";
forgotten.autoRun.until = "drafts";
assert.deepEqual(spine.autoRunNext(project, forgotten, [accepted], TEMPLATES), { do: "drafts" }, "出片成功後仍要等草稿");
assert.equal(spine.autoRunNext(project, episode({ autoRun: run({ until: "script" }) }), [], TEMPLATES).do, "done", "until script: nothing to make here");
const poor = spine.autoRunNext(project, episode({ autoRun: run({ budgetTwd: 3 }) }), [], TEMPLATES);
assert.equal(poor.do, "stop");
assert.equal(poor.step, "fill");
assert.match(poor.reason, /已到上限 NT\$3/);
const poorRender = spine.autoRunNext(project, episode({ shots: [{ id: "s1", line: "一", image: pic(1) }], autoRun: run({ budgetTwd: 5, prices: { perPictureTwd: 2, perRatioTwd: 6 } }) }), [], TEMPLATES);
assert.deepEqual([poorRender.do, poorRender.step], ["stop", "render"], "the render that would pass the limit is not sent");

// ── 4. never publish: every setting a person can pick ends at the cut or at drafts ──
const ready = episode({ shots: [{ id: "s1", line: "一", image: pic(1) }] });
for (const until of ["video", "drafts"])
  for (const embedSiteId of [null, "123e4567-e89b-42d3-a456-426614174008"])
    for (const input of spine.quickRenderJobs(project, ready, { ratios: ["16:9", "9:16", "4:5"], until, embedSiteId })) {
      const body = quick.request({ ...input, settings: { ...input.settings, autoBudget: { runId: "test-run", budgetTwd: 100, spentTwd: 0 } }, link: { projectId: "p1" } }, main, () => 1);
      assert.ok(["guided", "auto_after_render"].includes(body.autonomy), until + " -> " + body.autonomy);
      assert.equal(body.autonomy, until === "drafts" ? "auto_after_render" : "guided");
    }
for (const until of ["full_auto", "publish", "script"])
  assert.throws(() => quick.request({ settings: { ...spine.quickRenderJobs(project, ready, { ratios: ["16:9"] })[0].settings, until }, link: { projectId: "p1" } }, main, () => 1), /做到哪裡停/, until);
assert.throws(() => quick.request({ settings: { ...spine.quickRenderJobs(project, ready, { ratios: ["16:9"] })[0].settings, embedSiteId: "123e4567-e89b-42d3-a456-426614174008" }, link: { projectId: "p1" } }, main, () => 1), /草稿/);
console.log("u5-one-click ok");
