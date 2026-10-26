import { task, logger } from "@trigger.dev/sdk";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { newUuid } from "../utils/uid";
import { buildWorkflowRunInsertSql } from "../db/sql/workflowRunsSql";
import { buildPackageInstallRunInsertSql } from "../db/sql/packageInstallRunsSql";
import { buildWorkflowRunRow } from "../db/sql/workflowRunsSql";
import { buildPackageInstallRunRow } from "../db/sql/packageInstallRunsSql";
import { LobsterCatalogIds, catalogIdsForManifest } from "../db/catalogIds";
import { supabaseRestInsert, supabaseRestPatch } from "../db/supabase/supabaseRestInsert";
import {
  getManifestExecutionMode,
  runInstallFromManifestStaging,
} from "../executor/installManifestStaging";
import { getArtifactsMode } from "../artifacts/artifactMode";
import {
  writeApplyManifestLocalArtifacts,
  writeApplyManifestLocalArtifactsFailure,
} from "../artifacts/localArtifactSink";
import {
  writeApplyManifestRemotePutArtifacts,
  writeApplyManifestRemotePutArtifactsFailure,
} from "../artifacts/remotePutArtifactSink";
import { captureWorkflowException } from "../observability/sentry";
import { captureWorkflowEvent } from "../observability/posthog";

const SUPPORTED_MANIFESTS = ["wp-basic", "wp-business", "wp-tourism", "wc-core", "wc-custom"] as const;
type ManifestSlug = (typeof SUPPORTED_MANIFESTS)[number];

const InputSchema = z.object({
  // Used for multi-tenant FK fields when we later enable DB writes.
  organizationId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
  siteId: z.string().uuid(),
  environmentId: z.string().uuid(),
  wpRootPath: z.string().min(1),
  manifestPath: z
    .string()
    .regex(
      /^[a-zA-Z0-9][a-zA-Z0-9_\-./]*\.(json|yaml|yml)$/,
      "manifestPath must be a relative .json/.yaml/.yml filename"
    )
    .refine((p) => !p.includes(".."), "path traversal not allowed in manifestPath"),
  manifestSlug: z.enum(SUPPORTED_MANIFESTS).optional(),
  environmentType: z.enum(["staging", "production"]),
});

const ManifestStepSchema = z.object({
  id: z.string(),
  type: z.enum(["install_theme", "install_plugin", "conditional_plugin"]),
  slug: z.string().optional(),
  condition: z.string().optional(),
});

const ManifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  schemaVersion: z.string(),
  target: z.literal("staging-only"),
  description: z.string().optional(),
  guardrails: z.object({
    allowEnvironments: z.array(z.string()),
    requireBackup: z.boolean(),
    blockIfProduction: z.boolean(),
  }),
  dependencies: z.array(z.unknown()),
  conflicts: z.array(z.unknown()),
  steps: z.array(ManifestStepSchema).min(1),
  postInstall: z.array(z.record(z.string(), z.unknown())).optional(),
  verification: z.array(z.record(z.string(), z.unknown())).optional(),
  rollback: z
    .object({
      strategy: z.string(),
    })
    .optional(),
});

function buildInstallPlan(manifest: z.infer<typeof ManifestSchema>) {
  return {
    name: manifest.name,
    version: manifest.version,
    steps: manifest.steps,
    postInstall: manifest.postInstall ?? [],
    verification: manifest.verification ?? [],
    rollback: manifest.rollback ?? { strategy: "restore_backup_snapshot" },
    // Keep guardrails in the plan so the shell adapter can enforce them too.
    guardrails: manifest.guardrails,
  };
}

/**
 * Durable workflow: validate manifest + stage the shell execution step.
 *
 * Guardrail: block installs outside staging.
 */
