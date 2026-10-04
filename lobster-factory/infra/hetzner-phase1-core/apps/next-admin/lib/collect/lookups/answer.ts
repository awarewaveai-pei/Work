// Collect lookups v1: what the cognitive platform asks instead of reaching outside itself (operator 2026-09-17: the
// platform has no data collection of its own; 2026-10-04: each block is built separately, collect is the searcher).
// Every outside call goes through collect's fetcher (R6): its address guard, per-host rate limit and timeouts.

import { createBudget } from "@/lib/collect/budget";
import { createCollectFetch } from "@/lib/collect/net/fetcher";
import { RateLimiter, createSupabaseRateLimitStore } from "@/lib/collect/net/rate-limit";
import type { LookupAnswer, LookupRequest } from "@/lib/collect/lookups/contract";
import { describe, type DescribeDeps, type LookupFetch } from "@/lib/collect/lookups/describe";
import { factcheck, type FactcheckDeps } from "@/lib/collect/lookups/factcheck";
import {
  REFRESH_EVERY_HOURS,
  RETRY_AFTER_HOURS,
  refreshClaimReview,
  supabaseClaimReviewStore,
  type ClaimReviewStore,
} from "@/lib/collect/lookups/claimreview";
import { FACTCHECK } from "@/lib/collect/lookups/lists";

export type LookupDeps = DescribeDeps & FactcheckDeps;

export async function answerLookup(request: LookupRequest, deps: LookupDeps): Promise<LookupAnswer> {
  if (request.kind === "describe") return { kind: "describe", items: await describe(request.urls, deps) };
  return { kind: "factcheck", items: await factcheck(request.texts, deps, request.dbs) };
}

/**
 * robots.txt is not consulted (`robots: null`, deliberately): every host asked here is a documented query API —
 * a registry's RDAP, the archive's replay address, Cofacts' GraphQL, Data Commons' feed — not a site being crawled.
 */
export function lookupFetch(log: (msg: string) => void): LookupFetch {
  return createCollectFetch({
    budget: createBudget({ fetches: 120 }),
    robots: null,
    // 1 request/s per host: 25 sites queue ~24 s on one registry. A wait over 25 s plus a 10 s call would pass the
    // 38 s deadline, so it is refused at once and that cell says why (contract.ts whyFailed).
    rateLimiter: new RateLimiter({ store: createSupabaseRateLimitStore(log), maxWaitMs: 25_000 }),
    timeoutMs: 10_000,
    deadlineMs: 35_000,
    maxBytes: 2_000_000,
    postHosts: [new URL(FACTCHECK.cofacts.apiUrl).hostname],
    log,
  });
}

export function lookupDeps(log: (msg: string) => void): LookupDeps {
  return { fetch: lookupFetch(log), claimreview: supabaseClaimReviewStore() };
}

/** The feed download: one long streamed call (the feed was 207 MB on 2026-10-02), never held in memory. */
function feedFetch(log: (msg: string) => void): LookupFetch {
  return createCollectFetch({
    budget: createBudget({ fetches: 5 }),
    robots: null,
    timeoutMs: 15 * 60_000,
    deadlineMs: 16 * 60_000,
    maxBytes: 512 * 1024 * 1024,
    log,
  });
}

/**
 * Called by the hourly collection heartbeat after it has answered (R4: a public dataset refreshed on collect's own
 * schedule, never per case). Starts a refresh when the last success is REFRESH_EVERY_HOURS old and the last attempt
 * RETRY_AFTER_HOURS old, for one process at a time; a failed refresh is retried the next hour. Never throws.
 */
export async function refreshClaimReviewIfDue(opts: {
  log: (msg: string) => void;
  store?: ClaimReviewStore | null;
  fetch?: LookupFetch;
}): Promise<void> {
  try {
    const store = opts.store === undefined ? supabaseClaimReviewStore() : opts.store;
    if (!store) {
      opts.log("claimreview refresh skipped: no Supabase client");
      return;
    }
    if (!(await store.beginRefresh(REFRESH_EVERY_HOURS, RETRY_AFTER_HOURS))) return;
    await refreshClaimReview({ fetch: opts.fetch ?? feedFetch(opts.log), store, log: opts.log });
  } catch (e) {
    opts.log(`claimreview refresh not started: ${String(e).slice(0, 200)}`);
  }
}
