import { task, logger } from "@trigger.dev/sdk";
import { z } from "zod";
import { newUuid } from "../utils/uid";
import { buildWorkflowRunInsertSql } from "../db/sql/workflowRunsSql";
import { buildWorkflowRunRow } from "../db/sql/workflowRunsSql";
import { LobsterCatalogIds, catalogIdsForManifest } from "../db/catalogIds";
import { supabaseRestInsert } from "../db/supabase/supabaseRestInsert";
import { resolveStagingProvisioning } from "../hosting/resolveStagingProvisioning";
import { captureWorkflowException } from "../observability/sentry";
import { captureWorkflowEvent } from "../observability/posthog";
import { runAllIntegrations, type BuildIntegrations } from "../integrations/integration-steps";

const SUPPORTED_MANIFEST_SLUGS = ["wp-basic", "wp-business", "wc-core"] as const;
type ManifestSlug = typeof SUPPORTED_MANIFEST_SLUGS[number];

// Integration sub-schema (all optional — skipped if not provided)
const IntegrationsSchema = z.object({
  uptimeKuma: z.object({ url: z.string(), apiKey: z.string(), groupName: z.string().optional() }).optional(),
  sentry:     z.object({ org: z.string(), authToken: z.string(), team: z.string().optional() }).optional(),
  postHog:    z.object({ projectApiKey: z.string(), host: z.string().optional() }).optional(),
  n8n:        z.object({ onboardingWebhookUrl: z.string(), bearerToken: z.string().optional() }).optional(),
  mainWp:     z.object({ dashboardUrl: z.string(), consumerKey: z.string(), consumerSecret: z.string() }).optional(),
}).optional();

const InputSchema = z.object({
  organizationId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
  siteId: z.string().uuid(),
  siteName: z.string().min(1),
  manifestSlug: z.enum(SUPPORTED_MANIFEST_SLUGS).default("wp-basic"),
  domain: z.string().optional(),
  provider: z.string().optional(),
  locale: z.string().optional(),
  integrations: IntegrationsSchema,
  // dispatcher passthrough fields (ignored by this workflow but safe to accept)
  _dispatchedFromActionRunId: z.string().optional(),
  _traceId: z.string().optional(),
  _actionKey: z.string().optional(),
});

/**
 * Durable workflow: create staging environment record + provision WP + apply manifest.
 *
 * Phase 1 intentionally keeps DB persistence + hosting adapter as placeholders.
 * Guardrails: all steps must be staging-only.
 */
