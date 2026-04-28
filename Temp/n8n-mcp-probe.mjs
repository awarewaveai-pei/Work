const token = process.env.N8N_AUTH_BEARER_TOKEN;
if (!token) {
  console.error("ERR=missing N8N_AUTH_BEARER_TOKEN");
  process.exit(1);
}

const url = process.env.N8N_MCP_URL || "https://n8n.aware-wave.com/mcp-server/http";
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
  "MCP-Protocol-Version": "2025-06-18",
};

async function post(body) {
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
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
      } catch {}
    }
  }
  return { status: res.status, text, json };
}

const init = await post({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "cursor-local-probe", version: "1.0.0" },
  },
});

const tools = await post({
  jsonrpc: "2.0",
  id: 2,
  method: "tools/list",
  params: {},
});

const count = Array.isArray(tools.json?.result?.tools) ? tools.json.result.tools.length : 0;
console.log(`URL=${url}`);
console.log(`INIT_STATUS=${init.status}`);
console.log(`INIT_HAS_RESULT=${Boolean(init.json?.result)}`);
console.log(`TOOLS_STATUS=${tools.status}`);
console.log(`TOOLS_COUNT=${count}`);
if (count > 0) {
  console.log(`TOOLS_SAMPLE=${tools.json.result.tools.slice(0, 8).map((t) => t.name).join(", ")}`);
}
if (init.status >= 400) console.log(`INIT_BODY=${init.text.slice(0, 300)}`);
if (tools.status >= 400) console.log(`TOOLS_BODY=${tools.text.slice(0, 300)}`);
