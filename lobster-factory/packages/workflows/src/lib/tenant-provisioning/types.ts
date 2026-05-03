/** One row in public.tenant_integration_bindings — non-secret bits only in apiMetadata; vault paths in secretRef. */

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

export type ProvisioningContext = {
  organizationId: string;
  workspaceId?: string;
  customerEmail: string;
  /** Google OIDC `sub` — audit only; does not replace per-vendor OAuth. */
  googleSubject?: string;
};
