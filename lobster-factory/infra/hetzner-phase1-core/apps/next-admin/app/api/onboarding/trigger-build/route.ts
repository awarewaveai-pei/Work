// ─────────────────────────────────────────────────────────────────────────────
// 一鍵架站「租 Hetzner 主機 + day-1 硬化 + Cloudflare DNS」已寫好且真機驗證通過 (2026-06-06)。
// 要把它接進一鍵架站流程（機層 = 站層之前）→ 直接呼叫 `provisionClient()`，**不要重寫**。
// 精確 recipe：lobster-factory/docs/hosting/EMBED_PROVISION_INTO_APP.md
// 核心函式：packages/workflows/src/provision/provisionClient.ts（真機驗收見 WORKLOG 2026-06-06 Phase 4）
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import {
  normalizeBuildRequest,
  validateBuildRequest,
  buildConsolePlan,
  type BuildRunRequest,
  type BuildPackageSlug,
  type WpPluginModule,
} from "../../../../lib/build-console/contracts";
import { resolveOpsRole } from "../../../../lib/ops-role";
import { timingSafeEqual } from "../../../../lib/ops-inbox/verifyIngestToken";
import { getSupabaseWriteClient } from "../../../../lib/supabase-server";
import { kickActionRunDispatcher } from "../../../../lib/kick-dispatcher";
import type { IntakeForm, WebsiteSpec } from "../../../../lib/onboarding/intake-form";

// Auth: Supabase session (owner/admin/operator) OR server-to-server x-ops-sync-key.
// Mirrors the dual-path pattern established in wp-update/route.ts.
const SYNC_KEY = process.env.OPS_PROXY_SHARED_SECRET ?? "";

function toOrgSlug(name: string, suffix: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36);
  return `${base}-${suffix}`;
}

function toManifestSlug(packageSlug: unknown): { slug: BuildPackageSlug; downgraded: boolean } {
  if (packageSlug === "wp-basic" || packageSlug === "wp-business" || packageSlug === "wp-tourism" || packageSlug === "wc-core" || packageSlug === "wc-custom") {
    return { slug: packageSlug, downgraded: false };
  }
  return { slug: "wc-core", downgraded: true };
}

