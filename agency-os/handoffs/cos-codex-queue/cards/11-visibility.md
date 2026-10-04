# Card 11 — the only ways to read someone else's record: visibility, blind write (foundation F2)

## Decision
Required reading: `STEP34_SHARED_RULES.md` §3. Records of a group and records of other people are readable only through the functions of one module, so a leak has one place to be found. Write before see: a member sees others' records of a blind kind only after writing their own.

## Constraints
- New `COS/ai_lego/platform/visibility.py`. `Viewer` = (tenant_id, identity_id). Functions: `visible(docs, viewer, group_id, kind)` (R1: membership checked here as well, returns only what the kind's `visibility` allows: `members` | `author_only` | `convener_and_author` | `self_and_govern`; a member who left (G3) gets nothing new; a member held `pending_review` sees nothing of others), `is_member`, `is_convener`, role helpers used by later cards (`is_appeal_handler`, `is_eligible_facilitator`, `is_eligible_supervisor` may be stubs returning False until cards 13 and 60; say so in the docstring).
- `DocKind` gains two optional fields (validate in `__post_init__`): `blind: str` (the name of a field of the kind that keys a round) and `visibility: str` (default "members"). A blind kind must have `owner="group"` and a `human_only` author set `{"user"}`. Change `doc_kinds.py` minimally.
- Blind rule: for round value `v`, a viewer sees OTHER members' live records of the kind for `v` only if the viewer has a live record of the same kind with the same field value. The convener is not exempt. Fetching by id goes through the same function. Records the viewer wrote are always visible to them.
- Group docs are written through the existing `CaseDocs.save(tenant, Owner.group(id), kind, content, writer)`; the route layer (card 20 onward) checks membership first.
- Gate tests (reviewed lists, in the style of `test_egress_allowlist_parity.py`): (a) every use of `record_log.person(` and `record_log.group(` in `ai_lego/apps/api/blocks/`, `ai_lego/platform/ai_actions/`, `ai_lego/platform/block_hooks/` is on a list in the test with a one-line reason; the list starts with what exists today (read each use); (b) any module that calls `CaseDocs.current` for an owner that is a group goes through `visibility.visible`; (c) a registry check: every DocKind with `owner="group"` declares `visibility` explicitly or uses the default on purpose (list the defaults).
- Reading is also an act the audit sees: do not add logging here; do not add caching.

## Files
`ai_lego/platform/visibility.py`, `ai_lego/core/domain/doc_kinds.py`, `tests/unit/test_visibility.py`, `agency-os/reports/review-debt.md`.

## Acceptance
`tests/unit/test_visibility.py`, on a real group with three members (use card 10's repository methods and a test-only blind kind registered by the test): blind rule (before writing: nothing of others; after writing: others'; a second round value starts blind again; the convener is blind too; by-id fetch of another's record before writing is refused as not found); each `visibility` value; a left member; a held member; a non-member; tenant isolation; gate tests (a)(b)(c) pass on the real tree and FAIL on a copy where one new unreviewed use is added (build the copy in a temp dir inside the test). Mutations to report: skip the blind check -> red; treat convener as exempt -> red; `members` for everything -> `author_only` test red; drop the left-member check -> red; drop the pending_review check -> red.
