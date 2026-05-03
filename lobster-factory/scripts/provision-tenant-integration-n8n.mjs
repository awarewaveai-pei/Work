#!/usr/bin/env node
/**
 * Creates or updates n8n workflow "AwareWave — tenant integration ingest" via Public API.
 * Required env: N8N_API_BASE_URL (default https://n8n.aware-wave.com), N8N_API_KEY
 */
import { randomUUID } from "node:crypto";

function n8nRoot() {
  let b = (process.env.N8N_API_BASE_URL ?? "https://n8n.aware-wave.com").replace(/\/$/, "");
  b = b.replace(/\/api\/v1\/?$/, "").replace(/\/api\/?$/, "");
  return b;
}
const base = n8nRoot();
const apiKey = process.env.N8N_API_KEY?.trim();
if (!apiKey) {
  console.error("Missing N8N_API_KEY");
  process.exit(1);
}

const workflowBody = {
  name: "AwareWave — tenant integration ingest",
  nodes: [
    {
      parameters: {},
      id: randomUUID(),
      name: "When clicking 'Execute workflow'",
      type: "n8n-nodes-base.manualTrigger",
      typeVersion: 1,
      position: [0, 0],
    },
    {
      parameters: {
        mode: "runOnceForAllItems",
        language: "javaScript",
        jsCode:
          "// Replace DEFAULT_ORG_ID with your organizations.id (e.g. slug awarewave-ops)\nreturn [{ json: {\n  organization_id: $env.AW_ORGANIZATION_ID || '00000000-0000-0000-0000-000000000001',\n  provider: 'github',\n  provisioning_source: 'n8n',\n  status: 'active',\n  secret_ref: 'vault://custom/github',\n  api_metadata: { source: 'n8n-template' }\n}}];",
      },
      id: randomUUID(),
      name: "Payload (edit org UUID)",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [220, 0],
    },
    {
      parameters: {
        method: "POST",
        url: "https://app.aware-wave.com/api/webhooks/tenant-integration",
        authentication: "genericCredentialType",
        genericAuthType: "httpHeaderAuth",
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: "Content-Type", value: "application/json" }],
        },
        sendBody: true,
        specifyBody: "json",
        jsonBody: "={{ JSON.stringify($json) }}",
        options: {},
      },
      id: randomUUID(),
      name: "POST tenant-integration",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [480, 0],
      credentials: {
        httpHeaderAuth: {
          id: "PLACEHOLDER_CRED_ID",
          name: "AwareWave OPS_INBOX (create in n8n)",
        },
      },
    },
  ],
  connections: {
    "When clicking 'Execute workflow'": {
      main: [[{ node: "Payload (edit org UUID)", type: "main", index: 0 }]],
    },
    "Payload (edit org UUID)": {
      main: [[{ node: "POST tenant-integration", type: "main", index: 0 }]],
    },
  },
  settings: { executionOrder: "v1" },
};

// Credential placeholder breaks API — use header injection instead
delete workflowBody.nodes[2].credentials;
workflowBody.nodes[2].parameters.authentication = "none";
workflowBody.nodes[2].parameters.sendHeaders = true;
workflowBody.nodes[2].parameters.headerParameters = {
  parameters: [
    { name: "Content-Type", value: "application/json" },
    {
      name: "Authorization",
      value: "=Bearer {{ $env.OPS_INBOX_INGEST_TOKEN }}",
    },
  ],
};

const headers = {
  Accept: "application/json",
  "Content-Type": "application/json",
  "X-N8N-API-KEY": apiKey,
};

const listRes = await fetch(`${base}/api/v1/workflows`, { headers });
if (!listRes.ok) {
  console.error("List workflows failed", listRes.status, await listRes.text());
  process.exit(1);
}
const list = await listRes.json();
const rows = list.data ?? list;
const arr = Array.isArray(rows) ? rows : rows?.workflows ?? [];
const existing = arr.find((w) => w.name === workflowBody.name);

if (existing?.id) {
  const put = await fetch(`${base}/api/v1/workflows/${existing.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ ...workflowBody, id: existing.id }),
  });
  const text = await put.text();
  if (!put.ok) {
    console.error("Update failed", put.status, text.slice(0, 800));
    process.exit(1);
  }
  console.log("Updated workflow", existing.id);
} else {
  const post = await fetch(`${base}/api/v1/workflows`, {
    method: "POST",
    headers,
    body: JSON.stringify(workflowBody),
  });
  const text = await post.text();
  if (!post.ok) {
    console.error("Create failed", post.status, text.slice(0, 1200));
    process.exit(1);
  }
  const created = JSON.parse(text);
  console.log("Created workflow", created.id ?? created.data?.id ?? "?");
}

console.log(
  "Add OPS_INBOX_INGEST_TOKEN to n8n env (same value as next-admin). Optional: AW_ORGANIZATION_ID for Code node."
);
