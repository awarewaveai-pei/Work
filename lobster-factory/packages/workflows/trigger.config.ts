import { syncEnvVars } from "@trigger.dev/build/extensions/core";
import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  // After first boot: open https://trigger.aware-wave.com, create a project,
  // copy the new project ref here and remove the old Cloud ref.
  project: "proj_6c4f24492a705729fc2c",
  // LOBSTER_TRIGGER_DEPLOY_URL: override triggerUrl at deploy time to bypass Cloudflare
  // Bot Fight Mode (set to http://127.0.0.1:8030 in lobster-trigger-deploy.ps1).
  // Default is the public URL for development and manual deploy flows.
  // @ts-expect-error Trigger SDK 4.5.10's public TriggerConfig omits this runtime-supported field.
  triggerUrl: process.env.LOBSTER_TRIGGER_DEPLOY_URL ?? "https://trigger.aware-wave.com",
  dirs: ["./src/trigger"],
  build: {
    // Cloudflare bypass for the managed-index-controller:
    // The indexer runs as a Docker build RUN step. It reads TRIGGER_API_URL which
    // localBuildImage() sets from apiUrl (server's self-reported https://trigger.aware-wave.com).
    // Cloudflare BFM blocks that call inside Docker.
    // FIX: lobster-trigger-deploy.ps1 patches buildImage.js after npm install to replace
    //   TRIGGER_API_URL=${apiUrl} → TRIGGER_API_URL=http://127.0.0.1:8030 in localBuildImage.
    // Combined with --network=host in the deploy command the indexer reaches the VPS-local
    // trigger-webapp at port 8030 without going through Cloudflare.
    // NOTE: build.env.TRIGGER_API_URL does NOT work — confirmed that build.env is NOT
    //   propagated to buildEnvVars in localBuildImage in trigger.dev 4.4.6 (only works
    //   for syncEnvVars/deploy sync path, not for the docker --build-arg override).
    //
    // ssh2 uses native C++ addons (.node files); esbuild cannot bundle them.
    // Mark as external so Trigger.dev installs them in the worker at runtime.
    external: ["ssh2", "cpu-features"],
    extensions: [
      // Sync runtime env vars into Trigger prod/staging on each deploy.
      // Source: $deployBash in scripts/lobster-trigger-deploy.ps1, the only deploy path. Every
      // process.env read below must be exported there or listed in NOT_SYNCED_BY_DEPLOY in
      // src/lib/deployEnv/syncEnvVarsParity.test.ts, which runs before every deploy.
      // Only pushes a key if the value is non-empty — never clears existing Trigger vars.
      // See `infra/trigger/TASK_REFERENCE.md` for required vars per task.
      syncEnvVars(async () => {
        const out: Record<string, string> = {};

        // ── Observability ────────────────────────────────────────────────────
        const posthogKey  = process.env.POSTHOG_API_KEY ?? "";
        const posthogHost = process.env.POSTHOG_HOST ?? "";
        if (posthogKey.trim() && posthogHost.trim()) {
          out.POSTHOG_API_KEY = posthogKey;
          out.POSTHOG_HOST    = posthogHost;
        }

        // ── Ops Inbox / webhook auth ─────────────────────────────────────────
        const ingest = process.env.OPS_INBOX_INGEST_TOKEN ?? "";
        if (ingest.trim()) out.OPS_INBOX_INGEST_TOKEN = ingest.trim();

        const awBase = process.env.AWAREWAVE_WEBHOOK_BASE_URL ?? "";
        if (awBase.trim()) out.AWAREWAVE_WEBHOOK_BASE_URL = awBase.trim().replace(/\/$/, "");

        // schedules-heartbeat -> next-admin /api/internal/schedules/run-due.
        // Dedicated token (never OPS_INBOX_INGEST_TOKEN) so a leak here cannot forge the other
        // OPS_INBOX_INGEST_TOKEN-guarded endpoints, and vice versa.
        const scheduleToken = process.env.SCHEDULE_INGEST_TOKEN ?? "";
        if (scheduleToken.trim()) out.SCHEDULE_INGEST_TOKEN = scheduleToken.trim();

        // site-watch-heartbeat / site-watch-run -> next-admin /api/internal/site-watch/*. Own token,
        // same blast-radius rule as the collect one above.
        const siteWatchToken = process.env.SITE_WATCH_INGEST_TOKEN ?? "";
        if (siteWatchToken.trim()) out.SITE_WATCH_INGEST_TOKEN = siteWatchToken.trim();

        // pod-order-inbox-sweep -> next-admin /api/internal/pod-orders/sweep. Own token, same rule.
        const podSweepToken = process.env.POD_INBOX_SWEEP_TOKEN ?? "";
        if (podSweepToken.trim()) out.POD_INBOX_SWEEP_TOKEN = podSweepToken.trim();

        // collect-research-run -> next-admin /api/internal/collect/runs/execute (RESEARCH_LINES_MASTER_PLAN
        // WC-P1-13). Own token, same rule.
        const researchExecuteToken = process.env.COLLECT_RESEARCH_EXECUTE_TOKEN ?? "";
        if (researchExecuteToken.trim()) out.COLLECT_RESEARCH_EXECUTE_TOKEN = researchExecuteToken.trim();

        // ── Supabase (Lobster DB writes) ─────────────────────────────────────
        const supabaseUrl = process.env.LOBSTER_SUPABASE_URL ?? "";
        const supabaseSrk = process.env.LOBSTER_SUPABASE_SERVICE_ROLE_KEY ?? "";
        if (supabaseUrl.trim())  out.LOBSTER_SUPABASE_URL                = supabaseUrl.trim();
        if (supabaseSrk.trim())  out.LOBSTER_SUPABASE_SERVICE_ROLE_KEY   = supabaseSrk.trim();

        // ── Lobster runtime flags ────────────────────────────────────────────
        // LOBSTER_ENABLE_DB_WRITES: "true"|"1" → enables DB inserts in tasks.
        // LOBSTER_MANIFEST_EXECUTION_MODE: "off"|"dry_run"|"apply" (default: "off").
        const dbWrites  = process.env.LOBSTER_ENABLE_DB_WRITES ?? "";
        const execMode  = process.env.LOBSTER_MANIFEST_EXECUTION_MODE ?? "";
        if (dbWrites.trim())  out.LOBSTER_ENABLE_DB_WRITES           = dbWrites.trim();
        if (execMode.trim())  out.LOBSTER_MANIFEST_EXECUTION_MODE    = execMode.trim();

        // ── Hosting adapter (create-wp-site → real staging WP provisioning) ──
        // LOBSTER_HOSTING_ADAPTER=http_json makes create-wp-site POST to the provision-staging
        // control-plane endpoint (SSHes into the SG WordPress container + actually builds a
        // staging WP). Without these, create-wp-site stays mock/idle and no real site is built.
        // provision-staging verifies the same LOBSTER_HOSTING_API_TOKEN. (Onboarding Stage 0.)
        const hostingAdapter = process.env.LOBSTER_HOSTING_ADAPTER ?? "";
        const hostingBaseUrl = process.env.LOBSTER_HOSTING_PROVIDER_BASE_URL ?? "";
        const hostingPath    = process.env.LOBSTER_HOSTING_PROVISION_PATH ?? "";
        const hostingToken   = process.env.LOBSTER_HOSTING_API_TOKEN ?? "";
        if (hostingAdapter.trim()) out.LOBSTER_HOSTING_ADAPTER           = hostingAdapter.trim();
        if (hostingBaseUrl.trim()) out.LOBSTER_HOSTING_PROVIDER_BASE_URL = hostingBaseUrl.trim().replace(/\/$/, "");
        if (hostingPath.trim())    out.LOBSTER_HOSTING_PROVISION_PATH     = hostingPath.trim();
        if (hostingToken.trim())   out.LOBSTER_HOSTING_API_TOKEN          = hostingToken.trim();
        // provision-staging (SSH + WP core + 5 plugins) measured at ~71s; the adapter's default
        // 45s timeout fired first → create-wp-site returned blocked_hosting_configuration even
        // though the site finished building server-side (run stuck "dispatched"). Raise to 110s
        // (httpJsonStagingAdapter caps at 120s; Cloudflare's ~100s origin ceiling is the real bound,
        // and 71s sits safely under it). Onboarding Stage 0 fix (2026-06-06).
        const hostingTimeout = process.env.LOBSTER_HOSTING_HTTP_TIMEOUT_MS ?? "";
        if (hostingTimeout.trim()) out.LOBSTER_HOSTING_HTTP_TIMEOUT_MS     = hostingTimeout.trim();

        // ── Infrastructure endpoints (ao-infrastructure-check) ───────────────
        // LOBSTER_TRIGGER_PUBLIC_API_URL: set by lobster-trigger-deploy.ps1 to the public
        // HTTPS URL (https://trigger.aware-wave.com) so tasks get the correct runtime URL.
        // Falls back to TRIGGER_API_URL. Never syncs a localhost deploy URL to the project.
        const triggerApiUrl  = process.env.LOBSTER_TRIGGER_PUBLIC_API_URL ?? process.env.TRIGGER_API_URL ?? "";
        const n8nUrl         = process.env.N8N_URL          ?? "";
        const uptimeKumaUrl  = process.env.UPTIME_KUMA_URL  ?? "";
        const sentryUrl      = process.env.SENTRY_URL       ?? "";
        if (triggerApiUrl.trim())  out.TRIGGER_API_URL  = triggerApiUrl.trim();
        if (n8nUrl.trim())         out.N8N_URL          = n8nUrl.trim();
        if (uptimeKumaUrl.trim())  out.UPTIME_KUMA_URL  = uptimeKumaUrl.trim();
        if (sentryUrl.trim())      out.SENTRY_URL       = sentryUrl.trim();

        // ── Tenant provisioning (orchestrate-tenant-provisioning) ────────────
        const sentryToken   = process.env.SENTRY_AUTH_TOKEN                    ?? "";
        const sentryOrg     = process.env.SENTRY_ORG_SLUG                      ?? "";
        const ghToken       = process.env.TENANT_PROVISION_GITHUB_TOKEN         ?? "";
        const posthogPat    = process.env.POSTHOG_PERSONAL_API_KEY              ?? "";
        const n8nApiKey     = process.env.N8N_API_KEY                           ?? "";
        const n8nApiBase    = process.env.N8N_API_BASE_URL                      ?? "";
        const uptimeApiKey  = process.env.UPTIME_KUMA_API_KEY                   ?? "";
        const supAccessTkn  = process.env.TENANT_PROVISION_SUPABASE_ACCESS_TOKEN ?? "";
        if (sentryToken.trim())   out.SENTRY_AUTH_TOKEN                          = sentryToken.trim();
        if (sentryOrg.trim())     out.SENTRY_ORG_SLUG                            = sentryOrg.trim();
        if (ghToken.trim())       out.TENANT_PROVISION_GITHUB_TOKEN              = ghToken.trim();
        if (posthogPat.trim())    out.POSTHOG_PERSONAL_API_KEY                   = posthogPat.trim();
        if (n8nApiKey.trim())     out.N8N_API_KEY                                = n8nApiKey.trim();
        if (n8nApiBase.trim())    out.N8N_API_BASE_URL                           = n8nApiBase.trim();
        if (uptimeApiKey.trim())  out.UPTIME_KUMA_API_KEY                        = uptimeApiKey.trim();
        if (supAccessTkn.trim())  out.TENANT_PROVISION_SUPABASE_ACCESS_TOKEN     = supAccessTkn.trim();

        // ── MainWP (create-wp-site / adopt-client-os → addSiteToMainWp) ──────
        // Credentials come only from here, never from the run payload (it is persisted).
        const mainWpUrl    = process.env.MAINWP_DASHBOARD_URL   ?? "";
        const mainWpKey    = process.env.MAINWP_CONSUMER_KEY    ?? "";
        const mainWpSecret = process.env.MAINWP_CONSUMER_SECRET ?? "";
        if (mainWpUrl.trim() && mainWpKey.trim() && mainWpSecret.trim()) {
          out.MAINWP_DASHBOARD_URL   = mainWpUrl.trim().replace(/\/$/, "");
          out.MAINWP_CONSUMER_KEY    = mainWpKey.trim();
          out.MAINWP_CONSUMER_SECRET = mainWpSecret.trim();
        }

        // ── AO org ID for scheduled infra checks ─────────────────────────────
        const aoOrgId = process.env.LOBSTER_AO_ORG_ID ?? "";
        if (aoOrgId.trim()) out.LOBSTER_AO_ORG_ID = aoOrgId.trim();

        // ── wp-install-plugins: SSH execution gate + global key ───────────────
        // LOBSTER_EXECUTE_MANIFEST_STEPS="true" → task actually SSHes into WP host.
        // LOBSTER_WP_SSH_PRIVATE_KEY → PEM key used when no per-client key is set.
        const executeSteps = process.env.LOBSTER_EXECUTE_MANIFEST_STEPS ?? "";
        if (executeSteps.trim()) out.LOBSTER_EXECUTE_MANIFEST_STEPS = executeSteps.trim();
        const wpSshKey = process.env.LOBSTER_WP_SSH_PRIVATE_KEY ?? "";
        if (wpSshKey.trim()) out.LOBSTER_WP_SSH_PRIVATE_KEY = wpSshKey.trim();

        // No BATCH_INTERNAL_SECRET here: tarot-batch-generate never reads it from env, next-admin
        // passes it in the run payload (app/api/tools/tarot/batch/route.ts).

        return out;
      }),
    ],
  },
  maxDuration: 300,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
});
