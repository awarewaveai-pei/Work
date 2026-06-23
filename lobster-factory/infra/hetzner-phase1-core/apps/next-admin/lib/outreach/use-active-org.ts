'use client';
import { useSearchParams } from "next/navigation";

// Active client org for the Cold Outreach console (代操). Source of truth = URL ?org=<uuid>, which
// maps to organizations.id (same client list as /ops/clients). null = 自用 / unassigned
// (organization_id IS NULL). Every outreach client reads this and threads it into API calls so one
// client's leads never bleed into another's view.

export function useActiveOrg(): string | null {
  const sp = useSearchParams();
  const v = sp.get("org");
  return v && v.trim() ? v.trim() : null;
}

/** Append organizationId to an API path when a client org is active. */
export function withOrg(path: string, org: string | null): string {
  if (!org) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}organizationId=${encodeURIComponent(org)}`;
}
