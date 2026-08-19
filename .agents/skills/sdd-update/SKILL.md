---
name: sdd-update
description: Sync the system design document (SDD or equivalent) with recent code changes. Trigger on "update sdd", "sync design doc", "update system design", "doc is out of date", "update API doc", "更新 sdd", "同步設計文件", "技術文件過時了", "更新 API 文件", "sdd 跟程式碼不一致". Runs a 5-level Codex check before starting.
---

# SDD Update

Keeps the system design document in sync with the actual code. Works with any design doc (`sdd.md`, `design.md`, `architecture.md`, `ARCHITECTURE.md`, or equivalent).

**Source:** Adapted from the TrueRate project workflow. Level-check integration based on [5 Levels of Codex](https://codelove.tw/@tony/post/aWYABx) and `DennisWei9898/Codex-context-kit`.

---

## Pre-flight: Level check

```bash
echo "L2:$(wc -l < AGENTS.md 2>/dev/null || echo 'MISSING')" && \
echo "L3-rules:$(ls .Codex/rules/*.md 2>/dev/null | wc -l | tr -d ' ')" && \
echo "L3-skills:$(ls .Codex/skills/*/SKILL.md 2>/dev/null | wc -l | tr -d ' ')" && \
ls sdd.md design.md architecture.md ARCHITECTURE.md 2>/dev/null | head -1
```

If no design doc is found, ask the user which file to treat as the SDD before proceeding.

If the project is below Level 3, note it but don't block — updating the design doc is itself a Level 2→3 improvement.

---

## Locate what changed

Find the design doc and understand the scope of recent changes. Look at:

```bash
git diff --name-only HEAD~5 HEAD 2>/dev/null | head -30
git log --oneline -10 2>/dev/null
```

Or ask the user: which feature/module was just implemented?

---

## What to update

Read the SDD and the code side-by-side. Only update sections where the code actually changed. Common update points:

| Code change | SDD section to update |
|-------------|----------------------|
| New API endpoint added | API design / endpoint list |
| DB schema column added/removed | Data model / entity definitions |
| Auth or permission logic changed | Auth flow / security notes |
| New service or module created | Architecture diagram / module list |
| Points/scoring rule changed | Business rules / scoring section |
| AI prompt modified | AI pipeline / prompt section |
| Phase scope changed (✅/⏸) | MVP scope / roadmap section |

**Rule:** If the code and SDD conflict, the code wins. Update the SDD to match code, not vice versa.

---

## Version stamp

After updating, bump the version in the SDD header:

```
> Version: v{old + 0.1}
> Updated: {today's date}
> Changes: {one-line summary of what was updated}
```

---

## Check `.Codex/rules/` for drift

If `.Codex/rules/product.md` or `.Codex/rules/tech-stack.md` reference the changed areas, check them for consistency too. Rules files and the SDD should not contradict each other.

---

## Constraints

- Only update sections that actually changed — don't touch unrelated sections
- Remove deprecated endpoints/fields entirely — don't add "deprecated" comments
- Never run git commands after updating — the user decides when to commit
- Don't update `settings.json` or `settings.local.json`

---

## Gotchas

- If the SDD has a table of contents with anchor links, check that headings still match after editing
- DB schema in SDD often drifts faster than API docs — check both when in doubt
- "Update the SDD" often means "and also check if the rules files are still accurate" — do both
- If the SDD is > 500 lines with no table of contents, suggest adding one (but don't do it without asking)
- After adding a new API endpoint to the SDD, also check if `.Codex/rules/tech-stack.md` has a key-endpoints section that needs updating
- Phase markers (✅ / ⏸) in the SDD should reflect actual code state, not the plan — if something was planned but not implemented, it stays ⏸
