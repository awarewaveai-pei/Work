// M1 — behavior lock for the LEGACY hook files (pre-runner architecture).
// Every test documents live behavior verified 2026-07-02, including known bugs
// (the hooks.json inline `.input` field bug) and known bypasses (bash -c wrap).
// The v2 runner parity suite (runner-parity.test.mjs) reuses these payloads and
// declares which behaviors are intentionally different.
//
// Run: node --test tests/hooks/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  runHook, runShell, freshSid, makeGitRepo, makeTmpHome,
  trackerPathFor, writeTracker, readFileSafe, REPO_ROOT,
} from './helpers.mjs';

// ---------------------------------------------------------------- high-risk-bash-warn
test('high-risk: docker compose down → BLOCK exit 2', () => {
  const r = runHook('high-risk-bash-warn.js', { tool_input: { command: 'docker compose down' } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /HIGH-RISK OPERATION BLOCKED/);
});

test('high-risk: leading CONFIRMED-HIGH-RISK ACK → pass', () => {
  const r = runHook('high-risk-bash-warn.js', {
    tool_input: { command: '# CONFIRMED-HIGH-RISK: test\ndocker compose down' },
  });
  assert.equal(r.status, 0);
});

test('high-risk: rsync to prod IP → BLOCK', () => {
  const r = runHook('high-risk-bash-warn.js', {
    tool_input: { command: 'rsync -av ./ root@5.223.93.113:/root/' },
  });
  assert.equal(r.status, 2);
});

test('high-risk: db migration deploy → BLOCK', () => {
  const r = runHook('high-risk-bash-warn.js', { tool_input: { command: 'prisma migrate deploy' } });
  assert.equal(r.status, 2);
});

test('high-risk: malformed JSON stdin → fail-open pass', () => {
  const r = runHook('high-risk-bash-warn.js', 'NOT-JSON-{{{');
  assert.equal(r.status, 0);
});

test('high-risk: KNOWN TRADE-OFF — `cd x && docker compose down` chain passes (documented in hook header)', () => {
  const r = runHook('high-risk-bash-warn.js', { tool_input: { command: 'cd /srv && docker compose down' } });
  assert.equal(r.status, 0);
});

test('high-risk: KNOWN BYPASS (legacy) — bash -c "docker compose down" passes; v2 runner closes this', () => {
  const r = runHook('high-risk-bash-warn.js', { tool_input: { command: 'bash -c "docker compose down"' } });
  assert.equal(r.status, 0);
});

// ---------------------------------------------------------------- git-log-injector
test('git-log-injector: first Write/Edit blocks with git log, re-issue passes', () => {
  const sid = freshSid('gli');
  const payload = {
    session_id: sid,
    tool_name: 'Edit',
    tool_input: { file_path: path.join(REPO_ROOT, 'README.md') },
  };
  const first = runHook('git-log-injector.js', payload);
  assert.equal(first.status, 2);
  assert.match(first.stderr, /GIT LOG/);
  const second = runHook('git-log-injector.js', payload);
  assert.equal(second.status, 0);
});

test('git-log-injector: non-git path → pass (fail-open, flag cleaned for retry)', () => {
  const sid = freshSid('gli-nogit');
  const tmp = makeTmpHome();
  const r = runHook('git-log-injector.js', {
    session_id: sid,
    tool_name: 'Edit',
    tool_input: { file_path: path.join(tmp, 'x.md') },
  }, { cwd: tmp });
  assert.equal(r.status, 0);
});

// ---------------------------------------------------------------- auto-repair-guard
test('auto-repair-guard: sg-deploy.sh path blocks once per category, re-issue passes', () => {
  const sid = freshSid('arg');
  const payload = {
    session_id: sid,
    tool_name: 'Edit',
    tool_input: { file_path: '/x/lobster-factory/infra/hetzner-phase1-core/scripts/sg-deploy.sh' },
  };
  const first = runHook('auto-repair-guard.js', payload);
  assert.equal(first.status, 2);
  assert.match(first.stderr, /AUTO-REPAIR PATH DETECTED/);
  const second = runHook('auto-repair-guard.js', payload);
  assert.equal(second.status, 0);
});

test('auto-repair-guard: unrelated path → pass', () => {
  const r = runHook('auto-repair-guard.js', {
    session_id: freshSid('arg2'),
    tool_input: { file_path: '/x/some/normal/file.ts' },
  });
  assert.equal(r.status, 0);
});

// ---------------------------------------------------------------- file-path-router
test('file-path-router: auth path routes once, re-issue passes', () => {
  const sid = freshSid('fpr');
  const payload = {
    session_id: sid,
    tool_name: 'Edit',
    tool_input: { file_path: '/x/app/auth/login.ts' },
  };
  const first = runHook('file-path-router.js', payload);
  assert.equal(first.status, 2);
  assert.match(first.stderr, /AUTH \/ RLS \/ PERMISSION/);
  const second = runHook('file-path-router.js', payload);
  assert.equal(second.status, 0);
});

// ---------------------------------------------------------------- verify-gate trio
test('verify-gate-commit: git commit with non-empty tracker → BLOCK', () => {
  const sid = freshSid('vgc');
  writeTracker(sid, ['/x/foo.ts']);
  const r = runHook('verify-gate-commit.js', {
    session_id: sid,
    tool_input: { command: 'git commit -m "x"' },
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /UNVERIFIED CODE FILES/);
  fs.rmSync(trackerPathFor(sid), { force: true });
});

test('verify-gate-commit: empty tracker → pass', () => {
  const r = runHook('verify-gate-commit.js', {
    session_id: freshSid('vgc2'),
    tool_input: { command: 'git commit -m "x"' },
  });
  assert.equal(r.status, 0);
});

test('verify-gate-commit: non-commit command → pass even with tracker', () => {
  const sid = freshSid('vgc3');
  writeTracker(sid, ['/x/foo.ts']);
  const r = runHook('verify-gate-commit.js', {
    session_id: sid,
    tool_input: { command: 'git status' },
  });
  assert.equal(r.status, 0);
  fs.rmSync(trackerPathFor(sid), { force: true });
});

test('verify-gate-commit: base64|bash obfuscation with tracker → BLOCK', () => {
  const sid = freshSid('vgc4');
  writeTracker(sid, ['/x/foo.ts']);
  const r = runHook('verify-gate-commit.js', {
    session_id: sid,
    tool_input: { command: 'echo Y29tbWl0 | base64 -d | bash' },
  });
  assert.equal(r.status, 2);
  fs.rmSync(trackerPathFor(sid), { force: true });
});

test('verify-gate-commit: git commit-tree is NOT a commit → pass', () => {
  const sid = freshSid('vgc5');
  writeTracker(sid, ['/x/foo.ts']);
  const r = runHook('verify-gate-commit.js', {
    session_id: sid,
    tool_input: { command: 'git commit-tree HEAD^{tree} -m x' },
  });
  assert.equal(r.status, 0);
  fs.rmSync(trackerPathFor(sid), { force: true });
});

test('code-change-tracker: .ts edit appends to tracker, exit 0, reminder on stderr', () => {
  const sid = freshSid('cct');
  const r = runHook('code-change-tracker.js', {
    session_id: sid,
    tool_name: 'Edit',
    tool_input: { file_path: '/x/src/logic.ts' },
  });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /CODE FILE MODIFIED/);
  assert.match(readFileSafe(trackerPathFor(sid)) || '', /\/x\/src\/logic\.ts/);
  fs.rmSync(trackerPathFor(sid), { force: true });
});

test('code-change-tracker: test files and non-code files are ignored', () => {
  const sid = freshSid('cct2');
  const r = runHook('code-change-tracker.js', {
    session_id: sid,
    tool_input: { file_path: '/x/src/logic.test.ts' },
  });
  assert.equal(r.status, 0);
  assert.equal(readFileSafe(trackerPathFor(sid)), null);
});

test('code-change-tracker: high-risk path (auth) flags full-verify', () => {
  const sid = freshSid('cct3');
  const r = runHook('code-change-tracker.js', {
    session_id: sid,
    tool_input: { file_path: '/x/src/authHelpers.ts' },
  });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /HIGH-RISK PATH/);
  fs.rmSync(trackerPathFor(sid), { force: true });
});

