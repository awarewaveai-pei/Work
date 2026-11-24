import { NextResponse } from "next/server";
import {
  buildConsolePlan,
  normalizeBuildRequest,
  validateBuildRequest,
  type BuildRunRequest,
  type BuildRunStatus,
  type LocalDirectBuildInfo,
} from "../../../../lib/build-console/contracts";
import { resolveOpsRole } from "../../../../lib/ops-role";
import { getSupabaseWriteClient } from "../../../../lib/supabase-server";
import { kickActionRunDispatcher } from "../../../../lib/kick-dispatcher";
import { checkProductionChangeAllowed } from "../../../../lib/system-modes/production-change-gate";
import { blockedChangeResponse } from "../../../../lib/system-modes/blocked-change";
import { ensureOrganization, ensureProject, ensureSite, ensureWorkspace, type RecordResult } from "../../../../lib/site-flow/records";

type SupabaseWriteClient = NonNullable<ReturnType<typeof getSupabaseWriteClient>>;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 240;

function canCreateBuildRun(role: string): boolean {
  return role === "owner" || role === "admin" || role === "operator";
}

async function parseBody(request: Request): Promise<BuildRunRequest | null> {
  try {
    return (await request.json()) as BuildRunRequest;
  } catch {
    return null;
  }
}

function slugifyClientName(name: string, fallbackId: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return base || `client-${fallbackId.slice(0, 8)}`;
}

function localeForSite(locale: string | undefined): string {
  if (!locale) return "en";
  if (locale.toLowerCase().startsWith("zh")) return "zh_TW";
  return locale;
}

/**
 * organization -> default workspace -> wordpress project -> site through the one write path (lib/site-flow/records.ts,
 * card SF-P: this route used to carry its own copy). An organizationId that already exists is used as is; a new one is
 * created with that id, and a slug that belongs to another organization is refused (slug_id_mismatch), never adopted.
 * The workspace and project are always the organization's default ones; caller-sent workspaceId/projectId are replaced.
 */
async function ensureBuildRegistryRows(
  supabase: SupabaseWriteClient,
  input: BuildRunRequest,
): Promise<{ input: BuildRunRequest } | { error: string; details: string }> {
  if (input.profile !== "profile_b" && input.profile !== "profile_c") {
    return { input };
  }
  if (!input.organizationId || !input.clientName) {
    return { input };
  }
  const clientName = input.clientName;
  // records' own codes (site_scope_mismatch, slug_id_mismatch, ...) are returned as is; the stage goes in details.
  const failed = (stage: string, r: RecordResult<unknown>) =>
    "error" in r ? { error: r.error, details: `${stage}: ${r.detail ?? r.error}` } : { error: "create_failed", details: stage };

  const { data: orgById, error: orgByIdError } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", input.organizationId)
    .maybeSingle();
  if (orgByIdError) return { error: "organization_lookup_failed", details: orgByIdError.message };
  let organizationId = input.organizationId;
  if (!orgById) {
    const configUrl = input.siteUrl
      ? input.siteUrl.replace(/\/$/, "")
      : input.domain ? `https://${input.domain.replace(/^https?:\/\//, "").replace(/\/$/, "")}` : undefined;
    const org = await ensureOrganization(supabase, {
      id: organizationId,
      slug: input.clientSlug ?? slugifyClientName(clientName, organizationId),
      name: clientName,
      type: "client",
      status: "active",
      defaultLocale: localeForSite(input.locale),
      metadata: {
        source: "build_console",
        client_config: {
          platform: "wordpress",
          ...(configUrl ? { site_url: configUrl } : {}),
          ...(input.wpAdminUrl ? { wp_admin_url: input.wpAdminUrl } : {}),
        },
      },
    });
    if (!org.ok) return failed("organization", org);
    organizationId = org.value.id;
  }

  const ws = await ensureWorkspace(supabase, { organizationId, name: `${clientName} - Default` });
  if (!ws.ok) return failed("workspace", ws);
  const proj = await ensureProject(supabase, { organizationId, workspaceId: ws.value.id, name: `${clientName} Website` });
  if (!proj.ok) return failed("project", proj);
  const siteUrl = input.profile === "profile_c" ? input.siteUrl : input.domain;
  const site = await ensureSite(supabase, {
    organizationId,
    workspaceId: ws.value.id,
    projectId: proj.value.id,
    siteId: input.siteId,
    name: clientName,
    primaryDomain: siteUrl?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? null,
    locale: localeForSite(input.locale),
    themeFamily: input.packageSlug === "wp-tourism" ? "elementor" : "kadence",
    stackProfile: input.packageSlug ?? "wp-basic",
    siteType: input.profile === "profile_c" ? "existing_wp" : "new_client",
  });
  if (!site.ok) return failed("site", site);

  return {
    input: {
      ...input,
      organizationId,
      workspaceId: ws.value.id,
      projectId: proj.value.id,
      siteId: site.value.id,
    },
  };
}

