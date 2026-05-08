# Strategy Review Index

Chronological log of all strategy reviews. Latest at top.

| Date | Slug | Mode(s) | Recommendation | Promoted to ADR? | Link |
|------|------|---------|----------------|------------------|------|
| 2026-05-08 | adopt-hermes-agent | four-role-collaboration | rejected (operator final 2026-05-08; analytical was proceed-with-modifications) | no | [link](2026-05-08-adopt-hermes-agent.md) |

---

## How to append

After each `/strategy-review` run, the skill (or you, if doing manually) appends one row above this divider in **most-recent-first order**:

```
| YYYY-MM-DD | adopt-hermes-agent | four-role + red-blue | reject | no | [link](2026-05-07-adopt-hermes-agent.md) |
```

Field conventions:

- **Date**: ISO format, decision-date (when the review was completed, not when implementation finished)
- **Slug**: kebab-case, 3-5 words, matches filename
- **Mode(s)**: comma-separated if multiple modes were run sequentially
- **Recommendation**: `proceed` / `proceed-with-modifications` / `proceed-with-monitoring` / `defer-pending-investigation` / `reject`
- **Promoted to ADR?**: `no`, or ADR number like `ADR-007`
- **Link**: relative link to the report file

## What this index is for

- Quick scan: "have I already reviewed this question?"
- Audit trail: "why did we reject Hermes 6 months ago?"
- Pattern detection: are we deferring too often? Are red-blue debates flipping our gut calls? Use this to calibrate.

## Schema version

Current: **1** — see `.claude/skills/strategy-review/README.md` §Schema history.
