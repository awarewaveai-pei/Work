import { NextResponse } from "next/server";
import sharp from "sharp";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { getDesignObjectByUrl, parseImageDataUrl } from "@/lib/storage/r2";
import { compositeOnFabric, isPrintBox, layoutPrint } from "@/lib/studio/fabric-print";

// Prints a design onto a saved plain-garment pose photo in code (lib/studio/fabric-print.ts): no AI call, so no
// credits are charged. Both images come from our own designs bucket (or the design as an upload); nothing is
// fetched from a caller-given host.

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_CHARS = 12_000_000; // ~9 MB base64, same as the other studio routes
const MAX_EDGE = 2048; // larger photos are scaled down first
// The composite runs on the event loop, O(pixels under the print): a full-photo box on 2K is ~4 M px. Above this the
// photo is scaled down so one request stays well under a second (2026-11-01 review measured 8.6 s at 9 M px).
const MAX_PRINT_PIXELS = 1_500_000;
const INPUT_PIXELS = 25_000_000; // decompression-bomb ceiling, same order as lib/studio/wp-web-image.ts

// One composite at a time per process: two parallel ones would still share the single event loop.
let queue: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

async function loadImage(input: unknown): Promise<Buffer | { error: string }> {
  if (typeof input !== "string") return { error: "missing" };
  if (input.startsWith("data:")) {
    if (input.length > MAX_IMAGE_CHARS) return { error: "too_large" };
    const parsed = parseImageDataUrl(input);
    return parsed ? parsed.buffer : { error: "bad_data_url" };
  }
  const r = await getDesignObjectByUrl(input, MAX_BYTES);
  return "error" in r ? { error: r.error } : r.body;
}

export async function POST(request: Request) {
  if (process.env.POD_DESIGNS_ENABLED !== "true") {
    return NextResponse.json({ ok: false, error: "pod_designs_disabled" }, { status: 503 });
  }
  const resolved = resolveOpsRole(request);
  if (!canCreateAiImageJob(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }

  let body: { photo?: unknown; design?: unknown; box?: unknown; designScale?: unknown };
  try { body = (await request.json()) as typeof body; } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!isPrintBox(body.box)) {
    return NextResponse.json({ ok: false, error: "box 須為照片內的 {x,y,w,h}（0–1）" }, { status: 400 });
  }
  // The pose photo is always a saved asset; the design may also be a fresh upload.
  if (typeof body.photo !== "string" || body.photo.startsWith("data:")) {
    return NextResponse.json({ ok: false, error: "photo 須為已存的姿勢照網址" }, { status: 400 });
  }
  const [photoBuf, designBuf] = await Promise.all([loadImage(body.photo), loadImage(body.design)]);
  if ("error" in photoBuf) return NextResponse.json({ ok: false, error: `讀不到姿勢照：${photoBuf.error}` }, { status: 400 });
  if ("error" in designBuf) return NextResponse.json({ ok: false, error: `讀不到設計圖：${designBuf.error}` }, { status: 400 });

  try {
    const box = body.box;
    const scale = typeof body.designScale === "number" && Number.isFinite(body.designScale) ? body.designScale : 1;
    const jpg = await oneAtATime(async () => {
      const opts = { limitInputPixels: INPUT_PIXELS };
      const pMeta = await sharp(photoBuf, opts).rotate().metadata();
      const rotated = (pMeta.orientation ?? 1) >= 5; // EXIF 5-8 swap width and height
      const pw = Math.max(1, (rotated ? pMeta.height : pMeta.width) ?? 1);
      const ph = Math.max(1, (rotated ? pMeta.width : pMeta.height) ?? 1);
      const fit = Math.min(1, MAX_EDGE / Math.max(pw, ph), Math.sqrt(MAX_PRINT_PIXELS / Math.max(1, box.w * pw * box.h * ph)));
      const photo = await sharp(photoBuf, opts).rotate()
        .resize(Math.max(1, Math.round(pw * fit)), Math.max(1, Math.round(ph * fit)), { fit: "fill" })
        .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const dMeta = await sharp(designBuf, opts).rotate().metadata();
      const dRot = (dMeta.orientation ?? 1) >= 5;
      const dw = (dRot ? dMeta.height : dMeta.width) ?? 0;
      const dh = (dRot ? dMeta.width : dMeta.height) ?? 0;
      if (!dw || !dh) throw new Error("design_unreadable");
      const at = layoutPrint(photo.info, { width: dw, height: dh }, box, scale);
      const design = await sharp(designBuf, opts).rotate().resize(at.w, at.h, { fit: "fill" }).ensureAlpha().raw().toBuffer();
      const out = compositeOnFabric(
        { width: photo.info.width, height: photo.info.height, data: photo.data },
        { width: at.w, height: at.h, data: design },
        at,
      );
      return sharp(Buffer.from(out.data.buffer, out.data.byteOffset, out.data.byteLength), {
        raw: { width: out.width, height: out.height, channels: 4 },
      }).removeAlpha().jpeg({ quality: 92 }).toBuffer();
    });
    return NextResponse.json({ ok: true, image: `data:image/jpeg;base64,${jpg.toString("base64")}` });
  } catch (e) {
    console.error("[fabric-print] failed:", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: "合成失敗：圖片無法處理" }, { status: 422 });
  }
}
