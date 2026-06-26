// cs-engine data access — the ONLY place that touches cs_* tables, via the service-role client
// (RLS = service_role only, migration 0051). Every function degrades safely: no client / error ⇒
// empty result or no-op, never a throw that could crash the inbound webhook.

import { getSupabaseWriteClient } from "@/lib/supabase-server";
import type {
  CsActionKind,
  EvalCase,
  Intent,
  ToolRisk,
  ToolSpec,
} from "@/lib/cs/types";

/** Load the golden-set eval cases for a tenant (optionally one intent). Degrades to []. */
export async function loadEvalCases(organizationId: string, intentKey?: string): Promise<EvalCase[]> {
  const sb = getSupabaseWriteClient();
  if (!sb) return [];
  let q = sb
    .from("cs_eval_cases")
    .select("question,intent_key,expected_points,expect_handoff,is_adversarial")
    .eq("organization_id", organizationId);
  if (intentKey) q = q.eq("intent_key", intentKey);
  const { data, error } = await q;
  if (error || !data) return [];
  return data.map((r) => ({
    question: typeof r.question === "string" ? r.question : "",
    intentKey: typeof r.intent_key === "string" ? r.intent_key : "",
    expectedPoints: Array.isArray(r.expected_points) ? (r.expected_points as unknown[]).filter((x): x is string => typeof x === "string") : [],
    expectHandoff: r.expect_handoff === true,
    isAdversarial: r.is_adversarial === true,
  }));
}

interface IntentRow {
  key: string;
  label: string;
  answer_level: string;
  action_level: string;
  is_sensitive: boolean;
  confidence_threshold: number;
  canary_pct: number;
}

function mapIntent(r: IntentRow): Intent {
  return {
    key: r.key,
    label: r.label,
    answerLevel: (r.answer_level as Intent["answerLevel"]) ?? "L1",
    actionLevel: (r.action_level as Intent["actionLevel"]) ?? "A0",
    isSensitive: !!r.is_sensitive,
    confidenceThreshold: Number(r.confidence_threshold ?? 0.8),
    canaryPct: Number(r.canary_pct ?? 0),
  };
}

export async function loadIntents(organizationId: string): Promise<Intent[]> {
  const sb = getSupabaseWriteClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from("cs_intents")
    .select("key,label,answer_level,action_level,is_sensitive,confidence_threshold,canary_pct")
    .eq("organization_id", organizationId);
  if (error || !data) return [];
  return (data as IntentRow[]).map(mapIntent);
}

/** Create or update an intent (config — ops UI). Upsert on (organization_id, key). */
export async function upsertIntent(
  organizationId: string,
  i: { key: string; label: string; answerLevel: string; actionLevel: string; isSensitive: boolean; confidenceThreshold?: number; canaryPct?: number },
): Promise<boolean> {
  const sb = getSupabaseWriteClient();
  if (!sb) return false;
  const { error } = await sb.from("cs_intents").upsert(
    {
      organization_id: organizationId,
      key: i.key,
      label: i.label,
      answer_level: i.answerLevel,
      action_level: i.actionLevel,
      is_sensitive: i.isSensitive,
      confidence_threshold: i.confidenceThreshold ?? 0.8,
      canary_pct: i.canaryPct ?? 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,key" },
  );
  return !error;
}

export async function deleteIntent(organizationId: string, key: string): Promise<boolean> {
  const sb = getSupabaseWriteClient();
  if (!sb) return false;
  const { error } = await sb.from("cs_intents").delete().eq("organization_id", organizationId).eq("key", key);
  return !error;
}

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

export async function loadEnabledTools(organizationId: string): Promise<ToolSpec[]> {
  const sb = getSupabaseWriteClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from("cs_tools")
    .select("name,risk,schema,is_enabled")
    .eq("organization_id", organizationId)
    .eq("is_enabled", true);
  if (error || !data) return [];
  return (data as Array<{ name: string; risk: string; schema: Record<string, unknown>; is_enabled: boolean }>).map((r) => ({
    name: r.name,
    risk: r.risk as ToolRisk,
    schema: r.schema ?? {},
    isEnabled: !!r.is_enabled,
  }));
}

export async function loadMemory(organizationId: string, contactRef: string): Promise<string[]> {
  const sb = getSupabaseWriteClient();
  if (!sb) return [];
  const nowIso = new Date().toISOString();
  const { data, error } = await sb
    .from("cs_customer_memory")
    .select("fact,expires_at")
    .eq("organization_id", organizationId)
    .eq("contact_ref", contactRef);
  if (error || !data) return [];
  return (data as Array<{ fact: string; expires_at: string | null }>)
    .filter((r) => !r.expires_at || r.expires_at > nowIso)
    .map((r) => r.fact);
}

export interface RecordReplyInput {
  organizationId: string;
  conversationId: string;
  messageId: string;
  intentKey?: string;
  confidence?: number;
  retrievalScore?: number;
  answerLevel?: string;
  action: CsActionKind;
  retrievedChunkIds: string[];
  model?: string;
  traceRef?: string;
  metadata?: Record<string, unknown>;
}

/** Idempotent on (organization_id, chatwoot_message_id) — re-delivered webhooks don't double-write. */
export async function recordReply(input: RecordReplyInput): Promise<void> {
  const sb = getSupabaseWriteClient();
  if (!sb) return;
  await sb.from("cs_ai_replies").upsert(
    {
      organization_id: input.organizationId,
      chatwoot_conversation_id: input.conversationId,
      chatwoot_message_id: input.messageId,
      intent_key: input.intentKey ?? null,
      confidence: input.confidence ?? null,
      retrieval_score: input.retrievalScore ?? null,
      answer_level: input.answerLevel ?? null,
      action: input.action,
      retrieved_chunk_ids: input.retrievedChunkIds,
      reasoning_trace_ref: input.traceRef ?? null,
      model: input.model ?? null,
    },
    { onConflict: "organization_id,chatwoot_message_id", ignoreDuplicates: true },
  );
}

export interface RecordActionInput {
  organizationId: string;
  conversationId: string;
  toolName: string;
  risk: ToolRisk;
  params: Record<string, unknown>;
  resultStatus: "ok" | "denied" | "error" | "pending_confirm" | "pending_human";
  confirmedBy?: string;
}

export async function recordAction(input: RecordActionInput): Promise<void> {
  const sb = getSupabaseWriteClient();
  if (!sb) return;
  await sb.from("cs_action_log").insert({
    organization_id: input.organizationId,
    chatwoot_conversation_id: input.conversationId,
    tool_name: input.toolName,
    risk: input.risk,
    params: input.params,
    result_status: input.resultStatus,
    confirmed_by: input.confirmedBy ?? null,
  });
}

// ── Knowledge store ────────────────────────────────────────────────────────────

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