async function readJsonRecord(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : { value: parsed };
  } catch {
    return { error: "non_json_response", detail: text.slice(0, 500) };
  }
}

function redactProvisionPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...payload };
  const notes = copy.provisioningNotes;
  if (Array.isArray(notes)) {
    copy.provisioningNotes = notes.map((note) => {
      const text = String(note);
      return text.startsWith("Admin:") ? "Admin: admin / [redacted]" : note;
    });
  }
  return copy;
}

function summarizeLocalDirectError(error: string, detail?: string): string {
  return detail ? `${error}: ${detail}`.slice(0, 500) : error.slice(0, 500);
}

async function runLocalDirectBuild(args: {
  request: Request;
  supabase: SupabaseWriteClient;
  runId: string;
  input: BuildRunRequest;
  plan: ReturnType<typeof buildConsolePlan>;
}): Promise<LocalDirectBuildInfo> {
  const { request, supabase, runId, input, plan } = args;

  const fail = async (
    error: string,
    detail?: string,
    httpStatus?: number,
    provision?: Record<string, unknown>,
    seed?: Record<string, unknown>,
  ): Promise<LocalDirectBuildInfo> => {
    const info: LocalDirectBuildInfo = {
      attempted: true,
      ok: false,
      status: "failed",
      ...(httpStatus ? { httpStatus } : {}),
      error,
      ...(detail ? { detail } : {}),
      ...(provision ? { provision } : {}),
      ...(seed ? { seed } : {}),
    };
    await supabase
      .from("ops_action_runs")
      .update({
        status: "failed",
        error_summary: summarizeLocalDirectError(error, detail),
        ended_at: new Date().toISOString(),
        output_payload: { plan, local_direct: info },
      })
      .eq("id", runId);
    return info;
  };

  if (input.profile !== "profile_b") {
    return fail("local_direct_unsupported_profile", "local_direct currently provisions Profile B new WordPress staging sites only");
  }
  if (!input.organizationId || !input.siteId || !input.clientName) {
    return fail("local_direct_missing_fields", "organizationId, siteId, and clientName are required");
  }

  const token = process.env.LOBSTER_HOSTING_API_TOKEN?.trim();
  if (!token) {
    return fail("hosting_token_not_configured", "LOBSTER_HOSTING_API_TOKEN is required for local_direct builds");
  }

  const endpoint = new URL("/api/internal/hosting/provision-staging", request.url);

  try {
    const provisionResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        organizationId: input.organizationId,
        siteId: input.siteId,
        siteName: input.clientName,
        manifestSlug: input.packageSlug ?? "wp-basic",
        pluginSlugs: input.pluginSlugs ?? [],
        websiteSpecId: input.websiteSpecId,
      }),
    });
    const rawProvision = await readJsonRecord(provisionResponse);
    const provision = redactProvisionPayload(rawProvision);

    if (!provisionResponse.ok) {
      return fail(
        String(provision.code ?? provision.error ?? "provision_failed"),
        String(provision.detail ?? provision.error ?? `HTTP ${provisionResponse.status}`),
        provisionResponse.status,
        provision,
      );
    }

    let seed: Record<string, unknown> | undefined;
    if (input.websiteSpecId && typeof rawProvision.wpRootPath === "string") {
      const seedResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mode: "seed",
          websiteSpecId: input.websiteSpecId,
          wpPath: rawProvision.wpRootPath,
          siteId: input.siteId,
        }),
      });
      seed = await readJsonRecord(seedResponse);
      if (!seedResponse.ok || seed.ok === false) {
        return fail(
          String(seed.error ?? "seed_failed"),
          String(seed.detail ?? seed.error ?? `HTTP ${seedResponse.status}`),
          seedResponse.status,
          provision,
          seed,
        );
      }
    }

    const info: LocalDirectBuildInfo = {
      attempted: true,
      ok: true,
      status: "completed",
      httpStatus: provisionResponse.status,
      provision,
      ...(seed ? { seed } : {}),
    };

    await supabase
      .from("ops_action_runs")
      .update({
        status: "completed",
        error_summary: null,
        ended_at: new Date().toISOString(),
        output_payload: { plan, local_direct: info },
      })
      .eq("id", runId);

    return info;
  } catch (error) {
    return fail("local_direct_request_failed", error instanceof Error ? error.message : String(error));
  }
}

