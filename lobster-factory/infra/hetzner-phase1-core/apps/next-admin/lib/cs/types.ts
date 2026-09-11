// cs-engine shared types. Pure type module (no runtime imports) so every stage can depend on it.

/** A single inbound customer message handed to the engine (channel-agnostic). */
export interface InboundMessage {
  organizationId: string;
  /** Chatwoot conversation + message ids — message id is the idempotency key. */
  conversationId: string;
  messageId: string;
  channel: string; // 'website' | 'email' | 'telegram' | 'whatsapp' | ...
  contactRef: string; // Chatwoot contact id (per-customer memory key)
  text: string;
  /** True when the message was authored by a human agent (engine must stay silent). */
  isFromAgent: boolean;
  /** Conversation status from Chatwoot ('pending' | 'open' | 'resolved'). */
  conversationStatus: string;
  /** Whether the org is currently within configured business hours. */
  withinBusinessHours: boolean;
}

export type AnswerLevel = "L0" | "L1" | "L2";
export type ActionLevel = "A0" | "A1" | "A2";
export type ToolRisk = "A1_read" | "A2_gated_write" | "A3_human_only";

/** Per-tenant intent config (mirror of cs_intents row). */
export interface Intent {
  key: string;
  label: string;
  answerLevel: AnswerLevel;
  actionLevel: ActionLevel;
  isSensitive: boolean;
  confidenceThreshold: number;
  canaryPct: number;
}

export interface IntentClassification {
  intentKey: string;
  confidence: number; // 0..1
}

/** Agentic tool the engine may call (mirror of cs_tools row). */
export interface ToolSpec {
  name: string;
  risk: ToolRisk;
  schema: Record<string, unknown>; // JSON schema for the tool input
  isEnabled: boolean;
  description?: string;
}

/** Output of an executed (or refused) tool call. */
export interface ToolCallResult {
  toolName: string;
  risk: ToolRisk;
  status: "ok" | "denied" | "error" | "pending_confirm" | "pending_human";
  params: Record<string, unknown>;
  output?: unknown;
  reason?: string;
}

/** Independent supervisor verdict on a drafted reply. */
export interface SupervisorVerdict {
  grounded: boolean; // claims supported by retrieved chunks
  safe: boolean; // no PII leak / policy violation / off-topic
  reason: string;
}

export type CsActionKind = "auto_sent" | "draft" | "handoff" | "suppressed" | "action_taken";

/** Why a conversation was routed to a human. */
export type HandoffReason =
  | "sensitive_intent"
  | "red_line"
  | "low_confidence"
  | "knowledge_gap"
  | "not_grounded"
  | "guardrail_block"
  | "prompt_injection"
  | "engine_error"
  | "customer_requested"
  | "out_of_window"
  | "tenant_killswitch";

/** The engine's decision for one inbound message. */
export interface CsDecision {
  action: CsActionKind;
  replyText?: string;
  intentKey?: string;
  confidence?: number;
  retrievalScore?: number;
  retrievedChunkIds: string[];
  handoffReason?: HandoffReason;
  toolCalls: ToolCallResult[];
  /** Free-form trace for cs_ai_replies.metadata + Phoenix/Langfuse. */
  traceMeta: Record<string, unknown>;
}

/** Result of a single guardrail check. */
export interface GuardrailResult {
  pass: boolean;
  reason?: string;
  handoffReason?: HandoffReason;
}

/** Brand voice (mirror of content engine BrandVoiceProfile — reused, not duplicated). */
export interface BrandVoice {
  tone?: string;
  vocabulary?: string;
  sentenceStyle?: string;
  personality?: string[];
  preferWords?: string[];
  avoidWords?: string[];
  promptInjection?: string;
}

/** CS-specific persona config (organizations.metadata.client_config.csVoice). */
export interface CsVoice {
  personaName?: string;
  languages?: string[];
  formality?: "casual" | "polite" | "formal";
  honorifics?: string; // '您' | '你'
  emojiPolicy?: "none" | "sparing" | "friendly";
  greeting?: string;
  signoff?: string;
  apologyStyle?: string;
  refusalStyle?: string;
  escalationTone?: string;
  servicePrinciples?: string[];
  mission?: string;
  slogan?: string;
  brandVoice?: BrandVoice;
}

/** Non-secret Chatwoot Account API wiring (client_config.chatwoot). Tokens/signing secrets live in
 * secret-vault under `cs:chatwoot:{organizationId}:api_token` / `...:webhook_secret` — never here. */
export interface ChatwootConfig {
  accountId: number;
  baseUrl: string;
}

/** Resolved CIS for one tenant (VI colours + BI/MI voice), loaded from org metadata. */
export interface CisProfile {
  organizationId: string;
  brandColors?: { primary?: string; secondary?: string; accent?: string };
  csVoice?: CsVoice;
  /** Per-tenant kill-switch (client_config.csEnabled). Default ON; false = AI must not auto-reply. */
  csEnabled?: boolean;
  chatwoot?: ChatwootConfig;
}

// ── Offline eval (golden set → graduation gate, plan §5.2) ────────────────────
/** One golden-set case (cs_eval_cases). */
export interface EvalCase {
  question: string;
  intentKey: string;
  expectedPoints: string[];
  expectHandoff: boolean;
  isAdversarial: boolean;
}

export interface EvalCaseResult {
  question: string;
  intentKey: string;
  expectHandoff: boolean;
  didHandoff: boolean;
  covered: boolean;     // judge: answer covers expected points (meaningful only when !expectHandoff)
  pass: boolean;        // overall correct
  dangerous: boolean;   // answered confidently when it should have handed off (worst error)
  answer: string;
  judgeReason?: string;
}

export interface EvalSummary {
  organizationId: string;
  intentKey?: string;
  n: number;
  passRate: number;
  dangerousErrorRate: number; // dangerous / n
  handoffRecall: number;      // correctly-handed-off / expected-handoff (1 when none expected)
  results: EvalCaseResult[];
}

/** Graduation verdict: may this intent move L1 → L2? */
export interface IntentGrade {
  canGraduate: boolean;
  reasons: string[];
}

// KnowledgeInput / EmbeddingProvider / RetrievedChunk moved to lib/kb/types.ts in K0
// (ADR 011 §決策 3) — the KB is a general product, not a customer-service internal.
