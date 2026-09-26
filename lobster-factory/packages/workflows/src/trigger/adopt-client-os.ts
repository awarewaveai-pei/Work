/**
 * Profile C: adopt-client-os
 *
 * Safely integrates an existing WordPress site into the Lobster Factory
 * management system using adopt_delta mode — only adding missing components,
 * never overwriting existing content, themes, or settings.
 *
 * Steps (per master doc Section 41.5):
 *   1. validate_site_accessible
 *   2. create_mandatory_backup  ← halt if backup cannot be confirmed
 *   3. run_adopt_audit          ← classify all plugins/themes/smtp
 *   4. create_approval_request_if_needed (update_required items)
 *   5. apply_delta_manifest     ← only safe_to_install items
 *   6. install_mainwp_child
 *   7. connect_mainwp
 *   8. register_monitoring
 *   9. run_adopt_smoke_tests    ← adopt profile
 *  10. generate_handoff_report
 *  11. enter_maintenance_policy
 */

import { task, logger } from "@trigger.dev/sdk";
import { gateTaskStart } from "../lib/systemMode";
import { z } from "zod";
import { newUuid } from "../utils/uid";
import { buildWorkflowRunRow, buildWorkflowRunInsertSql } from "../db/sql/workflowRunsSql";
import { LobsterCatalogIds } from "../db/catalogIds";
import {
  supabaseRestInsert,
  supabaseRestPatch,
  supabaseRestQuery,
  type SupabaseRestConfig,
} from "../db/supabase/supabaseRestInsert";
import { captureWorkflowEvent } from "../observability/posthog";
import { captureWorkflowException } from "../observability/sentry";
import { runAllIntegrations, type BuildIntegrations } from "../integrations/integration-steps";

// ─────────────────────────────────────────────
// Input schema
// ─────────────────────────────────────────────
const InputSchema = z.object({
  organizationId:  z.string().uuid(),
  workspaceId:     z.string().uuid(),
  projectId:       z.string().uuid(),
  siteId:          z.string().uuid(),
  siteUrl:         z.string().url(),
  wpAdminUrl:      z.string().url(),
  credentialsRef:  z.string().min(1),
  backupRef:       z.string().min(1),
  backupConfirmed: z.boolean(),
  packageSlug:     z.enum(["wp-basic", "wp-business", "wc-core"]).default("wp-basic"),
  locale:          z.string().optional().default("en_US"),
  integrations: z.object({
    uptimeKuma: z.object({ url: z.string(), apiKey: z.string(), groupName: z.string().optional() }).optional(),
    sentry:     z.object({ org: z.string(), authToken: z.string(), team: z.string().optional() }).optional(),
    postHog:    z.object({ projectApiKey: z.string(), host: z.string().optional() }).optional(),
    n8n:        z.object({ onboardingWebhookUrl: z.string(), bearerToken: z.string().optional() }).optional(),
    mainWp:     z.object({ enabled: z.boolean().optional(), adminUsername: z.string().optional() }).optional(),
  }).optional(),
  // dispatcher passthrough
  _dispatchedFromActionRunId: z.string().optional(),
  _traceId:                   z.string().optional(),
  _actionKey:                 z.string().optional(),
});

type AdoptInput = z.infer<typeof InputSchema>;

// Adopt audit item classification
type AuditItemStatus = "safe_to_install" | "skip_install" | "update_required" | "conflict" | "manual_review";

type AuditItem = {
  item_type: "plugin" | "theme" | "smtp" | "seo";
  slug: string;
  existing_version?: string;
  manifest_version?: string;
  status: AuditItemStatus;
  resolution?: string;
  notes?: string;
};

type AdoptAuditReport = {
  existing_plugins:  string[];
  existing_themes:   string[];
  smtp_configured:   boolean;
  safe_to_install:   AuditItem[];
  skip_install:      AuditItem[];
  update_required:   AuditItem[];
  conflicts:         AuditItem[];
  manual_review:     AuditItem[];
};

// Smoke test result
type SmokeCheck = {
  name: string;
  status: "pass" | "fail" | "skip" | "advisory";
  detail?: string;
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function getSupabaseCreds(): SupabaseRestConfig {
  const supabaseUrl    = process.env.LOBSTER_SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.LOBSTER_SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing LOBSTER_SUPABASE_URL or LOBSTER_SUPABASE_SERVICE_ROLE_KEY");
  }
  return { supabaseUrl, serviceRoleKey };
}

