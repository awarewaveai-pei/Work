// POST /api/ops/site-flow/[siteId]/manual-checks {key, checked, note?, environment?} -- the operator's tick on a hand-done
// item (第 8 步 手動項目; 第 5 步 when the URL is routed by the product gateway). SITE-FLOW-COMPLETION-PLAN.md §1-4,
// card SF-H item 7. Owner/admin staff only; stored in sites.metadata.manual_checks with who and when, audited in
// ops_audit_events. Changes no host.

import { NextResponse } from "next/server";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { staffOnly } from "@/lib/tenant-guard";
import { environmentTypeParam, loadSiteEnvironment } from "@/lib/site-flow/engine";
import { writeTick } from "@/lib/site-flow/steps/manual-checks";

const STATUS: Record<string, number> = { unknown_check: 400, invalid_note: 400, site_not_found: 404, lookup_failed: 503, update_failed: 503, conflict: 409 };

export async function POST(request: Request, context: { params: Promise<{ siteId: string }> }) {
  const denied = staffOnly(request);
  if (denied) return denied;
  const resolved = resolveOpsRole(request);
  if (!canWriteTenantConfig(resolved.role)) return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  let body: Record<string, unknown>;
  try {
    const raw = await request.json();
    body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.key !== "string" || typeof body.checked !== "boolean") {
    return NextResponse.json({ ok: false, error: "key_and_checked_required" }, { status: 400 });
  }
  const environmentType = environmentTypeParam(body.environment);
  if (!environmentType) return NextResponse.json({ ok: false, error: "invalid_environment" }, { status: 400 });
  const db = getSupabaseWriteClient();
  if (!db) return NextResponse.json({ ok: false, error: "supabase_write_not_configured" }, { status: 503 });
  const { siteId } = await context.params;
  const loaded = await loadSiteEnvironment(db, siteId, environmentType);
  if ("outcome" in loaded) return NextResponse.json(loaded.outcome.body, { status: loaded.outcome.status });

  // Who: the profile email when there is one (people read it), else the user id, else the role.
  const userId = request.headers.get("x-ops-user-id")?.trim() || null;
  let by = userId ?? `(${resolved.role})`;
  if (userId) {
    const { data } = await db.from("profiles").select("email").eq("id", userId).maybeSingle();
    const email = (data as { email?: unknown } | null)?.email;
    if (typeof email === "string" && email) by = email;
  }

  const r = await writeTick(db, { siteId: loaded.site.id, env: loaded.environment, key: body.key, checked: body.checked, note: body.note, by });
  if ("error" in r) return NextResponse.json({ ok: false, error: r.error }, { status: STATUS[r.error] ?? 500 });

  const { error: auditErr } = await db.from("ops_audit_events").insert({
    organization_id: r.organizationId,
    actor_role: resolved.role,
    event_type: body.checked ? "site_manual_check_set" : "site_manual_check_cleared",
    target_type: "sites",
    target_id: loaded.site.id,
    trace_id: crypto.randomUUID(),
    payload: { key: body.key, by, role_source: resolved.source },
  });
  // The tick is stored either way (it is the operator's word); a missing audit row is said, never hidden.
  if (auditErr) console.error(`[site-flow manual-checks] audit insert failed for site ${loaded.site.id}: ${auditErr.message}`);
  return NextResponse.json({ ok: true, manual_checks: r.ticks, ...(auditErr ? { audit: "failed" } : {}) });
}
