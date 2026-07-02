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

import {
  runNode, freshSid, makeGitRepo, makeTmpHome,
  trackerPathFor, writeTracker, readFileSafe, REPO_ROOT, HOOKS_DIR,
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
