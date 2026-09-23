// M3 — parity: the runner + real rules.manifest.json must reproduce the
// legacy verdicts for the M1 payload matrix, EXCEPT the declared intended
// diffs (all asserted at the bottom):
//   ID-1 rm -rf now actually blocks        (legacy inline read wrong field)
//   ID-2 sensitive-file writes now block   (legacy inline read wrong field)
//   ID-3 bash -c high-risk wrap now blocks (legacy bypass closed)
//   ID-4 log-error works on fresh HOME     (legacy sh silently failed)
//
// Rules fire AGGREGATED per event here (unlike M1's single-hook runs), so
// Write/Edit tests use a non-repo cwd to keep git-log-injector silent unless
// the test is about git-log-injector itself.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  runNode, freshSid, makeGitRepo, makeTmpHome,
  trackerPathFor, writeTracker, readFileSafe, REPO_ROOT, HOOKS_DIR,
  gitStagePathFor, writeGitStageTracker, sessionEditPathFor,
} from './helpers.mjs';

const RUNNER = path.join(HOOKS_DIR, 'runner.js');

function run(event, payload, opts = {}) {
  return runNode(RUNNER, payload, { args: [event], ...opts });
}

// ---------------------------------------------------------------- manifest ↔ rules completeness
test('every manifest rule exists on disk and every rule file is wired (no orphans)', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(HOOKS_DIR, 'rules.manifest.json'), 'utf8'));
  const wired = new Set();
  for (const groups of Object.values(manifest.events)) {
    for (const g of groups) for (const r of g.rules || []) wired.add(r);
  }
  const onDisk = new Set(
    fs.readdirSync(path.join(HOOKS_DIR, 'rules')).filter((f) => f.endsWith('.js')).map((f) => f.replace(/\.js$/, ''))
  );
  for (const r of wired) assert.ok(onDisk.has(r), `manifest references missing rule: ${r}`);
  for (const r of onDisk) assert.ok(wired.has(r), `orphan rule not wired in manifest: ${r}`);
});

// ---------------------------------------------------------------- PreToolUse Bash parity
test('parity: docker compose down → BLOCK', () => {
  const r = run('PreToolUse', { session_id: freshSid('p'), tool_name: 'Bash', tool_input: { command: 'docker compose down' } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /HIGH-RISK OPERATION BLOCKED/);
});

test('parity: ACK first line → pass', () => {
  const r = run('PreToolUse', { session_id: freshSid('p'), tool_name: 'Bash', tool_input: { command: '# CONFIRMED-HIGH-RISK: t\ndocker compose down' } });
  assert.equal(r.status, 0);
});

test('parity: rsync to prod IP → BLOCK; chained cd && docker down still passes (documented trade-off)', () => {
  const b = run('PreToolUse', { session_id: freshSid('p'), tool_name: 'Bash', tool_input: { command: 'rsync -av ./ root@5.223.93.113:/root/' } });
  assert.equal(b.status, 2);
  const c = run('PreToolUse', { session_id: freshSid('p'), tool_name: 'Bash', tool_input: { command: 'cd /srv && docker compose down' } });
  assert.equal(c.status, 0);
});

test('parity: malformed JSON → passthrough', () => {
  const r = run('PreToolUse', 'NOT-JSON-{{{');
  assert.equal(r.status, 0);
});

test('parity: force push main → BLOCK (branch-protection)', () => {
  const repo = makeGitRepo({ branch: 'feature' });
  const r = run('PreToolUse', { session_id: freshSid('p'), tool_name: 'Bash', tool_input: { command: 'git push --force origin main' } }, { cwd: repo });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Force push/);
});

test('parity: commit on main → INFO warn only, no block', () => {
  const repo = makeGitRepo({ branch: 'main' });
  const r = run('PreToolUse', { session_id: freshSid('p'), tool_name: 'Bash', tool_input: { command: 'git commit -m x' } }, { cwd: repo });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /Main-branch workflow active/);
});

test('parity: staged debugger + git commit → BLOCK (commit-quality)', () => {
  const repo = makeGitRepo({ branch: 'feature', files: { 'bad.js': 'debugger;\n' } });
  const r = run('PreToolUse', { session_id: freshSid('p'), tool_name: 'Bash', tool_input: { command: 'git commit -m x' } }, { cwd: repo });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /debugger statement/);
});

test('ID-7 (critic-4): rm -Rf / split-flag / long-form variants all block', () => {
  for (const cmd of ['rm -Rf /x', 'rm -r -f /x', 'rm -R --force /x', 'rm --force --recursive /x', 'sudo rm -fR /x']) {
    const r = run('PreToolUse', { session_id: freshSid('p'), tool_name: 'Bash', tool_input: { command: cmd } });
    assert.equal(r.status, 2, `should block: ${cmd}`);
  }
  // plain recursive-without-force and force-without-recursive stay allowed
  for (const cmd of ['rm -r /x', 'rm -f /x']) {
    const r = run('PreToolUse', { session_id: freshSid('p'), tool_name: 'Bash', tool_input: { command: cmd } });
    assert.equal(r.status, 0, `should pass: ${cmd}`);
  }
});

test('ID-8 (critic-5): git commit-tree with staged debugger does NOT trip commit-quality', () => {
  const repo = makeGitRepo({ branch: 'feature', files: { 'bad.js': 'debugger;\n' } });
  const r = run('PreToolUse', { session_id: freshSid('p'), tool_name: 'Bash', tool_input: { command: 'git commit-tree HEAD^{tree} -m x' } }, { cwd: repo });
  assert.equal(r.status, 0);
});

test('ID-6: SELF-SCAN EXEMPTION — staged governance/test files containing gate patterns do NOT deadlock commit', () => {
  const repo = makeGitRepo({
    branch: 'feature',
    files: {
      'mcp/claude-userlevel/hooks/rules/commit-quality.js': 'const re = /\\bdebugger\\b/;\n',
      'tests/hooks/fixture.js': 'debugger;\n',
    },
  });
  const r = run('PreToolUse', { session_id: freshSid('p'), tool_name: 'Bash', tool_input: { command: 'git commit -m x' } }, { cwd: repo });
  assert.equal(r.status, 0);
});

test('parity: git commit with non-empty tracker → BLOCK (verify-gate-commit)', () => {
  const sid = freshSid('pvgc');
  writeTracker(sid, ['/x/foo.ts']);
  const repo = makeGitRepo({ branch: 'feature' });
  const r = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: 'git commit -m x' } }, { cwd: repo });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /UNVERIFIED CODE FILES/);
  fs.rmSync(trackerPathFor(sid), { force: true });
});

test('parity: git commit-tree not treated as commit', () => {
  const sid = freshSid('pvgc2');
  writeTracker(sid, ['/x/foo.ts']);
  const repo = makeGitRepo({ branch: 'feature' });
  const r = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: 'git commit-tree HEAD^{tree} -m x' } }, { cwd: repo });
  assert.equal(r.status, 0);
  fs.rmSync(trackerPathFor(sid), { force: true });
});

// ---------------------------------------------------------------- PreToolUse Write|Edit parity
test('parity: git-log-injector blocks first Write/Edit in repo cwd, re-issue passes', () => {
  const sid = freshSid('pgli');
  const payload = { session_id: sid, tool_name: 'Edit', tool_input: { file_path: path.join(REPO_ROOT, 'README.md') } };
  const first = run('PreToolUse', payload, { cwd: REPO_ROOT });
  assert.equal(first.status, 2);
  assert.match(first.stderr, /GIT LOG/);
  const second = run('PreToolUse', payload, { cwd: REPO_ROOT });
  assert.equal(second.status, 0);
});

test('parity: auto-repair path blocks once per category (non-repo cwd isolates the rule)', () => {
  const sid = freshSid('parg');
  const tmp = makeTmpHome();
  const payload = { session_id: sid, tool_name: 'Edit', tool_input: { file_path: '/x/lobster-factory/infra/hetzner-phase1-core/scripts/sg-deploy.sh' } };
  const first = run('PreToolUse', payload, { cwd: tmp });
  assert.equal(first.status, 2);
  assert.match(first.stderr, /AUTO-REPAIR PATH DETECTED/);
  const second = run('PreToolUse', payload, { cwd: tmp });
  assert.equal(second.status, 0);
});

test('parity: file-path-router auth path routes once', () => {
  const sid = freshSid('pfpr');
  const tmp = makeTmpHome();
  const payload = { session_id: sid, tool_name: 'Edit', tool_input: { file_path: '/x/app/auth/login.ts' } };
  const first = run('PreToolUse', payload, { cwd: tmp });
  assert.equal(first.status, 2);
  assert.match(first.stderr, /AUTH \/ RLS \/ PERMISSION/);
  const second = run('PreToolUse', payload, { cwd: tmp });
  assert.equal(second.status, 0);
});

test('parity: .eslintrc write → BLOCK (config-protection)', () => {
  const tmp = makeTmpHome();
  const r = run('PreToolUse', { session_id: freshSid('p'), tool_name: 'Write', tool_input: { file_path: '/x/.eslintrc' } }, { cwd: tmp });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Fix the source code/);
});

test('parity: MultiEdit edits[] shape reaches Write|Edit rules', () => {
  const tmp = makeTmpHome();
  const r = run('PreToolUse', {
    session_id: freshSid('p'),
    tool_name: 'MultiEdit',
    tool_input: { edits: [{ file_path: '/x/.eslintrc' }] },
  }, { cwd: tmp });
  assert.equal(r.status, 2);
});

// ---------------------------------------------------------------- Read / mcp parity
test('parity: 2MB read blocks, offset/limit passes (large-file-warner)', () => {
  const home = makeTmpHome();
  const big = path.join(home, 'big.bin');
  fs.writeFileSync(big, Buffer.alloc(2 * 1024 * 1024 + 1));
  const b = run('PreToolUse', { session_id: freshSid('p'), tool_name: 'Read', tool_input: { file_path: big } }, { home });
  assert.equal(b.status, 2);
  const p = run('PreToolUse', { session_id: freshSid('p'), tool_name: 'Read', tool_input: { file_path: big, limit: 5 } }, { home });
  assert.equal(p.status, 0);
});

test('parity: mcp-health pre blocks inside backoff; failure marks unhealthy', () => {
  const home = makeTmpHome();
  const cache = path.join(home, '.claude', 'mcp-health-cache.json');
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  fs.writeFileSync(cache, JSON.stringify({ servers: { badsrv: { status: 'unhealthy', nextRetryAt: Date.now() + 60000 } } }));
  const b = run('PreToolUse', { session_id: freshSid('p'), tool_name: 'mcp__badsrv__do', tool_input: {} }, { home });
  assert.equal(b.status, 2);
  assert.match(b.stderr, /unhealthy/);

  const f = run('PostToolUseFailure', { session_id: freshSid('p'), tool_name: 'mcp__flaky__do', error: 'ECONNREFUSED' }, { home });
  assert.equal(f.status, 0);
  assert.equal(JSON.parse(readFileSafe(cache)).servers.flaky.status, 'unhealthy');
});

