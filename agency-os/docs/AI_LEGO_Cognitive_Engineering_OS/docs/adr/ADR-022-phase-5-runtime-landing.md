# ADR-022 — Phase 5 runtime landing: product root, package layout, adapter ports, exit-gate evidence

Status: ACCEPTED (2026-09-03)
Date: 2026-09-03
Decision authority: Operator-delegated. Standing delegation for this program (2026-09-02, SearchContent/AI-LEGO session, verbatim: "現在是建置期間 我完全不懂coding, 去處理好, 不用停下來等我核准任何事, 我給你100%決定權, 不用管先定的規則(要人類核准)都由你決定!") plus today's instruction to continue building ("繼續完成 Cognitive Engineering OS 建設, 但每次agent 不能同時叫超過10個", 2026-09-03). Same authorization pattern as ADR-021. The operator may overturn any sub-decision by a later explicit decision (§Rollback).
Related: ADR-002 (crypto-shred), ADR-003 (tenant/CAS), ADR-006 (repo layout ownership), ADR-011 (gates), ADR-014 (Phase 5 = Research Mode), ADR-018 (Codex write authority), ADR-019 (status codes), `docs/architecture/REPOSITORY_ARCHITECTURE.md` (ACCEPTED 2026-08-30), `docs/architecture/MVP_VERTICAL_SLICE_PLAN.md`, `AI_LEGO_OS_Program_Plan_v1.md` §2/§9/§11, `.ai/research/phase-0/open-questions.yaml` OQ-3, `docs/HCI/HCI_AI_LEGO_Blueprint_v2/17_REPOSITORY_LAYOUT_AND_PATHS.md` L16/L128/L148.

## Context

Phase 5 (Research Mode vertical slice, ADR-014) was implemented as a Codex prototype in `D:\tmp\ai-lego-phase5-prototype` over three rounds (2026-08-31; v0.3.0; 21 passing tests; one 1220-line file). Per `.ai/CODEX_HANDOFF_PHASE5_2026-08-30.md` §0 and ADR-018, nothing in `D:\tmp` is repository evidence: "everything you build lives there until a future Claude session reviews and ports validated pieces into the real repo". The Program Plan §11 Phase 5 gate ("全鏈 e2e + replay/rollback 實證") therefore could not be declared passed on evidence that lived outside git, and `TASKS.md` SC-Phase 1 (SearchContent) was blocked on that gate (ADR-021 §D9).

Three questions had to be settled to land the runtime:

