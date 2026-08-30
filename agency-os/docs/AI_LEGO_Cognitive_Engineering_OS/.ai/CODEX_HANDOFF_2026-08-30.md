# Codex Handoff — draft 4 ADRs (proposal-apply work is now DONE, do not redo)

Written by Claude 2026-08-30. **Update, same day**: after this file was
first written, the operator asked Claude to keep going instead of handing
off the proposal-apply work — Claude finished applying all remaining 009-039
proposals directly (commits `a911d1d6`..`eda01829`5, see `git log --oneline
a911d1d6..eda018295` for the full list). **§1-§6 below (the proposal-apply
sections) are now historical — do not re-run them, do not re-apply anything,
all 39 proposals show `status: APPLIED` with real `applied_commit` hashes in
their own front-matter.** Verify with:
`grep -c "^status: APPLIED$" .ai/proposals/*/PROPOSAL.md | grep -v ':0' | wc -l`
— should print `39`.

**§7's 4 ADRs are also DONE now** — you (Codex) drafted ADR-017/018/019/020
correctly (all citations verified real by Claude, all correctly left as
`PROPOSED`, none self-accepted), the operator approved all 4 in chat
("核准並 codex-review") 2026-08-30, Claude flipped them to `ACCEPTED` and a
genuine external `/codex-review` (not a self-review) returned zero findings.
Verify with: `grep -c "^Status: ACCEPTED" docs/adr/ADR-01{7,8,9}*.md
docs/adr/ADR-020*.md` — should be 4/4.

