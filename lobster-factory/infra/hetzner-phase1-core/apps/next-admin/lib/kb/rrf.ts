// Reciprocal Rank Fusion — the ranking half of hybrid retrieval. Pure, unit-tested.
//
// K0 (ADR 011 §決策 3): moved verbatim from lib/cs/autonomy.ts. It sat in the customer-service
// "safety core" file only by accident of history — RRF is retrieval mathematics with no
// customer-service semantics, and lib/cs/rag.ts was its only caller.

import { KB_RETRIEVAL } from "@/lib/kb/config";

/**
 * Reciprocal Rank Fusion of several ranked id lists (hybrid search: vector + keyword).
 * score(id) = Σ 1 / (k + rank_in_list). Returns ids sorted by fused score, descending.
 */
export function rrfFuse(
  rankings: string[][],
  k: number = KB_RETRIEVAL.rrfK,
): Array<{ id: string; score: number }> {
  const scores = new Map<string, number>();
  for (const list of rankings) {
    list.forEach((id, idx) => {
      const inc = 1 / (k + idx + 1);
      scores.set(id, (scores.get(id) ?? 0) + inc);
    });
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}
