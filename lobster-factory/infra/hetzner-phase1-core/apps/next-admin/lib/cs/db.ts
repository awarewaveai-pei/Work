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

// Knowledge store (insertSource / insertChunks / matchChunks* / listKnowledgeSources /
// deleteKnowledgeSource) moved to lib/kb/db.ts in K0 (ADR 011 §決策 3). The cs engine now consumes
// the KB through its public surface (@/lib/kb), like any other consumer.
