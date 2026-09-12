// GET/POST/PATCH/DELETE /api/ops/clients/[slug]/cs-knowledge — manage a client's RAG knowledge sources.
// GET    — list sources (+ per-source chunk counts). ?status=archived lists the archived view instead.
// POST   — add one document: { title, kind?, body, isSensitive?, canonicalUrl? } → ingestKnowledge
//          (chunk + embed + store) as a new VERSION of that document (K1): same title + new text
//          supersedes the old version, same title + same text is a no-op. Needs OPENAI_API_KEY for
//          embeddings; on failure returns a clear message.
// PATCH  — { sourceId, action: "archive" | "restore" } → soft-remove from retrieval / undo that.
//          Genuinely reversible: chunks and the row are untouched, only `status` flips.
//        — { sourceId, action: "rebind", canonicalUrl } → pre-crawl FAQ-duplication fix (operator
//          decision 2026-09-12, option A): point an existing MANUAL document at the real URL the
//          crawler will later fetch, so ingest recognises it as the same document instead of
//          creating a second, contradictory one. Only works on a source with no canonicalUrl yet.
// DELETE — { sourceId } → PERMANENTLY remove source (chunks cascade). Archive and delete are two
//          separate, real actions (operator decision 2026-09-12) — this one does not come back.
// Writes gated by canWriteTenantConfig (owner/admin). Reads open to the internal ops console.

import { NextResponse } from "next/server";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import {
  ingestKnowledge,
  listKnowledgeSources,
  listArchivedKnowledgeSources,
  archiveKnowledgeSource,
  restoreKnowledgeSource,
  rebindManualDocumentUrl,
  deleteKnowledgeSource,
  type RebindError,
} from "@/lib/kb";

const REBIND_ERROR_HINT: Record<RebindError, string> = {
  not_found: "找不到這份文件",
  already_has_url: "這份文件已經有網址了，不是手動上傳的文件",
  url_already_claimed: "這個網址已經被另一份文件使用——可能爬蟲已經抓過了，請改用一般的重新上傳來合併版本",
  write_failed: "寫入失敗，請重試",
  lost_race: "同時間有另一個操作搶先改了這份文件，請重新整理後再試一次",
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KINDS = ["doc", "faq", "sop", "conversation", "url"];

/**
 * canonical_url is indexed, and a btree entry over ~2.7KB fails the insert outright — which would
 * surface as a bare ingest_failed with no clue why. Bound it, and accept only real web URLs.
 */
function canonicalUrlOf(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const url = raw.trim().slice(0, 2048);
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}

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
  const wantsArchived = new URL(request.url).searchParams.get("status") === "archived";
  const sources = wantsArchived ? await listArchivedKnowledgeSources(orgId) : await listKnowledgeSources(orgId);
  return NextResponse.json({ ok: true, sources });
}

export async function PATCH(request: Request, context: { params: Promise<{ slug: string }> }) {
  const resolved = resolveOpsRole(request);
  if (!canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  const { slug } = await context.params;
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const sourceId = typeof body.sourceId === "string" ? body.sourceId : "";
  const action = body.action === "archive" || body.action === "restore" || body.action === "rebind" ? body.action : null;
  if (!sourceId || !action) return NextResponse.json({ ok: false, error: "sourceId_and_action_required" }, { status: 400 });

  const orgId = await orgIdOf(slug);
  if (!orgId) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });

  if (action === "rebind") {
    const url = canonicalUrlOf(body.canonicalUrl);
    if (!url) return NextResponse.json({ ok: false, error: "valid_https_url_required" }, { status: 400 });
    const result = await rebindManualDocumentUrl(orgId, sourceId, url);
    if (result.ok === true) {
      audit(orgId, resolved.role, resolved.source, "cs_knowledge_rebound", { sourceId, canonicalUrl: url });
      return NextResponse.json({ ok: true });
    }
    const err: RebindError = result.error;
    return NextResponse.json({ ok: false, error: err, hint: REBIND_ERROR_HINT[err] }, { status: err === "not_found" ? 404 : 409 });
  }

  const ok = action === "archive"
    ? await archiveKnowledgeSource(orgId, sourceId)
    : await restoreKnowledgeSource(orgId, sourceId);
  if (ok) audit(orgId, resolved.role, resolved.source, action === "archive" ? "cs_knowledge_archived" : "cs_knowledge_restored", { sourceId });
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: `${action}_failed` }, { status: 409 });
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
    const result = await ingestKnowledge({
      organizationId: orgId, kind, title, body: docBody, isSensitive,
      canonicalUrl: canonicalUrlOf(body.canonicalUrl),
    });
    if (!result.sourceId) return NextResponse.json({ ok: false, error: "ingest_failed" }, { status: 503 });
    // Re-posting the same title with new text supersedes the previous version (K1); re-posting
    // identical text is a no-op, reported as unchanged rather than as a new version.
    audit(orgId, resolved.role, resolved.source, result.unchanged ? "cs_knowledge_unchanged" : "cs_knowledge_added", {
      title, kind, chunks: result.chunks, version: result.version, docFamilyId: result.docFamilyId,
    });
    return NextResponse.json({
      ok: true, sourceId: result.sourceId, chunks: result.chunks,
      version: result.version, unchanged: result.unchanged,
    });
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
