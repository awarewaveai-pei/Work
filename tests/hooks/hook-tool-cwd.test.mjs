// Rules evaluate git in the directory the TOOL CALL runs in (payload.cwd), not the hook process's own cwd.
// 2026-11-15: in a linked-worktree session Claude Code ran the hook in the project root (D:\Work) while the Bash
// command ran in the worktree; git-commit-scope-guard then checked a private-index commit against the main checkout
// ("marker root <worktree> is not this repo D:/Work", HEAD of main) and refused it, and branch-protection reported the
// main checkout's branch. Every worktree commit hit it. Invariants: ctx.cwd = payload.cwd when it is a real directory;
// a gate follows `cd`/`-C` to where git really runs (shared.effectiveDir) instead of skipping the check.
// Run: node --test tests/hooks/hook-tool-cwd.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runNode, freshSid, REPO_ROOT, HOOKS_DIR } from './helpers.mjs';

const RUNNER = path.join(HOOKS_DIR, 'runner.js');
const HELPER = path.join(REPO_ROOT, 'scripts', 'git-partial-worktree-commit.py');
const PY = process.platform === 'win32' ? 'python' : 'python3';
const WORKLOG = 'agency-os/WORKLOG.md';
const HEAD_WORKLOG = '# Worklog\n\n## 2026-11-15（續1）old\n\n- old line\n';
const MINE = '## 2026-11-15（續2）mine\n\n- my line\n\n';

function g(dir, args, env) {
  const r = spawnSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
    { cwd: dir, encoding: 'utf8', env: { ...process.env, ...(env || {}) } });
  return { status: r.status, out: (r.stdout || '').trim(), err: r.stderr || '' };
}

/** Git-Bash spelling of a Windows path (/d/x/y), the form real commands use; POSIX paths pass through. */
const shellPath = (p) => (/^[A-Za-z]:/.test(p) ? '/' + p[0].toLowerCase() + p.slice(2).split(path.sep).join('/') : p);

/** A main checkout on `main` plus a linked worktree on `work` -- the layout of a desktop worktree session. */
function makeMainAndWorktree() {
  const main = fs.mkdtempSync(path.join(os.tmpdir(), 'cwd-main-'));
  g(main, ['init', '-q', '-b', 'main']);
  g(main, ['config', 'core.autocrlf', 'false']);
  fs.mkdirSync(path.join(main, 'agency-os'));
  fs.writeFileSync(path.join(main, WORKLOG), HEAD_WORKLOG);
  g(main, ['add', '-A']);
  g(main, ['commit', '-q', '-m', 'seed']);
  const wt = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cwd-wt-')), 'wt');
  assert.equal(g(main, ['worktree', 'add', '-q', '-b', 'work', wt]).status, 0);
  g(wt, ['commit', '-q', '--allow-empty', '-m', 'worktree moved ahead']);   // the two HEADs differ, as in the incident
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cwd-scratch-'));
  return { main, wt, scratch };
}

/** The hook PROCESS runs in procCwd; the payload says the tool call runs in toolCwd (undefined = no cwd field). */
function hook(event, command, procCwd, toolCwd, scratch) {
  const payload = { session_id: freshSid('cwd'), tool_name: 'Bash', tool_input: { command } };
  if (toolCwd !== undefined) payload.cwd = toolCwd;
  const r = runNode(RUNNER, payload, { args: [event], cwd: procCwd, env: { PARTIAL_COMMIT_SCRATCH: scratch } });
  return { deny: r.status === 2, out: String(r.stderr || '') };
}

function stage(wt, scratch) {
  fs.writeFileSync(path.join(wt, WORKLOG), '# Worklog\n\n' + MINE + HEAD_WORKLOG.slice('# Worklog\n\n'.length));
  fs.writeFileSync(path.join(wt, 'own.txt'), 'mine\n');
  const r = spawnSync(PY, [HELPER, 'stage', WORKLOG, '--worklog-entry', '2', '--date', '2026-11-15', '--', 'own.txt'],
    { cwd: wt, encoding: 'utf8', env: { ...process.env, PARTIAL_COMMIT_SCRATCH: scratch, PYTHONIOENCODING: 'utf-8' } });
  const idx = ((r.stdout || '').match(/^private index: (.+)$/m) || [])[1];
  assert.ok(idx, (r.stdout || '') + (r.stderr || ''));
  return idx;
}

test('worktree session: hook process in the main checkout, tool call in the worktree -> private-index commit passes and syncs the WORKTREE index', () => {
  const { main, wt, scratch } = makeMainAndWorktree();
  const idx = stage(wt, scratch);
  const cmd = `GIT_INDEX_FILE=${idx} git commit -q -m mine`;
  const pre = hook('PreToolUse', cmd, main, wt, scratch);
  assert.equal(pre.deny, false, pre.out);
  assert.doesNotMatch(pre.out, /is not this repo|HEAD moved/);
  assert.equal(g(wt, ['commit', '-q', '-m', 'mine'], { GIT_INDEX_FILE: idx }).status, 0);
  hook('PostToolUse', cmd, main, wt, scratch);
  assert.equal(fs.existsSync(`${idx}.json`), false, 'marker consumed by the worktree-side PostToolUse');
  assert.equal(g(wt, ['diff', '--cached', '--name-only']).out, '', 'worktree index synced to its HEAD');
  assert.equal(g(main, ['log', '-1', '--format=%s']).out, 'seed', 'main checkout untouched');
});

