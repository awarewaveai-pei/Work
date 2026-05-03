import type { ProvisioningContext, ProvisioningHints, ProviderStepResult } from "../types";
import { normalizeServiceRoot, readTrim, requiredEnv } from "../env";
import { readJsonSafe, summarizeApiError } from "../http";

/**
 * Uptime Kuma does not ship a first-party REST “create monitor” API secured by API keys (keys target /metrics).
 * We verify reachability + record intent (URL/name hints). Operators add monitors via UI or a socket.io sidecar.
 */
export async function provisionUptimeKuma(
  ctx: ProvisioningContext,
  hints?: ProvisioningHints
): Promise<ProviderStepResult> {
  const base = normalizeServiceRoot("UPTIME_KUMA_BASE_URL", "https://uptime.aware-wave.com");
  const apiKey = requiredEnv(["UPTIME_KUMA_API_KEY", "TENANT_PROVISION_UPTIME_API_KEY"]);

  if (!apiKey) {
    return {
      ok: false,
      error:
        "Uptime Kuma: set UPTIME_KUMA_API_KEY for metrics/auth probes; monitor CRUD still requires UI or socket.io automation layer.",
    };
  }

  const probe = await fetch(`${base}/metrics`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const metricsReachable = probe.ok;

  return {
    ok: true,
    status: "pending",
    secretRef: `vault://tenant/${ctx.organizationId}/uptime_kuma_socket_token`,
    externalHint: base,
    apiMetadata: {
      customer_email: ctx.customerEmail,
      ...(ctx.googleSubject ? { google_sub: ctx.googleSubject } : {}),
      uptime_metrics_endpoint_ok: metricsReachable,
      uptime_monitor_url_hint: hints?.uptimeMonitorUrl ?? readTrim("TENANT_PROVISION_UPTIME_DEFAULT_URL"),
      uptime_monitor_name_hint: hints?.uptimeMonitorName ?? null,
      provisioned_at: new Date().toISOString(),
      automation_note:
        "Create HTTP monitor in UI or deploy internal socket.io bridge; store monitor id in api_metadata after creation.",
    },
  };
}
