---
name: qa-review
description: Run QA testing on a local dev environment and produce a structured report. Trigger on "run QA", "test the app", "check for bugs", "QA review", "test before deploy", "跑 QA", "測試功能", "找 bug", "上線前測試", "QA 報告". Runs a 5-level Codex check before starting.
---

# QA Review

Runs systematic QA testing on a local development environment and produces a structured report saved to `reports/`.

**Source:** Adapted from the TrueRate project workflow. Level-check integration based on [5 Levels of Codex](https://codelove.tw/@tony/post/aWYABx) and `DennisWei9898/Codex-context-kit`.

---

## Pre-flight: Level check

```bash
echo "L2:$(wc -l < AGENTS.md 2>/dev/null || echo 'MISSING')" && \
echo "L3-rules:$(ls .Codex/rules/*.md 2>/dev/null | wc -l | tr -d ' ')" && \
echo "L3-skills:$(ls .Codex/skills/*/SKILL.md 2>/dev/null | wc -l | tr -d ' ')"
```

If the project is below Level 3, note it in the QA report under "Environment" and recommend running `/level-check` after QA. Don't block testing.

---

## Confirm the environment is running

```bash
curl -sf http://localhost:3000 > /dev/null && echo "frontend: ok" || echo "frontend: DOWN"
curl -sf http://localhost:8080/health > /dev/null && echo "backend: ok" || echo "backend: DOWN"
```

Adapt the ports/health endpoint to the project's actual setup (check `AGENTS.md` or `docker-compose.yml`). If services are down, tell the user what to start — don't silently skip testing.

---

## What to test

Read `AGENTS.md` and the SDD to understand what the project actually does. Then test the core user flows end to end, not random features. Typical flow structure:

1. **Entry point** — does the app load? Are there console errors?
2. **Core read flows** — the main thing users come to see/find
3. **Auth** — login, logout, session persistence
4. **Core write flows** — the main thing users create/submit
5. **Gating / access control** — what requires login, what requires specific state
6. **Mobile / responsive** — critical paths at 375px width
7. **Regression check** — console errors, 5xx responses, broken images

For each failure: record the exact steps to reproduce, not just "X doesn't work".

---

## Report format

Save to `reports/qa-report-{YYYY-MM-DD}.md`:

```markdown
# QA Report — {date}

## Environment
- Frontend: {URL} — {status}
- Backend: {URL} — {status}
- Codex Level: L{N} ({gaps if any})

## Summary
- Tested: {N} flows
- Pass: {N} ✅ / Fail: {N} ❌ / Skip: {N} ⏭

## Failures (fix these first)
| # | Flow | What broke | Severity | Repro steps |
|---|------|-----------|----------|-------------|

## Passes
(brief list)

## Recommendations
```

Severity: 🔴 Critical (core flow broken) / 🟡 Major (workaround exists) / 🟢 Minor (visual/UX)

---

## Constraints

- Test the actual app — don't read code and assume it works
- If a flow can't be tested because auth is required and no test account exists, mark it ⏭ and note the blocker
- Don't fix bugs during QA — record them and let the user prioritize
- Save the report even if everything passes — a green report is still useful history

---

## Gotchas

- Frontend at 3000 and backend at 8080 are common defaults but not universal — always verify from `docker-compose.yml` or README
- "No console errors" requires opening DevTools — don't assume clean just because the page loads
- Auth flows often behave differently after a cold start vs. an existing session — test both if OAuth is involved
- Gated content (paid features, point-locked content) needs a test account with the right state to verify correctly
- Mobile testing at 375px often reveals overflow issues that desktop doesn't show — always check at least one critical page
- If `reports/` directory doesn't exist, create it before saving the report
- QA found zero bugs on a complex feature usually means something wasn't tested, not that everything works
