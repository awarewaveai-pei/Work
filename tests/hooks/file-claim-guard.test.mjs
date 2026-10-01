// file-claim-guard.js + lib/file-claims.js through the real runner, real manifest, scratch repo.
// Each test gets its own CLAUDE_FILE_CLAIMS_DIR so claims never leak between tests or into the real tmpdir.
// git-log-injector blocks each sid's first Write/Edit, so verdicts are read from the claim rule's own text.
// A real write = pre() + the file change + post(); pre() alone = a write in flight (or one a sibling blocked).
// Run: node --test tests/hooks/file-claim-guard.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { runNode, freshSid, HOOKS_DIR } from './helpers.mjs';

const require = createRequire(import.meta.url);
const claims = require(path.join(HOOKS_DIR, 'lib', 'file-claims.js'));
const RUNNER = path.join(HOOKS_DIR, 'runner.js');
const CLI = path.join(HOOKS_DIR, 'lib', 'file-claims.js');
const CLAIMED = /is being edited by another session/;

function g(dir, args) {
  const r = spawnSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir, encoding: 'utf8' });
  return { status: r.status, out: (r.stdout || '').trim() };
}

function setup({ autocrlf = 'false' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcg-repo-'));
  g(dir, ['init', '-q', '-b', 'main']);
  g(dir, ['config', 'core.autocrlf', autocrlf]);
  fs.mkdirSync(path.join(dir, 'agency-os'));
  fs.writeFileSync(path.join(dir, 'a.txt'), 'base\n');
  fs.writeFileSync(path.join(dir, 'b.txt'), 'base\n');
  fs.writeFileSync(path.join(dir, 'agency-os', 'WORKLOG.md'), '# Worklog\n');
  g(dir, ['add', '-A']);
  g(dir, ['commit', '-q', '-m', 'seed']);
  const claimsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcg-claims-'));
  return { dir, claimsDir };
}

function hook(s, event, sid, files, { host = 'claude' } = {}) {
  const list = files.map((f) => (path.isAbsolute(f) ? f : path.join(s.dir, f)));
  const env = { CLAUDE_FILE_CLAIMS_DIR: s.claimsDir, CODEX_HOME: s.claimsDir };
  if (host === 'codex') {
    const patch = ['*** Begin Patch', ...files.map((f) => `*** Update File: ${f}`), '*** End Patch'].join('\n');
    return runNode(RUNNER, { session_id: sid, turn_id: 't', cwd: s.dir, tool_name: 'apply_patch', tool_input: { command: patch } },
      { args: [event, '--host=codex'], cwd: s.dir, env });
  }
  const payload = sid
    ? { session_id: sid, tool_name: 'Edit', tool_input: { file_path: list[0], edits: list.map((file_path) => ({ file_path })) } }
    : { tool_name: 'Edit', tool_input: { file_path: list[0] } };
  return runNode(RUNNER, payload, { args: [event], cwd: s.dir, env });
}
const pre = (s, sid, files, o) => hook(s, 'PreToolUse', sid, files, o);
const post = (s, sid, files, o) => hook(s, 'PostToolUse', sid, files, o);

// pre + change + post: what one successful Edit looks like to the hooks
function written(s, sid, f, text) {
  pre(s, sid, [f]);
  fs.writeFileSync(path.isAbsolute(f) ? f : path.join(s.dir, f), text);
  post(s, sid, [f]);
}

// rewrite a stored claim (age it, corrupt it) -- the lib reads CLAUDE_FILE_CLAIMS_DIR at call time
function patchClaim(s, f, change) {
  process.env.CLAUDE_FILE_CLAIMS_DIR = s.claimsDir;
  try {
    const abs = path.join(s.dir, f);
    claims.writeClaim(abs, { ...claims.readClaim(abs), ...change });
  } finally { delete process.env.CLAUDE_FILE_CLAIMS_DIR; }
}

test('A writes a file -> B is blocked while it is dirty; A keeps writing freely; other files stay free', () => {
  const s = setup();
  const A = freshSid('A');
  const B = freshSid('B');
  written(s, A, 'a.txt', 'A edit\n');
  const b = pre(s, B, ['a.txt']);
  assert.equal(b.status, 2);
  assert.match(b.stderr, /BLOCKED: a\.txt is being edited by another session \(claude:.*last write \d+ min ago\)/);
  assert.match(b.stderr, /release ".*a\.txt"/);
  assert.doesNotMatch(pre(s, A, ['a.txt']).stderr, CLAIMED, 'holder is never blocked by its own claim');
  assert.doesNotMatch(pre(s, B, ['b.txt']).stderr, CLAIMED);
});

test('A commits -> the claim stops counting, B takes over; then A is the one blocked', () => {
  const s = setup();
  const A = freshSid('A');
  const B = freshSid('B');
  written(s, A, 'a.txt', 'A edit\n');
  g(s.dir, ['commit', '-q', '-m', 'A', '--', 'a.txt']);
  const b = pre(s, B, ['a.txt']);
  assert.doesNotMatch(b.stderr, CLAIMED);
  assert.doesNotMatch(b.stderr, /WARN: .*a\.txt/, 'clean file, nothing to warn about');
  fs.writeFileSync(path.join(s.dir, 'a.txt'), 'B edit\n');
  post(s, B, ['a.txt']);
  assert.match(pre(s, A, ['a.txt']).stderr, CLAIMED);
});

test('codex F3: a claimed-but-not-yet-written clean file is in flight -> B blocked until the pending window lapses', () => {
  const s = setup();
  const A = freshSid('A');
  const B = freshSid('B');
  pre(s, A, ['a.txt']); // A is waiting on a permission prompt; file still equals HEAD
  assert.match(pre(s, B, ['a.txt']).stderr, /BLOCKED: a\.txt .*write in flight/);
  patchClaim(s, 'a.txt', { pendingAt: Date.now() - claims.PENDING_MS - 1000 });
  assert.doesNotMatch(pre(s, B, ['a.txt']).stderr, CLAIMED, 'A never wrote: the claim lapses');
});

test('codex F4: a pre-dirty file claimed by a call a sibling blocked holds only for the pending window, not the TTL', () => {
  const s = setup();
  const A = freshSid('A');
  fs.writeFileSync(path.join(s.dir, 'a.txt'), 'someone else, via Bash\n');
  pre(s, A, ['a.txt']); // no post(): another rule blocked the call
  patchClaim(s, 'a.txt', { pendingAt: Date.now() - claims.PENDING_MS - 1000 });
  assert.doesNotMatch(pre(s, freshSid('B'), ['a.txt']).stderr, CLAIMED);
});

test('a written claim idle past the TTL is taken over with a WARN naming the leftover changes', () => {
  const s = setup();
  const A = freshSid('A');
  const B = freshSid('B');
  written(s, A, 'a.txt', 'A edit, then A went away\n');
  patchClaim(s, 'a.txt', { touchedAt: Date.now() - claims.CLAIM_TTL_MS - 1000 });
  const b = pre(s, B, ['a.txt']);
  assert.doesNotMatch(b.stderr, CLAIMED);
  assert.match(b.stderr, /WARN: took over a\.txt from a stale claim/);
  assert.match(pre(s, A, ['a.txt']).stderr, CLAIMED, 'the claim now belongs to B');
});

test('codex F6: a malformed clock expires instead of holding forever', () => {
  const s = setup();
  written(s, freshSid('A'), 'a.txt', 'A edit\n');
  patchClaim(s, 'a.txt', { touchedAt: 'invalid', pendingAt: 'also invalid' });
  assert.doesNotMatch(pre(s, freshSid('B'), ['a.txt']).stderr, CLAIMED);
});

test('codex F5: staged-only changes (worktree back at HEAD) still hold the claim', () => {
  const s = setup();
  const A = freshSid('A');
  written(s, A, 'a.txt', 'A staged\n');
  g(s.dir, ['add', '--', 'a.txt']);
  fs.writeFileSync(path.join(s.dir, 'a.txt'), 'base\n');
  assert.match(pre(s, freshSid('B'), ['a.txt']).stderr, CLAIMED);
});

test('a dirty file nobody claimed -> pass with a WARN; WORKLOG is never claimed, in any letter case (codex F2)', () => {
  const s = setup();
  fs.writeFileSync(path.join(s.dir, 'a.txt'), 'written via Bash\n');
  const r = pre(s, freshSid('A'), ['a.txt']);
  assert.doesNotMatch(r.stderr, CLAIMED);
  assert.match(r.stderr, /WARN: a\.txt already has uncommitted changes this session did not make/);
  written(s, freshSid('A'), 'agency-os/WORKLOG.md', '# Worklog\n\nA entry\n');
  assert.doesNotMatch(pre(s, freshSid('B'), ['agency-os/WORKLOG.md']).stderr, CLAIMED);
  if (process.platform === 'win32') {
    written(s, freshSid('A'), 'agency-os/worklog.md', '# Worklog\n\nA entry 2\n');
    assert.doesNotMatch(pre(s, freshSid('B'), ['AGENCY-OS/Worklog.md']).stderr, CLAIMED);
  }
});

test('codex F1 (rejected, pinned): autocrlf=true + a clean CRLF worktree file equals HEAD -> no false block', () => {
  const s = setup({ autocrlf: 'true' });
  written(s, freshSid('A'), 'a.txt', 'base\r\n'); // same content as HEAD's LF blob after the clean filter
  assert.doesNotMatch(pre(s, freshSid('B'), ['a.txt']).stderr, CLAIMED);
});

test('multi-file edit blocks on the one claimed file; no session_id -> no claim and no block', () => {
  const s = setup();
  written(s, freshSid('A'), 'b.txt', 'A edit\n');
  const multi = pre(s, freshSid('B'), ['a.txt', 'b.txt']);
  assert.match(multi.stderr, /BLOCKED: b\.txt is being edited/);
  assert.doesNotMatch(multi.stderr, /BLOCKED: a\.txt/);
  assert.doesNotMatch(pre(s, null, ['b.txt']).stderr, CLAIMED);
  assert.equal(fs.readdirSync(s.claimsDir).filter((n) => n.endsWith('.json')).length, 1, 'only A holds a claim (b.txt); blocked B claimed nothing');
});

test('codex r2 F1: six sessions race for the same clean file at once -> exactly one claims it', async () => {
  const s = setup();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hooktest-home-'));
  const one = (sid) => new Promise((resolve) => {
    const child = spawn('node', [RUNNER, 'PreToolUse'], {
      cwd: s.dir,
      // HOLD widens the locked section so unserialized decisions would overlap (without it the race never shows)
      env: { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_CODE_SESSION_ID: '', CLAUDE_SESSION_ID: '', CLAUDE_FILE_CLAIMS_DIR: s.claimsDir, CLAUDE_FILE_CLAIMS_HOLD_MS: '1500' },
    });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', () => resolve(err));
    child.stdin.end(JSON.stringify({ session_id: sid, tool_name: 'Edit', tool_input: { file_path: path.join(s.dir, 'a.txt') } }));
  });
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => one(freshSid(`race${i}`))));
  assert.equal(results.filter((e) => !CLAIMED.test(e) && !/claiming one of these files at this moment/.test(e)).length, 1, results.join('\n---\n'));
});

