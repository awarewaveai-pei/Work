# Example: WordPress Multi-Site Management Decision

This is a complete worked example showing the skill running end-to-end. Read this before your first run to internalize the depth and tone expected.

**User question:** "If I want to centrally manage updates across my clients' WordPress sites with one click, how should I do it?"

---

## Stage 1: Topic Analyzer Output

```json
{
  "topic_type": "tool_selection",
  "primary_decision": "Select a centralized update management approach for an agency's portfolio of client WordPress sites with one-click bulk update capability and reliable rollback",
  "decision_dimensions": [
    "site_count_supported",
    "update_scope (core/plugins/themes)",
    "automation_level (manual trigger vs scheduled)",
    "rollback_capability",
    "cost_model (SaaS subscription vs one-time vs self-host)",
    "third_party_data_exposure",
    "client_isolation"
  ],
  "complexity_score": 0.65,
  "implicit_assumptions": [
    "User is the agency, not the client",
    "User has admin access to all client sites",
    "Clients have consented to centralized management",
    "Update failures are user's responsibility to resolve"
  ],
  "missing_info": [
    {
      "question": "How many WordPress sites do you manage?",
      "options": ["<10", "10-50", "50-200", "200+"],
      "why_it_matters": "Scale determines whether SaaS pricing or self-host VPS is more economical"
    },
    {
      "question": "Are client sites on the same hosting or distributed?",
      "options": ["Same hosting", "2-3 hosts", "Fully distributed"],
      "why_it_matters": "Distributed hosting eliminates hosting-API approaches; same hosting opens provider-specific solutions"
    },
    {
      "question": "Preference for SaaS subscription vs self-hosted?",
      "options": ["SaaS is fine", "Prefer self-hosted", "Whichever has lower TCO"],
      "why_it_matters": "Self-host has lower long-term cost but operational burden; SaaS exposes client data to third party"
    }
  ],
  "domain_signals": ["wordpress", "wp_management", "agency_workflow"]
}
```

## Stage 2: User clarification

The user responds:
- 30 client sites
- Fully distributed across multiple hosting providers (some shared, some managed WP, some VPS)
- "Whichever has lower TCO; willing to do some ops work but not heavy DevOps"
- Risk tolerance: low (these are client business sites)

## Stage 3: Context Object

```json
{
  "scale_profile": "small_agency_30_sites",
  "team_profile": {
    "size": "1-5 people",
    "wp_expertise": "high",
    "devops_expertise": "medium"
  },
  "constraints": {
    "must_have": [
      "support fully distributed hosting (not host-specific)",
      "core + plugin updates at minimum",
      "rollback capability (backup + restore)",
      "client isolation (one client's plugin choice doesn't affect another)"
    ],
    "must_not": [
      "require enterprise contract or call-sales tier",
      "require client-side complex install"
    ],
    "nice_to_have": [
      "client-facing report (white-label)",
      "uptime monitoring built in"
    ]
  },
  "risk_tolerance": "low",
  "budget_band": "tco_optimal",
  "timeline": "no urgency; quality > speed"
}
```

---

## Stage 4: Research Agent — Candidate Discovery

