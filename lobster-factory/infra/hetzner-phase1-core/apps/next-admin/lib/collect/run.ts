// One call that collects everything a tenant has approved.
//
// Everything below this line already existed and was already tested; what was missing was the
// assembly — the wiring that turns "eight sources are configured" into "a crawl happened, and here
// is what it found". Without it the whole system was a library nobody could press.
//
// Assembled here, once, so the scheduled run (C3), the webhook run (C3b) and the operator's button
// are the same code path. Three call sites building their own budget and their own fetch is three
// different crawlers wearing one name.

import { crawl, type CrawlResult, type SeedInput } from "@/lib/collect/orchestrator";
import { createBudget, type BudgetLimits } from "@/lib/collect/budget";
import { createCollectFetch } from "@/lib/collect/net/fetcher";
import { createProviderCall } from "@/lib/collect/net/providers";
import { RateLimiter, createSupabaseRateLimitStore } from "@/lib/collect/net/rate-limit";
import { collectors } from "@/lib/collect/registry";
import { approvedSeeds, recordRunOutcome, type CollectionSource } from "@/lib/collect/sources-store";
import { persistRunReport } from "@/lib/collect/report-store";
import { createKbSink } from "@/lib/collect/sinks/kb";
import { createNullSink } from "@/lib/collect/sinks/null";
import { createSupabaseUrlStateStore } from "@/lib/collect/url-state";
import type { SinkBlock } from "@/lib/collect/types";
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
        disallowed: [], offEntity: [], retried: 0, stoppedBy: "frontier_empty",
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

  // A durable store here is WHY per-host politeness holds across two concurrently scheduled runs
  // (DATA_COLLECTION_PLAN.md C3 DoD) — an omitted rateLimiter would make createCollectFetch fall
  // back to `new RateLimiter()`, i.e. a fresh in-memory bucket THIS call alone can see, same gap a
  // dry run already accepts on purpose (see the urlState comment just below).
  const rateLimiter = new RateLimiter({ store: opts.dryRun ? undefined : createSupabaseRateLimitStore(log) });

  const result = await crawl(seeds, {
    sink,
    budget,
    tenantRef: opts.organizationId,
    runId: runKey,
    maxDepth: opts.maxDepth ?? 2,
    flushEvery: 10,
    blocks: collectors(),
    log,
    // "A dry run leaves no trace anywhere" (see below) — a cached etag IS a trace, so a dry run gets
    // undefined here and falls back to the orchestrator's own NO_URL_STATE default instead.
    urlState: opts.dryRun ? undefined : createSupabaseUrlStateStore(),
    fetch: createCollectFetch({ budget, log, rateLimiter }),
    // Present only so a provider-backed tier CAN run; it still scores 0 without a key.
    callProvider: createProviderCall({ budget, log }),
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
