// Codex host: payloads shaped per learn.chatgpt.com/docs/hooks must reach the
// same real rules (real manifest) with the same verdicts a Claude payload gets.
// Every runner spawn pins CODEX_HOME to a tmp dir so the heartbeat never
// touches the real ~/.codex.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import { runNode, freshSid, makeGitRepo, HOOKS_DIR } from './helpers.mjs';

const require = createRequire(import.meta.url);
const adapter = require(path.join(HOOKS_DIR, 'lib', 'codex-adapter.js'));
const RUNNER = path.join(HOOKS_DIR, 'runner.js');
const NON_REPO = fs.mkdtempSync(path.join(os.tmpdir(), 'hooktest-norepo-'));

function codex(event, payload, opts = {}) {
  const codexHome = opts.codexHome || fs.mkdtempSync(path.join(os.tmpdir(), 'hooktest-codexhome-'));
  const r = runNode(RUNNER, payload, {
    args: [event, '--host=codex'],
    cwd: opts.cwd || NON_REPO,
    env: { CODEX_HOME: codexHome },
  });
  return { ...r, codexHome };
}

// A block reaches Claude as exit 2 and Codex as a JSON decision on stdout
// (Codex 0.155.1 ignores exit 2 -- proven by a live probe on 2026-09-20).
function assertDenied(r, message) {
  if (r.status === 2) return;
  let decision = null;
  try { decision = JSON.parse(r.stdout); } catch { /* falls through to the failure below */ }
  const denied = decision
    && ((decision.hookSpecificOutput && decision.hookSpecificOutput.permissionDecision === 'deny')
      || decision.decision === 'block');
  assert.ok(denied, `expected a deny decision, got status=${r.status} stdout=${r.stdout} stderr=${r.stderr} ${message || ''}`);
}

const DEPLOY = 'ssh -p 58122 ubuntu@145.239.195.47 "sudo /root/lobster-phase1/scripts/sg-deploy.sh next-admin"';

// ---------------------------------------------------------------- adapter units
test('adapter: apply_patch → Edit with every Add/Update/Delete/Move path, relative resolved against cwd', () => {
  const patch = [
    '*** Begin Patch',
    '*** Add File: a/new.txt',
    '+x',
    '*** Update File: D:\\Work\\b.md',
    '*** Move to: c/renamed.md',
    '*** Delete File: d.txt',
    '*** End Patch',
  ].join('\n');
  const { payload } = adapter.toCanonical('PreToolUse', {
    tool_name: 'apply_patch', cwd: '/repo', tool_input: { command: patch },
  });
  assert.equal(payload.tool_name, 'Edit');
  const files = payload.tool_input.edits.map((e) => e.file_path.replace(/\\/g, '/'));
  assert.ok(files.some((f) => f.endsWith('/repo/a/new.txt')));
  assert.ok(files.some((f) => /D:\/Work\/b\.md$/.test(f)));
  assert.ok(files.some((f) => f.endsWith('/repo/c/renamed.md')));
  assert.ok(files.some((f) => f.endsWith('/repo/d.txt')));
  assert.equal(payload.tool_input.file_path, payload.tool_input.edits[0].file_path);
});

test('adapter: shell aliases → Bash, cmd/array command normalised to a string', () => {
  const a = adapter.toCanonical('PreToolUse', { tool_name: 'exec_command', tool_input: { cmd: 'git status' } });
  assert.equal(a.payload.tool_name, 'Bash');
  assert.equal(a.payload.tool_input.command, 'git status');
  const b = adapter.toCanonical('PreToolUse', { tool_name: 'Bash', tool_input: { command: ['git', 'push'] } });
  assert.equal(b.payload.tool_input.command, 'git push');
});

test('adapter: spawn_agent args map onto the Claude Agent fields rules read', () => {
  const { payload } = adapter.toCanonical('PreToolUse', {
    tool_name: 'spawn_agent', tool_input: { agent_type: 'critic', message: 'review X', task_name: 'rev' },
  });
  assert.equal(payload.tool_name, 'Agent');
  assert.equal(payload.tool_input.subagent_type, 'critic');
  assert.equal(payload.tool_input.prompt, 'review X');
  assert.equal(payload.tool_input.description, 'rev');
});

