# Build steps 3 and 4 — shared rules (frozen 2026-10-04 before dispatch; changed only by a dated line at the bottom)

Blocks: COLLAB 共同程序, GOVERN (its later half: consent, research, appeals, no-record, account flooding), TEACH 課程與演練,
EXPRESS 產出與表達, FACILITATE 帶領. One wave: the foundation first (§2-§6), then the blocks. Spec of each block = its confirmed
card, rendered as plain text in `docs/platform/step34-cards/<BLOCK>.card.txt` (source of truth: `platform-supervisor.html`
CONTRACTS). Every rule of `BLOCK_BUILD_GUIDE.md` and `STEP2_SHARED_RULES.md` still holds. A line of a card you cannot build:
build the rest, list the line in `docs/platform/STEP34_CHECKLIST.md` with the reason. Operator decision 2026-10-04: nothing goes
live until everything is built; every go-live action (migration apply, deploy, new service) needs her explicit go-ahead.

Storage is PostgreSQL per region (`STORAGE_SWITCH.md`); the foundation's tables are Alembic migration `0002_groups.py`
(raw SQL, downgrade drops them). Tests run on the real PostgreSQL fixture (`tests/pg.py`). Everything below that says
"table" means a PostgreSQL table in the tenant's region.

## 1. Order and owners

1. **Foundation F1-F6 (S, or the one worker S names; all blocks wait for it):** §2 group + membership, §3 visibility, §4
   invitations, §5 roles, §6 consent read path. Two critics + one Codex review (identity, access control, erasure).
2. **Then in parallel (≤5 workers, each its own worktree):** COLLAB, TEACH, EXPRESS (all but its proposal link), GOVERN-later.
   FACILITATE starts when GOVERN's appeals (§9) and TEACH's completion record (§11) are on main; EXPRESS's proposal link
   when COLLAB's `collab.proposal` kind (§7) is on main.
3. One full engine + web + collect run at the very end of the wave, once.

File ownership (one owner per file, as in step 2):

| Owner | Files |
|---|---|
| S (foundation) | `record_log.py` (OWNER_KINDS), `doc_kinds.py` (owner "group", `blind`, `visibility`), `case_docs.py` + new `platform/visibility.py` (the only readers of others' records), `ai_gate.py`, `block_hooks/__init__.py`, `apps/api/blocks/groups.py` (group, member, invite routes), `platform/identity/store.py` (invites, roles), `ai_lego/data/migrations/versions/0002_groups.py`, `main.py`, `lib/blocks.ts`, `BlockShell.tsx`, `kinds/assembler.py` |
| COLLAB | `kinds/collab.py`, `ai_actions/collab.py`, `block_hooks/collab.py`, `apps/api/blocks/collab.py`, `platform/rulesets/collab.py`, page `CollabPage.tsx` + route, `tests/unit/test_block_collab.py`, `docs/platform/STEP34_CHECKLIST.md` (its own section) |
| GOVERN-later | `kinds/govern_group.py` (consent, appeal, research, no-record kinds), `ai_actions/govern.py` (add), `block_hooks/govern.py` (add), `apps/api/blocks/govern_group.py`, `platform/research_export.py`, `platform/rulesets/govern.py` (add versions), page `GovernPage.tsx` sections + routes, `tests/unit/test_block_govern_group.py` |
| TEACH | `kinds/teach.py`, `ai_actions/teach.py`, `block_hooks/teach.py`, `apps/api/blocks/teach.py`, `platform/rulesets/teach.py` (loads the lesson files), `platform/lessons/` (YAML content + loader + generator), page `TeachPage.tsx` + route, `tests/unit/test_block_teach.py` |
| EXPRESS | `kinds/express.py`, `ai_actions/express.py`, `block_hooks/express.py`, `apps/api/blocks/express.py`, `platform/exports/` (formats), page `ExpressPage.tsx` + route, `tests/unit/test_block_express.py` |
| FACILITATE | `kinds/facilitate.py`, `ai_actions/facilitate.py`, `block_hooks/facilitate.py`, `apps/api/blocks/facilitate.py`, `platform/rulesets/facilitate.py` (loads the script files), `platform/scripts/` (YAML 帶領稿 + loader), page `FacilitatePage.tsx` + route, `tests/unit/test_block_facilitate.py` |

## 2. The group

- `record_log.OWNER_KINDS = ("case", "person", "platform", "group")`; `Owner.group(group_id)`; `DocKind.owner` may be `"group"`.
- Tables (migration 0002), all with `tenant_id`, all queries tenant-scoped:
  - `platform_groups(group_id pk, tenant_id, workspace_id, purpose in ('decision','class','workshop','research'), name ≤120, created_by_identity_id, status in ('open','closed','erased'), created_at, closed_at)`
  - `group_members(group_id, tenant_id, identity_id, role in ('convener','participant','facilitator'), joined_at, left_at, pk(group_id, identity_id))`
  - `group_invites(invite_id pk, tenant_id, group_id, role, token_hash unique, inviter_identity_id, created_at, expires_at, used_at, used_by_identity_id, revoked_at)`
  - `identity_roles(identity_id, role in ('appeal_handler'), granted_by, granted_at, revoked_at)`
- A group belongs to a workspace (ARCH_DECIDED: group records live at the workspace level). Same-tenant only: a group never
  holds a member of another tenant (data residency is per tenant).
- Invariants, each with a test that fails on a naive implementation:
  - **G1** A group record is written only while the group exists and is open: `require_group(connection, tenant, group)` inside
    the writer's own transaction, taking the same shared per-(tenant, group) lock the erase takes exclusive (`CASE_ERASED`'s
    twin: `GROUP_CLOSED` / `GROUP_ERASED`). Kinds flagged `after_close=True` (reviews) may be written to a closed group.
  - **G2** Every group route resolves membership first. A non-member gets exactly the answer of a missing group (404, the same
    body): the group's existence is not disclosed.
  - **G3** A member who left reads nothing new and writes nothing; what they wrote earlier stays, they may export or delete it.
  - **G4** Erasing a group removes every group-owned record and every consent naming it, in one region transaction; members'
    own cases and person records are untouched. The convener erases; nobody else.
  - **G5** A group has ≥1 convener at all times; the last convener cannot leave (they close or hand over first).