// ---------------------------------------------------------------- PostToolUse parity
test('parity: audit-log redacts ghp_ token (PostToolUse Bash)', () => {
  const home = makeTmpHome();
  const r = run('PostToolUse', {
    session_id: freshSid('p'),
    tool_name: 'Bash',
    tool_input: { command: `git push https://ghp_${'a'.repeat(36)}@github.com/x/y` },
  }, { home });
  assert.equal(r.status, 0);
  const log = readFileSafe(path.join(home, '.claude', 'bash-commands.log'));
  assert.match(log, /<REDACTED>/);
  assert.doesNotMatch(log, /ghp_a{36}/);
});

test('parity: code-change-tracker tracks .ts edit + high-risk flag on auth path', () => {
  const sid = freshSid('pcct');
  const tmp = makeTmpHome();
  const r = run('PostToolUse', { session_id: sid, tool_name: 'Edit', tool_input: { file_path: '/x/src/authHelpers.ts' } }, { cwd: tmp });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /CODE FILE MODIFIED/);
  assert.match(r.stderr, /HIGH-RISK PATH/);
  assert.match(readFileSafe(trackerPathFor(sid)) || '', /authHelpers\.ts/);
  fs.rmSync(trackerPathFor(sid), { force: true });
});

test('parity: code-change-tracker does NOT track scratch code files under os.tmpdir() (2026-09-04)', () => {
  const sid = freshSid('pcct2');
  const tmp = makeTmpHome();
  const scratch = path.join(os.tmpdir(), `claude-scratch-${sid}`, 'edit_helper.py');
  const r = run('PostToolUse', { session_id: sid, tool_name: 'Write', tool_input: { file_path: scratch } }, { cwd: tmp });
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stderr, /CODE FILE MODIFIED/);
  assert.match(r.stderr, /scratch code file/);
  assert.equal(readFileSafe(trackerPathFor(sid)), null);
  // and an absolute path outside the temp dir is still tracked (no regression of the original rule)
  const r2 = run('PostToolUse', { session_id: sid, tool_name: 'Write', tool_input: { file_path: '/x/lib/helper.py' } }, { cwd: tmp });
  assert.equal(r2.status, 0);
  assert.match(r2.stderr, /CODE FILE MODIFIED/);
  assert.match(readFileSafe(trackerPathFor(sid)) || '', /helper\.py/);
  fs.rmSync(trackerPathFor(sid), { force: true });
});

test('parity: repeat-failure-guard blocks the 3rd identical Bash command after 2 recorded failures (2026-09-04)', () => {
  const sid = freshSid('prfg');
  const tmp = makeTmpHome();
  const cmd = 'python build.py --flag   value';
  const stateFile = path.join(os.tmpdir(), `claude-bash-failures-${sid}.json`);
  fs.rmSync(stateFile, { force: true });
  // 1st and 2nd failure: recorded, never blocked
  for (let i = 0; i < 2; i++) {
    const f = run('PostToolUseFailure', { session_id: sid, tool_name: 'Bash', tool_input: { command: cmd }, error: 'Exit code 1' }, { cwd: tmp });
    assert.equal(f.status, 0);
  }
  assert.match(fs.readFileSync(stateFile, 'utf8'), /"count": 2/);
  // 3rd identical attempt (whitespace differs only) -> BLOCK
  const pre = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: 'python build.py --flag value' } }, { cwd: tmp });
  assert.equal(pre.status, 2);
  assert.match(pre.stderr, /already failed 2x/);
  // a different command is not blocked
  const other = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: 'python build.py --flag value --verbose' } }, { cwd: tmp });
  assert.equal(other.status, 0);
  // the justified marker lets the identical command through
  const just = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: '# RETRY-JUSTIFIED: dependency installed since\npython build.py --flag value' } }, { cwd: tmp });
  assert.equal(just.status, 0);
  assert.match(just.stderr, /RETRY-JUSTIFIED/);
  // a success clears the entry, so the plain command is allowed again afterwards
  const ok = run('PostToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: cmd }, tool_response: { stdout: 'ok' } }, { cwd: tmp });
  assert.equal(ok.status, 0);
  const after = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: cmd } }, { cwd: tmp });
  assert.equal(after.status, 0);
  fs.rmSync(stateFile, { force: true });
});

test('parity: repeat-failure-guard ignores a single failure and non-Bash tools', () => {
  const sid = freshSid('prfg2');
  const tmp = makeTmpHome();
  const stateFile = path.join(os.tmpdir(), `claude-bash-failures-${sid}.json`);
  fs.rmSync(stateFile, { force: true });
  const f = run('PostToolUseFailure', { session_id: sid, tool_name: 'Bash', tool_input: { command: 'ls /nope' }, error: 'Exit code 2' }, { cwd: tmp });
  assert.equal(f.status, 0);
  const pre = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: 'ls /nope' } }, { cwd: tmp });
  assert.equal(pre.status, 0, 'one failure must not block');
  fs.rmSync(stateFile, { force: true });
});

test('parity: accumulator (PostToolUse) → batch-format consumes at Stop under the SAME sid', () => {
  const sid = freshSid('pabf');
  const tmp = makeTmpHome();
  const js = path.join(tmp, 'a.js');
  fs.writeFileSync(js, 'const a=1;\n');
  const acc = run('PostToolUse', { session_id: sid, tool_name: 'Edit', tool_input: { file_path: js } }, { cwd: tmp });
  assert.equal(acc.status, 0);
  const accFile = path.join(os.tmpdir(), `claude-edited-${sid}.txt`);
  assert.match(readFileSafe(accFile) || '', /a\.js/);
  const stop = run('Stop', { session_id: sid }, { cwd: tmp });
  assert.equal(stop.status, 0);
  assert.equal(readFileSafe(accFile), null);
});

test('parity: SubagentStart injects the shared charter without echoing payload', () => {
  const r = run('SubagentStart', { agent_name: 'critic', private_note: 'must-not-echo' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /30-year, LEGO-like system/);
  assert.doesNotMatch(r.stdout, /must-not-echo/);
});

test('parity: Codex SubagentStart uses hook JSON and carries the same charter', () => {
  // turn_id is the real Codex-specific signal (2026-09-03 fix, runner.js
  // isCodexPayload) -- hook_event_name alone is not: Claude Code's own hook
  // payloads include it too.
  const r = run('SubagentStart', {
    hook_event_name: 'SubagentStart',
    turn_id: 'turn-parity-test',
    agent_name: 'critic',
    private_note: 'must-not-echo',
  });
  assert.equal(r.status, 0);
  const output = JSON.parse(r.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, 'SubagentStart');
  assert.match(output.hookSpecificOutput.additionalContext, /30-year, LEGO-like system/);
  assert.doesNotMatch(r.stdout, /must-not-echo/);
});

test('parity: PreToolUse Agent spawn also carries the shared charter (2026-09-03 SubagentStart→PreToolUse migration)', () => {
  // Real-spawn-confirmed 2026-09-03 (WORKLOG 續6-part-2): a genuine Agent-tool
  // spawn quoted this charter block back verbatim from its own initial
  // context. SubagentStart is kept wired too (other hosts may honor it) but
  // real testing proved it never reaches THIS host at all -- PreToolUse
  // ^Agent$ is the confirmed-working path, piggybacking on the same trigger
  // point subagent-budget.js already proved fires reliably for real spawns.
  const r = run('PreToolUse', {
    tool_name: 'Agent',
    tool_input: { description: 'test', prompt: 'test prompt' },
    private_note: 'must-not-echo',
  });
  assert.equal(r.status, 0);
  const output = JSON.parse(r.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(output.hookSpecificOutput.permissionDecision, 'allow');
  assert.match(output.hookSpecificOutput.additionalContext, /\[Subagent Charter\]/);
  assert.match(output.hookSpecificOutput.additionalContext, /30-year, LEGO-like system/);
  // subagent-budget's own info note shares the same matcher group and must
  // still be present too -- this migration must not crowd it out.
  assert.match(output.hookSpecificOutput.additionalContext, /\[Subagent Budget\]/);
  assert.doesNotMatch(r.stdout, /must-not-echo/);
});

test('parity: PreToolUse for a non-Agent tool with no context still passes the original payload through unchanged', () => {
  // Regression guard for the new isPreToolUseContext branch in runner.js:
  // it must only activate when a rule actually returns context, never
  // hijack the existing echo-passthrough contract other PreToolUse tests
  // (and Claude Code's own "no opinion" default) rely on.
  const payload = { tool_name: 'Read', tool_input: { file_path: 'README.md' } };
  const r = run('PreToolUse', payload);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, JSON.stringify(payload));
});

test('manifest: subagent-charter is wired to PreToolUse ^Agent$ (alongside subagent-budget) and still to SubagentStart', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(HOOKS_DIR, 'rules.manifest.json'), 'utf8'));
  const agentGroup = (manifest.events.PreToolUse || []).find((g) => g.matcher === '^Agent$');
  assert.ok(agentGroup, 'PreToolUse must have an ^Agent$ matcher group');
  assert.ok(agentGroup.rules.includes('subagent-charter'), 'subagent-charter must be wired into the ^Agent$ group');
  assert.ok(agentGroup.rules.includes('subagent-budget'), 'must not have displaced subagent-budget from the same group');
  const subagentStartGroups = manifest.events.SubagentStart || [];
  assert.ok(
    subagentStartGroups.some((g) => (g.rules || []).includes('subagent-charter')),
    'SubagentStart wiring is kept as a defense-in-depth fallback for hosts where it might work -- must not be removed'
  );
});

test('parity: agent-dispatch-log writes jsonl for Agent tool', () => {
  const home = makeTmpHome();
  const tmp = makeTmpHome();
  const r = run('PostToolUse', {
    session_id: freshSid('p'),
    tool_name: 'Agent',
    tool_input: { subagent_type: 'critic', description: 'review' },
    tool_response: { content: [{ text: 'done' }] },
  }, { home, cwd: tmp });
  assert.equal(r.status, 0);
  const dispDir = path.join(home, '.claude', 'agent-dispatch');
  assert.equal(fs.readdirSync(dispDir).length, 1);
});

// ---------------------------------------------------------------- Stop parity
test('parity: verify-gate-stop warns on non-empty tracker at Stop (exit 0)', () => {
  const sid = freshSid('pvgs');
  writeTracker(sid, ['/x/foo.ts']);
  const repo = makeGitRepo({ branch: 'feature' });
  const r = run('Stop', { session_id: sid }, { cwd: repo });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /UNVERIFIED CODE FILES/);
  fs.rmSync(trackerPathFor(sid), { force: true });
});

