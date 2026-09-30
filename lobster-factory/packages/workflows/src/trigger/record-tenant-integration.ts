/**
 * Posts one integration binding to next-admin webhook (same Bearer as Ops Inbox ingest).
 * Set on Trigger worker: OPS_INBOX_INGEST_TOKEN, AWAREWAVE_WEBHOOK_BASE_URL (e.g. https://app.aware-wave.com).
 */

import { task, logger } from "@trigger.dev/sdk";
import { z } from "zod";
import {
  postTenantIntegrationWebhook,
  TENANT_INTEGRATION_PROVISIONING_SOURCES,
  type TenantIntegrationProvisioningSource,
} from "../lib/tenant-provisioning/postTenantIntegrationWebhook";
import { captureWorkflowException } from "../observability/sentry";

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
  provisioningSource: z.enum(TENANT_INTEGRATION_PROVISIONING_SOURCES).optional().default("trigger"),
  status: z.enum(["pending", "active", "failed", "revoked"]).optional().default("active"),
  lastError: z.string().optional(),
});

export const recordTenantIntegration = task({
  id: "record-tenant-integration",
  run: async (payload: unknown) => {
    try {
      const input = PayloadSchema.parse(payload);
      const provisioningSource: TenantIntegrationProvisioningSource = input.provisioningSource;
      const out = await postTenantIntegrationWebhook({
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        provider: input.provider,
        secretRef: input.secretRef,
        externalHint: input.externalHint,
        apiMetadata: input.apiMetadata ?? {},
        provisioningSource,
        status: input.status,
        lastError: input.lastError,
      });

      logger.info("record-tenant-integration ok", { provider: input.provider, organizationId: input.organizationId });
      return out;
    } catch (error) {
      captureWorkflowException(error, {
        workflowId: "record-tenant-integration",
        route: "task.run",
        payload,
      });
      throw error;
    }
  },
});