export async function POST(request: Request) {
  const resolved = resolveOpsRole(request);
  const role = resolved.role;
  if (!canCreateBuildRun(role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role }, { status: 403 });
  }

  const body = await parseBody(request);
  if (!body) {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  let input = normalizeBuildRequest(body);
  const errors = validateBuildRequest(input);
  if (errors.length) {
    return NextResponse.json({ ok: false, error: "validation_failed", details: errors.join("; ") }, { status: 400 });
  }

  const plan = buildConsolePlan(input);
  const requestedMode = input.executionMode ?? "plan_only";
  const executesDbRun = requestedMode === "enqueue" || requestedMode === "local_direct";
  if (executesDbRun && plan.blockers.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "profile_gate_blocked",
        details: plan.blockers.join("; "),
        plan,
      },
      { status: 409 },
    );
  }

  const runId = crypto.randomUUID();
  const traceId = `build-console-${runId}`;
  const createdAt = new Date().toISOString();

  let status: BuildRunStatus = plan.blockers.length ? "blocked" : "planned";
  let supabaseRunId: string | undefined;
  const dbWrite = {
    attempted: executesDbRun,
    executed: false,
    table: executesDbRun ? ("ops_action_runs" as const) : null,
    error: undefined as string | undefined,
  };
  let executionClient: SupabaseWriteClient | null = null;

  if (executesDbRun) {
    const supabase = getSupabaseWriteClient();
    if (!supabase) {
      return NextResponse.json(
        {
          ok: false,
          error: "supabase_write_not_configured",
          details: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enqueue guarded build runs.",
          plan,
        },
        { status: 503 },
      );
    }
    executionClient = supabase;

    // Gated on the caller-supplied organizationId (org resolution/creation happens right below,
    // in ensureBuildRegistryRows -- checking here, before it, means the gate always runs before
    // the FIRST row this request could write, not just before the ops_action_runs insert).
    const gate = await checkProductionChangeAllowed(supabase, input.organizationId ?? null);
    if (!gate.allowed) {
      return blockedChangeResponse(gate.mode);
    }

    const registry = await ensureBuildRegistryRows(supabase, input);
    if ("error" in registry) {
      return NextResponse.json(
        {
          ok: false,
          error: registry.error,
          details: registry.details,
          plan,
        },
        { status: 409 },
      );
    }
    input = registry.input;
    const registryErrors = validateBuildRequest(input);
    if (registryErrors.length) {
      return NextResponse.json(
        { ok: false, error: "validation_failed", details: registryErrors.join("; "), plan },
        { status: 400 },
      );
    }

    const { data: action, error: actionError } = await supabase
      .from("ops_action_catalog")
      .select("id,enabled")
      .eq("action_key", plan.actionKey)
      .single();

    if (actionError || !action?.id) {
      return NextResponse.json(
        {
          ok: false,
          error: "action_catalog_missing",
          details: actionError?.message ?? `Missing ${plan.actionKey}`,
          plan,
        },
        { status: 409 },
      );
    }

    if (action.enabled === false) {
      return NextResponse.json(
        {
          ok: false,
          error: "action_disabled",
          details: `${plan.actionKey} is disabled in ops_action_catalog`,
          plan,
        },
        { status: 409 },
      );
    }

    if (input.siteId) {
      const { data: existingRun } = await supabase
        .from("ops_action_runs")
        .select("id, status")
        .eq("site_id", input.siteId)
        .in("status", ["pending", "running", "dispatched"])
        .maybeSingle();
      if (existingRun) {
        return NextResponse.json(
          {
            ok: false,
            error: "site_run_already_active",
            details: { existingRunId: existingRun.id, status: existingRun.status },
            plan,
          },
          { status: 409 },
        );
      }
    }

    const { data: inserted, error: insertError } = await supabase
      .from("ops_action_runs")
      .insert({
        id: runId,
        action_id: action.id,
        organization_id: input.organizationId,
        workspace_id: input.workspaceId ?? null,
        project_id: input.projectId ?? null,
        site_id: input.siteId ?? null,
        environment_id: null,
        actor_user_id: input.actorUserId ?? null,
        actor_role: role,
        status: requestedMode === "local_direct" ? "running" : "pending",
        approval_required: plan.approvalRequired,
        approval_status: plan.approvalRequired ? "pending" : "none",
        trace_id: traceId,
        started_at: requestedMode === "local_direct" ? createdAt : null,
        input_payload: input,
        output_payload: { plan },
        metadata: {
          source: "build-console",
          execution_mode: requestedMode,
          role_source: resolved.source,
          profile: plan.profile,
          workflow_id: plan.workflowId,
          apply_mode: plan.applyMode,
          smoke_profile: plan.smokeProfile,
          action_key: plan.actionKey,
        },
      })
      .select("id")
      .single();

    if (insertError) {
      dbWrite.error = insertError.message;
      return NextResponse.json(
        {
          ok: false,
          error: "enqueue_failed",
          details: insertError.message,
          plan,
        },
        { status: 409 },
      );
    }

    await supabase.from("ops_audit_events").insert({
      organization_id: input.organizationId,
      workspace_id: input.workspaceId ?? null,
      actor_user_id: input.actorUserId ?? null,
      actor_role: role,
      event_type: requestedMode === "local_direct" ? "build_run_started" : "build_run_enqueued",
      target_type: "ops_action_runs",
      target_id: inserted.id,
      trace_id: traceId,
      payload: {
        profile: plan.profile,
        action_key: plan.actionKey,
        workflow_id: plan.workflowId,
        approval_required: plan.approvalRequired,
        execution_mode: requestedMode,
        role_source: resolved.source,
      },
    });

    dbWrite.executed = true;
    supabaseRunId = inserted.id;
    status = requestedMode === "local_direct" ? "running" : "queued";
  }

  let dispatcherKick: Awaited<ReturnType<typeof kickActionRunDispatcher>> | undefined;
  if (requestedMode === "enqueue" && dbWrite.executed) {
    dispatcherKick = await kickActionRunDispatcher();
  }
  let localDirect: LocalDirectBuildInfo | undefined;
  if (requestedMode === "local_direct" && dbWrite.executed && executionClient) {
    localDirect = await runLocalDirectBuild({
      request,
      supabase: executionClient,
      runId: supabaseRunId ?? runId,
      input,
      plan,
    });
    status = localDirect.status;
  }

  return NextResponse.json({
    ok: true,
    run: {
      id: runId,
      traceId,
      status,
      executionMode: requestedMode,
      createdAt,
      plan,
      inputSnapshot: input,
      supabaseRunId,
      dbWrite,
      dispatcherKick,
      localDirect,
    },
  });
}
