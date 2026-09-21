import type { WpSiteType, WpPluginModule } from "../wp-plugin-stack-catalog";
export type { WpSiteType, WpPluginModule };

export type BuildProfile = "profile_a" | "profile_b" | "profile_c";
export type BuildExecutionMode = "plan_only" | "enqueue" | "local_direct";
export type BuildEnvironment = "staging" | "production";
export type BuildPackageSlug = "wp-basic" | "wp-business" | "wp-tourism" | "wc-core" | "wc-custom";
export type BuildProvider = "awarewave-internal" | "hostinger" | "cloudways" | "generic-wordpress" | "manual";
export type BuildRiskLevel = "low" | "medium" | "high";
export type BuildRunStatus = "planned" | "queued" | "running" | "completed" | "failed" | "blocked";

// ─────────────────────────────────────────────
// Integration configs — passed through to workflow so they can call each
// service's API directly during the run. All fields are optional so the
// form works even when a service isn't configured yet.
// ─────────────────────────────────────────────

export interface UptimeKumaConfig {
  /** Base URL of your Uptime Kuma instance, e.g. https://uptime.aware-wave.com */
  url: string;
  /** Uptime Kuma API key (Settings → API Keys) */
  apiKey: string;
  /** Optional group to put the monitor in (integer ID or name) */
  groupName?: string;
  /** Shared ops-inbox webhook notification id in Uptime Kuma (auto-created monitors deliver DOWN events through it) */
  notificationId?: number;
}

export interface SentryConfig {
  /** Sentry organization slug, e.g. aware-wave */
  org: string;
  /** Sentry auth token (Project → Settings → Auth Tokens) */
  authToken: string;
  /** Team slug to assign the project to */
  team?: string;
}

export interface PostHogConfig {
  /** PostHog project API key (Project → Settings → Project API Key) */
  projectApiKey: string;
  /** PostHog ingest host — defaults to https://app.posthog.com */
  host?: string;
}

export interface N8nConfig {
  /** n8n webhook URL for the client onboarding flow */
  onboardingWebhookUrl: string;
  /** Optional bearer token if the webhook is protected */
  bearerToken?: string;
}

export interface MainWpConfig {
  /** URL of your MainWP Dashboard, e.g. https://mainwp.aware-wave.com */
  dashboardUrl: string;
  /** MainWP Consumer Key */
  consumerKey: string;
  /** MainWP Consumer Secret */
  consumerSecret: string;
  /** Override for the child-site admin username; empty = the one the provisioner installed */
  adminUsername?: string;
}

export interface BuildIntegrations {
  uptimeKuma?: UptimeKumaConfig;
  sentry?: SentryConfig;
  postHog?: PostHogConfig;
  n8n?: N8nConfig;
  mainWp?: MainWpConfig;
}

export interface BuildRunRequest {
  profile?: BuildProfile;
  executionMode?: BuildExecutionMode;
  actorUserId?: string;
  organizationId?: string;
  /** organizations.slug — threads client attribution to monitoring/Sentry (chain audit 2026-07-03) */
  clientSlug?: string;
  workspaceId?: string;
  projectId?: string;
  siteId?: string;
  environment?: BuildEnvironment;
  clientName?: string;
  domain?: string;
  siteUrl?: string;
  wpAdminUrl?: string;
  packageSlug?: BuildPackageSlug;
  /**
   * WP Plugin Stack (additive pack model, OnboardWizard v2).
   * Replaces wpSiteType + hasEcommerce. Array of addon pack ids; base is always implied.
   * e.g. ["ecommerce"], ["tourism", "ecommerce"], []
   */
  selectedPacks?: WpPluginModule[];
  /** Legacy — kept for BuildConsole manual form and backward compat. Prefer selectedPacks. */
  wpSiteType?: WpSiteType;
  hasEcommerce?: boolean;
  /** Resolved installable slugs (free plugins + free alternatives) from resolveInstallableSlugsForPacks() */
  pluginSlugs?: string[];
  /** Count of paid plugins with no free alternative — operator must install manually */
  paidPluginCount?: number;
  /** SSH host of the target WordPress server (operator-supplied for existing clients, or auto-filled by hosting adapter for new ones) */
  sshHost?: string;
  /** WordPress root path on the SSH host. Defaults to /var/www/html when omitted. */
  wpPath?: string;
  /** Vault reference for SSH credentials (e.g. vault://ssh/<client-slug>); never contains the key itself */
  sshCredentialsRef?: string;
  provider?: BuildProvider;
  locale?: string;
  credentialsRef?: string;
  backupRef?: string;
  backupConfirmed?: boolean;
  notes?: string;
  /** Service integrations to wire up during the workflow run */
  integrations?: BuildIntegrations;
  /**
   * AI website spec id (website_specs.id). Threaded to the hosting bridge so it can fetch
   * spec_data and seed real page content (homepage hero/sections, sitemap, SEO) into the new
   * WP install — turning the provisioned shell into a content-filled site. Optional: when absent
   * the bridge provisions the shell only (back-compat with manual Build Console runs).
   */
  websiteSpecId?: string;
}

