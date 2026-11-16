/**
 * HTTP routes. POST /render → { jobId }; GET /status/:jobId → { status, progress, url?, error? };
 * GET /health. Rendering happens in RenderRunner; the job table is JobStore.
 */
import express from "express";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import type { JobStore } from "./job-store";
import type { RenderRunner } from "./render-runner";

// Render limits (DoS prevention).
// 18 000 = 10 min at 30 fps — needed for DynamicSlideshow long videos.
export const MAX_FRAMES = 18000;
const VALID_FPS = new Set([24, 25, 30, 60]);
// Waiting jobs keep their props (up to 4 MB each) in memory; 20 x 4 MB stays well inside 1 GiB.
export const MAX_WAITING = 20;

// ── Composition ID map ────────────────────────────────────────────────────────
export const TEMPLATE_MAP: Record<string, string> = {
  "scale-bg-text-slideup": "ScaleBGTextSlideUp",
  "pan-slide-text-left-3scenes": "PanSlideTextLeft3Scenes",
  "circle-mask-text-slideup-reveal": "CircleMaskTextSlideUpReveal",
  "product-review-typewriter": "ProductReviewTypewriter",
  "photo-highlights-slides-zoom": "PhotoHighlightsSlidesZoom",
  // Director Engine — data-driven, variable N scenes.
  // Duration is computed from scenes[] via calculateMetadata; callers do NOT pass durationInFrames.
  "dynamic-slideshow": "DynamicSlideshow",
};

// Templates whose duration is derived from calculateMetadata (scenes[] array): the worker trusts
// the composition's own durationInFrames rather than clamping to the caller's rawFrames.
const DATA_DRIVEN_TEMPLATES = new Set(["dynamic-slideshow"]);

const DIMS: Record<string, [number, number]> = {
  "16x9": [1920, 1080],
  "9x16": [1080, 1920],
  "4x5": [1080, 1350],
  "1x1": [1080, 1080],
};

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

export interface AppDeps {
  authRequired: boolean;
  authToken: string;
  store: JobStore;
  runner: RenderRunner;
}

export function createApp({ authRequired, authToken, store, runner }: AppDeps): express.Express {
  const app = express();
  app.use(express.json({ limit: "4mb" }));

  function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
    if (!authRequired) return next();
    // Support X-Render-Token header or Authorization: Bearer <token>
    const xToken = (req.headers["x-render-token"] as string | undefined)?.trim() ?? "";
    const authHeader = (req.headers["authorization"] as string | undefined) ?? "";
    const bearerToken = /^Bearer\s+/i.test(authHeader) ? authHeader.replace(/^Bearer\s+/i, "").trim() : "";
    if (!tokenEqual(xToken || bearerToken, authToken)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  }

  app.get("/health", (_req, res) => res.json({ ok: true, version: "1.1.0" }));

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
      res.status(400).json({ error: `Unknown templateId: ${templateId}. Known: ${Object.keys(TEMPLATE_MAP).join(", ")}` });
      return;
    }

    // Clamp inputs to safe ranges (DoS prevention).
    const fps = VALID_FPS.has(rawFps) ? rawFps : 30;
    const totalFrames = Math.min(rawFrames != null ? Math.max(1, Math.round(rawFrames)) : Math.round(fps * 12), MAX_FRAMES);
    const isDataDriven = DATA_DRIVEN_TEMPLATES.has(templateId);

    // Validate data-driven payloads before touching the renderer: an oversized scenes[] array
    // could drive calculateMetadata to millions of frames, bypassing MAX_FRAMES.
    if (isDataDriven) {
      const scenes = (props as Record<string, unknown>)["scenes"];
      if (!Array.isArray(scenes) || scenes.length === 0) {
        res.status(400).json({ error: "scenes must be a non-empty array" });
        return;
      }
      if (scenes.length > 60) {
        res.status(400).json({ error: `scenes exceeds maximum of 60 (got ${scenes.length})` });
        return;
      }
      for (let idx = 0; idx < scenes.length; idx++) {
        const s = scenes[idx] as Record<string, unknown>;
        if (typeof s !== "object" || s === null) {
          res.status(400).json({ error: `scenes[${idx}] must be an object` });
          return;
        }
        const dur = s["durationInSeconds"];
        if (typeof dur !== "number" || !Number.isFinite(dur) || dur <= 0 || dur > 60) {
          res.status(400).json({ error: `scenes[${idx}].durationInSeconds must be a finite number in (0, 60]; got ${String(dur)}` });
          return;
        }
      }
    }

    if (runner.waiting >= MAX_WAITING) {
      res.status(503).json({ error: `渲染佇列已滿（${MAX_WAITING} 筆等待中），請稍後再送` });
      return;
    }
    const [width, height] = DIMS[outputFormat] ?? [1920, 1080];
    const jobId = uuidv4();
    store.create(jobId);
    runner.enqueue(jobId, {
      compositionId,
      inputProps: { ...props, durationInFrames: totalFrames, fps, width, height },
      fps,
      width,
      height,
      totalFrames,
      maxFrames: MAX_FRAMES,
      isDataDriven,
    });
    res.json({ jobId });
  });

  app.get("/status/:jobId", requireAuth, (req: express.Request, res: express.Response) => {
    const job = store.get(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json({ status: job.status, progress: job.progress, url: job.url, error: job.error });
  });

  return app;
}