test('verify-gate-stop: non-empty tracker warns (exit 0, never blocks)', () => {
  const sid = freshSid('vgs');
  writeTracker(sid, ['/x/foo.ts']);
  const r = runHook('verify-gate-stop.js', { session_id: sid });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /UNVERIFIED CODE FILES/);
  fs.rmSync(trackerPathFor(sid), { force: true });
});

// ---------------------------------------------------------------- branch-protection
test('branch-protection: force push to main → BLOCK (any current branch)', () => {
  const repo = makeGitRepo({ branch: 'feature' });
  const r = runHook('branch-protection.js', {
    tool_input: { command: 'git push --force origin main' },
  }, { cwd: repo });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Force push/);
});

test('branch-protection: normal git command on non-protected branch → pass, silent', () => {
  const repo = makeGitRepo({ branch: 'feature' });
  const r = runHook('branch-protection.js', {
    tool_input: { command: 'git status' },
  }, { cwd: repo });
  assert.equal(r.status, 0);
  assert.equal(r.stderr.trim(), '');
});

test('branch-protection: commit on main → INFO warn only (main-branch workflow)', () => {
  const repo = makeGitRepo({ branch: 'main' });
  const r = runHook('branch-protection.js', {
    tool_input: { command: 'git commit -m x' },
  }, { cwd: repo });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /Main-branch workflow active/);
});

