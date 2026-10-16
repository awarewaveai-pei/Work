// What a passed exam certifies, as a fingerprint. A graduation counts only while the fingerprint of
// the intent as it is now equals the one stored with the verdict: the golden set's content, the
// intent settings that change decideAnswerAction (confidence floor, sensitivity, action level) and
// the tenant's knowledge floor (client_config.kbMinRetrievalScore, or the global default).
// Recomputed on every read, so any change by any path -- replacing cases, a recreated intent, a
// direct DB edit, a threshold lowered after the pass -- revokes it without that path having to know
// (Codex 2026-10-16 partialreview-1e95d4c4 / -5c84dbcc: write-side revocation kept missing paths).
// Not covered: knowledge-base content, models and prompts (plan §5.2's re-run-on-change gate is not
// built; TASKS.md).
// Server-only (node:crypto).

import { createHash } from "node:crypto";
import type { EvalCase, IntentGraduation } from "@/lib/cs/types";

export interface BasisIntent {
  confidenceThreshold: number;
  isSensitive: boolean;
  actionLevel: string;
}

export function graduationBasis(intent: BasisIntent, cases: Array<Omit<EvalCase, "intentKey">>, knowledgeFloor: number): string {
  const normalized = cases
    .map((c) => JSON.stringify([c.question, [...c.expectedPoints], c.expectHandoff, c.isAdversarial]))
    .sort();
  const payload = JSON.stringify({
    v: 1,
    intent: [Number(intent.confidenceThreshold), intent.isSensitive, intent.actionLevel],
    knowledgeFloor: Number(knowledgeFloor),
    cases: normalized,
  });
  return createHash("sha256").update(payload).digest("hex");
}

/** A passed verdict whose fingerprint matches the intent and golden set as they are now. */
export function isCurrentGraduation(g: IntentGraduation | null, basis: string): boolean {
  return g?.status === "passed" && typeof g.basis === "string" && g.basis === basis;
}
