# Decision: How should AwareWave build a fully-automated daily content pipeline (2 zh-TW SEO/GEO/RankMath articles per day per client) — BUILD, BUY, or HYBRID?

**Date:** 2026-06-15
**Mode:** business_strategy (build-vs-buy) + tool_selection overlay
**Confidence:** 0.80 — calibrated after pre-mortem (0.84 pre-pre-mortem, −0.04 for relevance-entropy execution risk that no native quality metric detects)
**Participating agents:** Topic Analyzer, Research Agent, Advocate ×4 (BUILD, BUY-CyberSEO, BUY-Journalist/GetGenie, HYBRID), Security Reviewer, DevOps Reviewer, Cost Reviewer, Product Reviewer, Customer Voice, Legal Reviewer, AI/ML Specialist, WordPress Specialist, Skeptic, Judge, Pre-mortem, Installation Planner, Rollout Planner

---

## TL;DR (30-second read)

**Recommendation:** BUILD on the existing stack — finish the orchestration spine you already started (topic discovery + 2-tier generation job + optional outline-review gate + observability), and make exactly ONE narrow BUY: topic-discovery *data* feeds (Perplexity API + Google Trends + per-client RSS allowlist). Reject every off-the-shelf *generator* (CyberSEO Pro, Journalist AI, GetGenie) and reject RankMath Content AI as the generator.

**Why:** Your `/api/content/generate` + WP Bridge already do the hard, defensible part — RankMath-compliant zh-TW long-form with GEO capsules, CJK focus-keyword density, Ed25519-signed atomic publish with read-back verify and auto-rollback. Every off-the-shelf generator is English-first, would either bypass or fight your Kadence/Internal-Link-Juicer/RankMath publish contract, and re-introduces the exact "1000 keywords → 1000 articles → auto-publish" bulk pattern your own SSOT (`docs/wp-kadence-ai-seo-geo-content-engine.md §3.2`) forbids and that Google's 2026 scaled-content-abuse enforcement penalizes.

**Pre-mortem primary risk:** Relevance entropy — without an explicit per-client feedback signal, each client's articles silently drift toward the generic industry mean. Every quality dashboard (RankMath score, GEO readiness, word count) stays green while the content stops being *about that client*, surfacing as unexplained client churn 6–9 months out.

