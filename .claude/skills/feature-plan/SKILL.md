---
name: feature-plan
description: Plan a new feature: analyze requirements, break down technical tasks, assess impact, update plan.md. Trigger on "plan a feature", "new feature", "I want to add", "feature design", "規劃功能", "新功能", "我想加一個", "功能設計", "幫我規劃". Runs a 5-level Claude Code check before starting.
---

# Feature Plan

Turns a vague feature request into an actionable development plan. Saves to `docs/feature-{name}.md` and updates `plan.md`.

**Source:** Adapted from the TrueRate project workflow. Level-check integration based on [5 Levels of Claude Code](https://codelove.tw/@tony/post/aWYABx) and `DennisWei9898/claude-context-kit`.

---

## Pre-flight: Level check

Before planning, run a quick audit:

```bash
echo "L2:$(wc -l < CLAUDE.md 2>/dev/null || echo 'MISSING')" && \
echo "L3-rules:$(ls .claude/rules/*.md 2>/dev/null | wc -l | tr -d ' ')" && \
echo "L3-skills:$(ls .claude/skills/*/SKILL.md 2>/dev/null | wc -l | tr -d ' ')"
```

If CLAUDE.md is missing or > 150 lines, or if `.claude/rules/` is empty: fix the gap first (see `/level-check`), then proceed. A project below Level 3 means the feature plan will be written without proper context — the plan is only as good as the project's rules files.

---

## What to produce

Read these before planning (they exist in any well-structured project):
- `CLAUDE.md` — current phase, core rules, tech stack
- `plan.md` — current sprint state and backlog
- Any SDD or design doc
- `.claude/rules/product.md` — constraints that affect code decisions

Then produce a feature design document at `docs/feature-{name}.md` with:

**Requirements clarity**
- What problem does this solve, and for whom?
- What does success look like? (measurable if possible)
- What's the smallest version that delivers the core value?
- What's explicitly out of scope for this iteration?

**Technical breakdown**
List tasks by layer (frontend / backend / DB / infra / other). For each task: what changes, and what size (S = <1 day, M = 1–2 days, L = 3+ days).

**Impact assessment**
- Which existing systems are touched? (auth, points, DB schema, SEO, etc.)
- Which docs need updating after implementation? (SDD, rules files)
- Any irreversible changes? (DB migrations, API contract changes)

**Update plan.md**
Add the task list to the current sprint or backlog. Mark with `[ ]` checkboxes.

---

## Constraints

- Minimum viable scope first — ask "what's the smallest version?" before designing the full feature
- Flag any irreversible decisions (DB schema changes, breaking API changes) explicitly
- If the feature requires modifying a core rule (e.g. changing how points work), update `.claude/rules/product.md` as part of the plan
- Don't start implementation — this skill produces a plan, not code

---

## Gotchas

- If `plan.md` doesn't exist yet, create it with a minimal structure before appending tasks
- "New feature" requests often contain multiple independent features — decompose before estimating
- DB migrations are L tasks even if the schema change is one line (migration testing adds time)
- If the feature touches auth or payments, add a security review step to the task list
- A feature that affects SEO-critical pages (SSG/ISR) needs a cache invalidation step in the plan
- When the user says "simple" or "quick" — ask what success looks like first, then validate the size claim