## 3. Visibility: the only ways to read another person's record

Three read paths exist, all in `platform/visibility.py`; nothing else may call `CaseDocs.current` for an owner that is not the
caller's own case or person record:
- **R1 `visible(viewer, group, kind)`**: group-owned records. Kinds declare `visibility`: `"members"` (default), `"author_only"`,
  `"convener_and_author"`, `"self_and_govern"` (the participant's place: `collab.place`). Only a current member reads.
- **R2 `shared_with(viewer, grantee)`**: records of someone's own CASE, only through a live consent (§6).
- **R3 own records**: a person's own person-owned and case-owned records, through the routes that already check the owner.
- **Blind write (write before see)**: a group kind may declare `blind="<field>"`; a viewer sees OTHER members' records of that
  kind for round value `v` only when the viewer has a live record of their own with the same `<field>` value. The convener is
  not exempt. A route that lists such a kind never returns another member's record by id either.
- Gate tests (reviewed lists, like the dynamic-import list in `test_egress_allowlist_parity.py`): (a) every use of
  `record_log.person(` / `record_log.group(` in `apps/api/blocks`, `platform/ai_actions`, `platform/block_hooks` is on a
  reviewed list with the reason it is the caller's own or a membership-checked group; (b) a route that returns group records
  calls `visibility.visible`; (c) a mutation that skips the blind rule turns the blind test red.

## 4. Invitations (auth: two critics)

- No open signup exists and none is built. People join a group only by an invitation of someone already in it (convener,
  or facilitator for `class`/`workshop`), inside the inviter's own tenant.
- `token = secrets.token_urlsafe(32)`, only `sha256(token)` stored, shown once to the inviter as a link they copy and send
  themselves (the engine sends no mail). Single use, expires in 7 days, revocable, at most 25 open invitations per group and
  10 created per identity per day (the limit is a rule in `platform/rulesets/govern.py`, versioned).
- Accepting: a logged-in identity of the same tenant joins; a visitor creates an identity (same tenant, email + password through
  the existing `IdentityStore.create_identity`, password rules unchanged) in one transaction with marking the invite used.
  A used, expired, revoked or wrong-tenant token answers one generic 404 (no reason revealed). Constant-time compare.
- Account flooding (GOVERN contract, "one person many accounts"): no real-name check. Each identity stores `invited_by`; more
  than 5 identities accepted from one inviter's invitations within 24 hours are held `pending_review` (cannot see others'
  records, cannot be counted in §8's agreement) until the convener confirms each. Deterministic, no model. The held state is
  shown in plain words to the convener and to the held person.

## 5. Roles

- `appeal_handler` is the only granted role (`identity_roles`, granted by the operator through a CLI in `ai_lego/apps/cli/`,
  never through a web route). Facilitator and supervisor eligibility are DERIVED from records, never granted: facilitator =
  a `teach.completion` of the facilitator course exists; supervisor = facilitator + at least one `facilitate.log`.
- A role check is one function in `platform/visibility.py`; no block re-implements it.

## 6. Consent (`govern.consent`, person-owned, versions kept)

`{purpose: "group"|"facilitator"|"research", target: <group_id | facilitator identity_id | study id>, items: [{project_id, kind, doc_id}], withdrawn: bool}`.
- R2 returns only the latest version of the items a live consent lists, only to a current member of the target group (or the
  named facilitator of a group the person is in), only while `withdrawn` is false. Withdrawal acts at the next read.
- The person decides item by item; nothing is shared by default; a new version of a shared doc is shared only if the consent
  lists the doc id (a copy is a pointer: the consent names the doc, not a snapshot, and the reader sees the doc's current
  version only when the consent says `follow_versions: true`, otherwise the version number it names).
- `research` consent is not a read path. It is consumed only by `platform/research_export.py` (§10).

## 7. COLLAB's group kinds (frozen shapes; fields beyond these are the block's own)

All `owner="group"`, writers as stated, none carries a score, rank or rating key (refused by the existing gate).

| Kind | Author | Fields | Rules |
|---|---|---|---|
| `collab.question` | user (convener or any member), versions kept | `text`, `round` | the problem the group decides; different wordings are all kept |
| `collab.place` | user | `where` | `visibility="self_and_govern"` |
| `collab.position` | user | `round`, `text`, `confidence?` | `blind="round"`; `human_only` |
| `collab.change` | user | `round`, `after_reading` in ('no change','changed'), `what` | `blind="round"` |
| `collab.interface_answers` | user | `round`, `answers: [{q, text}]` for the six questions of INTERFACE_Q | `blind="round"`; every answer kept |
| `collab.option` | user | `text`, `evidence_refs?`, `risks?`, `values_tradeoff?` | side by side, no ranking |
| `collab.stance` | user | `option`, `stance` in ('同意','異議'), `reason` | one live per (member, option); an objection is never overwritten by a vote count |
| `collab.dissent` | system, from objections | `option`, `member_label`, `reason` | kept; shown with the label the member chose (§9 anonymity) |
| `collab.authority` | user | `to`, `scope`, `revoked_by: [identity_id]` | revoking removes only the revoker's share; the scope shown is recomputed from the members still granting |
| `collab.closing` | user (convener) | `why_end`, `reopen_if`, `review_on`, `owner` | all four required |
| `collab.reopen` | user | `reason` | any member; reopening is never refused by the convener |
| `collab.restatement` | ai | `about`, `text` | visible to others only after `about` confirmed it; "說錯了" stops the AI turn and hands control back |
| `collab.proposal` | user (from EXPRESS) | `express_draft`, `text` | the proposal a draft becomes inside a group |
| `collab.consequence` | user | `decision`, `observed` | written back, read by the next round |

COLLAB reads other members' CASE records only through R2 (§6); it never reads a case that was not consented.

## 8. "How the group sees it" (the display rule, deterministic, tested)

`platform/rulesets/collab.py` holds the rule text and version; `apps/api/blocks/collab.py` the pure function `agreement(stances, history)`:
no vote counts decide anything. An option is shown as "agreed across the group" only when members who disagree with each other on
other options (clusters from the group's own stance history, 2-means on the agreement vectors, ties broken by member id) both
agree; the same table is recomputed without the top 10% heaviest raters and both are shown. Members `pending_review` (§4) are
excluded and the page says so. Fewer than 3 members or no history: the page says "還不夠看出誰跟誰不同", it shows no "agreed".

## 9. Appeals and anonymity (GOVERN)

- `govern.appeal` is `owner="platform"` (id = the tenant), authored by the participant: `{group_id, about_identity_id, text, named: bool}`.
  Anonymous by default (`named=false`): readers other than the author see no identity. The record's writer identity stays in
  the event (the author must be able to export and delete their own appeals: R3 by writer), it is masked by the read path.
- Readers: the author (own); `appeal_handler`s of the tenant; the derived supervisor of `about_identity_id`
  (`facilitate.supervision` links them). Never the facilitator they are about. The same appeal is one record read by all of them.
- Every reader class has a test that the facilitator-about reads nothing, and a mutation removing the mask turns it red.
- A participant's objection to a facilitator (FACILITATE card) is exactly this record.

## 10. Research export and "no record" (GOVERN)

- `platform/research_export.py` takes a study id; includes only items of live `research` consents; removes the account and the
  three places (where it happened, where you are, where each party is), never the content; keeps cases that did not change,
  failed, or withdrew (a `withdrawn` consent after export is listed in a manifest line, the data stays out of the next export);
  facilitator drift records come in only when the facilitator and those participants all consented (FACILITATE card). It writes a
  JSONL file plus a manifest of what was left out and why. It never calls itself anonymous.
- No-record option: `assembler.intake.no_record = true` (set when the case is opened) erases the whole case when the person closes
  it (the existing erase), keeps no person-level history of it, and the page says plainly there is no export afterward.
  Device-only mode is NOT built (client-side store); recorded in `STEP34_CHECKLIST.md`.
- High-risk guardrails and crisis resources stay as in step 1; resources for a place are collect lookups (§12), never engine data.

## 11. TEACH, EXPRESS, FACILITATE records (frozen shapes)

Content is FILES, not records (diffable, reviewed, versioned like the other rule lists): lessons, practice cases and
facilitator scripts live as YAML under `ai_lego/platform/lessons/` and `ai_lego/platform/scripts/`, loaded into `Ruleset`s
(`teach.lessons`, `teach.practice_cases`, `facilitate.scripts`) whose fingerprints are recorded in each folder's `HISTORY.json`
(a changed text without a new version fails the same test the other rulesets use). A person's work with them is records:

| Kind | Owner | Author | Fields |
|---|---|---|---|
| `teach.run` | person | user | `lesson`, `lesson_version`, `practice_case`, `role` in ('提出者','反方','證據稽核者','決策者','回顧者'), `notes` |
| `teach.aar` | person | user | `predicted`, `happened`, `missed_context`, `change_next_time` |
| `teach.completion` | person | system | `course`, `lesson_versions`, `at` — written only when every required lesson of the course has a `teach.run` |
| `express.selection` | case | user | `items: [{project_id, kind, doc_id}]` — the ONLY input of an outline |
| `express.draft` | case | ai or joint | `format`, `reader`, `sentences: [{text, refs: [{kind, doc_id}], unchecked: bool, author in ('ai','user')}]` |
| `express.sent` | case | user | `draft`, `version`, `to` — only the person's own act writes it |
| `facilitate.log` | person | user | `group_id`, `script_version`, `followed`, `deviated: [{what, why}]` |
| `facilitate.supervision` | person | user (supervisor) | `supervisee`, `feedback`; supervisor eligibility checked (§5) |

Lesson file shape: `{id, subject (tool or package id), version, state: draft|reviewed, minutes ≤5, title, text, example, teaches: [..]}`;
a `draft` is shown with the word 草稿 and can never be a facilitator's script. Practice case: `{id, version, title, text, source:
{kind: publisher|source_card, name, checked_on}, place}` (a case whose source is not recorded is refused by the loader). Script:
`{id, subject, version, steps: [{what, minutes, dont: [..], stop_signals: [..]}]}`; a subject with no `stop_signals` in any step is
not offered to participants (research plan R21), the loader reports it.

AI actions of these blocks: `needs` is an existing permission; every action lists exactly the card's 「讀什麼」 in `reads`; nothing
is saved as the person's own words; an AI sentence in a draft carries `author:"ai"`; the person's own send is the only way a
draft leaves the system.

## 12. Outside data

Anything a block needs from outside (crisis resources per place, lesson source checks, translations) is asked of collect: a new
`kind` in `specs/wire/lookup.v1.json` (→ v2 with both sides built together), never engine code, never a new host. The engine's
allowlist stays exactly the AI provider and collect.

## 13. Lessons and scripts content

Lessons are drafted automatically from each tool's page text and example (a generator in `platform/lessons/`, run by the
operator, output YAML files with `state: draft`); a person reviews before `reviewed`. Until then the page says 草稿.
The 90-second manipulation-technique mini-lessons are content cards for the operator (sources: the addendum A14 reading list);
the engine builds the place for them, it does not invent their text. `facilitate.script` seeds come from the art-reflection
tools' 「帶活動者提示用語」 and 「停止活動訊號」 columns (an import card; rows with an empty stop signal are listed, not guessed).

## 14. The ten process indicators (GOVERN research, COLLAB records)

Presence facts computed per case from records, never a score, never compared across people: dissent kept; reopen condition
written; review held after the decision; each participant restated another's position correctly (the other confirmed it);
share of claims that carry a source; facts, law and values talked about separately; assumptions stated; evidence conditions
stated; trust in AI calibrated (the person overrode or accepted with a reason); modules chosen, adjusted or switched off for a
reason. A function per indicator in `platform/indicators.py`, each returning `{present: bool, evidence: [record refs]}`.

## 15. Reviews and verification (per commit)

One critic per commit; **two critics plus Codex** for §2-§6 and §9-§10 (identity, access control, erasure, consent, appeals,
research). Every guard: a test and a mutation that turns it red. Every class: a gate test. Verify-clear in its own command before
each commit. Full run once at the end of the wave.

## 16. Done (per block)

Every card line built or listed in `STEP34_CHECKLIST.md`; the block's tests plus `test_block_foundation`, `test_record_log`,
`test_step2_foundation` green on PostgreSQL; `npx tsc --noEmit` and the block's vitest; a page walk at 1280 and 400 wide with no
page error; the supervisor page updated.

## Decided now (S, under her delegation 2026-10-03; the ruling of 2026-10-04 on storage)

- A group is same-tenant; cross-tenant groups are not built (residency per tenant).
- No open signup; invitations only; held accounts instead of a real-name check.
- Consent names documents, never copies; withdrawal is immediate.
- Appeals are platform-owned, anonymous by default, never readable by their subject.
- "No record" = the case erases itself at close; device-only is not built.
- All outside data is collect's.
- 2026-10-08 (card 10): the groups' migration is `0005_groups.py` (0002-0004 are the storage port's). `group_members.review_state`
  ('confirmed' | 'pending_review') holds §4's held state. G5's hand-over is `POST /groups/{id}/members/{identity_id}/convener`; the
  last convener cannot leave a closed group either (only a convener erases it). An account erasure removes the person's memberships
  and every group record they wrote, and is refused while they are a group's only convener (ACCOUNT_IS_LAST_CONVENER). In a group,
  only the person who wrote every version of a document deletes it (also after leaving: G3).
- 2026-10-08 (card 12): `identity.invited_by` is migration `0006_identity_invited_by.py`. An invitation brings a participant or a
  facilitator (a convener only by hand-over); a facilitator invites participants of a class or workshop; someone held for review
  invites nobody. The flooding count is the distinct accounts that used one inviter's invitations in the window (visitors and
  signed-in alike), its numbers in `govern.invites`. An account erasure removes the invitations it made or used and every
  `invited_by` naming it. Accepting does not sign the visitor in.
- 2026-10-08 (card 13): a consent item is `{project_id, kind, doc_id, version?}` -- `version` is what a consent that does not follow
  versions names, checked on save; a group consent must name a group the person is in. `shared_with(docs, repo, viewer, kind, id)`
  reads consents of the group's other current members for a confirmed member, or, for a facilitator, of people in a group where
  the viewer is a current facilitator. `is_appeal_handler(store, viewer)`. An account erasure removes the person's identity_roles.
