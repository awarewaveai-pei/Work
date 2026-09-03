# Phase 5 Research Mode slice — status, evidence, limits

Status: **EXIT-GATE EVIDENCE COMPLETE for the local synthetic scope (2026-09-03, round 2)**. This document is the runtime-side record; the program-side gate state lives in `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/AI_LEGO_OS_Program_Plan_v1.md` §11 and `docs/architecture/MVP_VERTICAL_SLICE_PLAN.md` §7.

Lineage: three Codex prototype rounds in `D:\tmp\ai-lego-phase5-prototype` (2026-08-31, v0.3.0, 21 tests, single 1220-line file) → ported into this product root by Claude (2026-09-03, round 1) as a modular implementation → adversarially reviewed by 5 independent lens agents reading every file in full against the governing schemas (round 2, same day): 47 findings, all fixed. Round 2's own findings and fixes are the "Round 2 hardening" section below — this file does not silently overwrite round 1's record, it supersedes the specific claims round 2 disproved.

## Evidence (real runs, this machine, 2026-09-03, round 2)

| Suite | Command | Result |
|---|---|---|
| Unit (13 modules, invariants + mutation-style gate/vault/ledger tests) | `python -m unittest discover -s tests/unit -t . -v` | 44 passed |
| Acceptance, fixture adapters (stdlib tone WAV + declared transcript) | `python -m unittest tests.acceptance.test_research_slice_fixture_mode -v` | 28 passed |
| Acceptance, real adapters (Windows SAPI speech + offline faster-whisper Medium, CPU int8) | `python -m unittest tests.acceptance.test_research_slice_offline_stt -v` | 27 passed, ~21 s |
| Full discovery | `python -m unittest discover -s tests -t . -v` | **99 passed** |
| One-shot runner (compile + full suite + CLI smoke, distinct exit codes) | `powershell -File scripts\test-phase5-local.ps1` | exit 0, "PASS (fixture AND offline-STT both exercised, zero skips)" |
| CLI smoke | `python -m ai_lego.apps.cli.run_research_slice --transcription fixture` | `PASS … 28/28 steps, all gates PASS`, Kappa 0.75, CI95 [0.5417, 0.9165], 5/5 substantive gates PASS + 2 R3/R4 gates NOT_APPLICABLE |

## Criteria map (MVP_VERTICAL_SLICE_PLAN.md §5)

