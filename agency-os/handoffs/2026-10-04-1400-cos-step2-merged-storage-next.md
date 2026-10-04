---
slug: cos-step2-merged-storage-next
created_utc: 2026-10-04T06:00:00Z
hint: "認知主權平台：步驟 2 全部併進 main；接下來儲存切換 W1-W3、再步驟 3+4；不上線；Claude 額度用完時由 Codex 接手"
source_session_summary: "Claude 監工一輪：整合 GATHER／VERIFY／COMPUTE／蒐集器線路，Codex 當跨模型審查，凍結 PostgreSQL 切換並完成 W4 地基。"
---

# 認知主權平台：步驟 2 已合併，接下來儲存切換（Codex 接手包）

> 讀者：Codex（或任何接手的 session）。先讀 `$WORK_ROOT/AGENTS.md` 與 `$WORK_ROOT/agency-os/AGENTS.md`，再讀本檔。
> 引擎根目錄 = `$WORK_ROOT/Projects/internal/cognitive-engineering-os`（下稱 COS）。操作者規則：**不上線，全部蓋完才問上線**。

## 1. 任務目標

1. 把步驟 2（GATHER、VERIFY、COMPUTE、蒐集器線路 v2、collect 查詢 v1）收尾：測試全綠、Codex 審過、推上 origin。
2. 做完「儲存切換」：SQLite → 每個區域一台 PostgreSQL（凍結規格 `COS/docs/platform/STORAGE_SWITCH.md`，W4 地基已完成）。
3. 然後蓋步驟 3+4（協作、治理、教學、表達、引導），一次凍結規則、一次派工、最後跑一次全套測試。

## 2. 為什麼做

操作者 2026-10-04 裁定：平台要給全世界、數百到數千人用，所以上線前先換資料庫伺服器、資料依租戶所在區域分開存。引擎只講標準 PostgreSQL。所有對外查詢（網域登記、網頁封存、查核資料庫）一律由 collect 做，引擎自己什麼都不抓（積木分開再串聯）。

## 3. 已試過

- main 上已有（本機，**尚未 push**；origin/main 比本機多 1 個 daily scaffold，push 前先 rebase）：`0827535c3` consumers+THINK → `22e37008d`/`c349b65e3` GATHER → `b80e7bbc6` VERIFY → `94df3ce14`+`fca9f21a6` 線路 v2 + 查詢 v1 → `a12c697bb` 已刪案件不再被寫入／外部輸入不當危機訊號／引擎只有一個模組開連線 → COMPUTE 四個 commit → 丁第二輪 `168ff5a3b`+`d4d3d4f6e` → 甲第二、三輪 → 乙第二、三輪 → `ae513f8fd` 測試修正。再往後看 `git log --oneline -30`。
- 每個 commit 都過：Claude critic（深度 1 個，案件刪除／身分類 2 個）＋ Codex 唯讀審查＋「拔掉守衛 → 指名測試變紅」突變（每個守衛一個）。
- Codex 審查已抓出並修好：CLI 模型閘門繞過出口規則（現走 `egress.fetch_loopback_json` 與 `AnthropicProvider`）、案件中途被刪回 404、蒐集器壞回答分類、`查不到` 旁不得帶值、完成請求的假值 `""`／`0` 被當空清單。
- **沒做成的**：Codex 寫入模式在這台機器被擋（`codex exec` 回 `rejected: blocked by policy`，只放行 `~/.codex/rules/default.rules` 列出的固定指令）。Codex 只能唯讀審查，或在操作者自己的互動 Codex app 裡逐條核准後才能跑指令。

## 4. 卡在哪

1. 整合後全引擎測試跑到一半（記錄 `scratchpad` 已隨 session 消失；請重跑，見下一步）。已知全綠：step2_foundation 53、block_gather 62、block_verify 50、block_compute 47、irr 48、project_source_api 47、api_ingest 14、api_main 109、block_foundation 41、block_govern 67、synthesis 26、collector_wire_v2 17；web tsc 0、vitest 305；next-admin tsc 0、vitest 489（15 個 live 測試依設計跳過）。
2. COMPUTE、GATHER、VERIFY 的最終版還沒讓 Codex 審（只有 Claude critic 審過）。
3. W4（`COS/ai_lego/data/db.py`、`COS/ai_lego/data/migrations/`、`COS/tests/pg.py`、`COS/tests/unit/test_pg_foundation.py`、pyproject + 兩個 lock）已複製進 main 工作樹，**可能尚未 commit**：先 `git status --short -- Projects/internal/cognitive-engineering-os` 看。

## 5. 下一步指令

