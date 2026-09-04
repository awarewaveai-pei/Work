# DevOps Standard

Every environment MUST be reproducible from version-controlled definitions; no environment may be hand-configured and undocumented.

Required: CI/CD pipeline with mandatory gates before deploy (tests, security scan per `engineering/SUPPLY_CHAIN_SECURITY_STANDARD.md`), environment parity (dev/staging/prod share the same deployment mechanism, differing only in configuration data), infrastructure-as-code for all provisioned resources, artifact immutability (the exact artifact tested is the exact artifact deployed, never rebuilt at deploy time), secrets injected at runtime from a secrets manager and never committed or baked into images, and an automated rollback mechanism (`engineering/ROLLBACK_STANDARD.md`) usable without engineer-in-the-loop for the common case.

Deploys MUST be traceable to a specific commit and pipeline run. A production change made outside the pipeline (manual SSH edit, console click-through) is a controls failure and MUST be logged as an exception (`governance/EXCEPTION_STANDARD.md`), not treated as routine practice.

This standard owns pipeline mechanics (how a build moves through gates to a deployed artifact); `engineering/RELEASE_ENGINEERING_STANDARD.md` owns the release-evidence bundle a given deployment must carry. The two MUST NOT independently re-define artifact immutability or rollback — a pipeline mechanism change and a release-evidence requirement change are reviewed together when they touch the same concern.
