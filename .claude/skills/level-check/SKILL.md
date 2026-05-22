---
name: level-check
description: Audit the current project against the 5 Levels of Claude Code framework and auto-fix any gaps found. Trigger on "check claude levels", "audit project structure", "am I at level 3", "level check", "5 levels check", "檢查 claude 層級", "盤點專案結構", "level 偵測", "我現在在哪個層級", "Claude Code 五個層級"
---

# Level Check

Audits the current project against the [5 Levels of Claude Code](https://codelove.tw/@tony/post/aWYABx) framework and fixes any gaps.

Designed to be called directly (`/level-check`) or embedded in other skills as a pre-flight check.

---

## Scan

Run this to get the current state:

```bash
echo "=== Claude Code Level Audit ===" && \
echo "L2 CLAUDE.md: $(wc -l < CLAUDE.md 2>/dev/null || wc -l < claude.md 2>/dev/null || echo 'MISSING') lines" && \
echo "L3 rules:     $(ls .claude/rules/*.md 2>/dev/null | wc -l | tr -d ' ') files" && \
echo "L3 skills:    $(ls .claude/skills/*/SKILL.md 2>/dev/null | wc -l | tr -d ' ') skills" && \
echo "L4 hooks:     $(python3 -c 'import json; d=json.load(open(\".claude/settings.json\")); print(\"configured\" if d.get(\"hooks\") else \"none\")' 2>/dev/null || echo 'no settings.json')" && \
echo "L5 agents:    $(ls .claude/agents/*/AGENT.md 2>/dev/null | wc -l | tr -d ' ') agents"
```

---

## Level definitions and fix actions

**Level 1 → 2 (Missing CLAUDE.md)**
CLAUDE.md is missing or named differently. Create one with: project name, current phase, directory map, 3–5 core rules, skills reference table. Target: 50–120 lines.

**Level 2 → 3 (Rules + Skills missing)**
- No `.claude/rules/` files: create `product.md`, `tech-stack.md`, `coding-style.md` populated from the project's existing docs
- No `.claude/skills/`: create starter `SKILL.md` files for the project's common workflows
- CLAUDE.md > 150 lines: extract non-dev content to `docs/` (see `DennisWei9898/claude-context-kit@context-optimizer`)

**Level 3 → 4 (No hooks)**
Add hooks to `.claude/settings.json`:
- `PreToolUse` on Edit/Write: warn if rules/ or skills/ is empty
- `Stop`: warn if CLAUDE.md has grown past 150 lines

Copy from `DennisWei9898/claude-dev-skills/.claude/settings.json` as a starting template.

**Level 4 → 5 (Orchestration)**
Only needed if the project involves parallel agents or complex multi-step pipelines. Not required for most projects.

---

## Output format

```
=== Level Audit: {project name} ===

Current level: L{N}

✅ L2 CLAUDE.md: {N} lines — healthy / ⚠ {N} lines — too long / ❌ missing
✅ L3 rules: {N} files / ❌ missing
✅ L3 skills: {N} skills / ❌ missing
✅ L4 hooks: configured / ⚠ no settings.json
➖ L5 agents: not needed

Gaps found: {N}
Actions taken: {list of fixes applied, or "none — project is at Level {N}"}
```

If gaps are found, fix them (with user confirmation for destructive changes) and re-run the scan to confirm the new level.

---

## Gotchas

- `claude.md` and `CLAUDE.md` are the same file on macOS — don't double-count or create both
- An empty `.claude/rules/` directory counts as Level 2, not Level 3 — check that files actually exist with content
- Hooks in `settings.json` that only have comments (no actual hook entries) don't count as Level 4
- CLAUDE.md line count alone doesn't determine level — a 200-line file that's all dev instructions is still valid Level 2; a 50-line file that's all product specs isn't
- Level 5 is rarely needed; don't push projects there just to hit the number
- `.claude/settings.local.json` is git-ignored by convention — hooks there are user-local, not shared; note this when advising on hook setup
