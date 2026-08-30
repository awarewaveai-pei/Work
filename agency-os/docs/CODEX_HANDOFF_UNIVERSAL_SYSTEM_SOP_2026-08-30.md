# Codex Handoff — Extract a universal "how to build a governed system" SOP from the AI-LEGO project

Written by Claude 2026-08-30. Operator's Claude budget is nearly
exhausted; this handoff exists so Codex can do the heavy reading/synthesis
work autonomously. Output is a new document, low risk — you may write it
directly into `D:\Work` (unlike the Phase 5 code handoff, this is not
executable code touching security-sensitive logic, it's a new standalone
reference document).

## 0. What the operator asked for

She watched the AI-LEGO Cognitive Engineering OS governance process run
for ~2 days across dozens of sessions and found it rigorous — mother
documents, ADRs, a `.ai/proposals/` approval flow, machine-readable specs,
cross-model review gates. She wants that rigor extracted into a **general,
project-agnostic SOP** she can point at for her NEXT system build (she
named `D:\Work\agency-os\docs\HCI` as one example, but the SOP must not be
HCI-specific or AI-LEGO-specific — it must work for "any future system").

## 1. Your job

Produce **one new file**:
`D:\Work\agency-os\docs\operations\GOVERNED_SYSTEM_BUILD_SOP.md`

It must be a **reusable playbook**, not a retrospective narrative about
AI-LEGO. Every pattern you extract must be phrased as "when building any
governed system, do X" — with the AI-LEGO instance cited as the *evidence*
that the pattern works, not as the subject of the document. A future
reader building a totally unrelated system (say, a payments system or a
content-moderation pipeline) should be able to follow this SOP without
knowing what AI-LEGO is.

## 2. Source material to read in full before writing anything

All of this actually happened and is real evidence — do not invent
patterns that sound plausible but aren't grounded in what you read here.

- **`D:\Work\agency-os\WORKLOG.md`, the 2026-08-30 entries from 續1 through
  續30** (search for `## 2026-08-30（續` — read every one of those
  sections in full, not just headers). This is the raw, honest record of
  what actually worked, what broke, and what got caught by review across
  the whole AI-LEGO governance build. Pay special attention to entries
  that describe: a real defect caught by external review, a self-caught
  mistake, a VBC (Verify Before Conclude) failure and correction, and the
  git-index collision incidents.
- **`D:\Work\agency-os\AGENTS.md`** in full — especially §R0 (architect
  mode), §R4 (claim-before-verify), the "補丁判準" (patch-criterion)
  section, §跨模型 oracle (the Claude/Codex division of labor and why),
  and the risk-tiering table.
- **`D:\Work\agency-os\docs\AI_LEGO_Cognitive_Engineering_OS\docs\adr\ADR_INDEX.md`**
  and at least 4-5 individual ADR files linked from it (pick a mix: one
  simple one, one that required a Codex cross-review fix, one that
  resolved a multi-way conflict between documents) — read the actual ADR
  template structure (Context/Decision Drivers/Options
  Considered/Recommendation/Consequences/Migration-Rollback/Evidence).
- **`D:\Work\agency-os\docs\AI_LEGO_Cognitive_Engineering_OS\docs\adr\ADR-006-mother-doc-revision-flow-and-repo-layout.md`**
  in full — the proposal/approval separation this whole project ran on
  (`.ai/proposals/<NNN>-<slug>/PROPOSAL.md`, `status: DRAFT → HUMAN_REVIEW
  → APPROVED → APPLIED`, the absolute rule that the AI can never
  self-approve the final step).
- **`D:\Work\agency-os\docs\AI_LEGO_Cognitive_Engineering_OS\docs\adr\ADR-018-codex-write-authority-and-delegation-exceptions.md`**
  — the Claude/Codex write-boundary rule and why it's structural, not a
  preference.
