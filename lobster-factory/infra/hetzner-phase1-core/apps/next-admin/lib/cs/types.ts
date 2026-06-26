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

export interface RetrievedChunk {
  id: string;
  sourceId: string;
  content: string;
  score: number; // fused relevance score (higher = better)
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
  | "out_of_window";

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

/** Pluggable embedding provider (OpenAI now; bge-m3 self-host later — D3). */
export interface EmbeddingProvider {
  id: string; // recorded in cs_knowledge_chunks.embed_model
  dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
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

/** Resolved CIS for one tenant (VI colours + BI/MI voice), loaded from org metadata. */
export interface CisProfile {
  organizationId: string;
  brandColors?: { primary?: string; secondary?: string; accent?: string };
  csVoice?: CsVoice;
  /** Per-tenant kill-switch (client_config.csEnabled). Default ON; false = AI must not auto-reply. */
  csEnabled?: boolean;
}

/** A knowledge document to ingest into the RAG store. */
export interface KnowledgeInput {
  organizationId: string;
  kind: "doc" | "faq" | "sop" | "conversation" | "url";
  title: string;
  body: string;
  isSensitive?: boolean;
}
