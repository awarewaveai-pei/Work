import { randomBytes } from "node:crypto";
import type { ProvisioningContext, ProvisioningHints, ProviderStepResult } from "../types";
import { readTrim, requiredEnv } from "../env";
import { readJsonSafe, summarizeApiError } from "../http";

/**
 * Supabase Cloud: optional Management API project create when TENANT_PROVISION_SUPABASE_ACCESS_TOKEN + billing org id present.
 * Self-hosted EU stack: record binding to shared instance + optional project ref from hints.
 */
export async function provisionSupabase(ctx: ProvisioningContext, hints?: ProvisioningHints): Promise<ProviderStepResult> {
  const studio =
    readTrim("TENANT_PROVISION_SUPABASE_STUDIO_URL") ?? "https://studio.aware-wave.com";
  const mgmtToken = requiredEnv([
    "TENANT_PROVISION_SUPABASE_ACCESS_TOKEN",
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_MANAGEMENT_ACCESS_TOKEN",
  ]);
  const billingOrg =
    hints?.supabaseBillingOrgId ?? readTrim("TENANT_PROVISION_SUPABASE_BILLING_ORG_ID");

  if (hints?.supabaseProjectRef) {
    return {
      ok: true,
      status: "active",
      secretRef: `vault://tenant/${ctx.organizationId}/supabase_service_role`,
      externalHint: studio,
      apiMetadata: {
        customer_email: ctx.customerEmail,
        ...(ctx.googleSubject ? { google_sub: ctx.googleSubject } : {}),
        supabase_project_ref: hints.supabaseProjectRef,
        supabase_studio_url: studio,
        provisioned_at: new Date().toISOString(),
        note: "Manual pin — api_metadata only; secrets remain in vault.",
      },
    };
  }

  if (!mgmtToken || !billingOrg) {
    return {
      ok: true,
      status: "pending",
      secretRef: `vault://tenant/${ctx.organizationId}/supabase_service_role`,
      externalHint: studio,
      apiMetadata: {
        customer_email: ctx.customerEmail,
        ...(ctx.googleSubject ? { google_sub: ctx.googleSubject } : {}),
        supabase_studio_url: studio,
        provisioned_at: new Date().toISOString(),
        automation_blocked_reason:
          "Provide hints.supabaseBillingOrgId + TENANT_PROVISION_SUPABASE_ACCESS_TOKEN (Supabase dashboard → Account → Access tokens) to auto-create Cloud projects; or hints.supabaseProjectRef to pin an existing project.",
      },
    };
  }

  const short = ctx.organizationId.replace(/-/g, "").slice(0, 10);
  const name = `tenant-${short}`;
  const region = hints?.supabaseRegion ?? readTrim("TENANT_PROVISION_SUPABASE_REGION") ?? "eu-central-1";

  const res = await fetch("https://api.supabase.com/v1/projects", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mgmtToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      organization_id: billingOrg,
      name,
      region,
      db_pass: randomDbPass(),
    }),
  });
  const body = await readJsonSafe(res);
  if (!res.ok) {
    return {
      ok: false,
      error: `Supabase management create project: ${summarizeApiError(res.status, body)}`,
    };
  }

  const created = body as { id?: string; ref?: string; region?: string };

  return {
    ok: true,
    status: "active",
    secretRef: `vault://tenant/${ctx.organizationId}/supabase_service_role`,
    externalHint: studio,
    apiMetadata: {
      customer_email: ctx.customerEmail,
      ...(ctx.googleSubject ? { google_sub: ctx.googleSubject } : {}),
      supabase_cloud_project_id: created.id ?? null,
      supabase_project_ref: created.ref ?? null,
      supabase_region: created.region ?? region,
      provisioned_at: new Date().toISOString(),
      note: "Fetch API keys from Supabase dashboard → Settings → API; store service_role only in vault.",
    },
  };
}

function randomDbPass(): string {
  return randomBytes(18).toString("base64url") + "Aa1!";
}
