// cs-engine pure decision logic — NO I/O, fully unit-testable. This is the safety core:
// every "can the AI act autonomously?" question is answered here by deterministic code, never by
// the LLM. See plan §1 (two-axis autonomy), §3.4 (action gate), §5 (guardrails).

import { CS_RED_LINE_KEYWORDS, CS_SENSITIVE_KEYWORDS, CS_THRESHOLDS } from "@/lib/cs/config";
import type { RetrievedChunk } from "@/lib/kb/types";
import type {
  CsActionKind,
  HandoffReason,
  Intent,
} from "@/lib/cs/types";

// NFKC first: full-width "ｒｅｆｕｎｄ" must hit "refund" (Codex 2026-10-15, partialreview-eb4e82c1).
function hitsAny(text: string, keywords: readonly string[]): boolean {
  const t = text.normalize("NFKC").toLowerCase();
  return keywords.some((k) => t.includes(k.normalize("NFKC").toLowerCase()));
}

/** A3 red-line: money / identity / legal / medical. Matched anywhere ⇒ hard handoff. */
export function hitsRedLine(text: string): boolean {
  return hitsAny(text, CS_RED_LINE_KEYWORDS);
}

/** Broader sensitive set (red-line + complaints/escalation/emotion). */
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
}

export interface AnswerDecision {
  action: CsActionKind; // 'auto_sent' | 'draft' | 'handoff' | 'suppressed'
  handoffReason?: HandoffReason;
}

/**
 * The autonomy decision. Order matters — safety gates first, autonomy last. A draft (L1) means the
 * AI wrote it but a human must press send; auto_sent (L2 + canary) means the AI sent it.
 */
export function decideAnswerAction(input: AnswerDecisionInput): AnswerDecision {
  const { intent, confidence, retrievalScore, grounded, messageText, roll } = input;

  // 1. Hard safety gates — these win over any per-intent config.
  if (intent.isSensitive || hitsRedLine(messageText)) {
    return { action: "handoff", handoffReason: intent.isSensitive ? "sensitive_intent" : "red_line" };
  }
  // 2. Knowledge gap — never answer without support.
  if (retrievalScore < CS_THRESHOLDS.minRetrievalScore) {
    return { action: "handoff", handoffReason: "knowledge_gap" };
  }
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
  // L2: auto only inside the canary ramp, else still a draft.
  return passesCanary(intent.canaryPct, roll) ? { action: "auto_sent" } : { action: "draft" };
}

/** Top vector cosine similarity across retrieved chunks (0 when nothing retrieved). */
export function topScore(chunks: RetrievedChunk[]): number {
  return chunks.length ? Math.max(...chunks.map((c) => c.score)) : 0;
}
