// One ops_audit_events row for a tenant-config write by an ops-console role.
// AWAIT it: a supabase-js builder is lazy (the request is sent by then()), so `void sb.from(...).insert()`
// never writes — seven routes lost every audit row that way until 2026-10-15 (WORKLOG 2026-10-15).
import { getSupabaseWriteClient } from "@/lib/supabase-server";

export async function recordOpsAudit(
  orgId: string,
  role: string,
  source: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const sb = getSupabaseWriteClient();
  if (!sb) return console.warn(`[ops-audit] ${event} not recorded: no_supabase_client`);
  try {
    const { error } = await sb.from("ops_audit_events").insert({
      organization_id: orgId,
      actor_role: role,
      event_type: event,
      target_type: "organizations",
      target_id: orgId,
      trace_id: crypto.randomUUID(),
      payload: { ...payload, role_source: source },
    });
    if (error) console.warn(`[ops-audit] ${event} not recorded: ${error.message}`);
  } catch (e) {
    // The mutation already succeeded; a lost audit row is logged, never turned into a failed request.
    console.warn(`[ops-audit] ${event} not recorded: ${String(e)}`);
  }
}
