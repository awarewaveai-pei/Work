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
| Codex | 00-queue-integrity | 新增測試驗證佇列欄位、檔案、依賴、閘門、檢查指令與 High-STOP 限制 | 佇列完整、依賴只能指向前卡、檢查命令可追溯且高風險卡不得執行危險命令 | 5 個 tempfile 壞副本由同一驗證器攔截；每項規則刪除守衛後測試轉紅並還原為綠 | 待審 |
| Codex | 40-teach-content-and-loader | 新增 TEACH 課程與練習案例內容載入器、版本指紋閘與不覆寫產生器 | 課程內容與練習案例為檔案且來源可追溯；草稿不可冒充已審；版本指紋一致 | 11 個 TEACH 單元測試；54 個基礎規則集測試；4 個突變測試各紅後綠 | 待審 |
| Codex | 41-teach-block | 新增 TEACH 人員紀錄、完成 hook、AI 練習對手與課程／案例讀取路由 | person-only records、system-only completion、完整課程才完成、練習與真實案子分離、AI 不評分且只讀允許內容 | `test_block_teach` 的拒絕與路由測試；版本／同意／輸出形狀／完成時機四個 mutation 轉紅後還原綠 | 待審 |

## deferred, before D7 second region

（Codex W1-W3 審查 `agency-os/reports/oracle/2026-10-08-partialreview-8fb16d14.md`；`Databases.from_env` 拒絕多區域（`DB_MULTI_REGION_BLOBS_NOT_READY`）期間皆潛伏）
- F3 `ai_lego/data/db.py` `directory_region` = 設定清單第一個：重排 `COGNITIVE_OS_DATABASE_URLS` 即讀到空目錄，所有租戶 TENANT_REGION_UNKNOWN；開第二區前目錄區域要明示設定。
- F4 `platform/identity/store.py:create_tenant` home 與 directory 兩交易非原子（process 死在中間留孤兒 home 列；4c13c954b 只讓同資料重試可恢復）；開第二區前需孤兒清理或兩階段。
- F5 source/artifact/journal CAS 根目錄不分區，第二區租戶的檔案不在其區域；= STORAGE_SWITCH D7。

## deferred

- `scripts/dev/prod_projects_check.py`、`scripts/dev/prod_read_analyses.py` 仍以 sqlite3 讀 `repo.db_path`（PG 版 repo 無此屬性）；dev 工具、非 CI/主路徑，切換上線後改讀 PG 或刪除。
- `CaseDocs.save_many` 個人批次 check 持 person 鎖 exclusive，其 `from_case` 項再取 case 鎖 shared；`erasure.admit_run` 為 case→person 順序。同時有 case 抹除排隊 exclusive 時可成三方環，PostgreSQL deadlock detector 中止其一（錯誤，非卡死）；如出現再統一 person/case 取鎖順序。
