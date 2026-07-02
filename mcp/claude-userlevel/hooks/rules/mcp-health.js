// MCP health circuit-breaker. PreToolUse: block calls to a server inside its
// unhealthy backoff window. PostToolUseFailure: mark servers unhealthy with
// exponential backoff (30s → 10min). Mode derives from ctx.event (legacy used
// an argv flag). Cache file and semantics preserved verbatim.
const fs = require('fs');
const os = require('os');
const path = require('path');

const CACHE_FILE = path.join(os.homedir(), '.claude', 'mcp-health-cache.json');

function loadState() {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); }
  catch (_) { return { servers: {} }; }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(state, null, 2));
}

module.exports = {
  check(ctx) {
    const tn = ctx.toolName;
    if (!tn.startsWith('mcp__')) return null;
    const server = tn.slice(5).split('__')[0];

    if (ctx.event === 'PreToolUse') {
      const state = loadState();
      const s = state.servers && state.servers[server];
      if (s && s.status === 'unhealthy' && s.nextRetryAt > Date.now()) {
        const wait = Math.round((s.nextRetryAt - Date.now()) / 1000);
        return { block: [`[Hook] MCP ${server} is unhealthy, retry in ${wait}s. Skipping.`] };
      }
      if (s && s.status === 'unhealthy' && s.nextRetryAt <= Date.now()) {
        delete state.servers[server];
        saveState(state);
      }
      return null;
    }

    if (ctx.event === 'PostToolUseFailure') {
      const i = ctx.payload;
      const errText = [i.error, i.message, i.tool_response,
        typeof i.tool_output === 'string' ? i.tool_output : i.tool_output && i.tool_output.output,
        i.tool_output && i.tool_output.stderr].filter(Boolean).join(' ');
      const infraPatterns = [
        /ECONNREFUSED|ENOTFOUND|timed? out|socket hang up|connection (?:failed|lost|reset|closed)/i,
        /\b(401|403|429|503)\b/i,
        /disconnected|unavailable/i,
      ];
      if (infraPatterns.some((p) => p.test(errText))) {
        const state = loadState();
        const prev = (state.servers && state.servers[server]) || {};
        const fc = (prev.failureCount || 0) + 1;
        const backoff = Math.min(30000 * (2 ** (fc - 1)), 600000);
        state.servers[server] = {
          status: 'unhealthy',
          checkedAt: Date.now(),
          failureCount: fc,
          nextRetryAt: Date.now() + backoff,
          lastError: errText.slice(0, 200),
        };
        saveState(state);
        const warn = [`[Hook] MCP ${server} marked unhealthy (attempt ${fc}), retry after ${Math.round(backoff / 1000)}s`];
        // Vault-gap mechanization (2026-07-02, Phase 4): AGENTS.md trigger
        // 「MCP tool 回 401/403 → /vault-status；缺口 → /vault-sync」 was
        // semantic-only (audit rank #4). Auth-shaped failures now carry the
        // routing hint mechanically.
        if (/\b(401|403)\b/.test(errText)) {
          warn.push(`[Hook] ${server} failed with 401/403 — credentials gap? Run /vault-status; if a key is missing, /vault-sync (AGENTS.md trigger).`);
        }
        return { warn };
      }
      return null;
    }

    return null;
  },
};