export interface BuildPlanStage {
  id: string;
  label: string;
  gate: string;
  automation: "automated" | "manual" | "approval";
}

export interface BuildPlan {
  profile: BuildProfile;
  label: string;
  actionKey: string;
  workflowId: string;
  applyMode: "internal_setup" | "full_install" | "adopt_delta";
  siteType: "internal_control_plane" | "new_wordpress" | "existing_wordpress";
  riskLevel: BuildRiskLevel;
  approvalRequired: boolean;
  productionDeployAllowed: boolean;
  packageSlug: BuildPackageSlug | null;
  provider: BuildProvider;
  smokeProfile: "internal" | "basic" | "business" | "woocommerce" | "adopt";
  stages: BuildPlanStage[];
  requiredEvidence: string[];
  smokeTests: string[];
  handoffArtifacts: string[];
  blockers: string[];
  warnings: string[];
  nextActions: string[];
}

/** Optional result from POST /api/build/runs when Trigger kick is used — see `lib/kick-dispatcher.ts`. */
export type DispatcherKickInfo =
  | { attempted: false; reason: "no_secret" }
  | { attempted: true; ok: boolean; httpStatus: number; detail?: string };

export type LocalDirectBuildInfo = {
  attempted: true;
  ok: boolean;
  status: "completed" | "failed";
  httpStatus?: number;
  error?: string;
  detail?: string;
  provision?: Record<string, unknown>;
  seed?: Record<string, unknown>;
};

export interface BuildRunResult {
  id: string;
  traceId: string;
  status: BuildRunStatus;
  executionMode: BuildExecutionMode;
  createdAt: string;
  plan: BuildPlan;
  inputSnapshot: BuildRunRequest;
  supabaseRunId?: string;
  dbWrite: {
    attempted: boolean;
    executed: boolean;
    table: "ops_action_runs" | null;
    error?: string;
  };
  /** Present when executionMode was enqueue and DB write succeeded */
  dispatcherKick?: DispatcherKickInfo;
  /** Present when executionMode was local_direct and DB write succeeded */
  localDirect?: LocalDirectBuildInfo;
}

export interface BuildRunResponse {
  ok: boolean;
  run?: BuildRunResult;
  error?: string;
  details?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | undefined): boolean {
  return !!value && UUID_RE.test(value);
}

export function normalizeBuildRequest(payload: BuildRunRequest): BuildRunRequest {
  let derivedSlug: BuildPackageSlug;
  if (payload.selectedPacks) {
    derivedSlug = payload.selectedPacks.includes("ecommerce") ? "wc-core"
      : payload.selectedPacks.includes("tourism") ? "wp-tourism"
      : payload.selectedPacks.includes("brand") ? "wp-business"
      : "wp-basic";
  } else {
    derivedSlug = (payload.hasEcommerce || payload.wpSiteType === "ecommerce") ? "wc-core" : "wp-basic";
  }
  return {
    ...payload,
    executionMode: payload.executionMode ?? "plan_only",
    environment: payload.environment ?? "staging",
    packageSlug: payload.packageSlug ?? derivedSlug,
    provider: payload.provider ?? defaultProviderFor(payload.profile),
    locale: payload.locale?.trim() || "en_US",
    clientName: payload.clientName?.trim(),
    // Fail-open (critic 2026-07-03 Major-2): a reused org whose slug predates
    // toOrgSlug conventions must lose ATTRIBUTION, not the whole build — the
    // trigger schema hard-rejects non-conforming slugs, so drop them here.
    clientSlug: (() => {
      const cs = payload.clientSlug?.trim().toLowerCase();
      return cs && /^[a-z0-9-]{1,64}$/.test(cs) ? cs : undefined;
    })(),
    domain: payload.domain?.trim(),
    siteUrl: payload.siteUrl?.trim(),
    wpAdminUrl: payload.wpAdminUrl?.trim(),
    credentialsRef: payload.credentialsRef?.trim(),
    backupRef: payload.backupRef?.trim(),
    notes: payload.notes?.trim(),
  };
}

