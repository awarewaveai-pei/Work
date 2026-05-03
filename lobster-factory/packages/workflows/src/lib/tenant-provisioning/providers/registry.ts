import type { ProvisioningContext, ProviderStepResult, ProvisioningProvider } from "../types";

/**
 * Real provisioning needs per-product OAuth apps / management tokens on YOUR side.
 * These handlers return structured rows for SoR; where automation is not wired, status is failed/pending with explicit lastError.
 */
export async function runProviderStep(
  provider: ProvisioningProvider,
  ctx: ProvisioningContext
): Promise<ProviderStepResult> {
  const baseMeta = {
    customer_email: ctx.customerEmail,
    ...(ctx.googleSubject ? { google_sub: ctx.googleSubject } : {}),
    provisioned_at_attempt: new Date().toISOString(),
  };

  switch (provider) {
    case "github":
      return {
        ok: false,
        error:
          "GitHub: needs GitHub App or OAuth App install flow (user consents GitHub, not Google alone). Store PAT/GitHub App installation id via secure channel; write secret_ref to vault only.",
      };

    case "n8n":
      return {
        ok: true,
        status: "pending",
        externalHint: "n8n.aware-wave.com",
        apiMetadata: {
          ...baseMeta,
          editor_base_url: "https://n8n.aware-wave.com",
          note: "Self-hosted n8n: per-customer users typically LDAP/OIDC or manual; automation records binding slot only.",
        },
      };

    case "trigger":
      return {
        ok: true,
        status: "pending",
        externalHint: "trigger.aware-wave.com",
        apiMetadata: {
          ...baseMeta,
          dashboard_url: "https://trigger.aware-wave.com",
          project_ref_env: "Set after deploy; sync via trigger.config project id",
          note: "Create Trigger project via dashboard or Management API when exposed; token stays in vault.",
        },
      };

    case "supabase":
      return {
        ok: false,
        error:
          "Supabase: new cloud projects use Supabase Management API + billing; self-hosted EU stack is shared — bind customer schema/org row, not new Postgres per click. Wire SUPABASE_MANAGEMENT_TOKEN when ready.",
      };

    case "sentry":
      return {
        ok: false,
        error:
          "Sentry: create org/project via Sentry API with org token; set SENTRY_AUTH_TOKEN + SENTRY_ORG_SLUG in worker env to enable automated step.",
      };

    case "uptime_kuma":
      return {
        ok: false,
        error:
          "Uptime Kuma: use Socket/API with UPTIME_KUMA_API_KEY; add monitors per customer URL when key is configured.",
      };

    case "posthog":
      return {
        ok: false,
        error:
          "PostHog: personal API key cannot silently create orgs; use PostHog bootstrap/admin API or manual project + record project_api_key ref in vault.",
      };

  }
}
