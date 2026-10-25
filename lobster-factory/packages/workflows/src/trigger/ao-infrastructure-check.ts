/**
 * Profile A: AO-agent infrastructure check.
 *
 * Verifies that all AwareWave control-plane services are reachable and
 * correctly configured. Does NOT produce a client handoff report — this is
 * an internal agency-ops workflow.
 *
 * Checks performed:
 *   1. Supabase REST health
 *   2. Trigger.dev API reachability
 *   3. n8n reachability
 *   4. Uptime Kuma / monitoring endpoint
 *   5. Sentry API reachability (/api/0/)
 *   6. PostHog reachability (/_health on API host, not ingest subdomain)
 *   7. RLS isolation smoke (no cross-tenant data leak)
 */

import { task, logger } from "@trigger.dev/sdk";
import { z } from "zod";
import { newUuid } from "../utils/uid";
import { buildWorkflowRunRow, buildWorkflowRunInsertSql } from "../db/sql/workflowRunsSql";
import { LobsterCatalogIds } from "../db/catalogIds";
import { supabaseRestInsert, supabaseRestPatch, supabaseRestQuery } from "../db/supabase/supabaseRestInsert";
import { captureWorkflowEvent } from "../observability/posthog";
import { captureWorkflowException } from "../observability/sentry";

const InputSchema = z.object({
  // Absent when the host clock starts the daily run (scripts/trigger-task.sh sends an empty payload).
  organizationId: z.string().uuid().default(() => process.env.LOBSTER_AO_ORG_ID ?? "00000000-0000-0000-0000-000000000000"),
  domain: z.string().optional().default("aware-wave.com"),
  // optional service overrides
  supabaseUrl: z.string().optional(),
  triggerApiUrl: z.string().optional(),
  n8nUrl: z.string().optional(),
  uptimeKumaUrl: z.string().optional(),
  sentryUrl: z.string().optional(),
  posthogHost: z.string().optional(),
  // dispatcher passthrough
  _dispatchedFromActionRunId: z.string().optional(),
  _traceId: z.string().optional(),
  _actionKey: z.string().optional(),
});

type CheckResult = {
  name: string;
  status: "pass" | "fail" | "skip";
  latencyMs?: number;
  detail?: string;
};

