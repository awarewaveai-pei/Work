# ADR-003: Tenant as a First-Class Domain Object, Tenant-Scoped Content-Addressed Storage, and a Single Canonical Blast-Radius Chain

Status: ACCEPTED（2026-08-29，操作者明示授權 Claude 行使架構師裁決權，見 ADR-001 同款範圍聲明：ADR 決策定案 ≠ 母文件已編輯，套用仍須走 ADR-006 `.ai/proposals/` 流程，該流程 APPROVED 僅操作者可推進）
Date: 2026-08-29

## Context

Phase 1 role-lens gap analysis registered two related architectural self-contradictions that block Phase 2 convergence:

**P1-CONFLICT-2** (severity: high) — Global content-addressed dedup vs. Tenant Isolation as the outermost blast-radius boundary.
- Master Plan §58 "Immutable-first" (L2580, L2582-2584): *"所有檔案 Content-addressed"* with path `/objects/sha256/aa/bb/<hash>` — verified: no `tenant_id`/`project_id` segment anywhere in the path grammar, meaning two tenants uploading byte-identical content share one physical blob.
- Master Plan §1.5 "最小爆炸半徑" (L268-274): `Tenant Isolation → Workspace Isolation → Project Isolation → Workflow Isolation → Execution Isolation → Capability Isolation` — verified: Tenant is explicitly the first/outermost isolation layer.
- These cannot both be true as written: a storage layer that physically merges tenants' bytes cannot simultaneously be the thing whose isolation is claimed as the platform's most fundamental fault/security boundary. Also flags an unaddressed CAS side-channel: an "instant" upload (content already exists as a blob) leaks to Tenant A the fact that some other tenant already holds byte-identical content — classic dedup-timing disclosure (same class of issue publicly documented against consumer cloud-storage "instant upload" dedup circa 2011).

