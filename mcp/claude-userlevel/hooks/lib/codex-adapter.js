// Codex -> canonical (Claude-shaped) hook payload translation.
//
// Rules only understand Claude's vocabulary (tool_name Bash / Edit / Agent,
// tool_input.command / file_path / prompt). Codex documents a different
// contract (learn.chatgpt.com/docs/hooks, checked 2026-09-19):
//   Bash       -> tool_input.command (unified exec / exec_command report as Bash)
//   apply_patch-> tool_input.command = the whole patch text; no file_path
//   Agent      -> tool_input = spawn_agent args (agent_type, message, task_name)
//   mcp__*     -> same naming as Claude
//   PostToolUse carries tool_response; there is no PostToolUseFailure event.
// Known upstream gap (openai/codex#34289, open): a shell tool_response is a
// plain string with the exit code stripped, so failures are indistinguishable
// and repeat-failure-guard cannot count them on Codex. failureText() only acts
// on an explicit structured signal, so it starts working if Codex adds one.
// Translating once here keeps every rule host-agnostic. Unknown shapes pass
// through untouched, so a Codex contract change degrades to "rule sees what
// Codex sent", never to a crash.

const path = require('path');

const PATCH_FILE_RE = /^\*\*\* (?:Add|Update|Delete) File: (.+?)\s*$|^\*\*\* Move to: (.+?)\s*$/gm;
const SHELL_ALIASES = new Set(['Bash', 'exec_command', 'shell', 'shell_command', 'local_shell', 'unified_exec']);

function patchFiles(patch, cwd) {
  const files = [];
  for (const m of String(patch || '').matchAll(PATCH_FILE_RE)) {
    const raw = (m[1] || m[2] || '').trim();
    if (!raw) continue;
    const abs = path.isAbsolute(raw) ? raw : path.resolve(cwd || process.cwd(), raw);
    if (!files.includes(abs)) files.push(abs);
  }
  return files;
}

function canonicalToolName(name) {
  if (name === 'apply_patch') return 'Edit';
  if (name === 'spawn_agent') return 'Agent';
  if (SHELL_ALIASES.has(name)) return 'Bash';
  return name;
}

function canonicalToolInput(rawName, input, cwd) {
  const src = (input && typeof input === 'object') ? input : {};
  if (rawName === 'apply_patch') {
    const patch = String(src.command ?? src.patch ?? src.input ?? '');
    const files = patchFiles(patch, cwd);
    return { ...src, file_path: files[0], edits: files.map((f) => ({ file_path: f })), patch };
  }
  if (canonicalToolName(rawName) === 'Bash') {
    let command = src.command ?? src.cmd ?? '';
    if (Array.isArray(command)) command = command.join(' ');
    return { ...src, command: String(command) };
  }
  if (canonicalToolName(rawName) === 'Agent') {
    return {
      ...src,
      subagent_type: src.subagent_type ?? src.agent_type,
      prompt: src.prompt ?? src.message,
      description: src.description ?? src.task_name,
    };
  }
  return src;
}

// Failure = an explicit non-zero exit or an explicit error flag. A plain-string
// response is treated as success: guessing from text would let a command that
// merely prints "error" poison repeat-failure-guard's counter.
function failureText(resp) {
  if (!resp || typeof resp !== 'object') return null;
  for (const k of ['exit_code', 'exitCode', 'exit_status', 'status_code']) {
    if (typeof resp[k] === 'number' && resp[k] !== 0) return `Exit code ${resp[k]}`;
  }
  if (resp.success === false || resp.is_error === true || resp.isError === true) {
    return String(resp.error || resp.stderr || 'tool reported failure');
  }
  return null;
}

// Returns { event, payload } where payload is the canonical view rules read.
function toCanonical(event, payload) {
  const rawName = String(payload.tool_name || '');
  const cwd = typeof payload.cwd === 'string' ? payload.cwd : process.cwd();
  const canonical = {
    ...payload,
    tool_name: canonicalToolName(rawName),
    tool_input: canonicalToolInput(rawName, payload.tool_input, cwd),
  };
  let effectiveEvent = event;
  if (event === 'PostToolUse') {
    const err = failureText(payload.tool_response);
    if (err) {
      effectiveEvent = 'PostToolUseFailure';
      canonical.error = err;
    }
  }
  return { event: effectiveEvent, payload: canonical };
}

module.exports = { toCanonical, patchFiles, canonicalToolName, failureText };
