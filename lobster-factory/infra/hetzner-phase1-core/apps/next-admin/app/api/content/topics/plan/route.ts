// POST /api/content/topics/plan  { siteId, month: "YYYY-MM" } -- ask AI for the month's topics (one paid call, content.plan;
// lib/content/topics/plan.ts). Topics arrive as 'proposed'; nothing is made until someone approves them.
import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { canAccessOrg } from "@/lib/tenant-guard";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { withFeature } from "@/lib/entitlements/grant";
import type { Grant } from "@/lib/entitlements/can";
import { requestActor } from "@/lib/entitlements/subject";
import { loadSiteBrand } from "@/lib/content/brand-voice-store";
import { planAsker, proposeMonth } from "@/lib/content/topics/plan";
import { isMonth } from "@/lib/content/topics/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One Opus call writing ~28 topics; under Cloudflare's 100s cut.
export const maxDuration = 90;

export const POST = withFeature("content.plan", handlePost);
async function handlePost(req: Request, grant: Grant): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }
  const siteId = typeof b.siteId === "string" ? b.siteId.trim() : "";
  const month = typeof b.month === "string" ? b.month.trim() : "";
  if (!siteId || !isMonth(month)) return NextResponse.json({ ok: false, error: "siteId and month (YYYY-MM) required" }, { status: 400 });
  const sb = getSupabaseWriteClient();
  if (!sb) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  try {
    const site = await loadSiteBrand(sb, siteId);
    if (!site?.organizationId || !canAccessOrg(req, site.organizationId)) return NextResponse.json({ ok: false, error: "site not found" }, { status: 404 });
    const topics = await proposeMonth(sb, { organizationId: site.organizationId, siteId, month, actor: requestActor(req) },
      planAsker(grant, "/api/content/topics/plan", role));
    return NextResponse.json({ ok: true, added: topics.length, topics });
  } catch (e) {
    console.error("[content/topics/plan] failed:", e);
    const msg = String(e);
    const known = /content_plan:(unreadable_answer|no_topics_in_answer|output_truncated|model_refused)/.exec(msg)?.[1];
    return NextResponse.json({ ok: false, error: known ? `AI 的回答不能用（${known}），請再試一次` : "plan could not be made" }, { status: known ? 502 : 500 });
  }
}
