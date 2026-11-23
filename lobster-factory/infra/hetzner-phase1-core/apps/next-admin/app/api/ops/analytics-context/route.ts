import { NextResponse } from "next/server";
import { resolveOpsRole } from "@/lib/ops-role";
import { organizationGroupId } from "@/lib/analytics-group";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read-only context for client-side PostHog super-properties (no PII).
 * Middleware matcher includes /api/ops/* so proxy-injected role headers apply here.
 * `group` = hashed organization id (lib/analytics-group.ts), never the id itself: a customer's own; for staff only the
 * one they ask for with ?org=<uuid> (the client they just picked). A customer cannot ask for another organization's.
 */
export async function GET(req: Request) {
  const { role, source } = resolveOpsRole(req);
  const own = req.headers.get("x-ops-org-id")?.trim() || null;
  const asked = new URL(req.url).searchParams.get("org")?.trim() ?? "";
  const target = own ?? (UUID.test(asked) ? asked : null);
  return NextResponse.json({ role, source, group: target ? organizationGroupId(target) : null });
}
