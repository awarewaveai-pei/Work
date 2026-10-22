# codex-oracle review -- 2026-10-22 21:50:58 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/__tests__/model-specs.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Tarot prompt fixes: THE LOVERS couple fill drops 'second' when the two figures differ ('a nude man and a second nude woman' drew two women) and adds left/right positions; Fool dog grounded on the rock; content-first order (FLUX schnell 256 T5 tokens / Ideogram) splits the style: painter anchor + first technique phrases in the opening sentence, the rest after the scene, anchor said once. Also verify: does this change depend on something NOT visible in this diff (config, upstream default, another caller of buildCardPrompt)? If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 232781ms | answer: 594B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/__tests__/model-specs.test.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Content-first splits long unpunctuated styles in the middle of a word
  cards.ts:500 -> cards.ts:482 (user-edited styles reach this path via TarotStudio.tsx:1921)
  confidence -> CONFIRMED
  scenario -> `styleResolved` is over 90 characters with no comma in its first 90 characters -> `styleRecap` cuts at character 90, then `splitStyleDetail` slices from that boundary, producing malformed text such as `...pigments acros: s luminous...`.
  why missed -> The test style has sentence and comma boundaries, so it never exercises the arbitrary 90-character fallback.

TOTAL: 1 findings
