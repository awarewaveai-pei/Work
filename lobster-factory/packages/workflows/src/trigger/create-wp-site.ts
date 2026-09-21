import { task, logger, tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import { newUuid } from "../utils/uid";
import { buildWorkflowRunInsertSql } from "../db/sql/workflowRunsSql";
import { buildWorkflowRunRow } from "../db/sql/workflowRunsSql";
import { LobsterCatalogIds } from "../db/catalogIds";
import { supabaseRestInsert, supabaseRestPatch } from "../db/supabase/supabaseRestInsert";
import { resolveStagingProvisioning } from "../hosting/resolveStagingProvisioning";
import { captureWorkflowException } from "../observability/sentry";
import { captureWorkflowEvent } from "../observability/posthog";
import { runAllIntegrations, type BuildIntegrations } from "../integrations/integration-steps";

const SUPPORTED_MANIFEST_SLUGS = ["wp-basic", "wp-business", "wp-tourism", "wc-core", "wc-custom"] as const;

/**
 * Stage 0 (B): write the terminal status back to the originating `ops_action_runs` row so it
 * no longer sticks at "dispatched". The dispatcher passes the run id as
 * `_dispatchedFromActionRunId`. Gated on the same LOBSTER_ENABLE_DB_WRITES flag as the other
 * persistence here; a no-op when the flag is off, the run id is absent, or creds are missing.
 * Best-effort: never throws (status writeback must not mask the real workflow result).
 */
async function markActionRunTerminal(
  runId: string | undefined,
  status: "completed" | "failed" | "blocked",
  extra: Record<string, unknown>,
): Promise<void> {
  if (!runId) return;
  const enableDbWrites =
    (process.env.LOBSTER_ENABLE_DB_WRITES || "").toLowerCase() === "true" ||
    (process.env.LOBSTER_ENABLE_DB_WRITES || "") === "1";
  if (!enableDbWrites) return;
  const supabaseUrl = process.env.LOBSTER_SUPABASE_URL || "";
  const serviceRoleKey = process.env.LOBSTER_SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) return;
  try {
    await supabaseRestPatch(
      { supabaseUrl, serviceRoleKey },
      "ops_action_runs",
      runId,
      { status, ...extra },
      { traceId: `create-wp-site-${status}-${runId}` },
    );
  } catch (e) {
    logger.warn("create-wp-site: ops_action_runs status writeback failed (non-fatal)", {
      runId,
      status,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/** Build Console (`/build`) sends `clientName` / `packageSlug`; workflows use `siteName` / `manifestSlug`. */
function normalizeBuildConsolePayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const o = { ...(raw as Record<string, unknown>) };
  if (typeof o.siteName !== "string" || !String(o.siteName).trim()) {
    if (typeof o.clientName === "string" && o.clientName.trim()) {
      o.siteName = o.clientName.trim();
    }
  }
  if (typeof o.manifestSlug !== "string") {
    const pkg = o.packageSlug;
    if (pkg === "wp-basic" || pkg === "wp-business" || pkg === "wp-tourism" || pkg === "wc-core" || pkg === "wc-custom") {
      o.manifestSlug = pkg;
    }
  }
  return o;
}

// SSRF guard: only allow https URLs that don't resolve to private/internal networks.
// Applied to all integration URL fields at parse time so the Trigger.dev worker never
// fetches an attacker-controlled internal endpoint.
//
// Defence layers:
//  1. protocol must be https
//  2. hostname matched against RFC-1918 + loopback + link-local ranges (IPv4 + IPv6)
//  3. IPv6 bracket stripping (WHATWG URL keeps brackets: [::1] → strip → ::1)
//  4. Numeric/hex/octal IPv4 forms rejected (e.g. 2130706433, 0x7f000001, 0177.1)
//  5. DNS rebinding not prevented at parse time — mitigated by operator-only input path
const PRIVATE_IP_RE = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^::ffff:/i,
  /^fc00:/i,
  /^fd/i,
  /^fe80:/i,
];
function noSsrfUrl(raw: string): boolean {
  try {
    const { protocol, hostname } = new URL(raw);
    if (protocol !== "https:") return false;
    // Strip IPv6 brackets that WHATWG URL preserves: "[::1]" → "::1"
    const h = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
    if (PRIVATE_IP_RE.some((re) => re.test(h))) return false;
    // Reject localhost aliases
    if (
      h === "localhost" ||
      h.endsWith(".localhost") ||
      h.endsWith(".local") ||
      h.endsWith(".internal") ||
      h.endsWith(".lan") ||
      h.endsWith(".home.arpa")
    ) return false;
    // Reject numeric/hex/octal IPv4 forms that bypass regex (e.g. 2130706433, 0x7f000001)
    if (/^(0x[0-9a-f]+|\d+(\.\d+)*|0[0-7]+(\.[0-9]+)*)$/i.test(h)) return false;
    return true;
  } catch {
    return false;
  }
}
const ssrfSafeUrl = z.string().url().refine(noSsrfUrl, "URL must use https and must not target a private/internal address");

// Integration sub-schema (all optional — skipped if not provided)
const IntegrationsSchema = z.object({
  uptimeKuma: z.object({ url: ssrfSafeUrl, apiKey: z.string(), groupName: z.string().optional() }).optional(),
  sentry:     z.object({ org: z.string(), authToken: z.string(), team: z.string().optional() }).optional(),
  postHog:    z.object({ projectApiKey: z.string(), host: ssrfSafeUrl.optional() }).optional(),
  n8n:        z.object({ onboardingWebhookUrl: ssrfSafeUrl, bearerToken: z.string().optional() }).optional(),
  mainWp:     z.object({ dashboardUrl: ssrfSafeUrl, consumerKey: z.string(), consumerSecret: z.string(), adminUsername: z.string().optional() }).optional(),
}).optional();

const InputSchema = z.preprocess(
  normalizeBuildConsolePayload,
  z.object({
    organizationId: z.string().uuid(),
    clientSlug: z.string().regex(/^[a-z0-9-]+$/).max(64).optional(),
    workspaceId: z.string().uuid(),
    projectId: z.string().uuid(),
    siteId: z.string().uuid(),
    siteName: z.string().min(1),
    manifestSlug: z.enum(SUPPORTED_MANIFEST_SLUGS).default("wp-basic"),
    domain: z.string().optional(),
    provider: z.string().optional(),
    locale: z.string().optional(),
    integrations: IntegrationsSchema,
    // WP Plugin Stack — from OnboardWizard Step 2 (Phase 1)
    pluginSlugs: z.array(z.string()).optional(),
    // AI website spec id — forwarded to the hosting bridge so it can seed real page content.
    // .catch(undefined): a malformed value from any future caller degrades to "skip seeding"
    // rather than failing the entire provisioning workflow.
    websiteSpecId: z.string().uuid().optional().catch(undefined),
    sshHost: z.string().optional(),
    sshCredentialsRef: z.string().optional(),
    wpPath: z.string().optional(),
    // dispatcher passthrough fields (ignored by this workflow but safe to accept)
    _dispatchedFromActionRunId: z.string().optional(),
    _traceId: z.string().optional(),
    _actionKey: z.string().optional(),
  })
);

/**
 * Durable workflow: create staging environment record + provision WP + apply manifest.
 *
 * Phase 1 intentionally keeps DB persistence + hosting adapter as placeholders.
 * Guardrails: all steps must be staging-only.
 */
// Stage C: seed AI content via a SECOND short call to the hosting bridge, AFTER provision returns.
// Seeding inline in the provision call blew past the CF/adapter ~95-100s ceiling (run wrongly
// "blocked"), and next-admin can't run post-response background work (WORKLOG 2026-06-17). This
// task (Trigger.dev) is the persistent orchestrator: it makes provision + seed as two separate
// short calls, each under the ceiling. Best-effort — a seed failure does not fail the build.
async function seedContentViaBridge(payload: {
  websiteSpecId: string;
  wpPath: string;
  siteId: string;
}): Promise<string> {
  const baseUrl = process.env.LOBSTER_HOSTING_PROVIDER_BASE_URL?.trim();
  const path = process.env.LOBSTER_HOSTING_PROVISION_PATH?.trim() || "/v1/lobster/staging-provision";
  const token = process.env.LOBSTER_HOSTING_API_TOKEN?.trim();
  if (!baseUrl || !token) throw new Error("hosting bridge not configured (base URL or token missing)");
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000); // under the CF ~100s ceiling
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mode: "seed", ...payload }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`seed bridge HTTP ${res.status}: ${text.slice(0, 200)}`);
    return text.slice(0, 300);
  } finally {
    clearTimeout(timer);
  }
}

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
        // Thread the selected stack + spec so the bridge installs the right plugins and seeds
        // real content (previously these never reached the bridge — sites came out as bare shells).
        manifestSlug: input.manifestSlug,
        pluginSlugs: input.pluginSlugs,
        websiteSpecId: input.websiteSpecId,
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
      // Defensive: a genuine block (adapter unconfigured, provider 5xx, or build exceeding the
      // Cloudflare ~100s ceiling) must still release the originating ops_action_runs from
      // "dispatched" — otherwise it hangs forever. Best-effort, gated on LOBSTER_ENABLE_DB_WRITES.
      await markActionRunTerminal(input._dispatchedFromActionRunId, "blocked", {
        error_summary: (hosting.message ?? "hosting provisioning blocked").slice(0, 500),
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
          wpInstallPlugins: input.pluginSlugs?.length
            ? {
                workflowId: "wp-install-plugins" as const,
                pluginSlugs: input.pluginSlugs,
                sshHost: input.sshHost ?? (stagingRef as { sshHost?: string }).sshHost ?? "TODO_from_staging_ref",
                sshCredentialsRef: input.sshCredentialsRef ?? `vault://ssh/${input.siteName}`,
                wpPath: input.wpPath ?? stagingRef.wpRootPath,
                organizationId: input.organizationId,
                workspaceId: input.workspaceId,
                siteId: input.siteId,
                note: "Trigger.dev tasks.trigger() fires this task at Stage 3.5 (see create-wp-site.ts integrations section)",
              }
            : { note: "no pluginSlugs provided — skip wp-install-plugins" },
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
          wpInstallPlugins: input.pluginSlugs?.length
            ? {
                workflowId: "wp-install-plugins" as const,
                pluginSlugs: input.pluginSlugs,
                sshHost: input.sshHost ?? "TODO_from_staging_ref",
                sshCredentialsRef: input.sshCredentialsRef ?? `vault://ssh/${input.siteName}`,
                wpPath: input.wpPath ?? "TODO",
                organizationId: input.organizationId,
                workspaceId: input.workspaceId,
                siteId: input.siteId,
                note: "Trigger wp-install-plugins task after apply-manifest Stage 3 completes",
              }
            : { note: "no pluginSlugs provided — skip wp-install-plugins" },
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
          wpAdminUser: stagingRef?.wpAdminUser,
          clientSlug: input.clientSlug,
        }
      );
      const integrationErrors = integrationResults.filter((r) => r.status === "error");
      if (integrationErrors.length > 0) {
        logger.warn("create-wp-site: some integrations failed", { errors: integrationErrors });
      }

      // ── Stage C: seed AI content (second short bridge call; see seedContentViaBridge) ──
      let seedResult: string | null = null;
      if (input.websiteSpecId && stagingRef?.wpRootPath) {
        try {
          seedResult = await seedContentViaBridge({
            websiteSpecId: input.websiteSpecId,
            wpPath: stagingRef.wpRootPath,
            siteId: input.siteId,
          });
          logger.info("create-wp-site: content seeded", { seedResult });
        } catch (err) {
          logger.warn("create-wp-site: content seed failed (non-fatal)", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // ── Stage 3.5: Trigger wp-install-plugins for user-facing plugin stack ──
      // SSOT: agency-os/docs/operations/WP_CLIENT_PLUGIN_STACK.md §八
      // Gated by LOBSTER_EXECUTE_MANIFEST_STEPS env var (default OFF for safety).
      // The wp-install-plugins task itself also respects the env var and will
      // do dry-run if SSH execution is disabled. Fire-and-forget pattern —
      // results are written to package_install_runs and surfaced in
      // /ops/clients/[slug] page.
      let pluginInstallRunHandle: { id: string } | null = null;
      const willExecuteSteps =
        (process.env.LOBSTER_EXECUTE_MANIFEST_STEPS || "").toLowerCase() === "true" ||
        process.env.LOBSTER_EXECUTE_MANIFEST_STEPS === "1";
      const sshHost = input.sshHost ?? (stagingRef as { sshHost?: string } | null)?.sshHost ?? null;

      if (input.pluginSlugs?.length && sshHost && willExecuteSteps) {
        try {
          const handle = await tasks.trigger("wp-install-plugins", {
            sshHost,
            sshUser: "root",
            sshCredentialsRef: input.sshCredentialsRef ?? `vault://ssh/${input.siteName}`,
            wpPath: input.wpPath ?? stagingRef?.wpRootPath ?? "/var/www/html",
            pluginSlugs: input.pluginSlugs,
            organizationId: input.organizationId,
            workspaceId: input.workspaceId,
            siteId: input.siteId,
            buildRunId: workflowRunId,
          });
          pluginInstallRunHandle = { id: handle.id };
          logger.info("create-wp-site: wp-install-plugins triggered", {
            runId: handle.id, pluginCount: input.pluginSlugs.length,
          });
        } catch (err) {
          logger.warn("create-wp-site: wp-install-plugins trigger failed (non-fatal)", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } else if (input.pluginSlugs?.length) {
        logger.info("create-wp-site: wp-install-plugins skipped", {
          hasSshHost: !!sshHost,
          willExecuteSteps,
          pluginCount: input.pluginSlugs.length,
          reason: !sshHost
            ? "no ssh host (operator must supply input.sshHost or hosting adapter must populate stagingRef.sshHost)"
            : "LOBSTER_EXECUTE_MANIFEST_STEPS is not true (dry-run mode)",
        });
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
        pluginInstallTriggered: !!pluginInstallRunHandle,
      });

      // Stage 0 (B): mark the originating ops_action_runs row terminal so it no longer
      // sticks at "dispatched". Best-effort, gated on LOBSTER_ENABLE_DB_WRITES.
      await markActionRunTerminal(input._dispatchedFromActionRunId, "completed", {
        ended_at: new Date().toISOString(),
      });

      return {
        status: finalStatus,
        input,
        mockHosting: hosting.outcome === "mock" ? hosting.ref : null,
        vendorStaging: hosting.outcome === "provisioned" ? hosting.ref : null,
        next,
        integrations: integrationResults,
        pluginInstall: {
          triggered: !!pluginInstallRunHandle,
          runHandle: pluginInstallRunHandle,
          pluginCount: input.pluginSlugs?.length ?? 0,
        },
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
      // Stage 0 (B): mark the run failed so it doesn't stick at "dispatched". Read the run id
      // from the raw payload (input may be undefined if schema parse threw). Best-effort.
      await markActionRunTerminal(
        (payload as { _dispatchedFromActionRunId?: string } | null)?._dispatchedFromActionRunId,
        "failed",
        {
          ended_at: new Date().toISOString(),
          error_summary: (error instanceof Error ? error.message : String(error)).slice(0, 500),
        },
      );
      throw error;
    }
  },
});

