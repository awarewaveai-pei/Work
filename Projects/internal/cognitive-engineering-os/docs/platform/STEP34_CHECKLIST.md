# Steps 3 and 4 checklist

## TEACH

- [x] Lessons and low-risk practice cases are reviewed content files under `ai_lego/platform/lessons/`, not database rows.
- [x] `load_lessons()` and `load_practice_cases()` validate every YAML file, source check state, subject, course order, and `HISTORY.json` fingerprint; cases not yet checked are shown as such, never given an invented date.
- [x] `rulesets/teach.py` exposes both TEACH rulesets through normal discovery.
- [x] Draft lessons remain visible to content callers, while `reviewed_only()` excludes them from reviewed-only callers.
- [x] `generate_lessons.py` reads the existing tool catalog and example registry, makes no model call, is deterministic, and never overwrites.
- [x] The required independent-origins lesson, seven package course entries, three generated tool fixtures, and four publisher-backed example cases are present.
- [x] Loader and generator refusal classes have unit tests, including fingerprint, minutes, source, reviewed-draft, and write-once mutations.
- [x] Person-owned `teach.run`, `teach.aar`, and `teach.practice_consent` records use generic `/me/docs/{kind}` routes; practice consent is tied to a real case and erased with it; completion is system-only, deletable by the person, and the hook respects the person's default-keep opt-out after every required lesson has a run.
- [x] 「練習紀錄」記下上過哪些課與練習案例做到哪；預設保留，但本人可以選擇不留，也可以刪除完成紀錄。
- [x] TEACH's AI opponent and thinking-move feedback read only the selected lesson, checked practice case, run notes, and consent guard; their output has no score or ranking fields and real-case context needs consent.
- [x] Lesson and practice-case reads include drafts, prefer the person's `govern.location`, and explain the fallback when no local case exists.
- [x] TEACH page is a case-free `/me/teach` surface: visible subject, lesson, case, role and action controls use design-system classes, and the person's words stay beside tagged AI output.
- [ ] The 90-second manipulation-technique content is not invented here; it remains operator-reviewed content work from the confirmed card.
- [ ] 情境演練、共同實作空間，以及 GOVERN 高風險護欄串接尚未建置；這些是未完成的 TEACH 工作，不以內容文字冒充已完成。

## EXPRESS

- [x] The person selects a reader, format, key points and case-owned records; the save hook re-checks every `{project_id, kind, doc_id}` against the current case.
- [x] The eight formats are a versioned `express.formats` ruleset with sections and an assumed reader.
- [x] The outline route and builder use only selected records; every node carries its selected record refs, and pasted words are omitted from the outline for the quoted gate.
- [x] `draft_from_outline` and `adjust_for_reader` read the selected records and live status from `evidence.checked_claims()`; they refuse a missing ref or a ref outside the selection.
- [x] Every saved draft sentence has text, at least one selected ref, an author and an unchecked flag; AI sentences are always stored as `author: "ai"`; a person cannot remove an unchecked claim's marker through the generic save route.
- [x] A claim that is not usable as fact or has fewer than two independent origins is saved with `unchecked: true`; the handback question occurs before the model call until the person saves `unchecked_ok: true`.
- [x] The person's confidence and uncertainty text is included unchanged; selected `verify.message` text reaches the model only through `AiAction.quoted` after the crisis check, and selected sources are narrowed for the citation gate.
- [x] `express.sent` is user-only, points to a saved draft and version in this case, and is not written by the EXPRESS AI actions or hook; selection CRUD, outline, draft listing, format listing and version routes are covered.
- [x] EXPRESS exports each draft in Markdown, plain text, and PDF with sentence marks and a final confidence/uncertainty section; export is read-only and the send route records the person's confirmed version only after the read and acknowledgement gates.
- [x] EXPRESS has no automatic delivery path: no recipient service is called; `.docx` is deliberately not built in this card, and group sharing belongs to the next card.
- [x] The person-facing EXPRESS page keeps reader, format, key points, checked case records, outline, sentence sources, unchecked and AI marks, confidence, uncertainty, exports, and the person-confirmed send flow on one screen; it uses the existing EXPRESS routes and design-system classes.
- [ ] The EXPRESS group proposal button is waiting for card 20 because `collab.proposal` is not present in this worktree's `ai_lego` tree; no case record is shared by this card.

## FACILITATE

- [x] Facilitator scripts are versioned YAML content under `ai_lego/platform/scripts/`, loaded as `facilitate.scripts`, with the card's four-item dont list as `FACIL_DONTS` (`dont-list.yaml`).
- [x] A script records each step's wording, minutes, donts and stop signals, plus an escalation path to GOVERN resources.
- [x] A subject with no stop signal in any step is excluded from `available_subjects()` and reported as `沒有停止訊號`.
- [x] Draft scripts never appear in `usable_for_leading()`; the three seed scripts remain drafts until operator review.
- [x] The CSV importer maps operator-selected headers, writes drafts, preserves empty stop-signal cells as empty lists, reports those rows, and never calls a network client.
- [x] card 60b: facilitator course has three draft lessons for leading, the fixed FACIL_DONTS, and escalation to GOVERN; the TEACH loader and completion shape accept the special `facilitator` course.
- [ ] Showing `FACIL_DONTS` on screen the whole time someone leads belongs to the later FACILITATE page card; this card supplies the list.
