# codex-oracle review -- 2026-10-24 21:56:17 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/TarotStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/TarotStudioStaff.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/doors.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/registry-code.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/code-scan.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/staff-tools.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/middleware-door.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Tarot product door (tarot.aware-wave.com, live) rendered two buttons whose APIs the door does not serve, so they 404: the export bar (components/tools/OutputTrackBar -> POST /api/tools/image/process) and the AI edit-prompt panel (components/tools/ImageEditPromptPanel -> /api/tools/studio/edit-prompt, a paid studio feature; tarot does not depend on studio). Root cause: the door tests' scanner skipped components/. Fix: (1) image/process joins PLATFORM_APIS (every door) with an ORG_FREE_ROUTES reason -- check the route really reads no organization data and calls no paid model, and that serving it on every door (incl. customers, whose role resolves to operator) is safe; (2) the edit-prompt panel moves to a staff wrapper TarotStudioStaff passed in as a prop, so the door's import closure never names it (same pattern as BannerStudioStaff); (3) the door index now scans components/. Look for a door that now reaches something it should not, or a staff page that lost the panel.
- exit: 0 | elapsed: 284596ms | answer: 165B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/TarotStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/code-scan.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/middleware-door.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/registry-code.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/doors.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/staff-tools.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/TarotStudioStaff.tsx
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

REVIEW BLOCKED: source-file reads were denied by the repository sandbox, so I cannot provide verified `file:line` evidence without guessing.

TOTAL: unable to assess
