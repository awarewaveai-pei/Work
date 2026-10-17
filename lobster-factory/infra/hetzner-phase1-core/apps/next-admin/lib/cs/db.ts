// cs-engine data access — the ONLY place that touches cs_* tables, via the service-role client
// (RLS = service_role only, migration 0051). Every function degrades safely: no client / error ⇒
// empty result or no-op, never a throw that could crash the inbound webhook.

import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { graduationBasis, isCurrentGraduation } from "@/lib/cs/graduation";
import { kbMinRetrievalScoreOf } from "@/lib/cs/cis";
import { CS_THRESHOLDS } from "@/lib/cs/config";
import type {
  CsActionKind,
  EvalCase,
  Intent,
  IntentGraduation,
  ToolRisk,
  ToolSpec,
} from "@/lib/cs/types";

function mapEvalCase(r: Record<string, unknown>): EvalCase {
  return {
    question: typeof r.question === "string" ? r.question : "",
    intentKey: typeof r.intent_key === "string" ? r.intent_key : "",
    expectedPoints: Array.isArray(r.expected_points) ? (r.expected_points as unknown[]).filter((x): x is string => typeof x === "string") : [],
    expectHandoff: r.expect_handoff === true,
    isAdversarial: r.is_adversarial === true,
  };
}

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
  return data.map(mapEvalCase);
}

interface IntentRow {
  key: string;
  label: string;
  answer_level: string;
  action_level: string;
  is_sensitive: boolean;
  confidence_threshold: number;
  canary_pct: number;
  metadata?: Record<string, unknown> | null;
}

const INTENT_COLUMNS = "key,label,answer_level,action_level,is_sensitive,confidence_threshold,canary_pct,metadata";

/** The graduation record inside cs_intents.metadata, or null when absent / malformed. */
export function graduationOf(metadata: unknown): IntentGraduation | null {
  const g = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).graduation : undefined;
  if (!g || typeof g !== "object") return null;
  const status = (g as Record<string, unknown>).status;
  return status === "running" || status === "passed" || status === "failed" ? (g as IntentGraduation) : null;
}

/** The knowledge floor the engine applies for a tenant (the same rule as orchestrator planReply). */
export function knowledgeFloorOf(clientConfig: Record<string, unknown> | null | undefined): number {
  return kbMinRetrievalScoreOf(clientConfig?.kbMinRetrievalScore) ?? CS_THRESHOLDS.minRetrievalScore;
}

export async function loadKnowledgeFloor(organizationId: string): Promise<number> {
  const sb = getSupabaseWriteClient();
  if (!sb) return CS_THRESHOLDS.minRetrievalScore;
  const { data } = await sb.from("organizations").select("metadata").eq("id", organizationId).maybeSingle();
  const metadata = (data as { metadata?: { client_config?: Record<string, unknown> } } | null)?.metadata;
  return knowledgeFloorOf(metadata?.client_config);
}

/** Whether the row's passed exam still certifies it: same golden set, decision settings and floor. */
export function rowGraduated(r: IntentRow, cases: EvalCase[], knowledgeFloor: number): boolean {
  const basis = graduationBasis(
    { confidenceThreshold: Number(r.confidence_threshold ?? 0.8), isSensitive: !!r.is_sensitive, actionLevel: r.action_level ?? "A0" },
    cases,
    knowledgeFloor,
  );
  return isCurrentGraduation(graduationOf(r.metadata), basis);
}

function mapIntent(r: IntentRow, cases: EvalCase[], knowledgeFloor: number): Intent {
  return {
    key: r.key,
    label: r.label,
    answerLevel: (r.answer_level as Intent["answerLevel"]) ?? "L1",
    actionLevel: (r.action_level as Intent["actionLevel"]) ?? "A0",
    isSensitive: !!r.is_sensitive,
    confidenceThreshold: Number(r.confidence_threshold ?? 0.8),
    canaryPct: Number(r.canary_pct ?? 0),
    graduated: rowGraduated(r, cases, knowledgeFloor),
    ...handoffReplyOf(r.metadata),
  };
}

