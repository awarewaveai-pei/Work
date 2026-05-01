import { NextResponse } from "next/server";
import { resolveOpsRole } from "@/lib/ops-role";

/**
 * Read-only context for client-side PostHog super-properties (no PII).
 * Middleware matcher includes /api/ops/* so proxy-injected role headers apply here.
 */
export async function GET(req: Request) {
  const { role, source } = resolveOpsRole(req);
  return NextResponse.json({ role, source });
}
