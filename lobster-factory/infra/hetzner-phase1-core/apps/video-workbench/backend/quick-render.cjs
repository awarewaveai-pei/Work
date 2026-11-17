// Plan U5 快速輸出: one ratio of an episode rendered by the main system's own render service (the old draft render:
// voice per shot, burned captions, optional title card), run as the job operation "quick-render" through /generations,
// a vendor like remotion.cjs. Vendor = next-admin /api/internal/video/workbench/quick-render: submit, poll, then the
// finished mp4 is downloaded into the media store. The main system registered that video itself, so the local file is
// mapped to its row (main.adopt) and settle() finds it registered: one video, one main-system row.
// What the engine does with a shot (video-service pipeline.py): its length = the narration's voice (a shot needs words;
// the shot's seconds are not used); the picture is scaled and cropped to fill the ratio (no letterbox); a video clip is
// looped silent under the voice. At most 30 shots (RENDER_MAX_SCENES).
const crypto = require("node:crypto");
const { fail, refusal, tryCall, poll, download } = require("./main-route-vendor.cjs");

const ROUTE = "/api/internal/video/workbench/quick-render",
  POLL_MS = 4000,
  // The render service runs one render at a time (video-service server.py _render_lock), so a job may wait behind others:
  // poll as long as its ticket lives (next-admin job-store.ts TTL 1 h); past that the main system no longer knows it.
  POLL_LIMIT_MS = 55 * 60 * 1000,
  MAX_SHOTS = 30,
  MAX_ASSET_BYTES = 200 * 1024 * 1024, // video-service RENDER_MAX_ASSET_MB: a bigger picture or clip fails there
  MAX_DOWNLOAD = 500 * 1024 * 1024; // = the main system's asset intake default
const RATIOS = { "16:9": "16x9", "9:16": "9x16", "4:5": "4x5" };
const VOICE = /^[A-Za-z0-9:._-]{0,64}$/, REF = /^[A-Za-z0-9._:-]{1,200}$/, UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The stop point (plan §12): a quick render a person sends ends at the cut ("video") or at drafts. Nothing else maps:
// full_auto (outward publishing) is the topic queue's alone, so no setting here can reach it (§13 C3).
const AUTONOMY = Object.freeze({ video: "guided", drafts: "auto_after_render" });
const TRANSITIONS = ["none", "crossfade", "fade-black"];

// What keeps an episode's shots from rendering, one line each ([] = it can be sent): the dialog lists them before
// sending (quote) and request() refuses the job on the first. scenes = [{ narration, url }]; sizeOf(url) = bytes | null.
// toBeMade = 一鍵成片 makes the missing pictures first, so a shot without one is not a problem yet.
function problems(scenes, main, sizeOf, toBeMade = false) {
  const shots = Array.isArray(scenes) ? scenes : [];
  if (!shots.length) return ["這一集還沒有鏡頭"];
  const out = shots.length > MAX_SHOTS ? ["快速輸出最多 " + MAX_SHOTS + " 個鏡頭，這一集有 " + shots.length + " 個"] : [];
  shots.forEach((shot, i) => {
    const n = "第 " + (i + 1) + " 個鏡頭", narration = String(shot?.narration ?? "").trim(), url = String(shot?.url || "");
    if (!url) { if (!toBeMade) out.push(n + "沒有畫面"); }
    else if (!main.assetOf(url)) out.push(n + "的畫面還沒登記到主系統，請稍後再試");
    else if (sizeOf(url) > MAX_ASSET_BYTES) out.push(n + "的素材超過 200 MB");
    if (!narration) out.push(n + "沒有旁白（快速輸出的鏡頭長度跟著旁白配音）");
    else if (narration.length > 2000) out.push(n + "的旁白超過 2000 字");
  });
  return out;
}

