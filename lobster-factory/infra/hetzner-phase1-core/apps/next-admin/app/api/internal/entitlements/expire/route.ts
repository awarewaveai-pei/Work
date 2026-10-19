import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { createEntitlementStore } from "@/lib/entitlements/tables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const expected = process.env.SCHEDULE_INGEST_TOKEN;
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!expected || !bearer || !timingSafeEqual(bearer, expected)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const expired = await createEntitlementStore().expireEntitlements();
    return NextResponse.json({ ok: true, expired });
  } catch (error) {
    console.error("[entitlements-expire] sweep failed", error);
    return NextResponse.json({ ok: false, error: "expiry_failed" }, { status: 500 });
  }
}