// ---------------------------------------------------------------- SessionStart
test('session banner derives counts from manifest (no hand-written numbers)', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(HOOKS_DIR, 'rules.manifest.json'), 'utf8'));
  const distinct = new Set();
  for (const groups of Object.values(manifest.events)) {
    for (const g of groups) for (const r of g.rules || []) distinct.add(r);
  }
  const r = run('SessionStart', { session_id: freshSid('p'), tool_name: '' });
  assert.equal(r.status, 0);
  assert.match(r.stderr, new RegExp(`${distinct.size} rules across ${Object.keys(manifest.events).length} events`));
});

// ---------------------------------------------------------------- Phase 4 mechanized rules
test('P4-1: ssh to prod VPS running sg-deploy → BLOCK; ACK passes; read-only ssh passes', () => {
  const b = run('PreToolUse', { session_id: freshSid('p4'), tool_name: 'Bash', tool_input: { command: "ssh root@5.223.93.113 'bash /root/lobster-phase1/scripts/sg-deploy.sh next-admin'" } });
  assert.equal(b.status, 2);
  assert.match(b.stderr, /deploy flow first/);
  const ack = run('PreToolUse', { session_id: freshSid('p4'), tool_name: 'Bash', tool_input: { command: "# CONFIRMED-HIGH-RISK: drift clean, verify green, operator go-ahead\nssh root@5.223.93.113 'bash sg-deploy.sh next-admin'" } });
  assert.equal(ack.status, 0);
  const ro = run('PreToolUse', { session_id: freshSid('p4'), tool_name: 'Bash', tool_input: { command: "ssh root@5.223.93.113 'docker ps'" } });
  assert.equal(ro.status, 0, 'read-only ssh must pass');
});

test('P4-1c: ssh to the LIVE host ks-aw-01 (145.239.195.47, -p 58122, ubuntu+sudo) running deploy/restart → BLOCK; read-only passes', () => {
  // 2026-09-04: the host alternation still listed only the two retired Hetzner
  // IPs after the 2026-08-31 consolidation, so production had no gate at all.
  const b = run('PreToolUse', { session_id: freshSid('p4c'), tool_name: 'Bash', tool_input: { command: "ssh -i ~/.ssh/id_ed25519 -p 58122 ubuntu@145.239.195.47 'sudo bash /root/lobster-phase1/scripts/sg-deploy.sh next-admin'" } });
  assert.equal(b.status, 2, 'deploy on the live host must BLOCK');
  assert.match(b.stderr, /deploy flow first/);
  const restart = run('PreToolUse', { session_id: freshSid('p4c'), tool_name: 'Bash', tool_input: { command: 'ssh -p 58122 ubuntu@145.239.195.47 sudo systemctl restart nginx' } });
  assert.equal(restart.status, 2, 'systemctl restart on the live host must BLOCK');
  const byName = run('PreToolUse', { session_id: freshSid('p4c'), tool_name: 'Bash', tool_input: { command: 'ssh ks-aw-01 sudo reboot' } });
  assert.equal(byName.status, 2, 'ssh-config alias ks-aw-01 must BLOCK too');
  const ro = run('PreToolUse', { session_id: freshSid('p4c'), tool_name: 'Bash', tool_input: { command: "ssh -p 58122 ubuntu@145.239.195.47 'docker ps'" } });
  assert.equal(ro.status, 0, 'read-only ssh to the live host must pass');
});

test('P4-1b: ssh prod systemctl restart → BLOCK; non-prod IP → pass', () => {
  const b = run('PreToolUse', { session_id: freshSid('p4'), tool_name: 'Bash', tool_input: { command: 'ssh root@204.168.175.41 systemctl restart n8n' } });
  assert.equal(b.status, 2);
  const other = run('PreToolUse', { session_id: freshSid('p4'), tool_name: 'Bash', tool_input: { command: 'ssh root@10.0.0.5 bash sg-deploy.sh' } });
  assert.equal(other.status, 0, 'non-prod IP not in scope');
});

test('P4-2: VBC prompt trigger → context injected on stdout, raw JSON NOT echoed', () => {
  const r = run('UserPromptSubmit', { session_id: freshSid('p4'), prompt: '別的 AI 已經處理好 WAF 了，你確認一下' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /VBC 協議/);
  assert.doesNotMatch(r.stdout, /"prompt"/); // no stdin passthrough on prompt events
});

test('P4-2b: neutral prompt → completely silent stdout (no context spam)', () => {
  const r = run('UserPromptSubmit', { session_id: freshSid('p4'), prompt: '幫我看一下 canvas 的字體大小' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('P4-2c: english "another session already fixed it" also triggers', () => {
  const r = run('UserPromptSubmit', { session_id: freshSid('p4'), prompt: 'another session already fixed the nginx config, please verify' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /VBC/);
});

test('P4-3: MCP failure with 403 → vault-status hint; plain timeout → no hint', () => {
  const home = makeTmpHome();
  const auth = run('PostToolUseFailure', { session_id: freshSid('p4'), tool_name: 'mcp__vaulty__do', error: 'HTTP 403 Forbidden' }, { home });
  assert.equal(auth.status, 0);
  assert.match(auth.stderr, /vault-status/);
  const to = run('PostToolUseFailure', { session_id: freshSid('p4'), tool_name: 'mcp__slowsrv__do', error: 'timed out' }, { home });
  assert.equal(to.status, 0);
  assert.doesNotMatch(to.stderr, /vault-status/);
});

// ---------------------------------------------------------------- INTENDED DIFFS
test('ID-1: rm -rf now BLOCKS (legacy inline was a no-op)', () => {
  const r = run('PreToolUse', { session_id: freshSid('p'), tool_name: 'Bash', tool_input: { command: 'rm -rf /tmp/x' } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /rm -rf is dangerous/);
});

test('ID-1b: --no-verify still blocks (inline parity)', () => {
  const r = run('PreToolUse', { session_id: freshSid('p'), tool_name: 'Bash', tool_input: { command: 'git commit --no-verify -m x' } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--no-verify is not allowed/);
});

test('ID-1c: FALSE-POSITIVE REGRESSION — heredoc/docs text mentioning rm -rf must NOT block (live incident 2026-07-02)', () => {
  const heredoc = [
    'python3 - <<\'PY\'',
    's = "| `rules/dangerous-bash.js` | Bash | BLOCK：`rm -rf`、`--no-verify` |"',
    'print(s)',
    'PY',
  ].join('\n');
  const r = run('PreToolUse', { session_id: freshSid('p'), tool_name: 'Bash', tool_input: { command: heredoc } });
  assert.equal(r.status, 0);
});

test('ID-1d: line-start rm -rf inside a multi-line script still blocks', () => {
  const r = run('PreToolUse', {
    session_id: freshSid('p'),
    tool_name: 'Bash',
    tool_input: { command: 'echo cleaning\nrm -rf /srv/data\necho done' },
  });
  assert.equal(r.status, 2);
});

test('ID-1e: chained `cd x && rm -rf y` blocks (command-position segments)', () => {
  const r = run('PreToolUse', {
    session_id: freshSid('p'),
    tool_name: 'Bash',
    tool_input: { command: 'cd /tmp && rm -rf ./scratch' },
  });
  assert.equal(r.status, 2);
});

test('ID-5: prose mention of "git commit" with non-empty tracker does NOT block (live incident 2026-07-02)', () => {
  const sid = freshSid('pid5');
  writeTracker(sid, ['/x/foo.ts']);
  const heredoc = [
    'python3 - <<\'PY\'',
    's = "| `rules/commit-quality.js` | Bash | BLOCK：git commit 前檢查 staged debugger |"',
    's += "git `--no-verify`（取代舊 inline）"',
    'print(s)',
    'PY',
  ].join('\n');
  const r = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: heredoc } });
  assert.equal(r.status, 0);
  fs.rmSync(trackerPathFor(sid), { force: true });
});

test('ID-5b: chained `cd x && git commit` with tracker still blocks (real invocation)', () => {
  const sid = freshSid('pid5b');
  writeTracker(sid, ['/x/foo.ts']);
  const repo = makeGitRepo({ branch: 'feature' });
  const r = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: 'cd sub && git commit -m x' } }, { cwd: repo });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /UNVERIFIED CODE FILES/);
  fs.rmSync(trackerPathFor(sid), { force: true });
});

test('ID-2: .env write now BLOCKS (legacy inline was a no-op)', () => {
  const tmp = makeTmpHome();
  const r = run('PreToolUse', { session_id: freshSid('p'), tool_name: 'Write', tool_input: { file_path: '/x/prod.env' } }, { cwd: tmp });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /sensitive file/);
});

test('ID-3: bash -c "docker compose down" now BLOCKS (legacy bypass closed)', () => {
  const r = run('PreToolUse', { session_id: freshSid('p'), tool_name: 'Bash', tool_input: { command: 'bash -c "docker compose down"' } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /HIGH-RISK OPERATION BLOCKED/);
});

test('ID-4: log-error works on a fresh HOME (legacy sh silently failed)', () => {
  const home = makeTmpHome();
  const r = run('PostToolUse', {
    session_id: freshSid('p'),
    tool_name: 'Bash',
    tool_input: { command: 'x' },
    tool_output: 'fatal: not a git repository',
  }, { home });
  assert.equal(r.status, 0);
  assert.match(readFileSafe(path.join(home, '.claude', 'error-log.md')) || '', /fatal: not a git repository/);
});

// ---------------------------------------------------------------- git-add-scope-tracker / git-commit-scope-guard (2026-08-30, v2 after critic round 1)

test('git-add-scope-tracker: enumerable broad add flags (without ACK) all BLOCK', () => {
  for (const cmd of ['git add -A', 'git add --all', 'git add .', 'git add -u', 'git add --update']) {
    const r = run('PreToolUse', { session_id: freshSid('gast'), tool_name: 'Bash', tool_input: { command: cmd } });
    assert.equal(r.status, 2, `should block: ${cmd}`);
    assert.match(r.stderr, /broad `git add`/);
  }
});

test('git-add-scope-tracker: -p/-i are HARD BLOCKED with NO ack override (no non-interactive listing exists)', () => {
  for (const cmd of ['git add -p', 'git add --patch', 'git add -i', 'git add --interactive']) {
    const without = run('PreToolUse', { session_id: freshSid('gastni'), tool_name: 'Bash', tool_input: { command: cmd } });
    assert.equal(without.status, 2, `should block: ${cmd}`);
    const withAck = run('PreToolUse', { session_id: freshSid('gastni'), tool_name: 'Bash', tool_input: { command: `# CONFIRMED-HIGH-RISK: t\n${cmd}` } });
    assert.equal(withAck.status, 2, `should STILL block even with ACK: ${cmd}`);
    assert.match(withAck.stderr, /no non-interactive way/);
  }
});

// v4 (2026-09-02, C1 fix): recording moved from PreToolUse to PostToolUse —
// see git-add-scope-tracker.js module header. Tests below now do Pre (should
// allow / not block) -> the REAL git command (simulating the Bash tool
// actually running it) -> Post (verifies against real `git diff --cached`
// and records) -> assert the tracker file.

test('git-add-scope-tracker M5 fix: broad add WITH the # CONFIRMED-HIGH-RISK ack unlocks and records the real dry-run listing (not blind trust)', () => {
  const sid = freshSid('gastack');
  const repo = makeGitRepo({ branch: 'main' });
  fs.writeFileSync(path.join(repo, 'newfile.md'), 'n');
  const cmd = '# CONFIRMED-HIGH-RISK: deliberate broad add, reviewed\ngit add -A';
  const pre = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: cmd } }, { cwd: repo });
  assert.equal(pre.status, 0, pre.stderr);
  spawnSync('git', ['add', '-A'], { cwd: repo });
  const post = run('PostToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: cmd } }, { cwd: repo });
  assert.equal(post.status, 0, post.stderr);
  const recorded = fs.readFileSync(gitStagePathFor(sid), 'utf8').split('\n').filter(Boolean);
  assert.ok(recorded.includes('newfile.md'), `expected newfile.md in ${JSON.stringify(recorded)}`);
  fs.rmSync(gitStagePathFor(sid), { force: true });
});