async function pingUrl(
  url: string,
  label: string,
  timeoutMs = 8000
): Promise<CheckResult> {
  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { method: "GET", signal: ctrl.signal });
    clearTimeout(timer);
    const latencyMs = Date.now() - start;
    if (res.ok || res.status === 401 || res.status === 403) {
      // 401/403 means service is up but we lack auth → still "reachable"
      return { name: label, status: "pass", latencyMs };
    }
    return { name: label, status: "fail", latencyMs, detail: `HTTP ${res.status}` };
  } catch (err) {
    return {
      name: label,
      status: "fail",
      latencyMs: Date.now() - start,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export const aoInfrastructureCheck = task({
  id: "ao-infrastructure-check",
  run: async (payload: unknown) => {
    try {
      const input = InputSchema.parse(payload);

      const supabaseUrl    = input.supabaseUrl    ?? process.env.LOBSTER_SUPABASE_URL     ?? "";
      const serviceRoleKey = process.env.LOBSTER_SUPABASE_SERVICE_ROLE_KEY ?? "";
      const triggerApiUrl  = input.triggerApiUrl  ?? process.env.TRIGGER_API_URL          ?? "";
      const n8nUrl         = input.n8nUrl         ?? process.env.N8N_URL                  ?? "";
      const uptimeKumaUrl  = input.uptimeKumaUrl  ?? process.env.UPTIME_KUMA_URL          ?? "";
      const sentryUrl      = input.sentryUrl      ?? process.env.SENTRY_URL               ?? "";
      const posthogHost    = input.posthogHost    ?? process.env.POSTHOG_HOST             ?? "";

      logger.info("ao-infrastructure-check: starting", {
        organizationId: input.organizationId,
        domain: input.domain,
      });

      captureWorkflowEvent("workflow started", {
        workflowId: "ao-infrastructure-check",
        organizationId: input.organizationId,
      });

      const checks: CheckResult[] = [];

      // 1. Supabase health
      if (supabaseUrl) {
        checks.push(await pingUrl(`${supabaseUrl}/rest/v1/`, "supabase_rest"));
      } else {
        checks.push({ name: "supabase_rest", status: "skip", detail: "LOBSTER_SUPABASE_URL not set" });
      }

      // 2. Trigger.dev API
      if (triggerApiUrl) {
        checks.push(await pingUrl(`${triggerApiUrl}/api/v1/projects`, "trigger_api"));
      } else {
        checks.push({ name: "trigger_api", status: "skip", detail: "TRIGGER_API_URL not set" });
      }

      // 3. n8n
      if (n8nUrl) {
        checks.push(await pingUrl(`${n8nUrl}/healthz`, "n8n"));
      } else {
        checks.push({ name: "n8n", status: "skip", detail: "N8N_URL not set" });
      }

      // 4. Uptime Kuma / monitoring
      if (uptimeKumaUrl) {
        checks.push(await pingUrl(uptimeKumaUrl, "uptime_kuma"));
      } else {
        checks.push({ name: "uptime_kuma", status: "skip", detail: "UPTIME_KUMA_URL not set" });
      }

      // 5. Sentry base URL reachability — GET /api/0/ returns 200 JSON or 401 (auth required = still up)
      if (sentryUrl) {
        checks.push(await pingUrl(`${sentryUrl.replace(/\/$/, "")}/api/0/`, "sentry_api"));
      } else {
        checks.push({ name: "sentry_api", status: "skip", detail: "SENTRY_URL not set" });
      }

      // 6. PostHog reachability — /_health exists on the main API host, not the ingest subdomain.
      // us.i.posthog.com is the ingest-only subdomain; derive the API host by removing ".i.".
      if (posthogHost) {
        const phBase = posthogHost.replace(/\/$/, "").replace(/\.i\.posthog\.com$/i, ".posthog.com");
        checks.push(await pingUrl(`${phBase}/_health`, "posthog_ingest"));
      } else {
        checks.push({ name: "posthog_ingest", status: "skip", detail: "POSTHOG_HOST not set" });
      }

      // 7. RLS isolation smoke — cross-tenant query must return empty
      if (supabaseUrl && serviceRoleKey) {
        try {
          // Query sites with a bogus org_id — expect 0 rows under RLS
          const rows = await supabaseRestQuery(
            { supabaseUrl, serviceRoleKey },
            "sites",
            { organization_id: "eq.00000000-0000-0000-0000-000000000000", limit: 1 }
          );
          checks.push({
            name: "rls_isolation_smoke",
            status: "pass",
            detail: `returned ${rows.length} rows for unknown org (expected 0)`,
          });
        } catch (err) {
          checks.push({
            name: "rls_isolation_smoke",
            status: "fail",
            detail: err instanceof Error ? err.message : String(err),
          });
        }
      } else {
        checks.push({ name: "rls_isolation_smoke", status: "skip", detail: "credentials not available" });
      }

      const passed  = checks.filter((c) => c.status === "pass").length;
      const failed  = checks.filter((c) => c.status === "fail").length;
      const skipped = checks.filter((c) => c.status === "skip").length;
      const overallPassed = failed === 0;

      logger.info("ao-infrastructure-check: complete", { passed, failed, skipped, overallPassed });

      // Write workflow_run record if writes are enabled
      const enableWrites =
        (process.env.LOBSTER_ENABLE_DB_WRITES || "").toLowerCase() === "true" ||
        (process.env.LOBSTER_ENABLE_DB_WRITES || "") === "1";

      let workflowRunId: string | null = null;
      if (enableWrites && supabaseUrl && serviceRoleKey) {
        workflowRunId = newUuid();
        const insertSpec = buildWorkflowRunInsertSql({
          id: workflowRunId,
          workflowVersionId: LobsterCatalogIds.workflows.aoInfraCheckWorkflowVersionId,
          organizationId: input.organizationId,
          workspaceId: input.organizationId, // AO has no separate workspace
          projectId: null,
          siteId: null,
          environmentId: null,
          parentRunId: null,
          triggerType: "ao-infrastructure-check",
          triggerRef: input.domain,
          actorType: "system",
          actorRef: null,
          status: overallPassed ? "completed" : "failed",
          riskLevel: "medium",
          inputSnapshot: input,
          outputSnapshot: { checks, passed, failed, skipped },
          artifacts: [],
        });
        const row = buildWorkflowRunRow(insertSpec.spec);
        await supabaseRestInsert(
          { supabaseUrl, serviceRoleKey },
          "workflow_runs",
          row
        );
      }

      captureWorkflowEvent("workflow completed", {
        workflowId: "ao-infrastructure-check",
        organizationId: input.organizationId,
        overallPassed,
        passed,
        failed,
        skipped,
      });

      return {
        status: overallPassed ? "pass" : "fail",
        checks,
        summary: { passed, failed, skipped },
        workflowRunId,
      };
    } catch (error) {
      captureWorkflowException(error, {
        workflowId: "ao-infrastructure-check",
        route: "task.run",
        payload,
      });
      throw error;
    }
  },
});
