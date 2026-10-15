# codex-oracle review -- 2026-10-15 11:43:35 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/docs/mockups/lessonkit.py, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/toolsheets.generated.ts, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/units.ts, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/catalog.ts, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/RunPage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/Charts.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/MethodVisual.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/ResultPage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/ResultPage.test.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: COS template 15.1 item 1: ResultPage.tsx had 10 branches on method_id === systems.iceberg_model (const iceberg). Now there is no method-id branch: the iceberg joins MethodVisual RECORD_PICTURES (heading/caption/draw from units), and an entry may carry homes (unit keys that charts A trend / B loop sit on; the A home also gets the "track metric" line in card 4), parts (what card 3 charts map to) and table (card 6 title + note). Chart C moved to Charts.tsx OWN_CHARTS keyed by method, each with shows = the tool whose view it draws; lessonkit generates RESULT_PAGE_SHOWS from methods/registry/result-page-shows.yaml by_method into toolsheets.generated.ts and a test asserts OWN_CHARTS shows == RESULT_PAGE_SHOWS. RunPage layered colours = lib/units.ts unitFields (form fields whose keys are the lesson's units) instead of ICEBERG_ID (removed). Demo note names the tool instead of a fixed name; card 6 act text counts rows. Iceberg output must stay identical (mock parity test green); a fishbone run must show nine sections and no iceberg words. Check: any iceberg rendering difference vs before, undefined access when homes/table missing, chart letters when A or B missing, unitFields with fields lacking key.
- exit: 0 | elapsed: 308661ms | answer: 1350B
- files-reviewed: Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/RunPage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/Charts.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/MethodVisual.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/ResultPage.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/ResultPage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/catalog.ts, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/toolsheets.generated.ts, Projects/internal/cognitive-engineering-os/docs/mockups/lessonkit.py, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/units.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: More than five own charts render with an undefined chart letter.

  file:line   -> `Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/ResultPage.tsx:118` -> `Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/ResultPage.tsx:427-428`
  confidence  -> PLAUSIBLE
  scenario    -> A registry entry adds six charts; the sixth renders as `圖 undefined`, and the footer also says `圖 undefined`.
  why missed  -> `OWN_LETTERS` is fixed to five letters, while `OwnChart[]` and the YAML list have no maximum-length validation.

FINDING 2: Any method with one matching unit field makes every form field optional and layered.

  file:line   -> `Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/RunPage.tsx:266` -> `Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/MethodForm.tsx:44-45,137`
  confidence  -> PLAUSIBLE
  scenario    -> A lesson has unit `events`, but its form also has required `objective`; because `unitFields(...).length > 0`, submission skips required-field checking, so an empty `objective` is sent and all fields receive layer styling.
  why missed  -> The new helper correctly filters unit fields, but RunPage passes only a boolean; MethodForm then applies `layered` behavior to the entire field list.

TOTAL: 2 findings
