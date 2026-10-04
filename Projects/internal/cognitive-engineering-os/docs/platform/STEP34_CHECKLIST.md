# Steps 3 and 4 checklist

## TEACH

- [x] Lessons and low-risk practice cases are reviewed content files under `ai_lego/platform/lessons/`, not database rows.
- [x] `load_lessons()` and `load_practice_cases()` validate every YAML file, source date, subject, course order, and `HISTORY.json` fingerprint.
- [x] `rulesets/teach.py` exposes both TEACH rulesets through normal discovery.
- [x] Draft lessons remain visible to content callers, while `reviewed_only()` excludes them from reviewed-only callers.
- [x] `generate_lessons.py` reads the existing tool catalog and example registry, makes no model call, is deterministic, and never overwrites.
- [x] The required independent-origins lesson, seven package course entries, three generated tool fixtures, and four publisher-backed example cases are present.
- [x] Loader and generator refusal classes have unit tests, including fingerprint, minutes, source, reviewed-draft, and write-once mutations.
- [ ] TEACH person records, AI actions, routes, and page are not part of card 40; later TEACH cards own those runtime surfaces.
- [ ] The 90-second manipulation-technique content is not invented here; it remains operator-reviewed content work from the confirmed card.
