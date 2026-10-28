// GET/POST/PATCH/DELETE /api/ops/clients/[slug]/cs-knowledge — manage a client's RAG knowledge sources.
// GET    — list sources (+ per-source chunk counts), paginated (K2h: `?page=`/`?pageSize=`, default
//          1/50, pageSize capped at 200) and filterable (`?search=` title substring; `?folderId=`
//          scopes to a folder AND its subfolders). Response is `{ sources, total, page, pageSize }`.
//          ?status=archived lists the archived view instead (same paging/filter params).
//          ?sourceId=<id> returns one document's full detail (K2g: body text, provenance, citation)
//          plus every version in its document family — the content-viewer the ops console lacked.
//          Same read level as the list (viewer+), matching every other route in this console
//          (cs-config, collection-sources, schedules/[job] all use the identical "viewer+ read,
//          owner/admin write" split). Critic finding (2026-09-17): for an `isSensitive` document this
//          IS a real increase over the list, which discloses zero body bytes regardless of the flag —
//          `is_sensitive` was designed to gate the customer-facing AI's retrieval (migration 0083),
//          never audited as a human-RBAC control. Kept at viewer+ for consistency with this file's
//          own established pattern rather than inventing a new, narrower rule for one field; sensitive
//          detail views are audited below so at least there is a record of who looked.
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
//        — { sourceId, action: "move_folder", folderId: string | null } → K2h: file a document into
//          a folder, or null to unfile it. folderId is validated to exist in this org first (lib/kb).
//        — { sourceId, action: "set_keyword_mode", mode: "inherit" | "exact" | "fuzzy" } → K2i:
//          per-document keyword-matching override, read by cs_match_chunks_keyword (migration 0086).
//          "inherit" (the default) follows the tenant-wide default (cs-config's kbKeywordModeDefault).
// DELETE — { sourceId } → PERMANENTLY remove source (chunks cascade). Archive and delete are two
//          separate, real actions (operator decision 2026-09-12) — this one does not come back.
// Writes gated by canWriteTenantConfig (owner/admin). Reads open to the internal ops console.

import { NextResponse } from "next/server";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { buildFolderDossier } from "@/lib/dossier/folder";
import { resolveSavedAiTextModel } from "@/lib/ai/text-model-options";
import { recordOpsAudit } from "@/lib/ops-audit";
import { thenRun, withFeature } from "@/lib/entitlements/grant";
import {
  ingestKnowledge,
  listKnowledgeSources,
  listArchivedKnowledgeSources,
  archiveKnowledgeSource,
  restoreKnowledgeSource,
  rebindManualDocumentUrl,
  deleteKnowledgeSource,
  getSourceDetail,
  listVersionsForFamily,
  moveSourceToFolder,
  setKeywordMode,
  type RebindError,
  type FolderError,
  type KeywordMode,
} from "@/lib/kb";

const DOSSIER_ERROR_HINT: Record<string, string> = {
  folder_not_found: "找不到這個資料夾",
  no_sources: "這個資料夾裡沒有可用的文件內容——先跑一次蒐集，或確認文件不是全部被封存了",
  model_failed: "模型沒有回傳可用的結果，請重試；若持續失敗請換一個模型",
  ingest_failed: "報告產生成功但寫入知識庫失敗，請重試",
  no_supabase_client: "資料庫未設定",
};

const REBIND_ERROR_HINT: Record<RebindError, string> = {
  not_found: "找不到這份文件",
  already_has_url: "這份文件已經有網址了，不是手動上傳的文件",
  url_already_claimed: "這個網址已經被另一份文件使用——可能爬蟲已經抓過了，請改用一般的重新上傳來合併版本",
  write_failed: "寫入失敗，請重試",
  lost_race: "同時間有另一個操作搶先改了這份文件，請重新整理後再試一次",
};

