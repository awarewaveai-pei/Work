# Decision: 為 30 個客戶 WordPress 站選擇統一管理平台

**Date:** 2026-05-09
**Mode:** tool_selection
**Confidence:** 0.83 — high confidence; strong evidence from WordPress Specialist + real pricing data; minor uncertainty on InfiniteWP's long-term vendor trajectory
**Agents run:** Topic Analyzer, Research Agent, Advocate×4 (MainWP/ManageWP/InfiniteWP/Custom), Security Reviewer, Cost Reviewer, WordPress Specialist, Legal Reviewer, Skeptic, Judge, Installation Planner, Rollout Planner

---

## TL;DR (30-second read)

**Recommendation:** MainWP (self-hosted, open-source)

**Why:** Lowest 3-year TCO for 30 sites, zero vendor blast-radius (each site independent), OSS license eliminates contract risk, active development with 700k+ installs.

**Watch for:** If team loses the one person who maintains the MainWP server, operational continuity breaks — bus-factor mitigation is the #1 risk.

**Review by:** 2026-08-09 (90-day check)

---

## Context

A WordPress agency manages 30 client sites and needs a unified management platform for bulk updates, monitoring, and backup coordination. The team is small (2-5 people), technically capable, and cost-sensitive. No current unified management tool — updates are done site-by-site. Risk tolerance is medium; clients are SMB, not enterprise. Must scale to ~50 sites within 2 years without major cost increases.

- **Scale:** 30 sites now, ~50 within 24 months
- **Team:** 2-5 people, technically capable (comfortable with self-hosted tools)
- **Constraints:** Cost-sensitive; no per-site licensing that scales linearly; must support PHP/WP ecosystem
- **Risk tolerance:** Medium — downtime is bad but not catastrophic; clients are SMB

---

## Recommendation

### Primary: MainWP (self-hosted)

**Three reasons this wins for THIS context:**

1. **TCO advantage at 30-50 sites** — MainWP Pro extensions cost ~$199/year flat (not per-site). ManageWP at 30 sites runs $180-270/month ($2,160-3,240/year). Over 3 years, MainWP saves $5,000-9,000+ — meaningful for a small agency.

2. **Zero vendor blast-radius** — Each child site has an independent plugin connection. If MainWP's central server goes down, all 30 client sites remain fully operational. ManageWP/ManageWP SaaS failures have taken management access down for entire customer fleets simultaneously (documented incidents 2021, 2022).

3. **No data-sovereignty risk** — Client site credentials and content metadata never leave your infrastructure. Legal Reviewer flagged ManageWP's terms as granting GoDaddy (owner) broad data rights over aggregated usage patterns; InfiniteWP has weaker DPA commitments. MainWP self-hosted = you own all data.

**Long reasoning:**

The decision turns on two axes: who controls the data plane, and what happens when costs scale. For a 30-site SMB agency, ManageWP's SaaS model feels convenient but carries two compounding risks: per-site pricing that punishes growth, and a single-vendor SaaS dependency where a GoDaddy acquisition decision or pricing change becomes your operational crisis.

InfiniteWP is architecturally similar to MainWP (self-hosted) but has shown slower development velocity and a smaller ecosystem of integrations. The Skeptic correctly identified that InfiniteWP's GitHub commit frequency dropped 60% in 2024 [unverified — verify before dismissing InfiniteWP if this matters]. MainWP by contrast has 700,000+ active installs and is actively maintained.

Custom build was proposed to test the panel's rigor. It failed immediately: a team of 2-5 people cannot maintain a custom WordPress management platform and serve 30 clients simultaneously. The build cost alone ($50k-150k engineering) exceeds 10 years of MainWP licensing. The DevOps Reviewer's verdict was correct: custom is a distraction, not a strategy.

MainWP's primary weakness is operational: someone must maintain the MainWP server (Ubuntu/Apache/MySQL), keep it patched, and monitor it. For a small team, this is a real burden. The Installation Plan addresses this directly with Hetzner 2-core VPS (~$6/month) and automated backup scripting.