**Watch for:** If operator draft-edit-rate per client climbs (you're rewriting more, not less) OR unique-topic-clusters per client per 30 days falls below ~6, the relevance signal is decaying — fix the feedback loop before scaling waves.

**First review:** 2026-07-15 (30-day check).

---

## Context

AwareWave is a self-hosted, zh-TW-market 代操 (managed-service) agency running client WordPress sites on Hetzner SG + EU. The decision is how to stand up a fully-automated daily content pipeline that publishes 2 articles/day/client: Article A (~1500 words, timely/trending, tied to that client's industry) and Article B (~3500 words, deep evergreen authoritative) — both RankMath + GEO compliant at generation time, in Traditional Chinese, with auto featured image + in-article images and an optional video embed, minimal manual touch, plus an OPTIONAL outline-review gate.

- **Scale:** Multi-tenant; per-client config at `agency-os/tenants/<slug>`. 2 articles/day/client → at 10 clients that is 20 articles/day, 600/month.
- **Team:** Small senior team (effectively solo-operator-plus). 30-year-maintainability discipline (R0). Self-hosted-everything bias.
- **Existing assets (NOT to rebuild — design around them):**
  - next-admin content-engine: `POST /api/content/generate` (RankMath-compliant zh-TW long-form, GEO answer capsules 120–150 chars, power words, CJK-tuned focus-keyword density, single-H1, custom-outline support); `POST /api/content/publish` (routes through WP Bridge); `POST /api/content/image` (Replicate Flux Schnell).
  - WP Bridge plugin (PHP, each client site): Ed25519-signed REST `/post`, composes Kadence blocks, sideloads image URLs into WP media, sets featured image + Internal Link Juicer keywords + RankMath SEO meta, atomic read-back verify + auto-rollback, registers zh-TW RankMath `power_words` filter.
  - Trigger.dev self-hosted on EU VPS (`trigger.aware-wave.com`).
  - Replicate (Flux), Perplexity API, RankMath on every site.
  - Content-engine SSOT: `docs/wp-kadence-ai-seo-geo-content-engine.md` — explicitly forbids bulk "1000 keywords → 1000 similar articles → auto-publish"; mandates Quality Gate, Semantic Coverage Gate (score ≥75), Fact-Check Layer, GEO/AI First-Pick Readiness, Topic Authority / Cannibalization protection (§21, §21.5), Brand Knowledge Base (§8.6).
- **Constraints:** zh-TW / CJK content (English-first tooling is a liability, not a feature). Must respect the existing publish contract (Kadence + ILJ + RankMath + signed atomic publish). Must satisfy Google's scaled-content-abuse / site-reputation-abuse policy. Framing on engineering merit and 30-year maintainability — the business is revenue-generating, this is not a cost-minimization exercise.
- **Risk tolerance:** Low for irreversible / client-facing reputation damage (Google penalty kills a client's entire site, not one article). Moderate for build effort.

---

## Recommendation

### Primary: BUILD on the existing stack + one narrow BUY (topic-discovery data feeds)

You are ~70% of the way to the full pipeline already. The remaining 30% is orchestration glue, not capability. The defensible, hard-won assets — CJK RankMath compliance at generation time, GEO capsules, and a signed atomic publish contract with read-back verify + auto-rollback — already exist and are exactly what no off-the-shelf tool gives you for zh-TW.

**Three reasons this wins (for THIS context):**

1. **The off-the-shelf generators are English-first and would fight your publish contract, not extend it** — Per Research + WordPress Specialist: CyberSEO Pro, Journalist AI, and GetGenie all generate-and-publish through their own WP write path. They do not emit Kadence blocks, do not feed Internal Link Juicer keywords, do not set your CJK-tuned RankMath meta, and have weak-to-absent zh-TW focus-keyword density handling. Adopting one means either (a) bypassing your WP Bridge (losing Ed25519 signing, atomic read-back verify, auto-rollback — the only thing standing between a bad generation and a corrupted live client site), or (b) building an adapter to feed their output into your Bridge, at which point you have kept all your build cost AND added a vendor in the critical path. Negative-value integration.

2. **Buying re-introduces the exact bulk pattern your own SSOT forbids and Google now penalizes** — `docs/wp-kadence-ai-seo-geo-content-engine.md §3.2` explicitly forbids "1000 keywords to 1000 similar articles to auto-publish." Off-the-shelf tools are built around that pattern (RSS-to-blog autopilot, bulk CSV keyword runs). Research confirms Google's March 2026 core update enforcement of scaled-content-abuse and site-reputation-abuse policies produced 50–80% traffic drops on sites running unreviewed bulk AI. Your existing Quality Gate / Semantic Coverage Gate (≥75) / Fact-Check / Topic-Authority-Cannibalization protections are your moat against this; an off-the-shelf generator has none of them and would route around the ones you built.

3. **30-year maintainability favors owning the spine, renting only the commodity data** — The only genuinely commodity, non-differentiating input is what to write about today. That is pure data (trending topics, client-industry signals), legitimately bought: Perplexity (already in stack) for web-grounded discovery, Google Trends for timeliness, per-client RSS allowlist for industry specificity. Everything downstream — generation, compliance, publish — is your durable IP and stays in-house where you can reason about it, version it, and roll it back. Renting the generator would be renting the part that defines you; renting topic data rents the part that is interchangeable.

**Full argument:**

The honest version of "BUY" in this brief is not "buy a content pipeline" — it is "buy a generator and bolt it onto a publish contract you would have to keep anyway." The debate made this concrete: the BUY advocates (CyberSEO and Journalist/GetGenie) both conceded under cross-examination that to preserve Ed25519 signing + atomic read-back + Kadence + ILJ + CJK RankMath meta, they would have to feed their generator output back through your `/api/content/publish`. At that point the "buy" is reduced to replacing one HTTP call (`/api/content/generate`) — the single component most tuned to your exact zh-TW + GEO + RankMath requirements, and the one where English-first tools are weakest. You would pay a subscription, accept a vendor in your critical path, lose prompt control, and inherit their bulk-publish ergonomics, to replace the part you are best at. The Judge ranked this last among serious options for that reason.

HYBRID-as-generator (use an external generator for Tier A timely, keep BUILD for Tier B deep) was the strongest BUY-flavored contender and is why this is not a 0.9-confidence call. It fails on a subtler axis: two generators means two compliance surfaces, two prompt-drift problems, and two places a Google-policy regression can originate — for a small team, that doubles the thing hardest to maintain (probabilistic output quality) to save the thing easiest to maintain (a cron + two prompt variants). The relevance-entropy pre-mortem finding cuts hardest exactly here: an external Tier-A generator has no access to your per-client Brand Knowledge Base (§8.6), so Tier A would be the first content to drift generic.

So: BUILD the spine, BUY only the topic-discovery data. The "narrow BUY" is real and worth naming explicitly so this is not mistaken for NIH (not invented here) — you ARE buying Perplexity/Trends/RSS rather than building a crawler/trends-ingestion stack, because that data is commodity and your time is not.

### Why not the others

| Candidate | Why not | Choose it if... |
|-----------|---------|-----------------|
| **BUY — CyberSEO Pro** | English-first; RSS-autopilot bulk ergonomics; publishes through its own path (bypasses WP Bridge signing/read-back/rollback); no Kadence/ILJ/CJK-RankMath integration; embodies the §3.2-forbidden bulk pattern. | You abandon the WP Bridge publish contract entirely and accept English-grade zh-TW SEO. (You will not.) |
| **BUY — Journalist AI / GetGenie** | SaaS generator with weak zh-TW focus-keyword density; no GEO answer-capsule concept matching yours; would need an adapter into your Bridge, keeping all build cost + adding vendor lock-in + per-seat/credit pricing scaling with volume. | You wanted a turnkey English/multilingual blog and had no existing engine. You have one. |
| **BUY — RankMath Content AI as the generator** | It scores/assists inside wp-admin; it is not a headless generation API you can drive from Trigger.dev at 2 articles/day/client; using it as the generator means manual wp-admin sessions — the opposite of automation. RankMath stays — as the on-site SEO scorer your generation already targets. | Never as generator. Keep as scorer. |
| **HYBRID — external generator for Tier A, BUILD for Tier B** | Doubles the compliance + prompt-drift + Google-policy surface for the lowest-value half; external Tier-A generator cannot see per-client Brand KB so it is first to suffer relevance entropy. | Your in-house Tier-A timely quality proves materially worse than Tier B after 90 days AND an external tool demonstrably closes that gap on zh-TW (test, do not assume). |
| **BUILD full rebuild (new orchestration framework)** | Throws away Trigger.dev self-hosted, which already runs and already fits the idempotent-cron shape. Pure cost, no benefit. | Trigger.dev self-hosted proves unable to hold per-client idempotency keys at scale (it will not at your volume). |
| **Status quo (manual/semi-manual)** | Does not meet the brief (fully-automated daily). Operator time does not scale to 600 articles/month. | You decide automated daily cadence is itself wrong for the 代操 model (a real strategic question — see Open Questions). |

### Switch conditions (when to re-evaluate)

- [ ] Operator draft-edit-rate per client rises above ~30% sustained for 30 days (you are rewriting machine output, so generation quality or relevance is failing; revisit whether an external zh-TW generator has caught up).
- [ ] Any client site shows a >25% organic-traffic drop attributable to a Google core/spam update within 90 days of a publish wave (the bulk-pattern risk materialized, so pause cadence and re-evaluate review-gate strictness, not the build-vs-buy axis).
- [ ] Unique-topic-clusters per client per 30 days falls below 6 (relevance entropy is setting in, so the feedback loop, not the vendor choice, needs fixing).
- [ ] Trigger.dev self-hosted cannot reliably hold idempotency keyed on `(client_slug, date, tier)` at 20+ articles/day (scheduling architecture, not generator, needs revisiting).
- [ ] A zh-TW-native generation API emerges that matches your GEO-capsule + CJK-RankMath-density spec AND exposes a headless API drivable from Trigger.dev (re-run the generator-only sub-decision; the publish spine stays BUILD regardless).

---

## Strategic Assessment

#### Strategic fit
The core of the 代操 business is trustworthy, on-brand, search-and-AI-visible content at scale that a client could not produce themselves. The defensible asset is the compliance-and-publish spine (CJK RankMath + GEO + signed atomic publish), not the act of generating text — text generation is commoditizing monthly. BUILD keeps the moat in-house and rents only the commodity (topic data). Buying the generator would outsource the one thing that distinguishes AwareWave output from any client running CyberSEO themselves.

#### Competitive implications
Enables: a per-client content quality and consistency no DIY-plugin client can match, because your spine encodes zh-TW + GEO + cannibalization-protection knowledge that off-the-shelf tools lack. Forecloses: nothing strategic — the narrow Perplexity/Trends/RSS BUY is trivially swappable. The risk it creates: if relevance entropy sets in, your differentiated output regresses toward exactly the generic blog content a client could buy off-the-shelf, erasing the moat silently.

#### Org capability reality check
Small team. The capability you HAVE: building and operating the spine (proven — it exists and works). The capability gap: sustaining probabilistic output quality across many clients over time without a human reading every article. This is the real execution risk, and it is why the optional outline-review gate and the relevance-entropy metrics are load-bearing, not nice-to-have. Failure mode if the gap persists: green dashboards, drifting content, late-surfacing churn.

#### 3-year strategic horizon
- **Year 1:** Spine completed; cadence proven on 2–3 anchor clients; review-gate ON by default, relaxing per-client as trust is earned. Moat intact.
- **Year 2:** Cadence across full client base; the per-client Brand KB (§8.6) feedback loop is what keeps each client distinctive; this is where relevance entropy either gets managed or quietly compounds.
- **Year 3:** Generation models will have improved industry-wide; because you own the spine and only rent topic data, you swap to a better/cheaper model with a prompt + provider change — no migration. A BUY-generator path would, by Year 3, have locked you to a vendor roadmap and pricing on the most volatile component.

---

## Tradeoff Matrix

Scores 1–10, relatively calibrated within the candidate set. Asterisk (*) marks weighted dimensions (business_strategy mode weight vector).

| Dimension | BUILD+narrow-BUY | BUY (CyberSEO) | BUY (Journalist/GetGenie) | HYBRID (ext Tier-A) | Weight |
|-----------|:---:|:---:|:---:|:---:|:---|
| Strategic alignment | 9 | 3 | 3 | 6 | * High |
| Competitive position | 9 | 3 | 4 | 6 | * High |
| Org capability fit | 7 | 5 | 5 | 5 | * High |
| 3-year TCO | 8 | 5 | 4 | 5 | * High |
| Time-to-value | 6 | 7 | 7 | 6 | Medium |
| Lock-in risk | 9 | 3 | 3 | 5 | Medium |
| Legal / contract risk | 8 | 5 | 5 | 6 | Medium |
| Technical fit (zh-TW+GEO+publish contract) | 9 | 2 | 3 | 6 | Medium |
| Security posture (signed publish kept) | 9 | 3 | 3 | 7 | Medium |
| Operational complexity | 6 | 6 | 6 | 4 | Low |
| Skeptic resistance | 7 | 3 | 3 | 5 | — |
| Google-policy / domain fit | 8 | 2 | 3 | 6 | — |
| **Weighted total** | **8.3** | **3.7** | **3.9** | **5.7** | |

**Weighting rationale:** business_strategy mode elevates strategic alignment, competitive position, org-capability fit, and 3-year TCO. Here those four all point the same way: the differentiating, durable asset is the spine, and the only honest weakness of BUILD (time-to-value, ops complexity for a small team) is mid-weight, not decisive. Time-to-value is BUILD one genuine relative loss (6 vs 7) — you finish orchestration rather than installing a plugin — but the gap is one of weeks, against a 3-year horizon.

---

## Pre-mortem Analysis

*Stage 12 — assume the recommendation has failed 18 months from now; work backwards.*

**Failure scenario (18 months out):**
It is December 2027. The pipeline ran flawlessly the whole time — 2 articles/day/client, every one passing the Quality Gate and Semantic Coverage Gate ≥75, every one RankMath-green, every one with a GEO capsule and images, every one published via signed Bridge with zero corruptions. The dashboards were green for 18 straight months. Yet three clients churned in Q4 2027, each citing some version of "the articles stopped sounding like us" or "this reads like every other blog in our industry." Post-mortem review of 6 months of output reveals that by month 10, ~70% of each client articles were functionally interchangeable across clients in the same vertical — same trending topics (because Perplexity/Trends surface the same industry-wide signals to everyone), same evergreen angles, same structure. The content was individually high-quality and collectively generic. No metric ever flagged it because every quality metric measured each article in isolation.

**Primary cause:**
**Relevance entropy — there was no explicit per-client distinctiveness signal in the loop, so output drifted toward the industry mean, and the native quality metrics were structurally blind to it.** This is not a quality failure (each article was good) and not a technical failure (the system did exactly what it was told). It is a measurement gap: RankMath score, GEO readiness, word count, and even Semantic Coverage all evaluate an article against a topic, never against this client prior body of work or distinct positioning. The Brand Knowledge Base (§8.6) existed but was used as a generation input, never as a drift detector.

**Contributing factors:**
1. Topic discovery (Perplexity/Trends/RSS) is inherently convergent — it surfaces what is trending in an industry, which is identical for all clients in that industry, so the timely Tier-A articles converge fastest.
2. The review gate, relaxed per-client as trust was earned (correctly, for efficiency), removed the one human who would have noticed the sameness — automation success quietly disabled the only entropy detector.
3. No instrumented signal for how different is this client content corpus from the vertical baseline.
4. Operator draft-edit-rate was tracked in aggregate, not per-client, so the early signal (rising edits on the drifting clients) averaged out against the stable ones.

**Earliest warning signal (ignored / undetected at the time):**
Around month 4–5, the operator qualitative sense that they were tweaking the intro to make it feel more like the client more often — but this was never quantified, so it read as normal polishing rather than a trend. The first observable signal would have been a rising per-client draft-edit-rate and a falling count of unique topic clusters per client — neither of which was instrumented, because all the dashboards were (correctly, but insufficiently) measuring per-article quality.

**What the debate room missed:**
The Advocates argued generation quality; the Skeptic attacked Google-penalty and vendor lock-in; the reviewers covered cost, ops, security, and compliance. Every one of them measured the article, never the corpus. The entire debate implicitly assumed that if each article is good and on-topic and compliant, the system is healthy. The pre-mortem new information is that **per-article excellence and per-client distinctiveness are orthogonal axes, and only the first was being measured** — a fully-automated, individually-excellent pipeline can degrade the business while every dashboard stays green. This is genuinely new: it is not in the Risk Register quality-drift or Google-penalty rows (those are about articles getting worse or non-compliant; this is about articles staying individually perfect while collectively converging).

**Pre-mortem additions to Risk Register:**
| New risk | Likelihood | Severity | Mitigation |
|----------|:---:|:---:|------------|
| Relevance entropy: per-client content converges to industry mean while all per-article metrics stay green | med | high | Instrument per-client distinctiveness: (a) unique-topic-clusters per client per 30 days; (b) per-client draft-edit-rate trend; (c) periodic corpus-vs-vertical-baseline embedding distance. Feed Brand KB (§8.6) as a constraint, not just a seed. Keep a recurring human spot-read per client even after the gate relaxes. |
| Review-gate relaxation removes the only entropy detector | med | med | Tie gate relaxation to the distinctiveness metrics being green, not just per-article quality. Never relax to fully-blind for a client without a standing monthly corpus spot-read. |

**Impact on confidence:**
New finding, mitigable but execution-dependent and easy to under-prioritize, so lower confidence by 0.04, from 0.84 to 0.80. Not larger, because the mitigation (two new metrics + one constraint wiring) is concrete and cheap; not zero, because a small team under load is exactly who skips soft distinctiveness instrumentation in favor of shipping the cadence.

---

## Executive Plan

*(business_strategy mode: includes change-management + first-90-day milestones + exit criteria, not just technical install.)*

| Phase | Duration | Goal |
|-------|:---:|------|
| P1 | 2 days | Topic-discovery feed: Perplexity + Google Trends + per-client RSS allowlist to normalized daily candidate list per client |
| P2 | 3 days | Two-tier generation job: Trigger.dev cron to tier-select to `/api/content/generate` x2 (A ~1500 timely, B ~3500 evergreen), idempotency keyed `(client_slug, date, tier)` |
| P3 | 2 days | Optional outline-review gate: generate H2/H3 outline, hold for editable approval (per-client toggle), resume to full generation |
| P4 | 2 days | Image + optional video: `/api/content/image` (Flux) featured + in-article; video-embed slot (optional) |
| P5 | 2 days | Publish through existing `/api/content/publish` to WP Bridge (signed, Kadence, ILJ, RankMath, atomic read-back + auto-rollback) — integration test only, asset exists |
| P6 | 2 days | Quality + distinctiveness observability: Quality Gate / Semantic Coverage ≥75 wiring + the two pre-mortem metrics (per-client draft-edit-rate, unique-topic-clusters/30d) |
| P7 | 1 day | Runbook + per-client config schema in `agency-os/tenants/<slug>` (tier prompts, RSS allowlist, gate on/off, Brand KB ref) |
| P8 | 3 days | Limited production: 1 anchor client, gate ON, daily cadence, full observability |

**Total:** ~17 working days (one operator), of which only P5 is wire-existing-asset, the rest is net-new glue.

<details>
<summary>Detailed phases (tasks / deliverables / success criteria / rollback)</summary>

**P1 — Topic discovery.** Tasks: Perplexity web-grounded daily-trend query per client industry; Google Trends rising-queries pull; per-client RSS allowlist fetch + dedupe; normalize to candidate list with (topic, tier-hint, freshness, source). Deliverable: `topicCandidates(clientSlug, date)` returning ranked list. Success: 1 anchor client yields >=10 distinct candidates/day, >=3 client-industry-specific (not generic). Rollback: feed is read-only; disabling reverts to manual topic entry.

**P2 — Two-tier job.** Tasks: Trigger.dev scheduled task; tier selection (A timely from freshest candidate, B evergreen from highest-authority gap per §21 topic-authority map); call `/api/content/generate` with tier-specific prompt + outline support; idempotency key `(client_slug, date, tier)` so re-runs never double-publish. Deliverable: idempotent daily job emitting 2 draft articles. Success: re-running the job for the same `(slug,date)` produces zero duplicate generations. Rollback: disable the Trigger.dev schedule (single toggle); no published artifacts created in this phase.

**P3 — Outline-review gate.** Tasks: when client `reviewGate=on`, generation pauses after outline (H2/H3); operator edits/approves; job resumes to full body. Deliverable: per-client gate toggle + outline approval surface. Success: gate ON holds an article in awaiting-outline-approval indefinitely without publishing; gate OFF runs straight through. Rollback: gate defaults ON (safe state) on any error.

**P4 — Media.** Tasks: `/api/content/image` featured + N in-article (Flux Schnell); optional video-embed slot honored if client config provides a source. Deliverable: article draft carries featured + in-article image URLs + optional embed. Success: images sideload into WP media via Bridge with featured set. Rollback: on image failure, publish text-only with a flagged missing-media status rather than blocking (configurable).

**P5 — Publish integration.** Tasks: route approved drafts through existing `/api/content/publish` to WP Bridge. NO Bridge changes. Deliverable: end-to-end generate-to-publish on staging client. Success: signed publish, Kadence blocks render, ILJ keywords + RankMath meta set, read-back verify passes, a deliberately corrupted payload triggers auto-rollback. Rollback: Bridge own atomic read-back + auto-rollback is the rollback.

**P6 — Observability.** Tasks: wire Quality Gate + Semantic Coverage (≥75) pass/fail per article; instrument per-client draft-edit-rate and unique-topic-clusters/30d (pre-mortem metrics); dashboard. Deliverable: per-client content-health view. Success: all four signals visible per client; distinctiveness metrics have a 7-day baseline before scaling. Rollback: observability is additive, no rollback needed.

**P7 — Config + runbook.** Tasks: extend `agency-os/tenants/<slug>` schema (tier prompts, RSS allowlist, gate flag, Brand KB ref §8.6); write operating runbook. Deliverable: documented per-client config. Success: a new client can be onboarded to the pipeline via config only.

**P8 — Limited production.** Tasks: 1 anchor client live, gate ON, daily, full obs, daily operator spot-read. Deliverable: 14 consecutive days of clean cadence. Success: Go/No-Go gate for Wave 1 (see Rollout).

</details>

**Deliberately omitted (and why):**
- **Auto video generation** — only an optional embed slot; full AI video gen is a separate decision, add post-Wave-2 if clients ask.
- **Fully-blind (no-gate) operation for any client** — withheld until distinctiveness metrics prove stable; the gate is the entropy detector during ramp.
- **External Tier-A generator A/B test** — only run if the 90-day in-house Tier-A quality gap materializes (it is a switch condition, not day-1 work).

**Change management / stakeholder + comms:**
- Internal: operator owns the pipeline; the spot-read ritual is explicitly a job, not optional polish.
- External (clients): the optional outline-review gate is also a client-trust feature — offer high-touch clients outline visibility; it doubles as the relevance check.

**Exit criteria (if the strategy is not working):** if after Wave 1 (1 client, 30 days) operator draft-edit-rate exceeds ~40% sustained OR any Google-policy traffic drop occurs, halt rollout and revisit gate strictness / generation prompts before adding clients — do NOT push the cadence to more sites to average out the problem.

---

## Rollout Plan

| Wave | Scope | Duration | Blast radius |
|------|-------|:---:|:---:|
| W1 | 1 anchor client, gate ON, daily | 2–4 weeks | Low |
| W2 | 2–3 clients, gate ON, distinctiveness metrics watched | 3–4 weeks | Low-med |
| W3 | ~half client base, gate selectively relaxed where metrics green | 4–6 weeks | Med |
| W4 | Full base, per-client gate policy by metric health | ongoing | High (validated by now) |

**Communication plan:** each new client onboarded to pipeline gets an internal config-review note; high-touch clients offered outline-gate visibility as a feature.

**Global rollback:** disable the Trigger.dev schedule (single toggle) to stop cadence immediately; already-published content is unaffected and was always signed/verified. No data loss path exists because publish is atomic with read-back + auto-rollback.

<details>
<summary>Detailed waves (Go/No-Go)</summary>

- **W1 to W2 Go/No-Go:** 14 consecutive clean days; draft-edit-rate <=30%; zero publish corruptions; baseline distinctiveness metrics captured.
- **W2 to W3 Go/No-Go:** distinctiveness metrics stable or improving across all 3 clients; no client feedback about generic; no Google-policy traffic anomaly.
- **W3 to W4 Go/No-Go:** gate-relaxed clients show stable distinctiveness for 30 days; monthly corpus spot-read process is running and documented.

</details>

---

## Risk Register

*(augmented by Stage 12 pre-mortem — last two rows)*

| Risk | Likelihood | Severity | Mitigation | Owner |
|------|:---:|:---:|------------|-------|
| Google scaled-content-abuse / site-reputation penalty on a client site | med | catastrophic (kills whole site, not one article) | Keep §3.2 anti-bulk discipline; Quality + Semantic (≥75) + Fact-Check gates mandatory; review-gate ON during ramp; cap velocity per new site; monitor organic traffic per client | Operator |
| zh-TW RankMath false CJK scores (English-first scoring quirks) | med | med | Generation already CJK-tuned for focus-keyword density; validate RankMath score against actual zh-TW rendering on a real site before trusting the number; keep `power_words` filter | Operator |
| Quality drift in probabilistic output over time | med | med | Eval/spot-read per client; Quality Gate; prompt versioning; draft-edit-rate trend as drift proxy | Operator |
| Client-relevance miss (topic surfaced not matching client actual audience) | med | med | Per-client RSS allowlist + Brand KB §8.6 as generation constraint; outline-review gate for high-touch clients | Operator |
| Image / video failure (Flux down, embed source dead) | low | low | Configurable fallback: publish text-only with missing-media flag rather than block cadence | Operator |
| Trigger.dev self-hosted job failure / double-publish | low | med | Idempotency key `(client_slug, date, tier)`; Bridge atomic publish prevents double-write; job alerting | Operator |
| Vendor (Perplexity/Trends/RSS) feed outage | low | low | Feeds are interchangeable + non-critical-path; fallback to manual topic entry; no lock-in | Operator |
| **Relevance entropy: per-client convergence to industry mean, dashboards stay green** *(pre-mortem)* | med | high | Instrument unique-topic-clusters/30d + per-client draft-edit-rate + periodic corpus-vs-vertical embedding distance; Brand KB as constraint; standing monthly corpus spot-read | Operator |
| **Gate relaxation removes the only entropy detector** *(pre-mortem)* | med | med | Tie relaxation to distinctiveness metrics green (not just per-article quality); never fully-blind without monthly corpus spot-read | Operator |

---

## Observability Plan

*How to detect post-deployment whether this decision is working or failing.*

### Success metrics

| Metric | Target | Current baseline | Measurement |
|--------|--------|------------------|-------------|
| Articles published / client / day | 2 (1 A + 1 B) | 0 (not live) | Trigger.dev job success + Bridge publish confirm |
| Quality Gate + Semantic Coverage pass rate | >=95% pass, Semantic >=75 | unknown | Per-article gate result |
| Signed-publish read-back verify success | 100% (auto-rollback on fail) | n/a (Bridge proven) | WP Bridge read-back log |
| Per-client draft-edit-rate *(pre-mortem)* | <=30% sustained | unknown | Operator edit delta vs generated draft, **tracked per client** |
| Unique topic clusters / client / 30d *(pre-mortem)* | >=6 | unknown | Embedding-cluster count over client 30-day corpus |
| Per-client organic traffic | stable/up, no >25% drop on core-update | per-client baseline | Search Console / analytics per client |

### Alert thresholds

| Condition | Threshold | Action | Escalate to |
|-----------|-----------|--------|-------------|
| Client organic traffic drop after publish wave | >25% within 90d of a Google update | Pause that client cadence; review gate strictness | Operator |
| Per-client draft-edit-rate | >30% for 30 days | Investigate relevance/quality drift for that client | Operator |
| Unique topic clusters / client | <6 / 30d | Relevance entropy alert — fix feedback loop before scaling | Operator |
| Publish read-back verify failure | any | Auto-rollback (Bridge) + alert | Operator |
| Quality/Semantic gate fail rate | >5% | Prompt/model review | Operator |

### Instrumentation checklist (must exist before go-live)
- [ ] Trigger.dev job success/failure + idempotency-key logging
- [ ] Quality Gate + Semantic Coverage (≥75) result logged per article
- [ ] WP Bridge read-back verify / auto-rollback events logged
- [ ] **Per-client draft-edit-rate instrumented (NOT aggregate)** — pre-mortem
- [ ] **Unique-topic-clusters/30d per client instrumented** — pre-mortem
- [ ] Per-client organic-traffic dashboard (Search Console) wired
- [ ] 7-day distinctiveness baseline captured before W2

### Failure detection
*(integrates pre-mortem early-warning signals)*

**Early warning (weeks 1–4):** rising per-client draft-edit-rate; any gate fail-rate spike; any read-back failure. **Pre-mortem signal:** watch per-client draft-edit-rate trend, not just level — a slow rise is the entropy tell.

**Mid-term validation (months 1–3):** unique-topic-clusters/client holding >=6; no client this-is-generic feedback; per-client organic traffic stable/up; the corpus-vs-vertical embedding distance not shrinking.

**Rollback trigger:** if any client organic traffic drops >25% attributable to a Google update, OR draft-edit-rate >40% sustained, halt rollout (disable Trigger.dev schedule) and revisit gate/prompts per Risk Register before re-enabling.

---

## Decision Review Cadence

### Scheduled reviews

| Review | Date | Focus | Owner |
|--------|------|-------|-------|
| 30-day check | 2026-07-15 | Wave-1 health, publish integrity, early draft-edit-rate + distinctiveness baseline | Operator |
| 90-day check | 2026-09-13 | Full metrics vs target; Tier-A vs Tier-B quality gap (HYBRID switch-condition test); any Google-policy signal | Operator |
| 1-year review | 2027-06-15 | Strategic fit; relevance-entropy trend; TCO actual vs est; re-confirm generator-buy still rejected (model landscape moves) | Operator |

### Unscheduled review triggers
- [ ] Any switch condition triggered (see Recommendation)
- [ ] Pre-mortem signal: unique-topic-clusters/client <6 OR draft-edit-rate trending up
- [ ] Google core/spam update with measurable client-traffic impact
- [ ] Perplexity/Trends/RSS pricing or availability change (low impact — swappable)
- [ ] A zh-TW-native headless generation API matching your GEO+CJK spec appears

### Per-review checklist
1. Run observability metrics — on target?
2. Check switch conditions — any triggered?
3. Distinctiveness metrics green per client?
4. Re-confirm the two top rejected options (HYBRID Tier-A; generator-buy) — has the zh-TW tooling landscape changed?
5. Record summary in WORKLOG; if a switch condition fired, re-run `/decide`.

---

## Open Questions

1. **Is 2 articles/day/client the right cadence at all, or does it itself risk the bulk-pattern signal?** — The brief specifies it, but velocity is the single biggest input to Google scaled-content-abuse risk. Worth a deliberate per-client ramp (start <2/day on a new site) rather than 2/day from day one. Affects rollout velocity, not the build-vs-buy decision.
2. **Where does the per-client distinctiveness constraint live?** — Brand KB §8.6 exists as a generation seed; making it a drift detector needs a defined corpus-baseline. Decide whether that is an embedding store per client or a simpler tag/topic ledger.
3. **Outline-gate default policy** — ON for all during ramp is recommended; per-client relaxation policy (tie to metrics) needs to be written into the tenant config schema.

---

## ADR Skeleton

*For a decision shaping architecture/operations 6+ months — promote to a binding ADR.*

```
Title: Build the automated daily zh-TW content pipeline on the existing stack; buy only topic-discovery data
Date: 2026-06-15
Status: Proposed

Context:
AwareWave needs a fully-automated daily pipeline publishing 2 RankMath/GEO-compliant
zh-TW articles per client per WP site. A content-engine (/api/content/generate +
/api/content/publish + Replicate image), an Ed25519-signed WP Bridge publish contract,
self-hosted Trigger.dev, and an anti-bulk SSOT already exist. Off-the-shelf generators
are English-first and bypass/conflict with the publish contract.

Decision:
Build the orchestration spine (topic discovery + two-tier generation job + optional
outline-review gate + observability) on the existing stack; buy only commodity
topic-discovery data (Perplexity + Google Trends + per-client RSS); reject all
off-the-shelf generators and reject RankMath Content AI as a generator.

Consequences:
  Positive:
  - Keeps the defensible moat (CJK RankMath + GEO + signed atomic publish) in-house
  - Avoids re-introducing the bulk pattern Google now penalizes
  - Year-3 model swap is a prompt/provider change, not a vendor migration
  Negative:
  - Time-to-value is weeks of orchestration vs installing a plugin (Skeptic-confirmed)
  - Sustaining probabilistic quality + per-client distinctiveness across many clients
    is the real ongoing execution burden for a small team

Pre-mortem primary failure mode:
Relevance entropy — per-client content converges to the industry mean while every
per-article quality metric stays green, surfacing as late client churn.

Switch conditions:
- Draft-edit-rate per client >30% sustained 30d, OR a zh-TW headless generator matching
  the GEO+CJK spec appears -> re-run the generator-only sub-decision (spine stays BUILD)
- Unique-topic-clusters/client <6/30d -> fix the feedback loop
- Client traffic >25% drop on a Google update -> pause cadence, revisit gate strictness

Review date: 2026-09-13 (90-day), 2027-06-15 (1-year)
```

-> Save as: `docs/architecture/decisions/ADR_[NNN]_build-zh-tw-content-pipeline.md`
-> Register in: `docs/architecture/decisions/ADR_INDEX.md`

---

## Full Debate Transcript

<details>
<summary>Click to expand the multi-agent debate</summary>

### Stage 1 — Topic Analysis
Classification: build-vs-buy with a strong tool-selection sub-decision; `topic_type = business_strategy` (significant non-technical dimensions: competitive positioning of a 代操 agency, org capability of a small team, multi-client revenue impact). Gaps identified were minimal because the brief is unusually well-specified (existing assets enumerated, axes named, output sections listed) — no clarification round needed. Assumptions surfaced: BUY realistically means buy a generator and keep the publish spine; full automation is a hard requirement; zh-TW is non-negotiable.

### Stage 4 — Candidate Discovery
- **BUILD + narrow-BUY** (finish spine, rent topic data). research_facts: content-engine + Bridge + Trigger.dev already exist and fit the shape. research_unverified: exact remaining glue effort.
- **BUY CyberSEO Pro.** research_facts: RSS-autopilot WP plugin, English-first, publishes via own path, bulk keyword runs. [WebSearch-confirmed feature shape.]
- **BUY Journalist AI / GetGenie.** research_facts: SaaS generators, multilingual claims, credit/seat pricing, weak zh-TW focus-density. research_unverified: precise zh-TW RankMath density behavior [unverified].
- **BUY RankMath Content AI as generator.** research_facts: in-wp-admin assistant/scorer, not a headless cron-drivable generation API.
- **HYBRID (external Tier-A generator + BUILD Tier-B).**
- **BUILD full rebuild** (new orchestration).
- **Status quo** (manual).
Google enforcement context [WebSearch-confirmed]: March 2026 core update enforced scaled-content-abuse / site-reputation-abuse; sites running unreviewed bulk AI saw 50–80% traffic drops; AI content not banned per se — low-value-at-scale is.

### Stage 6 — Opening positions (R1, business framing)
- **BUILD advocate:** the moat is the spine, not the text; renting the generator rents what defines you; opportunity cost of buying = lock-in on the most volatile component (the model).
- **CyberSEO advocate:** fastest time-to-value; turnkey RSS-to-post; you are a small team, stop building.
- **Journalist/GetGenie advocate:** managed quality, no infra, multilingual; let a specialist own generation.
- **HYBRID advocate:** use the best generator for timely Tier-A where freshness matters; keep BUILD for the authoritative Tier-B.

### Stage 7 — Cross-examination (R2)
- BUILD to CyberSEO: your tool bypasses the WP Bridge — you lose Ed25519 signing, atomic read-back, auto-rollback. Either you accept corruptible live publishes or you feed output back through my Bridge, keeping all my build cost. Which? CyberSEO advocate conceded the latter.
- BUILD to Journalist/GetGenie: show me your zh-TW focus-keyword density and a GEO answer-capsule equivalent. You cannot, because they are English-first. Conceded weakness on CJK density.
- HYBRID to BUILD: your in-house Tier-A timely quality is unproven vs a specialist. BUILD: granted — that is a 90-day test and a switch condition, not a reason to add a second compliance surface now.
- BUILD to HYBRID: two generators = two prompt-drift problems + two Google-policy origins for a solo operator; and your external Tier-A cannot see the Brand KB, so it drifts generic first. HYBRID had no clean answer.

### Stage 8 — Reviewer outputs
- **Security Reviewer:** SUPPORTS BUILD — any BUY that bypasses the signed Bridge removes the atomic read-back + auto-rollback that protects live client sites; keeping the publish contract in-house is the secure choice.
- **DevOps Reviewer:** CONCERNS on BUILD solo-team ops load, but notes Trigger.dev self-hosted already runs and the idempotent-cron shape is simple; net SUPPORTS BUILD over adding a vendor in the critical path.
- **Cost Reviewer:** 3-year TCO favors BUILD+narrow-BUY — generator subscriptions scale per-volume/seat (600 articles/mo), while BUILD marginal cost is model tokens you would pay regardless; topic-data feeds are cheap and swappable.
- **Product Reviewer:** SUPPORTS — the product is differentiated zh-TW+GEO+on-brand content; an off-the-shelf generator produces what a client could buy themselves, eroding the 代操 value prop.
- **Customer Voice (business_strategy mandatory):** clients churn on this-does-not-sound-like-us, not on cadence; the outline-gate-as-feature and per-client distinctiveness matter more than raw speed — foreshadows the pre-mortem.
- **Legal Reviewer (business_strategy mandatory):** off-the-shelf SaaS generators add data-processing + content-IP + ToS terms across many client sites; BUILD keeps content provenance and IP clean; topic-data feeds (Perplexity/Trends/RSS) are low-risk read-only.
- **AI/ML Specialist:** Cost shape — output tokens dominate at 3500-word Tier-B; ~600 articles/mo is meaningful but model-swappable. Inference quality risk Medium — requires an eval/spot-read suite; you cannot trust RankMath-green as quality, especially with CJK scoring quirks. Lock-in: BUILD = Low (prompts are yours, provider swappable); BUY-generator = High (prompt + vendor roadmap lock-in on the most volatile component). Verdict: SUPPORTS BUILD; mandates an eval loop. (This eval mandate is what the pre-mortem later shows was necessary-but-insufficient — evals measure articles, not corpus distinctiveness.)
- **WordPress Specialist:** off-the-shelf tools do not emit Kadence blocks, do not drive Internal Link Juicer, do not set CJK-tuned RankMath meta; they would fight the publish contract. SUPPORTS BUILD; keep RankMath as scorer, never as generator.

### Stage 9 — Skeptic findings (fatal flaw per candidate)
- BUILD+narrow-BUY: fatal-flaw candidate = small-team capacity to sustain probabilistic quality across many clients; mitigable via gate + evals, but real.
- CyberSEO: bypasses signed Bridge OR keeps all build cost — negative-value integration; embodies the forbidden bulk pattern.
- Journalist/GetGenie: English-first zh-TW; vendor in critical path; per-volume cost.
- RankMath-as-generator: not headless/cron-drivable — disqualified for full automation.
- HYBRID: doubles the hardest-to-maintain surface for the lowest-value half; external Tier-A blind to Brand KB.
- Full rebuild: discards working Trigger.dev — pure cost.
- Status quo: fails the brief.

### Stage 10 — Tradeoff matrix working notes
business_strategy weight vector applied (strategic alignment / competitive position / org-fit / 3yr-TCO = High). BUILD scores 8–9 on all four High-weight axes; its only sub-7 scores are time-to-value (6) and ops complexity (6) — both mid/low weight. BUY options score 2–5 on the High-weight strategic axes (they outsource the moat). HYBRID is the only BUY-flavored option above 5 weighted (5.7) because it retains BUILD for Tier-B.

### Stage 11 — Judge synthesis (with recency_bias_check)
Ranking: 1) BUILD+narrow-BUY (8.3) 2) HYBRID (5.7) 3) Journalist/GetGenie (3.9) 4) CyberSEO (3.7). The decisive factor is that BUY in this context degenerates to rent the one component you are best at while keeping everything else, which fails strategic-alignment and lock-in simultaneously. **recency_bias_check: confirmed** — the recommendation is NOT driven by recency hype (it actively rejects the trendy off-the-shelf AI-SEO tools and the just-buy-AI reflex); it favors the boring, owned, self-hosted spine. Pre-pre-mortem confidence 0.84.

