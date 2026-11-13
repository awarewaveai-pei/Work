// One rule for every Replicate run a job pays for by its own result (去背 bg-remove.cjs, AI 畫質增強 video-enhance.cjs,
// and the cancel used by image-to-3d.cjs):
//   1. a vendor run is taken over by at most one job, and only from a job that ended without delivering it
//      (failed/cancelled) -- a running job's run is never shared, so one run is charged at most once (api.cjs settle);
//   2. a run this server stops waiting for (timeout, cancel, lost connection, restart) is cancelled at Replicate.
// The handover is claimed synchronously in takeOver(): two jobs sent at once cannot both see the same earlier run.
const API = "https://api.replicate.com/v1";
const RUNNING = ["starting", "processing"];

const wait = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  });

/** Best effort: stops Replicate billing a prediction nobody will collect. */
async function cancelPrediction({ id, env, fetchImpl }) {
  if (!id || !env.REPLICATE_API_TOKEN) return;
  await fetchImpl(API + "/predictions/" + encodeURIComponent(id) + "/cancel", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.REPLICATE_API_TOKEN },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {});
}

/** The prediction id `job` may resume instead of paying again, or undefined. same(j) = j asked for the same work.
 *  The id moves from the earlier job to `job` here, before any await, so no other job can take it. */
function takeOver(jobs, job, same, persist) {
  const earlier = jobs.findLast((j) => j !== job && j.replicateId && ["failed", "cancelled"].includes(j.status) && same(j));
  if (!earlier) return undefined;
  const id = earlier.replicateId;
  delete earlier.replicateId;
  earlier.replicateHandedTo = job.id;
  job.replicateId = id;
  persist();
  return id;
}

/** Resumes `resumeId` only when it succeeded, otherwise create()s a new prediction; polls it to the end.
 *  A handed-over run that has not succeeded was already told to stop by its earlier job (rule 2), so attaching to it
 *  would only wait for "canceled" -- it is never resumed and never billed twice.
 *  Returns the succeeded prediction; throws otherwise. Any throw while polling cancels the run at Replicate.
 *  call(url, init, label) = the caller's fetch with its own signal and error wording; abortError maps a wait abort. */
async function runPrediction({ call, auth, create, resumeId, label, pollMs, signal, env, fetchImpl, onPrediction = () => {}, abortError = (e) => e }) {
  const get = async (id) => (await call(API + "/predictions/" + encodeURIComponent(id), { headers: auth }, label + "狀態查詢")).json();
  let prediction = null;
  if (resumeId) {
    try {
      const earlier = await get(resumeId);
      if (earlier.status === "succeeded") prediction = earlier;
    } catch (e) {
      if (signal?.aborted) throw e;
    }
  }
  if (!prediction) prediction = await create();
  if (typeof prediction.id === "string") onPrediction(prediction.id);
  try {
    while (RUNNING.includes(prediction.status)) {
      await wait(pollMs, signal).catch((e) => { throw abortError(e); });
      prediction = await get(prediction.id);
    }
  } catch (e) {
    await cancelPrediction({ id: prediction.id, env, fetchImpl });
    throw e;
  }
  if (prediction.status !== "succeeded") throw Error(label + "失敗：" + String(prediction.error || prediction.status).slice(0, 200));
  return prediction;
}

/** The first output url, only from Replicate's delivery host over https (the url comes from a provider reply). */
function deliveryUrl(prediction, label) {
  const url = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (typeof url !== "string" || !/^https:\/\/replicate\.delivery\//.test(url)) throw Error(label + "結果網址不在允許範圍");
  return url;
}

module.exports = { API, cancelPrediction, takeOver, runPrediction, deliveryUrl };
