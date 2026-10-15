// UserPromptSubmit: measure the live context from the transcript and inject one
// line per turn, so the first-line /compact | /clear reminder (AGENTS.md §5
// Session 切換) rests on a measurement, not on "it feels sluggish".
//
// Source: the last non-sidechain `assistant` record in payload.transcript_path
// (Claude Code JSONL). Its message.usage is the prompt the API just saw --
// input_tokens + cache_creation_input_tokens + cache_read_input_tokens is
// everything in context at that turn; plus output_tokens is what the next
// turn carries. The window size is recorded nowhere in the transcript, so it
// comes from a model-id table (KNOWN_WINDOWS), a CLAUDE_CONTEXT_WINDOW
// override, or a 200k assumption that is bumped to 1M the moment a
// measurement exceeds it -- a window can never be smaller than what is already
// in it. The injected line names which.
//
// Thresholds (mirrored in AGENTS.md §5 and TOOL_TRIGGER_MAP): >= 50% -> suggest
// /compact while the task is open; >= 80% -> /tomo the handoff, then /clear.
//
// Replaces the tool-call counter (WARN every 50 Write/Edit calls, 2026-05):
// a count is not a context size, and a PreToolUse stderr warn never reached
// the operator (2026-10-15). Codex host has no transcript -> null. Any read
// failure -> null + fail-open log; a transcript that does not exist yet
// (first prompt of a session) is silent.
const fs = require('fs');

// First read; grows x4 up to MAX_SCAN_BYTES when a large trailing record (a multi-MiB
// tool result or pasted prompt) would otherwise hide the last assistant record and
// silence the line exactly when context is largest (Codex finding, 2026-10-15).
const TAIL_BYTES = 1 << 20;
const MAX_SCAN_BYTES = 64 << 20;
const DEFAULT_WINDOW = 200000;
const LARGE_WINDOW = 1000000;
// Evidence 2026-10-15 (D:\Work): the desktop app's get_usage reported contextWindow
// 1,000,000 for claude-fable-5-1; same-day transcripts measured 823k in context on
// claude-opus-5-5 and 477k on claude-sonnet-5, so the whole Claude 5 family is 1M.
// A `[1m]` / `-1m` suffix is the explicit 1M variant of older models.
const KNOWN_WINDOWS = [
  [/\[1m\]|-1m\b/i, LARGE_WINDOW],
  [/^claude-(fable|opus|sonnet|haiku)-5(?:-|$)/i, LARGE_WINDOW],
];
const BANDS = [
  [80, '任務未完：先 /tomo 落 handoff，再首行建議 /clear＋開場句'],
  [50, '任務未完：首行建議 /compact（保留焦點一句）'],
  [0, 'OK（任務收尾仍首行建議 /clear＋開場句）'],
];

function windowFor(model, measured = 0) {
  const env = Number(process.env.CLAUDE_CONTEXT_WINDOW);
  if (Number.isFinite(env) && env > 0) return { size: env, source: 'env' };
  const id = String(model || '');
  for (const [re, size] of KNOWN_WINDOWS) if (re.test(id)) return { size, source: 'model' };
  if (measured > DEFAULT_WINDOW) return { size: LARGE_WINDOW, source: '推（已超過假定 200k）' };
  return { size: DEFAULT_WINDOW, source: '假定' };
}

function lastAssistantUsage(transcriptPath) {
  const fd = fs.openSync(transcriptPath, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    for (let tail = TAIL_BYTES; ; tail *= 4) {
      const start = Math.max(0, size - tail);
      const buf = Buffer.alloc(size - start);
      fs.readSync(fd, buf, 0, buf.length, start);
      const lines = buf.toString('utf8').split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line) continue;
        let rec;
        try { rec = JSON.parse(line); } catch (_) { continue; } // the first tail line may be cut mid-record
        if (!rec || rec.type !== 'assistant' || rec.isSidechain) continue;
        const u = rec.message && rec.message.usage;
        if (!u || typeof u !== 'object') continue;
        const n = (k) => Number(u[k]) || 0;
        return {
          model: rec.message.model,
          tokens: n('input_tokens') + n('cache_creation_input_tokens') + n('cache_read_input_tokens') + n('output_tokens'),
        };
      }
      if (start === 0 || tail >= MAX_SCAN_BYTES) return null;
    }
  } finally {
    fs.closeSync(fd);
  }
}

function fmtK(n) {
  return n >= 1e6 ? `${Math.round(n / 1e5) / 10}M` : `${Math.round(n / 1000)}k`;
}

module.exports = {
  windowFor,
  lastAssistantUsage,
  check(ctx) {
    if (ctx.host === 'codex') return null;
    const transcriptPath = ctx.payload && ctx.payload.transcript_path;
    if (typeof transcriptPath !== 'string' || !transcriptPath) return null;
    let usage;
    try {
      usage = lastAssistantUsage(transcriptPath);
    } catch (e) {
      if (e && e.code !== 'ENOENT' && ctx.shared && typeof ctx.shared.logFailOpen === 'function') {
        ctx.shared.logFailOpen('suggest-compact', e);
      }
      return null;
    }
    if (!usage || usage.tokens <= 0) return null;
    const win = windowFor(usage.model, usage.tokens);
    const pct = Math.round((usage.tokens / win.size) * 100);
    const band = BANDS.find(([floor]) => pct >= floor)[1];
    return {
      context: [
        `[Hook][CTX] ${fmtK(usage.tokens)} tokens ≈ ${pct}%（視窗 ${fmtK(win.size)}，${win.source}）→ ${band}。依 AGENTS.md §5 Session 切換 在回覆首行提醒。`,
      ],
    };
  },
};
