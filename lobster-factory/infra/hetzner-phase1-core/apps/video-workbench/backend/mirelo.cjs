// 去配樂・重配音效 way A (backend/audio-tools.cjs sfx row "mirelo"): Mirelo SFX 2.0 on Mirelo's own API (mirelo.ai/api-docs.md,
// read 2026-11-25; not through fal). Flow: POST /v3/assets -> multipart upload to its upload_url (no auth header) ->
// POST /v3/video-to-sfx/generations (sfx-2.0, 1 variant, preserve_speech false + separate_speech true: the sound effects
// alone and the speech alone, no extra cost) -> poll urls.self -> download. The caller mixes the speech back itself, so
// the dialogue is the source's own voice, never re-rendered. Price: next-admin cost-model.ts mireloUsd (the job's reported
// credits when given). Mirelo documents no cancel route: an aborted job stops being polled (results expire in 24 h).
const fs = require("node:fs"), { Readable } = require("node:stream"), { pipeline } = require("node:stream/promises");

const API = "https://api.mirelo.ai/v3", MODEL = "sfx-2.0";
const POLL_INTERVAL_MS = 2_000; // VW_MIRELO_POLL_MS overrides it (tests)
const MAX_OUTPUT_BYTES = 512 * 1024 ** 2;
const FINAL = ["succeeded", "partially_succeeded", "failed", "canceled", "expired"];

const keyOf = (env) => !!String(env?.MIRELO_API_KEY || "").trim();
// 503 = nothing was sent (checked before the job is recorded).
function key(env) {
  const k = String(env?.MIRELO_API_KEY || "").trim();
  if (!k) throw Object.assign(Error("尚未設定 Mirelo 金鑰。"), { status: 503 });
  return k;
}
const wait = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); reject(signal.reason); }, { once: true });
});

// file = an MP4 to send (picture + sound); seconds = its length; dest(type) = where to write "sfx" / "speech" (WAV).
// Answers { sfx, speech (null when Mirelo found no speech), credits (the job's reported credits, or undefined) }.
async function generate({ file, seconds, prompt = "", env, fetchImpl = fetch, signal, dest }) {
  const auth = { Authorization: "Bearer " + key(env) };
  const call = async (url, init, label) => {
    let r;
    try {
      r = await fetchImpl(url, { ...init, signal });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw Error(label + "連線失敗");
    }
    if (!r.ok) {
      const e = (await r.json().catch(() => null))?.error;
      const text = r.status === 402 ? "Mirelo 點數不足，請補點數後再試。" : r.status === 401 ? "Mirelo 拒絕這把金鑰；請檢查 MIRELO_API_KEY。" : r.status === 429 ? "Mirelo 忙線中，請稍後再試。" : label + "失敗：Mirelo " + r.status + (e?.code ? "（" + e.code + "）" : "");
      throw Object.assign(Error(text), { status: r.status, vendorCode: e?.code || null, retryable: e?.retryable === true });
    }
    return r;
  };
  const asset = await (await call(API + "/assets", { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ content_type: "video/mp4" }) }, "上傳影片")).json();
  if (!asset?.id || !asset.upload_url) throw Error("Mirelo 沒有回傳上傳位置");
  if (Number(asset.max_bytes) > 0 && fs.statSync(file).size > Number(asset.max_bytes)) throw Error("影片超過 Mirelo 的上傳上限");
  const form = new FormData();
  for (const [k, v] of Object.entries(asset.fields || {})) form.append(k, String(v));
  form.append("file", new Blob([fs.readFileSync(file)], { type: "video/mp4" }), "source.mp4"); // the file part goes last
  await call(asset.upload_url, { method: "POST", body: form }, "上傳影片");

  const body = JSON.stringify({
    model: MODEL, duration_ms: Math.min(600000, Math.max(1000, Math.round(seconds * 1000))), num_variants: 1,
    input: { video: { type: "asset", id: asset.id }, ...(prompt ? { prompt: String(prompt).slice(0, 2000) } : {}) },
    controls: { preserve_speech: false, separate_speech: true },
    output: { format: "wav" },
  });
  const pollMs = Number(env.VW_MIRELO_POLL_MS) || POLL_INTERVAL_MS;
  let job;
  for (let attempt = 0; ; attempt++) {
    try {
      job = await (await call(API + "/video-to-sfx/generations", { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body }, "音效生成")).json();
      break;
    } catch (e) {
      // The upload is still being processed on their side: retryable, a few times.
      if (e.vendorCode !== "asset_not_ready" || attempt >= 5) throw e;
      await wait(pollMs, signal);
    }
  }
  const self = job?.urls?.self && new URL(job.urls.self, API + "/").href;
  while (!FINAL.includes(job?.status)) {
    if (!self) throw Error("Mirelo 沒有回傳任務位置");
    await wait(pollMs, signal);
    job = await (await call(self, { headers: auth }, "查詢音效生成")).json();
  }
  if (job.status !== "succeeded") throw Error("Mirelo 音效生成" + ({ failed: "失敗", canceled: "已取消", expired: "已逾期", partially_succeeded: "只有部分完成" }[job.status] || "失敗"));
  const outputs = job.result?.outputs || (job.result?.output ? [job.result.output] : []);
  const audioOf = (type) => outputs.find((o) => o?.type === type && o.status !== "failed")?.variants?.[0]?.files?.audio;
  const sfx = audioOf("sfx") || audioOf("mix"), speech = audioOf("speech");
  if (!sfx?.url) throw Error("Mirelo 沒有回傳音效");
  const save = async (audio, to) => {
    if (Number(audio.bytes) > MAX_OUTPUT_BYTES) throw Error("Mirelo 結果過大");
    const r = await call(audio.url, {}, "下載音效");
    if (Number(r.headers?.get?.("content-length")) > MAX_OUTPUT_BYTES) throw Error("Mirelo 結果過大");
    let size = 0;
    const capped = async function* (source) {
      for await (const chunk of source) {
        size += chunk.length;
        if (size > MAX_OUTPUT_BYTES) throw Error("Mirelo 結果過大");
        yield chunk;
      }
    };
    try {
      await pipeline(Readable.fromWeb(r.body), capped, fs.createWriteStream(to), { signal });
    } catch (e) {
      fs.rmSync(to, { force: true });
      throw e;
    }
    return to;
  };
  // The docs show a `credits` field on the job without its shape: a plain number is taken, anything else = the estimate.
  const credits = typeof job.credits === "number" ? job.credits : NaN;
  return { sfx: await save(sfx, dest("sfx")), speech: speech?.url ? await save(speech, dest("speech")) : null, credits: credits > 0 ? credits : undefined, jobId: job.id };
}

module.exports = { API, MODEL, keyOf, key, generate };
