// GET /api/internal/collect/runs/progress?project_id=<uuid>&run_id=<id> — how far one research run has got while it
// runs (lib/collect/research-progress.ts): pages found, checked, ingested, set aside. Counts only.
//
// Same caller and bearer as runs/route.ts (Cognitive OS, COLLECT_RESEARCH_RUNS_TOKEN, fail closed). Both ids must
// match the run's own: a run is never readable under another project's id. 404 = this process does not hold the run
// (never started here, finished over 30 minutes ago, or the container restarted) — the engine's own run status and
// the completion stay the truth.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { readProgress } from "@/lib/collect/research-progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUN_ID = /^[A-Za-z0-9_-]{1,80}$/; // = research-run-request.ts RUN_ID

function verifyToken(request: Request): boolean {
  const expected = process.env.COLLECT_RESEARCH_RUNS_TOKEN;
  if (!expected) return false;
  const m = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return !!m && timingSafeEqual(m[1], expected);
}

export async function GET(request: Request) {
  if (!verifyToken(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const projectId = params.get("project_id") ?? "";
  const runId = params.get("run_id") ?? "";
  if (!UUID.test(projectId) || !RUN_ID.test(runId)) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  const p = readProgress(projectId, runId);
  if (!p) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({
    ok: true,
    state: p.state,
    pages_found: p.pagesFound,
    pages_checked: p.pagesChecked,
    ingested: p.ingested,
    set_aside: p.setAside,
    started_at: p.startedAt,
    updated_at: p.updatedAt,
  });
}
