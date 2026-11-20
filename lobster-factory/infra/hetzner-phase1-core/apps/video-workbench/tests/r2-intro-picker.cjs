// Card R2: the editor's 片頭 form is one picture-card picker over the shared intro styles (next-admin
// public/editor-shared/intro-styles.js via /capabilities introStyles). Single choice with aria-pressed; the cover opener
// is pressable only when the cut has a cover, and then its picture is that cover; a saved title card shows as chosen.
const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const EpisodeSpine = require("../shared/episode-spine.js"), Timebase = require("../shared/timebase.js");
const remotion = require("../backend/remotion.cjs");

// The list as /capabilities sends it: previews served from the shared folder (server.cjs), automatic flags derived.
assert.deepEqual(remotion.introStyles.map((s) => s.id), ["none", "cover-opener", "title-card", "scale-bg-text-slideup", "circle-mask-text-slideup-reveal", "pan-slide-text-left-3scenes", "product-review-typewriter", "photo-highlights-slides-zoom"]);
for (const s of remotion.introStyles.filter((x) => x.kind !== "none")) {
  assert.equal(s.preview, "/awarewave/editor-shared/intro-styles/" + s.id + ".jpg");
  assert.ok(fs.existsSync(require("node:path").join(require("../backend/appearance.cjs").resolveSource(require("node:path").join(__dirname, ".."), process.env), "public", s.preview.slice("/awarewave/".length))), s.id + " preview file");
}
const opener = remotion.catalog.find((t) => t.id === "cover-opener");
assert.deepEqual(opener.seconds, { min: 2, def: 2, max: 5 });
// the opener's request: the cover as a data: URI, the title, 2 s at the project's fps
const req = remotion.request({ settings: { templateId: "cover-opener", ratio: "9:16", fps: 30, fields: { title: "開場" } }, references: { backgroundUrl: { url: "/generated/c.jpg" } } }, () => "data:image/jpeg;base64,AA");
assert.deepEqual(req.body, { templateId: "cover-opener", props: { backgroundUrl: "data:image/jpeg;base64,AA", title: "開場" }, outputFormat: "9x16", fps: 30, durationInFrames: 60 });

function pane({ intro, jobs }) {
  const p = { id: "edit", ratio: "16:9", timebase: { num: 30, den: 1 }, assets: [], clips: [{ id: "main", track: "V1", startFrame: 0, durationFrames: 60, asset: { url: "/media/x/original.mp4" } }] };
  const ctx = vm.createContext({ Transitions: require("../backend/transitions.cjs").Transitions, console, structuredClone, crypto, EpisodeSpine, Timebase, document: { addEventListener() {} },
    ed: { title: {}, projects: [p], picks: new Set() }, edRegisterPane() {}, tool: "other",
    VideoWorkbench: { assets: { list: async () => [] }, generations: { list: async () => jobs },
      capabilities: { remotion: true, remotionTemplates: remotion.catalog, introStyles: remotion.introStyles } },
    edSpineHit: () => ({ project: { id: "project", title: "感恩節" }, episode: { id: "ep", name: "感恩節的心理學", intro } }),
    edLines: () => [], EditorModel: require("../shared/editor-model.js"), esc: (x) => String(x ?? ""), edButton: () => "", p });
  vm.runInContext(fs.readFileSync(require.resolve("../scripts/editor-panes/text.js"), "utf8"), ctx);
  return { ctx, html: () => vm.runInContext("edTitlePane(p)", ctx) };
}
const pressed = (html) => [...html.matchAll(/data-ed-action="title-template:([\w-]+)" aria-pressed="true"/g)].map((m) => m[1]);
const cardOf = (html, id) => html.match(new RegExp(`<button[^>]*title-template:${id}"[^>]*>`))[0];

