// POST /api/internal/collect/runs/execute — the Trigger task collect-research-run hands one research run back to
// this app, where the crawler lives (RESEARCH_LINES_MASTER_PLAN §12.7 I-c). Order: exchange the grant reference
// for its token (I-d) -> crawl into sink/cognitive (I-e) -> tell Cognitive OS the run is over (I-f).
//
// The completion is sent in `finally`, whatever the crawl did: a run that throws, or that the orchestrator judges
// unhealthy, must still end on the COS side, or it stays "running" forever (plan K2). The crawl's own time ceiling
// (run.ts RESEARCH_MAX_MS) keeps that `finally` inside this route's lifetime. A failed exchange sends nothing —
// there is no token to send it with; the COS grant expires on its own.
//
// Its own bearer (COLLECT_RESEARCH_EXECUTE_TOKEN): the Trigger worker is a different caller from Cognitive OS, and
// one token per caller is the rule (run-due-schedules/route.ts header).

import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { runResearchCollection } from "@/lib/collect/run";
import { completionOf, createCognitiveSink } from "@/lib/collect/sinks/cognitive";
import { completeRun, exchangeGrant, wireVersionOf, type RunReportSummary } from "@/lib/cognitive-os/research";
import { finishProgress, startProgress, updateProgress } from "@/lib/collect/research-progress";
import type { CrawlProgress } from "@/lib/collect/orchestrator";
import { parseResearchRunRequest } from "../research-run-request";
import "@/lib/collect/blocks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function verifyToken(request: Request): boolean {
  const expected = process.env.COLLECT_RESEARCH_EXECUTE_TOKEN;
  if (!expected) return false; // fail closed
  const m = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return !!m && timingSafeEqual(m[1], expected);
}

/** "completed" means every document the crawler admitted reached COS; any refused or unreachable ingest batch
 *  (sink/cognitive records it as ingest_<status>) means some did not. A skipped empty/oversized document is not a
 *  delivery failure. */
function deliveryFailure(errors: string[] | undefined): string | undefined {
  return (errors ?? []).find((e) => e.startsWith("ingest_"));
}

export async function POST(request: Request) {
  if (!verifyToken(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request", detail: "body_not_json" }, { status: 400 });
  }
  const parsed = parseResearchRunRequest(body);
  if (parsed.ok === false) return NextResponse.json({ ok: false, error: "bad_request", detail: parsed.error }, { status: 400 });
  const run = parsed.value;

  const grant = await exchangeGrant(run.grant_ref);
  if (grant.ok === false) return NextResponse.json({ ok: false, error: `grant_exchange_${grant.status}`, detail: grant.error }, { status: 502 });
  if (grant.value.project_id !== run.project_id || grant.value.run_id !== run.run_id) {
    // The reference resolved to another run: never crawl into a Project the request did not name.
    return NextResponse.json({ ok: false, error: "grant_mismatch" }, { status: 502 });
  }
  const grantToken = grant.value.grant_token;
  // v2 (aside, channels, set-aside pages kept) only when this engine listed it; an older engine gets v1 and the old
  // behaviour (refused pages dropped), so either side can be deployed first.
  const wire = wireVersionOf(grant.value);

  let status: "completed" | "failed" = "failed";
  let failure: string | undefined;
  const summary: RunReportSummary = { fetched: 0, written: 0, unchanged: 0, refused: 0, stopped_by: "not_started" };
  // Wire v2: what the person sees set aside, and which search channels worked. Empty when the crawl threw.
  let found: ReturnType<typeof completionOf> = { aside: [], channels: [] };
  const startedAt = Date.now();
  // Written by the crawl's callback; `as` keeps TypeScript from narrowing it to null at the finally below.
  let last = null as CrawlProgress | null;
  startProgress(run.project_id, run.run_id, startedAt);
  try {
    const result = await runResearchCollection({
      projectId: run.project_id,
      runId: run.run_id,
      seeds: run.seeds,
      sink: createCognitiveSink({ projectId: run.project_id, runId: run.run_id, grantToken, wire }),
      budget: { fetches: run.budget.fetches },
      wire,
      onProgress: (p) => {
        last = p;
        updateProgress(run.project_id, run.run_id, p);
      },
    });
    const r = result.report;
    summary.fetched = r.fetched;
    summary.written = result.sink.written;
    summary.unchanged = result.sink.skipped;
    summary.refused = r.dirty.length + r.quarantined.length + r.disallowed.length + r.offEntity.length;
    summary.stopped_by = r.stoppedBy ?? "unknown";
    found = completionOf(r);
    failure = deliveryFailure(result.sink.errors);
    if (!failure) status = "completed";
  } catch (e) {
    failure = String(e).slice(0, 200);
  } finally {
    finishProgress(run.project_id, run.run_id, last);
    // Counts only (no URL, query or title: the case's contents stay in the engine). The crawl itself logs nothing.
    const p = last;
    console.info(
      `[collect/run ${run.project_id}/${run.run_id}] ${status} in ${Math.round((Date.now() - startedAt) / 1000)}s: ` +
        `found=${p?.pagesFound ?? 0} checked=${p?.pagesChecked ?? 0} fetched=${summary.fetched} written=${summary.written} ` +
        `unchanged=${summary.unchanged} refused=${summary.refused} aside=${found.aside.length} stopped_by=${summary.stopped_by}`,
    );
    const done = await completeRun(run.project_id, run.run_id, grantToken, status, summary, failure, wire === "2" ? found : undefined);
    if (done.ok === false) failure = `${failure ?? ""} complete_${done.status}:${done.error}`.trim().slice(0, 200);
  }
  return NextResponse.json({ ok: true, status, report: summary, ...(failure ? { error: failure } : {}) });
}
