/**
 * Image process API — the HTTP seam that ties the studio bake pipelines to the UI.
 *
 * Three modes (discriminated union on `mode`):
 *   - web    → toProductImage()  (sRGB WebP for product pages / preview)   [1-c]
 *   - print  → toPrintFile()     (CMYK PDF or sRGB PNG per destination)    [1-d]
 *   - canvas → pass-through      (Fabric.js edits happen client-side; the
 *                                 server just validates + echoes the result)
 *
 * 🔒 SSRF: this route NEVER fetches an arbitrary URL. Input is a base64 data URL
 * (same convention as remove-bg/generate routes) — there is no server-side fetch,
 * so there is no SSRF surface to guard. This intentionally diverges from the plan's
 * literal "fetch image / imageUrl guard" wording in favour of the codebase's safer
 * established pattern (eliminate the fetch rather than guard it).
 *
 * Errors return HTTP 200 + { ok:false } (same nginx error_page rationale as the
 * generate routes: a 5xx body would be replaced by HTML and break the JSON client).
 */
import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../../lib/ops-role";
import { toProductImage, WEB_PRESETS, type WebPreset } from "../../../../../lib/studio/to-product-image";
import {
  toPrintFile,
  PRINT_DESTINATIONS,
  type PrintDestinationId,
} from "../../../../../lib/studio/to-print-file";
import {
  OutputIntentNotDeployedError,
  GsOutputIntentMissingError,
} from "../../../../../lib/studio/ghostscript-pdfx";
import { clampParams, type ColorGradeParams } from "../../../../../lib/studio/color-grade";

export const runtime = "nodejs";
export const maxDuration = 60;

// ~9 MB base64 per image — same ceiling as remove-bg / designs save.
const MAX_IMAGE_CHARS = 12_000_000;
// web/print conversions (sharp, Ghostscript) running at once in this process. Every product door serves this route
// (lib/portal/doors.ts PLATFORM_APIS) and it bills nothing, so CPU is the only cost: past the cap the caller gets 429
// instead of queueing. canvas mode is a pass-through and is not counted.
export const MAX_CONVERSIONS = 2;
let converting = 0;
const DATA_URL_RE = /^data:image\/(png|jpe?g|webp);base64,/;

type Mode = "web" | "print" | "canvas";

interface ProcessBody {
  mode?: unknown;
  image?: unknown;
  preset?: unknown;
  destination?: unknown;
  colorGrade?: unknown;
}

function isWebPreset(v: unknown): v is WebPreset {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(WEB_PRESETS, v);
}
function isPrintDestinationId(v: unknown): v is PrintDestinationId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(PRINT_DESTINATIONS, v);
}

/** Decode a validated base64 data URL into a raw image Buffer. */
function decodeDataUrl(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(",");
  return Buffer.from(dataUrl.slice(comma + 1), "base64");
}

/** Map a DATA_URL_RE subtype capture (png|jpeg|jpg|webp) to mime + file extension. */
function mimeAndExt(subtype: string): { mime: string; ext: string } {
  const norm = subtype === "jpg" ? "jpeg" : subtype; // canonical mime subtype
  return { mime: `image/${norm}`, ext: norm === "jpeg" ? "jpg" : norm };
}

/**
 * Normalise an optional colorGrade payload. TS types are erased at runtime, so this
 * is the API boundary's schema check (color-grade.ts:54 "second line"): anything that
 * is not a plain object → undefined (neutral); a present object is clamped so a hostile
 * field can't push an extreme bake. clampParams + toSharpModulate are the deeper guard.
 */
function normaliseColorGrade(v: unknown): ColorGradeParams | undefined {
  if (v == null) return undefined;
  if (typeof v !== "object" || Array.isArray(v)) return undefined;
  return clampParams(v as ColorGradeParams);
}

