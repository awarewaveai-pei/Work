// Route to the right specialist agent based on the file path being edited
// (once per category per session). Categories preserved verbatim.
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
    actions: ['Spawn `supabase-engineer` agent for RLS / Edge Function / storage changes'],
  },
  {
    id: 'n8n',
    patterns: [/[/\\]n8n[/\\]/i, /infra[/\\]n8n[/\\]/i],
    label: 'N8N WORKFLOW path detected',
    actions: ['Spawn `n8n-engineer` agent — self-hosted n8n on ks-aw-01 (145.239.195.47; KS-6 host switch on 2026-08-31)'],
  },
  {
    id: 'nginx-docker',
    patterns: [/[/\\]nginx[/\\].*\.conf$/i, /docker-compose[^/\\]*\.ya?ml$/i, /[/\\]Dockerfile$/i],
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
    patterns: [/[/\\](wp-content|plugins?|themes?)[/\\]/i, /[/\\]functions\.php$/i, /[/\\]wp-config\.php$/i],
    label: 'WORDPRESS path detected',
    actions: ['Spawn `wordpress-plugin-expert` agent for WP/plugin/theme changes'],
  },
  {
    id: 'trigger-dev',
    patterns: [/[/\\]trigger[/\\]/i, /infra[/\\]trigger[/\\]/i, /[/\\]trigger\.config\.[jt]s$/i],
    label: 'TRIGGER.DEV path detected',
    actions: [
      'Spawn `trigger-deploy-agent` for deploy (uses tr_pat_* NOT tr_prod_*)',
      'Ref: AGENTS.md §0 (Trigger.dev 憑證不可互換)',
    ],
  },
];

module.exports = {
  check(ctx) {
    const matched = [];
    for (const cat of ROUTE_CATEGORIES) {
      const file = ctx.files.find((f) => {
        const norm = (f || '').replace(/\\/g, '/');
        return cat.patterns.some((re) => re.test(norm));
      });
      if (file) matched.push({ cat, file });
    }
    if (!matched.length) return null;

    const fresh = matched.filter(
      (m) => ctx.flags.once(`file-router-${ctx.sid}-${m.cat.id}`) === 'created'
    );
    if (!fresh.length) return null;

    const block = ['[Hook] FILE-PATH ROUTER — agent routing required:'];
    for (const m of fresh) {
      block.push(`[Hook] ▶ ${m.cat.label}`);
      block.push(`[Hook]   file: ${m.file}`);
      for (const a of m.cat.actions) block.push(`[Hook]   → ${a}`);
    }
    block.push('[Hook] Re-issue the same command to proceed after noting the above.');
    return { block };
  },
};
