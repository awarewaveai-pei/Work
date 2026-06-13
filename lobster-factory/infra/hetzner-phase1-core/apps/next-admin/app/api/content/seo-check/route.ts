import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { checkRankMath } from "@/lib/seo/rankmath-checker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) {
    return new NextResponse("forbidden", { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const str = (v: unknown, fb = "") => (typeof v === "string" ? v : fb);

  const markdown      = str(body.markdown).trim();
  const focusKeyword  = str(body.focusKeyword).trim();
  const seoTitle      = str(body.seoTitle).trim();
  const metaDescription = str(body.metaDescription).trim();
  const slug          = str(body.slug).trim();
  const siteDomain    = str(body.siteDomain) || undefined;

  if (!markdown)     return new NextResponse("markdown required", { status: 400 });
  if (!focusKeyword) return new NextResponse("focusKeyword required", { status: 400 });

  const report = checkRankMath({ markdown, focusKeyword, seoTitle, metaDescription, slug, siteDomain });

  return NextResponse.json(report);
}
