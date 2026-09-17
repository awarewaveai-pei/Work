// Knowledge-store data access — the ONLY place that touches cs_knowledge_* tables, via the
// service-role client (RLS = service_role only, migration 0051). Every function degrades safely:
// no client / error ⇒ empty result or no-op, never a throw that could crash a caller.
//
// K0 (ADR 011 §決策 3): moved verbatim from lib/cs/db.ts.
// K1 (migration 0072): versioning is now written and read, and BOTH retrieval halves go through
// RPCs that share one visibility predicate. The keyword half used to be a client-side .ilike()
// with no source-side filters at all, which meant keyword could see documents the vector half
// could not — the divergence this module now has no way to reintroduce, because neither half
// builds its own WHERE clause any more.
//
// Table names keep the cs_ prefix: renaming live tables is a migration, not a module move.

import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { buildKeywordQuery } from "@/lib/kb/keyword-query";
import { KB_DEFAULT_SPACE_ID } from "@/lib/kb/config";
import { docFamilyId } from "@/lib/kb/family";
import { folderDescendantIds } from "@/lib/kb/folders";

export type SourceListRow = {
  id: string;
  title: string;
  kind: string;
  isSensitive: boolean;
  status: string;
  version: number;
  docFamilyId: string;
  canonicalUrl: string | null;
  folderId: string | null;
  /** K2i: this document's own override, or 'inherit' to follow the tenant default. */
  keywordMode: string;
  chunks: number;
};

/** The three keyword_mode values the column CHECK constraint (migration 0086) allows. */
export type KeywordMode = "inherit" | "exact" | "fuzzy";
const KEYWORD_MODES: readonly KeywordMode[] = ["inherit", "exact", "fuzzy"];

/** Sentinel for "documents with no folder", passed as ListSourcesOptions.folderId — never a real
 *  folder's id (folders are uuids), so it can share the one `folderId` string field instead of the
 *  caller juggling a separate boolean alongside it. */
export const KB_UNFILED_FOLDER_ID = "unfiled";

export interface ListSourcesOptions {
  /** Title substring match (case-insensitive). K2h scopes search to titles — the KB has no
   *  full-text index over `body` yet, and a thousand-document tenant is already dominated by
   *  "which document is this" rather than "which sentence", which title search answers. */
  search?: string;
  /** undefined = no folder filter. KB_UNFILED_FOLDER_ID = only unfiled documents. A real folder id =
   *  that folder AND its subfolders (cross-level filtering, K2h's own DoD) — the descendant-id
   *  expansion happens once here via lib/kb/folders.ts, not duplicated per caller. */
  folderId?: string;
  /** 1-based. Defaults to 1. */
  page?: number;
  /** Defaults to 50; capped at 200 so a crafted request can't force an effectively-unpaginated scan. */
  pageSize?: number;
}

export interface ListSourcesResult {
  items: SourceListRow[];
  total: number;
  page: number;
  pageSize: number;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

function pageBoundsOf(opts?: ListSourcesOptions): { page: number; pageSize: number; from: number; to: number } {
  // Number.isFinite guards, not just Math.max/min: a malformed `?page=abc` from the directly-
  // reachable, viewer-level GET route becomes Number("abc") = NaN, and Math.max/min PROPAGATE NaN
  // rather than clamping it (critic finding 2026-09-17) — `.range(NaN, NaN)` would then depend on
  // Supabase/PostgREST erroring on a malformed Range header to fail safe, an incidental behaviour of
  // a different library rather than an invariant this function controls.
  const page = Number.isFinite(opts?.page) ? Math.max(1, Math.floor(opts!.page!)) : 1;
  const pageSize = Number.isFinite(opts?.pageSize) ? Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(opts!.pageSize!))) : DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  return { page, pageSize, from, to: from + pageSize - 1 };
}

/** List knowledge sources for the ops UI, with per-source chunk counts, paginated + filterable
 *  (K2h — thousand-document tenants can no longer be served by "fetch everything, filter in JS"). */
