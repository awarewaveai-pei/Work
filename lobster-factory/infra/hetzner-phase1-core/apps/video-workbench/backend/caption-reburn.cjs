// Plan U7: the 字幕 tool's 重燒字幕 for a main-system video made by the old render service (it kept a caption-less copy of
// every ratio: metadata.cleanUrl). Runs as the job operation "caption-reburn" through /generations, a vendor like
// remotion.cjs: submit, poll, done. The vendor = next-admin POST /api/internal/video/workbench/caption-reburn (the same
// code as its staff route); the main system rewrites the video row (new bytes, new captions, QA again), so the job's
// result is a note and the asset id -- nothing local is made. Free: our own render service.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROUTE = "/api/internal/video/workbench/caption-reburn",
  POLL_MS = 4000,
  POLL_LIMIT_MS = 10 * 60 * 1000;
const { fail, refusal, tryCall, poll } = require("./main-route-vendor.cjs");

// settings { assetId, cues: [{ start, end, text }] in seconds } -> the route's body (whole ms). Checked before the job is
// accepted; main = backend/main-system.cjs (null in local mode: refused, nothing to burn onto).
function request(input, main) {
  if (!main) throw fail("重燒字幕需要連上主系統", 503);
  const s = input?.settings || {};
  if (!UUID.test(String(s.assetId || ""))) throw fail("請先選一支主系統的成片", 400);
  const cues = Array.isArray(s.cues) ? s.cues : [];
  if (!cues.length || cues.length > 2000) throw fail("字幕需要 1 到 2000 行", 400);
  return {
    assetId: s.assetId,
    cues: cues.map((c, i) => {
      const startMs = Math.round(Number(c?.start) * 1000), endMs = Math.round(Number(c?.end) * 1000), text = String(c?.text ?? "").trim();
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs <= startMs) throw fail("第 " + (i + 1) + " 行字幕的時間無效", 400);
      if (!text || text.length > 500) throw fail("第 " + (i + 1) + " 行字幕要有 1 到 500 字", 400);
      return { startMs, endMs, text };
    }),
  };
}

// Submits one render-service job per ratio, then polls each until done. Answers { assetId, ratios }.
async function run(input, { main, signal, onRemoteJobs = () => {} }) {
  const { assetId, cues } = request(input, main), organizationId = main.organizationId();
  const submitted = await main.call(ROUTE, { method: "POST", body: { organizationId, assetId, cues }, signal, timeoutMs: 60000 });
  if (!submitted.ok || submitted.value.ok !== true || !Array.isArray(submitted.value.jobs) || !submitted.value.jobs.length) throw refusal("主系統拒絕重燒字幕", submitted);
  const jobs = submitted.value.jobs;
  onRemoteJobs(jobs);
  const pending = new Set(jobs.map((j) => j.jobId));
  await poll({
    signal, everyMs: POLL_MS, limitMs: POLL_LIMIT_MS, timeout: "重燒字幕逾時（超過 10 分鐘）",
    step: async () => {
      for (const job of jobs) {
        if (!pending.has(job.jobId)) continue;
        const r = await tryCall(main, ROUTE, { method: "POST", body: { organizationId, assetId: job.assetId, jobId: job.jobId }, signal, timeoutMs: 120000 });
        if (!r) continue; // transient network error: poll again
        if (!r.ok || r.value.ok !== true || r.value.status === "error") throw refusal("重燒字幕失敗", r);
        if (r.value.status === "done") pending.delete(job.jobId);
      }
      return !pending.size;
    },
  });
  return { assetId, ratios: jobs.length };
}

module.exports = { request, run };
