Trigger the **decision-intelligence** agent for a structured multi-agent decision review.

This is the slash-command entry point for the `decision-intelligence` agent (`.claude/agents/decision-intelligence.md`) which runs the `ai-decision-intelligence` skill.

## Usage

Type `/decide` followed by your decision question:

- `/decide should I use Sidekiq, GoodJob, or Solid Queue?`
- `/decide compare Snowflake vs BigQuery vs Redshift for our analytics`
- `/decide help me choose a WordPress management approach for 30 client sites`
- `/decide should we build our own AI pipeline or use an existing platform`
- `/decide review my microservices architecture`
- `/decide rollout strategy for our new auth system`

## What happens

1. Agent activates and reads `agents/topic-analyzer.md`
2. Classifies the decision (tool_selection / architecture_review / implementation / business_strategy)
3. Asks at most 3 clarifying questions if context is missing
4. Assigns fixed + dynamic agents and specialists
5. Runs the full 18-stage pipeline:
   - Stage 1-5: Classification, clarification, candidate discovery
   - Stage 6-7: Structured debate (Advocates R1 + R2 cross-exam)
   - Stage 8-9: Specialist reviews + Skeptic pass
   - Stage 10-11: Tradeoff matrix + Judge synthesis
   - Stage 12: Confidence check (POC protocol if needed)
   - Stage 13: Final recommendation (primary + why-not + switch conditions)
   - Stage 14-16: Installation plan + rollout plan + risk register
   - Stage 17: Observability plan (how to detect success/failure)
   - Stage 18: Decision review cadence (when to revisit)
   - + ADR skeleton for long-term decisions
6. Outputs a complete decision document: readable in 5-15 minutes, TL;DR in 30 seconds

## When to use this vs. strategy-review

| Use `/decide` when | Use `/strategy-review` when |
|-------------------|----------------------------|
| Technical tool selection (A vs B vs C) | Exploratory strategic exploration |
| Architecture review ("is this design good?") | Four-role collaboration brainstorm |
| Implementation / rollout planning | Red-blue adversarial pressure test |
| Build vs buy with technical depth needed | Pre-mortem for irreversible decisions |
| Decision needs Installation + Rollout + Observability plans | Decision is primarily non-technical |
| You want a detailed, staged debate with 8-13 agents | You want a quick 3-5 agent structured perspective |

For highest-stakes decisions, run `/decide` first (for technical depth), then `/strategy-review` pre-mortem (for failure mode analysis).

## Output format

The final document includes:
1. TL;DR (30-second read)
2. Recommendation + why-not-others + switch conditions
3. Tradeoff Matrix (scored comparatively)
4. Installation Plan (phased, executable)
5. Rollout Plan (wave-based)
6. Risk Register
7. Observability Plan (metrics, alerts, instrumentation)
8. Decision Review Cadence (30/90/365 day checkpoints)
9. ADR Skeleton (for governance tracking)
10. Full Debate Transcript (collapsible)

## Agent roster

**Fixed (always run):** Topic Analyzer, Research Agent, Advocates (1 per candidate), Security Reviewer, DevOps Reviewer, Cost Reviewer, Product Reviewer, Skeptic, Judge, Installation Planner, Rollout Planner

**Dynamic (added by topic):**
- Customer Voice — when decision affects end users or has migration impact
- Legal Reviewer — when SaaS contracts, licensing, or data rights are involved
- AI/ML Specialist — when AI/LLM/RAG is involved
- FinOps Specialist — when cloud infrastructure cost is a factor
- Compliance Specialist — when GDPR/HIPAA/SOC2 is in scope
- Scalability Specialist — when 10k+ user scale is relevant
- WordPress Specialist — for WP/WooCommerce decisions
- (+ more in specialists/)

## Constraints

- Never edits production code or infrastructure
- Never commits or pushes git changes
- Never includes secrets, tokens, or PII in output
- ADR skeleton is a draft only — file manually to `docs/architecture/decisions/`
- WORKLOG entry is provided as a block to paste — not written automatically

## See also

- `.claude/agents/decision-intelligence.md` — agent definition
- `.claude/skills/ai-decision-intelligence.skill` — full skill (ZIP)
- `agency-os/docs/architecture/decisions/ADR_INDEX.md` — where to file resulting ADRs
