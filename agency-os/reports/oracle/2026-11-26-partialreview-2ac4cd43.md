# codex-oracle review -- 2026-11-26 08:52:45 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/systems/block-usage.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/scripts/gen-block-usage.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/systems/blocks.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/systems/__tests__/blocks.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/package.json  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Block catalog usedBy auto-fill: import scan moved from blocks.test.ts into lib/systems/block-usage.ts; scripts/gen-block-usage.ts (npm run blocks:usage) writes block-usage.generated.json; blocks.ts merges it into usedBy (withImporters); test now asserts the generated file equals a fresh scan, message names the command. Root cause of the friction: usedBy was a hand copy of what imports already state, so every new import of a shared block failed CI until someone hand-edited blocks.ts (6b9032f09 B-079 design).
- exit: 0 | elapsed: 126682ms | answer: 675B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/systems/__tests__/blocks.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/systems/blocks.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/package.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/systems/block-usage.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/scripts/gen-block-usage.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 登錄表單獨變更時，產生檔的過期檢查不會執行
  file:line   -> .github/workflows/next-admin-test.yml:14
  confidence  -> CONFIRMED
  scenario    -> 只修改 `agency-os/systems/registry.json`，把現有匯入檔的 `source_paths` 歸給另一個系統；掃描器會依新歸屬產生不同的 `usedBy`（`block-usage.ts:39–40`），但工作流程只監聽 next-admin 路徑，故不執行 `blocks.test.ts:107` 的比對。線上目錄繼續使用舊產生檔（`blocks.ts:86`），顯示錯誤的使用系統。
  why missed  -> 產生檔與測試都在 next-admin 內，掃描結果卻也取決於目錄外的登錄表。

TOTAL: 1 findings