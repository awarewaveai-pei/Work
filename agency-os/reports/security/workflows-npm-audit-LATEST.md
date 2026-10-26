# Workflows npm audit report

- Generated UTC: 2026-10-26T08:03:20.299Z
- Path: `lobster-factory/packages/workflows`
- Total: 2
- Critical: 0
- High: 2
- Moderate: 0
- Low: 0

## Findings

- `@prisma/config`: severity=`high`, direct=`false`, fixAvailable=`true`, via=deepmerge-ts
- `deepmerge-ts`: severity=`high`, direct=`false`, fixAvailable=`true`, via=deepmerge-ts (1145093)

## Override health

- NOT OVERRIDDEN `deepmerge-ts`: advisory covers `<8.0.0` — add an override if upstream has not bumped it.

## Exposure split

- Shipped dependencies (`npm audit --omit=dev`) high+critical: **0**
- High/critical advisories with their own CVE: **1** (deepmerge-ts)

Accepted (dated, expiring - not silenced):
- `deepmerge-ts` GHSA-ggr8-5vv4-36mx - accepted until **2026-11-23**, then it fails this gate again.

- Gate verdict: **pass** (shipped = hard fail; toolchain = unacknowledged or expired; pass = nothing outstanding)

## Remediation playbook

1. Bump the direct deps first: `npm install @trigger.dev/sdk@<latest> @trigger.dev/build@<latest> trigger.dev@<latest> --save-exact` (keep all three in lockstep). Re-audit — some transitives clear natively.
2. For whatever remains, raise the `overrides` floor to a patched version **inside the same major** (`npm view <pkg> versions`). Same-major keeps the override semver-safe.
3. `npm install && npm audit` — target `high=0`. Then `npm test`.
4. Never take npm's `--force` suggestion here: it 'fixes' the tree by downgrading trigger.dev 4.x to 1.0.8, which destroys the SDK generation this package is built on.
5. Repo-only fixes do not protect production — the workflows must be redeployed to the EU Trigger.dev instance for the new tree to take effect.