/** A tenant's golden set grouped by intent key. */
export async function loadEvalCasesByIntent(organizationId: string): Promise<Map<string, EvalCase[]>> {
  const out = new Map<string, EvalCase[]>();
  for (const c of await loadEvalCases(organizationId)) {
    const list = out.get(c.intentKey) ?? [];
    list.push(c);
    out.set(c.intentKey, list);
  }
  return out;
}

export async function loadIntents(organizationId: string): Promise<Intent[]> {
  const sb = getSupabaseWriteClient();
  if (!sb) return [];
  const [{ data, error }, cases, floor] = await Promise.all([
    sb.from("cs_intents").select(INTENT_COLUMNS).eq("organization_id", organizationId),
    loadEvalCasesByIntent(organizationId),
    loadKnowledgeFloor(organizationId),
  ]);
  if (error || !data) return [];
  return (data as IntentRow[]).map((r) => mapIntent(r, cases.get(r.key) ?? [], floor));
}

/** One intent; `after` evaluates graduation as if those fields were already saved (a PATCH that
 * changes a decision setting together with L2 must be judged on the settings it will leave). */
export async function loadIntent(organizationId: string, key: string, after: IntentFields = {}): Promise<Intent | null> {
  const sb = getSupabaseWriteClient();
  if (!sb) return null;
  const [{ data, error }, cases, floor] = await Promise.all([
    sb.from("cs_intents").select(INTENT_COLUMNS).eq("organization_id", organizationId).eq("key", key).maybeSingle(),
    loadEvalCases(organizationId, key),
    loadKnowledgeFloor(organizationId),
  ]);
  if (error || !data) return null;
  const row = { ...(data as IntentRow), ...intentColumns(after) } as IntentRow;
  return mapIntent(row, cases, floor);
}

/** The intent's own handoff acknowledgement, when the operator wrote one. */
function handoffReplyOf(metadata: unknown): { handoffReply?: string } {
  const v = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).handoffReply : undefined;
  return typeof v === "string" && v.trim() ? { handoffReply: v.trim() } : {};
}

export interface IntentFields {
  label?: string;
  answerLevel?: string;
  actionLevel?: string;
  isSensitive?: boolean;
  confidenceThreshold?: number;
  canaryPct?: number;
  /** null clears it. Lives in metadata, not a column; it never changes a decision, only the words. */
  handoffReply?: string | null;
}

/** Columns for exactly the fields given. A field the caller did not send is never written, so a
 * save from a screen that does not show canary_pct or confidence_threshold cannot reset them
 * (2026-10-16: every save from the 客服 tab wrote canary_pct 0 and confidence_threshold 0.8). */
export function intentColumns(f: IntentFields): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  if (f.label !== undefined) c.label = f.label;
  if (f.answerLevel !== undefined) c.answer_level = f.answerLevel;
  if (f.actionLevel !== undefined) c.action_level = f.actionLevel;
  if (f.isSensitive !== undefined) c.is_sensitive = f.isSensitive;
  if (f.confidenceThreshold !== undefined) c.confidence_threshold = f.confidenceThreshold;
  if (f.canaryPct !== undefined) c.canary_pct = f.canaryPct;
  return c;
}

/** Create or update an intent (config — ops UI). Upsert on (organization_id, key); a new row takes
 * the table defaults for every field not given, an existing row keeps them. */
export async function upsertIntent(organizationId: string, i: IntentFields & { key: string; label: string }): Promise<boolean> {
  const sb = getSupabaseWriteClient();
  if (!sb) return false;
  const { error } = await sb.from("cs_intents").upsert(
    { organization_id: organizationId, key: i.key, ...intentColumns(i), updated_at: new Date().toISOString() },
    { onConflict: "organization_id,key" },
  );
  return !error;
}

/** Change fields of an existing intent. */
export async function updateIntent(organizationId: string, key: string, f: IntentFields): Promise<"ok" | "not_found" | "error"> {
  const sb = getSupabaseWriteClient();
  if (!sb) return "error";
  if (f.handoffReply !== undefined) {
    const reply = f.handoffReply;
    const r = await writeIntentMetadata(organizationId, key, (m) => {
      if (reply) m.handoffReply = reply;
      else delete m.handoffReply;
      return m;
    }, { columns: intentColumns(f) });
    return r === "superseded" ? "error" : r;
  }
  const patch: Record<string, unknown> = { ...intentColumns(f), updated_at: new Date().toISOString() };
  const { data, error } = await sb
    .from("cs_intents")
    .update(patch)
    .eq("organization_id", organizationId)
    .eq("key", key)
    .select("key");
  if (error) return "error";
  return data && data.length > 0 ? "ok" : "not_found";
}

