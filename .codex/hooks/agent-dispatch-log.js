// PostToolUse hook: log Agent tool dispatches to agency-os/reports/agent-dispatch/dispatch-YYYYMMDD.jsonl
// Never blocks (always exits 0). Auto-redacts common secret patterns.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REDACT = [
  [/--token[= ][^ ]*/g,               '--token=<REDACTED>'],
  [/password[= ][^ ]*/gi,             'password=<REDACTED>'],
  [/\bghp_[A-Za-z0-9_]+\b/g,         '<REDACTED>'],
  [/\bgho_[A-Za-z0-9_]+\b/g,         '<REDACTED>'],
  [/sshpass\s+-p\s+'[^']*'/g,        "sshpass -p '<REDACTED>'"],
  [/AIza[a-zA-Z0-9_-]{35}/g,         '<REDACTED>'],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/g,     '<REDACTED>'],
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
  if (Array.isArray(response.content))
    return response.content.map(c => c.text || c.content || '').join(' ');
  if (response.content) return String(response.content);
  if (response.result)  return String(response.result);
  return '';
}

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(d);
    if ((payload.tool_name || '').toLowerCase() !== 'agent') {
      process.stdout.write(d);
      return;
    }

    const input  = payload.tool_input  || {};
    const now    = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '');
    const rand    = crypto.randomBytes(2).toString('hex');

    const record = JSON.stringify({
      ts:             now.toISOString(),
      task_id:        `dlg-${dateStr}-${timeStr}-${rand}`,
      agent:          input.subagent_type || 'unknown',
      description:    truncate(redact(input.description || ''), 300),
      result_snippet: truncate(redact(extractResult(payload.tool_response)), 200),
    });

    // Prefer agency-os/ under cwd; fallback to ~/.claude/agent-dispatch/
    const cwd      = process.cwd();
    const aoDir    = path.join(cwd, 'agency-os');
    const dispDir  = fs.existsSync(aoDir)
      ? path.join(aoDir, 'reports', 'agent-dispatch')
      : path.join(os.homedir(), '.claude', 'agent-dispatch');

    fs.mkdirSync(dispDir, { recursive: true });
    fs.appendFileSync(path.join(dispDir, `dispatch-${dateStr}.jsonl`), record + '\n');
  } catch (_) { /* never block */ }
  process.stdout.write(d);
});
