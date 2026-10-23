// GET /api/tools/tarot/batch/[jobId]/image/[index]
//
// Serves one background-batch card image from this origin. The R2 public bucket sends no CORS header, so the studio
// could not read those pixels: "下載 ZIP" fetched each R2 URL, every fetch failed, and the zip came out empty
// (2026-10-23). Same-origin bytes also let the studio frame the card and save it to My Designs.
// Only the URL this job recorded for that card is fetched, and only from our designs bucket (isDesignsAsset).

import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { BatchStoreUnavailableError, getJob } from "@/lib/tarot/batch-store";
import { isDesignsAsset } from "@/lib/storage/r2";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ jobId: string; index: string }> },
): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role" }, { status: 403 });
  }
  const { jobId, index } = await params;
  const cardIndex = /^\d{1,3}$/.test(index) ? Number(index) : -1;
  let job;
  try {
    job = await getJob(jobId);
  } catch (e) {
    if (!(e instanceof BatchStoreUnavailableError)) throw e;
    return NextResponse.json({ ok: false, error: "batch_store_unavailable" }, { status: 503 });
  }
  if (!job) return NextResponse.json({ ok: false, error: "job_not_found" }, { status: 404 });
  try { assertOrgAccess(req, job.organizationId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  const card = job.results.find((r) => r.cardIndex === cardIndex);
  if (!card || !isDesignsAsset(card.url)) {
    return NextResponse.json({ ok: false, error: "card_not_found" }, { status: 404 });
  }

  let res: Response;
  try {
    res = await fetch(card.url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  } catch {
    return NextResponse.json({ ok: false, error: "image_fetch_failed" }, { status: 502 });
  }
  if (!res.ok) return NextResponse.json({ ok: false, error: `image_fetch_${res.status}` }, { status: 502 });
  const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ ok: false, error: "not_an_image" }, { status: 502 });
  }
  // The cap is enforced while reading: arrayBuffer() would allocate the whole body before any size check.
  const tooLarge = () => NextResponse.json({ ok: false, error: "image_too_large" }, { status: 502 });
  if (Number(res.headers.get("content-length") ?? "0") > MAX_BYTES || !res.body) return tooLarge();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      return tooLarge();
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { body.set(c, at); at += c.byteLength; }
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=3600" },
  });
}
