# U5.3／U5.4 接手驗證（2026-11-17）

範圍：一鍵執行與預算、片頭／片尾、quick-render 接線、video-service 渲染；做法正本為 video-unify-plan-20261116.md §9、§12、§13 C2–C6。未部署，DEPLOY_HOLD 保留；正式站、通知送達與登入瀏覽器驗收仍待部署當下授權。

## 根因與修正

- 原 runner 送出所有比例即完成，忽略稍後失敗；現在等每支成功，草稿等主系統進到 measure，失敗停在原步。
- 建任務後、記錄 jobId 前重新整理會重送。每次 run／step／attempt 固定 idempotency key，後端併發鎖與既存任務查詢去重，runId 能追回任務。
- 草稿文案原本沒有計費／上限。報價包含社群文案最多兩次呼叫，每次付費前先保留最壞費用、完成後記實際用量；NT$0 不呼叫 writer。補圖按實選模型計價。
- 新 run 清除舊草稿完成標記，同 run 的下一比例保留；伺服器依 runId 等所有指定比例並處理新版本覆蓋。
- 剪輯輸出原本不帶本集片頭／片尾；現在在輸出副本插入並平移所有軌道，保留旁白對齊，支援標題卡／模板及轉場；不改原剪輯。
- 主系統完成／失敗通知包含費用與本集連結，已處理通知去重；外部通知本次未實送。

## 驗證證據

- VW `node tests/gate.cjs`：全綠（包含 u5-one-click、u5-editor-bookends、後端併發去重及價格檢查）。
- NA `npx tsc --noEmit`：通過。
- NA vitest：quick-render route 7、quote 2、auto-run-budget 2、project-advance 3，共 14 通過；較早 registry 14 亦通過，整合後再跑全套。
- 本機 Linux 容器 `codex-video-unify-test:20261117`，`python -m unittest discover -s tests -p test_bookends.py -v`：7 通過（3.476 秒），真實 title／template、crossfade、fade-black 及既有無片頭流程；未連正式服務。
- 擁有權突變：只在記憶體移除 quick-render asset lookup 的 organization_id 條件，route 兩個跨組織案例由綠變紅（2 fail／5 pass）；正常來源 7 pass。正式檔沒有移除守衛。
- `git diff --check` 通過；全域搜尋 autoBudget／runSubmission／edExportWithBookends／autoRunNext／submissionLocks 共 56 行，逐處核對重送、恢復、上限與等待完成。
- 整合衝突保留 U4 的圖片模型按鈕／對話框關閉後更新、U9 的 cast API／聖經區塊，以及 U5 runner；整合 VW gate 通過，NA tsc 通過。
- NA 全套第一次 4,740 過／18 失敗，集中兩支 Bash 合約測試；PATH 選到 Windows system32/bash.exe。僅本次程序 PATH 前置 Git Bash 後，兩支 30 案全過；沒有改測試或正式碼繞過。
- 同環境重跑 NA `npm test`：563 個測試檔通過、19 skipped；4,758 案通過、60 skipped、2 todo，29.52 秒。

## 審查與限制

REVIEW_DONE: critic=Deep | verdict=warn | findings=5 Major（已修正）

只讀 critic 指出的提早完成、重送空窗、文案費用遺漏、剪輯遺漏片頭片尾、舊 autoEmbedded 旗標均已修正並加上述驗證。另修正實選模型報價、完成通知。

ORACLE_WAIVED：Claude CLI 已回覆 weekly limit；已寫入 critic quota block，沒有使用付費 API、沒有重試繞過。此處是自審＋既有 critic 發現＋實執行／突變證據，不宣稱 Claude 跨模型審查通過。

依接手文件不改共享 WORKLOG／TASKS；證據放此。BOM 稽核既有 27 個記憶文件缺 BOM，非本卡範圍未改。部署／回滾程序另見 u5-4-deploy-steps.md，須操作者當下同意。
