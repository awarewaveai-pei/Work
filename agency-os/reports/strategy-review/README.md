# Strategy Review Reports

Output directory for the [`strategy-review` skill](../../../.claude/skills/strategy-review/SKILL.md).

## What's in here

- **`INDEX.md`** — chronological log of every strategy review, latest first
- **`YYYY-MM-DD-{slug}.md`** — individual decision records produced by the skill

## What this is, what it isn't

| This is | This is NOT |
|---------|-------------|
| Working analysis of a strategic question | A finalized architectural decision (those go to `agency-os/docs/architecture/decisions/`) |
| Multi-angle subagent reasoning, captured for the record | A WORKLOG entry (those live in `agency-os/WORKLOG.md`) |
| A traceable history of considered-but-not-pursued options | A task tracker (those live in `agency-os/TASKS.md`) |
| The auditable input for ADR promotion | The ADR itself |

## Lifecycle

1. **Created** by `/strategy-review` skill — or, if doing it by hand, by following `templates/decision-record.md`
2. **Reviewed** by the human operator — does the recommendation match real-world judgment?
3. **Acted on** — operator either follows the recommendation or notes a deviation reason in WORKLOG
4. **Promoted (sometimes)** — if the decision is binding and architectural, it becomes a numbered ADR. Reference back here for the original analysis.
5. **Retained indefinitely** — strategy reviews accumulate institutional memory. Do not delete.

## When to delete a report

Almost never. Exceptions:

- The report contains a secret that was committed by mistake → redact and force-rewrite history (sparingly)
- The report was created in error / was a duplicate → remove via normal `git rm` with an explanatory commit
- 30-year horizon: at year 30+, review for archival to a separate long-term store

For everything else: keep the file. Future-you will thank present-you for the trail.

## Promotion to ADR

If a strategy review concludes with `proceed` AND meets one of these criteria, it should be promoted to an ADR:

- Touches manifest / shell SSOT
- Touches identity / authentication boundary
- Touches data system-of-record (e.g. Supabase as SoR)
- Touches MCP tool routing
- Touches tenant isolation model
- Reversibility: low AND cost-of-being-wrong: high

Promotion process:

1. Note the next free ADR number in `agency-os/docs/architecture/decisions/ADR_INDEX.md`
2. Create `NNN-short-title.md` in that directory using the existing ADR format
3. In the new ADR, link back to this strategy review file under "Context"
4. Update `ADR_INDEX.md` table
5. Run `verify-build-gates.ps1` to confirm the ADR check passes

The strategy review file stays here. The ADR is a separate, distilled artifact for the binding decision.

## Related

- Skill: `.claude/skills/strategy-review/SKILL.md`
- Skill README: `.claude/skills/strategy-review/README.md`
- ADR index: `../../docs/architecture/decisions/ADR_INDEX.md`
- WORKLOG: `../../WORKLOG.md`
- TASKS: `../../TASKS.md`
