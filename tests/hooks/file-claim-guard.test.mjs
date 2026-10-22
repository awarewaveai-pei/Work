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

// ---- Bash: PreToolUse snapshots the work tree, PostToolUse / PostToolUseFailure compares ----

function bashHook(s, event, sid, id, { host = 'claude', command = `step ${id}` } = {}) {
  const env = { CLAUDE_FILE_CLAIMS_DIR: s.claimsDir, CODEX_HOME: s.claimsDir };
  if (host === 'codex') { // no tool_use_id: the key falls back to turn_id + command
    return runNode(RUNNER, { session_id: sid, turn_id: id, cwd: s.dir, tool_name: 'exec_command', tool_input: { cmd: command } },
      { args: [event, '--host=codex'], cwd: s.dir, env });
  }
  return runNode(RUNNER, { session_id: sid, tool_use_id: id, cwd: s.dir, tool_name: 'Bash', tool_input: { command } }, { args: [event], cwd: s.dir, env });
}

// A Bash call that runs `body` (a real process writing files) between its two hooks.
function bashCall(s, sid, body, { event = 'PostToolUse', host } = {}) {
  const id = freshSid('tu');
  bashHook(s, 'PreToolUse', sid, id, { host });
  body();
  return bashHook(s, event, sid, id, { host });
}

