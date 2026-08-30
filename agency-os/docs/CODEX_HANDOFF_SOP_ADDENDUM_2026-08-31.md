# Codex Handoff — Add the missing "how to plan a single task" layer to GOVERNED_SYSTEM_BUILD_SOP.md

Written by Claude 2026-08-31. This is a follow-up to
`CODEX_HANDOFF_UNIVERSAL_SYSTEM_SOP_2026-08-30.md` (which produced
`agency-os/docs/operations/GOVERNED_SYSTEM_BUILD_SOP.md`, committed
`fa92c54ff`). That SOP is real and evidence-backed, but the operator asked
a pointed question after reading it: "if a future AI had only this SOP
(plus a generic senior-engineer system prompt), could it produce plans as
good as Claude's — as correct, complete, and efficient?" The honest
answer is no, and the reason is a scoping gap in the ORIGINAL handoff, not
an execution failure: §2 of that handoff told you to read `AGENTS.md`'s
R0 (architect mode), the 補丁判準 (patch-criterion) section, the
跨模型 oracle section, and the risk-tiering table — but §3's required
section list (3.1–3.10) never gave that material a section to land in.
You followed the section list faithfully; the gap is that the list itself
was incomplete. This handoff exists to close that gap.

## 0. Same rules as last time (do not skip)

Same governance this whole repo runs on:
`docs/adr/ADR-018-codex-write-authority-and-delegation-exceptions.md` —
you may write this addendum's content directly into `D:\Work` (this is a
new reference document, not executable code touching security-sensitive
logic — same low-risk classification as the original SOP task). Every
substantive claim must trace to a real file you actually read — grep to
confirm a line/section exists before citing it; do not invent a line
number. If you cannot find real evidence for something that sounds
plausible, say so in an "Open questions" section instead of asserting it.

## 1. Your job

Produce **six new sections** and merge them into the existing
`D:\Work\agency-os\docs\operations\GOVERNED_SYSTEM_BUILD_SOP.md`, inserted
as new `## 10`–`## 15` (renumber the current `## 10. 第一週最小啟動清單`
to `## 16`, and update its Day-by-day content to reference the new
sections where relevant — e.g. Day 1 should mention adopting the per-task
planning gate and risk-tiering from day one since they cost nothing to
start; the four-action verification discipline belongs in whichever day
first produces a committed contract change). Keep the existing 10
sections' text and citations untouched except for that renumbering and
the Related Documents / Evidence-boundary footer, which stays last.

Same voice and density as the existing sections: 1–3 short paragraphs per
section, each substantive paragraph ending in a
**實證出處：** line with real file/section citations. Do not pad — every
paragraph must earn its place with a citation, the same standard the
existing document already holds itself to. The original document had a
soft 3,000–4,000 word cap for the initial 10 sections; this addendum adds
genuinely new scope, so exceeding that combined total is fine, but stay
as terse as the existing sections — this is a playbook people reread, not
an essay.

## 2. Source material to read for each new section

All real, all in `D:\Work`. Grep for the section headers named below
rather than trusting any line number in this handoff — line numbers drift.

### §10 — A minimal per-task planning gate (not just for ADR-worthy decisions)

Read `agency-os/AGENTS.md` §R0 in full (search for `### R0：架構師模式`).
Extract the seven-block pre-approval output pattern in general form: before
touching any file for a non-trivial task, produce (1) what the real
problem is, not just the surface symptom, (2) what you actually read about
the current state — including checking recent history/logs for
already-in-flight work on the same issue, to avoid duplicate work, (3) a
risk list, (4) at least two real options with tradeoffs (not one option
dressed as a foregone conclusion), (5) a recommendation with a reason,
(6) concrete implementation steps, (7) a verification plan. State clearly
that this is scaled by the risk tier (§13) — a Low-risk doc fix does not
need the full seven blocks spelled out, but should still implicitly clear
each one; a Medium/High-risk change should make all seven explicit and
wait for confirmation before executing.

