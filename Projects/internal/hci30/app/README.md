# hci30 app — first real vertical slice

Not a product, not P1/P2/P3 work. One real endpoint (`GET /api/hci/v1/cases`, per `../api/API_CONTRACT_STANDARD.md`) and one page, proving the P0 work (schema, RLS, tenant-context propagation) actually holds when a real HTTP request goes through it — not just when a SQL test harness does.

## Run it

1. `powershell -ExecutionPolicy Bypass -File ../scripts/dev-db-init.ps1` — starts a persistent local Postgres (`127.0.0.1:5433`, gitignored generated password at `../infra/local/.env.dev`), applies every Wave 1 migration + synthetic fixtures once. Safe to re-run — skips migration if `hci.cases` already exists.
2. `npm install && npm start` (or `preview_start` with the `hci30-app` entry in `.claude/launch.json`) — serves on `:4030`.

## What it proves, not just claims

`SET ROLE hci_app_test_a` vs `hci_app_test_b` per request (the real mechanism `API_CONTRACT_STANDARD.md#tenant-context-propagation` names — these are `NOLOGIN` roles, unreachable except via `SET ROLE` from the owner connection this app holds). Switching the tenant toggle in the page issues a real HTTP request and returns a genuinely different row set — 3 cases for tenant A, 1 for tenant B, matching a direct `psql` query exactly. RLS is enforced by Postgres itself; this app has no authorization logic of its own to get wrong.

## What this is NOT

Not an auth system — the tenant switch is an explicit, visible dev toggle because no login exists yet (P0-06's own still-open scope), not a disguised real login. Not production-shaped — no build step, no framework, single file, `127.0.0.1`-only DB. Not a claim that P1/P2/P3 (see `21_HCI_TOP_TIER_GAP_ANALYSIS.md`) are done — this is one read endpoint on one table.