test('git-add-scope-tracker: explicit file list passes and is recorded in the tracker', () => {
  const sid = freshSid('gast');
  const repo = makeGitRepo({ branch: 'main' });
  fs.writeFileSync(path.join(repo, 'fileA.md'), 'a');
  fs.writeFileSync(path.join(repo, 'fileB.md'), 'b');
  const cmd = 'git add fileA.md fileB.md';
  const pre = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: cmd } }, { cwd: repo });
  assert.equal(pre.status, 0);
  spawnSync('git', ['add', 'fileA.md', 'fileB.md'], { cwd: repo });
  const post = run('PostToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: cmd } }, { cwd: repo });
  assert.equal(post.status, 0, post.stderr);
  const recorded = fs.readFileSync(gitStagePathFor(sid), 'utf8').split('\n').filter(Boolean);
  assert.deepEqual(recorded.sort(), ['fileA.md', 'fileB.md']);
  fs.rmSync(gitStagePathFor(sid), { force: true });
});

test('git-add-scope-tracker M2 fix: a chained `git add fileA && git add -A` still blocks on the SECOND segment (not just-the-first-segment scan)', () => {
  const r = run('PreToolUse', { session_id: freshSid('gastm2'), tool_name: 'Bash', tool_input: { command: 'git add fileA.md && git add -A' } });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /broad `git add`/);
});

test('git-add-scope-tracker: backslash-continued multi-line `git add \\` records every real file (live dogfooding incident, 2026-08-30)', () => {
  // runner.js's commandSegments() splits per LINE first, so each continuation
  // line of a real `git add \` / file / file style command used to become its
  // OWN segment that never matched RE_GIT_ADD -- the real paths were silently
  // dropped and only the literal "\" got recorded as a tracked "file". Found
  // live on the first real commit attempt using this gate (WORKLOG 2026-08-30).
  const sid = freshSid('gastbs');
  const repo = makeGitRepo({ branch: 'main' });
  fs.writeFileSync(path.join(repo, 'fileA.md'), 'a');
  fs.writeFileSync(path.join(repo, 'fileB.md'), 'b');
  const cmd = 'git add \\\n  fileA.md \\\n  fileB.md';
  const pre = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: cmd } }, { cwd: repo });
  assert.equal(pre.status, 0, pre.stderr);
  spawnSync('git', ['add', 'fileA.md', 'fileB.md'], { cwd: repo });
  const post = run('PostToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: cmd } }, { cwd: repo });
  assert.equal(post.status, 0, post.stderr);
  const recorded = fs.readFileSync(gitStagePathFor(sid), 'utf8').split('\n').filter(Boolean);
  assert.deepEqual(recorded.sort(), ['fileA.md', 'fileB.md']);
  fs.rmSync(gitStagePathFor(sid), { force: true });
});

test('git-commit-scope-guard: backslash-continued multi-line `git commit ... -- \\` pathspec tail is still detected', () => {
  const sid = freshSid('gcsgbs');
  const repo = makeGitRepo({ branch: 'main', files: { 'fileA.md': 'a' } });
  writeGitStageTracker(sid, ['fileA.md']);
  fs.writeFileSync(path.join(repo, 'fileB.md'), 'b');
  spawnSync('git', ['add', 'fileB.md'], { cwd: repo });
  const cmd = 'git commit -m x -- \\\n  fileA.md';
  const r = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: cmd } }, { cwd: repo });
  assert.equal(r.status, 0, r.stderr);
});

test('git-add-scope-tracker M4 fix: git rm and git mv targets are recorded like git add', () => {
  const sid = freshSid('gastrmmv');
  const repo = makeGitRepo({ branch: 'main', files: { 'old.md': 'o', 'from.md': 'f' } }); // auto-staged, tracked
  const cmd1 = 'git rm old.md';
  const pre1 = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: cmd1 } }, { cwd: repo });
  assert.equal(pre1.status, 0, pre1.stderr);
  spawnSync('git', ['rm', '-q', 'old.md'], { cwd: repo });
  const post1 = run('PostToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: cmd1 } }, { cwd: repo });
  assert.equal(post1.status, 0, post1.stderr);

  const cmd2 = 'git mv from.md to.md';
  const pre2 = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: cmd2 } }, { cwd: repo });
  assert.equal(pre2.status, 0, pre2.stderr);
  spawnSync('git', ['mv', 'from.md', 'to.md'], { cwd: repo });
  const post2 = run('PostToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: cmd2 } }, { cwd: repo });
  assert.equal(post2.status, 0, post2.stderr);

  // git mv's rename is collapsed by `git diff --cached --name-only` into just
  // the new name (verified empirically — no `-M` needed); `old.md`'s
  // deletion IS reported. `from.md` is deliberately absent from the
  // expectation for the same reason.
  const recorded = fs.readFileSync(gitStagePathFor(sid), 'utf8').split('\n').filter(Boolean);
  assert.deepEqual(recorded.sort(), ['old.md', 'to.md']);
  fs.rmSync(gitStagePathFor(sid), { force: true });
});

test('git-commit-scope-guard: bare commit with ONLY this session\'s own staged file → allow', () => {
  const sid = freshSid('gcsg');
  const repo = makeGitRepo({ branch: 'main', files: { 'fileA.md': 'a' } }); // auto-staged
  writeGitStageTracker(sid, ['fileA.md']);
  const r = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: 'git commit -m x' } }, { cwd: repo });
  assert.equal(r.status, 0, r.stderr);
});

test('git-commit-scope-guard: bare commit with ANOTHER session\'s staged file → BLOCK, names the file', () => {
  const sid = freshSid('gcsg');
  const repo = makeGitRepo({ branch: 'main', files: { 'fileA.md': 'a' } }); // this session's file, auto-staged
  writeGitStageTracker(sid, ['fileA.md']);
  // a DIFFERENT session stages fileB.md in the SAME repo/index — the real-world
  // shape of the 2026-08-30 incidents this gate exists for.
  fs.writeFileSync(path.join(repo, 'fileB.md'), 'b');
  spawnSync('git', ['add', 'fileB.md'], { cwd: repo });
  const r = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: 'git commit -m x' } }, { cwd: repo });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /would include files this session never/);
  assert.match(r.stderr, /fileB\.md/);
});

test('git-commit-scope-guard C2 fix: a commit MESSAGE containing literal " -- " text is NOT trusted as a real pathspec (must still catch the foreign file)', () => {
  const sid = freshSid('gcsgc2');
  const repo = makeGitRepo({ branch: 'main', files: { 'fileA.md': 'a' } });
  writeGitStageTracker(sid, ['fileA.md']);
  fs.writeFileSync(path.join(repo, 'fileB.md'), 'b');
  spawnSync('git', ['add', 'fileB.md'], { cwd: repo });
  // real commit-message style found 53/400 times in this repo's own history —
  // must NOT be mistaken for a `-- <pathspec>` tail.
  const r = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: 'git commit -m "fix(oracle): crash -- StrictMode Count"' } }, { cwd: repo });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /would include files this session never/);
});

test('git-commit-scope-guard: explicit pathspec tail (git-verified) allows even with another session\'s file staged', () => {
  const sid = freshSid('gcsg');
  const repo = makeGitRepo({ branch: 'main', files: { 'fileA.md': 'a' } });
  writeGitStageTracker(sid, ['fileA.md']);
  fs.writeFileSync(path.join(repo, 'fileB.md'), 'b');
  spawnSync('git', ['add', 'fileB.md'], { cwd: repo });
  const r = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: 'git commit -m x -- fileA.md' } }, { cwd: repo });
  assert.equal(r.status, 0, r.stderr);
});

test('git-commit-scope-guard: pathspec on the LAST LINE of a heredoc-style commit is still detected (the exact shape this gate was built for)', () => {
  const sid = freshSid('gcsg');
  const repo = makeGitRepo({ branch: 'main', files: { 'fileA.md': 'a' } });
  writeGitStageTracker(sid, ['fileA.md']);
  fs.writeFileSync(path.join(repo, 'fileB.md'), 'b');
  spawnSync('git', ['add', 'fileB.md'], { cwd: repo });
  const heredoc = [
    'git commit -m "$(cat <<\'EOF\'',
    'Multi-line commit message.',
    '',
    'Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>',
    'EOF',
    ')" -- fileA.md',
  ].join('\n');
  const r = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: heredoc } }, { cwd: repo });
  assert.equal(r.status, 0, r.stderr);
});

test('git-commit-scope-guard v5 fix: a heredoc-style commit\'s pathspec is still detected when a real, unrelated follow-up command comes AFTER it in the same Bash call (live incident 2026-09-05: `git log --oneline -1` after the commit made "last line of the whole text" find the wrong line, blocking a correctly-scoped commit)', () => {
  const sid = freshSid('gcsg');
  const repo = makeGitRepo({ branch: 'main', files: { 'fileA.md': 'a' } });
  writeGitStageTracker(sid, ['fileA.md']);
  fs.writeFileSync(path.join(repo, 'fileB.md'), 'b');
  spawnSync('git', ['add', 'fileB.md'], { cwd: repo });
  const heredoc = [
    'git commit -m "$(cat <<\'EOF\'',
    'Multi-line commit message.',
    'EOF',
    ')" -- \\',
    '  fileA.md',
    'git log --oneline -1',
  ].join('\n');
  const r = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: heredoc } }, { cwd: repo });
  assert.equal(r.status, 0, r.stderr);
});

