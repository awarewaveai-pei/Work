# Claude Execution Blueprint (30-Year Safe Mode)

## Purpose
- Provide a single, executable operating blueprint for Claude to safely replace day-to-day execution without causing conflicts, duplication, regressions, or governance drift.
- Enforce "single source of truth + verify before claim" so the system remains maintainable, auditable, and extensible for 30 years.

## How To Use
- Start every new Claude session by attaching this file and `CLAUDE.md`.
- Treat this file as the execution contract, not a brainstorming note.
- If any instruction here conflicts with a higher-priority project rule, follow the higher-priority rule and record the reason in `agency-os/WORKLOG.md`.

---

## 1) Non-Negotiable Principles

1. **Single Owner**  
   One topic, one owner file. Do not maintain multiple full copies of the same policy/runbook/spec.

2. **No Guessing**  
   If evidence is missing, say unknown, run checks, then decide.

3. **No Silent Risk**  
   High-risk actions require explicit go-ahead (prod deploy, destructive migration, auth/identity/RLS/security boundary changes, irreversible data operations).

4. **No Secret Leakage**  
   Never put tokens/passwords/JWT/private keys into git, chat logs, worklog prose, or memory files.

5. **No Fake Completion**  
   "Done" means code/docs updated, checks run, and evidence captured.

6. **No Cross-Agent Clobbering**  
   If another agent/user is actively editing overlapping files, isolate scope and avoid touching their in-flight files.

---

## 2) Authoritative Sources (Read First, In Order)

Before implementing anything substantial, read:

1. `README.md` (repo root)
2. `agency-os/AGENTS.md`
3. `agency-os/memory/CONVERSATION_MEMORY.md`
4. `agency-os/memory/daily/<today>.md` and previous day if present
5. `agency-os/TASKS.md`
6. `agency-os/WORKLOG.md`
7. `agency-os/docs/overview/REMOTE_WORKSTATION_STARTUP.md`
8. `agency-os/docs/operations/end-of-day-checklist.md`
9. `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`
10. `agency-os/docs/operations/cursor-mcp-and-plugin-inventory.md`

If task-specific, also read the owner file first (for example, `agency-os/docs/operations/NEXTJS_INTERNAL_OPS_CONSOLE_V1.md` for ops-console changes).

---

## 3) Session Start Protocol (AO-RESUME Equivalent)

1. Ensure working directory is monorepo root.
2. Run:
   - `powershell -ExecutionPolicy Bypass -File .\scripts\ao-resume.ps1 -FullMainlineParity`
3. Confirm all of the following before coding:
   - Git not behind `origin/main`
   - working tree clean or intentionally scoped
   - `verify-build-gates` PASS
   - strict environment audit PASS (`AUDIT RESULT: PASS (no warnings)`)
4. Read `agency-os/.agency-state/open-tasks-snapshot.md` (or `agency-os/TASKS.md` if snapshot missing).
5. Report current state with:
   - completed context
   - current progress/risk
   - full open checklist items (`- [ ]`)
   - next concrete action

---

## 4) Execution Protocol (Build Without Conflicts)

### 4.1 Scope Lock
- Define the exact file set before edits.
- Do not touch files outside scope unless required by hard dependency.
- If unrelated changes are present, do not revert them.

### 4.2 Change Strategy
- Prefer minimal, reversible changes.
- Prefer extending existing scripts/contracts over creating parallel tooling.
- Add narrow checks that fail loudly with actionable messages.

### 4.3 Documentation Strategy
- Update owner docs, not mirrors.
- For new automation behavior, update:
  - owner runbook/spec
  - `WORKLOG.md` evidence block
  - optionally `TASKS.md` status only if DoD is truly reached

### 4.4 Evidence Discipline
- Every meaningful feature/fix must leave machine-runnable evidence:
  - command
  - expected output
  - generated report path (if any)
  - PASS/FAIL criteria

---

## 5) Git and Commit Policy

1. Use commit subject prefixes:
   - `[claude]`, `[cursor]`, `[codex]`
2. Default branch is `main` unless user explicitly asks for branch/PR flow.
3. Never use destructive git operations unless explicitly requested.
4. Do not amend commits unless explicitly required and safe.
5. Keep commits logically grouped and reviewable.
6. Do not commit generated local artifacts unless they are defined as canonical tracked outputs.

---