```json
{
  "candidates": [
    {
      "id": "C1",
      "name": "ManageWP",
      "type": "saas",
      "one_liner": "Mature SaaS WordPress management; acquired by GoDaddy 2016",
      "fit_signal": "Strong choice when zero-ops setup is the priority",
      "research_facts": [
        "Acquired by GoDaddy in 2016",
        "Free tier supports unlimited sites with basic update functionality",
        "Worker plugin architecture using self-generated keypair"
      ],
      "research_unverified": [
        "[unverified] paid tier pricing approximately $1-2/site/month for backups",
        "[unverified] complete current list of paid-only features"
      ],
      "last_updated": "approximate knowledge through 2024",
      "disqualifier_check": "Satisfies all hard constraints; user must accept third-party access to admin credentials"
    },
    {
      "id": "C2",
      "name": "MainWP",
      "type": "oss_self_host",
      "one_liner": "Self-hosted WordPress management dashboard, plugin-based",
      "fit_signal": "Best for users who prefer keeping client data on their own infrastructure",
      "research_facts": [
        "Distributed as a free WordPress plugin (dashboard) with paid extensions",
        "Pro lifetime license has been offered historically at one-time fee",
        "Active community and ongoing development"
      ],
      "research_unverified": [
        "[unverified] current Pro lifetime price (~$399 historically)"
      ],
      "last_updated": "approximate knowledge through 2024",
      "disqualifier_check": "Satisfies all hard constraints; requires VPS operation"
    },
    {
      "id": "C3",
      "name": "InfiniteWP",
      "type": "oss_self_host",
      "one_liner": "Older self-hosted dashboard with free + paid model",
      "fit_signal": "Alternative to MainWP if MainWP licensing doesn't fit",
      "research_facts": [
        "Self-hosted dashboard, similar architecture to MainWP",
        "Free core with paid add-ons"
      ],
      "research_unverified": [
        "[unverified] current development pace and ecosystem health vs MainWP"
      ],
      "last_updated": "approximate knowledge through 2023; should verify currency",
      "disqualifier_check": "Likely satisfies hard constraints; verify maintenance status before committing"
    },
    {
      "id": "C4",
      "name": "BlogVault Manager",
      "type": "saas",
      "one_liner": "SaaS focused on backup-first WP management",
      "fit_signal": "Best when backup reliability is the dominant requirement",
      "research_facts": [
        "Backup-first product positioning",
        "Per-site monthly pricing"
      ],
      "research_unverified": [
        "[unverified] full feature scope beyond backup",
        "[unverified] current pricing tiers"
      ],
      "last_updated": "approximate knowledge through 2024",
      "disqualifier_check": "Satisfies hard constraints; pricing skews toward higher per-site cost"
    },
    {
      "id": "C5",
      "name": "WP Umbrella",
      "type": "saas",
      "one_liner": "Newer SaaS with monitoring + management focus",
      "fit_signal": "Modern UI, performance-monitoring oriented",
      "research_facts": [
        "Newer entrant, French-based vendor (potentially relevant for GDPR)",
        "Monitoring + maintenance bundled"
      ],
      "research_unverified": [
        "[unverified] long-term vendor stability",
        "[unverified] feature parity with mature options"
      ],
      "last_updated": "approximate knowledge through 2024",
      "disqualifier_check": "Satisfies hard constraints; vendor maturity less established"
    },
    {
      "id": "C6",
      "name": "Build Your Own (custom dashboard via WP REST API)",
      "type": "build",
      "one_liner": "Custom dashboard calling each site's WordPress REST API",
      "fit_signal": "Justified only when off-the-shelf options can't meet workflow needs",
      "research_facts": [
        "WP REST API natively supports plugin/theme/core update endpoints with admin auth",
        "Application Passwords feature available since WP 5.6 for service auth"
      ],
      "research_unverified": [],
      "last_updated": "current",
      "disqualifier_check": "Satisfies hard constraints technically; high engineering cost"
    },
    {
      "id": "C7",
      "name": "WP-CLI + SSH automation",
      "type": "hybrid",
      "one_liner": "Scripted updates via SSH+WP-CLI to each site",
      "fit_signal": "Power-user / DevOps-heavy approach",
      "research_facts": [
        "WP-CLI is the official WordPress command-line tool, mature and stable",
        "Most major hosts support SSH + WP-CLI; some shared hosts do not"
      ],
      "research_unverified": [],
      "last_updated": "current",
      "disqualifier_check": "PARTIAL FAIL on hard constraint: 'fully distributed hosting' includes shared hosts that may not support SSH/WP-CLI reliably"
    },
    {
      "id": "C8",
      "name": "Status quo (manual updates per site)",
      "type": "build",
      "one_liner": "Continue manual updating; no centralization",
      "fit_signal": "Comparison baseline; rejected if user wants ANY automation",
      "research_facts": [
        "Zero new tooling cost",
        "Linear time cost per site per update cycle"
      ],
      "research_unverified": [],
      "last_updated": "current",
      "disqualifier_check": "Fails 'one-click update' requirement by definition; included as baseline"
    }
  ],
  "intentionally_excluded": [
    {
      "name": "Hosting provider native API (e.g., Kinsta, WP Engine APIs)",
      "reason": "User specified fully-distributed hosting; provider APIs only work within one provider"
    },
    {
      "name": "WP Remote",
      "reason": "Service was sunset by vendor; not viable"
    }
  ]
}
```

---

## Stage 5: Specialist Selection

Domain signals triggered: `wordpress`, `wp_management`, `agency_workflow`.

