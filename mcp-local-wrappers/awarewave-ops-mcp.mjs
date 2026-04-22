#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

function readEnv(name, fallback = "") {
  const value = process.env[name];
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (/^<PASTE_[A-Z0-9_]+>$/.test(trimmed)) return fallback;
  return trimmed;
}

const services = {
  api_awarewave: {
    label: "api.aware-wave.com",
    baseUrlEnv: "API_AWAREWAVE_BASE_URL",
    defaultBaseUrl: "https://api.aware-wave.com",
    auth: { type: "bearer", tokenEnv: "API_AWAREWAVE_BEARER_TOKEN" }
  },
  app_awarewave: {
    label: "app.aware-wave.com",
    baseUrlEnv: "APP_AWAREWAVE_BASE_URL",
    defaultBaseUrl: "https://app.aware-wave.com",
    auth: { type: "bearer", tokenEnv: "APP_AWAREWAVE_BEARER_TOKEN" }
  },
  hetzner: {
    label: "Hetzner Cloud API",
    baseUrlEnv: "HETZNER_API_BASE_URL",
    defaultBaseUrl: "https://api.hetzner.cloud/v1",
    auth: { type: "bearer", tokenEnv: "HETZNER_API_TOKEN" }
  },
  uptime_kuma: {
    label: "Uptime Kuma API",
    baseUrlEnv: "UPTIME_KUMA_BASE_URL",
    auth: { type: "bearer", tokenEnv: "UPTIME_KUMA_API_KEY" }
  },
  grafana: {
    label: "Grafana API",
    baseUrlEnv: "GRAFANA_BASE_URL",
    auth: {
      type: "basic_or_bearer",
      tokenEnv: "GRAFANA_SERVICE_ACCOUNT_TOKEN",
      userEnv: "GRAFANA_BASIC_USER",
      passwordEnv: "GRAFANA_BASIC_PASSWORD"
    }
  },
  netdata: {
    label: "Netdata API",
    baseUrlEnv: "NETDATA_BASE_URL",
    auth: { type: "optional_bearer", tokenEnv: "NETDATA_API_TOKEN" }
  },
  slack: {
    label: "Slack Web API",
    baseUrlEnv: "SLACK_API_BASE_URL",
    defaultBaseUrl: "https://slack.com/api",
    auth: { type: "bearer", tokenEnv: "SLACK_BOT_TOKEN" }
  },
  slack_webhook: {
    label: "Slack Incoming Webhook",
    baseUrlEnv: "SLACK_WEBHOOK_URL",
    auth: { type: "none" }
  },
  sentry: {
    label: "Sentry API",
    baseUrlEnv: "SENTRY_API_BASE_URL",
    defaultBaseUrl: "https://sentry.io/api/0",
    auth: { type: "bearer", tokenEnv: "SENTRY_AUTH_TOKEN" }
  },
  resend_api: {
    label: "Resend API",
    baseUrlEnv: "RESEND_API_BASE_URL",
    defaultBaseUrl: "https://api.resend.com",
    auth: { type: "bearer", tokenEnv: "RESEND_API_KEY" }
  },
  cloudflare_api: {
    label: "Cloudflare API",
    baseUrlEnv: "CLOUDFLARE_API_BASE_URL",
    defaultBaseUrl: "https://api.cloudflare.com/client/v4",
    auth: { type: "bearer", tokenEnv: "CLOUDFLARE_API_TOKEN" }
  },
  posthog_api: {
    label: "PostHog API",
    baseUrlEnv: "POSTHOG_API_BASE_URL",
    defaultBaseUrl: "https://app.posthog.com/api",
    auth: { type: "bearer", tokenEnv: "POSTHOG_PERSONAL_API_KEY" }
  },
  n8n_api: {
    label: "n8n REST API",
    baseUrlEnv: "N8N_API_BASE_URL",
    auth: { type: "bearer", tokenEnv: "N8N_AUTH_BEARER_TOKEN" }
  },
  trigger_api: {
    label: "Trigger.dev API",
    baseUrlEnv: "TRIGGER_API_URL",
    auth: { type: "bearer", tokenEnv: "TRIGGER_ACCESS_TOKEN" }
  },
  supabase_a: {
    label: "Supabase A company REST API",
    baseUrlEnv: "SUPABASE_A_URL",
    auth: {
      type: "supabase",
      apiKeyEnv: "SUPABASE_A_SERVICE_ROLE_KEY",
      bearerEnv: "SUPABASE_A_SERVICE_ROLE_KEY"
    }
  },
  supabase_b: {
    label: "Supabase B company REST API",
    baseUrlEnv: "SUPABASE_B_URL",
    auth: {
      type: "supabase",
      apiKeyEnv: "SUPABASE_B_SERVICE_ROLE_KEY",
      bearerEnv: "SUPABASE_B_SERVICE_ROLE_KEY"
    }
  }
};

