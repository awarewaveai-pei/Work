// /api/ops/costs/fx-rates — the monthly accounting USD→TWD rate behind /ops/costs 月報 (lib/ai/fx-rates.ts).
// GET: every manual row of the last 13 Taipei months (staff only). POST { month:'YYYY-MM', rate, source, note }:
// appends one row; owner/admin only, same level as the schedules write route. Rows are never updated -- a correction
// is a new row and the newest wins, so the table is its own audit trail. A customer account is refused on both.
import { NextResponse } from "next/server";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { FX_COLUMNS } from "@/lib/ai/fx-loader";
import { MANUAL_FX_SOURCES, type ManualFxSource } from "@/lib/ai/fx-rates";
import { taipeiMonth, taipeiMonthStartIso } from "@/lib/ai/spend-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(request: Request) {
  const resolved = resolveOpsRole(request);
  if (resolved.source === "client") return NextResponse.json({ ok: false, error: "forbidden_role" }, { status: 403 });
  const sb = getSupabaseWriteClient();
  if (!sb) return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });
  const since = `${taipeiMonth(taipeiMonthStartIso(new Date(), 12))}-01`;
  const { data, error } = await sb.from("fx_rates").select(FX_COLUMNS).gte("month", since)
    .order("month", { ascending: false }).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

export async function POST(request: Request) {
  const resolved = resolveOpsRole(request);
  if (resolved.source === "client" || !canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const month = String(body.month ?? "");
  if (!MONTH_RE.test(month)) return NextResponse.json({ ok: false, error: "month_invalid" }, { status: 400 });
  const rate = Number(body.rate);
  // numeric(10,4): stays well inside; anything outside 1..1000 is a typo, not a USD→TWD rate.
  if (!Number.isFinite(rate) || rate < 1 || rate > 1000) return NextResponse.json({ ok: false, error: "rate_invalid" }, { status: 400 });
  const source = String(body.source ?? "") as ManualFxSource;
  if (!MANUAL_FX_SOURCES.includes(source)) return NextResponse.json({ ok: false, error: "source_invalid" }, { status: 400 });
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;

  const sb = getSupabaseWriteClient();
  if (!sb) return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });
  const userId = request.headers.get("x-ops-user-id")?.trim();
  const createdBy = `${resolved.role}:${userId || resolved.source}`;
  const { data, error } = await sb.from("fx_rates")
    .insert({ month: `${month}-01`, rate: Number(rate.toFixed(4)), source, note, created_by: createdBy })
    .select(FX_COLUMNS).single();
  if (error) return NextResponse.json({ ok: false, error: error.message.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, row: data });
}
