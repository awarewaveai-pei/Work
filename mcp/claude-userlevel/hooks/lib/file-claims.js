// File claims: one writer per file at a time across concurrent sessions (Claude Code + Codex) sharing one
// working directory. Consumed by rules/file-claim-guard.js; also a small operator CLI (see bottom).
//
// WHY (2026-10-01): every commit-time gate (git-commit-scope-guard, git-shared-file-guard) runs after two
// sessions' hunks are already mixed inside the same file -- git stages whole files, so a correctly NAMED
// `git add -- f` still carries the other author's lines (WORKLOG 2026-08-26 `0b4057f7b`). Only WORKLOG/TASKS
// got hunk-level commits (private index); every other file had no guard. Invariant enforced here instead: a
// file with uncommitted changes has one writing session (among writers that carry a real session id --
// id-less payloads fail open like every gate). Write/Edit/apply_patch name their files; Bash does not, so its
// writes are found by a before/after snapshot of the work tree (bottom of this file).
//
// A claim is <tmpdir>/claude-file-claims/<sha1(real path)>.json. "Claimed" is not "written" (codex r1), so:
//   pendingAt -- PreToolUse; the write is in flight (permission prompt included) for PENDING_MS. A failed
//                write releases it at once (PostToolUseFailure).
//   baseBlob  -- worktree blob at PreToolUse; if the file later differs, the write happened even when
//                PostToolUse never confirmed it (hook crash/timeout -- codex r2).
//   touchedAt -- PostToolUse; the write happened. lastBlob = the file right after it, so the holder's next
//                write can tell that someone else (another session past PENDING_MS, or Bash) wrote in between.
//   writes    -- the last MAX_WRITES writes by ANY session, {sid, from, to, at, end} blobs and times: lets a Bash
//                command that saw the file change tell its own write from one a concurrent Write/Edit made.
// A written claim holds while the file differs from HEAD (worktree or index), the holder wrote it within
// CLAIM_TTL_MS, and HEAD does not already hold the holder's last write (HEAD:file == lastBlob). No release
// step: commit or revert makes the file equal HEAD and the claim stops counting; the lastBlob check keeps a
// committed claim ended when someone else dirties the file again (found live 2026-10-01: the next writer
// revived it). Content, not commit time: a commit of an older staged version must not end the claim.
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

// Raw stdout (untrimmed: porcelain lines start with a space), or null on any failure.
function gitRaw(args, cwd, input) {
  try {
    const r = spawnSync('git', args, { cwd, input, encoding: 'utf8', timeout: 10000, maxBuffer: 64 * 1024 * 1024 });
    if (r.error || typeof r.status !== 'number' || r.status !== 0) return null;
    return String(r.stdout || '');
  } catch (_) {
    return null;
  }
}

function git(args, cwd) {
  const out = gitRaw(args, cwd);
  return out === null ? null : out.trim();
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
// included); null = cannot tell. blob: see blobOf. head: HEAD's blob of it (null = not in HEAD / cannot tell).
function stateOf(repo) {
  const head = git(['rev-parse', '--verify', '-q', `HEAD:${repo.rel}`], repo.root);
  const idx = git(['rev-parse', '--verify', '-q', `:${repo.rel}`], repo.root);
  const blob = blobOf(repo);
  let dirty;
  if (idx !== head) dirty = true;
  else if (blob === '') dirty = head !== null; // deleted in the worktree = dirty; never existed = clean
  else if (blob === null) dirty = null;
  else dirty = blob !== head;
  return { dirty, blob, head };
}

// Whole-file output of scripts (no hand-written hunk to carry): never claimed, never warned about. Only paths
// whose every writer is a script -- add a pattern after grepping its writers, not because a warning annoyed.
const GENERATED = [/^agency-os\/reports\/status\/[^/]+-LATEST\.(json|md)$/i];
const isGenerated = (rel) => GENERATED.some((re) => re.test(rel));

const isShared = (rel, list) => list.some((s) => (process.platform === 'win32' ? s.toLowerCase() === rel.toLowerCase() : s === rel));

function readClaim(absFile) {
  try {
    const c = JSON.parse(fs.readFileSync(claimPath(absFile), 'utf8'));
    return c && typeof c.sid === 'string' ? c : null;
  } catch (_) {
    return null;
  }
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; }
}

function writeJsonAtomic(target, obj) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj), 'utf8');
  fs.renameSync(tmp, target);
}

