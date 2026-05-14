export interface IntegrationBlockerRow {
  id: string;
  organization_id: string;
  provider: string;
  status: string;
  last_error: string | null;
  api_metadata: Record<string, unknown> | null;
}

export interface IntegrationBlockerOrganization {
  id: string;
  slug: string;
  name: string;
}

export interface IntegrationBlocker {
  key: string;
  clientName: string;
  clientSlug: string;
  provider: string;
  status: string;
  message: string;
  nextStep: string;
}

interface HealthCheckSummary {
  ok: boolean;
  scope: string;
  summary: string;
}

export function buildIntegrationBlockers(
  integrations: IntegrationBlockerRow[],
  organizations: IntegrationBlockerOrganization[],
  env: Record<string, string | undefined> = process.env,
): IntegrationBlocker[] {
  const orgById = new Map(organizations.map((org) => [org.id, org]));
  const blockers = integrations
    .map((integration) => buildIntegrationBlocker(integration, orgById.get(integration.organization_id)))
    .filter((item): item is IntegrationBlocker => Boolean(item));

  if (!env.SLACK_GITHUB_PRS_CHANNEL_ID?.trim()) {
    blockers.push({
      key: "external-signals:slack-github-prs",
      clientName: "AwareWave Ops",
      clientSlug: "awarewave-ops",
      provider: "slack",
      status: "pending",
      message: "External signal digest cannot read the GitHub PR Slack channel because SLACK_GITHUB_PRS_CHANNEL_ID is not configured.",
      nextStep: "Add SLACK_GITHUB_PRS_CHANNEL_ID directly, or give the Slack token channel-listing scope and discover the channel ID.",
    });
  }

  return blockers;
}

function buildIntegrationBlocker(integration: IntegrationBlockerRow, org: IntegrationBlockerOrganization | undefined): IntegrationBlocker | null {
  const clientName = org?.name ?? org?.slug ?? "Unknown client";
  const clientSlug = org?.slug ?? "unknown-client";
  const error = integration.last_error ?? "";
  const health = readLastHealthCheck(integration.api_metadata);
  const summary = health?.summary ?? error;

  if (integration.provider === "cloudflare" && (integration.status === "failed" || /Invalid API Token|HTTP 401/i.test(summary))) {
    return {
      key: integration.id,
      clientName,
      clientSlug,
      provider: integration.provider,
      status: integration.status,
      message: "Cloudflare rejected the configured API token.",
      nextStep: "Create or locate a valid Cloudflare API token, sync it to SG, then Validate again.",
    };
  }

  if (integration.provider === "supabase" && /SUPABASE_SOULFULEXPRESSION_SERVICE_ROLE_KEY|Missing credential/i.test(summary)) {
    return {
      key: integration.id,
      clientName,
      clientSlug,
      provider: integration.provider,
      status: integration.status,
      message: "This client has an explicit Supabase vault reference, but the required service role key is missing.",
      nextStep: "Add SUPABASE_SOULFULEXPRESSION_SERVICE_ROLE_KEY to the secure env stores and redeploy next-admin.",
    };
  }

  if (integration.status === "failed") {
    return {
      key: integration.id,
      clientName,
      clientSlug,
      provider: integration.provider,
      status: integration.status,
      message: summary || "Provider validation failed.",
      nextStep: "Review the provider credential, endpoint, and secret_ref, then Validate again.",
    };
  }

  return null;
}

export function readLastHealthCheck(metadata: Record<string, unknown> | null | undefined): HealthCheckSummary | null {
  const raw = metadata?.last_health_check;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.ok !== "boolean" || typeof row.scope !== "string" || typeof row.summary !== "string") return null;
  return { ok: row.ok, scope: row.scope, summary: row.summary };
}
