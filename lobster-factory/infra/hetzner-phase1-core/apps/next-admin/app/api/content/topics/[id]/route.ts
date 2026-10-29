// PATCH /api/content/topics/[id]  { version, action: "approve"|"reject"|"reopen"|"retry"|"redo"|"formats"|"schedule", formats?,
//                                   month?, day?, hour? }  (schedule: Taipei month YYYY-MM, day, hour 0-23)
// The person's moves on a topic (lib/content/topics/store.ts NEXT): approve/reject a proposal, reopen a rejected or
// approved one, retry a failed one, send a reviewed one back to be made again (redo: its drafts go to the trash), change its formats while nothing is made yet, or move its time (store.ts canReschedule). `version` is the one the page
// showed; a stale page gets 409 and reloads.
import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { canAccessOrg } from "@/lib/tenant-guard";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { redoTopic } from "@/lib/content/topics/redo";
import { requestActor } from "@/lib/entitlements/subject";
import { daysIn, fromTaipei, isMonth, move, reschedule, setFormats, topicById, TopicMoveRefused, TOPIC_FORMATS, type TopicFormat, type TopicStatus } from "@/lib/content/topics/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TARGET: Record<string, TopicStatus> = { approve: "approved", reject: "rejected", reopen: "proposed", retry: "approved" };

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });
  const { id } = await params;
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }
  const action = typeof b.action === "string" ? b.action : "";
  const version = Number(b.version);
  if (!(action in TARGET || action === "formats" || action === "schedule" || action === "redo") || !Number.isInteger(version)) {
    return NextResponse.json({ ok: false, error: "action and version required" }, { status: 400 });
  }
  let at = "";
  if (action === "schedule") {
    const month = typeof b.month === "string" ? b.month : "";
    const day = Number(b.day), hour = Number(b.hour);
    if (!isMonth(month) || !Number.isInteger(day) || day < 1 || day > daysIn(month) || !Number.isInteger(hour) || hour < 0 || hour > 23) {
      return NextResponse.json({ ok: false, error: "month (YYYY-MM), day and hour (0-23) required" }, { status: 400 });
    }
    at = fromTaipei(month, day, hour);
  }
  const sb = getSupabaseWriteClient();
  if (!sb) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  try {
    const t = await topicById(sb, id);
    if (!t || !canAccessOrg(req, t.organization_id)) return NextResponse.json({ ok: false, error: "topic not found" }, { status: 404 });
    if (t.version !== version) return NextResponse.json({ ok: false, error: "changed elsewhere; reload", topic: t }, { status: 409 });
    const moved = action === "redo" ? await redoTopic(sb, t, requestActor(req)) : action === "schedule" ? await reschedule(sb, t, at) : action === "formats"
      ? await setFormats(sb, t, Array.isArray(b.formats) ? b.formats.filter((f): f is TopicFormat => (TOPIC_FORMATS as readonly string[]).includes(f as string)) : [])
      : await move(sb, t, TARGET[action], action === "retry" || action === "approve" ? { last_error: null } : {});
    if (!moved) return NextResponse.json({ ok: false, error: "changed elsewhere; reload" }, { status: 409 });
    return NextResponse.json({ ok: true, topic: moved });
  } catch (e) {
    if (e instanceof TopicMoveRefused) return NextResponse.json({ ok: false, error: e.message }, { status: 409 });
    console.error("[content/topics] change failed:", e);
    return NextResponse.json({ ok: false, error: "topic could not be changed" }, { status: 500 });
  }
}