export const createWpSite = task({
  id: "create-wp-site",
  run: async (payload: unknown) => {
    try {
      const input = InputSchema.parse(payload);

      logger.info("Starting WP site creation", input);

      captureWorkflowEvent("workflow started", {
        workflowId: "create-wp-site",
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        siteId: input.siteId,
      });

      const hosting = await resolveStagingProvisioning({
        siteId: input.siteId,
        siteName: input.siteName,
        organizationId: input.organizationId,
      });

    if (hosting.outcome === "blocked") {
      captureWorkflowEvent("workflow blocked", {
        workflowId: "create-wp-site",
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        siteId: input.siteId,
        reason: "hosting_configuration",
      });
      const workflowRunId = newUuid();
      const dbWorkflowRunInsert = buildWorkflowRunInsertSql({
        id: workflowRunId,
        workflowVersionId: LobsterCatalogIds.workflows.createWpSiteWorkflowVersionId,
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        siteId: input.siteId,
        environmentId: null,
        parentRunId: null,
        triggerType: "create-wp-site",
        triggerRef: input.siteName,
        actorType: "system",
        actorRef: null,
        status: "blocked",
        riskLevel: "medium",
        inputSnapshot: input,
        outputSnapshot: { hosting },
        artifacts: [],
      });
      return {
        status: "blocked_hosting_configuration" as const,
        input,
        hosting,
        next: null,
        db: {
          workflowRunInsert: dbWorkflowRunInsert,
          workflowRunRow: buildWorkflowRunRow(dbWorkflowRunInsert.spec),
          writeExecution: { enabled: false, executed: false, insertedWorkflowRunId: workflowRunId },
        },
      };
    }

    const stagingRef =
      hosting.outcome === "mock" || hosting.outcome === "provisioned" ? hosting.ref : null;

    // Phase 1: emit DB insert templates (do not execute).
    const workflowRunId = newUuid();
    const dbWorkflowRunInsert = buildWorkflowRunInsertSql({
      id: workflowRunId,
      workflowVersionId: LobsterCatalogIds.workflows.createWpSiteWorkflowVersionId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      siteId: input.siteId,
      environmentId: null,
      parentRunId: null,
      triggerType: "create-wp-site",
      triggerRef: input.siteName,
      actorType: "system",
      actorRef: null,
      status: "pending",
      riskLevel: "medium",
      inputSnapshot: input,
      outputSnapshot: {},
      artifacts: [],
    });

    const enableWrites =
      (process.env.LOBSTER_ENABLE_DB_WRITES || "").toLowerCase() === "true" ||
      (process.env.LOBSTER_ENABLE_DB_WRITES || "") === "1";
    let executed = false;
    if (enableWrites) {
      const supabaseUrl = process.env.LOBSTER_SUPABASE_URL || "";
      const serviceRoleKey = process.env.LOBSTER_SUPABASE_SERVICE_ROLE_KEY || "";
      if (!supabaseUrl || !serviceRoleKey) {
        throw new Error(
          "LOBSTER_ENABLE_DB_WRITES=true but missing LOBSTER_SUPABASE_URL or LOBSTER_SUPABASE_SERVICE_ROLE_KEY"
        );
      }

      const workflowRunRow = buildWorkflowRunRow(dbWorkflowRunInsert.spec);
      await supabaseRestInsert(
        { supabaseUrl, serviceRoleKey },
        "workflow_runs",
        workflowRunRow
      );
      executed = true;
    }

    // Phase 1: http_json returns vendor fields; mock returns synthetic fields. No local WP install here.
    const next = stagingRef
      ? {
          createStagingEnvironmentRecord: {
            status:
              hosting.outcome === "mock"
                ? ("mock" as const)
                : ("vendor_http" as const),
            environmentId: stagingRef.environmentId,
            notes: stagingRef.provisioningNotes,
          },
          createWpRootOnHostingProvider: {
            status:
              hosting.outcome === "mock"
                ? ("mock" as const)
                : ("vendor_http" as const),
            wpRootPath: stagingRef.wpRootPath,
            stagingSiteUrl: stagingRef.stagingSiteUrl,
          },
          installWordPress:
            hosting.outcome === "mock"
              ? "deferred_phase1: use existing WP tree or manual install; mock adapter does not install binaries"
              : "vendor_http: confirm WordPress exists at wpRootPath on target host",
          applyManifestViaWorkflow: {
            workflowId: "apply-manifest" as const,
            manifestSlug: input.manifestSlug,
            environmentId: stagingRef.environmentId,
            organizationId: input.organizationId,
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            siteId: input.siteId,
            wpRootPath: stagingRef.wpRootPath,
            wpAdminUrl: stagingRef.wpAdminUrl,
          },
          runSmokeTests: "TODO_after_real_wp_or_smoke_test_sh",
          writeArtifactsAndLogs: "TODO",
          db: {
            workflowRunInsert: dbWorkflowRunInsert,
            workflowRunRow: buildWorkflowRunRow(dbWorkflowRunInsert.spec),
            packageInstallRunWritePoint: "TODO",
            runOutputWritePoint: "TODO",
            writeExecution: {
              enabled: enableWrites,
              executed,
              insertedWorkflowRunId: workflowRunId,
            },
          },
        }
      : {
          createStagingEnvironmentRecord: "TODO",
          createWpRootOnHostingProvider: "TODO",
          installWordPress: "TODO",
          applyManifestViaWorkflow: {
            workflowId: "apply-manifest" as const,
            manifestSlug: input.manifestSlug,
            environmentId: "createStagingEnvironmentRecord.environmentId",
            organizationId: input.organizationId,
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            siteId: input.siteId,
          },
          runSmokeTests: "TODO",
          writeArtifactsAndLogs: "TODO",
          db: {
            workflowRunInsert: dbWorkflowRunInsert,
            workflowRunRow: buildWorkflowRunRow(dbWorkflowRunInsert.spec),
            packageInstallRunWritePoint: "TODO",
            runOutputWritePoint: "TODO",
            writeExecution: {
              enabled: enableWrites,
              executed,
              insertedWorkflowRunId: workflowRunId,
            },
          },
        };

      const finalStatus = stagingRef
        ? hosting.outcome === "mock"
          ? ("mock_staging_provisioned" as const)
          : ("vendor_staging_provisioned" as const)
        : ("pending_next_step" as const);

      // ── Integrations: register with Uptime Kuma, Sentry, PostHog, n8n, MainWP ──
      const siteUrl  = stagingRef?.stagingSiteUrl ?? (input.domain ? `https://${input.domain}` : "");
      const adminUrl = stagingRef?.wpAdminUrl     ?? (siteUrl ? `${siteUrl}/wp-admin` : "");
      logger.info("create-wp-site: running integrations", {
        siteUrl, integrationsProvided: !!input.integrations,
      });
      const integrationResults = await runAllIntegrations(
        input.integrations as BuildIntegrations | undefined,
        {
          siteUrl,
          adminUrl,
          clientName: input.siteName,
          profile: "profile_b",
        }
      );
      const integrationErrors = integrationResults.filter((r) => r.status === "error");
      if (integrationErrors.length > 0) {
        logger.warn("create-wp-site: some integrations failed", { errors: integrationErrors });
      }

      captureWorkflowEvent("workflow completed", {
        workflowId: "create-wp-site",
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        siteId: input.siteId,
        status: finalStatus,
        hostingOutcome: hosting.outcome,
        integrationResults,
      });

      return {
        status: finalStatus,
        input,
        mockHosting: hosting.outcome === "mock" ? hosting.ref : null,
        vendorStaging: hosting.outcome === "provisioned" ? hosting.ref : null,
        next,
        integrations: integrationResults,
      };
    } catch (error) {
      captureWorkflowEvent("workflow errored", {
        workflowId: "create-wp-site",
        error: error instanceof Error ? error.message : String(error),
      });
      captureWorkflowException(error, {
        workflowId: "create-wp-site",
        route: "task.run",
        payload,
      });
      throw error;
    }
  },
});

