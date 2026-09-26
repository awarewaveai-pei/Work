// POST /api/internal/collect/runs — Cognitive OS asks for one research collection run (RESEARCH_LINES_MASTER_PLAN
// §12.7 I-a). This route decides nothing: it checks the caller and the request shape, then hands the run to the
// Trigger task collect-research-run (I-b), which calls back runs/execute. The body carries a grant REFERENCE only;
// the token is exchanged later inside runs/execute, so it never lands in Trigger's run history (plan K3).
//
// Its own bearer (COLLECT_RESEARCH_RUNS_TOKEN), never a shared one — same rule as run-due-schedules.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { parseResearchRunRequest } from "./research-run-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyToken(request: Request): boolean {
  const expected = process.env.COLLECT_RESEARCH_RUNS_TOKEN;
  if (!expected) return false; // fail closed: unset means nobody is authorized, not everybody
  const m = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return !!m && timingSafeEqual(m[1], expected);
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

  const apiUrl = process.env.TRIGGER_API_URL?.trim();
  const triggerToken = process.env.TRIGGER_ACCESS_TOKEN?.trim() || process.env.TRIGGER_SECRET_KEY?.trim();
  if (!apiUrl || !triggerToken) return NextResponse.json({ ok: false, error: "trigger_unavailable", detail: "not_configured" }, { status: 502 });

  let res: Response;
  try {
    res = await fetch(`${apiUrl.replace(/\/$/, "")}/api/v1/tasks/collect-research-run/trigger`, {
      method: "POST",
      headers: { Authorization: `Bearer ${triggerToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ payload: parsed.value }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "trigger_unavailable", detail: String(e).slice(0, 200) }, { status: 502 });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json({ ok: false, error: "trigger_unavailable", detail: `HTTP ${res.status}: ${text.slice(0, 200)}` }, { status: 502 });
  }
  const data = (await res.json().catch(() => ({}))) as { id?: string };
  return NextResponse.json({ ok: true, trigger_run_id: data.id ?? null }, { status: 202 });
}
