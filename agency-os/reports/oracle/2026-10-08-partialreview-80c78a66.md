# codex-oracle review -- 2026-10-08 14:18:24 +08:00

- mode: `review`
- scope: whole repo
- target: `8567da9bf..5dbff71c0`
- context: Steps 3+4 cards 10-13 of the Cognitive Sovereignty Platform (PostgreSQL engine): groups as an owner kind (G1-G5, migration 0005, tenant in every FK, require_group under the group lock), visibility.py as the only reader of group records (four visibility values, blind write, no convener exemption), invitations (sha256 token, constant-time match, one transaction, same 404 for every refusal, flooding hold), consent naming documents (before-save ownership hook), roles derived from records except appeal_handler (grant_role CLI). Spec: docs/platform/STEP34_SHARED_RULES.md and step34-cards/COLLAB.card.txt, GOVERN.card.txt. Report ONLY: a person seeing or changing data they should not (another member's blind record, a non-member, another tenant, a held/left person), consent or invitation bypass, erasure leaving a person's group records, a card line broken, or CI/main path broken.
- exit: 0 | elapsed: 750088ms | answer: 2620B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/apps/api/blocks/govern.py, Projects/internal/cognitive-engineering-os/ai_lego/apps/api/blocks/govern_group.py, Projects/internal/cognitive-engineering-os/ai_lego/apps/api/blocks/groups.py, Projects/internal/cognitive-engineering-os/ai_lego/apps/cli/grant_role.py, Projects/internal/cognitive-engineering-os/ai_lego/core/domain/doc_kinds.py, Projects/internal/cognitive-engineering-os/ai_lego/core/domain/kinds/govern_group.py, Projects/internal/cognitive-engineering-os/ai_lego/data/events/record_log.py, Projects/internal/cognitive-engineering-os/ai_lego/data/migrations/versions/0005_groups.py, Projects/internal/cognitive-engineering-os/ai_lego/data/migrations/versions/0006_identity_invited_by.py, Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/case_docs.py, Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/project_source_repository.py, Projects/internal/cognitive-engineering-os/ai_lego/errors.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/block_hooks/govern_group.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/erasure.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/identity/store.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/rulesets/govern.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/visibility.py, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/errors.ts, Projects/internal/cognitive-engineering-os/docs/platform/STEP34_SHARED_RULES.md, Projects/internal/cognitive-engineering-os/docs/platform/STORAGE_SWITCH.md, Projects/internal/cognitive-engineering-os/tests/unit/test_block_foundation.py, Projects/internal/cognitive-engineering-os/tests/unit/test_consent.py, Projects/internal/cognitive-engineering-os/tests/unit/test_group_invites.py, Projects/internal/cognitive-engineering-os/tests/unit/test_groups_core.py, Projects/internal/cognitive-engineering-os/tests/unit/test_pg_foundation.py, Projects/internal/cognitive-engineering-os/tests/unit/test_visibility.py, agency-os/reports/review-debt.md
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: A pending-review member can be promoted to convener and erase or close the group
  ai_lego/data/repositories/project_source_repository.py:1023   -> ai_lego/data/repositories/project_source_repository.py:1016
  confidence  -> CONFIRMED
  scenario    -> A held member is handed over as convener; the update ignores `review_state`, and convener checks only the role, so the held account can erase the group and its records.
  why missed  -> Invitation creation checks review state, but hand-over and convener authorization use separate paths.

FINDING 2: Group erasure can leave a consent naming the erased group
  ai_lego/platform/block_hooks/govern_group.py:27   -> ai_lego/data/repositories/project_source_repository.py:1067
  confidence  -> CONFIRMED
  scenario    -> Consent save validates membership; group erasure then scans and deletes consents; the save appends afterward without taking the group lock, leaving a consent targeting an erased group.
  why missed  -> Sequential tests cover existing consents, but the hook does not serialize with group erasure.

FINDING 3: Account erasure can delete cases before discovering a newly-created last-convener violation
  ai_lego/apps/api/blocks/govern.py:359   -> ai_lego/platform/erasure.py:165
  confidence  -> CONFIRMED
  scenario    -> The precheck sees two conveners; the other convener leaves; the account’s cases are erased, then `decide_person` rejects the account because it is now the sole convener.
  why missed  -> The precheck and decision recheck are separate transactions, while case erasures commit first.

FINDING 4: Account export omits records the person wrote in groups
  ai_lego/apps/api/blocks/govern.py:312   -> docs/platform/STEP34_SHARED_RULES.md:50
  confidence  -> CONFIRMED
  scenario    -> A member leaves after writing a group record and requests `/govern/export`; the export includes only person-owned and own-case records, so their group record cannot be exported.
  why missed  -> Group deletion was implemented, but the existing export path was left unchanged.

FINDING 5: A member who leaves during visibility authorization can still receive another member’s full history
  ai_lego/platform/visibility.py:81   -> ai_lego/platform/visibility.py:83
  confidence  -> CONFIRMED
  scenario    -> `versions()` authorizes the viewer as a current member, the viewer leaves, then `versions_in_group()` fetches the document without rechecking membership and returns the other member’s versions.
  why missed  -> Authorization and group-record fetching occur in separate operations without a shared group lock.

TOTAL: 5 findings
