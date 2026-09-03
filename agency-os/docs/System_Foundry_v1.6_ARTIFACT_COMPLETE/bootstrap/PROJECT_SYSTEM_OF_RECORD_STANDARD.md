# Project System-of-Record Standard v1.4

Every generated project starts with `.foundry/` as the machine-readable control plane. It records governance state; it MUST NOT duplicate business data or source code.

```text
.foundry/
  foundry-lock.json
  control-plane-version.json
  artifact-index.json
  project-profile.json
  source-of-truth-map.json
  risk-classification.json
  authority-policy.json
  evidence-register.json
  decision-register.json
  exception-register.json
  lifecycle-register.json
  release-register.json
  migration-history/
  handoffs/
  verification/
```

`artifact-index.json` is the canonical metadata index for control-plane artifacts and records `schema_id`, `schema_version`, `revision`, `created_at`, and `updated_at`; `foundry-lock.json` pins the Foundry version and kernel digest. Embedding the same metadata inside every artifact is optional, avoiding duplicate metadata sources of truth. A schema-version change is fail-closed until an explicit migration record exists.
