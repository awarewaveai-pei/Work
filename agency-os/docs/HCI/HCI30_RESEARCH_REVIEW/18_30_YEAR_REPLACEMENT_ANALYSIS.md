# 18 30-Year Replacement Analysis

> For every vendor/tool this architecture depends on: if it disappeared, could HCI-30 be moved to a replacement without rewriting the Domain Core? Grounded in evidence from all 9 reviews where they addressed a given vendor directly; extended by the architect using the same reasoning framework where no reviewer covered a specific vendor (marked `[extension, not reviewer-sourced]`).

---

## Verdict summary

| Vendor / dependency | Replaceable without touching Domain Core? | Confidence |
|---|---|---|
| LLM providers (OpenAI, Anthropic, others) | **Yes, if V1's Invariant 4 is actually enforced in code** — currently only a principle, not a tested abstraction. | Medium |
| Supabase (self-hosted) / PostgreSQL | **Yes for PostgreSQL itself; No for Supabase-specific features if used directly** | High (Postgres) / Medium (Supabase) |
| Cloudflare | **Yes** — DNS/CDN/WAF are edge-layer, already proven swappable this session (see below) | High |
| Docker / container runtime | **Yes** — docker-compose is a thin, well-understood layer; OCI images are portable | High |
| Frontend framework (current: Next.js) | **Conditionally** — depends on whether business logic leaks into components | Medium |
| Payment provider | **Not yet assessed anywhere in the blueprint — no provider is even named** | Low (untested) |
| OVH (hosting) | **Yes at the infra layer; No at the "already rehearsed" layer** | Medium — see TD/RISK on unrehearsed cross-box restore |

---

## Detail per vendor

### LLM providers (OpenAI, Anthropic, etc.)
V1's own Invariant 4 (01:61-68) explicitly forbids "a single proprietary vector database, a single LLM provider with no abstraction layer" as unacceptable lock-in — the *principle* is correct and was written with exactly this test in mind. Reviewer E confirms the mechanism partially exists: AI LEGO already has a model/prompt-registry gap self-flagged in its own `GAP_REGISTER.yaml` (independently corroborated by HCI's blueprint proposing the *same* registry under a *different* name — see `17_TECH_DEBT_PREVENTION.md` TD-7). **The gap**: a principle stating vendor-neutrality is required is not the same as a tested abstraction layer. Until a model registry + swap test actually exists and is exercised (e.g., a CI job that runs the same eval suite against two different providers and asserts equivalent-shape output), "we could switch" is unverified. Reviewer H's RT-12 adds the sharper, related point: even *replay* of a historical run has no defined behavior when the specific model version referenced is later retired — a near-certainty on 12-24 month vendor cycles over a 30-year horizon. **Recommendation**: build the model registry once (shared between HCI and AI LEGO, per TD-7), and treat "can this system run entirely on a different LLM vendor" as a testable, periodically-exercised property, not an aspiration.

### Supabase (self-hosted) / PostgreSQL
Two different questions collapse into one in the blueprint and should be separated. **PostgreSQL itself** is, per Reviewer B, "a 30-year-proven, license-free, single-vendor-independent standard" — the safest dependency in the entire stack, and Option A in `13_ARCHITECTURE_OPTIONS_MATRIX.md` was chosen partly *because* of this. **Supabase** is the self-hosted distribution wrapping Postgres (Auth, PostgREST, Realtime, Storage). If HCI-30's code calls Supabase-specific client SDKs, RLS-via-Supabase-Auth-JWT patterns, or Supabase Storage APIs directly throughout the domain layer, replacing Supabase (while keeping Postgres) becomes a real rewrite of the data-access layer, even though the underlying database survives untouched. No reviewer found evidence either way on how tightly HCI-30's (not-yet-written) code would couple to Supabase-specific APIs versus plain Postgres/SQL. **This is a genuine open design constraint, not yet decided**: recommend the Domain Core talk to PostgreSQL via a thin repository layer that does not import Supabase client libraries directly outside of an explicitly isolated adapter module — the same "capability abstraction pattern" doc 18 (LEGO Contract) already specifies for other external dependencies, just not yet named for Supabase specifically.

