# ADR-012: Branch Full State Machine — States, Merge Authority, Conflict Handling (MRSP-4)

Status: ACCEPTED（2026-08-30，操作者明示授權 Claude 行使架構師裁決權，同 ADR-001~011 範圍聲明：ADR 決策定案 ≠ 母文件已編輯，套用仍須走 ADR-006 `.ai/proposals/` 流程，該流程 `status: APPROVED` 僅操作者本人可推進）
Date: 2026-08-30
Related: ADR-003（本 ADR 直接延續其 Consequences follow-up (iii)：「full Branch state-machine spec at Atlas §21」，`ADR-003:112`；沿用其 Branch 最小定義，`ADR-003:94`）、ADR-004（risk_tier / R3∪R4 gate injection，本 ADR 的 merge gate 條件直接引用）、ADR-011（Global/High-risk Gate catalog，本 ADR 的 merge gate 內容直接引用其 `human_specialist_review`/`recovery_rollback_rehearsal` 兩個 id）、`specs/execution/blast-radius-chain.schema.yaml`（Branch 節點的既有最小定義與 open_questions.blast-radius-1，本 ADR 為其正式裁決）、`specs/execution/authority.schema.yaml`（A0-A4 授權階梯，本 ADR 的 merge 授權門檻直接引用）

## Context

Unlike ADR-001~011, **no mother document contains ANY prior art for this ADR's subject matter.** ADR-003's Context (`ADR-003:19`) already verified by full-text grep: *"`Branch` as a blast-radius node has zero definition anywhere in any of the three documents."* ADR-003 itself then deliberately scoped its own Branch treatment to a one-sentence minimal definition and explicitly named the remainder as out-of-scope follow-up:

> "A full behavioral spec (state machine, who can Merge, conflict handling) is out of scope for this ADR and is flagged as follow-up work." (`ADR-003:94`)
> Consequences item (iii): "full Branch state-machine spec at Atlas §21" (`ADR-003:112`)

