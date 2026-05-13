import { task, logger } from "@trigger.dev/sdk";
import { z } from "zod";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { newUuid } from "../utils/uid";
import { buildPackageInstallRunInsertSql } from "../db/sql/packageInstallRunsSql";
import { buildPackageInstallRunRow } from "../db/sql/packageInstallRunsSql";
import { LobsterCatalogIds } from "../db/catalogIds";
import { supabaseRestInsert, supabaseRestPatch } from "../db/supabase/supabaseRestInsert";
import { captureWorkflowEvent } from "../observability/posthog";
import { captureWorkflowException } from "../observability/sentry";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WpInstallPluginsResult {
  installed: Array<{ slug: string; version: string }>;
  skipped_license: Array<{ slug: string; reason: string }>;
  failed: Array<{ slug: string; error: string }>;
}

// ── Schema ────────────────────────────────────────────────────────────────────

const InputSchema = z.object({
  sshHost: z.string().min(1),
  /** vault:// reference path — actual key resolved from env LOBSTER_WP_SSH_PRIVATE_KEY */
  sshCredentialsRef: z.string().min(1),
  /** SSH username, defaults to root */
  sshUser: z.string().default("root"),
  /** Absolute path to WordPress root on the remote host */
  wpPath: z.string().default("/var/www/html"),
  pluginSlugs: z.array(z.string().min(1)).min(1),
  organizationId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  siteId: z.string().uuid(),
  buildRunId: z.string().uuid(),
});

// ── SSH exec helper ───────────────────────────────────────────────────────────

async function sshExec(
  host: string,
  user: string,
  keyPath: string,
  command: string,
  timeoutMs = 60_000
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const args = [
      "-i", keyPath,
      "-o", "StrictHostKeyChecking=no",
      "-o", "BatchMode=yes",
      "-o", "ConnectTimeout=15",
      `${user}@${host}`,
      command,
    ];
    let stdout = "";
    let stderr = "";
    const proc = spawn("ssh", args, { timeout: timeoutMs });
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => resolve({ exitCode: code ?? 1, stdout, stderr }));
    proc.on("error", (err) => resolve({ exitCode: 1, stdout, stderr: err.message }));
  });
}

function parseInstallVersion(stdout: string): string {
  // WP-CLI outputs: "Plugin activated." or "Installing Plugin Name (x.y.z)"
  const m = stdout.match(/\((\d[\d.]*)\)/);
  return m ? m[1] : "unknown";
}

function isLicenseError(stderr: string): boolean {
  return (
    /download failed/i.test(stderr) ||
    /plugin not found/i.test(stderr) ||
    /no results/i.test(stderr) ||
    /not in the plugin directory/i.test(stderr)
  );
}

// ── Task ──────────────────────────────────────────────────────────────────────

