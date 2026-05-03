import type { ProvisioningContext, ProvisioningHints, ProviderStepResult } from "../types";
import { requiredEnv, readTrim } from "../env";
import { readJsonSafe, summarizeApiError } from "../http";

/**
 * Creates a PostHog project via REST. SaaS vs self-hosted differs slightly — organization resolution is best-effort.
 * Env: POSTHOG_HOST + POSTHOG_PERSONAL_API_KEY (or aliases below).
 */
export async function provisionPosthog(ctx: ProvisioningContext, hints?: ProvisioningHints): Promise<ProviderStepResult> {
  const key =
    requiredEnv(["TENANT_PROVISION_POSTHOG_KEY", "POSTHOG_PERSONAL_API_KEY"]) ??
    requiredEnv(["POSTHOG_API_KEY"]);
  const hostRead =
    readTrim("POSTHOG_HOST") ?? readTrim("TENANT_PROVISION_POSTHOG_HOST") ?? readTrim("POSTHOG_API_HOST");
  if (!key || !hostRead) {
    return {
      ok: false,
      error:
        "PostHog: set POSTHOG_HOST (origin, no trailing slash) and POSTHOG_PERSONAL_API_KEY (with permission to create projects).",
    };
  }

  const origin = hostRead.replace(/\/$/, "");
  const short = ctx.organizationId.replace(/-/g, "").slice(0, 10);
  const projName =
    hints?.posthogProjectName ?? hints?.posthogProjectSlug ?? `tenant-${short}`;

  async function resolveOrganizationId(): Promise<string | null> {
    const list = await fetch(`${origin}/api/organizations/`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
    const json = await readJsonSafe(list);
    if (!list.ok || json === null) return null;
    const rows = Array.isArray(json)
      ? json
      : typeof json === "object" && json !== null && "results" in json && Array.isArray((json as { results: unknown }).results)
        ? ((json as { results: { id?: string }[] }).results ?? [])
        : [];
    if (rows.length === 0) return null;
    const first = rows[0] as { id?: string };
    return first.id ?? null;
  }

  let orgId: string | null = null;
  const tryCreate = async (body: Record<string, unknown>) =>
    fetch(`${origin}/api/projects/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

  let create = await tryCreate({ name: projName });
  let cr = await readJsonSafe(create);

  if (!create.ok && create.status >= 400) {
    orgId = await resolveOrganizationId();
    if (orgId) {
      create = await tryCreate({ name: projName, organization: orgId });
      cr = await readJsonSafe(create);
    }
  }

  if (!create.ok) {
    return {
      ok: false,
      error: `PostHog create project: ${summarizeApiError(create.status, cr)}`,
    };
  }

  const p = cr as { id?: number; name?: string };

  return {
    ok: true,
    status: "active",
    secretRef: `vault://tenant/${ctx.organizationId}/posthog_project_api_key`,
    externalHint: `${origin}/project/${p.id ?? ""}`,
    apiMetadata: {
      customer_email: ctx.customerEmail,
      ...(ctx.googleSubject ? { google_sub: ctx.googleSubject } : {}),
      posthog_project_id: p.id ?? null,
      posthog_project_name: p.name ?? projName,
      posthog_host: origin,
      posthog_organization_id: orgId,
      provisioned_at: new Date().toISOString(),
      note: "Store project API token / write key only in vault at secret_ref.",
    },
  };
}
