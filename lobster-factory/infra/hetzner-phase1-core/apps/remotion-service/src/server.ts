/**
 * Remotion render service — process entry: config, bundle, R2 upload, wiring.
 * Routes: src/app.ts. Job table (survives restarts): src/job-store.ts.
 * Each render runs in its own process: src/render-runner.ts + src/render-worker.ts.
 *
 * API contract: intentionally distinct from Python video-service (/job endpoint).
 */
import path from "path";
import os from "os";
import fs from "fs";
import { evaluateRendererAuthPolicy } from "./auth-policy";
import { createApp } from "./app";
import { JobStore } from "./job-store";
import { RenderRunner, type OutputKind } from "./render-runner";
import { allowParallelEncoding, cgroupCpuLimit, cgroupMemoryLimit } from "./resource-limits";

const PORT = parseInt(process.env.REMOTION_PORT ?? "8733", 10);
const HOST = process.env.REMOTION_HOST ?? "0.0.0.0";
const AUTH_TOKEN = process.env.RENDER_AUTH_TOKEN ?? "";
const ALLOW_INSECURE_LOCAL_RENDER = process.env.ALLOW_INSECURE_LOCAL_RENDER === "true";
const R2_API_TOKEN = process.env.R2_API_TOKEN ?? "";
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? "";
const R2_VIDEO_BUCKET = process.env.R2_VIDEO_BUCKET ?? "lobster-videos";
const R2_VIDEO_PUBLIC_BASE = (process.env.R2_VIDEO_PUBLIC_BASE ?? "").replace(/\/$/, "");
const R2_API_BASE_URL = (process.env.R2_API_BASE_URL ?? "https://api.cloudflare.com").replace(/\/$/, "");
// Job table file. Default is inside the container's writable layer: survives a process or
// container restart, not a container re-create (callers then get 404 and treat it as failed).
const JOB_DIR = process.env.REMOTION_JOB_DIR ?? path.resolve(__dirname, "..", "data");
// Wall-clock cap per render; a stuck Chromium must still end as a failed job. 10 min = the
// shortest caller wait (video-workbench backend/remotion.cjs POLL_LIMIT_MS); a 6 s 1080p title
// renders in ~40 s at 2 CPUs, so 10 min only cuts real hangs.
const RENDER_TIMEOUT_MS = Math.max(1, Number(process.env.REMOTION_RENDER_TIMEOUT_MINUTES ?? "10")) * 60_000;
const UPLOAD_TIMEOUT_MS = 120_000;

const authPolicy = evaluateRendererAuthPolicy({
  token: AUTH_TOKEN,
  host: HOST,
  allowInsecureLocalRender: ALLOW_INSECURE_LOCAL_RENDER,
});
if (authPolicy.ok === false) {
  throw new Error(authPolicy.error);
}
if (!R2_API_TOKEN || !R2_ACCOUNT_ID || !R2_VIDEO_PUBLIC_BASE) {
  console.warn("[remotion] WARN: R2 credentials incomplete — uploads will fail. Check R2_API_TOKEN / R2_ACCOUNT_ID / R2_VIDEO_PUBLIC_BASE.");
}

// ── Bundle cache ──────────────────────────────────────────────────────────────
let bundling: Promise<string> | null = null;

function getBundle(): Promise<string> {
  if (!bundling) {
    bundling = (async () => {
      console.log("[remotion] bundling compositions…");
      const { bundle } = await import("@remotion/bundler");
      // Entry point must call registerRoot() — see src/index.ts
      const entryPoint = path.resolve(__dirname, "..", "src", "index.ts");
      const outDir = path.resolve(os.tmpdir(), "remotion-bundle");
      const result = await bundle({ entryPoint, outDir });
      console.log("[remotion] bundle ready:", result);
      return result;
    })();
    // A failed bundle is retried by the next job instead of failing every job forever.
    bundling.catch(() => { bundling = null; });
  }
  return bundling;
}

// ── R2 upload ─────────────────────────────────────────────────────────────────
async function uploadToR2(filePath: string, jobId: string, kind: OutputKind): Promise<string> {
  const r2Key = `remotion/${new Date().toISOString().slice(0, 10)}/${jobId}.${kind}`;
  const buf = await fs.promises.readFile(filePath);
  const url = `${R2_API_BASE_URL}/client/v4/accounts/${R2_ACCOUNT_ID}/r2/buckets/${R2_VIDEO_BUCKET}/objects/${r2Key}`;
  const resp = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${R2_API_TOKEN}`, "Content-Type": kind === "jpg" ? "image/jpeg" : "video/mp4" },
    body: buf,
    // Without a limit a hung upload would hold the one-at-a-time queue forever.
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    // Log detail server-side only; callers get the status code
    console.error(`[remotion] R2 upload error ${resp.status}:`, txt.slice(0, 400));
    throw new Error(`上傳成品失敗（R2 HTTP ${resp.status}）`);
  }
  return `${R2_VIDEO_PUBLIC_BASE}/${r2Key}`;
}

// ── Wiring ────────────────────────────────────────────────────────────────────
const store = new JobStore(path.join(JOB_DIR, "jobs.json"));
const interrupted = store.load();
if (interrupted) console.warn(`[remotion] ${interrupted} job(s) were cut off by a restart and are now failed`);
setInterval(() => store.prune(2 * 60 * 60 * 1000), 15 * 60 * 1000).unref();

const memoryLimit = cgroupMemoryLimit();
const cpuLimit = cgroupCpuLimit();
console.log(`[remotion] container limits: memory=${memoryLimit ?? "none"} cpus=${cpuLimit ?? "none"}`);

const runner = new RenderRunner({
  store,
  workerPath: path.join(__dirname, "render-worker.js"),
  getServeUrl: getBundle,
  upload: uploadToR2,
  outFile: (jobId, kind) => path.join(os.tmpdir(), `remotion-${jobId}.${kind}`),
  timeoutMs: RENDER_TIMEOUT_MS,
  cancelGraceMs: 15_000,
  encoderThreads: cpuLimit,
  allowParallelEncoding: (w, h) => allowParallelEncoding(w, h, memoryLimit),
});

const app = createApp({ authRequired: authPolicy.authRequired, authToken: AUTH_TOKEN, store, runner });

app.listen(PORT, HOST, () => {
  console.log(`[remotion] service listening on ${HOST}:${PORT} auth=${authPolicy.authRequired ? "required" : "local-development"}`);
  getBundle().catch((err) => console.error("[remotion] pre-warm bundle error:", err));
});
