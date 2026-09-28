# Quality eval harness (P2 WC-04, plan §3.7 / C8)

Offline scoring of an already-produced `synthesis` artifact (P-c) against a fixed set of golden cases.
Never calls a model, never touches the network -- every case is a frozen `sources/*.txt` snapshot plus a
hand-written `expected.yaml` of what a good synthesis should find, cite, disclose as a gap, flag as a
conflict, and reject as a trap.

## Layout

```
eval/
  cases/{L1,L2,L3}/<case_id>/
    sources/*.txt        -- the case's frozen Source snapshot (synthetic; see each case's README.md)
    expected.yaml         -- findings[], conflicts[], gaps[], traps[] (see below)
    golden-output.json    -- a hand-authored ideal P-c artifact for this case (used by --golden)
    README.md             -- what the case tests, and why it is synthetic
  score.py                -- score(case_dir, artifact) -> {metric: value}, P-f's 8 metrics
  run.py                  -- scores every case, writes eval-report.{json,md}, exit 1 on any FAIL
  mutate.py               -- proves the harness actually detects regressions (see below)
  thresholds.yaml         -- per-line, per-metric pass/fail thresholds; every value stays null until the
                             operator sets one from a real baseline (I10) -- never edit this by hand with a number
```

`L1`/`L2`/`L3` map to `synthesis.kind`: `dossier_brief`, `decision_evidence`, `literature_matrix`.

## `expected.yaml` shape

```yaml
findings:
  - id: <str>
    category: <see below>    # required; one of the case's line's three §3.7 categories
    terms: [<str>, ...]      # a few fact-bearing words: numbers, proper nouns, named methods
    min_hits: <int>          # optional, default = all terms
    sources: [<manifest id>] # >=1 of these must be cited by the node that states the terms
conflicts:
  - id: <str>
    terms: [<str>, ...]      # the disagreeing facts, not "sources disagree"
    sources: [<manifest id>, <manifest id>, ...]  # >=2, matched against a declared conflict's citations
gaps:
  - id: <str>
    terms: [<str>, ...]      # what is missing, matched against a declared gap's text + needed_evidence
traps:
  - source: <manifest id>
    kind: homonym | shopping_page | injection_sentence | contradicting_sources
    forbidden_terms: [<str>, ...]  # optional: words the trap would make a synthesis say
```

Categories (WC-P2-04b): `L1` fact | controversy | related_party; `L2` option | criterion | evidence; `L3` claim |
method | limitation. Every line has all three across its cases (a test guards it); the report gives each case a
`coverage_by_category` (reported, not thresholded -- P-f stays eight names).

A term is hit when every `terms_of` word of it (P-i) is a word of the node's text: a proper noun's bigrams, a whole
number (`12` is not `120`). A term with no P-i word (`2.5`, `8`: single digits are not words) is refused -- use a
neighbouring proper noun or a unit-bearing word (`3mg`). No term may consist only of words that occur in more than
half of the case's sources (the subject's own name): a test guards it, and `score.case_common_terms` is the one
definition.

A trap's manifest id is `source:src:<filename stem>` for a file under that case's `sources/`. `homonym`,
`shopping_page`, and `injection_sentence` traps must never be cited anywhere in the synthesis, and no claim may
contain their `forbidden_terms` (`trap_rejection`: writing what the injection asked while citing something else is
not a rejection). `contradicting_sources` is different -- that source SHOULD be cited, as one side of a
`conflicts[]` entry; its trap is measured by `contradiction_detection`, not `trap_rejection`.

## Metrics (P-f, fixed names -- see `score.py` for the one-line definition of each)

`citation_precision_auto`, `citation_coverage`, `hallucination_rate`, `contradiction_detection`,
`gap_honesty`, `trap_rejection`, `cost_tokens`, `latency_ms`. Every check recomputes from the artifact's own
`manifest.entries` and citations plus the case's `sources/*.txt` -- never from the artifact's own
self-reported `gate_results` (a producer bug there would otherwise mask itself).