test('git-commit-scope-guard v5 fix: the same trailing-follow-up shape does NOT let a LATER command\'s own `-- <file>` get misattributed to the commit (the heredoc-case analog of the v4 M4 fix)', () => {
  const sid = freshSid('gcsg');
  const repo = makeGitRepo({ branch: 'main', files: { 'fileA.md': 'a' } });
  writeGitStageTracker(sid, ['fileA.md']);
  fs.writeFileSync(path.join(repo, 'fileB.md'), 'b');
  spawnSync('git', ['add', 'fileB.md'], { cwd: repo });
  // The commit itself has NO trailing pathspec (bare `)"`- so fileB.md is genuinely
  // unscoped and must still be caught, even though a LATER line happens to contain a
  // real, git-verifiable `-- fileA.md` tail on an unrelated command.
  const heredoc = [
    'git commit -m "$(cat <<\'EOF\'',
    'Multi-line commit message.',
    'EOF',
    ')"',
    'git log --oneline -1 -- fileA.md',
  ].join('\n');
  const r = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: heredoc } }, { cwd: repo });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /fileB\.md/);
});

test('git-commit-scope-guard: empty tracker + staged content → WARN, not BLOCK', () => {
  const sid = freshSid('gcsg');
  const repo = makeGitRepo({ branch: 'main', files: { 'fileA.md': 'a' } });
  // no writeGitStageTracker call — this session never recorded a git add
  const r = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: 'git commit -m x' } }, { cwd: repo });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /with staged files, but this session never recorded/);
});

test('git-commit-scope-guard: --amend is skipped entirely (documented carve-out)', () => {
  const sid = freshSid('gcsg');
  const repo = makeGitRepo({ branch: 'main', files: { 'fileA.md': 'a' } });
  writeGitStageTracker(sid, []); // deliberately empty + unrelated file staged — would WARN if not skipped
  const r = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: 'git commit --amend --no-edit' } }, { cwd: repo });
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stderr, /with staged files, but this session never recorded/);
});

test('git-commit-scope-guard v6 fix: a genuine mid-merge (MERGE_HEAD present) is skipped entirely, even with a "foreign-looking" staged file this session never added', () => {
  const sid = freshSid('gcsg');
  const repo = makeGitRepo({ branch: 'main', files: { 'fileA.txt': 'shared base\n' } });
  spawnSync('git', ['commit', '-q', '-m', 'base'], { cwd: repo });
  spawnSync('git', ['branch', 'other'], { cwd: repo }); // both branches diverge from HERE
  fs.writeFileSync(path.join(repo, 'fileA.txt'), 'main version\n');
  spawnSync('git', ['commit', '-q', '-am', 'main change'], { cwd: repo });
  spawnSync('git', ['checkout', '-q', 'other'], { cwd: repo });
  fs.writeFileSync(path.join(repo, 'fileA.txt'), 'other branch version\n');
  spawnSync('git', ['commit', '-q', '-am', 'other change'], { cwd: repo });
  spawnSync('git', ['checkout', '-q', 'main'], { cwd: repo });
  const merge = spawnSync('git', ['merge', 'other'], { cwd: repo, encoding: 'utf8' });
  assert.match(merge.stderr + merge.stdout, /CONFLICT/); // real merge conflict, real MERGE_HEAD
  assert.ok(fs.existsSync(path.join(repo, '.git', 'MERGE_HEAD')), 'MERGE_HEAD must actually exist for this test to mean anything');
  fs.writeFileSync(path.join(repo, 'fileA.txt'), 'resolved\n');
  spawnSync('git', ['add', 'fileA.txt'], { cwd: repo }); // this session's own resolution
  // this session's tracker is deliberately EMPTY — without the v6 fix this would BLOCK
  // exactly like the "ANOTHER session's staged file" test above, on the very file this
  // session itself just resolved.
  writeGitStageTracker(sid, []);
  const r = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: 'git commit --no-edit' } }, { cwd: repo });
  assert.equal(r.status, 0, r.stderr);
});

test('git-commit-scope-guard v6 fix: CHERRY_PICK_HEAD present is also skipped (same structural class as MERGE_HEAD)', () => {
  const sid = freshSid('gcsg');
  const repo = makeGitRepo({ branch: 'main' });
  fs.writeFileSync(path.join(repo, '.git', 'CHERRY_PICK_HEAD'), `${'a'.repeat(40)}\n`);
  fs.writeFileSync(path.join(repo, 'foreign.md'), 'x');
  spawnSync('git', ['add', 'foreign.md'], { cwd: repo });
  writeGitStageTracker(sid, []);
  const r = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: 'git commit -m x' } }, { cwd: repo });
  assert.equal(r.status, 0, r.stderr);
});

test('git-commit-scope-guard v6 fix regression guard: with NO merge/cherry-pick in progress, an unrelated foreign staged file still BLOCKS as before', () => {
  const sid = freshSid('gcsg');
  const repo = makeGitRepo({ branch: 'main', files: { 'fileA.md': 'a' } });
  writeGitStageTracker(sid, ['fileA.md']);
  fs.writeFileSync(path.join(repo, 'fileB.md'), 'b');
  spawnSync('git', ['add', 'fileB.md'], { cwd: repo });
  assert.ok(!fs.existsSync(path.join(repo, '.git', 'MERGE_HEAD')));
  const r = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: 'git commit -m x' } }, { cwd: repo });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /would include files this session never/);
});

test('git-commit-scope-guard: prose mention of "git commit" in a heredoc does NOT trip the gate (same false-positive class as ID-5)', () => {
  const sid = freshSid('gcsg');
  const heredoc = [
    'python3 - <<\'PY\'',
    's = "run git commit -m x when ready"',
    'print(s)',
    'PY',
  ].join('\n');
  const r = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: heredoc } });
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stderr, /would include files this session never|with staged files, but this session never recorded/);
});

test('git-commit-scope-guard M3 fix: `git commit -a`/`--all`/`-am` (auto-stage bypass) is BLOCKED', () => {
  for (const cmd of ['git commit -a -m x', 'git commit --all -m x', 'git commit -am x']) {
    const repo = makeGitRepo({ branch: 'main' });
    const r = run('PreToolUse', { session_id: freshSid('gcsga'), tool_name: 'Bash', tool_input: { command: cmd } }, { cwd: repo });
    assert.equal(r.status, 2, `should block: ${cmd}`);
    assert.match(r.stderr, /git commit -a.*auto-stages/);
  }
  // plain -m (no 'a' cluster) must NOT trip the broad-commit check
  const repo = makeGitRepo({ branch: 'main' });
  const ok = run('PreToolUse', { session_id: freshSid('gcsga'), tool_name: 'Bash', tool_input: { command: 'git commit -m "add a feature"' } }, { cwd: repo });
  assert.equal(ok.status, 0, ok.stderr);
});

test('git-commit-scope-guard cwd-guard: `-C <dir>` targeting a GENUINELY DIFFERENT repo skips the check (fail open)', () => {
  const sid = freshSid('gcsgc');
  const repoA = makeGitRepo({ branch: 'main', files: { 'fileA.md': 'a' } }); // ctx.cwd — irrelevant here
  const repoB = makeGitRepo({ branch: 'main', files: { 'fileB.md': 'b' } }); // the ACTUAL -C target
  writeGitStageTracker(sid, []); // would WARN if the check ran
  const r = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: `git -C ${repoB} commit -m x` } }, { cwd: repoA });
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stderr, /with staged files, but this session never recorded/);
});

test('git-commit-scope-guard v3 fix: `-C <dir>` that resolves to ctx.cwd itself (a no-op) does NOT skip the check — this was the OTHER real-world shape of the 632dd1913 bug class (fixed alongside `cd`)', () => {
  const sid = freshSid('gcsgcv3');
  const repo = makeGitRepo({ branch: 'main', files: { 'fileA.md': 'a' } });
  writeGitStageTracker(sid, []); // empty tracker → check now runs and WARNs (does not silently skip)
  fs.writeFileSync(path.join(repo, 'fileB.md'), 'b');
  spawnSync('git', ['add', 'fileB.md'], { cwd: repo });
  const r = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: `git -C ${repo} commit -m x` } }, { cwd: repo });
  assert.equal(r.status, 0); // empty-tracker path is WARN not BLOCK, but the WARN must now fire
  assert.match(r.stderr, /with staged files, but this session never recorded/);
});

test('git-commit-scope-guard cwd-guard: a leading `cd <dir> &&` in the same command skips the check (fail open, documented)', () => {
  const sid = freshSid('gcsgcd');
  const repo = makeGitRepo({ branch: 'main', files: { 'fileA.md': 'a' } });
  writeGitStageTracker(sid, []);
  const r = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: 'cd /somewhere-else && git commit -m x' } }, { cwd: repo });
  assert.equal(r.status, 0);
});

// ---------------------------------------------------------------- v3 fix (2026-09-02): "any cd" -> "cd that actually resolves elsewhere"
//
// Real incident: commit `632dd1913` was a bare `git commit -m "..."` prefixed
// with `cd /d/Work` (this repo's own near-universal command prefix — see
// .claude/bash-commands.log) where `/d/Work` IS ctx.cwd, not "elsewhere".
// The v2 cwd-guard above bailed on ANY cd/-C, so it never even looked at
// the real `git diff --cached`, and the commit swept another session's
// already-staged files straight through. These tests pin the fix: a cd/-C
// that resolves to the SAME directory as ctx.cwd must NOT skip the check.

test('git-commit-scope-guard v3 fix: `cd <same-dir> &&` (native path, matches ctx.cwd) — check still runs, BLOCKs on another session\'s staged file', () => {
  const sid = freshSid('gcsgv3a');
  const repo = makeGitRepo({ branch: 'main', files: { 'fileA.md': 'a' } });
  writeGitStageTracker(sid, ['fileA.md']);
  fs.writeFileSync(path.join(repo, 'fileB.md'), 'b');
  spawnSync('git', ['add', 'fileB.md'], { cwd: repo });
  const r = run('PreToolUse', {
    session_id: sid, tool_name: 'Bash',
    tool_input: { command: `cd ${repo}\ngit commit -m x` },
  }, { cwd: repo });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /would include files this session never/);
  assert.match(r.stderr, /fileB\.md/);
});

test('git-commit-scope-guard v3 fix: `cd <same-dir>` in Git-Bash MinGW form (`/c/Users/...`, the exact shape 632dd1913 used) — check still runs and BLOCKs', () => {
  const sid = freshSid('gcsgv3b');
  const repo = makeGitRepo({ branch: 'main', files: { 'fileA.md': 'a' } });
  writeGitStageTracker(sid, ['fileA.md']);
  fs.writeFileSync(path.join(repo, 'fileB.md'), 'b');
  spawnSync('git', ['add', 'fileB.md'], { cwd: repo });
  const mingw = process.platform === 'win32'
    ? `/${repo.charAt(0).toLowerCase()}${repo.slice(2).replace(/\\/g, '/')}`
    : repo; // non-Windows CI: no drive-letter form to convert, use the real path
  const r = run('PreToolUse', {
    session_id: sid, tool_name: 'Bash',
    tool_input: { command: `cd ${mingw}\ngit commit -m x` },
  }, { cwd: repo });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /would include files this session never/);
  assert.match(r.stderr, /fileB\.md/);
});

