# codex-oracle review -- 2026-10-15 12:22:22 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/ai_lego/modules/research/picture_units.py, Projects/internal/cognitive-engineering-os/ai_lego/modules/research/interpret_method_record.py, Projects/internal/cognitive-engineering-os/tests/unit/test_picture_units.py, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/cognitive/typed-objects/method-interpretation.schema.yaml, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/ResultPage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/MethodVisual.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/Charts.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/ResultPage.test.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: COS template 15.1 item 2: result-page cards 4 and 6 get one card/row per unit for tools whose units are not form fields. Server: picture_units.py derives the units of the tool's own picture from the record (problem statement 3 parts, fishbone one unit per category = bone with member ids r/hypotheses/<i>, five whys one per step r/why_chain/<i> ordered by step, Pareto one per ranking row r/ranking/<i>), using the same item filters as the web pictures (bonesOf/chainOf/paretoOf/problemOf). interpret_method_record lists them in the prompt (PICTURE UNITS: readings use path = unit path), and stores them server-side as interpretation.picture_units (SERVER_KEYS, never the model's; omitted when empty) -- schema method-interpretation 1.5.0 optional. Web: ResultPage builds layers from form-field units (iceberg), else picture_units (key = unit path, members), else model-bound levels; layerIndex matches by membership for picture units (an id equal to or under any member), by top-level key otherwise (unchanged semantics). Thickness for picture units comes from own_statements. The unit word comes from the picture registration (unit: 撅?default, 畾??寥爸/甇???; picture units have no depth, so no "root in deepest unit", no belief-layer dashing, not "top to bottom". Charts.tsx OWN_CHARTS gets short (??footer no longer hardcodes ?惜瑽▼). Iceberg output must be unchanged (mock parity test green). Check: membership collisions (r/hypotheses/1 vs r/hypotheses/10), readings citing members, focus on a member path, option paths, citation numbering, old analyses without picture_units, server/web filter parity.
- exit: 0 | elapsed: 283506ms | answer: 2271B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/modules/research/interpret_method_record.py, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/Charts.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/MethodVisual.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/ResultPage.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/ResultPage.tsx, agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/cognitive/typed-objects/method-interpretation.schema.yaml, Projects/internal/cognitive-engineering-os/ai_lego/modules/research/picture_units.py, Projects/internal/cognitive-engineering-os/tests/unit/test_picture_units.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: A valid five-whys row with empty question and answer makes the entire interpretation fail.
  file:line   -> Projects/internal/cognitive-engineering-os/ai_lego/modules/research/picture_units.py:46 -> agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/cognitive/typed-objects/method-interpretation.schema.yaml:153
  confidence  -> CONFIRMED
  scenario    -> A schema-valid row has `question: ""` and `answer: ""`; the web picture accepts it, but the server emits an empty `label`, stores it at `interpret_method_record.py:978`, then schema validation rejects it and the API reports interpretation failure at `apps/api/main.py:1841`.
  why missed  -> Tests use non-empty questions and answers; the source schema permits empty strings.

FINDING 2: A valid Pareto row with an empty hypothesis ID can likewise abort the interpretation.
  file:line   -> Projects/internal/cognitive-engineering-os/ai_lego/modules/research/picture_units.py:62 -> agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/cognitive/typed-objects/method-interpretation.schema.yaml:153
  confidence  -> CONFIRMED
  scenario    -> A Pareto ranking row has `hypothesis_id: ""` and a positive metric; `ParetoChart.tsx:14` accepts and draws it, but the server derives `label: ""`, causing schema rejection and a failed interpretation.
  why missed  -> Tests use non-empty IDs such as H1/H2; the Pareto schema allows an empty string ID.

FINDING 3: Duplicate readings for members of one picture unit are silently collapsed into the first reading.
  file:line   -> Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/result/ResultPage.tsx:230 -> Projects/internal/cognitive-engineering-os/ai_lego/modules/research/interpret_method_record.py:653
  confidence  -> CONFIRMED
  scenario    -> A fishbone unit covers `r/hypotheses/0` and `r/hypotheses/1`, while the model returns readings for both member paths. Both pass per-reading validation, but `readingAt()` uses `.find()` on the shared unit index, so card ④ and row ⑥ render only the first reading and silently discard the second.
  why missed  -> The tests provide exactly one reading per unit, and validation checks each reading individually without enforcing one reading per derived picture unit.

TOTAL: 3 findings
