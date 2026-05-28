# strategy-review skill — architecture

Multi-angle strategic decision review. Spawns parallel `general-purpose` subagents for genuine context isolation between thinking modes.

## File layout

```
.claude/skills/strategy-review/
├── SKILL.md                              # Entry point / router (Claude Code reads this on trigger)
├── README.md                             # This file
├── modes/
│   ├── 01-four-role-collaboration.md     # Exploratory mode
│   ├── 02-red-blue-debate.md             # Pressure-test mode
│   └── 03-pre-mortem.md                  # Future-failure mode
├── roles/
│   ├── critical-thinker.md               # Find unjustified assumptions
│   ├── creative-thinker.md               # Find reframes / analogs
│   ├── communication-thinker.md          # Translate for stakeholders
│   └── systems-thinker.md                # Trace second-order effects
└── templates/
    └── decision-record.md                # Output format
```

Output (decision records) goes to `agency-os/reports/strategy-review/YYYY-MM-DD-{slug}.md`. The skill never writes to `agency-os/docs/architecture/decisions/` — ADR promotion is a manual step decided by the user.

## Why this design

### Why parallel subagents instead of single-prompt role-play

Single-prompt role-play (the講義 approach) puts all four "voices" in one context window. They contaminate each other: by role 3, the LLM has anchored on role 1's framing. Parallel subagents each get a fresh `general-purpose` context with one role file — independence is architectural, not aspirational.

### Why three modes instead of one

| Mode | Time orientation | Best for |
|------|------------------|----------|
| Four-Role Collaboration | present, exploratory | "what should I do?" |
| Red-Blue Debate | present, adversarial | "I'm leaning X — break it" |
| Pre-Mortem | future, retrospective | "I'm about to commit irreversibly — what would future-me regret?" |

They cover orthogonal cognitive blind spots. Running all three on a high-stakes decision is a feature, not redundancy.

### Why decision records instead of writing to ADR

ADRs (`agency-os/docs/architecture/decisions/`) are reserved for **irreversible architectural decisions**. Strategy reviews are broader — they include exploratory questions and reversible commitments. Polluting the ADR index with every "should I try X" review would dilute its signal. Decision records live separately; promotion to ADR is a deliberate second step.

## Extension protocol

### Adding a new mode

1. Create `modes/04-{slug}.md` following the structure of existing modes:
   - YAML frontmatter with `mode`, `schema_version`, `status`, `purpose`, `when_to_use`, `deprecated`
   - Sections: When to use / Required input / Execution / Quality bars / Run-time budget / Exit conditions
2. Add a row to **Mode selection** table in `SKILL.md`
3. Run `/verify` to confirm no conflicts
4. Update this README's "File layout" diagram

### Adding a new role

1. Create `roles/{slug}-thinker.md` following structure of existing roles:
   - YAML frontmatter with `role`, `schema_version`, `status`, `toolkit`, `deprecated`
   - Sections: Mindset / Toolkit / Your contribution / Style / What you are NOT / Output discipline
2. Reference the new role in any mode that should spawn it
3. Update this README's "File layout" diagram

### Removing a mode or role

Do NOT delete files immediately. Per 30-year operating discipline:

1. Set `status: deprecated` and `deprecated: YYYY-MM-DD` in the file's frontmatter
2. Set `replaced_by: <path>` if there's a successor
3. Remove the file from active **Mode selection** / role references in SKILL.md and modes
4. Keep the file on disk for 12 months (audit trail) — then delete with a one-line note in `agency-os/WORKLOG.md`

## Schema versioning

All files declare `schema_version`. Current version: **1**.

When making **breaking** changes (changing required output fields, restructuring frontmatter):
1. Increment all affected files' `schema_version`
2. Add a `migration_notes:` field to SKILL.md frontmatter
3. Add a row to the schema history table below

### Schema history

| Version | Date | Change | Migration |
|---------|------|--------|-----------|
| 1 | 2026-05-07 | Initial release | n/a |

## Testing the skill

Lightweight self-test (no real decision needed):

```
"Run strategy-review in four-role mode on this hypothetical decision: should I migrate from Postgres to Cassandra for the agency-os DB? Goal: reduce read latency. Constraint: must preserve RLS. Reversibility: medium."
```

Expected behavior:
1. Skill triggers (you'll see "strategy-review" mentioned)
2. Four parallel subagents spawn
3. Decision record appears at `agency-os/reports/strategy-review/<today>-postgres-to-cassandra.md`
4. INDEX.md gets a new row

If any of those steps fail → run `/verify` and check this README's "Common failure modes" below.

## Common failure modes

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| All four subagents return identical findings | Role files were concatenated instead of passed individually | Re-spawn with one role file per subagent |
| Decision record missing `bias_check` or `must_investigate` | Subagents skipped optional fields | Tighten directive: mark fields as required |
| INDEX.md not updated | Main agent forgot the post-write append | Add to skill's exit checklist |
| Skill triggers on engineering questions | Trigger phrases too broad | Refine triggers in SKILL.md frontmatter; redirect to `feature-plan` |
| Subagents hallucinate context | Pre-flight context loading skipped | Re-read SKILL.md §Pre-flight |

## Non-goals

- This skill does NOT replace `feature-plan` for engineering work
- This skill does NOT auto-promote decisions to ADRs (manual step)
- This skill does NOT write to WORKLOG.md or TASKS.md directly (AO-CLOSE handles)
- This skill does NOT execute decisions — only documents them

## Related

- `agency-os/AGENTS.md` — operating rules
- `agency-os/docs/operations/CLAUDE_EXECUTION_BLUEPRINT_30Y.md` — 30-year stability
- `agency-os/docs/architecture/decisions/ADR_INDEX.md` — promotion target for ADR-worthy reviews
- `agency-os/reports/strategy-review/` — output location
- `agency-os/reports/strategy-review/INDEX.md` — log of all reviews
