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

import { randomBytes } from "node:crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Types shared with contracts.ts (duplicated to avoid circular imports)
// ─────────────────────────────────────────────────────────────────────────────

export type UptimeKumaConfig = {
  url: string;
  apiKey: string;
  groupName?: string;
  /** Shared ops-inbox webhook notification (Uptime Kuma notification id).
   *  When set, every auto-created monitor is wired to POST heartbeats to
   *  app.aware-wave.com/api/webhooks/uptime-kuma — without it a DOWN event
   *  never reaches the incident pipeline (2026-07-03 chain audit 缺件①). */
  notificationId?: number;
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

/** Server-side only: read from the Trigger.dev environment (MAINWP_*), never from the run payload. */
export type MainWpConfig = {
  dashboardUrl: string;
  consumerKey: string;
  consumerSecret: string;
};

/** What a run payload may say about MainWP. Registration is ON unless `enabled === false`. */
export type MainWpOptions = {
  enabled?: boolean;
  /** Administrator username ON THE CHILD SITE (mainwp-child refuses without it). Overrides the
   *  one the provisioner reports; needed for adopted sites. Not a secret. */
  adminUsername?: string;
};

export function mainWpConfigFromEnv(env: Record<string, string | undefined> = process.env): MainWpConfig | undefined {
  const dashboardUrl = env.MAINWP_DASHBOARD_URL?.trim();
  const consumerKey = env.MAINWP_CONSUMER_KEY?.trim();
  const consumerSecret = env.MAINWP_CONSUMER_SECRET?.trim();
  return dashboardUrl && consumerKey && consumerSecret ? { dashboardUrl, consumerKey, consumerSecret } : undefined;
}

export type BuildIntegrations = {
  uptimeKuma?: UptimeKumaConfig;
  sentry?: SentryConfig;
  postHog?: PostHogConfig;
  n8n?: N8nConfig;
  mainWp?: MainWpOptions;
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
  clientName: string,
  clientSlug?: string
): Promise<IntegrationResult> {
  if (!cfg?.url || !cfg?.apiKey) {
    return { service: "uptime_kuma", status: "skipped", detail: "uptimeKuma config not provided" };
  }

  // Uptime Kuma API v1: POST /api/v1/monitor
  // The `client` tag is what normalize/uptime-kuma.ts reads to attribute the
  // incident to a customer (tag name "client", value = org slug). Without it
  // every heartbeat lands with client_slug=null (2026-07-03 chain audit 缺件②).
  const tags = [
    ...(cfg.groupName ? [{ name: cfg.groupName }] : []),
    ...(clientSlug ? [{ name: "client", value: clientSlug }] : []),
  ];
  const body = {
    type: 1,        // HTTP(S)
    name: `[${clientName}] ${siteUrl}`,
    url: siteUrl,
    interval: 60,
    retryInterval: 60,
    maxretries: 3,
    upsideDown: false,
    notificationIDList: cfg.notificationId ? { [String(cfg.notificationId)]: true } : {},
    ...(tags.length ? { tags } : {}),
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
  clientName: string,
  clientSlug?: string
): Promise<IntegrationResult> {
  if (!cfg?.url || !cfg?.apiKey) {
    return { service: "uptime_kuma_ssl", status: "skipped", detail: "uptimeKuma config not provided" };
  }
  if (!siteUrl.startsWith("https://")) {
    return { service: "uptime_kuma_ssl", status: "skipped", detail: "site does not use HTTPS" };
  }

  const hostname = new URL(siteUrl).hostname;
  const sslTags = clientSlug ? [{ name: "client", value: clientSlug }] : [];
  const body = {
    type: 4,   // DNS / SSL cert
    name: `[${clientName}] SSL ${hostname}`,
    hostname,
    port: 443,
    interval: 3600,
    notificationIDList: cfg.notificationId ? { [String(cfg.notificationId)]: true } : {},
    ...(sslTags.length ? { tags: sslTags } : {}),
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
  platform = "javascript",
  clientSlug?: string
): Promise<IntegrationResult> {
  if (!cfg?.org || !cfg?.authToken) {
    return { service: "sentry", status: "skipped", detail: "sentry config not provided" };
  }

  // Sentry API: POST /api/0/teams/{org}/{team}/projects/
  // Prefer the org slug as project slug: normalize/sentry.ts attributes
  // incidents to a customer via project_slug, so aligning the two makes
  // Sentry alerts auto-attribute (2026-07-03 chain audit 缺件④ partial).
  const team = cfg.team ?? cfg.org;
  const slug = (clientSlug || clientName)
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

    if (res.status === 409) {
      // Idempotency (critic 2026-07-03): re-running onboarding for the same org
      // hits an existing project — that is success, not failure.
      return { service: "sentry", status: "ok", detail: `Project already exists (slug: ${slug})` };
    }
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

// Contract verified against the installed MainWP 6.0.12 source (class-mainwp-rest-sites-controller.php):
// route `sites/add` (not `site/add`), fields url / name / admin (child-site admin username) /
// uniqueid, Basic auth over HTTPS only. A refused add still answers HTTP 200 with
// `{success: 0, error}` — res.ok alone reports every failure as success.
// mainwp-child 6.x verifies the connecting admin by password unless the provisioner turned
// password auth off for that user and set a Unique Security ID — then `uniqueid` must match.
export async function addSiteToMainWp(
  cfg: MainWpConfig | undefined,
  siteUrl: string,
  siteName: string,
  adminUsername: string | undefined,
  childUniqueId?: string
): Promise<IntegrationResult> {
  if (!cfg?.dashboardUrl || !cfg?.consumerKey || !cfg?.consumerSecret) {
    return { service: "mainwp", status: "skipped", detail: "mainWp config not provided" };
  }
  if (!siteUrl) {
    return { service: "mainwp", status: "error", detail: "no site URL to register" };
  }
  const admin = adminUsername?.trim();
  if (!admin) {
    return {
      service: "mainwp",
      status: "error",
      detail: "no child-site administrator username (mainWp.adminUsername unset and provisioner reported none)",
    };
  }

  const credentials = Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString("base64");
  const dashboard = cfg.dashboardUrl.replace(/\/+$/, "");

  try {
    const res = await fetch(`${dashboard}/wp-json/mainwp/v2/sites/add`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify({ url: siteUrl, name: siteName, admin, ...(childUniqueId ? { uniqueid: childUniqueId } : {}) }),
    });

    if (!res.ok) {
      return { service: "mainwp", status: "error", detail: `HTTP ${res.status} (response body redacted)` };
    }

    const json = (await res.json()) as { success?: number; error?: string; data?: { id?: number | string } };
    if (json.success !== 1 || json.data?.id == null) {
      return {
        service: "mainwp",
        status: "error",
        detail: `MainWP refused the site: ${String(json.error ?? "no error given").slice(0, 300)}`,
      };
    }
    return {
      service: "mainwp",
      status: "ok",
      detail: `Site added to MainWP Dashboard`,
      resourceId: String(json.data.id),
      resourceUrl: `${dashboard}/wp-admin/admin.php?page=managesites&dashboard=${encodeURIComponent(String(json.data.id))}`,
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
    /** Administrator username the hosting provisioner installed (stagingRef.wpAdminUser). */
    wpAdminUser?: string;
    /** Unique Security ID this run generated and the provisioner set on mainwp-child. In memory only. */
    mainWpChildUniqueId?: string;
    /** organizations.slug — threads client attribution into monitor tags + Sentry project slug */
    clientSlug?: string;
  }
): Promise<IntegrationResult[]> {
  const mainWp = registerWithMainWp(integrations?.mainWp, site);
  if (!integrations) {
    return [
      { service: "uptime_kuma",     status: "skipped", detail: "no integrations config" },
      { service: "uptime_kuma_ssl", status: "skipped", detail: "no integrations config" },
      { service: "sentry",          status: "skipped", detail: "no integrations config" },
      { service: "posthog",         status: "skipped", detail: "no integrations config" },
      { service: "n8n",             status: "skipped", detail: "no integrations config" },
      await mainWp,
    ];
  }

  const results = await Promise.allSettled([
    registerUptimeKumaMonitor(integrations.uptimeKuma, site.siteUrl, site.clientName, site.clientSlug),
    registerUptimeKumaSslMonitor(integrations.uptimeKuma, site.siteUrl, site.clientName, site.clientSlug),
    createSentryProject(integrations.sentry, site.clientName, "javascript", site.clientSlug),
    capturePostHogOnboardingEvent(integrations.postHog, site.siteUrl, site.clientName, site.profile),
    triggerN8nOnboarding(integrations.n8n, {
      event: "client_onboarded",
      siteUrl: site.siteUrl,
      clientName: site.clientName,
      profile: site.profile,
    }),
    mainWp,
  ]);

  return results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : { service: "unknown", status: "error" as const, detail: String((r as PromiseRejectedResult).reason) }
  );
}

// MainWP is on by default: its credentials live server-side, so unlike the other integrations it
// does not need the payload to carry anything. An adopted site with no known admin is skipped
// (not an error) unless the operator explicitly asked for registration.
async function registerWithMainWp(
  opts: MainWpOptions | undefined,
  site: { siteUrl: string; clientName: string; wpAdminUser?: string; mainWpChildUniqueId?: string }
): Promise<IntegrationResult> {
  if (opts?.enabled === false) {
    return { service: "mainwp", status: "skipped", detail: "MainWP registration unchecked for this run" };
  }
  const admin = opts?.adminUsername?.trim() || site.wpAdminUser?.trim();
  if (!admin && opts?.enabled !== true) {
    return { service: "mainwp", status: "skipped", detail: "no child-site admin known (set mainWp.adminUsername)" };
  }
  const cfg = mainWpConfigFromEnv();
  if (!cfg && opts?.enabled === true) {
    return { service: "mainwp", status: "error", detail: "MainWP registration requested but MAINWP_* is not set on the server" };
  }
  return addSiteToMainWp(cfg, site.siteUrl, site.clientName, admin, site.mainWpChildUniqueId);
}

/** A fresh Unique Security ID for mainwp-child, or undefined when MainWP registration will not run. */
export function newMainWpChildUniqueId(opts: MainWpOptions | undefined): string | undefined {
  if (opts?.enabled === false || !mainWpConfigFromEnv()) return undefined;
  return randomBytes(24).toString("hex");
}
