import { NextResponse } from "next/server";
import { readOpsRole } from "@/lib/ops-role";
import { syncGlobalEvents } from "@/lib/events/sync";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";

export const runtime = "nodejs";
export const maxDuration = 120; // Calendarific 20 countries takes ~15s; sports adds ~10s

function hasValidSyncKey(req: Request): boolean {
  const expected = process.env.OPS_PROXY_SHARED_SECRET;
  const provided = req.headers.get("x-ops-sync-key") ?? "";
  return !!(expected && provided && timingSafeEqual(provided, expected));
}

export async function POST(req: Request) {
  const role = readOpsRole(req);
  const syncKeyOk = hasValidSyncKey(req);
  if (role !== "admin" && !syncKeyOk) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const force = searchParams.get("force") === "1" || searchParams.get("force") === "true";

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