**The only real remaining work is §9 below (new section, added after ADR
approval): implement what ADR-017 and ADR-019 actually decided.** ADR-018
needs no further action (it's a governance-model decision about who writes
where, not mother-document content). ADR-020 needs no immediate action
either — it directs that future *changed or new* sections get a
NORMATIVE/EXAMPLE/VISION marker; it does not require retrofitting existing
untouched sections. §1-§7 are left in place only so you can see the exact
process/quality-bar Claude used on the earlier rounds (including 4 real
defects Claude caught mid-apply: 2 bare cross-document section references,
1 self-inflicted line duplication, 1 fabricated detail not grounded in any
real source, plus 4 more defects a genuine external `/codex-review` caught
in Claude's own earlier work — see WORKLOG 2026-08-30 續24 for that list)
— read it for calibration, not as a task list.

## 0. What this repo is, in one paragraph

`agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/` holds 3 "mother documents"
(Master Plan, Method Atlas, Execution Contract — the single source of truth
for a 30-year system) plus machine-readable specs/policies compiled from
them. Editing the mother documents is gated: every edit must first exist as
a proposal file at `.ai/proposals/<NNN>-<slug>/PROPOSAL.md`, get operator
approval, then get APPLIED one at a time with one commit per proposal. This
is `docs/adr/ADR-006-mother-doc-revision-flow-and-repo-layout.md` — read its
full "審核者是誰" section before starting, it governs everything below.

## 1. Already done — do not redo

Proposals 001-008 are APPLIED. Commits (in order):
`f7f5359a1` (001), `a58b308ae` (002), `b54a43aeb` (003), `d1ba4d6b3` (004),
`9220e089c` (005), `77ad095d9` (006), `2f9ff3434` (007), `7fc9dbbba` (008).

All 39 proposals already have `status: APPROVED`, `approved_by: "操作者"`,
`approved_at: "2026-08-30"`, `approval_note: "39 個都核准"` in their
front-matter (operator gave blanket approval in chat 2026-08-30 — this
satisfies ADR-006's approval-trigger requirement; you do not need to ask the
operator again per-proposal). What's still missing for 001-008: their
`status` field should become `APPLIED` and `applied_commit` filled with the
hashes above — Claude ran out of turn budget before doing this cleanup
commit. Do this FIRST as a single small commit (see §5 below), then continue
with 009-039.

## 2. Remaining 31 proposals — apply in this order (numeric = safest)

| id | slug | target doc | affected_line_ranges (at time of writing — WILL shift after earlier edits in the same doc, always re-locate by content, never trust the raw line number) |
|---|---|---|---|
| 009 | key-destruction-replay-gate-ec | Execution_Contract | L3041-3053 |
| 010 | tenant-domain-model-object-mp | Master_Plan | L330-357 |
| 011 | cas-path-tenant-scoped-mp | Master_Plan | L2570-2584 |
| 012 | blast-radius-chain-reconciliation-mp | Master_Plan | L262-275 |
| 013 | branch-definition-atlas | Atlas | L4136-4159 |
| 014 | risk-tier-atlas-schema-pointer | Atlas | L1077 |
| 015 | gate-injection-trigger-atlas | Atlas | L3599 |
| 016 | epistemic-type-snake-case-atlas | Atlas | L591-605 |
| 017 | authorship-state-snake-case-mp | Master_Plan | L3384-3393 |
| 018 | authorship-state-dedup-mp | Master_Plan | L992-1002 |
| 019 | fact-promotion-redline-atlas | Atlas | L4151 |
| 020 | fact-promotion-redline-ec | Execution_Contract | L1489-1495 |
| 021 | locked-fact-casing-mp | Master_Plan | L975 |
| 022 | locked-decision-definition-ec | Execution_Contract | L1988-1990 |
| 023 | db-migration-15-step-sequence-ec | Execution_Contract | L1135-1157 |
| 024 | db-migration-atlas-pointer-batch | Atlas | L900, L907-919, L2367-2376, L3486-3500 (4 separate sites — 4 separate Edit calls, still ONE commit for the whole proposal) |
| 025 | method-id-grammar-fix-atlas-l50 | Atlas | L50 |
| 026 | method-id-grammar-fix-atlas-l4256 | Atlas | L4256-4258 |
| 027 | repo-layout-pointer-mp | Master_Plan | L610-620, L764-783, L842-851, L1004-1014 (4 sites, 1 commit) |
| 028 | repo-layout-pointer-ec | Execution_Contract | L220-224, L644-648, L732-749, L1005-1009, L2362-2374, L2742-2843, L3988-4059 (7 sites, 1 commit) |
| 029 | pseudonymization-v1-baseline-split-mp | Master_Plan | L5659-5672 |
| 030 | pii-formal-definition-ec | Execution_Contract | L2955-2971, L2974-2999 |
| 031 | financial-assumptions-blocked-callout-mp | Master_Plan | L2171-2173 |
| 032 | plane-workspace-module-relationship-mp | Master_Plan | L419-420 |
| 033 | plane-workspace-module-crosswalk-table-mp | Master_Plan | L419-420, L3085-3086, L3297-3299 |
| 034 | data-science-plane-title-fix-mp | Master_Plan | L1688-1690 |
| 035 | code-layer-repository-architecture-pointer-mp | Master_Plan | L3175-3177 |
| 036 | localization-directory-pointer-mp | Master_Plan | L3344-3350 |
| 037 | gate-list-pointer-atlas | Atlas | L4164-4194 |
| 038 | gate-list-pointer-ec | Execution_Contract | L2246-2278 |
| 039 | gate-list-union-content-mp | Master_Plan | L5903-5927 |

**032 and 033 both touch MP L419-420** — read 033's DEPENDENCIES section
before touching either; apply 032 fully (content + commit) before starting
033, then re-locate 033's L419-420 text in the now-changed file.

**027/028's DEPENDENCIES sections flag `docs/architecture/REPOSITORY_ARCHITECTURE.md`
as PROPOSED** — this is now stale, the operator approved it 2026-08-30
(status is ACCEPTED, see that file's own header) and
`.ai/research/phase-2/repo-layout-draft.yaml` now exists. The dependency is
satisfied; you do not need to wait or ask.

## 3. Exact per-proposal process (mirror this precisely)

For each proposal, in numeric order:

1. **Read the full `PROPOSAL.md`**, especially `## Diff` → `### Original` /
   `### Proposed` / `### Reason`, and `## DEPENDENCIES`.
2. **Read the CURRENT actual text in the target mother document at roughly
   that line range** — do NOT trust the proposal's `### Original` block as
   byte-exact. Several of Claude's own proposals transcribed the mother doc
   loosely (dropped a `**bold**` marker, dropped a ```` ```text ```` fence,
   etc.) even though the file content itself was verified unchanged by
   sha256. Always diff what you're about to replace against what's actually
   in the file right now.
3. **Apply via exact string replacement** (this repo's Edit-tool equivalent
   — precise old-string/new-string match, never a blind `sed`/regex pass on
   these 3 files: proposal 001's own MIGRATION note states this explicitly
   and it's the right call — `sed` on a huge governance doc with duplicate
   nearby text is how you silently corrupt an unrelated section).
4. **Verify no accidental duplication.** Claude did this to itself once
   (proposal 008): the old_string being replaced ended right before a line
   that ALSO appears inside the new (Proposed) content further down — the
   edit succeeded, but the file ended up with that line twice (once from
   the untouched remainder of the original file, once from the new content
   Claude wrote). Caught it by grepping the suspicious trailing line and
   seeing 2 hits instead of 1. **After every edit, grep the last 1-2 lines
   of your new_string across the whole file and confirm the count matches
   what SHOULD exist** (usually 1, occasionally 2+ if that phrase
   legitimately recurs elsewhere — check).
5. **Watch for bare cross-document section references.** Two of Claude's
   own proposals (007, 008) wrote things like "見 §57.1" or "見 §27.1"
   inside one mother document when the section being cited actually lives
   in a DIFFERENT mother document (proposal 007 targets Execution Contract
   but meant Master Plan §57.1; proposal 008 targets Master Plan but meant
   Execution Contract §27.1/§31.1 — each document has ITS OWN unrelated
   §27/§31/§57). A bare `§N.M` inside a document is always read as that
   SAME document's own section by a future reader. Before applying, grep
   the target document for `^# <N>\.` to see what that document's own
   section N actually is. If the proposal's citation means a different
   document, rewrite it as `<Document Name> §N.M` explicitly. This is a
   correction to a drafting defect, not a new decision — the intended
   meaning is unambiguous from the proposal's own RATIONALE/DEPENDENCIES
   text, you're just fixing an internal citation to not lie to a future
   reader.
6. **Run the golden test suite**: `python tests/run_golden_tests.py` from
   `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/` — must show
   `ALL GOLDEN TESTS PASSED` (currently 839/839) before you commit. These
   tests mostly validate the machine-readable specs, not mother-doc prose,
   but they're free insurance against anything you touched that a schema
   also references (e.g. a `mother_doc_text` verbatim-quote field).
7. **Commit — one proposal, one commit.** Message format (copy this
   pattern exactly, it's what 001-008 already used):
   `docs(ai-lego): apply proposal <NNN> — <one-line summary of the change> (baseline <first 8 chars of target_baseline_hash>)`
   If you made a citation fix per step 5 or caught a duplication per step 4,
   say so in the commit body — don't hide it, it's useful audit trail (see
   007/008's actual commit messages for the pattern).
8. **Do NOT touch `.ai/research/phase-0/document-hashes.yaml`.** Some
   proposals' own MIGRATION notes say to recompute and update it after
   applying — this is wrong; ignore that instruction. That file's own
   header says "Phase 0 document hash snapshot" — it is the fixed original
   baseline every `target_baseline_hash` field points back to. Updating it
   after every apply would destroy its function as a stable anchor. This is
   a real inconsistency in how some proposals were drafted; Claude caught it
   and is telling you not to propagate it.
9. **Never apply two proposals in one commit**, even when their line ranges
   are far apart in the same file. Keep the audit trail one-to-one.

## 4. If a proposal's Original text doesn't match the current file

Stop. Do not force it, do not guess, do not "fix" the mother doc to match
what the proposal expected. This means either (a) an earlier proposal in
this same batch already touched overlapping content, or (b) something
changed the file since the proposal was authored. Read what's actually
there, figure out which case it is, and either adjust the edit to the real
current text (if the underlying decision is clearly unaffected — same
judgment call as step 5 above) or leave that one proposal un-applied and
move on, flagging it clearly in your final report.

## 5. Closing commit — status/applied_commit for everything applied

After you've applied as many as you can, do ONE more commit that edits
every applied proposal's front-matter: `status: APPLIED`,
`applied_commit: "<real 8+ char hash from that proposal's own apply
commit>"`. Include proposals 001-008 (hashes given in §1 above) in this
same closing commit — Claude didn't get to it. Commit message:
`docs(ai-lego): mark N applied proposals APPLIED with their real commit hashes`.

## 6. Verification before you report back

- `python tests/run_golden_tests.py` — must pass, run it one final time
  after everything.
- Grep every mother document you touched for `§` followed by a number that
  doesn't exist in that document (`grep -n '^# [0-9]' <file>` gives you the
  real section list to check bare references against) — this is the same
  check described in step 5, done once more as a final sweep across
  everything you applied, not just proposal-by-proposal.
- Report which proposal IDs got applied, which (if any) you stopped on per
  §4, and the final golden-test pass/fail count. Do not claim "all done" if
  something was skipped — say exactly what's left.

## 7. The 4 remaining ADRs (OQ-1, OQ-4, OQ-13, OQ-14)

Source of truth for each question's exact text:
`.ai/research/phase-0/open-questions.yaml` (read it in full — do not rely
only on the summaries below, they're trimmed).

Every prior OQ this session (OQ-6 through OQ-12) was resolved the same way:
Claude drafted a full ADR at `docs/adr/ADR-0NN-<slug>.md` matching the exact
format of the existing ADRs (read `docs/adr/ADR-011-platform-gate-ownership-and-unification.md`
in full as your template — Context/Options Considered/comparison
table/Recommendation/Consequences/Migration), the operator gave a blanket
"you decide" go-ahead in chat, and Claude picked the option already flagged
as lowest-risk/most-consistent-with-what's-already-built. Follow the exact
same format and rigor.

**Critical constraint — do NOT write `Status: ACCEPTED` yourself.** Every
existing ADR's ACCEPTED status line explicitly names the operator's real
go-ahead ("操作者明示授權...", quoted or dated). You have not received that
go-ahead for these 4 — the operator authorized Claude to decide OQ-6-12 in
an earlier message, not you. Write `Status: PROPOSED — awaiting operator
go-ahead` and stop there. Recommend an option, argue for it with the same
rigor as the existing ADRs, but leave the accept decision to the operator or
to Claude in a future session with an explicit go-ahead.

### OQ-1 — Master Plan / Atlas missing identity headers
Context: EC §1 says identity = Document ID + Version + Hash. Master Plan has
neither ID nor version; Atlas has "版本 1.0" but no ID and non-semver.
Options: A) add identity headers to both (minimal semantic correction) —
this file's own `recommendation` field already says "A — minimal semantic
correction, exactly the class directive §IX allows". B) leave as-is, track
externally in document-inventory.yaml only.
**Suggested direction**: A, per the file's own stated recommendation.

### OQ-4 — Codex write authority: directive §XIV vs repo governance
Context: the original Phase-0 directive assigned Codex schema
implementation/tests/migrations directly. Repo governance
(`AGENTS.md` §跨模型 oracle) instead made Claude the sole writer because all
mechanical safety gates are Claude-Code-specific hooks that don't exist for
any other process. Options: A) Codex produces patch proposals, Claude
verifies each finding and writes; D:/tmp prototypes stay Codex-owned. B) a
new sandboxed writable area for Codex with its own gates (higher risk, new
governance surface).
**Suggested direction**: A — this is already the ACTUAL practiced model in
this repo (see AGENTS.md's routing table), so accepting it as ADR just
formalizes existing practice, zero new risk.
**Important irony worth naming in the ADR's own text**: the operator's
2026-08-30 decision to hand YOU (Codex) this exact apply-proposals task is
a deliberate, explicit, one-time exception to Option A — made because of a
real resource constraint (Claude's context budget), not a reversal of the
general policy. The ADR should say this plainly rather than pretend no
tension exists: general policy stays "Claude writes, Codex proposes";
today's specific delegation is an operator-authorized, disclosed exception,
and the checklist in §3 above exists specifically to substitute for the
mechanical gates you don't have.

### OQ-13 — Status-code taxonomy: top-level statuses vs reasons under BLOCKED?
Context: 9 semantic blocking codes (`PLANNING_BLOCKED_METHOD_ATLAS_REQUIRED`,
`DOCUMENT_RESOLUTION_BLOCKED`, `METHOD_RESOLUTION_BLOCKED`, etc.) don't map
into the EC state machine's legal side-states. Options: A) state machine
keeps a small closed enum (`BLOCKED`/...) + a `reason_code` field carries the
semantic codes. B) expand the state enum to include every semantic code.
**Suggested direction**: A. This is not just "lower risk in the abstract" —
`specs/execution/execution-state-machine.schema.yaml` (built earlier this
session, 2026-08-30) already references `status-codes.schema.yaml`'s
existing 7 side-states WITHOUT redefining them, i.e. the actual shipped code
already assumes a small closed side-state enum. Picking B now would
contradict code that already exists and already passes 839 golden tests.

### OQ-14 — Normative-strength marking for mother-doc content
Context: Master Plan mixes narrative vision, illustrative examples, and
MUST-rules with no marker distinguishing them — root cause of
examples-being-misread-as-requirements. Options: A) introduce explicit
NORMATIVE/EXAMPLE/VISION markers per section during Phase 2 revision. B)
move all normative content to machine specs, mother docs become
narrative-only. C) other.
**Suggested direction**: A. Reasoning to include in the ADR: B sounds
cleaner but is a much larger blast radius (re-touching potentially hundreds
of MP sections to strip out normative content) for a problem A solves with
an additive marker per section — same "smallest diff that fully closes the
gap" logic ADR-006 itself used when it rejected "Option C — remove
repo-layout entirely" in favor of the narrower compromise. Every other
mother-doc edit this session (all 39 proposals) has been additive/pointer-
style, never a full rewrite; A is the option consistent with that pattern.