test('branch-protection reports the branch of the tool call\'s directory, not the hook process\'s', () => {
  const { main, wt, scratch } = makeMainAndWorktree();
  const r = hook('PreToolUse', 'git commit -q -m x', main, wt, scratch);
  assert.doesNotMatch(r.out, /Committing on 'main'/);
  const back = hook('PreToolUse', 'git commit -q -m x', wt, main, scratch);
  assert.match(back.out, /Committing on 'main'/, 'tool call in the main checkout is still seen as main');
});

test('no usable payload.cwd -> the hook process cwd is used, as before', () => {
  const { main, wt, scratch } = makeMainAndWorktree();
  for (const toolCwd of [undefined, path.join(wt, 'does-not-exist'), 'relative/dir']) {
    const r = hook('PreToolUse', 'git commit -q -m x', main, toolCwd, scratch);
    assert.match(r.out, /Committing on 'main'/, `fallback for payload.cwd=${toolCwd}`);
  }
});

test('cd into the main checkout from a worktree session: the shared-file guard checks the MAIN checkout (follows cd, does not skip)', () => {
  const { main, wt, scratch } = makeMainAndWorktree();
  fs.writeFileSync(path.join(main, WORKLOG), HEAD_WORKLOG + '\n- another session, uncommitted\n');
  const r = hook('PreToolUse', `cd ${shellPath(main)} && git commit -m x -- ${WORKLOG}`, wt, wt, scratch);
  assert.equal(r.deny, true, r.out);
  assert.match(r.out, /shared file/);
  const own = hook('PreToolUse', `git commit -m x -- ${WORKLOG}`, main, wt, scratch);
  assert.doesNotMatch(own.out, /shared file/, 'the worktree itself has a clean WORKLOG');
  const viaC = hook('PreToolUse', `git -C ${shellPath(main)} commit -m x -- ${WORKLOG}`, wt, wt, scratch);
  assert.equal(viaC.deny, true, 'git -C into the main checkout is followed the same way');
});

test('a cd to a directory that does not exist -> fail open, as before (the chained git never runs)', () => {
  const { wt, scratch } = makeMainAndWorktree();
  const r = hook('PreToolUse', `cd ${shellPath(path.join(wt, 'nope'))} && git commit -m x -- ${WORKLOG}`, wt, wt, scratch);
  assert.equal(r.deny, false, r.out);
});

test('check-console (Stop) from a subdirectory still finds console.log in a changed file', () => {
  const { wt, scratch } = makeMainAndWorktree();
  fs.mkdirSync(path.join(wt, 'app', 'sub'), { recursive: true });
  fs.writeFileSync(path.join(wt, 'app', 'x.js'), 'export const a = 1;\n');
  g(wt, ['add', '-A']);
  g(wt, ['commit', '-q', '-m', 'x']);
  fs.writeFileSync(path.join(wt, 'app', 'x.js'), 'export const a = 1;\nconsole.log(a);\n');
  const payload = { session_id: freshSid('cc'), hook_event_name: 'Stop', cwd: path.join(wt, 'app', 'sub') };
  const r = runNode(RUNNER, payload, { args: ['Stop'], cwd: wt, env: { PARTIAL_COMMIT_SCRATCH: scratch } });
  assert.match(String(r.stderr), /console\.log in app\/x\.js/);
});

test('every git invocation in a rule or lib passes an explicit cwd (none inherits the hook process directory)', () => {
  const bad = [];
  for (const sub of ['rules', 'lib']) {
    const dir = path.join(HOOKS_DIR, sub);
    for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.js'))) {
      const text = fs.readFileSync(path.join(dir, name), 'utf8');
      // direct spawns: the options object names a cwd, and not literally `cwd: undefined`
      for (const m of text.matchAll(/(?:spawnSync|execSync|execFileSync|spawn)\(\s*['"`]git\b/g)) {
        const call = text.slice(m.index, text.indexOf(';', m.index) + 1);
        if (!/\bcwd\b/.test(call) || /\bcwd\s*:\s*undefined\b/.test(call)) bad.push(`${sub}/${name}: ${call.slice(0, 120)}`);
      }
      // wrapper calls -- git([...], cwd) / gitRaw / gitOut / sh('git', [...], cwd): an argument follows the array
      for (const m of text.matchAll(/\b(?:git|gitRaw|gitOut)\(\[|\bsh\(\s*'git'\s*,\s*\[/g)) {
        let depth = 0;
        let i = text.indexOf('[', m.index);
        for (; i < text.length; i++) {
          if (text[i] === '[') depth++;
          else if (text[i] === ']' && --depth === 0) break;
        }
        if (!/^\s*,\s*[^\s)]/.test(text.slice(i + 1, i + 40))) bad.push(`${sub}/${name}: ${text.slice(m.index, i + 20)}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});
