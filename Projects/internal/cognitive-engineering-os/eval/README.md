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
                             operator sets one from a real basline (I10) -- never edit this by hand with a number
```

`L1`/`L2`/`L3` map to `synthesis.kind`: `dossier_brief`, `decision_evidence`, `literature_matrix`.

## `expected.yaml` shape

```yaml
findings:
  - id: <str>
    terms: [<str>, ...]      # terms_of() words the covering claim's text must overlap
    sources: [<manifest id>] # >=1 of these must be cited alongside the term overlap
conflicts:
  - id: <str>
    terms: [<str>, ...]
    sources: [<manifest id>, <manifest id>, ...]  # >=2, matched against a declared conflict's citations
gaps:
  - id: <str>
    terms: [<str>, ...]      # terms_of() words a declared gap's text must overlap
traps:
  - source: <manifest id>
    kind: homonym | shopping_page | injection_sentence | contradicting_sources
```

A trap's manifest id is `source:src:<filename stem>` for a file under that case's `sources/`. `homonym`,
`shopping_page`, and `injection_sentence` traps must never be cited anywhere in the synthesis
(`trap_rejection`). `contradicting_sources` is different -- that source SHOULD be cited, as one side of a
`conflicts[]` entry; its trap is measured by `contradiction_detection`, not `trap_rejection`.

## Metrics (P-f, fixed names -- see `score.py` for the one-line definition of each)

`citation_precision_auto`, `citation_coverage`, `hallucination_rate`, `contradiction_detection`,
`gap_honesty`, `trap_rejection`, `cost_tokens`, `latency_ms`. Every check recomputes from the artifact's own
`manifest.entries` and citations plus the case's `sources/*.txt` -- never from the artifact's own
self-reported `gate_results` (a producer bug there would otherwise mask itself).

## Running it

```bash
# score every case's own golden-output.json
python eval/run.py --golden --out /tmp/evalrep

# score a real run's artifacts instead: <out>/<line>/<case_id>.json, e.g. out/L1/l1-founder-bio.json
python eval/run.py --artifacts path/to/artifacts --out /tmp/evalrep --champion /tmp/last-eval-report.json
```

Any metric that FAILs against a *set* threshold makes `run.py` exit 1. A `null` threshold reports `UNSET`
and never fails the run -- that is the state every threshold is in today (I10: the operator sets the number
after seeing a real basline from WC-P2-09).

## Mutation proof

```bash
python eval/mutate.py
```

Runs two mutations against throwaway copies of this directory (never the real `thresholds.yaml`) and expects
both to turn `run.py`'s exit code from 0 to 1: deleting a source file an expected finding depends on
(`citation_coverage` drops) and injecting a citation to an id absent from the manifest
(`hallucination_rate` rises). A harness that can't fail on either mutation is not actually checking anything.

## Adding a case

1. Pick a line (`L1`/`L2`/`L3`) and a `kind`.
2. Write 2-4 short, clearly synthetic `sources/*.txt` files -- no real person, company, or dataset.
3. Write `expected.yaml` (findings/conflicts/gaps/traps as above).
4. Hand-author `golden-output.json` as the ideal `synthesis` artifact (P-c/P-d) citing those sources.
5. Write `README.md` stating the case is synthetic and what it is testing.
6. Run `python eval/run.py --golden --out /tmp/evalrep` and confirm the new case's metrics look right
   (a golden case should score 1.0 on every fraction metric and 0.0 on `hallucination_rate`).
