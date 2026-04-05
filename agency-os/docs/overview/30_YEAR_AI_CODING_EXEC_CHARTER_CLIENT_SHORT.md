# Client Short: 30 年級 AI / Coding / 專案管理短憲章（精簡版）

> **用途**：給客戶或非技術成員快速理解「我們如何用 AI 協作、如何保證可維護與可驗證」。  
> **權威來源**：`30_YEAR_AI_CODING_EXEC_CHARTER.md`（此檔為非權威精簡鏡像）。

## 我們做的 7 件事（決定）
1. **AI 只能加速草稿與整理**：不做權限/資料隔離/合約口徑的最後決策。
2. **單一真相**：進度與決策證據看 `TASKS.md` / `WORKLOG.md` / `memory/**`；看板僅輔助。
3. **單一 Owner**：每份政策/流程/交付路由只有一個文件主人，避免漂移。
4. **證據驅動**：對外宣告以 `verify-build-gates`、health 報告與收工記錄為準。
5. **相容與退役**：重大改動有 release note、遷移、回滾；大型分岔用 ADR 留痕。
6. **合規不可談判**：憑證/密鑰/敏感個資不進文件或記憶。
7. **可擴充模組**：客戶可選需要的能力模組；交付/計價以固定矩陣歸桶口徑為準。

## 我們怎麼執行（每天/每次改版）
1. 每天從 `AO-RESUME` 進入，先確保本機與時間接線一致（必要時先 `git pull --ff-only origin main`）。
2. 政策/文件/連動矩陣改版：先 `doc-sync-automation -AutoDetect`，再以 `CHANGE_IMPACT_MATRIX` 驗證連動完整。
3. 收工釋出前預設用 `AO-CLOSE`：先跑龍蝦 + 系統健康檢查，通過才 commit/push。