export function validateBuildRequest(input: BuildRunRequest): string[] {
  const errors: string[] = [];
  if (!input.profile) errors.push("profile is required");
  if (
    input.executionMode &&
    input.executionMode !== "plan_only" &&
    input.executionMode !== "enqueue" &&
    input.executionMode !== "local_direct"
  ) {
    errors.push("executionMode must be plan_only, enqueue, or local_direct");
  }
  if ((input.executionMode === "enqueue" || input.executionMode === "local_direct") && !input.organizationId) {
    errors.push(`organizationId is required when executionMode is ${input.executionMode}`);
  }
  if (input.environment && input.environment !== "staging" && input.environment !== "production") {
    errors.push("environment must be staging or production");
  }
  for (const [key, value] of [
    ["organizationId", input.organizationId],
    ["workspaceId", input.workspaceId],
    ["projectId", input.projectId],
    ["siteId", input.siteId],
    ["actorUserId", input.actorUserId],
  ] as const) {
    if (value && !isUuid(value)) errors.push(`${key} must be a UUID when provided`);
  }
  if (!input.clientName) errors.push("clientName is required");
  if (input.profile === "profile_b" && !input.domain) errors.push("domain is required for Profile B");
  if (input.profile === "profile_c" && !input.siteUrl) errors.push("siteUrl is required for Profile C");
  return errors;
}

export function buildConsolePlan(input: BuildRunRequest): BuildPlan {
  const environment = input.environment ?? "staging";
  if (input.profile === "profile_a") return profileAPlan(input, environment);
  if (input.profile === "profile_c") return profileCPlan(input, environment);
  return profileBPlan(input, environment);
}

function defaultProviderFor(profile: BuildRunRequest["profile"]): BuildProvider {
  if (profile === "profile_a") return "awarewave-internal";
  if (profile === "profile_c") return "generic-wordpress";
  return "hostinger";
}

function smokeProfileFor(req: BuildRunRequest): BuildPlan["smokeProfile"] {
  // Pack-based model (OnboardWizard v2)
  if (req.selectedPacks) {
    if (req.selectedPacks.includes("ecommerce")) return "woocommerce";
    if (req.selectedPacks.includes("tourism") || req.selectedPacks.includes("brand")) return "business";
    return "basic";
  }
  // Legacy: wpSiteType + hasEcommerce
  if (req.hasEcommerce || req.wpSiteType === "ecommerce") return "woocommerce";
  if (req.wpSiteType === "brand") return "business";
  if (req.packageSlug === "wc-core") return "woocommerce";
  if (req.packageSlug === "wp-business") return "business";
  if (req.packageSlug === "wp-tourism") return "business";
  return "basic";
}

function packageOrNull(input: BuildRunRequest): BuildPackageSlug | null {
  return input.profile === "profile_a" ? null : input.packageSlug ?? "wp-basic";
}

function productionWarning(environment: BuildEnvironment): string[] {
  return environment === "production"
    ? ["Production rollout is approval-gated. This console must not execute production automatically."]
    : [];
}

function profileCDomainWarnings(input: BuildRunRequest): string[] {
  const siteUrl = input.siteUrl?.trim().toLowerCase() ?? "";
  if (siteUrl.includes("soulfulexpression.com")) {
    return [
      "Preflight: repo and public evidence also reference soulfulexpression.org; confirm the canonical WordPress domain before enqueue.",
    ];
  }
  if (siteUrl.includes("soulfulexpression.org")) {
    return [
      "Preflight: the current case references soulfulexpression.com; confirm whether .org or .com is the canonical WordPress domain before enqueue.",
    ];
  }
  return ["Preflight: confirm the existing WordPress canonical domain before enqueue."];
}