| # | Criterion | Mechanism | Test (runs in both adapter modes) |
|---|---|---|---|
| 1 | Replay to T0 / after deletion / after a real v12 upgrade / after rollback; P2 `REDACTED` at every point | `platform/ai_execution/replay.py::project` decrypts through the vault's *current* key state; themes kept per prompt version | `test_criterion_1_…` |
| 2 | A real v12 (genuinely different, over-merged) theme set, rolled back to the v11 golden hash | `build_v12_over_merged_theme_set` + `PromptVersionRollback` carrying `golden_hash`, checked against the recorded hash | `test_criterion_2_…` |
| 3 | `LOCKED_FACT` survives a real competing AI suggestion | `HumanCodeLocked` immutable in the projection (a rewrite attempt raises); the competing suggestion is kept separate under `ai_suggestions_for_locked`, never applied | `test_criterion_3_…`, `test_locked_fact_rewrite_is_refused_…` |
| 4 | Tenant-scoped CAS isolation | `data/object/tenant_scoped_cas.py` path containment | `test_criterion_4_…`, `test_tenant_b_cannot_…` |
| 5 | Sentence → Claim → Evidence → Source → real audio second | `modules/knowledge/provenance.py::reverse_trace` + `locator_from_transcript` (derives the span from the transcript's own segments, not a literal) | `test_criterion_5_…` |
| 6 | BLOCKED then resume | `platform/ai_execution/method_resolver.py` against an empty vs. live contract catalog; `state_transition_event`s validated no-skip | `test_criterion_6_…`, `test_state_machine_path_…` |

Beyond §5: five method-specific gates plus two R3/R4 mandatory gates evaluated for real (`modules/research/gates.py`, `platform/ai_execution/mandatory_gates.py`; every gate can independently FAIL and the unit/mutation tests prove it — a FAIL raises before any artifact/manifest write, see `test_gate_failure_aborts_before_any_downstream_artifact_is_written`); the EC §31 10-step `deletion_request` built incrementally from the real destruction/redaction timestamps (never synthesized after the fact); key/event records validated **before** they reach disk; a terminal-state guard on the ledger that actually refuses a downstream emit (`test_terminal_state_guard_actually_refuses_a_downstream_emit`); a ledger-wide PII guard that refuses any event whose payload contains a detected personal-data value, for any subject; a real `current-state` reconstruction (EC §11, 20 dimensions) and `rollback` plan (EC §20) validated before their state transitions; the manifest carrying `ai.prompt_version` and a `method_execution_log`; steps 10 (Annotation), 11 (goal → compiled Workflow IR), and 21 (a rejected theme-grouping recorded as a Diff, not an overwrite) as real events, not narrative gaps.

## Adapters

| Port | Fixture adapter (any OS, no deps) | Real local adapter |
|---|---|---|
| `AudioFixtureFactory` | `SYNTHETIC_TONE_WAV_STDLIB` — deterministic PCM WAV via `wave` | `WINDOWS_SAPI_SPEECH_WAV` — spoken synthetic English via Windows SAPI (resolved by absolute path, not a bare `powershell.exe`) |
| `Transcriber` | `SYNTHETIC_FIXTURE_TRANSCRIPT` — declared script returned verbatim | `OFFLINE_FASTER_WHISPER_MEDIUM_CPU_INT8` — real recognition; recogniser is never told the script; model cache resolved via `HF_HUB_CACHE`/`HF_HOME`/default, matching Hugging Face's real layout |

Every record names its adapter (`audio_mode`, `transcription_mode`), so fixture evidence can never be mistaken for real recognition.

## Round 2 hardening (2026-09-03): what an independent adversarial review found and how it was closed

5 lens agents (correctness, security, spec-semantics, architecture/docs, test-quality) read the whole product root in full against the spec root and produced 47 findings; every one was fixed in this same round (not deferred). The headline classes, since they say more about the design than any individual line number:

- **Gate FAIL had no consequence.** The five gates were evaluated but nothing read their status — manifest, audit, step_status and the CLI exit code were literals. Fixed structurally: a FAIL now raises immediately, before the artifact is published or any result/manifest file is written. There is no longer a code path that can report PASS for a failing gate.
- **Two real crypto/timing bugs, not hypothetical.** (a) The restore-replay gate compared `destroyed_at` as raw ISO strings; a destruction half a second after an integer-second snapshot sorted *before* it lexicographically (`.` < `Z`) and was silently skipped, leaving a restored vault able to re-serve a crypto-shredded subject's plaintext. Fixed by comparing parsed instants (`parse_timestamp`), with a regression test that exercises exactly that boundary. (b) The vault persisted raw, unwrapped DEK material — the tenant KEK was decorative (`kek_ref`/`dek_wrapped` were write-only). Fixed: only wrapped DEKs are ever persisted; decrypt unwraps via the tenant KEK and checks `kek_ref` against the record before touching ciphertext.
- **The interactive review path could leak PII into the ledger.** It passed the raw transcript (not the PII-free `quote` field) as the code's quote, which the ledger then stored permanently. Fixed at the call site (only the source's own `quote` field is ever shown to a reviewer or written to an event) **and** structurally, with a ledger-wide `PiiLedgerGuard` that refuses any event payload containing a registered detected-PII value, for any subject, regardless of which code path produced it.
- **Several gates could not fail for the reason their contract names.** Citation quantified over sentence-provenance records instead of Claims (an uncited Claim passed); Authorship never checked the `locked` axis or validated Category/Theme/Claim provenance, only Code; Methodology compared a constant the producer always wrote the same way. All rewritten as real structural checks — the mutation tests in `tests/unit/test_gates.py` and the honesty checks in `tests/unit/test_key_vault.py` prove each one can now fail for its own stated reason.
- **The runtime-dir guard could delete an unrelated directory.** `--reset` defaulted to true and `shutil.rmtree`'d whatever path it was pointed at, with no ownership check. Fixed: every runtime directory this code creates is marked (`.ai-lego-runtime-marker`); a pre-existing, non-empty, unmarked directory is refused (`RUNTIME_DIR_NOT_OWNED`), never wiped.
- **Criterion 2 (rollback) and criterion 3 (locked fact survives) were not actually exercised** — no v12 ever ran, no competing AI suggestion ever arrived. Both are now real: a genuine over-merged v12 theme set is produced and rolled back with a golden-hash check; a real `AISuggestionProposed` event targets the locked code and the projection asserts it stays unchanged and the suggestion surfaces separately.

Full finding-by-finding detail lives in the round-2 review transcript (not committed — session-local); the fixes themselves are the durable record, verified by the 99 real, passing tests above plus 25 new/rewritten tests added specifically because a prior test could not fail for the property it claimed to check (`test_p2_deletion_unlinks_…`, `test_destruction_scope_honestly_reports_…`, `test_gate_failure_aborts_before_…`, `test_terminal_state_guard_actually_refuses_…`, `test_locked_fact_rewrite_is_refused_…`, `test_replay_compares_real_instants_…`, `test_envelope_encryption_is_real_not_decorative`, among others).

