# 30-Year Replacement Test Standard

## Purpose
Proves, per architecturally significant module, that its implementation/provider can be replaced without rewriting the system around it. This is the internal-architecture half of the 30-year claim required by `kernel/07_30_YEAR_EVOLUTION_CONTRACT.md`; the external/commercial half is `assurance/VENDOR_EXIT_TEST.md`.

## Scope
Applies to every module or bounded context that declares ownership under `kernel/06_MODULARITY_CONTRACT.md` (state ownership, behavior ownership, public contract). A module too small to have an independent contract (a single internal utility) is out of scope; a module whose replacement would ripple across other modules' owned data or contracts is exactly what this test exists to catch.

## Required evidence: Replacement Dossier (per module)
1. **Replacement boundary** — an explicit line between what is stable domain semantics (must survive any implementation swap) and what is replaceable implementation detail (framework, runtime, persistence engine, transport), per the Stable/Replaceable asset split in `kernel/07_30_YEAR_EVOLUTION_CONTRACT.md`.
2. **Public contract** — the module's API/event/schema contract, versioned and documented independently of its current implementation (per `kernel/06_MODULARITY_CONTRACT.md`).
3. **Migration path** — a concrete expand -> dual-compatibility -> migrate -> validate -> contract sequence (per `01_SYSTEM_FOUNDRY_CONSTITUTION.md` Compatibility Rule), not a bare assertion that migration is "possible."
4. **Data extraction path** — proof the module's owned data can be exported in an implementation-neutral format.

## Pass / fail mechanism
A reviewer who is not the module's author (`kernel/04_SUBAGENT_INHERITANCE.md` independence-of-roles requirement) must be able to answer: "if provider/framework X were swapped for Y, what changes outside this module's declared boundary?" The mechanically checkable pass condition is that the honest answer is **nothing in domain language or another module's contract — only the adapter**. If the answer touches a forbidden-coupling pattern from `kernel/06_MODULARITY_CONTRACT.md` (direct writes to another module's tables, shared mutable state without an owner, vendor semantics leaking into domain language, hidden cross-context imports), the test **FAILS**.

Concrete fail signatures:
- hidden coupling: vendor SDK types appear in the module's public interface
- undocumented assumption: business logic silently depends on a specific engine's transaction semantics not stated in the contract
- migration path exists only in prose and has never been exercised even at small scale

## MUST NOT
- Pass this test on an unexercised claim ("this is decoupled" without a traced dependency graph). Where feasible, back the claim with an executable check — see `assurance/ARCHITECTURE_FITNESS_FUNCTIONS.md` for a dependency-direction fitness function that mechanically flags cross-boundary imports.
- Treat a passing 30-year replacement test as sufficient on its own for a "30-year ready" claim when the module also depends on a commercial vendor — `assurance/VENDOR_EXIT_TEST.md` is required in addition, not instead.

## Re-verification triggers
- the module's public contract changes
- the module's implementation/provider is actually replaced
- module ownership changes (`kernel/06_MODULARITY_CONTRACT.md`)
- the dossier's evidence exceeds its freshness SLA (`assurance/POLICY_FRESHNESS_STANDARD.md` class) — treat as `STALE_EVIDENCE`, not silently-still-valid

## Record
`module_id`, `replacement_boundary`, `stable_contract_ref`, `migration_path_ref`, `migration_rehearsed` (yes/no + evidence), `data_extraction_path_ref`, `reviewer` (must differ from module author), `last_verified`, `evidence_state` (VERIFIED / INFERRED / ASSUMED / UNKNOWN / DISPUTED).

## Cross-references
- `assurance/VENDOR_EXIT_TEST.md` — the commercial/external counterpart; both required together per `kernel/07_30_YEAR_EVOLUTION_CONTRACT.md`.
- `engineering/VENDOR_INDEPENDENCE_STANDARD.md` — defines which capabilities must sit behind a replaceable adapter in the first place.
- `assurance/ARCHITECTURE_FITNESS_FUNCTIONS.md` — the continuous, automated check that a passing dossier doesn't silently regress between reviews.
