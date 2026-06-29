import { NextResponse } from "next/server";
import { readOpsRole } from "@/lib/ops-role";
import { syncGlobalEvents } from "@/lib/events/sync";

export const runtime = "nodejs";
export const maxDuration = 120; // Calendarific 20 countries takes ~15s; sports adds ~10s

export async function POST(req: Request) {
  const role = readOpsRole(req);
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

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
      onProgress: msg => log.push(msg),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    log.push(`Fatal: ${String(err)}`);
    return NextResponse.json({ ok: false, log, error: String(err) }, { status: 500 });
  }
}