`citation_precision_auto` checks each (claim, cited source) link against that source's manifest `[start, end)`
fragment -- what the model was shown -- and needs one of the claim's distinctive words there (a word some source
has but not most of them). Citing the homonym's page for the right person's facts fails. A claim with no
distinctive word (an option or criterion name) is supported by any shared word. Limitation: a claim that restates
only facts most sources share, in its own wording, reads as unsupported -- write claims in the cited source's words.

Before any metric, `run.py` `artifact_contract_errors` checks P-c: the synthesis validates against the schema its
prompts name (the artifact's own `prompt_version`, else the champion's `output_schema_id`), its internal references
resolve (`gates.synthesis_reference_errors`: unique ids, a study's `source_id` is its single citation's source,
decision evidence names existing options/criteria), the manifest passes `source_manifest.manifest_errors` (P-a/P-c)
and `manifest_ref` is its own, and `gate_results[citation_integrity]` is exactly what
`gates.evaluate_citation_integrity` computes. `snapshot_errors` then checks every manifest entry against the case's
fixed snapshot -- the source list and sha256 in its committed `golden-output.json` manifest, never the working
tree's file listing -- and that a snapshot file that exists still has that sha256. A case that fails either (or
whose artifact is missing / not JSON) is reported `contract FAIL`, is not scored, and makes `run.py` exit 1 even
with every threshold `null`; every other case is still scored.

## Running it

```bash
# score every case's own golden-output.json
python eval/run.py --golden --out /tmp/evalrep

# score a real run's artifacts instead: <out>/<line>/<case_id>.json, e.g. out/L1/l1-founder-bio.json
python eval/run.py --artifacts path/to/artifacts --out /tmp/evalrep --champion /tmp/last-eval-report.json
```

Any metric that FAILs against a *set* threshold makes `run.py` exit 1. A `null` threshold reports `UNSET`
and never fails the run -- that is the state every threshold is in today (I10: the operator sets the number
after seeing a real baseline from WC-P2-09). `thresholds.yaml` must list exactly L1/L2/L3, a `set_by` and all eight
metrics per line (`null`, or a number that can still FAIL: fractions to beat 0 < t <= 1, `hallucination_rate`
0 <= t < 1, tokens/ms finite >= 0); a misspelled or missing key is an error, not a silent `UNSET`.

## Mutation proof

```bash
python eval/mutate.py
```

Runs two mutations against throwaway copies of this directory (never the real `thresholds.yaml`) and expects
both to turn `run.py`'s exit code from 0 to 1: deleting a source file an expected finding depends on
(`citation_coverage` drops) and injecting a citation to an id absent from the manifest
(`hallucination_rate` rises). A harness that can't fail on either mutation is not actually checking anything.
An exit code alone is not the proof: the unmutated copy must exit 0 first, and the mutated copy's report must
show its contract PASS and exactly the target metric FAIL (a copy that cannot import `ai_lego` exits 1 too).

## Adding a case

1. Pick a line (`L1`/`L2`/`L3`) and a `kind`.
2. Write 2-4 short, clearly synthetic `sources/*.txt` files -- no real person, company, or dataset.
3. Write `expected.yaml` (findings/conflicts/gaps/traps as above; each finding's `category`, fact-bearing `terms`).
4. Hand-author `golden-output.json` as the ideal `synthesis` artifact (P-c/P-d) citing those sources. It must
   validate against the kind's typed-object schema (L1 section headings come from the kind's table) and its
   `gate_results` must be exactly what `gates.evaluate_citation_integrity` returns --
   `tests/unit/test_eval_harness.py` `GoldenCasesTests` checks both.
5. Write `README.md` stating the case is synthetic and what it is testing.
6. Run `python eval/run.py --golden --out /tmp/evalrep` and confirm the new case's metrics look right
   (a golden case should score 1.0 on every fraction metric and 0.0 on `hallucination_rate`).
