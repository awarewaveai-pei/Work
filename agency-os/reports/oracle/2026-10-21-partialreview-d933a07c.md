# codex-oracle review -- 2026-10-21 15:49:48 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/TarotStudio.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `b07eaceff`
- context: Tarot studio fixes b07eaceff: locked sidebar shows lock notice + unlock; subject hint says English only and warns on CJK (translation was removed 2026-06-11); in-browser 78-card loop gets a stop button with AbortController and per-card stop check, auto-save skipped after stop; compare busy flag cleared on pick; finished background job cleared on re-lock. Check: can any card request be sent after stop; any state left stuck after stop/error; any regression in background batch flow.
- exit: 0 | elapsed: 300832ms | answer: 2189B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/TarotStudio.tsx
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: A running background job can populate a newly locked deck with the previous style.
  TarotStudio.tsx:555 -> TarotStudio.tsx:794
  confidence  -> CONFIRMED
  scenario    -> Job A is running; the user unlocks, changes style, and relocks. The new deck resets, but Job A remains attached and its results load into the new deck by card index.
  why missed  -> The reset intentionally preserves paid running jobs, but no deck/job identity is checked when results load.

FINDING 2: An aborted local generation can write stale artwork into a replacement deck.
  TarotStudio.tsx:631 -> TarotStudio.tsx:677
  confidence  -> CONFIRMED
  scenario    -> A request finishes while grading/rendering is pending; the user unlocks and relocks; the old operation completes and writes its artwork into the new deck.
  why missed  -> Abort handling covers the request and gallery save, but there is no generation/deck token check before the final state update.

FINDING 3: Gallery auto-save can still run after Stop.
  TarotStudio.tsx:661 -> TarotStudio.tsx:604
  confidence  -> CONFIRMED
  scenario    -> Stop occurs after the one-time abort check but before `FileReader.onload`; the callback still calls `saveToGallery`, issuing the gallery write after stopping.
  why missed  -> Cancellation is checked before scheduling `FileReader`, not immediately before the asynchronous save.

FINDING 4: Clearing a completed background job can be undone by an in-flight polling response.
  TarotStudio.tsx:353 -> TarotStudio.tsx:555
  confidence  -> CONFIRMED
  scenario    -> A poll is in flight when relock clears `bgJobId`; the old response sets status back to `done`, leaving a “load results” state whose handler has no job ID.
  why missed  -> Clearing the interval/state does not cancel or identity-check already-started polls.

FINDING 5: The CJK warning does not detect Japanese kana or Korean text.
  TarotStudio.tsx:1383
  confidence  -> CONFIRMED
  scenario    -> Subject text `ねこ` or `고양이` is entered; no warning appears despite the feature claiming to warn on CJK input.
  why missed  -> The regex matches Han ideographs only, not Hiragana, Katakana, or Hangul.

TOTAL: 5 findings
