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
import { getSupabaseWriteClient } from "../../../../lib/supabase-server";
import { kickActionRunDispatcher } from "../../../../lib/kick-dispatcher";
import type { IntakeForm, WebsiteSpec } from "../../../../lib/onboarding/intake-form";

function toOrgSlug(name: string, suffix: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36);
  return `${base}-${suffix}`;
}

function toManifestSlug(packageSlug: string): BuildPackageSlug {
  if (packageSlug === "wp-basic" || packageSlug === "wp-business" || packageSlug === "wc-core") {
    return packageSlug;
  }
  // wc-custom not yet in create-wp-site SUPPORTED_MANIFEST_SLUGS — fallback to wc-core
  return "wc-core";
}

export async function POST(request: Request) {
  const resolved = resolveOpsRole(request);
  const allowed = ["owner", "admin", "operator"] as const;
  if (!(allowed as readonly string[]).includes(resolved.role)) {
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

  // Read spec
  const { data: specRow, error: specErr } = await supabase
    .from("website_specs")
    .select("id, spec_data")
    .eq("id", website_spec_id)
    .single();
  if (specErr || !specRow) {
    return NextResponse.json({ ok: false, error: "website_spec_not_found" }, { status: 404 });
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

  const spec = specRow.spec_data as WebsiteSpec;
  const intakeForm = intakeRow.form_data as IntakeForm;
  const companyName = intakeForm.company_name;
  const domain = intakeForm.domain?.trim() || null;
  const locale = intakeForm.language === "zh-TW" ? "zh-TW" : "en";

  // Create org (reuse if already bound)
  let organizationId: string = (intakeRow.organization_id as string | null) ?? "";

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
        metadata: { intake_form_id, website_spec_id, source: "onboarding_portal" },
      })
      .select("id")
      .single();
    if (orgErr || !org) {
      return NextResponse.json(
        { ok: false, error: "org_create_failed", detail: orgErr?.message },
        { status: 500 }
      );
    }
    organizationId = org.id;
  }

  // Create workspace
  const { data: workspace, error: wsErr } = await supabase
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
  if (wsErr || !workspace) {
    return NextResponse.json(
      { ok: false, error: "workspace_create_failed", detail: wsErr?.message },
      { status: 500 }
    );
  }

  // Create project
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .insert({
      organization_id: organizationId,
      workspace_id: workspace.id,
      name: `${spec.site_name ?? companyName} Website`,
      project_type: "wordpress",
      status: "active",
    })
    .select("id")
    .single();
  if (projErr || !project) {
    return NextResponse.json(
      { ok: false, error: "project_create_failed", detail: projErr?.message },
      { status: 500 }
    );
  }

  // Create site
  const manifestSlug = toManifestSlug(spec.package_slug ?? "wp-basic");
  const { data: site, error: siteErr } = await supabase
    .from("sites")
    .insert({
      organization_id: organizationId,
      workspace_id: workspace.id,
      project_id: project.id,
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
    return NextResponse.json(
      { ok: false, error: "site_create_failed", detail: siteErr?.message },
      { status: 500 }
    );
  }

  // Bind org + mark building
  await supabase
    .from("intake_forms")
    .update({ organization_id: organizationId, status: "building" })
    .eq("id", intake_form_id);

  // Build the pipeline request
  const stagingDomain = domain ?? `staging-${organizationId.slice(0, 8)}.aware-wave.com`;

  const buildPayload: BuildRunRequest = {
    profile: "profile_b",
    executionMode: "enqueue",
    clientName: companyName,
    domain: stagingDomain,
    packageSlug: manifestSlug,
    selectedPacks: spec.packs as WpPluginModule[],
    organizationId,
    workspaceId: workspace.id,
    projectId: project.id,
    siteId: site.id,
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
    return NextResponse.json(
      { ok: false, error: "action_catalog_missing", details: `Missing ${plan.actionKey}` },
      { status: 409 }
    );
  }
  if (action.enabled === false) {
    return NextResponse.json(
      { ok: false, error: "action_disabled", details: `${plan.actionKey} is disabled` },
      { status: 409 }
    );
  }

  // Enqueue ops_action_runs
  const runId = crypto.randomUUID();
  const traceId = `onboarding-build-${runId}`;

  const { error: insertErr } = await supabase.from("ops_action_runs").insert({
    id: runId,
    action_id: action.id,
    organization_id: organizationId,
    workspace_id: workspace.id,
    project_id: project.id,
    site_id: site.id,
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
    return NextResponse.json(
      { ok: false, error: "enqueue_failed", details: insertErr.message },
      { status: 500 }
    );
  }

  const dispatcherKick = await kickActionRunDispatcher();

  return NextResponse.json({
    ok: true,
    run_id: runId,
    organization_id: organizationId,
    workspace_id: workspace.id,
    project_id: project.id,
    site_id: site.id,
    trace_id: traceId,
    dispatcher_kick: dispatcherKick,
  });
}
