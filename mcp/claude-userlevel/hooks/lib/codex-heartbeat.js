// Proof-of-execution record for Codex hooks.
//
// Codex silently skips any hook whose trusted hash no longer matches, so
// "hooks.json is configured" proves nothing. check-claude-codex-parity.ps1
// compares this file against the newest Codex rollout to catch that silent
// skip. Records key NAMES only (never values) so real payload shapes can be
// checked against codex-adapter.js without leaking prompts or commands.

const fs = require('fs');
const os = require('os');
const path = require('path');

function heartbeatPath() {
  const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return path.join(home, 'awarewave-hook-heartbeat.json');
}

function keysOf(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort() : [];
}

function record(event, rawPayload) {
  const file = heartbeatPath();
  let state = {};
  try { state = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { state = {}; }
  if (!state || typeof state !== 'object') state = {};
  const now = new Date().toISOString();
  const events = (state.events && typeof state.events === 'object') ? state.events : {};
  const prev = events[event] || {};
  const toolNames = (prev.tool_names && typeof prev.tool_names === 'object') ? prev.tool_names : {};
  const rawTool = rawPayload && typeof rawPayload.tool_name === 'string' ? rawPayload.tool_name : '';
  if (rawTool) toolNames[rawTool] = (toolNames[rawTool] || 0) + 1;
  const resp = rawPayload ? rawPayload.tool_response : undefined;
  events[event] = {
    last_utc: now,
    count: (prev.count || 0) + 1,
    tool_names: toolNames,
    payload_keys: keysOf(rawPayload),
    tool_input_keys: keysOf(rawPayload && rawPayload.tool_input),
    tool_response_type: resp === undefined ? 'absent' : (Array.isArray(resp) ? 'array' : typeof resp),
    tool_response_keys: keysOf(resp),
  };
  state.updated_utc = now;
  state.events = events;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Parallel tool calls start concurrent hook processes: write-then-rename so a
  // reader never sees a truncated file (a lost update between writers is fine).
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  try {
    fs.renameSync(tmp, file);
  } catch (_) {
    // Windows EPERM while another process holds the target open: the concurrent
    // writer's record is equally current, so drop this one.
    try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
  }
}

module.exports = { record, heartbeatPath };
