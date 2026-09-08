/**
 * Remotion render service — Express HTTP wrapper
 * POST /render  → { jobId }
 * GET  /status/:jobId → { status, progress, url?, error? }
 * GET  /health  → { ok: true }
 *
 * API contract: intentionally distinct from Python video-service (/job endpoint).
 * Phase 3 will add a dedicated Remotion client in next-admin/render-client.ts.
 */
import express from "express";
import path from "path";
import os from "os";
import fs from "fs";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { evaluateRendererAuthPolicy } from "./auth-policy";

const app = express();
app.use(express.json({ limit: "4mb" }));

const PORT = parseInt(process.env.REMOTION_PORT ?? "8733", 10);
const HOST = process.env.REMOTION_HOST ?? "0.0.0.0";
const AUTH_TOKEN = process.env.RENDER_AUTH_TOKEN ?? "";
const ALLOW_INSECURE_LOCAL_RENDER = process.env.ALLOW_INSECURE_LOCAL_RENDER === "true";
const R2_API_TOKEN = process.env.R2_API_TOKEN ?? "";
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? "";
const R2_VIDEO_BUCKET = process.env.R2_VIDEO_BUCKET ?? "lobster-videos";
const R2_VIDEO_PUBLIC_BASE = (process.env.R2_VIDEO_PUBLIC_BASE ?? "").replace(/\/$/, "");
const R2_API_BASE_URL = (process.env.R2_API_BASE_URL ?? "https://api.cloudflare.com").replace(/\/$/, "");

const authPolicy = evaluateRendererAuthPolicy({
  token: AUTH_TOKEN,
  host: HOST,
  allowInsecureLocalRender: ALLOW_INSECURE_LOCAL_RENDER,
});
if (authPolicy.ok === false) {
  throw new Error(authPolicy.error);
}
const AUTH_REQUIRED = authPolicy.authRequired;
if (!R2_API_TOKEN || !R2_ACCOUNT_ID || !R2_VIDEO_PUBLIC_BASE) {
  console.warn("[remotion] WARN: R2 credentials incomplete — uploads will fail. Check R2_API_TOKEN / R2_ACCOUNT_ID / R2_VIDEO_PUBLIC_BASE.");
}

// Render limits (DoS prevention).
// 18 000 = 10 min at 30 fps — needed for DynamicSlideshow long videos.
// EU hardware limits actual throughput; callers should keep requests ≤ 3 min on EU.
const MAX_FRAMES = 18000;
const VALID_FPS = new Set([24, 25, 30, 60]);

// ── Composition ID map ────────────────────────────────────────────────────────
const TEMPLATE_MAP: Record<string, string> = {
  "scale-bg-text-slideup": "ScaleBGTextSlideUp",
  "pan-slide-text-left-3scenes": "PanSlideTextLeft3Scenes",
  "circle-mask-text-slideup-reveal": "CircleMaskTextSlideUpReveal",
  "product-review-typewriter": "ProductReviewTypewriter",
  "photo-highlights-slides-zoom": "PhotoHighlightsSlidesZoom",
  // Director Engine — data-driven, variable N scenes.
  // Duration is computed from scenes[] via calculateMetadata; callers do NOT pass durationInFrames.
  "dynamic-slideshow": "DynamicSlideshow",
};

// Templates whose duration is derived from calculateMetadata (scenes[] array).
// For these, the server trusts the composition's own durationInFrames rather than
// clamping to the caller's rawFrames.
const DATA_DRIVEN_TEMPLATES = new Set(["dynamic-slideshow"]);

// ── Job store (in-memory) ─────────────────────────────────────────────────────
interface RenderJob {
  status: "pending" | "rendering" | "done" | "error";
  progress: number;
  url?: string;
  error?: string;
  createdAt: number;
}
const jobs = new Map<string, RenderJob>();

// Clean up jobs older than 2 hours
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, job] of jobs.entries()) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}, 15 * 60 * 1000);

// ── Bundle cache ──────────────────────────────────────────────────────────────
let bundledUrl: string | null = null;
let bundling: Promise<string> | null = null;

