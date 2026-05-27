// PreToolUse on Bash: block high-risk production operations until operator ACK.
// Mechanizes P1 rule from AGENTS.md §操作風險分級:
// "High — STOP: prod deploy, destructive migration, 無法回滾 — wait for明示 go-ahead"
//
// Behavior:
//   - Detect high-risk commands ONLY when the verb appears at line-start (^\s*...) with multiline flag.
//     This prevents false positives on node -e strings, grep patterns, heredocs, && chained commands
//     where the risky verb is mid-line (not a real top-level invocation).
//   - If command's FIRST non-blank line is '# CONFIRMED-HIGH-RISK: <reason>' → pass (operator ACK)
//   - If matched AND no leading ACK → emit WARN to stderr + exit 2 (BLOCK, with guaranteed flush)
//   - Fail-open on any exception (pass through, log to verify-gate-failures.log)
//
// Trade-off: `cd /dir && docker compose down` (single line) is NOT blocked — the `&&` chain puts
// docker mid-line. Operator consciously typed the chain; the gate targets accidental standalone use.
//
// To proceed after BLOCK: re-issue with a LEADING comment on its own first line:
//   # CONFIRMED-HIGH-RISK: <reason + rollback plan>
//   <original command>
//
// Companion: _verify-shared.js (logFailOpen)

const shared = require('./_verify-shared');

// Match ONLY at line-start (^\s*) using multiline flag — avoids false positives on strings/heredocs.
// Also catches legacy `docker-compose` alias (hyphen variant).
const HIGH_RISK_PATTERNS = [
  {
    re: /^\s*(?:sudo\s+)?docker[\s-]+compose\s+(?:down|stop\b|rm\b)/im,
    label: 'docker compose down/stop/rm — takes production services offline',
  },
  {
    // rsync/scp with known VPS IPs, anchored to line-start
    re: /^\s*(?:sudo\s+)?(?:rsync|scp)\b[^\n#'"]*(?:5\.223\.93\.113|204\.168\.175\.41)/im,
    label: 'direct VPS file transfer to production IP — use sg-deploy.sh instead',
  },
  {
    // DB migration deploy commands, anchored to line-start
    re: /^\s*(?:sudo\s+)?(?:(?:prisma|knex|sequelize|typeorm|drizzle-kit)\s+migrate\s+(?:deploy|run|latest)|npm\s+run\s+(?:db:)?migrate(?:\s|$))/im,
    label: 'database migration deploy — potentially irreversible schema change',
  },
];

// ACK must be the FIRST non-blank line of the command (not embedded mid-command or in a string).
function isLeadingAck(cmd) {
  const firstNonBlank = cmd.split('\n').find(l => l.trim().length > 0) || '';
  return /^\s*#\s*CONFIRMED-HIGH-RISK\s*:/.test(firstNonBlank);
}

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    let i;
    try { i = JSON.parse(d); } catch (_) { process.stdout.write(d); return; }

    const cmd = i.tool_input?.command || '';
    if (!cmd) { process.stdout.write(d); return; }

    // ACK on first non-blank line → operator has acknowledged, pass through
    if (isLeadingAck(cmd)) { process.stdout.write(d); return; }

    const matched = HIGH_RISK_PATTERNS.filter(p => p.re.test(cmd));
    if (matched.length === 0) { process.stdout.write(d); return; }

    const lines = [
      '[Hook] HIGH-RISK OPERATION BLOCKED — operator ACK required:',
      ...matched.map(m => `[Hook]   ⚠  ${m.label}`),
      '[Hook] To proceed: re-issue with a LEADING comment on its own first line:',
      '[Hook]   # CONFIRMED-HIGH-RISK: <reason + rollback plan>',
      '[Hook]   <original command>',
      '',
    ];
    for (const ln of lines) process.stderr.write(ln + '\n');
    // Ensure stderr is flushed on Windows pipes before exit(2)
    process.stderr.write('', () => process.exit(2));
  } catch (e) {
    shared.logFailOpen('high-risk-bash-warn', e);
    process.stderr.write(`[Hook] WARN: high-risk-bash-warn exception (${e.code || e.message}) — see ~/.claude/verify-gate-failures.log\n`);
  }
  process.stdout.write(d);
});