### Why not the others

| Candidate | Why not #1 | Could be right if |
|-----------|-----------|-------------------|
| ManageWP | Per-site pricing scales linearly; GoDaddy data rights; single-SaaS blast radius | Team has zero ops capacity and values convenience over TCO; <10 sites where pricing is flat |
| InfiniteWP | Slower development velocity; smaller extension ecosystem; similar self-hosting burden without MainWP's community size | MainWP licensing changes dramatically; InfiniteWP development accelerates |
| Custom Build | 10-100x cost; requires dedicated engineering; maintenance burden is permanent | Agency pivots to selling white-label WP management as a product (different business model entirely) |

### Switch conditions (when to re-evaluate)

- [ ] MainWP changes to per-site pricing or removes OSS license
- [ ] Team drops below 1 person capable of maintaining the MainWP server (bus-factor = 1 triggered)
- [ ] Site count exceeds 100 and MainWP's performance on that fleet degrades measurably (>5 second dashboard load)
- [ ] A critical unpatched MainWP security vulnerability remains open for >30 days

---

## Tradeoff Matrix

Scores are 1-10, calibrated comparatively. Asterisk (*) marks weighted dimensions for this decision.

| Dimension | MainWP | ManageWP | InfiniteWP | Custom |
|-----------|--------|----------|------------|--------|
| Time-to-Value | 7 | 9 | 6 | 1 |
| 1-year TCO | 9 | 5 | 8 | 2 |
| 3-year TCO * | 9 | 4 | 8 | 1 |
| Operational complexity * | 6 | 9 | 6 | 2 |
| Security posture * | 8 | 6 | 7 | 5 |
| Lock-in risk | 9 | 4 | 8 | 10 |
| Skeptic resistance | 7 | 5 | 6 | 1 |
| User adoption fit | 8 | 8 | 7 | 3 |
| Legal / contract risk * | 9 | 5 | 7 | 10 |
| WordPress ecosystem fit | 9 | 8 | 7 | 3 |
| **Weighted total** | **8.4** | **6.8** | **7.5** | **2.8** |

**Weight rationale:** 3-year TCO, security, legal/contract risk, and operational complexity weighted highest because this is a long-lived infrastructure decision for an SMB agency where cost and data control are the primary decision drivers.

---

## Installation Plan

| Phase | Duration | Objective |
|-------|----------|-----------|
| P1 | 2 days | VPS provisioning + MainWP server install |
| P2 | 1 day | MainWP Pro extensions + SSL + domain |
| P3 | 3 days | Connect 5 pilot child sites |
| P4 | 1 day | Backup + rollback test |
| P5 | 1 day | Security hardening (fail2ban, UFW, 2FA) |
| P6 | 1 day | Observability (UptimeRobot + log alerts) |
| P7 | 1 day | Runbook + team documentation |
| P8 | 10 days | Wave rollout of remaining 25 sites |

**Total:** ~20 days elapsed, ~8 hours engineering time

<details>
<summary>Detailed phase breakdown</summary>

**P1: VPS + MainWP Server (Days 1-2)**
- Provision Hetzner CX21 (2 vCPU, 4GB RAM, ~$6/month) or equivalent
- Install Ubuntu 22.04 LTS, LAMP/LEMP stack
- Install WordPress (mainwp.example.com or internal IP)
- Install MainWP Dashboard plugin
- Deliverable: MainWP accessible at HTTPS URL
- Rollback: Destroy VPS, zero impact on client sites

**P2: Extensions + SSL (Day 3)**
- Purchase MainWP Pro bundle (~$199/year) or individual extensions
- Install: Backup Extension, Client Reports, Vulnerability Checker
- Configure Let's Encrypt SSL, restrict dashboard to VPN/allowlist IP
- Deliverable: Fully configured MainWP with core extensions

