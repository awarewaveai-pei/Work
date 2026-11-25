# codex-oracle review -- 2026-11-25 13:57:13 +08:00

- mode: `review`
- scope: whole repo
- target: `0a8e02242..HEAD`
- context: Platform U13 + U14. U13: default theme contrast to 4.5:1 (globals.css :root + lib/theme/tokens.ts kept in sync), a checker that status colours are not used as text with a shrink-only per-file debt list, SidebarNav.tsx re-export deleted, theme page title via layout.tsx. U14: phone frame at max-width 640 -- sidebar, client rail and the client page's own list column take no room and open over the page from a bottom bar's 更多 button (app/MobileShell.tsx, app/bottom-items.ts, CSS only for widths); layout styles moved from inline to classes; desktop must be unchanged. Focus: desktop regressions from moving inline layout to classes, focus/keyboard traps in the 更多 overlay, links that lose the org/site query, members on a product door seeing staff links
- exit: 0 | elapsed: 201963ms | answer: 1589B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/ClientPanelNav.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/__tests__/page.render.test.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/layout.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/ContentStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/__tests__/ContentStudio.site-wiring.test.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/sites/ScheduleImageButtons.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/content/topics/TopicsBoard.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/theme/THEME_ARCHITECTURE_APPEARANCE.md, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/theme/layout.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/theme/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/OpenWorkbench.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/ScriptForge.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/ClientRail.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/MobileShell.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/NavRail.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/PlatformFrame.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/SidebarNav.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/__tests__/BottomBar.render.test.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/__tests__/sidebar-coverage.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/bottom-items.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/globals.css, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/sidebar-sections.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/components/portal/ToolCard.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/page-names.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/theme/__tests__/accent-not-text.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/theme/tokens.ts
- deletions-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/SidebarNav.tsx@ebc94b2c7

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 手機底列跨主機連結會遺失目前客戶與網站
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/MobileShell.tsx:33
  confidence  -> CONFIRMED
  scenario    -> 員工在產品門選定 `?org=A&site=S` 後點底列「工作台」或「客戶」；連結是絕對網址，因此不會呼叫 `carry`，抵達員工主機後選擇消失。`withContext` 本身支援絕對網址（`lib/client-context/contract.ts:186`）。
  why missed  -> 測試只核對目的主機，沒有帶入 org／site 查詢參數。

FINDING 2: 「更多」開啟後，鍵盤焦點仍可移到被遮住的頁面
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/MobileShell.tsx:35
  confidence  -> CONFIRMED
  scenario    -> 以鍵盤開啟「更多」後按 Shift+Tab，焦點可越過底列進入原頁面的按鈕或連結；選單覆蓋頁面，但程式只處理 Escape（`MobileShell.tsx:16`），沒有把焦點限制在可見選單內。
  why missed  -> 渲染測試只檢查連結及 `aria-expanded`，沒有測鍵盤移動。

FINDING 3: 狀態文字檢查會漏掉跨行的 `color` 宣告
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/theme/__tests__/accent-not-text.test.ts:127
  confidence  -> CONFIRMED
  scenario    -> 新增 CSS `color:`，下一行才寫 `var(--red)`；檢查先逐行掃描（同檔 `:131`），正規表示式又在換行處停止，新增的低對比文字不計入債務，測試仍通過。
  why missed  -> 檢查器只用單行宣告驗證。

TOTAL: 3 findings