import type { ProvisioningContext, ProvisioningHints, ProviderStepResult } from "../types";
import { requiredEnv, readTrim } from "../env";
import { readJsonSafe, summarizeApiError } from "../http";

/**
 * Creates Sentry team-scoped project + default client key (DSN).
 * Env: SENTRY_AUTH_TOKEN (Bearer), SENTRY_ORG_SLUG, optional SENTRY_TEAM_SLUG, optional SENTRY_API_BASE_URL.
 */
export async function provisionSentry(ctx: ProvisioningContext, hints?: ProvisioningHints): Promise<ProviderStepResult> {
  const token = requiredEnv(["TENANT_PROVISION_SENTRY_TOKEN", "SENTRY_AUTH_TOKEN"]);
  const orgSlug = requiredEnv(["TENANT_PROVISION_SENTRY_ORG_SLUG", "SENTRY_ORG_SLUG"]);
  let teamSlug = readTrim("TENANT_PROVISION_SENTRY_TEAM_SLUG") ?? readTrim("SENTRY_TEAM_SLUG") ?? "";
  const base = (readTrim("SENTRY_API_BASE_URL") ?? "https://sentry.io/api/0").replace(/\/$/, "");

  if (!token || !orgSlug) {
    return {
      ok: false,
      error:
        "Sentry: set TENANT_PROVISION_SENTRY_TOKEN (or SENTRY_AUTH_TOKEN) and TENANT_PROVISION_SENTRY_ORG_SLUG (or SENTRY_ORG_SLUG) on the worker.",
    };
  }

  if (!teamSlug) {
    const tr = await fetch(`${base}/organizations/${encodeURIComponent(orgSlug)}/teams/`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    const tj = await readJsonSafe(tr);
    if (!tr.ok) {
      return { ok: false, error: `Sentry list teams: ${summarizeApiError(tr.status, tj)}` };
    }
    const teams = Array.isArray(tj) ? tj : [];
    const first = teams[0] as { slug?: string } | undefined;
    if (!first?.slug) {
      return { ok: false, error: "Sentry: no teams on organization — create a team in Sentry UI first." };
    }
    teamSlug = first.slug;
  }

  const shortId = ctx.organizationId.replace(/-/g, "").slice(0, 12);
  const slug =
    hints?.sentryProjectSlug?.replace(/[^a-z0-9-]/gi, "-").toLowerCase().replace(/^-+|-+$/g, "").slice(0, 32) ||
    `tenant-${shortId}`;
  const name = hints?.sentryProjectName ?? `Tenant ${shortId}`;

  const createProject = await fetch(
    `${base}/teams/${encodeURIComponent(orgSlug)}/${encodeURIComponent(teamSlug)}/projects/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        slug,
        platform: hints?.sentryPlatform ?? "javascript-nextjs",
      }),
    }
  );
  const cpBody = await readJsonSafe(createProject);
  if (!createProject.ok) {
    return { ok: false, error: `Sentry create project: ${summarizeApiError(createProject.status, cpBody)}` };
  }

  const created = cpBody as { slug?: string; id?: string; name?: string };

  const createKey = await fetch(
    `${base}/projects/${encodeURIComponent(orgSlug)}/${encodeURIComponent(created.slug ?? slug)}/keys/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "provision-default" }),
    }
  );
  const keyBody = await readJsonSafe(createKey);
  if (!createKey.ok) {
    return {
      ok: false,
      error: `Sentry create client key: ${summarizeApiError(createKey.status, keyBody)}`,
    };
  }

  const keyObj = keyBody as {
    dsn?: { public?: string; secret?: string };
    public?: string;
    secret?: string;
    id?: string;
  };

  const dsnPublic = keyObj.dsn?.public ?? keyObj.public ?? "";
  const uiOrigin = base.replace(/\/api\/v?0\/?$/i, "").replace(/\/+$/, "") || "https://sentry.io";

  return {
    ok: true,
    status: "active",
    secretRef: `vault://tenant/${ctx.organizationId}/sentry_client_secret`,
    externalHint: `${uiOrigin}/organizations/${encodeURIComponent(orgSlug)}/projects/${encodeURIComponent(created.slug ?? slug)}/`,
    apiMetadata: {
      customer_email: ctx.customerEmail,
      ...(ctx.googleSubject ? { google_sub: ctx.googleSubject } : {}),
      sentry_org_slug: orgSlug,
      sentry_team_slug: teamSlug,
      sentry_project_slug: created.slug ?? slug,
      sentry_project_id: created.id ?? null,
      sentry_project_name: created.name ?? name,
      sentry_public_key_prefix: typeof dsnPublic === "string" ? dsnPublic.slice(0, 16) : null,
      sentry_ui_origin: uiOrigin,
      provisioned_at: new Date().toISOString(),
      note: "Store full DSN (contains secret) only in vault at secret_ref; never replicate raw secret into api_metadata.",
    },
  };
}
