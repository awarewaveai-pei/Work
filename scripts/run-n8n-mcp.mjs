#!/usr/bin/env node
/**
 * stdio → HTTP bridge for n8n MCP endpoint.
 *
 * Cursor's built-in "type: http" MCP client issues a GET request to establish
 * an SSE listener stream after the initial POST initialize. n8n's MCP server
 * only supports POST and returns 404 for GET, causing Cursor to flap
 * (green → yellow → red, "No tools"). This bridge avoids the problem by
 * using stdio transport: it reads JSON-RPC messages from stdin, POSTs each
 * one to N8N_MCP_URL, and writes the response to stdout.
 *
 * Required env vars (set via mcp.json or user-env.ps1):
 *   N8N_MCP_URL            — full MCP endpoint URL
 *   N8N_AUTH_BEARER_TOKEN  — Bearer token for n8n MCP API
 */

const url = process.env.N8N_MCP_URL?.trim();
const token = process.env.N8N_AUTH_BEARER_TOKEN?.trim();

if (!url) {
  process.stderr.write("run-n8n-mcp: ERR N8N_MCP_URL is not set\n");
  process.exit(1);
}
if (!token) {
  process.stderr.write("run-n8n-mcp: ERR N8N_AUTH_BEARER_TOKEN is not set\n");
  process.exit(1);
}

const MCP_PROTOCOL_VERSION = "2025-11-25";

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
  "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
};

async function postToN8n(msg) {
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(msg),
  });
  const text = await res.text();

  // n8n may respond with SSE format (event: message\ndata: {...})
  // or plain JSON. Handle both.
  try {
    return JSON.parse(text);
  } catch {
    const dataLine = text
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith("data: "));
    if (dataLine) {
      try {
        return JSON.parse(dataLine.slice(6));
      } catch {
        /* fall through */
      }
    }
    // Return raw error so Cursor sees something
    return {
      jsonrpc: "2.0",
      id: msg?.id ?? null,
      error: {
        code: -32700,
        message: `n8n MCP HTTP ${res.status}: ${text.slice(0, 200)}`,
      },
    };
  }
}

let buf = "";
process.stdin.setEncoding("utf8");

process.stdin.on("data", async (chunk) => {
  buf += chunk;
  const lines = buf.split("\n");
  buf = lines.pop() ?? "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      continue;
    }

    try {
      const response = await postToN8n(msg);
      if (response !== undefined) {
        process.stdout.write(JSON.stringify(response) + "\n");
      }
    } catch (e) {
      const errResponse = {
        jsonrpc: "2.0",
        id: msg?.id ?? null,
        error: {
          code: -32000,
          message: e instanceof Error ? e.message : String(e),
        },
      };
      process.stdout.write(JSON.stringify(errResponse) + "\n");
    }
  }
});

process.stdin.on("end", () => {
  process.exit(0);
});

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
