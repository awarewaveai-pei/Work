// POST /api/internal/site-watch/due — the hourly heartbeat's first call (packages/workflows/src/
// trigger/site-watch.ts). Syncs targets (every active org with a site_url), then returns the targets
// that are due now OR owe a notification (I2). A hint only: each run re-checks under its own lease.
// Kill switch off (SITE_WATCH_ENABLED) = empty list, nothing synced, nothing run.

import { NextResponse } from "next/server";
import { siteWatchEnabled } from "@/lib/site-watch/config";
import { isDue } from "@/lib/site-watch/runner";
import { productionDeps, verifySiteWatchToken } from "@/lib/site-watch/wiring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!verifySiteWatchToken(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!siteWatchEnabled()) return NextResponse.json({ ok: true, enabled: false, synced: 0, targets: [] });
  const deps = productionDeps();
  if (!deps) return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });

  const now = deps.now();
  const synced = await deps.store.syncTargets();
  const schedulable = await deps.store.listSchedulable();
  const due = schedulable.filter((t) => isDue(t, now)).map((t) => t.id);
  const owed = await deps.store.pendingNotificationTargets();
  const targets = [...new Set([...due, ...owed])];
  return NextResponse.json({ ok: true, enabled: true, synced, due: due.length, owed: owed.length, targets });
}
