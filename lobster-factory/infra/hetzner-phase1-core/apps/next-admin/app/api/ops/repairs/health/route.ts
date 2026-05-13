import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getCurrentSystemMode } from "@/lib/repair-center/service";
import { REPAIR_SOURCE_POLICIES } from "@/lib/repair-center/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function configured(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

export async function GET() {
  const supabase = getSupabaseServerClient();
  const mode = await getCurrentSystemMode();
  const backupWebhook = configured("AUTO_REPAIR_BACKUP_WEBHOOK_URL");
  const sgSsh = configured("AUTO_REPAIR_SG_SSH_HOST") && (configured("AUTO_REPAIR_SG_SSH_KEY_B64") || configured(process.env.AUTO_REPAIR_SG_SSH_KEY_ENV ?? ""));
  const euRequired = process.env.AUTO_REPAIR_REQUIRE_EU_BACKUP?.trim().toLowerCase() !== "false";
  const euSsh = configured("AUTO_REPAIR_EU_SSH_HOST") && (configured("AUTO_REPAIR_EU_SSH_KEY_B64") || configured(process.env.AUTO_REPAIR_EU_SSH_KEY_ENV ?? ""));
  const backupConfigured = backupWebhook || (sgSsh && (!euRequired || euSsh));
  const githubConfigured = configured("AUTO_REPAIR_GITHUB_TOKEN") || configured("GITHUB_TOKEN");
  const slackSigningConfigured = configured("SLACK_SIGNING_SECRET");

  let tableOk = false;
  let activeRuns = 0;
  let tableError: string | null = null;
  if (!supabase) {
    tableError = "supabase_not_configured";
  } else {
    const res = await supabase
      .from("repair_runs")
      .select("id", { count: "exact", head: true })
      .in("state", ["detected", "triage_needed", "approved", "backing_up", "repairing", "pr_ready", "deploy_pending", "deploying"]);
    tableOk = !res.error;
    activeRuns = res.count ?? 0;
    tableError = res.error?.message ?? null;
  }

  const ok = tableOk && mode === "normal" && backupConfigured && githubConfigured && slackSigningConfigured;

  return NextResponse.json(
    {
      ok,
      system_mode: mode,
      active_runs: activeRuns,
      table_ok: tableOk,
      table_error: tableError,
      backup_configured: backupConfigured,
      backup_mode: backupWebhook ? "webhook" : sgSsh ? "ssh" : "missing",
      sg_backup_configured: sgSsh,
      eu_backup_required: euRequired,
      eu_backup_configured: euSsh,
      github_configured: githubConfigured,
      slack_signing_configured: slackSigningConfigured,
      deploy_mode: "manual_sg_deploy_only",
      source_policies: REPAIR_SOURCE_POLICIES.map(({ source, label, policy, family }) => ({ source, label, policy, family })),
    },
    { status: ok ? 200 : 503 },
  );
}
