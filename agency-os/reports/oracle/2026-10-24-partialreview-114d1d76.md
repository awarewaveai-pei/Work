# codex-oracle review -- 2026-10-24 22:00:59 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/script-forge/modules.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/script-forge/__tests__/modules.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/script-forge/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/script-forge/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/ScriptForge.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/script-handoff.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/VideoPipeline.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/script-forge/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/script-forge/ScriptForgePage.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/script-forge/__tests__/ScriptForgePage.render.test.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/SidebarNav.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/banner/BannerStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/banner/BannerStudioStaff.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/staff-tools.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: AUTO_CONTENT P5: ScriptForge prompts move to a server registry (lib/script-forge/modules.ts): browser sends only {module, task, fields, siteId}; route builds role + rules + language line + brand (read from the client site, tenant-checked); the old whole-prompt body is removed (Banner Studio moved to the registry too). Standalone page /tools/script-forge (left menu with blurbs), send-to-video via sessionStorage hand-off, send-to-social as a staff-only injected call. Prompt bodies must be byte-identical to the old browser templates. Other sessions may have unrelated hunks in SidebarNav/products.
- exit: 0 | elapsed: 125557ms | answer: 1023B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/banner/BannerStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/banner/BannerStudioStaff.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/ScriptForge.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/VideoPipeline.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/SidebarNav.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/script-forge/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/staff-tools.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/script-forge/ScriptForgePage.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/script-forge/__tests__/ScriptForgePage.render.test.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/script-forge/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/script-handoff.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/script-forge/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/script-forge/__tests__/modules.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/script-forge/modules.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The supposedly server-only prompt registry is bundled into the browser.

  ScriptForge.tsx:11 -> lib/script-forge/modules.ts:57-63  
  confidence  -> CONFIRMED  
  scenario    -> A user loads `/tools/script-forge`; importing `FORGE_NAV` pulls in `FORGE_MODULES`, including every prompt builder and prompt body, so proprietary prompts are visible in the client JavaScript bundle.  
  why missed  -> Navigation metadata was derived from the full registry instead of a client-safe manifest.

FINDING 2: Script handoffs can leak across logout/login sessions in the same browser tab.

  script-handoff.ts:10 -> script-handoff.ts:14-19; VideoPipeline.tsx:84-91  
  confidence  -> CONFIRMED  
  scenario    -> User A sends a script, then logs out before `/tools/video` consumes it; User B logs into the same tab and opens video, which consumes and displays User A’s stored script.  
  why missed  -> `sessionStorage` has no user/org binding or expiry, and logout does not clear the key.

Final line: TOTAL: 2 findings
