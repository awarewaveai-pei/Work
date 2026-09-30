# 新文件連動檢查清單（小白版）

## 預設：不要新增檔案（抗增殖）

**預設答案是：不要新增 `.md`。** 維護痛苦與錯亂，多半來自「同一議題的第二份長文」——連動再認真也會跟不住。

在動念開新檔之前，先做這三步；**任一步為「可以」，就不得新建檔**：

1. **能不能只在既有 Owner 加一小節？**（例：`docs/overview/30_YEAR_AI_CODING_EXEC_CHARTER.md`、`REMOTE_WORKSTATION_STARTUP.md`、`TOOLS_DELIVERY_TRACEABILITY.md`、`TASKS.md`、租戶案場內對應檔）
2. **能不能只在 `TASKS` 留一行隊列 + 連結到既有細項？**（隊列不重複貼全文）
3. **能不能用表格或 `<details>` 摺疊塞回同一 Owner？**

只有 **主題全新**、且 **沒有任何現有檔案可掛鉤** 時，才進入下方「必做四件事」。「覺得好整理」**不是**新建檔的理由。

---

## 為什麼會「沒連動」？

同一件事若寫在多份檔案，或只改內文、沒更新「誰和誰一組」，時間久了就會漂移。要靠 **清單 + 機器可驗證的地圖** 補上，而不是靠記憶。

## 什麼時候用這份？

只要新增或大量改版「**會給客戶／同事看**」的治理文件，就照下面做（SOP、overview、政策、對外表格、`AGENTS`／規則會引用都算）。

## 必做四件事（賣人品質最小集合）

1. **入口**  
   - 在 `docs/DOCS_INDEX.md`（或根目錄 `README.md`）加一句連結，讓人找得到這份新文件。

2. **人看的關係表**  
   - 在 `docs/CHANGE_IMPACT_MATRIX.md` **加一列**：`主文件` = 新檔；`必查/必同步文件` = 改這份時一定要一起看的舊檔（至少 1～3 個）。

3. **機器驗的「類 foreign key」**  
   - 在 `docs/change-impact-map.json` 的 `rules` 裡 **加一條**（或把新路徑塞進既有某條的 `targets`）：  
     - `"source": "docs/.../你的新檔.md"`  
     - `"targets": [ "..." , "..." ]`  
   - `system-health-check` 會檢查這些路徑的檔案 **是否存在**（缺了 Critical 會 FAIL）。  
   - **半自動（同一條 rule + 矩陣列）**：已知要連動哪些檔時，可一鍵寫入 JSON 與 `CHANGE_IMPACT_MATRIX.md`（仍不會幫你決定 targets、也不會改 README／內文）：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\register-new-governance-doc.ps1 `
  -Source "docs/operations/你的新檔.md" `
  -Targets @("README.md", "docs/DOCS_INDEX.md", "docs/operations/end-to-end-linkage-checklist.md")
```

   - 先看參數是否正確：加 `-DryRun`。目標檔尚未建立時：`-SkipTargetExistCheck`（release 前建議補齊並再跑 health）。

4. **收斂驗證**  
   - 執行（在 `agency-os` 或含 `agency-os` 的 monorepo 慣用根目錄）：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\doc-sync-automation.ps1 -AutoDetect
powershell -ExecutionPolicy Bypass -File .\scripts\system-health-check.ps1
```

   - 目標：**health 分數維持你們的門檻（例如 100%）且 Critical Gate PASS**。

## `doc-sync` 怎麼知道「誰改過」？

- **AutoDetect** 會同時使用：  
  - **上次執行時間之後**，在監看目錄內變更過的檔案（修改時間）；以及  
  - **Git**：目前工作區與 `HEAD` 不一致的檔案（`git diff-index --name-only HEAD`，且路徑落在 `agency-os` 底下才會納入）。  
- 這樣可減少「明明有改、卻顯示 No changed files detected」的情況。

若你**沒用 Git** 或要在無 repo 目錄測試，可改用手動列出檔案：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\doc-sync-automation.ps1 -ChangedFiles @("docs/operations/你的新檔.md")
```

## 延伸閱讀（整條鏈路）

- Cursor 企業級規則（可版控）：`docs/operations/cursor-enterprise-rules-index.md`  
- 全鏈路與證據目錄：`docs/operations/end-to-end-linkage-checklist.md`  
- 發布／遷移時也常要動地圖：`docs/releases/migration-checklist.md`

## Related Documents (Auto-Synced)
- `AGENTS.md`
- `docs/CHANGE_IMPACT_MATRIX.md`
- `docs/change-impact-map.json`
- `docs/DOCS_INDEX.md`
- `docs/operations/cursor-enterprise-rules-index.md`
- `docs/operations/end-to-end-linkage-checklist.md`
- `docs/operations/GOVERNED_SYSTEM_BUILD_SOP.md`
- `scripts/doc-sync-automation.ps1`
- `scripts/register-new-governance-doc.ps1`
- `scripts/system-health-check.ps1`

_Last synced: 2026-09-29 14:30:03 UTC_

