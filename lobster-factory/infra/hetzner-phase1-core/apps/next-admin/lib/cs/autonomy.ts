// cs-engine pure decision logic — NO I/O, fully unit-testable. This is the safety core:
// every "can the AI act autonomously?" question is answered here by deterministic code, never by
// the LLM. See plan §1 (two-axis autonomy), §3.4 (action gate), §5 (guardrails).

import { CS_CRISIS_INTENT_KEY, CS_CRISIS_KEYWORDS, CS_RED_LINE_KEYWORDS, CS_SENSITIVE_KEYWORDS, CS_THREAT_INTENT_KEY, CS_THREAT_KEYWORDS, CS_THRESHOLDS } from "@/lib/cs/config";
import type { RetrievedChunk } from "@/lib/kb/types";
import type {
  CsActionKind,
  HandoffReason,
  Intent,
} from "@/lib/cs/types";

// NFKC first: full-width "ｒｅｆｕｎｄ" must hit "refund" (Codex 2026-10-15, partialreview-eb4e82c1).
// Then curly apostrophes become straight, zero-width characters go, whitespace collapses to one
// space and disappears next to CJK, on both sides: "自 殺" and "kill   myself" hit, while Latin word
// boundaries survive so "do sessions" never reads as "dose" (Codex 2026-10-16, partialreview-98a30a32).
const CJK = "\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff";
const SPACE_BY_CJK = new RegExp(`(?<=[${CJK}]) | (?=[${CJK}])`, "g");

function fold(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u00ad\u200b-\u200d\u2060\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .replace(SPACE_BY_CJK, "");
}

function hitsAny(text: string, keywords: readonly string[]): boolean {
  const t = fold(text);
  return keywords.some((k) => t.includes(fold(k)));
}

/** A3 red-line: money / identity / legal / medical. Matched anywhere ⇒ hard handoff. */
export function hitsRedLine(text: string): boolean {
  return hitsAny(text, CS_RED_LINE_KEYWORDS);
}

/** Self-harm / suicide. Matched anywhere ⇒ hard handoff with reason "crisis". */
export function hitsCrisis(text: string): boolean {
  return hitsAny(text, CS_CRISIS_KEYWORDS);
}

/** A threat to hurt other people. Matched anywhere ⇒ hard handoff with reason "threat" and an operator page. */
export function hitsThreat(text: string): boolean {
  return hitsAny(text, CS_THREAT_KEYWORDS);
}

/** Broader sensitive set (red-line + crisis + threat + complaints/escalation/emotion). */
export function hitsSensitive(text: string): boolean {
  return hitsAny(text, CS_SENSITIVE_KEYWORDS);
}

// rrfFuse moved to lib/kb/rrf.ts in K0 (ADR 011 §決策 3): it is retrieval mathematics with no
// customer-service semantics, and the retrieval path (now lib/kb/rag.ts) was its only caller.

/** Deterministic 0..99 canary roll from a stable key (message id) — same input, same bucket. */
export function canaryRoll(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 100;
}

/** True when this message falls inside the intent's canary ramp. */
export function passesCanary(canaryPct: number, roll: number): boolean {
  if (canaryPct >= 100) return true;
  if (canaryPct <= 0) return false;
  return roll < canaryPct;
}

export interface AnswerDecisionInput {
  intent: Intent;
  /** Intent-classification confidence, 0..1. */
  confidence: number;
  /** Top retrieved-chunk score, 0..1 (cosine-ish). */
  retrievalScore: number;
  /** Supervisor said the draft is grounded in retrieved context. */
  grounded: boolean;
  /** Customer message (red-line backstop scan). */
  messageText: string;
  /** Canary roll for this message (0..99). */
  roll: number;
  /** Tenant knowledge-gap floor (CisProfile.minRetrievalScore); CS_THRESHOLDS.minRetrievalScore when absent. */
  minRetrievalScore?: number;
}

