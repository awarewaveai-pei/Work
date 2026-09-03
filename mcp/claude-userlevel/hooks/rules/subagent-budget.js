// PreToolUse: hard budget gate on subagent fan-out, covering the two known
// IN-SESSION paths that can spawn agents in this environment -- the Agent
// tool (matcher "^Agent$") and the Workflow tool (matcher "^Workflow$").
// Deliberately NOT covered (out of scope, not silently missed -- see m-6
// below): `mcp__ccd_session__spawn_task` (spins up a SEPARATE Claude
// session with its own budget/window) and shelling out to `claude -p`
// (same reason). Both consume the same underlying account usage but are
// architecturally outside what a PreToolUse hook in THIS session can see.
//
// ============================================================================
// REWRITE HISTORY -- read this before touching tier numbers or matchers again
// ============================================================================
// v1 (2026-09-03, commit predecessor): lived on `SubagentStart`. Proven dead
//   on arrival by external critic review using a REAL Task spawn as evidence
//   -- Claude Code's own hooks reference documents SubagentStart's exit code
//   as ignored, and no fail-open log entry appeared for that event during a
//   real spawn at all.
// v2 (commit 4633b9c1b): moved to `PreToolUse` matcher "Agent", append-only
//   counting, anchored marker regex. A second critic pass (same day, same
//   file) found: C-1 no `Workflow` coverage at all (the tool that actually
//   caused the 102-agent incident); M-1 unanchored "Agent" matcher mis-fires
//   on the real `ListAgents` tool; M-2 per-turn reset bypassable by sending
//   another message and blind to `run_in_background` agents that outlive
//   the turn; M-4 the block was never proven against a REAL spawn.
// v3 (this round's predecessor, not separately committed): fixed all four
//   of v2's findings -- sliding window instead of per-turn reset, anchored
//   `^Agent$`/`^Workflow$` matchers plus an inline `isAgentTool()` guard,
//   a `Workflow` branch requiring a declared `// SUBAGENT-BUDGET-ESTIMATE:`
//   marker, and a REAL haiku Agent spawn that was genuinely refused by the
//   harness (not a synthetic payload -- see WORKLOG 2026-09-03 續4). A THIRD
//   critic pass, run specifically because self-grading a fix for a gate
//   whose whole point is "don't trust your own synthetic verification"
//   would have been the same mistake again, found three more real problems
//   -- all three required real data (a scan of actual `Workflow` tool_use
//   payloads), real parallelism (a live 20-process stress test), or mutation
//   testing to surface; none were visible from reading the diff alone:
//     C-1 (this round): the `Workflow` branch only ever read `toolInput.
//          script`. A scan of every real Workflow call this environment has
//          made found 3 distinct input shapes -- `{script}`, `{scriptPath,
//          resumeFromRunId}` (31% of real calls, most recent one day before
//          this fix), and `{description, script}`. The `scriptPath`/
//          `resumeFromRunId` shape has no `script` field to put a marker
//          in, so the old code blocked it UNCONDITIONALLY with a message
//          telling the caller to do something structurally impossible --
//          and blocking a *resume* forces the whole workflow to restart
//          from scratch, spending MORE tokens than letting it through. This
//          gate would have made the exact problem it exists to prevent
//          worse, on 31% of its real traffic, the very next time a resume
//          happened.
//     M-1 (this round): the >200-line "hygiene" compaction in the counting
//          function reintroduced the full read-modify-write race the v2->v3
//          rewrite specifically eliminated with append-only counting. Live
//          stress test (20 concurrent processes) measured 33-45% of
//          concurrent appends silently LOST once compaction triggered (0
//          lost when it didn't) -- i.e. it weakened the gate exactly in the
//          parallel-fan-out scenario the gate exists for, while a comment
//          two lines above claimed the race was "eliminated". Removed
//          entirely; a tracker file growing to a few hundred KB over a long
//          session is a real but far smaller cost than a gate that silently
//          under-counts during a burst (see "Tracker file growth" below).
//     M-3 (this round): `WORKFLOW_ESTIMATE_LIMIT` was set to 15 (the
//          Workflow tool's own "keep under 15" guideline) -- looser than
//          both the operator's own explicitly stated cap (memory
//          `feedback_no_heavy_subagent_workflows.md`, 2026-09-03: "一次 ≤5
//          個 agent、真正需要才最多 10 個") and this same file's Agent-tool
//          hard cap of 10. The path that actually caused the incident had a
//          LOOSER limit than the path that didn't. Lowered to 10 to match
//          both.
//     (also fixed, smaller: m-1/multi-line estimates now SUM instead of
//     reading only the first match; m-5/a version-skewed shared.js missing
//     isAgentTool() now falls back instead of crashing the whole rule open;
//     the "20-concurrent-process stress test... preserved here" claim in
//     v3's comments was true of a one-off manual run but not of the actual
//     test SUITE -- it is now an actual test in subagent-budget.test.mjs.)
//
// The invariant this whole rewrite chain keeps converging on, stated once:
// **every check in this gate, AND every claim verifying it, must be tested
// against real shapes/real concurrency/real spawns -- a synthetic payload
// or a read-the-diff review can state a plausible design but cannot catch
// what real traffic actually looks like.** Round 3 found nothing by reading
// code that round 2 didn't already fix; it found three real bugs by running
// real data through the real thing.
//
// ============================================================================
// PATH A -- Agent tool (matcher "^Agent$")
// ============================================================================
// Counting: pure append-only sliding time window, no compaction (M-1,
// above). Every real spawn attempt appends one `<epoch_ms>\n` line (single
// `fs.appendFileSync` call -- atomic per call on both POSIX and Windows
// NTFS for small writes, per libuv's UV_FS_O_APPEND handling; confirmed by
// a real 20-concurrent-process stress test with compaction disabled: 0
// entries lost across 3 runs). The count for a decision is the number of
// lines whose timestamp falls within `AGENT_WINDOW_MS` of now -- this
// matches the incident shape (a burst of spawns over ~20-30 wall-clock
// minutes, not "since the last message") and survives both of v2's
// bypasses: sending another message doesn't reset anything, and a
// `run_in_background` agent still counts against the window it was spawned
// in even after the turn that spawned it ends.
//
// Known residual trade-off on the READ side (accepted, not silently
// missed): after your own append lands, reading the file back to count
// in-window entries is not formally proven atomic against a truly
// simultaneous append from ANOTHER process -- a read landing in the exact
// instant of another process's in-flight write could under-count by one.
// This is a single-syscall-width window, not the full round-trip window
// M-1's compaction reintroduced, and it fails in the safe direction
// (under-count -> allow, never a false block).
//
// Tracker file growth (accepted, not silently missed): with no compaction,
// the tracker file grows for the life of the OS temp directory, not just
// the session. At ~14 bytes/entry this is a few hundred KB even after
// thousands of spawns across many sessions -- real but low-priority
// cleanup debt, tracked as a known suggestion (s-3, 2026-09-03 round-3
// critic report) rather than solved here with more concurrency-unsafe
// machinery.
//
// Tiers (operator-approved 2026-09-03):
//   0-5 in-window   -> allow, context-only note (best-effort -- PreToolUse
//                      context lines are demoted to stderr by runner.js and
//                      are NOT visible to the model; a pre-existing
//                      limitation of the context-vs-block plumbing shared
//                      by every PreToolUse rule, not unique to this one).
//   6-10 in-window  -> BLOCK unless the Agent call's own `prompt` carries a
//                      line matching AGENT_MARKER_RE (case-sensitive,
//                      anchored, non-empty reason).
//   >10 in-window   -> BLOCK, unconditional, no marker unlocks this tier.
// NOTE (round-3 critic m-4, accepted as documented rather than "fixed" --
// see the header note on appendAndCountInWindow for why the alternative is
// worse): a BLOCKED attempt still appends its own timestamp before the
// tier check runs, so a caller that retries after being blocked consumes
// budget on every retry. The effective usable count before hitting the
// hard cap can be lower than 10 if any tier-1 retries happened first. This
// is intentional (the safe direction -- it can only make the gate MORE
// conservative) but means "10" is a ceiling, not a guaranteed allowance.
// To reset early: delete `%TEMP%\claude-subagent-budget-agent-<sid>.txt`.
//
// ============================================================================
// PATH B -- Workflow tool (matcher "^Workflow$")
// ============================================================================
// The Workflow tool's `agent()` calls execute in a background/cloud
// orchestration engine and never reach a local PreToolUse/SubagentStart
// hook for their INTERNAL spawns -- only this single top-level `Workflow`
// tool call itself is visible here (verified 2026-09-03: a real 12-agent
// Workflow run left zero PostToolUse dispatch-log entries for those 12
// agents). A regex count of `agent(` calls in script text was considered
// and rejected: it cannot see through a runtime-computed loop
// (`items.map(x => agent(...))`), which is exactly the shape that produced
// the 102-agent incident.
//
// Given that, this gate cannot COUNT the real fan-out. What it CAN do is
// make the AGENTS.md §Agent 扇出治理 procedural rule ("state N x M = total
// before calling Workflow") mechanically unskippable for the one input
// shape where a marker is even meaningful:
//   - `toolInput.script` present (a NEW script authored inline) -> the
//     marker rule applies: every `// SUBAGENT-BUDGET-ESTIMATE: <N>` line in
//     the script is SUMMED (round-3 m-1 fix -- reading only the first match
//     let an honestly-labeled multi-batch script slip past the ceiling
//     undetected). Missing entirely -> BLOCK. Sum > WORKFLOW_ESTIMATE_LIMIT
//     -> BLOCK. Otherwise allow.
//   - `toolInput.scriptPath` present, no inline `script` -> read the file
//     from disk and apply the same marker rule to its contents. A read
//     failure blocks with a message describing the actual failure (not the
//     "add a line to script" message, which would be nonsensical here).
//   - Neither `script` nor `scriptPath` present (a `resumeFromRunId`-only
//     resume, or a `name`-only saved workflow) -> there is no local text to
//     put a marker in or read. BLOCKING here was round-3's C-1 finding: it
//     makes the call unconditionally, permanently unsatisfiable, and
//     forcing a resume to restart from scratch spends MORE tokens than
//     letting it through (Workflow's own resume semantics cache-hit
//     unchanged `agent()` calls). This branch therefore ALLOWS with an
//     honest context note. It has not been exercised by a real `Workflow`
//     call in this repo (doing so requires the user's own explicit
//     multi-agent opt-in, which this verification pass does not have --
//     see WORKLOG 2026-09-03 續5) -- documented as unverified-live, not
//     assumed safe by extrapolation from the `script` path's real test.
// This is a HONESTY gate, not a truth gate: it cannot verify a declared
// number is accurate, only that a number was declared, summed correctly,
// and is within bounds. `tests/hooks/subagent-budget.test.mjs` has an
// explicit test asserting this limitation (a script that lies about its
// own loop size is NOT caught) so the limitation stays a checked fact,
// not an assumption that quietly rots.
const fs = require('fs');
const os = require('os');
const path = require('path');

