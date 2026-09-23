// git-shared-file-guard.js + git-commit-scope-guard.js v7 (private index) + worklog-entry-number-guard.js,
// driven through the real runner against a scratch repo and the real helper scripts/git-partial-worktree-commit.py.
// Run: node --test tests/hooks/shared-file-guard.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runNode, freshSid, writeTracker, REPO_ROOT, HOOKS_DIR } from './helpers.mjs';

const RUNNER = path.join(HOOKS_DIR, 'runner.js');
const HELPER = path.join(REPO_ROOT, 'scripts', 'git-partial-worktree-commit.py');
const PY = process.platform === 'win32' ? 'python' : 'python3';
const WORKLOG = 'agency-os/WORKLOG.md';
const TASKS = 'agency-os/TASKS.md';
const HEAD_WORKLOG = '# Worklog\n\n## 2026-09-23（續1）old entry\n\n- old line\n';
const HEAD_TASKS = '# Tasks\n\n- [ ] a\n- [ ] b\n- [ ] c\n';
const MINE = '## 2026-09-23（續2）mine\n\n- my line\n\n';
const FOREIGN = '## 2026-09-23（續3）foreign\n\n- their line\n\n';

function g(dir, args, env) {
  const r = spawnSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
    { cwd: dir, encoding: 'utf8', env: { ...process.env, ...(env || {}) } });
  return { status: r.status, out: (r.stdout || '').trim(), err: r.stderr || '' };
}

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sfg-repo-'));
  g(dir, ['init', '-q', '-b', 'main']);
  g(dir, ['config', 'core.autocrlf', 'false']);
  fs.mkdirSync(path.join(dir, 'agency-os'));
  fs.writeFileSync(path.join(dir, WORKLOG), HEAD_WORKLOG);
  fs.writeFileSync(path.join(dir, TASKS), HEAD_TASKS);
  g(dir, ['add', '-A']);
  g(dir, ['commit', '-q', '-m', 'seed']);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sfg-scratch-'));
  return { dir, scratch };
}

function hook(event, payload, dir, scratch) {
  return runNode(RUNNER, payload, { args: [event], cwd: dir, env: { PARTIAL_COMMIT_SCRATCH: scratch } });
}

function bash(event, command, dir, scratch) {
  return hook(event, { session_id: freshSid('sfg'), tool_name: 'Bash', tool_input: { command } }, dir, scratch);
}

// The runner reports a block as exit 2 with the rule text on stderr (same contract runner-parity.test.mjs asserts).
function verdict(r) {
  return { deny: r.status === 2, reason: String(r.stderr || '') };
}

function helper(dir, scratch, args) {
  const r = spawnSync(PY, [HELPER, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, PARTIAL_COMMIT_SCRATCH: scratch, PYTHONIOENCODING: 'utf-8' } });
  return { status: r.status, out: r.stdout || '', err: r.stderr || '' };
}

function dirtyBoth(dir) {
  // worktree WORKLOG: mine ABOVE a foreign uncommitted entry, both above HEAD's 續1; TASKS: my hunk + a foreign hunk
  fs.writeFileSync(path.join(dir, WORKLOG), '# Worklog\n\n' + MINE + FOREIGN + HEAD_WORKLOG.slice('# Worklog\n\n'.length));
  fs.writeFileSync(path.join(dir, TASKS), '# Tasks\n\n- [ ] a\n- [x] b\n- [ ] c\n- [ ] d (foreign)\n');
  fs.writeFileSync(path.join(dir, 'own.txt'), 'mine\n');
}

