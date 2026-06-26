// cs-engine config — models, thresholds, and the HARD red-lines.
//
// Everything tunable lives here so the pipeline files stay logic-only. The red-line constants
// (A3 keywords, MAX_REFUND_CENTS) are deliberately code constants, NOT DB config — an LLM (or a
// compromised DB row) must never be able to raise the ceiling on money / identity actions.
// See agency-os/docs/Customer_service/Customer_service_automation_plan.md §3.4, §14.

export const CS_MODELS = {
  /** Cheap, fast — intent classification + supervisor grounding verdict. */
  classify: "claude-haiku-4-5-20251001",
  supervisor: "claude-haiku-4-5-20251001",
  /** Main customer-facing generation. */
  generate: "claude-sonnet-4-6",
  /** Cross-provider failover when Claude errors/times out. */
  geminiFallback: "gemini-2.0-flash-lite",
} as const;

/** OpenAI embeddings (pluggable — see rag.ts EmbeddingProvider). small = 1536 dims. */
export const CS_EMBEDDING = {
  provider: "openai" as const,
  model: "text-embedding-3-small",
  dimensions: 1536,
} as const;

export const CS_TIMEOUTS = {
  classifyMs: 8_000,
  generateMs: 20_000,
  supervisorMs: 8_000,
  embedMs: 10_000,
  toolMs: 10_000,
} as const;

export const CS_THRESHOLDS = {
  /** Min retrieval cosine similarity for the top chunk; below ⇒ knowledge gap ⇒ handoff. */
  minRetrievalScore: 0.5,
  /** Default intent confidence floor; per-intent override in cs_intents.confidence_threshold. */
  defaultConfidence: 0.8,
  /** Hybrid retrieval fan-out before fusion. */
  vectorTopK: 24,
  keywordTopK: 24,
  /** Chunks injected into the generation prompt. */
  contextTopK: 4,
  /** RRF constant (k). */
  rrfK: 60,
  /** Max agentic tool-call rounds per turn (chain-length cap, §3.3). */
  maxToolRounds: 4,
} as const;

/**
 * A3 red-line: actions / intents that may NEVER be executed autonomously, regardless of model
 * confidence or per-intent config. Matched case-insensitively against intent keys, tool risk, and
 * (as a backstop) the customer message. Hitting any ⇒ forced human handoff.
 */
export const CS_RED_LINE_KEYWORDS = [
  "refund", "退款", "退費", "chargeback", "扣款", "退訂",
  "password", "密碼", "reset account", "帳號變更", "改密碼", "身分驗證", "identity",
  "delete account", "刪除帳號", "刪除資料", "delete my data",
  "legal", "法律", "lawsuit", "合約爭議", "醫療", "medical", "診斷",
] as const;

/** Sensitive intents → always handoff (broader than red-line; includes complaints/escalation). */
export const CS_SENSITIVE_KEYWORDS = [
  ...CS_RED_LINE_KEYWORDS,
  "complaint", "投訴", "客訴", "申訴", "退貨爭議", "情緒", "威脅", "threaten",
] as const;

/**
 * Hard ceiling for any money-moving tool, as a CODE constant. The A2 gate (tools.ts) refuses any
 * tool call whose amount exceeds this; only a human can authorize beyond it. Cents to avoid floats.
 */
export const MAX_REFUND_CENTS = 0; // 0 = no autonomous money movement at all in U1; raise deliberately later.