**Added specialist:** WordPress (`specialists/wordpress.md`)

No other specialist hits the threshold (no compliance signals beyond GDPR-light, no scaling concerns at 30 sites, no AI/ML).

---

## Stage 6: Position Statements (R1) — abbreviated

### Advocate for C1 (ManageWP):
> "For a 1-5 person agency managing 30 distributed sites, time-to-value is the deciding factor. ManageWP gets you operational in under an hour: account creation, install Worker plugin on first 3 sites, verify one-click update works, then bulk-onboard the remaining 27 sites in ~30 minutes. Zero VPS to operate. Zero PHP/MySQL to patch. Zero on-call burden for the dashboard itself — that's GoDaddy's problem after a 2016 acquisition that has only stabilized the product. Free tier handles the user's stated must-haves (core + plugin updates, basic backup); paid extensions are optional. Twelve months from now you've performed ~12 update cycles across 30 sites with consistent UX, and your team's energy went into client work rather than dashboard maintenance.
>
> Preemptive weakness: third-party access to client admin credentials is real. Mitigation in stage 8."

### Advocate for C2 (MainWP):
> "User said 'low risk tolerance, client business sites, TCO-optimal.' MainWP wins all three. Self-hosted means client admin credentials never leave infrastructure you control — your VPS, your control plane. One-time license (~$399 historically) plus $20-30/month VPS = $1,200-2,400 over 3 years vs ManageWP's per-site recurring at the backup tier of $5,400-10,800 over 3 years. Setup is 3-5 days for a WP-experienced team — meaningful but bounded. After setup, ops burden is moderate: VPS patching quarterly, MainWP version bumps with WP majors, occasional plugin conflict triage. Twelve months in: identical operational results to ManageWP at <25% of the cost, with full data sovereignty.
>
> Preemptive weakness: VPS is single point of failure for your update operations. Mitigation in stage 7 cross-exam."

### Advocate for C6 (Build Your Own):
> "If your workflow has specific needs no off-the-shelf tool fits, build it. WP REST API supports the operations needed; Application Passwords solve auth; 4 weeks for v1 with one engineer. Twelve months in, you have a tool exactly tuned to your agency's processes.
>
> Preemptive weakness: by definition, you're paying full ongoing maintenance cost — every WP major release potentially breaks integrations, every new client edge case is your debugging session."

### Advocate for C7 (WP-CLI + SSH):
> "For DevOps-comfortable users, WP-CLI scripted via Ansible or similar gives you maximum control and zero ongoing license cost. Each site gets a `wp plugin update --all` over SSH, wrapped in a runbook with rollback steps."

### Advocate for C8 (Status Quo):
> "Sometimes the right answer is 'don't.' At 30 sites with quarterly major plugin updates, manual is 30 sites × 15 min × 4 cycles = 30 hours/year. That's $3,000 of engineer time. Any solution that costs less than $3,000/year setup+ops is winning vs status quo; anything above is worse than doing nothing."

(C3, C4, C5 have similar opening statements; abbreviated.)

---

## Stage 7: Cross-Examination (R2) — abbreviated, key exchanges

### C2 (MainWP advocate) attacks C1 (ManageWP):

> **Attack: Strategic vendor risk under GoDaddy ownership.** GoDaddy has divested several acquired products historically when they didn't fit core strategy. ManageWP has continued, but no public roadmap commitment beyond standard maintenance. For an agency planning 3+ years of use, the expected cost of a sunset event (probability × disruption cost) may exceed the saved engineering time of choosing SaaS over self-host. The user said 'low risk tolerance for client business sites' — strategic vendor risk is part of that risk surface.

### C1 (ManageWP advocate) defends:

> **Defense type: mitigate.** Valid concern in principle, but the data: ManageWP has run continuously since 2016 acquisition with regular product updates. GoDaddy's WP-related portfolio (also includes other acquisitions) suggests strategic intent in the WP space, not divestment. Standard mitigation: maintain off-platform backups so that exit-from-vendor is achievable. The expected loss from a sunset event over 3 years (low probability × moderate disruption) does not exceed the saved 80+ engineering hours of SaaS vs self-host setup, especially for a team where DevOps expertise is medium not high.

### C1 (ManageWP advocate) attacks C2 (MainWP):

