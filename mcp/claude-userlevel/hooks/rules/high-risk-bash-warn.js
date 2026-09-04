// Block high-risk production operations until operator ACK.
// Mechanizes AGENTS.md §操作風險分級 "High — STOP".
//
// Scans ctx.commandExpanded, so `bash -c "docker compose down"` string-wraps
// are visible (closes the legacy bypass — intended diff, locked in tests).
// The `cd x && docker compose down` single-line chain remains a documented
// pass (operator consciously typed the chain; gate targets standalone use).
// ACK: first non-blank line of the ORIGINAL command must be
//   # CONFIRMED-HIGH-RISK: <reason + rollback plan>
const HIGH_RISK_PATTERNS = [
  {
    re: /^\s*(?:sudo\s+)?docker[\s-]+compose\s+(?:down|stop\b|rm\b)/im,
    label: 'docker compose down/stop/rm — takes production services offline',
  },
  {
    re: /^\s*(?:sudo\s+)?(?:rsync|scp)\b[^\n#'"]*(?:5\.223\.93\.113|204\.168\.175\.41)/im,
    label: 'direct VPS file transfer to production IP — use sg-deploy.sh instead',
  },
  {
    re: /^\s*(?:sudo\s+)?(?:(?:prisma|knex|sequelize|typeorm|drizzle-kit)\s+migrate\s+(?:deploy|run|latest)|npm\s+run\s+(?:db:)?migrate(?:\s|$))/im,
    label: 'database migration deploy — potentially irreversible schema change',
  },
  {
    // Deploy-flow mechanization (2026-07-02, Phase 4): ssh to a production VPS
    // running deploy / restart / shutdown verbs. Was semantic-only (audit rank
    // #1 high-consequence gap: 「部署」 trigger relied on Claude remembering
    // /check-drift → /verify → tsc → go-ahead). Read-only ssh (logs, cat,
    // health checks) is untouched — only mutating verbs match.
    // 2026-09-04: host list was still the two retired Hetzner IPs after the
    // 2026-08-31 consolidation onto ks-aw-01 (145.239.195.47) -- the gate
    // silently stopped covering production. Retired IPs kept (unreachable,
    // harmless); the live host + its hostname added. Retire this comment when
    // the host list moves to a config file.
    re: /^\s*(?:sudo\s+)?ssh\b[^\n]*(?:145\.239\.195\.47|ks-aw-01|5\.223\.93\.113|204\.168\.175\.41)[^\n]*(?:sg-deploy|rollback-phase1|auto-deploy-next-admin|systemctl\s+(?:restart|stop)|docker[\s-]+compose\s+(?:down|stop|restart)|\breboot\b|\bshutdown\b)/im,
    label: 'remote deploy/restart on production VPS — deploy flow first: /check-drift → /verify → tsc (if .ts changed) → operator go-ahead (AGENTS.md §部署流程觸發)',
  },
];

function isLeadingAck(cmd) {
  const firstNonBlank = cmd.split('\n').find((l) => l.trim().length > 0) || '';
  return /^\s*#\s*CONFIRMED-HIGH-RISK\s*:/.test(firstNonBlank);
}

module.exports = {
  check(ctx) {
    if (!ctx.command) return null;
    if (isLeadingAck(ctx.command)) return null;

    const matched = HIGH_RISK_PATTERNS.filter((p) => p.re.test(ctx.commandExpanded));
    if (!matched.length) return null;

    return {
      block: [
        '[Hook] HIGH-RISK OPERATION BLOCKED — operator ACK required:',
        ...matched.map((m) => `[Hook]   ⚠  ${m.label}`),
        '[Hook] To proceed: re-issue with a LEADING comment on its own first line:',
        '[Hook]   # CONFIRMED-HIGH-RISK: <reason + rollback plan>',
        '[Hook]   <original command>',
      ],
    };
  },
};