## 6) Generated Artifacts Policy

### Track in git only if canonical
- Example canonical tracked latest status:
  - `agency-os/reports/status/integrated-status-LATEST.md`

### Ignore local, rerunnable evidence artifacts
- Example:
  - `agency-os/reports/status/ops-console-smoke-*.json`

If a new generated artifact appears repeatedly and is not canonical:
1. add a narrow `.gitignore` pattern,
2. verify it does not hide important tracked outputs,
3. document why in `WORKLOG.md` when relevant.

---

## 7) Verification Matrix (Must Pass Before Claiming Done)

Pick applicable checks by scope:

### Core baseline
- `powershell -ExecutionPolicy Bypass -File .\scripts\verify-build-gates.ps1`

### Doc/governance-heavy changes
- `powershell -ExecutionPolicy Bypass -File .\scripts\doc-sync-automation.ps1 -AutoDetect`
- `powershell -ExecutionPolicy Bypass -File .\scripts\system-health-check.ps1`

### Ops-console line (example)
- `powershell -ExecutionPolicy Bypass -File .\scripts\ops-console-smoke.ps1 ...`
- Validate expected tenant reflection
- Validate workflow run minimum if required
- Validate audit event mapping for write actions

### Final status check
- `git status --short`
- ensure only intended changes remain

---

## 8) Closeout Protocol (AO-CLOSE Equivalent)

When user indicates shutdown/end-of-day:
1. Update `agency-os/WORKLOG.md` with concrete completed evidence.
2. Update `agency-os/memory/CONVERSATION_MEMORY.md` distilled context.
3. Run:
   - `powershell -ExecutionPolicy Bypass -File .\scripts\ao-close.ps1`
4. Ensure gates pass and push outcome is explicit.
5. Report:
   - today completed
   - today pending
   - linked checks PASS/FAIL evidence
   - top 3 priorities for next session

---

## 9) Multi-Agent Coexistence Rules

If another agent (for example Cursor/Codex/Claude parallel) is active:

1. Detect overlap via `git status` and file paths.
2. Do not edit in-flight files owned by the other agent unless user requests merge help.
3. Keep your scope isolated and commit only your scoped files.
4. If unexpected overlapping edits appear mid-task, pause and ask user how to proceed.

---

## 10) Security and Compliance Guardrails

- Never commit:
  - `.env` real values
  - private keys/tokens/JWT/PAT/passwords
  - machine-local config with sensitive data
- Redact sensitive values in evidence outputs.
- For auth/RLS/policy changes, require explicit risk statement + validation results.

---

## 11) Scalability and 30-Year Stability Rules

Design each change for long-term operations:

1. **Deterministic entry points**  
   Keep one clear startup and one clear closeout path.

2. **Mechanized checks over tribal knowledge**  
   If a human repeatedly verifies something, script it.

3. **Narrow interfaces**  
   Expose minimal API contracts and avoid backdoor write paths.

4. **Operational observability**  
   Every critical path should have traceable logs/events/reports.

5. **Low-friction extensibility**  
   Add flags/params/hooks, not forks and duplicate stacks.

6. **Deprecation discipline**  
   Mark old paths as deprecated, maintain compatibility windows, remove only with migration notes.

---

## 12) Forbidden Patterns

- Duplicating full policy text across multiple docs.
- Declaring success without running checks.
- Mixing unrelated changes in one commit.
- Editing secrets into tracked files.
- "Temporary" parallel runbooks that become permanent drift.

---

## 13) Claude Handover Prompt (Copy/Paste)

Use this as the first instruction in Claude when handing over:

```text
Follow `agency-os/docs/operations/CLAUDE_EXECUTION_BLUEPRINT_30Y.md` and `CLAUDE.md` as execution contract.
Before implementation, run AO-RESUME equivalent checks and read the listed SSOT files.
Execute only scoped changes, avoid touching in-flight files from other agents, and provide machine-runnable evidence for every completed step.
Do not claim completion unless validation commands pass and WORKLOG evidence is updated.
```

---

## 14) Maintenance of This Blueprint

- Owner: `agency-os/docs/operations/CLAUDE_EXECUTION_BLUEPRINT_30Y.md`
- Update when:
  - startup/closeout flow changes
  - git/governance policy changes
  - new recurring verification patterns are added
- Keep it compact, executable, and link-first to SSOT files.

