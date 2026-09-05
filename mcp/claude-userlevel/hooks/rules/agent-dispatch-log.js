// Log Agent tool dispatches to agency-os/reports/agent-dispatch/ (fallback
// ~/.claude/agent-dispatch/). Never blocks. Verbatim port.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REDACT = [
  [/--token[= ][^ ]*/g, '--token=<REDACTED>'],
  [/password[= ][^ ]*/gi, 'password=<REDACTED>'],
  [/\bghp_[A-Za-z0-9_]+\b/g, '<REDACTED>'],
  [/\bgho_[A-Za-z0-9_]+\b/g, '<REDACTED>'],
  [/sshpass\s+-p\s+'[^']*'/g, "sshpass -p '<REDACTED>'"],
  [/AIza[a-zA-Z0-9_-]{35}/g, '<REDACTED>'],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/g, '<REDACTED>'],
  [/\btr_(?:pat|prod)_[A-Za-z0-9_]+\b/g, '<REDACTED>'],
];

function redact(text) {
  let s = String(text || '');
  for (const [pat, rep] of REDACT) s = s.replace(pat, rep);
  return s;
}

function truncate(text, max) {
  const s = String(text || '');
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function extractResult(response) {
  if (!response) return '';
  if (typeof response === 'string') return response;
  if (Array.isArray(response.content)) {
    return response.content.map((c) => c.text || c.content || '').join(' ');
  }
  if (response.content) return String(response.content);
  if (response.result) return String(response.result);
  return '';
}

// Walk up from cwd looking for the monorepo root (same sentinel pair as the
// PowerShell ao-resume-on-prompt.ps1 hook: scripts\ao-resume.ps1 + .git).
// Prior version wrote to path.join(ctx.cwd, 'agency-os') directly -- when a
// subagent's cwd was deep inside e.g. agency-os/docs/<package>/, that check
// always failed (no nested agency-os dir there) and mkdirSync then CREATED
// one, which is exactly the orphan agency-os/ debris found 2026-09-05. This
// walk finds the real root instead of testing only the exact cwd.
function findMonorepoRoot(startDir) {
  if (!startDir || !path.isAbsolute(startDir)) return null;
  let cur = startDir;
  for (let i = 0; i < 16; i++) {
    if (
      fs.existsSync(path.join(cur, 'scripts', 'ao-resume.ps1')) &&
      fs.existsSync(path.join(cur, '.git'))
    ) {
      return cur;
    }
    const parent = path.dirname(cur);
    if (!parent || parent === cur) break;
    cur = parent;
  }
  return null;
}

module.exports = {
  check(ctx) {
    // ctx.shared can be null in degraded mode (lib/shared.js failed to
    // require), OR present but version-skewed (synced mid-deploy, missing
    // isAgentTool() from an older copy -- 2026-09-03 round-3 critic m-5).
    // Both fall back to the inline check rather than crash this rule open.
    const shared = ctx.shared;
    const isAgentFn = (shared && typeof shared.isAgentTool === 'function')
      ? shared.isAgentTool
      : (n) => String(n || '').toLowerCase() === 'agent';
    if (!isAgentFn(ctx.toolName)) return null;

    const input = ctx.toolInput;
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '');
    const rand = crypto.randomBytes(2).toString('hex');

    const record = JSON.stringify({
      ts: now.toISOString(),
      task_id: `dlg-${dateStr}-${timeStr}-${rand}`,
      agent: input.subagent_type || 'unknown',
      description: truncate(redact(input.description || ''), 300),
      result_snippet: truncate(redact(extractResult(ctx.payload.tool_response)), 200),
    });

    const root = findMonorepoRoot(ctx.cwd);
    const dispDir = root
      ? path.join(root, 'agency-os', 'reports', 'agent-dispatch')
      : path.join(os.homedir(), '.claude', 'agent-dispatch');
    fs.mkdirSync(dispDir, { recursive: true });
    fs.appendFileSync(path.join(dispDir, `dispatch-${dateStr}.jsonl`), record + '\n');
    return null;
  },
};