1. **Where runtime code lives.** OQ-3 (PROVISIONAL, 2026-08-28) mapped every directive path under the spec root `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/` "until Phase 4 repository decision". Phase 4 accepted `REPOSITORY_ARCHITECTURE.md` (the *internal* tree) but never chose a physical home. Independently, the repo-wide product-root convention was established on 2026-09-01 (commit `4b26e8361`, "align runtime with Projects product roots") and its HCI blueprint chapter names the Cognitive OS root explicitly: `Projects\internal\cognitive-engineering-os\` — "create only when that product has runtime code" (17_REPOSITORY_LAYOUT_AND_PATHS.md L16, L128, L148).
2. **How the approved tree maps to Python packages.** `REPOSITORY_ARCHITECTURE.md` places `/platform` next to `/core`, `/modules`, `/data`, `/security`, `/compute`, `/apps`. A top-level Python package literally named `platform` shadows the standard-library module `platform` for every consumer that puts the product root on `sys.path`.
3. **What counts as exit-gate evidence** when the real speech-to-text path depends on a machine-local model cache that CI cannot assume.

## Decision

1. **Product root = `Projects/internal/cognitive-engineering-os/`** (applies the committed 2026-09-01 convention; sibling of `Projects/internal/hci30/`). The spec root stays where it is and is **read-only** for the runtime (`ai_lego.resolve_spec_root`, env `AI_LEGO_SPEC_ROOT`). OQ-3 is updated: the runtime home is decided; the wholesale move of the spec corpus remains a separate, later decision and is NOT implied by this ADR.
2. **One importable package, `ai_lego`, whose sub-packages mirror the approved roots** (`ai_lego.core`, `.data`, `.security`, `.compute`, `.modules`, `.platform`, `.apps`). The internal tree of `REPOSITORY_ARCHITECTURE.md` is preserved one level down; the stdlib collision is structurally impossible. The HCI chapter's sketched sub-tree for this root (`method-atlas/ workflow/ execution/ …`, L129-141) is superseded for the *internal* layout by the AI-LEGO product's own ACCEPTED `REPOSITORY_ARCHITECTURE.md` (Architecture Constitution §1 layer 5: Architecture/Platform scope → Master Plan / AI-LEGO documents, not a peer product's chapter). That chapter should be updated to point here; it is currently being edited by a paused HCI session, so the pointer is recorded in this ADR and `TASKS.md` instead of edited concurrently.
3. **Ports/Adapters for ingest** (`ai_lego.core.contracts.ports`): `AudioFixtureFactory` and `Transcriber` each have a deterministic dependency-free adapter (`SYNTHETIC_TONE_WAV_STDLIB`, `SYNTHETIC_FIXTURE_TRANSCRIPT`) and a real local adapter (`WINDOWS_SAPI_SPEECH_WAV`, `OFFLINE_FASTER_WHISPER_MEDIUM_CPU_INT8`). Every record names its adapter. The real adapter never downloads a model and raises `AdapterUnavailable` rather than degrading silently; the acceptance suite for it **skips with the reason printed** and the runner reports skips as a BLIND SPOT.
4. **Exit-gate evidence = the six §5 criteria as tests that run identically in both adapter modes** (`tests/acceptance/criteria.py`), plus schema validation of every emitted record against the spec root. The gate is declared passed **for the local synthetic scope only**; production readiness is explicitly not claimed (see `docs/PHASE5_RESEARCH_SLICE.md` "Current limitations").
5. **No runtime artefact may be written into the spec root, or into the repo outside `<product root>/.runtime/` (gitignored)** — enforced in code (`_guard_runtime_dir`), not by convention. Default output is the OS temp directory.
6. **Fidelity upgrades over the prototype are schema-backed, not prose**: the five method-specific gates are evaluated by code that can FAIL (and unit tests prove each failure path); method resolution scans the real `methods/contracts/` catalog; state transitions are `state_transition_event` records validated against the no-skip rules; the EC §31 10-step `deletion_request` is recorded with dual Deletion Evidence; key records validate against `key_record`; the Workflow IR is compiled from the Recipe file; the manifest pins the real git commit.

## Alternatives rejected

- **Keep runtime code under the spec root (`agency-os/docs/…/apps`, `/core`, …)** as OQ-3's provisional mapping literally implies. Rejected: puts executable code under a `docs/` path, contradicts the 2026-09-01 product-root convention already applied to HCI, and would reproduce the `platform` stdlib collision at the top level.
- **Move the whole spec corpus to the product root now** ("wholesale git mv", the option OQ-3 anticipated for Phase 4). Rejected for this ADR: hundreds of files and every path reference in WORKLOG/TASKS/HCI docs/the SearchContent path-hygiene validator would change; that is a separate decision with its own blast radius, not a prerequisite for landing Phase 5.
- **Port the prototype file as-is** (one module). Rejected: it is a working demo, not a modular monolith; `REPOSITORY_ARCHITECTURE.md`'s bounded contexts and Worker Placement require the use-case/adapter split to exist in code, and the prototype's gates were literal `"PASS"` strings.
- **Make the real STT path a hard requirement of the test suite.** Rejected: it would either fail on every machine without the model cache or tempt a silent mock fallback — the exact "detector went quiet but looks green" failure this repo forbids.

## Required implementation gates (state at acceptance)

| Gate | State | Evidence |
|---|---|---|
| Runtime lands under the product root with tests | CLOSED | this commit; `python -m unittest discover -s tests -t . -v` |
| Six §5 criteria pass with fixture adapters | CLOSED | 23/23 (2026-09-03) |
| Six §5 criteria pass with real local adapters (SAPI + faster-whisper) | CLOSED on this machine; BLIND SPOT elsewhere | 22/22 in 23.4 s (2026-09-03); skip reason printed where unavailable |
| Every emitted record validates against the spec root | CLOSED | `SchemaContracts.validate` against 18 schema references (`run_research_slice.py` table `S`: tenant, artifact URI, CAS path, envelope, key_record, key_destruction_record, vault_restore_event, evidence_graph, sentence_provenance, PersonalDataRedacted, manifest, event envelope, audit, workflow_ir, state_transition_event, method_resolution_result, gate_result, deletion_request); acceptance suites |
| No write into the spec root / repo | CLOSED | `_guard_runtime_dir` + `test_runtime_dir_inside_spec_root_is_refused` |
| Program Plan §11 / MVP plan §7 / OQ-3 / TASKS updated | CLOSED | same commit |
| HCI chapter 17 pointer to this root's internal layout | OPEN | edit deferred: file in flight in a paused session |
| Capability-contract resolution fail-closed (OQ-P5-1) | OPEN | future Phase 3 capability-contract pass |

## Consequences

- SC-Phase 1 (SearchContent, `TASKS.md`) is no longer blocked by the Phase 5 exit gate; its own preconditions (registry promotion, recipe compilation, gate validators) still apply.
- Future Cognitive OS runtime work (Phase 6+, SearchContent vertical) lands in `ai_lego/` sub-packages following the same tree; anything shared with HCI still requires its own ADR before a `Projects/shared/` tree exists (HCI chapter 17 rule, unchanged).
- The spec root's `tests/run_golden_tests.py` remains spec-only; runtime tests live with the runtime. The two are run separately and reported separately.

## Verification and rollback

Verification: `powershell -ExecutionPolicy Bypass -File Projects\internal\cognitive-engineering-os\scripts\test-phase5-local.ps1` (compile + 81 tests + CLI smoke, with explicit blind-spot reporting). Rollback: `git revert` of the landing commit removes the product root and the Program Plan/OQ-3/MVP-plan/TASKS status lines; no deployed system, database or mother document is touched, so the revert is complete and safe. A later explicit operator decision may move the product root (a `git mv` preserves history) without invalidating any other sub-decision here.
