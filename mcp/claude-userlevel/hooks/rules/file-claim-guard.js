// file-claim-guard.js -- BLOCK a Write/Edit (Codex apply_patch arrives as Edit) to a file another session is
// writing: its write is in flight, or its written changes are still uncommitted. Claim lifecycle, locking and
// why this runs at write time instead of commit time: lib/file-claims.js header.
//
// PreToolUse: git state first, then under the files' locks decide every target and claim all or none (a call
// blocked on one file must not hold the others -- codex r2). PostToolUse: the write happened -> touchedAt; if
// the claim moved to another session while this call waited (permission prompt > PENDING_MS -- codex r3), the
// write already landed in their file: exit 2 tells this session. PostToolUseFailure: release at once.
// Bash (sed -i, python, Set-Content): see the Bash section -- a before/after snapshot, reported after the fact.
// WORKLOG/TASKS are skipped: every session appends to them and they already commit by hunk (private index,
// git-shared-file-guard.js). So are script-generated files (claims.GENERATED).
const path = require('path');
const claims = require('../lib/file-claims');
const { SHARED } = require('./git-shared-file-guard');

const skipped = (rel) => claims.isShared(rel, SHARED) || claims.isGenerated(rel);

const CLI = path.join(__dirname, '..', 'lib', 'file-claims.js');

// Only a real session id may claim: the sha1(cwd) fallback in shared.getSessionId is the same for every
// session in this directory, so claims under it would let everyone through as "the holder".
function realSid(ctx) {
  const p = ctx.payload && typeof ctx.payload.session_id === 'string' ? ctx.payload.session_id.trim() : '';
  if (p || process.env.CLAUDE_CODE_SESSION_ID || process.env.CLAUDE_SESSION_ID) return ctx.sid;
  return null;
}

function holderText(c, now) {
  const mins = (t) => Math.max(0, Math.round(claims.ageOf(t, now) / 60000));
  const when = claims.ageOf(c.pendingAt, now) < claims.PENDING_MS
    ? `write in flight since ${mins(c.pendingAt)} min`
    : (Number.isFinite(claims.ageOf(c.touchedAt, now)) ? `last write ${mins(c.touchedAt)} min ago` : 'write not confirmed');
  return `${c.host || '?'}:${String(c.sid).slice(0, 12)}, ${when}`;
}

function blockLines(repo, abs, c, now) {
  return [
    `[Hook] BLOCKED: ${repo.rel} is being edited by another session (${holderText(c, now)}).`,
    '[Hook]   Two writers in one file = whoever commits first carries the other\'s hunks (git stages whole files).',
    '[Hook]   Wait for that session to commit or revert it, or work on another file.',
    `[Hook]   Take it over ONLY on the operator's word: node "${CLI}" release "${abs}"`,
  ];
}

// Targets with their git state, computed before any lock is taken.
function targets(ctx) {
  const out = [];
  for (const f of ctx.files) {
    const abs = claims.realAbs(f);
    const repo = claims.repoOf(abs);
    if (repo && !skipped(repo.rel)) out.push({ abs, repo, state: claims.stateOf(repo) });
  }
  return out;
}

// The git snapshot is taken before the lock (`now` precedes it). A claim whose clock moved after `now` was
// written while we were not looking, so the snapshot cannot clear it -- treat it as live (codex r4). Bounded
// to one minute ahead so a clock jump or a corrupt far-future value cannot hold a file forever.
const movedSince = (c, now) => [c.touchedAt, c.pendingAt].some((t) => {
  const d = t == null ? NaN : Number(t) - now;
  return d >= 0 && d < 60000;
});

const BUSY = { block:['[Hook] BLOCKED: another session is claiming one of these files at this moment -- re-issue the same call.'] };

