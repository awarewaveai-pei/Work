# codex-oracle review -- 2026-10-23 13:44:19 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/r2-delete-guard.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/__tests__/r2-delete-guard.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/delete-guard.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/delete-guard.test.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/[id]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/cleanup/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/designs/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/hosting/provision-staging/route.ts, lobster-factory/infra/hetzner-phase1-core/scripts/aw-hosting-gate.sh, lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/hosting-gate.test.sh  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Follow-up to commit 89e133f68. (1) Generalize the video delete guard into lib/content/r2-delete-guard.ts deleteUnreferencedAsset(objectKey): the single delete entry for saved gallery assets; bucket chosen from the key prefix (video/<dir>/ -> video bucket, whole folder by prefix; remotion/ -> video bucket single object; designs/ captions/ web/ -> designs bucket single object); unknown prefix refused. Reason: the standard-REST publish path keeps R2 image URLs as hotlinks (markdownToHtml), and gallery rows with remotion/ and designs/*.mp4 keys could never be deleted. WP REST now goes through ?rest_route= because subfolder staging sites lacked pretty permalinks. (2) Staging sites: aw-hosting-gate.sh prepare now inserts an X-Forwarded-Proto->HTTPS block into wp-config (idempotent marker) because without it is_ssl() is false and WordPress disables application passwords, so the token wired into wp_sites never authenticated; provision-staging sets /%postname%/ permalinks and writes the WP .htaccess block. Also verify: does this change depend on something NOT visible in this diff (config, cron, schema, upstream default)? If you cannot support a real finding, return no findings.

- exit: 0 | elapsed: 400972ms | answer: 1624B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/__tests__/r2-delete-guard.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/delete-guard.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/hosting/provision-staging/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/designs/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/[id]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/cleanup/route.ts, lobster-factory/infra/hetzner-phase1-core/scripts/aw-hosting-gate.sh, lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/hosting-gate.test.sh, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/r2-delete-guard.ts
- deletions-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/delete-guard.ts@ea17133be

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Single-object matching falsely treats key prefixes as references.
  file:line   -> `lib/content/r2-delete-guard.ts:55` -> `lib/content/r2-delete-guard.ts:61`
  confidence  -> CONFIRMED
  scenario    -> `designs/2026-09/foo.png` is unused, but a post references `designs/2026-09/foo.png.bak`; substring matching reports the first asset as in use, so deletion is refused.
  why missed  -> Tests cover different folders, not same-prefix filenames.

FINDING 2: The delete-boundary test does not enforce the generalized guard.
  file:line   -> `lib/content/__tests__/r2-delete-guard.test.ts:121` -> `lib/content/r2-delete-guard.ts:122`
  confidence  -> CONFIRMED
  scenario    -> A caller directly invokes `deleteDesignObject` or `r2DeleteObject` for a saved asset; the boundary test still passes because it scans only `deleteVideoObjects`.
  why missed  -> The old video-only boundary assertion was renamed but not generalized.

FINDING 3: Pretty-permalink provisioning may silently leave `.htaccess` unwritten.
  file:line   -> `app/api/internal/hosting/provision-staging/route.ts:473`
  confidence  -> PLAUSIBLE
  scenario    -> Standard WP-CLI runs `rewrite structure` without `--hard`; the separate `wp eval` hard flush lacks `save_mod_rewrite_rules()`, so `/wp-json/` remains 404 while provisioning reports success. WordPress only writes `.htaccess` when that function is loaded; [WP-CLI documents `--hard` for this](https://developer.wordpress.org/cli/commands/rewrite/flush/).
  why missed  -> The code checks only the command exit code, not whether `.htaccess` contains the generated block.

TOTAL: 3 findings