async function getBundle(): Promise<string> {
  if (bundledUrl) return bundledUrl;
  if (bundling) return bundling;

  bundling = (async () => {
    console.log("[remotion] bundling compositions…");
    const { bundle } = await import("@remotion/bundler");
    // Entry point must call registerRoot() — see src/index.ts
    const entryPoint = path.resolve(__dirname, "..", "src", "index.ts");
    const outDir = path.resolve(os.tmpdir(), "remotion-bundle");
    const result = await bundle({ entryPoint, outDir });
    console.log("[remotion] bundle ready:", result);
    bundledUrl = result;
    return result;
  })();

  return bundling;
}

// ── R2 upload ─────────────────────────────────────────────────────────────────
async function uploadToR2(filePath: string, r2Key: string): Promise<string> {
  const buf = await fs.promises.readFile(filePath);
  const url = `${R2_API_BASE_URL}/client/v4/accounts/${R2_ACCOUNT_ID}/r2/buckets/${R2_VIDEO_BUCKET}/objects/${r2Key}`;
  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${R2_API_TOKEN}`,
      "Content-Type": "video/mp4",
    },
    body: buf,
  });
  if (!resp.ok) {
    const txt = await resp.text();
    // Log detail server-side only; callers get a generic message
    console.error(`[remotion] R2 upload error ${resp.status}:`, txt.slice(0, 400));
    throw new Error(`R2 upload failed (${resp.status})`);
  }
  return `${R2_VIDEO_PUBLIC_BASE}/${r2Key}`;
}

// ── Constant-time auth token comparison ───────────────────────────────────────
function tokenEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    // Pad shorter to same length before compare to avoid timing leak on length diff
    const len = Math.max(ba.length, bb.length);
    const pa = Buffer.alloc(len);
    const pb = Buffer.alloc(len);
    ba.copy(pa);
    bb.copy(pb);
    return crypto.timingSafeEqual(pa, pb) && ba.length === bb.length;
  } catch {
    return false;
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  if (!AUTH_REQUIRED) return next();
  // Support X-Render-Token header or Authorization: Bearer <token>
  const xToken = (req.headers["x-render-token"] as string | undefined)?.trim() ?? "";
  const authHeader = (req.headers["authorization"] as string | undefined) ?? "";
  const bearerToken = /^Bearer\s+/i.test(authHeader)
    ? authHeader.replace(/^Bearer\s+/i, "").trim()
    : "";
  const provided = xToken || bearerToken;
  if (!tokenEqual(provided, AUTH_TOKEN)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ ok: true, version: "1.0.0" }));

app.post("/render", requireAuth, (req: express.Request, res: express.Response) => {
  const {
    templateId,
    props = {},
    outputFormat = "16x9",
    fps: rawFps = 30,
    durationInFrames: rawFrames,
  } = req.body as {
    templateId?: string;
    props?: Record<string, unknown>;
    outputFormat?: string;
    fps?: number;
    durationInFrames?: number;
  };

  if (!templateId) {
    res.status(400).json({ error: "templateId required" });
    return;
  }
  const compositionId = TEMPLATE_MAP[templateId];
  if (!compositionId) {
    res.status(400).json({
      error: `Unknown templateId: ${templateId}. Known: ${Object.keys(TEMPLATE_MAP).join(", ")}`,
    });
    return;
  }

  // Clamp inputs to safe ranges (DoS prevention).
  const fps = VALID_FPS.has(rawFps) ? rawFps : 30;
  const totalFrames = Math.min(
    rawFrames != null ? Math.max(1, Math.round(rawFrames)) : Math.round(fps * 12),
    MAX_FRAMES
  );
  const isDataDriven = DATA_DRIVEN_TEMPLATES.has(templateId);

  // Validate data-driven payloads before touching the renderer.
  // Without this, an oversized scenes[] array (within the 4 MB body limit) could drive
  // calculateMetadata to return millions of frames, bypassing MAX_FRAMES entirely and
  // OOM/hanging the single-process EU renderer for hours.
  if (isDataDriven) {
    const scenes = (props as Record<string, unknown>)["scenes"];
    if (!Array.isArray(scenes) || scenes.length === 0) {
      res.status(400).json({ error: "scenes must be a non-empty array" });
      return;
    }
    if (scenes.length > 60) {
      res.status(400).json({
        error: `scenes exceeds maximum of 60 (got ${scenes.length})`,
      });
      return;
    }
    for (let idx = 0; idx < scenes.length; idx++) {
      const s = scenes[idx] as Record<string, unknown>;
      if (typeof s !== "object" || s === null) {
        res.status(400).json({ error: `scenes[${idx}] must be an object` });
        return;
      }
      const dur = s["durationInSeconds"];
      if (
        typeof dur !== "number" ||
        !Number.isFinite(dur) ||
        dur <= 0 ||
        dur > 60
      ) {
        res.status(400).json({
          error: `scenes[${idx}].durationInSeconds must be a finite number in (0, 60]; got ${String(dur)}`,
        });
        return;
      }
    }
  }

  const jobId = uuidv4();
  const job: RenderJob = { status: "pending", progress: 0, createdAt: Date.now() };
  jobs.set(jobId, job);

  const dims: Record<string, [number, number]> = {
    "16x9": [1920, 1080],
    "9x16": [1080, 1920],
    "4x5": [1080, 1350],
    "1x1": [1080, 1080],
  };
  const [width, height] = dims[outputFormat] ?? [1920, 1080];

  void (async () => {
    const outFile = path.join(os.tmpdir(), `remotion-${jobId}.mp4`);
    try {
      job.status = "rendering";
      const serveUrl = await getBundle();

      const { selectComposition, renderMedia } = await import("@remotion/renderer");

      const inputProps: Record<string, unknown> = {
        ...props,
        durationInFrames: totalFrames,
        fps,
        width,
        height,
      };

      const composition = await selectComposition({
        serveUrl,
        id: compositionId,
        inputProps,
        browserExecutable: process.env.REMOTION_CHROME_EXECUTABLE_PATH,
      });

      // Data-driven templates set durationInFrames via calculateMetadata (scenes[] sum).
      // Still clamp to MAX_FRAMES as a backstop — payload validation above is the primary
      // guard; this prevents truncation surprises if a bypass ever reaches here.
      const renderFrames = Math.min(
        isDataDriven ? composition.durationInFrames : totalFrames,
        MAX_FRAMES
      );
      await renderMedia({
        composition: { ...composition, durationInFrames: renderFrames, fps, width, height },
        serveUrl,
        codec: "h264",
        outputLocation: outFile,
        inputProps,
        browserExecutable: process.env.REMOTION_CHROME_EXECUTABLE_PATH,
        concurrency: 1,
        chromiumOptions: {
          headless: true,
          gl: "swangle",
        },
        onProgress: ({ progress }: { progress: number }) => {
          job.progress = Math.round(progress * 100);
        },
      });

      const r2Key = `remotion/${new Date().toISOString().slice(0, 10)}/${jobId}.mp4`;
      const publicUrl = await uploadToR2(outFile, r2Key);

      job.status = "done";
      job.progress = 100;
      job.url = publicUrl;
      console.log(`[remotion] job ${jobId} done → ${publicUrl}`);
    } catch (err) {
      job.status = "error";
      // Log full error server-side; expose only generic message to callers
      console.error(`[remotion] job ${jobId} error:`, err);
      job.error = "Render failed — check server logs";
    } finally {
      // Always clean up temp file on both success and error
      try { fs.unlinkSync(outFile); } catch { /* ignore if not created */ }
    }
  })();

  res.json({ jobId });
});

app.get("/status/:jobId", requireAuth, (req: express.Request, res: express.Response) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json({
    status: job.status,
    progress: job.progress,
    url: job.url,
    error: job.error,
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, HOST, () => {
  console.log(`[remotion] service listening on ${HOST}:${PORT} auth=${AUTH_REQUIRED ? "required" : "local-development"}`);
  getBundle().catch((err) =>
    console.error("[remotion] pre-warm bundle error:", err)
  );
});
