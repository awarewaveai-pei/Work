// PreToolUse on Write|Edit: BLOCK before editing auto-repair logic paths (once per category per session).
// Mechanizes M3 rule from AGENTS.md §代理自動工具使用規則:
// "before editing auto-repair paths, read audit baseline + run dogfood healthcheck"
//
// Behavior (exit-2 design, 2026-05-27):
//   - Each AUTO_REPAIR_PATTERNS category has its own session flag
//   - FIRST Write/Edit in a new category: creates flag + shows 4 required pre-checks + exits 2
//   - RE-ISSUE or same-category-again: EEXIST → passes through silently
//   - Non-matching path: passes through silently
//   - FAIL-OPEN: flag write error or any exception → pass through
//   - Why per-category (not per-session): different categories have different downstream
//     contracts (e.g., webhooks/route.ts → DEPLOY_ROLLBACK_RUNBOOK.md; repair-center →
//     AUDIT_REGISTRY.md). Session-wide flag would let a second-category edit silently bypass.
//   - Why exit-2 not exit-0: Claude Code does NOT forward exit-0 stderr to Claude's context;
//     only exit-2 error messages are visible (confirmed empirically 2026-05-27)
//
// Path patterns derived from AGENTS.md (2026-05-23 self-critic fix: must match full monorepo path)
// Companion: _verify-shared.js (SID derivation, logFailOpen)

const fs = require('fs');
const os = require('os');
const path = require('path');
const shared = require('./_verify-shared');

const AUTO_REPAIR_PATTERNS = [
  /lobster-factory[/\\].*[/\\]repair-center[/\\]/i,                                          // 0
  /lobster-factory[/\\].*[/\\]ops-inbox[/\\](redactSecrets|verifyIngestToken|fingerprint)\.[jt]s/i, // 1
  /lobster-factory[/\\].*[/\\]webhooks[/\\][^/\\]+[/\\]route\.ts/i,                          // 2
  /lobster-factory[/\\].*[/\\]ops[/\\]repairs[/\\]/i,                                        // 3
  /lobster-factory[/\\].*[/\\]commands[/\\]slack[/\\]route\.ts/i,                            // 4
  /\.github[/\\]workflows[/\\]auto-repair-/i,                                                 // 5
  /lobster-factory[/\\].*[/\\](sg-deploy|rollback-phase1|auto-deploy-next-admin)\.(sh|ps1)$/i, // 6
];

function isAutoRepairPath(filePath) {
  const norm = (filePath || '').replace(/\\/g, '/');
  return AUTO_REPAIR_PATTERNS.some(re => re.test(norm));
}

// Returns the index of the first matching pattern, or -1 if none.
function getPatternIndex(filePath) {
  const norm = (filePath || '').replace(/\\/g, '/');
  return AUTO_REPAIR_PATTERNS.findIndex(re => re.test(norm));
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

    // Per-category dedup: each of the 7 pattern categories gets its own session flag.
    // A category not yet seen this session → create flag → add to newFiles.
    // A category already seen (EEXIST) → skip (pre-checks were already shown).
    // FS error → fail-open (don't block).
    const sid = shared.getSessionId(i);
    const newFiles = [];
    const seenCats = new Set();

    for (const f of matched) {
      const catIdx = getPatternIndex(f);
      if (catIdx < 0 || seenCats.has(catIdx)) continue; // same category twice in one call
      seenCats.add(catIdx);
      const flagPath = path.join(os.tmpdir(), `claude-autorepair-guard-${sid}-cat${catIdx}.flag`);
      try {
        fs.writeFileSync(flagPath, new Date().toISOString(), { encoding: 'utf8', flag: 'wx' });
        newFiles.push(f); // flag created → new category this session
      } catch (e) {
        if (e.code === 'EEXIST') continue; // category already seen → pass
        shared.logFailOpen('auto-repair-guard flag', e);
        // FS error — fail-open for this category (don't add to newFiles)
      }
    }

    if (newFiles.length === 0) {
      // All matched categories pre-checked this session → pass through silently
      process.stdout.write(d); return;
    }

    // New category encountered — show pre-checks and block.
    // Re-issue → all flags EEXIST → newFiles empty → pass through.
    process.stderr.write('[Hook] AUTO-REPAIR PATH DETECTED — pre-checks required (once per category per session):\n');
    for (const f of newFiles) process.stderr.write(`[Hook]   file: ${f}\n`);
    process.stderr.write('[Hook] 1. Read: reports/audit/auto-repair-2026-05-23.md (5 Criticals + 10 Majors baseline)\n');
    process.stderr.write('[Hook] 2. Run: scripts/audit-tools/dogfood-auto-repair.ps1 -Mode HealthOnly (exit 0=ok, 1=must-fix, 2=warn)\n');
    process.stderr.write('[Hook] 3. After edit: update AUDIT_REGISTRY.md if patching C1-C5 (TRACKED → FIXED + commit hash)\n');
    process.stderr.write('[Hook] 4. If touching sg-deploy Step7 / redactSecrets.ts / repairs/route.ts: update DEPLOY_ROLLBACK_RUNBOOK.md\n');
    process.stderr.write('[Hook] Complete pre-checks, then Re-issue the same command to proceed.\n');
    process.stderr.write('', () => process.exit(2));
  } catch (e) {
    shared.logFailOpen('auto-repair-guard', e);
    process.stdout.write(d); // fail-open
  }
});
