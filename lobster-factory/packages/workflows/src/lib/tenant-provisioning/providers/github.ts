import type { ProvisioningContext, ProvisioningHints, ProviderStepResult } from "../types";
import { requiredEnv } from "../env";
import { readJsonSafe, summarizeApiError } from "../http";

/**
 * Creates a **private** GitHub repository using a PAT / fine-grained token with repo scope (org: org.repo scope).
 * Env: TENANT_PROVISION_GITHUB_TOKEN or GITHUB_TOKEN; optional TENANT_PROVISION_GITHUB_ORG (otherwise user.account repos).
 */
export async function provisionGithub(ctx: ProvisioningContext, hints?: ProvisioningHints): Promise<ProviderStepResult> {
  const token = requiredEnv(["TENANT_PROVISION_GITHUB_TOKEN", "GITHUB_TOKEN", "GITHUB_PROVISIONING_TOKEN"]);
  if (!token) {
    return {
      ok: false,
      error:
        "GitHub: set TENANT_PROVISION_GITHUB_TOKEN (or GITHUB_TOKEN) with repo creation scope on the Trigger worker.",
    };
  }

  const org = requiredEnv(["TENANT_PROVISION_GITHUB_ORG", "GITHUB_ORG"]);
  const short = ctx.organizationId.replace(/-/g, "").slice(0, 10);
  const name =
    hints?.githubRepoName
      ?.toLowerCase()
      .replace(/[^a-z0-9._-]/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90) || `tenant-${short}`;

  const url = org
    ? `https://api.github.com/orgs/${encodeURIComponent(org)}/repos`
    : `https://api.github.com/user/repos`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      private: true,
      description: hints?.githubRepoDescription ?? `AwareWave tenant ${ctx.organizationId}`,
      auto_init: true,
    }),
  });

  const body = await readJsonSafe(res);
  if (!res.ok) {
    return { ok: false, error: `GitHub create repo: ${summarizeApiError(res.status, body)}` };
  }

  const repo = body as {
    id?: number;
    html_url?: string;
    full_name?: string;
    default_branch?: string;
    name?: string;
  };

  return {
    ok: true,
    status: "active",
    secretRef: `vault://tenant/${ctx.organizationId}/github_customer_pat`,
    externalHint: repo.html_url ?? `https://github.com/${repo.full_name ?? name}`,
    apiMetadata: {
      customer_email: ctx.customerEmail,
      ...(ctx.googleSubject ? { google_sub: ctx.googleSubject } : {}),
      github_repo_id: repo.id ?? null,
      github_full_name: repo.full_name ?? null,
      github_html_url: repo.html_url ?? null,
      github_default_branch: repo.default_branch ?? "main",
      provisioned_at: new Date().toISOString(),
      note: "System PAT created repo; customer OAuth PAT (if any) belongs in vault at secret_ref for CI/CD.",
    },
  };
}
