# GLOBAL_JURISDICTION_PLAN
Status: §2（Legal Freshness SLA）於 2026-08-30 由操作者於對話中明示核准（「要」）；§1/§3 以下章節仍為 PROPOSED，尚未逐條核准
Date: 2026-08-29

## 0. Scope, Method, and Non-Goals

This document is a **design proposal**, not a mother-document edit. It answers Phase 2 Architecture Convergence's obligation to close the `legal_global_policy` gap cluster from Phase 1 (`P1-GAP-LEGAL-1/3/4/7`, `P1-RISK-LEGAL-1..5`). Per ADR-006, no concrete repo path is treated as load-bearing here — every schema below is a **contract** (fields, states, ownership), and where a path is mentioned it is illustrative, deferred to the Phase-4-owned `repo-layout` spec.

**Non-goals (explicit)**: this document does not assert that any jurisdiction is or is not compliant with any real law; it does not give legal advice; it does not decide *which* SLA number is legally required anywhere — the numbers below are **internal operational cadences** a human legal reviewer can override per Jurisdiction Pack. Every "MUST" below is a system-design constraint, not a legal conclusion.

**Grounding**: Master Plan (MP) §92–§162, Execution Contract (EC) §41–§42/§64–§68, Method Atlas §10/§18/§21–§23, `.ai/research/phase-1/GAP_REGISTER.yaml`, `.ai/research/phase-1/RISK_REGISTER.yaml`, `docs/adr/ADR-006-*.md`. Full citation list in §8 Evidence.

---

## 1. Jurisdiction Pack Schema

### 1.1 Why a new top-level object