// settings { ratio, title, scenes: [{ narration, url }], tts?: { provider, voice }, bookends?: { intro?, outro?,
// transition, transitionSeconds }, until?: "video" | "drafts", embedSiteId? } (EpisodeSpine.quickRenderJobs) + input.link
// (the episode it belongs to) -> the route's body. A shot's url and a template bookend's url must be files this workbench
// registered (main.assetOf): the route takes asset ids only. Checked before the job is accepted; main = null refuses.
function bookendPart(v, main, name) {
  if (v == null) return undefined;
  if (v.kind === "template") {
    const assetId = main.assetOf(String(v.url || ""));
    if (!assetId) throw fail(name + "影片還沒登記到主系統，請稍後再試", 400);
    return { kind: "template", assetId };
  }
  const title = String(v.title ?? "").trim(), seconds = Number(v.seconds);
  if (v.kind !== "title" || !title || title.length > 80 || !(seconds > 0 && seconds <= 15)) throw fail(name + "標題卡要有 1 到 80 字、0 到 15 秒", 400);
  return { kind: "title", title, seconds };
}
function request(input, main, sizeOf) {
  if (!main) throw fail("快速輸出需要連上主系統", 503);
  const s = input?.settings || {};
  const sourceRef = String(input?.link?.projectId || "");
  if (!REF.test(sourceRef)) throw fail("快速輸出要從一集送出", 400);
  const ratio = RATIOS[s.ratio];
  if (!ratio) throw fail("快速輸出只支援 16:9、9:16、4:5", 400);
  const title = String(s.title ?? "").trim();
  if (!title || title.length > 180) throw fail("片名要有 1 到 180 字", 400);
  const bad = problems(s.scenes, main, sizeOf);
  if (bad.length) throw fail(bad[0] + (bad.length > 1 ? "（另有 " + (bad.length - 1) + " 個問題）" : ""), 400);
  const scenes = s.scenes.map((shot) => ({ narration: String(shot.narration).trim(), assetId: main.assetOf(String(shot.url)) }));
  const tts = { provider: s.tts?.provider ?? "edge", voice: s.tts?.voice ?? "" };
  if (!["edge", "openai"].includes(tts.provider) || typeof tts.voice !== "string" || !VOICE.test(tts.voice)) throw fail("聲線無效", 400);
  const until = s.until ?? "video";
  if (!Object.hasOwn(AUTONOMY, until)) throw fail("做到哪裡停只能是成片或草稿", 400);
  let ends = {};
  if (s.bookends != null) {
    const b = s.bookends, transition = b.transition ?? "none", transitionSeconds = b.transitionSeconds === undefined ? 0.5 : Number(b.transitionSeconds);
    if (!TRANSITIONS.includes(transition) || (transition !== "none" && !(transitionSeconds >= 0.2 && transitionSeconds <= 2))) throw fail("轉場設定無效", 400);
    const intro = bookendPart(b.intro, main, "片頭"), outro = bookendPart(b.outro, main, "片尾");
    if (intro || outro) ends = { ...(intro ? { intro } : {}), ...(outro ? { outro } : {}), transition, transitionSeconds };
  }
  if (s.embedSiteId != null && (until !== "drafts" || !UUID.test(String(s.embedSiteId)))) throw fail("網站草稿文章只在「做到草稿」時能選", 400);
  const autoBudget = s.autoBudget;
  if (until === "drafts" && (!autoBudget || typeof autoBudget.runId !== "string" || !Number.isFinite(autoBudget.budgetTwd) || !Number.isFinite(autoBudget.spentTwd))) throw fail("一鍵到草稿缺少執行預算", 400);
  return { sourceRef, title, ratio, scenes, tts, ...ends, autonomy: AUTONOMY[until], ...(autoBudget ? { autoBudget } : {}), ...(s.embedSiteId != null ? { embedSiteId: String(s.embedSiteId) } : {}) };
}