test('codex r2 F2: a call blocked on one file claims none of its files', () => {
  const s = setup();
  written(s, freshSid('C'), 'b.txt', 'C edit\n');
  assert.match(pre(s, freshSid('A'), ['a.txt', 'b.txt']).stderr, /BLOCKED: b\.txt/);
  assert.doesNotMatch(pre(s, freshSid('D'), ['a.txt']).stderr, CLAIMED, 'A never wrote a.txt, so it must not hold it');
});

test('codex r2 F4: a write whose PostToolUse never ran still holds the file after the pending window', () => {
  const s = setup();
  const A = freshSid('A');
  pre(s, A, ['a.txt']);
  fs.writeFileSync(path.join(s.dir, 'a.txt'), 'A edit, hook crashed before PostToolUse\n');
  patchClaim(s, 'a.txt', { pendingAt: Date.now() - claims.PENDING_MS - 1000 });
  assert.match(pre(s, freshSid('B'), ['a.txt']).stderr, /BLOCKED: a\.txt .*write not confirmed/);
});

test('codex r2 F5: one file reached through a junction/symlink alias gets one claim', () => {
  const s = setup();
  const alias = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fcg-alias-')), 'repo');
  fs.symlinkSync(s.dir, alias, process.platform === 'win32' ? 'junction' : 'dir');
  written(s, freshSid('A'), path.join(alias, 'a.txt'), 'A edit via alias\n');
  assert.match(pre(s, freshSid('B'), ['a.txt']).stderr, CLAIMED);
});

