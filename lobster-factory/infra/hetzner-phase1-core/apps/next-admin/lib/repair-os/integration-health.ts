import { setDefaultResultOrder } from "node:dns";
import http from "node:http";
import https from "node:https";

setDefaultResultOrder("ipv4first");

export interface IntegrationHealthInput {
  provider: string;
  secretRef: string | null;
  externalHint: string | null;
  metadata: Record<string, unknown>;
}

export interface IntegrationHealthResult {
  ok: boolean;
  status: "active" | "failed" | "pending";
  scope: "deep_provider_api" | "endpoint_reachable" | "registry_shape";
  summary: string;
  checkedAt: string;
  details: Record<string, unknown>;
}

const DEFAULT_ENV_BY_PROVIDER: Record<string, string[]> = {
  cloudflare: ["CLOUDFLARE_API_TOKEN"],
  grafana: ["GRAFANA_SERVICE_ACCOUNT_TOKEN"],
  n8n: ["N8N_API_KEY", "N8N_AUTH_BEARER_TOKEN"],
  netdata: ["NETDATA_API_TOKEN"],
  posthog: ["POSTHOG_PERSONAL_API_KEY", "POSTHOG_API_KEY"],
  sentry: ["SENTRY_AUTH_TOKEN"],
  slack: ["SLACK_BOT_TOKEN"],
  supabase: ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_AWAREWAVE_SERVICE_ROLE_KEY", "SUPABASE_SOULFULEXPRESSION_SERVICE_ROLE_KEY"],
  trigger: ["TRIGGER_ACCESS_TOKEN", "TRIGGER_SECRET_KEY"],
  uptime_kuma: ["UPTIME_KUMA_API_KEY"],
};

export async function checkIntegrationHealth(input: IntegrationHealthInput): Promise<IntegrationHealthResult> {
  const provider = normalizeProvider(input.provider);
  const checkedAt = new Date().toISOString();
  const token = resolveToken(input.secretRef, DEFAULT_ENV_BY_PROVIDER[provider] ?? []);

  try {
    if (provider === "cloudflare") {
      return await checkJsonApiCandidates({
        checkedAt,
        provider,
        tokens: resolveTokenCandidates(input.secretRef, DEFAULT_ENV_BY_PROVIDER[provider] ?? []),
        // Account-owned tokens (the kind we issue) 401 on /user/tokens/verify; they only verify per account.
        url: cloudflareVerifyUrl(clean(process.env.CLOUDFLARE_ACCOUNT_ID)),
        headersForToken: bearerHeaders,
        okWhen: (status, json) => status === 200 && readBoolean(json, "success") === true,
      });
    }

    if (provider === "sentry") {
      return await checkJsonApi({
        checkedAt,
        provider,
        token,
        url: `${baseUrl(input.externalHint, "https://sentry.io/api/0")}/organizations/`,
        headers: bearerHeaders(token.value),
        okWhen: (status) => status >= 200 && status < 300,
      });
    }

    if (provider === "slack") {
      return await checkJsonApi({
        checkedAt,
        provider,
        token,
        url: "https://slack.com/api/auth.test",
        headers: bearerHeaders(token.value),
        okWhen: (status, json) => status === 200 && readBoolean(json, "ok") === true,
      });
    }

    if (provider === "posthog") {
      return await checkJsonApi({
        checkedAt,
        provider,
        token,
        url: `${posthogBaseUrl(input.externalHint, process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com")}/api/projects/`,
        headers: bearerHeaders(token.value),
        okWhen: (status) => status >= 200 && status < 300,
      });
    }

    if (provider === "supabase") {
      return await checkJsonApi({
        checkedAt,
        provider,
        token,
        url: `${baseUrl(input.externalHint, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")}/rest/v1/`,
        headers: {
          apikey: token.value ?? "",
          Authorization: `Bearer ${token.value ?? ""}`,
        },
        okWhen: (status) => status >= 200 && status < 300,
      });
    }

    if (provider === "n8n") {
      return await checkJsonApi({
        checkedAt,
        provider,
        token,
        url: `${baseUrl(input.externalHint, "https://n8n.aware-wave.com/api/v1")}/workflows?limit=1`,
        headers: {
          Authorization: `Bearer ${token.value ?? ""}`,
          "X-N8N-API-KEY": token.value ?? "",
        },
        okWhen: (status) => status >= 200 && status < 300,
      });
    }

    if (provider === "trigger") {
      return await checkReachable({
        checkedAt,
        provider,
        url: `${baseUrl(input.externalHint, process.env.TRIGGER_API_URL ?? "https://api.trigger.dev")}/`,
        token,
      });
    }

    if (provider === "grafana") {
      const internalGrafanaBaseUrl = baseUrl(process.env.GRAFANA_INTERNAL_BASE_URL ?? null, "");
      return await checkJsonApi({
        checkedAt,
        provider,
        token,
        url: `${internalGrafanaBaseUrl || containerReachableBaseUrl(input.externalHint, process.env.GRAFANA_BASE_URL ?? "")}/api/health`,
        headers: bearerHeaders(token.value),
        okWhen: (status) => status >= 200 && status < 300,
      });
    }

    if (provider === "netdata") {
      const netdataUrl = `${baseUrl(input.externalHint, process.env.NETDATA_BASE_URL ?? "https://app.netdata.cloud")}/api/v1/info`;
      if (token.value) {
        return await checkJsonApi({
          checkedAt,
          provider,
          token,
          url: netdataUrl,
          headers: bearerHeaders(token.value),
          okWhen: (status) => status >= 200 && status < 300,
        });
      }
      return await checkReachable({ checkedAt, provider, url: netdataUrl, token });
    }

    if (provider === "uptime_kuma") {
      return await checkReachable({
        checkedAt,
        provider,
        url: `${baseUrl(input.externalHint, "https://uptime.aware-wave.com")}/api/health`,
        token,
      });
    }

    const hasReference = Boolean(clean(input.secretRef) || clean(input.externalHint));
    return {
      ok: hasReference,
      status: hasReference ? "pending" : "failed",
      scope: "registry_shape",
      summary: hasReference ? "Registry reference exists; no deep adapter is available for this provider yet." : "Missing registry reference.",
      checkedAt,
      details: { provider, adapter: "registry_only" },
    };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      scope: "deep_provider_api",
      summary: error instanceof Error ? error.message : "Provider health check failed.",
      checkedAt,
      details: { provider, error: "exception" },
    };
  }
}