// The dialog's numbers: { problems, voices, lines, perRatioUsd, perRatioTwd, fill, totalUsd, totalTwd, sites }, priced by
// the main system (computeVideoCost, /quick-render/quote; plan §13 C4: the whole run, never summed here); this file only
// counts the narration it would speak and the pictures missing. settings { scenes, ratios, tts?, fill?: "ai" |
// "stock-video" | "stock-photo" } -- with fill, a shot without a picture is to be made, not a problem. imageModel = the
// model 一鍵成片 draws missing pictures with (generation-policy.cjs models().image).
async function quote(settings, main, sizeOf, imageModel) {
  if (!main) throw fail("快速輸出需要連上主系統", 503);
  const s = settings || {}, scenes = Array.isArray(s.scenes) ? s.scenes : [];
  const ratios = [...new Set(Array.isArray(s.ratios) ? s.ratios : [])].map((r) => RATIOS[r]);
  if (!ratios.length || ratios.some((r) => !r)) throw fail("請選 16:9、9:16、4:5 其中至少一個比例", 400);
  const chars = scenes.reduce((n, shot) => n + Math.min(2000, String(shot?.narration ?? "").trim().length), 0);
  const r = await main.call(ROUTE + "/quote", {
    method: "POST",
    body: {
      organizationId: main.organizationId(), scenes: Math.min(MAX_SHOTS, Math.max(1, scenes.length)), ttsChars: Math.min(MAX_SHOTS * 2000, chars), ratios, ...(s.tts ? { tts: s.tts } : {}),
      until: s.until || "video", scriptText: scenes.map((x) => String(x?.narration || "")).join("\n"),
      ...(s.fill ? { fill: { mode: s.fill, pictures: Math.min(MAX_SHOTS, scenes.filter((x) => !x?.url).length), imageModel,
        shots: scenes.flatMap((x, i) => x?.url ? [] : [{ id: String(s.shotModels?.[i]?.id || i), imageModel: s.shotModels?.[i]?.imageModel || imageModel }]) } } : {}),
    },
  });
  if (!r.ok || r.value.ok !== true) throw refusal("主系統無法估價", r);
  const { voices, lines, perRatioUsd, perRatioTwd, fill, draftsUsd, totalUsd, totalTwd, sites } = r.value;
  return { problems: problems(scenes, main, sizeOf, !!s.fill), voices, lines, perRatioUsd, perRatioTwd, fill, draftsUsd, totalUsd, totalTwd, sites: sites || [] };
}

// Submits, polls until the main system recorded the video, downloads it into the media store. Answers the job result.
async function run(job, { main, fetchImpl, mediaStore, signal, sizeOf, onRemoteJob = () => {} }) {
  const organizationId = main.organizationId();
  const body = { organizationId, ...request(job.input, main, sizeOf), ...(job.createdBy ? { userId: job.createdBy } : {}) };
  const submitted = await main.call(ROUTE, { method: "POST", body, signal, timeoutMs: 60000 });
  if (!submitted.ok || submitted.value.ok !== true || typeof submitted.value.jobId !== "string") throw refusal("主系統拒絕快速輸出", submitted);
  const remoteJobId = submitted.value.jobId;
  onRemoteJob(remoteJobId);
  let done;
  const query = ROUTE + "?organizationId=" + encodeURIComponent(organizationId) + "&jobId=" + encodeURIComponent(remoteJobId);
  await poll({
    signal, everyMs: POLL_MS, limitMs: POLL_LIMIT_MS, timeout: "快速輸出逾時（超過 55 分鐘）",
    step: async () => {
      const r = await tryCall(main, query, { signal, timeoutMs: 120000 });
      if (!r) return false; // transient network error: poll again
      if (!r.ok || r.value.ok !== true || r.value.status === "error") throw refusal("快速輸出失敗", r);
      if (r.value.status !== "done") return false;
      done = r.value;
      return true;
    },
  });
  if (!/^https:\/\//.test(String(done.url || ""))) throw fail("快速輸出完成，但沒有可下載的網址");
  const buffer = await download(done.url, { fetchImpl, signal, max: MAX_DOWNLOAD, what: "快速輸出成片" });
  const sha = crypto.createHash("sha256").update(buffer).digest("hex");
  if (done.checksumSha256 && done.checksumSha256 !== sha) throw fail("下載的成片與主系統登記的不一致，請重試");
  const stored = await mediaStore.ingest({ buffer, ext: "mp4", signal });
  main.adopt(stored.url, { assetId: done.assetId, checksumSha256: sha, objectUrl: done.url, rightsSources: done.rightsSources });
  return {
    url: stored.url, previewUrl: stored.previewUrl, thumbUrl: stored.thumbUrl,
    origin: { kind: "render", engine: "quick-render", jobId: job.id, remoteJobId, costUsd: 0 },
  };
}

module.exports = { problems, request, quote, run, RATIOS, POLL_LIMIT_MS };
