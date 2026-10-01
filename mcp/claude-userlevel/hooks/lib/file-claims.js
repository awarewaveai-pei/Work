// File claims: one writer per file at a time across concurrent sessions (Claude Code + Codex) sharing one
// working directory. Consumed by rules/file-claim-guard.js; also a small operator CLI (see bottom).
//
// WHY (2026-10-01): every commit-time gate (git-commit-scope-guard, git-shared-file-guard) runs after two
// sessions' hunks are already mixed inside the same file -- git stages whole files, so a correctly NAMED
// `git add -- f` still carries the other author's lines (WORKLOG 2026-08-26 `0b4057f7b`). Only WORKLOG/TASKS
// got hunk-level commits (private index); every other file had no guard. Invariant enforced here instead: a
// file with uncommitted changes has one writing session (among Write/Edit/apply_patch writers that carry a
// real session id -- Bash writes have no file list, id-less payloads fail open like every gate).
//
// A claim is <tmpdir>/claude-file-claims/<sha1(real path)>.json. "Claimed" is not "written" (codex r1), so:
//   pendingAt -- PreToolUse; the write is in flight (permission prompt included) for PENDING_MS. A failed
//                write releases it at once (PostToolUseFailure).
//   baseBlob  -- worktree blob at PreToolUse; if the file later differs, the write happened even when
//                PostToolUse never confirmed it (hook crash/timeout -- codex r2).
//   touchedAt -- PostToolUse; the write happened. lastBlob = the file right after it, so the holder's next
//                write can tell that someone else (another session past PENDING_MS, or Bash) wrote in between.
// A written claim holds while the file differs from HEAD (worktree or index) and the holder wrote it within
// CLAIM_TTL_MS. No release step: commit or revert makes the file equal HEAD and the claim stops counting.
// Locking: every read-decide-write of claim JSON runs under a per-file lock (sorted order, no deadlock). Git
// state is computed BEFORE taking the lock (stateOf), so a lock is held for milliseconds and LOCK_STALE_MS can
// only mean a dead process (codex r3).
// Pitfall: hash-object WITH a path applies the repo's clean filters (autocrlf), so a CRLF worktree file that
// is unchanged still equals HEAD (verified 2026-10-01). Do not add --no-filters.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CLAIM_TTL_MS = 4 * 60 * 60 * 1000;
const PENDING_MS = 15 * 60 * 1000;
const LOCK_WAIT_MS = 3000;
const LOCK_STALE_MS = 10000;

function claimsDir() {
  return process.env.CLAUDE_FILE_CLAIMS_DIR || path.join(os.tmpdir(), 'claude-file-claims');
}

// Real path of a file that may not exist yet: realpath of the nearest existing ancestor + the rest. One file
// reached through a junction (~/.claude -> D:\Work\.claude) must get one claim, not two (codex r2). On
// Windows the native realpath also restores the on-disk letter case.
function realAbs(p) {
  const abs = path.resolve(String(p));
  let head = abs;
  const tail = [];
  while (!fs.existsSync(head)) {
    const up = path.dirname(head);
    if (up === head) return abs;
    tail.unshift(path.basename(head));
    head = up;
  }
  try { return path.join(fs.realpathSync.native(head), ...tail); } catch (_) { return abs; }
}

function normAbs(p) {
  const abs = realAbs(p).replace(/\\/g, '/');
  return process.platform === 'win32' ? abs.toLowerCase() : abs;
}

function claimPath(absFile) {
  return path.join(claimsDir(), crypto.createHash('sha1').update(normAbs(absFile)).digest('hex') + '.json');
}

function git(args, cwd) {
  try {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 10000 });
    if (r.error || typeof r.status !== 'number' || r.status !== 0) return null;
    return String(r.stdout || '').trim();
  } catch (_) {
    return null;
  }
}

