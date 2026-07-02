// Stage 4: Machine-layer provisioning endpoint.
// Calls the existing provisionClient() function (verified real-machine 2026-06-06).
// Env-gated: LOBSTER_SERVER_ADAPTER=none (default) → status:"idle"; =mock → dry-run; =hetzner_cloud → billable.
// Auth: ops-role (owner/admin/operator) OR x-ops-sync-key.
// Do NOT call this without LOBSTER_SERVER_PROVISION_ENABLED=true unless you want a dry-run plan.

import { NextResponse } from "next/server";
import { resolveOpsRole } from "@/lib/ops-role";
import { timingSafeEqual } from "@/lib/ops-inbox/verifyIngestToken";
import { provisionClient } from "@workflows/provision/provisionClient";
import { buildServerAdapterFromEnv, serverTypeForTier } from "@workflows/provision/serverAdapterFactory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYNC_KEY = process.env.OPS_PROXY_SHARED_SECRET ?? "";

export async function POST(req: Request): Promise<Response> {
  const resolved = resolveOpsRole(req);
  const allowed = ["owner", "admin", "operator"] as const;
  const hasSyncKey = !!(SYNC_KEY && timingSafeEqual(req.headers.get("x-ops-sync-key") ?? "", SYNC_KEY));
  if (!(allowed as readonly string[]).includes(resolved.role) && !hasSyncKey) {
    return NextResponse.json({ ok: false, error: "forbidden", role: resolved.role }, { status: 403 });
  }

  let body: { siteId?: string; siteName?: string; organizationId?: string; tier?: string; region?: string; domain?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { siteId, siteName, organizationId, tier = "business", region = "sin", domain } = body;
  if (!siteId || !siteName || !organizationId) {
    return NextResponse.json(
      { ok: false, error: "missing_required_fields", required: ["siteId", "siteName", "organizationId"] },
      { status: 422 }
    );
  }

  const VALID_TIERS = new Set(["starter", "business", "commerce", "premium"]);
  const VALID_REGIONS = new Set(["sin", "nbg1", "fsn1", "hel1", "ash"]);
  if (!VALID_TIERS.has(tier)) {
    return NextResponse.json({ ok: false, error: "invalid_tier", valid: ["starter","business","commerce","premium"] }, { status: 422 });
  }
  if (!VALID_REGIONS.has(region)) {
    return NextResponse.json({ ok: false, error: "invalid_region", valid: ["sin","nbg1","fsn1","hel1","ash"] }, { status: 422 });
  }

  const serverAdapter = buildServerAdapterFromEnv({ region });

  const dnsConfig =
    domain && process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ZONE_ID
      ? { config: { apiToken: process.env.CLOUDFLARE_API_TOKEN, zoneId: process.env.CLOUDFLARE_ZONE_ID } }
      : undefined;

  try {
    const result = await provisionClient(
      { siteId, siteName, organizationId, region, serverType: serverTypeForTier(tier), domain },
      { serverAdapter, dns: dnsConfig }
    );
    return NextResponse.json({ ok: true, result, adapter: process.env.LOBSTER_SERVER_ADAPTER ?? "none" });
  } catch (err) {
    console.error("[provision] provisionClient error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: "provision_failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
