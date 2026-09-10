// Run budget (DATA_COLLECTION_PLAN.md §1.2).
//
// Two ceilings, because either one alone leaks: a fetch count says nothing about a single 500MB
// response, and a byte cap says nothing about ten thousand tiny pages. Wall-clock is here too, so a
// crawl inside a scheduled task cannot outlive its window.

import type { Budget, BudgetUnit } from "@/lib/collect/types";

export interface BudgetLimits {
  fetches?: number;
  bytes?: number;
  ms?: number;
}

export function createBudget(limits: BudgetLimits = {}, now: () => number = () => Date.now()): Budget {
  const lim = {
    fetches: limits.fetches ?? Number.POSITIVE_INFINITY,
    bytes: limits.bytes ?? Number.POSITIVE_INFINITY,
    ms: limits.ms ?? Number.POSITIVE_INFINITY,
  };
  const spent = { fetches: 0, bytes: 0, ms: 0 };
  const startedAt = now();

  const exhausted = (): string | null => {
    if (spent.fetches >= lim.fetches) return "fetches";
    if (spent.bytes >= lim.bytes) return "bytes";
    // Wall clock, not summed request time: a crawl that waits on rate limits still burns its window.
    if (now() - startedAt >= lim.ms) return "ms";
    return null;
  };

  return {
    spend(n: BudgetUnit) {
      spent.fetches += n.fetches ?? 0;
      spent.bytes += n.bytes ?? 0;
      spent.ms += n.ms ?? 0;
    },
    ok() {
      return exhausted() === null;
    },
    snapshot() {
      return { spent: { ...spent }, limits: { ...lim }, exhausted: exhausted() };
    },
  };
}
