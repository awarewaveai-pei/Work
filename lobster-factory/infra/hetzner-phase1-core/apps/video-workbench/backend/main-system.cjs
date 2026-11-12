// P6 L3: the workbench connected to the main system (next-admin internal routes, plan D3/D5). Active only when
// VW_INTERNAL_BASE and VW_INTERNAL_TOKEN are both set; unset = local mode and nothing here runs.
// Everything sent is what this server recorded itself (job records, its own url -> asset index, nginx identity);
// no field the browser posted is forwarded (origin, rightsSources, parent ids, cost are all rebuilt here).
const fs = require("node:fs"),
  path = require("node:path"),
  { createPublicKey } = require("node:crypto"),
  { Readable } = require("node:stream"),
  { pathToFileURL } = require("node:url");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Same patterns as the jobs route KEY and the assets route vwJobId check.
const KEY = /^[A-Za-z0-9._:-]{1,200}$/, JOB_ID = /^[A-Za-z0-9._:-]{1,128}$/;
// The only types the assets route accepts (its MIME_EXT); anything else (LUT .cube, motion .bvh) is kept local and
// marked skipped.
const MIME = {
  png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif", mp4: "video/mp4", mov: "video/quicktime",
  webm: "video/webm", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", glb: "model/gltf-binary",
};
const REFUSED = { no_entitlement: "此組織尚未開通此功能，無法執行。", no_credits: "點數不足，無法執行此功能。" };
// Paid text/transcription routes -> feature key (next-admin lib/portal/products.ts video features).
const PAID_ROUTES = Object.freeze({
  "/director/script": "video.script", "/director/chat": "video.script", "/director/shots": "video.script",
  "/tools/short/analyze": "video.script", "/tools/music/lyrics": "video.script", "/tools/subtitles/translate": "video.script",
  "/assets/describe": "video.script", "/characters/questions": "video.script", "/characters/draft": "video.script",
  "/products/script": "video.script", "/products/proposals": "video.script", "/transcriptions": "video.transcribe",
  "/editor/agent": "video.script", // card ED.13 剪輯 Agent
});
const LOCAL_URL = /^\/(generated\/[a-f0-9-]+\.[a-z0-9]+|media\/[a-f0-9]{64}\/original\.[a-z0-9]+)$/;

const configured = (env) => !!(String(env.VW_INTERNAL_BASE || "").trim() && String(env.VW_INTERNAL_TOKEN || "").trim());
const localTool = (op) => require("./media.cjs").supported.includes(op);

// Generation jobs that call a paid provider. Local work (ffmpeg tools, Remotion, Blender) needs no permit.
function paidFeature(input, type) {
  const op = input?.operation;
  if (op === "remove-bg") return "video.bg-remove";
  if (op === "image-to-3d") return input.settings?.method === "local-sf3d" ? null : "video.3d"; // card S4b: the local way is free
  if (op === "editor-transcribe") return "video.transcribe"; // card ED.10 整片字幕
  if (require("./video-enhance.cjs").isAi(input)) return "video.enhance"; // card ED.12.3: before localTool (enhance is also a free ffmpeg op)
  if (op === "remotion-template" || op === "blender-retarget" || op === "blender-render" || op === "blender-autorig" || localTool(op)) return null;
  return { image: "video.image", video: "video.motion", audio: "video.tts" }[type] || null;
}

function ledgerKind(job) {
  const op = job.input?.operation;
  if (op === "remove-bg") return "remove-bg";
  if (op === "image-to-3d" || op === "meshy-image-to-3d") return "3d"; // meshy-image-to-3d: jobs recorded before card S4b
  if (op === "editor-transcribe") return "transcribe";
  if (require("./video-enhance.cjs").isAi(job.input)) return "video"; // card ED.12.3: an AI-made video (jobs/route.ts KINDS)
  if (op === "remotion-template" || op === "blender-retarget" || op === "blender-render" || op === "blender-autorig" || op === "engine-render" || localTool(op)) return "render";
  return ["image", "video", "audio"].includes(job.type) ? job.type : "render";
}