### Cloudflare
Not directly reviewed by name in the 9 independent reviews, but this session's own DNS/nginx work (see this session's earlier chapters) is itself the empirical proof: DNS, edge proxying, and WAF for the entire AwareWave stack already sit behind Cloudflare with the origin (`ks-aw-01`) doing real work independently — Cloudflare set to "Full" SSL mode, not "Flexible," meaning the origin doesn't depend on Cloudflare-specific trust assumptions. `[extension, not reviewer-sourced]` If Cloudflare disappeared, DNS and CDN/WAF would need a replacement (any registrar + any CDN, or none), but no HCI-30 domain logic would need to change — this dependency is correctly kept at the edge, outside the Domain Core, exactly where V1's layering principle says it should be.

### Docker / container runtime
Not directly reviewed by name, but Reviewer D's verification that `sg-deploy.sh` and the existing docker-compose pattern are already production-proven implies the dependency is on the OCI container format and docker-compose orchestration syntax, not on Docker Inc. specifically. `[extension, not reviewer-sourced]` Podman and other OCI-compatible runtimes are drop-in-compatible at the compose-file level for the vast majority of real-world usage; this is a low-risk dependency by construction, provided no Docker-specific (non-OCI-standard) feature is relied upon.

### Frontend framework (current stack precedent: Next.js, per the existing next-admin app)
`[extension, not reviewer-sourced]` No reviewer examined this directly since no HCI-30 frontend code exists yet. The generic risk: if business logic (evidence-quality calculations, risk-tier gating, decision workflows) lives inside React components rather than the domain/API layer, a framework migration becomes a domain-logic rewrite, not a UI rewrite. Doc 19 (UI/Reporting/Explainability) should be read alongside this concern once implementation starts — the explainability requirements it describes (confidence breakdowns, bias-check displays, "what did we know when") are exactly the kind of logic that is tempting to compute client-side and easy to accidentally couple to the framework. **Recommendation for whoever writes Wave 1 frontend code**: keep all evidence/confidence/risk-tier computation server-side or in a framework-agnostic shared module: the frontend should only render, never compute, decision-relevant values.

### Payment provider
No document in the 24-file blueprint names a payment provider, and no reviewer found one to evaluate. This is not evidence of good vendor-neutrality — it is evidence the question has not been reached yet, since doc 08's commercial-edition architecture and doc 12's multi-tenancy plumbing describe `Plan`/`Entitlement`/`Subscription` abstractly without wiring to a real billing system. **Flag for `22_OPEN_HUMAN_DECISIONS.md`**: this should be evaluated with the same replaceability lens (Stripe vs. alternatives, webhook coupling, whether billing events flow through the same `Entitlement` abstraction or bypass it) before, not after, a payment integration is actually built.

### OVH (hosting)
Reviewers D and H both treat this as the single most concrete near-term risk in the entire replacement analysis, not a hypothetical 30-year-out concern: the *software* dependency on OVH specifically is low (standard Linux + Docker + PostgreSQL runs anywhere), but the *operational readiness* to actually execute a move is unverified — no cross-box restore drill has ever been rehearsed (see `15_RISK_REGISTER.md`). Replaceability-in-principle and replaceability-in-practice are different claims, and only the first is currently true. This is the one vendor-replacement question in this file where the answer is not "could we," but "have we ever actually proven we could" — and the honest answer, per both reviewers' verified findings, is no.

---

## Cross-cutting observation

The vendors this analysis found genuine, load-bearing risk on (LLM providers via untested abstraction, Supabase via unclear coupling boundary, OVH via unrehearsed restore) are exactly the three that intersect with real, current production behavior — not hypothetical future ones. The vendors with the cleanest story (PostgreSQL, Docker, Cloudflare) are the ones already built on genuinely open, portable standards. This is not a coincidence: V1's own Invariant 4 correctly identifies open-standard dependencies as lower-risk, but the analysis above shows the principle has not yet been converted into a *tested* property for the three dependencies that matter most. See `22_OPEN_HUMAN_DECISIONS.md` for which of these require an explicit operator decision (payment provider selection, Supabase-coupling-boundary discipline) versus which are engineering follow-through on an already-correct decision (rehearsing the restore drill).
