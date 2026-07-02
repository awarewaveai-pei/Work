// Stage 4: Machine-layer provisioning endpoint.
// Dispatches to Trigger.dev (provision-machine task) for billable hetzner_cloud mode
// to avoid CF ~100s timeout (long-running op — same constraint as provision-staging).
// Env-gated: LOBSTER_SERVER_ADAPTER=none (default) → idle; =mock → dry-run plan;
//            =hetzner_cloud → dispatches Trigger.dev provision-machine task (billable).
// Auth: ops-role (owner/admin/operator) OR x-ops-sync-key.

import { NextResponse } from "next/server";
import { resolveOpsRole } from "@/lib/ops-role";
import { timingSafeEqual } from "@/lib/ops-inbox/verifyIngestToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYNC_KEY = process.env.OPS_PROXY_SHARED_SECRET ?? "";

const TIER_SERVER_TYPE: Record<string, string> = {
  starter: "cpx11",
  business: "cpx21",
  commerce: "cpx31",
  premium: "cpx41",
};

function serverTypeForTier(tier: string): string {
  return TIER_SERVER_TYPE[tier] ?? "cpx21";
}

export async function POST(req: Request): Promise<Response> {
  const resolved = resolveOpsRole(req);
  const allowed = ["owner", "admin", "operator"] as const;
  const hasSyncKey = !!(SYNC_KEY && timingSafeEqual(req.headers.get("x-ops-sync-key") ?? "", SYNC_KEY));
  if (!(allowed as readonly string[]).includes(resolved.role) && !hasSyncKey) {
    return NextResponse.json({ ok: false, error: "forbidden", role: resolved.role }, { status: 403 });
  }

  let body: {
    siteId?: string;
    siteName?: string;
    organizationId?: string;
    tier?: string;
    region?: string;
    domain?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { siteId, siteName, organizationId, tier = "business", region = "sin", domain } = body;
  if (!siteId || !siteName || !organizationId) {
    return NextResponse.json(
      { ok: false, error: "missing_required_fields", required: ["siteId", "siteName", "organizationId"] },
      { status: 422 },
    );
  }

  const VALID_TIERS = new Set(["starter", "business", "commerce", "premium"]);
  const VALID_REGIONS = new Set(["sin", "nbg1", "fsn1", "hel1", "ash"]);
  if (!VALID_TIERS.has(tier)) {
    return NextResponse.json(
      { ok: false, error: "invalid_tier", valid: ["starter", "business", "commerce", "premium"] },
      { status: 422 },
    );
  }
  if (!VALID_REGIONS.has(region)) {
    return NextResponse.json(
      { ok: false, error: "invalid_region", valid: ["sin", "nbg1", "fsn1", "hel1", "ash"] },
      { status: 422 },
    );
  }

  const adapterMode = (process.env.LOBSTER_SERVER_ADAPTER ?? "none").trim().toLowerCase();
  const serverType = serverTypeForTier(tier);

  // ── none (default) ──────────────────────────────────────────────────────────
  if (adapterMode === "none") {
    return NextResponse.json({
      ok: true,
      result: { outcome: "idle" },
      adapter: "none",
      detail: "Set LOBSTER_SERVER_ADAPTER=mock for dry-run or =hetzner_cloud for billable provisioning.",
    });
  }

  // ── mock (dry-run) ──────────────────────────────────────────────────────────
  if (adapterMode === "mock") {
    return NextResponse.json({
      ok: true,
      result: {
        outcome: "mock",
        serverIp: "10.0.0.1",
        serverType,
        region,
        siteId,
        organizationId,
        domain: domain ?? null,
      },
      adapter: "mock",
    });
  }

  // ── hetzner_cloud (billable) → dispatch Trigger.dev provision-machine task ──
  if (adapterMode === "hetzner_cloud") {
    const triggerToken = (process.env.TRIGGER_ACCESS_TOKEN ?? "").trim();
    const triggerBase = (process.env.TRIGGER_API_URL ?? "https://trigger.aware-wave.com").replace(/\/$/, "");
    if (!triggerToken) {
      return NextResponse.json(
        {
          ok: false,
          error: "trigger_not_configured",
          detail: "TRIGGER_ACCESS_TOKEN required for hetzner_cloud adapter",
        },
        { status: 503 },
      );
    }
    let triggerData: { id?: string } = {};
    try {
      const res = await fetch(`${triggerBase}/api/v1/tasks/provision-machine/trigger`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${triggerToken}`,
        },
        body: JSON.stringify({
          siteId,
          siteName,
          organizationId,
          tier,
          serverType,
          region,
          domain: domain ?? null,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        return NextResponse.json(
          { ok: false, error: "trigger_dispatch_failed", detail: err.slice(0, 300) },
          { status: 502 },
        );
      }
      triggerData = (await res.json()) as { id?: string };
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: "trigger_unreachable", detail: e instanceof Error ? e.message : String(e) },
        { status: 502 },
      );
    }
    return NextResponse.json({
      ok: true,
      result: { outcome: "dispatched", runId: triggerData.id ?? null },
      adapter: "hetzner_cloud",
    });
  }

  return NextResponse.json(
    {
      ok: false,
      error: "unknown_adapter",
      detail: `LOBSTER_SERVER_ADAPTER="${adapterMode}" not recognized. Use: none | mock | hetzner_cloud`,
    },
    { status: 422 },
  );
}
