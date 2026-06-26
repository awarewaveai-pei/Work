/**
 * Same-origin image proxy for My Designs assets.
 *
 * WHY: the edge-mask compositor (`applyEdgeMask`) draws the source image onto a <canvas>
 * and calls `toDataURL()`. A cross-origin R2 image taints the canvas → SecurityError. The
 * gallery's R2 public URLs (pub-*.r2.dev) are a different origin than the app, so masking a
 * gallery image directly would fail unless the R2 bucket sends CORS headers. Streaming the
 * bytes back through this same-origin route makes the <img> same-origin → no taint, with
 * full browser fidelity for the SVG turbulence filters (server-side sharp can't render them).
 *
 * SSRF guard: ONLY the My Designs public base is fetchable (same allowlist posture as the
 * publish/print-file routes). Never fetch an arbitrary client-supplied URL.
 */
import { NextResponse } from "next/server";
import { resolveOpsRole } from "../../../../../lib/ops-role";
import { isDesignsAsset } from "../../../../../lib/storage/r2";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 25_000;
const MIME_OK: Record<string, true> = { "image/png": true, "image/jpeg": true, "image/webp": true };

export async function GET(request: Request) {
  if (process.env.POD_DESIGNS_ENABLED !== "true") {
    return NextResponse.json({ ok: false, error: "pod_designs_disabled" }, { status: 503 });
  }
  // Reads are open to all ops roles (same posture as /api/tools/designs GET). The /api/*
  // auth boundary is the nginx basic-auth layer in front of next-admin on SG.
  resolveOpsRole(request);

  const target = new URL(request.url).searchParams.get("url");
  if (!target) {
    return NextResponse.json({ ok: false, error: "url query param required" }, { status: 400 });
  }
  // Host-exact allowlist (https + exact bucket host + "/" boundary) — same hardened guard the
  // publish/print-file routes use, NOT a bypassable bare startsWith. Mirrors lib/storage/r2.ts.
  if (!isDesignsAsset(target)) {
    return NextResponse.json({ ok: false, error: "url must be a My Designs asset URL" }, { status: 400 });
  }

  const ctrl = new AbortController();
  const killer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    // redirect:"manual" fails closed so a 3xx cannot bounce off the allowlisted origin.
    const res = await fetch(target, { signal: ctrl.signal, redirect: "manual" });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `fetch_failed_${res.status}` }, { status: 502 });
    }
    const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!MIME_OK[mime]) {
      return NextResponse.json({ ok: false, error: `unsupported_mime_${mime || "unknown"}` }, { status: 415 });
    }
    if (Number(res.headers.get("content-length") ?? "0") > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "image_too_large" }, { status: 413 });
    }
    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "image_too_large" }, { status: 413 });
    }
    return new NextResponse(Buffer.from(ab), {
      status: 200,
      headers: { "Content-Type": mime, "Cache-Control": "private, max-age=300" },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: ctrl.signal.aborted ? "fetch_timeout" : "fetch_network_error" },
      { status: 502 },
    );
  } finally {
    clearTimeout(killer);
  }
}
