// Knowledge-store data access — the ONLY place that touches cs_knowledge_* tables, via the
// service-role client (RLS = service_role only, migration 0051). Every function degrades safely:
// no client / error ⇒ empty result or no-op, never a throw that could crash a caller.
//
// K0 (ADR 011 §決策 3): moved verbatim from lib/cs/db.ts. Table names keep the cs_ prefix because
// renaming live tables is a migration, not a module move — K1 owns any schema change.

import { getSupabaseWriteClient } from "@/lib/supabase-server";

/** List knowledge sources for the ops UI, with per-source chunk counts. */
export async function listKnowledgeSources(
  organizationId: string,
): Promise<Array<{ id: string; title: string; kind: string; isSensitive: boolean; chunks: number }>> {
  const sb = getSupabaseWriteClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from("cs_knowledge_sources")
    .select("id,title,kind,is_sensitive")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  const ids = data.map((s) => s.id as string);
  const counts = new Map<string, number>();
  if (ids.length) {
    const { data: chunkRows } = await sb.from("cs_knowledge_chunks").select("source_id").in("source_id", ids);
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
    chunks: counts.get(s.id as string) ?? 0,
  }));
}

/** Delete a knowledge source; its chunks cascade-delete via FK (migration 0051). */
export async function deleteKnowledgeSource(organizationId: string, sourceId: string): Promise<boolean> {
  const sb = getSupabaseWriteClient();
  if (!sb) return false;
  const { error } = await sb.from("cs_knowledge_sources").delete().eq("organization_id", organizationId).eq("id", sourceId);
  return !error;
}

export async function insertSource(input: {
  organizationId: string;
  kind: string;
  title: string;
  isSensitive: boolean;
}): Promise<string | null> {
  const sb = getSupabaseWriteClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from("cs_knowledge_sources")
    .insert({
      organization_id: input.organizationId,
      kind: input.kind,
      title: input.title,
      is_sensitive: input.isSensitive,
    })
    .select("id")
    .single();
  if (error || !data) return null;
  return (data as { id: string }).id;
}

export interface ChunkRow {
  organizationId: string;
  sourceId: string;
  content: string;
  contextualPrefix?: string;
  embedding: number[];
  embedModel: string;
}

/** pgvector text input format: '[0.1,0.2,…]'. */
function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

export async function insertChunks(rows: ChunkRow[]): Promise<number> {
  const sb = getSupabaseWriteClient();
  if (!sb || !rows.length) return 0;
  const payload = rows.map((r) => ({
    organization_id: r.organizationId,
    source_id: r.sourceId,
    doc_family_id: r.sourceId, // 1 source = 1 family for now; supersession handled on re-ingest
    source_version: 1,
    content: r.content,
    contextual_prefix: r.contextualPrefix ?? null,
    embedding: toVectorLiteral(r.embedding),
    embed_model: r.embedModel,
  }));
  const { error } = await sb.from("cs_knowledge_chunks").insert(payload);
  return error ? 0 : rows.length;
}

export interface VectorMatch {
  id: string;
  sourceId: string;
  content: string;
  similarity: number;
}

/** Vector half of hybrid retrieval — tenant-scoped cosine match via the cs_match_chunks RPC. */
export async function matchChunksVector(
  organizationId: string,
  embedding: number[],
  limit: number,
): Promise<VectorMatch[]> {
  const sb = getSupabaseWriteClient();
  if (!sb) return [];
  const { data, error } = await sb.rpc("cs_match_chunks", {
    p_org: organizationId,
    p_embedding: toVectorLiteral(embedding),
    p_limit: limit,
  });
  if (error || !data) return [];
  return (data as Array<{ id: string; source_id: string; content: string; similarity: number }>).map((r) => ({
    id: r.id,
    sourceId: r.source_id,
    content: r.content,
    similarity: Number(r.similarity),
  }));
}

export interface KeywordMatch {
  id: string;
  content: string;
}

/**
 * Keyword half of hybrid retrieval. Postgres FTS tokenizes CJK poorly, so we use a pragmatic ILIKE
 * substring match on content (CJK-safe) as the keyword signal. Ordering feeds RRF; exact relevance
 * is the vector half's job. (Upgrade to pg_bigm / trigram later — plan §4.2.)
 */
export async function matchChunksKeyword(
  organizationId: string,
  query: string,
  limit: number,
): Promise<KeywordMatch[]> {
  const sb = getSupabaseWriteClient();
  if (!sb) return [];
  const term = query.replace(/[%_]/g, "").slice(0, 80).trim();
  if (!term) return [];
  const { data, error } = await sb
    .from("cs_knowledge_chunks")
    .select("id,content")
    .eq("organization_id", organizationId)
    .ilike("content", `%${term}%`)
    .limit(limit);
  if (error || !data) return [];
  return (data as Array<{ id: string; content: string }>).map((r) => ({ id: r.id, content: r.content }));
}