> **Attack: VPS is a single point of failure.** The MainWP advocate's preemptive concession glossed over the implication. Your dashboard going down doesn't just delay updates — during the down period, you cannot trigger emergency updates if a plugin vulnerability is announced. For an agency with low risk tolerance, having your control plane on infrastructure you patch, you secure, you keep online, is not zero-cost. SaaS providers have 99.9%+ uptime; your single VPS likely won't, especially if you're not actively monitoring it.

### C2 (MainWP advocate) defends:

> **Defense type: mitigate + reframe.** Mitigation: nightly off-site backup of dashboard VPS to S3/B2 (~$2/month); standby VPS image spinnable in <30 minutes from backup. Reframe: dashboard going down doesn't make client sites unreachable — it just delays bulk operations; emergency updates can be applied site-by-site via direct admin login as a fallback. Compare to ManageWP outage scenario: SaaS-side incident affects all your operations simultaneously. Blast radius of dashboard-down is smaller than SaaS-down.
>
> **Concession:** SaaS vendor's engineering operations team is genuinely larger than the user's solo VPS-management capacity. For an emergency-response scenario specifically, ManageWP probably wins. For routine ops, MainWP is fine.

### Multiple advocates attack C6 (Build Your Own):

> **Product Reviewer & C2 advocate alignment:** "User's stated problem is 'one-click update across N sites.' Build-your-own solves that, but it solves a much bigger problem (full WP management platform) where MainWP and ManageWP already cover 95% of stated need. The user is paying the cost of a 'WP management platform' to get the value of 'one-click update.' Problem-fit is poor."

### C6 (Build) advocate defends:

> **Defense: rebut.** The framing assumes the user's stated need is complete. In agency reality, custom dashboards encode workflow knowledge that off-the-shelf tools don't fit (specific client-handling logic, custom auth flows, internal CRM integration). If user has any of those needs, build wins.
>
> **Concession:** If user has none of those needs, problem-fit critique stands. User did not state custom workflow needs.

### C7 (WP-CLI) advocate concedes a hard constraint:

> "Cross-exam revealed that user's hosting topology includes shared hosts that don't reliably support SSH/WP-CLI. For sites on Bluehost shared, GoDaddy shared, or Hostinger lower tiers, SSH access is gated or absent. C7 cannot fully cover the hard constraint of 'fully distributed hosting.' I concede this candidate is a partial solution at best — appropriate for the SSH-supporting subset of the user's hosting portfolio."

---

## Stage 8: Specialist Reviews — abbreviated, key findings

### Security Reviewer:
- C1, C4, C5 (SaaS): all share concern of third-party access to client admin credentials. Severity: medium (well-architected vendors have minimized but cannot eliminate this access). Cross-cutting concern.
- C2, C3 (self-host): client credentials remain on user infrastructure. Lower data exposure but introduces VPS attack surface user must manage.
- C6 (build): you own all the security responsibilities. Mitigations are extensive.
- C7 (WP-CLI): SSH key management across many hosting providers. Realistic risk of key sprawl.
- **Comparative summary:** C2 best for "low risk tolerance + sensitive client data" framing; C1 acceptable with mitigations (DPA, 2FA, key rotation runbook).

### DevOps Reviewer:
- C1, C4, C5 (SaaS): deployment complexity 1-2/10. Observability good (vendor dashboards). 3am scenarios revolve around vendor outage (cannot operate dashboard for ~hours).
- C2 (MainWP): deployment 5/10. 3am scenario: bulk update fails midway on 3 of 30 sites; SSH to each, manually disable failing plugin. ~45-90 min incident.
- C6 (build): deployment 8/10 for v1; ongoing complexity high.
- C7 (WP-CLI): deployment varies wildly by host; some setups elegant, some require workarounds.
- **Comparative summary:** SaaS wins on operational simplicity for THIS team's medium DevOps expertise; C2 is operationally fit but at upper edge of comfort zone.

### Cost Reviewer (key numbers — **ranges**, not point estimates):
- C1 (ManageWP): 1yr $0-1,800 (free tier viable but assumes need for backup add-on); 3yr $1,800-10,800 depending on tier choices.
- C2 (MainWP): 1yr $700-1,400 (one-time license + VPS + initial setup); 3yr $1,200-2,400.
- C6 (build): 1yr $4,800-9,600 (engineering time dominated); 3yr $8,400-15,600 (plus ongoing maintenance).
- C7 (WP-CLI): 1yr $400-800 (mostly engineering setup time); 3yr $1,200-2,000.
- **Comparative summary:** C2 cheapest at 3-year horizon at user's scale; C7 cheaper but doesn't satisfy hard constraint; SaaS premiums real but bounded.

