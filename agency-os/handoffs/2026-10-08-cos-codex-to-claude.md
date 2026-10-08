# COS Codex → Claude 接手｜2026-10-08

## 邊界

- Repo `D:/Work`；引擎 `Projects/internal/cognitive-engineering-os`。`main=445f39e51`，本次**沒有** merge、push、部署。主工作樹有大量別的 session 的修改，勿整樹 stage/reset/clean；先讀 `CLAUDE.md`、`agency-os/AGENTS.md`、operator memory。
- 本次只用一個有界 Codex CLI worker 處理卡 51；因發現 PDF 裁切而停止它和 driver。專用測試容器 `cos-db-test-codex-pg` 已 `docker stop`；未刪容器/volume。`D:/tmp/cos-codex-state/state.json` 的卡 51 仍寫 `running`，是**過期狀態**，不能據此重派。
- Claude 額度先前用盡；Codex 作者改動的 Claude oracle review 沒拿到有效 artifact。review debt 未清，不得用自評代替。

## 已提交、但只在隔離工作樹

| 樹 / HEAD | 內容與已驗證範圍 | 未過的閘 |
|---|---|---|
| `D:/tmp/cos-codex` / `842ab3941`，`refs/codex/work` | 佇列 00、01、02；TEACH 40–42；EXPRESS 50。卡 02 主機端 `ops/cognitive-db/backup-cognitive-db.sh` 對真 Docker 4 個 DB 備份/還原/輪替/毀損拒絕 10 PASS，5 個守衛突變紅；affected 56 PASS。`scripts/codex-continue.ps1` 修 WinPS5.1 子程序退出碼，0/7 實測。 | `ops/cognitive-db/README.md:9`：現有 `safe-infra-patch.sh compose` 不能安裝獨立 cognitive-db compose，D8 套用/上線 High-STOP。review debt 在 `agency-os/reports/review-debt.md`。 |
| `D:/tmp/cos-pg` / `3a61a61aa`，`refs/codex/storage-integration` | Claude W1–W3 PostgreSQL chain 已在隔離樹整合；另有 `4c13c954b` tenant retry、`55cee686c` 錯誤分類、`bb19640c9` 拒絕未完成多區 runtime、`a3d9d1d5b` 既有測試修正；`3a61a61aa` 只記錄阻斷。原指定 10 模組 446 PASS；後續 52 模組重跑最終結果**未知**，不得寫全綠。 | 下述 P0 資料遺失；不得併 main。`docs/platform/STORAGE_SWITCH.md:137-151` 為當前阻斷與實體留存邊界。 |

主 `main` 上的原始 JSON shape 問題已由 `c55b64c35` 修，`445f39e51` 記 review debt；別把它當成本次 worktree 的新提交。卡 10–33 仍被 PG 合併閘阻擋；卡 52 依賴 51；卡 60 尚 pending（隊列 `agency-os/handoffs/cos-codex-queue/queue.json`）。

## P0：PG 擦除資料遺失，禁止合併

- 在一次性真 PostgreSQL 故障注入：於 CAS unlink 後讓 `record_log.append` 失敗，實測 `row_survives=True blob_survives=False`。`D:/tmp/cos-pg/Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/project_source_repository.py:750-769` 在可 rollback 的 DB transaction 內先做不可 rollback 的 `_collect_unreferenced_blobs`（`:765`），後寫 tombstone；失敗後 DB 列仍引用已刪 blob。
- `D:/tmp/cos-pg/Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py:2808-2811` 也在 repo erase 前先刪 run/artifact、關 grants；故障會留下部分擦除。這是已重現的 class，不是推測。
- 下一步：① 實作 durable、冪等 erasure saga/outbox：先提交 DB 意圖/不可讀狀態，再清不可逆檔，重啟可找回重試；tombstone/API 只在實體清理成功後宣稱完成。② 故障注入涵蓋 commit 前/後、每種 unlink、重試、共享 blob；關 grants/AI artifact/run journal 同一流程。③ 做 D7/D8 真 PG + backup/restore/retention 決策及跨模型 review，再考慮合併。不可用單次 post-commit best-effort 呼叫冒充修復。

## 卡 51：已實作/暫存，**未提交、未完成**

- `D:/tmp/cos-codex` 的 `git status --short` 有 12 個已 staged 檔：匯出器、EXPRESS 路由/欄位/檢查、web 錯誤、測試、checklist、`WORKLOG.md`、review debt；另有未追蹤 `.card-51-commit-message.txt`。**不得直接 commit**；共享 `WORKLOG.md` 必須用 `scripts/git-partial-worktree-commit.py stage ... --worklog-entry <N> -- <其餘自有檔>` 私有 index。commit hook 也已擋 `UNVERIFIED CODE FILES` 9 件；要完成 verify-recent/verify-clear，不能繞過。`state.json` 卡 51 `running` 是 worker 被停止留下的假象。
- worker 已跑綠：`tests.unit.test_express_export` 8、`test_block_express` 14、`test_block_foundation` 43、`test_record_log` 20、`test_api_main` 109；未查證標記、版本檢查、外連掃描、匯出誤寫 sent、偽造已讀欄位各自突變紅，再還原。這**不是**完整 affected/跨模型審查。
- **已重現 PDF 缺陷**：`ai_lego/platform/exports/render.py:153` 用 `textwrap.wrap(..., width=52)` 以字數而非字形寬度換行；120 個連續中文字的 PDF 在右頁界被裁切。QA 檔 `D:/tmp/cos-codex-state/pdf-qa/express-long.pdf` / `.png`；短句 PDF 可抽出中文與標記，容器 Dockerfile:14-16 有 Noto CJK，但長句不完整。卡 51 的「每句完整輸出」尚未達成。修成量測實際字形寬度的換行，寫長中英文/標記/多頁防退化測試，重渲染檢查頁邊。
- 另須查：`apps/api/blocks/express.py:81-85` 只把 `seen is False` 視為未讀，缺 `seen` 的句子在讀取路由寫入版本標記後可送；卡文要求每句 `seen: bool`。`:150-153` 的 GET 讀路由會儲存新 draft 版本，正常編輯帶回 `last_read_version` 又被 `apps/api/blocks/docs.py:76` 擋；需測讀→編輯→再讀→送的真流程。送出版本檢查與儲存間也要故障/並發測試，不能只靠先查後寫。
- 下一步：① 在 `D:/tmp/cos-codex` 先 `git status --short`，只處理卡 51 已 staged 檔；不要盲目跑佇列 driver（它會按過期 `running` 重派）。② 修上述缺陷並補測、重跑 affected；PDF 視覺/文字 QA。③ 依 hook 做 verify-recent/`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-clear.ps1`（獨立命令）、私有 index commit；清理自己建立的 `.card-51-commit-message.txt`。④ Claude review Codex 改動；過閘後才更新 queue 狀態/`refs/codex/work`，再看卡 52/60。

## 提醒

- 不要從 `D:/tmp/cos-codex` 直接 merge PG 樹，或把卡 51 未提交改動誤算成 `842ab3941`；兩樹刻意分離。`D:/Work` 的既有髒檔屬其他 session。
- 不 push、不部署、不套 cognitive-db compose；操作者先前只授權本機 main merge 且以前提「雙重審查 + 真 PG」為限，目前前提未達。所有新結論附 `file:line` 與測試/故障輸出，不派無效益多 agent。