test('adapter: PostToolUseFailure only on an explicit structured failure signal', () => {
  // Codex today sends a plain string with the exit code stripped (openai/codex#34289):
  // it must stay PostToolUse -- guessing from text would poison repeat-failure-guard.
  assert.equal(adapter.toCanonical('PostToolUse', { tool_name: 'Bash', tool_response: 'cat: x: No such file or directory\n' }).event, 'PostToolUse');
  assert.equal(adapter.toCanonical('PostToolUse', { tool_name: 'Bash', tool_response: '' }).event, 'PostToolUse');
  // Forward-compatible: a structured response with a non-zero exit is a failure.
  assert.equal(adapter.toCanonical('PostToolUse', { tool_name: 'Bash', tool_response: { exit_code: 2 } }).event, 'PostToolUseFailure');
  assert.equal(adapter.toCanonical('PostToolUse', { tool_name: 'Bash', tool_response: { success: false } }).event, 'PostToolUseFailure');
  assert.equal(adapter.toCanonical('PostToolUse', { tool_name: 'Bash', tool_response: { exit_code: 0 } }).event, 'PostToolUse');
});

test('adapter: does not alias tool_response to tool_output (log-error stays inert on both hosts)', () => {
  const { payload } = adapter.toCanonical('PostToolUse', { tool_name: 'Bash', tool_response: 'x' });
  assert.equal(payload.tool_output, undefined);
});

// ---------------------------------------------------------------- runner + real rules
test('codex host: unmarked prod deploy over SSH is BLOCKED (high-risk-bash-warn)', () => {
  const r = codex('PreToolUse', { session_id: freshSid('cx'), turn_id: 't', tool_name: 'Bash', tool_input: { command: DEPLOY } });
  assertDenied(r);
  assert.match(r.stderr, /HIGH-RISK OPERATION BLOCKED/);
  // stdout must be empty or a JSON decision -- never the echoed payload.
  assert.doesNotMatch(r.stdout, /tool_input|session_id/);
  if (r.stdout.trim()) JSON.parse(r.stdout);
});

test('codex host: exec_command alias reaches the same Bash gates', () => {
  const r = codex('PreToolUse', { session_id: freshSid('cx'), tool_name: 'exec_command', tool_input: { cmd: 'rm -rf /tmp/x' } });
  assertDenied(r);
});

test('codex host: apply_patch onto a .env file is BLOCKED (sensitive-file-block)', () => {
  const patch = '*** Begin Patch\n*** Add File: config/.env\n+KEY=1\n*** End Patch';
  const r = codex('PreToolUse', { session_id: freshSid('cx'), tool_name: 'apply_patch', tool_input: { command: patch } });
  assertDenied(r);
  assert.match(r.stderr, /sensitive file/);
});

test('codex host: first apply_patch in a repo is BLOCKED once by git-log-injector, re-issue passes', () => {
  const repo = makeGitRepo();
  const sid = freshSid('cxgl');
  const patch = '*** Begin Patch\n*** Add File: note.txt\n+hi\n*** End Patch';
  const payload = { session_id: sid, cwd: repo, tool_name: 'apply_patch', tool_input: { command: patch } };
  const first = codex('PreToolUse', payload, { cwd: repo });
  assertDenied(first);
  assert.match(first.stderr, /GIT LOG/);
  const second = codex('PreToolUse', payload, { cwd: repo });
  assert.equal(second.status, 0, second.stderr);
});