export async function POST(request: Request) {
  const resolved = resolveOpsRole(request);
  const allowed = ["owner", "admin", "operator"] as const;
  const hasSyncKey = !!(SYNC_KEY && timingSafeEqual(request.headers.get("x-ops-sync-key") ?? "", SYNC_KEY));
  if (!(allowed as readonly string[]).includes(resolved.role) && !hasSyncKey) {
    return NextResponse.json({ ok: false, error: "forbidden", role: resolved.role }, { status: 403 });
  }

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });

  let body: { website_spec_id?: string; intake_form_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { website_spec_id, intake_form_id } = body;
  if (!website_spec_id || !intake_form_id) {
    return NextResponse.json(
      { ok: false, error: "missing_fields", required: ["website_spec_id", "intake_form_id"] },
      { status: 422 }
    );
  }

  // Read intake form
  const { data: intakeRow, error: intakeErr } = await supabase
    .from("intake_forms")
    .select("id, form_data, organization_id, status")
    .eq("id", intake_form_id)
    .single();
  if (intakeErr || !intakeRow) {
    return NextResponse.json({ ok: false, error: "intake_form_not_found" }, { status: 404 });
  }

  // C2: Idempotency gate — if already building, return existing run
  if (intakeRow.status === "building") {
    const { data: existingRun } = await supabase
      .from("ops_action_runs")
      .select("id")
      .contains("metadata", { intake_form_id })
      .in("status", ["pending", "running", "dispatched"])
      .maybeSingle();
    if (existingRun) {
      return NextResponse.json({ ok: true, run_id: existingRun.id, idempotent: true });
    }
  }

  // Read spec and cross-validate FK
  const { data: specRow, error: specErr } = await supabase
    .from("website_specs")
    .select("id, spec_data, intake_form_id")
    .eq("id", website_spec_id)
    .single();
  if (specErr || !specRow) {
    return NextResponse.json({ ok: false, error: "website_spec_not_found" }, { status: 404 });
  }

  // M1: Cross-validate that this spec belongs to this intake form
  if (specRow.intake_form_id !== null && specRow.intake_form_id !== intake_form_id) {
    return NextResponse.json(
      { ok: false, error: "spec_intake_mismatch", detail: "website_spec does not belong to this intake_form" },
      { status: 422 }
    );
  }

  const spec = specRow.spec_data as WebsiteSpec;
  const intakeForm = intakeRow.form_data as IntakeForm;
  const companyName = intakeForm.company_name;
  const domain = intakeForm.domain?.trim() || null;
  const locale = intakeForm.language === "zh-TW" ? "zh-TW" : "en";

  // M2: Guard spec.packs and spec.package_slug against malformed spec_data
  const rawPacks = (spec as unknown as Record<string, unknown>).packs;
  const safePacks: WpPluginModule[] = Array.isArray(rawPacks)
    ? (rawPacks as WpPluginModule[])
    : [];
  const { slug: manifestSlug, downgraded } = toManifestSlug(spec.package_slug);

  // C2: Mark building before creating records (acts as a mutex for concurrent calls)
  const { error: markErr } = await supabase
    .from("intake_forms")
    .update({ status: "building" })
    .eq("id", intake_form_id);
  if (markErr) {
    return NextResponse.json({ ok: false, error: "status_update_failed", detail: markErr.message }, { status: 500 });
  }

  // Resolve org — reuse bound org or create new
  let organizationId: string | null = (intakeRow.organization_id as string | null) ?? null;

  // Carry the spec's brand colours into client_config.brandColors so the design tools
  // (Banner Studio "選擇品牌帶入配色" + /ops/clients Settings editor) pick them up.
  // spec.design.*_color is validated to #RRGGBB by the spec generator.
  const hexColor = (v: unknown) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : undefined);
  const brandColors: { primary?: string; secondary?: string } = {};
  const bcPrimary = hexColor(spec.design?.primary_color);
  const bcSecondary = hexColor(spec.design?.secondary_color);
  if (bcPrimary) brandColors.primary = bcPrimary;
  if (bcSecondary) brandColors.secondary = bcSecondary;
  const clientConfigSeed = Object.keys(brandColors).length ? { client_config: { brandColors } } : {};

  if (!organizationId) {
    const suffix = crypto.randomUUID().slice(0, 6);
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .insert({
        type: "client",
        name: companyName,
        slug: toOrgSlug(companyName, suffix),
        status: "active",
        default_locale: locale,
        metadata: { intake_form_id, website_spec_id, source: "onboarding_portal", ...clientConfigSeed },
      })
      .select("id")
      .single();
    if (orgErr || !org) {
      return NextResponse.json({ ok: false, error: "org_create_failed" }, { status: 500 });
    }
    organizationId = org.id;

    // Bind org to intake form
    const { error: bindErr } = await supabase
      .from("intake_forms")
      .update({ organization_id: organizationId })
      .eq("id", intake_form_id);
    if (bindErr) {
      return NextResponse.json({ ok: false, error: "org_bind_failed" }, { status: 500 });
    }
  }

  // Resolve workspace — reuse existing default or create
  let workspaceId: string;
  const { data: existingWs } = await supabase
    .from("workspaces")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("slug", "default")
    .maybeSingle();

  if (existingWs) {
    workspaceId = existingWs.id;
  } else {
    const { data: ws, error: wsErr } = await supabase
      .from("workspaces")
      .insert({
        organization_id: organizationId,
        name: `${companyName} - Default`,
        slug: "default",
        workspace_type: "default",
        status: "active",
      })
      .select("id")
      .single();
    if (wsErr || !ws) {
      return NextResponse.json({ ok: false, error: "workspace_create_failed" }, { status: 500 });
    }
    workspaceId = ws.id;
  }

  // Resolve project — reuse existing or create
  let projectId: string;
  const { data: existingProj } = await supabase
    .from("projects")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("workspace_id", workspaceId)
    .eq("project_type", "wordpress")
    .maybeSingle();

  if (existingProj) {
    projectId = existingProj.id;
  } else {
    const { data: proj, error: projErr } = await supabase
      .from("projects")
      .insert({
        organization_id: organizationId,
        workspace_id: workspaceId,
        name: `${spec.site_name ?? companyName} Website`,
        project_type: "wordpress",
        status: "active",
      })
      .select("id")
      .single();
    if (projErr || !proj) {
      return NextResponse.json({ ok: false, error: "project_create_failed" }, { status: 500 });
    }
    projectId = proj.id;
  }

  // Resolve site — reuse existing staging draft or create
  let siteId: string;
  const { data: existingSite } = await supabase
    .from("sites")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("project_id", projectId)
    .eq("status", "draft")
    .maybeSingle();

  if (existingSite) {
    siteId = existingSite.id;
  } else {
    const { data: site, error: siteErr } = await supabase
      .from("sites")
      .insert({
        organization_id: organizationId,
        workspace_id: workspaceId,
        project_id: projectId,
        name: spec.site_name ?? companyName,
        primary_domain: domain,
        locale: locale === "zh-TW" ? "zh_TW" : "en",
        status: "draft",
        theme_family: "kadence",
        stack_profile: manifestSlug,
      })
      .select("id")
      .single();
    if (siteErr || !site) {
      return NextResponse.json({ ok: false, error: "site_create_failed" }, { status: 500 });
    }
    siteId = site.id;
  }

  // Build pipeline request
  const stagingDomain = domain ?? `staging-${organizationId}.aware-wave.com`;

  const buildPayload: BuildRunRequest = {
    profile: "profile_b",
    executionMode: "enqueue",
    clientName: companyName,
    domain: stagingDomain,
    packageSlug: manifestSlug,
    selectedPacks: safePacks,
    organizationId,
    workspaceId,
    projectId,
    siteId,
    websiteSpecId: website_spec_id, // threaded to hosting bridge for content seeding
    environment: "staging",
    provider: "hostinger",
    locale: locale === "zh-TW" ? "zh_TW" : "en_US",
    integrations: {
      uptimeKuma:
        process.env.UPTIME_KUMA_URL && process.env.UPTIME_KUMA_API_KEY
          ? { url: process.env.UPTIME_KUMA_URL, apiKey: process.env.UPTIME_KUMA_API_KEY }
          : undefined,
      sentry: process.env.SENTRY_AUTH_TOKEN
        ? { org: "aware-wave", authToken: process.env.SENTRY_AUTH_TOKEN }
        : undefined,
    },
  };

  const input = normalizeBuildRequest(buildPayload);
  const errors = validateBuildRequest(input);
  if (errors.length) {
    return NextResponse.json(
      { ok: false, error: "validation_failed", details: errors.join("; ") },
      { status: 409 }
    );
  }

  const plan = buildConsolePlan(input);
  if (plan.blockers.length > 0) {
    return NextResponse.json(
      { ok: false, error: "profile_gate_blocked", details: plan.blockers.join("; "), plan },
      { status: 409 }
    );
  }

  // Look up action catalog
  const { data: action, error: actionErr } = await supabase
    .from("ops_action_catalog")
    .select("id, enabled")
    .eq("action_key", plan.actionKey)
    .single();
  if (actionErr || !action?.id) {
    return NextResponse.json({ ok: false, error: "action_catalog_missing" }, { status: 409 });
  }
  if (action.enabled === false) {
    return NextResponse.json({ ok: false, error: "action_disabled" }, { status: 409 });
  }

  // Enqueue ops_action_runs
  const runId = crypto.randomUUID();
  const traceId = `onboarding-build-${runId}`;

  const { error: insertErr } = await supabase.from("ops_action_runs").insert({
    id: runId,
    action_id: action.id,
    organization_id: organizationId,
    workspace_id: workspaceId,
    project_id: projectId,
    site_id: siteId,
    environment_id: null,
    actor_user_id: null,
    actor_role: resolved.role,
    status: "pending",
    approval_required: plan.approvalRequired,
    approval_status: plan.approvalRequired ? "pending" : "none",
    trace_id: traceId,
    input_payload: input,
    output_payload: { plan },
    metadata: {
      source: "onboarding_portal",
      role_source: resolved.source,
      profile: plan.profile,
      workflow_id: plan.workflowId,
      apply_mode: plan.applyMode,
      smoke_profile: plan.smokeProfile,
      action_key: plan.actionKey,
      intake_form_id,
      website_spec_id,
    },
  });

  if (insertErr) {
    return NextResponse.json({ ok: false, error: "enqueue_failed" }, { status: 500 });
  }

  const dispatcherKick = await kickActionRunDispatcher();

  return NextResponse.json({
    ok: true,
    run_id: runId,
    organization_id: organizationId,
    workspace_id: workspaceId,
    project_id: projectId,
    site_id: siteId,
    trace_id: traceId,
    manifest_downgraded: downgraded || undefined,
    dispatcher_kick: dispatcherKick,
  });
}