export async function listKnowledgeSources(organizationId: string, opts?: ListSourcesOptions): Promise<ListSourcesResult> {
  const sb = getSupabaseWriteClient();
  if (!sb) return { items: [], total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE };
  const { page, pageSize, from, to } = pageBoundsOf(opts);

  // Superseded versions are excluded: the ops list renders a delete button per row, and deleting a
  // row that only exists as version history destroys that history with no warning. K2 adds an
  // explicit "show versions" view.
  let query = sb
    .from("cs_knowledge_sources")
    .select("id,title,kind,is_sensitive,status,source_version,doc_family_id,canonical_url,folder_id,keyword_mode", { count: "exact" })
    .eq("organization_id", organizationId)
    .neq("status", "archived");
  if (opts?.search?.trim()) query = query.ilike("title", `%${opts.search.trim()}%`);
  if (opts?.folderId === KB_UNFILED_FOLDER_ID) {
    query = query.is("folder_id", null);
  } else if (opts?.folderId) {
    const descendantIds = await folderDescendantIds(organizationId, opts.folderId);
    query = query.in("folder_id", descendantIds);
  }
  const { data, error, count } = await query.order("created_at", { ascending: false }).range(from, to);
  if (error || !data) return { items: [], total: 0, page, pageSize };

  const ids = data.map((s) => s.id as string);
  const counts = new Map<string, number>();
  if (ids.length) {
    const { data: chunkRows } = await sb
      .from("cs_knowledge_chunks")
      .select("source_id")
      .eq("organization_id", organizationId) // never rely on the id list alone for tenant scoping
      .in("source_id", ids);
    (chunkRows ?? []).forEach((c) => {
      const sid = c.source_id as string;
      counts.set(sid, (counts.get(sid) ?? 0) + 1);
    });
  }
  const items = data.map((s) => ({
    id: s.id as string,
    title: s.title as string,
    kind: s.kind as string,
    isSensitive: s.is_sensitive === true,
    status: s.status as string,
    version: Number(s.source_version ?? 1),
    docFamilyId: s.doc_family_id as string,
    canonicalUrl: (s.canonical_url as string | null) ?? null,
    folderId: (s.folder_id as string | null) ?? null,
    keywordMode: (s.keyword_mode as string | null) ?? "inherit",
    chunks: counts.get(s.id as string) ?? 0,
  }));
  return { items, total: count ?? items.length, page, pageSize };
}

/**
 * K2i — set (or clear, via 'inherit') a single document's keyword-matching override. A separate
 * write from ingestKnowledge()/insertSource() on purpose: an operator flipping precise/fuzzy for one
 * document is a metadata change, not a new version of its content (no re-chunk, no re-embed, no
 * doc_family_id bump) — the same reasoning archiveKnowledgeSource is its own function rather than a
 * field on the ingest payload.
 */
