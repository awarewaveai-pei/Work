/**
 * Posts one integration binding to next-admin webhook (same Bearer as Ops Inbox ingest).
 * Set on Trigger worker: OPS_INBOX_INGEST_TOKEN, AWAREWAVE_WEBHOOK_BASE_URL (e.g. https://app.aware-wave.com).
 */

import { task, logger } from "@trigger.dev/sdk";
import { z } from "zod";

const PROVIDER_RE = /^[a-z][a-z0-9_]{0,63}$/;

const PayloadSchema = z.object({
  organizationId: z.string().uuid(),
  workspaceId: z.string().uuid().optional(),
  provider: z
    .string()
    .min(1)
    .max(64)
    .transform((s) => s.trim().toLowerCase())
    .refine((s) => PROVIDER_RE.test(s), "provider must be lowercase_snake (e.g. sentry, github)"),
  secretRef: z.string().max(2048).optional(),
  externalHint: z.string().max(1024).optional(),
  apiMetadata: z.record(z.string(), z.unknown()).optional(),
  provisioningSource: z.enum(["manual", "n8n", "trigger", "build_console", "cli"]).optional().default("trigger"),
  status: z.enum(["pending", "active", "failed", "revoked"]).optional().default("active"),
  lastError: z.string().optional(),
});

export const recordTenantIntegration = task({
  id: "record-tenant-integration",
  run: async (payload: unknown) => {
    const input = PayloadSchema.parse(payload);
    const token = process.env.OPS_INBOX_INGEST_TOKEN?.trim();
    const base = (process.env.AWAREWAVE_WEBHOOK_BASE_URL ?? "https://app.aware-wave.com").replace(/\/$/, "");
    if (!token) {
      throw new Error("OPS_INBOX_INGEST_TOKEN is required on Trigger worker");
    }

    const url = `${base}/api/webhooks/tenant-integration`;
    const body = {
      organization_id: input.organizationId,
      workspace_id: input.workspaceId ?? null,
      provider: input.provider,
      secret_ref: input.secretRef ?? null,
      external_hint: input.externalHint ?? null,
      api_metadata: input.apiMetadata ?? {},
      provisioning_source: input.provisioningSource,
      status: input.status,
      last_error: input.lastError ?? null,
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
      logger.error("record-tenant-integration failed", { status: res.status, text: text.slice(0, 500) });
      throw new Error(`webhook ${res.status}: ${text.slice(0, 300)}`);
    }

    logger.info("record-tenant-integration ok", { provider: input.provider, organizationId: input.organizationId });
    try {
      return JSON.parse(text) as { ok?: boolean; id?: string };
    } catch {
      return { raw: text };
    }
  },
});
