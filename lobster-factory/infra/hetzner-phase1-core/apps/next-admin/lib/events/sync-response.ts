import { NextResponse } from "next/server";
import { syncGlobalEvents } from "./sync";

/** Shared body of the admin route (/api/tools/events/sync) and the host-cron route (/api/internal/events/sync). */
export async function syncEventsResponse(force: boolean): Promise<NextResponse> {
  const key = process.env.CALENDARIFIC_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key || !supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: "Missing env: CALENDARIFIC_API_KEY / SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 }
    );
  }

  const log: string[] = [];
  try {
    const result = await syncGlobalEvents({
      calendarificApiKey: key,
      supabaseUrl,
      supabaseServiceKey,
      force,
      onProgress: msg => log.push(msg),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    log.push(`Fatal: ${String(err)}`);
    return NextResponse.json({ ok: false, log, error: String(err) }, { status: 500 });
  }
}

export function forceParam(req: Request): boolean {
  const force = new URL(req.url).searchParams.get("force");
  return force === "1" || force === "true";
}