function pre(ctx, sid, now) {
  const ts = targets(ctx);
  if (!ts.length) return null;
  const r = claims.withLocks(ts.map((t) => t.abs), () => {
    const block = [];
    const warn = [];
    const writes = [];
    for (const { abs, repo, state } of ts) {
      const c = claims.readClaim(abs);
      if (c && c.sid === sid) {
        if (typeof c.lastBlob === 'string' && state.blob !== null && state.blob !== c.lastBlob) {
          warn.push(`[Hook] WARN: ${repo.rel} changed outside this session since its last write here (another session, or Bash).`);
          warn.push(`[Hook]   Read \`git diff -- ${repo.rel}\` before you commit it.`);
        }
        writes.push([abs, { ...c, pendingAt: now, baseBlob: state.blob }]);
        continue;
      }
      if (c && (claims.isLive(c, state, now) || movedSince(c, now))) {
        block.push(...blockLines(repo, abs, c, now));
        continue;
      }
      writes.push([abs, { sid, host: ctx.host, path: abs, pendingAt: now, touchedAt: null, baseBlob: state.blob, writes: c ? c.writes : [] }]);
      if (state.dirty === true) {
        warn.push(c
          ? `[Hook] WARN: took over ${repo.rel} from a stale claim (${holderText(c, now)}); its uncommitted changes are still in the file.`
          : `[Hook] WARN: ${repo.rel} already has uncommitted changes this session did not make (earlier work, or written via Bash).`);
        warn.push(`[Hook]   Committing it carries them -- read \`git diff -- ${repo.rel}\` before you commit.`);
      }
    }
    if (block.length) return { block }; // claim nothing: this call will not write any of its files
    for (const [abs, claim] of writes) claims.writeClaim(abs, claim);
    return warn.length ? { warn } : null;
  });
  return r.busy ? BUSY : r.value;
}

function post(ctx, sid, now) {
  const ts = targets(ctx);
  if (!ts.length) return null;
  const r = claims.withLocks(ts.map((t) => t.abs), () => {
    const block = [];
    for (const { abs, repo, state } of ts) {
      const c = claims.readClaim(abs);
      if (c && c.sid === sid) {
        const entry = { sid, from: c.baseBlob, to: state.blob, at: c.pendingAt, end: now };
        claims.writeClaim(abs, { ...c, pendingAt: null, touchedAt: now, baseBlob: null, lastBlob: state.blob, writes: claims.withWrite(c.writes, entry, now) });
      } else if (c) {
        // logged with an unknown start, so a concurrent Bash command does not take this write for its own
        claims.writeClaim(abs, { ...c, writes: claims.withWrite(c.writes, { sid, from: null, to: state.blob, at: now, end: now }, now) });
        block.push(`[Hook] WARNING: your write to ${repo.rel} landed after another session took the file over (${holderText(c, now)}) -- this call waited past the claim window.`);
        block.push(`[Hook]   Both sessions' changes are in the file now. Check \`git diff -- ${repo.rel}\` and tell the operator before either side commits it.`);
      }
    }
    return block.length ? { block } : null; // PostToolUse cannot undo the write; exit 2 makes the session see it
  });
  return r.busy ? null : r.value;
}

function failed(ctx, sid, now) {
  const ts = targets(ctx);
  if (!ts.length) return null;
  claims.withLocks(ts.map((t) => t.abs), () => {
    for (const { abs } of ts) {
      const c = claims.readClaim(abs);
      if (!c || c.sid !== sid) continue;
      if (Number.isFinite(claims.ageOf(c.touchedAt, now))) claims.writeClaim(abs, { ...c, pendingAt: null, baseBlob: null });
      else claims.releaseClaim(abs); // never wrote this file: give it back now, not after PENDING_MS
    }
  });
  return null;
}

// ---- Bash -------------------------------------------------------------------------------------------------
// A Bash command names no files, so nothing can be blocked before it runs: PreToolUse snapshots the work tree,
// PostToolUse (and PostToolUseFailure -- a failed command can still have written) compares. Every file the
// command changed is then handled like a Write that already happened:
//   holder is another live session -> exit 2 naming file and holder (the write cannot be undone: a loud report)
//   nobody / a stale claim / us     -> this session holds it (touchedAt), unless it is clean again
// A change the claim's write log explains (a concurrent Write/Edit, any session) is not this command's.
// Another session holds the file if its claim was live when the command STARTED -- when an Edit would have
// been checked; judged after the write, a committed or reverted claim would look live again -- or if it wrote
// during the command.
// Snapshot key = tool_use_id, so parallel calls of one session (subagents share the session id) stay apart.
// A file whose mtime is later than this PostToolUse process's start was written after the command ended
// (another session's Bash -- codex r5): not this command's. Left: the gap between the command's exit and the
// hook process start.
const wroteDuring = (c, t0, now) => [c.touchedAt, c.pendingAt].some((t) => t != null && Number(t) >= t0 && Number(t) - now < 60000);