`specs/execution/blast-radius-chain.schema.yaml` (built 2026-08-29, compiling ADR-003's decision) carries this forward as an explicit, bounded gap — its own `branch_node.explicitly_not_specified_here` (L168-171) lists exactly three things: *"Who is authorized to Merge a Branch"*, *"Conflict handling when two Branches diverge and both attempt Merge"*, *"Branch state machine (states, valid transitions, terminal states)"* — and its `open_questions.blast-radius-1` (L212-220) names this exact ADR's future resolution as the answer, tracked in `docs/architecture/MACHINE_READABLE_SPEC_PLAN.md` as MRSP-4 (§5, L331): *"Phase 3 只實作 ADR-003 給的最小定義（forked isolated execution lineage），完整 state machine 排入 Round 2 或 Phase 4."*

This ADR is that Round 2 resolution. Because there is no prior mother-document text to transcribe, reconcile, or arbitrate between (unlike every other ADR in this index), this ADR's method is necessarily different: it is an **original design**, built by composing primitives this project has ALREADY decided elsewhere (risk tiers, authority levels, gate catalog, rollback shape, status-code conventions) rather than inventing a free-standing new mechanism. Every design choice below traces to a specific existing decision it reuses — none is asserted from first principles alone.

## Decision Drivers

1. **Do not invent a free-standing mechanism when an existing one already fits.** This corpus already has a full A0-A4 authority ladder (`authority.schema.yaml`), a risk-tier + mandatory-gate-injection mechanism (`risk-tier.schema.yaml` + `mandatory-gates.yaml`, ADR-004/ADR-011-decided), and a Rollback/Recovery shape (`rollback.schema.yaml`, reverse-engineered from 10 real ADRs). A Branch merge is architecturally a **promotion from an isolated scope into a shared one** — exactly what A1→A2 already models — and a **potentially risk-tiered operation** — exactly what the R3∪R4 gate-injection trigger already models. Building a parallel, Branch-specific authority/gate mechanism would duplicate machinery this project already spent real design effort validating.
2. **Fail-closed over fail-open, consistent with every prior ADR's driver** (ADR-003 Decision Driver #6, Atlas §21 rule 1). Where no mother-document text answers a question (e.g., "can two branches automatically resolve a conflict against each other"), the fail-closed answer (require an explicit human decision, do not auto-resolve) is preferred over inventing an auto-merge algorithm the corpus gives zero evidence for.
3. **30-year survivability — the state machine must be a structural invariant, not a convention a future engineer can silently skip.** Same driver as every ADR-003-descended decision. A Branch that reaches MERGED must have PROVABLY passed whatever gates its risk tier requires — not "usually did, if someone remembered."
4. **Minimal, LEGO-composable surface.** Per the operator's explicit framing (可彈性擴張像LEGO), this schema should be a thin state-machine layer ON TOP OF `blast-radius-chain.schema.yaml`'s existing generic `chain_instance` node shape (tenant_id/node_type/node_id/parent_node_id) — not a redefinition of what a Branch node IS structurally, only an ADDITION of what a Branch node DOES (its lifecycle).
5. **Do not silently pick a side on anything genuinely undecided.** Where this ADR's design still leaves a real, disclosed question (e.g., whether Branch/Branch conflicts need a dedicated auto-detection algorithm beyond simple staleness comparison), it is recorded as an open question, not silently assumed.

## Sub-decision (a): State Set and Transitions

**Decision: A 6-state machine — `ACTIVE` (initial), `MERGE_REQUESTED`, `CONFLICT`, `MERGED`, `ABANDONED`, `ROLLED_BACK` — with the transitions listed below. No `DRAFT` pre-state.**

**Why no `DRAFT` state**: Atlas §21 rule 1 ("AI-generated idea 預設 `DRAFT`") is a governance default for **epistemic content** (Claims/Ideas going through `epistemic-label.schema.yaml`'s promotion ladder), not a structural precedent for every new object type in this corpus — `Tenant` (ADR-003), `Execution`, and `Workflow` all lack a DRAFT pre-state in their own existing schemas. Asserting Branch needs one would be an unsupported cross-application of a rule scoped to a different concept. ADR-003's own minimal definition (`ADR-003:94`) says a Branch is "created... producing its own Executions" with no mention of an intermediate not-yet-active state — a Branch is usable immediately upon creation.

**Why `ROLLED_BACK` reuses that exact literal name**: `rollback.schema.yaml#/result/side_state` (built 2026-08-29, reverse-engineered from this project's own ADRs) already defines `ROLLED_BACK` as one of exactly 3 legal terminal rollback outcomes (`ROLLED_BACK`, `COMPENSATED`, `PARTIAL_SUCCESS`). Reusing it verbatim for a MERGED Branch's later reversal is a direct application of an existing vocabulary, not a new one — consistent with `status-codes.schema.yaml`'s own "single source of truth, other files reference it" discipline.

Transitions:

| From | To | Trigger | Grounding |
|---|---|---|---|
| (initial) | `ACTIVE` | Branch action (MP §11.2) creates the branch | ADR-003 minimal definition |
| `ACTIVE` | `MERGE_REQUESTED` | Merge action (MP §11.2) is invoked | ADR-003 minimal definition — "reconciled back... only through the existing Merge action" |
| `ACTIVE` | `ABANDONED` | Branch explicitly discarded without merging | Atlas §21 rule 3 precedent — "a failed or abandoned Branch is exactly the case rule 3 exists to contain" (`blast-radius-chain.schema.yaml:167`) |
| `MERGE_REQUESTED` | `MERGED` | Merge authority + applicable gates all satisfied (Sub-decision b/c) AND no staleness/conflict detected (Sub-decision d) | this ADR |
| `MERGE_REQUESTED` | `CONFLICT` | `merge_base` staleness detected against target Workflow's current state, OR gate/authority check fails in a way requiring human resolution rather than simple retry | this ADR, Sub-decision (d) |
| `MERGE_REQUESTED` | `ACTIVE` | Merge request withdrawn (actor decides to keep iterating rather than force resolution) | this ADR — a merge request is not itself irreversible; only `MERGED` is |
| `CONFLICT` | `MERGE_REQUESTED` | Conflict explicitly resolved (`resolution_rule_applied` populated, Sub-decision d), re-attempt | this ADR, mirrors `conflict-of-laws-output.schema.yaml`'s existing `CONSERVATIVE_SAFE_MODE` resolution-tracking pattern |
| `CONFLICT` | `ABANDONED` | Conflict deemed not worth resolving | this ADR |
| `MERGED` | `ROLLED_BACK` | Post-merge rollback executed per `rollback.schema.yaml` | this ADR — direct composition with existing Rollback machinery |

`MERGED`, `ABANDONED`, and `ROLLED_BACK` are the only states with no outgoing transition (true terminal states); `MERGED` is "successful but still reversible" (mirrors `rollback.schema.yaml#/reversibility.post_launch` — a completed action is not the same as an irreversible one).

## Sub-decision (b): Merge Authority — Who Can Merge

**Decision: Merging (the `MERGE_REQUESTED → MERGED` transition) requires, at minimum, `authority.schema.yaml`'s `A2` ("Staged Write") level. If the Branch's own `risk_tier` is `R3` or `R4`, the transition additionally requires the mandatory gates from Sub-decision (c) to reach an acceptable Final Status.**

Reasoning: `authority.schema.yaml#/levels/A1` is explicitly scoped to *"isolated branch or workspace"* (`authority.schema.yaml:172`) with no gate requirement — this is precisely the scope a Branch occupies WHILE `ACTIVE` (its own Executions, isolated, not yet affecting the parent). `A2` ("Staged Write") is scoped to *"dev / staging"* and requires a `gate` (`authority.schema.yaml:176-182`) — merging is structurally the same shape of transition: moving work from an isolated/local scope into a shared one the parent Workflow's other consumers can observe (its "committed history", per ADR-003's own phrase, `ADR-003:94`). This is not a numeral-correspondence guess of the kind `authority.schema.yaml`'s own `compilation_decisions` warned against (`authority.schema.yaml:64-89`) — it is a direct match on each level's own stated **scope description** ("isolated branch/workspace" vs. "dev/staging"), not an inferred equivalence between two independently-defined enums.

Composing this with the ALREADY-DECIDED risk-tier gate-injection trigger (ADR-004: `risk_tier IN [R3, R4]` mandates gate injection) is not a new rule — it is the same condition `mandatory-gates.yaml`'s 2 grounded rules already fire on, applied here to the specific transition where a Branch's risk-tiered work becomes visible to its parent Workflow. A Branch whose own `risk_tier` is R0-R2 merges at the A2 floor alone (no additional gate); a Branch at R3/R4 additionally needs its gates to pass — same floor-plus-conditional-addition shape `gate.schema.yaml#/gate_catalog`'s own global/high_risk split already uses.

## Sub-decision (c): Which Gates Apply at Merge

**Decision: When `risk_tier IN [R3, R4]`, the merge transition consumes `policies/ai-execution/mandatory-gates.yaml#/grounded_rules` directly — today, both `MGATE-R3-R4-HUMAN-REVIEW` (`gate_ref: human_specialist_review`) and `MGATE-R3-R4-RECOVERY-ROLLBACK` (`gate_ref: recovery_rollback_rehearsal`). This is a reference, not a re-declaration — if `mandatory-gates.yaml` gains a third rule in the future, Branch merge automatically inherits it with no edit to this ADR or its schema.**

This directly reuses today's ADR-011 resolution rather than re-litigating OQ-10 a second time for the Branch case specifically — the same "single source of truth, everything else references it" discipline `mandatory-gates.yaml`'s own `release-policy.yaml` sibling already applies (its `release_gate_requirement.scope.conditionally_required` field, resolved in the same batch as this ADR).

## Sub-decision (d): Conflict Detection and Resolution

**Decision: A `merge_base` field (opaque reference to the point in the parent Workflow's history the Branch forked from) is compared against the parent's CURRENT state at merge time. A mismatch — whether from the parent advancing independently, or from a sibling Branch's merge landing first — triggers `CONFLICT`. Resolution is ALWAYS an explicit human/authority action recording a `resolution_rule_applied` string; no automatic conflict-resolution algorithm is defined.**

Why no auto-resolution algorithm: the mother-document corpus gives zero evidence for what a "correct" automatic Branch-merge conflict resolution would even mean for a *cognitive execution lineage* (as opposed to textual source code, where three-way diff/merge algorithms are well-established but were never claimed as this system's own mechanism — MP L40's "Git Branch/Tag/Commit" mention is explicitly an identifier-type example only, `ADR-003:19`). Inventing a merge algorithm here would be exactly the kind of unsupported invention Decision Driver #2 (fail-closed) forbids. The `resolution_rule_applied` field directly reuses the pattern `specs/jurisdiction/conflict-of-laws-output.schema.yaml`'s `CONSERVATIVE_SAFE_MODE` status already established (a fallback/escalation state that MUST carry a non-null record of which rule resolved it, enforced via `allOf`/`if`/`then` — the exact JSON Schema technique that file uses) — this is the second time this project has needed "an escalation state requires a named resolution record," and reusing the same shape rather than inventing a second one is itself an instance of Decision Driver #1.

Both conflict SOURCES named in `blast-radius-chain.schema.yaml`'s own gap (`branch_node.explicitly_not_specified_here`, "two Branches diverge and both attempt Merge") are covered by the single `merge_base`-staleness check: a sibling Branch's successful merge changes the parent's current state exactly as much as the parent advancing independently would — from the second Branch's perspective, both are "my `merge_base` no longer matches." This unifies what looked like two separate gaps into one mechanism, without needing Branch-to-Branch awareness of each other.

## Method Used

Direct composition of already-ACCEPTED decisions (`authority.schema.yaml`'s A0-A4, `risk-tier.schema.yaml` + `mandatory-gates.yaml`'s R3∪R4 gate injection [ADR-004/ADR-011], `rollback.schema.yaml`'s reversibility model, `conflict-of-laws-output.schema.yaml`'s resolution-tracking pattern) applied to a genuinely new subject (Branch has zero prior mother-document text) — the same "direct application of an already-decided principle" method ADR-010's Method Used section names (`ADR-010:108`), but exercised across FIVE existing decisions composed together rather than one. Where no existing decision could be reused (conflict AUTO-resolution), the fail-closed default was chosen explicitly and disclosed as a real design choice, not silently assumed.

## Recommendation

1. **(a)** Adopt the 6-state machine (`ACTIVE`/`MERGE_REQUESTED`/`CONFLICT`/`MERGED`/`ABANDONED`/`ROLLED_BACK`) and the transition table above as `specs/workflow/branch.schema.yaml`'s canonical state machine.
2. **(b)** Merging requires `authority_level >= A2` (Staged Write) at minimum.
3. **(c)** When `risk_tier IN [R3, R4]`, merging additionally requires `mandatory-gates.yaml#/grounded_rules` (currently 2 rules) to reach an acceptable Final Status — referenced live, not re-declared.
4. **(d)** Conflicts are detected via `merge_base` staleness and ALWAYS resolved by an explicit human/authority action recording `resolution_rule_applied` — no automatic merge algorithm.

This resolves MRSP-4, `blast-radius-chain.schema.yaml`'s `open_questions.blast-radius-1`, and closes ADR-003 Consequences follow-up (iii).

## Consequences

- Positive: Branch — previously the one blast-radius-chain node with zero behavioral spec — now has a complete, machine-checkable lifecycle that reuses (rather than duplicates) four already-validated mechanisms. No new authority ladder, gate list, or rollback shape was invented.
- Negative: any real implementation must now track `merge_base` per Branch (a new piece of state no prior schema required) — an accepted, necessary cost of making staleness/conflict detection possible at all.
- New follow-up surfaced (not solved here): (i) this ADR does not define HOW `merge_base`/the parent Workflow's "current state" is computed or hashed — it is left as an opaque string reference, the same soft-reference treatment this corpus already uses for concepts with no existing formal representation (e.g. `gate_ref` before ADR-011, `rollback.schema.yaml`'s `plan_id`); (ii) whether a Branch-vs-Branch conflict should eventually get a distinct status code from a Branch-vs-parent conflict (both currently collapse to the same `CONFLICT` state) is left open, since no mother-document or existing schema evidence currently distinguishes them; (iii) this ADR does not address whether MULTIPLE Branches may target the SAME merge (fan-in) — only the single-parent 1:N cardinality `blast-radius-chain.schema.yaml`'s own `containment_semantics` already established is assumed.

## Migration / Rollback

- **Migration**: zero-cost — no Branch implementation exists yet (same greenfield framing every prior ADR in this series uses). The only "migration" is building `specs/workflow/branch.schema.yaml` (a new file, MRSP-4's tracked location) plus updating `blast-radius-chain.schema.yaml#/open_questions/blast-radius-1` and `docs/architecture/MACHINE_READABLE_SPEC_PLAN.md`'s row 145 to point at this ADR.
- **Rollback**: git-revert fast path — pure schema/documentation addition, zero runtime side effects yet. `git_revert_sufficient: true`, `rollback_risk: Low`.

## Evidence

- `docs/adr/ADR-003-tenant-model-and-cas-isolation.md:19,94,112` (Branch's zero-definition finding, minimal definition, Consequences follow-up (iii)).
- `specs/execution/blast-radius-chain.schema.yaml:138-232` (`branch_node`, `explicitly_not_specified_here`, `open_questions.blast-radius-1`) — re-read in full this session.
- `docs/architecture/MACHINE_READABLE_SPEC_PLAN.md:145,331` (MRSP row for `workflow/branch.schema.yaml`, MRSP-4 open-question row) — re-read this session.
- `specs/execution/authority.schema.yaml:140-221` (A0-A4 levels, A1/A2 scope descriptions) — re-read in full this session; grounds Sub-decision (b).
- `specs/execution/risk-tier.schema.yaml:128-147` (`mandatory_gate_injection_trigger`, R3∪R4 condition) — re-read this session; grounds Sub-decision (c).
- `policies/ai-execution/mandatory-gates.yaml#/grounded_rules` (2 rules, as updated earlier this same session by ADR-011) — grounds Sub-decision (c) directly.
- `specs/execution/gate.schema.yaml#/gate_catalog` (ADR-011, same session) — the gate ids Sub-decision (c) references.
- `specs/execution/rollback.schema.yaml:426-443` (`result.side_state` enum including `ROLLED_BACK`) — re-read this session; grounds Sub-decision (a)'s terminal-state naming.
- `specs/jurisdiction/conflict-of-laws-output.schema.yaml` (`CONSERVATIVE_SAFE_MODE`'s `resolution_rule_applied` allOf/if/then pattern) — reused verbatim as this ADR's Sub-decision (d) method.
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:961-969` (§11.2 Accept/Reject/Edit/Lock/Branch/Merge vocabulary) — the only mother-document evidence Branch/Merge is an intentional concept at all, already cited by ADR-003.
- `docs/adr/ADR-010-database-platform-and-table-naming.md:108` (Method Used precedent: direct application of already-decided principles).

**邊界確認**：本次任務全程僅執行 Read/Grep（唯讀），未對三母文件做任何修改。本 ADR 本身即為輸出；套用至 `specs/workflow/branch.schema.yaml`（機讀 spec，非母文件）留待本 ADR 之後的獨立編輯完成。
