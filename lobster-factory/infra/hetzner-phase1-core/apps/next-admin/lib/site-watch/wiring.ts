// Production wiring for the internal routes: real DB, renderer, R2 bucket and operator Telegram.
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { buildOperatorTelegramNotifier } from "@/lib/ops-inbox/notify/telegram";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { siteWatchEnabled } from "./config";
import { createSiteWatchObjects } from "./objects";
import { takeSnapshot } from "./rendererClient";
import type { RunnerDeps } from "./runner";
import { createSupabaseStore } from "./store";

/**
 * Dedicated bearer token for /api/internal/site-watch/* (the Trigger.dev heartbeat) — never shared
 * with COLLECT_SCHEDULE_INGEST_TOKEN or OPS_INBOX_INGEST_TOKEN (same blast-radius rule as those).
 * Unset = nobody is authorized.
 */
export function verifySiteWatchToken(request: Request): boolean {
  const expected = process.env.SITE_WATCH_INGEST_TOKEN;
  if (!expected) return false;
  const m = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return !!m && timingSafeEqual(m[1], expected);
}

export function productionDeps(): RunnerDeps | null {
  const sb = getSupabaseWriteClient();
  if (!sb) return null;
  return {
    store: createSupabaseStore(sb),
    snapshot: (url) => takeSnapshot(url),
    objects: createSiteWatchObjects(),
    notifier: buildOperatorTelegramNotifier(),
    publicUrl: process.env.OPS_INBOX_PUBLIC_URL ?? "https://app.aware-wave.com",
    enabled: () => siteWatchEnabled(),
    now: () => new Date(),
  };
}
