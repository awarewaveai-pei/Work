import type { ProvisioningContext, ProvisioningHints, ProviderStepResult } from "../types";
import { normalizeServiceRoot, requiredEnv } from "../env";
import { readJsonSafe, summarizeApiError } from "../http";

/**
 * Duplicates an existing workflow by id (template) via n8n Public API.
 * Env: N8N_API_BASE_URL (may include /api/v1 — normalized), N8N_API_KEY (or bearer — API key preferred),
 * TENANT_PROVISION_N8N_TEMPLATE_WORKFLOW_ID.
 */
export async function provisionN8n(ctx: ProvisioningContext, hints?: ProvisioningHints): Promise<ProviderStepResult> {
  const base = normalizeServiceRoot("N8N_API_BASE_URL", "https://n8n.aware-wave.com");
  const apiKey =
    requiredEnv(["TENANT_PROVISION_N8N_API_KEY", "N8N_API_KEY"]) ?? requiredEnv(["N8N_AUTH_BEARER_TOKEN"]);
  const templateId =
    process.env.TENANT_PROVISION_N8N_TEMPLATE_WORKFLOW_ID?.trim() ||
    process.env.N8N_TEMPLATE_WORKFLOW_ID?.trim();

  if (!apiKey || !templateId) {
    return {
      ok: false,
      error:
        "n8n: set N8N_API_KEY (or TENANT_PROVISION_N8N_API_KEY) and TENANT_PROVISION_N8N_TEMPLATE_WORKFLOW_ID (source workflow to duplicate).",
    };
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (apiKey.startsWith("eyJ")) {
    headers.Authorization = `Bearer ${apiKey}`;
  } else {
    headers["X-N8N-API-KEY"] = apiKey;
  }

  const get = await fetch(`${base}/api/v1/workflows/${encodeURIComponent(templateId)}`, { headers });
  const tplRaw = await readJsonSafe(get);
  if (!get.ok) {
    return { ok: false, error: `n8n load template workflow: ${summarizeApiError(get.status, tplRaw)}` };
  }

  const tpl =
    tplRaw && typeof tplRaw === "object" && tplRaw !== null && "data" in tplRaw
      ? (tplRaw as { data: Record<string, unknown> }).data
      : (tplRaw as Record<string, unknown>);

  const wf = { ...tpl } as Record<string, unknown>;
  delete wf.id;
  delete wf.createdAt;
  delete wf.updatedAt;
  delete wf.versionId;
  if (wf.meta && typeof wf.meta === "object") {
    const m = wf.meta as Record<string, unknown>;
    delete m.instanceId;
  }
  const suffix = hints?.n8nWorkflowSuffix ?? ctx.organizationId.slice(0, 8);
  wf.name = `Tenant ${suffix} — integration`;

  const post = await fetch(`${base}/api/v1/workflows`, {
    method: "POST",
    headers,
    body: JSON.stringify(wf),
  });
  const createdRaw = await readJsonSafe(post);
  if (!post.ok) {
    return { ok: false, error: `n8n create workflow: ${summarizeApiError(post.status, createdRaw)}` };
  }

  const created =
    createdRaw && typeof createdRaw === "object" && createdRaw !== null && "data" in createdRaw
      ? (createdRaw as { data: { id?: string; name?: string } }).data
      : (createdRaw as { id?: string; name?: string });

  const row = created;

  return {
    ok: true,
    status: "active",
    secretRef: `vault://tenant/${ctx.organizationId}/n8n_credentials`,
    externalHint: `${base}/workflow/${row.id ?? ""}`,
    apiMetadata: {
      customer_email: ctx.customerEmail,
      ...(ctx.googleSubject ? { google_sub: ctx.googleSubject } : {}),
      n8n_workflow_id: row.id ?? null,
      n8n_workflow_name: row.name ?? null,
      n8n_template_workflow_id: templateId,
      editor_base_url: base,
      provisioned_at: new Date().toISOString(),
      note: "Edit duplicated workflow for customer-specific HTTP headers / credentials references.",
    },
  };
}