(async () => {
  // No cover yet: the opener card is there, not pressable, and says where to make one. No 不加片頭 card in the editor.
  const none = pane({ jobs: [] });
  let html = none.html();
  await new Promise((r) => setTimeout(r, 0));
  html = none.html();
  assert.match(html, /role="group" aria-label="片頭樣式"/);
  assert.doesNotMatch(html, /title-template:none"/);
  assert.match(cardOf(html, "cover-opener"), / disabled/);
  assert.match(html, /先到發布面板產生封面/);
  assert.match(cardOf(html, "title-card"), / disabled/, "a title card cannot be picked where nothing could apply it");
  // a cover made on the release panel meanwhile: found on a later render (re-checked at most every 5 s)
  none.ctx.VideoWorkbench.generations.list = async () => [{ id: "j9", status: "succeeded", createdAt: "2026-11-20", input: { settings: { ratio: "16:9" }, link: { projectId: "project", episodeId: "ep" } }, result: { url: "/media/n/original.mp4", covers: [{ url: "/generated/late.jpg", at: 4 }] } }];
  none.ctx.ed.title.coverAt = 0;
  none.html();
  await new Promise((r) => setTimeout(r, 0));
  assert.doesNotMatch(cardOf(none.html(), "cover-opener"), / disabled/);
  assert.deepEqual(pressed(html), ["scale-bg-text-slideup"], "nothing saved = the old default, single choice");
  assert.match(cardOf(html, "scale-bg-text-slideup"), /class="ed-intro-card selected"/);

  // A finished output of this episode in this ratio with covers: the opener uses its first cover.
  const jobs = [
    { status: "succeeded", createdAt: "2026-11-19", input: { settings: { ratio: "16:9" }, link: { projectId: "project", episodeId: "ep" } }, result: { url: "/media/o/original.mp4", covers: [{ url: "/generated/old.jpg" }] } },
    { status: "succeeded", createdAt: "2026-11-20", input: { settings: { ratio: "9:16" }, link: { projectId: "project", episodeId: "ep" } }, result: { url: "/media/v/original.mp4", covers: [{ url: "/generated/vertical.jpg" }] } },
    { id: "j3", status: "succeeded", createdAt: "2026-11-20", input: { settings: { ratio: "16:9" }, link: { projectId: "project", episodeId: "ep" } }, result: { url: "/media/n/original.mp4", covers: [{ url: "/generated/new.jpg", at: 12.5 }, { url: "/generated/second.jpg", at: 3 }] } },
  ];
  const withCover = pane({ intro: { kind: "template", templateId: "cover-opener", fields: { title: "已存的開場" }, references: { backgroundUrl: { url: "/generated/gone.jpg" } }, seconds: 2, transition: "crossfade", transitionSeconds: 0.5 }, jobs });
  withCover.html();
  await new Promise((r) => setTimeout(r, 0));
  html = withCover.html();
  assert.deepEqual(pressed(html), ["cover-opener"], "a saved opener shows as chosen");
  assert.doesNotMatch(cardOf(html, "cover-opener"), / disabled/);
  assert.match(html, /src="\/generated\/new\.jpg"/);
  assert.equal(withCover.ctx.ed.title.picks.backgroundUrl.url, "/generated/new.jpg", "the newest cover of this ratio, first (default) one");
  assert.deepEqual({ ...withCover.ctx.ed.title.picks.backgroundUrl.cover }, { jobId: "j3", at: 12.5 }, "the server cuts that frame without the title");
  assert.deepEqual({ ...vm.runInContext("edTitleBookend(p)", withCover.ctx).references }, {}, "the titled cover is not saved for 一鍵成片");
  assert.equal(vm.runInContext("edTitleBlocked(p)", withCover.ctx), "");
  assert.equal(withCover.ctx.ed.title.fields.title, "已存的開場");

  // Old data: a saved title card shows as chosen; it is made at output time, so nothing is rendered here.
  const card = pane({ intro: { kind: "title", fields: { title: "標題" }, seconds: 3, transition: "crossfade", transitionSeconds: 0.5 }, jobs: [] });
  html = card.html();
  assert.deepEqual(pressed(html), ["title-card"]);
  assert.doesNotMatch(cardOf(html, "title-card"), / disabled/);
  assert.match(vm.runInContext("edTitleBlocked(p)", card.ctx), /快速輸出、一鍵成片/);

  // The server cuts the cover's frame WITHOUT the title (the stored cover has it) from the job's video, at its time.
  const os = require("node:os"), path = require("node:path"), { spawnSync } = require("node:child_process"), ffmpeg = require("ffmpeg-static");
  const { coverFrame } = require("../backend/cover.cjs"), { run } = require("../backend/media.cjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-r2-frame-")), video = path.join(dir, "v.mp4");
  assert.equal(spawnSync(ffmpeg, ["-y", "-hide_banner", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=10", "-t", "4", "-pix_fmt", "yuv420p", video]).status, 0);
  const frameJobs = [{ id: "j3", result: { url: "/media/n/original.mp4", width: 640, height: 360 } }];
  const opts = { catalog: remotion.catalog, jobs: frameJobs, dir, signal: AbortSignal.timeout(30000) };
  const input = { settings: { templateId: "cover-opener" }, references: { backgroundUrl: { url: "/generated/new.jpg", cover: { jobId: "j3", at: 2 } } } };
  await coverFrame(input, opts, { run, localFile: (u) => (u === "/media/n/original.mp4" ? video : null), cleanCopy: async () => assert.fail("no clean copy here") });
  const cut = input.references.backgroundUrl.url;
  assert.match(cut, /^\/generated\/[0-9a-f-]+\.jpg$/);
  assert.match(spawnSync(ffmpeg, ["-hide_banner", "-i", path.join(dir, cut.slice(11))], { encoding: "utf8" }).stderr, /640x360/);
  // the main system's caption-less copy when it kept one (the cover was cut from it); the copy is removed afterwards
  const cleanFile = path.join(dir, "clean.mp4");
  fs.copyFileSync(video, cleanFile);
  const withClean = { settings: { templateId: "cover-opener" }, references: { backgroundUrl: { url: "/generated/new.jpg", cover: { jobId: "j3", at: 1 } } } };
  await coverFrame(withClean, { ...opts, jobs: [{ id: "j3", result: { ...frameJobs[0].result, cleanUrl: "https://r2.test/clean.mp4" } }] },
    { run, localFile: () => assert.fail("the clean copy is the source"), cleanCopy: async (url) => (assert.equal(url, "https://r2.test/clean.mp4"), cleanFile) });
  assert.ok(!fs.existsSync(cleanFile));
  // other templates and pictures without a named cover are left alone; a cover whose video is gone is refused
  const other = { settings: { templateId: "scale-bg-text-slideup" }, references: { imageUrl: { url: "/generated/a.jpg", cover: { jobId: "j3", at: 1 } } } };
  await coverFrame(other, opts, { run, localFile: () => null, cleanCopy: async () => null });
  assert.equal(other.references.imageUrl.url, "/generated/a.jpg");
  await assert.rejects(coverFrame({ settings: { templateId: "cover-opener" }, references: { backgroundUrl: { url: "/x.jpg", cover: { jobId: "gone", at: 1 } } } }, opts, { run, localFile: () => null, cleanCopy: async () => null }), /重新產生封面/);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log("PASS R2 intro picker: shared styles, one choice, cover opener from the cut's cover (untitled frame), old data");
})().catch((e) => { console.error(e); process.exitCode = 1; });
