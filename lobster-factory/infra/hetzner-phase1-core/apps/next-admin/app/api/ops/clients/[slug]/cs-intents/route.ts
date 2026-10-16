// POST/PATCH/DELETE /api/ops/clients/[slug]/cs-intents — manage a client's customer-service intents
// (the two-axis autonomy config: answer L0/L1/L2 × action A0/A1/A2). Gated by canWriteTenantConfig
// (owner/admin). A3 (money/identity) is NEVER an autonomy level — it's a hard code gate in the
// engine; the UI only exposes A0/A1/A2 + the is_sensitive flag (which forces handoff).
// L2 is refused (409 not_graduated) until the intent passed its exam (POST /api/ops/cs/eval);
// decideAnswerAction holds the same rule at runtime. PATCH writes only the fields it was sent.

import { NextResponse } from "next/server";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { ACTION_LEVELS, ANSWER_LEVELS, deleteIntent, loadIntent, parseIntentPatch, updateIntent, upsertIntent } from "@/lib/cs";
import { recordOpsAudit } from "@/lib/ops-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANSWER: readonly string[] = ANSWER_LEVELS;
const ACTION: readonly string[] = ACTION_LEVELS;

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
  const settings = { label, actionLevel, isSensitive, confidenceThreshold, canaryPct };
  if (answerLevel === "L2" && !(await loadIntent(orgId, key, settings))?.graduated) return notGraduated();

  const ok = await upsertIntent(orgId, { key, label, answerLevel, actionLevel, isSensitive, confidenceThreshold, canaryPct });
  if (ok) await recordOpsAudit(orgId, resolved.role, resolved.source, "cs_intent_upserted", { key, answerLevel, actionLevel, isSensitive });
  return ok ? NextResponse.json({ ok: true, key }) : NextResponse.json({ ok: false, error: "upsert_failed" }, { status: 409 });
}

function notGraduated(): Response {
  return NextResponse.json({ ok: false, error: "not_graduated", message: "這個意圖還沒通過考試，不能設成自動" }, { status: 409 });
}

// PATCH { key, answerLevel?, actionLevel?, isSensitive?, canaryPct?, label? } — change an existing intent.
export async function PATCH(request: Request, context: { params: Promise<{ slug: string }> }) {
  const resolved = resolveOpsRole(request);
  if (!canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  const { slug } = await context.params;
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!key) return NextResponse.json({ ok: false, error: "key_required" }, { status: 400 });
  const parsed = parseIntentPatch(body);
  if ("error" in parsed) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  if (Object.keys(parsed.fields).length === 0) return NextResponse.json({ ok: false, error: "no_fields" }, { status: 400 });

  const orgId = await orgIdOf(slug);
  if (!orgId) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });
  // Judged on the settings this PATCH leaves: L2 together with a lowered confidence floor must not
  // ride on an exam taken under the old floor.
  const intent = await loadIntent(orgId, key, parsed.fields);
  if (!intent) return NextResponse.json({ ok: false, error: "intent_not_found" }, { status: 404 });
  const target = parsed.fields.answerLevel ?? intent.answerLevel;
  if (target === "L2" && !intent.graduated) return notGraduated();

  const r = await updateIntent(orgId, key, parsed.fields);
  if (r === "not_found") return NextResponse.json({ ok: false, error: "intent_not_found" }, { status: 404 });
  if (r === "error") return NextResponse.json({ ok: false, error: "update_failed" }, { status: 409 });
  await recordOpsAudit(orgId, resolved.role, resolved.source, "cs_intent_updated", { key, ...parsed.fields });
  return NextResponse.json({ ok: true, key });
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