- **One `.claude/commands/codex-review.md`-style skill file** (find it via
  `Read D:\Work\.claude\commands\codex-review.md` if it exists, or search
  for the skill content referenced in AGENTS.md's §跨模型 oracle) — the
  capture-before-review sequencing and the two mandatory focus-text
  additions, and WHY each exists (both were added after a real failure).
- **`D:\Work\agency-os\docs\AI_LEGO_Cognitive_Engineering_OS\docs\architecture\MACHINE_READABLE_SPEC_PLAN.md`**
  — skim this one (it's long) for the pattern of how a build plan tracks
  BUILT / READY / DEFERRED / BLOCKED status per file, and how a `READY`
  item gets checked against actual downstream usage before being built
  (the "10 typed-objects DEFERRED because grep found zero usage" entry
  near the end is a good concrete example — find and read it).

## 3. Required sections in the output SOP

Structure it as a standalone playbook with these sections (add more if the
evidence supports it, but do not omit these):

### 3.1 When this SOP applies
Be honest about scope: this is for systems that need to survive a long
time, have multiple contributors (human + AI) over time, and where a wrong
architectural decision is expensive to unwind. A weekend prototype does
not need this. Say so explicitly — do not oversell the SOP as universally
required overhead.

### 3.2 The document hierarchy pattern
Extract the "mother documents + machine-readable specs + ADRs" 3-layer
pattern in general terms: one (or a few) authoritative narrative document(s)
for **why** the system is shaped the way it is; a machine-readable layer
that compiles specific, testable contracts FROM that narrative (never
inventing content the narrative doesn't support); a decision-record layer
(ADRs) for anything that required choosing between real alternatives.
State the rule that machine-readable specs must **cite** their narrative
source (file:line or section), never assert unsupported claims — cite the
`decided_by` / `source_of_truth_for` pattern you saw in the real schema
files as the concrete mechanism.

### 3.3 The proposal/approval separation
Extract ADR-006's pattern in general form: any edit to a foundational
document goes through a proposal object with a fixed status lifecycle, and
the AI performing the work can advance the status up to but never
including final approval — approval must be a real, attributable human
action recorded as evidence in the file itself (not left to live only in
chat history). Explain WHY (so a future session with no memory of the
conversation can trust the file state) using real evidence from what you
read, not a generic explanation.

### 3.4 The ADR pattern for real decisions
Extract the ADR template structure and when to use one (a decision between
real, named alternatives with consequences) versus when a plain proposal
suffices (a mechanical correction with only one sane answer). Include the
absolute rule: an AI drafting an ADR marks it `PROPOSED`, never
`ACCEPTED` — only a human's real go-ahead, quoted or dated, flips it.

### 3.5 The cross-model / external review gate
Extract the general principle (a model cannot fully catch its own blind
spots because they share the same generation process) and the concrete
mechanism: capture the diff BEFORE requesting review (not after, to avoid
a rubber-stamp on nothing), two categories of things external review
specifically should be asked to check (hidden dependencies on
config/state not visible in the diff itself, and "did you actually find
something or are you inventing a finding to look useful" calibration), and
land the review's own artifact/evidence in the repo, not just in chat.
Cite the real failure mode you'll find in the WORKLOG (a review tool
returning "approve" without actually being able to read the diff) as why
verifying the reviewer's own process matters, not just trusting its verdict.

### 3.6 The "grep the whole file, not just your edit" discipline
This is the single most common real defect class in the WORKLOG evidence —
extract it as its own numbered discipline: after any edit that changes a
fact/status/value, (a) re-scan the WHOLE file's own summary/description
prose for stale claims about the old state, not just the line you changed,
and (b) grep the rest of the repo for other independent copies of the same
claim. Cite at least 2 real instances from the WORKLOG where this exact
class of bug was caught.

### 3.7 VBC — Verify Before Conclude
Extract the general discipline: before declaring something missing,
broken, or undecided, check whether a different mechanism already covers
it. Cite the real instance where a proposed decision was about to be made
before discovering a more complete, pre-existing design already covered
the same gap.

### 3.8 Multi-agent write-boundary division
Extract ADR-018's general pattern for using more than one AI system on the
same codebase: the one whose actions are governed by automatic safety
tooling should be the sole writer to the governed repo; other
agents/models produce reviewed proposals or build disposable prototypes
elsewhere, with a defined handback format. Give the concrete disposable
workspace pattern (a scratch directory outside the governed repo,
explicit handback notes format) as the mechanism, generalized away from
"Codex" and "D:\tmp" specifically — name them as roles ("the ungoverned
collaborator", "a disposable prototype workspace") so the SOP reads
correctly even for a team using entirely different AI tooling later.

### 3.9 Phase-gate discipline with an explicit human checkpoint
Extract the pattern of splitting a long build into phases with an explicit
human review/go-ahead required between "design/decide" phases and
"build/execute" phases (not just a rubber-stamp continue) — including that
the human being asked to approve should be told concretely what unlocks
(not just "continue?"), so their approval is informed consent, not a
reflexive yes. Cite the real Phase-5-gate conversation pattern as the
concrete example of what a well-formed gate-passage exchange looks like.

### 3.10 A minimal starter checklist
End with a short, concrete "first week" checklist for someone starting a
brand-new system with this SOP: what to create day one (the equivalent of
a mother document + an ADR index + an open-questions register), what NOT
to over-engineer immediately (don't build machine-readable specs for
things nobody has decided yet), and the smallest viable version of each
pattern above for a project too small to justify the full AI-LEGO scale.

## 4. What NOT to do

- Do not copy AI-LEGO's actual file names, schema field names, or
  project-specific vocabulary (e.g. don't mention "Method Atlas" or
  "Execution Contract" as if every future project needs a document with
  that exact name) — extract the SHAPE of the pattern, not its AI-LEGO
  costume.
- Do not present this as mandatory bureaucracy for every project. §3.1
  must give honest scope-limiting guidance.
- Do not invent a pattern that "sounds right" without a real citation from
  the source material in §2. If you believe something is a good idea but
  can't find it evidenced in what actually happened this session, either
  leave it out or clearly label it as "not demonstrated in this project,
  a reasonable extrapolation" — do not blur invented advice with
  evidenced advice.
- Do not write more than roughly 3,000-4,000 words. This should be a
  playbook someone actually rereads before starting a project, not a book.

## 5. When you're done

Run a final self-check: for every section 3.2-3.9, can you point to a
specific WORKLOG entry, ADR file, or schema file (name/date/id) as the
real evidence behind that section's claim? If any section has no such
citation, fix it before finishing — either find the real evidence or cut
the section.

No handback file needed for this one (it's not code, low risk) — just
write the file directly and it's done. If you have real questions or find
the source material contradicts itself, add an honest "Open questions for
the operator" section at the end rather than picking an answer silently.