// ---------------------------------------------------------------- commit-quality
test('commit-quality: staged debugger statement → BLOCK', () => {
  const repo = makeGitRepo({ files: { 'bad.js': 'function f(){ debugger; }\n' } });
  const r = runHook('commit-quality.js', {
    tool_input: { command: 'git commit -m x' },
  }, { cwd: repo });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /debugger statement/);
});

test('commit-quality: staged secret (sk-…) → BLOCK', () => {
  const repo = makeGitRepo({ files: { 'bad.ts': `const k = "sk-${'a'.repeat(24)}";\n` } });
  const r = runHook('commit-quality.js', {
    tool_input: { command: 'git commit -m x' },
  }, { cwd: repo });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /potential secret/);
});

test('commit-quality: clean staged files → pass', () => {
  const repo = makeGitRepo({ files: { 'ok.js': 'export const a = 1;\n' } });
  const r = runHook('commit-quality.js', {
    tool_input: { command: 'git commit -m x' },
  }, { cwd: repo });
  assert.equal(r.status, 0);
});

test('commit-quality: --amend is exempt', () => {
  const repo = makeGitRepo({ files: { 'bad.js': 'debugger;\n' } });
  const r = runHook('commit-quality.js', {
    tool_input: { command: 'git commit --amend --no-edit' },
  }, { cwd: repo });
  assert.equal(r.status, 0);
});

// ---------------------------------------------------------------- config-protection
test('config-protection: .eslintrc write → BLOCK', () => {
  const r = runHook('config-protection.js', { tool_input: { file_path: '/x/.eslintrc' } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /BLOCKED/);
});

test('config-protection: normal file → pass', () => {
  const r = runHook('config-protection.js', { tool_input: { file_path: '/x/src/app.ts' } });
  assert.equal(r.status, 0);
});

// ---------------------------------------------------------------- large-file-warner
test('large-file-warner: ≥2MB read without offset/limit → BLOCK', () => {
  const home = makeTmpHome();
  const big = path.join(home, 'big.bin');
  fs.writeFileSync(big, Buffer.alloc(2 * 1024 * 1024 + 1));
  const r = runHook('large-file-warner.js', { tool_input: { file_path: big } }, { home });
  assert.equal(r.status, 2);
});

test('large-file-warner: ≥2MB but offset/limit present → pass', () => {
  const home = makeTmpHome();
  const big = path.join(home, 'big.bin');
  fs.writeFileSync(big, Buffer.alloc(2 * 1024 * 1024 + 1));
  const r = runHook('large-file-warner.js', { tool_input: { file_path: big, limit: 100 } }, { home });
  assert.equal(r.status, 0);
});

test('large-file-warner: 600KB → warn only, pass', () => {
  const home = makeTmpHome();
  const mid = path.join(home, 'mid.bin');
  fs.writeFileSync(mid, Buffer.alloc(600 * 1024));
  const r = runHook('large-file-warner.js', { tool_input: { file_path: mid } }, { home });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /WARNING/);
});

