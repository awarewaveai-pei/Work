// Card U4.4: a shot drawn by a main-system scene model (backend/scene-image.cjs). Deploy gate: pure node, no network.
// 1 the buttons come from next-admin's catalog (image-models.js VIDEO_SCENE_MODELS), every row priced;
// 2 the job sends the chosen model; the picture's origin is the one next-admin answered, not the page's;
// 3 an answer naming another model is refused; the workbench never charges it (next-admin bills it).
const assert = require("node:assert/strict"), path = require("node:path");
const sceneImage = require("../backend/scene-image.cjs");
const { paidFeature } = require("../backend/main-system.cjs");
const source = require("../backend/appearance.cjs").resolveSource(path.join(__dirname, ".."), process.env);
const catalog = require(path.join(source, "public/editor-shared/image-models.js"));

(async () => {
  const cap = sceneImage.capability({});
  assert.deepEqual(cap.groups.map((g) => g.group), Object.keys(catalog.VIDEO_SCENE_MODELS));
  assert.deepEqual(cap.groups.flatMap((g) => g.models.map((m) => m.id)), Object.values(catalog.VIDEO_SCENE_MODELS).flat());
  assert.ok(cap.groups.flatMap((g) => g.models).every((m) => Number.isFinite(m.usd) && m.usd > 0 && m.label));
  assert.equal(sceneImage.capability(null).available, false);
  console.log("PASS 1 按鈕清單＝主系統 image-models.js 的影片生圖模型，每顆有單價");

  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(32)]);
  const url = "https://pub.example.r2.dev/designs/2026-11/a.png";
  let sent = null, answer = (body) => ({ ok: true, url, origin: { kind: "ai_generated", model: body.imageModel, provider: "flux" }, costUsd: 0.025 });
  const main = { organizationId: () => "123e4567-e89b-42d3-a456-426614174001", call: async (route, o) => ((sent = { route, body: o.body }), { ok: true, status: 200, value: answer(o.body) }) };
  const fetchImpl = async (u) => (assert.equal(u, url), { ok: true, status: 200, headers: new Map(), arrayBuffer: async () => png });
  const mediaStore = { ingest: async ({ buffer, ext }) => (assert.equal(ext, "png"), assert.equal(buffer.length, png.length), { url: "/media/" + "a".repeat(64) + "/original.png" }) };
  const input = { operation: "project-shot", type: "image", prompt: "清晨廚房", ratio: "9:16", settings: { imageModel: "flux-dev", ratio: "9:16" }, origin: { kind: "upload" } };
  const job = { id: "job-1", input };
  assert.equal(paidFeature(input, "image"), null, "主系統自己計費，工作台不得再收");
  assert.equal(paidFeature({ operation: "project-shot" }, "image"), "video.image", "預設模型照舊由工作台收費");
  const result = await sceneImage.run(job, { main, fetchImpl, mediaStore, signal: new AbortController().signal });
  assert.equal(sent.route, sceneImage.ROUTE);
  assert.deepEqual([sent.body.imageModel, sent.body.ratio, sent.body.prompt], ["flux-dev", "9x16", "清晨廚房"]);
  assert.deepEqual(result.origin, { kind: "ai_generated", model: "flux-dev", provider: "flux", costUsd: 0.025, jobId: "job-1" });
  console.log("PASS 2 任務送出所選模型；畫面的來源＝主系統回的（不是頁面送的）");

  answer = () => ({ ok: true, url, origin: { kind: "ai_generated", model: "flux-schnell", provider: "flux" }, costUsd: 0.003 });
  await assert.rejects(sceneImage.run(job, { main, fetchImpl, mediaStore, signal: new AbortController().signal }), /與所選模型不符/);
  assert.throws(() => sceneImage.request({ ...input, settings: { imageModel: "codex-image" } }, main), /生圖模型無效/);
  assert.throws(() => sceneImage.request({ ...input, ratio: "1:1", settings: { imageModel: "flux-dev" } }, main), /16:9、9:16、4:5/);
  assert.throws(() => sceneImage.request(input, null), /需要連上主系統/);
  assert.throws(() => sceneImage.request({ ...input, references: { images: [{ url: "/generated/a.png" }] } }, main), /不使用參考圖/);
  console.log("PASS 3 回的不是所選模型＝拒；清單外的模型、不支援的比例、帶參考圖、沒連主系統＝送出前就拒");

  // critic H1: a picture next-admin drew and billed is never lost. The answer is handed to onPaid before the download;
  // a failed download fails the job with it kept, and a retry carrying it downloads without asking next-admin again.
  answer = (body) => ({ ok: true, url, origin: { kind: "ai_generated", model: body.imageModel, provider: "flux" }, costUsd: 0.025 });
  let paid = null, calls = 0;
  const counting = { ...main, call: async (...a) => (calls++, main.call(...a)) };
  const broken = async () => ({ ok: false, status: 503, headers: new Map() });
  await assert.rejects(sceneImage.run({ id: "job-2", input }, { main: counting, fetchImpl: broken, mediaStore, signal: new AbortController().signal, onPaid: (p) => (paid = p) }), /不再收費/);
  assert.equal(calls, 1);
  assert.deepEqual([paid.kind, paid.url, paid.origin.model], ["scene-image", url, "flux-dev"]);
  const retry = { id: "job-3", input, finishing: sceneImage.kept({ input, finishing: paid }) };
  const again = await sceneImage.run(retry, { main: counting, fetchImpl, mediaStore, signal: new AbortController().signal });
  assert.equal(calls, 1, "重試要取回已付費的圖，不得再呼叫主系統");
  assert.deepEqual([again.origin.model, again.origin.costUsd, again.origin.jobId], ["flux-dev", 0.025, "job-3"]);
  assert.equal(sceneImage.kept({ input: { ...input, settings: { imageModel: "flux-schnell" } }, finishing: paid }), null, "換了模型就不是同一張");
  console.log("PASS 4 主系統已計費的圖：下載失敗仍保留；重試直接取回、不再呼叫主系統（不重複收費）");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
