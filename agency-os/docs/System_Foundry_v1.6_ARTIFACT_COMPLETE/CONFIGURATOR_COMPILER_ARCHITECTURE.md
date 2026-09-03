# System Foundry v1.6 — Configurator and Artifact Compiler Architecture

```text
Categorized YES/NO Questionnaire + Custom Requirements
                    |
                    v
            Immutable Answer Snapshot
                    |
             Locked Foundation Baseline
                    |
          Deterministic Question Rules
                    |
          Capability Dependency Closure
                    |
      Derived / Deferred State Normalization
                    |
             Conflict Validation
                    |
          Canonical foundry-plan IR
                    |
        Exact LEGO Module Projection
                    |
     +--------------+--------------+
     |                             |
     v                             v
Complete Module Packages     73-section Blueprint
     |                     ACTIVE / NOT_APPLICABLE
     +--------------+--------------+
                    |
          Staging Output Validation
                    |
            Artifact Hash Manifest
                    |
               Atomic Commit
```

## Stable boundary
The browser never decides architecture or filesystem layout. The canonical `foundry-plan` is the stable 30-year boundary between discovery and generation.

## Complete selected module
A selected LEGO is not an empty directory. It must materialize requirements, architecture boundary, contracts, security, data/migration, tests, observability/SRE, rollback/recovery, implementation backlog and a machine-readable manifest.

## Absence is also a contract
If a module is not selected, none of its implementation paths or module documents may be generated. This prevents accidental complexity and validates minimum blast radius.

## Custom requirements
Free text is preserved verbatim under a stable `REQ-CUSTOM-*` ID. It activates the `custom` extension review module but does not silently guess a technology or capability mapping. Implementation remains blocked until explicit architecture mapping.