const FOLDER_ERROR_HINT: Record<FolderError, string> = {
  name_required: "資料夾名稱不可為空",
  duplicate_name: "同層已有相同名稱的資料夾",
  parent_not_found: "找不到這個資料夾",
  would_create_cycle: "不能把資料夾移進自己的子資料夾裡",
  not_found: "找不到這份文件",
  write_failed: "寫入失敗，請重試",
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


export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const resolved = resolveOpsRole(request); // internal console — viewer+ may read
  const { slug } = await context.params;
  const orgId = await orgIdOf(slug);
  if (!orgId) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });

  const params = new URL(request.url).searchParams;
  const sourceId = params.get("sourceId");
  if (sourceId) {
    const detail = await getSourceDetail(orgId, sourceId);
    if (!detail) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    // Critic finding (2026-09-17): no prior audit trail for who read a sensitive document's full
    // text — cheap to close for the one case that matters (a locked-down flag with zero visibility
    // into who looked), not worth it for every ordinary read.
    if (detail.isSensitive) {
      await recordOpsAudit(orgId, resolved.role, resolved.source, "cs_knowledge_detail_viewed", { sourceId });
    }
    // docFamilyId is a point-in-time read; a concurrent PATCH rebind (below) changing it between
    // these two calls would make the version list miss the very document just fetched. Accepted
    // (display-only, self-heals on reload, no cross-tenant leak — both queries are independently
    // organization_id-scoped) rather than "fixed" with a transaction supabase-js does not have.
    const versions = await listVersionsForFamily(orgId, detail.docFamilyId);
    return NextResponse.json({ ok: true, detail, versions });
  }

  const listOpts = {
    search: params.get("search") ?? undefined,
    folderId: params.get("folderId") ?? undefined,
    page: params.get("page") ? Number(params.get("page")) : undefined,
    pageSize: params.get("pageSize") ? Number(params.get("pageSize")) : undefined,
  };
  const wantsArchived = params.get("status") === "archived";
  const result = wantsArchived ? await listArchivedKnowledgeSources(orgId, listOpts) : await listKnowledgeSources(orgId, listOpts);
  return NextResponse.json({ ok: true, sources: result.items, total: result.total, page: result.page, pageSize: result.pageSize });
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
  const action = body.action === "archive" || body.action === "restore" || body.action === "rebind" || body.action === "move_folder" || body.action === "set_keyword_mode" ? body.action : null;
  if (!sourceId || !action) return NextResponse.json({ ok: false, error: "sourceId_and_action_required" }, { status: 400 });

  const orgId = await orgIdOf(slug);
  if (!orgId) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });

  if (action === "set_keyword_mode") {
    const mode: KeywordMode | null = body.mode === "inherit" || body.mode === "exact" || body.mode === "fuzzy" ? body.mode : null;
    if (!mode) return NextResponse.json({ ok: false, error: "valid_mode_required" }, { status: 400 });
    const ok = await setKeywordMode(orgId, sourceId, mode);
    if (!ok) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    await recordOpsAudit(orgId, resolved.role, resolved.source, "cs_knowledge_keyword_mode_set", { sourceId, mode });
    return NextResponse.json({ ok: true });
  }

  if (action === "move_folder") {
    // null explicitly unfiles the document; anything else must be a real, non-empty folder id.
    const folderId = body.folderId === null ? null : typeof body.folderId === "string" && body.folderId ? body.folderId : undefined;
    if (folderId === undefined) return NextResponse.json({ ok: false, error: "folderId_required" }, { status: 400 });
    const result = await moveSourceToFolder(orgId, sourceId, folderId);
    if (result.ok === true) {
      await recordOpsAudit(orgId, resolved.role, resolved.source, "cs_knowledge_moved_folder", { sourceId, folderId });
      return NextResponse.json({ ok: true });
    }
    const err: FolderError = result.error;
    return NextResponse.json({ ok: false, error: err, hint: FOLDER_ERROR_HINT[err] }, { status: err === "not_found" || err === "parent_not_found" ? 404 : 409 });
  }

  if (action === "rebind") {
    const url = canonicalUrlOf(body.canonicalUrl);
    if (!url) return NextResponse.json({ ok: false, error: "valid_https_url_required" }, { status: 400 });
    const result = await rebindManualDocumentUrl(orgId, sourceId, url);
    if (result.ok === true) {
      await recordOpsAudit(orgId, resolved.role, resolved.source, "cs_knowledge_rebound", { sourceId, canonicalUrl: url });
      return NextResponse.json({ ok: true });
    }
    const err: RebindError = result.error;
    return NextResponse.json({ ok: false, error: err, hint: REBIND_ERROR_HINT[err] }, { status: err === "not_found" ? 404 : 409 });
  }

  const ok = action === "archive"
    ? await archiveKnowledgeSource(orgId, sourceId)
    : await restoreKnowledgeSource(orgId, sourceId);
  if (ok) await recordOpsAudit(orgId, resolved.role, resolved.source, action === "archive" ? "cs_knowledge_archived" : "cs_knowledge_restored", { sourceId });
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

  // The one POST that is not an upload: build a background file OUT OF a folder's documents. Kept
  // on this route rather than a new one because it is a knowledge-base write gated by exactly the
  // same role check, and a second route would be a second place to get that check wrong.
  if (body.action === "build_dossier") {
    const folderId = typeof body.folderId === "string" ? body.folderId : "";
    if (!folderId) return NextResponse.json({ ok: false, error: "folderId_required" }, { status: 400 });
    const orgIdForDossier = await orgIdOf(slug);
    if (!orgIdForDossier) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });

    // The client's knowledge pays for its embeddings (ADR 017 §0 代操); the dossier's AI is staff tooling, billed internal.
    return withFeature("cs.answer", thenRun, { org: () => orgIdForDossier })(request, async () => {
      const result = await buildFolderDossier({
        organizationId: orgIdForDossier,
        folderId,
        model: resolveSavedAiTextModel(body.model),
        preview: body.preview === true,
      });
      if (!result.ok) {
        const status = result.error === "folder_not_found" ? 404 : result.error === "no_sources" ? 400 : 502;
        return NextResponse.json(
          { ok: false, error: result.error, hint: DOSSIER_ERROR_HINT[result.error!] ?? null, detail: result.detail ?? null },
          { status },
        );
      }
      await recordOpsAudit(orgIdForDossier, resolved.role, resolved.source, "cs_knowledge_dossier_built", {
        folderId,
        sourceId: result.sourceId ?? null,
        sourcesUsed: result.sourcesUsed,
        preview: body.preview === true,
      });
      return NextResponse.json({
        ok: true,
        sourceId: result.sourceId ?? null,
        sourcesUsed: result.sourcesUsed,
        markdown: result.markdown,
        report: result.report,
      });
    });
  }

  const title = (typeof body.title === "string" ? body.title.trim() : "").slice(0, 300);
  const docBody = typeof body.body === "string" ? body.body.trim() : "";
  const kind = KINDS.includes(body.kind as string) ? (body.kind as "doc" | "faq" | "sop" | "conversation" | "url") : "doc";
  const isSensitive = body.isSensitive === true;
  if (!title || docBody.length < 10) return NextResponse.json({ ok: false, error: "title_and_body_required" }, { status: 400 });
  // Cap body to bound embedding cost + stay under OpenAI's per-request token/input ceiling.
  if (docBody.length > 100000) return NextResponse.json({ ok: false, error: "body_too_long", hint: "內容過長（上限 10 萬字），請拆成多筆" }, { status: 400 });

  const orgId = await orgIdOf(slug);
  if (!orgId) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });

  // The client's knowledge pays for its embeddings (ADR 017 §0 代操).
  return withFeature("cs.answer", thenRun, { org: () => orgId })(request, async () => {
    try {
      const result = await ingestKnowledge({
        organizationId: orgId, kind, title, body: docBody, isSensitive,
        canonicalUrl: canonicalUrlOf(body.canonicalUrl),
      });
      if (!result.sourceId) return NextResponse.json({ ok: false, error: "ingest_failed" }, { status: 503 });
      // Re-posting the same title with new text supersedes the previous version (K1); re-posting
      // identical text is a no-op, reported as unchanged rather than as a new version.
      await recordOpsAudit(orgId, resolved.role, resolved.source, result.unchanged ? "cs_knowledge_unchanged" : "cs_knowledge_added", {
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
  });
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
  if (ok) await recordOpsAudit(orgId, resolved.role, resolved.source, "cs_knowledge_deleted", { sourceId });
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: "delete_failed" }, { status: 409 });
}
