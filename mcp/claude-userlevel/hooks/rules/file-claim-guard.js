// file-claim-guard.js -- BLOCK a Write/Edit (Codex apply_patch arrives as Edit) to a file another session is
// writing: its write is in flight, or its written changes are still uncommitted. Claim lifecycle, locking and
// why this runs at write time instead of commit time: lib/file-claims.js header.
//
// PreToolUse: git state first, then under the files' locks decide every target and claim all or none (a call
// blocked on one file must not hold the others -- codex r2). PostToolUse: the write happened -> touchedAt; if
// the claim moved to another session while this call waited (permission prompt > PENDING_MS -- codex r3), the
// write already landed in their file: exit 2 tells this session. PostToolUseFailure: release at once.
// Not covered: files written through Bash (sed -i, python, Set-Content) -- no file list to read; the holder's
// next write still warns when the file changed outside it (lastBlob).
// WORKLOG/TASKS are skipped: every session appends to them and they already commit by hunk (private index,
// git-shared-file-guard.js).
const path = require('path');
const claims = require('../lib/file-claims');
const { SHARED } = require('./git-shared-file-guard');

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
    if (repo && !claims.isShared(repo.rel, SHARED)) out.push({ abs, repo, state: claims.stateOf(repo) });
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
      writes.push([abs, { sid, host: ctx.host, path: abs, pendingAt: now, touchedAt: null, baseBlob: state.blob }]);
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
        claims.writeClaim(abs, { ...c, pendingAt: null, touchedAt: now, baseBlob: null, lastBlob: state.blob });
      } else if (c) {
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

module.exports = {
  check(ctx) {
    if (!ctx.files.length) return null;
    const sid = realSid(ctx);
    if (!sid) return null;
    const now = Date.now();
    if (ctx.event === 'PreToolUse') return pre(ctx, sid, now);
    if (ctx.event === 'PostToolUse') return post(ctx, sid, now);
    if (ctx.event === 'PostToolUseFailure') return failed(ctx, sid, now);
    return null;
  },
};
