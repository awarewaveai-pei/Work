// PreToolUse on Write|Edit: warn before editing auto-repair logic paths.
// Mechanizes M3 rule from AGENTS.md §代理自動工具使用規則:
// "before editing auto-repair paths, read audit baseline + run dogfood healthcheck"
//
// Behavior:
//   - Check file_path(s) against known auto-repair path patterns
//   - If match: emit WARN to stderr listing required pre-checks, exit 0 (WARN only — never blocks)
//   - Fail-open on any exception
//
// Path patterns derived from AGENTS.md (2026-05-23 self-critic fix: must match full monorepo path)
// Companion: _verify-shared.js (logFailOpen)

const shared = require('./_verify-shared');

const AUTO_REPAIR_PATTERNS = [
  /lobster-factory[/\\].*[/\\]repair-center[/\\]/i,
  /lobster-factory[/\\].*[/\\]ops-inbox[/\\](redactSecrets|verifyIngestToken|fingerprint)\.[jt]s/i,
  /lobster-factory[/\\].*[/\\]webhooks[/\\][^/\\]+[/\\]route\.ts/i,
  /lobster-factory[/\\].*[/\\]ops[/\\]repairs[/\\]/i,
  /lobster-factory[/\\].*[/\\]commands[/\\]slack[/\\]route\.ts/i,
  /\.github[/\\]workflows[/\\]auto-repair-/i,
  /lobster-factory[/\\].*[/\\](sg-deploy|rollback-phase1|auto-deploy-next-admin)\.(sh|ps1)$/i,
];

function isAutoRepairPath(filePath) {
  const norm = (filePath || '').replace(/\\/g, '/');
  return AUTO_REPAIR_PATTERNS.some(re => re.test(norm));
}

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    let i;
    try { i = JSON.parse(d); } catch (_) { process.stdout.write(d); return; }

    // Collect all file paths (single Edit/Write + MultiEdit shapes)
    const files = [];
    if (i.tool_input?.file_path) files.push(i.tool_input.file_path);
    if (Array.isArray(i.tool_input?.edits)) {
      for (const e of i.tool_input.edits) if (e?.file_path) files.push(e.file_path);
    }

    const matched = files.filter(isAutoRepairPath);
    if (matched.length === 0) { process.stdout.write(d); return; }

    process.stderr.write('[Hook] AUTO-REPAIR PATH DETECTED — pre-checks required:\n');
    for (const f of matched) process.stderr.write(`[Hook]   file: ${f}\n`);
    process.stderr.write('[Hook] 1. Read: reports/audit/auto-repair-2026-05-23.md (audit baseline: 5 Criticals + 10 Majors)\n');
    process.stderr.write('[Hook] 2. Run: scripts/audit-tools/dogfood-auto-repair.ps1 -Mode HealthOnly (exit 0=ok, 1=must-fix, 2=warn)\n');
    process.stderr.write('[Hook] 3. After edit: update AUDIT_REGISTRY.md if patching a C1-C5 Critical (TRACKED → FIXED + commit hash)\n');
    process.stderr.write('[Hook] 4. If touching sg-deploy Step7 / redactSecrets.ts / repairs/route.ts: update DEPLOY_ROLLBACK_RUNBOOK.md\n');
    // WARN only — exit 0 lets the write proceed; Claude has been warned
  } catch (e) {
    shared.logFailOpen('auto-repair-guard', e);
    process.stderr.write(`[Hook] WARN: auto-repair-guard exception (${e.code || e.message}) — see ~/.claude/verify-gate-failures.log\n`);
  }
  process.stdout.write(d);
});