test('git-commit-scope-guard v3 fix: `cd <different-dir>` still fails open (regression guard on the v2 behavior this must NOT lose)', () => {
  const sid = freshSid('gcsgv3c');
  const repoA = makeGitRepo({ branch: 'main', files: { 'fileA.md': 'a' } });
  const repoB = makeGitRepo({ branch: 'main', files: { 'fileB.md': 'b' } }); // genuinely different dir
  writeGitStageTracker(sid, []); // would WARN if the check ran
  const r = run('PreToolUse', {
    session_id: sid, tool_name: 'Bash',
    tool_input: { command: `cd ${repoB}\ngit commit -m x` },
  }, { cwd: repoA });
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stderr, /with staged files, but this session never recorded|would include files this session never/);
});

test('git-add-scope-tracker v3 fix (mirror gap): `cd <same-dir>` prefix does not block normal tracking (previously untested — this rule never checked a preceding cd at all)', () => {
  const sid = freshSid('gastv3a');
  const repo = makeGitRepo({ branch: 'main' });
  fs.writeFileSync(path.join(repo, 'fileA.md'), 'a');
  fs.writeFileSync(path.join(repo, 'fileB.md'), 'b');
  const cmd = `cd ${repo}\ngit add fileA.md fileB.md`;
  const pre = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: cmd } }, { cwd: repo });
  assert.equal(pre.status, 0, pre.stderr);
  spawnSync('git', ['add', 'fileA.md', 'fileB.md'], { cwd: repo });
  const post = run('PostToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: cmd } }, { cwd: repo });
  assert.equal(post.status, 0, post.stderr);
  const recorded = fs.readFileSync(gitStagePathFor(sid), 'utf8').split('\n').filter(Boolean);
  assert.deepEqual(recorded.sort(), ['fileA.md', 'fileB.md']);
  fs.rmSync(gitStagePathFor(sid), { force: true });
});

test('git-add-scope-tracker v3 fix (mirror gap): `cd <different-dir> && git add` no longer records phantom paths against the wrong repo', () => {
  const sid = freshSid('gastv3b');
  const repoA = makeGitRepo({ branch: 'main' });
  const repoB = makeGitRepo({ branch: 'main' });
  fs.writeFileSync(path.join(repoB, 'fileA.md'), 'a'); // really exists in repoB, NOT repoA
  const cmd = `cd ${repoB}\ngit add fileA.md`;
  const pre = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: cmd } }, { cwd: repoA });
  assert.equal(pre.status, 0, pre.stderr);
  spawnSync('git', ['add', 'fileA.md'], { cwd: repoB }); // the real add genuinely happens in repoB
  // PostToolUse still runs with ctx.cwd = repoA (the Bash tool's own cwd
  // never changes just because the command internally cd'd) — the
  // cd-elsewhere bail must fire here too, or this session's repoA tracker
  // would get a phantom "fileA.md" entry despite that file never having
  // touched repoA's index at all.
  const post = run('PostToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: cmd } }, { cwd: repoA });
  assert.equal(post.status, 0, post.stderr);
  const recorded = (readFileSafe(gitStagePathFor(sid)) || '').split('\n').filter(Boolean);
  assert.deepEqual(recorded, [], `expected no phantom tracking, got ${JSON.stringify(recorded)}`);
  fs.rmSync(gitStagePathFor(sid), { force: true });
});

// ---------------------------------------------------------------- git-commit-scope-guard PostToolUse pruning (C1 fix)

test('git-commit-scope-guard C1 fix: a commit that never actually ran (e.g. blocked by a sibling rule) leaves the tracker UNTOUCHED', () => {
  const sid = freshSid('gcsgpost1');
  const repo = makeGitRepo({ branch: 'main', files: { 'fileA.md': 'a' } });
  writeGitStageTracker(sid, ['fileA.md']);
  // Deliberately do NOT run `git commit` for real — fileA.md is still staged,
  // simulating a sibling PreToolUse rule (verify-gate-commit, dangerous-bash,
  // ...) having blocked the same Bash call before it executed.
  const r = run('PostToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: 'git commit -m x' } }, { cwd: repo });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(fs.readFileSync(gitStagePathFor(sid), 'utf8').split('\n').filter(Boolean), ['fileA.md']);
});

test('git-commit-scope-guard C1 fix: a commit that FULLY succeeded clears the tracker', () => {
  const sid = freshSid('gcsgpost2');
  const repo = makeGitRepo({ branch: 'main', files: { 'fileA.md': 'a' } });
  writeGitStageTracker(sid, ['fileA.md']);
  const commitResult = spawnSync('git', ['commit', '-m', 'x'], { cwd: repo, encoding: 'utf8' });
  assert.equal(commitResult.status, 0, commitResult.stderr);
  const r = run('PostToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: 'git commit -m x' } }, { cwd: repo });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(fs.readFileSync(gitStagePathFor(sid), 'utf8').split('\n').filter(Boolean), []);
});

test('git-commit-scope-guard C1 fix: a pathspec-scoped PARTIAL commit shrinks the tracker to the remaining staged file', () => {
  const sid = freshSid('gcsgpost3');
  const repo = makeGitRepo({ branch: 'main', files: { 'fileA.md': 'a', 'fileC.md': 'c' } });
  writeGitStageTracker(sid, ['fileA.md', 'fileC.md']);
  const commitResult = spawnSync('git', ['commit', '-m', 'x', '--', 'fileA.md'], { cwd: repo, encoding: 'utf8' });
  assert.equal(commitResult.status, 0, commitResult.stderr);
  const r = run('PostToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: 'git commit -m x -- fileA.md' } }, { cwd: repo });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(fs.readFileSync(gitStagePathFor(sid), 'utf8').split('\n').filter(Boolean), ['fileC.md']);
});

// ---------------------------------------------------------------- v4 (2026-09-02, critic round 2 on the v3 fix)

test('git-add-scope-tracker v4 fix C1: a call BLOCKED by a sibling rule (never actually ran) records NOTHING at PostToolUse', () => {
  const sid = freshSid('gastv4c1');
  const repo = makeGitRepo({ branch: 'main' });
  fs.writeFileSync(path.join(repo, 'fileA.md'), 'a');
  const cmd = 'git add fileA.md';
  const pre = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: cmd } }, { cwd: repo });
  assert.equal(pre.status, 0, pre.stderr);
  // Deliberately do NOT run the real `git add` — simulates a sibling
  // PreToolUse rule (verify-gate-commit, dangerous-bash, ...) having
  // blocked this exact call before it executed. Old (pre-C1) behavior:
  // the tracker write already happened at PreToolUse regardless.
  const post = run('PostToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: cmd } }, { cwd: repo });
  assert.equal(post.status, 0, post.stderr);
  const recorded = readFileSafe(gitStagePathFor(sid));
  assert.ok(!recorded || !recorded.split('\n').filter(Boolean).length, `expected nothing recorded, got ${JSON.stringify(recorded)}`);
});

test('git-commit-scope-guard v4 fix M1: `-C` mentioned inside a commit MESSAGE (not a real flag) does not disable the scope check', () => {
  const sid = freshSid('gcsgv4m1');
  const repo = makeGitRepo({ branch: 'main', files: { 'fileA.md': 'a' } });
  writeGitStageTracker(sid, ['fileA.md']);
  fs.writeFileSync(path.join(repo, 'fileB.md'), 'b');
  spawnSync('git', ['add', 'fileB.md'], { cwd: repo });
  // Real message from this very fix's own predecessor commit (critic found
  // this live, not hypothetically).
  const r = run('PreToolUse', {
    session_id: sid, tool_name: 'Bash',
    tool_input: { command: 'git commit -m "refactor: honour git -C /elsewhere in hooks"' },
  }, { cwd: repo });
  assert.equal(r.status, 2, r.stderr); // must still BLOCK on fileB.md, not silently skip
  assert.match(r.stderr, /fileB\.md/);
});

test('git-commit-scope-guard v4 fix M2: `cd` typed AFTER the commit in a chained command does not disable the check (shell runs left to right)', () => {
  const sid = freshSid('gcsgv4m2');
  const repo = makeGitRepo({ branch: 'main', files: { 'fileA.md': 'a' } });
  writeGitStageTracker(sid, ['fileA.md']);
  fs.writeFileSync(path.join(repo, 'fileB.md'), 'b');
  spawnSync('git', ['add', 'fileB.md'], { cwd: repo });
  const r = run('PreToolUse', {
    session_id: sid, tool_name: 'Bash',
    tool_input: { command: 'git commit -m x && cd /somewhere-else' },
  }, { cwd: repo });
  assert.equal(r.status, 2, r.stderr); // the trailing cd cannot have affected the commit that already ran
  assert.match(r.stderr, /fileB\.md/);
});

test('git-add-scope-tracker v4 fix M3: a quoted path with a space records correctly (not shredded into garbage tokens)', () => {
  const sid = freshSid('gastv4m3');
  const repo = makeGitRepo({ branch: 'main' });
  fs.mkdirSync(path.join(repo, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'docs', 'my file.md'), 'x');
  const cmd = 'git add "docs/my file.md"';
  const pre = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: cmd } }, { cwd: repo });
  assert.equal(pre.status, 0, pre.stderr);
  spawnSync('git', ['add', 'docs/my file.md'], { cwd: repo });
  const post = run('PostToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: cmd } }, { cwd: repo });
  assert.equal(post.status, 0, post.stderr);
  const recorded = fs.readFileSync(gitStagePathFor(sid), 'utf8').split('\n').filter(Boolean);
  assert.deepEqual(recorded, ['docs/my file.md']);
  fs.rmSync(gitStagePathFor(sid), { force: true });
});

test('git-commit-scope-guard v4 fix M4: a trailing `-- <file>` on a LATER, unrelated chained command is not misattributed to the commit', () => {
  const sid = freshSid('gcsgv4m4');
  const repo = makeGitRepo({ branch: 'main', files: { 'fileA.md': 'a', 'README.md': 'r' } });
  writeGitStageTracker(sid, ['fileA.md']);
  fs.writeFileSync(path.join(repo, 'fileB.md'), 'b');
  spawnSync('git', ['add', 'fileB.md'], { cwd: repo });
  // `-- README.md` belongs to `git log`, NOT to the commit — the OLD bug
  // scanned the whole line's last `-- <tokens>` and treated the commit as
  // "scoped, nothing to compare", silently skipping the check entirely.
  const r = run('PreToolUse', {
    session_id: sid, tool_name: 'Bash',
    tool_input: { command: 'git commit -m "x" && git log --oneline -1 -- README.md' },
  }, { cwd: repo });
  assert.equal(r.status, 2, r.stderr); // must still BLOCK on fileB.md
  assert.match(r.stderr, /fileB\.md/);
});

