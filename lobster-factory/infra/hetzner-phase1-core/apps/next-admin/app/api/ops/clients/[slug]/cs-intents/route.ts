// POST/DELETE /api/ops/clients/[slug]/cs-intents — manage a client's customer-service intents
// (the two-axis autonomy config: answer L0/L1/L2 × action A0/A1/A2). Gated by canWriteTenantConfig
// (owner/admin). A3 (money/identity) is NEVER an autonomy level — it's a hard code gate in the
// engine; the UI only exposes A0/A1/A2 + the is_sensitive flag (which forces handoff).

import { NextResponse } from "next/server";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { upsertIntent, deleteIntent } from "@/lib/cs";
import { recordOpsAudit } from "@/lib/ops-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANSWER = ["L0", "L1", "L2"];
const ACTION = ["A0", "A1", "A2"];

async function orgIdOf(slug: string): Promise<string | null> {
  const sb = getSupabaseWriteClient();
  if (!sb) return null;
  const { data, error } = await sb.from("organizations").select("id").eq("slug", slug).single();
  return error || !data ? null : (data.id as string);
}


export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const resolved = resolveOpsRole(request);
  if (!canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  const { slug } = await context.params;
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }

  const key = typeof body.key === "string" ? body.key.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_") : "";
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!key || !label) return NextResponse.json({ ok: false, error: "key_and_label_required" }, { status: 400 });
  const answerLevel = ANSWER.includes(body.answerLevel as string) ? (body.answerLevel as string) : "L1";
  const actionLevel = ACTION.includes(body.actionLevel as string) ? (body.actionLevel as string) : "A0";
  const isSensitive = body.isSensitive === true;
  const confidenceThreshold = typeof body.confidenceThreshold === "number" ? Math.min(Math.max(body.confidenceThreshold, 0), 1) : undefined;
  const canaryPct = typeof body.canaryPct === "number" ? Math.min(Math.max(Math.round(body.canaryPct), 0), 100) : undefined;

  const orgId = await orgIdOf(slug);
  if (!orgId) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });

  const ok = await upsertIntent(orgId, { key, label, answerLevel, actionLevel, isSensitive, confidenceThreshold, canaryPct });
  if (ok) await recordOpsAudit(orgId, resolved.role, resolved.source, "cs_intent_upserted", { key, answerLevel, actionLevel, isSensitive });
  return ok ? NextResponse.json({ ok: true, key }) : NextResponse.json({ ok: false, error: "upsert_failed" }, { status: 409 });
}

export async function DELETE(request: Request, context: { params: Promise<{ slug: string }> }) {
  const resolved = resolveOpsRole(request);
  if (!canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  const { slug } = await context.params;
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!key) return NextResponse.json({ ok: false, error: "key_required" }, { status: 400 });

  const orgId = await orgIdOf(slug);
  if (!orgId) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });

  const ok = await deleteIntent(orgId, key);
  if (ok) await recordOpsAudit(orgId, resolved.role, resolved.source, "cs_intent_deleted", { key });
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: "delete_failed" }, { status: 409 });
}