function bashKey(ctx, sid) {
  const p = ctx.payload || {};
  if (typeof p.tool_use_id === 'string' && p.tool_use_id) return `${sid}|${p.tool_use_id}`;
  return `${sid}|${p.turn_id || ''}|${bashCwd(ctx)}|${ctx.command}`;
}

function bashCwd(ctx) {
  const p = ctx.payload || {};
  return typeof p.cwd === 'string' && p.cwd ? p.cwd : ctx.cwd;
}

function bashPre(ctx, sid, now) {
  const repo = claims.repoAt(bashCwd(ctx));
  if (!repo) return null;
  const listed = claims.listedPaths(repo.root);
  if (!listed) return null;
  if (listed.length > claims.MAX_LISTED) {
    return { warn: [`[Hook] WARN: ${listed.length} changed/untracked files in ${repo.root} (> ${claims.MAX_LISTED}) -- this Bash call's file writes are not tracked by file-claim-guard.`] };
  }
  const stats = {};
  const blobs = claims.blobsOf(repo.root, listed, stats);
  const big = {};
  for (const [rel, st] of Object.entries(stats)) if (st.big) big[rel] = [st.size, st.mtimeMs];
  claims.saveSnapshot(bashKey(ctx, sid), { sid, root: repo.root, head: repo.head, t0: now, blobs, big });
  return null;
}

// -> { changed: [{ rel, abs, p0, p1, dirty }], big: [rel] }. p0 = before (a file clean before = its
// pre-command HEAD blob), p1 = now. Unknown blobs (null) are skipped, never guessed; files too big to hash
// whose size/mtime moved are only named (big).
function bashChanges(snap, hookStart) {
  const listed = claims.listedPaths(snap.root);
  if (!listed) return { changed: [], big: [] };
  const listedSet = new Set(listed);
  const rels = [...new Set([...Object.keys(snap.blobs), ...listed])].filter((r) => !skipped(r));
  const stats = {};
  const now = claims.blobsOf(snap.root, rels, stats);
  const before = claims.headBlobs(snap.root, snap.head, rels.filter((r) => !(r in snap.blobs) && now[r] !== null));
  const prevBig = snap.big && typeof snap.big === 'object' ? snap.big : {};
  const changed = [];
  const big = [];
  for (const rel of rels) {
    const st = stats[rel];
    if (st && st.mtimeMs > hookStart) continue; // written after the command ended
    if (st && st.big) {
      const was = prevBig[rel];
      if (!was || was[0] !== st.size || was[1] !== st.mtimeMs) big.push(rel);
      continue;
    }
    const p0 = rel in snap.blobs ? snap.blobs[rel] : before[rel];
    const p1 = now[rel];
    if (p0 == null || p1 == null || p0 === p1) continue;
    changed.push({ rel, abs: claims.realAbs(path.join(snap.root, rel)), p0, p1, dirty: listedSet.has(rel) });
  }
  return { changed, big };
}