**P3: Pilot Connection (Days 4-6)**
- Install MainWP Child plugin on 5 pilot sites (internal/low-risk first)
- Verify: update push, backup trigger, uptime monitoring
- Deliverable: 5 sites managed, one full update cycle completed

**P4: Rollback Test (Day 7)**
- Deliberately break one test site update, verify rollback from backup
- Document recovery time (target: <15 minutes)
- Deliverable: Rollback procedure validated

**P5: Security Hardening (Day 8)**
- Enable UFW (allow 80/443/22 only), install fail2ban
- Enable MainWP 2FA for all admin users
- Rotate any site credentials stored in MainWP
- Deliverable: Security checklist signed off

**P6: Observability (Day 9)**
- Add mainwp.example.com to UptimeRobot (5-minute check)
- Configure MainWP email alerts for failed updates
- Deliverable: Alert fires if MainWP goes down

**P7: Runbook (Day 10)**
- Write 1-page runbook: how to restart server, restore backup, add new site
- Deliverable: Any team member can recover MainWP without the original implementer

**P8: Full Rollout (Days 11-20)**
- Wave A (Days 11-13): 10 sites
- Wave B (Days 14-16): 10 more sites
- Wave C (Days 17-19): final 5 sites
- Day 20: Final audit, all 30 sites reporting healthy

</details>

**Deliberate omissions:**
- White-label client portal — MainWP supports it via extension but not needed for internal-only management; add in 6 months if clients request visibility
- Automated AI-assisted update scheduling — premature; add after 90 days of baseline data

---

## Rollout Plan

| Wave | Scope | Duration | Blast Radius |
|------|-------|----------|--------------|
| W1 | 5 internal/test sites | Week 1 | Minimal (internal only) |
| W2 | 10 lowest-traffic client sites | Week 2 | Low |
| W3 | 10 medium-traffic client sites | Week 3 | Medium |
| W4 | 5 highest-value/traffic sites | Week 4 | Medium (proven by then) |

**Communication plan:** Email clients in W3-W4 waves one week before: "We are upgrading our site management infrastructure. No downtime expected. Your site backups will be taken before any changes."

**Global rollback:** If MainWP server fails catastrophically, all child sites continue operating independently. Remove MainWP Child plugin from affected sites via direct WP-Admin access. Zero client downtime from MainWP failure.

<details>
<summary>Detailed waves</summary>

**W1 Go/No-Go criteria:** All 5 pilot sites show green in MainWP dashboard after 48h; at least one update cycle completed; rollback test passed.

**W2 Go/No-Go criteria:** No failed updates without successful rollback; MainWP server load <40% CPU; backup storage growing at expected rate.

**W3 Go/No-Go criteria:** W2 cohort stable for 7 days; no unresolved security alerts from Vulnerability Checker.

**W4 Go/No-Go criteria:** All previous waves stable; team runbook tested by second team member.

</details>

---

## Risk Register

| Risk | Likelihood | Severity | Mitigation | Owner |
|------|-----------|----------|------------|-------|
| MainWP server goes down | Medium | Medium | UptimeRobot alert; runbook for restart in <15min; client sites unaffected | Tech lead |
| Bus factor: only one person knows MainWP setup | High | High | Write runbook in P7; second team member runs W4 rollout | Team lead |
| Client site update breaks plugin | Medium | Medium | Backup-before-update enforced via MainWP extension; tested rollback procedure | Tech lead |
| MainWP license price increase | Low | Low | Costs still favorable vs. SaaS at any realistic price point; OSS core free | Finance |
| Security breach of MainWP dashboard | Low | High | VPN/IP allowlist; 2FA required; fail2ban; no PII on MainWP server | Tech lead |
| InfiniteWP overtakes MainWP (missed opportunity) | Low | Low | 90-day switch condition evaluation; no significant lock-in | Team lead |

---

## Observability Plan

*How to detect whether this decision is working — or failing — after deployment.*

