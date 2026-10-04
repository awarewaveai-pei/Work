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
- [ ] TEACH page and browser walk are not part of card 41; the page card owns that surface.
- [ ] The 90-second manipulation-technique content is not invented here; it remains operator-reviewed content work from the confirmed card.