test('a lock held by a live hook -> BUSY block after the wait; a lock older than LOCK_STALE_MS is broken', () => {
  const s = setup();
  process.env.CLAUDE_FILE_CLAIMS_DIR = s.claimsDir;
  const lock = `${claims.claimPath(path.join(s.dir, 'a.txt'))}.lock`;
  delete process.env.CLAUDE_FILE_CLAIMS_DIR;
  fs.writeFileSync(lock, '1');
  assert.match(pre(s, freshSid('A'), ['a.txt']).stderr, /claiming one of these files at this moment/);
  const old = new Date(Date.now() - claims.LOCK_STALE_MS - 1000);
  fs.utimesSync(lock, old, old);
  const r = pre(s, freshSid('A'), ['a.txt']);
  assert.doesNotMatch(r.stderr, /at this moment|is being edited/);
  assert.equal(fs.existsSync(lock), false, 'lock released after the call');
});

test('codex r4 F2: a claim written after this call took its git snapshot is never taken over on that snapshot', () => {
  const s = setup();
  written(s, freshSid('A'), 'a.txt', 'A edit\n');
  g(s.dir, ['commit', '-q', '-m', 'A', '--', 'a.txt']); // file clean again: the snapshot alone would free it
  patchClaim(s, 'a.txt', { touchedAt: Date.now() + 20000 }); // A wrote between B's snapshot and B's lock
  assert.match(pre(s, freshSid('B'), ['a.txt']).stderr, CLAIMED);
  patchClaim(s, 'a.txt', { touchedAt: Date.now() + 10 * 365 * 86400000 }); // corrupt far future: must not hold
  assert.doesNotMatch(pre(s, freshSid('C'), ['a.txt']).stderr, CLAIMED);
});

