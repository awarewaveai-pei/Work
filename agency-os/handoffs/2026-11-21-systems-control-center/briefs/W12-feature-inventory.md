# W12 Feature lists for the systems that have no supervisor page (Opus 5.5)

Read `COMMON.md` (contract 1 and contract 2 feature_update) and `agency-os/systems/registry.json` first. Reports to the operator are always in Traditional Chinese.

Problem: on the live overview, 17 systems show 「尚未盤點」 in the 進度 column because their registry entries list no phases or features: cognitive-os, hci30, tarot, studio, cs, collect, ops-console, repair-center, provisioning, wordpress-ops, host-infra, database, governance, ao-operations, meeting-ppt, client-soulful, client-aware-wave. These systems have no supervisor page and will not get one; the overview page itself is their supervisor page. This card writes their first feature list, and later progress comes from `Feature:` trailers.

Do:
1. For each of these systems, add 1–3 phases and 4–12 features to the registry (new uuid v4 for each; slugs in kebab-case; names in Traditional Chinese, a phrase the operator can understand, e.g. 「塔羅抽牌與解讀」). A feature is a capability the operator can see or use, not a single file. If you find nothing for a system, give it no features and list it in `missing`.
2. Write `agency-os/handoffs/2026-11-21-systems-control-center/seed/features.json`: `{ "generated_at", "items": [{ "system_slug", "feature_slug", "status": "implemented|in_progress|todo", "source": "<file:line>" }], "missing": [] }`
   - implemented: the code exists and is reachable. source = the route, page, or main function at file:line.
   - in_progress: half-done. source = the TASKS.md entry or the WORKLOG block.
   - todo: an open item in TASKS.md or a plan. source = that line.
   - Never write verified (only a review can produce it). If something has no source, don't invent it; leave it out.
3. Register these 5 paths in the system they belong to (the last import listed them as unowned): `app/(shell)/ops/sites/[siteId]/SiteFlow.tsx`, `app/(shell)/ops/sites/new/NewSiteForm.tsx`, `app/(shell)/ops/sites/new/page.tsx`, `app/LoginSucceeded.tsx`, `lib/analytics-group.ts` (full paths start with `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`). For a folder, register the prefix ending in `/`.
4. Validate with node or python against contract 1: ids are unique uuids, slugs are globally unique, every feature.phase exists, and every path that doesn't end in `/` exists in HEAD.

Files: only `agency-os/systems/registry.json` and the `seed/features.json` above. Commit in your worktree (detached HEAD) and don't push. The commit message ends with `Next:` in Traditional Chinese, in the same paragraph as Co-Authored-By.
