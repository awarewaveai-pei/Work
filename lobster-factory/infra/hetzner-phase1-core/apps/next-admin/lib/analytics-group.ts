import { createHash } from "node:crypto";

/** The PostHog group id of a customer: SHA-256 of the organization id, first 16 hex characters (blueprint §13.3).
 *  Server side only: the browser gets this value from /api/ops/analytics-context and never computes or sees another. */
export function organizationGroupId(orgId: string): string {
  return createHash("sha256").update(orgId).digest("hex").slice(0, 16);
}