const py = (s, code) => {
  const r = spawnSync('python', ['-c', code], { cwd: s.dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
};
const append = (s, f, text) => py(s, `open(${JSON.stringify(f)}, 'a', newline='').write(${JSON.stringify(text)})`);
const holderOf = (s, f) => {
  process.env.CLAUDE_FILE_CLAIMS_DIR = s.claimsDir;
  try { const c = claims.readClaim(path.join(s.dir, f)); return c && c.sid; } finally { delete process.env.CLAUDE_FILE_CLAIMS_DIR; }
};
const CHANGED_HELD = /this command changed a\.txt, which another session is editing/;

test('acceptance: B patches A\'s claimed dirty file via `python -c` -> exit 2 at B\'s PostToolUse naming file and holder; A keeps the claim', () => {
  const s = setup();
  const A = freshSid('A');
  const B = freshSid('B');
  written(s, A, 'a.txt', 'A edit\n');
  const b = bashCall(s, B, () => append(s, 'a.txt', 'B via python\n'));
  assert.equal(b.status, 2, b.stderr);
  assert.match(b.stderr, new RegExp(`this command changed a\\.txt, which another session is editing \\(claude:${A.slice(0, 12)}`));
  assert.equal(holderOf(s, 'a.txt'), A);
  assert.match(pre(s, A, ['a.txt']).stderr, /WARN: a\.txt changed outside this session/, 'the holder hears it too');
});

// Script-generated output (claims.GENERATED) has no hand-written hunk: another session's claim must not make a
// regenerating command warn; the same situation on a normal tracked file still does.
function seedGenerated(s, f) {
  fs.mkdirSync(path.dirname(path.join(s.dir, f)), { recursive: true });
  fs.writeFileSync(path.join(s.dir, f), '{}\n');
  g(s.dir, ['add', '-A']);
  g(s.dir, ['commit', '-q', '-m', 'seed generated']);
  return f;
}

for (const f of ['agency-os/reports/status/x-LATEST.json', 'agency-os/reports/agent-dispatch/dispatch-20261022.jsonl']) {
  test(`generated: B rewrites ${f} that A claimed -> no WARNING; a.txt in the same setup still warns`, () => {
    const s = setup();
    seedGenerated(s, f);
    const A = freshSid('A');
    const B = freshSid('B');
    written(s, A, f, '{"a":1}\n');
    written(s, A, 'a.txt', 'A edit\n');
    const gen = bashCall(s, B, () => append(s, f, 'regenerated\n'));
    assert.equal(gen.status, 0, gen.stderr);
    assert.doesNotMatch(gen.stderr, /another session is editing/);
    assert.equal(holderOf(s, f), null, 'a generated file is claimed by nobody');
    const real = bashCall(s, B, () => append(s, 'a.txt', 'B via python\n'));
    assert.equal(real.status, 2, real.stderr);
    assert.match(real.stderr, CHANGED_HELD);
  });
}

test('acceptance: A\'s Edit landing during B\'s Bash call is not B\'s -- neither when A already held the file nor when A claims it then', () => {
  const s = setup();
  const A = freshSid('A');
  const B = freshSid('B');
  written(s, A, 'a.txt', 'A edit 1\n');
  const held = bashCall(s, B, () => written(s, A, 'a.txt', 'A edit 1\nA edit 2\n'));
  assert.equal(held.status, 0, held.stderr);
  assert.doesNotMatch(held.stderr, /this command/);
  const fresh = bashCall(s, B, () => written(s, A, 'b.txt', 'A first edit of b\n'));
  assert.equal(fresh.status, 0, fresh.stderr);
  assert.equal(holderOf(s, 'b.txt'), A, 'B did not take the file A wrote');
});

test('A\'s Edit still in flight (PostToolUse not yet run) when B\'s Bash call ends -> not B\'s', () => {
  const s = setup();
  const A = freshSid('A');
  const B = freshSid('B');
  written(s, A, 'a.txt', 'A edit 1\n');
  const b = bashCall(s, B, () => { pre(s, A, ['a.txt']); fs.writeFileSync(path.join(s.dir, 'a.txt'), 'A edit 2\n'); });
  assert.equal(b.status, 0, b.stderr);
  assert.match(b.stderr, /WARN: a\.txt changed during this command while another session had a write to it in flight .*cannot tell whose change it is/, 'inconclusive -> told, not silenced (codex r6 F1)');
  post(s, A, ['a.txt']);
  assert.equal(holderOf(s, 'a.txt'), A);
});

test('B\'s write is not hidden by a concurrent Edit of A: the write log has a gap where B wrote', () => {
  const s = setup();
  const A = freshSid('A');
  const B = freshSid('B');
  written(s, A, 'a.txt', 'A edit 1\n');
  const b = bashCall(s, B, () => {
    written(s, A, 'a.txt', 'A edit 1\nA edit 2\n');
    append(s, 'a.txt', 'B via python\n');
  });
  assert.equal(b.status, 2);
  assert.match(b.stderr, CHANGED_HELD);
});

test('B reverts A\'s claimed file with `git checkout` -> exit 2: A\'s work is gone from the work tree', () => {
  const s = setup();
  written(s, freshSid('A'), 'a.txt', 'A edit\n');
  const b = bashCall(s, freshSid('B'), () => g(s.dir, ['checkout', '--', 'a.txt']));
  assert.equal(b.status, 2);
  assert.match(b.stderr, /this command changed a\.txt, which another session is editing .*back at HEAD now/);
});

test('a file nobody held, written by Bash (modified or created) -> this session holds it; others are blocked; no false WARN for the holder', () => {
  const s = setup();
  const B = freshSid('B');
  const b = bashCall(s, B, () => { append(s, 'a.txt', 'B via python\n'); py(s, "open('new.txt', 'w').write('new\\n')"); });
  assert.equal(b.status, 0, b.stderr);
  assert.equal(holderOf(s, 'a.txt'), B);
  assert.equal(holderOf(s, 'new.txt'), B);
  assert.match(pre(s, freshSid('C'), ['a.txt']).stderr, CLAIMED);
  assert.match(pre(s, freshSid('C'), ['new.txt']).stderr, CLAIMED);
  assert.doesNotMatch(pre(s, B, ['a.txt']).stderr, /changed outside this session/, 'its own Bash write moved lastBlob');
  assert.equal(bashCall(s, B, () => append(s, 'agency-os/WORKLOG.md', 'B entry\n')).status, 0);
  assert.equal(holderOf(s, 'agency-os/WORKLOG.md'), null, 'WORKLOG is never claimed through Bash either');
});

test('the holder\'s own Bash write keeps the claim and moves lastBlob (no "changed outside" WARN later)', () => {
  const s = setup();
  const A = freshSid('A');
  written(s, A, 'a.txt', 'A edit\n');
  const a = bashCall(s, A, () => append(s, 'a.txt', 'A via python\n'));
  assert.equal(a.status, 0, a.stderr);
  assert.doesNotMatch(pre(s, A, ['a.txt']).stderr, /changed outside this session/);
});

test('Bash writing a file that already had unclaimed changes -> held, with a WARN about the earlier changes', () => {
  const s = setup();
  fs.writeFileSync(path.join(s.dir, 'a.txt'), 'earlier, nobody claimed\n');
  const B = freshSid('B');
  const b = bashCall(s, B, () => append(s, 'a.txt', 'B via python\n'));
  assert.equal(b.status, 0);
  assert.match(b.stderr, /WARN: a\.txt already had uncommitted changes this session did not make/);
  assert.equal(holderOf(s, 'a.txt'), B);
});

test('a failed command still wrote: PostToolUseFailure reports like PostToolUse', () => {
  const s = setup();
  written(s, freshSid('A'), 'a.txt', 'A edit\n');
  const b = bashCall(s, freshSid('B'), () => append(s, 'a.txt', 'B, then the command failed\n'), { event: 'PostToolUseFailure' });
  assert.equal(b.status, 2);
  assert.match(b.stderr, CHANGED_HELD);
});

test('read-only command, a commit of the file, a CRLF rewrite under autocrlf -> nothing changed; snapshots are consumed', () => {
  const s = setup({ autocrlf: 'true' });
  const A = freshSid('A');
  written(s, A, 'a.txt', 'A edit\n');
  const B = freshSid('B');
  assert.equal(bashCall(s, B, () => g(s.dir, ['status'])).status, 0);
  assert.equal(bashCall(s, B, () => fs.writeFileSync(path.join(s.dir, 'b.txt'), 'base\r\n')).status, 0, 'same content after the clean filter');
  assert.equal(holderOf(s, 'b.txt'), null);
  assert.equal(bashCall(s, B, () => g(s.dir, ['rm', '-q', '--cached', '--', 'b.txt'])).status, 0);
  assert.equal(holderOf(s, 'b.txt'), null, 'index-only change: listed now, but its work-tree blob still equals the old HEAD blob');
  const c = bashCall(s, B, () => g(s.dir, ['commit', '-q', '-m', 'B commits A\'s file', '--', 'a.txt']));
  assert.doesNotMatch(c.stderr, /this command changed/, 'a commit does not change the work tree (commit scope is git-commit-scope-guard\'s job)');
  assert.deepEqual(fs.readdirSync(path.join(s.claimsDir, 'bash')).filter((n) => n.startsWith('snap-')), []);
});

test('two Bash calls of one session in parallel, same command text, keep separate snapshots (tool_use_id)', () => {
  const s = setup();
  written(s, freshSid('A'), 'a.txt', 'A edit\n');
  const B = freshSid('B');
  const same = { command: 'npm test' };
  bashHook(s, 'PreToolUse', B, 'one', same);
  append(s, 'a.txt', 'written while only call one ran\n');
  bashHook(s, 'PreToolUse', B, 'two', same);
  const one = bashHook(s, 'PostToolUse', B, 'one', same);
  assert.equal(one.status, 2, 'call one still has its own snapshot');
  assert.doesNotMatch(one.stderr, /ran in this repo at the same time/, 'call two (same session, in flight) is not "another session"');
  assert.equal(bashHook(s, 'PostToolUse', B, 'two', same).status, 0, 'call two started after the write');
  assert.deepEqual(fs.readdirSync(path.join(s.claimsDir, 'bash')).filter((n) => n.startsWith('snap-')), [], 'both snapshots consumed');
});

test('a same-size rewrite of a file the stat cache already holds is still seen (cache keyed on size + mtime)', () => {
  const s = setup();
  written(s, freshSid('A'), 'a.txt', 'A edit\n');
  const old = new Date(Date.now() - 3600000);
  fs.utimesSync(path.join(s.dir, 'a.txt'), old, old); // old enough to be cached at B's PreToolUse
  const b = bashCall(s, freshSid('B'), () => py(s, "open('a.txt', 'w', newline='').write('B edit\\n')"));
  assert.equal(fs.readFileSync(path.join(s.dir, 'a.txt'), 'utf8'), 'B edit\n');
  assert.equal(b.status, 2);
  assert.match(b.stderr, CHANGED_HELD);
});

test('another session\'s Bash running at the same time is named in the report', () => {
  const s = setup();
  written(s, freshSid('A'), 'a.txt', 'A edit\n');
  const C = freshSid('C');
  bashHook(s, 'PreToolUse', C, 'c-long');
  const b = bashCall(s, freshSid('B'), () => append(s, 'a.txt', 'B or C?\n'));
  assert.equal(b.status, 2);
  assert.match(b.stderr, new RegExp(`Bash of ${C.slice(0, 12)} ran in this repo at the same time`));
  const c = bashHook(s, 'PostToolUse', C, 'c-long');
  assert.equal(c.status, 2, 'codex r6 F3: B logged the write while C ran -- no proof against C, so C is told too');
  assert.match(c.stderr, /this command changed a\.txt, which another session is editing/);
  assert.match(c.stderr, /Bash of .* ran in this repo at the same time/, 'C learns that B overlapped');
});

test('one session, two parallel calls over the same write -> one report: its own logged entry is proof for itself', () => {
  const s = setup();
  written(s, freshSid('A'), 'a.txt', 'A edit\n');
  const B = freshSid('B');
  bashHook(s, 'PreToolUse', B, 'one');
  bashHook(s, 'PreToolUse', B, 'two');
  append(s, 'a.txt', 'B\n');
  assert.equal(bashHook(s, 'PostToolUse', B, 'one').status, 2);
  assert.equal(bashHook(s, 'PostToolUse', B, 'two').status, 0);
});

test('codex r6 F2: a logged write with an unknown start (from: null) is no proof -- the command is still reported', () => {
  const s = setup();
  written(s, freshSid('A'), 'a.txt', 'A edit\n');
  const b = bashCall(s, freshSid('B'), () => {
    append(s, 'a.txt', 'B via python\n');
    const blob = g(s.dir, ['hash-object', 'a.txt']).out;
    patchClaim(s, 'a.txt', { writes: [{ sid: 'late-edit', from: null, to: blob, at: Date.now(), end: Date.now() }] });
  });
  assert.equal(b.status, 2, b.stderr);
  assert.match(b.stderr, CHANGED_HELD);
});

test('Codex shell call (no tool_use_id) meets the same rule: block decision at PostToolUse', () => {
  const s = setup();
  written(s, freshSid('A'), 'a.txt', 'A edit\n');
  const cx = bashCall(s, freshSid('codex'), () => append(s, 'a.txt', 'codex via python\n'), { host: 'codex' });
  const decision = JSON.parse(cx.stdout);
  assert.equal(decision.decision, 'block');
  assert.match(decision.reason, CHANGED_HELD);
});

test('no session id -> no snapshot, no claim', () => {
  const s = setup();
  const env = { CLAUDE_FILE_CLAIMS_DIR: s.claimsDir };
  runNode(RUNNER, { tool_name: 'Bash', cwd: s.dir, tool_input: { command: 'x' } }, { args: ['PreToolUse'], cwd: s.dir, env });
  append(s, 'a.txt', 'anonymous\n');
  runNode(RUNNER, { tool_name: 'Bash', cwd: s.dir, tool_input: { command: 'x' } }, { args: ['PostToolUse'], cwd: s.dir, env });
  assert.equal(fs.existsSync(path.join(s.claimsDir, 'bash')), false);
  assert.equal(holderOf(s, 'a.txt'), null);
});

test('found live: a commit ends the claim -- the file dirtied again by a writer the hooks cannot see does not revive it', () => {
  const s = setup();
  const A = freshSid('A');
  written(s, A, 'a.txt', 'A edit\n');
  g(s.dir, ['commit', '-q', '-m', 'A', '--', 'a.txt']);
  fs.writeFileSync(path.join(s.dir, 'a.txt'), 'the operator, in an editor\n');
  assert.doesNotMatch(pre(s, freshSid('B'), ['a.txt']).stderr, CLAIMED);
});

test('a commit of an OLDER staged version after the holder wrote does not end the claim (content, not commit time)', () => {
  const s = setup();
  fs.writeFileSync(path.join(s.dir, 'a.txt'), 'staged earlier\n');
  g(s.dir, ['add', '--', 'a.txt']);
  written(s, freshSid('A'), 'a.txt', 'A edit\n');
  g(s.dir, ['commit', '-q', '-m', 'commits the index, not the edit of A']);
  assert.match(pre(s, freshSid('B'), ['a.txt']).stderr, CLAIMED);
});

test('Bash judges the holder\'s claim as of the command start: committed or reverted claims are not revived by the command\'s own write', () => {
  const s = setup();
  const A = freshSid('A');
  written(s, A, 'a.txt', 'A edit\n');
  written(s, A, 'b.txt', 'A edit\n');
  g(s.dir, ['checkout', '--', 'a.txt']); // A reverted
  g(s.dir, ['commit', '-q', '-m', 'A', '--', 'b.txt']); // A committed
  const B = freshSid('B');
  const b = bashCall(s, B, () => { append(s, 'a.txt', 'B\n'); append(s, 'b.txt', 'B\n'); });
  assert.equal(b.status, 0, b.stderr);
  assert.equal(holderOf(s, 'a.txt'), B);
  assert.equal(holderOf(s, 'b.txt'), B);
});

test('a file clean when B\'s command started, first written by A\'s Edit during it, then by B -> exit 2 (A wrote during the command)', () => {
  const s = setup();
  const A = freshSid('A');
  const b = bashCall(s, freshSid('B'), () => {
    written(s, A, 'b.txt', 'A first edit of b\n');
    append(s, 'b.txt', 'B via python, on top\n');
  });
  assert.equal(b.status, 2);
  assert.match(b.stderr, /this command changed b\.txt, which another session is editing/);
  assert.equal(holderOf(s, 'b.txt'), A);
});

test('codex r5 F1: two Codex calls sharing a key (no tool_use_id, same turn + cwd + command) keep separate snapshots', () => {
  const s = setup();
  written(s, freshSid('A'), 'a.txt', 'A edit\n');
  const cx = freshSid('codex');
  const o = { host: 'codex', command: 'npm test' };
  bashHook(s, 'PreToolUse', cx, 't1', o);
  append(s, 'a.txt', 'written while only the first call ran\n');
  bashHook(s, 'PreToolUse', cx, 't1', o);
  const first = bashHook(s, 'PostToolUse', cx, 't1', o);
  assert.equal(JSON.parse(first.stdout).decision, 'block', first.stderr);
  const second = bashHook(s, 'PostToolUse', cx, 't1', o);
  assert.doesNotMatch(second.stdout, /block/, 'the second call started after the write');
  assert.deepEqual(fs.readdirSync(path.join(s.claimsDir, 'bash')).filter((n) => n.startsWith('snap-')), []);
});

test('codex r5 F2: a same-size rewrite that restores the mtime is still seen (ctime is in the stat cache key)', () => {
  const s = setup();
  written(s, freshSid('A'), 'a.txt', 'A edit\n');
  const old = new Date(Date.now() - 3600000);
  fs.utimesSync(path.join(s.dir, 'a.txt'), old, old);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2300); // utimes moved ctime: wait out RACY_MS so it is cached
  const b = bashCall(s, freshSid('B'), () => py(s, "import os; st = os.stat('a.txt'); open('a.txt', 'w', newline='').write('B edit\\n'); os.utime('a.txt', ns=(st.st_atime_ns, st.st_mtime_ns))"));
  assert.equal(fs.statSync(path.join(s.dir, 'a.txt')).mtimeMs, old.getTime(), 'mtime restored');
  assert.equal(b.status, 2, b.stderr);
  assert.match(b.stderr, CHANGED_HELD);
});

test('codex r5 F3: a file written after the PostToolUse hook started is not the command\'s', () => {
  const s = setup();
  const b = bashCall(s, freshSid('B'), () => {
    fs.writeFileSync(path.join(s.dir, 'a.txt'), 'another session, after this command ended\n');
    const later = new Date(Date.now() + 60000); // stands in for "written after the hook process started"
    fs.utimesSync(path.join(s.dir, 'a.txt'), later, later);
  });
  assert.equal(b.status, 0, b.stderr);
  assert.equal(holderOf(s, 'a.txt'), null);
});

test('codex r5 F4: a file too big to hash that changed is named in a WARN; unchanged, it is not', () => {
  const s = setup();
  const big = path.join(s.dir, 'big.bin');
  fs.writeFileSync(big, Buffer.alloc(33 * 1024 * 1024));
  const B = freshSid('B');
  assert.doesNotMatch(bashCall(s, B, () => {}).stderr, /too large/);
  const b = bashCall(s, B, () => fs.appendFileSync(big, 'x'));
  assert.match(b.stderr, /WARN: big\.bin changed during this command but is too large for file-claim-guard to compare/);
});

test('Posts arriving out of order still find their own snapshot (tool_use_id key, not the FIFO)', () => {
  const s = setup();
  written(s, freshSid('A'), 'a.txt', 'A edit\n');
  const B = freshSid('B');
  const same = { command: 'npm test' };
  bashHook(s, 'PreToolUse', B, 'early', same);
  append(s, 'a.txt', 'written while only the early call ran\n');
  bashHook(s, 'PreToolUse', B, 'late', same);
  assert.equal(bashHook(s, 'PostToolUse', B, 'late', same).status, 0, 'the late call started after the write');
  assert.equal(bashHook(s, 'PostToolUse', B, 'early', same).status, 2);
});
