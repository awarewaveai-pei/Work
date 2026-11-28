import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRepairIssue, postEscalationComment } from "../github";

// Contract between what next-admin posts to GitHub and what .github/workflows/auto-repair-claude.yml reacts to.
// 2026-11-28: the escalation comment lacked "@claude", so the workflow's issue_comment branch never ran and an
// escalated analysis_only run silently never produced a PR. Values are read from the workflow, never re-typed here.
// The host runs npm test inside the full /root/Work clone (sg-deploy.sh REPO_DIR), so the repo-root file exists there too.

const WORKFLOW = path.resolve(__dirname, "../../../../../../../../.github/workflows/auto-repair-claude.yml");
const yml = readFileSync(WORKFLOW, "utf8");

function captured(re: RegExp, what: string): string {
  const m = yml.match(re);
  if (!m) throw new Error(`auto-repair-claude.yml no longer has the ${what} condition this contract reads`);
  return m[1];
}

const REQUIRED_LABEL = captured(/contains\(github\.event\.issue\.labels\.\*\.name,\s*'([^']+)'\)/, "issue label");
const COMMENT_MENTION = captured(/contains\(github\.event\.comment\.body,\s*'([^']+)'\)/, "comment mention");
// claude-code-action acts only on text containing its trigger phrase; "@claude" is the action's default.
const ACTION_PHRASE = yml.match(/trigger_phrase:\s*["']?([^"'\n]+)["']?/)?.[1]?.trim() ?? "@claude";
// The action's own match (claude-code-action src/github/validation/trigger.ts): whole word, case-insensitive.
// Stricter than GitHub's contains(): "**@claude**" passes contains() but not this, and the action then does nothing.
function actionTriggers(text: string): boolean {
  const escaped = ACTION_PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escaped}([\\s.,!?;:]|$)`, "i").test(text);
}

const run = {
  id: "run-1",
  incident_id: "inc-1",
  source: "uptime_kuma",
  policy: "analysis_only",
  backup_ref: "bk-1",
  incident: { title: "site down", severity: "high", tags: {}, message: "timeout" },
} as any;

let posts: Array<{ url: string; body: any }>;

beforeEach(() => {
  posts = [];
  vi.stubEnv("AUTO_REPAIR_GITHUB_TOKEN", "test-token");
  vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
    posts.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 201, json: async () => ({ number: 7, html_url: "https://example.test/7" }) };
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("auto-repair workflow trigger contract", () => {
  it("workflow's comment condition and the action's trigger phrase agree", () => {
    expect(COMMENT_MENTION).toBe(ACTION_PHRASE);
  });

  it("a repair issue carries the label the workflow filters on and the phrase the action needs", async () => {
    const res = await createRepairIssue(run);
    expect(res.ok).toBe(true);
    expect(posts[0].body.labels).toContain(REQUIRED_LABEL);
    expect(actionTriggers(posts[0].body.body)).toBe(true);
  });

  it("an escalation comment satisfies the workflow's issue_comment condition", async () => {
    const res = await postEscalationComment({ owner: "o", repo: "r", issueNumber: 7, actor: "admin" });
    expect(res.ok).toBe(true);
    expect(posts[0].url).toMatch(/\/issues\/7\/comments$/);
    expect(posts[0].body.body).toContain(COMMENT_MENTION);
    expect(actionTriggers(posts[0].body.body)).toBe(true);
  });
});
