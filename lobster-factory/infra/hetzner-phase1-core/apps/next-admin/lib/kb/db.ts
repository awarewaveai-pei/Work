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

/** List knowledge sources for the ops UI, with per-source chunk counts. */
export async function listKnowledgeSources(
  organizationId: string,
): Promise<
  Array<{
    id: string;
    title: string;
    kind: string;
    isSensitive: boolean;
    status: string;
    version: number;
    docFamilyId: string;
    chunks: number;
  }>
> {
  const sb = getSupabaseWriteClient();
  if (!sb) return [];
  // Superseded versions are excluded: the ops list renders a delete button per row, and deleting a
  // row that only exists as version history destroys that history with no warning. K2 adds an
  // explicit "show versions" view.
  const { data, error } = await sb
    .from("cs_knowledge_sources")
    .select("id,title,kind,is_sensitive,status,source_version,doc_family_id")
    .eq("organization_id", organizationId)
    .neq("status", "archived")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
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
  return data.map((s) => ({
    id: s.id as string,
    title: s.title as string,
    kind: s.kind as string,
    isSensitive: s.is_sensitive === true,
    status: s.status as string,
    version: Number(s.source_version ?? 1),
    docFamilyId: s.doc_family_id as string,
    chunks: counts.get(s.id as string) ?? 0,
  }));
}

/**
 * Delete a knowledge source row; its chunks cascade-delete via FK (migration 0051).
 * This is the operator's explicit delete and the rollback path for a failed ingest — it is NOT how
 * a document is superseded. Using it to replace a version would destroy the version history in the
 * same statement (see archiveOtherVersions).
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
    .select("id,source_version,status,content_hash,is_sensitive,space_id,canonical_url,valid_from,valid_to,locked")
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
}

function rpcArgs(s: RetrievalScope): Record<string, unknown> {
  return {
    p_scope: s.scope,
    p_spaces: s.spaces,
    p_viewer: s.viewer,
    p_as_of: s.asOf,
    p_model: s.model,
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
  return (data as Array<MatchAttribution & { id: string; source_id: string; content: string; similarity: number }>).map(
    (r) => ({ ...r, id: r.id, sourceId: r.source_id, content: r.content, similarity: Number(r.similarity) }),
  );
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