export const applyManifest = task({
  id: "apply-manifest",
  run: async (payload: unknown) => {
    try {
      const input = InputSchema.parse(payload);

      captureWorkflowEvent("workflow started", {
        workflowId: "apply-manifest",
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        siteId: input.siteId,
        environmentId: input.environmentId,
        environmentType: input.environmentType,
      });

    if (input.environmentType !== "staging") {
      throw new Error("Manifest install is blocked outside staging");
    }

    const MANIFESTS_BASE = path.resolve(
      process.env.LOBSTER_MANIFESTS_DIR ?? path.join(process.cwd(), "manifests")
    );
    const resolvedManifestPath = path.resolve(MANIFESTS_BASE, input.manifestPath);
    if (!resolvedManifestPath.startsWith(MANIFESTS_BASE + path.sep) &&
        resolvedManifestPath !== MANIFESTS_BASE) {
      throw new Error(`manifestPath escapes allowed directory: ${input.manifestPath}`);
    }
    const raw = await fs.readFile(resolvedManifestPath, "utf8");
    const parsedRaw = JSON.parse(raw) as unknown;
    const manifest = ManifestSchema.parse(parsedRaw);

    // Validate manifest name is a supported slug.
    if (!(SUPPORTED_MANIFESTS as readonly string[]).includes(manifest.name)) {
      throw new Error(
        `apply-manifest: unsupported manifest name "${manifest.name}". Supported: ${SUPPORTED_MANIFESTS.join(", ")}`
      );
    }
    const manifestSlug = manifest.name as ManifestSlug;

    // Extra guardrails beyond environmentType, so even a caller bug can't slip through.
    if (!manifest.guardrails.blockIfProduction) {
      throw new Error("Manifest guardrails: blockIfProduction must be true");
    }
    if (!manifest.guardrails.allowEnvironments.includes("staging")) {
      throw new Error("Manifest guardrails: allowEnvironments must include staging");
    }

    logger.info("Loaded manifest", {
      // schema-level validation happens later in the API layer
      manifest: {
        name: (manifest as any)?.name,
        version: (manifest as any)?.version,
      },
    });

    const installPlan = buildInstallPlan(manifest);

    const enableWrites =
      (process.env.LOBSTER_ENABLE_DB_WRITES || "").toLowerCase() === "true" ||
      (process.env.LOBSTER_ENABLE_DB_WRITES || "") === "1";

    type DbWriteExecution = {
      enabled: true;
      supabaseUrl: string;
      serviceRoleKey: string;
    };

    const dbWriteExecution: DbWriteExecution | null =
      enableWrites
        ? (() => {
            const supabaseUrl = process.env.LOBSTER_SUPABASE_URL || "";
            const serviceRoleKey = process.env.LOBSTER_SUPABASE_SERVICE_ROLE_KEY || "";
            if (!supabaseUrl || !serviceRoleKey) {
              throw new Error(
                "LOBSTER_ENABLE_DB_WRITES=true but missing LOBSTER_SUPABASE_URL or LOBSTER_SUPABASE_SERVICE_ROLE_KEY"
              );
            }
            return {
              supabaseUrl,
              serviceRoleKey,
              enabled: true as const,
            };
          })()
        : null;

    const manifestCatalog = catalogIdsForManifest(manifestSlug);
    if (dbWriteExecution && !manifestCatalog) {
      throw new Error(
        `Manifest "${manifestSlug}" is supported for staging execution but has no seeded DB catalog IDs; DB writes are blocked until its catalog migration exists.`
      );
    }

    const execMode = getManifestExecutionMode();
    const willRunShell = execMode !== "off";
    const initialWorkflowStatus =
      dbWriteExecution && willRunShell ? ("running" as const) : ("pending" as const);
    const initialPackageStatus =
      dbWriteExecution && willRunShell ? ("running" as const) : ("pending" as const);

    const workflowRunId = newUuid();
    const packageInstallRunId = newUuid();

    const dbWorkflowRunInsert = buildWorkflowRunInsertSql({
      id: workflowRunId,
      workflowVersionId: LobsterCatalogIds.workflows.applyManifestWorkflowVersionId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      siteId: input.siteId,
      environmentId: input.environmentId,
      parentRunId: null,
      triggerType: "apply-manifest",
      triggerRef: input.manifestPath,
      actorType: "system",
      actorRef: null,
      status: initialWorkflowStatus,
      riskLevel: "medium",
      inputSnapshot: {
        environmentId: input.environmentId,
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        siteId: input.siteId,
        wpRootPath: input.wpRootPath,
        manifestPath: input.manifestPath,
        environmentType: input.environmentType,
      },
      outputSnapshot: {},
      artifacts: [],
    });

    const dbPackageInstallRunInsert = manifestCatalog
      ? buildPackageInstallRunInsertSql({
          id: packageInstallRunId,
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          siteId: input.siteId,
          environmentId: input.environmentId,
          packageVersionId: manifestCatalog.packageVersionId,
          manifestId: manifestCatalog.manifestId,
          workflowRunId,
          triggeredByUserId: null,
          triggeredByAgentId: null,
          status: initialPackageStatus,
          resultSummary: {},
          logsRef: null,
          rollbackRunId: null,
          metadata: {
            manifestPath: input.manifestPath,
            wpRootPath: input.wpRootPath,
            environmentType: input.environmentType,
          },
        })
      : null;

    // Use the already-validated, contained path from the MANIFESTS_BASE check above.
    const manifestAbsolutePath = resolvedManifestPath;
    const wpRootAbsolute = path.resolve(input.wpRootPath);

    let shellExecution:
      | { mode: "off" }
      | {
          mode: "dry_run" | "apply";
          dryRun: boolean;
          exitCode: number;
          attempts: number;
          timedOut: boolean;
          stdoutTail: string;
          stderrTail: string;
          scriptPath: string;
        } = { mode: "off" };

    let executed = false;
    let patchedFinalStatus: "none" | "completed" | "failed" = "none";

    if (dbWriteExecution) {
      if (!dbPackageInstallRunInsert) {
        throw new Error(`Manifest "${manifestSlug}" has no DB package catalog row`);
      }
      const workflowRunRow = buildWorkflowRunRow(dbWorkflowRunInsert.spec);
      const packageInstallRunRow = buildPackageInstallRunRow(
        dbPackageInstallRunInsert.spec
      );

      const resWorkflow = await supabaseRestInsert(
        { supabaseUrl: dbWriteExecution.supabaseUrl, serviceRoleKey: dbWriteExecution.serviceRoleKey },
        "workflow_runs",
        workflowRunRow
      );
      const resPackage = await supabaseRestInsert(
        { supabaseUrl: dbWriteExecution.supabaseUrl, serviceRoleKey: dbWriteExecution.serviceRoleKey },
        "package_install_runs",
        packageInstallRunRow
      );

      executed = true;
      logger.info("DB inserts executed (optional)", {
        workflowRunId,
        packageInstallRunId,
        workflowInsertResponseType: typeof resWorkflow,
        packageInsertResponseType: typeof resPackage,
      });
    }

    const tracePatch = `apply-manifest-${workflowRunId}`;
    const endedAt = () => new Date().toISOString();

    if (willRunShell) {
      const dryRun = execMode === "dry_run";
      try {
        const shellResult = await runInstallFromManifestStaging({
          manifestAbsolutePath,
          wpRootPath: wpRootAbsolute,
          dryRun,
          timeoutMs: Number(process.env.LOBSTER_MANIFEST_SHELL_TIMEOUT_MS || 120_000),
          maxAttempts: Number(process.env.LOBSTER_MANIFEST_SHELL_MAX_ATTEMPTS || 2),
        });
        shellExecution = {
          mode: execMode,
          dryRun: shellResult.dryRun,
          exitCode: shellResult.exitCode,
          attempts: shellResult.attempts,
          timedOut: shellResult.timedOut,
          stdoutTail: shellResult.stdout.slice(-8000),
          stderrTail: shellResult.stderr.slice(-8000),
          scriptPath: shellResult.scriptPath,
        };

        let logsRefLocal: string | undefined;
        const artMode = getArtifactsMode();
        if (artMode === "local") {
          try {
            const art = await writeApplyManifestLocalArtifacts({
              workflowRunId,
              packageInstallRunId,
              stdout: shellResult.stdout,
              stderr: shellResult.stderr,
            });
            logsRefLocal = art.logsRef;
          } catch (e) {
            logger.warn("Local artifact write failed (success path)", { error: String(e) });
          }
        } else if (artMode === "remote_put") {
          try {
            const art = await writeApplyManifestRemotePutArtifacts({
              workflowRunId,
              packageInstallRunId,
              stdout: shellResult.stdout,
              stderr: shellResult.stderr,
            });
            logsRefLocal = art.logsRef;
          } catch (e) {
            logger.warn("Remote PUT artifact upload failed (success path)", { error: String(e) });
          }
        }

        if (dbWriteExecution) {
          await supabaseRestPatch(
            { supabaseUrl: dbWriteExecution.supabaseUrl, serviceRoleKey: dbWriteExecution.serviceRoleKey },
            "workflow_runs",
            workflowRunId,
            {
              status: "completed",
              output_snapshot: {
                manifest: { name: manifest.name, version: manifest.version },
                shellExecution,
                ...(logsRefLocal ? { logsRef: logsRefLocal } : {}),
              },
              ended_at: endedAt(),
            },
            { traceId: tracePatch }
          );
          await supabaseRestPatch(
            { supabaseUrl: dbWriteExecution.supabaseUrl, serviceRoleKey: dbWriteExecution.serviceRoleKey },
            "package_install_runs",
            packageInstallRunId,
            {
              status: "completed",
              result_summary: { ok: true, shellExecution },
              ended_at: endedAt(),
              ...(logsRefLocal ? { logs_ref: logsRefLocal } : {}),
            },
            { traceId: tracePatch }
          );
          patchedFinalStatus = "completed";
          logger.info("DB rows patched after successful shell", { workflowRunId, packageInstallRunId });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        let logsRefFail: string | undefined;
        const failArtMode = getArtifactsMode();
        if (failArtMode === "local") {
          try {
            const stderrHint =
              shellExecution.mode !== "off" ? shellExecution.stderrTail : undefined;
            const art = await writeApplyManifestLocalArtifactsFailure({
              workflowRunId,
              packageInstallRunId,
              message,
              stderrExcerpt: stderrHint,
            });
            logsRefFail = art.logsRef;
          } catch (e) {
            logger.warn("Local artifact write failed (failure path)", { error: String(e) });
          }
        } else if (failArtMode === "remote_put") {
          try {
            const stderrHint =
              shellExecution.mode !== "off" ? shellExecution.stderrTail : undefined;
            const art = await writeApplyManifestRemotePutArtifactsFailure({
              workflowRunId,
              packageInstallRunId,
              message,
              stderrExcerpt: stderrHint,
            });
            logsRefFail = art.logsRef;
          } catch (e) {
            logger.warn("Remote PUT artifact upload failed (failure path)", { error: String(e) });
          }
        }

        if (dbWriteExecution) {
          await supabaseRestPatch(
            { supabaseUrl: dbWriteExecution.supabaseUrl, serviceRoleKey: dbWriteExecution.serviceRoleKey },
            "workflow_runs",
            workflowRunId,
            {
              status: "failed",
              output_snapshot: {
                error: message,
                manifest: { name: manifest.name, version: manifest.version },
                ...(logsRefFail ? { logsRef: logsRefFail } : {}),
              },
              ended_at: endedAt(),
            },
            { traceId: tracePatch }
          );
          await supabaseRestPatch(
            { supabaseUrl: dbWriteExecution.supabaseUrl, serviceRoleKey: dbWriteExecution.serviceRoleKey },
            "package_install_runs",
            packageInstallRunId,
            {
              status: "failed",
              result_summary: { ok: false, error: message },
              ended_at: endedAt(),
              ...(logsRefFail ? { logs_ref: logsRefFail } : {}),
            },
            { traceId: tracePatch }
          );
          patchedFinalStatus = "failed";
          logger.error("DB rows patched after shell failure", { workflowRunId, packageInstallRunId, message });
        }
        throw err;
      }
    }

    const status =
      execMode === "off"
        ? ("pending_shell_execution" as const)
        : execMode === "dry_run"
          ? ("staging_shell_dry_run_complete" as const)
          : ("staging_shell_apply_complete" as const);

      captureWorkflowEvent("workflow completed", {
        workflowId: "apply-manifest",
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        siteId: input.siteId,
        environmentId: input.environmentId,
        status,
        execMode,
        manifestName: manifest.name,
        manifestVersion: manifest.version,
      });

      return {
      status,
      manifest: {
        name: manifest.name,
        version: manifest.version,
        target: manifest.target,
      },
      installPlan,
      input,
      shellExecution,
      // Phase 1: write points (templates only).
      db: {
        workflowRunInsert: dbWorkflowRunInsert,
        packageInstallRunInsert: dbPackageInstallRunInsert,
        workflowRunRow: buildWorkflowRunRow(dbWorkflowRunInsert.spec),
        packageInstallRunRow: dbPackageInstallRunInsert
          ? buildPackageInstallRunRow(dbPackageInstallRunInsert.spec)
          : null,
        packageInstallRunWritePoint: "adapter optional (PostgREST insert) + status updates",
        writeExecution: {
          enabled: dbWriteExecution !== null,
          executed,
          insertedWorkflowRunId: workflowRunId,
          insertedPackageInstallRunId: packageInstallRunId,
          patchedFinalStatus,
        },
      },
      };
    } catch (error) {
      captureWorkflowEvent("workflow errored", {
        workflowId: "apply-manifest",
        error: error instanceof Error ? error.message : String(error),
      });
      captureWorkflowException(error, {
        workflowId: "apply-manifest",
        route: "task.run",
        payload,
      });
      throw error;
    }
  },
});

