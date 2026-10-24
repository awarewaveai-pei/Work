import { NextResponse } from "next/server";
import { isPublicBucketAsset } from "../../../../../lib/storage/r2";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Same-origin download proxy for our public bucket objects: My Designs (print files, mockups) and videos.
 * Under /api/tools/designs, so every product door serves it (PLATFORM_APIS); was /api/tools/publish/download.
 *
 * WHY: the R2 designs bucket is a *cross-origin* public host (pub-…r2.dev), so the HTML5
 * `download` attribute is IGNORED by browsers on a cross-origin <a> — the file just opens in a
 * new tab and the operator has to right-click → Save As (publish UI note, PublishWizard.tsx).
 * Re-streaming the SAME public asset through our OWN origin with `Content-Disposition: attachment`
 * makes every download button a real one-click download.
 *
 * SECURITY: this adds ZERO new exposure — the bucket is already public, so anyone with the URL can
 * already GET the raw bytes; we only add the attachment header. The only proxy risk is SSRF (turning
 * this into an open relay), which `isPublicBucketAsset` blocks: a host-EXACT https allowlist for our
 * designs and video buckets (lib/storage/r2.ts), not a bypassable `startsWith`. No role gate: the asset is public, and
 * gating a browser <a download> navigation on a proxy-injected claims header would only break the
 * download for no security gain.
 */

// Best-effort cap from the upstream's declared content-length (R2 returns an accurate one). Streaming
// never buffers the whole file in memory, so an under-reported length can't OOM the host — it just
// wouldn't be byte-capped; the host-exact allowlist already bounds WHAT can be proxied.
const MAX_BYTES = 80 * 1024 * 1024;
// Guards time-to-HEADERS only (not the body stream) — cleared the moment the response resolves.
const FETCH_TIMEOUT_MS = 45_000;
// Self-hosted Next does not enforce `maxDuration`: an upstream that sends headers and then stalls would hold the request
// open forever. This bounds each wait for the NEXT upstream chunk while the client is asking for one -- pull() only runs
// when the client drains, so a slow client is never cut (Codex 2026-10-24).
const STALL_TIMEOUT_MS = 30_000;

function withStallTimeout(body: ReadableStream<Uint8Array>, controller: AbortController): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(out) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const stalled = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("upstream_stalled")), STALL_TIMEOUT_MS); });
      try {
        const { done, value } = await Promise.race([reader.read(), stalled]);
        if (done) out.close(); else out.enqueue(value);
      } catch (e) {
        controller.abort();
        out.error(e);
      } finally {
        clearTimeout(timer);
      }
    },
    cancel(reason) {
      controller.abort();
      return reader.cancel(reason);
    },
  });
}

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
  if (!isPublicBucketAsset(url)) {
    // isPublicBucketAsset narrows `url` to a non-null string of one of our exact bucket hosts.
    return NextResponse.json({ ok: false, error: "url must be one of our public bucket objects" }, { status: 400 });
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
  // Headers received → the timeout has done its job (it guards time-to-headers, NOT the body). Clear it
  // NOW so a slow client draining a large print file over an international/mobile link is never aborted
  // mid-stream at 45s (critic 2026-06-23 — the operator travels worldwide). An upstream stall is bounded by
  // withStallTimeout; its cancel() passes a client disconnect to undici so the upstream connection is released.
  clearTimeout(killer);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ ok: false, error: `fetch_failed_${upstream.status}` }, { status: 502 });
  }
  const declared = Number(upstream.headers.get("content-length") ?? "0");
  if (declared > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "asset_too_large" }, { status: 413 });
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, max-age=0, no-store",
  });
  if (declared > 0) headers.set("Content-Length", String(declared));
  return new NextResponse(withStallTimeout(upstream.body, controller), { status: 200, headers });
}