test('codex r3 F1: a failed Edit gives the file back at once (PostToolUseFailure), not after the pending window', () => {
  const s = setup();
  const A = freshSid('A');
  pre(s, A, ['a.txt']);
  hook(s, 'PostToolUseFailure', A, ['a.txt']);
  assert.doesNotMatch(pre(s, freshSid('B'), ['a.txt']).stderr, CLAIMED);
});

test('codex r3 F3: breaking a stale lock never deletes a fresh lock someone re-took in between', () => {
  const s = setup();
  process.env.CLAUDE_FILE_CLAIMS_DIR = s.claimsDir;
  try {
    fs.mkdirSync(s.claimsDir, { recursive: true });
    const lock = `${claims.claimPath(path.join(s.dir, 'a.txt'))}.lock`;
    fs.writeFileSync(lock, 'fresh-token');
    claims.breakStale(lock, 'the-stale-token-we-saw');
    assert.equal(fs.readFileSync(lock, 'utf8'), 'fresh-token', 'fresh lock restored');
    claims.breakStale(lock, 'fresh-token');
    assert.equal(fs.existsSync(lock), false, 'the observed stale lock is removed');
    assert.deepEqual(fs.readdirSync(s.claimsDir).filter((n) => n.endsWith('.broken')), [], 'no tomb files left');
  } finally { delete process.env.CLAUDE_FILE_CLAIMS_DIR; }
});

test('codex r3 F4: a write that waited past the claim window and landed in a taken-over file -> both sides are told', () => {
  const s = setup();
  const A = freshSid('A');
  const B = freshSid('B');
  pre(s, A, ['a.txt']); // A sits at a permission prompt
  patchClaim(s, 'a.txt', { pendingAt: Date.now() - claims.PENDING_MS - 1000 });
  written(s, B, 'a.txt', 'B edit\n');
  fs.writeFileSync(path.join(s.dir, 'a.txt'), 'B edit\nA edit, approved late\n');
  const a = post(s, A, ['a.txt']);
  assert.equal(a.status, 2);
  assert.match(a.stderr, /your write to a\.txt landed after another session took the file over/);
  assert.match(pre(s, B, ['a.txt']).stderr, /WARN: a\.txt changed outside this session since its last write here/);
});

test('the holder is warned when its file changed outside it (Bash write) between two of its writes', () => {
  const s = setup();
  const A = freshSid('A');
  written(s, A, 'a.txt', 'A edit\n');
  assert.doesNotMatch(pre(s, A, ['a.txt']).stderr, /changed outside this session/);
  post(s, A, ['a.txt']);
  fs.writeFileSync(path.join(s.dir, 'a.txt'), 'A edit\nsed -i from somewhere\n');
  assert.match(pre(s, A, ['a.txt']).stderr, /WARN: a\.txt changed outside this session/);
});

test('Codex apply_patch meets the same claim: deny decision; release CLI frees the file', () => {
  const s = setup();
  written(s, freshSid('claude'), 'a.txt', 'claude edit\n');
  const cx = pre(s, freshSid('codex'), ['a.txt'], { host: 'codex' });
  const decision = JSON.parse(cx.stdout);
  assert.equal(decision.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(decision.hookSpecificOutput.permissionDecisionReason, CLAIMED);
  const rel = spawnSync('node', [CLI, 'release', path.join(s.dir, 'a.txt')], { encoding: 'utf8', env: { ...process.env, CLAUDE_FILE_CLAIMS_DIR: s.claimsDir } });
  assert.match(rel.stdout, /^released .*a\.txt \(was claude:/);
  const again = pre(s, freshSid('codex'), ['a.txt'], { host: 'codex' });
  assert.doesNotMatch(again.stdout + again.stderr, CLAIMED);
  assert.match(again.stderr, /WARN: a\.txt already has uncommitted changes/);
});