export const wpInstallPlugins = task({
  id: "wp-install-plugins",
  run: async (payload: unknown) => {
    try {
      const input = InputSchema.parse(payload);

      captureWorkflowEvent("workflow started", {
        workflowId: "wp-install-plugins",
        organizationId: input.organizationId,
        siteId: input.siteId,
        buildRunId: input.buildRunId,
        pluginCount: input.pluginSlugs.length,
      });

      const enableWrites =
        (process.env.LOBSTER_ENABLE_DB_WRITES || "").toLowerCase() === "true" ||
        (process.env.LOBSTER_ENABLE_DB_WRITES || "") === "1";

      const execMode = (process.env.LOBSTER_EXECUTE_MANIFEST_STEPS || "").toLowerCase();
      const willRunSsh = execMode === "true" || execMode === "1";

      // SSH private key — never log, never store in DB
      const sshPrivateKey = process.env.LOBSTER_WP_SSH_PRIVATE_KEY || "";
      if (willRunSsh && !sshPrivateKey) {
        throw new Error(
          "LOBSTER_EXECUTE_MANIFEST_STEPS=true but LOBSTER_WP_SSH_PRIVATE_KEY is not set"
        );
      }

      // Write key to temp file (never log the path with key content)
      let keyPath = "";
      if (willRunSsh) {
        const tmpDir = await mkdtemp(join(tmpdir(), "lobster-wp-"));
        keyPath = join(tmpDir, "id");
        await writeFile(keyPath, sshPrivateKey, { mode: 0o600 });
      }

      const result: WpInstallPluginsResult = {
        installed: [],
        skipped_license: [],
        failed: [],
      };

      // ── Per-plugin install loop ──────────────────────────────────────────────
      for (const slug of input.pluginSlugs) {
        logger.info("wp-install-plugins: processing", { slug, sshHost: input.sshHost });

        let pluginStatus: "installed" | "skipped_license" | "failed" = "failed";
        let version = "";
        let errorMsg = "";

        if (willRunSsh) {
          const cmd = `wp plugin install ${slug} --activate --path=${input.wpPath} --allow-root`;
          const { exitCode, stdout, stderr } = await sshExec(
            input.sshHost,
            input.sshUser,
            keyPath,
            cmd
          );

          if (exitCode === 0) {
            pluginStatus = "installed";
            version = parseInstallVersion(stdout);
          } else if (isLicenseError(stderr + stdout)) {
            pluginStatus = "skipped_license";
            errorMsg = "plugin not available on WP.org (paid or DIRECT install required)";
          } else {
            pluginStatus = "failed";
            // Truncate stderr to avoid flooding logs; never include key material
            errorMsg = (stderr + stdout).slice(-500).replace(sshPrivateKey, "[REDACTED]");
          }
        } else {
          // Dry-run mode: simulate success for free plugins
          pluginStatus = "installed";
          version = "dry_run";
        }

        // Accumulate result
        if (pluginStatus === "installed") {
          result.installed.push({ slug, version });
        } else if (pluginStatus === "skipped_license") {
          result.skipped_license.push({ slug, reason: errorMsg || "paid plugin" });
        } else {
          result.failed.push({ slug, error: errorMsg || "unknown error" });
        }

        // Write per-plugin row to package_install_runs
        if (enableWrites) {
          const supabaseUrl = process.env.LOBSTER_SUPABASE_URL || "";
          const serviceRoleKey = process.env.LOBSTER_SUPABASE_SERVICE_ROLE_KEY || "";
          if (!supabaseUrl || !serviceRoleKey) {
            throw new Error(
              "LOBSTER_ENABLE_DB_WRITES=true but missing LOBSTER_SUPABASE_URL or LOBSTER_SUPABASE_SERVICE_ROLE_KEY"
            );
          }
          const runId = newUuid();
          const insertSpec = buildPackageInstallRunInsertSql({
            id: runId,
            organizationId: input.organizationId,
            workspaceId: input.workspaceId,
            siteId: input.siteId,
            environmentId: newUuid(), // staging environment — resolved at workflow level
            packageVersionId: LobsterCatalogIds.wpBasic.packageVersionId,
            manifestId: LobsterCatalogIds.wpBasic.manifestId,
            workflowRunId: input.buildRunId,
            triggeredByUserId: null,
            triggeredByAgentId: null,
            status: pluginStatus === "installed" ? "completed" : pluginStatus === "skipped_license" ? "completed" : "failed",
            resultSummary: {
              plugin_slug: slug,
              status: pluginStatus,
              version: version || null,
              error_message: errorMsg || null,
            },
            logsRef: null,
            rollbackRunId: null,
            metadata: {
              plugin_slug: slug,
              sshHost: input.sshHost,
              sshCredentialsRef: input.sshCredentialsRef,
              wpPath: input.wpPath,
              buildRunId: input.buildRunId,
            },
          });
          const row = buildPackageInstallRunRow(insertSpec.spec);
          await supabaseRestInsert({ supabaseUrl, serviceRoleKey }, "package_install_runs", row);
        }

        // Create operator_task for failures (non-license errors require human review)
        if (pluginStatus === "failed") {
          logger.warn("wp-install-plugins: plugin failed — operator task required", {
            slug,
            sshHost: input.sshHost,
            sshCredentialsRef: input.sshCredentialsRef,
          });
          if (enableWrites) {
            const supabaseUrl = process.env.LOBSTER_SUPABASE_URL || "";
            const serviceRoleKey = process.env.LOBSTER_SUPABASE_SERVICE_ROLE_KEY || "";
            if (supabaseUrl && serviceRoleKey) {
              await supabaseRestInsert(
                { supabaseUrl, serviceRoleKey },
                "operator_tasks",
                {
                  id: newUuid(),
                  organization_id: input.organizationId,
                  site_id: input.siteId,
                  task_type: "plugin_install_failure",
                  status: "pending",
                  metadata: {
                    plugin_slug: slug,
                    sshCredentialsRef: input.sshCredentialsRef,
                    buildRunId: input.buildRunId,
                  },
                  created_at: new Date().toISOString(),
                }
              ).catch((err: unknown) => {
                logger.warn("wp-install-plugins: operator_tasks insert failed (non-fatal)", {
                  error: String(err),
                });
              });
            }
          }
        }
      }

      // Clean up temp key file
      if (keyPath) {
        await rm(dirname(keyPath), { recursive: true, force: true }).catch(() => {});
      }

      const summary = {
        total: input.pluginSlugs.length,
        installed: result.installed.length,
        skipped_license: result.skipped_license.length,
        failed: result.failed.length,
      };

      captureWorkflowEvent("workflow completed", {
        workflowId: "wp-install-plugins",
        organizationId: input.organizationId,
        siteId: input.siteId,
        ...summary,
      });

      logger.info("wp-install-plugins: complete", summary);

      return {
        status: result.failed.length === 0 ? ("completed" as const) : ("completed_with_failures" as const),
        summary,
        result,
        willRunSsh,
        sshCredentialsRef: input.sshCredentialsRef,
        db: { writeEnabled: enableWrites },
      };
    } catch (error) {
      captureWorkflowEvent("workflow errored", {
        workflowId: "wp-install-plugins",
        error: error instanceof Error ? error.message : String(error),
      });
      captureWorkflowException(error, {
        workflowId: "wp-install-plugins",
        route: "task.run",
        payload,
      });
      throw error;
    }
  },
});