### Product Reviewer:
- All candidates have similar problem-fit for "one-click update" stated need.
- C6 (build) flagged with red flag: "engineer-driven choice; problem-fit drops to 4/10 because building solves much bigger problem than user stated."
- C7 (WP-CLI) flagged: time-to-value high (real value requires building scripts and runbook); appropriate for power-user single-developer agency, less so for the user's described team.

### WordPress Specialist:
- C1, C2, C3: ecosystem mature for WordPress agency use cases; well-tested with WooCommerce, Elementor, popular caching plugins.
- C4 (BlogVault): backup-focused; backup architecture excellent but other features less polished.
- C5 (WP Umbrella): newer; ecosystem trust signal lower; verify track record before committing.
- C6 (build): WP-specific concerns: each WP major release tests REST API integration; plugin conflicts during bulk update are your debugging burden.
- **Cross-cutting:** every candidate must handle the "object cache invalidation after plugin updates" gotcha; SaaS vendors handle this transparently; self-host must verify.

---

## Stage 9: Skeptic Findings — abbreviated, key items

```json
{
  "findings": [
    {
      "candidate_id": "C1",
      "fatal_flaw": "GoDaddy strategic risk",
      "fatal_flaw_evidence": "Acquired 2016; no public roadmap commitment beyond standard maintenance. GoDaddy WP-portfolio history shows acquisition-then-deprecation pattern in some products.",
      "fatal_flaw_likelihood": "low",
      "fatal_flaw_severity": "high",
      "worst_case_scenario": "GoDaddy announces 6-month sunset. User must migrate 30 sites to alternative within window: 60-100 engineering hours + client communications + brand impact = $6-10K disruption.",
      "challenge_to_judge": "How does Judge weight low-probability vendor risk against immediate operational benefit?"
    },
    {
      "candidate_id": "C2",
      "fatal_flaw": null,
      "fatal_flaw_evidence": null,
      "worst_case_scenario": "Engineer who set up VPS leaves agency; replacement takes 20-40 hours to get up to speed on the specific stack. Mitigated by runbook from day 1.",
      "challenge_to_judge": "Are reviewer concerns (VPS ops burden, knowledge transfer risk) addressable risks rather than fatal flaws? Skeptic's view: addressable."
    },
    {
      "candidate_id": "C6",
      "fatal_flaw": "Permanent maintenance liability against unstable substrate",
      "fatal_flaw_evidence": "WordPress REST API is stable but not contractual; plugins evolve unpredictably; every WP major release tests integration. Custom dashboards in this space have a high abandonment rate.",
      "fatal_flaw_likelihood": "high",
      "fatal_flaw_severity": "high",
      "worst_case_scenario": "Year 2: original developer leaves. Replacement either rebuilds or migrates to off-the-shelf. Sunk cost: 200+ hours of original build + ongoing maintenance.",
      "challenge_to_judge": "Build justified only when off-the-shelf can't meet needs. User did not state needs requiring custom build."
    }
  ],
  "cross_candidate_pattern": "All SaaS candidates share root concern: third-party access to client admin credentials. Most agencies haven't formally documented this with their clients. Either flag as open question or accept as standard agency practice."
}
```

---

## Stage 10: Tradeoff Matrix

Weights adjusted for context: **low risk tolerance** + **TCO-optimal budget** + **medium DevOps expertise**:
- Security weight: 1.5x
- 3-year TCO weight: 1.5x
- Operational complexity weight: 1.2x
- Time-to-value weight: 0.8x (no urgency stated)

