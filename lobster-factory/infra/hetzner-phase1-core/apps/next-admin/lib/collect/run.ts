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
import { RateLimiter } from "@/lib/collect/net/rate-limit";
import { collectors } from "@/lib/collect/registry";
import { approvedSeeds, recordRunOutcome, type CollectionSource } from "@/lib/collect/sources-store";
import { persistRunReport } from "@/lib/collect/report-store";
import { createKbSink } from "@/lib/collect/sinks/kb";
import { createNullSink } from "@/lib/collect/sinks/null";
import type { SinkBlock } from "@/lib/collect/types";
import "@/lib/collect/blocks"; // registering the built-in sources is the point of calling this

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

export async function runCollection(opts: RunCollectionOptions): Promise<RunCollectionResult> {
  const log = opts.log ?? (() => {});
  const runKey = opts.runKey ?? `manual-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}`;

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
        disallowed: [], retried: 0, stoppedBy: "frontier_empty",
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

  const result = await crawl(seeds, {
    sink,
    budget,
    tenantRef: opts.organizationId,
    runId: runKey,
    maxDepth: opts.maxDepth ?? 2,
    flushEvery: 10,
    blocks: collectors(),
    log,
    fetch: createCollectFetch({ budget, log }),
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

    await Promise.all(
      chosen.map(({ source }: { source: CollectionSource }) =>
        recordRunOutcome(source.id, {
          status: result.report.stoppedBy === "budget" ? "stopped_by_budget" : "ok",
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
