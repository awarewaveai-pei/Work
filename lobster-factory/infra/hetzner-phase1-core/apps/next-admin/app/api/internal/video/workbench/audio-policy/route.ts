import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { externalAudioAllowed } from "@/lib/content/video/transcription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/internal/video/workbench/audio-policy?organizationId=<uuid> -- plan U7: may this client's sound leave our
 * servers (client_config.audioExternalAiAllowed, lib/content/video/transcription.ts externalAudioAllowed)? Asked by the
 * workbench before every job that sends sound out (video-workbench backend/audio-policy.cjs); any answer other than
 * 200 + a boolean is a refusal there. Bearer = VW_INTERNAL_TOKEN; unset = every call 401.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request): Promise<Response> {
  const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });
  const expected = process.env.VW_INTERNAL_TOKEN;
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!expected || !bearer || !timingSafeEqual(bearer, expected)) return fail(401, "unauthorized");
  const organizationId = new URL(req.url).searchParams.get("organizationId") ?? "";
  if (!UUID.test(organizationId)) return fail(400, "organizationId required");
  const db = getSupabaseWriteClient(); if (!db) return fail(503, "db_unavailable");
  const { data, error } = await db.from("organizations").select("metadata").eq("id", organizationId).maybeSingle();
  if (error) return fail(502, "organization_lookup_failed");
  if (!data) return fail(404, "organization_not_found");
  return NextResponse.json({ ok: true, externalAudioAllowed: externalAudioAllowed(data.metadata) });
}
