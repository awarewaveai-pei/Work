# 審查債（寫的模型 ≠ 審的模型；清掉一行才能 push）

規則：`agency-os/AGENTS.md` §4。誰寫的 commit，就不能由同一個模型審。Claude 寫的 → Codex 審（`/codex-review`）；Codex 寫的 → Claude 審（`/claude-review`）。
Codex 每寫一個 commit，在下面加一行；Claude 審完把那行劃掉（`~~…~~`）並寫審查結果。接手說明見 `agency-os/handoffs/2026-10-04-1400-cos-step2-merged-storage-next.md` 的「審查債」。

| 寫的模型 | commit | 一句話改了什麼 | 碰到的不變量 | 機器證據（突變／閘門） | 狀態 |
|---|---|---|---|---|---|
| ~~Codex~~ | ~~c55b64c35~~ | ~~COS 58 個 JSON 欄位存檔形狀驗證~~ | ~~物件／陣列契約；錯形狀不得進紀錄或 AI 讀取端~~ | ~~11 模組 452 tests PASS；共用守衛突變 58 failures；58 個宣告逐一突變各 1 failure；`py_compile` PASS~~ | 2026-10-08 Claude（Sonnet 5.5）審畢：通過，0 缺陷。獨立重驗：58/58 宣告＝寫入端實際形狀＝讀取端用法；突變 58/58 存活 0；10 模組 437 tests PASS。未涵蓋：巢狀值、舊資料、前端 TS 測試。細節見 WORKLOG 2026-10-08 該條。本表已無未清行；push 仍由操作者決定 |
| Codex | storage-cross-region-retry | W3 跨區建租戶在目錄提交失敗後可用相同資料重試；衝突孤兒拒絕 | 不可把不存在的租戶對外路由；可恢復部分提交且不可覆蓋別人的區域列 | 故障注入測試修前 `UniqueViolation` 紅、修後 `test_pg_foundation` 27 與 `test_identity_store` 36 PASS | 待 Claude 跨模型審查；勿 push／部署／啟用第二區域 |
| Codex | storage-integration-error-class | 把 `save_many(check)` 的無 case 誤用列為內部程式錯誤 | 使用者可造成的拒絕須有人話；無法由頁面造成的程式錯誤不冒充使用者輸入 | `test_block_foundation` 修前缺 1 碼紅、修後 43 PASS；原指定 10 模組共 446 PASS | 待 Claude 跨模型審查；勿 push／部署 |
| Codex | storage-single-region-runtime-gate | D7 檔案分區完成前正式入口拒絕多區域 | 不可宣稱資料駐留而把不同區域的來源／產物／流程檔放在同一根目錄 | 守衛測試修前先開 pool 紅、修後 `test_pg_foundation` 28 PASS；兩區域 DB 測試保留 | 待 Claude 跨模型審查；勿 push／部署／啟用第二區域 |
| Codex | storage-integration-baseline-gates | 移除只供測試等待的 Future 全域集合，補模型通道白名單的實際用途 | 生產互斥只靠跨程序資料庫鎖；等待器不遺漏已送出的 hook；純文字呼叫有白名單理由 | `test_no_process_local_run_registry` 3、`test_structured_answers` 11、step2 63、GATHER 68、VERIFY 62 PASS；拔回呼突變紅後綠 | 待 Claude 跨模型審查；勿 push／部署 |
| Codex | storage-erasure-blocker | 記錄 W1-W3 的資料庫回滾後 Source CAS 已刪，以及 API 更早刪 artifact/journal 的實證 | 不可把可回滾的 row 與不可回滾的檔案刪除假裝成同一交易 | 一次性 PostgreSQL 故障注入：`row_survives=True blob_survives=False`，預期不變量斷言 exit 1；24 個跨檔命中逐一查 | Critical，儲存分支不得合併／推送／部署；待耐故障抹除協定與跨模型審查 |
