# Repository Skeleton Generator Contract

The generator consumes an approved project profile, stack profile, bounded-context map, and public contracts.

It MUST generate boundaries, not business implementation guesses.

Minimum output:
```text
project/
  apps/
  packages/
  services/
  infra/
  tests/
  scripts/
  docs/
  .foundry/
    project-profile.yaml
    evidence/
    decisions/
    tasks/
    assurance/
```

Each generated component must state owner, public contract, dependencies, test boundary, observability boundary, and replacement strategy.