export interface AnswerDecision {
  action: CsActionKind; // 'auto_sent' | 'draft' | 'handoff' | 'suppressed'
  handoffReason?: HandoffReason;
}

/**
 * The gates that need no reply to decide. The orchestrator runs them BEFORE generation, so a
 * sensitive question or an unanswerable one costs no model call (the Soulful test message of
 * 2026-10-15 paid for an Opus draft that was then thrown away as knowledge_gap). decideAnswerAction
 * runs them again first, so the order of gates is defined once.
 */
export function preGenerationGate(input: Pick<AnswerDecisionInput, "intent" | "retrievalScore" | "messageText" | "minRetrievalScore">): AnswerDecision | null {
  return safetyGate(input.intent, input.messageText) ?? knowledgeGate(input.retrievalScore, input.minRetrievalScore);
}

/** Needs neither retrieval nor a reply: checked before the first embedding call. */
export function safetyGate(intent: Intent, messageText: string): AnswerDecision | null {
  // First, so a crisis is never relabelled by the intent config or a red-line word in the same message.
  if (hitsCrisis(messageText) || (intent.key === CS_CRISIS_INTENT_KEY && intent.isSensitive)) return { action: "handoff", handoffReason: "crisis" };
  if (hitsThreat(messageText) || (intent.key === CS_THREAT_INTENT_KEY && intent.isSensitive)) return { action: "handoff", handoffReason: "threat" };
  if (intent.isSensitive || hitsRedLine(messageText)) {
    return { action: "handoff", handoffReason: intent.isSensitive ? "sensitive_intent" : "red_line" };
  }
  return null;
}

/**
 * The floor is per tenant: text-embedding-3-small puts an answerable English question at 0.41–0.73
 * against Soulful's pages and an unanswerable one at ≤0.38 (calibration 2026-10-15, WORKLOG), so the
 * global 0.5 rejected five of six answerable questions there. Calibrate from real questions, never
 * lower it to make a handoff go away.
 */
export function knowledgeGate(retrievalScore: number, minRetrievalScore: number = CS_THRESHOLDS.minRetrievalScore): AnswerDecision | null {
  return retrievalScore < minRetrievalScore ? { action: "handoff", handoffReason: "knowledge_gap" } : null;
}

/**
 * The autonomy decision. Order matters — safety gates first, autonomy last. A draft (L1) means the
 * AI wrote it but a human must press send; auto_sent (L2 + canary) means the AI sent it.
 */
export function decideAnswerAction(input: AnswerDecisionInput): AnswerDecision {
  const { intent, confidence, retrievalScore, grounded, roll } = input;
  // 1–2. Hard safety gates and the knowledge gap — these win over any per-intent config.
  const early = preGenerationGate(input);
  if (early) return early;
  // 3. Grounding — the draft must be supported.
  if (!grounded) {
    return { action: "handoff", handoffReason: "not_grounded" };
  }
  // 4. Confidence floor (per-intent override).
  if (confidence < intent.confidenceThreshold) {
    return { action: "handoff", handoffReason: "low_confidence" };
  }
  // 5. Autonomy ladder — only here do we consider sending.
  if (intent.answerLevel === "L0") {
    return { action: "handoff", handoffReason: "low_confidence" };
  }
  if (intent.answerLevel === "L1") {
    return { action: "draft" };
  }
  // L2 needs a passed exam on the intent's current golden set (plan §5.2). The ops API refuses L2
  // without one; this holds the rule when the row was edited elsewhere or the set changed since.
  if (!intent.graduated) {
    return { action: "draft" };
  }
  // L2: auto only inside the canary ramp, else still a draft.
  return passesCanary(intent.canaryPct, roll) ? { action: "auto_sent" } : { action: "draft" };
}

/** Top vector cosine similarity across retrieved chunks (0 when nothing retrieved). */
export function topScore(chunks: RetrievedChunk[]): number {
  return chunks.length ? Math.max(...chunks.map((c) => c.score)) : 0;
}