// Number(process.env.X) || default silently discards an explicit "0"
// override (round-3 critic s-1 -- e.g. SUBAGENT_BUDGET_WORKFLOW_LIMIT=0 for
// an emergency full-block is a legitimate value, not "unset"). Explicit
// isFinite check instead.
function envInt(name, def) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  return Number.isFinite(n) ? n : def;
}

const AGENT_WINDOW_MS = envInt('SUBAGENT_BUDGET_WINDOW_MS', 20 * 60 * 1000); // 20 min, matches observed incident timeframe
const AGENT_TIER_1 = envInt('SUBAGENT_BUDGET_TIER1', 6);   // 6-10: needs marker
const AGENT_TIER_2 = envInt('SUBAGENT_BUDGET_TIER2', 11);  // >10: hard stop
// Round-3 M-3 fix: was 15 (Workflow tool's own "keep under 15" guideline).
// That is LOOSER than the operator's own explicit cap (memory
// feedback_no_heavy_subagent_workflows.md, 2026-09-03: "一次 ≤5 個 agent、
// 真正需要才最多 10 個") and looser than this file's own Agent-tool hard
// cap (10) -- the path that actually caused the incident had the loosest
// limit of the three. Lowered to 10 to match both.
const WORKFLOW_ESTIMATE_LIMIT = envInt('SUBAGENT_BUDGET_WORKFLOW_LIMIT', 10);

