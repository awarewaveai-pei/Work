import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { publicBucketBases } from "@/lib/storage/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Plan X3 / U9 (video-unify-plan-20261116 §10 X3): the video workbench reading our own storage.
 * GET  -> { publicBases }: the public bases of our buckets (lib/storage/r2.ts publicBucketBases, the one source); the
 *         workbench's own-storage import takes only URLs under them (backend/url-import.cjs).
 * POST { organizationId, assetIds?, objectUrls? } -> { items: [{ assetId, objectUrl, checksumSha256 }] }: the current
 *         media_assets rows of THAT organization among the ones named (a Story Bible's reference ids, or a reference
 *         URL). A row of another organization is simply not answered.
 * Bearer = VW_INTERNAL_TOKEN; unset = every call 401.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX = 50;

function authorized(req: Request): boolean {
  const expected = process.env.VW_INTERNAL_TOKEN;
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  return !!expected && !!bearer && timingSafeEqual(bearer, expected);
}

export async function GET(req: Request): Promise<Response> {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, publicBases: publicBucketBases() });
}

export async function POST(req: Request): Promise<Response> {
  const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });
  if (!authorized(req)) return fail(401, "unauthorized");
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return fail(400, "invalid_json"); }
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  if (!UUID.test(organizationId)) return fail(400, "organizationId required");
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const assetIds = strings(body.assetIds).filter((id) => UUID.test(id)), objectUrls = strings(body.objectUrls);
  if (assetIds.length + objectUrls.length > MAX) return fail(400, "too_many");
  if (!assetIds.length && !objectUrls.length) return NextResponse.json({ ok: true, items: [] });
  const db = getSupabaseWriteClient(); if (!db) return fail(503, "db_unavailable");
  const rows: { id: string; object_url: string; checksum_sha256: string | null }[] = [];
  for (const [column, values] of [["id", assetIds], ["object_url", objectUrls]] as const) {
    if (!values.length) continue;
    const { data, error } = await db.from("media_assets").select("id, object_url, checksum_sha256")
      .eq("organization_id", organizationId).eq("is_current", true).in(column, [...values]);
    if (error) return fail(502, "asset_lookup_failed");
    rows.push(...(data ?? []));
  }
  const seen = new Set<string>();
  const items = rows.filter((r) => !seen.has(r.id) && seen.add(r.id)).map((r) => ({ assetId: r.id, objectUrl: r.object_url, checksumSha256: r.checksum_sha256 }));
  return NextResponse.json({ ok: true, items });
}