test('codex host: if Codex exposes a structured exit_code, repeated failures trip repeat-failure-guard on the third try', () => {
  const sid = freshSid('cxrf');
  const cmd = 'python build.py --codex-probe';
  const fail = { session_id: sid, tool_name: 'Bash', tool_input: { command: cmd }, tool_response: { exit_code: 1 } };
  codex('PostToolUse', fail);
  codex('PostToolUse', fail);
  const third = codex('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: cmd } });
  assertDenied(third);
  assert.match(third.stderr, /repeat-failure-guard/);
});

test('codex host: successful tool events never echo the payload to stdout', () => {
  const r = codex('PostToolUse', {
    session_id: freshSid('cx'), tool_name: 'Bash', tool_input: { command: 'echo secret-marker' },
    tool_response: { exit_code: 0, output: 'secret-marker' },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /secret-marker/);
});

test('codex host: heartbeat records execution with key names only, never values', () => {
  const r = codex('SessionStart', { session_id: freshSid('cxhb'), source: 'startup', secret_field: 'must-not-persist' });
  assert.equal(r.status, 0, r.stderr);
  const hb = JSON.parse(fs.readFileSync(path.join(r.codexHome, 'awarewave-hook-heartbeat.json'), 'utf8'));
  assert.equal(hb.events.SessionStart.count, 1);
  assert.ok(hb.events.SessionStart.payload_keys.includes('secret_field'));
  assert.doesNotMatch(JSON.stringify(hb), /must-not-persist/);
});

test('codex host: heartbeat records the tool_response TYPE so the upstream shape can be confirmed live', () => {
  const r = codex('PostToolUse', { session_id: freshSid('cxhbt'), tool_name: 'Bash', tool_input: { command: 'echo x' }, tool_response: 'x\n' });
  assert.equal(r.status, 0, r.stderr);
  const hb = JSON.parse(fs.readFileSync(path.join(r.codexHome, 'awarewave-hook-heartbeat.json'), 'utf8'));
  assert.equal(hb.events.PostToolUse.tool_response_type, 'string');
});

// ---------------------------------------------------------------- Claude permissions.deny mirrored for Codex
for (const cmd of ['git checkout -b feature-x', 'git switch -c feature-x', 'git branch', 'git reset --hard origin/main', 'git clean -fdx', 'sudo systemctl restart nginx', 'git push --force origin main', 'cd sub; git branch -D old']) {
  test(`codex host: Claude deny list enforced -> ${cmd}`, () => {
    const r = codex('PreToolUse', { session_id: freshSid('cxdeny'), tool_name: 'Bash', tool_input: { command: cmd } });
    assertDenied(r, cmd);
    assert.match(r.stderr, /permission-deny-mirror|BLOCKED/);
  });
}

// Windows Codex wraps every shell call: `"C:\...\powershell.exe" -Command '<cmd>'`.
// A live probe on 2026-09-20 showed `git commit --no-verify` sailing through because
// the rules only saw the wrapper.
const PS = '"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"';
for (const [label, cmd, expect] of [
  ['powershell -Command git --no-verify', `${PS} -Command 'git commit --no-verify -m probe'`, /--no-verify is not allowed/],
  ['powershell -Command deny-listed branch', `${PS} -Command 'git checkout -b feature-x'`, /permission-deny-mirror/],
  ['powershell -Command double quotes', `powershell.exe -NoProfile -Command "git branch -D old"`, /permission-deny-mirror/],
  ['pwsh -Command rm -rf', `pwsh -Command 'rm -rf /tmp/x'`, /rm -rf is dangerous/],
  ['cmd /c deny-listed', `cmd.exe /d /s /c "git reset --hard origin/main"`, /permission-deny-mirror/],
  ['powershell -Command high-risk ssh', `${PS} -Command 'ssh -p 58122 ubuntu@145.239.195.47 "sudo /root/lobster-phase1/scripts/sg-deploy.sh next-admin"'`, /HIGH-RISK/],
]) {
  test(`codex host: wrapped command is unwrapped before matching -> ${label}`, () => {
    const r = codex('PreToolUse', { session_id: freshSid('cxwrap'), tool_name: 'Bash', tool_input: { command: cmd } });
    assertDenied(r, cmd);
    assert.match(r.stderr, expect);
  });
}

test('claude host: wrapper unwrapping also applies (same runner, same rules)', () => {
  const r = runNode(RUNNER, { session_id: freshSid('clwrap'), tool_name: 'Bash', tool_input: { command: `${PS} -Command 'git commit --no-verify -m x'` } }, {
    args: ['PreToolUse'], cwd: NON_REPO, env: { CODEX_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'hooktest-codexhome-')) },
  });
  assert.equal(r.status, 2, r.stderr);
});

test('codex host: a wrapper around an innocent command still passes', () => {
  const r = codex('PreToolUse', { session_id: freshSid('cxwrapok'), tool_name: 'Bash', tool_input: { command: `${PS} -Command 'git status --short'` } });
  assert.equal(r.status, 0, r.stderr);
});

test('codex host: allowed git commands are not caught by the deny mirror', () => {
  for (const cmd of ['git status', 'git log --oneline -5', 'git push origin main', 'git reset --soft HEAD~1']) {
    const r = codex('PreToolUse', { session_id: freshSid('cxallow'), tool_name: 'Bash', tool_input: { command: cmd } });
    assert.doesNotMatch(r.stderr, /permission-deny-mirror/, cmd);
  }
});

