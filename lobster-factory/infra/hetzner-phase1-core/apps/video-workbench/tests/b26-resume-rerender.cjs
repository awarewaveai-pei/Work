// B26: 從這裡繼續 after a stop (review/drafts) renders again first when a shot picture was swapped since the cut was made,
// and goes straight on (drafts) when none was. Pure: EpisodeSpine.autoRunNext / cutOutdated. Old stops carry no new field.
const assert = require("node:assert/strict");
const S = require("../shared/episode-spine.js");

const project = { id: "p1", title: "豆花店" };
const OLD = "/generated/00000001-0000-4000-8000-000000000000.png", NEW = "/generated/00000002-0000-4000-8000-000000000000.png";
const episode = (image, attempt) => ({
  id: "e1",
  shots: [{ id: "s1", text: "店門口", line: "第一句", image }],
  autoRun: S.normalizeAutoRun({ runId: "r1", attempt, until: "drafts", budgetTwd: 100, fill: "ai", ratios: ["16:9"], tts: null, embedSiteId: null, prices: { perPictureTwd: 2, perRatioTwd: 5 }, status: "running", spentTwd: 5 }),
});
// the render job of attempt 0, made from OLD
const renderJob = { id: "j1", status: "succeeded", createdAt: "2026-11-19T00:00:01Z", result: { url: "/cut.mp4" },
  input: { operation: "quick-render", runId: "r1", runAttempt: 0, settings: { ratio: "16:9" }, link: { target: "output", from: [{ slot: "shot:s1", key: OLD }] } } };

// resumed (attempt 1), picture swapped -> render again, at the limit's price
let next = S.autoRunNext(project, episode(NEW, 1), [renderJob], []);
assert.equal(next.do, "render");
assert.deepEqual(next.ratios, ["16:9"]);
assert.equal(next.costTwd, 5);
// resumed, picture unchanged -> straight on to the drafts step (old stops behave the same: no new field is read)
assert.equal(S.autoRunNext(project, episode(OLD, 1), [renderJob], []).do, "drafts");
// the swap happened within the attempt that rendered (attempt 0 = same attempt): never rendered twice
assert.equal(S.autoRunNext(project, episode(NEW, 0), [renderJob], []).do, "drafts");
// the render after the swap (attempt 1, made from NEW) is the sent one: no third render
const again = { ...renderJob, id: "j2", createdAt: "2026-11-19T00:00:02Z", input: { ...renderJob.input, runAttempt: 1, link: { target: "output", from: [{ slot: "shot:s1", key: NEW }] } } };
assert.equal(S.autoRunNext(project, episode(NEW, 1), [renderJob, again], []).do, "drafts");
// over the limit: the re-render stops at the cap like any render, never silently
const e = episode(NEW, 1);
e.autoRun.budgetTwd = 7;
assert.equal(S.autoRunNext(project, e, [renderJob], []).do, "stop");

// stop panel: the newest cut's step remembers the pictures it was made from
const settled = (image) => ({ ...episode(image, 1), steps: [{ id: "j1", jobId: "j1", from: [{ slot: "shot:s1", key: OLD }] }], outputs: [{ url: "/cut.mp4", jobId: "j1", derivedFrom: null }] });
assert.equal(S.cutOutdated(settled(NEW)), true);
assert.equal(S.cutOutdated(settled(OLD)), false);
assert.equal(S.cutOutdated({ shots: [], outputs: [{ url: "/c.mp4", jobId: "x", derivedFrom: null }] }), false, "no step = never claims a re-render");
console.log("PASS B26 resume renders again only when a shot picture was swapped");
