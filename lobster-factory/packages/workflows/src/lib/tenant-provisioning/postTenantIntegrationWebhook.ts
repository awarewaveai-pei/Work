export const TENANT_INTEGRATION_PROVISIONING_SOURCES = [
  "manual",
  "n8n",
  "trigger",
  "build_console",
  "cli",
] as const;

export type TenantIntegrationProvisioningSource =
  (typeof TENANT_INTEGRATION_PROVISIONING_SOURCES)[number];

export type BindingPayload = {
  organizationId: string;
  workspaceId?: string;
  /** lowercase_snake — must match next-admin webhook validation */
  provider: string;
  secretRef?: string;
  externalHint?: string;
  apiMetadata: Record<string, unknown>;
  provisioningSource: TenantIntegrationProvisioningSource;
  status: "pending" | "active" | "failed" | "revoked";
  lastError?: string;
};

export async function postTenantIntegrationWebhook(row: BindingPayload): Promise<{ ok?: boolean; id?: string }> {
  const token = process.env.OPS_INBOX_INGEST_TOKEN?.trim();
  const base = (process.env.AWAREWAVE_WEBHOOK_BASE_URL ?? "https://app.aware-wave.com").replace(/\/$/, "");
  if (!token) {
    throw new Error("OPS_INBOX_INGEST_TOKEN is required on Trigger worker");
  }

  const url = `${base}/api/webhooks/tenant-integration`;
  const body = {
    organization_id: row.organizationId,
    workspace_id: row.workspaceId ?? null,
    provider: row.provider,
    secret_ref: row.secretRef ?? null,
    external_hint: row.externalHint ?? null,
    api_metadata: row.apiMetadata,
    provisioning_source: row.provisioningSource,
    status: row.status,
    last_error: row.lastError ?? null,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`webhook ${res.status}: ${text.slice(0, 400)}`);
  }
  try {
    return JSON.parse(text) as { ok?: boolean; id?: string };
  } catch {
    return { raw: text } as { ok?: boolean; id?: string };
  }
}