## Current limitations (honest scope, unchanged by round 2 — these were never in question)

- **Key management**: an in-process AES-256-GCM model with a JSON file, now with genuine envelope encryption (round 2), but still not a KMS, not hardware-backed, no proof against RAM/disk forensics or filesystem snapshots. The tenant KEK is itself persisted in the same local file as the wrapped DEKs it protects — a production deployment needs the KEK in a real KMS/HSM whose unwrap authorization can be revoked independently (OQ-P5-7).
- **Source-media erasure** is `PLAIN_UNLINK_SYNTHETIC_SCOPE`; `physical_sanitization_claimed: false`. The cross-store sequence (vault → CAS → fixture file → transcription cache) is not an atomic transaction; a failure mid-way raises `SOURCE_AUDIO_ERASURE_PARTIAL`.
- **Speaker labels** are alternating placeholders, not diarization.
- **PII detection** is one narrow English identity-sentence pattern, not entity extraction.
- **Coding stages**: coder 2, the CategorySet, ThemeSet and SaturationAssessment are synthetic fixtures shaped to the method contract; they prove the gate mechanics, not research quality. `saturated: false` is recorded, not asserted otherwise.
- **State machine** stops at `VERIFYING`; release states are outside a local synthetic run.
- **Statistics**: 48 synthetic units; the Kappa acceptance threshold stays `OPERATOR_SET_PENDING` per the capability contract.
- **Recipe nodes not executed by this slice**: `literature_search`, `evidence.triangulation`, `artifact.generate_research_paper` are compiled into the IR (so resolution is real) but the slice's memo is its own minimal artifact step.
- **The R3/R4 mandatory gates are `NOT_APPLICABLE`, not exercised**: a local synthetic slice has no human specialist reviewer and no rehearsed recovery run to genuinely PASS them against.

## Open questions surfaced by the port (OQ-P5-*)

| ID | Question | Owner |
|---|---|---|
| OQ-P5-1 | `transcribe`, `literature_search`, `artifact.generate_research_paper` have no `capabilities/contracts/*.capability.yaml`; only `run_statistics` does. Should capability resolution fail-closed like method resolution (MP L45 red line covers methods only)? | operator / next Phase 3 capability-contract pass |
| OQ-P5-2 | Which primary state a run should end in for a local synthetic slice (this slice stops at `VERIFYING`). | operator |
| OQ-P5-3 | Transcript `provenance_record` authorship for real STT output is `AI_GENERATED`; for the fixture adapter `SOURCE_QUOTATION`. Is a dedicated value for machine transcription warranted in `epistemic-label.schema.yaml`? | future ADR |
| OQ-P5-4 | A production deletion needs durable transactional/outbox recovery across vault, CAS, media and caches; the slice raises `SOURCE_AUDIO_ERASURE_PARTIAL` instead. | Phase 6+ |
| OQ-P5-5 | `sovereignty_mode: "Local-only Keys"` is used for the synthetic KEK; the production mapping of MP §148 modes to the vault is undecided. | future ADR |
| OQ-P5-6 | `recipes/validated/research-qualitative-v1.recipe.yaml` prose says "8 steps" and "run_statistics after evidence.triangulation"; its normative `steps:` block has **7** steps with `run_statistics` **before** `evidence.triangulation`. The compiler follows the block. The prose should be corrected in the spec root (not done here — outside this product root's write scope). | spec-root maintainer |
| OQ-P5-7 | The tenant KEK is persisted alongside the wrapped DEKs it protects (same local file); a production design needs the KEK in a KMS/HSM with independently revocable unwrap authorization, or a KEK-rotation-on-erasure scheme. | future ADR |
| OQ-P5-8 | `docs/adr/ADR-022-phase-5-runtime-landing.md`'s claim that the package tree "preserves REPOSITORY_ARCHITECTURE.md one level down" has named deviations (`platform/ai_execution/replay` not `platform/ai-execution/replay`'s sibling under `cognitive/runtime/replay`; `security/key_vault` not nested under `security/secrets`; `apps/cli` not under `apps/desktop`; several new `platform/ai_execution/*` modules not in the ACCEPTED list) — recorded honestly in that ADR's own text rather than left as a silent mismatch. | spec-root maintainer, next repository-architecture revision |

## Rollback

`git revert` of the landing commit removes this product root entirely; the spec root is untouched by the runtime (read-only), and no deployed system depends on it.
