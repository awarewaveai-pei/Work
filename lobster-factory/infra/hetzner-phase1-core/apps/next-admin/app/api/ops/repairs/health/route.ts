import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getCurrentSystemMode } from "@/lib/repair-center/service";
import { REPAIR_SOURCE_POLICIES, repairPolicyLabel } from "@/lib/repair-center/policy";
import type { RepairPolicy } from "@/lib/repair-center/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function configured(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function envVal(name: string): string {
  return process.env[name]?.trim() ?? "";
}

const REQUIRED_REPAIR_LABELS: RepairPolicy[] = ["auto_repair", "analysis_only", "human_only", "triage_needed"];
const REQUIRED_POLICY_TEXT = ["可自動修復", "僅分析", "人工處理", "需分流", "手動"];

function textIsPresent(value: string): boolean {
  return value.trim().length > 0 && !value.includes("\uFFFD");
}

function policyCatalogTextOk(): boolean {
  const sourcePolicyText = REPAIR_SOURCE_POLICIES.flatMap(({ label, rationale }) => [label, rationale]);
  const repairLabelText = REQUIRED_REPAIR_LABELS.map((policy) => repairPolicyLabel(policy));
  const catalogText = [...sourcePolicyText, ...repairLabelText].join("\n");

  return [...sourcePolicyText, ...repairLabelText].every(textIsPresent) && REQUIRED_POLICY_TEXT.every((text) => catalogText.includes(text));
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
  const githubOwner = envVal("AUTO_REPAIR_GITHUB_OWNER") || envVal("GITHUB_REPOSITORY_OWNER") || "awarewaveai-pei";
  const githubRepo = envVal("AUTO_REPAIR_GITHUB_REPO") || (envVal("GITHUB_REPOSITORY").split("/")[1] ?? "") || "Work";
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

  const ok = tableOk && mode === "normal" && backupConfigured && githubConfigured;

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
      github_repo_target: githubConfigured ? { owner: githubOwner, repo: githubRepo } : null,
      github_app_advisory: githubConfigured
        ? `Issues will be created in ${githubOwner}/${githubRepo}. Ensure the Claude GitHub App is installed on this repo to enable @claude auto-repair responses.`
        : "Configure AUTO_REPAIR_GITHUB_TOKEN or GITHUB_TOKEN to enable GitHub handoff.",
      slack_signing_configured: slackSigningConfigured,
      slack_interactive_ready: slackSigningConfigured,
      web_ui_ready: ok,
      deploy_mode: "manual_sg_deploy_only",
      policy_catalog_count: REPAIR_SOURCE_POLICIES.length,
      policy_catalog_text_ok: policyCatalogTextOk(),
      source_policies: REPAIR_SOURCE_POLICIES.map(({ source, label, policy, family }) => ({ source, label, policy, family })),
    },
    { status: ok ? 200 : 503 },
  );
}