1. `cd $WORK_ROOT/Projects/internal/cognitive-engineering-os`，逐一跑受影響模組（一個一個跑，不要一次批次；整批會很慢）：`python -m unittest tests.unit.test_step2_foundation`、`...test_block_gather`、`...test_block_verify`、`...test_block_compute`、`...test_api_main`、`...test_pg_foundation`（需要 Docker 或 `COGNITIVE_OS_TEST_DATABASE_URL`；都沒有會「跳過並大聲說明」，不算通過）。
2. 若 W4 尚未 commit：`scripts/verify-clear.ps1` 單獨一條指令 → 逐一字面路徑 `git add -- <path>`（不要 `git add -A`）→ commit，訊息含根因＋驗證＋突變結果。
3. 對 GATHER／VERIFY／COMPUTE 最終版各做一次跨模型審查：`scripts/codex-oracle.ps1 -Mode review -DiffRef <起>..<迄> -Context "<要它找什麼>"`（Codex 寫的改動改用 `/claude-review`）。每個 finding 先 grep 驗 `file:line` 再採用。
4. 儲存切換 W1–W3（規格在 `STORAGE_SWITCH.md`；W1 在 step 2 合併後開始）：
   - W1：`ai_lego/data/events/record_log.py`、`ai_lego/data/repositories/case_docs.py`、`ai_lego/platform/block_hooks/__init__.py` 的鎖（不變量 1–3），用 `ai_lego/data/db.py` 的 `advisory_xact_lock`。
   - W2：`project_source_repository.py`（60 處 SQL）、`custom_workflow_repository.py`、`derived_artifact_cache.py`、`apps/api/blocks/govern.py`。
   - W3：`ai_lego/platform/identity/store.py`（46 處）＋區域目錄（D6）。
   - 之後：SQLite→PostgreSQL 搬資料腳本（筆數＋每個聚合一個雜湊，SQLite 檔唯讀保留）、`cognitive-db` compose 服務（**High-STOP**）。
5. 步驟 2 剩餘小項（每項都要「整類關閉＋加閘＋突變證明」）：
   - VERIFY 的 split／techniques／read 三個 AI 動作把使用者貼的訊息改走 `AiAction.quoted`（Codex F2）。
   - `block_hooks/gather.py:58`、`block_hooks/verify.py:226` 的 `docs._repo` 改走 `docs.reads`（`CaseReads` 在 `case_docs.py`）。
   - 引擎端接 collect 的 `dbs` 請求欄位與 `license` 命中欄位（`specs/wire/lookup.v1.json`；collect 端已做）。
   - 使用者看得到的字一律「找資料的服務」，不寫「蒐集器」（`collect_lookups.py` 的 DOWN／MALFORMED、規格範例）。
   - `docs/platform/STEP2_SHARED_RULES.md:56` 還寫「一份存下來的網頁或一個快照」，要補「網址去掉 # 後相同也是同一個出處」（`evidence.py` 已這樣做）。
   - 搜尋找到的查核文章頁（angle `factcheck`）不是 hit，仍會進 AI 閱讀回合，只靠提示詞擋；同一類，應一併關。
   - 整合閘＋Playwright 看頁（1280／400 寬）GATHER／VERIFY／COMPUTE；WORKLOG 條目（用 `scripts/worklog-insert-entry.py` 配號，`scripts/git-partial-worktree-commit.py` 私有索引 commit）；監工台 artifact（步驟 2 完成、儲存切換決定）。
6. 然後 rebase origin/main、push。
7. 步驟 3+4：先凍結規則（草稿在下面「步驟 3+4 設計筆記」），再派工，不要邊蓋邊改規則。

## 6. 相關資源

- **規格**：`COS/docs/platform/STEP2_SHARED_RULES.md`、`STEP2_CHECKLIST.md`、`STORAGE_SWITCH.md`、`BLOCK_BUILD_GUIDE.md`；線路 `COS/specs/wire/collector.v2.json`、`lookup.v1.json`。
- **Known landmines**
  - 驗證閘：`git commit` 前要先在**獨立一條指令**跑 `powershell -NoProfile -File scripts/verify-clear.ps1`；追蹤清單是多個 session 共用的，別人的檔會擋你。
  - 暫存路徑一律字面 `git add -- <path>`（單獨一條指令），不要 `git add -A`。
  - `agency-os/WORKLOG.md`、`TASKS.md` 只能經 `scripts/git-partial-worktree-commit.py` 的私有索引 commit。
  - 突變驗證一律在拋棄式 worktree 做（`git worktree add --detach D:/tmp/<name> HEAD`），每次突變前後清 `__pycache__`；用完先 `os.rmdir` 解除 `node_modules` junction 再 `git worktree remove`，**絕不**刪 junction 的目標。
  - heredoc 會吃掉雙反斜線：含反斜線的腳本用檔案寫入，再用路徑執行。
  - Windows 上 `psycopg[binary]` 的 DLL 可能被擋，W4 在這台用純 Python 模式（見 `tests/pg.py`）。
  - CI（`.github/workflows/cognitive-os-full-suite.yml`）目前沒有 PostgreSQL，W4 的測試在 CI 會「大聲跳過」；要加 postgres service 與 `COGNITIVE_OS_TEST_DATABASE_URL`。
