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
import { OutputIntentNotDeployedError } from "../../../../../lib/studio/ghostscript-pdfx";
import { clampParams, type ColorGradeParams } from "../../../../../lib/studio/color-grade";

export const runtime = "nodejs";
export const maxDuration = 60;

// ~9 MB base64 per image — same ceiling as remove-bg / designs save.
const MAX_IMAGE_CHARS = 12_000_000;
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

  // Shared: every mode needs a valid base64 data-URL image.
  if (typeof body.image !== "string" || !DATA_URL_RE.test(body.image)) {
    return jsonError("image must be a png/jpeg/webp base64 data URL", 400);
  }
  if (body.image.length > MAX_IMAGE_CHARS) {
    return jsonError("image too large (~9MB limit)", 413);
  }
  const input = decodeDataUrl(body.image);
  const colorGrade = normaliseColorGrade(body.colorGrade);

  try {
    if (mode === "canvas") {
      // Pass-through: editing is client-side (Fabric.js). Echo the validated image
      // back unchanged so the caller has one consistent contract across modes.
      return NextResponse.json({ ok: true, mode, image: body.image, mime: "image/png", filename: "canvas.png" });
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
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: `image_process_failed: ${message}`, code: "bake_failed" });
  }
}
