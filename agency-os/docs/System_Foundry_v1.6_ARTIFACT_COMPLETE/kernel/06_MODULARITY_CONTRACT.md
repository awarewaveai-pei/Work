# Foundry Modularity / LEGO Contract

A module is independently evolvable only when ownership and contracts are explicit.

Every module/context must declare:
- state ownership
- behavior ownership
- public API/event contract
- invariants
- dependencies
- failure isolation boundary
- data lifecycle
- observability contract
- migration/rollback contract
- replacement strategy

## Forbidden coupling
- direct writes to another module's owned tables
- shared mutable state without an owner
- vendor-specific semantics inside domain language
- hidden cross-context imports that bypass public contracts
- duplicated authorization/business policy across boundaries

## Replaceability test
A module passes when its implementation/provider can be replaced while preserving domain semantics and public contracts, with a defined migration and rollback path.