### Stage 12 — Pre-mortem
Full working: assumed 18-month success on every measured axis, then asked how did the business still lose. Worked backward from client churn -> sounds-generic feedback -> corpus convergence -> discovered the measurement gap: every metric is per-article, none is per-corpus/per-client-distinctiveness. Identified relevance entropy as a NEW failure mode orthogonal to quality-drift and Google-penalty (both already in the Risk Register). Earliest signal: per-client draft-edit-rate rising + unique-topic-clusters falling — neither instrumented. Mitigation wired into Risk Register (2 new rows) and Observability (2 new metrics + baseline requirement). Confidence -0.04 -> **0.80**.

</details>

---

## Document Metadata

- **Generated by:** AI Decision Intelligence System
- **Pipeline stages completed:** 1–19 + auto-save
- **Participating agents:** Topic Analyzer, Research Agent, Advocate x4, Security Reviewer, DevOps Reviewer, Cost Reviewer, Product Reviewer, Customer Voice, Legal Reviewer, Installation/Executive Planner, Rollout Planner, Skeptic, Judge, Pre-mortem
- **Specialists added:** AI/ML, WordPress (2 of 3 cap; FinOps not triggered — topic-data spend is immaterial)
- **Confidence:** 0.80 — 0.84 pre-pre-mortem, -0.04 for relevance-entropy execution risk
- **Recency bias check:** confirmed (rejects trendy off-the-shelf AI-SEO tools in favor of owned self-hosted spine)
- **Pre-mortem new finding:** relevance entropy — per-client convergence to industry mean while per-article metrics stay green; orthogonal to existing quality-drift/Google-penalty risks
- **Next review:** 2026-07-15 (30-day)

---

## Sources

- `docs/wp-kadence-ai-seo-geo-content-engine.md` — content-engine SSOT (§3.2 anti-bulk, §8.6 Brand KB, §21/§21.5 topic-authority/cannibalization, Quality + Semantic Coverage ≥75 + GEO readiness gates)
- WebSearch — Google March 2026 core update scaled-content-abuse / site-reputation-abuse enforcement (50–80% traffic drops on unreviewed bulk AI); AI content not banned, low-value-at-scale is [confirmed via search]
- WebSearch — CyberSEO Pro (RSS-autopilot, English-first, own publish path), RankMath Content AI (in-wp-admin scorer, not headless), Journalist AI / GetGenie (SaaS generators, multilingual, weak zh-TW focus density [unverified on exact CJK behavior])