test('git-add-scope-tracker v4 fix m5: `git add -n` / `--dry-run` is not treated as a real broad add', () => {
  for (const cmd of ['git add -n -A', 'git add --dry-run -A', 'git add -n .']) {
    const r = run('PreToolUse', { session_id: freshSid('gastv4m5'), tool_name: 'Bash', tool_input: { command: cmd } });
    assert.equal(r.status, 0, `should NOT block (dry run): ${cmd} -- ${r.stderr}`);
  }
});

test('git-commit-scope-guard v4 fix m6: a commit MESSAGE containing "-a" does not false-positive the broad-commit block', () => {
  const repo = makeGitRepo({ branch: 'main', files: { 'fileA.md': 'a' } });
  const sid = freshSid('gcsgv4m6');
  writeGitStageTracker(sid, ['fileA.md']);
  const r = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: 'git commit -m "fix -a flag"' } }, { cwd: repo });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /auto-stages every modified tracked file/);
});

test('git-commit-scope-guard v4 (same-command self-cover): `git add fileA && git commit` (bare, first-ever add this session) still BLOCKs on another session\'s real staged file', () => {
  // With recording moved to PostToolUse (C1 fix), the persisted tracker is
  // empty when this chained command's OWN commit segment runs its
  // PreToolUse check -- without the self-cover fix this would fall into
  // the empty-tracker WARN-only path (weaker than before the C1 fix) even
  // though the command's own `git add fileA.md` clearly claims fileA.md.
  const sid = freshSid('gcsgselfcover');
  const repo = makeGitRepo({ branch: 'main', files: { 'fileB.md': 'b' } }); // another session's real staged file
  fs.writeFileSync(path.join(repo, 'fileA.md'), 'a');
  const r = run('PreToolUse', {
    session_id: sid, tool_name: 'Bash',
    tool_input: { command: 'git add fileA.md && git commit -m x' },
  }, { cwd: repo });
  assert.equal(r.status, 2, r.stderr); // BLOCK, not WARN -- fileB.md is foreign, fileA.md is self-covered
  assert.match(r.stderr, /fileB\.md/);
});

test('git-commit-scope-guard v4 (same-command self-cover): still only WARNs when there is truly no earlier add in this command AND no persisted tracker', () => {
  const sid = freshSid('gcsgselfcovernone');
  const repo = makeGitRepo({ branch: 'main', files: { 'fileB.md': 'b' } });
  const r = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: 'git commit -m x' } }, { cwd: repo });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /with staged files, but this session never recorded/);
});

test('git-commit-scope-guard v4 fix m1: a bare POSIX-style `cd` target with NO recognized drive convention is never treated as same-dir, even when it is lexically reconstructable from ctx.cwd itself', () => {
  // Critic finding m1: `path.resolve('/Work')` on win32 resolves against
  // the CURRENT PROCESS's drive, which can accidentally equal baseDir's
  // drive and produce a FALSE "same directory" for a path that, on a real
  // Git-Bash shell, means something else entirely (relative to the MSYS
  // install root, not any Windows drive root). This reconstructs the
  // dangerous shape deterministically (independent of which real drive the
  // test machine uses): a bare-POSIX target built FROM repo's own path
  // (so pre-fix `path.resolve` would round-trip back to repo, i.e. LOOK
  // like a match) must still be treated as unresolvable, not "same".
  const sid = freshSid('gcsgv4m1b');
  const repo = makeGitRepo({ branch: 'main', files: { 'fileA.md': 'a' } });
  writeGitStageTracker(sid, ['fileA.md']);
  fs.writeFileSync(path.join(repo, 'fileB.md'), 'b');
  spawnSync('git', ['add', 'fileB.md'], { cwd: repo });
  const root = path.parse(repo).root; // e.g. "C:\\"
  const bareposix = '/' + path.relative(root, repo).replace(/\\/g, '/');
  const r = run('PreToolUse', {
    session_id: sid, tool_name: 'Bash',
    tool_input: { command: `cd ${bareposix}\ngit commit -m x` },
  }, { cwd: repo });
  // Treated as "elsewhere" (unresolvable) -> fail open, completely silent —
  // NOT a wrongly-permissive "same dir, run the check" verdict either way,
  // but specifically NOT the dangerous false-"same" direction.
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /fileB\.md/);
});

test('git-commit-scope-guard v4 (pathspec-tail tokenizer consistency, found via self-review not critic): a quoted pathspec with a space after `--` is recognized as a real scoped pathspec, not shredded into garbage tokens', () => {
  // Differentiator: another session's real staged file (fileB.md) is ALSO
  // present. Pre-fix, the whitespace split shreds `"docs/my file.md"` into
  // two garbage tokens that resolve via `git ls-files` to nothing real, so
  // isRealPathspec() returns false and the commit falls through to the
  // normal foreign-file check -- which then correctly BLOCKs on fileB.md,
  // but for the WRONG reason (masking that the pathspec recognition itself
  // is broken). Post-fix, the quoted path is recognized as one real token,
  // isRealPathspec() succeeds, and the commit is treated as scoped --
  // "nothing to compare" -- passing regardless of fileB.md.
  const sid = freshSid('gcsgpathspecquote');
  const repo = makeGitRepo({ branch: 'main' });
  fs.mkdirSync(path.join(repo, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'docs', 'my file.md'), 'x');
  spawnSync('git', ['add', 'docs/my file.md'], { cwd: repo });
  fs.writeFileSync(path.join(repo, 'fileB.md'), 'b'); // another session's real staged file
  spawnSync('git', ['add', 'fileB.md'], { cwd: repo });
  const r = run('PreToolUse', {
    session_id: sid, tool_name: 'Bash',
    tool_input: { command: 'git commit -m x -- "docs/my file.md"' },
  }, { cwd: repo });
  assert.equal(r.status, 0, r.stderr); // scoped pathspec recognized -> pass, fileB.md irrelevant
  assert.doesNotMatch(r.stderr, /never recorded|would include files/);
});

test('git-commit-scope-guard v4 (heredoc-detection hardening, found via self-review not critic): a COMPLETE, properly-closed commit message containing literal "<<word" text near its end is NOT mistaken for an open heredoc', () => {
  // `git commit -m "foo <<bar" && git log --oneline -1 -- README.md` — the
  // message is fully closed (even quote count); the shape-only regex
  // (`/<<-?\s*['"]?(\w+)['"]?\s*$/`) alone would still match "<<bar\"" at
  // the string's end and wrongly trigger the whole-text-last-line fallback,
  // picking up the LATER git log command's own `-- README.md` — the exact
  // M4 vulnerability this fix exists to close, reopened through a
  // different trigger.
  const sid = freshSid('gcsgheredoc');
  const repo = makeGitRepo({ branch: 'main', files: { 'fileA.md': 'a', 'README.md': 'r' } });
  writeGitStageTracker(sid, ['fileA.md']);
  fs.writeFileSync(path.join(repo, 'fileB.md'), 'b');
  spawnSync('git', ['add', 'fileB.md'], { cwd: repo });
  const r = run('PreToolUse', {
    session_id: sid, tool_name: 'Bash',
    tool_input: { command: 'git commit -m "foo <<bar" && git log --oneline -1 -- README.md' },
  }, { cwd: repo });
  assert.equal(r.status, 2, r.stderr); // must still BLOCK on fileB.md
  assert.match(r.stderr, /fileB\.md/);
});

test('git-commit-scope-guard v4 (self-cover hardening, found via self-review not critic): an EARLIER add segment with its own `-C <elsewhere>` is NOT self-covered', () => {
  // `git -C /elsewhere add fileA && git commit -m x` -- the add's OWN -C
  // sends it to a DIFFERENT repository's index, not ctx.cwd's. Without this
  // guard, literalCandidatesUpTo() would blindly credit fileA to this
  // session even though the real `git add` never touched ctx.cwd at all.
  const sid = freshSid('gcsgselfcoverc');
  const repoA = makeGitRepo({ branch: 'main' }); // ctx.cwd
  const repoB = makeGitRepo({ branch: 'main' }); // the ACTUAL -C target
  // Coincidence that makes the gap observable: repoA has a genuinely
  // foreign file (another session's) NAMED THE SAME as what the diverted
  // add claims to touch.
  fs.writeFileSync(path.join(repoA, 'fileA.md'), 'foreign-in-repoA');
  spawnSync('git', ['add', 'fileA.md'], { cwd: repoA }); // "another session" really staged this in repoA
  const r = run('PreToolUse', {
    session_id: sid, tool_name: 'Bash',
    tool_input: { command: `git -C ${repoB} add fileA.md && git commit -m x` },
  }, { cwd: repoA });
  // The persisted tracker is ALSO empty here (nothing else staged this
  // session), so this lands in the standard empty-tracker WARN path, same
  // as any other "no track record" commit — the point of this test is that
  // it must NOT silently pass (status 0, no warning) by wrongly crediting
  // fileA.md to the diverted add. Before the fix, `tracked` would have
  // included fileA.md via self-cover, `covered` would have matched it via
  // the real (repoA) git diff --cached, and this would exit 0 SILENTLY.
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /with staged files, but this session never recorded/);
  assert.match(r.stderr, /fileA\.md/);
});

test('git-commit-scope-guard v4 fix m8: a tracker with >100 entries (chunked pathspec query) still correctly detects a foreign staged file', () => {
  const sid = freshSid('gcsgv4m8');
  const files = {};
  const many = [];
  for (let i = 0; i < 150; i++) {
    const name = `bulk/file-${String(i).padStart(3, '0')}.md`;
    files[name] = String(i);
    many.push(name);
  }
  const repo = makeGitRepo({ branch: 'main', files });
  writeGitStageTracker(sid, many); // 150 entries -- exceeds PATHSPEC_CHUNK_SIZE (100)
  fs.writeFileSync(path.join(repo, 'foreign.md'), 'f');
  spawnSync('git', ['add', 'foreign.md'], { cwd: repo });
  const r = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: 'git commit -m x' } }, { cwd: repo });
  assert.equal(r.status, 2, r.stderr); // must still BLOCK, not fail open just because the tracker is large
  assert.match(r.stderr, /foreign\.md/);
});

test('git-commit-scope-guard v4 fix m2: multiple cumulative `-C` flags are all checked, not just the first', () => {
  const sid = freshSid('gcsgv4m2b');
  const repoA = makeGitRepo({ branch: 'main' });
  const repoB = makeGitRepo({ branch: 'main', files: { 'fileB.md': 'b' } });
  writeGitStageTracker(sid, []);
  // git -C repoA -C repoB commit: the SECOND -C wins in real git (each is
  // relative to the previous); a checker that only inspects the FIRST -C
  // would wrongly conclude "targets repoA" and evaluate the wrong repo's
  // git state (repoA, empty) instead of the real target (repoB, where
  // fileB.md is genuinely staged).
  const r = run('PreToolUse', {
    session_id: sid, tool_name: 'Bash',
    tool_input: { command: `git -C ${repoA} -C ${repoB} commit -m x` },
  }, { cwd: repoA });
  // Either -C target differing from ctx.cwd (repoA) is enough to fail open
  // — this must NOT evaluate repoB's real state and produce a wrong verdict.
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /fileB\.md/);
});

