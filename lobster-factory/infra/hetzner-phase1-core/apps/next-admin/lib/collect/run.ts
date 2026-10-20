// One call that collects everything a tenant has approved.
//
// Everything below this line already existed and was already tested; what was missing was the
// assembly — the wiring that turns "eight sources are configured" into "a crawl happened, and here
// is what it found". Without it the whole system was a library nobody could press.
//
// Assembled here, once, so the scheduled run (C3), the webhook run (C3b) and the operator's button
// are the same code path. Three call sites building their own budget and their own fetch is three
// different crawlers wearing one name.

import { crawl, type CrawlProgress, type CrawlResult, type SeedInput } from "@/lib/collect/orchestrator";
import { createBudget, type BudgetLimits } from "@/lib/collect/budget";
import { createCollectFetch } from "@/lib/collect/net/fetcher";
import { createProviderCall } from "@/lib/collect/net/providers";
import { EntitlementRequired, type Grant } from "@/lib/entitlements/can";
import { grantFor, type GrantContext } from "@/lib/entitlements/grant";
import { RateLimiter, createSupabaseRateLimitStore } from "@/lib/collect/net/rate-limit";
import { collectors } from "@/lib/collect/registry";
import { approvedSeeds, recordRunOutcome, type CollectionSource } from "@/lib/collect/sources-store";
import { persistRunReport } from "@/lib/collect/report-store";
import { createKbSink } from "@/lib/collect/sinks/kb";
import { createNullSink } from "@/lib/collect/sinks/null";
import { createSupabaseUrlStateStore } from "@/lib/collect/url-state";
import type { SinkBlock } from "@/lib/collect/types";
import { MAX_QUERIES } from "@/lib/collect/search/query-plan";
import type { WireVersion } from "@/lib/cognitive-os/research";
import "@/lib/collect/blocks"; // registering the built-in sources is the point of calling this

/**
 * A source row's own `(lastStatus)` display used to be a bare "ok" — indistinguishable from a run
 * that genuinely fetched and stored nothing (operator report, 2026-09-18: "按正式抓取後不知道抓到沒,
 * 只能去知識庫看"). Packed into the existing `last_status` column (100-char cap, sources-store.ts)
 * rather than a schema change: CollectionSourcesPanel.tsx's SourceRow already interpolates
 * `source.lastStatus` verbatim, so a richer string here reaches the UI with no frontend change.
 *
 * These are the WHOLE RUN's totals, not this one source's own contribution — the orchestrator
 * crawls every chosen source through one shared frontier/budget and never tracks per-source
 * attribution (see the Promise.all below: every chosen source gets the same summary). Labelled
 * plainly as a total rather than implying per-source precision it cannot honestly claim; for the
 * common single-source run this total IS the per-source count anyway.
 */
export function runStatusSummary(result: Pick<CrawlResult, "report" | "sink">): string {
  const base = result.report.stoppedBy === "budget" ? "stopped_by_budget" : "ok";
  const refused = result.report.dirty.length + result.report.quarantined.length + result.report.disallowed.length;
  // Off-entity is counted SEPARATELY from `擋`: they are refusals of a different kind (the page was
  // fine, it was about somebody else) and an operator reading "擋 159" cannot tell whether their
  // crawler is broken or their search engine is noisy. Shown only when it happened, so a source
  // that makes no entity claim keeps exactly the status string it had before.
  const offEntity = result.report.offEntity.length;
  const tail = offEntity ? ` 非本人${offEntity}` : "";
  return `${base} · 抓${result.report.fetched} 入庫${result.sink.written} 未變${result.sink.skipped} 擋${refused}${tail}`;
}

export interface RunCollectionOptions {
  organizationId: string;
  /** Restrict the run to specific configured sources. Omitted ⇒ everything approved. */
  sourceIds?: string[];
  /** Dry run: collect, grade, screen — store nothing. What a new source should be tried with first. */
  dryRun?: boolean;
  budget?: BudgetLimits;
  maxDepth?: number;
  runKey?: string;
  log?: (msg: string) => void;
}

export interface RunCollectionResult {
  runKey: string;
  sources: number;
  dryRun: boolean;
  report: CrawlResult["report"];
  sink: CrawlResult["sink"];
  persistedRunId: string | null;
  incidentRaised: boolean;
  errors: string[];
}

/** Defaults sized for one operator-triggered run, not for a nightly crawl of everything. */
const DEFAULT_BUDGET: BudgetLimits = { fetches: 200, bytes: 200_000_000, ms: 10 * 60_000 };

