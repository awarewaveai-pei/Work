import { task, logger } from "@trigger.dev/sdk";
import { z } from "zod";
import { Client, type ClientChannel } from "ssh2";
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
  wpPath: z
    .string()
    .regex(/^\/[a-zA-Z0-9_\-/.]{1,200}$/, "wpPath must be an absolute path with safe characters")
    .refine((p) => !p.includes(".."), "path traversal not allowed in wpPath")
    .default("/var/www/html"),
  pluginSlugs: z
    .array(
      z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/, "invalid plugin slug — must match WP.org slug format")
    )
    .min(1),
  organizationId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  siteId: z.string().uuid(),
  buildRunId: z.string().uuid(),
});

// ── Per-client SSH key resolution ─────────────────────────────────────────────
//
// Each client can have its own key stored as:
//   LOBSTER_SSH_KEY_<REF>   e.g. vault://ssh/mongolia-travel → LOBSTER_SSH_KEY_SSH_MONGOLIA_TRAVEL
// Falls back to the global LOBSTER_WP_SSH_PRIVATE_KEY for backward compat.
// This prevents a single key compromise from exposing all client servers.

function resolvePrivateKey(sshCredentialsRef: string): string {
  const envKey = "LOBSTER_SSH_KEY_" + sshCredentialsRef
    .replace(/^vault:\/\//, "")
    .replace(/[^a-z0-9]/gi, "_")
    .toUpperCase();
  return process.env[envKey] || process.env.LOBSTER_WP_SSH_PRIVATE_KEY || "";
}

// ── SSH exec helper ───────────────────────────────────────────────────────────
// Uses ssh2 npm (no system `ssh` binary needed — works in any Node container).
// Private key is passed as content directly; never written to disk.

async function sshExec(
  host: string,
  user: string,
  privateKey: string,
  command: string,
  timeoutMs = 60_000
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const conn = new Client();
    let stdout = "";
    let stderr = "";
    let settled = false;

    const settle = (result: { exitCode: number; stdout: string; stderr: string }) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        try { conn.end(); } catch { /* ignore close errors */ }
        resolve(result);
      }
    };

    const timer = setTimeout(
      () => settle({ exitCode: 1, stdout, stderr: "SSH connection timed out" }),
      timeoutMs
    );

    conn.on("ready", () => {
      conn.exec(command, (err: Error | undefined, stream: ClientChannel) => {
        if (err) { settle({ exitCode: 1, stdout, stderr: err.message }); return; }
        stream.on("data", (d: Buffer) => { stdout += d.toString(); });
        stream.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
        stream.on("close", (code: number) => settle({ exitCode: code ?? 1, stdout, stderr }));
      });
    });

    conn.on("error", (err: Error) => settle({ exitCode: 1, stdout, stderr: err.message }));

    conn.connect({ host, port: 22, username: user, privateKey, readyTimeout: 15_000 });
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

      // SSH private key — per-client resolution, never logged, never stored in DB
      const sshPrivateKey = resolvePrivateKey(input.sshCredentialsRef);
      if (willRunSsh && !sshPrivateKey) {
        throw new Error(
          `LOBSTER_EXECUTE_MANIFEST_STEPS=true but no SSH key found. ` +
          `Set LOBSTER_SSH_KEY_${input.sshCredentialsRef.replace(/^vault:\/\//, "").replace(/[^a-z0-9]/gi, "_").toUpperCase()} ` +
          `(per-client) or LOBSTER_WP_SSH_PRIVATE_KEY (global fallback).`
        );
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
          // --force: reinstall even if already installed (idempotent)
          // --skip-plugins: prevents broken plugins from blocking WP-CLI itself
          const cmd = `wp plugin install ${slug} --activate --force --skip-plugins --path=${input.wpPath} --allow-root`;
          const { exitCode, stdout, stderr } = await sshExec(
            input.sshHost,
            input.sshUser,
            sshPrivateKey,
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
              // M3: the `status` column tracks whether the install-RUN finished; `applied`
              // tracks whether the plugin was ACTUALLY installed. A dry-run "completes"
              // without applying anything — dashboards must read `applied`, not `status`,
              // to know if the plugin is really present. (status enum has no 'dry_run' value.)
              mode: willRunSsh ? "live" : "dry_run",
              applied: willRunSsh && pluginStatus === "installed",
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