// Claude's matcher treats a quoted argument as one word: these run ssh / git, not sudo.
// The first is the command that blocked a read-only diagnosis on 2026-10-26.
const REMOTE_SUDO_READ = "ssh -p 58122 ubuntu@145.239.195.47 'sudo tail -n 20 /var/log/routine-watchdog.log; sudo stat -c %a /root/Work/scripts/routine-output-watchdog.sh'";
for (const [label, cmd] of [
  ['remote sudo inside ssh quotes', REMOTE_SUDO_READ],
  ['same, powershell-wrapped', `${PS} -Command '${REMOTE_SUDO_READ.replace(/'/g, "''")}'`],
  ['commit message text', 'git commit -m "docs: never run; sudo here"'],
]) {
  test(`codex host: quoted sudo is an argument, not a command -> ${label}`, () => {
    const r = codex('PreToolUse', { session_id: freshSid('cxquote'), tool_name: 'Bash', tool_input: { command: cmd } });
    assert.doesNotMatch(r.stderr, /permission-deny-mirror/, cmd);
  });
}
for (const cmd of [
  "ssh host 'ls'; sudo tail /var/log/x", 'bash -c "ls; sudo tail /var/log/x"', "echo it's; sudo tail /var/log/x",
  "echo \\' ; sudo tail /var/log/x ; echo \\'", "echo `' ; sudo tail /var/log/x ; echo `'", // escaped, not a quote
  "echo hi # it's\nsudo tail /var/log/x\necho hi # don't", // comment quote must not span lines (critic C1)
  "cat <<EOF\nit's\nEOF\nsudo tail /var/log/x\ncat <<EOF\ndon't\nEOF", // heredoc body likewise
  "echo ‘a' ; sudo tail /var/log/x ; 'b’", // PowerShell curly quotes pair with '
]) {
  test(`codex host: sudo in command position still denied -> ${cmd}`, () => {
    const r = codex('PreToolUse', { session_id: freshSid('cxquote'), tool_name: 'Bash', tool_input: { command: cmd } });
    assertDenied(r, cmd);
    assert.match(r.stderr, /permission-deny-mirror/);
  });
}

test('claude host: deny mirror stays silent (Claude permission layer owns it)', () => {
  const r = runNode(RUNNER, { session_id: freshSid('cldeny'), tool_name: 'Bash', tool_input: { command: 'git checkout -b feature-x' } }, {
    args: ['PreToolUse'], cwd: NON_REPO, env: { CODEX_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'hooktest-codexhome-')) },
  });
  assert.doesNotMatch(r.stderr, /permission-deny-mirror/);
});

for (const [host, cmd] of [['codex', 'Remove-Item -Recurse -Force .\\build'], ['codex', 'ri -r -fo C:\\tmp\\x'], ['claude', 'Remove-Item C:\\x -Force -Recurse']]) {
  test(`${host} host: PowerShell recursive forced delete is BLOCKED -> ${cmd}`, () => {
    const args = host === 'codex' ? ['PreToolUse', '--host=codex'] : ['PreToolUse'];
    const r = runNode(RUNNER, { session_id: freshSid('psdel'), tool_name: 'Bash', tool_input: { command: cmd } }, {
      args, cwd: NON_REPO, env: { CODEX_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'hooktest-codexhome-')) },
    });
    assertDenied(r, cmd);
    assert.match(r.stderr, /rm -rf is dangerous/);
  });
}

test('both hosts: Remove-Item without -Recurse/-Force is not blocked', () => {
  const r = codex('PreToolUse', { session_id: freshSid('psok'), tool_name: 'Bash', tool_input: { command: 'Remove-Item .\\one-file.txt' } });
  assert.doesNotMatch(r.stderr, /rm -rf is dangerous/);
});

test('claude host: no --host flag and no turn_id writes no Codex heartbeat', () => {
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hooktest-codexhome-'));
  const r = runNode(RUNNER, { session_id: freshSid('cl'), source: 'startup' }, {
    args: ['SessionStart'], cwd: NON_REPO, env: { CODEX_HOME: codexHome },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.existsSync(path.join(codexHome, 'awarewave-hook-heartbeat.json')), false);
});

test('codex host: a block is delivered as the documented deny decision, not exit 2', () => {
  const r = codex('PreToolUse', { session_id: freshSid('cxjson'), tool_name: 'Bash', tool_input: { command: DEPLOY } });
  assert.equal(r.status, 0, 'a non-zero exit makes Codex treat the hook as failed and drop the decision');
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /HIGH-RISK/);
});

test('codex host: a PostToolUse block uses the decision/reason shape', () => {
  const repo = makeGitRepo();
  const sid = freshSid('cxpost');
  const r = codex('PostToolUse', { session_id: sid, cwd: repo, tool_name: 'Bash', tool_input: { command: 'git add -A' }, tool_response: 'ok' }, { cwd: repo });
  if (r.status === 0 && r.stdout.trim()) {
    const out = JSON.parse(r.stdout);
    assert.ok(out.decision === 'block' || out.hookSpecificOutput, 'PostToolUse decisions use decision/reason');
  }
});

test('claude host: blocks still use exit 2 with no stdout', () => {
  const r = runNode(RUNNER, { session_id: freshSid('clblock'), tool_name: 'Bash', tool_input: { command: DEPLOY } }, {
    args: ['PreToolUse'], cwd: NON_REPO, env: { CODEX_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'hooktest-codexhome-')) },
  });
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /HIGH-RISK/);
});
