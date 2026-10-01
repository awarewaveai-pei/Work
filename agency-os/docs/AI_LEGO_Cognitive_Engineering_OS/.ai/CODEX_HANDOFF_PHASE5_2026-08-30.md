# Codex Handoff — Phase 5 MVP Vertical Slice prototype (autonomous, multi-day)

> **HISTORICAL — do not execute.** This handoff was completed: the prototype was built and landed into the repo per `docs/adr/ADR-022-phase-5-runtime-landing.md` (ACCEPTED 2026-09-03). Current Cognitive OS work is driven by `Projects/internal/cognitive-engineering-os/docs/RESEARCH_LINES_MASTER_PLAN.md` §0. Kept only because ADR-018 / ADR-022 / ADR_INDEX cite it.

Written by Claude 2026-08-30. Operator's Claude budget is nearly exhausted
today; Codex has daily quota. This handoff is written so Codex can work
**autonomously across multiple days without waiting for a Claude session
to be available** — that's the whole point of the D:/tmp prototype split
below. Read this fully before starting.

## 0. The governance rule this handoff follows (do not skip this)

`docs/adr/ADR-018-codex-write-authority-and-delegation-exceptions.md`
(ACCEPTED 2026-08-30) is the standing rule: Codex does not write into
`D:\Work` directly for anything beyond small, explicitly-scoped exceptions.
The reason is structural, not distrust — Claude Code's mechanical safety
hooks (git-log-injector, high-risk-bash-warn, verify-gate-commit, etc.)
only exist for Claude Code as a process; they do not run for you at all.

