import type { RepairRunWithIncident } from "./types";
import { repairPolicyLabel } from "./policy";

interface GithubIssueResult {
  ok: boolean;
  owner?: string;
  repo?: string;
  number?: number;
  url?: string;
  error?: string;
  detail?: unknown;
}

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export function resolveGithubTarget(run: RepairRunWithIncident): { owner: string; repo: string } {
  const raw = run.incident?.tags ?? {};
  const owner =
    String((raw as any).github_owner ?? "") ||
    env("AUTO_REPAIR_GITHUB_OWNER") ||
    env("GITHUB_REPOSITORY_OWNER") ||
    "awarewaveai-pei";
  const repo =
    String((raw as any).github_repo ?? "") ||
    env("AUTO_REPAIR_GITHUB_REPO") ||
    (env("GITHUB_REPOSITORY").split("/")[1] ?? "") ||
    "Work";
  return { owner, repo };
}

export async function createRepairIssue(run: RepairRunWithIncident): Promise<GithubIssueResult> {
  const token = env("AUTO_REPAIR_GITHUB_TOKEN") || env("GITHUB_TOKEN");
  if (!token) return { ok: false, error: "github_token_not_configured" };

  const { owner, repo } = resolveGithubTarget(run);
  const policy = repairPolicyLabel(run.policy);
  const title = `[auto-repair][${run.source}] ${run.incident?.title ?? run.incident_id}`;
  const labels = ["auto-repair", run.source, run.policy].filter(Boolean);
  const body = buildIssueBody(run);

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
    },
    body: JSON.stringify({ title, body, labels }),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false, owner, repo, error: `github_${res.status}`, detail: payload };
  }

  return {
    ok: true,
    owner,
    repo,
    number: Number(payload?.number),
    url: String(payload?.html_url ?? ""),
  };

  function buildIssueBody(r: RepairRunWithIncident): string {
    const incident = r.incident;
    const urlBase = env("OPS_INBOX_PUBLIC_URL") || env("NEXT_PUBLIC_APP_URL") || "https://app.aware-wave.com";
    const incidentUrl = `${urlBase.replace(/\/$/, "")}/ops/inbox/${r.incident_id}`;
    const repairUrl = `${urlBase.replace(/\/$/, "")}/ops/repairs`;
    return [
      "@claude",
      "",
      "### Auto-Repair Request",
      "",
      `Policy: ${policy}`,
      `Repair Run: ${r.id}`,
      `Incident: ${r.incident_id}`,
      `Source: ${r.source}`,
      `Severity: ${incident?.severity ?? "unknown"}`,
      `Service: ${incident?.service ?? "(host-level)"}`,
      `Environment: ${incident?.environment ?? "production"}`,
      `Backup: ${r.backup_ref ?? "(missing)"}`,
      "",
      "### Incident",
      "",
      `Title: ${incident?.title ?? "(unknown)"}`,
      "",
      incident?.message ?? "",
      "",
      `Ops Inbox: ${incidentUrl}`,
      `Repair Center: ${repairUrl}`,
      "",
      "### Required Output",
      "",
      "Please analyze this incident and open a PR only when the fix is code-scoped and safe.",
      "Every PR must include a Chinese summary with: 問題 / 原因 / 修法 / 風險 / 建議.",
      "",
      "### Guardrails",
      "",
      "- Do not change secrets, env files, auth, payment, permissions, migrations, nginx, Dockerfile, or docker-compose.",
      "- Do not deploy production.",
      "- Do not hide errors with empty catch blocks.",
      "- If this is not code-scoped, leave an analysis-only comment and do not open a PR.",
    ].join("\n");
  }
}

export async function postEscalationComment(args: {
  owner: string;
  repo: string;
  issueNumber: number;
  actor: string;
}): Promise<{ ok: boolean; error?: string }> {
  const token = env("AUTO_REPAIR_GITHUB_TOKEN") || env("GITHUB_TOKEN");
  if (!token) return { ok: false, error: "github_token_not_configured" };

  const body = [
    `🔼 **Escalation by ${args.actor}**`,
    "",
    "This repair run has been escalated from **analysis_only** to **auto_repair**.",
    "The responsible operator has confirmed a code-regression root cause.",
    "You may now proceed to generate a targeted fix PR following the original guardrails.",
  ].join("\n");

  const res = await fetch(
    `https://api.github.com/repos/${args.owner}/${args.repo}/issues/${args.issueNumber}/comments`,
    {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({ body }),
    },
  );

  if (!res.ok) return { ok: false, error: `github_comment_${res.status}` };
  return { ok: true };
}
