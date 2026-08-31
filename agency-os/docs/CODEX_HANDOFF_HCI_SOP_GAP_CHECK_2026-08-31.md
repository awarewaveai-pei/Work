# Codex Handoff — Check the HCI blueprint against GOVERNED_SYSTEM_BUILD_SOP.md

Written by Claude 2026-08-31. This is the first real test of the
generalized governance SOP against a system it wasn't written from
(AI-LEGO was the evidence source; HCI is a different, unrelated system).
Operator wants to know, before HCI's architecture work starts in earnest,
whether the blueprint already covers what the SOP recommends or whether
something should be added now while it's cheap to add.

## 0. A path note before you start

`agency-os/docs/HCI_AI_LEGO_Blueprint_v2/` has been moved (uncommitted, in
the working tree only) to `agency-os/docs/HCI/HCI_AI_LEGO_Blueprint_v2/`.
Read from the new path. If by the time you run this it's moved again or
committed somewhere else, find it with a fresh search rather than trusting
this note — don't fail silently on a stale path.

## 1. Read fully before writing anything

1. `agency-os/docs/operations/GOVERNED_SYSTEM_BUILD_SOP.md` — all 17
   sections plus the Evidence boundary. This is the yardstick; don't
   reinterpret or soften its patterns.
2. Every file under `agency-os/docs/HCI/HCI_AI_LEGO_Blueprint_v2/`
   (`00_README.md` through `23_CURRENT_INFRASTRUCTURE_SOURCE_OF_TRUTH.md`
   plus `manifest.json`) — the operator's stated intent is that HCI
   architecture work in the future starts from just `00_README.md`, so
   pay attention to whether `00_README.md` itself actually points a
   reader to everything else, or whether that routing is missing/implicit.
3. If `agency-os/docs/HCI/HCI_AI_LEGO_Blueprint_v1/` or
   `HCI30_RESEARCH_REVIEW/` still exist alongside v2, skim them only
   enough to tell whether v2 fully superseded them or whether some
   decision/rationale only lives in v1 and was never carried into v2 —
   don't do a full v1 review, that's out of scope.

## 2. The check, section by section

For each of the SOP's §1-17, answer three things about the HCI v2
blueprint, with real file/section citations (not impressions):

1. **Does an equivalent already exist?** Cite the specific HCI file and
   section if yes.
2. **If yes, is it actually consistent with the SOP's pattern**, or does
   it look similar but skip something load-bearing (e.g. it has "decision"
   sections that read like ADRs but never separate PROPOSED from a real
   human go-ahead)?
3. **If no, is this a real gap for HCI's actual stage**, or is it
   correctly not-yet-needed per the SOP's own §1 scoping (e.g. HCI may be
   too early for machine-readable specs if nothing has been decided to
   build yet — don't flag "missing spec compiler" as a gap if there's
   nothing real to compile from yet)?

Pay specific attention to these, since they're the ones most likely to be
silently missing in a pure-documentation blueprint that hasn't started
implementation yet:

- §3 proposal/approval separation and §4's ADR pattern — does HCI have
  any mechanism, even a lightweight one, for recording a real decision
  between named alternatives with a human go-ahead, or does everything
  currently live as narrative prose with no decision record at all?
- §10's per-task planning gate and source-routing — is there anything in
  HCI telling a future contributor (human or AI) which of the 24 files is
  authoritative for which kind of question, or would someone have to read
  all 24 to find out?
- §13's risk tiering — does HCI distinguish "this is settled" from "this
  is still open" anywhere, or is everything written in the same declarative
  voice regardless of how settled it actually is?
- §16's mechanical-enforcement pattern — this one is almost certainly not
  yet applicable (HCI likely has no CI/build pipeline yet), so don't
  invent a gap here; just confirm that's the reason, not an oversight.

## 3. Also check the reverse direction — does HCI have something better than the SOP?

The SOP was extracted from AI-LEGO's evidence only. HCI is a second, unrelated
system, so it may have independently developed a sharper version of a
pattern the SOP states only loosely — that's valuable signal, not just
noise to filter out.

For each SOP section where HCI has an equivalent (from §2's check), also
ask: **is HCI's version more complete, more concrete, or more rigorous
than the SOP's current text?** Concretely — does it handle an edge case
the SOP doesn't mention, state a clearer decision rule, or give a sharper
worked example? If yes, note it as a candidate addition: cite the exact
HCI file/section, quote or closely paraphrase the stronger part, and say
which SOP section it would improve and how. Apply the same discipline as
everything else here — only propose this if the HCI material is genuinely
more developed, not merely different in wording. If nothing in HCI clears
that bar, say so plainly instead of manufacturing a marginal suggestion.

List these separately in the report under "Candidate SOP improvements
found in HCI" — this is a distinct output from the gap list in §2, don't
merge them.

## 4. What NOT to do

- Do not edit anything under `agency-os/docs/HCI/`. Read-only.
- Do not write into `D:\Work` at all for this task — write your report to
  `D:\tmp\hci-sop-gap-check\HCI_SOP_GAP_REPORT.md` instead (create the
  directory). A future Claude session reviews it and decides what, if
  anything, gets added to the real HCI docs.
- Do not recommend adopting every SOP section regardless of fit — the
  SOP's own §1 and Evidence boundary are explicit that not every project
  needs the full weight of every pattern. If HCI is pre-decision,
  pre-implementation, say which sections are premature right now and
  when they'd become relevant (e.g. "§3/§4 become relevant once the first
  real architectural choice between named alternatives is made").
- Do not grade HCI's writing quality or completeness in general — scope
  is strictly "against the SOP's governance patterns," not a general
  document review.

## 5. Output format

`HCI_SOP_GAP_REPORT.md`, two separate sections:

1. **HCI gaps against the SOP** — one row per SOP section (§1-17) with
   Present/Partial/Not-yet-applicable/Missing, the citation backing that
   call, and — only for Missing or Partial — a concrete, minimal
   recommendation of what to add and where (which HCI file, roughly what
   content), not a vague "should add governance."
2. **Candidate SOP improvements found in HCI** — per §3 above, each entry:
   which SOP section, the HCI citation, what HCI does better, and a
   proposed sharper sentence/example to add to that SOP section. Empty
   (explicitly say "none found") if nothing clears the bar.

End with a short summary: of the 17 SOP sections, how many are real HCI
gaps worth acting on now versus correctly deferred given HCI's current
stage, and how many candidate SOP improvements were found.
