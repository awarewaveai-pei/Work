import type { ProvisioningContext, ProvisioningHints, ProviderStepResult } from "../types";
import { readTrim, requiredEnv } from "../env";

/**
 * Trigger.dev OSS does not expose a stable “create customer project” HTTP API in all releases.
 * We record dashboard URL + optional fixed project ref from env so ops can align CLI deploy targets.
 */
export async function provisionTrigger(ctx: ProvisioningContext, _hints?: ProvisioningHints): Promise<ProviderStepResult> {
  const dashboard =
    readTrim("TENANT_PROVISION_TRIGGER_UI_URL") ??
    readTrim("TRIGGER_API_URL")?.replace(/\/+$/, "") ??
    "https://trigger.aware-wave.com";

  const projectRef =
    readTrim("TENANT_PROVISION_TRIGGER_PROJECT_REF") ?? readTrim("TRIGGER_PROJECT_REF");

  const tokenPresent = Boolean(requiredEnv(["TRIGGER_ACCESS_TOKEN", "TENANT_PROVISION_TRIGGER_ACCESS_TOKEN"]));

  return {
    ok: true,
    status: projectRef ? "active" : "pending",
    secretRef: `vault://tenant/${ctx.organizationId}/trigger_runtime_secrets`,
    externalHint: dashboard,
    apiMetadata: {
      customer_email: ctx.customerEmail,
      ...(ctx.googleSubject ? { google_sub: ctx.googleSubject } : {}),
      trigger_dashboard_url: dashboard,
      trigger_project_ref: projectRef ?? null,
      trigger_cli_login_documented: `${dashboard} — Account → Personal Access Tokens (tr_pat_)`,
      worker_has_access_token: tokenPresent,
      provisioned_at: new Date().toISOString(),
      note:
        "One Trigger.dev project usually serves many tenants via task payloads; use vault for per-tenant secrets referenced by tasks.",
    },
  };
}
