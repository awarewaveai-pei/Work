import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getCurrentSystemMode } from "@/lib/repair-center/service";
import { REPAIR_SOURCE_POLICIES, repairPolicyLabel } from "@/lib/repair-center/policy";
import { connectSsh, readPrivateKeyFromEnv, sshExec } from "@/lib/repair-center/ssh";
import type { RepairPolicy } from "@/lib/repair-center/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function configured(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function envVal(name: string): string {
  return process.env[name]?.trim() ?? "";
}

// GAP-01 — backup script existence probe (SSH stat, advisory only)

type ScriptProbeStatus = "ok" | "not_found" | "ssh_error" | "unconfigured" | "skipped";

interface BackupScriptProbe {
  sg: ScriptProbeStatus;
  eu: ScriptProbeStatus;
  note?: string;
}

function safePath(raw: string, fallback: string): string {
  const value = raw.trim() || fallback;
  return /^[/A-Za-z0-9_.-]+$/.test(value) ? value : fallback;
}

function resolveScriptPath(root: string, script: string): string {
  if (script.startsWith("/")) return script;
  return `${root}/${script.startsWith("./") ? script.slice(2) : script}`;
}

async function statRemoteScript(
  host: string,
  port: number,
  username: string,
  keyEnvName: string,
  scriptPath: string,
  timeoutMs: number,
): Promise<ScriptProbeStatus> {
  const privateKey = readPrivateKeyFromEnv(keyEnvName);
  if (!host || !privateKey) return "unconfigured";

  const run = async (): Promise<ScriptProbeStatus> => {
    const conn = await connectSsh({ host, port, username, privateKey });
    try {
      const result = await sshExec(conn, `test -f ${scriptPath} && echo OK || echo MISSING`);
      const out = result.stdout.trim();
      if (out === "OK") return "ok";
      if (out === "MISSING") return "not_found";
      return "ssh_error";
    } finally {
      conn.end();
    }
  };

  const timer = new Promise<ScriptProbeStatus>((resolve) => setTimeout(() => resolve("ssh_error"), timeoutMs));
  try {
    return await Promise.race([run(), timer]);
  } catch {
    return "ssh_error";
  }
}

async function probeBackupScripts(backupMode: string): Promise<BackupScriptProbe> {
  if (backupMode !== "ssh") return { sg: "skipped", eu: "skipped", note: "webhook_mode" };

  const sgHost = envVal("AUTO_REPAIR_SG_SSH_HOST");
  const sgUser = envVal("AUTO_REPAIR_SG_SSH_USER") || "root";
  const sgPort = Number(envVal("AUTO_REPAIR_SG_SSH_PORT")) || 22;
  const sgKeyEnv = envVal("AUTO_REPAIR_SG_SSH_KEY_ENV") || "AUTO_REPAIR_SG_SSH_KEY_B64";
  const sgRoot = safePath(envVal("AUTO_REPAIR_SG_PHASE1_ROOT"), "/root/lobster-phase1");
  const sgScript = resolveScriptPath(sgRoot, safePath(envVal("AUTO_REPAIR_SG_BACKUP_SCRIPT"), "scripts/backup-phase1.sh"));

  const euHost = envVal("AUTO_REPAIR_EU_SSH_HOST");
  const euUser = envVal("AUTO_REPAIR_EU_SSH_USER") || "root";
  const euPort = Number(envVal("AUTO_REPAIR_EU_SSH_PORT")) || 22;
  const euKeyEnv = envVal("AUTO_REPAIR_EU_SSH_KEY_ENV") || "AUTO_REPAIR_EU_SSH_KEY_B64";
  const euScript = safePath(envVal("AUTO_REPAIR_EU_BACKUP_SCRIPT"), "/root/scripts/backup-eu-stack.sh");

  const [sg, eu] = await Promise.all([
    sgHost
      ? statRemoteScript(sgHost, sgPort, sgUser, sgKeyEnv, sgScript, 5000)
      : Promise.resolve<ScriptProbeStatus>("unconfigured"),
    euHost
      ? statRemoteScript(euHost, euPort, euUser, euKeyEnv, euScript, 5000)
      : Promise.resolve<ScriptProbeStatus>("unconfigured"),
  ]);

  return { sg, eu };
}

// GAP-03 — GitHub repo accessibility + App installation check

interface GithubRepoCheck {
  repo_accessible: boolean | null;
  push_access: boolean | null;
  app_installed: boolean | null;
  note: string;
}

async function checkGithubRepoAndApp(owner: string, repo: string, token: string): Promise<GithubRepoCheck> {
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "x-github-api-version": "2022-11-28",
  };
  const settingsUrl = `https://github.com/${owner}/${repo}/settings/installations`;

  let repo_accessible: boolean | null = null;
  let push_access: boolean | null = null;
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data: unknown = await res.json().catch(() => ({}));
      repo_accessible = true;
      const perms = (data as Record<string, unknown>)?.permissions as Record<string, boolean> | undefined;
      push_access = perms ? perms.push === true || perms.admin === true : null;
    } else if (res.status === 404) {
      repo_accessible = false;
    }
    // 401/403: token error — leave as null
  } catch {
    // network error — leave as null
  }

  let app_installed: boolean | null = null;
  let note = `GitHub App installation cannot be verified with a PAT. Check manually: ${settingsUrl}`;

  if (repo_accessible === true) {
    try {
      const appRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/installation`, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      if (appRes.status === 200) {
        app_installed = true;
        note = `GitHub App installation confirmed on ${owner}/${repo}. Verify it is the Claude app: ${settingsUrl}`;
      } else if (appRes.status === 404) {
        app_installed = false;
        note = `No GitHub App installation found on ${owner}/${repo}. Install Claude GitHub App: ${settingsUrl}`;
      }
      // 401/403: PAT scope insufficient for this endpoint — keep null + default note
    } catch {
      // timeout or network error — keep null + default note
    }
  }

  return { repo_accessible, push_access, app_installed, note };
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
  const githubToken = envVal("AUTO_REPAIR_GITHUB_TOKEN") || envVal("GITHUB_TOKEN");
  const slackSigningConfigured = configured("SLACK_SIGNING_SECRET");
  const backupMode = backupWebhook ? "webhook" : sgSsh ? "ssh" : "missing";

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

  // GAP-01 + GAP-03: run probes in parallel, both advisory (do not affect ok)
  const [scriptProbe, githubCheck] = await Promise.all([
    probeBackupScripts(backupMode),
    githubToken
      ? checkGithubRepoAndApp(githubOwner, githubRepo, githubToken)
      : Promise.resolve<GithubRepoCheck>({
          repo_accessible: null,
          push_access: null,
          app_installed: null,
          note: "Configure AUTO_REPAIR_GITHUB_TOKEN or GITHUB_TOKEN to enable GitHub handoff.",
        }),
  ]);

  const ok = tableOk && mode === "normal" && backupConfigured && githubConfigured;

  return NextResponse.json(
    {
      ok,
      system_mode: mode,
      active_runs: activeRuns,
      table_ok: tableOk,
      table_error: tableError,
      backup_configured: backupConfigured,
      backup_mode: backupMode,
      sg_backup_configured: sgSsh,
      eu_backup_required: euRequired,
      eu_backup_configured: euSsh,
      backup_script_probe: scriptProbe,
      github_configured: githubConfigured,
      github_repo_target: githubConfigured ? { owner: githubOwner, repo: githubRepo } : null,
      github_repo_accessible: githubCheck.repo_accessible,
      github_push_access: githubCheck.push_access,
      github_app_installed: githubCheck.app_installed,
      github_app_advisory: githubCheck.note,
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