async function checkJsonApi(input: {
  checkedAt: string;
  provider: string;
  token: ResolvedToken;
  url: string;
  headers: Record<string, string>;
  okWhen: (status: number, json: unknown) => boolean;
}): Promise<IntegrationHealthResult> {
  if (!input.url) return missingUrl(input.checkedAt, input.provider);
  if (!input.token.value) return missingToken(input.checkedAt, input.provider, input.token);

  const response = await fetchWithTimeout(input.url, { headers: input.headers });
  const json = await readJsonSafe(response);
  const ok = input.okWhen(response.status, json);
  return {
    ok,
    status: ok ? "active" : "failed",
    scope: "deep_provider_api",
    summary: ok ? "Provider API accepted the configured credential." : `Provider API rejected the check with HTTP ${response.status}.`,
    checkedAt: input.checkedAt,
    details: {
      provider: input.provider,
      http_status: response.status,
      credential_env: input.token.envName,
    },
  };
}

async function checkJsonApiCandidates(input: {
  checkedAt: string;
  provider: string;
  tokens: ResolvedToken[];
  url: string;
  headersForToken: (token: string | null) => Record<string, string>;
  okWhen: (status: number, json: unknown) => boolean;
}): Promise<IntegrationHealthResult> {
  if (!input.url) return missingUrl(input.checkedAt, input.provider);
  const candidates = input.tokens.filter((candidate) => candidate.value);
  if (candidates.length === 0) return missingToken(input.checkedAt, input.provider, input.tokens[0] ?? { value: null, envName: null });

  const tried: string[] = [];
  let lastResult: IntegrationHealthResult | null = null;
  for (const candidate of candidates) {
    tried.push(candidate.envName ?? "unknown");
    lastResult = await checkJsonApi({
      checkedAt: input.checkedAt,
      provider: input.provider,
      token: candidate,
      url: input.url,
      headers: input.headersForToken(candidate.value),
      okWhen: input.okWhen,
    });
    if (lastResult.ok) {
      return {
        ...lastResult,
        details: {
          ...lastResult.details,
          tried_credential_envs: tried,
        },
      };
    }
  }

  return {
    ...(lastResult as IntegrationHealthResult),
    summary: `${lastResult?.summary ?? "Provider API rejected the configured credentials."} Tried ${tried.length} credential candidate(s).`,
    details: {
      ...(lastResult?.details ?? { provider: input.provider }),
      tried_credential_envs: tried,
    },
  };
}

