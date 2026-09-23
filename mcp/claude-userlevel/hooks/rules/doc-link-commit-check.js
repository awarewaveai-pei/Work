// PostToolUse Bash: when this call created a commit, tell the agent that made it which markdown
// links the commit broke. Verdict = validate-doc-integrity.mjs --commit (same resolver and scope as
// the CI/health doc_integrity gate, judged on the commit's own tree). It cannot block: the commit
// already exists. It lands while the author still knows what each link meant.
// Post, not Pre: `git commit --only -- <paths>` (this repo's standard form) bypasses the index, so
// only the finished commit says what was committed. Why this exists: WORKLOG 2026-09-23 "doc_integrity 紅 16 天".
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Same tight commit matcher as commit-quality / verify-gate-commit (never `commit-tree`).
const RE_GIT_COMMIT = /^(?:sudo\s+)?git\s+(?:-[a-zA-Z0-9-]+\s+|-[a-zA-Z0-9-]+\s+\S+\s+|-C\s+\S+\s+)*commit(?=\s|$|["';|&])/;
// git's success line: "[main 1a2b3c4] subj", "[main (root-commit) 1a2b3c4] ...", "[detached HEAD 1a2b3c4] ...".
const RE_SUMMARY = /^\[(?:[^\s\]]+|detached HEAD)(?: \(root-commit\))? ([0-9a-f]{7,40})\] /gm;
const VALIDATOR = 'lobster-factory/scripts/validate-doc-integrity.mjs';
// `git commit -q` (common here: `-q -F <msgfile>`) prints no success line. Fallback: HEAD reflog
// `commit*` entries this recent. A concurrent session's commit inside the window gets checked
// too; the report names every sha, so a stray one is visible, not silent.
const REFLOG_WINDOW_S = 60;

function recentReflogCommits(root) {
  const r = sh('git', ['reflog', '-n', '20', '--date=unix', '--format=%H%x09%gd%x09%gs', 'HEAD'], root, 10000);
  if (r.status !== 0) return [];
  const now = Date.now() / 1000;
  const shas = [];
  for (const line of String(r.stdout).split('\n')) {
    const [sha, selector, subject] = line.split('\t');
    const when = Number((/@\{(\d+)\}/.exec(selector || '') || [])[1]);
    if (!sha || !Number.isFinite(when) || now - when > REFLOG_WINDOW_S) break; // newest first
    if (/^commit\b/.test(subject || '')) shas.push(sha);
  }
  return shas;
}

// Claude: { stdout, stderr, ... }. Codex: a plain string (see lib/codex-adapter.js).
function responseText(resp) {
  if (typeof resp === 'string') return resp;
  if (!resp || typeof resp !== 'object') return '';
  return ['stdout', 'stderr', 'output'].map((k) => resp[k]).filter((v) => typeof v === 'string').join('\n');
}

function sh(cmd, args, cwd, timeout) {
  return spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout, windowsHide: true });
}

module.exports = {
  check(ctx) {
    if (!(ctx.commandSegments || []).some((s) => RE_GIT_COMMIT.test(s))) return null;
    const top = sh('git', ['rev-parse', '--show-toplevel'], ctx.cwd, 10000);
    if (top.status !== 0) return null;
    const root = top.stdout.trim();
    const script = path.join(root, VALIDATOR);
    if (!fs.existsSync(script)) return null; // not the Work repo

    const text = responseText(ctx.payload && ctx.payload.tool_response);
    let shas = [...new Set([...text.matchAll(RE_SUMMARY)].map((m) => m[1]))];
    if (!shas.length) shas = recentReflogCommits(root);
    if (!shas.length) return null; // no commit made (failed, blocked, nothing to commit)

    const out = [];
    for (const sha of shas) {
      // `cd other-repo && git commit` prints a sha this repo does not have: not ours to judge.
      if (sh('git', ['cat-file', '-e', `${sha}^{commit}`], root, 10000).status !== 0) continue;
      const r = sh(process.execPath, [script, `--commit=${sha}`, '--json'], root, 30000);
      let report = null;
      try { report = JSON.parse(r.stdout); } catch (_) { /* logged below */ }
      if (!report || report.error || !Array.isArray(report.broken)) {
        const why = (report && report.error) || `no JSON (exit ${r.status}${r.error ? `, ${r.error.message}` : ''})`;
        ctx.shared.logFailOpen('doc-link-commit-check', new Error(`--commit=${sha}: ${why}`));
        continue;
      }
      if (!report.broken.length) continue;
      const [shown, hidden] = ctx.shared.capStderr(report.broken.map((b) => (b.cause === 'target_removed'
        ? `[Hook]     ${b.from} -> ${b.href}   (this commit removed the target)`
        : `[Hook]     ${b.from} -> ${b.href}   (resolves to ${b.resolved}: no such path in this commit)`)));
      out.push(
        `[Hook] DOC LINKS: commit ${sha} leaves ${report.broken.length} broken relative link(s) in docs the doc_integrity gate scans`,
        '[Hook]   (nightly health + CI "Lobster workflows package — validate" go red on these):',
        ...shown,
        ...(hidden ? [`[Hook]     ...and ${hidden} more`] : []),
        '[Hook]   Point each href at the real path, relative to the linking file\'s own directory; commit the fix before pushing.',
        `[Hook]   Re-check: node ${VALIDATOR} --commit=<sha>`,
      );
    }
    return out.length ? { block: out } : null;
  },
};