Today "Jurisdiction Pack" is *named* throughout MP (§96 authority hierarchy owner, §100 privacy rights owner, §107 sector packs, §127 signed offline bundles, §142 admission gate precondition) but **never given a schema of its own** — it is referenced as a black box that other schemas (`legal_source` MP:4045-4063, `capability_availability` MP:5512-5517) point at without a defined shape. `P1-GAP-LEGAL-1` (MP:5087) and `P1-RISK-LEGAL-1` (Temporal Law Engine's 8 states have no wiring to a trigger mechanism) both trace back to this missing schema. This section defines it.

### 1.2 Schema

```yaml
jurisdiction_pack:
  pack_id: JPACK-<jurisdiction_id>-v<major>.<minor>
  status: DRAFT | ACTIVE | REVIEW_DUE | STALE | DEPRECATED | SUPERSEDED

  # --- 適用地區 (scope) ---
  scope:
    jurisdiction_nodes: [...]        # taxonomy nodes per MP §93 (MP:3939-3956):
                                      # Supranational/Country/Federal/State-Province/
                                      # Canton/Prefecture/Territory/SAR/County/
                                      # City-Municipality/District/Tribal-Indigenous/
                                      # FTZ/SEZ/Industry-Regulator/Public-Sector-Authority/
                                      # Contractual-Governing-Law
    sector_packs: [...]              # ref to MP §107 Sector Compliance Packs (MP:4502-4527), optional
    government_pack_ref: null        # ref to §7 Unified Government Concept, only if applicable

  # --- 有效期限 (temporal validity) ---
  effective_from: ...
  effective_to: null
  supersedes: null
  superseded_by: null
  legal_snapshot_ref: LS-...         # ties to MP §97 Temporal Law Engine (MP:4130-4165)

  # --- 法源 (composition, not duplication) ---
  legal_sources: [LAW-...]           # refs into MP §95 Legal Source Registry (MP:4036-4089)
  authority_hierarchy_ref: ...       # ref into MP §96 (MP:4093-4118); packs MAY NOT invent
                                      # a bespoke ranking outside this ref

  # --- Freshness / ownership (closes P1-GAP-LEGAL-1) ---
  freshness:
    last_checked_at: ...
    next_check_due: ...              # computed = last_checked_at + sla_days (see §2)
    sla_class: CRITICAL | HIGH | MEDIUM | LOW   # see §2 for the number bound to each
    owner_role: legal_source_steward # REQUIRED, not optional — no pack may exist ownerless
    reviewed_by: ...
    reviewed_at: ...
    audit_trail: [{event, actor, at, note}, ...]   # every state change, reuses EC §66
                                                     # Audit Event fields (EC:2200-2214)

  # --- Data residency requirements ---
  data_residency:
    storage: EU_ONLY | COUNTRY_ONLY | ON_PREM_ONLY | DEVICE_ONLY | UNRESTRICTED
    processing: <same enum>
    backup: <same enum>
    log: <same enum>
    key_residency: <same enum>       # mirrors MP §103 (MP:4377-4402) fields verbatim

  cross_border_transfer:
    allowed_mechanisms: [...]        # subset of MP §102 abstract mechanism list (MP:4350-4361):
                                      # Adequacy / SCC / BCR / Contractual Clauses /
                                      # Consent Exception / Statutory Exception /
                                      # Local Processing Only / Other

  # --- Capability availability coverage (closes "no override rule" gap) ---
  capability_availability_overrides:
    - capability: ...
      status: Allowed | Restricted | Human Review | Local-only | Government-only | Prohibited
      # NOTE: "Unknown" is deliberately NOT a settable value here — Unknown is the
      # ABSENCE of an entry in this list, computed by the resolver, never authored.
      basis_legal_source: LAW-...    # every non-default status must cite a source

  # --- Mandatory disclaimer surface (closes P1-RISK-LEGAL-3) ---
  coverage_disclaimer:
    text_ref: DISCLAIMER-NOT-EXHAUSTIVE-v1     # canonical text, versioned once, ref'd everywhere
    ui_render_required: true          # any UI-facing artifact consuming this pack
                                       # (Compliance Center §129, Market Entry Passport §131)
                                       # MUST render this, not merely document it in a spec

  # --- Offline distribution (ties to MP §127, MP:5052-5084) ---
  signature: ...
  checksum: ...
```

### 1.3 What this closes

- **P1-GAP-LEGAL-1**: `owner_role` is now a required field, not an implied convention; `next_check_due` is computed, not narrative.
- **P1-RISK-LEGAL-1** (temporal-state trigger ambiguity, MP §97's 8 states): the Pack's `freshness.next_check_due` lapse is now the single, unambiguous trigger for a Temporal Law Engine re-evaluation — not "scheduler, or manual review, or SLA, whichever happens first" (the three-way ambiguity the risk register flagged). §2 below defines exactly what happens at lapse.
- **P1-RISK-LEGAL-3** (disclaimer trapped in spec text, MP §139/MP:5386-5411): `coverage_disclaimer` is now a schema field with a `ui_render_required` flag, so Compliance Center and Market Entry Passport cannot silently drop it.

---

## 2. Legal Freshness SLA

### 2.1 The gap being closed

MP §128 (MP:5087-5109) states only "Critical AI/Privacy Law: 較高監控頻率 / Stable civil-law: 較低頻率" — a direction with no number, no owner, no consequence for missing the window (`P1-GAP-LEGAL-1`). This section supplies all three. **These numbers are an internal operating policy, not a legal requirement in any jurisdiction** — treat them as the system's default risk posture, overridable per-pack by a named human reviewer with a recorded reason.

### 2.2 SLA table

| `sla_class` | Applies to (examples, non-exhaustive) | Review cadence | Grace period | Auto-degrade trigger |
|---|---|---|---|---|
| **CRITICAL** | AI regulation with staged/phased effective dates; biometric, children, health, or government-classified data; any capability currently `Government-only` or `Prohibited` | every **30 days** | +15 days | at day 45 without `reviewed_at` refresh → `STALE` |
| **HIGH** | Binding general privacy statutes; sector-specific binding regulation (finance, healthcare, education) | every **90 days** | +30 days | at day 120 → `STALE` |
| **MEDIUM** | Administrative rules and regulator guidance under active revision, non-binding but load-bearing for Control Mapping | every **180 days** | +60 days | at day 240 → `STALE` |
| **LOW** | Constitutional provisions, settled civil-law definitions, stable contractual-governing-law baselines | every **365 days** | +90 days | at day 450 → `STALE` |

**Rationale for the tiering** (design reasoning, not a legal claim): phased-rollout AI/privacy regimes and government/children/biometric data carry both the highest per-incident consequence (MP §105 Risk Classification) and the fastest rate of interim guidance change, so CRITICAL gets sub-quarterly checks specifically to catch phase-transition dates (MP §97 "Partially Effective"). LOW-tier constitutional/civil-law baselines change on a multi-year cadence, so an annual check is proportionate.

### 2.3 Auto-degrade rule (the missing trigger from `P1-RISK-LEGAL-1`)

```text
last_checked_at + sla_days           → freshness.status = REVIEW_DUE (soft; WARN only)
last_checked_at + sla_days + grace   → freshness.status = STALE (hard; see §3 gating)
                                        AND legal uncertainty state (MP §134, MP:5258-5271)
                                        for every rule sourced from this pack is
                                        force-set to STALE
                                        AND an entry is pushed to Compliance Center's
                                        Human Review Queue (MP §129, MP:5130)
```

No separate mechanism is invented: MP §134 already defines `STALE` as one of six legal-uncertainty states but never says what sets it. This SLA clock is now that trigger.

### 2.4 Ownership and escalation

`freshness.owner_role: legal_source_steward` is mandatory per pack. If `REVIEW_DUE` is not cleared before the grace period elapses, escalation is automatic (push to Human Review Queue) rather than silent — a pack without an assigned steward cannot reach `ACTIVE` status.

---

## 3. Unified FAIL CLOSED Signal

### 3.1 The three signals, restated precisely

| Signal | Source | What it actually measures | Literal text |
|---|---|---|---|
| **A. MP resolver `uncertain`** | MP §94 (MP:4025-4032) | Among the *candidate* jurisdiction nodes for a given `jurisdiction_context`, some cannot be confidently placed in "applicable" | `uncertain: [JUR-021]` + `human_review_required: true` — **no explicit FAIL CLOSED wording** |
| **B. EC "Jurisdiction Unknown"** | EC §41 (EC:1570-1575) | The jurisdiction-resolution *step itself* could not produce any confident scope at all, for High/Critical tasks | `Jurisdiction Unknown → FAIL CLOSED` |
| **C. Atlas "Capability Unknown"** | Atlas §18.2 (Atlas:4046-4064) | Given a jurisdiction that **was** resolved, this specific capability's status in that jurisdiction is not in the Pack's override list | `Unknown = Fail Closed` (High/Critical only) |

These are **not duplicates and not competitors** — they measure three different points on the same pipeline. The fix is not to merge them into one boolean but to sequence them as ordered stages of one gate, and to close a fourth gap this comparison surfaces: **Stage 4, conflict**, from MP §98, was never included in either prior FAIL CLOSED discussion at all.

### 3.2 The unified pipeline

```text
STAGE 0 — Jurisdiction Identification (owns signal B)
  Input: jurisdiction_context (MP §94, MP:3985-4000)
  Output: applicable[] | uncertain[] | UNRESOLVED_JURISDICTION
  UNRESOLVED_JURISDICTION := applicable[] is empty AND no confident scope exists at all
  → High/Critical risk_tier + UNRESOLVED_JURISDICTION  =>  FAIL CLOSED   (this is EC §41's rule)
  → uncertain[] non-empty but applicable[] non-empty    =>  proceed to Stage 1 carrying
    human_review_required: true (this is signal A — narrower than UNRESOLVED_JURISDICTION,
    see §3.3 for exact reconciliation)

STAGE 1 — Pack Existence & Freshness (new; closes the admission-gate/SLA gap)
  Input: applicable[] jurisdictions from Stage 0
  Output: for each jurisdiction, an ACTIVE jurisdiction_pack, or none/STALE
  → any applicable jurisdiction has no pack, or pack.status = STALE (§2.3),
    for High/Critical risk_tier  =>  FAIL CLOSED
    (this literally instantiates MP §142's "Pack Exists? / Legal Freshness Valid?"
     admission gates, MP:5476-5484)

STAGE 2 — Capability Availability (owns signal C)
  Input: a resolved, fresh jurisdiction_pack + the capability being invoked
  Output: pack.capability_availability_overrides lookup result, or Unknown
  Unknown := capability has no entry in the pack's override list (never authored as
             "Unknown" directly — see §1.2 note)
  → High/Critical risk_tier + Unknown  =>  FAIL CLOSED           (this is Atlas §18.2's rule)

STAGE 3 — Conflict-of-Laws (new inclusion; owns MP §98's own states)
  Input: capability statuses across ALL applicable jurisdictions from Stage 2
  Output: RESOLVED | CONSERVATIVE_SAFE_MODE | AMBIGUOUS | CONFLICT | LEGAL_REVIEW_REQUIRED
          (MP §98 states, reused verbatim — MP:4198-4206)
  → AMBIGUOUS or CONFLICT, for any irreversible action  =>  FAIL CLOSED
    (this is MP §98's own rule, MP:4208-4213, previously never linked to Stage 0-2 at all)

RESULT: jurisdiction_gate_result = AND of Stage 0..3
  Any stage FAIL CLOSED  =>  overall = FAIL CLOSED, execution blocked, human review queued
  All stages pass         =>  overall = ALLOW, recorded into Compliance Decision Artifact
                              (MP §133, MP:5241-5250) and audit's jurisdiction_snapshot
```

### 3.3 Reconciling signal A's soft wording with B/C's hard wording

MP §94's `uncertain[]` never says "FAIL CLOSED" — only `human_review_required: true`. This plan resolves the asymmetry by risk tier, reusing vocabulary MP §134 already defines:

- **Low/Medium risk_tier**: `uncertain[]` non-empty → **Conservative Mode** (MP §134, MP:5273-5277) — execution proceeds using the most restrictive interpretation among the `applicable[]` set, flagged in the audit trail.
- **High/Critical risk_tier**: `uncertain[]` non-empty with `human_review_required: true` is promoted to the **same FAIL CLOSED semantics as Stage 0's UNRESOLVED_JURISDICTION** — execution suspended pending Human Legal Review.

This is the concrete answer to "不能只接上其中一個就自認合規": `jurisdiction_gate_result` cannot be marked `ALLOW` unless all four stages recorded a pass, and the artifact stores each stage's individual result so a later audit can see *which* stage would have blocked, closing `P1-RISK-LEGAL-4`'s documentation-drift pattern by construction.

---

## 4. Government Identity Verification

### 4.1 The gap

`P1-GAP-LEGAL-3`: the only signal gating `Government-only` capabilities is `jurisdiction_context.government_customer: false` (MP:3999) — a self-declared boolean the Master Plan itself says "必須由使用者/組織明確設定" (MP:4006), i.e. explicitly *no* third-party verification. `P1-RISK-LEGAL-5` adds: no audit trail, no periodic re-check.

### 4.2 Design constraint

Not full KYC. The existing architecture already has a generic **authority gate** primitive for irreversible/high-risk actions (EC:300, EC:2444, Atlas:4154). This section does not invent a new primitive — it **points that existing primitive at the previously-unauthenticated boolean**.

### 4.3 Schema

```yaml
government_identity:
  claim_status: SELF_DECLARED | EVIDENCE_SUBMITTED | HUMAN_VERIFIED | REJECTED | EXPIRED
  declared_by: <org/user id>
  declared_at: ...
  government_level: central | regional_state | local_municipal |
                     tribal_indigenous | supranational | public_sector_agency | none
    # reuses MP §93 taxonomy + MP §16 role terms + Atlas §18.1's "Government Level" dimension
  evidence_refs: [...]        # non-exhaustive pluggable evidence
  verified_by: <human reviewer id>   # REQUIRED before claim_status can reach HUMAN_VERIFIED
  verified_at: ...
  expires_at: ...              # = verified_at + reverification_sla_days
  reverification_sla_days: 180 # reuses the §2 freshness machinery, not a new clock
  audit_trail: [{event, actor, at, note}, ...]
```

### 4.4 Verification flow (two steps, not KYC)

```text
Step 1 — Self-declaration + evidence
  claim_status: SELF_DECLARED → EVIDENCE_SUBMITTED

Step 2 — Human authority-gate review (reuses EC:300/2444, Atlas:4154 — not new)
  → APPROVE: claim_status = HUMAN_VERIFIED, expires_at = now + reverification_sla_days
  → REJECT:  claim_status = REJECTED, capability stays denied

Re-verification (closes P1-RISK-LEGAL-5's "no periodic re-review")
  expires_at lapses → claim_status auto-transitions to EXPIRED
  → Government-only capabilities immediately re-lock until Step 2 repeats.
```

### 4.5 Enforcement rule

Capability Availability status `Government-only` MUST check `government_identity.claim_status == HUMAN_VERIFIED AND not expired` at execution time — **not** the legacy boolean. Backward compatibility: `jurisdiction_context.government_customer` becomes a **derived, read-only projection** (`:= government_level != none`) rather than an authoritative source.

---

## 5. Conflict-of-Laws Engine Interface

### 5.1 The gap

`P1-GAP-LEGAL-4`: MP §94 lists `/modules/jurisdiction/conflicts/` as a path (MP:4015) while MP §98 separately defines a "Conflict-of-Laws Engine" (MP:4168-4214) — the two have never referenced each other, and §98's own step names have no pass/fail criteria or output shape.

### 5.2 Ownership decision

**Single logical owner: the Conflict-of-Laws Engine (MP §98)**. The `/modules/jurisdiction/conflicts/` reference should be understood as *the storage location the Conflict-of-Laws Engine reads/writes its jurisdiction-scoped state*, not an independent decision-maker. Per ADR-006's ruling, this document does not adjudicate the final path; it only removes the ambiguity about **which component decides**.

### 5.3 Output schema

```yaml
conflict_of_laws_result:
  id: COL-<...>
  evaluated_at: ...
  legal_snapshot_ref: LS-...
  jurisdiction_resolution_ref: ...     # links to §3 Stage 0 output
  input_rules:
    - jurisdiction: ...
      obligation_ref: OBL-...          # MP §99 Compliance Policy Compiler
      required_action: ...
      source: LAW-...
  scope_test: PASS | FAIL
  extraterritorial_test: PASS | FAIL
  authority_test: PASS | FAIL
  conflicts_detected:
    - rule_a: {jurisdiction: ..., obligation_ref: ...}
      rule_b: {jurisdiction: ..., obligation_ref: ...}
      conflict_type: DIRECT_CONTRADICTION | SCOPE_OVERLAP | AMBIGUOUS_PRECEDENCE
  choice_of_law_applied: true | false
  mandatory_law_override: [...]
  status: RESOLVED | CONSERVATIVE_SAFE_MODE | AMBIGUOUS | CONFLICT | LEGAL_REVIEW_REQUIRED
    # MP §98's own enum (MP:4198-4206), reused verbatim, never renamed
  resolution_rule_applied: ...         # REQUIRED whenever status = CONSERVATIVE_SAFE_MODE
  human_counsel_ref: null | <review record id>
```

### 5.4 Wiring into §3

`conflict_of_laws_result.status` **is** Stage 3 of the unified FAIL CLOSED pipeline (§3.2). No separate conflict signal exists outside this schema.

---

## 6. Policy-to-Method-Selection Mapping

### 6.1 The gap

`P1-GAP-LEGAL-7`: MP §26.3 (MP:1669-1685) lists 11 policy-analysis dimensions; Method Atlas §10's `selection_context` (Atlas:1071-1089) has only `jurisdiction_context` and `risk_tier` — no policy field at all.

### 6.2 New field: `selection_context.policy_context`

```yaml
selection_context:
  # ...existing fields unchanged...
  policy_context:
    current_regulation_refs: [LAW-...]
    proposed_regulation_refs: [LAW-...]
    budget_context: {available: ..., source: ..., cycle: ...}
    industrial_policy_tags: [...]
    tax_exposure: {present: bool, refs: [...]}
    trade_exposure: {present: bool, refs: [...]}
    sector_policy_refs: [...]
    privacy_exposure: {present: bool}
    ai_regulation_exposure: [LAW-...]
    election_cycle_window: {start: null, end: null}
    geopolitical_refs: [...]

  regulatory_exposure: none | low | moderate | high   # DERIVED, never hand-set
```

### 6.3 Mapping table (§26.3 dimension → field → selection effect)

| §26.3 dimension | `policy_context` field | Effect on Method Selection |
|---|---|---|
| Current Regulation | `current_regulation_refs` | Feeds Stage 0 jurisdiction resolution; forces the "Policy" problem-type's Jurisdiction step into the candidate set |
| Proposed Regulation | `proposed_regulation_refs` | Forces Scenario Planning to model pre/post-enactment branches |
| Budget | `budget_context` | Adjusts MCDA / cost-benefit criteria weighting |
| Industrial Policy | `industrial_policy_tags` | Routes to the matching MP §107 Sector Compliance Pack |
| Tax / Trade | `tax_exposure` / `trade_exposure` | Feeds Cross-Border/Trade module inputs |
| Education Policy (generalized) | `sector_policy_refs` | Routes to applicable §107/§108 sector pack |
| Privacy | `privacy_exposure` | Cross-checked against jurisdiction_context |
| AI Regulation | `ai_regulation_exposure` | Runs MP §105 Classification upstream of Method Selection |
| Election Cycle | `election_cycle_window` | Raises decision_criticality; mandates Scenario Planning |
| International Relations | `geopolitical_refs` | Feeds Cross-Border Data Transfer Engine + Compliance-aware AI Router |

### 6.4 The forcing rule

```text
IF regulatory_exposure IN {moderate, high}
THEN the "Policy" method chain's Jurisdiction step is inserted into the candidate
     method set REGARDLESS of the classified problem_type.
```

---

## 7. Unified Government Concept

### 7.1 The three sites

1. `jurisdiction_context.government_customer: false` (MP:3999)
2. Global Project Passport's `Government` field (MP:5227)
3. Capability Availability's `Government-only` status value (MP:5526 / Atlas:4055)

### 7.2 Canonical schema

```yaml
government_context:
  government_identity: <§4 government_identity object>
  government_level: central | regional_state | local_municipal |
                     tribal_indigenous | supranational | public_sector_agency | none
  applicable_government_packs: [GOV-PACK-...]
  procurement_status: none | in_procurement | active_contract | expired_contract
  deployment_mode: government_sovereign | government_private_cloud | air_gapped | standard
```

### 7.3 How the three sites become views, not restatements

| Site | Before | After |
|---|---|---|
| `jurisdiction_context.government_customer` | Free-standing boolean | Derived: `:= government_context.government_level != none` |
| Project Passport `Government` field | Untyped list entry | Typed reference: `project_passport.government_ref: <government_context.id>` |
| Capability Availability `Government-only` | Enforcement point with nothing to check against | Requires `government_context.government_identity.claim_status == HUMAN_VERIFIED` |

### 7.4 Anti-recurrence rule

A rename inside `government_context` breaks referents mechanically rather than silently drifting. As a discipline measure, any future edit must be followed by:
```
grep -rn "government_customer\|government_context\|Government-only\|Government Level" \
  agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/
```

---

## 8. Evidence

Full citation list covering Master Plan §15.1/§16/§26.3/§92-99/§102-109/§127-134/§139/§142-143/§152-153/§156/§161; Execution Contract §41-42/§66-68/§120; Method Atlas §10/§18/§21-23; Phase 1 registers `GAP_REGISTER.yaml:422-453`, `RISK_REGISTER.yaml:80-104`; ADR-006 sub-decision (b). See `docs/adr/ADR-006-mother-doc-revision-flow-and-repo-layout.md` for the path-ownership basis of this document's stance.

**邊界確認**：本次任務全程僅執行 Read/Grep。未修改三母文件、任何 ADR、或任何 Phase 1/2 research artifact。
