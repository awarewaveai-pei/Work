// POST /api/content/topics/[id]/start  { version }  -- 「核准並開始」: approve a proposal if needed and start it now,
// whatever its day and whether the brand's content_pipeline schedule is on (plan P4.7, I8: without the schedule only
// this button moves topics). It counts against the brand's daily cap. The making itself (~2 minutes) runs after the
// answer, as the person who pressed it, for the topic's organization; its result lands on the topic row.
import { after, NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { canAccessOrg } from "@/lib/tenant-guard";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { thenRun, withFeature } from "@/lib/entitlements/grant";
import { requestActor } from "@/lib/entitlements/subject";
import { move, topicById } from "@/lib/content/topics/store";
import { DAILY_START_CAP, makeStarted, makesNow } from "@/lib/content/topics/tick";
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

  const t = await topicById(sb, id).catch((e) => { console.error("[content/topics/start] read failed:", e); return undefined; });
  if (t === undefined) return NextResponse.json({ ok: false, error: "topic could not be read" }, { status: 500 });
  if (!t || !canAccessOrg(req, t.organization_id)) return NextResponse.json({ ok: false, error: "topic not found" }, { status: 404 });
  if (t.version !== version) return NextResponse.json({ ok: false, error: "changed elsewhere; reload", topic: t }, { status: 409 });
  if (!["proposed", "approved"].includes(t.status)) return NextResponse.json({ ok: false, error: `a ${t.status} topic cannot be started` }, { status: 409 });
  if (!makesNow(t)) return NextResponse.json({ ok: false, error: "影片題目要等影片階段上線才能製作" }, { status: 409 });

  const run = async (): Promise<Response> => {
    try {
      const deps = topicDeps(sb, t.organization_id, requestActor(req));
      const blocked = await deps.blocker(t);   // before a daily slot is used
      if (blocked) return NextResponse.json({ ok: false, error: blocked }, { status: 409 });
      const approved = t.status === "proposed" ? await move(sb, t, "approved", { last_error: null }) : t;
      if (!approved) return NextResponse.json({ ok: false, error: "changed elsewhere; reload" }, { status: 409 });
      const started = await deps.start(approved, new Date().toISOString().slice(0, 10), DAILY_START_CAP);
      if (!started) return NextResponse.json({ ok: false, error: `今天已經開始 ${DAILY_START_CAP} 題（每天上限），明天再開始`, topic: approved }, { status: 409 });
      after(() => makeStarted(deps, started).then((r) => console.info(`[content/topics/start] ${started.id} ${r}`),
        (e) => console.error(`[content/topics/start] ${started.id} not recorded:`, e)));
      return NextResponse.json({ ok: true, topic: started });
    } catch (e) {
      console.error("[content/topics/start] failed:", e);
      return NextResponse.json({ ok: false, error: "topic could not be started" }, { status: 500 });
    }
  };
  // the paid part it starts: the article when it makes one, otherwise the social rewrite alone (literal keys: the
  // registry test reads them)
  const opts = { org: () => t.organization_id };
  return t.formats.includes("article")
    ? withFeature("content.article", thenRun, opts)(req, run)
    : withFeature("content.syndicate", thenRun, opts)(req, run);
}