| Dimension | C1 ManageWP | C2 MainWP | C3 InfiniteWP | C4 BlogVault | C5 WP Umbrella | C6 Build | C7 WP-CLI | C8 Manual | Weight |
|-----------|------------|-----------|---------------|--------------|----------------|----------|-----------|-----------|--------|
| Time-to-value | 9 | 5 | 5 | 8 | 7 | 2 | 4 | 10 | 0.8 |
| 1-yr TCO | 7 | 8 | 8 | 5 | 6 | 2 | 8 | 9 | 1.0 |
| 3-yr TCO | 5 | 9 | 8 | 4 | 5 | 2 | 8 | 4 | 1.5 |
| Op complexity (lower=better) | 9 | 6 | 6 | 9 | 8 | 3 | 5 | 8 | 1.2 |
| Security posture | 5 | 8 | 7 | 5 | 6 | 6 | 7 | 9 | 1.5 |
| Lock-in resistance | 4 | 9 | 8 | 4 | 4 | 7 | 9 | 10 | 1.0 |
| WP ecosystem fit | 9 | 9 | 7 | 8 | 6 | 5 | 7 | 6 | 1.0 |
| Skeptic resistance | 6 | 8 | 7 | 6 | 5 | 3 | 6 | 5 | 1.0 |
| **Weighted total** | **62.7** | **76.6** | **70.4** | **57.7** | **57.6** | **39.5** | **62.4** | **66.4** | — |

(Exclude C8 from final ranking since it fails "one-click" by definition; included for baseline.)

---

## Stage 11: Judge Decision

```json
{
  "ranked_candidate_ids": ["C2", "C3", "C1", "C7", "C4", "C5", "C6"],
  "primary": {
    "candidate_id": "C2",
    "reasons": [
      "Wins on 3-year TCO at user's scale: $1,200-2,400 vs SaaS alternatives' $5,400-10,800, driven by one-time license model rather than per-site recurring.",
      "Best aligns with stated low risk tolerance for client business systems: client admin credentials remain on infrastructure user controls. Skeptic identified third-party credential exposure as cross-cutting concern across all SaaS candidates; only C2, C3, C6, C7 avoid it, and only C2 satisfies all other constraints.",
      "Operationally fit for THIS team: WordPress expertise high, DevOps expertise medium. DevOps Reviewer's 3am scenario uses SSH + wp-cli skills user already has. Build candidates require deeper engineering team doesn't have; SaaS candidates have excellent ops but introduce vendor risk Judge weighs more heavily for low risk tolerance."
    ],
    "long_reasoning": "The decision turns on three things the user surfaced: (1) low risk tolerance for client business systems, (2) hosting topology fully distributed, (3) TCO-optimal budget. C2 (MainWP self-hosted) is the only candidate that wins on all three. SaaS alternatives (C1, C4, C5) collapse on dimension #1 — they all introduce third-party access to client admin credentials. Build-your-own (C6) collapses on dimension #3 (engineering time dominates TCO) and Product Reviewer flagged 'wrong problem fit' since user didn't state custom workflow needs justifying build. WP-CLI (C7) collapses on dimension #2 (coverage gap on shared hosting that doesn't support SSH). C3 (InfiniteWP) is structurally similar to C2 but with less verified ecosystem health; would only beat C2 if MainWP's pricing or licensing changed adversely. The decision isn't close once you weight to context. Confidence is held below 0.85 because: (a) MainWP's roadmap pace for next 12-24 months is somewhat uncertain; (b) the user's 'low risk tolerance' is self-reported and could shift if a SaaS pilot showed acceptable results; (c) the candidate set assumes user can run a VPS, which is at the upper edge of stated medium DevOps expertise."
  },
  "rejections": [
    {
      "candidate_id": "C1",
      "reason": "Best in time-to-value but introduces third-party access to client admin credentials, conflicting with stated low risk tolerance",
      "could_be_right_if": "User accepts SaaS data exposure tradeoff for the operational simplicity, OR scales beyond ~100 sites where SaaS economy of scale wins"
    },
    {
      "candidate_id": "C3",
      "reason": "Structurally similar to C2 with less verified ecosystem health; secondary choice if C2 licensing or pricing shifts adversely",
      "could_be_right_if": "MainWP changes license model unfavorably, or InfiniteWP demonstrates better fit for specific user workflow"
    },
    {
      "candidate_id": "C7",
      "reason": "Coverage gap: hard constraint requires fully distributed hosting, including shared hosts that don't reliably support SSH/WP-CLI; advocate conceded this in cross-exam",
      "could_be_right_if": "User's hosting portfolio consolidates to SSH-supporting providers (managed WP, VPS-only)"
    },
    {
      "candidate_id": "C6",
      "reason": "Skeptic identified high-likelihood permanent maintenance liability; Product Reviewer flagged solving wrong problem given user did not state custom workflow needs",
      "could_be_right_if": "User has very specific workflow integration needs (deep CRM integration, custom client portal) that off-the-shelf can't accommodate"
    }
  ],
  "confidence": 0.78,
  "confidence_basis": "Confidence is high but not maximum because: (1) MainWP's pace of development for next 12-24 months is somewhat uncertain (no public roadmap commitment); (2) user's low risk tolerance is self-reported; (3) the candidate set assumes user can run a VPS, which is at the upper edge of stated medium DevOps expertise.",
  "switch_conditions": [
    "If site count grows beyond ~100, re-evaluate; SaaS economy of scale starts winning past that threshold",
    "If user's team loses VPS-capable engineer without replacement, re-evaluate; ops cost of C2 may become untenable",
    "If a client requires SOC2/HIPAA in their contract, re-evaluate; SaaS-with-DPA may simplify compliance vs self-host responsibility",
    "If MainWP project shows signs of stalling (12+ months without releases, acquisition by entity with unclear roadmap), re-evaluate vendor health"
  ],
  "open_questions": [
    "Has user confirmed clients consent to centralized management? (Skeptic flagged this assumption.)",
    "Does user have an off-site backup strategy for the dashboard VPS itself? (Required for resilience; not assumed.)",
    "What's user's plan for replacement if their VPS-capable engineer leaves?"
  ],
  "recency_bias_check": "Yes — checked by mentally placing C2 first in discussion order and re-asking whether the case still holds. The conclusion does, because the win is on dimensions (TCO, risk profile, ops fit) rather than rhetorical force in cross-exam. C2 was discussed in the natural ordering, neither first nor last; recency does not appear to drive the outcome."
}
```

