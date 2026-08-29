# 16 Assumption Register

> Every load-bearing assumption identified across all 9 reviewers plus the Convergence synthesis pass, classified VERIFIED / UNVERIFIED / CONTRADICTED. `VERIFIED` means a reviewer executed a falsifiable check (Glob/Read/Bash/SQL/grep) and reported the actual result — not that it 'seems right'. Treat every UNVERIFIED row as a genuine open question for the human architect, not a settled fact.

---

## ASM-01 — `CONTRADICTED`

**Assumption**: EU AI Act employment-sector compliance deadline is either Dec 2027 or Aug 2026 (two retrieved sources disagreed).

**Evidence**: I explicitly ran live web research on 2026-08-29 and found two sources disagreeing on this specific date, and explicitly declined to resolve the disagreement by guessing — flagged in I's own open_risks as requiring re-verification against the official consolidated legal text before any date-sensitive commitment is made.

## ASM-02 — `CONTRADICTED`

**Assumption**: G's review assumed no other reviewer's independent analysis had already surfaced the Tenant/organizations conflation, given the independent-review protocol.

**Evidence**: A (DOM-01), B (CI-9), and D (D-08) all independently surfaced closely related tenant-model concerns from the documentation side, though only G found the concrete shipped-code evidence (0001_core.sql). This does not undermine G's finding — it strengthens it — but it does contradict G's stated assumption of being alone in flagging tenant-model risk; the assumption was reasonable given the no-cross-visibility review protocol but turned out to understate how load-bearing the issue is, since four reviewers converged on it independently.

## ASM-03 — `UNVERIFIED`

**Assumption**: AI LEGO's specs/*.yaml files (evidence.schema.yaml, claim.schema.yaml, epistemic-label.schema.yaml, decision.schema.yaml, risk-tier.schema.yaml, method.schema.yaml) accurately reflect their own 'status: ACTIVE' / 'decided_by: ADR-00X ACCEPTED' headers as currently accepted, not merely drafted-and-pending.

**Evidence**: A and E both independently cite the same file paths, field names, and ADR numbers (strong cross-reviewer corroboration — see convergence row on epistemic-ladder duplication), but neither reviewer independently verified ADR acceptance status against a separate ADR log, and this synthesis pass did not re-open the files directly either. Treat the underlying files' existence and content as well-corroborated; treat their formal 'ACCEPTED' status as reviewer-reported, not independently re-verified here.

## ASM-04 — `UNVERIFIED`

**Assumption**: HCI's future customer distribution will skew Personal/Professional/Team rather than Enterprise-heavy, underlying the recommendation that Tier A (shared DB + RLS) should be the default isolation tier.

**Evidence**: B explicitly flags this as an inference from the ordering of editions in 08's document (Personal listed first), not from any business/market data. No other reviewer independently corroborated or contradicted this.

## ASM-05 — `UNVERIFIED`

**Assumption**: AI coding agents (Claude/Codex) will retain standing SSH/root/DB access to whatever production environment eventually hosts RESTRICTED HCI person data, unchanged from the current operating pattern.

**Evidence**: The general pattern is real today: this session's own project governance documents (CLAUDE.md/AGENTS.md) confirm AI agents do have routine SSH/root access to the current ks-aw-01 stack under documented governance rules. But whether this pattern will apply unmodified to future RESTRICTED HCI data specifically is C's extrapolation (SEC-12) and has not been confirmed by any operational decision documented in the blueprint — the future-application claim itself remains unverified even though the present-day pattern it extrapolates from is real.

## ASM-06 — `UNVERIFIED`

**Assumption**: Aware Wave's actual target customer base includes EU-based tenants and/or EU-linked profiled Persons, underlying the urgency of the EU AI Act / GDPR findings (REG-01 through REG-04, SEC-01).

**Evidence**: I explicitly states this scoping decision 'was not found documented anywhere in the 24 blueprint files' and assumed EU exposure is plausible rather than assumed away, given the .eu-adjacent hostname of the current server and the multi-region ambitions stated in 08. No document confirms or denies target markets.

## ASM-07 — `UNVERIFIED`

**Assumption**: Existing backup scripts (backup-ks-aw-01.sh etc.) use rsync/tar-style backup rather than any object-lock-capable storage.

**Evidence**: D explicitly flagged this as inferred from filename/tooling conventions observed elsewhere in the repo, not from opening and fully reading every backup script's internal implementation — used as supporting (not conclusive) evidence for the WORM-infeasibility finding (D-07).

## ASM-08 — `UNVERIFIED`

**Assumption**: The self-hosted Trigger.dev instance has sufficient sandboxing/isolation headroom to safely run Wave 6's untrusted-content fetch/malware-scan step without a separate isolated runner.

**Evidence**: D explicitly flagged this as an assumption it did not verify. C's independent SSRF finding (SEC-05) specifies isolation requirements (no route to docker-internal bridge network, DNS-pinning, RFC1918/metadata-IP blocklist) that generic Trigger.dev sandboxing was not confirmed to meet by either reviewer — see the DISAGREEMENT convergence row on this exact point; this is more likely false than true given no evidence of network-isolation capability was found, but remains formally unverified.

## ASM-09 — `VERIFIED`

**Assumption**: No implementation exists yet under D:\Work\agency-os\systems\ or shared\ — HCI-30 and the AI LEGO runtime are both 100% pre-code, architecture-only at review time.

**Evidence**: Independently confirmed via Glob/Bash by at least six of nine reviewers (A, B, C, D, E, G) with consistent negative results across separate sessions; G additionally confirmed the one real exception (portal.aware-wave.com commercial-tenancy code) is a different, older system, not HCI/AI LEGO runtime code.

## ASM-10 — `VERIFIED`

**Assumption**: The verified infrastructure baseline (single OVHcloud dedicated server ks-aw-01, self-hosted Supabase/Postgres, docker-compose + host nginx + lobster-nginx, no Kubernetes/multi-region/managed cloud DB/service mesh/Kafka) is accurate and current.

**Evidence**: Stated as 'verified firsthand this session' in the mission brief itself, and independently cross-checked by D (grep of actual docker-compose files, sg-deploy.sh, .github workflows), C (cites the same baseline for threat-model scoping), and G (references AWAREWAVE_STACK_QUICKREF.md); all corroborating evidence is mutually consistent with no contradictions found.

## ASM-11 — `VERIFIED`

**Assumption**: CURRENT_SERVICE_PLACEMENT.md, cited as the current-service-inventory SSOT by four separate blueprint documents, does not actually exist.

**Evidence**: D directly ran `ls "D:\Work\agency-os\docs\infrastructure"` and got 'No such file or directory' — a falsifiable, directly-executed check, not an inference.

## ASM-12 — `VERIFIED`

**Assumption**: portal.aware-wave.com's shipped 'organizations' table (type in agency/client) and organization_product_subscriptions.external_tenant_id predate and do not match the blueprint's Tenant→Organization→Workspace→Project hierarchy.

**Evidence**: G directly read lobster-factory/packages/db/migrations/0001_core.sql and cites commit 83277d80 (2026-08-29) plus PORTAL_AWARE_WAVE_DESIGN_PROPOSAL.md's own explicit V1 scope exclusions — primary-source evidence, not inference.
