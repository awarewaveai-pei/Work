/**
 * Single entry: fan-out per provider, land everything in tenant_integration_bindings via next-admin webhook.
 * Google in the payload is identity/audit only — each vendor still needs its own OAuth/API trust model.
 */

import { task, logger } from "@trigger.dev/sdk";
import { z } from "zod";
import { postTenantIntegrationWebhook } from "../lib/tenant-provisioning/postTenantIntegrationWebhook";
import { runProviderStep } from "../lib/tenant-provisioning/providers/registry";
import type { ProvisioningProvider } from "../lib/tenant-provisioning/types";

const ProviderEnum = z.enum([
  "github",
  "n8n",
  "trigger",
  "supabase",
  "sentry",
  "uptime_kuma",
  "posthog",
]);

const InputSchema = z.object({
  organizationId: z.string().uuid(),
  workspaceId: z.string().uuid().optional(),
  customerEmail: z.string().email(),
  googleSubject: z.string().min(1).optional(),
  providers: z.array(ProviderEnum).min(1),
});

export const orchestrateTenantProvisioning = task({
  id: "orchestrate-tenant-provisioning",
  run: async (payload: unknown) => {
    const input = InputSchema.parse(payload);
    const ctx = {
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      customerEmail: input.customerEmail,
      googleSubject: input.googleSubject,
    };

    const results: Array<{ provider: ProvisioningProvider; ok: boolean; detail?: string }> = [];

    const providers = [...new Set(input.providers)];
    for (const provider of providers) {
      const step = await runProviderStep(provider, ctx);
      if (step.ok) {
        await postTenantIntegrationWebhook({
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          provider,
          secretRef: step.secretRef,
          externalHint: step.externalHint,
          apiMetadata: step.apiMetadata,
          provisioningSource: "trigger",
          status: step.status ?? "active",
        });
        results.push({ provider, ok: true });
        logger.info("provision row written", { provider });
      } else {
        await postTenantIntegrationWebhook({
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          provider,
          apiMetadata: {
            customer_email: input.customerEmail,
            ...(input.googleSubject ? { google_sub: input.googleSubject } : {}),
            automation: "orchestrate-tenant-provisioning",
          },
          provisioningSource: "trigger",
          status: "failed",
          lastError: step.error,
        });
        results.push({ provider, ok: false, detail: step.error });
        logger.warn("provision step failed (recorded)", { provider, error: step.error });
      }
    }

    return { organizationId: input.organizationId, results };
  },
});