---

## Stages 14-15: Plans (abbreviated — see installation-planner.md and rollout-planner.md output schemas for full structure)

**Installation Plan:** 8 phases over 7 days, 32 engineering hours total. Phase 1 (provision VPS), Phase 2 (install LEMP + MainWP), Phase 3 (pilot 3 sites), **Phase 4 (verify rollback — non-negotiable)**, Phase 5 (security hardening including the 4 must-have mitigations from Security Reviewer), Phase 6 (observability: UptimeRobot + log aggregation), Phase 7 (operational documentation: runbook, incident response, onboarding doc), Phase 8 (limited production, expand to 10 sites).

**Rollout Plan:** 4 waves over 8 weeks. W1 = 3 of agency's own sites, W2 = 5 low-tier client sites, W3 = 10 mid-tier, W4 = remaining 12. Per-wave go/no-go and rollback. Communication plan includes pre-rollout client emails for waves touching client sites.

---

## Stage 16: Risk Register (top entries)

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|-----------|
| R1 | VPS compromise (exposes 30 client admin credentials) | Low | Catastrophic | Hardened VPS; SSH key-only; firewall; weekly security update cycle; 2FA on dashboard |
| R2 | MainWP project stalls / strategic risk | Low | High | Off-site backup of dashboard config; quarterly check on project health; identified C3 as fallback option |
| R3 | Engineer turnover before runbook complete | Medium | Medium | Runbook written in P7 of installation; documented before solo-engineer leaves |
| R4 | Bulk update fails partway through (3 of 30 sites) | Medium | Low-Medium | P4 (verify rollback) phase ensures rollback works; communication template ready |
| R5 | Client raises GDPR concern about centralized management | Low | Medium | Open question to resolve before W2 of rollout; standard agency consent language available |

---

## What this example demonstrates

This worked example shows:
1. **Specificity throughout** — no generic advice; every section grounds in the user's stated 30 sites, distributed hosting, low risk tolerance
2. **Honest Skeptic** — fatal flaws calibrated; C2 honestly marked as "no fatal flaw" rather than inventing one
3. **Forced ranking** — Judge picked clear #1 with calibrated 0.78 confidence (not 0.95)
4. **Switch conditions are testable** — site count > 100, engineer turnover, compliance contract requirement
5. **TCO ranges, not point estimates** — Cost Reviewer's discipline preserved
6. **Cross-cutting pattern caught by Skeptic** — third-party credential exposure across all SaaS candidates
7. **Hard-constraint coverage check** — C7 honestly conceded its coverage gap rather than glossing over

When running this skill on a new question, aim for this depth and discipline.
