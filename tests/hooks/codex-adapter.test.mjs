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
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /HIGH-RISK OPERATION BLOCKED/);
  assert.equal(r.stdout, '', 'Codex stdout must stay empty or JSON');
});

test('codex host: exec_command alias reaches the same Bash gates', () => {
  const r = codex('PreToolUse', { session_id: freshSid('cx'), tool_name: 'exec_command', tool_input: { cmd: 'rm -rf /tmp/x' } });
  assert.equal(r.status, 2, r.stderr);
});

test('codex host: apply_patch onto a .env file is BLOCKED (sensitive-file-block)', () => {
  const patch = '*** Begin Patch\n*** Add File: config/.env\n+KEY=1\n*** End Patch';
  const r = codex('PreToolUse', { session_id: freshSid('cx'), tool_name: 'apply_patch', tool_input: { command: patch } });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /sensitive file/);
});

test('codex host: first apply_patch in a repo is BLOCKED once by git-log-injector, re-issue passes', () => {
  const repo = makeGitRepo();
  const sid = freshSid('cxgl');
  const patch = '*** Begin Patch\n*** Add File: note.txt\n+hi\n*** End Patch';
  const payload = { session_id: sid, cwd: repo, tool_name: 'apply_patch', tool_input: { command: patch } };
  const first = codex('PreToolUse', payload, { cwd: repo });
  assert.equal(first.status, 2, first.stderr);
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
  assert.equal(third.status, 2, third.stderr);
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
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /permission-deny-mirror|BLOCKED/);
  });
}

test('codex host: allowed git commands are not caught by the deny mirror', () => {
  for (const cmd of ['git status', 'git log --oneline -5', 'git push origin main', 'git reset --soft HEAD~1']) {
    const r = codex('PreToolUse', { session_id: freshSid('cxallow'), tool_name: 'Bash', tool_input: { command: cmd } });
    assert.doesNotMatch(r.stderr, /permission-deny-mirror/, cmd);
  }
});

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
    assert.equal(r.status, 2, r.stderr);
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
