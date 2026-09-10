import { NextResponse } from "next/server";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { validateOutcomeEvent, type OutcomeEvent } from "@/lib/content/video/outcome-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const expected = process.env.MEDIA_OUTCOME_WEBHOOK_TOKEN;
  const value = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  return Boolean(expected && value && timingSafeEqual(value, expected));
}

/** Receive an append-only metrics snapshot from a platform adapter. */
export async function POST(req: Request): Promise<Response> {
  if (process.env.MEDIA_OUTCOME_WEBHOOK_ENABLED !== "true") return new NextResponse("unauthorized", { status: 401 });
  if (!authorized(req)) return new NextResponse("unauthorized", { status: 401 });

  let input: unknown;
  try { input = await req.json(); } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const validation = validateOutcomeEvent(input);
  if (!validation.ok || !validation.eventId) return NextResponse.json({ ok: false, errors: validation.errors }, { status: 400 });
  const event = input as OutcomeEvent;
  const db = getSupabaseWriteClient();
  if (!db) return new NextResponse("db unavailable", { status: 503 });

  const delivery = await db
    .from("media_delivery_attempts")
    .select("id, organization_id, release_id, status")
    .eq("id", event.deliveryId)
    .eq("release_id", event.releaseId)
    .maybeSingle();
  if (delivery.error) return NextResponse.json({ ok: false, error: delivery.error.message }, { status: 500 });
  if (!delivery.data) return NextResponse.json({ ok: false, error: "delivery_not_found" }, { status: 404 });
  if (!["published", "withdrawn"].includes(delivery.data.status)) {
    return NextResponse.json({ ok: false, error: "delivery_not_published" }, { status: 409 });
  }

  const row = {
    organization_id: delivery.data.organization_id,
    release_id: event.releaseId,
    delivery_attempt_id: event.deliveryId,
    event_id: validation.eventId,
    platform: event.platform,
    external_post_id: event.externalPostId,
    maturity: event.maturity,
    observed_at: event.observedAt,
    metrics: event.metrics,
  };
  const inserted = await db.from("media_outcome_snapshots").upsert(row, { onConflict: "event_id", ignoreDuplicates: true }).select("id, event_id").maybeSingle();
  if (inserted.error) return NextResponse.json({ ok: false, error: inserted.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, eventId: validation.eventId, duplicate: !inserted.data });
}
