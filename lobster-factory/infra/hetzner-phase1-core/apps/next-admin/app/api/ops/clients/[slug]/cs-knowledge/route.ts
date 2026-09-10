// GET/POST/DELETE /api/ops/clients/[slug]/cs-knowledge — manage a client's RAG knowledge sources.
// GET    — list sources (+ per-source chunk counts).
// POST   — add one document: { title, kind?, body, isSensitive? } → ingestKnowledge (chunk + embed
//          + store). Needs OPENAI_API_KEY for embeddings; on failure returns a clear message.
// DELETE — { sourceId } → remove source (chunks cascade).
// Writes gated by canWriteTenantConfig (owner/admin). Reads open to the internal ops console.

import { NextResponse } from "next/server";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { ingestKnowledge, listKnowledgeSources, deleteKnowledgeSource } from "@/lib/kb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KINDS = ["doc", "faq", "sop", "conversation", "url"];

async function orgIdOf(slug: string): Promise<string | null> {
  const sb = getSupabaseWriteClient();
  if (!sb) return null;
  const { data, error } = await sb.from("organizations").select("id").eq("slug", slug).single();
  return error || !data ? null : (data.id as string);
}

function audit(orgId: string, role: string, source: string, event: string, payload: Record<string, unknown>) {
  void getSupabaseWriteClient()?.from("ops_audit_events").insert({
    organization_id: orgId, actor_role: role, event_type: event,
    target_type: "organizations", target_id: orgId, trace_id: crypto.randomUUID(),
    payload: { ...payload, role_source: source },
  });
}

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  resolveOpsRole(request); // internal console — viewer+ may read
  const { slug } = await context.params;
  const orgId = await orgIdOf(slug);
  if (!orgId) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });
  const sources = await listKnowledgeSources(orgId);
  return NextResponse.json({ ok: true, sources });
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const resolved = resolveOpsRole(request);
  if (!canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  const { slug } = await context.params;
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }

  const title = (typeof body.title === "string" ? body.title.trim() : "").slice(0, 300);
  const docBody = typeof body.body === "string" ? body.body.trim() : "";
  const kind = KINDS.includes(body.kind as string) ? (body.kind as "doc" | "faq" | "sop" | "conversation" | "url") : "doc";
  const isSensitive = body.isSensitive === true;
  if (!title || docBody.length < 10) return NextResponse.json({ ok: false, error: "title_and_body_required" }, { status: 400 });
  // Cap body to bound embedding cost + stay under OpenAI's per-request token/input ceiling.
  if (docBody.length > 100000) return NextResponse.json({ ok: false, error: "body_too_long", hint: "內容過長（上限 10 萬字），請拆成多筆" }, { status: 400 });

  const orgId = await orgIdOf(slug);
  if (!orgId) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });

  try {
    const result = await ingestKnowledge({ organizationId: orgId, kind, title, body: docBody, isSensitive });
    if (!result.sourceId) return NextResponse.json({ ok: false, error: "ingest_failed" }, { status: 503 });
    audit(orgId, resolved.role, resolved.source, "cs_knowledge_added", { title, kind, chunks: result.chunks });
    return NextResponse.json({ ok: true, sourceId: result.sourceId, chunks: result.chunks });
  } catch (e) {
    const msg = String(e);
    const hint = msg.includes("OPENAI_API_KEY") ? "缺 OPENAI_API_KEY — embeddings 無法產生" : msg.includes("openai_embeddings") ? "OpenAI embeddings 呼叫失敗" : "ingest 失敗";
    return NextResponse.json({ ok: false, error: hint, detail: msg.slice(0, 200) }, { status: 502 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ slug: string }> }) {
  const resolved = resolveOpsRole(request);
  if (!canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  const { slug } = await context.params;
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const sourceId = typeof body.sourceId === "string" ? body.sourceId : "";
  if (!sourceId) return NextResponse.json({ ok: false, error: "sourceId_required" }, { status: 400 });

  const orgId = await orgIdOf(slug);
  if (!orgId) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });

  const ok = await deleteKnowledgeSource(orgId, sourceId);
  if (ok) audit(orgId, resolved.role, resolved.source, "cs_knowledge_deleted", { sourceId });
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: "delete_failed" }, { status: 409 });
}