Find a real WORKLOG entry that actually exercises something close to this
full structure (search `WORKLOG.md` for entries containing multiple of
`[已修改]`, `[驗證結果]`, `[剩餘風險]`, `[rollback]` together, and for the
`方案` / `選項` comparison language) to cite as evidence this isn't just a
rule that exists on paper. If you cannot find one real WORKLOG instance
that shows the *comparison-of-options* half specifically (as opposed to
just the after-the-fact reporting blocks), say so honestly in this
section rather than force-fitting a citation — the ADR files
(`ADR-014`, `ADR-017`) are a legitimate fallback citation for the
options-comparison habit since ADRs are exactly this pattern applied to
bigger decisions.

### §11 — Verification is four independent actions, not a review-gate side effect

The existing §5 (cross-model review) and §6 (stale-claim scan) each cover
one piece of a larger discipline that deserves its own name. Read
`agency-os/AGENTS.md`'s R0 `[驗證計畫]` requirement (search
`四個動作，缺一視為不合格`) and R4's `[驗證計畫] 四動作落實檢核` section.
Extract the general pattern: any change to working logic needs (a) a REAL
execution/observation of the new behavior, not just a read-through, (b) an
independent review pass, (c) a cross-file check that nothing else now
contradicts the change, and (d) a durable, dated record of what was
actually verified — not a chat-only claim. Name the anti-pattern directly:
"I read the code and it looks correct" is not verification. Cite at least
2 real `REALTEST_EVIDENCE:` / `REVIEW_DONE:` / `BUGHUNT_DONE:` lines from
distinct WORKLOG entries (search `WORKLOG.md` for `REALTEST_EVIDENCE:`) as
concrete evidence this produces real, checkable artifacts, not prose.

### §12 — When the same defect class recurs, stop and find the invariant before the third fix

Read `agency-os/AGENTS.md`'s 補丁判準 paragraph (search `補丁判準（提方案前自問`)
and the rule below it about a reviewer flagging the same code twice
(search `同一 reviewer 對同一段程式碼連續回報 2 次`). Extract the general
discipline: patching the specific instance reported is fine the first
time; if the same class of defect gets flagged again, the next fix must
first answer "what is the invariant this whole class of problem violates,
and does my fix close the class or just this one instance?" — and if it
only closes the instance, that must be said out loud and approved, not
silently done anyway. Find the real example: search `WORKLOG.md` for the
2026-08-24 ORACLE-gate deletion-tracking rounds (search `連續打回 8 輪` or
`round 1–8`) as the canonical "kept patching instances until forced to do
invariant analysis" cautionary case, AND find a case where the invariant
check was done proactively and caught real scope — search `WORKLOG.md`
续26 (2026-08-29) for `唯二兩處，非普遍系統性錯誤`, where a critic-found bug
was traced to confirm exactly how many other real instances existed
before declaring the fix complete, rather than assuming the one reported
instance was the whole problem.

### §13 — Calibrate process weight to risk, and know the rule-priority order