// -> { root, rel } or null when the file is not inside a git work tree. Walks up to the nearest existing
// directory so a Write creating a new directory still resolves.
function repoOf(absFile) {
  const real = realAbs(absFile);
  let dir = path.dirname(real);
  while (!fs.existsSync(dir)) {
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
  const root = git(['rev-parse', '--show-toplevel'], dir);
  if (!root) return null;
  const rel = path.relative(realAbs(root), real).replace(/\\/g, '/');
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return { root, rel };
}

// Worktree blob of the file, '' when it does not exist, null when git cannot tell.
function blobOf(repo) {
  if (!fs.existsSync(path.join(repo.root, repo.rel))) return '';
  return git(['hash-object', '--', repo.rel], repo.root);
}

// Git facts about one file, computed outside any lock. dirty: worktree or index differs from HEAD (staged-only
// included); null = cannot tell. blob: see blobOf.
function stateOf(repo) {
  const head = git(['rev-parse', '--verify', '-q', `HEAD:${repo.rel}`], repo.root);
  const idx = git(['rev-parse', '--verify', '-q', `:${repo.rel}`], repo.root);
  const blob = blobOf(repo);
  let dirty;
  if (idx !== head) dirty = true;
  else if (blob === '') dirty = head !== null; // deleted in the worktree = dirty; never existed = clean
  else if (blob === null) dirty = null;
  else dirty = blob !== head;
  return { dirty, blob };
}

const isShared = (rel, list) => list.some((s) => (process.platform === 'win32' ? s.toLowerCase() === rel.toLowerCase() : s === rel));

function readClaim(absFile) {
  try {
    const c = JSON.parse(fs.readFileSync(claimPath(absFile), 'utf8'));
    return c && typeof c.sid === 'string' ? c : null;
  } catch (_) {
    return null;
  }
}

function writeClaim(absFile, claim) {
  fs.mkdirSync(claimsDir(), { recursive: true });
  const target = claimPath(absFile);
  const tmp = `${target}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(claim), 'utf8');
  fs.renameSync(tmp, target);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const readSafe = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; } };

// Remove a lock that was `observed` (its token) as stale. Rename is atomic, so only one breaker gets the file;
// if what it got is not the stale lock it observed (someone broke and re-took it in between -- codex r3 ABA),
// it is linked back (link fails if a newer lock already exists, never overwrites one).
function breakStale(lock, observed) {
  const tomb = `${lock}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.broken`;
  try { fs.renameSync(lock, tomb); } catch (_) { return; }
  if (readSafe(tomb) !== observed) { try { fs.linkSync(tomb, lock); } catch (_) { /* a newer lock exists */ } }
  try { fs.unlinkSync(tomb); } catch (_) { /* already gone */ }
}

function acquire(lock) {
  const token = `${process.pid}:${crypto.randomBytes(8).toString('hex')}`;
  const until = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      fs.writeFileSync(lock, token, { flag: 'wx' });
      return token;
    } catch (e) {
      if (!e || e.code !== 'EEXIST') throw e;
    }
    const observed = readSafe(lock);
    let mtime = null;
    try { mtime = fs.statSync(lock).mtimeMs; } catch (_) { continue; } // released meanwhile: retry
    if (observed !== null && Date.now() - mtime > LOCK_STALE_MS) { breakStale(lock, observed); continue; }
    if (Date.now() > until) return null;
    sleep(25);
  }
}

// Run fn() holding the lock of every file in absList. fn must not spawn processes (see header). ->
// { value } or { busy: true } when another session held one past LOCK_WAIT_MS.
function withLocks(absList, fn) {
  fs.mkdirSync(claimsDir(), { recursive: true });
  const locks = [...new Set(absList.map((a) => `${claimPath(a)}.lock`))].sort();
  const held = [];
  try {
    for (const l of locks) {
      const token = acquire(l);
      if (!token) return { busy: true };
      held.push([l, token]);
    }
    const hold = Number(process.env.CLAUDE_FILE_CLAIMS_HOLD_MS); // test seam: widen the critical section
    if (hold > 0) sleep(hold);
    return { value: fn() };
  } finally {
    for (const [l, token] of held) { if (readSafe(l) === token) { try { fs.unlinkSync(l); } catch (_) { /* gone */ } } }
  }
}

// age in ms, or Infinity for a missing / malformed clock (a NaN must expire, never hold forever).
function ageOf(t, now) {
  const n = Number(t);
  return t != null && Number.isFinite(n) ? now - n : Infinity;
}

// A foreign claim blocks while its write is in flight, or while its written changes are still uncommitted.
// state = stateOf(repo), computed by the caller outside the lock.
function isLive(claim, state, now) {
  if (!claim) return false;
  if (ageOf(claim.pendingAt, now) < PENDING_MS) return true;
  let writtenAt = claim.touchedAt;
  if (ageOf(writtenAt, now) === Infinity && typeof claim.baseBlob === 'string'
      && state.blob !== null && state.blob !== claim.baseBlob) {
    writtenAt = claim.pendingAt; // wrote; PostToolUse never confirmed
  }
  return ageOf(writtenAt, now) < CLAIM_TTL_MS && state.dirty === true;
}

function releaseClaim(absFile) {
  try { fs.unlinkSync(claimPath(absFile)); return true; } catch (_) { return false; }
}

function listClaims() {
  let names = [];
  try { names = fs.readdirSync(claimsDir()).filter((n) => n.endsWith('.json')); } catch (_) { return []; }
  const out = [];
  for (const n of names) {
    try { out.push(JSON.parse(fs.readFileSync(path.join(claimsDir(), n), 'utf8'))); } catch (_) { /* half-written or foreign file */ }
  }
  return out;
}

module.exports = {
  CLAIM_TTL_MS, PENDING_MS, LOCK_STALE_MS, claimsDir, claimPath, realAbs, normAbs, repoOf, blobOf, stateOf,
  isShared, ageOf, readClaim, writeClaim, withLocks, breakStale, isLive, releaseClaim, listClaims,
};

// Operator CLI:  node file-claims.js list            -- every claim, with live/stale
//                node file-claims.js release <path>  -- drop one claim (take over a file on purpose)
if (require.main === module) {
  const [cmd, arg] = process.argv.slice(2);
  const now = Date.now();
  if (cmd === 'list') {
    const last = (c) => Math.min(ageOf(c.touchedAt, now), ageOf(c.pendingAt, now));
    const rows = listClaims().sort((a, b) => last(a) - last(b));
    if (!rows.length) console.log('no claims');
    for (const c of rows) {
      const repo = repoOf(c.path);
      const state = repo && isLive(c, stateOf(repo), now) ? 'LIVE ' : 'stale';
      const age = Number.isFinite(last(c)) ? `${Math.round(last(c) / 60000)}m` : '?';
      console.log(`${state}  ${age}  ${c.touchedAt ? 'written' : 'pending'}  ${c.host}:${String(c.sid).slice(0, 12)}  ${c.path}`);
    }
  } else if (cmd === 'release' && arg) {
    const c = readClaim(arg);
    console.log(releaseClaim(arg) ? `released ${arg} (was ${c ? `${c.host}:${c.sid}` : '?'})` : `no claim on ${arg}`);
  } else {
    console.log('usage: node file-claims.js list | release <path>');
    process.exitCode = 2;
  }
}