// ---------------------------------------------------------------- session-edit-tracker (2026-09-03, ao-close.ps1 scoped-add)

test('session-edit-tracker: Write/Edit records the file regardless of extension (not just code files)', () => {
  const sid = freshSid('setmd');
  const r = run('PostToolUse', { session_id: sid, tool_name: 'Edit', tool_input: { file_path: '/x/agency-os/WORKLOG.md' } });
  assert.equal(r.status, 0, r.stderr);
  const recorded = fs.readFileSync(sessionEditPathFor(sid), 'utf8').split('\n').filter(Boolean);
  assert.deepEqual(recorded, ['/x/agency-os/WORKLOG.md']);
  fs.rmSync(sessionEditPathFor(sid), { force: true });
});

test('session-edit-tracker: MultiEdit edits[] shape is recorded too (matches existing Write|Edit matcher reach)', () => {
  const sid = freshSid('setme');
  const r = run('PostToolUse', {
    session_id: sid, tool_name: 'MultiEdit',
    tool_input: { edits: [{ file_path: '/x/a.md' }, { file_path: '/x/b.py' }] },
  });
  assert.equal(r.status, 0, r.stderr);
  const recorded = fs.readFileSync(sessionEditPathFor(sid), 'utf8').split('\n').filter(Boolean);
  assert.deepEqual(recorded.sort(), ['/x/a.md', '/x/b.py']);
  fs.rmSync(sessionEditPathFor(sid), { force: true });
});

test('session-edit-tracker: does not clear on /verify-recent (separate tracker from code-change-tracker.js)', () => {
  const sid = freshSid('setsep');
  run('PostToolUse', { session_id: sid, tool_name: 'Edit', tool_input: { file_path: '/x/src/foo.ts' } });
  // code-change-tracker.js's tracker (trackerPathFor) is a DIFFERENT file —
  // clearing IT (what /verify-recent does) must not touch this one.
  fs.rmSync(trackerPathFor(sid), { force: true });
  const recorded = fs.readFileSync(sessionEditPathFor(sid), 'utf8').split('\n').filter(Boolean);
  assert.deepEqual(recorded, ['/x/src/foo.ts']);
  fs.rmSync(sessionEditPathFor(sid), { force: true });
});

test('session-edit-tracker: dedups repeated edits to the same file', () => {
  const sid = freshSid('setdedup');
  run('PostToolUse', { session_id: sid, tool_name: 'Edit', tool_input: { file_path: '/x/a.md' } });
  run('PostToolUse', { session_id: sid, tool_name: 'Edit', tool_input: { file_path: '/x/a.md' } });
  run('PostToolUse', { session_id: sid, tool_name: 'Write', tool_input: { file_path: '/x/b.md' } });
  const recorded = fs.readFileSync(sessionEditPathFor(sid), 'utf8').split('\n').filter(Boolean);
  assert.deepEqual(recorded, ['/x/a.md', '/x/b.md']);
  fs.rmSync(sessionEditPathFor(sid), { force: true });
});

// ---------------------------------------------------------------- doc-link-commit-check (PostToolUse Bash)
// Scratch repos shaped like Work (lobster-factory/scripts/validate-doc-integrity.mjs + agency-os/), so
// the rule runs the REAL validator in --commit mode, exactly as in production.
const DOC_VALIDATOR_SRC = fs.readFileSync(path.join(REPO_ROOT, 'lobster-factory', 'scripts', 'validate-doc-integrity.mjs'), 'utf8');

function docRepo(files, { validator = DOC_VALIDATOR_SRC } = {}) {
  const all = { 'agency-os/WORKLOG.md': '# Worklog\n', ...files };
  if (validator !== null) all['lobster-factory/scripts/validate-doc-integrity.mjs'] = validator;
  const repo = makeGitRepo({ branch: 'feature', files: all });
  spawnSync('git', ['commit', '-q', '-m', 'base'], { cwd: repo });
  return repo;
}

// Applies `change` ({ path: content | null }) as one real commit; returns git's own stdout for it.
function commitChange(repo, change, { quiet = false, env = {} } = {}) {
  for (const [rel, content] of Object.entries(change)) {
    const p = path.join(repo, rel);
    if (content === null) fs.rmSync(p);
    else { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); }
  }
  spawnSync('git', ['add', '-A'], { cwd: repo });
  const r = spawnSync('git', ['commit', ...(quiet ? ['-q'] : []), '-m', 'change'], {
    cwd: repo, encoding: 'utf8', env: { ...process.env, ...env },
  });
  assert.equal(r.status, 0, `scratch commit failed: ${r.stdout}${r.stderr}`);
  if (!quiet) assert.match(r.stdout, /^\[[^\s\]]+ [0-9a-f]+\] change/m);
  return r.stdout;
}

function postCommit(repo, stdout, { command = 'git commit -m change', home } = {}) {
  return run('PostToolUse', {
    session_id: freshSid('dlc'), tool_name: 'Bash', tool_input: { command },
    tool_response: { stdout, stderr: '', interrupted: false },
  }, { cwd: repo, home });
}

test('doc-link-commit-check: one-level-short link (the ADR 011 shape) → fed back to the committing agent', () => {
  const repo = docRepo({});
  const out = commitChange(repo, { 'agency-os/docs/architecture/decisions/011-x.md': '[w](../../WORKLOG.md)\n' });
  const r = postCommit(repo, out);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /DOC LINKS: commit [0-9a-f]+ leaves 1 broken/);
  assert.match(r.stderr, /011-x\.md -> \.\.\/\.\.\/WORKLOG\.md .*agency-os\/docs\/WORKLOG\.md/);
});

test('doc-link-commit-check: correct link → silent', () => {
  const repo = docRepo({});
  const out = commitChange(repo, { 'agency-os/docs/architecture/decisions/011-x.md': '[w](../../../WORKLOG.md)\n' });
  const r = postCommit(repo, out);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /DOC LINKS/);
});

test('doc-link-commit-check: deleting a linked file blames the deleting commit (the linking file is untouched)', () => {
  const repo = docRepo({ 'agency-os/docs/a.md': 'see [b](b.md)\n', 'agency-os/docs/b.md': '# b\n' });
  const out = commitChange(repo, { 'agency-os/docs/b.md': null });
  const r = postCommit(repo, out);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /agency-os\/docs\/a\.md -> b\.md\s+\(this commit removed the target\)/);
});

test('doc-link-commit-check: case mismatch is broken (a CI checkout is case-sensitive; the Windows disk scan is not)', () => {
  const repo = docRepo({});
  const out = commitChange(repo, { 'agency-os/docs/c.md': '[w](../worklog.md)\n' });
  const r = postCommit(repo, out);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /c\.md -> \.\.\/worklog\.md/);
});

test('doc-link-commit-check: markdown outside the gate\'s scan roots is not judged (runbooks/)', () => {
  const repo = docRepo({});
  const out = commitChange(repo, { 'runbooks/r.md': '[x](nope.md)\n' });
  assert.equal(postCommit(repo, out).status, 0);
});

test('doc-link-commit-check: not a commit command → no check, even with a success-shaped line in its output', () => {
  const repo = docRepo({});
  const out = commitChange(repo, { 'agency-os/docs/d.md': '[x](nope.md)\n' });
  assert.equal(postCommit(repo, out, { command: 'git log -1' }).status, 0);
});

test('doc-link-commit-check: git commit that made no commit (no success line, no recent reflog commit) → no check', () => {
  const repo = docRepo({});
  // Backdated: the reflog entry carries the committer date, so it falls outside the fallback window.
  commitChange(repo, { 'agency-os/docs/d.md': '[x](nope.md)\n' }, { env: { GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z' } });
  assert.equal(postCommit(repo, 'nothing to commit, working tree clean\n').status, 0);
});

test('doc-link-commit-check: `git commit -q` prints no success line → found through HEAD\'s reflog, still reported', () => {
  const repo = docRepo({});
  const out = commitChange(repo, { 'agency-os/docs/q.md': '[x](nope.md)\n' }, { quiet: true });
  assert.equal(out.trim(), '');
  const r = postCommit(repo, out, { command: 'git commit -q -m change' });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /q\.md -> nope\.md/);
});

test('doc-link-commit-check: merge → judges the conflict resolution, not a file taken whole from one side', () => {
  const repo = docRepo({ 'agency-os/docs/m.md': 'base\n' });
  const g = (...args) => spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  g('checkout', '-q', '-b', 'other');
  commitChange(repo, { 'agency-os/docs/m.md': 'theirs\n', 'agency-os/docs/theirs-only.md': '[x](gone.md)\n' });
  g('checkout', '-q', 'feature');
  commitChange(repo, { 'agency-os/docs/m.md': 'ours\n' });
  g('merge', '-q', 'other'); // conflicts on m.md
  fs.writeFileSync(path.join(repo, 'agency-os', 'docs', 'm.md'), 'resolved [w](../nope.md)\n');
  g('add', 'agency-os/docs/m.md');
  const merged = g('commit', '--no-edit');
  assert.match(merged.stdout, /^\[feature [0-9a-f]+\] Merge branch 'other'/m, merged.stdout + merged.stderr);
  const r = postCommit(repo, merged.stdout, { command: 'git commit --no-edit' });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /m\.md -> \.\.\/nope\.md/);
  assert.doesNotMatch(r.stderr, /theirs-only\.md/);
});

test('doc-link-commit-check: repo without the validator (not Work) → no-op', () => {
  const repo = docRepo({}, { validator: null });
  const out = commitChange(repo, { 'agency-os/docs/e.md': '[x](nope.md)\n' });
  assert.equal(postCommit(repo, out).status, 0);
});

test('doc-link-commit-check: validator crash → fail-open and logged, never blocks', () => {
  const repo = docRepo({}, { validator: 'throw new Error("boom");\n' });
  const out = commitChange(repo, { 'agency-os/docs/f.md': '[x](nope.md)\n' });
  const home = makeTmpHome();
  const r = postCommit(repo, out, { home });
  assert.equal(r.status, 0, r.stderr);
  assert.match(readFileSafe(path.join(home, '.claude', 'verify-gate-failures.log')) || '', /doc-link-commit-check/);
});

test('doc-link-commit-check: Codex host (plain-string tool_response) → JSON block decision', () => {
  const repo = docRepo({});
  const out = commitChange(repo, { 'agency-os/docs/g.md': '[x](nope.md)\n' });
  const r = runNode(RUNNER, {
    session_id: freshSid('dlcx'), turn_id: 't1', tool_name: 'shell',
    tool_input: { command: 'git commit -m change' }, tool_response: out,
  }, { args: ['PostToolUse', '--host=codex'], cwd: repo });
  assert.equal(r.status, 0, r.stderr);
  const decision = JSON.parse(r.stdout);
  assert.equal(decision.decision, 'block');
  assert.match(decision.reason, /DOC LINKS/);
});
