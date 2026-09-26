import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseWriteClient } from "@/lib/supabase-server";
import { checkProductionChangeAllowed } from "@/lib/system-modes/production-change-gate";
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
  hostKeyFingerprint?: string,
): Promise<ScriptProbeStatus> {
  const privateKey = readPrivateKeyFromEnv(keyEnvName);
  // Fail-closed on the host key, same rule and same reasoning as ssh.ts's readSshTarget()
  // (WORKLOG 2026-09-23 續116, codex-review round 3): this probe builds its own SshTarget-shaped
  // object instead of going through readSshTarget, so it needs the identical guard independently
  // — connectSsh() would otherwise still accept any host key for a probe missing its fingerprint.
  if (!host || !privateKey || !hostKeyFingerprint) return "unconfigured";

  const run = async (): Promise<ScriptProbeStatus> => {
    const conn = await connectSsh({ host, port, username, privateKey, hostKeyFingerprint });
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
  const sgHostKeyFingerprint = envVal("AUTO_REPAIR_SG_SSH_HOST_KEY_SHA256") || undefined;
  const sgRoot = safePath(envVal("AUTO_REPAIR_SG_PHASE1_ROOT"), "/root/lobster-phase1");
  const sgScript = resolveScriptPath(sgRoot, safePath(envVal("AUTO_REPAIR_SG_BACKUP_SCRIPT"), "scripts/backup-phase1.sh"));

  const euHost = envVal("AUTO_REPAIR_EU_SSH_HOST");
  const euUser = envVal("AUTO_REPAIR_EU_SSH_USER") || "root";
  const euPort = Number(envVal("AUTO_REPAIR_EU_SSH_PORT")) || 22;
  const euKeyEnv = envVal("AUTO_REPAIR_EU_SSH_KEY_ENV") || "AUTO_REPAIR_EU_SSH_KEY_B64";
  const euHostKeyFingerprint = envVal("AUTO_REPAIR_EU_SSH_HOST_KEY_SHA256") || undefined;
  const euScript = safePath(envVal("AUTO_REPAIR_EU_BACKUP_SCRIPT"), "/root/scripts/backup-eu-stack.sh");

  const [sg, eu] = await Promise.all([
    sgHost
      ? statRemoteScript(sgHost, sgPort, sgUser, sgKeyEnv, sgScript, 5000, sgHostKeyFingerprint)
      : Promise.resolve<ScriptProbeStatus>("unconfigured"),
    euHost
      ? statRemoteScript(euHost, euPort, euUser, euKeyEnv, euScript, 5000, euHostKeyFingerprint)
      : Promise.resolve<ScriptProbeStatus>("unconfigured"),
  ]);

  return { sg, eu };
}

// GAP-04 — VPS auto-reboot config probe (B-Minimal, 2026-05-23)
// Policy SSOT: lobster-factory/infra/hetzner-phase1-core/auto-reboot/52awarewave-auto-reboot.conf
// Runbook: runbooks/VPS-AUTO-REBOOT-RUNBOOK.md
//
// Schedule: 20:00 UTC = 04:00 Asia/Taipei daily, only when /var/run/reboot-required exists.
// Probes both SG and EU /etc/apt/apt.conf.d/52awarewave-auto-reboot existence via the
// same SSH credentials used by GAP-01 (backup script probe). Returns "skipped" when
// backup_mode != ssh to mirror GAP-01 semantics — we don't introduce a new SSH path.

type AutoRebootProbeStatus = "ok" | "missing" | "ssh_error" | "unconfigured" | "skipped";

interface AutoRebootProbe {
  enabled_policy: true;
  schedule_utc: "20:00";
  schedule_local_tpe: "04:00";
  ssot_path: "lobster-factory/infra/hetzner-phase1-core/auto-reboot/52awarewave-auto-reboot.conf";
  runbook_path: "runbooks/VPS-AUTO-REBOOT-RUNBOOK.md";
  sg: AutoRebootProbeStatus;
  eu: AutoRebootProbeStatus;
}

async function probeAutoRebootConfig(backupMode: string): Promise<AutoRebootProbe> {
  const policyShape = {
    enabled_policy: true as const,
    schedule_utc: "20:00" as const,
    schedule_local_tpe: "04:00" as const,
    ssot_path: "lobster-factory/infra/hetzner-phase1-core/auto-reboot/52awarewave-auto-reboot.conf" as const,
    runbook_path: "runbooks/VPS-AUTO-REBOOT-RUNBOOK.md" as const,
  };
  if (backupMode !== "ssh") {
    return { ...policyShape, sg: "skipped", eu: "skipped" };
  }

  const sgHost = envVal("AUTO_REPAIR_SG_SSH_HOST");
  const sgUser = envVal("AUTO_REPAIR_SG_SSH_USER") || "root";
  const sgPort = Number(envVal("AUTO_REPAIR_SG_SSH_PORT")) || 22;
  const sgKeyEnv = envVal("AUTO_REPAIR_SG_SSH_KEY_ENV") || "AUTO_REPAIR_SG_SSH_KEY_B64";

  const euHost = envVal("AUTO_REPAIR_EU_SSH_HOST");
  const euUser = envVal("AUTO_REPAIR_EU_SSH_USER") || "root";
  const euPort = Number(envVal("AUTO_REPAIR_EU_SSH_PORT")) || 22;
  const euKeyEnv = envVal("AUTO_REPAIR_EU_SSH_KEY_ENV") || "AUTO_REPAIR_EU_SSH_KEY_B64";
  const sgHostKeyFingerprint = envVal("AUTO_REPAIR_SG_SSH_HOST_KEY_SHA256") || undefined;
  const euHostKeyFingerprint = envVal("AUTO_REPAIR_EU_SSH_HOST_KEY_SHA256") || undefined;

  const target = "/etc/apt/apt.conf.d/52awarewave-auto-reboot";
  const probeFor = async (
    host: string,
    port: number,
    username: string,
    keyEnvName: string,
    hostKeyFingerprint?: string,
  ): Promise<AutoRebootProbeStatus> => {
    const status = await statRemoteScript(host, port, username, keyEnvName, target, 5000, hostKeyFingerprint);
    if (status === "not_found") return "missing";
    return status as AutoRebootProbeStatus;
  };

  const [sg, eu] = await Promise.all([
    sgHost
      ? probeFor(sgHost, sgPort, sgUser, sgKeyEnv, sgHostKeyFingerprint)
      : Promise.resolve<AutoRebootProbeStatus>("unconfigured"),
    euHost
      ? probeFor(euHost, euPort, euUser, euKeyEnv, euHostKeyFingerprint)
      : Promise.resolve<AutoRebootProbeStatus>("unconfigured"),
  ]);

  return { ...policyShape, sg, eu };
}

// GAP-03 — GitHub repo accessibility + App status (three-tier: env var → comments → unverified)

type GithubAppStatus = "confirmed_by_operator" | "auto_detected" | "unverified" | "no_issues" | "error";

interface GithubRepoCheck {
  repo_accessible: boolean | null;
  push_access: boolean | null;
  app_installed: boolean | null; // deprecated: always null; kept for backward compat
  app_status: GithubAppStatus;
  note: string;
}

async function checkGithubRepoAndApp(owner: string, repo: string, token: string): Promise<GithubRepoCheck> {
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "x-github-api-version": "2022-11-28",
  };
  const settingsUrl = `https://github.com/${owner}/${repo}/settings/installations`;

  // Step 1: repo accessibility (always needed for repo_accessible + push_access)
  let repo_accessible: boolean | null = null;
  let push_access: boolean | null = null;
  let hasIssues = true; // assume true unless API says otherwise
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data: unknown = await res.json().catch(() => ({}));
      repo_accessible = true;
      const d = data as Record<string, unknown>;
      const perms = d?.permissions as Record<string, boolean> | undefined;
      push_access = perms ? perms.push === true || perms.admin === true : null;
      if (typeof d?.open_issues_count === "number") hasIssues = d.open_issues_count > 0;
    } else if (res.status === 404) {
      repo_accessible = false;
    }
    // 401/403: token error — repo_accessible stays null
  } catch {
    // network error — repo_accessible stays null
  }

  // Step 2: env var — operator explicit confirmation (authoritative, no further API call needed)
  if (process.env.AUTO_REPAIR_GITHUB_APP_CONFIRMED?.trim().toLowerCase() === "true") {
    return {
      repo_accessible,
      push_access,
      app_installed: null,
      app_status: "confirmed_by_operator",
      note: `Claude GitHub App confirmed by operator for ${owner}/${repo}.`,
    };
  }

  // Repo not accessible — cannot proceed with comments check
  if (repo_accessible !== true) {
    return {
      repo_accessible,
      push_access,
      app_installed: null,
      app_status: "error",
      note: `Cannot reach ${owner}/${repo}. Check AUTO_REPAIR_GITHUB_TOKEN permissions.`,
    };
  }

  // No issues — cannot detect bot activity via comments
  if (!hasIssues) {
    return {
      repo_accessible: true,
      push_access,
      app_installed: null,
      app_status: "no_issues",
      note: `No issues in ${owner}/${repo} to detect bot activity. Set AUTO_REPAIR_GITHUB_APP_CONFIRMED=true after verifying app installation: ${settingsUrl}`,
    };
  }

  // Step 3: comments API — look for claude bot activity (indirect but real signal)
  try {
    const commentsRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/comments?per_page=20&sort=created&direction=desc`,
      { headers, signal: AbortSignal.timeout(5000) },
    );
    if (commentsRes.ok) {
      const comments: unknown = await commentsRes.json().catch(() => []);
      const botFound =
        Array.isArray(comments) &&
        (comments as unknown[]).some((c) => {
          const user = (c as Record<string, unknown>)?.user as Record<string, unknown> | undefined;
          return (
            user?.type === "Bot" &&
            typeof user?.login === "string" &&
            user.login.toLowerCase().includes("claude")
          );
        });
      if (botFound) {
        return {
          repo_accessible: true,
          push_access,
          app_installed: null,
          app_status: "auto_detected",
          note: `Claude GitHub App auto-detected via recent bot activity in ${owner}/${repo}. Set AUTO_REPAIR_GITHUB_APP_CONFIRMED=true to permanently confirm: ${settingsUrl}`,
        };
      }
    }
  } catch {
    // timeout or network error — fall through to unverified
  }

  return {
    repo_accessible: true,
    push_access,
    app_installed: null,
    app_status: "unverified",
    note: `Claude GitHub App not detected in ${owner}/${repo}. Install it and trigger a repair (bot will comment), or set AUTO_REPAIR_GITHUB_APP_CONFIRMED=true: ${settingsUrl}`,
  };
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

// P6 fix: the SSH script/auto-reboot probes (4 SSH connections) + GitHub API calls (2)
// used to run on EVERY GET. This endpoint is public (nginx health location) and the Repair
// Center page is force-dynamic, so each page load / monitor poll fired 4 fresh SSH connects —
// heavy, and a DoS lever now that the route is reachable. Cache only the expensive probes for
// PROBE_TTL_MS; the cheap, liveness-relevant bits (system_mode, active_runs) stay real-time.
interface ExpensiveProbes {
  scriptProbe: BackupScriptProbe;
  githubCheck: GithubRepoCheck;
  autoRebootProbe: AutoRebootProbe;
}
const PROBE_TTL_MS = 60_000;
let probeCache: { at: number; data: ExpensiveProbes } | null = null;

async function getExpensiveProbes(
  backupMode: string,
  githubToken: string,
  githubOwner: string,
  githubRepo: string,
): Promise<{ probes: ExpensiveProbes; cached: boolean; ageMs: number }> {
  const now = Date.now();
  if (probeCache && now - probeCache.at < PROBE_TTL_MS) {
    return { probes: probeCache.data, cached: true, ageMs: now - probeCache.at };
  }
  const [scriptProbe, githubCheck, autoRebootProbe] = await Promise.all([
    probeBackupScripts(backupMode),
    githubToken
      ? checkGithubRepoAndApp(githubOwner, githubRepo, githubToken)
      : Promise.resolve<GithubRepoCheck>({
          repo_accessible: null,
          push_access: null,
          app_installed: null,
          app_status: "error",
          note: "Configure AUTO_REPAIR_GITHUB_TOKEN or GITHUB_TOKEN to enable GitHub handoff.",
        }),
    probeAutoRebootConfig(backupMode),
  ]);
  const data: ExpensiveProbes = { scriptProbe, githubCheck, autoRebootProbe };
  probeCache = { at: now, data };
  return { probes: data, cached: false, ageMs: 0 };
}

export async function GET() {
  const supabase = getSupabaseServerClient();
  // Same client the repair paths gate with: the anon fallback reads [] under RLS and would show 'normal'.
  const { mode } = await checkProductionChangeAllowed(getSupabaseWriteClient(), null);
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

  // GAP-01/03/04 (SSH + GitHub) are expensive and now served behind a TTL cache (P6).
  const { probes, cached: probeCached, ageMs: probeAgeMs } = await getExpensiveProbes(
    backupMode,
    githubToken,
    githubOwner,
    githubRepo,
  );
  const { scriptProbe, githubCheck, autoRebootProbe } = probes;

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
      probe_cache: { cached: probeCached, age_ms: probeAgeMs, ttl_ms: PROBE_TTL_MS },
      github_configured: githubConfigured,
      github_repo_target: githubConfigured ? { owner: githubOwner, repo: githubRepo } : null,
      github_repo_accessible: githubCheck.repo_accessible,
      github_push_access: githubCheck.push_access,
      github_app_installed: githubCheck.app_installed, // deprecated: always null
      github_app_status: githubCheck.app_status,
      github_app_advisory: githubCheck.note,
      slack_signing_configured: slackSigningConfigured,
      slack_interactive_ready: slackSigningConfigured,
      web_ui_ready: ok,
      deploy_mode: "manual_sg_deploy_only",
      policy_catalog_count: REPAIR_SOURCE_POLICIES.length,
      policy_catalog_text_ok: policyCatalogTextOk(),
      source_policies: REPAIR_SOURCE_POLICIES.map(({ source, label, policy, family }) => ({ source, label, policy, family })),
      auto_reboot: autoRebootProbe,
    },
    { status: ok ? 200 : 503 },
  );
}