/** cs_intents.metadata of one intent; null when the intent is missing or unreadable. */
export async function loadIntentMetadata(organizationId: string, key: string): Promise<Record<string, unknown> | null> {
  const sb = getSupabaseWriteClient();
  if (!sb) return null;
  const { data, error } = await sb.from("cs_intents").select("metadata").eq("organization_id", organizationId).eq("key", key).maybeSingle();
  if (error || !data) return null;
  return (data as { metadata?: Record<string, unknown> | null }).metadata ?? {};
}

/**
 * Replace (or, with null, remove) the intent's graduation record, keeping the rest of metadata.
 * With ifRunId the write is one conditional UPDATE: it lands only while the stored record still
 * belongs to that run, so a run whose set was replaced (record removed) or that a newer run took
 * over can never write its verdict (Codex 2026-10-16, partialreview-1e95d4c4 F1). cs_intents.metadata
 * has no other writer; the read-merge-write keeps any key added later.
 */
export async function setIntentGraduation(
  organizationId: string,
  key: string,
  graduation: IntentGraduation | null,
  opts: { ifRunId?: string } = {},
): Promise<"ok" | "superseded" | "error"> {
  const r = await writeIntentMetadata(organizationId, key, (m) => {
    if (graduation) m.graduation = graduation;
    else delete m.graduation;
    return m;
  }, { ifRunId: opts.ifRunId });
  return r === "not_found" ? "error" : r;
}

/**
 * The one way cs_intents.metadata is written. Each writer changes only its own key (graduation,
 * handoffReply) on a fresh copy and lands it with compare-and-swap on updated_at, retrying on a lost
 * race, so two keys written at once never erase each other (Codex 2026-10-17 partialreview-a6f3a261).
 * ifRunId additionally requires the stored graduation to belong to that exam run.
 */
async function writeIntentMetadata(
  organizationId: string,
  key: string,
  mutate: (metadata: Record<string, unknown>) => Record<string, unknown>,
  opts: { ifRunId?: string; columns?: Record<string, unknown> } = {},
): Promise<"ok" | "not_found" | "superseded" | "error"> {
  const sb = getSupabaseWriteClient();
  if (!sb) return "error";
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: row, error: readErr } = await sb
      .from("cs_intents").select("metadata,updated_at").eq("organization_id", organizationId).eq("key", key).maybeSingle();
    if (readErr) return "error";
    if (!row) return "not_found";
    const current = (row as { metadata?: Record<string, unknown> | null; updated_at: string });
    if (opts.ifRunId && graduationOf(current.metadata)?.runId !== opts.ifRunId) return "superseded";
    const metadata = mutate({ ...(current.metadata ?? {}) });
    let q = sb
      .from("cs_intents")
      .update({ ...opts.columns, metadata, updated_at: new Date().toISOString() })
      .eq("organization_id", organizationId)
      .eq("key", key)
      .eq("updated_at", current.updated_at);
    if (opts.ifRunId) q = q.eq("metadata->graduation->>runId", opts.ifRunId);
    const { data, error } = await q.select("key");
    if (error) return "error";
    if (data && data.length > 0) return "ok";
    // Lost the race: someone wrote the row since the read. Read again and re-apply only our key.
  }
  return "error";
}

/** Every intent's graduation record for a tenant, by intent key. */
export async function loadGraduations(organizationId: string): Promise<Map<string, IntentGraduation>> {
  const out = new Map<string, IntentGraduation>();
  const sb = getSupabaseWriteClient();
  if (!sb) return out;
  const { data, error } = await sb.from("cs_intents").select("key,metadata").eq("organization_id", organizationId);
  if (error || !data) return out;
  for (const r of data as Array<{ key: string; metadata: unknown }>) {
    const g = graduationOf(r.metadata);
    if (g) out.set(r.key, g);
  }
  return out;
}