async function checkReachable(input: {
  checkedAt: string;
  provider: string;
  url: string;
  token: ResolvedToken;
}): Promise<IntegrationHealthResult> {
  if (!input.url) return missingUrl(input.checkedAt, input.provider);

  const headers = input.token.value ? bearerHeaders(input.token.value) : {};
  const response = await fetchWithTimeout(input.url, { headers });
  const ok = response.status >= 200 && response.status < 500;
  return {
    ok,
    status: ok ? "active" : "failed",
    scope: "endpoint_reachable",
    summary: ok ? "Provider endpoint is reachable. This adapter does not prove full credential scope yet." : `Provider endpoint failed with HTTP ${response.status}.`,
    checkedAt: input.checkedAt,
    details: {
      provider: input.provider,
      http_status: response.status,
      credential_env: input.token.envName,
      credential_present: Boolean(input.token.value),
    },
  };
}

interface HealthHttpResponse {
  status: number;
  text(): Promise<string>;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<HealthHttpResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    return await requestWithNodeHttp(url, init, error);
  } finally {
    clearTimeout(timeout);
  }
}

async function requestWithNodeHttp(url: string, init: RequestInit, originalError: unknown): Promise<HealthHttpResponse> {
  const target = new URL(url);
  const client = target.protocol === "http:" ? http : https;
  const headers = normalizeHeaders(init.headers);

  return await new Promise<HealthHttpResponse>((resolve, reject) => {
    const req = client.request(
      target,
      {
        method: init.method ?? "GET",
        headers,
        timeout: 12_000,
        family: 4,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          resolve({
            status: res.statusCode ?? 0,
            text: async () => body,
          });
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("node_http_timeout")));
    req.on("error", () => {
      reject(originalError instanceof Error ? originalError : new Error("fetch failed"));
    });
    req.end();
  });
}

function normalizeHeaders(headers: RequestInit["headers"]): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return headers as Record<string, string>;
}

async function readJsonSafe(response: HealthHttpResponse): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { non_json: true };
  }
}

interface ResolvedToken {
  value: string | null;
  envName: string | null;
}

function resolveToken(secretRef: string | null, fallbackEnvNames: string[]): ResolvedToken {
  const explicitEnvName = vaultEnvName(secretRef);
  if (explicitEnvName) return { value: clean(process.env[explicitEnvName]), envName: explicitEnvName };

  const candidates = resolveTokenCandidates(secretRef, fallbackEnvNames);
  return candidates.find((candidate) => candidate.value) ?? candidates[0] ?? { value: null, envName: null };
}

function resolveTokenCandidates(secretRef: string | null, fallbackEnvNames: string[]): ResolvedToken[] {
  const ref = clean(secretRef);
  const envNames = [...new Set([vaultEnvName(ref), ...fallbackEnvNames].filter(Boolean) as string[])];
  if (envNames.length === 0) return [{ value: null, envName: null }];
  return envNames.map((envName) => ({ value: clean(process.env[envName]), envName }));
}

function vaultEnvName(secretRef: string | null): string | null {
  const value = clean(secretRef);
  if (!value?.startsWith("vault:")) return null;
  const envName = value.slice("vault:".length).trim();
  return /^[A-Z0-9_]+$/.test(envName) ? envName : null;
}

function cloudflareVerifyUrl(accountId: string | null): string {
  const base = "https://api.cloudflare.com/client/v4";
  return accountId ? `${base}/accounts/${encodeURIComponent(accountId)}/tokens/verify` : `${base}/user/tokens/verify`;
}

function bearerHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function baseUrl(value: string | null, fallback: string): string {
  const raw = clean(value) ?? clean(fallback) ?? "";
  return raw.replace(/\/$/, "");
}

function posthogBaseUrl(value: string | null, fallback: string): string {
  return baseUrl(value, fallback).replace(/\/api$/, "");
}

function containerReachableBaseUrl(value: string | null, fallback: string): string {
  return baseUrl(value, fallback)
    .replace("://127.0.0.1:", "://host.docker.internal:")
    .replace("://localhost:", "://host.docker.internal:");
}

function normalizeProvider(provider: string): string {
  return provider.trim().toLowerCase().replace(/[-\s]+/g, "_");
}

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readBoolean(json: unknown, key: string): boolean | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const value = (json as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : null;
}

function missingToken(checkedAt: string, provider: string, token: ResolvedToken): IntegrationHealthResult {
  return {
    ok: false,
    status: "failed",
    scope: "deep_provider_api",
    summary: token.envName ? `Missing credential environment variable ${token.envName}.` : "Missing credential environment variable.",
    checkedAt,
    details: { provider, credential_env: token.envName },
  };
}

function missingUrl(checkedAt: string, provider: string): IntegrationHealthResult {
  return {
    ok: false,
    status: "failed",
    scope: "deep_provider_api",
    summary: "Missing provider base URL.",
    checkedAt,
    details: { provider },
  };
}
