# codex-oracle review -- 2026-11-06 00:16:38 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(full)/tools/vector-pro/VectorProFrame.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/theme/frame-theme.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/theme/__tests__/frame-theme.test.ts, lobster-factory/infra/hetzner-phase1-core/tests/e2e/smoke/05-vector-pro.spec.ts, scripts/vectorcraft-pro  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Remove the VectorCraft app-theme link: operator decided 2026-11-05 that Craft editors keep their own built-in dark/light. Also drops api-addfont.patch (fonts panel removed in 550764e16, no caller). Verify: no dangling references anywhere in the repo (frame-theme, connectThemeFrame, data-theme-linked, setTheme, addFont, awarewave-theme-receiver, UPSTREAM-PR), build.sh still valid and its dist-root 16-hex filename invariant still holds, the e2e spec still parses, nothing else depended on addFont/setTheme. If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 190031ms | answer: 961B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/theme/__tests__/frame-theme.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/theme/frame-theme.ts, scripts/vectorcraft-pro/UPSTREAM-PR.md, scripts/vectorcraft-pro/api-addfont.patch, scripts/vectorcraft-pro/api-settheme.patch, scripts/vectorcraft-pro/awarewave-theme-receiver.js, scripts/vectorcraft-pro/smoke-settheme-light.jpg, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(full)/tools/vector-pro/VectorProFrame.tsx, lobster-factory/infra/hetzner-phase1-core/tests/e2e/smoke/05-vector-pro.spec.ts, scripts/vectorcraft-pro/README.md, scripts/vectorcraft-pro/build.sh
- deletions-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/theme/__tests__/frame-theme.test.ts@03003c833, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/theme/frame-theme.ts@4ba37863b, scripts/vectorcraft-pro/UPSTREAM-PR.md@fcf3adb54, scripts/vectorcraft-pro/api-addfont.patch@3e9d8b532, scripts/vectorcraft-pro/api-settheme.patch@0c76b5cc5, scripts/vectorcraft-pro/awarewave-theme-receiver.js@73c631019, scripts/vectorcraft-pro/smoke-settheme-light.jpg@833277555

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: e2e smoke 仍測試已移除的字型面板，登入後執行會失敗
  file:line   -> lobster-factory/infra/hetzner-phase1-core/tests/e2e/smoke/05-vector-pro.spec.ts:180
  confidence  -> CONFIRMED
  scenario    -> dock 只註冊九個面板、沒有 `fonts` → 測試呼叫 `openPanel('fonts')` 找不到元素 → soft assertion 記錄失敗。此 spec 的 TypeScript 語法解析通過。
  why missed  -> 刪除了主題測試，但保留了先前字型面板的測試步驟。

FINDING 2: 目前的監工台資料仍把已刪除的補丁列為建置檔案
  file:line   -> agency-os/handoffs/2026-11-04-vectorcraft-pro/data.mjs:42
  confidence  -> CONFIRMED
  scenario    -> 操作者查看或重新產生 VectorCraft 監工台 → C1 仍列出 `api-addfont.patch`，但該檔已刪除 → 監工台提供錯誤的建置依賴清單。
  why missed  -> 建置腳本與 README 已更新，監工台的資料來源未同步。

TOTAL: 2 findings