export interface EvalCaseRow extends EvalCase {
  id: string;
}

export async function listEvalCases(organizationId: string): Promise<EvalCaseRow[]> {
  const sb = getSupabaseWriteClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from("cs_eval_cases")
    .select("id,question,intent_key,expected_points,expect_handoff,is_adversarial")
    .eq("organization_id", organizationId)
    .order("created_at");
  if (error || !data) return [];
  return data.map((r) => ({ id: String(r.id), ...mapEvalCase(r) }));
}

/** Replace one intent's golden set. The graduation goes FIRST: it was earned on the old set, and
 * with no transaction across the three writes, every later failure must leave the intent ungraduated
 * (L2 drafts) rather than certified on cases nobody examined (Codex 2026-10-16, partialreview-1e95d4c4
 * F2). New cases are inserted before the old ones are deleted, so a failed insert keeps the old set;
 * a failed delete leaves both sets, and the next replace removes them all. */
export async function replaceEvalCases(organizationId: string, intentKey: string, cases: Omit<EvalCase, "intentKey">[]): Promise<boolean> {
  const sb = getSupabaseWriteClient();
  if (!sb) return false;
  if ((await setIntentGraduation(organizationId, intentKey, null)) !== "ok") return false;
  const { data: old, error: readErr } = await sb.from("cs_eval_cases").select("id").eq("organization_id", organizationId).eq("intent_key", intentKey);
  if (readErr) return false;
  if (cases.length > 0) {
    const { error: insErr } = await sb.from("cs_eval_cases").insert(
      cases.map((c) => ({
        organization_id: organizationId,
        intent_key: intentKey,
        question: c.question,
        expected_points: c.expectedPoints,
        expect_handoff: c.expectHandoff,
        is_adversarial: c.isAdversarial,
      })),
    );
    if (insErr) return false;
  }
  const oldIds = (old ?? []).map((r) => r.id as string);
  if (oldIds.length > 0) {
    const { error: delErr } = await sb.from("cs_eval_cases").delete().eq("organization_id", organizationId).in("id", oldIds);
    if (delErr) return false;
  }
  return true;
}

/** Delete an intent together with its golden set: the cases belong to it, and an intent recreated
 * under the same key must not inherit questions written for the old one. */
export async function deleteIntent(organizationId: string, key: string): Promise<boolean> {
  const sb = getSupabaseWriteClient();
  if (!sb) return false;
  const { error: casesErr } = await sb.from("cs_eval_cases").delete().eq("organization_id", organizationId).eq("intent_key", key);
  if (casesErr) return false;
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

/**
 * Writes the final decision for one message. Upserts WITHOUT ignoreDuplicates — this is deliberate:
 * the webhook route (app/api/webhooks/chatwoot/route.ts) calls claimMessage() first, which inserts a
 * 'handoff' PLACEHOLDER row to win the race against a concurrent redelivery; this call's job is to
 * OVERWRITE that placeholder with the real decision once the pipeline finishes. If this ever used
 * ignoreDuplicates again, every real decision would silently vanish behind its own placeholder claim.
 */
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
    { onConflict: "organization_id,chatwoot_message_id" },
  );
}

export interface ClaimRef {
  organizationId: string;
  conversationId: string;
  messageId: string;
}

/**
 * Claims older than `olderThanMs` whose outcome never reached Chatwoot (migration 0099). Throws on a
 * query error: an empty answer would read as "nothing to hand off" and hide every lost message.
 */
export async function listUnfinishedClaims(olderThanMs: number, limit = 50): Promise<ClaimRef[]> {
  const sb = getSupabaseWriteClient();
  if (!sb) throw new Error("cs_unfinished_claims: no supabase client");
  const { data, error } = await sb
    .from("cs_ai_replies")
    .select("organization_id,chatwoot_conversation_id,chatwoot_message_id")
    .is("completed_at", null)
    .lt("created_at", new Date(Date.now() - olderThanMs).toISOString())
    .order("created_at")
    .limit(limit);
  if (error) throw new Error(`cs_unfinished_claims: ${error.message}`);
  return (data ?? []).map((r) => ({
    organizationId: r.organization_id as string,
    conversationId: r.chatwoot_conversation_id as string,
    messageId: r.chatwoot_message_id as string,
  }));
}

