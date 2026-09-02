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
  gitStagePathFor, writeGitStageTracker,
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
  const r = run('SubagentStart', {
    hook_event_name: 'SubagentStart',
    agent_name: 'critic',
    private_note: 'must-not-echo',
  });
  assert.equal(r.status, 0);
  const output = JSON.parse(r.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, 'SubagentStart');
  assert.match(output.hookSpecificOutput.additionalContext, /30-year, LEGO-like system/);
  assert.doesNotMatch(r.stdout, /must-not-echo/);
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