/**
 * The same format runCollection falls back to on its own, exported so a caller that needs the key
 * BEFORE the run finishes (to hand back to the browser for polling — see lib/collect/run-jobs.ts)
 * generates it identically rather than duplicating the format and risking the two drifting apart.
 *
 * A short random suffix, not just the second-precision timestamp: two runs for the same org
 * starting in the same second (two ops tabs open on one client, both pressed at once) would
 * otherwise collide both on collection_runs' (organization_id, run_key) upsert key AND on
 * run-jobs.ts's in-memory tracker — the second run's job entry would silently overwrite the
 * first's, so one tab's poller would end up reading the other run's result.
 */
export function defaultRunKey(): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `manual-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}-${suffix}`;
}

interface CrawlWithOptions {
  seeds: SeedInput[];
  sink: SinkBlock;
  budget: ReturnType<typeof createBudget>;
  tenantRef: string;
  runKey: string;
  maxDepth: number;
  durableRateLimit: boolean;
  urlState: boolean;
  keepAside: boolean;
  /** Search calls draw from this one when given (a research run), page fetches from `budget`. */
  queryBudget?: ReturnType<typeof createBudget>;
  /** The run's collect.fetch grant (paid vendors only; null = none, the free tier still crawls). */
  grant: Grant | null;
  onProgress?: (p: CrawlProgress) => void;
  log: (msg: string) => void;
}

/** The one crawl assembly (fetch, rate limit, url state, providers, blocks); every run kind goes through it. */
async function quietGateDependencies() {
  const { runtimeGateDependencies } = await import("@/lib/entitlements/runtime");
  return { ...runtimeGateDependencies(), audit: async () => {} };
}

/** One grant per run for the paid vendors. A refusal (enforce) is not a failed run: those calls fail like a missing key. */
async function collectGrant(ctx: GrantContext, log: (msg: string) => void): Promise<Grant | null> {
  try {
    return await grantFor("collect.fetch", ctx);
  } catch (e) {
    if (!(e instanceof EntitlementRequired)) throw e;
    log(`collect.fetch not granted (${e.code}): paid providers off for this run`);
    return null;
  }
}

function crawlWith(o: CrawlWithOptions): Promise<CrawlResult> {
  // A durable store here is WHY per-host politeness holds across two concurrently scheduled runs
  // (DATA_COLLECTION_PLAN.md C3 DoD) — an omitted rateLimiter would make createCollectFetch fall
  // back to `new RateLimiter()`, i.e. a fresh in-memory bucket THIS call alone can see, same gap a
  // dry run already accepts on purpose.
  const rateLimiter = new RateLimiter({ store: o.durableRateLimit ? createSupabaseRateLimitStore(o.log) : undefined });
  return crawl(o.seeds, {
    sink: o.sink,
    budget: o.budget,
    tenantRef: o.tenantRef,
    runId: o.runKey,
    maxDepth: o.maxDepth,
    flushEvery: 10,
    blocks: collectors(),
    log: o.log,
    keepAside: o.keepAside,
    onProgress: o.onProgress,
    // Off ⇒ the orchestrator's own NO_URL_STATE default: every page is fetched and delivered in full.
    urlState: o.urlState ? createSupabaseUrlStateStore() : undefined,
    fetch: createCollectFetch({ budget: o.budget, log: o.log, rateLimiter }),
    // Present only so a provider-backed tier CAN run; it still scores 0 without a key.
    callProvider: createProviderCall({ budget: o.queryBudget ?? o.budget, grant: o.grant, log: o.log }),
  });
}

/**
 * A research run's crawl-time ceiling, not overridable by the caller. It must end the crawl early enough for the
 * execute route to still send the run's completion: crawl 240 s < route maxDuration 300 s < the Trigger task's
 * request timeout 330 s < task maxDuration 400 s. Without it the 10-minute default outlives every one of those.
 */
export const RESEARCH_MAX_MS = 240_000;

/** A URL the person pasted is that one page (wire v2): its links are not hers, and following them would fill the
 *  case with the rest of the site. */
export function researchSeeds(seeds: SeedInput[]): SeedInput[] {
  return seeds.map((s) => (s.meta?.pasted === true ? { ...s, meta: { ...s.meta, maxDepth: 0 } } : s));
}

export interface ResearchCollectionOptions {
  projectId: string;
  runId: string;
  seeds: SeedInput[];
  sink: SinkBlock;
  budget?: BudgetLimits;
  /** What the engine listed at the grant exchange: "2" keeps refused pages (keepAside), "1" drops them as before. */
  wire: WireVersion;
  /** The run's counts as it goes (runs/execute keeps them for GET runs/progress). */
  onProgress?: (p: CrawlProgress) => void;
  log?: (msg: string) => void;
}

/**
 * A Cognitive OS research run (RESEARCH_LINES_MASTER_PLAN §12.7 WC-P1-12): seeds come from the request, not from
 * an organization's approved sources, and nothing is written to this app's own run bookkeeping — the run belongs to
 * the COS Project. No url state: a 304 would deliver nothing, and COS must see every page to answer "unchanged"
 * itself (plan K6, I1). The rate limiter stays durable: politeness toward a host does not depend on who asked.
 * keepAside: a refused page is labelled, never dropped (Cognitive OS wire v2, STEP2_SHARED_RULES §4.1).
 */
