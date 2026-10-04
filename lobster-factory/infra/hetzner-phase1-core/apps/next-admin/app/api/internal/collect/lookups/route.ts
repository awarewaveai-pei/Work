// POST /api/internal/collect/lookups — collect lookups v1 (Projects/internal/cognitive-engineering-os/specs/wire/
// lookup.v1.json). The cognitive platform reaches nothing outside itself; it asks collect here: a site's registry
// record and first archive capture (describe), the fact-check databases (factcheck).
//
// Same caller, same bearer as runs/route.ts (COLLECT_RESEARCH_RUNS_TOKEN, fail closed). The whole request fails only
// on 401 and on R2's 400s; a lookup that failed is a cell that says 無法檢查 and why. Nothing from the case is kept
// (R4): project_id goes to the log only.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { parseLookupRequest } from "@/lib/collect/lookups/contract";
import { answerLookup, lookupDeps } from "@/lib/collect/lookups/answer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  const parsed = parseLookupRequest(body);
  if (parsed.ok === false) return NextResponse.json({ ok: false, error: "bad_request", detail: parsed.error }, { status: 400 });

  const project = parsed.value.projectId.replace(/[^\w-]/g, "").slice(0, 40) || "-";
  const log = (msg: string) => console.info(`[collect/lookups ${project}] ${msg}`);
  const answer = await answerLookup(parsed.value, lookupDeps(log));
  log(`${answer.kind}: ${answer.items.length} item(s)`);
  return NextResponse.json(answer);
}
