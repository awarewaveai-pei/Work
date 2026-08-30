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
  const accFile = path.join(process.env.TMPDIR ? process.env.TMPDIR.replace(/\/$/, '') : '/tmp', `claude-edited-${sid}.txt`);
  assert.match(readFileSafe(accFile) || '', /a\.js/);
  const stop = run('Stop', { session_id: sid }, { cwd: tmp });
  assert.equal(stop.status, 0);
  assert.equal(readFileSafe(accFile), null);
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

test('git-add-scope-tracker M5 fix: broad add WITH the # CONFIRMED-HIGH-RISK ack unlocks and records the real dry-run listing (not blind trust)', () => {
  const sid = freshSid('gastack');
  const repo = makeGitRepo({ branch: 'main' });
  fs.writeFileSync(path.join(repo, 'newfile.md'), 'n');
  const r = run('PreToolUse', {
    session_id: sid, tool_name: 'Bash',
    tool_input: { command: '# CONFIRMED-HIGH-RISK: deliberate broad add, reviewed\ngit add -A' },
  }, { cwd: repo });
  assert.equal(r.status, 0, r.stderr);
  const recorded = fs.readFileSync(gitStagePathFor(sid), 'utf8').split('\n').filter(Boolean);
  assert.ok(recorded.includes('newfile.md'), `expected newfile.md in ${JSON.stringify(recorded)}`);
});

test('git-add-scope-tracker: explicit file list passes and is recorded in the tracker', () => {
  const sid = freshSid('gast');
  const r = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: 'git add fileA.md fileB.md' } });
  assert.equal(r.status, 0);
  const recorded = fs.readFileSync(gitStagePathFor(sid), 'utf8').split('\n').filter(Boolean);
  assert.deepEqual(recorded, ['fileA.md', 'fileB.md']);
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
  const cmd = 'git add \\\n  fileA.md \\\n  fileB.md';
  const r = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: cmd } });
  assert.equal(r.status, 0, r.stderr);
  const recorded = fs.readFileSync(gitStagePathFor(sid), 'utf8').split('\n').filter(Boolean);
  assert.deepEqual(recorded, ['fileA.md', 'fileB.md']);
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
  const r1 = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: 'git rm old.md' } });
  assert.equal(r1.status, 0);
  const r2 = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: 'git mv from.md to.md' } });
  assert.equal(r2.status, 0);
  const recorded = fs.readFileSync(gitStagePathFor(sid), 'utf8').split('\n').filter(Boolean);
  assert.deepEqual(recorded, ['old.md', 'from.md', 'to.md']);
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

test('git-commit-scope-guard cwd-guard: `-C <dir>` on the commit itself skips the check (fail open, documented)', () => {
  const sid = freshSid('gcsgc');
  const repo = makeGitRepo({ branch: 'main', files: { 'fileA.md': 'a' } });
  writeGitStageTracker(sid, []); // empty tracker — would normally WARN if the check ran
  fs.writeFileSync(path.join(repo, 'fileB.md'), 'b');
  spawnSync('git', ['add', 'fileB.md'], { cwd: repo });
  const r = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: `git -C ${repo} commit -m x` } }, { cwd: repo });
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stderr, /with staged files, but this session never recorded/);
});

test('git-commit-scope-guard cwd-guard: a leading `cd <dir> &&` in the same command skips the check (fail open, documented)', () => {
  const sid = freshSid('gcsgcd');
  const repo = makeGitRepo({ branch: 'main', files: { 'fileA.md': 'a' } });
  writeGitStageTracker(sid, []);
  const r = run('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: 'cd /somewhere-else && git commit -m x' } }, { cwd: repo });
  assert.equal(r.status, 0);
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
