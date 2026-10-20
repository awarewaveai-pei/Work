import { NextResponse } from "next/server";
import { featureList } from "@/lib/entitlements/features";
import { requestActor, resolveSubject } from "@/lib/entitlements/subject";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/entitlements/features -- the signed "能用的功能" list for the caller's billing account (lib/entitlements/features.ts). */
export async function GET(req: Request): Promise<Response> {
  try {
    const { runtimeGateDependencies } = await import("@/lib/entitlements/runtime");
    const signed = await featureList(await resolveSubject({ req }), requestActor(req), runtimeGateDependencies());
    return NextResponse.json(signed, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.warn(`[entitlement] feature list failed: ${String(error).slice(0, 200)}`);
    return NextResponse.json({ ok: false, code: "infrastructure_error" }, { status: 503 });
  }
}