function profileAPlan(input: BuildRunRequest, environment: BuildEnvironment): BuildPlan {
  const blockers: string[] = [];
  if (!input.domain) blockers.push("aware-wave control-plane domain is required");

  return {
    profile: "profile_a",
    label: "Profile A - AO-agent internal infrastructure",
    actionKey: "ops.profile-a.ao-infrastructure-check",
    workflowId: "ao_infrastructure_check",
    applyMode: "internal_setup",
    siteType: "internal_control_plane",
    riskLevel: environment === "production" ? "high" : "medium",
    approvalRequired: environment === "production",
    productionDeployAllowed: false,
    packageSlug: null,
    provider: "awarewave-internal",
    smokeProfile: "internal",
    stages: [
      { id: "precheck", label: "Control-plane precheck", gate: "Required env and service endpoints are present", automation: "automated" },
      { id: "supabase_sep", label: "Supabase staging/production separation check", gate: "Staging and production Supabase projects are confirmed separate with no shared service role keys", automation: "automated" },
      { id: "rls", label: "Tenant isolation smoke", gate: "Supabase RLS smoke returns no cross-tenant leak", automation: "automated" },
      { id: "edge", label: "Cloudflare Access check", gate: "Internal tools are behind Access or an equivalent policy", automation: "automated" },
      { id: "monitoring", label: "Service health check", gate: "Core app, Supabase, hosting bridge, and any enabled optional integrations pass health checks", automation: "automated" },
      { id: "netdata", label: "Netdata check (self-managed servers)", gate: "Netdata alerts and dashboards are configured for AO-managed infrastructure", automation: "automated" },
      { id: "report", label: "AO infrastructure status report", gate: "ao_health_checks evidence is written or exported", automation: "automated" },
    ],
    requiredEvidence: [
      "Supabase staging and production separation",
      "Optional Trigger.dev health if enqueue mode is enabled",
      "Optional n8n health if webhook integrations are enabled",
      "Cloudflare Access policy evidence",
      "RLS isolation smoke result",
      "Monitoring endpoint status",
    ],
    smokeTests: [
      "app health endpoint reachable",
      "Supabase read smoke passes",
      "RLS isolation smoke passes",
      "Cloudflare-protected tools reject unauthenticated access",
      "Uptime monitor is registered",
    ],
    handoffArtifacts: ["ao_infrastructure_status_report.json", "ao_health_checks row"],
    blockers,
    warnings: productionWarning(environment),
    nextActions: [
      "Run ao_infrastructure_check in staging first",
      "Review failed service checks before touching production",
      "Create an approval request before any production change",
    ],
  };
}

function profileBPlan(input: BuildRunRequest, environment: BuildEnvironment): BuildPlan {
  const packageSlug = input.packageSlug ?? "wp-basic";
  const smokeProfile = smokeProfileFor(input);
  const blockers: string[] = [];
  if (!input.domain) blockers.push("new customer domain is required");
  if (!input.provider) blockers.push("hosting provider is required");

  return {
    profile: "profile_b",
    label: "Profile B - new cloud WordPress customer",
    actionKey: "ops.profile-b.create-wp-site",
    workflowId: "create_wp_site",
    applyMode: "full_install",
    siteType: "new_wordpress",
    riskLevel: environment === "production" ? "high" : "medium",
    approvalRequired: environment === "production",
    productionDeployAllowed: false,
    packageSlug,
    provider: input.provider ?? "hostinger",
    smokeProfile,
    stages: [
      { id: "records", label: "Create registry records", gate: "organization, workspace, project, site, and environment IDs are known", automation: "automated" },
      { id: "provision", label: "Provision WordPress", gate: "provider adapter returns staging WordPress URL and admin URL", automation: input.provider === "manual" ? "manual" : "automated" },
      { id: "manifest", label: "Apply package manifest", gate: "manifest package_install_runs entry reaches completed", automation: "automated" },
      { id: "mainwp", label: "Connect MainWP", gate: "mainwp_site_id is written back to Supabase", automation: "automated" },
      { id: "monitoring", label: "Register monitoring", gate: "Uptime Kuma, SSL, and tracking checks pass", automation: "automated" },
      { id: "smoke", label: "Run smoke tests", gate: `${smokeProfile} smoke profile is all green`, automation: "automated" },
      { id: "handoff", label: "Generate handoff", gate: "handoff report JSON is available", automation: "automated" },
      { id: "approval_gate", label: "Request approval before production promotion", gate: "Production promotion is approval-gated; owner or admin must approve before any production deploy", automation: "approval" },
    ],
    requiredEvidence: [
      "confirmed no existing WordPress site",
      "provider adapter selection",
      "package manifest version",
      "staging URL",
      "smoke test result",
      "handoff report",
    ],
    smokeTests: [
      "homepage_http_200",
      "wp_admin_accessible",
      "ssl_valid",
      "contact_form_reachable",
      ...(smokeProfile === "business" ? ["crm_or_lead_capture_configured", "seo_baseline_present"] : []),
      ...(smokeProfile === "woocommerce" ? ["cart_page_reachable", "checkout_page_reachable", "payment_gateway_status_advisory"] : []),
    ],
    handoffArtifacts: ["handoff_report.json", "smoke_test_results.json", "deployment_summary.json"],
    blockers,
    warnings: productionWarning(environment),
    nextActions: [
      "Start with staging-only create_wp_site",
      "Use ManualTaskAdapter when provider credentials are missing",
      "Promote to production only after smoke tests and approval",
    ],
  };
}