// Every local file url anywhere in a job input (references, editor clips, scene sources): the render's sources.
function localUrls(value, out = new Set()) {
  if (typeof value === "string") { if (LOCAL_URL.test(value)) out.add(value); }
  else if (Array.isArray(value)) for (const v of value) localUrls(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) localUrls(v, out);
  return out;
}

// ENTITLEMENT_PUBLIC_KEYS = "kid:PEM;kid2:PEM" -- same layout next-admin lib/entitlements/runtime.ts parses
// (that file pulls in Supabase, so it cannot be imported here).
function publicKeys(raw) {
  const out = Object.create(null);
  for (const entry of String(raw).split(";").map((e) => e.trim()).filter(Boolean)) {
    const at = entry.indexOf(":");
    if (at <= 0) throw Error("entitlement_public_keys_malformed");
    const body = entry.slice(at + 1).replace(/\\n/g, "\n").trim();
    out[entry.slice(0, at)] = createPublicKey(body.includes("BEGIN") ? body : `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`);
  }
  return out;
}

function createMainSystem({ env, fetchImpl, appDir, dataDir, orgId, inspect = require("./media-inspect.cjs") }) {
  if (!configured(env)) return null;
  const base = env.VW_INTERNAL_BASE.trim().replace(/\/+$/, ""),
    token = env.VW_INTERNAL_TOKEN.trim();
  const fail = (message, status) => Object.assign(Error(message), { status });
  const contracts = new Map();
  const contract = (file) => {
    if (!contracts.has(file)) contracts.set(file, import(pathToFileURL(path.join(appDir, file)).href));
    return contracts.get(file);
  };
  const org = () => {
    if (!UUID.test(String(orgId || ""))) throw fail("主系統連線需要組織身分", 403);
    return orgId;
  };
  // url (as this server serves it) -> { assetId, checksumSha256, objectUrl, rightsSources }: what was registered.
  const indexFile = path.join(dataDir, "main-system-assets.json");
  const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, "utf8")) : {};
  const saveIndex = () => {
    fs.writeFileSync(indexFile + ".tmp", JSON.stringify(index));
    fs.renameSync(indexFile + ".tmp", indexFile);
  };
  async function answer(r) {
    let value = {};
    try { value = await r.json(); } catch {}
    return value && typeof value === "object" ? value : {};
  }

  // Rights of one asset: an AI result or an upload names itself; a render inherits its sources' entries.
  async function rightsFor(url, origin, sources) {
    if (origin.kind === "render") {
      const seen = new Set(), out = [];
      for (const src of sources) {
        for (const entry of index[src]?.rightsSources || [{ kind: "unknown", url: src }]) {
          const id = JSON.stringify(entry);
          if (!seen.has(id) && out.length < 200) { seen.add(id); out.push(entry); }
        }
      }
      return out;
    }
    const own = origin.kind === "ai_generated"
      ? { kind: "ai_generated", model: String(origin.model || ""), provider: String(origin.provider || "") }
      : { kind: "upload", rightsConfirmed: origin.rightsConfirmed === true };
    const { rightsSourcesFromOrigins } = await contract("lib/content/video/asset-origin.ts");
    return rightsSourcesFromOrigins([url], { [url]: own });
  }

  // Invariant: every video sent to the ledger carries the technical QA the release gate reads (assets route ->
  // persistAutomaticTechnicalQa: technical_qa + signal_qa per output), measured here by ffprobe/ebur128 on the exact file
  // sent. An unreadable or silent file is recorded as failed/warned, never left out.
  async function renderEvidence(url, file, size) {
    const v = await inspect.verifyOutput(file, {}), info = v.info || {};
    let loud = { integratedLufs: null, truePeakDb: null };
    if (info.audio) loud = await inspect.loudnessStats(file).catch(() => loud);
    const technical = {
      status: v.ok ? "passed" : "failed", detector: "video-workbench.verifyOutput",
      findings: (v.findings || []).slice(0, 20).map((f) => ({ code: f.code, message: String(f.message).slice(0, 300) })),
      duration: info.duration ?? null, videoCodec: info.probe?.videoCodec ?? null, frameRate: info.probe?.frameRate ?? null,
    };
    const signal = !info.audio
      ? { status: v.ok ? "passed" : "failed", audio: false }
      : { status: loud.integratedLufs === null ? "failed" : loud.integratedLufs > -70 ? "passed" : "warned", audio: true, ...loud };
    return { outputs: { master: url }, outputMeta: { master: { width: info.displayWidth ?? 0, height: info.displayHeight ?? 0, byteSize: size, technical_qa: technical, signal_qa: signal } } };
  }

  // POST /api/internal/video/workbench/assets: body = the file bytes (streamed), metadata in X-VW-* headers.
  async function ingest({ url, file, origin, sources = [], costUsd, jobId, ratio }) {
    // An upload registered unconfirmed that is now sent confirmed goes through again (next-admin upgrades the row).
    const sentUnconfirmed = (index[url]?.rightsSources || []).length > 0 && index[url].rightsSources.every((e) => e.kind === "upload" && e.url === url) && index[url].rightsSources.some((e) => e.rightsConfirmed !== true);
    if (index[url] && !(origin?.kind === "upload" && origin.rightsConfirmed === true && sentUnconfirmed)) return { ...index[url], existing: true };
    const ext = path.extname(file || "").slice(1).toLowerCase(), mime = MIME[ext];
    if (!mime) return { skipped: "unsupported_type" };
    const domain = { ai_generated: "ai_generated", render: "workbench_render", upload: "real_footage", import: "real_footage" }[origin?.kind];
    if (!domain) throw fail("資產來源不明，無法登記到主系統", 502);
    const srcs = [...sources].filter((s) => s !== url);
    const meta = { rightsSources: await rightsFor(url, origin, srcs) };
    const parents = [...new Set(srcs.map((s) => index[s]?.assetId).filter((id) => UUID.test(String(id || ""))))].slice(0, 100);
    if (parents.length) meta.parentAssetIds = parents;
    if (Number.isFinite(costUsd) && costUsd >= 0) meta.costUsd = costUsd;
    if (JOB_ID.test(String(jobId || ""))) meta.vwJobId = jobId;
    const size = fs.statSync(file).size;
    // Invariant: a render's delivery ratio is recorded from the job's settings ("16:9" -> "16x9"), never parsed from a file name later.
    // Deliverability comes from the main system's own list (delivery-ratios.cjs); an undeliverable ratio (1:1) is simply not recorded.
    if (domain === "workbench_render" && typeof ratio === "string") {
      const fit = (await require("./delivery-ratios.cjs").deliveryRatios([ratio])).ratios[ratio];
      if (fit?.deliverable) meta.ratio = fit.key;
    }
    if (mime.startsWith("video/")) meta.render = await renderEvidence(url, file, size);
    let r;
    try {
      r = await fetchImpl(base + "/api/internal/video/workbench/assets", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token, "Content-Type": mime, "Content-Length": String(size),
          "X-VW-Org-Id": org(), "X-VW-Origin": domain,
          "X-VW-Meta": Buffer.from(JSON.stringify(meta), "utf8").toString("base64url"),
        },
        body: Readable.toWeb(fs.createReadStream(file)),
        duplex: "half",
        signal: AbortSignal.timeout(300000),
      });
    } catch (e) {
      if (e.status) throw e;
      throw fail("主系統資產登記失敗：無法連線", 502);
    }
    const value = await answer(r);
    if (!r.ok || value.ok !== true || !UUID.test(String(value.assetId || "")))
      throw fail("主系統資產登記失敗：" + String(value.error || r.status), 502);
    index[url] = { assetId: value.assetId, checksumSha256: value.checksumSha256, objectUrl: value.objectUrl, rightsSources: meta.rightsSources };
    saveIndex();
    return { ...index[url], existing: value.existing === true };
  }

  // POST /api/internal/video/workbench/assets/release-text: the words of a finished render (backend/release-text.cjs).
  // Idempotent on next-admin's side, so a resend after a lost answer is safe.
  async function releaseText({ assetId, checksumSha256, text }) {
    let r;
    try {
      r = await fetchImpl(base + "/api/internal/video/workbench/assets/release-text", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: org(), assetId, checksumSha256, title: text.title, script: text.script, captions: text.captions }),
        signal: AbortSignal.timeout(60000),
      });
    } catch (e) {
      if (e.status) throw e;
      throw fail("主系統送審文字登記失敗：無法連線", 502);
    }
    const value = await answer(r);
    if (!r.ok || value.ok !== true) throw fail("主系統送審文字登記失敗：" + String(value.error || r.status), 502);
  }

  // POST /api/internal/video/workbench/jobs {action:"upsert"}: one call per state change, in order per job.
  const chains = new Map();
  function jobBody(job) {
    const cost = job.result?.origin?.costUsd;
    return {
      action: "upsert", organizationId: org(),
      idempotencyKey: KEY.test(String(job.idempotencyKey || "")) ? job.idempotencyKey : "vw:" + job.id,
      kind: ledgerKind(job), status: job.status,
      ...(UUID.test(String(job.createdBy || "")) ? { createdBy: job.createdBy } : {}),
      ...(UUID.test(String(job.result?.assetId || "")) ? { resultAssetId: job.result.assetId } : {}),
      ...(Number.isFinite(cost) && cost >= 0 ? { costUsd: cost } : {}),
      ...(job.error ? { error: String(job.error) } : {}),
      attempt: Number.isInteger(job.attempt) && job.attempt >= 1 ? Math.min(job.attempt, 100) : 1,
      input: { vwJobId: job.id, type: job.type, ...(job.input?.operation ? { operation: job.input.operation } : {}), ...(job.retryOf ? { retryOf: job.retryOf } : {}) },
    };
  }
  function mirror(job, onError) {
    const prev = chains.get(job.id) || Promise.resolve();
    const next = prev.then(async () => {
      const r = await fetchImpl(base + "/api/internal/video/workbench/jobs", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify(jobBody(job)),
        signal: AbortSignal.timeout(30000),
      });
      const value = await answer(r);
      if (!r.ok || value.ok !== true) throw Error("任務帳冊同步失敗：" + String(value.error || r.status));
    }).then(() => onError?.(null), (e) => onError?.(e));
    chains.set(job.id, next);
    next.finally(() => { if (chains.get(job.id) === next) chains.delete(job.id); });
    return next;
  }

  // D5: a permit from the issuer, verified here with ENTITLEMENT_PUBLIC_KEYS; cached until 30 s before it expires.
  const permits = new Map();
  async function permit(identity, feature) {
    const issuer = String(env.ENTITLEMENT_ISSUER_TOKEN_VIDEO || "").trim();
    if (!issuer || !env.ENTITLEMENT_PUBLIC_KEYS) throw fail("付費功能尚未設定使用許可，暫停使用。", 503);
    const tenant = identity?.billingOrgId, user = identity?.userId;
    if (!UUID.test(String(tenant || "")) || !user) throw fail("需要登入的組織身分才能使用付費功能", 403);
    const actor = "video:" + user, cacheKey = [tenant, feature, actor].join("|"), now = Math.floor(Date.now() / 1000);
    const cached = permits.get(cacheKey);
    if (cached && cached.expires_at - 30 > now) return cached;
    let r;
    try {
      r = await fetchImpl(base + "/api/internal/entitlements/permit/video", {
        method: "POST",
        headers: { Authorization: "Bearer " + issuer, "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: tenant, feature_key: feature, actor }),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw fail("使用許可服務無法連線，暫停付費功能。", 503);
    }
    const value = await answer(r);
    // 200 = the gate said no; 400/404 = the issuer refused this request (feature outside the product, child org).
    if (value.allowed === false && [200, 400, 404].includes(r.status))
      throw fail(REFUSED[value.reason] || "無法取得使用許可（" + String(value.reason || "unknown") + "）", 403);
    if (!r.ok || value.allowed !== true || typeof value.permit !== "string")
      throw fail("使用許可服務異常（" + String(value.reason || r.status) + "），暫停付費功能。", 503);
    let payload;
    try {
      const { verifyPermit } = await contract("lib/entitlements/permit.ts");
      payload = verifyPermit(value.permit, publicKeys(env.ENTITLEMENT_PUBLIC_KEYS), { tenant, product_key: "video", feature_key: feature, actor, on_behalf_of: tenant }, now);
    } catch (e) {
      // The cause goes to the log (it names no secret); the user sees the refusal only.
      console.error("[vw] permit verification failed:", e?.message || e);
      throw fail("使用許可驗證失敗，暫停付費功能。", 503);
    }
    permits.set(cacheKey, payload);
    return payload;
  }

  // POST /api/internal/video/workbench/usage. Invariant: every paid success has a durable usage record (usage-outbox.json
  // in this org's data dir), retried at startup and on a timer until next-admin acknowledges it; next-admin debits on key
  // video-job:<job_id>, so a resend after a lost answer never charges twice. Jobs and the sync text routes share it.
  const outboxFile = path.join(dataDir, "usage-outbox.json");
  const outbox = fs.existsSync(outboxFile) ? JSON.parse(fs.readFileSync(outboxFile, "utf8")) : [];
  const saveOutbox = () => {
    fs.writeFileSync(outboxFile + ".tmp", JSON.stringify(outbox));
    fs.renameSync(outboxFile + ".tmp", outboxFile);
  };
  async function send(record) {
    const r = await fetchImpl(base + "/api/internal/video/workbench/usage", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(record),
      signal: AbortSignal.timeout(30000),
    });
    const value = await answer(r);
    if (!r.ok || value.ok !== true) throw Error("用量回報失敗：" + String(value.reason || r.status));
  }
  let flushing = null;
  function flush() {
    return (flushing ||= (async () => {
      // Records added while this round runs are tried in it too (no wait for the timer).
      const tried = new Set();
      for (let record; (record = outbox.find((r) => !tried.has(r))); ) {
        tried.add(record);
        try { await send(record); } catch (e) { console.warn("[vw] usage report pending:", record.job_id, e.message); continue; }
        outbox.splice(outbox.indexOf(record), 1);
        saveOutbox();
      }
    })().finally(() => { flushing = null; }));
  }
  function usage({ feature, billingOrgId, userId, jobId, costUsd }) {
    if (!UUID.test(String(billingOrgId || "")) || !userId || !JOB_ID.test(String(jobId || ""))) throw fail("用量回報缺少帳戶或任務", 502);
    if (!Number.isFinite(costUsd) || costUsd < 0) throw fail("用量回報缺少成本", 502);
    if (!outbox.some((r) => r.job_id === jobId)) {
      outbox.push({ organization_id: billingOrgId, feature_key: feature, actor: "video:" + userId, job_id: jobId, cost_usd: costUsd });
      saveOutbox();
    }
    flush();
  }
  if (outbox.length) flush();
  setInterval(flush, Number(env.VW_USAGE_RETRY_MS) > 0 ? Number(env.VW_USAGE_RETRY_MS) : 60000).unref();

  return { ingest, releaseText, mirror, permit, usage, flush, pendingUsage: () => outbox.length, idle: () => Promise.all([...chains.values(), flushing]) };
}

module.exports = { createMainSystem, configured, paidFeature, ledgerKind, localUrls, PAID_ROUTES, MIME, LOCAL_URL };
