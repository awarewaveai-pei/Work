# Codex Handoff — Reconcile MVP_VERTICAL_SLICE_PLAN.md's stale spec paths and upload-count ambiguity

Written by Claude 2026-08-31. Operator's Claude budget is at ~3% with a
multi-day wait before it refreshes; this handoff exists so Codex can do
the investigation and drafting now, without needing a Claude session
available. Read this fully before starting.

## 0. The write-boundary rule this follows (do not skip)

Same rule as the Phase 5 handoff: `docs/adr/ADR-018-codex-write-authority-and-delegation-exceptions.md`
— Codex reads `D:\Work` freely but does not write into it. **Output for
this task goes into a new file at
`D:\tmp\ai-lego-phase5-prototype\MVP_PLAN_RECONCILE_PROPOSAL.md`**, not
into `MVP_VERTICAL_SLICE_PLAN.md` itself. A future Claude session applies
your proposal after verifying it — that's a cheap, fast step once your
proposal is precise, which is the whole point of doing the expensive part
now.

## 1. What this is and why it exists

The Phase 5 prototype's `HANDBACK.md` (in `D:\tmp\ai-lego-phase5-prototype`,
read it for full context — especially the "Real specification/document
gaps or ambiguities found" section) found real drift between
`agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/MVP_VERTICAL_SLICE_PLAN.md`
and the actual current repo state:

1. **Line ~55-58**: the plan says `DocumentUploaded (×4)` for the tenant-
   isolation test scenario, but a correct isolation test needs a matching
   Tenant-A consent object AND a Tenant-B consent object — five upload
   events, not four. Verify this is still true by re-reading that section
   and re-deriving the count yourself; don't just trust the prototype's
   claim.
2. **Line ~103, ~111**: several required-spec paths named in the plan no
   longer match the active compiled files. The prototype found:
   `domain/artifact-uri.schema.yaml` → actual is
   `specs/artifact/portable-uri.schema.yaml`; `execution-manifest` →
   `execution/manifest`; `execution/capability-contract` →
   `domain/capability-contract`; `execution/rollback-plan` →
   `execution/rollback`; `execution/personal-data-redacted-event` →
   `domain/personal-data-redacted-event`. Verify every one of these
   yourself with a fresh `Glob`/`find` against the actual
   `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/` tree — do not
   assume the prototype's list is complete or still accurate; new files
   may have moved again since that report was written.
3. **Line ~145**: confirm the plan still correctly leaves the Method
   Contract's saturation/reliability threshold as operator-set (not
   something to "fix" by inventing a number).

## 2. Your job

1. Re-read `MVP_VERTICAL_SLICE_PLAN.md` in full — not just the lines
   above, the whole file — so you understand what these references sit
   inside of, and so you can catch anything else stale nearby that
   wasn't already reported (this is the same "grep the whole file, not
   just the reported line" discipline this repo's governance SOP
   requires — see `agency-os/docs/operations/GOVERNED_SYSTEM_BUILD_SOP.md`
   §6 if you want the general pattern).
2. For every stale path or count you confirm, find the ACTUAL current
   correct value by reading the real file/directory — cite the real path
   you verified, don't guess.
3. Write `D:\tmp\ai-lego-phase5-prototype\MVP_PLAN_RECONCILE_PROPOSAL.md`
   containing, for each fix: the exact current (stale) text, the exact
   line number in `MVP_VERTICAL_SLICE_PLAN.md`, the exact proposed
   replacement text, and one sentence of why (with the real file path you
   verified against). Format it as a literal find/replace list a Claude
   session can apply mechanically after a final sanity check — not prose
   that needs re-interpretation.
4. Check whether `MVP_VERTICAL_SLICE_PLAN.md` has a `Status:` field
   (search the top of the file). If it says `PROPOSED` (not an accepted
   ADR or an already-`APPLIED` mother document), note that in your
   proposal explicitly — it changes whether the future Claude session
   needs to route this through the `.ai/proposals/` gate
   (`ADR-006-mother-doc-revision-flow-and-repo-layout.md`) or can treat it
   as a plain stale-reference correction. Don't decide this yourself,
   just surface the fact clearly so the human/Claude decision is informed.
5. If you find the plan's real current state already contradicts
   something else you read (another doc, another schema, a WORKLOG entry)
   — same VBC discipline as everywhere else in this repo — say so as an
   open question in your proposal rather than picking one side silently.

## 3. What NOT to do

- Do not edit `MVP_VERTICAL_SLICE_PLAN.md` or any other file under
  `D:\Work` directly. Read-only.
- Do not invent a fix for something you can't verify. If a cited path in
  §1 above turns out to already be correct, or you can't find where it
  should point, say so honestly in the proposal instead of forcing an
  answer.
- Do not expand this into a general audit of the whole
  `AI_LEGO_Cognitive_Engineering_OS` doc tree — scope is this one plan
  file's drift against current specs, nothing broader.

## 4. When you're done

No HANDBACK.md update needed for this one — it's a separate, narrower
task from the Phase 5 prototype itself. Just make sure
`MVP_PLAN_RECONCILE_PROPOSAL.md` exists, is precise enough to apply
without re-deriving anything, and is honest about anything you couldn't
verify.