// ---------------------------------------------------------------- mcp-health
test('mcp-health pre: unhealthy server within backoff → BLOCK', () => {
  const home = makeTmpHome();
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', 'mcp-health-cache.json'), JSON.stringify({
    servers: { badsrv: { status: 'unhealthy', nextRetryAt: Date.now() + 60000 } },
  }));
  const r = runHook('mcp-health.js', { tool_name: 'mcp__badsrv__do' }, { args: ['pre'], home });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unhealthy/);
});

test('mcp-health pre: expired backoff → pass and cache entry cleared', () => {
  const home = makeTmpHome();
  const cache = path.join(home, '.claude', 'mcp-health-cache.json');
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  fs.writeFileSync(cache, JSON.stringify({
    servers: { oldsrv: { status: 'unhealthy', nextRetryAt: Date.now() - 1000 } },
  }));
  const r = runHook('mcp-health.js', { tool_name: 'mcp__oldsrv__do' }, { args: ['pre'], home });
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(readFileSafe(cache)).servers.oldsrv, undefined);
});

test('mcp-health failure: infra error marks server unhealthy with backoff', () => {
  const home = makeTmpHome();
  const r = runHook('mcp-health.js', {
    tool_name: 'mcp__flaky__do',
    error: 'connect ECONNREFUSED 127.0.0.1:9',
  }, { args: ['failure'], home });
  assert.equal(r.status, 0);
  const state = JSON.parse(readFileSafe(path.join(home, '.claude', 'mcp-health-cache.json')));
  assert.equal(state.servers.flaky.status, 'unhealthy');
});

test('mcp-health: non-mcp tool → pass untouched', () => {
  const r = runHook('mcp-health.js', { tool_name: 'Bash' }, { args: ['pre'] });
  assert.equal(r.status, 0);
});

// ---------------------------------------------------------------- audit-log
test('audit-log: bash command logged with ghp_ token redacted', () => {
  const home = makeTmpHome();
  const r = runHook('audit-log.js', {
    tool_input: { command: `git push https://ghp_${'a'.repeat(36)}@github.com/x/y` },
  }, { home });
  assert.equal(r.status, 0);
  const log = readFileSafe(path.join(home, '.claude', 'bash-commands.log'));
  assert.match(log, /<REDACTED>/);
  assert.doesNotMatch(log, /ghp_a{36}/);
});

// ---------------------------------------------------------------- accumulator + batch-format
test('accumulator → batch-format: .js file accumulated then consumed at Stop', () => {
  const sid = `abf-${Date.now()}`;
  const home = makeTmpHome();
  const srcDir = makeTmpHome();
  const jsFile = path.join(srcDir, 'a.js');
  fs.writeFileSync(jsFile, 'const a = 1;\n');
  const acc = runHook('accumulator.js', {
    tool_input: { file_path: jsFile },
  }, { home, env: { CLAUDE_SESSION_ID: sid } });
  assert.equal(acc.status, 0);
  const accFile = path.join(require_os_tmpdir(), `claude-edited-${sid}.txt`);
  assert.match(readFileSafe(accFile) || '', /a\.js/);
  // Stop consumes + unlinks; no prettier/tsc in empty cwd → silent pass
  const bf = runHook('batch-format.js', {}, { home, cwd: srcDir, env: { CLAUDE_SESSION_ID: sid } });
  assert.equal(bf.status, 0);
  assert.equal(readFileSafe(accFile), null);
});

function require_os_tmpdir() {
  return process.env.TMPDIR ? process.env.TMPDIR.replace(/\/$/, '') : '/tmp';
}

// ---------------------------------------------------------------- design-quality
test('design-quality: generic UI pattern in tsx → warn', () => {
  const dir = makeTmpHome();
  const f = path.join(dir, 'Hero.tsx');
  fs.writeFileSync(f, '<button>Get Started</button>');
  const r = runHook('design-quality.js', { tool_input: { file_path: f } }, { cwd: dir });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /generic UI patterns/);
});

// ---------------------------------------------------------------- test-runner
test('test-runner: no sibling test file → silent pass', () => {
  const dir = makeTmpHome();
  const f = path.join(dir, 'solo.ts');
  fs.writeFileSync(f, 'export const x = 1;\n');
  const r = runHook('test-runner.js', { tool_input: { file_path: f } }, { cwd: dir });
  assert.equal(r.status, 0);
  assert.equal(r.stderr.trim(), '');
});

