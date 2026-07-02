// BLOCK before editing auto-repair logic paths (once per category per session)
// and show the 4 required pre-checks. Patterns preserved verbatim.
const AUTO_REPAIR_PATTERNS = [
  /lobster-factory[/\\].*[/\\]repair-center[/\\]/i,                                              // 0
  /lobster-factory[/\\].*[/\\]ops-inbox[/\\](redactSecrets|verifyIngestToken|fingerprint)\.[jt]s/i, // 1
  /lobster-factory[/\\].*[/\\]webhooks[/\\][^/\\]+[/\\]route\.ts/i,                              // 2
  /lobster-factory[/\\].*[/\\]ops[/\\]repairs[/\\]/i,                                            // 3
  /lobster-factory[/\\].*[/\\]commands[/\\]slack[/\\]route\.ts/i,                                // 4
  /\.github[/\\]workflows[/\\]auto-repair-/i,                                                     // 5
  /lobster-factory[/\\].*[/\\](sg-deploy|rollback-phase1|auto-deploy-next-admin)\.(sh|ps1)$/i,   // 6
];

function patternIndex(filePath) {
  const norm = (filePath || '').replace(/\\/g, '/');
  return AUTO_REPAIR_PATTERNS.findIndex((re) => re.test(norm));
}

module.exports = {
  check(ctx) {
    const matched = ctx.files.filter((f) => patternIndex(f) >= 0);
    if (!matched.length) return null;

    const newFiles = [];
    const seenCats = new Set();
    for (const f of matched) {
      const catIdx = patternIndex(f);
      if (seenCats.has(catIdx)) continue;
      seenCats.add(catIdx);
      if (ctx.flags.once(`autorepair-guard-${ctx.sid}-cat${catIdx}`) === 'created') {
        newFiles.push(f);
      }
      // 'exists' → already pre-checked; 'error' → fail-open for this category
    }
    if (!newFiles.length) return null;

    return {
      block: [
        '[Hook] AUTO-REPAIR PATH DETECTED — pre-checks required (once per category per session):',
        ...newFiles.map((f) => `[Hook]   file: ${f}`),
        '[Hook] 1. Read: reports/audit/auto-repair-2026-05-23.md (5 Criticals + 10 Majors baseline)',
        '[Hook] 2. Run: scripts/audit-tools/dogfood-auto-repair.ps1 -Mode HealthOnly (exit 0=ok, 1=must-fix, 2=warn)',
        '[Hook] 3. After edit: update AUDIT_REGISTRY.md if patching C1-C5 (TRACKED → FIXED + commit hash)',
        '[Hook] 4. If touching sg-deploy Step7 / redactSecrets.ts / repairs/route.ts: update DEPLOY_ROLLBACK_RUNBOOK.md',
        '[Hook] Complete pre-checks, then Re-issue the same command to proceed.',
      ],
    };
  },
};
