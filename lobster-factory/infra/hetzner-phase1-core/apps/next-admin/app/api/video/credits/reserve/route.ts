import { NextResponse } from "next/server";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Atomically reserve credits for a durable media job (idempotent by key). */
export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });
  let body: Record<string, unknown>; try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const organizationId = typeof body.organizationId === "string" ? body.organizationId.trim() : "";
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  const units = Number(body.units);
  if (!organizationId || !idempotencyKey || !Number.isSafeInteger(units) || units <= 0 || units > 1_000_000) return NextResponse.json({ ok: false, error: "organizationId, positive units and idempotencyKey required" }, { status: 400 });
  try { assertOrgAccess(req, organizationId); } catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  const db = getSupabaseWriteClient(); if (!db) return new NextResponse("db unavailable", { status: 503 });
  const result = await db.rpc("media_credit_reserve", { p_organization_id: organizationId, p_units: units, p_idempotency_key: idempotencyKey, p_reference_type: typeof body.referenceType === "string" ? body.referenceType : null, p_reference_id: typeof body.referenceId === "string" ? body.referenceId : null });
  if (result.error) return NextResponse.json({ ok: false, error: result.error.message }, { status: 500 });
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  return NextResponse.json({ ok: Boolean(row?.allowed), balance: Number(row?.balance ?? 0), ledgerId: row?.ledger_id ?? null }, { status: row?.allowed ? 200 : 402 });
}