// Anchored, case-sensitive, requires non-whitespace reason text: v1's /i
// unanchored `(.+)` regex fired on any prompt merely QUOTING the marker
// string (a real false positive -- an earlier review's own briefing text
// contained the literal string and would have self-unlocked).
const AGENT_MARKER_RE = /^[ \t]*CONFIRMED-INDEPENDENT-WORKSTREAM[ \t]*:[ \t]*\S.*$/m;
const WORKFLOW_ESTIMATE_RE = /^[ \t/*#-]*SUBAGENT-BUDGET-ESTIMATE[ \t]*:[ \t]*(\d+)/gm;

function agentTrackerPath(sid) {
  return path.join(os.tmpdir(), `claude-subagent-budget-agent-${sid}.txt`);
}

// Appends `now`, then returns how many recorded timestamps (including this
// one) fall within AGENT_WINDOW_MS of `now`. No compaction (see M-1 in the
// header) -- correctness of the count never depends on rewriting the file,
// only ever on appending to it and reading it back.
function appendAndCountInWindow(tf, now, shared) {
  try {
    fs.appendFileSync(tf, `${now}\n`);
  } catch (e) {
    if (shared) shared.logFailOpen('subagent-budget(agent-append)', e);
    else process.stderr.write(`[Hook] WARN: subagent-budget append failed (${e.code || e.message}): ${tf}\n`);
    return 0; // fail open: unwritable state never blocks a spawn
  }
  let lines;
  try {
    lines = fs.readFileSync(tf, 'utf8').split('\n');
  } catch (e) {
    if (shared) shared.logFailOpen('subagent-budget(agent-read)', e);
    return 1; // we know our own append landed even if the read-back failed
  }
  const cutoff = now - AGENT_WINDOW_MS;
  let count = 0;
  for (const line of lines) {
    const t = parseInt(line, 10);
    if (Number.isFinite(t) && t >= cutoff) count++;
  }
  return count;
}

function hasAgentMarker(toolInput) {
  const text = `${toolInput.prompt || ''}\n${toolInput.description || ''}`;
  return AGENT_MARKER_RE.test(text);
}

// Sums every `SUBAGENT-BUDGET-ESTIMATE:` line found (round-3 m-1 fix --
// `.exec()` on a non-global regex only ever returned the FIRST match, so a
// script honestly split into multiple labeled batches, e.g. two blocks
// each declaring 12 for a real total of 24, passed as if it had declared
// only 12). Returns null if no line was found at all.
function workflowDeclaredEstimateTotal(text) {
  const re = new RegExp(WORKFLOW_ESTIMATE_RE.source, WORKFLOW_ESTIMATE_RE.flags);
  let m;
  let sum = null;
  while ((m = re.exec(text))) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n)) sum = (sum || 0) + n;
  }
  return sum;
}

function checkAgent(ctx) {
  const sid = ctx.sid || 'no-sid';
  const tf = agentTrackerPath(sid);
  const next = appendAndCountInWindow(tf, Date.now(), ctx.shared);
  const windowMin = Math.round(AGENT_WINDOW_MS / 60000);

  if (next >= AGENT_TIER_2) {
    return {
      block: [
        `[Subagent Budget] BLOCKED: ${next} Agent spawns in the last ${windowMin} min (hard cap >${AGENT_TIER_2 - 1}, no override).`,
        '[Subagent Budget] Do not retry with more agents. Restructure the remaining work',
        '[Subagent Budget] into a smaller batch, defer the rest, and tell the user what was deferred and why.',
      ],
    };
  }
  if (next >= AGENT_TIER_1 && !hasAgentMarker(ctx.toolInput)) {
    return {
      block: [
        `[Subagent Budget] BLOCKED: ${next} Agent spawns in the last ${windowMin} min (${AGENT_TIER_1}-${AGENT_TIER_2 - 1} requires justification).`,
        '[Subagent Budget] Retry with a line in the Agent prompt (own line, exact text):',
        '[Subagent Budget]   CONFIRMED-INDEPENDENT-WORKSTREAM: <why this agent is genuinely',
        '[Subagent Budget]   independent, not sequential, not overlapping scope with the others>',
      ],
    };
  }
  if (next >= AGENT_TIER_1) {
    return { context: [`[Subagent Budget] ${next} Agent spawns in the last ${windowMin} min -- allowed via independence marker.`] };
  }
  return { context: [`[Subagent Budget] ${next}/${AGENT_TIER_1 - 1} Agent spawns in the last ${windowMin} min.`] };
}

function checkWorkflow(ctx) {
  const input = ctx.toolInput;
  let scriptText = null;

  if (typeof input.script === 'string' && input.script) {
    scriptText = input.script;
  } else if (typeof input.scriptPath === 'string' && input.scriptPath) {
    try {
      scriptText = fs.readFileSync(input.scriptPath, 'utf8');
    } catch (e) {
      return {
        block: [
          `[Subagent Budget] BLOCKED: could not read Workflow scriptPath (${e.code || e.message}).`,
          `[Subagent Budget] scriptPath: ${input.scriptPath}`,
          '[Subagent Budget] Fix the path, or call with an inline `script` containing',
          '[Subagent Budget]   // SUBAGENT-BUDGET-ESTIMATE: <N>',
        ],
      };
    }
  } else {
    // resumeFromRunId-only or name-only: no local script text exists to
    // inspect. See the PATH B header comment for why blocking here is
    // actively harmful (round-3 C-1) -- allow with an honest note instead.
    return {
      context: [
        '[Subagent Budget] Workflow call has no local script/scriptPath to inspect (resume or',
        '[Subagent Budget] named workflow) -- cannot estimate, allowing. Not yet verified against',
        '[Subagent Budget] a real Workflow call (requires user multi-agent opt-in this pass lacks).',
      ],
    };
  }

  const estimate = workflowDeclaredEstimateTotal(scriptText);
  if (estimate === null) {
    return {
      block: [
        '[Subagent Budget] BLOCKED: Workflow script has no declared agent-count estimate.',
        '[Subagent Budget] Add a line (own line, in `script` or the file at `scriptPath`):',
        '[Subagent Budget]   // SUBAGENT-BUDGET-ESTIMATE: <N>   (items x agents/item, computed)',
        `[Subagent Budget] If the honest total is > ${WORKFLOW_ESTIMATE_LIMIT}, restructure into a smaller/batched script instead.`,
      ],
    };
  }
  if (estimate > WORKFLOW_ESTIMATE_LIMIT) {
    return {
      block: [
        `[Subagent Budget] BLOCKED: declared estimate ${estimate} exceeds the operator-set limit (${WORKFLOW_ESTIMATE_LIMIT}).`,
        '[Subagent Budget] Restructure into a smaller/batched script (process a subset,',
        '[Subagent Budget] verify, continue) instead of one large fan-out.',
      ],
    };
  }
  return { context: [`[Subagent Budget] Workflow declared estimate: ${estimate}/${WORKFLOW_ESTIMATE_LIMIT}.`] };
}

module.exports = {
  check(ctx) {
    const shared = ctx.shared;
    // Round-3 m-5: a version-skewed shared.js (synced mid-deploy, missing
    // isAgentTool() from an older copy) must not crash the whole rule open
    // -- fall back to the inline check rather than let the fail-open catch
    // in runner.js silently disable this gate entirely.
    const isAgentFn = (shared && typeof shared.isAgentTool === 'function')
      ? shared.isAgentTool
      : (n) => String(n || '').toLowerCase() === 'agent';
    if (isAgentFn(ctx.toolName)) return checkAgent(ctx);
    if (ctx.toolName === 'Workflow') return checkWorkflow(ctx);
    return null; // matcher groups should prevent this, but never assume
  },
};
