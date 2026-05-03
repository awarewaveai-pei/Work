/** One row in public.tenant_integration_bindings — non-secret bits only in apiMetadata; vault paths in secret_ref. */

export type ProvisioningProvider =
  | "github"
  | "n8n"
  | "trigger"
  | "supabase"
  | "sentry"
  | "uptime_kuma"
  | "posthog";

export type ProviderStepResult =
  | {
      ok: true;
      secretRef?: string;
      externalHint?: string;
      apiMetadata: Record<string, unknown>;
      /** Row status in SoR; default active when omitted. */
      status?: "active" | "pending";
    }
  | { ok: false; error: string };

export type ProvisioningHints = {
  /** Sentry project slug (letters, numbers, dashes). */
  sentryProjectSlug?: string;
  sentryProjectName?: string;
  sentryPlatform?: string;
  /** GitHub repo name segment (owner comes from TENANT_PROVISION_GITHUB_ORG or user). */
  githubRepoName?: string;
  githubRepoDescription?: string;
  /** PostHog project display name */
  posthogProjectName?: string;
  posthogProjectSlug?: string;
  /** Suffix for duplicated n8n workflow name */
  n8nWorkflowSuffix?: string;
  /** Supabase Cloud — billing organization id (from dashboard URL). */
  supabaseBillingOrgId?: string;
  supabaseRegion?: string;
  /** When not auto-creating project, pin existing project ref into metadata */
  supabaseProjectRef?: string;
  /** Target URL for an Uptime Kuma HTTP monitor */
  uptimeMonitorUrl?: string;
  uptimeMonitorName?: string;
};

export type ProvisioningContext = {
  organizationId: string;
  workspaceId?: string;
  customerEmail: string;
  /** Google OIDC `sub` — audit only; does not replace per-vendor OAuth. */
  googleSubject?: string;
  hints?: ProvisioningHints;
};
