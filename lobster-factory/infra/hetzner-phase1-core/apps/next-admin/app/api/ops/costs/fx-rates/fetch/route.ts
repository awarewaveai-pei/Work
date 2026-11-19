// POST /api/ops/costs/fx-rates/fetch — 月報「立刻抓匯率」: runs the same job the host clock rings daily
// (lib/ai/fx-cbc.ts runFxFetch). owner/admin only; a customer account is refused.
import { NextResponse } from "next/server";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { runFxFetch } from "@/lib/ai/fx-cbc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const resolved = resolveOpsRole(request);
  if (resolved.source === "client" || !canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  const sb = getSupabaseWriteClient();
  if (!sb) return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });
  const r = await runFxFetch(sb, new Date());
  if ("error" in r) return NextResponse.json({ ok: false, error: r.error.slice(0, 200) }, { status: 502 });
  return NextResponse.json({ ok: true, ...r });
}
