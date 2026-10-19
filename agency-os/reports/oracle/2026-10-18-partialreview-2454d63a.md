# codex-oracle review -- 2026-10-18 10:53:48 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/Editor.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/compose, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/compose.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/posts.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/limits.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch-store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/auto-rules.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/auto-rules, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/tags, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/posts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/api.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/model.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: C21 social composer page: N comments with per-comment delay sent to Postiz values[] (delay = minutes Postiz sleeps before each comment), tags, repeat series, a post's own auto-reply rule (0105 social_auto_rules post_id), Reel format, custom date/time picker. A critic round already fixed: queued-post rule saves refused, rotation+repeat removed, IG/LinkedIn comment images not sent, retry after a failed step continues from the last write. Review only these paths.
- exit: 0 | elapsed: 39520ms | answer: 1153B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/Editor.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/api.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/posts/[id]/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/posts/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/compose.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch-store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/limits.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/posts.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/compose/AutoReply.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/compose/ChannelPicker.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/compose/Comments.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/compose/DateTimePicker.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/compose/Footer.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/compose/Formats.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/compose/Previews.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/compose/TagPicker.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/compose/Writer.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/compose/compose.css, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/compose/draft.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/compose/icons.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/auto-rules/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/social/tags/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/auto-rules.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Retry repeats the successful content save and then fails with a stale version conflict

  Editor.tsx:306 -> Editor.tsx:145  
  confidence  -> CONFIRMED  
  scenario    -> A draft save succeeds, but the later state transition fails; retrying reuses `done.current.ref` while still calling `saveContent`, issuing another PUT against the already-incremented version -> the retry receives 409 instead of continuing from the last write.  
  why missed   -> `done` records the last reference, but `run()` does not skip `saveContent` when that reference came from the current attempt.

FINDING 2: Selecting Reel is always rejected, even when a valid single video already exists

  Editor.tsx:235 -> compose.ts:108  
  confidence  -> CONFIRMED  
  scenario    -> An existing post has one `.mp4` media item and the user selects Instagram Reel -> `validate()` always returns “Reel 要一支影片” before submission, although `compose()` accepts exactly one video for Reel.  
  why missed   -> The UI validation retains the temporary “video upload not open” restriction instead of validating the already-supported media state.

TOTAL: 2 findings
