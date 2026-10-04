# Steps 3 and 4 checklist

## TEACH

- [x] Lessons and low-risk practice cases are reviewed content files under `ai_lego/platform/lessons/`, not database rows.
- [x] `load_lessons()` and `load_practice_cases()` validate every YAML file, source date, subject, course order, and `HISTORY.json` fingerprint.
- [x] `rulesets/teach.py` exposes both TEACH rulesets through normal discovery.
- [x] Draft lessons remain visible to content callers, while `reviewed_only()` excludes them from reviewed-only callers.
- [x] `generate_lessons.py` reads the existing tool catalog and example registry, makes no model call, is deterministic, and never overwrites.
- [x] The required independent-origins lesson, seven package course entries, three generated tool fixtures, and four publisher-backed example cases are present.
- [x] Loader and generator refusal classes have unit tests, including fingerprint, minutes, source, reviewed-draft, and write-once mutations.
- [x] Person-owned `teach.run`, `teach.aar`, and `teach.practice_consent` records use generic `/me/docs/{kind}` routes; completion is system-only and is written by the completion hook after every required lesson has a run.
- [x] TEACH's AI opponent and thinking-move feedback read only the selected lesson, checked practice case, run notes, and consent guard; their output has no score or ranking fields and real-case context needs consent.
- [x] Lesson and practice-case reads include drafts, prefer the person's `govern.location`, and explain the fallback when no local case exists.
- [x] TEACH page is a case-free `/me/teach` surface: visible subject, lesson, case, role and action controls use design-system classes, and the person's words stay beside tagged AI output.
- [ ] The 90-second manipulation-technique content is not invented here; it remains operator-reviewed content work from the confirmed card.

## EXPRESS

- [x] The person selects a reader, format, key points and case-owned records; the save hook re-checks every `{project_id, kind, doc_id}` against the current case.
- [x] The eight formats are a versioned `express.formats` ruleset with sections and an assumed reader.
- [x] The outline route and builder use only selected records; every node carries its selected record refs, and pasted words are omitted from the outline for the quoted gate.
- [x] `draft_from_outline` and `adjust_for_reader` read the selected records and live status from `evidence.checked_claims()`; they refuse a missing ref or a ref outside the selection.
- [x] Every saved draft sentence has text, at least one selected ref, an author and an unchecked flag; AI sentences are always stored as `author: "ai"`; a person cannot remove an unchecked claim's marker through the generic save route.
- [x] A claim that is not usable as fact or has fewer than two independent origins is saved with `unchecked: true`; the handback question occurs before the model call until the person saves `unchecked_ok: true`.
- [x] The person's confidence and uncertainty text is included unchanged; selected `verify.message` text reaches the model only through `AiAction.quoted` after the crisis check, and selected sources are narrowed for the citation gate.
- [x] `express.sent` is user-only, points to a saved draft and version in this case, and is not written by the EXPRESS AI actions or hook; selection CRUD, outline, draft listing, format listing and version routes are covered.
- [ ] The person-facing EXPRESS page and export/send presentation belong to the later EXPRESS page/export cards; this card supplies the record and AI contract underneath them.