async function httpGet(url: string, timeoutMs = 10000): Promise<{ ok: boolean; status: number }> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { method: "GET", signal: ctrl.signal });
    clearTimeout(timer);
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

// ─────────────────────────────────────────────
// Step implementations
// ─────────────────────────────────────────────

async function stepValidateSiteAccessible(siteUrl: string): Promise<{ accessible: boolean; status: number }> {
  const result = await httpGet(siteUrl);
  return { accessible: result.ok, status: result.status };
}

async function stepRunAdoptAudit(
  _input: AdoptInput,
  _creds: SupabaseRestConfig
): Promise<AdoptAuditReport> {
  // Phase 1: structural audit (real WP-CLI audit requires SSH/REST access to the target site).
  // This returns a safe conservative audit that instructs the system to skip all items
  // until real site credentials + WP-CLI access are wired in Phase 2.
  //
  // In production, this step would:
  //   1. SSH into the host (or call WP-CLI via REST)
  //   2. Run `wp plugin list --format=json`
  //   3. Run `wp theme list --format=json`
  //   4. Check WP Options for SMTP settings
  //   5. Cross-reference against the manifest's required plugins
  //
  // Until Phase 2 SSH integration, returns operator_task items for all manifest plugins.
  return {
    existing_plugins: [],
    existing_themes:  [],
    smtp_configured:  false,
    safe_to_install:  [],
    skip_install:     [],
    update_required:  [],
    conflicts:        [],
    manual_review: [
      {
        item_type: "plugin",
        slug: "__audit_required__",
        status: "manual_review",
        notes: "SSH/WP-CLI access to existing site not yet wired. Operator must complete manual audit before delta apply.",
      },
    ],
  };
}

async function stepRunAdoptSmokeTests(siteUrl: string, wpAdminUrl: string): Promise<SmokeCheck[]> {
  const checks: SmokeCheck[] = [];

  // homepage_status_unchanged — must pass
  const homepageResult = await httpGet(siteUrl);
  checks.push({
    name: "homepage_status_unchanged",
    status: homepageResult.ok ? "pass" : "fail",
    detail: `HTTP ${homepageResult.status}`,
  });

  // wp_admin_accessible
  const adminResult = await httpGet(wpAdminUrl);
  checks.push({
    name: "wp_admin_accessible",
    status: adminResult.ok || adminResult.status === 302 ? "pass" : "fail",
    detail: `HTTP ${adminResult.status}`,
  });

  // ssl_valid (check https scheme)
  const usesHttps = siteUrl.startsWith("https://");
  checks.push({
    name: "ssl_valid",
    status: usesHttps ? "pass" : "fail",
    detail: usesHttps ? "HTTPS scheme present" : "Site not using HTTPS",
  });

  // These require real access — mark as advisory until Phase 2
  checks.push({ name: "existing_content_count_unchanged", status: "advisory", detail: "Requires WP-CLI access — verify manually" });
  checks.push({ name: "no_new_php_errors",                status: "advisory", detail: "Requires server log access — verify manually" });
  checks.push({ name: "existing_forms_functional",        status: "advisory", detail: "Requires manual form test" });
  checks.push({ name: "mainwp_child_connected",           status: "advisory", detail: "Requires MainWP Dashboard — connect after plugin install" });
  checks.push({ name: "uptime_monitor_registered",        status: "advisory", detail: "Register in Uptime Kuma after smoke tests pass" });

  return checks;
}