**Your workspace for this task is `D:\tmp\ai-lego-phase5-prototype\`,
NOT `D:\Work`.** Create it if it doesn't exist. Everything you build lives
there until a future Claude session reviews and ports validated pieces
into the real repo. This is not a punishment or a lesser task — it's the
right split for genuinely security-sensitive work (encryption key
lifecycle, real data deletion) per ADR-018's own reasoning, and it means
you can iterate freely without any git/commit ceremony slowing you down.

**Never touch**: `D:\Work` itself (read from it freely — the schemas and
mother documents there are your spec — but do not write, edit, or commit
anything inside it). If you think something needs to change in `D:\Work`
(a schema is wrong, a spec is missing something), write that down in your
handback notes (§6) instead of editing it yourself.

## 1. What you're building, in one paragraph

A working, end-to-end prototype proving the AI-LEGO Cognitive Engineering
OS architecture on ONE realistic scenario: a research team uploads 3
interview recordings, the system transcribes them, detects and encrypts
personal-data fields, an AI assists with qualitative coding while a human
reviews every suggestion, the system computes real inter-rater-reliability
statistics (not an LLM guessing a number), produces a research memo, and
partway through, one interview subject exercises their GDPR right to
deletion — which must be a real cryptographic key destruction, not a soft
delete. The system must also prove it can replay to any past state and
roll back a bad model/prompt version. Full 28-step script:
`agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/MVP_VERTICAL_SLICE_PLAN.md`
§3 — read it in full, it is the literal spec for what to build, step by
step. Do not paraphrase or summarize it away; work through it in order.

**This uses 100% synthetic/test data.** No real interview subjects, no
real recordings of real people, no real GDPR request from a real person.
Invent realistic-looking test fixtures (3 short synthetic "interview"
audio clips or transcripts, fake names, fake company names) — label them
clearly as synthetic in every file that uses them.

**Deployment target**: the operator explicitly chose "本機隔離環境" (local
isolated environment) for this prototype — it runs on the operator's own
laptop, never touches `ks-aw-01` (the real production server) or any real
client's data or infrastructure. Do not add any cloud dependency, any real
API key usage against a paid/production service tier, or any network call
to AwareWave's real infrastructure. If a step needs an external service
(e.g. a real speech-to-text API), use either: (a) a free-tier/local model
(e.g. a local Whisper model) or (b) a clearly-mocked stub that returns
realistic fake output — do not spend real money without asking first.

## 2. Read these specs before writing any code

All under `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/`:

- `docs/architecture/MVP_VERTICAL_SLICE_PLAN.md` — the script (§3), the
  required specs list (§4), and the 6 acceptance criteria (§5) you must be
  able to demonstrate at the end. Read §5 especially carefully — it names
  a specific, easy-to-get-wrong trap: at replay time T0 (before deletion)
  and T1 (after deletion), the subject's personal-data fields must decrypt
  to the IDENTICAL result (`REDACTED` at both points) — NOT "plaintext at
  T0, redacted at T1." If your implementation shows plaintext at T0, you
  have built a soft-delete-with-a-timestamp, not crypto-shred, and it is
  wrong per ADR-002's own invariant. Re-read ADR-002
  (`docs/adr/ADR-002-personal-data-erasure-vs-event-immutability.md`) if
  this doesn't make sense before writing the deletion/decrypt logic.
- `docs/architecture/REPOSITORY_ARCHITECTURE.md` — the approved code layout
  (`/apps`, `/core/domain`, `/modules`, `/platform`, `/workers`, `/data`).
  Your prototype's internal folder structure should roughly mirror this
  (even though it lives in `D:/tmp`, not real `D:/Work` paths) so a future
  port-in doesn't require restructuring everything.
- The specific schema files named in MVP_VERTICAL_SLICE_PLAN.md §4 — these
  are your data contracts. Every record your prototype produces (events,
  execution manifests, artifacts, audit entries) should validate against
  the corresponding `specs/*.schema.yaml` file. Don't invent field names
  that contradict an existing schema; if a schema is missing something you
  need, note it in your handback (§6), don't just wing it silently.
- `specs/jurisdiction/pack.schema.yaml` and
  `policies/jurisdiction/legal-freshness-sla.policy.yaml` are NOT part of
  this slice's scope (no jurisdiction-pack logic is exercised by the
  research scenario) — do not build anything for them here.

## 3. Suggested build order (checkpoints, not a rigid gate)

Since there's no Claude-in-the-loop requirement here (unlike the earlier
proposal-drafting handoff), you don't need to stop and wait between these
— but structuring your own work in this order will make handback easier:

1. **Source → Ingest** (script steps 1-4): project/tenant model, Portable
   Artifact URI addressing, tenant-scoped CAS-style storage (even if it's
   just a local folder structure keyed by fake tenant_id for the
   prototype, the PATH SHAPE should match ADR-003's
   `/objects/<tenant_id>/sha256/aa/bb/<hash>` convention), event ledger
   (even a simple append-only JSON-lines file is fine for a prototype).
2. **Normalize → Knowledge** (steps 5-9): transcription (local/free
   model or realistic mock), PII field detection + the encryption envelope
   shape from `specs/security/` (cipher_alg/kek_ref/dek_wrapped/iv/
   ciphertext/classification_tag — EC §27.1), a minimal evidence-graph
   structure.
3. **Human Contribution → Method Selection** (steps 10-15): this is where
   the `research.qualitative_coding` method contract
   (`methods/contracts/research.qualitative_coding.contract.yaml`, already
   built) gets actually exercised — simulate the human-in-the-loop
   accept/reject/edit flow (a CLI prompt loop is fine for a prototype, no
   real UI needed), demonstrate the `LOCKED_FACT` mechanism.
4. **Workflow → AI/Compute** (steps 16-18): the actual statistics
   computation (Cohen's Kappa or similar) MUST be a real calculation from
   real code (e.g. a small Python function), never an LLM asked to
   "calculate" and report a number — this is a named, explicit
   requirement (EC §39, P1-GAP-AI-2) and one of the acceptance criteria
   checks for it directly.
5. **Evidence → Artifact → Human Review** (steps 19-22): the sentence
   → claim → evidence → source traceability chain, the quality gates.
6. **Version → Audit → Replay/Rollback** (steps 23-28): THE HARDEST AND
   MOST IMPORTANT PART. Get steps 1-5 working first before attempting
   this — replay and rollback only make sense once you have a working
   event log and manifest history to replay/roll back. Budget the most
   time here; it's what the acceptance criteria mostly test (§5 items
   1, 2, 3, 6 are all about this section).

## 4. What "done" looks like

You don't need all 6 acceptance criteria to be perfectly demonstrated
before handing back — partial, honestly-labeled progress is fine and
expected given this spans multiple days. What matters:

- Every claim you make in your handback notes (§6) about what works must
  be something you actually ran and observed, not something you believe
  should work based on the code you wrote. If you didn't run it, say so.
- Do not fake or hardcode a "passing" result to make an acceptance
  criterion look satisfied. If replay doesn't actually work yet, say
  "replay not yet implemented" — not "replay implemented" with a
  hand-wired fake output.
- Keep working test fixtures and any scripts you use to exercise the
  system (so a future Claude session can re-run what you ran, not just
  read your description of it).

## 5. Things that would be real mistakes here

- **Do not use real personal data of any real person**, including your
  own test data pulled from a real recording. Synthetic only.
- **Do not spend real money** (paid API tiers, cloud compute) without
  writing it down first and asking — see the "本機隔離環境, 假資料" scope
  in §1. If you're unsure whether something costs money, assume it does
  and use a free/local/mock alternative instead.
- **Do not implement crypto-shred as a soft delete with a date filter.**
  This is the single most likely conceptual bug — re-read §2's ADR-002
  callout above before writing the deletion path.
- **Do not touch `D:\Work`.** Read from it, never write to it. If you
  clone/copy schema files into your prototype workspace for convenience,
  keep them as read-only references, don't fork-and-diverge them without
  noting it.
- **Do not silently invent a schema field that isn't in the actual
  `specs/*.schema.yaml` files.** If you need something the schema doesn't
  have, write it in your handback notes as a real gap, the same discipline
  every proposal and policy file in this repo already follows.

## 6. Handback format (for whichever Claude session reviews this next)

When a Claude session becomes available to review your work, it will need
from you, in a single markdown file at
`D:\tmp\ai-lego-phase5-prototype\HANDBACK.md`:

1. **What actually runs** — exact commands to reproduce each working
   piece, what you tested it against.
2. **What doesn't work yet / not attempted** — honest, not glossed over.
3. **Real gaps you found** in the specs/schemas while building (things
   the mother documents or `specs/*.yaml` files don't actually specify
   clearly enough to implement without guessing) — these become real
   `open_questions` entries in the actual repo later, so be specific with
   file:line citations of what's ambiguous.
4. **Any deviation from MVP_VERTICAL_SLICE_PLAN.md's script** and why.
5. **Dependencies/packages used** — so a future port-in knows what needs
   to be added to the real repo's dependency management.

Work in small, frequent commits **inside your own `D:/tmp` prototype
folder only** (a local git init there is fine and encouraged, purely for
your own history — this is NOT the same repo as `D:\Work` and does not
interact with it).
