// Persist what a crawl found, and raise an incident when it found trouble (C2).
//
// The gap this closes: the quality gate refuses a page, the refusal lives in a RunReport object, the
// process exits, and nobody ever learns that the customer's FAQ stopped being collected three weeks
// ago. A gate whose verdicts nobody sees is the same as no gate — worse, because it reads like one.
//
// The alert deliberately goes through the ops-inbox incident pipeline rather than sending its own
// message: that pipeline already has fingerprint de-duplication (the same site failing every hour is
// one incident with a rising count), storm correlation, severity rules, and the Telegram/Slack
// fan-out with its own throttles. A second notifier next to it would be a second set of all of that,
// and the one that stops working would be the one nobody is watching.

import { getSupabaseWriteClient } from "@/lib/supabase-server";
import type { CollectIssue, RunReport, SinkReport } from "@/lib/collect/types";

export interface PersistArgs {
  organizationId: string;
  runKey: string;
  seeds: string[];
  report: RunReport;
  sink: SinkReport;
  budgetSpent: Record<string, number>;
  startedAt?: string;
}

export interface PersistResult {
  runId: string | null;
  issuesWritten: number;
  incidentRaised: boolean;
  errors: string[];
}

/** Issue rows, flattened out of the report's separate buckets. */
function issueRows(report: RunReport): Array<{ kind: CollectIssueKind; issue: CollectIssue }> {
  return [
    ...report.dirty.map((issue) => ({ kind: "dirty" as const, issue })),
    ...report.quarantined.map((issue) => ({ kind: "quarantined" as const, issue })),
    ...report.disallowed.map((issue) => ({ kind: "disallowed" as const, issue })),
    ...report.gone.map((uri) => ({ kind: "gone" as const, issue: { uri, reason: "http_gone" } })),
  ];
}

type CollectIssueKind = "dirty" | "quarantined" | "disallowed" | "gone";

/**
 * Decide whether this run is worth waking someone for, and how loudly.
 *
 * Refusals are NORMAL in small numbers — a site has a login page, a PDF, a page behind robots. What
 * is not normal is a run that stored nothing while refusing plenty, which is what "the crawl is
 * quietly broken" looks like from the outside.
 */
export function severityFor(report: RunReport, sink: SinkReport): "low" | "medium" | "high" | null {
  const refused = report.dirty.length + report.quarantined.length;
  if (refused === 0) return null;
  const attempted = report.fetched + refused + report.gone.length;

  // Nothing stored at all, and pages were refused: the collection is not working, whatever the
  // reason. This is the case that must never be silent.
  if (sink.written === 0 && refused > 0) return "high";
  // Planted instructions are always worth a human look, however few.
  if (report.quarantined.length > 0) return "high";
  if (attempted > 0 && refused / attempted >= 0.5) return "medium";
  return "low";
}

export async function persistRunReport(args: PersistArgs): Promise<PersistResult> {
  const result: PersistResult = { runId: null, issuesWritten: 0, incidentRaised: false, errors: [] };
  const sb = getSupabaseWriteClient();
  if (!sb) {
    result.errors.push("no_supabase_client");
    return result;
  }

  const spent = args.budgetSpent ?? {};
  // A resumed run keeps its key, so the row is updated rather than duplicated — "the run" is one
  // thing even when it takes three passes to finish.
  const { data: runRow, error: runError } = await sb
    .from("collection_runs")
    .upsert(
      {
        organization_id: args.organizationId,
        run_key: args.runKey,
        started_at: args.startedAt ?? new Date().toISOString(),
        finished_at: new Date().toISOString(),
        stopped_by: args.report.stoppedBy,
        fetched: args.report.fetched,
        written: args.sink.written,
        skipped: args.sink.skipped,
        dirty: args.report.dirty.length,
        quarantined: args.report.quarantined.length,
        disallowed: args.report.disallowed.length,
        gone: args.report.gone.length,
        retried: args.report.retried,
        budget_spent: spent,
        seeds: args.seeds,
      },
      { onConflict: "organization_id,run_key" },
    )
    .select("id")
    .single();

  if (runError || !runRow) {
    result.errors.push(`run_upsert_failed:${runError?.message ?? "no_row"}`);
    return result;
  }
  result.runId = (runRow as { id: string }).id;

  const rows = issueRows(args.report);
  if (rows.length) {
    const { data, error } = await sb
      .from("collection_issues")
      .insert(
        rows.map(({ kind, issue }) => ({
          run_id: result.runId,
          organization_id: args.organizationId,
          kind,
          uri: issue.uri.slice(0, 2048),
          reason: issue.reason.slice(0, 500),
          checks: issue.checks ?? null,
        })),
      )
      .select("id");
    if (error) result.errors.push(`issues_insert_failed:${error.message}`);
    else result.issuesWritten = (data ?? []).length;
  }

  const severity = severityFor(args.report, args.sink);
  if (severity) {
    const raised = await raiseCollectionIncident({ ...args, severity, runId: result.runId });
    result.incidentRaised = raised.ok;
    if (!raised.ok) result.errors.push(`incident_failed:${raised.error}`);
  }

  return result;
}

/**
 * Raise (or bump) the ops incident for this tenant's collection health.
 *
 * The fingerprint is per tenant and per failure shape, NOT per run: a site that fails every hour
 * must be one incident with a rising occurrence count, not twenty-four alerts a day — which is how
 * an alert channel becomes something people mute.
 */
async function raiseCollectionIncident(args: {
  organizationId: string;
  runKey: string;
  runId: string | null;
  report: RunReport;
  sink: SinkReport;
  severity: "low" | "medium" | "high";
}): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabaseWriteClient();
  if (!sb) return { ok: false, error: "no_supabase_client" };

  const shape = args.report.quarantined.length > 0 ? "quarantined" : args.sink.written === 0 ? "stored_nothing" : "refusals";
  const fingerprint = `collection:${args.organizationId}:${shape}`;
  const sample = [...args.report.quarantined, ...args.report.dirty].slice(0, 3);

  const { error } = await sb.from("ops_incidents").upsert(
    {
      organization_id: args.organizationId,
      source: "collection",
      external_id: fingerprint,
      fingerprint,
      signal_type: "business",
      severity: args.severity,
      service: "collection",
      environment: process.env.NODE_ENV === "production" ? "production" : "development",
      title:
        shape === "quarantined"
          ? "Collection quarantined a page carrying planted instructions"
          : shape === "stored_nothing"
            ? "Collection run stored nothing while refusing pages"
            : "Collection refused a large share of a site",
      message: [
        `run=${args.runKey} (${args.runId ?? "unsaved"})`,
        `stored=${args.sink.written} refused=${args.report.dirty.length} quarantined=${args.report.quarantined.length}`,
        `disallowed=${args.report.disallowed.length} gone=${args.report.gone.length} stoppedBy=${args.report.stoppedBy}`,
        ...sample.map((i) => `- ${i.uri} :: ${i.reason}`),
      ].join("\n"),
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "source,external_id" },
  );

  return error ? { ok: false, error: error.message } : { ok: true };
}