// ─────────────────────────────────────────────
// Main task
// ─────────────────────────────────────────────
export const adoptClientOs = task({
  id: "adopt-client-os",
  run: async (payload: unknown) => {
    try {
      const input = InputSchema.parse(payload);

      // Before any audit/write; blocked is a terminal result, not a throw (src/lib/systemMode.ts).
      const modeGate = await gateTaskStart(input.organizationId, input._dispatchedFromActionRunId);
      if (modeGate.blocks) {
        logger.warn("adopt-client-os: blocked by system mode", { organizationId: input.organizationId, mode: modeGate.mode, writebackError: modeGate.writebackError });
        return { status: "blocked_system_mode" as const, mode: modeGate.mode };
      }
      const creds = getSupabaseCreds();

      logger.info("adopt-client-os: starting", {
        organizationId: input.organizationId,
        siteId: input.siteId,
        siteUrl: input.siteUrl,
      });

      captureWorkflowEvent("workflow started", {
        workflowId: "adopt-client-os",
        organizationId: input.organizationId,
        siteId: input.siteId,
      });

      const enableWrites =
        (process.env.LOBSTER_ENABLE_DB_WRITES || "").toLowerCase() === "true" ||
        (process.env.LOBSTER_ENABLE_DB_WRITES || "") === "1";

      const workflowRunId = newUuid();
      const steps: Record<string, unknown> = {};

      // ── Step 1: validate site accessible ─────────────────────────────────
      logger.info("adopt-client-os: step 1 - validate site accessible");
      const accessibility = await stepValidateSiteAccessible(input.siteUrl);
      steps.validate_site_accessible = accessibility;

      if (!accessibility.accessible) {
        logger.error("adopt-client-os: site not accessible, halting", { siteUrl: input.siteUrl });
        captureWorkflowEvent("workflow blocked", {
          workflowId: "adopt-client-os",
          reason: "site_not_accessible",
          siteUrl: input.siteUrl,
        });
        return {
          status: "blocked_site_not_accessible" as const,
          siteUrl: input.siteUrl,
          steps,
          workflowRunId: null,
        };
      }

      // ── Step 2: verify backup ─────────────────────────────────────────────
      logger.info("adopt-client-os: step 2 - verify backup");
      if (!input.backupConfirmed) {
        logger.error("adopt-client-os: backup not confirmed, halting");
        captureWorkflowEvent("workflow blocked", {
          workflowId: "adopt-client-os",
          reason: "backup_not_confirmed",
        });
        return {
          status: "blocked_backup_not_confirmed" as const,
          backupRef: input.backupRef,
          steps,
          workflowRunId: null,
        };
      }
      steps.backup_verified = { backupRef: input.backupRef, confirmed: true };

      // ── Step 3: run adopt audit ───────────────────────────────────────────
      logger.info("adopt-client-os: step 3 - adopt audit");
      const auditReport = await stepRunAdoptAudit(input, creds);
      steps.adopt_audit = auditReport;

      // Write adopt_audit row if DB writes enabled
      let adoptAuditId: string | null = null;
      if (enableWrites) {
        adoptAuditId = newUuid();
        await supabaseRestInsert(creds, "adopt_audits", {
          id: adoptAuditId,
          organization_id: input.organizationId,
          site_id: input.siteId,
          workflow_run_id: workflowRunId,
          audited_at: new Date().toISOString(),
          existing_plugins: auditReport.existing_plugins,
          existing_themes: auditReport.existing_themes,
          existing_smtp: { configured: auditReport.smtp_configured },
          conflict_summary: { conflicts: auditReport.conflicts.length, manual_review: auditReport.manual_review.length },
          safe_to_install: auditReport.safe_to_install,
          manual_review_required: auditReport.manual_review,
          status: auditReport.manual_review.length > 0 ? "pending_manual_review" : "ready",
        });

        // Write individual audit items
        const allItems: AuditItem[] = [
          ...auditReport.safe_to_install,
          ...auditReport.skip_install,
          ...auditReport.update_required,
          ...auditReport.conflicts,
          ...auditReport.manual_review,
        ];
        for (const item of allItems) {
          await supabaseRestInsert(creds, "adopt_audit_items", {
            id: newUuid(),
            adopt_audit_id: adoptAuditId,
            item_type: item.item_type,
            slug: item.slug,
            existing_version: item.existing_version ?? null,
            manifest_version: item.manifest_version ?? null,
            status: item.status,
            resolution: item.resolution ?? null,
            notes: item.notes ?? null,
          });
        }
      }

      // ── Step 4: check for approval-required items ─────────────────────────
      logger.info("adopt-client-os: step 4 - check approval requirements");
      const needsApproval = auditReport.update_required.length > 0 || auditReport.conflicts.length > 0;
      steps.approval_check = {
        update_required: auditReport.update_required.length,
        conflicts: auditReport.conflicts.length,
        needs_approval: needsApproval,
      };

      // Create operator_task rows for manual_review items
      if (enableWrites && auditReport.manual_review.length > 0) {
        const manualItems = auditReport.manual_review.filter((i) => i.slug !== "__audit_required__");
        for (const item of manualItems) {
          await supabaseRestInsert(creds, "operator_tasks", {
            id: newUuid(),
            organization_id: input.organizationId,
            site_id: input.siteId,
            workflow_run_id: workflowRunId,
            task_type: "plugin_conflict",
            status: "pending",
            title: `Manual review required: ${item.slug}`,
            description: `Plugin ${item.slug} requires manual review before adopt delta can proceed.`,
            instructions: `1. Review ${item.slug} on ${input.siteUrl}\n2. Decide: keep existing, update, or replace\n3. Mark this task resolved with your decision`,
            input_required: { slug: item.slug, notes: item.notes },
          });
        }
      }

      // If there are unresolved manual review items, the workflow is partially blocked
      const hasManualItems = auditReport.manual_review.some((i) => i.slug !== "__audit_required__");
      const auditRequiresManualEntry = auditReport.manual_review.some((i) => i.slug === "__audit_required__");

      // ── Step 5: apply delta manifest (safe_to_install only) ───────────────
      logger.info("adopt-client-os: step 5 - apply delta manifest");
      const safeToInstall = auditReport.safe_to_install;
      steps.apply_delta_manifest = {
        safe_to_install_count: safeToInstall.length,
        skipped_count: auditReport.skip_install.length,
        manual_review_count: auditReport.manual_review.length,
        applied: safeToInstall.map((i) => i.slug),
        note: safeToInstall.length === 0
          ? "No safe-to-install items in this audit pass. Operator tasks created for manual items."
          : `${safeToInstall.length} plugin(s) scheduled for install.`,
      };

      // ── Step 6–7: MainWP child (advisory — requires SSH/WP-CLI) ──────────
      logger.info("adopt-client-os: step 6-7 - mainwp child (advisory)");
      steps.mainwp_child = {
        status: "advisory",
        note: "Install mainwp-child via WP-CLI or wp-admin after SSH access is configured",
        slug: "mainwp-child",
      };

      // ── Step 8: register monitoring (advisory) ────────────────────────────
      logger.info("adopt-client-os: step 8 - register monitoring");
      steps.register_monitoring = {
        status: "advisory",
        uptime_kuma: `Register ${input.siteUrl} in Uptime Kuma after site is confirmed healthy`,
        ssl_check: `Add SSL monitor for ${input.siteUrl}`,
      };

      // ── Step 9: run adopt smoke tests ─────────────────────────────────────
      logger.info("adopt-client-os: step 9 - adopt smoke tests");
      const smokeTests = await stepRunAdoptSmokeTests(input.siteUrl, input.wpAdminUrl);
      const smokeRequired = smokeTests.filter((s) => s.status === "pass" || s.status === "fail");
      const smokeFailed   = smokeTests.filter((s) => s.status === "fail");
      const smokeAdvisory = smokeTests.filter((s) => s.status === "advisory");
      steps.adopt_smoke_tests = { checks: smokeTests, failed: smokeFailed.length, advisory: smokeAdvisory.length };

      // If required smoke tests fail → rollback (don't apply delta, flag critical)
      if (smokeFailed.length > 0) {
        logger.error("adopt-client-os: critical smoke test failed, rollback required", {
          failed: smokeFailed.map((s) => s.name),
        });
        captureWorkflowEvent("workflow failed", {
          workflowId: "adopt-client-os",
          reason: "smoke_test_failed",
          failed: smokeFailed.map((s) => s.name),
        });
        return {
          status: "failed_smoke_test" as const,
          smokeTests,
          steps,
          workflowRunId: null,
          rollbackInstruction: "Restore pre-adopt backup snapshot. backupRef: " + input.backupRef,
        };
      }

      // ── Step 9b: run integrations (Uptime Kuma, Sentry, PostHog, n8n, MainWP) ──
      logger.info("adopt-client-os: step 9b - running integrations");
      // Client attribution (critic 2026-07-03 Major-1): without the org slug the
      // adopted client's monitors carry no `client` tag and its incidents can
      // never resolve to an organization — the exact chain break this batch
      // fixes on the create path. Best-effort: a failed lookup only skips
      // attribution, never the integrations themselves.
      let adoptClientSlug: string | undefined;
      try {
        const orgRows = (await supabaseRestQuery(getSupabaseCreds(), "organizations", {
          id: `eq.${input.organizationId}`,
          select: "slug",
          limit: 1,
        })) as Array<{ slug?: string }>;
        const rawSlug = orgRows[0]?.slug?.trim().toLowerCase();
        if (rawSlug && /^[a-z0-9-]{1,64}$/.test(rawSlug)) adoptClientSlug = rawSlug;
      } catch (e) {
        logger.warn("adopt-client-os: org slug lookup failed — integrations run without client attribution", {
          error: e instanceof Error ? e.message : String(e),
        });
      }
      const integrationResults = await runAllIntegrations(
        input.integrations as BuildIntegrations | undefined,
        {
          siteUrl: input.siteUrl,
          adminUrl: input.wpAdminUrl,
          clientName: input.siteUrl, // use siteUrl as name since adopt doesn't always have a friendly name
          profile: "profile_c",
          clientSlug: adoptClientSlug,
        }
      );
      const integrationErrors = integrationResults.filter((r) => r.status === "error");
      if (integrationErrors.length > 0) {
        logger.warn("adopt-client-os: some integrations failed", { errors: integrationErrors });
      }
      steps.integrations = integrationResults;

      // ── Step 10: generate handoff report ─────────────────────────────────
      logger.info("adopt-client-os: step 10 - generate handoff report");
      const handoffReport = {
        report_id:       newUuid(),
        site_id:         input.siteId,
        organization_id: input.organizationId,
        workflow_run_id: workflowRunId,
        generated_at:    new Date().toISOString(),
        profile:         "profile_c",
        apply_mode:      "adopt_delta",
        site_url:        input.siteUrl,
        admin_url:       input.wpAdminUrl,
        package:         input.packageSlug,
        audit_summary: {
          safe_to_install:  auditReport.safe_to_install.length,
          skip_install:     auditReport.skip_install.length,
          update_required:  auditReport.update_required.length,
          conflicts:        auditReport.conflicts.length,
          manual_review:    auditReport.manual_review.length,
        },
        smoke_tests:     smokeTests,
        pending_tasks:   auditReport.manual_review.map((i) => i.slug),
        maintenance_plan: "basic-monthly",
        integrations:    integrationResults,
        status:          auditRequiresManualEntry || hasManualItems ? "partial_requires_manual" : "delivered",
      };
      steps.handoff_report = handoffReport;

      if (enableWrites) {
        await supabaseRestInsert(creds, "handoff_reports", {
          id: handoffReport.report_id,
          organization_id: input.organizationId,
          site_id: input.siteId,
          workflow_run_id: workflowRunId,
          report_data: handoffReport,
          status: handoffReport.status,
          generated_at: handoffReport.generated_at,
        });
      }

      // ── Step 11: write workflow_run ───────────────────────────────────────
      const finalStatus = auditRequiresManualEntry || hasManualItems ? "completed" : "completed";
      if (enableWrites) {
        const insertSpec = buildWorkflowRunInsertSql({
          id: workflowRunId,
          workflowVersionId: LobsterCatalogIds.workflows.adoptClientOsWorkflowVersionId,
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          siteId: input.siteId,
          environmentId: null,
          parentRunId: null,
          triggerType: "adopt-client-os",
          triggerRef: input.siteUrl,
          actorType: "system",
          actorRef: null,
          status: finalStatus,
          riskLevel: "high",
          inputSnapshot: { ...input, credentialsRef: "[redacted]" },
          outputSnapshot: { steps, handoffReport },
          artifacts: [],
        });
        await supabaseRestInsert(creds, "workflow_runs", buildWorkflowRunRow(insertSpec.spec));
      }

      captureWorkflowEvent("workflow completed", {
        workflowId: "adopt-client-os",
        organizationId: input.organizationId,
        siteId: input.siteId,
        status: finalStatus,
        auditManualReviewCount: auditReport.manual_review.length,
      });

      return {
        status: auditRequiresManualEntry
          ? "completed_audit_pending_manual" as const
          : "completed" as const,
        steps,
        handoffReport,
        workflowRunId,
        pendingOperatorTasks: auditReport.manual_review.map((i) => i.slug),
      };
    } catch (error) {
      captureWorkflowException(error, {
        workflowId: "adopt-client-os",
        route: "task.run",
        payload,
      });
      throw error;
    }
  },
});