**P1-DUP-3** (severity: high) — Undefined Tenant concept, chain node-count drift.
- `Tenant` appears exactly 3 times across all three ~268KB mother documents: Master Plan L269 (`Tenant Isolation`), Method Atlas L4140 (`T[Tenant]` mermaid node), Execution Contract L1265 (one bullet item, `tenant isolation`, under §32 Security Change Contract's "must-Threat-Review" list — no schema, no cardinality, no further elaboration).
- Master Plan §3 "產品核心物件" (L330-357) enumerates the Domain Model as exactly 22 objects — verified: `Tenant` is absent.
- The two documents' blast-radius chains disagree on node count: Master Plan §1.5 (L268-274) has 6 layers, no Branch. Method Atlas §21 mermaid (L4136-4146) has 7 layers: `Tenant → Workspace → Project → Workflow → Branch → Execution → Capability`.
- `Branch` as a blast-radius node has **zero** definition anywhere in any of the three documents (verified by full-text grep). The only other appearances of the word are unrelated: Master Plan L967 lists `Branch` as one of six human-decision actions on an AI-suggested Claim/Idea (`Accept / Reject / Edit / Lock / Branch / Merge`, §11.2), and Method Atlas L40 uses "Git Branch / Tag / Commit" only as an example of a machine-facing identifier type. Neither defines the blast-radius node.

**Related, not separately re-litigated here**: P1-GAP-SEC-7 (security/IAM lens) independently found that "Tenant Isolation" throughout the corpus is a fault-isolation label with no RLS design, no schema-per-tenant vs. shared-schema decision, no tenant-scoped encryption key story. This is the same undefined-Tenant root cause surfacing from a different lens, and is resolved as a byproduct of sub-decisions (a) and (b) below.

This ADR is written at Phase 2 (pre-implementation, no code or data exists yet), which matters directly to the Migration/Reversibility dimension — this is the cheapest point in the system's 30-year life to fix this.

## Decision Drivers

1. **30-year survivability** — the fix must be a structural invariant a future engineer cannot silently bypass, not a policy that depends on someone remembering a rule.
2. **Security/Privacy is non-negotiable** — the corpus's own stated ambition (multi-government, multi-jurisdiction, multi-industry tenants sharing one platform) makes cross-tenant leakage the single most damaging failure mode available to this system.
3. **Cross-border / data residency compliance** — Master Plan's own Jurisdiction Pack mechanism already assumes per-scope legal boundaries; whatever Tenant becomes must be able to anchor a data-residency guarantee.
4. **Cost discipline** — CAS dedup exists for a real reason (storage cost at platform scale); the fix should not discard 100% of that benefit as a side effect of closing the security gap.
5. **Complexity budget** — the fix should not require a bespoke KMS/crypto subsystem if a structural one is available at equal or lower risk.
6. **Fail-closed over fail-open** — consistent with the corpus's own existing defaults (Atlas §21 rule 1: AI-generated idea defaults to `DRAFT`; rule 4: high-risk new Method must shadow/preview first).

## Sub-decision (a): Tenant in Domain Model

**Decision: Add `Tenant` as domain object #23 in Master Plan §3, with `Tenant 1:N Workspace` as the binding cardinality (a Workspace belongs to exactly one Tenant; no cross-tenant shared Workspace).**

This cardinality is not actually contested between the two documents — both the Master Plan chain and the Atlas mermaid (`T --> W`, a single directed edge, tree-shaped) already imply a strict one-parent tree. The conflict was never about direction of the relationship; it was that neither document ever turned the relationship into a real object with a schema.

Minimal schema:

```yaml
Tenant:
  tenant_id: uuid            # PK, immutable
  legal_name: string
  status: enum[active, suspended, offboarding, deleted]   # fail-closed default = active only after explicit provisioning
  home_jurisdiction: JurisdictionPackRef   # anchors Legal Authority Hierarchy (MP §96) for this tenant's legal/compliance home
  data_residency_region: enum[...]         # physical storage region constraint, consumed by sub-decision (b)
  encryption_root_key_ref: KMSKeyRef       # tenant-level key; Workspaces/Projects derive from this, not from a shared platform key
  created_at, deleted_at: timestamp
```

`home_jurisdiction` is deliberately singular while `Project`-level work can still reference a *different* operational Jurisdiction Pack for a specific analysis — this decouples "whose legal entity owns this Tenant" from "which jurisdiction's rules apply to this piece of work," which the corpus's Jurisdiction Pack design already anticipates but never anchors to a concrete object.

**What Tenant represents conceptually**: given the Master Plan's stated positioning and the Jurisdiction Pack mechanism, Tenant is the outermost billing/legal/deployment entity — one customer organization, agency, or government body — not a sub-unit within an organization (that role stays with Workspace/Project).

## Sub-decision (b): CAS dedup vs. isolation — Options Considered

Four options were evaluated against Correctness, Security, Privacy, Cost (dedup value lost), Complexity, Migration, Reversibility, Cross-border/data-residency fit, and 30-year survivability.

**Option A — Tenant-scoped CAS namespace**: `/objects/<tenant_id>/sha256/aa/bb/<hash>`. Every tenant gets its own content-addressed space; identical content uploaded by two tenants is stored twice.

**Option B — Global CAS + per-tenant encryption**: one physical blob per hash, decrypted per tenant via a tenant-specific key.

**Option C — Global CAS restricted to an explicitly-flagged "safe to dedupe" content class** (e.g., platform-authored templates, ingested public regulatory texts); everything else — all tenant-uploaded content by default — is tenant-scoped as in Option A.

**Status Quo — no change** (single global CAS as currently written).

| Dimension | Option A (tenant-scoped) | Option B (global + per-tenant key) | Option C (A + narrow global carve-out) | Status Quo |
|---|---|---|---|---|
| Correctness | High — no cross-tenant path exists; deletion is a prefix delete | Medium — requires a `(tenant_id, hash) → key_id` manifest kept perfectly correct forever | Medium-High — needs one reliable classification gate; correct elsewhere by construction | Fails: no way to correctly attribute or delete tenant-scoped data at all |
| Security | High — fails closed: a bug returns 404, not another tenant's plaintext | Medium — fails open: a key-selection bug returns another tenant's readable plaintext through a shared blob | High for the tenant-scoped majority; classification-gate itself is a new (narrow, auditable) attack surface | Fails |
| Privacy | High — no side-channel | **Contradictory** — CAS dedup requires hashing plaintext to find a match *before* any tenant-specific key is applied; the cross-tenant side-channel is unavoidable at that step, or dedup doesn't happen | High for private content; the intentionally-public class carries no privacy expectation by definition | Fails |
| Cost (dedup lost) | Real — identical cross-tenant uploads stored N times | Best on paper, but closing the side-channel erodes the same savings anyway | Best realistic — captures dedup where it's highest-value without paying it on the sensitive majority | N/A |
| Complexity | Low — path-prefix change only | High — full KMS integration, key rotation, key-compromise blast-radius analysis for a mechanism whose core benefit is undermined | Medium — Option A's router plus one classification flag | N/A |
| Migration (now, pre-build) | Trivial | Medium — build a KMS-backed storage layer from scratch | Trivial + one flag | N/A |
| Reversibility | Easy now; hard later | Harder — re-keying every object to reverse | Same as A for the scoped majority; narrow global pool disabled independently at any time | N/A |
| Cross-border / data residency | Directly enables it — a tenant's objects can be pinned to `data_residency_region` | Structurally poor — one physical blob cannot satisfy both an EU-only and a US-only tenant | Handles the common case correctly | Fails |
| 30-year survivability | High — boundary is physical/structural | Low-Medium — correctness depends on perfect crypto/KMS hygiene sustained for decades | High — same structural strength as A, plus one bounded, auditable exception list | Fails |

**Sensitivity point** (ATAM term): the entire viability of Option B hinges on whether cross-tenant dedup can happen *without* a pre-encryption plaintext-hash comparison. It cannot — CAS-by-definition requires hashing before encryption keys are chosen, or there is nothing to dedupe against. This is why Option B is eliminated rather than merely disfavored.

**Tradeoff point**: Option A vs. Option C is a real tradeoff — A is simpler and has zero classification-gate attack surface; C recovers most of the legitimate cost benefit at the price of one narrow, auditable exception mechanism. Given the corpus's own fail-closed conventions are easy to reuse here (default: tenant-scoped; promotion to the global pool requires an explicit, logged, platform-level action), C's added complexity is bounded and inspectable.

**Non-risk**: none of the four options threaten Correctness of the *existing* Immutable-first / content-addressed-versioning guarantee — that property is orthogonal to which namespace the hash lives under.

## Sub-decision (c): Blast-radius chain canonical form

**Decision: Method Atlas §21's 7-layer chain (`Tenant → Workspace → Project → Workflow → Branch → Execution → Capability`) becomes canonical. Master Plan §1.5 is updated to either match it exactly or become an explicit pointer to Atlas §21 as SSOT.**

Reasoning:
- This follows a precedent the corpus already sets for itself: Master Plan L45 forbids dual-maintaining method definitions in the Master Plan narrative. Treating Method Atlas as the single source of truth for architectural/topological detail is the corpus's own established pattern.
- `Branch` should be **kept, not dropped**. Two independent pieces of evidence support that it is a real intended concept: (1) Master Plan §11.2 (L961-968) already defines `Accept / Reject / Edit / Lock / Branch / Merge` on Claims/Ideas — a git-inspired fork/merge pair; (2) the Domain Model already contains `Simulation`, `Experiment`, and `AnalysisRun` as first-class objects, and Atlas §21's own rules 4 and 8 describe exactly the "try an alternative without touching the committed line" behavior that a Workflow-level Branch node would isolate.
- Minimal working definition to attach at Atlas §21: **a Branch is a forked, isolated execution lineage of a Workflow** — created by the existing `Branch` action, producing its own Executions, and reconciled back into the parent Workflow's committed history only through the existing `Merge` action. Unmerged Branch executions do not affect Project Knowledge (consistent with Atlas §21 rule 3). A full behavioral spec (state machine, who can Merge, conflict handling) is out of scope for this ADR and is flagged as follow-up work.

## Method Used

ATAM (Architecture Tradeoff Analysis Method) **is formally defined** in this corpus at Method Atlas §11.38 (L2106-2125) and in its Architecture recipe chain (Atlas L829-835). This ADR followed that chain: current-state reconstruction (Context above), Quality Attribute Scenarios (cross-tenant upload, deletion, residency-audit scenarios), architecture options (sub-decision b), ATAM/trade-off pass (sensitivity/tradeoff/non-risk above), informal threat model (folded into Security/Privacy rows). A formal STRIDE pass is recommended as follow-up before implementation.

## Recommendation

1. **(a)** Add `Tenant` as Domain Model object #23, `Tenant 1:N Workspace`, with the minimal schema above.
2. **(b)** Adopt **Option A (tenant-scoped CAS namespace) as the default rule**, with **Option C's narrow, explicitly-enumerated global pool** as the only sanctioned exception. Reject Option B outright: its core value proposition is undermined by the pre-encryption plaintext-hash requirement that CAS dedup itself depends on. Reject Status Quo: it is the conflict.
3. **(c)** Adopt Method Atlas §21's 7-layer chain (with Branch) as canonical; update Master Plan §1.5 to match or point to Atlas §21 as SSOT. Attach the minimal Branch definition above to Atlas §21.

This closes P1-CONFLICT-2, P1-DUP-3, and substantially narrows P1-GAP-SEC-7.

## Consequences

- Positive: Tenant Isolation becomes a true structural boundary at the storage layer; data residency claims become enforceable; the corpus gains its first properly schema'd multi-tenancy anchor.
- Negative: some real dedup cost savings are given up for content that happens to be identical across tenants but isn't on the sanctioned global list; accepted, bounded tradeoff.
- New follow-up surfaced (not solved here): (i) full RLS/schema-per-tenant vs. shared-schema decision for relational data outside the CAS layer; (ii) how shared components like a cross-workspace Knowledge Graph or Vector Index avoid cross-tenant leakage; (iii) full Branch state-machine spec at Atlas §21; (iv) formal binding of Jurisdiction Pack scope to Tenant vs. Project.

## Migration / Rollback

- **Migration**: zero-cost at this moment — no code or data exists yet. The only "migration" is editing the three specs: add Tenant to Master Plan §3, add the tenant-scoped path grammar to §58, reconcile §1.5 with Atlas §21, add the Branch definition to Atlas §21.
- **Pre-launch gate**: before first production tenant onboarding, verify via real test that (1) two tenants uploading identical content produce two distinct storage paths with no observable latency differential, and (2) a tenant deletion request for a locally-referenced hash completes with zero reads against any other tenant's namespace.
- **Rollback**: if Option C's classification gate proves unworkable, collapsing to pure Option A is a strict simplification — safe. The reverse direction (going back to any global-blob option after tenants exist) is explicitly NOT safe post-launch, and should be treated as effectively irreversible once real tenant data exists.

## Evidence

- MP §58 Immutable-first, content-addressed path grammar: `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:2570-2584`
- MP §1.5 最小爆炸半徑 (6-layer chain): `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:262-275`
- MP §3 Domain Model, 22 objects, no Tenant: `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:330-357`
- MP §11.2 Branch/Merge human-decision vocabulary: `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:955-969`
- MP §96 Jurisdiction Pack / Legal Authority Hierarchy: `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:4093-4114`
- EC §32 Security Change Contract, sole `tenant isolation` mention: `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:1255-1268`
- Atlas §21 最小爆炸半徑 mermaid (7-layer chain incl. Branch): `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:4136-4159`
- Atlas §11.38 ATAM definition: `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:2106-2125`
- Atlas method-selection table row (ATAM steps) and architecture recipe chain: `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:818, 829-835`
- Full-text grep confirming exactly 3 total "Tenant" occurrences across all three mother docs (MP:269, Atlas:4140, EC:1265) — no other hits.
- Full-text grep confirming zero definition of "Branch" as a blast-radius node anywhere.
- Phase 1 registers: `.ai/research/phase-1/CONFLICT_REGISTER.yaml` (P1-CONFLICT-2), `.ai/research/phase-1/DUPLICATION_REGISTER.yaml` (P1-DUP-3), `.ai/research/phase-1/GAP_REGISTER.yaml` (P1-GAP-SEC-7).

**邊界確認**：本次任務全程僅執行 Read/Grep（唯讀），未對三母文件做任何修改。