/**
 * Mark a claim's outcome as delivered (reply sent / handed to a human / nothing to send). Only a row
 * still unfinished is touched, so the webhook and the sweep never both close one. Returns false when
 * the row was already closed; throws when the write failed (never reported as "already closed").
 */
export async function completeClaim(c: ClaimRef): Promise<boolean> {
  const sb = getSupabaseWriteClient();
  if (!sb) throw new Error("cs_complete_claim: no supabase client");
  const { data, error } = await sb
    .from("cs_ai_replies")
    .update({ completed_at: new Date().toISOString() })
    .eq("organization_id", c.organizationId)
    .eq("chatwoot_message_id", c.messageId)
    .is("completed_at", null)
    .select("chatwoot_message_id");
  if (error) throw new Error(`cs_complete_claim ${c.organizationId}/${c.messageId}: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
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

/**
 * Resolve which organization a Chatwoot webhook belongs to, by the numeric Account id Chatwoot puts
 * in every payload. No dedicated mapping table (0051 predates Chatwoot existing) — reuses the same
 * `organizations.metadata.client_config.chatwoot.accountId` JSONB field cis.ts reads, queried
 * unindexed. Fine at current scale (single-digit tenants); revisit with a real index/column once
 * account count grows past a handful.
 */
export async function findOrganizationIdByChatwootAccountId(accountId: number): Promise<string | null> {
  const sb = getSupabaseWriteClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from("organizations")
    .select("id")
    .eq("metadata->client_config->chatwoot->>accountId", String(accountId))
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return typeof data.id === "string" ? data.id : null;
}

/**
 * Atomic claim on (organization_id, chatwoot_message_id) via a plain INSERT against the existing
 * unique constraint (0051_cs_core.sql) — NOT a check-then-act read. Two concurrent webhook deliveries
 * for the same message (a realistic race: CS_TIMEOUTS allows the pipeline to run 30-60s+, comfortably
 * longer than a typical webhook-sender retry window) race on this INSERT; Postgres's unique
 * constraint guarantees exactly one wins. The loser gets `false` back immediately and must not run
 * the pipeline or call Chatwoot at all — running it twice means the customer gets two replies.
 *
 * `action: 'handoff'` is a placeholder, not the real decision (which isn't known yet) — chosen
 * because it's this system's universal fail-safe value (plan §8.4: never guess, default to human),
 * so a row that's claimed-but-never-overwritten (process crash between claim and persist) still
 * reads as "needs a human," never as a false "auto_sent". `recordReply` (above) OVERWRITES this row
 * once the true decision is known — that upsert must stay non-ignoreDuplicates for that to work.
 * The claim leaves `completed_at` NULL until the outcome reaches Chatwoot (completeClaim);
 * lib/cs/sweep.ts hands rows that stay NULL to a human.
 */
export type ClaimResult = "claimed" | "duplicate" | "error";

/**
 * "duplicate" (Postgres 23505, the unique-violation code) means a concurrent delivery of the SAME
 * message already won the race — correct to silently no-op. Any OTHER error (network blip, RLS
 * misconfig, pool exhaustion) is NOT the same thing and must not be treated as one: collapsing both
 * into a bare boolean would make the caller respond 200 "deduped" to what is actually a lost, never-
 * retried customer message (Chatwoot only redelivers on 429/500, so 200 is final) — silently and
 * permanently violating the "never guess, default to human" rule this whole engine is built on.
 */
export async function claimMessage(organizationId: string, conversationId: string, messageId: string): Promise<ClaimResult> {
  const sb = getSupabaseWriteClient();
  if (!sb) return "error"; // no DB ⇒ caller must fail loud, not silently pretend "duplicate"
  const { error } = await sb.from("cs_ai_replies").insert({
    organization_id: organizationId,
    chatwoot_conversation_id: conversationId,
    chatwoot_message_id: messageId,
    action: "handoff",
    retrieved_chunk_ids: [],
  });
  if (!error) return "claimed";
  return error.code === "23505" ? "duplicate" : "error";
}
