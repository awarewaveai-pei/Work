// POST /api/content/topics/[id]/publish  { version }  -- 「發布」 (N6): a reviewed topic goes out now through the same
// steps auto publish runs (tick.ts continuePublishing -> make.ts publishDrafts -> publish-steps.ts: YouTube, then the
// article, then the other posts), also on a site set to human review. Who pressed it and when go on the topic
// (artifacts.publish.requestedBy/At); publishDrafts reads them as the press. Staff operator and up, or a member who is
// the brand's owner/editor (social authz WRITE_ROLES); a client's read-only account and a staff viewer get 403. The move
// is guarded by the version the page showed: two presses publish once. A step left waiting (YouTube's link) or cut off by
// a restart is continued every 5 minutes, whether or not the brand's content_pipeline schedule is on (K31).
import { after, NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { canAccessOrg } from "@/lib/tenant-guard";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { requestActor } from "@/lib/entitlements/subject";
import { BrandAccessError, requireBrandRole, WRITE_ROLES } from "@/lib/social/authz";
import { topicById } from "@/lib/content/topics/store";
import { continuePublishing, requestPublish } from "@/lib/content/topics/tick";
import { topicDeps } from "@/lib/content/topics/make";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });
  const { id } = await params;
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }
  const version = Number(b.version);
  if (!Number.isInteger(version)) return NextResponse.json({ ok: false, error: "version required" }, { status: 400 });
  const sb = getSupabaseWriteClient();
  if (!sb) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  try {
    const t = await topicById(sb, id);
    if (!t || !canAccessOrg(req, t.organization_id)) return NextResponse.json({ ok: false, error: "topic not found" }, { status: 404 });
    await requireBrandRole(req, t.organization_id, WRITE_ROLES);
    if (t.version !== version) return NextResponse.json({ ok: false, error: "changed elsewhere; reload", topic: t }, { status: 409 });
    if (t.status !== "reviewed") return NextResponse.json({ ok: false, error: `只有已審核的題目能發布（現在是 ${t.status}）` }, { status: 409 });
    const actor = requestActor(req);
    // capTwd: publishing pays for nothing (no AI call); the cap is read only by making
    const deps = topicDeps(sb, t.organization_id, actor, { capTwd: null });
    const moved = await requestPublish(deps, t, actor);
    if (!moved) return NextResponse.json({ ok: false, error: "changed elsewhere; reload" }, { status: 409 });
    after(() => continuePublishing(deps, moved, true).then((r) => console.info(`[content/topics/publish] ${moved.id} ${r} by ${actor}`),
      (e) => console.error(`[content/topics/publish] ${moved.id} not recorded:`, e)));
    return NextResponse.json({ ok: true, topic: moved });
  } catch (e) {
    if (e instanceof BrandAccessError) return NextResponse.json({ ok: false, error: e.message }, { status: 403 });
    console.error("[content/topics/publish] failed:", e);
    return NextResponse.json({ ok: false, error: "topic could not be published" }, { status: 500 });
  }
}
