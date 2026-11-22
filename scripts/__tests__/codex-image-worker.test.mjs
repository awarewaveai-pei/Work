// node --test scripts/__tests__/codex-image-worker.test.mjs -- K2 of the AI subscription channel
// (agency-os/handoffs/2026-11-22-subscription-ai-channel/briefs/K2-worker.md). Every secret here is made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { claimBody, leaks, parseArgs, textCommand, textError, write } from "../codex-image-worker.mjs";

const FAKE_TOKEN = "fake-oauth-token-0123456789abcdefXYZ";

/** A throwaway Codex home under the OS temp folder with a made-up auth.json (write() refuses a home without one). */
function fakeCodexHome() {
  const dir = mkdtempSync(path.join(tmpdir(), "k2-codex-home-"));
  writeFileSync(path.join(dir, "auth.json"), JSON.stringify({ tokens: { access_token: "made-up-access-token-not-real-000" } }));
  return dir;
}

test("leaks: text containing a secret as a substring is caught; clean text is not", () => {
  assert.equal(leaks(`here it is: ${FAKE_TOKEN}.`, ["short-ignored-but-present", FAKE_TOKEN]), true);
  assert.equal(leaks("An ordinary article about tea.", [FAKE_TOKEN, ""]), false);
});

test("write: an answer containing a machine credential is dropped as sub_output_blocked", async () => {
  const run = async () => ({
    code: 0, out: "",
    stdout: JSON.stringify({ type: "result", subtype: "success", is_error: false, result: `Sure. ${FAKE_TOKEN}`,
      usage: { input_tokens: 10, output_tokens: 5 }, modelUsage: { "claude-haiku-x": { outputTokens: 5 } } }),
  });
  const job = { id: "j1", kind: "text", tool: "claude", cliModel: "haiku", system: "s", prompt: "p", timeLeftMs: 60_000 };
  assert.deepEqual(await write(job, { run, secrets: async () => [FAKE_TOKEN] }), { error: "sub_output_blocked" });
});

test("quota message → sub_quota_exhausted with the reset time (local clock)", () => {
  const r = textError("ERROR: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at Nov 24th, 2026 11:02 AM.");
  assert.equal(r.error, "sub_quota_exhausted");
  assert.equal(r.quotaResetsAt, new Date(2026, 10, 24, 11, 2).getTime());
});

test("model text about credits / rate limits in a run the worker killed → sub_worker_timeout, never a quota block", async () => {
  const run = async () => ({ code: null, timedOut: true, stderr: "",
    stdout: '{"type":"item.completed","item":{"type":"agent_message","text":"Credit card credits and the API rate limit"}}' });
  const job = { id: "j2", kind: "text", tool: "codex", cliModel: null, system: "s", prompt: "p", timeLeftMs: 60_000 };
  assert.deepEqual(await write(job, { run, secrets: async () => [], codexHome: fakeCodexHome() }), { error: "sub_worker_timeout" });
});

test("a real Codex usage-limit error event → sub_quota_exhausted with quotaResetsAt", async () => {
  const run = async () => ({ code: 1, timedOut: false, stderr: "",
    stdout: '{"type":"error","message":"You\'ve hit your usage limit. try again at Nov 24th, 2026 11:02 AM."}\n{"type":"turn.failed","error":{"message":"usage limit"}}' });
  const job = { id: "j3", kind: "text", tool: "codex", cliModel: null, system: "s", prompt: "p", timeLeftMs: 60_000 };
  assert.deepEqual(await write(job, { run, secrets: async () => [], codexHome: fakeCodexHome() }),
    { error: "sub_quota_exhausted", quotaResetsAt: new Date(2026, 10, 24, 11, 2).getTime() });
});

test("a CLI missing on the machine is not in the claim's tools; schedule lane defaults", () => {
  assert.deepEqual(claimBody({ codex: true, claude: false }).tools, ["codex"]);
  assert.deepEqual(claimBody({ codex: false, claude: true }).tools, ["claude"]);
  assert.deepEqual(claimBody({ codex: true, claude: true }).tools, ["codex", "claude"]);
  const a = parseArgs(["node", "w.mjs", "--lane", "schedule"]);
  assert.equal(a.idleMs, 0);
  assert.equal(a.useLock, false);
  assert.deepEqual(parseArgs(["node", "w.mjs"]), { lane: "owner", once: false, idleMs: 30 * 60_000, useLock: true });
});

test("claude text job: no ANTHROPIC_API_KEY in the child, tools off, nothing of the job on the command line", () => {
  const job = { tool: "claude", cliModel: "haiku", system: "SYSTEM-TEXT", prompt: "PROMPT-TEXT" };
  const c = textCommand(job, "/tmp/x.system.txt", { ANTHROPIC_API_KEY: "sk-fake-not-real-000000", PATH: "/bin" });
  assert.equal("ANTHROPIC_API_KEY" in c.env, false);
  assert.equal(c.env.PATH, "/bin");
  assert.equal(c.args[c.args.indexOf("--tools") + 1], "");
  assert.equal(c.args.some((a) => a.includes("SYSTEM-TEXT") || a.includes("PROMPT-TEXT")), false);
  assert.equal(c.input, "PROMPT-TEXT");
});
