# AI-LEGO Cognitive Engineering OS — runtime (product root)

Canonical product root: `D:\Work\Projects\internal\cognitive-engineering-os\`. Runtime code belongs here; the three mother documents, the Architecture Constitution, every machine-readable spec/policy/method/recipe contract, the ADRs and the golden-test harness stay under `D:\Work\agency-os\docs\AI_LEGO_Cognitive_Engineering_OS\` (the **spec root**, read-only from here). The split follows the repo-wide product-root convention (`docs/HCI/HCI_AI_LEGO_Blueprint_v2/17_REPOSITORY_LAYOUT_AND_PATHS.md`, L128/L148) and is recorded in `docs/adr/ADR-022-phase-5-runtime-landing.md` in the spec root.

What is here today: the **Phase 5 Research Mode vertical slice** (`MVP_VERTICAL_SLICE_PLAN.md` §3, all 28 steps; ratified by ADR-014) as a real, tested, synthetic-data-only implementation. Package layout mirrors `docs/architecture/REPOSITORY_ARCHITECTURE.md`'s approved roots as sub-packages of `ai_lego` (`core`, `data`, `security`, `compute`, `modules`, `platform`, `apps`) — see `ai_lego/__init__.py` for why they are sub-packages and not top-level directories.

## Run

Tests: only what a change can affect (plan rule 11, `docs/RESEARCH_LINES_MASTER_PLAN.md` §12.1):

```powershell
python scripts/affected_tests.py --run
```

The full suite (~14k tests, 25-55 min) runs in GitHub CI on a lock/pyproject/Dockerfile/selector change, or locally only
when the operator asks for a wave close-out; a whole-tree discovery without `COS_FULL_SUITE=1` stops at once and prints
this (`tests/__init__.py`).

Research slice CLI:

```powershell
python -m ai_lego.apps.cli.run_research_slice --transcription fixture
python -m ai_lego.apps.cli.run_research_slice --transcription offline-stt --review interactive
```

Dependencies: Python 3.12, `PyYAML`, `jsonschema`, `referencing`, `cryptography` (`pyproject.toml`). The `offline-stt` mode additionally needs Windows SAPI and a locally cached `faster-whisper` Medium model (`faster-whisper` package + `%USERPROFILE%\.cache\huggingface\hub\models--Systran--faster-whisper-medium\...`, or `AI_LEGO_WHISPER_MODEL_DIR`). It never downloads a model and never calls a network service; if the adapter is missing the offline-STT suite is **skipped with the reason printed** — a skip is a blind spot, not a pass.

Runtime artefacts go to `%TEMP%\ai-lego-research-slice\` (or `--runtime-dir`). The runner refuses any runtime directory inside the spec root, any directory inside the repo other than `.\.runtime\` (gitignored), and — since it marks each directory it creates — any pre-existing directory it did not itself create (`RUNTIME_DIR_NOT_OWNED`, unless empty).

## What the slice proves (and does not)

The six acceptance criteria of `MVP_VERTICAL_SLICE_PLAN.md` §5 run as tests in **both** adapter modes (`tests/acceptance/criteria.py`, 30-31 tests each): replay at T0 / after deletion / after a real v12 prompt upgrade / after rollback, with the crypto-shredded subject `REDACTED` at every one of those points; the v12 projection genuinely differs from the champion and the post-rollback projection matches the champion's own recorded hash; a human `LOCKED_FACT` is unchanged after a competing AI suggestion arrives (kept as a separate, surfaced suggestion, never applied); tenant-scoped CAS isolation of byte-identical content; sentence → claim → evidence → source → audio-second reverse tracing through a real evidence graph, with the locator derived from the transcript's own segments (not a hard-coded literal); and `METHOD_RESOLUTION_BLOCKED` firing against a catalog without the contract and resuming against the live one. Capability resolution is fail-closed the same way (ADR-023): the one capability the slice invokes, `run_statistics`, passes the `capabilities/contracts/` catalog before its implementation runs; an empty catalog aborts the run before `StatisticsCalculated`; and the plan's other three capability refs — which have no contract on today's spec root — are recorded as unresolved in the ledger and the result rather than silently skipped.

Every emitted event and key record is validated against the spec root's own JSON Schema **before** it reaches disk (`EventLedger`/`LocalKeyVault` take a validator callback). The five method-specific gates plus the two R3/R4 mandatory gates (`human_specialist_review`, `recovery_rollback_rehearsal`, injected `NOT_APPLICABLE` with a stated reason — this local slice cannot genuinely exercise either) are evaluated by real structural checks that can each independently FAIL; a FAIL raises immediately, before the artifact is published or the manifest/result files are written — there is no code path where a failing gate still reports PASS. A ledger-level guard independently refuses to write any detected personal-data value into any event, for any subject, regardless of which code path produced the payload.

Not proven here, and not claimed: durable KMS / hardware-backed keys, physical media sanitization, resistance to RAM/disk forensics or backup remnants, speaker diarization, a UI, authentication, production deployment, the release states of the execution state machine, or statistical significance of the synthetic Kappa. Full status, evidence table and open questions: `docs/PHASE5_RESEARCH_SLICE.md`.

Synthetic data only. No real person, recording, or customer appears anywhere in this tree.
