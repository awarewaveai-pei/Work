// POST /api/internal/commands/dispatch
// Phase 2 entry point for cron / scheduled / GitHub-event dispatched commands.
// Phase 1: refuses every request (501) — wired up so that ops console UI can
// show the future dispatch endpoint without 404s.
//
// When Phase 2 lands:
//   - HMAC verify body using COMMAND_PLANE_DISPATCH_SECRET (constant-time)
//   - Accept actor_type='system'/'agent' with explicit source ∈ {schedule,internal,github}
//   - Forward to routeCommand with same handlers + Trigger.dev dispatch wiring

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "not_implemented",
      message:
        "Phase 1 only exposes Telegram ingress. Internal dispatch lands in Phase 2 once Trigger.dev env is fully synced.",
    },
    { status: 501 },
  );
}
