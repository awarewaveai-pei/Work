import { NextResponse } from "next/server";
import { resolveOpsRole } from "@/lib/ops-role";
import { organizationGroupId } from "@/lib/analytics-group";

/**
 * Read-only context for client-side PostHog super-properties (no PII).
 * Middleware matcher includes /api/ops/* so proxy-injected role headers apply here.
 * `group` = a customer's own hashed organization id (lib/analytics-group.ts), never the id itself; staff have none here
 * (the client a staff member picks brings its hash in the GET /api/ops/org-search row, so no product door needs this route).
 */
export async function GET(req: Request) {
  const { role, source } = resolveOpsRole(req);
  const own = req.headers.get("x-ops-org-id")?.trim() || null;
  return NextResponse.json({ role, source, group: own ? organizationGroupId(own) : null });
}
