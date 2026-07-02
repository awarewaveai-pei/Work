import { schedules, logger } from "@trigger.dev/sdk";

// Runs on the 1st of each month at 02:00 UTC — before anyone needs marketing data.
export const syncGlobalEventsTask = schedules.task({
  id: "sync-global-events",
  cron: "0 2 1 * *",
  maxDuration: 300,
  run: async () => {
    const apiKey = process.env.CALENDARIFIC_API_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const adminHost = process.env.NEXT_ADMIN_INTERNAL_URL ?? "http://next-admin:3000";

    if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
      logger.error("sync-global-events: missing env vars", {
        hasCalendarific: !!apiKey,
        hasSupabaseUrl: !!supabaseUrl,
        hasServiceKey: !!supabaseServiceKey,
      });
      throw new Error("Missing required env vars");
    }

    logger.info("sync-global-events: starting monthly sync");

    const res = await fetch(`${adminHost}/api/tools/events/sync`, {
      method: "POST",
      headers: {
        "x-ops-role": "admin",
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error("sync-global-events: API responded with error", { status: res.status, body });
      throw new Error(`Sync API error ${res.status}`);
    }

    const result = (await res.json()) as {
      ok: boolean;
      upserted: number;
      skipped: number;
      errors: string[];
      log: string[];
    };

    logger.info("sync-global-events: done", {
      upserted: result.upserted,
      skipped: result.skipped,
      errors: result.errors.length,
    });

    if (result.errors.length > 0) {
      logger.warn("sync-global-events: partial errors", { errors: result.errors });
    }

    return result;
  },
});