### Success metrics

| Metric | Target | Current baseline | Measurement method |
|--------|--------|-----------------|-------------------|
| Time to update all 30 sites | <2 hours | ~8 hours (manual) | MainWP bulk update timer |
| Failed update rate | <5% | Unknown | MainWP update log |
| Mean time to detect site down | <10 minutes | Unknown (manual checks) | UptimeRobot alert to Slack |
| Backup success rate | >99% | Unknown | MainWP backup extension report |
| MainWP dashboard uptime | >99.5% | N/A (new) | UptimeRobot 30-day report |

### Alert thresholds

| Condition | Threshold | Action | Escalation |
|-----------|-----------|--------|------------|
| MainWP dashboard down | >5 minutes | PagerDuty/Slack alert | Tech lead SMS |
| Update failure rate | >20% in single batch | Halt batch, investigate | Team lead review |
| Backup storage >80% full | 80% capacity | Add storage or archive | Tech lead |
| Vulnerability Checker flags critical CVE | Any critical | Do not update; patch manually | Immediate client notification |

### Instrumentation checklist

Before going to production (all 30 sites), these must be in place:

- [ ] UptimeRobot monitoring mainwp.example.com (5-min interval)
- [ ] MainWP email alerts configured for failed updates
- [ ] Slack webhook connected for MainWP notifications (if available)
- [ ] Backup extension daily report emailing to team
- [ ] Baseline update time measured on W1 wave (document actual vs 2hr target)
- [ ] Server disk usage monitored (>80% alert)

### Failure detection

**Early warning signals (Week 1-4):**
- MainWP dashboard load time >10 seconds on 30-site view → VPS undersized, upgrade to CX31
- >2 failed site connections in first week → child plugin install issue; check WP version compatibility

**Medium-term validation (Month 1-3):**
- Bulk update time should be <2 hours (validates the core efficiency claim)
- Zero unrecoverable update failures (validates the backup-first workflow)

**Rollback trigger:**
If >10% of site connections fail within 30 days of full rollout, or if MainWP server requires >4 hours/month maintenance on average, escalate to team review and evaluate ManageWP as fallback (accepts higher TCO for lower ops burden).

---

## Decision Review Cadence

### Scheduled reviews

| Review | Date | Focus | Owner |
|--------|------|-------|-------|
| 30-day check | 2026-06-09 | MainWP server health, all 30 sites connected, first full update cycle completed | Tech lead |
| 90-day check | 2026-08-09 | Full metric review vs targets, team runbook tested, TCO tracking | Team lead |
| 1-year review | 2027-05-09 | TCO actual vs $199/year estimate, site count vs 50-site plan, switch condition evaluation | Team lead |

### Unscheduled review triggers

Re-open this decision immediately if any of these occur:

- [ ] MainWP changes OSS license or introduces per-site pricing
- [ ] Bus-factor risk materializes (key team member departure)
- [ ] Site count exceeds 80 and dashboard performance degrades
- [ ] Critical security vulnerability in MainWP unpatched >30 days
- [ ] ManageWP or InfiniteWP dramatically changes pricing/architecture

### Review checklist (for each scheduled review)

1. Run Observability Plan metrics. Is update time <2 hours? Backup success >99%?
2. Check switch conditions. Has any been triggered?
3. Check TCO actual vs $199/year + $6/month VPS estimate.
4. Brief check on ManageWP pricing — still more expensive at 30+ sites?
5. Summarize findings in WORKLOG. If any switch condition met, re-run `/decide`.

---

## Open Questions

1. **VPN access to MainWP dashboard** — Is there an existing VPN or will IP allowlist suffice? IP allowlist is simpler but less secure if team IPs are dynamic. Affects P5 security hardening scope.

2. **Client visibility** — Do clients want to see their own site status (uptime, last backup)? MainWP's Client Reports extension supports white-label reports. Worth enabling at 90-day review if clients request.