function getServiceConfig(name) {
  const service = services[name];
  if (!service) throw new Error(`Unknown service: ${name}`);

  const baseUrl = readEnv(service.baseUrlEnv, service.defaultBaseUrl || "");
  const auth = service.auth || { type: "none" };
  let authConfigured = true;

  if (auth.type === "bearer") {
    authConfigured = !!readEnv(auth.tokenEnv);
  } else if (auth.type === "optional_bearer") {
    authConfigured = true;
  } else if (auth.type === "basic_or_bearer") {
    authConfigured = !!readEnv(auth.tokenEnv) || (!!readEnv(auth.userEnv) && !!readEnv(auth.passwordEnv));
  } else if (auth.type === "supabase") {
    authConfigured = !!readEnv(auth.apiKeyEnv) && !!readEnv(auth.bearerEnv);
  }

  return { ...service, baseUrl, authConfigured };
}

function buildHeaders(serviceConfig, extraHeaders = {}) {
  const headers = { Accept: "application/json", ...extraHeaders };
  const auth = serviceConfig.auth || { type: "none" };

  if (auth.type === "bearer") {
    const token = readEnv(auth.tokenEnv);
    if (!token) throw new Error(`Missing required env var: ${auth.tokenEnv}`);
    headers.Authorization = `Bearer ${token}`;
  } else if (auth.type === "optional_bearer") {
    const token = readEnv(auth.tokenEnv);
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } else if (auth.type === "basic_or_bearer") {
    const token = readEnv(auth.tokenEnv);
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    } else {
      const user = readEnv(auth.userEnv);
      const password = readEnv(auth.passwordEnv);
      if (!user || !password) {
        throw new Error(`Missing required env vars: ${auth.tokenEnv} or (${auth.userEnv}, ${auth.passwordEnv})`);
      }
      const basic = Buffer.from(`${user}:${password}`, "utf8").toString("base64");
      headers.Authorization = `Basic ${basic}`;
    }
  } else if (auth.type === "supabase") {
    const apiKey = readEnv(auth.apiKeyEnv);
    const bearer = readEnv(auth.bearerEnv);
    if (!apiKey || !bearer) {
      throw new Error(`Missing required env vars: ${auth.apiKeyEnv}, ${auth.bearerEnv}`);
    }
    headers.apikey = apiKey;
    headers.Authorization = `Bearer ${bearer}`;
  }

  return headers;
}

function joinUrl(baseUrl, path, query) {
  if (!baseUrl) throw new Error("Service base URL is not configured");
  const url = new URL(path || "/", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (query && typeof query === "object") {
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function pretty(value) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

const server = new Server(
  { name: "awarewave-ops-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_services",
      description: "List AwareWave service integrations and whether each one is configured on this machine.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false
      }
    },
    {
      name: "call_service_api",
      description: "Call a configured service API by service name, method, path, query, and optional JSON body. This wrapper covers api.aware-wave.com, app.aware-wave.com, Hetzner, Uptime Kuma, Grafana, Netdata, Slack Web API, Slack incoming webhooks, Sentry, Resend API, Cloudflare API, PostHog API, n8n REST API, Trigger API, Supabase A, and Supabase B.",
      inputSchema: {
        type: "object",
        properties: {
          service: {
            type: "string",
            enum: Object.keys(services)
          },
          method: { type: "string" },
          path: { type: "string" },
          query: {
            type: "object",
            additionalProperties: {
              anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }]
            }
          },
          body: {
            type: "object",
            additionalProperties: true
          },
          headers: {
            type: "object",
            additionalProperties: { type: "string" }
          }
        },
        required: ["service", "method", "path"],
        additionalProperties: false
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "list_services") {
    const lines = Object.keys(services)
      .sort()
      .map((name) => {
        const service = getServiceConfig(name);
        return [
          `service: ${name}`,
          `label: ${service.label}`,
          `base_url: ${service.baseUrl || "(missing)"}`,
          `auth_configured: ${service.authConfigured ? "yes" : "no"}`
        ].join("\n");
      });

    return { content: [{ type: "text", text: lines.join("\n\n") }] };
  }

  if (request.params.name === "call_service_api") {
    const args = request.params.arguments || {};
    const serviceName = typeof args.service === "string" ? args.service : "";
    const method = typeof args.method === "string" ? args.method.toUpperCase() : "";
    const path = typeof args.path === "string" ? args.path : "";
    const query = args.query && typeof args.query === "object" ? args.query : undefined;
    const body = args.body && typeof args.body === "object" ? args.body : undefined;
    const extraHeaders = args.headers && typeof args.headers === "object" ? args.headers : {};

    if (!serviceName || !method || !path) {
      throw new Error("'service', 'method', and 'path' are required");
    }

    const service = getServiceConfig(serviceName);
    const url = joinUrl(service.baseUrl, path, query);
    const headers = buildHeaders(service, extraHeaders);
    const init = { method, headers };

    if (body) {
      init.body = JSON.stringify(body);
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, init);
    const contentType = response.headers.get("content-type") || "";
    const raw = await response.text();
    let parsed = raw;
    if (contentType.includes("application/json")) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = raw;
      }
    }

    return {
      content: [
        {
          type: "text",
          text: [
            `service: ${serviceName}`,
            `status: ${response.status}`,
            `ok: ${response.ok}`,
            `url: ${url}`,
            "",
            pretty(parsed)
          ].join("\n")
        }
      ]
    };
  }

  throw new Error(`Unknown tool: ${request.params.name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
