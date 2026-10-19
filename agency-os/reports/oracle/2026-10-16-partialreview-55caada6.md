# codex-oracle review -- 2026-10-16 13:02:09 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/Members.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/LogView.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/SocialManager.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/__tests__/SocialManager.cannot-write.render.test.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Operator: an account invited from the client hub (no brand role = client, read-only on its own org) opened /tools/social and met the new-post editor, which ignored typing without a word. Fix: SocialManager shows cannotWriteNotice(brand.role) instead of the Editor when selection is new or article and the role is reviewer or client; header shows the role name. ROLE_NAMES moved from Members.tsx to model.ts (one source; LogView imported it from Members). Server-side write gates are unchanged (WRITE_ROLES in authz.ts). Copy written by GPT. Render test covers client/reviewer (notice, no post box) and owner/editor (editor); mutation removing the branch turns the two non-writer cases red.
- exit: 0 | elapsed: 208434ms | answer: 11B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/LogView.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/Members.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/SocialManager.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/__tests__/SocialManager.cannot-write.render.test.tsx
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

NO FINDINGS
