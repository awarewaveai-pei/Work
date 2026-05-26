/**
 * Integration steps — called by workflows to register a client site
 * with each external service: Uptime Kuma, Sentry, PostHog, n8n, MainWP.
 *
 * Each function returns a typed result so the workflow can log evidence
 * and write it back to Supabase as part of the handoff report.
 *
 * All functions are safe to call even when config is missing — they
 * return status: "skipped" so the workflow doesn't break.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types shared with contracts.ts (duplicated to avoid circular imports)
// ─────────────────────────────────────────────────────────────────────────────

export type UptimeKumaConfig = {
  url: string;
  apiKey: string;
  groupName?: string;
};

export type SentryConfig = {
  org: string;
  authToken: string;
  team?: string;
};

export type PostHogConfig = {
  projectApiKey: string;
  host?: string;
};

export type N8nConfig = {
  onboardingWebhookUrl: string;
  bearerToken?: string;
};

export type MainWpConfig = {
  dashboardUrl: string;
  consumerKey: string;
  consumerSecret: string;
};

export type BuildIntegrations = {
  uptimeKuma?: UptimeKumaConfig;
  sentry?: SentryConfig;
  postHog?: PostHogConfig;
  n8n?: N8nConfig;
  mainWp?: MainWpConfig;
};

export type IntegrationResult = {
  service: string;
  status: "ok" | "skipped" | "error";
  detail?: string;
  resourceId?: string;
  resourceUrl?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Uptime Kuma — create HTTP monitor for the site
// ─────────────────────────────────────────────────────────────────────────────

export async function registerUptimeKumaMonitor(
  cfg: UptimeKumaConfig | undefined,
  siteUrl: string,
  clientName: string
): Promise<IntegrationResult> {
  if (!cfg?.url || !cfg?.apiKey) {
    return { service: "uptime_kuma", status: "skipped", detail: "uptimeKuma config not provided" };
  }

  // Uptime Kuma API v1: POST /api/v1/monitor
  const body = {
    type: 1,        // HTTP(S)
    name: `[${clientName}] ${siteUrl}`,
    url: siteUrl,
    interval: 60,
    retryInterval: 60,
    maxretries: 3,
    upsideDown: false,
    notificationIDList: {},
    ...(cfg.groupName ? { tags: [{ name: cfg.groupName }] } : {}),
  };

  try {
    const res = await fetch(`${cfg.url}/api/v1/monitor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return { service: "uptime_kuma", status: "error", detail: `HTTP ${res.status} (response body redacted)` };
    }

    const json = (await res.json()) as { monitorID?: number; msg?: string };
    return {
      service: "uptime_kuma",
      status: "ok",
      detail: `Monitor created`,
      resourceId: String(json.monitorID ?? ""),
      resourceUrl: `${cfg.url}/dashboard/${json.monitorID}`,
    };
  } catch (err) {
    return {
      service: "uptime_kuma",
      status: "error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

// SSL monitor (separate Uptime Kuma monitor type 4)
export async function registerUptimeKumaSslMonitor(
  cfg: UptimeKumaConfig | undefined,
  siteUrl: string,
  clientName: string
): Promise<IntegrationResult> {
  if (!cfg?.url || !cfg?.apiKey) {
    return { service: "uptime_kuma_ssl", status: "skipped", detail: "uptimeKuma config not provided" };
  }
  if (!siteUrl.startsWith("https://")) {
    return { service: "uptime_kuma_ssl", status: "skipped", detail: "site does not use HTTPS" };
  }

  const hostname = new URL(siteUrl).hostname;
  const body = {
    type: 4,   // DNS / SSL cert
    name: `[${clientName}] SSL ${hostname}`,
    hostname,
    port: 443,
    interval: 3600,
  };

  try {
    const res = await fetch(`${cfg.url}/api/v1/monitor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return { service: "uptime_kuma_ssl", status: "error", detail: `HTTP ${res.status} (response body redacted)` };
    }

    const json = (await res.json()) as { monitorID?: number };
    return {
      service: "uptime_kuma_ssl",
      status: "ok",
      detail: `SSL monitor created for ${hostname}`,
      resourceId: String(json.monitorID ?? ""),
    };
  } catch (err) {
    return {
      service: "uptime_kuma_ssl",
      status: "error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Sentry — create a project for the client
// ─────────────────────────────────────────────────────────────────────────────

export async function createSentryProject(
  cfg: SentryConfig | undefined,
  clientName: string,
  platform = "javascript"
): Promise<IntegrationResult> {
  if (!cfg?.org || !cfg?.authToken) {
    return { service: "sentry", status: "skipped", detail: "sentry config not provided" };
  }

  // Sentry API: POST /api/0/teams/{org}/{team}/projects/
  const team = cfg.team ?? cfg.org;
  const slug = clientName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);

  try {
    const res = await fetch(`https://sentry.io/api/0/teams/${cfg.org}/${team}/projects/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.authToken}`,
      },
      body: JSON.stringify({ name: clientName, slug, platform }),
    });

    if (!res.ok) {
      return { service: "sentry", status: "error", detail: `HTTP ${res.status} (response body redacted)` };
    }

    const json = (await res.json()) as { id?: string; slug?: string; name?: string };
    return {
      service: "sentry",
      status: "ok",
      detail: `Project ${json.slug} created`,
      resourceId: json.id ?? "",
      resourceUrl: `https://sentry.io/organizations/${cfg.org}/projects/${json.slug}/`,
    };
  } catch (err) {
    return {
      service: "sentry",
      status: "error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. PostHog — capture a site_onboarded event (proves tracking is live)
// ─────────────────────────────────────────────────────────────────────────────

export async function capturePostHogOnboardingEvent(
  cfg: PostHogConfig | undefined,
  siteUrl: string,
  clientName: string,
  profile: string
): Promise<IntegrationResult> {
  if (!cfg?.projectApiKey) {
    return { service: "posthog", status: "skipped", detail: "postHog config not provided" };
  }

  const host = cfg.host ?? "https://app.posthog.com";

  try {
    const res = await fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: cfg.projectApiKey,
        event: "site_onboarded",
        distinct_id: siteUrl,
        properties: {
          site_url: siteUrl,
          client_name: clientName,
          deploy_profile: profile,
          $set: {
            site_url: siteUrl,
            client_name: clientName,
          },
        },
      }),
    });

    if (!res.ok) {
      return { service: "posthog", status: "error", detail: `HTTP ${res.status} (response body redacted)` };
    }

    return {
      service: "posthog",
      status: "ok",
      detail: `site_onboarded event captured for ${siteUrl}`,
    };
  } catch (err) {
    return {
      service: "posthog",
      status: "error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. n8n — trigger the client onboarding webhook
// ─────────────────────────────────────────────────────────────────────────────

export async function triggerN8nOnboarding(
  cfg: N8nConfig | undefined,
  payload: Record<string, unknown>
): Promise<IntegrationResult> {
  if (!cfg?.onboardingWebhookUrl) {
    return { service: "n8n", status: "skipped", detail: "n8n onboardingWebhookUrl not provided" };
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.bearerToken) {
    headers["Authorization"] = `Bearer ${cfg.bearerToken}`;
  }

  try {
    const res = await fetch(cfg.onboardingWebhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return { service: "n8n", status: "error", detail: `HTTP ${res.status} (response body redacted)` };
    }

    return {
      service: "n8n",
      status: "ok",
      detail: `Onboarding webhook triggered`,
    };
  } catch (err) {
    return {
      service: "n8n",
      status: "error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. MainWP — add site via REST API
// ─────────────────────────────────────────────────────────────────────────────

export async function addSiteToMainWp(
  cfg: MainWpConfig | undefined,
  siteUrl: string,
  adminUrl: string
): Promise<IntegrationResult> {
  if (!cfg?.dashboardUrl || !cfg?.consumerKey || !cfg?.consumerSecret) {
    return { service: "mainwp", status: "skipped", detail: "mainWp config not provided" };
  }

  // MainWP REST API v2: POST /wp-json/mainwp/v2/site/add
  // Requires Basic auth with consumer key:secret
  const credentials = Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString("base64");

  try {
    const res = await fetch(`${cfg.dashboardUrl}/wp-json/mainwp/v2/site/add`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify({ url: siteUrl, admin_url: adminUrl }),
    });

    if (!res.ok) {
      return { service: "mainwp", status: "error", detail: `HTTP ${res.status} (response body redacted)` };
    }

    const json = (await res.json()) as { id?: number; site_url?: string };
    return {
      service: "mainwp",
      status: "ok",
      detail: `Site added to MainWP Dashboard`,
      resourceId: String(json.id ?? ""),
      resourceUrl: `${cfg.dashboardUrl}/wp-admin/admin.php?page=mainwp_tab`,
    };
  } catch (err) {
    return {
      service: "mainwp",
      status: "error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch: run all integrations for a client site
// ─────────────────────────────────────────────────────────────────────────────

export async function runAllIntegrations(
  integrations: BuildIntegrations | undefined,
  site: {
    siteUrl: string;
    adminUrl: string;
    clientName: string;
    profile: string;
  }
): Promise<IntegrationResult[]> {
  if (!integrations) {
    return [
      { service: "uptime_kuma",     status: "skipped", detail: "no integrations config" },
      { service: "uptime_kuma_ssl", status: "skipped", detail: "no integrations config" },
      { service: "sentry",          status: "skipped", detail: "no integrations config" },
      { service: "posthog",         status: "skipped", detail: "no integrations config" },
      { service: "n8n",             status: "skipped", detail: "no integrations config" },
      { service: "mainwp",          status: "skipped", detail: "no integrations config" },
    ];
  }

  const results = await Promise.allSettled([
    registerUptimeKumaMonitor(integrations.uptimeKuma, site.siteUrl, site.clientName),
    registerUptimeKumaSslMonitor(integrations.uptimeKuma, site.siteUrl, site.clientName),
    createSentryProject(integrations.sentry, site.clientName),
    capturePostHogOnboardingEvent(integrations.postHog, site.siteUrl, site.clientName, site.profile),
    triggerN8nOnboarding(integrations.n8n, {
      event: "client_onboarded",
      siteUrl: site.siteUrl,
      clientName: site.clientName,
      profile: site.profile,
    }),
    addSiteToMainWp(integrations.mainWp, site.siteUrl, site.adminUrl),
  ]);

  return results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : { service: "unknown", status: "error" as const, detail: String((r as PromiseRejectedResult).reason) }
  );
}