## 8. Anything not covered here

If you hit a situation this file doesn't address, do NOT improvise past
what's written — stop, write down exactly what's ambiguous and why, and
let the operator or Claude decide in the next session. That's the same
stop condition every other agent in this repo already follows (see
`AGENTS.md` R0 "遇到以下情況立即停止並回報").

## 9. NEW (2026-08-30, post-approval) — Implement what ADR-017 and ADR-019 decided

The operator's instruction for this section, verbatim, was: "what do I tell
Codex so this comes out perfect — better than what Claude did?" The honest
answer isn't a magic phrase. It's: do everything Claude did in §0-§7 (real
citation checks, real test runs, one-commit-per-unit, honest stop-and-ask),
and go further in the three specific places listed in §9.4 below where
Claude's own process this session was demonstrably incomplete — a real
external `/codex-review` caught 4 things Claude missed in its own work
(WORKLOG 2026-08-30 續24: contradictory pre/post-answer text left in the
same file after an edit). That is the concrete, provable bar to beat.

### 9.1 ADR-017 (OQ-1) — Master Plan / Atlas identity headers

ADR-017 (`docs/adr/ADR-017-mother-document-identity-headers.md`, ACCEPTED)
deliberately did NOT specify exact header wording or placement — it says
that must happen as separate `missing_contract` proposals under ADR-006.
That's your job now:

