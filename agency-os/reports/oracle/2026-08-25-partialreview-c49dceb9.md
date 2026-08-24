# codex-oracle review -- 2026-08-25 00:17:40 +08:00

- mode: `review`
- scope: whole repo
- target: `648e66a6`
- context: ROUND 4, closing the loop. Round 3 raised three findings; all were grep-verified true and two were fixed AFTER the round-3 artifact was written, so those fixes have never been reviewed by anything. Review them now. FIX A, round-3 finding 2, the candidate-set divergence: lib/content/video/reconcile.ts no longer filters R2 keys through a known-format list. The OUTPUT_FORMATS constant is deleted entirely, the regex format segment is now a generic bracket-caret-slash-plus capture so every format present in R2 is collected, and keys are grouped into a Map of directory to a record of format to url built from the actual object key. The checked counter now uses groups.size. Intent is that reconcile and app/api/video/status/route.ts now hand pickPrimaryOutput the same shape of input, so the earlier claim of a single source of truth is finally true rather than only true for the picker. FIX B, round-3 finding 3, the empty archive-only reason: scripts/verify-archive-tasks-lift.ps1 now matches the archive-only payload with a lazy star instead of lazy plus so a blank reason still matches and is rejected explicitly with a length check of less than four, and the contradiction guard was decoupled to detect only the annotation prefix rather than the payload. NEW TEST: lib/content/blocks/__tests__/pick-primary-output.test.ts pins priority order, insertion-order independence, deterministic sorted fallback for unknown formats, known beating unknown, empty input, and no duplicates in the priority list. Verification run after the fixes: fixture suite 9 of 9, tsc clean, vitest 51 files and 605 tests passing, health 100 percent at 372 of 372, archive gate PASS with 7 bullets and 4 lifted and 0 missing. Attack these specifically: whether the new generic regex in reconcile can now match or group R2 keys it should not, whether dropping the known-format filter changes what counts as a video group in any harmful way, whether the archive-only length threshold of four can reject a legitimate short reason or still accept a meaningless one, and whether the new test file actually pins the properties it claims or would still pass if pickPrimaryOutput regressed.
- exit: 0 | elapsed: 792346ms | answer: 2945B
- files-reviewed: agency-os/reports/ao-close/2026-05-25-1837.md, agency-os/reports/ao-close/2026-08-24-2013.md, agency-os/reports/ao-close/2026-08-24-2014.md
- deletions-reviewed: agency-os/reports/ao-close/2026-05-25-1837.md@8184313b

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: `reconcileVideos()` still dedupes on `object_key` alone, so a row from another org can suppress the orphan insert this sweep is supposed to heal.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/reconcile.ts:82, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/blocks/video-pipeline.ts:123
  confidence  -> CONFIRMED
  scenario    -> Org A already has `media_assets.object_key = video/Foo/16x9.mp4`. Org B renders a different video whose sanitized title also becomes `Foo`, the user closes the tab, and only the R2 object exists. `reconcileVideos()` computes the same `checkKey`, finds Org A's row with `.eq("object_key", checkKey)`, and `continue`s, so Org B's orphan is never inserted. The upsert path explicitly documents that `object_key` is not globally unique across tenants, but the existence check still treats it as if it were.
  why missed  -> The fix focused on making both callers choose the same primary URL, but did not re-check whether the pre-insert existence query uses the same uniqueness domain as `recordVideoAsset()`.

FINDING 2: The new `archive-only` length gate rejects valid short Chinese reasons that the writer-side contract still allows.
  file:line   -> scripts/verify-archive-tasks-lift.ps1:259, .claude/commands/ao-close.md:86
  confidence  -> CONFIRMED
  scenario    -> AO-CLOSE emits `<!-- archive-only: 撌脰圾瘙?-->` for a session-gap item that was already resolved, which matches the documented ?歇?芾?閫?捱??use case. The writer contract only requires `archive-only: <?>`, but the verifier now fails any reason shorter than 4 characters, so this legitimate annotation blocks closeout with a false failure.
  why missed  -> The blank-reason fix added an arbitrary minimum length, but the upstream command spec was not tightened to the same rule.

FINDING 3: The new `pickPrimaryOutput` test file does not actually pin the full priority order it claims to pin.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/blocks/__tests__/pick-primary-output.test.ts:13, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/blocks/video-pipeline.ts:55
  confidence  -> CONFIRMED
  scenario    -> If `PRIMARY_OUTPUT_PRIORITY` regresses by moving `youtube_linkedin` below `9x16`, or by dropping `tiktok_reels`/`instagram_facebook`/`twitter_reddit_bluesky`, a render output set containing those historical keys will choose a different primary URL and therefore a different `media_assets.object_key`. The current tests still pass because they only exercise `16x9` vs `9x16`, `9x16` vs `4x5`, and unknown-format fallback; none of the four trailing priority entries are covered at all.
  why missed  -> The author added tests around the specific pairs from the previous review, but stopped short of covering every declared priority edge that the helper now owns.

TOTAL: 3 findings
