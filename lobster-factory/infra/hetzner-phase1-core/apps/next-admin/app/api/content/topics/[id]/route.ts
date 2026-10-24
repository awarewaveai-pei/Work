// PATCH /api/content/topics/[id]  { version, action: "approve"|"reject"|"reopen"|"retry"|"formats", formats? }
// The person's moves on a topic (lib/content/topics/store.ts NEXT): approve/reject a proposal, reopen a rejected or
// approved one, retry a failed one, or change its formats while nothing is made yet. `version` is the one the page
// showed; a stale page gets 409 and reloads.
import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { canAccessOrg } from "@/lib/tenant-guard";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { move, setFormats, topicById, TopicMoveRefused, TOPIC_FORMATS, type TopicFormat, type TopicStatus } from "@/lib/content/topics/store";

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
  if (!(action in TARGET || action === "formats") || !Number.isInteger(version)) {
    return NextResponse.json({ ok: false, error: "action and version required" }, { status: 400 });
  }
  const sb = getSupabaseWriteClient();
  if (!sb) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  try {
    const t = await topicById(sb, id);
    if (!t || !canAccessOrg(req, t.organization_id)) return NextResponse.json({ ok: false, error: "topic not found" }, { status: 404 });
    if (t.version !== version) return NextResponse.json({ ok: false, error: "changed elsewhere; reload", topic: t }, { status: 409 });
    const moved = action === "formats"
      ? await setFormats(sb, t, Array.isArray(b.formats) ? b.formats.filter((f): f is TopicFormat => (TOPIC_FORMATS as readonly string[]).includes(f as string)) : [])
      : await move(sb, t, TARGET[action], action === "retry" ? { last_error: null } : {});
    if (!moved) return NextResponse.json({ ok: false, error: "changed elsewhere; reload" }, { status: 409 });
    return NextResponse.json({ ok: true, topic: moved });
  } catch (e) {
    if (e instanceof TopicMoveRefused) return NextResponse.json({ ok: false, error: e.message }, { status: 409 });
    console.error("[content/topics] change failed:", e);
    return NextResponse.json({ ok: false, error: "topic could not be changed" }, { status: 500 });
  }
}
