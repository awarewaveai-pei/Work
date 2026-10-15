// POST /api/internal/social/dispatch
//
// Called every 5 minutes by the self-hosted Trigger schedule `social-dispatch`
// (packages/workflows/src/trigger/social-dispatch.ts). All sending logic lives in lib/social/dispatch.ts; this route
// only gates it. Own token SOCIAL_DISPATCH_TOKEN (verifyIngestToken.ts M2: one token per caller class).
// Off by default (AGENTS.md §0 自動化預設 OFF): SOCIAL_DISPATCH_ENABLED=true turns it on, SOCIAL_DISPATCH_MODE=apply
// sends; =draft runs everything but Postiz only stores drafts (the production rehearsal); anything else is a dry run
// (reads what would be sent, writes nothing, calls no Postiz).
// Runs inside the request: at most MAX_POSTIZ_CALLS Postiz calls and RUN_BUDGET_MS of new work per run.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { runDispatch } from "@/lib/social/dispatch";
import { dispatchPorts } from "@/lib/social/dispatch-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function verifyToken(request: Request): boolean {
  const expected = process.env.SOCIAL_DISPATCH_TOKEN;
  if (!expected) return false; // fail closed: unset means nobody is authorized, not everybody
  const m = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return !!m && timingSafeEqual(m[1], expected);
}

export async function POST(request: Request) {
  if (!verifyToken(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (process.env.SOCIAL_DISPATCH_ENABLED?.trim().toLowerCase() !== "true") {
    return NextResponse.json({ ok: true, enabled: false });
  }
  const raw = process.env.SOCIAL_DISPATCH_MODE?.trim().toLowerCase();
  const mode = raw === "apply" ? "apply" : raw === "draft" ? "draft" : "dry_run";
  try {
    const result = await runDispatch(dispatchPorts(), { mode });
    if (mode === "dry_run" || result.sent || result.errored || result.errors.length || result.backoffUntil) console.log("[social/dispatch]", JSON.stringify(result).slice(0, 2000));
    // a post that could not be worked fails the Trigger run (Sentry), not a 200 nobody reads
    return NextResponse.json({ ok: result.errors.length === 0, enabled: true, ...result }, { status: result.errors.length ? 502 : 200 });
  } catch (err) {
    // store unreadable (DB down, migration 0100 missing): a 500, never a green "nothing due"
    return NextResponse.json({ ok: false, error: String(err).slice(0, 200) }, { status: 500 });
  }
}
