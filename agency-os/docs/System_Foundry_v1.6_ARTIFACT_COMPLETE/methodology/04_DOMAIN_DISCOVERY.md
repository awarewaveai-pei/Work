# Domain Discovery Standard

## Purpose
從 `03_BUSINESS_ARCHITECTURE.md` 的能力地圖，推導出技術層的領域模型：語言、實體、邊界、不變量——這是 `05_ARCHITECTURE_OPTIONS.md` 評估架構選項時要保護的東西。

## Sequencing
Step 04. Consumes the business capability map from `03_BUSINESS_ARCHITECTURE.md`. Its output feeds `05_ARCHITECTURE_OPTIONS.md` and directly informs `engineering/DOMAIN_ARCHITECTURE_STANDARD.md` once implementation begins.

## Required Scope
- ubiquitous language
- entities
- aggregates
- bounded contexts
- ownership
- invariants
- state machines

## Required Fields
1. **Ubiquitous language glossary** — every domain term defined once, unambiguously; a term meaning two different things across contexts MUST be split into two distinctly-named terms, not left overloaded.
2. **Bounded contexts** — each with an explicit boundary and an explicit owner, ideally traceable 1:1 to a business capability from `03_BUSINESS_ARCHITECTURE.md`.
3. **Entities and aggregates** — the core domain objects and their consistency boundaries.
4. **Invariants** — rules that must always hold within a context (e.g. "an order total always equals the sum of its line items") — these become the fitness-function candidates in `assurance/ARCHITECTURE_FITNESS_FUNCTIONS.md` later.
5. **State machines** — explicit legal-transition models for any entity with a lifecycle, not implicit status strings.
6. **Non-goals per context** — what this context deliberately does not own, to prevent scope bleed once implementation starts.

## Gate
`G4_DOMAIN_STABLE` (`runtime/stage-gates.yaml`) requires: domain_model, bounded_contexts, invariants, ownership, lifecycle_surfaces. It fails when two bounded contexts claim ownership of the same invariant, or when a domain term is used with two different meanings in the glossary without being split.
