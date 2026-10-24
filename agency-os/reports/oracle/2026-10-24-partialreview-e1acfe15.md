# codex-oracle review -- 2026-10-24 22:33:45 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/sidebar-sections.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/SidebarNav.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/layout.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/hub-tab-tools.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/__tests__/staff-nav.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/staff-tools.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: C3 of per-staff tool grants (agency-os/handoffs/2026-10-24-staff-tool-grants/R0-PLAN.md section 6): the sidebar, home page and client hub show a restricted staff member only the tools ticked for them. Sidebar data moved verbatim from SidebarNav.tsx into a plain module app/sidebar-sections.ts so the server layout can filter it (SidebarNav re-exports for existing importers); filtering uses lib/staff-access.ts staffMayOpen/staffUnrestricted (already on main, commit 3bb0cd120). Hub tabs of other products hide via HUB_TAB_TOOL. Check: a restricted person still seeing a link to an unticked tool, an unrestricted person (owner / never-set in shadow) losing anything, saved Theme Editor order breaking, and the hub-tab map missing a tab that calls another product API.
- exit: 0 | elapsed: 271272ms | answer: 1101B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/layout.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/SidebarNav.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/staff-tools.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/hub-tab-tools.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/__tests__/staff-nav.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/sidebar-sections.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Hub filtering uses labels that do not match the rendered tab identifiers.
  ClientHubTabs.tsx:2632,2637 -> hub-tab-tools.ts:4
  confidence  -> CONFIRMED
  scenario    -> A staff member without `cs` receives hidden tabs `["知識庫","客服"]`, but `TABS` contains only `["內容工具","整合","佈建","維護","設定","品牌識別"]`; the CS tabs are not removed.
  why missed  -> The map was checked as a product-label list, while the component filters a separate top-level tab list.

FINDING 2: The new coverage test can pass while an actual product tab is unmapped.
  staff-tools.test.ts:126,130 -> ClientHubTabs.tsx:2637
  confidence  -> CONFIRMED
  scenario    -> A new tab calls the `content` tool but is omitted from `HUB_TAB_TOOL`; because `"content"` already exists in the map values, the test passes, while a restricted non-content staff member still sees that tab.
  why missed  -> The assertion checks only whether each API’s tool appears somewhere among map values; it never verifies the API-to-rendered-tab mapping or that map keys belong to `TABS`.

TOTAL: 2 findings