function writeClaim(absFile, claim) {
  writeJsonAtomic(claimPath(absFile), claim);
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
  if (typeof claim.lastBlob === 'string' && state.head === claim.lastBlob) return false; // its last write is committed
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

// ---- write log -------------------------------------------------------------------------------------------
const MAX_WRITES = 16;
const WRITE_LOG_MS = 24 * 60 * 60 * 1000;

function withWrite(writes, entry, now) {
  const kept = (Array.isArray(writes) ? writes : []).filter((w) => w && ageOf(w.end, now) < WRITE_LOG_MS);
  return [...kept, entry].slice(-MAX_WRITES);
}

// Do the claim's recorded writes account for the file going from p0 (seen at t0) to p1, as far as session sid
// can tell? Walk the writes that finished at or after t0 in order, following each one that starts where the
// walk stands; one that does not either landed before t0 or sits behind a write nobody recorded (Bash).
// -> 'recorded' (the walk reaches p1), 'in-flight' (it reaches the base of another session's write still in
// flight, which may or may not have produced p1), or null. Only conclusive evidence counts (codex r6): an
// entry with an unknown start (from: null) matches nothing, and a Bash entry logged while sid's own Bash was
// running (overlap) proves nothing against sid -- endpoint blobs cannot tell two overlapping writers apart.
function writesExplain(claim, p0, p1, t0, now, sid) {
  if (!claim) return null;
  const ws = (Array.isArray(claim.writes) ? claim.writes : [])
    .filter((w) => w && Number(w.end) >= t0 && !(Array.isArray(w.overlap) && w.overlap.includes(sid)))
    .sort((a, b) => Number(a.end) - Number(b.end));
  let cur = p0;
  for (const w of ws) {
    if (w.from != null && w.from === cur) cur = w.to;
  }
  if (cur === p1) return 'recorded';
  if (claim.sid !== sid && ageOf(claim.pendingAt, now) < PENDING_MS && claim.baseBlob != null && claim.baseBlob === cur) return 'in-flight';
  return null;
}

// ---- Bash writes ----------------------------------------------------------------------------------------
// PreToolUse Bash records the blob of every file `git status` lists in the cwd's repo (modified, staged,
// deleted, untracked); PostToolUse / PostToolUseFailure lists again and compares. A file that was clean before
// is compared with its blob at the pre-command HEAD. A per-repo stat cache means only files whose size/mtime/
// ctime moved are re-hashed (latency: WORKLOG 2026-10-01). Bounds: MAX_LISTED listed files (beyond it the
// command is not tracked, with a WARN); files over MAX_HASH_BYTES are compared by size+mtime only (WARN).
// Not seen: writes outside the cwd's repo, gitignored and assume-unchanged/skip-worktree files (git status
// omits them; none in D:\Work 2026-10-01), a file changed and committed inside one command, and whatever a
// run_in_background command writes after its PostToolUse.
const MAX_LISTED = 5000;
const MAX_HASH_BYTES = 32 * 1024 * 1024;
const RACY_MS = 2000;
const SNAPSHOT_KEEP_MS = 6 * 60 * 60 * 1000;

const sha1 = (t) => crypto.createHash('sha1').update(String(t)).digest('hex');
const bashDir = () => path.join(claimsDir(), 'bash');

// -> { root, head } for the repo that contains cwd, or null. head is null on an unborn branch.
function repoAt(cwd) {
  const out = git(['rev-parse', '--show-toplevel', 'HEAD'], cwd);
  if (out) {
    const [root, head] = out.split(/\r?\n/);
    return { root, head: head || null };
  }
  const root = git(['rev-parse', '--show-toplevel'], cwd);
  return root ? { root, head: null } : null;
}

// Paths `git status` lists, relative to root. null = git failed. --no-optional-locks: a hook's status must
// never take index.lock from under another session's git add / commit.
function listedPaths(root) {
  const out = gitRaw(['--no-optional-locks', 'status', '--porcelain=v1', '-z', '-uall', '--no-renames'], root);
  if (out === null) return null;
  const rels = [];
  for (const entry of out.split('\0')) {
    const rel = entry.slice(3);
    if (rel && !rel.endsWith('/')) rels.push(rel); // a trailing slash = nested repo / submodule: not ours
  }
  return rels;
}

const cachePath = (root) => path.join(bashDir(), `cache-${sha1(normAbs(root))}.json`);

// Worktree blob of each rel ('' absent, null cannot tell: not a regular file, too big, git failed), same
// filters as blobOf. Files whose size+mtime+ctime match the cache are not re-hashed (ctime: a rewrite that
// restores size and mtime -- cp -p, touch -r, os.utime -- still moves it, codex r5); a file changed within
// RACY_MS of being hashed is never cached (a same-tick rewrite would keep its stat). statsOut, when given,
// receives { size, mtimeMs, big } of every regular file (big = over MAX_HASH_BYTES, not hashed).
function blobsOf(root, rels, statsOut) {
  const cache = readJson(cachePath(root)) || {};
  const out = {};
  const stats = {};
  const todo = [];
  for (const rel of rels) {
    let st;
    try { st = fs.lstatSync(path.join(root, rel)); } catch (e) { out[rel] = e && e.code === 'ENOENT' ? '' : null; continue; }
    if (!st.isFile() || /[\r\n]/.test(rel)) { out[rel] = null; continue; }
    if (statsOut) statsOut[rel] = { size: st.size, mtimeMs: st.mtimeMs, big: st.size > MAX_HASH_BYTES };
    if (st.size > MAX_HASH_BYTES) { out[rel] = null; continue; }
    stats[rel] = [st.size, st.mtimeMs, st.ctimeMs];
    const c = cache[rel];
    if (Array.isArray(c) && c.length === 4 && c[0] === st.size && c[1] === st.mtimeMs && c[2] === st.ctimeMs && typeof c[3] === 'string') out[rel] = c[3];
    else todo.push(rel);
  }
  if (todo.length) {
    const res = gitRaw(['hash-object', '--stdin-paths'], root, `${todo.join('\n')}\n`);
    const lines = res === null ? [] : res.split('\n').filter(Boolean);
    if (lines.length === todo.length) todo.forEach((rel, i) => { out[rel] = lines[i]; });
    else for (const rel of todo) out[rel] = blobOf({ root, rel }); // a file vanished mid-batch: one by one
  }
  const now = Date.now();
  const next = {};
  for (const [rel, st] of Object.entries(stats)) {
    if (typeof out[rel] === 'string' && out[rel] && now - Math.max(st[1], st[2]) > RACY_MS) next[rel] = [...st, out[rel]];
  }
  try { writeJsonAtomic(cachePath(root), next); } catch (_) { /* only an optimization */ }
  return out;
}

// Blob of each rel in commit `head` ('' = not in it, null = cannot tell).
function headBlobs(root, head, rels) {
  const out = {};
  if (!head) { for (const r of rels) out[r] = ''; return out; }
  if (!rels.length) return out;
  const res = gitRaw(['cat-file', '--batch-check=%(objectname) %(objecttype)'], root, `${rels.map((r) => `${head}:${r}`).join('\n')}\n`);
  const lines = res === null ? [] : res.split('\n').filter(Boolean);
  rels.forEach((r, i) => {
    const ln = lines.length === rels.length ? lines[i] : '';
    out[r] = / blob$/.test(ln) ? ln.split(' ')[0] : (/ missing$/.test(ln) ? '' : null);
  });
  return out;
}

// One file per PreToolUse, queued under its key: two calls that share a key (Codex without tool_use_id, same
// turn + cwd + command -- codex r5) each keep their snapshot; a PostToolUse takes the oldest. Taking the older
// one of two identical calls only widens that call's window.
const snapshotPrefix = (key) => `snap-${sha1(key)}-`;

function saveSnapshot(key, snap) {
  const name = `${snapshotPrefix(key)}${String(snap.t0).padStart(15, '0')}-${crypto.randomBytes(4).toString('hex')}.json`;
  writeJsonAtomic(path.join(bashDir(), name), snap);
}

// Read and remove the oldest snapshot under key: one PostToolUse consumes one. null when there is none.
// unlink decides who consumed it when two PostToolUse race for the same file.
function takeSnapshot(key) {
  let names = [];
  try { names = fs.readdirSync(bashDir()).filter((n) => n.startsWith(snapshotPrefix(key)) && n.endsWith('.json')).sort(); } catch (_) { return null; }
  for (const n of names) {
    const p = path.join(bashDir(), n);
    const s = readJson(p);
    try { fs.unlinkSync(p); } catch (_) { continue; }
    if (s && typeof s.root === 'string' && s.blobs && typeof s.blobs === 'object') return s;
  }
  return null;
}

// Other sessions' Bash commands still running in this repo (snapshot not consumed, younger than PENDING_MS).
// Also drops snapshots older than SNAPSHOT_KEEP_MS: a call another rule blocked never consumes its own.
function bashInFlight(root, sid, now) {
  let names = [];
  try { names = fs.readdirSync(bashDir()).filter((n) => n.startsWith('snap-') && n.endsWith('.json')); } catch (_) { return []; }
  const want = normAbs(root);
  const out = [];
  for (const n of names) {
    const p = path.join(bashDir(), n);
    const s = readJson(p);
    const age = ageOf(s && s.t0, now);
    if (age > SNAPSHOT_KEEP_MS) { try { fs.unlinkSync(p); } catch (_) { /* gone */ } continue; }
    if (s.sid !== sid && age < PENDING_MS && typeof s.root === 'string' && normAbs(s.root) === want) out.push(s);
  }
  return out;
}

module.exports = {
  CLAIM_TTL_MS, PENDING_MS, LOCK_STALE_MS, MAX_LISTED, claimsDir, claimPath, realAbs, normAbs, repoOf, blobOf,
  stateOf, isShared, isGenerated, ageOf, readClaim, writeClaim, withLocks, breakStale, isLive, releaseClaim, listClaims,
  withWrite, writesExplain, repoAt, listedPaths, blobsOf, headBlobs, saveSnapshot, takeSnapshot, bashInFlight,
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
