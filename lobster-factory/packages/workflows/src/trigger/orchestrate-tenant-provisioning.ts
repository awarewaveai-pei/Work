/**
 * Single entry: fan-out per provider, land everything in tenant_integration_bindings via next-admin webhook.
 * Google in the payload is identity/audit only — each vendor still needs its own OAuth/API trust model.
 *
 * Worker env (non-exhaustive; see `src/lib/tenant-provisioning/providers/*`):
 * Sentry: SENTRY_AUTH_TOKEN, SENTRY_ORG_SLUG, optional SENTRY_TEAM_SLUG, SENTRY_API_BASE_URL
 * GitHub: TENANT_PROVISION_GITHUB_TOKEN (or GITHUB_TOKEN), optional TENANT_PROVISION_GITHUB_ORG
 * PostHog: POSTHOG_HOST, POSTHOG_PERSONAL_API_KEY
 * n8n: N8N_API_BASE_URL, N8N_API_KEY, TENANT_PROVISION_N8N_TEMPLATE_WORKFLOW_ID
 * Supabase Cloud: TENANT_PROVISION_SUPABASE_ACCESS_TOKEN, hints.supabaseBillingOrgId (or pin hints.supabaseProjectRef)
 * Trigger: optional TENANT_PROVISION_TRIGGER_PROJECT_REF
 * Uptime: UPTIME_KUMA_BASE_URL, UPTIME_KUMA_API_KEY
 */

import { task, logger } from "@trigger.dev/sdk";
import { z } from "zod";
import { postTenantIntegrationWebhook } from "../lib/tenant-provisioning/postTenantIntegrationWebhook";
import { runProviderStep } from "../lib/tenant-provisioning/providers/registry";
import type { ProvisioningProvider } from "../lib/tenant-provisioning/types";
import { captureWorkflowEvent } from "../observability/posthog";
import { captureWorkflowException } from "../observability/sentry";

const ProviderEnum = z.enum([
  "github",
  "n8n",
  "trigger",
  "supabase",
  "sentry",
  "uptime_kuma",
  "posthog",
]);

const HintsSchema = z
  .object({
    sentryProjectSlug: z.string().min(1).max(64).optional(),
    sentryProjectName: z.string().max(128).optional(),
    sentryPlatform: z.string().max(64).optional(),
    githubRepoName: z.string().min(1).max(90).optional(),
    githubRepoDescription: z.string().max(512).optional(),
    posthogProjectName: z.string().max(128).optional(),
    posthogProjectSlug: z.string().max(128).optional(),
    n8nWorkflowSuffix: z.string().max(64).optional(),
    supabaseBillingOrgId: z.string().uuid().optional(),
    supabaseRegion: z.string().max(32).optional(),
    supabaseProjectRef: z.string().max(64).optional(),
    uptimeMonitorUrl: z.string().url().optional(),
    uptimeMonitorName: z.string().max(128).optional(),
  })
  .strict()
  .optional();

const InputSchema = z.object({
  organizationId: z.string().uuid(),
  workspaceId: z.string().uuid().optional(),
  customerEmail: z.string().email(),
  googleSubject: z.string().min(1).optional(),
  providers: z.array(ProviderEnum).min(1),
  hints: HintsSchema,
});

export const orchestrateTenantProvisioning = task({
  id: "orchestrate-tenant-provisioning",
  run: async (payload: unknown) => {
    try {
      const input = InputSchema.parse(payload);
      const ctx = {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        customerEmail: input.customerEmail,
        googleSubject: input.googleSubject,
        hints: input.hints ?? undefined,
      };

      captureWorkflowEvent("workflow started", {
        workflowId: "orchestrate-tenant-provisioning",
        organizationId: input.organizationId,
        providers: input.providers,
      });

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

      const allOk = results.every((r) => r.ok);
      captureWorkflowEvent("workflow completed", {
        workflowId: "orchestrate-tenant-provisioning",
        organizationId: input.organizationId,
        total: results.length,
        succeeded: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        allOk,
      });

      return { organizationId: input.organizationId, results };
    } catch (error) {
      captureWorkflowException(error, {
        workflowId: "orchestrate-tenant-provisioning",
        route: "task.run",
        payload,
      });
      throw error;
    }
  },
});
