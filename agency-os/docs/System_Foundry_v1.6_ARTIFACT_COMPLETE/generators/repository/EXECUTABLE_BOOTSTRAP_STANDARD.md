# Executable Bootstrap Standard

`python scripts/foundry_new.py <name> --out <directory> --profile <profile> --archetype <archetype>` is the reference bootstrap implementation.

It MUST create a bounded repository skeleton and a versioned `.foundry/` control plane. It MUST refuse an existing target path and unsafe project names. Generated control-plane state is project governance metadata, never a second source of truth for domain data.

Validation: `python scripts/test_bootstrap_e2e.py`.
Expected result: `BOOTSTRAP E2E: PASS`.
Rollback: delete the newly created target directory before any external side effects; bootstrap performs no network or production mutation.
