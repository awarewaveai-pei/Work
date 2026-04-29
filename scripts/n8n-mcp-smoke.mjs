#!/usr/bin/env node
/**
 * Smoke-test self-hosted n8n MCP HTTP transport (JSON-RPC initialize + tools/list).
 *
 * Requires:
 *   N8N_MCP_URL            — full MCP endpoint (e.g. https://n8n.example.com/mcp-server/http)
 *   N8N_AUTH_BEARER_TOKEN  — MCP access token from n8n (Connection details)
 *
 * Exit codes:
 *   0 — initialize returned a result (healthy MCP handshake)
 *   1 — missing env, fetch error, or unexpected failure
 *   3 — HTTP 404 (usually instance MCP off, proxy path, or unsupported n8n version)
 *
 * Does not print secret values.
 *
 * N8N_PATH / TRY_ALT hint rules (apex vs n8n.* subdomain):
 *   agency-os/docs/operations/n8n-self-hosted-mcp-troubleshooting.md
 */
const token = process.env.N8N_AUTH_BEARER_TOKEN;
const url = process.env.N8N_MCP_URL;

if (!url || typeof url !== "string" || !url.trim()) {
  console.error("ERR=missing N8N_MCP_URL");
  process.exit(1);
}
if (!token || typeof token !== "string" || !token.trim()) {
  console.error("ERR=missing N8N_AUTH_BEARER_TOKEN");
  process.exit(1);
}

/**
 * Suggest TRY_ALT `…/n8n/mcp-server/http` only for apex-style hosts where n8n may be
 * mounted under `/n8n/` (Pattern A). Pattern B uses a dedicated host (e.g. `n8n.example.com`)
 * with `N8N_PATH=/` — MCP stays at `/mcp-server/http`; prepending `/n8n/` is wrong.
 * Loopback is typically direct-to-n8n at root; do not suggest path prefix there.
 */
function shouldSuggestApexN8nPathPrefix(hostname) {
  const h = String(hostname).toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "::1") {
    return false;
  }
  const first = h.split(".")[0] || "";
  if (first === "n8n") {
    return false;
  }
  return true;
}

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
  "MCP-Protocol-Version": "2025-06-18",
};

async function post(body) {
  const res = await fetch(url.trim(), { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    const dataLine = text
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith("data: "));
    if (dataLine) {
      try {
        json = JSON.parse(dataLine.slice(6));
      } catch {
        /* ignore */
      }
    }
  }
  return { status: res.status, text, json };
}

try {
  const init = await post({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "n8n-mcp-smoke", version: "1.0.0" },
    },
  });

  const tools = await post({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  });

  const count = Array.isArray(tools.json?.result?.tools) ? tools.json.result.tools.length : 0;

  console.log(`URL=${url.trim()}`);
  console.log(`INIT_STATUS=${init.status}`);
  console.log(`INIT_HAS_RESULT=${Boolean(init.json?.result)}`);
  console.log(`TOOLS_STATUS=${tools.status}`);
  console.log(`TOOLS_COUNT=${count}`);
  if (count > 0 && tools.json?.result?.tools) {
    console.log(
      `TOOLS_SAMPLE=${tools.json.result.tools.slice(0, 8).map((t) => t.name).join(", ")}`
    );
  }
  if (init.status === 404 || tools.status === 404) {
    console.error(
      "HINT=404 on MCP endpoint — enable Instance-level MCP in n8n, expose workflows, check reverse proxy /mcp-server/ — see agency-os/docs/operations/n8n-self-hosted-mcp-troubleshooting.md"
    );
    try {
      const u = new URL(url.trim());
      const p = u.pathname.replace(/\/+$/, "") || "/";
      if (p === "/mcp-server/http" || p.endsWith("/mcp-server/http")) {
        if (!p.includes("/n8n/") && shouldSuggestApexN8nPathPrefix(u.hostname)) {
          const alt = new URL(u.origin + "/n8n/mcp-server/http");
          console.error(
            `TRY_ALT_MCP_URL=${alt.href} (apex / main-site URL missing /n8n/ prefix while server uses N8N_PATH=/n8n/ — on n8n.* subdomain use root /mcp-server/http with N8N_PATH=/)`
          );
        }
      }
    } catch {
      /* ignore URL parse */
    }
    if (init.text) console.error(`INIT_BODY_SNIPPET=${init.text.slice(0, 240)}`);
    process.exit(3);
  }

  if (init.status >= 400) {
    if (init.text) console.error(`INIT_BODY_SNIPPET=${init.text.slice(0, 400)}`);
    process.exit(1);
  }

  if (!init.json?.result) {
    console.error("ERR=initialize did not return result");
    if (init.text) console.error(`INIT_BODY_SNIPPET=${init.text.slice(0, 400)}`);
    process.exit(1);
  }

  process.exit(0);
} catch (e) {
  console.error(`ERR=${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