Read `agency-os/AGENTS.md`'s 操作風險分級 table (search `## 操作風險分級`)
and the 規則優先序 section (search `## 規則優先序（衝突裁決`). Extract two
general patterns: (1) a three-tier risk classification (roughly:
low-blast-radius/reversible → act directly and state assumptions;
real-logic/new-dependency/auth-adjacent → propose then wait for
agreement; production/irreversible/credentials/money → stop and wait for
explicit go-ahead) so that ceremony scales with actual risk instead of
being uniformly maximal (slow and expensive) or uniformly minimal
(unsafe); (2) when written rules conflict (e.g. "always ask before
editing" vs. "an already-authorized routine says act automatically"), a
fixed precedence order resolves it — pre-authorized routine actions beat
risk-tier defaults, which beat a generic default-to-caution rule. Cite the
real rule text directly as evidence (this is a primary-source policy
pattern, not something that needs a WORKLOG anecdote — say so plainly
rather than manufacturing one).

### §14 — Briefing another agent/tool: five required elements, verify what comes back

Read `agency-os/AGENTS.md`'s Subagent 交接協議 section (search
`### Subagent 交接協議（強制）`). Extract the general pattern for handing
work to any other agent, tool, or less-trusted collaborator: a brief
missing any of (1) the actual problem stated with concrete evidence
locations, (2) what's already known, (3) what's already been ruled out
and why, (4) the expected output shape, (5) explicit boundaries of what
NOT to touch, is a low-quality brief and its output should not be trusted
without extra scrutiny. Equally important: whatever comes back must be
independently checked (do the cited locations actually exist? does the
suggested change match neighboring conventions? does "probably" or
"likely" appear anywhere without evidence backing it?) before being acted
on — receiving a confident-sounding answer is not the same as verifying
it. If you can find a real WORKLOG instance where a returned finding was
checked and turned out to need correction (or where accepting one
uncritically caused a problem), cite it; otherwise state this section's
evidence is the policy text itself plus this very addendum's own
predecessor task as a live example: read
`D:\tmp\ai-lego-phase5-prototype\CLAUDE_NEXT_TASKS.md`'s opening
paragraph (read-only, do not edit it) — it records Claude independently
re-running the test suite and spot-checking one of the reported gap
claims against real files, rather than accepting the returned
`HANDBACK.md` report at face value, before deciding what to hand back
next. Confirm that paragraph still says this before citing it.

### §15 — Session and context cost discipline

Read `agency-os/AGENTS.md`'s `## Session 衛生（context 成本，2026-08-20 起）`
section in full. Extract the general pattern: every prior turn gets resent
on every subsequent turn, so context spent early is paid for repeatedly;
the two highest-leverage habits are (a) one coherent task per working
session/thread, closing out state to durable files rather than leaving it
live only in conversation, and (b) reading the file you are about to
modify or are responsible for in full (not a fragment) while using
targeted search/delegation for simple existence checks or wide scans
across many files. Cite the two real incidents already named in that
section (search `check-smoke-tests.ps1` for the fragment-read miss, and
search `120KB` for the raw-output-cost example, three raw `codex exec`
calls on 2026-08-20) as concrete evidence of what each habit's absence
actually cost.

## 3. What NOT to do

- Do not renumber or edit the existing §1–§9 content or their citations —
  they were independently verified once already (`REVIEW_DONE: critic=Quick`
  in `WORKLOG.md`'s 2026-08-31 entry); only the checklist section (old §10)
  gets renumbered and lightly updated.
- Do not invent a WORKLOG citation. If a section's ask above says "if you
  cannot find one, say so honestly," take that seriously — an honest gap
  note is more valuable to this document than a plausible-sounding but
  unverified citation, and this document's own §7 (VBC) and Evidence
  boundary section exist specifically to prevent that failure mode.
- Do not use AI-LEGO-specific vocabulary in the new sections' general
  statements (same rule as the original handoff's §4) — the evidence
  citations naming real AI-LEGO files are fine and expected; the pattern
  descriptions themselves must read as domain-agnostic.
- Do not touch anything outside this one file plus the required
  Related-Documents/doc-sync bookkeeping the original SOP task already
  used (`doc-sync-automation.ps1`) — no code, no other docs' substantive
  content.

## 4. When you're done

Same self-check as the original task: for each of §10–§15, can you point
to a specific AGENTS.md section (by searchable header text, not a line
number you didn't verify) and, where asked for one, a real WORKLOG entry
or file, as the evidence behind that section's claim? If any section
lacks that, fix it or add an honest "Open questions for the operator" note
— do not leave a section with a citation you're not sure is real.

No handback file needed (same reasoning as the original: low risk,
doc-only, not code) — write directly into
`agency-os/docs/operations/GOVERNED_SYSTEM_BUILD_SOP.md` and it's done.
