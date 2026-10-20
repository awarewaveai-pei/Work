import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { issueForService, ISSUER_TOKENS } from "@/lib/entitlements/issuer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/internal/entitlements/permit/<product> -- Bearer = that product's issuer token (lib/entitlements/issuer.ts). */
export async function POST(request: Request, ctx: { params: Promise<{ product: string }> }): Promise<Response> {
  const { product } = await ctx.params;
  const variable = Object.hasOwn(ISSUER_TOKENS, product) ? ISSUER_TOKENS[product] : undefined;
  const expected = variable ? process.env[variable] : undefined;
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!expected || !bearer || !timingSafeEqual(bearer, expected)) {
    return NextResponse.json({ allowed: false, reason: "unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ allowed: false, reason: "invalid_request" }, { status: 400 }); }
  const { runtimeGateDependencies } = await import("@/lib/entitlements/runtime");
  const answer = await issueForService(product, body, runtimeGateDependencies());
  return NextResponse.json(answer.body, { status: answer.status });
}
