// PreToolUse on Write|Edit: route to the right specialist agent based on file path.
// Mechanizes "Claude 工作自觸發規則" from AGENTS.md — agent routing based on WHAT Claude
// is editing, not what the user says.
//
// Design (matches auto-repair-guard.js pattern — same guarantees):
//   - Per-category session flags: each category fires ONCE per session, then passes silently
//   - exit 2 (not 0): Claude Code only forwards exit-2 stderr to Claude's context (2026-05-27)
//   - Re-issue → EEXIST → pass through silently
//   - FAIL-OPEN: any exception or FS error → pass through (never block operator flow)
//   - Supports both single Edit/Write and MultiEdit shapes
//
// Why this file exists: AGENTS.md trigger rules are loaded once at session start and
// rely on Claude's memory — unreliable for mid-session routing. File-path hooks are
// tool-event-based and fire regardless of what Claude remembers.
//
// SSOT: agency-os/AGENTS.md §Claude 工作自觸發規則
// Companion: _verify-shared.js (SID derivation, logFailOpen)

const fs = require('fs');
const os = require('os');
const path = require('path');
const shared = require('./_verify-shared');

// Each category: id, patterns (match any → trigger), label, actions (shown to Claude)
const ROUTE_CATEGORIES = [
  {
    id: 'auth-security',
    patterns: [
      /[/\\](auth|authentication|authorization|rls|permissions?)[/\\]/i,
      /[/\\]middleware\.[jt]sx?$/i,
      /[/\\]policies?[/\\].*\.sql$/i,
      /[/\\]verify[Ii]ngest[Tt]oken\.[jt]s$/i,
    ],
    label: 'AUTH / RLS / PERMISSION path detected',
    actions: [
      'After editing: MANDATORY spawn `critic` agent (security review)',
      'If critic flags Critical/High: spawn `vuln-verifier` agent to write PoC',
      'These paths are High-risk per AGENTS.md §操作風險分級 — no exceptions',
    ],
  },
  {
    id: 'db-migration',
    patterns: [
      /[/\\]migrations?[/\\].*\.(sql|[jt]s)$/i,
      /\d{4}_[^/\\]+\.sql$/i,
      /[/\\]schema\.(sql|prisma)$/i,
    ],
    label: 'DB MIGRATION / SCHEMA path detected',
    actions: [
      'Before finalizing: spawn `db-expert` agent to review migration safety',
      'Check: locking behavior, backward compatibility, rollback path',
    ],
  },
  {
    id: 'supabase',
    patterns: [
      /[/\\]supabase[/\\](functions|migrations|storage|seed)[/\\]/i,
      /supabase[/\\]config\.(ts|js|toml)$/i,
    ],
    label: 'SUPABASE path detected',
    actions: [
      'Spawn `supabase-engineer` agent for RLS / Edge Function / storage changes',
    ],
  },
  {
    id: 'n8n',
    patterns: [
      /[/\\]n8n[/\\]/i,
      /infra[/\\]n8n[/\\]/i,
    ],
    label: 'N8N WORKFLOW path detected',
    actions: [
      'Spawn `n8n-engineer` agent — self-hosted n8n on ks-aw-01 (145.239.195.47; KS-6 host switch on 2026-08-31)',
    ],
  },
  {
    id: 'nginx-docker',
    patterns: [
      /[/\\]nginx[/\\].*\.conf$/i,
      /docker-compose[^/\\]*\.ya?ml$/i,
      /[/\\]Dockerfile$/i,
    ],
    label: 'NGINX / DOCKER path detected',
    actions: [
      'MANDATORY: read safe-infra-patch.sh rules BEFORE applying',
      'After edit: run health check immediately',
      'Failure → auto rollback via rollback-phase1.sh',
      'Ref: AGENTS.md §Auto-Repair 紅線',
    ],
  },
  {
    id: 'wordpress',
    patterns: [
      /[/\\](wp-content|plugins?|themes?)[/\\]/i,
      /[/\\]functions\.php$/i,
      /[/\\]wp-config\.php$/i,
    ],
    label: 'WORDPRESS path detected',
    actions: [
      'Spawn `wordpress-plugin-expert` agent for WP/plugin/theme changes',
    ],
  },
  {
    id: 'trigger-dev',
    patterns: [
      /[/\\]trigger[/\\]/i,
      /infra[/\\]trigger[/\\]/i,
      /[/\\]trigger\.config\.[jt]s$/i,
    ],
    label: 'TRIGGER.DEV path detected',
    actions: [
      'Spawn `trigger-deploy-agent` for deploy (uses tr_pat_* NOT tr_prod_*)',
      'Ref: AGENTS.md §Trigger.dev 憑證',
    ],
  },
];

function getMatchedCategories(files) {
  const results = [];
  for (const cat of ROUTE_CATEGORIES) {
    const matchedFile = files.find(f => {
      const norm = (f || '').replace(/\\/g, '/');
      return cat.patterns.some(re => re.test(norm));
    });
    if (matchedFile) results.push({ cat, file: matchedFile });
  }
  return results;
}

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    let i;
    try { i = JSON.parse(d); } catch (_) { process.stdout.write(d); return; }

    // Collect file paths (single Edit/Write + MultiEdit shapes)
    const files = [];
    if (i.tool_input?.file_path) files.push(i.tool_input.file_path);
    if (Array.isArray(i.tool_input?.edits)) {
      for (const e of i.tool_input.edits) if (e?.file_path) files.push(e.file_path);
    }
    if (files.length === 0) { process.stdout.write(d); return; }

    const matched = getMatchedCategories(files);
    if (matched.length === 0) { process.stdout.write(d); return; }

    // Per-category session flags — fire ONCE per category per session
    const sid = shared.getSessionId(i);
    const newMatches = [];

    for (const m of matched) {
      const flagPath = path.join(os.tmpdir(), `claude-file-router-${sid}-${m.cat.id}.flag`);
      try {
        fs.writeFileSync(flagPath, new Date().toISOString(), { encoding: 'utf8', flag: 'wx' });
        newMatches.push(m); // flag created → new category this session
      } catch (e) {
        if (e.code === 'EEXIST') continue; // already shown this session → skip
        shared.logFailOpen('file-path-router flag', e);
        // FS error — fail-open for this category
      }
    }

    if (newMatches.length === 0) {
      // All matched categories already shown this session → pass through silently
      process.stdout.write(d); return;
    }

    // Show routing instructions and block. Re-issue → all flags EEXIST → pass through.
    process.stderr.write('[Hook] FILE-PATH ROUTER — agent routing required:\n');
    for (const m of newMatches) {
      process.stderr.write(`[Hook] ▶ ${m.cat.label}\n`);
      process.stderr.write(`[Hook]   file: ${m.file}\n`);
      for (const action of m.cat.actions) {
        process.stderr.write(`[Hook]   → ${action}\n`);
      }
    }
    process.stderr.write('[Hook] Re-issue the same command to proceed after noting the above.\n');
    process.stderr.write('', () => process.exit(2));
  } catch (e) {
    shared.logFailOpen('file-path-router', e);
    process.stdout.write(d); // fail-open
  }
});