export async function runResearchCollection(opts: ResearchCollectionOptions): Promise<Pick<CrawlResult, "report" | "sink">> {
  const ms = Math.min(opts.budget?.ms ?? RESEARCH_MAX_MS, RESEARCH_MAX_MS);
  const budget = createBudget({ ...DEFAULT_BUDGET, ...opts.budget, ms });
  // The engine's plan shows max_queries (MAX_QUERIES per search seed) and max_fetches (pages) as two ceilings, so
  // search calls do not eat the page budget: their own count, the same clock.
  const searchSeeds = opts.seeds.filter((s) => s.uri.startsWith("entity://")).length;
  const queryBudget = createBudget({ fetches: searchSeeds * MAX_QUERIES, ms });
  const result = await crawlWith({
    seeds: researchSeeds(opts.seeds),
    sink: opts.sink,
    budget,
    tenantRef: `research:${opts.projectId}`,
    runKey: opts.runId,
    maxDepth: 2,
    durableRateLimit: true,
    urlState: false,
    keepAside: opts.wire === "2",
    queryBudget,
    // COS gated research.collect on its side (check_entitlement); here the run spends the internal account's vendors.
    grant: await collectGrant({}, opts.log ?? (() => {})),
    onProgress: opts.onProgress,
    log: opts.log ?? (() => {}),
  });
  return { report: result.report, sink: result.sink };
}

export async function runCollection(opts: RunCollectionOptions): Promise<RunCollectionResult> {
  const log = opts.log ?? (() => {});
  const runKey = opts.runKey ?? defaultRunKey();

  const all = await approvedSeeds(opts.organizationId);
  const chosen = opts.sourceIds?.length ? all.filter((p) => opts.sourceIds!.includes(p.source.id)) : all;

  if (!chosen.length) {
    return {
      runKey,
      sources: 0,
      dryRun: !!opts.dryRun,
      // An empty run is reported as an empty run. Returning "success" with no numbers is how a
      // tenant with no approved sources looks identical to a tenant whose crawl is broken.
      report: {
        fetched: 0, outOfScope: 0, unhandled: [], gone: [], dirty: [], quarantined: [],
        disallowed: [], offEntity: [], retried: 0, stoppedBy: "frontier_empty", aside: [], channels: [],
      },
      sink: { written: 0, skipped: 0 },
      persistedRunId: null,
      incidentRaised: false,
      errors: ["no_approved_sources"],
    };
  }

  const budget = createBudget({ ...DEFAULT_BUDGET, ...opts.budget });
  const sink: SinkBlock = opts.dryRun ? createNullSink() : createKbSink();
  const seeds: SeedInput[] = chosen.map((p) => p.seed);

  const result = await crawlWith({
    seeds,
    sink,
    budget,
    tenantRef: opts.organizationId,
    runKey,
    // A dry run leaves no trace anywhere: same verdict, but its audit row is not written.
    grant: await collectGrant({ orgId: opts.organizationId, ...(opts.dryRun ? { deps: await quietGateDependencies() } : {}) }, log),
    maxDepth: opts.maxDepth ?? 2,
    durableRateLimit: !opts.dryRun,
    // "A dry run leaves no trace anywhere" (see below) — a cached etag IS a trace.
    urlState: !opts.dryRun,
    keepAside: false,
    log,
  });

  // A dry run leaves no trace anywhere, including here: writing a run row for something that stored
  // nothing would put "we collected on Tuesday" into a history that did no such thing.
  let persistedRunId: string | null = null;
  let incidentRaised = false;
  const errors = [...(result.sink.errors ?? [])];

  if (!opts.dryRun) {
    const persisted = await persistRunReport({
      organizationId: opts.organizationId,
      runKey,
      seeds: chosen.map((p) => p.source.entry),
      report: result.report,
      sink: result.sink,
      budgetSpent: budget.snapshot().spent as unknown as Record<string, number>,
    });
    persistedRunId = persisted.runId;
    incidentRaised = persisted.incidentRaised;
    errors.push(...persisted.errors);

    const status = runStatusSummary(result);
    await Promise.all(
      chosen.map(({ source }: { source: CollectionSource }) =>
        recordRunOutcome(source.id, {
          status,
          error: result.sink.errors?.[0] ?? null,
        }),
      ),
    );
  }

  return {
    runKey,
    sources: chosen.length,
    dryRun: !!opts.dryRun,
    report: result.report,
    sink: result.sink,
    persistedRunId,
    incidentRaised,
    errors,
  };
}