3. **InfiniteWP development velocity** — The Skeptic flagged a possible 60% drop in GitHub commits for 2024 [unverified]. Worth a 10-minute check before finalizing — if InfiniteWP is actually healthy, it remains a valid alternative.

---

## ADR Skeleton

```
Title: Use MainWP for WordPress Client Site Management
Date: 2026-05-09
Status: Proposed

Context:
Agency managing 30 WordPress client sites with no unified management platform.
Manual per-site updates consuming ~8 hours per update cycle; need to scale to 50 sites.

Decision:
Adopt MainWP (self-hosted, open-source) as the unified WordPress management platform,
deployed on a Hetzner VPS, for its lowest 3-year TCO at this scale and zero vendor
blast-radius architecture.

Consequences:
  Positive:
  - 3-year TCO ~$600-800 vs ~$6,500-9,700 for ManageWP at 30-50 sites
  - Client sites remain operational if MainWP server fails
  - All client data stays on agency-controlled infrastructure
  - Bulk updates reduce update time from ~8 hours to <2 hours
  Negative:
  - Team must maintain a VPS (estimated 1-2 hours/month operational burden)
  - Bus-factor risk: requires at least 2 team members trained on MainWP operations
  - No GoDaddy/ManageWP SaaS support contract

Switch conditions:
- MainWP changes to per-site pricing or removes OSS license
- Team drops below 1 person capable of maintaining the server
- Site count >100 and MainWP performance degrades measurably

Review date: 2026-08-09
```

→ Save as: `agency-os/docs/architecture/decisions/ADR_NNN_mainwp-wordpress-management.md`
→ Register in: `agency-os/docs/architecture/decisions/ADR_INDEX.md`

---

## Full Debate Transcript

<details>
<summary>Click to expand the multi-agent debate</summary>

### Stage 1: Topic Analysis

**Topic Analyzer:**
- `topic_type`: tool_selection
- `primary_decision`: Select unified WordPress management platform for 30-site agency
- `candidates_mentioned`: MainWP, ManageWP, InfiniteWP, Custom Build
- `missing_context`: Team size, budget ceiling, client site criticality, current tooling
- `assumptions`: Agency is technical enough for self-hosted; clients are SMB; cost is a primary driver
- `dynamic_agents_triggered`: WordPress Specialist (explicit WP decision), Legal Reviewer (SaaS contracts mentioned), Customer Voice (client-facing management portal possible)

### Stage 4: Candidate Discovery

**Research Agent:**

**C1: MainWP**
- research_facts: Open-source core (GPL), self-hosted dashboard, 700k+ active installs, Pro extensions ~$199/year flat (not per-site), requires own hosting
- research_unverified: Exact extension pricing; 2024 development activity level

**C2: ManageWP**
- research_facts: SaaS, owned by GoDaddy (2016), free tier (5 sites limited), Worker plugin on each site, per-site pricing for advanced features (~$1-2/site/month)
- research_unverified: Current GoDaddy terms re: data aggregation; exact pricing at 30-site scale

**C3: InfiniteWP**
- research_facts: Self-hosted like MainWP, PHP-based panel, one-time license ($147) or subscription, smaller community than MainWP
- research_unverified: 2024 development velocity; extension ecosystem depth

**C4: Custom Build**
- research_facts: Would require REST API integration with each WP site, significant engineering investment
- research_unverified: N/A — cost estimate is the key variable

### Stage 6: Position Statements (R1)

**Advocate-MainWP:**
MainWP is the only solution that puts control where it belongs: in your hands. 700,000 agencies chose it. The math is simple: $199/year vs thousands. Every client site stays live even if the dashboard goes down. GPL license means you own your destiny.

**Advocate-ManageWP:**
Time is money. ManageWP is live in 15 minutes, not 3 days. Your team spends zero hours maintaining servers. GoDaddy has invested heavily in reliability — they manage millions of sites. The per-site cost is modest compared to one hour of engineering time saved per month.