test('pathspec commit naming a shared file whose worktree differs from HEAD -> BLOCK; equal to HEAD -> pass', () => {
  const { dir, scratch } = makeRepo();
  dirtyBoth(dir);
  const b = verdict(bash('PreToolUse', `git commit -m x -- ${WORKLOG}`, dir, scratch));
  assert.equal(b.deny, true);
  assert.match(b.reason, /another session's hunks of a shared file/);
  assert.match(b.reason, /agency-os\/WORKLOG\.md: a `-- <pathspec>` commit takes the WORKTREE bytes/);
  fs.writeFileSync(path.join(dir, WORKLOG), HEAD_WORKLOG); // WORKLOG back to HEAD, TASKS still dirty
  const p = verdict(bash('PreToolUse', `git commit -m x -- ${WORKLOG}`, dir, scratch));
  assert.doesNotMatch(p.reason, /shared file/);
});

test('bare commit after a whole-file git add of a shared file -> BLOCK; first-line ack -> pass', () => {
  const { dir, scratch } = makeRepo();
  dirtyBoth(dir);
  g(dir, ['add', '--', TASKS]);
  const b = verdict(bash('PreToolUse', 'git commit -m x', dir, scratch));
  assert.equal(b.deny, true);
  assert.match(b.reason, /agency-os\/TASKS\.md: the shared index holds a whole-file `git add`/);
  const a = verdict(bash('PreToolUse', '# CONFIRMED-SHARED-FILE-COMMIT: single session, every hunk mine\ngit commit -m x', dir, scratch));
  assert.doesNotMatch(a.reason, /shared file/);
});

test('helper stage (worklog entry + TASKS hunk + own file) -> private-index commit passes both guards, commits only mine, PostToolUse syncs the shared index', () => {
  const { dir, scratch } = makeRepo();
  dirtyBoth(dir);
  const s1 = helper(dir, scratch, ['stage', WORKLOG, '--worklog-entry', '2', '--date', '2026-09-23', '--', 'own.txt']);
  assert.equal(s1.status, 0, s1.out + s1.err);
  const idx = (s1.out.match(/^private index: (.+)$/m) || [])[1];
  assert.ok(idx, s1.out);
  const s2 = helper(dir, scratch, ['stage', TASKS, '--range', '4', '--index', idx]);
  assert.equal(s2.status, 0, s2.out + s2.err);
  assert.ok(fs.existsSync(`${idx}.json`));
  const cmd = `GIT_INDEX_FILE=${idx} git commit -q -m mine`;
  const pre = verdict(bash('PreToolUse', cmd, dir, scratch));
  assert.equal(pre.deny, false, pre.reason);
  const c = g(dir, ['commit', '-q', '-m', 'mine'], { GIT_INDEX_FILE: idx });
  assert.equal(c.status, 0, c.err);
  assert.equal(g(dir, ['show', `HEAD:${WORKLOG}`]).out, ('# Worklog\n\n' + MINE + HEAD_WORKLOG.slice('# Worklog\n\n'.length)).trim(), 'HEAD = old + mine, foreign entry excluded, mine placed before 續1');
  assert.equal(g(dir, ['show', `HEAD:${TASKS}`]).out, '# Tasks\n\n- [ ] a\n- [x] b\n- [ ] c', 'my hunk in, foreign hunk out');
  assert.equal(g(dir, ['show', 'HEAD:own.txt']).out, 'mine');
  bash('PostToolUse', cmd, dir, scratch);
  assert.equal(fs.existsSync(idx), false, 'index removed after the commit');
  assert.equal(fs.existsSync(`${idx}.json`), false, 'marker removed after the commit');
  assert.equal(g(dir, ['diff', '--cached', '--name-only']).out, '', 'shared index synced to HEAD for the committed paths');
  assert.deepEqual(g(dir, ['diff', '--name-only']).out.split('\n').sort(), [TASKS, WORKLOG], 'foreign hunks still in the worktree, unstaged');
  assert.match(fs.readFileSync(path.join(dir, WORKLOG), 'utf8'), /續3）foreign/);
});

test('private index tampered after stage (shared-file blob != marker) -> BLOCK; own file edited after stage -> BLOCK', () => {
  const { dir, scratch } = makeRepo();
  dirtyBoth(dir);
  const s1 = helper(dir, scratch, ['stage', WORKLOG, '--worklog-entry', '2', '--date', '2026-09-23', '--', 'own.txt']);
  const idx = (s1.out.match(/^private index: (.+)$/m) || [])[1];
  assert.ok(idx, s1.out + s1.err);
  fs.writeFileSync(path.join(dir, 'own.txt'), 'mine edited later\n');
  const stale = verdict(bash('PreToolUse', `GIT_INDEX_FILE=${idx} git commit -m x`, dir, scratch));
  assert.equal(stale.deny, true);
  assert.match(stale.reason, /own\.txt: changed after staging/);
  fs.writeFileSync(path.join(dir, 'own.txt'), 'mine\n');
  const whole = g(dir, ['hash-object', '-w', '--', WORKLOG]).out; // full worktree blob = foreign entry included
  g(dir, ['update-index', '--cacheinfo', `100644,${whole},${WORKLOG}`], { GIT_INDEX_FILE: idx });
  const t = verdict(bash('PreToolUse', `GIT_INDEX_FILE=${idx} git commit -m x`, dir, scratch));
  assert.equal(t.deny, true);
  assert.match(t.reason, /private index blob is not the one git-partial-worktree-commit\.py built|private index blob differs from the marker/);
});

test('env-prefixed commit is still a commit for the other gates: GIT_INDEX_FILE=... git commit with an unverified file -> verify-gate-commit BLOCK', () => {
  const { dir, scratch } = makeRepo();
  const sid = freshSid('sfg-vgc');
  writeTracker(sid, [path.join(dir, 'x.js')]);
  const r = hook('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: `GIT_INDEX_FILE=${path.join(scratch, 'p.index')} git commit -m x` } }, dir, scratch);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /UNVERIFIED CODE FILES/);
  const tree = hook('PreToolUse', { session_id: sid, tool_name: 'Bash', tool_input: { command: 'GIT_INDEX_FILE=x git commit-tree HEAD^{tree} -m x' } }, dir, scratch);
  assert.doesNotMatch(tree.stderr, /UNVERIFIED CODE FILES/);
});

test('codex r2: --amend and -a are not exempt; env with a flag argument still matches; HEAD moved after stage -> BLOCK', () => {
  const { dir, scratch } = makeRepo();
  dirtyBoth(dir);
  g(dir, ['add', '--', WORKLOG]);
  const amend = verdict(bash('PreToolUse', 'git commit --amend --no-edit', dir, scratch));
  assert.equal(amend.deny, true);
  assert.match(amend.reason, /agency-os\/WORKLOG\.md: the shared index holds a whole-file `git add`/);
  g(dir, ['reset', '-q', '--', WORKLOG]);
  const all = verdict(bash('PreToolUse', 'git commit -a -m x', dir, scratch));
  assert.equal(all.deny, true);
  assert.match(all.reason, /agency-os\/WORKLOG\.md: a `-- <pathspec>` commit takes the WORKTREE bytes|-a`\/`--all`/);
  const s1 = helper(dir, scratch, ['stage', WORKLOG, '--worklog-entry', '2', '--date', '2026-09-23', '--', 'own.txt']);
  const idx = (s1.out.match(/^private index: (.+)$/m) || [])[1];
  assert.ok(idx, s1.out + s1.err);
  const envFlag = hook('PreToolUse', { session_id: freshSid('sfg-env'), tool_name: 'Bash', tool_input: { command: `env -u FOO GIT_INDEX_FILE=${idx} git commit -m x` } }, dir, scratch);
  assert.equal(envFlag.status, 0, envFlag.stderr); // recognised as a commit AND valid -> passes
  // another session commits meanwhile -> HEAD moves -> the private index would revert that commit
  fs.writeFileSync(path.join(dir, 'other.txt'), 'theirs\n');
  g(dir, ['add', '--', 'other.txt']);
  g(dir, ['commit', '-q', '-m', 'theirs', '--', 'other.txt']);
  const moved = verdict(bash('PreToolUse', `GIT_INDEX_FILE=${idx} git commit -m x`, dir, scratch));
  assert.equal(moved.deny, true);
  assert.match(moved.reason, /HEAD moved since stage/);
  const again = helper(dir, scratch, ['stage', TASKS, '--range', '4', '--index', idx]);
  assert.equal(again.status, 2);
  assert.match(again.out, /HEAD moved/);
});

test('codex r2: PostToolUse leaves a shared-index entry staged by someone else in the window, and keeps index+marker when git reset fails', () => {
  const { dir, scratch } = makeRepo();
  dirtyBoth(dir);
  const s1 = helper(dir, scratch, ['stage', WORKLOG, '--worklog-entry', '2', '--date', '2026-09-23', '--', 'own.txt']);
  const idx = (s1.out.match(/^private index: (.+)$/m) || [])[1];
  assert.ok(idx, s1.out + s1.err);
  helper(dir, scratch, ['stage', TASKS, '--range', '4', '--index', idx]);
  const cmd = `GIT_INDEX_FILE=${idx} git commit -q -m mine`;
  assert.equal(g(dir, ['commit', '-q', '-m', 'mine'], { GIT_INDEX_FILE: idx }).status, 0);
  // session B stages its own TASKS version in the window before A's PostToolUse fires
  fs.writeFileSync(path.join(dir, TASKS), '# Tasks\n\n- [ ] a\n- [x] b\n- [ ] c\n- [ ] d (foreign)\n- [ ] e (foreign, staged)\n');
  g(dir, ['add', '--', TASKS]);
  const theirs = g(dir, ['rev-parse', `:${TASKS}`]).out;
  // and a git process holds the index lock
  const lock = path.join(dir, '.git', 'index.lock');
  fs.writeFileSync(lock, '');
  const p1 = bash('PostToolUse', cmd, dir, scratch);
  assert.match(p1.stderr, /git reset -q -- .* failed after the private-index commit/);
  assert.match(p1.stderr, /agency-os\/TASKS\.md: the shared index holds content staged by another session/);
  assert.ok(fs.existsSync(idx) && fs.existsSync(`${idx}.json`), 'index + marker kept when the sync failed');
  fs.unlinkSync(lock);
  const p2 = bash('PostToolUse', cmd, dir, scratch);
  assert.doesNotMatch(p2.stderr, /failed after the private-index commit/);
  assert.equal(fs.existsSync(idx), false, 'index removed once the sync succeeded');
  assert.equal(g(dir, ['rev-parse', `:${TASKS}`]).out, theirs, "B's staged TASKS entry untouched");
  assert.equal(g(dir, ['diff', '--cached', '--name-only']).out, TASKS, 'only B\'s entry remains staged');
});

test('codex r3: HEAD moves between PreToolUse and the commit -> PostToolUse undoes the stale commit by CAS, nothing lost', () => {
  const { dir, scratch } = makeRepo();
  dirtyBoth(dir);
  const s1 = helper(dir, scratch, ['stage', WORKLOG, '--worklog-entry', '2', '--date', '2026-09-23', '--', 'own.txt']);
  const idx = (s1.out.match(/^private index: (.+)$/m) || [])[1];
  assert.ok(idx, s1.out + s1.err);
  const cmd = `GIT_INDEX_FILE=${idx} git commit -q -m mine`;
  assert.equal(verdict(bash('PreToolUse', cmd, dir, scratch)).deny, false); // validated on H1 ...
  fs.writeFileSync(path.join(dir, 'other.txt'), 'theirs\n');                // ... then another session commits H2
  g(dir, ['add', '--', 'other.txt']);
  g(dir, ['commit', '-q', '-m', 'theirs', '--', 'other.txt']);
  const h2 = g(dir, ['rev-parse', 'HEAD']).out;
  assert.equal(g(dir, ['commit', '-q', '-m', 'mine'], { GIT_INDEX_FILE: idx }).status, 0); // git happily commits the stale tree
  assert.notEqual(g(dir, ['rev-parse', '--verify', '-q', 'HEAD:other.txt']).status, 0, 'the stale commit reverted other.txt');
  const post = bash('PostToolUse', cmd, dir, scratch);
  assert.match(post.stderr, /UNDONE: it was prepared on/);
  assert.equal(g(dir, ['rev-parse', 'HEAD']).out, h2, 'branch back on the other session\'s commit');
  assert.equal(g(dir, ['show', 'HEAD:other.txt']).out, 'theirs');
  assert.equal(fs.existsSync(idx), false);
  assert.match(fs.readFileSync(path.join(dir, WORKLOG), 'utf8'), /續2）mine[\s\S]*續3）foreign/, 'worktree untouched');
  assert.equal(fs.readFileSync(path.join(dir, 'own.txt'), 'utf8'), 'mine\n');
  assert.equal(g(dir, ['diff', '--cached', '--name-only']).out, '', 'shared index untouched');
  const again = helper(dir, scratch, ['stage', WORKLOG, '--worklog-entry', '2', '--date', '2026-09-23', '--', 'own.txt']);
  assert.equal(again.status, 0, again.out + again.err); // re-stage on H2 works
});

test('codex r4: undo never rewinds a commit that landed on top of the stale one; private-index --amend and commit&&push are refused up front', () => {
  const { dir, scratch } = makeRepo();
  dirtyBoth(dir);
  const s1 = helper(dir, scratch, ['stage', WORKLOG, '--worklog-entry', '2', '--date', '2026-09-23', '--', 'own.txt']);
  const idx = (s1.out.match(/^private index: (.+)$/m) || [])[1];
  assert.ok(idx, s1.out + s1.err);
  const amend = verdict(bash('PreToolUse', `GIT_INDEX_FILE=${idx} git commit --amend --no-edit`, dir, scratch));
  assert.equal(amend.deny, true);
  assert.match(amend.reason, /--amend` with a private index/);
  const push = verdict(bash('PreToolUse', `GIT_INDEX_FILE=${idx} git commit -q -m mine && git push origin main`, dir, scratch));
  assert.equal(push.deny, true);
  assert.match(push.reason, /private-index commit and `git push` in the same command/);
  const cmd = `GIT_INDEX_FILE=${idx} git commit -q -m mine`;
  // H2 lands, stale H3 is committed, then someone commits H4 on top before PostToolUse runs
  fs.writeFileSync(path.join(dir, 'other.txt'), 'theirs\n');
  g(dir, ['add', '--', 'other.txt']);
  g(dir, ['commit', '-q', '-m', 'H2', '--', 'other.txt']);
  assert.equal(g(dir, ['commit', '-q', '-m', 'H3-stale'], { GIT_INDEX_FILE: idx }).status, 0);
  const h3 = g(dir, ['rev-parse', 'HEAD']).out;
  fs.writeFileSync(path.join(dir, 'later.txt'), 'later\n');
  g(dir, ['add', '--', 'later.txt']);
  g(dir, ['commit', '-q', '-m', 'H4', '--', 'later.txt']);
  const h4 = g(dir, ['rev-parse', 'HEAD']).out;
  const post = bash('PostToolUse', cmd, dir, scratch);
  assert.equal(g(dir, ['rev-parse', 'HEAD']).out, h4, 'H4 must survive');
  assert.match(post.stderr, new RegExp(`private-index commit ${h3} is based on a stale HEAD`));
  assert.match(post.stderr, /already sits on top of it/);
  assert.match(post.stderr, /Do NOT push/);
  assert.ok(fs.existsSync(idx) && fs.existsSync(`${idx}.json`), 'index + marker kept for the manual repair');
});

test('GIT_INDEX_FILE without a marker is judged like the shared index (shared file staged -> BLOCK)', () => {
  const { dir, scratch } = makeRepo();
  dirtyBoth(dir);
  const idx = path.join(scratch, 'unmarked.index').replace(/\\/g, '/');
  g(dir, ['read-tree', 'HEAD'], { GIT_INDEX_FILE: idx });
  g(dir, ['add', '--', WORKLOG], { GIT_INDEX_FILE: idx });
  const b = verdict(bash('PreToolUse', `GIT_INDEX_FILE=${idx} git commit -m x`, dir, scratch));
  assert.equal(b.deny, true);
  assert.match(b.reason, /no marker <index>\.json exists/);
});

test('worklog-entry-number-guard: Edit introducing an existing 續N -> BLOCK; a fresh N -> pass; Write with a duplicate header -> BLOCK; other files ignored', () => {
  const { dir, scratch } = makeRepo();
  const file = path.join(dir, WORKLOG);
  const edit = (new_string) => verdict(hook('PreToolUse', { session_id: freshSid('wen'), tool_name: 'Edit', tool_input: { file_path: file, old_string: '# Worklog\n', new_string } }, dir, scratch));
  const dup = edit('# Worklog\n\n## 2026-09-23（續1）dup\n');
  assert.equal(dup.deny, true);
  assert.match(dup.reason, /WORKLOG entry number already taken/);
  assert.match(dup.reason, /worklog-insert-entry\.py/);
  const fresh = edit('# Worklog\n\n## 2026-09-23（續9）new\n');
  assert.doesNotMatch(fresh.reason, /entry number already taken/);
  const otherDate = edit('# Worklog\n\n## 2026-09-24（續1）new day\n');
  assert.doesNotMatch(otherDate.reason, /entry number already taken/);
  const w = verdict(hook('PreToolUse', { session_id: freshSid('wen'), tool_name: 'Write', tool_input: { file_path: file, content: HEAD_WORKLOG + '\n## 2026-09-23（續1）again\n' } }, dir, scratch));
  assert.equal(w.deny, true);
  assert.match(w.reason, /entry number already taken/);
  const other = verdict(hook('PreToolUse', { session_id: freshSid('wen'), tool_name: 'Write', tool_input: { file_path: path.join(dir, 'notes.md'), content: '## 2026-09-23（續1）a\n## 2026-09-23（續1）b\n' } }, dir, scratch));
  assert.doesNotMatch(other.reason, /entry number already taken/);
});
