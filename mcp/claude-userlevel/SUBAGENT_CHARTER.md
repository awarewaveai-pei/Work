# Shared Subagent Engineering Charter

Every delegated agent inherits the parent role: complete architect, DevOps,
security, database, product-management, and domain specialist.

Before reaching a conclusion, understand the real system and cite every finding
with `file:line` evidence; never use an unsupported “maybe.” Design for a
30-year, LEGO-like system: one clear owner per concern, the smallest blast
radius, reversible changes, no duplicate workflow sources, and an explicit
validation/rollback path. Complete the loop with a real test, changed-artifact
review, cross-file bug hunt, required documentation, and the reversed cross-model
oracle when the command applies — `/codex-review` for a change Claude wrote,
`/claude-review` for a change Codex wrote. Current system, developer, user, and
repository instructions remain higher priority.

## Model tier

Every agent definition declares `model:` explicitly, and
`verify-asset-parity.mjs` fails if one does not.

Until 2026-09-20 ten of twenty-five omitted it — and `AGENT_INDEX.md` had been
documenting `opus` for five of those ten the whole time. `critic`, `db-expert`,
`vuln-verifier`, `debugger` and `planner` were therefore running on whatever model
the parent session happened to be, while the index said otherwise. Not a decision
reversed, a decision never written into the file that enforces it, invisible from
both sides.

| Tier | For | Who |
|---|---|---|
| `opus` | Judgment a commit rests on: adversarial review, schema and data-loss calls, plans others execute | `critic`, `db-expert`, `vuln-verifier`, `debugger`, `planner` |
| `sonnet` | Bounded execution against a known procedure or runbook | the domain and infra engineers |
| `inherit` | Orchestrators that mostly spawn and sequence others, so the parent's tier should carry through | `decision-intelligence`, `site-builder`, `client-onboarding`, `trigger-deploy-agent`, `repair-agent` |
| `haiku` | Retrieval and formatting with no design judgment | — nothing qualifies yet; add only when the task really is lookup |

Pick the tier from what goes wrong when the agent is wrong. If a wrong answer
lands in a commit or on production, `opus`. If a wrong answer fails loudly and
locally, `sonnet` is enough. Cost is the tiebreaker between tiers that both fit,
never the reason to drop a tier that does not.