// ---------------------------------------------------------------- agent-dispatch-log
test('agent-dispatch-log: Agent dispatch logged under HOME when no agency-os in cwd', () => {
  const home = makeTmpHome();
  const dir = makeTmpHome();
  const r = runHook('agent-dispatch-log.js', {
    tool_name: 'Agent',
    tool_input: { subagent_type: 'critic', description: 'review x' },
    tool_response: { content: [{ text: 'done' }] },
  }, { home, cwd: dir });
  assert.equal(r.status, 0);
  const dispDir = path.join(home, '.claude', 'agent-dispatch');
  const files = fs.existsSync(dispDir) ? fs.readdirSync(dispDir) : [];
  assert.equal(files.length, 1);
  assert.match(readFileSafe(path.join(dispDir, files[0])), /"agent":"critic"/);
});

test('agent-dispatch-log: non-Agent tool → no log written', () => {
  const home = makeTmpHome();
  const r = runHook('agent-dispatch-log.js', { tool_name: 'Bash', tool_input: {} }, { home });
  assert.equal(r.status, 0);
  assert.equal(fs.existsSync(path.join(home, '.claude', 'agent-dispatch')), false);
});

// ---------------------------------------------------------------- Stop smoke trio
test('check-console / cost-tracker / session-summary: smoke — exit 0, no crash', () => {
  const repo = makeGitRepo({});
  for (const hook of ['check-console.js', 'cost-tracker.js', 'session-summary.js']) {
    const r = runHook(hook, { usage: { input_tokens: 10, output_tokens: 5 } }, { cwd: repo });
    assert.equal(r.status, 0, `${hook} should exit 0`);
  }
});

// ---------------------------------------------------------------- log-error.sh
test('log-error.sh: error keyword in tool_output → error-log.md entry (requires ~/.claude to pre-exist — latent bug: silent write failure on fresh HOME; v2 rule mkdirs)', () => {
  const home = makeTmpHome();
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  const r = runShell(`bash ${REPO_ROOT}/mcp/claude-userlevel/hooks/log-error.sh`, {
    tool_name: 'Bash',
    tool_input: { command: 'x' },
    tool_output: 'fatal: not a git repository',
  }, { home });
  assert.equal(r.status, 0);
  assert.match(readFileSafe(path.join(home, '.claude', 'error-log.md')) || '', /fatal: not a git repository/);
});

// ---------------------------------------------------------------- hooks.json inline hooks (verbatim)
const INLINE_RM_RF = `input=$(cat | jq -r '.input // empty'); if echo "$input" | grep -qE 'rm\\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive.*--force|-rf)'; then echo 'BLOCKED: rm -rf is dangerous' >&2; exit 2; fi; exit 0`;
const INLINE_SENSITIVE = `filepath=$(cat | jq -r '.file_path // .filePath // empty'); if echo "$filepath" | grep -qE '\\.(env|pem|key)$|/secrets/|credentials'; then echo "BLOCKED: Cannot modify sensitive file: $filepath" >&2; exit 2; fi; exit 0`;

test('INLINE BUG LOCK: hooks.json rm-rf blocker reads `.input` (wrong field) → does NOT block real payloads', () => {
  const r = runShell(INLINE_RM_RF, { tool_input: { command: 'rm -rf /tmp/x' } });
  assert.equal(r.status, 0); // BUG: should be 2 — v2 runner fixes this (intended diff)
});

test('INLINE BUG LOCK: hooks.json sensitive-file blocker reads `.file_path` at top level → does NOT block real payloads', () => {
  const r = runShell(INLINE_SENSITIVE, { tool_input: { file_path: '/x/prod.env' } });
  assert.equal(r.status, 0); // BUG: should be 2 — v2 runner fixes this (intended diff)
});

test('inline --no-verify blocker (node one-liner) works on real payload shape', () => {
  const cmd = `node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const i=JSON.parse(d);const cmd=i.tool_input?.command||'';if(/--no-verify/.test(cmd)){process.stderr.write('[devteam] BLOCKED');process.exit(2)}process.stdout.write(d)})"`;
  const r = runShell(cmd, { tool_input: { command: 'git commit --no-verify -m x' } });
  assert.equal(r.status, 2);
});