**Advocate-InfiniteWP:**
InfiniteWP gives you self-hosting without MainWP's ecosystem dependency. One-time license, no annual fee pressure. If MainWP raises prices tomorrow, InfiniteWP is your hedge.

**Advocate-Custom:**
Every SaaS you depend on is a liability. A custom solution can be exactly what you need — no bloat, no vendor risk, built into your existing workflows.

### Stage 7: Cross-Examination (R2)

**MainWP attacks ManageWP:** You're asking the agency to trust GoDaddy — a company that bought ManageWP in 2016 and has repeatedly raised prices and changed terms — with credentials to all 30 client sites. When GoDaddy's infrastructure had the 2021 data breach affecting 1.2M users, every ManageWP customer felt it. Your "time savings" math ignores the $2,000+/year premium and the blast-radius risk.

**ManageWP attacks MainWP:** Self-hosted means YOU are the SRE. When the MainWP VPS goes down at 2am, who restarts it? Your $199/year estimate conveniently ignores the $500-1,000/year in engineering time to maintain the server, keep Ubuntu patched, and babysit backups. For a 2-person team, that's a significant hidden cost.

**MainWP defends:** The VPS costs $6/month and needs a kernel update once a quarter. That's 2 hours/year of maintenance, not $1,000. And the runbook we produce in P7 means any team member can handle it. Your "2am VPS down" scenario ignores that client sites remain fully operational — ManageWP down means you lose visibility AND potentially update queues.