1. Read the CURRENT top of both mother documents (line numbers may have
   shifted since ADR-017 was drafted — proposals 001-039 touched hundreds
   of lines in both files. Do not trust any line number cited in ADR-017
   itself; re-locate by content).
2. Design a minimal identity header block for each: a stable Document ID
   (e.g. `ai-lego.master-plan`, matching the existing `id:` convention
   already used in Execution Contract §4's document registry — read that
   registry first, at EC §4, to reuse its exact ID scheme rather than
   inventing a new one) and SemVer `1.0.0` (per ADR-017's Recommendation:
   "the execution-time content hash remains an Execution Manifest value...
   it must not be hard-coded into a mutable document header" — do NOT put
   a hash in the header itself).
3. Write TWO separate `.ai/proposals/<NNN>-<slug>/PROPOSAL.md` files (one
   per mother document — do not merge them into one proposal, ADR-017's own
   Migration section says "two independent ADR-006 proposals"). Use
   `040`/`041` as the next available proposal IDs (verify with
   `ls .ai/proposals/ | sort | tail -3` first — do not assume 040 is free
   if another session added proposals in the meantime).
   Follow the EXACT template every other proposal in `.ai/proposals/` uses
   (read `.ai/proposals/001-architecture-constitution-mp-pointer/PROPOSAL.md`
   as your template — front-matter fields, section headings, Diff
   Original/Proposed/Reason structure, all of it).
   `change_class: "missing_contract"` (ADR-017's own Context section calls
   this a missing-contract gap, and ADR-006 requires this field to be one of
   the 7 allowed values).
