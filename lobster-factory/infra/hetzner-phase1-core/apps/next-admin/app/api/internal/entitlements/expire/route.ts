import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { createEntitlementStore } from "@/lib/entitlements/tables";
import { expireCreditHolds } from "@/lib/entitlements/ledger";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 0148: holds whose call never settled go back whole. Its own step: a failure above must not keep customers' credits held.
async function releaseHolds(): Promise<number> {
  const db = getSupabaseWriteClient();
  return db ? expireCreditHolds(db) : 0;
}

export async function POST(request: Request): Promise<Response> {
  const expected = process.env.SCHEDULE_INGEST_TOKEN;
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!expected || !bearer || !timingSafeEqual(bearer, expected)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const store = createEntitlementStore();
    const now = new Date();
    const expired = await store.expireEntitlements(now);
    const trialsEnded = await store.endLapsedTrials(now);   // after grants, so grace ends both together
    const allFeatures = await store.ensureAllFeatures();   // a feature added to products.ts is covered from today
    return NextResponse.json({ ok: true, expired, trials_ended: trialsEnded, all_features_added: allFeatures, holds_released: await releaseHolds() });
  } catch (error) {
    console.error("[entitlements-expire] sweep failed", error);
    await releaseHolds().catch((e) => console.error("[entitlements-expire] hold release failed", e));
    return NextResponse.json({ ok: false, error: "expiry_failed" }, { status: 500 });
  }
}