function jsonError(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

export async function POST(request: Request) {
  if (process.env.POD_DESIGNS_ENABLED !== "true") {
    return jsonError("pod_designs_disabled", 503);
  }
  const resolved = resolveOpsRole(request);
  if (!canCreateAiImageJob(resolved.role)) {
    return jsonError("forbidden_role", 403, { role: resolved.role });
  }

  let body: ProcessBody;
  try {
    body = (await request.json()) as ProcessBody;
  } catch {
    return jsonError("invalid_json", 400);
  }

  const mode = body.mode as Mode;
  if (mode !== "web" && mode !== "print" && mode !== "canvas") {
    return jsonError("mode must be one of: web | print | canvas", 400);
  }

  // Shared: every mode needs a valid base64 data-URL image. Capture the subtype so
  // canvas pass-through reports the REAL mime (not a hardcoded png lie — critic Major).
  const imageMatch = typeof body.image === "string" ? body.image.match(DATA_URL_RE) : null;
  if (!imageMatch) {
    return jsonError("image must be a png/jpeg/webp base64 data URL", 400);
  }
  const image = body.image as string;
  if (image.length > MAX_IMAGE_CHARS) {
    return jsonError("image too large (~9MB limit)", 413);
  }
  const input = decodeDataUrl(image);
  const colorGrade = normaliseColorGrade(body.colorGrade);

  const heavy = mode !== "canvas";
  if (heavy && converting >= MAX_CONVERSIONS) {
    return jsonError("目前轉檔的圖片較多，請稍後再試。", 429, { code: "busy" });
  }
  if (heavy) converting++;
  try {
    if (mode === "canvas") {
      // Pass-through: editing is client-side (Fabric.js). Echo the validated image
      // back unchanged, with mime/ext derived from the actual input data URL.
      const { mime, ext } = mimeAndExt(imageMatch[1]);
      return NextResponse.json({ ok: true, mode, image, mime, filename: `canvas.${ext}` });
    }

    if (mode === "web") {
      if (!isWebPreset(body.preset)) {
        return jsonError(`preset must be one of: ${Object.keys(WEB_PRESETS).join(" | ")}`, 400);
      }
      const out = await toProductImage(input, body.preset, colorGrade);
      return NextResponse.json({
        ok: true,
        mode,
        image: `data:image/webp;base64,${out.toString("base64")}`,
        mime: "image/webp",
        filename: `${body.preset}.webp`,
      });
    }

    // mode === "print"
    if (!isPrintDestinationId(body.destination)) {
      return jsonError(`destination must be one of: ${Object.keys(PRINT_DESTINATIONS).join(" | ")}`, 400);
    }
    const dest = PRINT_DESTINATIONS[body.destination];
    const { buffer, mime } = await toPrintFile(input, dest, colorGrade);
    const ext = mime === "application/pdf" ? "pdf" : "png";
    return NextResponse.json({
      ok: true,
      mode,
      image: `data:${mime};base64,${buffer.toString("base64")}`,
      mime,
      filename: `print-${dest.id}.${ext}`,
    });
  } catch (err) {
    // Deploy-gated CMYK destinations throw until Ghostscript + ICC are baked in
    // ([0-a-gs]). Surface it as a friendly ok:false, NOT a 500, so the UI can tell
    // the operator to use TGC (sRGB PNG) until print-ICC ships.
    if (err instanceof OutputIntentNotDeployedError) {
      return NextResponse.json({
        ok: false,
        error: "印刷檔 ICC 色彩管理尚未部署 — 目前僅 The Game Crafter（sRGB PNG）可下載；CMYK 印刷檔待 Ghostscript 上線。",
        code: "output_intent_not_deployed",
      });
    }
    if (err instanceof GsOutputIntentMissingError) {
      // Deploy flag is ON but gs produced no /OutputIntent — a server-side config error
      // (bad POD_ICC_* path / gs version). Retrying won't help; surface it distinctly so
      // it's not mistaken for a transient bake failure.
      console.error(`[image/process] OutputIntent missing (print config error):`, err.message);
      return NextResponse.json({
        ok: false,
        error: "印刷檔色彩設定有誤（ICC OutputIntent 未產生）— 請聯繫管理員檢查印刷設定，重試無法解決。",
        code: "output_intent_failed",
      });
    }
    // Log the raw library message server-side only; return a generic code so we don't
    // leak sharp/pdf-lib internals (paths, pixel-limit detail) to the client (critic Minor).
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[image/process] bake failed (mode=${mode}):`, message);
    return NextResponse.json({ ok: false, error: "影像處理失敗，請重試或換一張圖。", code: "bake_failed" });
  } finally {
    if (heavy) converting--;
  }
}
