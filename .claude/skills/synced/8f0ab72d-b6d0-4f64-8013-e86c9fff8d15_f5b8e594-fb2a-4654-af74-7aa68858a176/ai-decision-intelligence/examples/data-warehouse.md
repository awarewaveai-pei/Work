# Example 3: Data Warehouse Selection (Snowflake vs BigQuery vs Databricks)

A condensed example demonstrating the skill on a high-stakes infrastructure decision.

---

## User query

> "We're consolidating our analytics. Should we go with Snowflake, BigQuery, or Databricks? We're a Series B startup, 50 engineers, currently on Postgres + dbt + Looker, processing about 2TB/month new data. Budget matters but capability matters more."

---

## Stage 1: Topic Analyzer

```json
{
  "topic_type": "tool_selection",
  "primary_decision": "Select a primary data warehouse for a Series B startup with 50 engineers, 2TB/month new data, existing dbt + Looker stack, capability-prioritized over cost",
  "decision_dimensions": [
    "query_performance_at_scale",
    "cost_at_current_and_projected_volume",
    "ecosystem_integration",
    "ml_workload_support",
    "operational_burden",
    "vendor_lock_in",
    "team_skills_required"
  ],
  "complexity_score": 0.75,
  "domain_signals": ["data", "analytics", "warehouse"]
}
```

**Specialists triggered:** `data.md`, `finops.md`, `scalability.md`

---

## Stage 4: Candidates

| ID | Name | Type | One-liner |
|----|------|------|-----------|
| C1 | Snowflake | SaaS | Cloud DW pioneer; vendor-managed; pure SQL focus |
| C2 | BigQuery | SaaS | Google Cloud serverless DW; pay-per-query model |
| C3 | Databricks | SaaS | Lakehouse architecture; SQL + Spark + ML |
| C4 | Self-host ClickHouse | OSS self-host | OSS columnar DB; you operate |
| C5 | Stay on Postgres + scale | Build/extend | Use Postgres + extensions until truly need a DW |
| C6 | Redshift | SaaS | AWS-native DW; older architecture, strong ecosystem if AWS-heavy |

`intentionally_excluded`: Firebolt (smaller adoption), Synapse (Azure-specific without context signal), Druid (different use case)

---

## Stage 7: Cross-Exam Highlights

### C5 (Postgres) → all DW advocates:

> "Premature warehouse syndrome. 2TB/month new data is well within Postgres's range with proper indexing and read replicas — many Series B companies run analytics on Postgres until well past Series C. The advocates are pitching tools that solve problems you don't yet have. Cost: $20k-100k/year base for Snowflake/BQ; you could buy 3 senior engineers' time on Postgres optimization for that. The right question isn't 'which DW' — it's 'are we sure we need one?'"

### C1 (Snowflake) defense:

> **Type: Reframe.** "The 'do you need a DW' question is fair, but reframes the user's stated context: they're 'consolidating analytics' which implies multiple sources, dbt models running into Postgres scale issues, and Looker performance complaints they didn't fully detail. Postgres works for transactional + light analytical workloads; it doesn't work well for the 'data team and BI tool both querying overlapping models' pattern that 50-engineer companies typically have. Snowflake separates compute from storage — the architectural primitive that makes multi-team data work without the noisy-neighbor problem of shared Postgres."

### C2 (BigQuery) → C1 (Snowflake):

> "Snowflake's 'easy to use' positioning hides the cost trap: warehouses left running, queries scanning more than needed, no built-in cost controls without buying additional features. BigQuery's pay-per-query model is more transparent — you see exactly what each query costs, and it's harder to surprise yourself. For a Series B with 50 engineers (many of whom will write ad-hoc queries), the predictability matters more than 'easy admin UI.'"

### C3 (Databricks) → C1 and C2:

> "Both Snowflake and BigQuery advocates ignored the ML question. The user said 'capability matters' — Series B companies inevitably need ML on their warehouse data within 18 months (recommendations, churn prediction, fraud detection). Snowflake and BigQuery both bolt ML on; Databricks was built for it. Choosing C1 or C2 means you'll be replatforming for ML in 2 years."

---

## Stage 8: Reviewer Highlights

### Cost Reviewer (3-yr TCO at projected growth):

| Candidate | 1yr TCO | 3yr TCO | Note |
|-----------|---------|---------|------|
| C1 Snowflake | $30k-80k | $150k-400k | Compute-heavy growth; warehouse sprawl risk |
| C2 BigQuery | $15k-60k | $80k-300k | Per-query model; depends heavily on query patterns |
| C3 Databricks | $40k-100k | $180k-500k | Higher base; ML workloads add dimension |
| C4 ClickHouse | $5k-15k | $25k-80k | Cheapest licensing; expensive in engineering time |
| C5 Postgres+ | $5k-10k | $15k-30k | Until you can't; replatform cost not in this estimate |
| C6 Redshift | $25k-70k | $130k-350k | Cluster-based pricing; less flexible than competitors |

### Specialist (data.md) summary:

- C1: Best out-of-box developer experience; mature dbt integration; weak on ML
- C2: Strong if all GCP; weaker if multi-cloud; serverless is good and bad (no warehouse to forget to turn off, but also no clear cost ceiling)
- C3: Strongest for ML futures; SQL experience is improving but not yet matched to C1/C2
- Postgres has hit limits at 50-engineer scale historically; not zero-risk

### Skeptic findings:

- C1 (Snowflake): Vendor lock-in via proprietary functions and storage format; switching cost rises over time. Acquisition risk: Snowflake is established but vulnerable to acquisition.
- C2 (BigQuery): GCP lock-in; cross-cloud egress costs for hybrid scenarios.
- C3 (Databricks): Spark-centric architecture; pure SQL workloads less optimized; pricing complexity.
- C5 (Postgres): "Will hit a wall" is a known pattern; the question is when.

**Cross-candidate pattern:** "All three SaaS DWs lock you in via proprietary SQL extensions and cost models that change behavior. The 'open table format' (Iceberg, Delta) era is reducing this but not eliminated."

---

## Stage 11: Judge

```json
{
  "ranked_candidate_ids": ["C1", "C3", "C2", "C5", "C6", "C4"],
  "primary": {
    "candidate_id": "C1",
    "reasons": [
      "Best operational fit for the team's current shape: dbt + Looker integrate maturely; team can be productive on day 1; vendor handles the operational burden during a high-growth phase where engineering attention is scarce.",
      "Multi-cloud flexibility: works on AWS, GCP, Azure; Series B companies often shift cloud strategies as they grow; not pinning the warehouse to one cloud is hedging worth the marginal cost premium.",
      "Mature ecosystem: most data tooling supports Snowflake first; hiring for Snowflake-experienced engineers is easier than for the alternatives at Series B salaries."
    ]
  },
  "rejections": [
    {
      "candidate_id": "C3",
      "reason": "Strongest ML story but SQL maturity gap means current data team productivity drops vs Snowflake; ML 'inevitability' isn't certain in 18-month horizon",
      "could_be_right_if": "User has concrete ML roadmap with 6-month horizon, OR data team includes Spark experience"
    },
    {
      "candidate_id": "C2",
      "reason": "Strong choice if all-GCP and team comfortable with serverless cost model; user didn't specify cloud, suggesting multi-cloud or AWS-default — Snowflake's portability matters",
      "could_be_right_if": "User confirms GCP-first strategy"
    },
    {
      "candidate_id": "C5",
      "reason": "Skeptic's 'premature warehouse' challenge is real, but user's context (50 engineers, multi-source consolidation) suggests they're at or past the inflection point; defending status quo is harder than the advocate framed it",
      "could_be_right_if": "User clarifies that 'consolidating analytics' is a future plan, not current pain — DW selection might be premature by 6-12 months"
    }
  ],
  "confidence": 0.65,
  "confidence_basis": "Confidence is moderate (not high) because: (1) user said 'capability matters' but didn't specify which capabilities — ML inclusion would tilt toward C3; (2) cloud strategy unclear and matters significantly; (3) the 'premature warehouse' question is real and not fully resolvable without more user context.",
  "switch_conditions": [
    "If user's 18-month roadmap includes ML/AI features, re-evaluate C3 (Databricks)",
    "If user is GCP-first or has heavy GCP usage, re-evaluate C2 (BigQuery)",
    "If user clarifies that 'consolidating' is aspirational and current pain is contained, consider deferring decision and optimizing Postgres for 6-12 more months"
  ],
  "open_questions": [
    "What cloud(s) is the team primarily on? (Materially affects C1/C2 choice)",
    "Is there a concrete ML roadmap with timeline? (Tilts to C3 if yes)",
    "What's the actual current Postgres pain — slow Looker dashboards, dbt build times, lock contention? (Tells us if DW is solving a real problem)",
    "What's the cost ceiling we're targeting? '$X/month' helps narrow choices"
  ],
  "recency_bias_check": "Confirmed — re-ordered candidates and Snowflake still wins on operational fit, but the second-place candidate shifted between C2 and C3 depending on order, confirming those two are closer than appears."
}
```

---

## TL;DR

**Recommendation:** Snowflake — with caveats

**Why:** Best operational fit for your team's current shape (dbt + Looker integrate maturely; vendor handles ops burden). Multi-cloud flexibility hedges your future cloud strategy. Hiring market is strongest.

**Watch for:** Three real "switch condition" risks:
1. If your 18-month roadmap includes ML/AI, Databricks becomes more competitive
2. If you're GCP-first, BigQuery may be the better long-term answer
3. If "consolidating analytics" is more aspirational than current pain, you may be 6-12 months early — Postgres optimization could buy time

**Confidence: 0.65** — moderate, NOT high. There are real open questions about your context that would tighten this. Specifically: cloud strategy, ML roadmap, and whether current Postgres pain is concrete or anticipated. **Pilot recommendation:** Run a 30-day side-by-side trial: 1 dbt project on Snowflake + same project on BigQuery. Measure query latency, dev experience, and observed cost. The observed data resolves several of the open questions.

This is a case where the system honestly says "I have a recommendation but it's not airtight; here's how to get more confident."