- **High-STOP（要操作者明說才做）**：套用 migration 0095（`lobster-factory/packages/db/migrations/0095_collect_claimreview_mirror.sql`，順序：0095 → next-admin 部署 → 引擎部署）、任何 prod 部署、新增 `cognitive-db` 服務、刪除性操作。
- **憑證**：只在各機 `mcp/user-env.ps1`；不要印出、不要問。`~/.codex/rules/default.rules` 第 14 行有一組 Sentry 金鑰明文：請操作者換掉並刪該行（本檔不重述）。
- **規矩**：Claude 與 Codex 不同時改同一檔；不用中國廠商 AI；不用 Perplexity；搜尋走 Serper（Brave 沒有金鑰）；在 main 直接 commit，不開 branch，不 force push；政治例子只寫成「使用者可能帶來的判斷」；操作者個人命盤筆記不進平台。
- **怎麼給 Codex 下任務**（操作者在互動 Codex app 裡貼）：只放 Decision／Constraints／Files／Acceptance 四段；Acceptance 必含「指名測試 + 拔守衛變紅」；寫入前叫它先讀 `COS/docs/platform/STORAGE_SWITCH.md` 與本檔。互動模式遇到指令請求，由操作者按核准。

### 審查債（Claude 沒額度時，Codex 寫的東西怎麼辦）

審查者必須是沒寫這段改動的模型（`agency-os/AGENTS.md` §4）。Claude 額度用完時：

1. **Codex 寫的 commit 先留在本機 main，不 push、不部署**（本來就要等全部蓋完才問上線，所以審查可以晚一點，但不能省）。
2. **每個 Codex commit 必附機器證據**：每個守衛一個「拔掉守衛 → 指名測試變紅 → 還原變綠」；整類問題要有掃全部程式碼的閘門測試（例如 `test_egress_allowlist_parity`、`HooksReadOnlyTests`）。這種證據不靠任何模型。
3. **Codex 把自己寫的 commit 逐條記在 `agency-os/reports/review-debt.md`**（一行：commit hash、一句話它改了什麼、碰了哪些不變量）。不要用它自己的第二次審查當作審查。
4. **Claude 額度回來後第一件事**：讀 `review-debt.md`，對每個 hash 跑 `/claude-review`（碰身分、案件刪除、個資、金流的，要兩位獨立審查），每個 finding 先 grep 驗 `file:line`；通過的行劃掉，才能 push。
5. 兩邊都沒額度、又急著要動：寫「書面對抗自審 + 突變證據 + WORKLOG `ORACLE_WAIVED: <理由>`」，並在 `review-debt.md` 標 **未經跨模型審查**，之後補審。
6. 禁止拿 `chatgpt-*`、`gemini-*`、`grok-*` 這些 MCP 當審查者（按 token 計費，規則禁用）。

### 步驟 3+4 設計筆記（草稿，凍結前要補讀程式）

- 一波做完：COLLAB（群組協作）＋ GOVERN（研究／治理）＋ TEACH ＋ EXPRESS ＋ FACILITATE；一次凍結、五個工作者、一次整合、最後一次全套。
- 群組紀錄：`record_log.OWNER_KINDS` 加 `"group"`；表 `group_member(group_id, identity_id, role, joined_at, left_at)`；群組屬於工作區；每個群組路由都查成員身分。
- 邀請：只在邀請人同一租戶內；一次性連結由邀請人自己複製送出（引擎沒有寄信）；接受 = 建身分＋設密碼同一交易，仿 `password_reset_token`（`platform/identity/store.py` ~95）與 `handoff_code`（~103）；碰身分驗證 → 兩個 critic。沒有公開註冊。
- 先寫再看：群組種類可宣告 `blind=True`，讀路由只有在讀者自己已有該種類的活文件時才回別人的。
- 同意（GOVERN）：個人擁有 `govern.consent {purpose: group|facilitator|research, target, items, withdrawn}`；群組或引導者的唯一讀取路徑只回已同意項目，撤回立即失效；研究匯出去掉帳號和三個地點，不去內容。
- 申訴：個人擁有 `govern.appeal`，預設匿名；讀者 = 引導者的督導與平台申訴處理者，絕不只有引導者本人。
- 角色：新增身分層級表 `identity_role(identity_id, role, granted_by, granted_at, revoked_at)`；現有 entitlement 是整個租戶（`platform/entitlement/check.py:23`），不適用。
- 十個過程指標：只當「有／沒有」的事實，來自紀錄，每個案子各自算，不打分數、不跨人比較。
- 步驟 3+4 若需要外部資料（各地危機資源、翻譯），一律新增 collect 查詢種類（lookup.v1 → v2），不寫進引擎。
- 待讀程式再定：身分怎麼建、草稿課文誰審、「不留紀錄」模式（案件關閉時自動刪）、i18n 範圍（本波只做其他地方的資源與語言清單結構）。
