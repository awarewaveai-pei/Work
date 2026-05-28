Trigger the **decision-intelligence** agent for a structured multi-agent decision review.

This is the slash-command entry point for the `decision-intelligence` agent (`.claude/agents/decision-intelligence.md`) which runs the `ai-decision-intelligence` skill.

## Usage

Type `/decide` followed by your decision question (Chinese or English both work):

- `/decide should I use Sidekiq, GoodJob, or Solid Queue?`
- `/decide compare Snowflake vs BigQuery vs Redshift for our analytics`
- `/decide 為管理 30 個客戶 WP 站的 1-3 人代理商，在 Hetzner SG/EU 與客戶自有主機混合環境下選擇統一站台管理平台`
- `/decide should we build our own AI pipeline or use an existing platform`
- `/decide review my microservices architecture`
- `/decide rollout strategy for our new auth system`

**Language:** The output language matches the question language. Chinese question → Chinese report. English question → English report.

## What happens

1. Agent activates and reads `agents/topic-analyzer.md`
2. Classifies the decision (tool_selection / architecture_review / implementation / business_strategy)
3. Asks at most 3 clarifying questions if context is missing
4. Assigns fixed + dynamic agents and specialists
5. Runs the full 19-stage pipeline:
   - Stage 1-5: Classification, clarification, candidate discovery
   - Stage 6-7: Structured debate (Advocates R1 + R2 cross-exam)
   - Stage 8-9: Specialist reviews + Skeptic pass
   - Stage 10-11: Tradeoff matrix + Judge synthesis
   - Stage 12: **Pre-mortem** — assumes winner fails 18 months from now; finds what the debate missed
   - Stage 13: Confidence check (recalibrated after pre-mortem; POC protocol if needed)
   - Stage 14: Final recommendation (primary + why-not + switch conditions)
   - Stage 15-17: Installation plan + rollout plan + risk register (augmented by pre-mortem)
   - Stage 18: Observability plan (success metrics + pre-mortem early warnings)
   - Stage 19: Decision review cadence (when to revisit)
   - + ADR skeleton for long-term decisions
6. Outputs a complete decision document: readable in 5-15 minutes, TL;DR in 30 seconds

## When to use this vs. strategy-review

| Use `/decide` when | Use `/strategy-review` when |
|-------------------|----------------------------|
| Technical tool selection (A vs B vs C) | Exploratory strategic brainstorm |
| Architecture review ("is this design good?") | Four-role collaboration |
| Implementation / rollout planning | Red-blue adversarial pressure test |
| Build vs buy with technical depth needed | **Pre-mortem on an already-made decision** |
| Business strategy with structured tradeoffs | Quick 3-5 agent perspective |
| You want Installation + Rollout + Observability plans | Decision is primarily non-technical |

Note: `/decide` now includes its own Pre-mortem stage (Stage 12). Use `/strategy-review` pre-mortem only for decisions already committed to (not under evaluation).

## Output format

The final document includes:
1. TL;DR (30-second read, includes pre-mortem primary risk)
2. Recommendation + why-not-others + switch conditions
3. Tradeoff Matrix (scored comparatively)
4. **Pre-mortem Analysis** (Stage 12 — what would kill this decision 18 months from now)
5. Installation Plan (phased, executable)
6. Rollout Plan (wave-based)
7. Risk Register (augmented by pre-mortem findings)
8. Observability Plan (metrics, alerts, instrumentation + pre-mortem early warnings)
9. Decision Review Cadence (30/90/365 day checkpoints)
10. ADR Skeleton (for governance tracking)
11. Full Debate Transcript (collapsible)

## Agent roster

**Fixed (always run):** Topic Analyzer, Research Agent, Advocates (1 per candidate), Security Reviewer, DevOps Reviewer, Cost Reviewer, Product Reviewer, Skeptic, Judge, **Pre-mortem**, Installation Planner, Rollout Planner

**Dynamic (added by topic):**
- Customer Voice — when decision affects end users or has migration impact
- Legal Reviewer — when SaaS contracts, licensing, or data rights are involved
- AI/ML Specialist — when AI/LLM/RAG is involved
- FinOps Specialist — when cloud infrastructure cost is a factor
- Compliance Specialist — when GDPR/HIPAA/SOC2 is in scope
- Scalability Specialist — when 10k+ user scale is relevant
- WordPress Specialist — for WP/WooCommerce decisions
- (+ more in specialists/)

## Auto-save (always runs after Stage 19)

After the full report is displayed, the agent automatically:

1. Saves the complete report to `agency-os/reports/decisions/YYYY-MM-DD-<slug>.md`
2. Appends one line to `agency-os/reports/decisions/INDEX.md`
3. Confirms the saved path in the conversation (in the same language as the document)

You do **not** need to ask for this — it happens automatically every run.

To browse past decisions:
- Open `agency-os/reports/decisions/INDEX.md` for a summary table
- Open the individual `.md` file for the full report

## Constraints

- Never edits production code or infrastructure
- Never commits or pushes git changes (leave that to AO-CLOSE)
- Never includes secrets, tokens, or PII in output
- ADR skeleton is a draft only — file manually to `docs/architecture/decisions/`

## See also

- `.claude/agents/decision-intelligence.md` — agent definition
- `.claude/skills/ai-decision-intelligence.skill` — full skill (ZIP)
- `agency-os/docs/architecture/decisions/ADR_INDEX.md` — where to file resulting ADRs