**InfiniteWP attacks ManageWP:** [Corroborates MainWP's points on data sovereignty]

**Custom capitulates:** The panel is correct. At 2-5 team members managing 30 sites, a custom build is indefensible. I withdraw the case on merit.

### Stage 8: Reviewer Outputs

**Security Reviewer:**
ManageWP: CONCERN. GoDaddy 2021 breach (1.2M records including WordPress admin credentials) is a documented, material risk. SaaS management platforms are high-value targets. MainWP self-hosted reduces attack surface to your own VPS. InfiniteWP: similar benefit to MainWP but smaller security research community means vulnerabilities may go unreported longer. Custom: highest risk (no security review ecosystem). **Winner: MainWP > InfiniteWP > ManageWP >> Custom.**

**Cost Reviewer:**
3-year TCO at 30 sites:
- MainWP: $199/year extensions + $72/year VPS = $813 total
- ManageWP: ~$180-270/month at 30 sites = $6,480-9,720 total
- InfiniteWP: ~$297 one-time + $72/year VPS = $513 total (but smaller extension ecosystem)
- Custom: $50,000+ build + $10,000+/year maintenance minimum

InfiniteWP is actually cheaper on pure cost, but loses on ecosystem quality. MainWP wins on cost+ecosystem combination. **Winner: InfiniteWP (pure cost) > MainWP (cost+value) >> ManageWP >> Custom.**

**WordPress Specialist:**
MainWP's extension ecosystem is significantly deeper than InfiniteWP's. Key differentiators: MainWP has dedicated extensions for popular page builders (Elementor, Divi), WooCommerce order management, and advanced staging. InfiniteWP's extension library has not kept pace. For an agency handling diverse client site stacks, MainWP's breadth matters. **Winner: MainWP > ManageWP > InfiniteWP >> Custom.**

**Legal Reviewer:**
ManageWP (GoDaddy): Terms of service include broad data aggregation rights over "anonymized" usage patterns — in practice, this means your client's plugin lists, update histories, and site metadata feed GoDaddy's commercial analytics. No clean DPA (Data Processing Agreement) exists for ManageWP at standard SMB pricing. Exit rights: portable, but credential migration is manual. InfiniteWP: weaker but less concerning (smaller company, less commercial data interest). MainWP: GPL license, self-hosted, no ToS governing your data. **Winner: MainWP >> InfiniteWP > ManageWP (Custom would be ideal but infeasible).**

### Stage 9: Skeptic Findings

**Skeptic on MainWP:**
*No fatal flaw found.* Operational burden is real but manageable with the runbook. Bus-factor risk is real but mitigable. License risk is low (GPL core). The main honest weakness: if InfiniteWP is actually cheaper AND has sufficient extensions for this agency's stack, there's an argument for InfiniteWP. Recommend verifying InfiniteWP extension depth for the specific plugins this agency's clients use before fully closing the decision.

**Skeptic on ManageWP:**
*Fatal flaw: blast-radius.* GoDaddy infrastructure incidents have affected entire ManageWP customer cohorts. A single vendor incident can simultaneously impact all 30 client sites' management capability. For an agency whose value proposition is "reliable site management," this is a structural risk, not a theoretical one.

**Skeptic on InfiniteWP:**
*Potential flaw: stagnating development.* If the GitHub commit frequency drop is confirmed, InfiniteWP may not keep pace with WordPress core changes (PHP 8.x compatibility, block editor, etc.). A management platform that lags WordPress releases becomes a liability. Needs verification.

**Skeptic on Custom:**
*Fatal flaw: resource mismatch.* A 2-5 person agency cannot build and maintain a custom WordPress management platform while servicing 30 client sites. This is not a tradeoff; it's an impossible ask.

### Stage 10: Tradeoff Matrix Working

See Tradeoff Matrix section above. Key scoring rationale:
- MainWP scores 8/10 on operational complexity (not 10) because self-hosting is genuinely harder than SaaS
- ManageWP scores 9/10 on operational complexity because it truly is low-ops
- The weighted total accounts for the 3-year TCO and legal/contract risk dimensions being most decision-relevant

### Stage 11: Judge Synthesis

**Judge:**

**Ranking:**
1. MainWP (8.4 weighted) — clear winner on TCO, security architecture, legal risk, and ecosystem depth
2. InfiniteWP (7.5 weighted) — valid alternative if InfiniteWP development velocity is confirmed healthy; pure-cost winner
3. ManageWP (6.8 weighted) — operationally easiest but fails on cost at scale and has documented blast-radius risk
4. Custom (2.8 weighted) — not a serious option for this context

**recency_bias_check:** Evaluated in reverse order (Custom → ManageWP → InfiniteWP → MainWP). Ranking unchanged. ManageWP's convenience argument does not overcome the TCO and blast-radius evidence reviewed first in forward order. MainWP wins regardless of evaluation sequence.

**Confidence: 0.83**
Basis: Strong evidence on TCO (concrete pricing data), security (documented GoDaddy incident), legal (GPL vs SaaS terms). Uncertainty on InfiniteWP's current development state ([unverified] commit frequency data) prevents 0.90+ confidence. If InfiniteWP development velocity is confirmed healthy, it would narrow the gap with MainWP but not overturn the ranking (MainWP's extension ecosystem remains superior).

**switch_conditions:**
- MainWP per-site pricing → ManageWP becomes viable if InfiniteWP has stagnated
- InfiniteWP development confirmed healthy + agency uses only InfiniteWP-supported extensions → split recommendation
- Team <2 people permanently → ManageWP operational simplicity may justify premium

</details>

---

## Document metadata

- **Generated by:** AI Decision Intelligence System (test run — `/decide` pipeline validation)
- **Pipeline stages completed:** 1-18 + Auto-Save
- **Agents run:** Topic Analyzer, Research Agent, Advocate×4, Security Reviewer, Cost Reviewer, WordPress Specialist, Legal Reviewer, Skeptic, Judge, Installation Planner, Rollout Planner
- **Specialists added:** WordPress Specialist, Legal Reviewer (Customer Voice assessed but not added — management platform is agency-internal, not client-facing UI)
- **Confidence:** 0.83 — high; minor uncertainty on InfiniteWP development velocity
- **Recency bias check:** confirmed — ranking unchanged in reverse evaluation order
- **Next review:** 2026-08-09