function bashPost(ctx, sid, now) {
  const snap = claims.takeSnapshot(bashKey(ctx, sid));
  if (!snap) return null;
  const hookStart = Date.now() - process.uptime() * 1000;
  const { changed, big } = bashChanges(snap, hookStart);
  const bigWarn = big.map((rel) => `[Hook] WARN: ${rel} changed during this command but is too large for file-claim-guard to compare -- if another session works on it, check with them.`);
  if (!changed.length) return bigWarn.length ? { warn: bigWarn } : null;
  const otherSids = [...new Set(claims.bashInFlight(snap.root, sid, now).map((s) => String(s.sid)))];
  const headAtStart = claims.headBlobs(snap.root, snap.head, changed.map((f) => f.rel));
  for (const f of changed) f.atStart = { dirty: f.rel in snap.blobs, blob: f.p0, head: headAtStart[f.rel] || null };
  const r = claims.withLocks(changed.map((f) => f.abs), () => {
    const block = [];
    const warn = [];
    for (const { rel, abs, p0, p1, dirty, atStart } of changed) {
      const c = claims.readClaim(abs);
      const why = claims.writesExplain(c, p0, p1, snap.t0, now, sid);
      if (why === 'recorded') continue; // another write did it, and logged it
      if (why === 'in-flight') {
        warn.push(`[Hook] WARN: ${rel} changed during this command while another session had a write to it in flight (${holderText(c, now)}) -- cannot tell whose change it is. If this command wrote ${rel}, tell the operator.`);
        continue;
      }
      // overlap: sessions whose Bash ran meanwhile -- this entry is no proof against them (lib writesExplain)
      const entry = { sid, from: p0, to: p1, at: snap.t0, end: now, via: 'bash', ...(otherSids.length ? { overlap: otherSids } : {}) };
      const overlapped = (c && Array.isArray(c.writes) ? c.writes : [])
        .filter((w) => w && Number(w.end) >= snap.t0 && Array.isArray(w.overlap) && w.overlap.includes(sid)).map((w) => String(w.sid));
      const others = [...new Set([...otherSids, ...overlapped])].map((x) => x.slice(0, 12));
      if (c && c.sid !== sid && (claims.isLive(c, atStart, snap.t0) || wroteDuring(c, snap.t0, now))) {
        claims.writeClaim(abs, { ...c, writes: claims.withWrite(c.writes, entry, now) }); // holder unchanged
        if (dirty) {
          block.push(`[Hook] WARNING: this command changed ${rel}, which another session is editing (${holderText(c, now)}).`);
          block.push(`[Hook]   Both sessions' changes are in the file now. Check \`git diff -- ${rel}\` and tell the operator before either side commits it.`);
        } else {
          block.push(`[Hook] WARNING: this command changed ${rel}, which another session is editing (${holderText(c, now)}) -- it is back at HEAD now: their uncommitted work is gone from the work tree.`);
          block.push('[Hook]   If it went into `git stash`, `git stash list` still has it. Tell the operator before anything else touches the file.');
        }
        if (others.length) block.push(`[Hook]   Bash of ${others.join(', ')} ran in this repo at the same time -- if the change is theirs, say so.`);
        continue;
      }
      if (c && c.sid === sid) {
        claims.writeClaim(abs, { ...c, touchedAt: now, lastBlob: p1, writes: claims.withWrite(c.writes, entry, now) });
        continue;
      }
      if (!dirty) continue; // back at HEAD: nothing to hold
      claims.writeClaim(abs, { sid, host: ctx.host, path: abs, pendingAt: null, touchedAt: now, baseBlob: null, lastBlob: p1, writes: claims.withWrite(c && c.writes, entry, now) });
      if (rel in snap.blobs) { // it had uncommitted changes before this command
        warn.push(c
          ? `[Hook] WARN: this command took over ${rel} from a stale claim (${holderText(c, now)}); its uncommitted changes are still in the file -- read \`git diff -- ${rel}\` before you commit it.`
          : `[Hook] WARN: ${rel} already had uncommitted changes this session did not make; this command wrote it, so this session holds them now -- read \`git diff -- ${rel}\` before you commit it.`);
      }
    }
    warn.push(...bigWarn);
    return block.length || warn.length ? { block, warn } : null;
  });
  if (r.busy) return { warn: [...bigWarn, '[Hook] WARN: file-claim-guard could not lock the files this Bash command changed (another session held one) -- their claims were not updated.'] };
  return r.value;
}

module.exports = {
  check(ctx) {
    const isBash = ctx.toolName === 'Bash';
    if (!isBash && !ctx.files.length) return null;
    const sid = realSid(ctx);
    if (!sid) return null;
    const now = Date.now();
    if (isBash) {
      if (ctx.event === 'PreToolUse') return bashPre(ctx, sid, now);
      if (ctx.event === 'PostToolUse' || ctx.event === 'PostToolUseFailure') return bashPost(ctx, sid, now);
      return null;
    }
    if (ctx.event === 'PreToolUse') return pre(ctx, sid, now);
    if (ctx.event === 'PostToolUse') return post(ctx, sid, now);
    if (ctx.event === 'PostToolUseFailure') return failed(ctx, sid, now);
    return null;
  },
};