4. Do NOT set `status: APPROVED` yourself and do NOT apply the diff to the
   mother documents yet. Leave both at `status: DRAFT`. The operator has not
   given a blanket "approve" for these two specific proposals the way she
   did for the original 39 — that approval was scoped to a specific,
   already-drafted batch. Wait for an explicit go-ahead on these two before
   advancing status or applying content, exactly as ADR-006's own approval
   mechanism requires (see §7's ADR-018 boundary: Codex writing without an
   explicit, bounded, per-task exception is the thing that ADR-018 says NOT
   to do by default).

### 9.2 ADR-019 (OQ-13) — `reason_code` schema field

ADR-019 (`docs/adr/ADR-019-status-code-taxonomy-and-reason-codes.md`,
ACCEPTED) decided a schema change, NOT a mother-document proposal — no
ADR-006 gate applies here, this is ordinary Phase-3 machine-spec
compilation work (same category as the 9 Phase-5 schema files Claude built
earlier today).

1. Read `specs/execution/result.schema.yaml` (708 lines) AND
   `specs/execution/execution-state-machine.schema.yaml` (641 lines) AND
   `specs/execution/status-codes.schema.yaml` (455 lines) in full before
   deciding anything — Claude has NOT pre-decided which file the
   `reason_code` field belongs on; ADR-019 only says "at the
   execution-result / transition-record boundary." Figure out from the
   actual schemas which one models a "transition record" or "execution
   result" and justify your placement choice in writing, the same way every
   other schema file in this suite documents a `compilation_decisions`
   block.