export async function setKeywordMode(organizationId: string, sourceId: string, mode: KeywordMode): Promise<boolean> {
  if (!KEYWORD_MODES.includes(mode)) return false;
  const sb = getSupabaseWriteClient();
  if (!sb) return false;
  const { data, error } = await sb
    .from("cs_knowledge_sources")
    .update({ keyword_mode: mode, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", sourceId)
    .select("id");
  return !error && (data?.length ?? 0) > 0;
}

/**
 * Archived sources, same shape as listKnowledgeSources — the ops "已封存" view an operator opens to
 * restore or permanently remove something they archived. A separate function rather than a filter
 * argument on listKnowledgeSources: the two lists serve different actions (archive/delete vs.
 * restore/purge), and a boolean parameter callers must remember to pass is how the wrong list ends
 * up rendered with the wrong buttons.
 */
export type ArchivedSourceRow = { id: string; title: string; kind: string; isSensitive: boolean; version: number; docFamilyId: string; folderId: string | null };

export async function listArchivedKnowledgeSources(organizationId: string, opts?: ListSourcesOptions): Promise<{ items: ArchivedSourceRow[]; total: number; page: number; pageSize: number }> {
  const sb = getSupabaseWriteClient();
  if (!sb) return { items: [], total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE };
  const { page, pageSize, from, to } = pageBoundsOf(opts);

  let query = sb
    .from("cs_knowledge_sources")
    .select("id,title,kind,is_sensitive,source_version,doc_family_id,folder_id", { count: "exact" })
    .eq("organization_id", organizationId)
    .eq("status", "archived");
  if (opts?.search?.trim()) query = query.ilike("title", `%${opts.search.trim()}%`);
  if (opts?.folderId === KB_UNFILED_FOLDER_ID) {
    query = query.is("folder_id", null);
  } else if (opts?.folderId) {
    const descendantIds = await folderDescendantIds(organizationId, opts.folderId);
    query = query.in("folder_id", descendantIds);
  }
  const { data, error, count } = await query.order("updated_at", { ascending: false }).range(from, to);
  if (error || !data) return { items: [], total: 0, page, pageSize };
  const items = data.map((s) => ({
    id: s.id as string,
    title: s.title as string,
    kind: s.kind as string,
    isSensitive: s.is_sensitive === true,
    version: Number(s.source_version ?? 1),
    docFamilyId: s.doc_family_id as string,
    folderId: (s.folder_id as string | null) ?? null,
  }));
  return { items, total: count ?? items.length, page, pageSize };
}

/**
 * The operator's "封存" action (KNOWLEDGE_BASE_PLAN.md §3-#4's own invariant: a document leaving
 * retrieval should default to archived, not gone — `cs_ai_replies.retrieved_chunk_ids` is an FK-less
 * uuid[], so hard-deleting a chunk a past reply cited orphans that reference). Only flips `status`;
 * chunks and the row itself are untouched, so restoreKnowledgeSource is a plain reverse of this.
 * Restricted to `status = 'active'` so archiving an already-superseded row (K1 versioning's own job,
 * see archiveOtherVersions) is a no-op rather than a second writer racing the first.
 */
export async function archiveKnowledgeSource(organizationId: string, sourceId: string): Promise<boolean> {
  const sb = getSupabaseWriteClient();
  if (!sb) return false;
  // `.select("id")` + length check (not just `!error`): Supabase/PostgREST returns error:null even
  // when the WHERE clause matched zero rows, so a stale/foreign/already-archived sourceId would
  // otherwise report success and log an audit event for a write that never happened (critic finding
  // 2026-09-12) — same pattern archiveOtherVersions already uses, below, for the same reason.
  const { data, error } = await sb
    .from("cs_knowledge_sources")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", sourceId)
    .eq("status", "active")
    .select("id");
  return !error && (data?.length ?? 0) > 0;
}

/**
 * Undo archiveKnowledgeSource. Restricted to `status = 'archived'`, AND (critic finding 2026-09-12,
 * Critical) refuses if any OTHER row in the same document family is currently `active` — without
 * this check, restoring a version K1's own versioning already superseded resurrects a second "live"
 * document: retrieval's `status = 'active'` predicate (migration 0072) has no version-recency
 * concept, so both rows would be served side by side with no error anywhere, potentially serving a
 * reversed/contradictory old policy alongside the current one. Deterministically reproducible with
 * ONE operator (upload → re-upload same title → open 已封存 → restore the old version) before this
 * fix, not merely a low-probability race.
 *
 * NOT enforced as a database constraint: migration 0072's own header explains why a UNIQUE index on
 * (organization_id, doc_family_id) WHERE status='active' is deliberately absent — ingestKnowledge()
 * inserts the new version BEFORE archiving the old one (the only protection against a failed embed
 * call wiping a document's content, since supabase-js has no transactions), so two active rows exist
 * for a moment BY DESIGN during every normal re-ingest. Adding that constraint would make ordinary
 * re-versioning fail outright, trading a rare operator-triggered mistake for a routine ingest crash —
 * the guard belongs here, on the one code path (an operator's explicit "restore") that has no
 * legitimate reason to ever create the state K1's own versioning invariant forbids.
 */
export async function restoreKnowledgeSource(organizationId: string, sourceId: string): Promise<boolean> {
  const sb = getSupabaseWriteClient();
  if (!sb) return false;
  const { data: target, error: readError } = await sb
    .from("cs_knowledge_sources")
    .select("doc_family_id")
    .eq("organization_id", organizationId)
    .eq("id", sourceId)
    .eq("status", "archived")
    .maybeSingle();
  if (readError || !target) return false;

  const { data: activeSibling } = await sb
    .from("cs_knowledge_sources")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("doc_family_id", target.doc_family_id as string)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (activeSibling) return false; // a newer version is already live — do not create a second one

  const { data, error } = await sb
    .from("cs_knowledge_sources")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", sourceId)
    .eq("status", "archived")
    .select("id");
  return !error && (data?.length ?? 0) > 0;
}

export type RebindError = "not_found" | "already_has_url" | "url_already_claimed" | "write_failed" | "lost_race";

/**
 * The FAQ-duplication fix (TASKS.md 2026-09-11, operator-chosen option A, 2026-09-12): before a
 * client's site is ever crawled, point each existing MANUAL document at the real URL the crawler
 * will eventually see for the same content, so the crawl versions it up instead of creating a
 * second, contradictory document.
 *
 * WHY THIS ISN'T JUST "SET canonical_url": `doc_family_id` (lib/kb/family.ts) is a hash of
 * (organizationId, canonicalKey) computed ONCE at ingest and stored — changing the `canonical_url`
 * column alone does not change the already-stored `doc_family_id`, so a later crawl of that URL
 * would still compute a DIFFERENT family id and create a second document, silently reproducing the
 * exact bug this function exists to close. Both columns move together.
 *
 * Refuses (rather than silently merging) when: the source already has a canonicalUrl (rebinding an
 * already-URL-identified document is a different, unrelated operation — the button only appears on
 * manual rows in the ops UI, but the guard holds even if called directly); or another row in this
 * organization already occupies the target family (a crawl already reached this URL — merging two
 * independently-written histories under one identity needs a human decision, not a silent rewrite).
 */
export async function rebindManualDocumentUrl(
  organizationId: string,
  sourceId: string,
  canonicalUrl: string,
): Promise<{ ok: true } | { ok: false; error: RebindError }> {
  const sb = getSupabaseWriteClient();
  if (!sb) return { ok: false, error: "write_failed" };
  const url = canonicalUrl.trim();

  const { data: existing, error: readError } = await sb
    .from("cs_knowledge_sources")
    .select("id,canonical_url")
    .eq("organization_id", organizationId)
    .eq("id", sourceId)
    .maybeSingle();
  if (readError || !existing) return { ok: false, error: "not_found" };
  if (existing.canonical_url) return { ok: false, error: "already_has_url" };

  const newFamilyId = docFamilyId(organizationId, url);
  const { data: collision } = await sb
    .from("cs_knowledge_sources")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("doc_family_id", newFamilyId)
    .neq("id", sourceId)
    .limit(1)
    .maybeSingle();
  if (collision) return { ok: false, error: "url_already_claimed" };

  // Source row first: it is the one getFamilyState()/archiveOtherVersions() actually key off of, so
  // a future crawl is correctly recognised as soon as this write lands. `.select("id")` + length
  // check (critic finding 2026-09-12, Major) — not just `!error`: Supabase/PostgREST returns
  // error:null even when the WHERE clause matched zero rows, which a lost race against a concurrent
  // rebind of the SAME source (a different URL, or a second click) would otherwise report as success
  // while `canonical_url`/`doc_family_id` silently keep their PREVIOUS values.
  const { data: written, error: sourceError } = await sb
    .from("cs_knowledge_sources")
    .update({ canonical_url: url, doc_family_id: newFamilyId, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", sourceId)
    .is("canonical_url", null) // re-check at write time, not just at the read above (TOCTOU)
    .select("id");
  if (sourceError) return { ok: false, error: "write_failed" };
  if ((written?.length ?? 0) === 0) return { ok: false, error: "lost_race" };

  // Best-effort cleanup of a column nothing currently reads for filtering (grep-verified: no
  // retrieval predicate touches cs_knowledge_chunks.doc_family_id) — worth keeping consistent for
  // whoever next reads this table directly, but not worth failing an already-confirmed source write
  // over. Only reached once the source write above is KNOWN to have landed (guard above), so this
  // never fires for a family id the source row does not actually have.
  const { error: chunksError } = await sb
    .from("cs_knowledge_chunks")
    .update({ doc_family_id: newFamilyId })
    .eq("organization_id", organizationId)
    .eq("source_id", sourceId);
  if (chunksError) {
    console.error("kb_rebind_chunks_family_stale", { sourceId, newFamilyId, code: chunksError.code, message: chunksError.message });
  }

  return { ok: true };
}

/**
 * Delete a knowledge source row; its chunks cascade-delete via FK (migration 0051).
 * This is the operator's explicit, PERMANENT delete and the rollback path for a failed ingest — it
 * is NOT how a document is superseded (see archiveOtherVersions) and, since archiveKnowledgeSource
 * exists, is no longer the only way to remove a document from circulation. Kept as a genuinely
 * separate, irreversible action rather than folded into archive: some deletes (a document ingested
 * into the wrong tenant, a legal takedown) need to actually be gone, not merely hidden.
 */
export async function deleteKnowledgeSource(organizationId: string, sourceId: string): Promise<boolean> {
  const sb = getSupabaseWriteClient();
  if (!sb) return false;
  const { error } = await sb.from("cs_knowledge_sources").delete().eq("organization_id", organizationId).eq("id", sourceId);
  return !error;
}

export interface LiveVersion {
  id: string;
  version: number;
  contentHash: string | null;
  /** Non-null ⇒ automation must leave this document alone (migration 0075). */
  locked: string | null;
  /** Metadata that re-ingest can change without touching a single character of the body. */
  isSensitive: boolean;
  spaceId: string | null;
  canonicalUrl: string | null;
  validFrom: string | null;
  validTo: string | null;
  /** K2h: which folder the CURRENT version sits in — read by ingestKnowledge so a re-ingest (new
   *  version, same document family) inherits it. There is no ingest-time field for this (folder
   *  assignment is a separate ops-console action, PATCH .../cs-knowledge move_folder), so without
   *  this carry-forward every edit would silently un-file the document (critic finding 2026-09-17). */
  folderId: string | null;
}

/**
 * The current active version of a document family, plus the highest version number ever used in it
 * (including archived ones, so a version number is never reused after a supersede).
 */
export async function getFamilyState(
  organizationId: string,
  docFamilyId: string,
): Promise<{ live: LiveVersion | null; maxVersion: number }> {
  const sb = getSupabaseWriteClient();
  if (!sb) return { live: null, maxVersion: 0 };
  const { data, error } = await sb
    .from("cs_knowledge_sources")
    .select("id,source_version,status,content_hash,is_sensitive,space_id,canonical_url,valid_from,valid_to,locked,folder_id")
    .eq("organization_id", organizationId)
    .eq("doc_family_id", docFamilyId)
    .order("source_version", { ascending: false });
  if (error || !data || !data.length) return { live: null, maxVersion: 0 };
  const maxVersion = Number(data[0].source_version ?? 0);
  const active = data.find((r) => r.status === "active");
  return {
    live: active
      ? {
          id: active.id as string,
          version: Number(active.source_version ?? 1),
          contentHash: (active.content_hash as string | null) ?? null,
          locked: (active.locked as string | null) ?? null,
          isSensitive: active.is_sensitive === true,
          spaceId: (active.space_id as string | null) ?? null,
          canonicalUrl: (active.canonical_url as string | null) ?? null,
          validFrom: (active.valid_from as string | null) ?? null,
          validTo: (active.valid_to as string | null) ?? null,
          folderId: (active.folder_id as string | null) ?? null,
        }
      : null,
    maxVersion,
  };
}

export interface SourceInput {
  organizationId: string;
  kind: string;
  title: string;
  isSensitive: boolean;
  docFamilyId: string;
  sourceVersion: number;
  contentHash: string;
  /** Verbatim ingested text (migration 0084, K2g) — for the content-viewer, never reconstructed from chunks. */
  body?: string | null;
  /** K2h. Callers pass `live.folderId` from getFamilyState to carry it across a re-ingest — see LiveVersion.folderId. */
  folderId?: string | null;
  canonicalUrl?: string | null;
  spaceId?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  language?: string | null;
  docType?: string | null;
  authorityTier?: string | null;
  domainPack?: string | null;
  epistemicType?: string;
  authorshipState?: string;
  locked?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  venue?: string | null;
  doi?: string | null;
}

export async function insertSource(input: SourceInput): Promise<string | null> {
  const sb = getSupabaseWriteClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from("cs_knowledge_sources")
    .insert({
      organization_id: input.organizationId,
      kind: input.kind,
      title: input.title,
      is_sensitive: input.isSensitive,
      doc_family_id: input.docFamilyId,
      source_version: input.sourceVersion,
      status: "active",
      content_hash: input.contentHash,
      body: input.body ?? null,
      folder_id: input.folderId ?? null,
      canonical_url: input.canonicalUrl ?? null,
      space_id: input.spaceId ?? KB_DEFAULT_SPACE_ID,
      valid_from: input.validFrom ?? null,
      valid_to: input.validTo ?? null,
      language: input.language ?? null,
      doc_type: input.docType ?? null,
      authority_tier: input.authorityTier ?? null,
      domain_pack: input.domainPack ?? null,
      epistemic_type: input.epistemicType ?? null,
      authorship_state: input.authorshipState ?? null,
      locked: input.locked ?? null,
      author: input.author ?? null,
      published_at: input.publishedAt ?? null,
      venue: input.venue ?? null,
      doi: input.doi ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return null;
  return (data as { id: string }).id;
}

/**
 * Mark every other version of this family as superseded. Called ONLY after the new version's chunks
 * are confirmed stored (KNOWLEDGE_BASE_PLAN.md §1.3): the reverse order would leave the document
 * with zero retrievable content if embedding failed halfway, and supabase-js has no transactions,
 * so the order is the whole protection.
 *
 * Archived rows are excluded by the `status` predicate at every point in time, which means an
 * as-of query cannot reach a superseded version. That is intentional here (supersede = "the old
 * text was wrong"), and distinct from the K2b temporal case (two versions, both active, separated
 * by valid_from/valid_to = "the old text was right back then").
 */
export async function archiveOtherVersions(
  organizationId: string,
  docFamilyId: string,
  keepSourceId: string,
): Promise<{ archived: number; failed: boolean }> {
  const sb = getSupabaseWriteClient();
  if (!sb) return { archived: 0, failed: true };
  const { data, error } = await sb
    .from("cs_knowledge_sources")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("doc_family_id", docFamilyId)
    .eq("status", "active")
    .neq("id", keepSourceId)
    .select("id");
  // "nothing to archive" and "the update failed" must not look the same to the caller: the second
  // one leaves two active versions of the same document feeding contradictory text into answers.
  if (error) {
    console.error("kb_archive_failed", { docFamilyId, code: error.code, message: error.message });
    return { archived: 0, failed: true };
  }
  return { archived: (data ?? []).length, failed: false };
}

export interface ChunkRow {
  organizationId: string;
  sourceId: string;
  docFamilyId: string;
  sourceVersion: number;
  content: string;
  contextualPrefix?: string;
  embedding: number[];
  embedModel: string;
}

/** pgvector text input format: '[0.1,0.2,…]'. */
function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

/**
 * Store chunks. family/version/space are INHERITED from the source row the caller just wrote —
 * before K1 this wrote `doc_family_id: sourceId`, so the two tables disagreed about which family a
 * chunk belonged to and no query would ever have raised an error about it.
 */
export async function insertChunks(rows: ChunkRow[]): Promise<number> {
  const sb = getSupabaseWriteClient();
  if (!sb || !rows.length) return 0;
  const payload = rows.map((r) => ({
    organization_id: r.organizationId,
    source_id: r.sourceId,
    doc_family_id: r.docFamilyId,
    source_version: r.sourceVersion,
    content: r.content,
    contextual_prefix: r.contextualPrefix ?? null,
    embedding: toVectorLiteral(r.embedding),
    embed_model: r.embedModel,
  }));
  const { data, error } = await sb.from("cs_knowledge_chunks").insert(payload).select("id");
  if (error) {
    console.error("kb_insert_chunks_failed", { code: error.code, message: error.message });
    return 0;
  }
  return (data ?? []).length;
}

/** The six retrieval predicates (KNOWLEDGE_BASE_PLAN.md §1.2), as the RPCs take them. */
export interface RetrievalScope {
  scope: string[];
  spaces: string[] | null;
  viewer: string;
  asOf: string | null;
  model: string;
  /**
   * Migration 0083. `viewer` alone cannot answer "should THIS caller see sensitive content" — every
   * caller today passes viewer = its own org, which makes the tree-inheritance check that `viewer`
   * exists for a no-op, and a customer-service AI's own org obviously matches its own org's docs.
   * Default `true` (unchanged behaviour) is set here, not left to the RPC's own SQL default, so a
   * caller that forgets this field is visible in a TypeScript diff, not just in a migration file.
   */
  includeSensitive: boolean;
}

function rpcArgs(s: RetrievalScope): Record<string, unknown> {
  return {
    p_scope: s.scope,
    p_spaces: s.spaces,
    p_viewer: s.viewer,
    p_as_of: s.asOf,
    p_model: s.model,
    p_include_sensitive: s.includeSensitive,
  };
}

/** The citation and provenance columns both retrieval halves now return (migration 0075). */
export interface MatchAttribution {
  title: string | null;
  canonical_url: string | null;
  author: string | null;
  published_at: string | null;
  venue: string | null;
  doi: string | null;
  epistemic_type: string | null;
  authorship_state: string | null;
  locked: string | null;
}

export interface VectorMatch extends MatchAttribution {
  id: string;
  sourceId: string;
  content: string;
  /**
   * Cosine similarity from migration 0075's `ORDER BY c.embedding <=> p_embedding`. Sorted here
   * explicitly (below), not left implicit in RPC row order — closing the same gap a critic review
   * already found and fixed for matchChunksKeyword (see KeywordMatch.score above and
   * kb-db-keyword-sort.test.ts): PostgREST/Supabase preserving a function's row order is real today
   * but is nowhere a documented contract. This one matters more than the keyword copy did — rag.ts's
   * retrieve() reads `vec[0]` directly to enforce the "best vector match is never evicted" invariant
   * (the migration-0076 fix), so an unsorted vec[] would silently pick the wrong chunk as "best".
   */
  similarity: number;
}

/** Vector half of hybrid retrieval — cs_match_chunks RPC (six predicates applied inside). */
export async function matchChunksVector(
  s: RetrievalScope,
  embedding: number[],
  limit: number,
): Promise<VectorMatch[]> {
  const sb = getSupabaseWriteClient();
  if (!sb) return [];
  const { data, error } = await sb.rpc("cs_match_chunks", {
    ...rpcArgs(s),
    p_embedding: toVectorLiteral(embedding),
    p_limit: limit,
  });
  // A missing/renamed RPC (code deployed before the migration, or after a rollback) would otherwise
  // look exactly like "this tenant has no knowledge" — every conversation quietly handed to a human.
  if (error) {
    console.error("kb_match_vector_failed", { code: error.code, message: error.message });
    return [];
  }
  if (!data) return [];
  return (data as Array<MatchAttribution & { id: string; source_id: string; content: string; similarity: number }>)
    .map((r) => ({ ...r, id: r.id, sourceId: r.source_id, content: r.content, similarity: Number(r.similarity) }))
    .sort((a, b) => b.similarity - a.similarity);
}

export interface KeywordMatch extends MatchAttribution {
  id: string;
  sourceId: string;
  content: string;
  /**
   * Term-overlap count from migration 0076, used to sort the results explicitly below. Not left
   * implicit in RPC row order: PostgREST/Supabase preserving a function's row order is real today
   * but is nowhere a documented contract, and this is the same "ranking silently degrades without
   * an error" failure class migration 0076 exists to fix in the SQL — closing it again here.
   */
  score: number;
}

/**
 * Keyword half of hybrid retrieval — cs_match_chunks_keyword RPC (PGroonga, migration 0076).
 *
 * The question is turned into matchable terms first. It used to be sent whole, truncated to 80
 * characters, and matched with strpos() — so it matched nothing for any real question and this half
 * contributed nothing to the fusion. See lib/kb/keyword-query.ts.
 */
export async function matchChunksKeyword(
  s: RetrievalScope,
  query: string,
  limit: number,
): Promise<KeywordMatch[]> {
  const sb = getSupabaseWriteClient();
  if (!sb) return [];
  // Empty means the question had no usable terms (punctuation, one letter). Skip the call rather
  // than send an empty PGroonga query, which is an error, not "no matches".
  const term = buildKeywordQuery(query);
  if (!term) return [];
  const { data, error } = await sb.rpc("cs_match_chunks_keyword", {
    ...rpcArgs(s),
    p_term: term,
    p_limit: limit,
    // K2i: the literal, un-bigrammed question — cs_match_chunks_keyword (migration 0086) uses it to
    // require an exact substring match for documents in "precise" keyword mode, on top of (never
    // instead of) the bigram-OR gate every document already goes through above.
    p_raw_query: query,
  });
  if (error) {
    console.error("kb_match_keyword_failed", { code: error.code, message: error.message });
    return [];
  }
  if (!data) return [];
  return (data as Array<MatchAttribution & { id: string; source_id: string; content: string; score: number }>)
    .map((r) => ({
      ...r,
      id: r.id,
      sourceId: r.source_id,
      content: r.content,
      score: Number(r.score), // matches matchChunksVector's Number(r.similarity) below
    }))
    // Sorted here rather than trusted from the RPC: the SQL side already has its own ORDER BY, but
    // this call site is the one place lib/kb/rag.ts's rrfFuse() reads rank from, and it reads rank
    // from ARRAY POSITION. Sorting explicitly makes that true by construction, not by an assumption
    // about what PostgREST does with a function's row order.
    .sort((a, b) => b.score - a.score);
}

export interface SourceDetail {
  id: string;
  title: string;
  kind: string;
  isSensitive: boolean;
  status: string;
  version: number;
  docFamilyId: string;
  canonicalUrl: string | null;
  folderId: string | null;
  /** K2i: this document's own override, or 'inherit' to follow the tenant default. */
  keywordMode: string;
  /** null distinguishes "ingested before migration 0084" from "ingested with an empty body" (the
   *  latter cannot happen — POST .../cs-knowledge requires body.length >= 10). The UI must render
   *  these two cases differently: an empty-looking viewer for a real document reads as data loss. */
  body: string | null;
  language: string | null;
  epistemicType: string | null;
  authorshipState: string | null;
  locked: string | null;
  author: string | null;
  publishedAt: string | null;
  venue: string | null;
  doi: string | null;
  createdAt: string;
}

/** One document's full detail for the ops content-viewer (K2g) — org-scoped, active or archived. */
export async function getSourceDetail(organizationId: string, sourceId: string): Promise<SourceDetail | null> {
  const sb = getSupabaseWriteClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from("cs_knowledge_sources")
    .select(
      "id,title,kind,is_sensitive,status,source_version,doc_family_id,canonical_url,folder_id,keyword_mode,body,language,epistemic_type,authorship_state,locked,author,published_at,venue,doi,created_at",
    )
    .eq("organization_id", organizationId)
    .eq("id", sourceId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id as string,
    title: data.title as string,
    kind: data.kind as string,
    isSensitive: data.is_sensitive === true,
    status: data.status as string,
    version: Number(data.source_version ?? 1),
    docFamilyId: data.doc_family_id as string,
    canonicalUrl: (data.canonical_url as string | null) ?? null,
    folderId: (data.folder_id as string | null) ?? null,
    keywordMode: (data.keyword_mode as string | null) ?? "inherit",
    body: (data.body as string | null) ?? null,
    language: (data.language as string | null) ?? null,
    epistemicType: (data.epistemic_type as string | null) ?? null,
    authorshipState: (data.authorship_state as string | null) ?? null,
    locked: (data.locked as string | null) ?? null,
    author: (data.author as string | null) ?? null,
    publishedAt: (data.published_at as string | null) ?? null,
    venue: (data.venue as string | null) ?? null,
    doi: (data.doi as string | null) ?? null,
    createdAt: data.created_at as string,
  };
}

export interface VersionSummary {
  id: string;
  version: number;
  status: string;
  createdAt: string;
}

/**
 * Every version ever written for a document family, newest first — active and archived alike (K1
 * versioning marks superseded versions `archived` rather than deleting them specifically so this
 * history stays answerable; see archiveOtherVersions above).
 */
export async function listVersionsForFamily(organizationId: string, docFamilyId: string): Promise<VersionSummary[]> {
  const sb = getSupabaseWriteClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from("cs_knowledge_sources")
    .select("id,source_version,status,created_at")
    .eq("organization_id", organizationId)
    .eq("doc_family_id", docFamilyId)
    .order("source_version", { ascending: false });
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id as string,
    version: Number(r.source_version ?? 1),
    status: r.status as string,
    createdAt: r.created_at as string,
  }));
}
