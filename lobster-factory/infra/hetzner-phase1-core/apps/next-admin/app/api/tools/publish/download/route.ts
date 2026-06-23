import { NextResponse } from "next/server";
import { isDesignsAsset } from "../../../../../lib/storage/r2";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Same-origin download proxy for My Designs assets (print files / mockups).
 *
 * WHY: the R2 designs bucket is a *cross-origin* public host (pub-…r2.dev), so the HTML5
 * `download` attribute is IGNORED by browsers on a cross-origin <a> — the file just opens in a
 * new tab and the operator has to right-click → Save As (publish UI note, PublishWizard.tsx).
 * Re-streaming the SAME public asset through our OWN origin with `Content-Disposition: attachment`
 * makes every download button a real one-click download.
 *
 * SECURITY: this adds ZERO new exposure — the bucket is already public, so anyone with the URL can
 * already GET the raw bytes; we only add the attachment header. The only proxy risk is SSRF (turning
 * this into an open relay), which `isDesignsAsset` blocks: it is a host-EXACT https allowlist for our
 * designs bucket (r2.ts:56), not a bypassable `startsWith`. No role gate: the asset is public, and
 * gating a browser <a download> navigation on a proxy-injected claims header would only break the
 * download for no security gain.
 */

const MAX_BYTES = 80 * 1024 * 1024; // print PNGs/PDFs can be large; cap to protect the OOM-prone host
const FETCH_TIMEOUT_MS = 45_000;

/** Sanitise a caller-supplied download name → safe ASCII filename (no path traversal, no header injection). */
function safeFilename(raw: string | null, fallbackExt: string): string {
  const base = (raw ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "").replace(/^\.+/, "").slice(0, 120);
  if (cleaned && /\.[A-Za-z0-9]+$/.test(cleaned)) return cleaned;
  const stem = cleaned.replace(/\.+$/, "") || "download";
  return `${stem}.${fallbackExt}`;
}

export async function GET(request: Request) {
  if (process.env.POD_DESIGNS_ENABLED !== "true") {
    return NextResponse.json({ ok: false, error: "pod_designs_disabled" }, { status: 503 });
  }
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  if (!isDesignsAsset(url)) {
    // isDesignsAsset narrows `url` to a non-null string of our exact bucket host.
    return NextResponse.json({ ok: false, error: "url must be a My Designs asset URL" }, { status: 400 });
  }

  // Derive the extension from the asset key (R2 keys end in .png/.pdf/.webp/.jpg).
  const assetExt = (new URL(url).pathname.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const filename = safeFilename(searchParams.get("filename"), assetExt);

  const controller = new AbortController();
  const killer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let upstream: Response;
  try {
    // redirect:"manual" fails closed so a 3xx can't bounce off the allowlisted origin (SSRF guard).
    upstream = await fetch(url, { signal: controller.signal, redirect: "manual" });
  } catch {
    clearTimeout(killer);
    return NextResponse.json(
      { ok: false, error: controller.signal.aborted ? "fetch_timeout" : "fetch_network_error" },
      { status: 502 },
    );
  }
  if (!upstream.ok || !upstream.body) {
    clearTimeout(killer);
    return NextResponse.json({ ok: false, error: `fetch_failed_${upstream.status}` }, { status: 502 });
  }
  const declared = Number(upstream.headers.get("content-length") ?? "0");
  if (declared > MAX_BYTES) {
    clearTimeout(killer);
    return NextResponse.json({ ok: false, error: "asset_too_large" }, { status: 413 });
  }

  // Stream the body straight through (no full-buffer in memory — host is OOM-prone). The upstream
  // body's end clears the abort timer.
  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, max-age=0, no-store",
  });
  if (declared > 0) headers.set("Content-Length", String(declared));
  const stream = upstream.body.pipeThrough(
    new TransformStream({
      flush() {
        clearTimeout(killer);
      },
    }),
  );
  return new NextResponse(stream, { status: 200, headers });
}