2. Add `reason_code` as specified in ADR-019 §Recommendation: optional
   field, validated against `status-codes.schema.yaml`'s registry, required
   only for newly-emitted `BLOCKED`/`NEEDS_HUMAN_REVIEW` records per the
   Migration section — do not make it required for ALL records (ADR-019 is
   explicit that this is additive/incremental, not a breaking change).
3. Add fixtures for every one of the 9 registered signal codes in
   `status-codes.schema.yaml` — ADR-019's Recommendation explicitly requires
   "fixtures for every currently registered signal," not a sample.
4. Run `python tests/run_golden_tests.py` — must stay at 839/839 or higher
   (adding fixtures may raise the count; it must never drop).

### 9.3 Commit discipline (same as §3, restated because it matters most here)

One commit for the schema change (9.2), separate commits for each of the
two proposal drafts (9.1) if you reach the point of applying them (you
won't, per 9.1 step 4 — drafting alone doesn't need a commit at all if you
want, but if you do commit the DRAFT proposals, that's fine as one commit
covering both new files, since neither is being applied to a mother
document yet).

### 9.4 The three specific gaps to close that Claude did NOT close well enough

These are not hypothetical — they are the exact shape of the 4 findings a
real external review caught in Claude's own work today (WORKLOG 續24):

1. **After every edit, re-read the WHOLE file's top-level description /
   summary / overview block**, not just the section you changed. Claude's
   own bug: edited `role_to_authority_mapping`'s content but left the same
   file's `description:` field at the top saying "this is deliberately left
   empty" — two truths in one file. Before you consider any task in §9.1 or
   §9.2 done, grep the ENTIRE file you touched for words like "empty",
   "skeleton", "not yet", "未填", "尚未", "blocked", "TBD" and check every
   hit is still accurate after your edit — not just the hit nearest your
   change.
2. **Grep every other file in the repo for the OLD value/state you just
   changed**, not just the file you edited. Claude changed one file's
   status but missed that TWO other files (`ADR_INDEX.md`,
   `AI_LEGO_OS_Program_Plan_v1.md`) had their own independent copy of the
   stale claim. Before declaring 9.1 or 9.2 done, `grep -rn` the exact
   phrase/status/count you changed across the whole
   `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/` tree.
3. **Don't trust a tool's "success" verdict without checking it actually
   read the content.** Claude's own codex-review attempt today returned
   "approve" once from a sandboxed process that admitted in its own log it
   never actually opened the diff file (path was outside the accessible
   directory). Claude caught this only by reading the raw tool log line by
   line instead of trusting the one-line verdict. If you invoke any
   external tool or subprocess as part of this task, read its full raw
   output for evidence it actually inspected real content — not just its
   summary verdict.

If you genuinely find zero issues after doing all of the above, say so
directly with the specific checks you ran — don't manufacture a finding to
look thorough. That itself is the standard this repo holds Claude to
(`AGENTS.md`: "如果無法支撐真實 finding，直接回報 no findings").
