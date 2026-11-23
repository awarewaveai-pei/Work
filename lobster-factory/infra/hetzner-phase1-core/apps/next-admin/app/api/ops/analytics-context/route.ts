import { NextResponse } from "next/server";
import { resolveOpsRole } from "@/lib/ops-role";

/**
 * Read-only context for client-side PostHog super-properties (no PII).
 * Middleware matcher includes /api/ops/* so proxy-injected role headers apply here.
 */
export async function GET(req: Request) {
  const { role, source } = resolveOpsRole(req);
  // org = the customer's own organization id (set only by middleware; staff have none). An id, never a name or email.
  const org = req.headers.get("x-ops-org-id")?.trim() || null;
  return NextResponse.json({ role, source, org });
}
