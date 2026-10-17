// UserPromptSubmit: measure the live context from the transcript and, only when
// action is due, inject ONE line so the first-line /compact | /clear reminder
// (AGENTS.md §5 Session 切換) rests on a measurement. Silent below 80%, and each
// reminder fires once per session: the every-turn line (2026-10-15) made agents
// repeat /clear and /compact on every reply (operator 2026-10-17: 「一直要我 clear 很煩」).
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
// Policy (mirrored in AGENTS.md §5 and TOOL_TRIGGER_MAP), from 91 measured compactions
// (2026-10-15: ~4 min wait each, ~1-2 s faster per step after): >= 80% and never
// compacted -> /compact once; >= 80% after a compaction -> /tomo, then /clear.
// "Once" = the last reminder key per session is kept in os.tmpdir().
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
const os = require('os');
const path = require('path');

const THRESHOLD = 80;
const ADVICE = {
  compact: '任務未完就在回覆首行建議 /compact 一次（「⚠ 建議 /compact：保留 <焦點一句>」）；快做完就不壓，做完再 /clear',
  clear: '已壓過一次又滿了：先 /tomo 寫交接，再首行「⚠ 建議 /clear → 新 session 第一句貼：「續做 <任務>：讀 <SSOT 路徑>，從 <第一個動作> 開始；完成 = <條件>。建議模型：<模型>」」',
};

function hasCompacted(transcriptPath) {
  const needle = Buffer.from('"compact_boundary"');
  const fd = fs.openSync(transcriptPath, 'r');
  try {
    const chunk = Buffer.alloc(8 << 20);
    let pos = 0;
    for (;;) {
      const n = fs.readSync(fd, chunk, 0, chunk.length, pos);
      if (n <= 0) return false;
      if (chunk.subarray(0, n).indexOf(needle) !== -1) return true;
      if (n < chunk.length) return false;
      pos += n - needle.length; // overlap so a needle split across chunks is still found
    }
  } finally {
    fs.closeSync(fd);
  }
}

function alreadySaid(sid, key) {
  const f = path.join(os.tmpdir(), `claude-ctx-reminder-${String(sid).replace(/[^\w.-]/g, '_')}`);
  let last = '';
  try { last = fs.readFileSync(f, 'utf8').trim(); } catch (_) { /* first reminder */ }
  if (last === key) return true;
  try { fs.writeFileSync(f, key); } catch (_) { /* non-fatal: may repeat once */ }
  return false;
}

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
  hasCompacted,
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
    if (pct < THRESHOLD) return null;
    let key;
    try {
      key = hasCompacted(transcriptPath) ? 'clear' : 'compact';
    } catch (e) {
      if (ctx.shared && typeof ctx.shared.logFailOpen === 'function') ctx.shared.logFailOpen('suggest-compact', e);
      return null;
    }
    if (alreadySaid(ctx.sid, key)) return null;
    return {
      context: [
        `[Hook][CTX] ${fmtK(usage.tokens)} tokens ≈ ${pct}%（視窗 ${fmtK(win.size)}，${win.source}）→ ${ADVICE[key]}。只提這一次，之後不要再提。`,
      ],
    };
  },
};
