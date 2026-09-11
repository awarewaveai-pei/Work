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

// Embedding + retrieval fan-out constants moved to lib/kb/config.ts in K0 (ADR 011 §決策 3):
// they were referenced only by the retrieval path, never by customer-service decision logic.

export const CS_TIMEOUTS = {
  classifyMs: 8_000,
  generateMs: 20_000,
  supervisorMs: 8_000,
  toolMs: 10_000,
  /** Outbound Chatwoot Account API calls (send reply/draft, toggle status). Every other outbound
   * fetch in lib/cs/ has a bound (see llm.ts); chatwoot-client.ts previously had none — an unreachable
   * Chatwoot could hang the webhook handler past a platform timeout, past even the catch block's
   * own Sentry capture. */
  chatwootMs: 10_000,
} as const;

export const CS_THRESHOLDS = {
  /** Min retrieval cosine similarity for the top chunk; below ⇒ knowledge gap ⇒ handoff. */
  minRetrievalScore: 0.5,
  /** Default intent confidence floor; per-intent override in cs_intents.confidence_threshold. */
  defaultConfidence: 0.8,
  /** Max agentic tool-call rounds per turn (chain-length cap, §3.3). */
  maxToolRounds: 4,
} as const;

/**
 * A3 red-line: money / identity / legal / medical that may NEVER be handled autonomously. Matched
 * case-insensitively (substring) in TWO places: the customer message — autonomy.ts hitsRedLine,
 * which forces handoff in decideAnswerAction — AND the tool NAME — tools.ts resolveToolDecision,
 * which forces pending_human even if the DB risk column was mis-tagged. Hitting either ⇒ human.
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