function profileCPlan(input: BuildRunRequest, environment: BuildEnvironment): BuildPlan {
  const blockers: string[] = [];
  if (!input.siteUrl) blockers.push("existing site URL is required");
  if (!input.wpAdminUrl) blockers.push("WP Admin URL is required");
  if (!input.credentialsRef) blockers.push("credentialsRef is required; do not paste passwords into the console");
  if (!input.backupRef) blockers.push("backupRef is required before adopt_delta");
  if (!input.backupConfirmed) blockers.push("backup must be confirmed before any delta apply");

  return {
    profile: "profile_c",
    label: "Profile C - adopt existing WordPress",
    actionKey: "ops.profile-c.adopt-client-os",
    workflowId: "adopt_client_os",
    applyMode: "adopt_delta",
    siteType: "existing_wordpress",
    riskLevel: "high",
    approvalRequired: true,
    productionDeployAllowed: false,
    packageSlug: packageOrNull(input),
    provider: input.provider ?? "generic-wordpress",
    smokeProfile: "adopt",
    stages: [
      { id: "records", label: "Create registry records", gate: "existing site is represented in Supabase", automation: "automated" },
      { id: "backup", label: "Verify backup", gate: "backup_ref is captured and restore path is known", automation: "manual" },
      { id: "audit", label: "Adopt audit", gate: "plugins, theme, content, forms, SMTP, and errors are inventoried", automation: "automated" },
      { id: "classify", label: "Classify delta manifest", gate: "safe_to_install, skip_install, update_required, and conflict items are separated", automation: "automated" },
      { id: "approval", label: "Approval for risky changes", gate: "update_required and conflicts cannot proceed without approval", automation: "approval" },
      { id: "delta", label: "Apply safe delta only", gate: "no existing content, theme, plugins, or settings are overwritten", automation: "automated" },
      { id: "smoke", label: "Run adopt smoke tests", gate: "all required adopt smoke checks pass", automation: "automated" },
      { id: "handoff", label: "Generate adoption handoff", gate: "audit summary and pending tasks are included", automation: "automated" },
    ],
    requiredEvidence: [
      "client approval to access existing WordPress",
      "credentials reference",
      "backup reference",
      "restore path or host backup evidence",
      "adopt audit result",
      "adopt smoke test result",
    ],
    smokeTests: [
      "homepage_status_unchanged",
      "existing_content_count_unchanged",
      "no_new_php_errors",
      "wp_admin_accessible",
      "ssl_valid",
      "existing_forms_functional",
      "mainwp_child_connected",
      "uptime_monitor_registered",
    ],
    handoffArtifacts: ["adopt_audit.json", "delta_manifest_result.json", "adopt_smoke_results.json", "handoff_report.json"],
    blockers,
    warnings: [
      ...productionWarning(environment),
      "Existing WordPress content must be treated as customer production data.",
      ...profileCDomainWarnings(input),
    ],
    nextActions: [
      "Capture backup evidence before pressing enqueue",
      "Run audit before installing or changing anything",
      "Convert conflicts into operator tasks or approval requests",
    ],
  };
}
