// PreToolUse (matcher "Agent") + UserPromptSubmit: hard per-turn cap on how
// many subagents (Agent tool) THIS session may spawn.
//
// WHY PreToolUse, NOT SubagentStart (2026-09-03 rewrite): the first version
// of this gate lived on SubagentStart and was proven dead on arrival by an
// external critic review with a REAL spawn as evidence:
//   - Claude Code's own hooks reference states SubagentStart's exit code
//     and stdout are ignored except for terminalSequence/systemMessage --
//     it cannot block anything.
//   - Worse: during the critic's own (real) Task spawn, no tracker file was
//     written and no fail-open log entry appeared for this event at all --
//     SubagentStart never reached runner.js for that spawn in practice.
// PreToolUse is the only event Claude Code's own reference documents as
// actually blocking the tool call. `agent-dispatch-log.js`'s PostToolUse
// rule already proves the "Agent" matcher and `ctx.toolInput.description`
// shape are real and populated on this tool -- this rule reuses both.
//
// WHY THIS EXISTS (2026-09-03): a Workflow-tool pipeline (27 items x 4
// agents/item = 102) burned a full 5-hour Max usage window in ~20 minutes.
// This gate covers the Agent-tool fan-out path only; the Workflow tool's
// agent() calls execute in the background and never reach a local
// PreToolUse/SubagentStart hook for their internal spawns (only the single
// top-level `Workflow` tool call itself is visible here) -- Workflow-side
// mitigation is procedural (AGENTS.md), not mechanical.
//
// Tiers (operator-approved 2026-09-03):
//   0-5    -> allow, context-only note.
//   6-10   -> BLOCK unless the Agent call's own `prompt` carries a
//             line matching /^[ \t]*CONFIRMED-INDEPENDENT-WORKSTREAM[ \t]*:
//             [ \t]*\S.*$/m (case-sensitive, anchored, non-empty reason --
//             tightened after critic review found the first draft's
//             case-insensitive, unanchored, greedy regex would fire on any
//             prompt merely QUOTING the marker string, e.g. this file's own
//             review). Claude supplies this itself, no user confirmation
//             required (operator is frequently away from the keyboard).
//   >10    -> BLOCK, unconditional, no marker unlocks this tier.
//
// Counting: append-only, NOT read-modify-write. The first draft used
// read-count -> +1 -> write-count across independent Node processes (one
// per hook invocation); critic review flagged this as unsafe exactly in the
// scenario this gate exists to catch -- a burst of near-simultaneous
// parallel spawns can all read the same stale count and all pass. A single
// `fs.appendFileSync` call is effectively atomic per call on both POSIX and
// NTFS for small writes; the running count is just the tracker file's byte
// size, so there is no read-decide-write window for two processes to race
// through together.
//
// Known accepted trade-off (m1, critic review): the append happens BEFORE
// the tier check, so a blocked-then-retried attempt still consumes budget.
// This makes the effective cap "attempts", not "granted spawns" -- strictly
// safe direction (can only make the gate MORE conservative, never less).
//
// Reset: every UserPromptSubmit event truncates this session's tracker --
// a new user turn is the natural "new authorization" boundary.
const fs = require('fs');
const os = require('os');
const path = require('path');

const BLOCK_TIER_1 = 6;   // 6-10: needs an explicit-independence marker
const BLOCK_TIER_2 = 11;  // >10: hard stop, no marker unlocks this

// Anchored, case-sensitive, requires non-whitespace reason text -- fixes
// critic finding M2 (original /i, unanchored, greedy `(.+)` regex matched
// any prompt that merely quoted the marker string, e.g. a code-review task
// discussing this very file).
const MARKER_RE = /^[ \t]*CONFIRMED-INDEPENDENT-WORKSTREAM[ \t]*:[ \t]*\S.*$/m;

function trackerPath(sid) {
  return path.join(os.tmpdir(), `claude-subagent-budget-${sid}.txt`);
}

function appendAndCount(tf, shared) {
  try {
    fs.appendFileSync(tf, '.');
  } catch (e) {
    if (shared) shared.logFailOpen('subagent-budget(append)', e);
    else process.stderr.write(`[Hook] WARN: subagent-budget append failed (${e.code || e.message}): ${tf}\n`);
    return 0; // fail open: unwritable state never blocks a spawn
  }
  try {
    return fs.statSync(tf).size;
  } catch (e) {
    if (shared) shared.logFailOpen('subagent-budget(stat)', e);
    return 0; // fail open: unreadable state never blocks a spawn
  }
}

function resetTracker(tf, shared) {
  try {
    fs.writeFileSync(tf, '');
  } catch (e) {
    if (shared) shared.logFailOpen('subagent-budget(reset)', e);
    else process.stderr.write(`[Hook] WARN: subagent-budget reset failed (${e.code || e.message}): ${tf}\n`);
  }
}

function hasMarker(toolInput) {
  const text = `${toolInput.prompt || ''}\n${toolInput.description || ''}`;
  return MARKER_RE.test(text);
}

module.exports = {
  check(ctx) {
    const sid = ctx.sid || 'no-sid';
    const tf = trackerPath(sid);

    if (ctx.event === 'UserPromptSubmit') {
      resetTracker(tf, ctx.shared);
      return null;
    }

    // PreToolUse, matcher "Agent" -- one real spawn attempt.
    const next = appendAndCount(tf, ctx.shared);

    if (next >= BLOCK_TIER_2) {
      return {
        block: [
          `[Subagent Budget] BLOCKED at spawn attempt #${next} this turn (hard cap >10, no override).`,
          '[Subagent Budget] Do not retry with more agents. Restructure the remaining work',
          '[Subagent Budget] into a batch of <=10 total this turn, defer the rest, and tell',
          '[Subagent Budget] the user explicitly what was deferred and why.',
        ],
      };
    }
    if (next >= BLOCK_TIER_1 && !hasMarker(ctx.toolInput)) {
      return {
        block: [
          `[Subagent Budget] BLOCKED at spawn attempt #${next} this turn (6-10 requires justification).`,
          '[Subagent Budget] Retry with a line in the Agent prompt (own line, exact text):',
          '[Subagent Budget]   CONFIRMED-INDEPENDENT-WORKSTREAM: <why this agent is genuinely',
          '[Subagent Budget]   independent, not sequential, not overlapping scope with the others>',
        ],
      };
    }
    return { context: [`[Subagent Budget] attempt ${next}/${BLOCK_TIER_1 - 1} this turn.`] };
  },
};
