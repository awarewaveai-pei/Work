# Weekly Summary 2026-10-12

## Completed this week

### Cognitive OS — Platform Launch & UX Sprint

- **認知主權平台第 3、4 步完成並上線** (2026-10-10 続1): 所有積木卡（COLLAB/GOVERN/TEACH/EXPRESS/FACILITATE）merge 到 main；SQLite→PostgreSQL 遷移完成（`move_sqlite_to_pg.py` verify OK）；`deploy.sh` + `lib-db.sh` rollback gate；healthy 上正式站 `cognitive.aware-wave.com`。commits a082fa6a9..9c5077a29。

- **平台開關修正 — 全部積木開放** (2026-10-10 続5): `OPEN_BLOCKS = BLOCKS`、`BUILD_STEP/OPEN_STEP = 4`；主選單加「我的群組／帶領／課程／校準／我的資料」；手機底部選單改左右滑；新增兩個 invariant test (`test_every_built_block_is_open`、`test_every_top_level_platform_page_is_in_the_menu`)。

- **認知平台入口第一段（兩道門）** (2026-10-11 続1): 首頁「陪我思考 → /projects/new」、「直接分析 → /analyze」；工程工具對用戶隱藏；案子判定改走伺服器 `is_case`；我的案子分兩區（勾選＋確認永久刪除，是案子回 409）；選單 5 區。commits 735e12468, 51dffee2d, 578ae0a05。

- **COS EXPRESS 頁面 (卡 52)** (2026-10-08 続9): 新增 `ExpressPage.tsx`、route、測試；讀者/格式/勾選/來源/未查證確認整合。

- **COS EXPRESS PDF 換行、已讀、原子送出修正 (卡 51)** (2026-10-08 続4/7): `TextPath` 寬度換行；`DocRead` 不增版本；send 在 write-lock 內重新查版本、已讀、標記；突變 4 項逐一驗證。

- **COS 卡 40/41/42/50 TEACH/EXPRESS 修正** (2026-10-08 続6): TEACH AI action 擋評分/排名；practice consent 綁真實案；完成紀錄可刪；EXPRESS draft 比對舊版 AI 句；4 個練習案例升 v2。

- **COS 卡 00/01/02 CI/DB/queue 修正** (2026-10-08 続5): CI image/checkout manifest 明確分離；dump 先完整讀取再改名 `.corrupt`；佇列統一 validator。

- **COS 卡 60b facilitator 課程** (2026-10-08 続8): 三課 draft facilitator lessons；`TEACH` loader 支援 special `facilitator` course；HISTORY v2。AUTO_TASK_DONE。

- **COS Codex 線 cherry-pick 到 PostgreSQL main** (2026-10-08 続10): 17+2+1+1 commits cherry-pick；ON_DELETE callable hook；`image_test_modules.py` 加 `COS_FULL_SUITE=1` 守衛；15023 tests OK。

- **COS 抹除後的物理保留：VACUUM + dump 7 天** (2026-10-10 続6): `physical_retention_hook` 實作；`touched_tables` 查 `pg_stat_xact_user_tables`；`Databases.vacuum()` autocommit；備份 `KEEP_DAYS` 14→7；已隨主線部署上線。

### CI / Security Fixes

- **Weekly workflows security audit 修正** (2026-10-10 続4): `packages/workflows` 5 個 override 下限更新；4 個新 override；`@types/node` 補 devDependency；`braces` GHSA-vfj7-8cjw-p6xm 期限接受。gate verdict: pass。自 2026-09-07 連 33 天紅 → 已修。

- **HCI-30 restore drill CI 修正** (2026-10-10 続3): `.github/workflows/hci30-restore-drill.yml` 手列 migration 0001–0011 改 glob `migrations/[0-9][0-9][0-9][0-9]_*_up.sql`；32 天紅 → 已修；本機兩個 postgres 容器重播 MATCH。

- **Perplexity Search-only guard 修正** (2026-10-10 続2): `check-perplexity-search-only.mjs` 新增 `readsKey()` 分讀寫；self-test +8 例；collect-wire-v2.test.ts 寫入假 key 不再誤報；自 10-08 紅 → 已修。

---

## Open tasks

### A. 有外部截止日
- **🔴 aware-wave.com DMARC 升第二階段** (pct=25→pct=100，**2026-10-15 觸發，3 天後**) — 需操作者確認 rua 報表後執行
- **🔴 Soulful 網站搬離 Hostinger 硬死線 2026-11-12** — 主體搬遷已完成；剩③ 網域轉 CF Registrar ④ Hostinger hosting 到期
- **⚠️ 逾期 76 天｜Defender 木馬 `Trojan:Win32/PowhidSubExec.B`** — 來源查清與善後（原排 2026-06-17）
- **⚠️ 逾期 42 天｜Codex stop-time review gate** — 2026-08-25 停用，期限 2026-08-31

### B. 待操作者行動
- **🔴 staging WP admin 密碼明文在 Trigger.dev run output** — 輪換 2 站 + redact 9 runs + deploy
- **🔴 HF_TOKEN 明文進對話紀錄** (2026-08-27) — 輪換 token
- **Codex `/hooks` trust 未執行** — Codex 側無機械閘
- **DMARC 升級** — 需確認 rua 報表再執行
- **Postiz Task 2 OAuth app 審核** — Meta IG+FB / Reddit / LinkedIn
- **Cognitive OS P4 決策** — 報告核准角色與每日 token 額度（一次分析 1.8–4.3 萬）

### C. Cognitive OS
- 認知平台入口第一段**未部署**（High-STOP，等操作者 go-ahead）
- 研究線：P2 DOD 8/8 完成，剩操作者定門檻，才能做成 Project 工作流
- 頁面渲染閘（home/tool catalog/tool page/workflow pages 缺 `check-mocks.py --page`）
- 結果頁快照 fixture 過期；run_recipe_async FAILED flake

### D. 基礎設施 / 維護
- **🔴 客戶站已破圖** — `video/[id]` DELETE 無引用檢查（Soulful post id 7393 嵌壞 MP4）
- **主機 nginx `hci.aware-wave.com` 區塊漂移** — repo 缺此 server block，覆蓋會讓 hci 站下線
- **4 個 migration 從未套用到 prod** — 0022/0024/0037/0057
- MainWP 建站 E2E — bridge 已修，剩真建站 E2E 確認
- 10 個 staging 孤兒 / ~2GB — 拆除路徑就緒，待決策
- `system-health-check.ps1` 7)deploy-drift / 9)cloudflare 從未真正執行

### E. 知識庫 / 蒐集
- `provenance`/`author` 到 sink 就斷（阻擋 §1.3b 完成）
- per-model partial HNSW 未 EXPLAIN 驗
- KB migration 0076 五個延後項

### F. 已知技術債
- check-perplexity-search-only.mjs KEY_READER 抓不到間接讀 key（已開 TASKS）
- check-trigger-no-direct-fetch.ps1 3 個繞過未修
- `queryAsTenant()` 缺 transaction 包裹（RLS 隱患）
- `dev-db-init.ps1` hardcode migration marker 模式債務
- runner MinIO 孤兒物件問題（HCI-30）

---

## System health

**基礎設施**: 唯一主機 `ks-aw-01` (145.239.195.47, SSH -p 58122)。SG+EU 已於 2026-08-31 全并入。

**Cognitive OS**: 2026-10-10 04:20 TW 正式上線，PostgreSQL 模式；物理保留 (VACUUM + dump 7 天) 已隨主線部署。最新：平台入口第一段已 commit，**等待操作者 go-ahead 部署**。

**CI 狀態**: workflows-security-audit ✅（33 天紅→修）；hci30-restore-drill ✅（32 天紅→修）；Perplexity guard ✅（4 天紅→修）；Cognitive OS full suite ✅（GitHub Actions run 37993372010 4 jobs pass）。

**lobster next-admin**: `2c0604708` on prod (2026-09-26 deploy)。

**Trigger.dev**: v20260926.6，self-hosted on ks-aw-01。

**注意**: `integrated-status-LATEST.md` 建於 2026-09-30，已 12 天未刷新。本報告基於 WORKLOG / 每日記錄。建議下次在線 session 跑 `/health`。

---

## Risks & blockers

| 嚴重度 | 項目 | 所需行動 |
|---|---|---|
| 🔴 URGENT (3天) | DMARC pct=25→100，2026-10-15 觸發 | 操作者確認 rua 報表後執行 |
| 🔴 SECURITY | Staging WP admin 密碼在 Trigger run output | 操作者：輪換 2 站 + redact 9 runs |
| 🔴 SECURITY | HF_TOKEN 明文進對話紀錄 | 操作者：輪換 token |
| 🔴 CLIENT IMPACT | Soulful 破圖（video DELETE 無引用檢查） | 修 `/api/video/[id]` 或還原 R2 物件 |
| 🔴 DEPLOY HOLD | 認知平台入口第一段（2026-10-11 commits） | 操作者 go-ahead |
| ⚠️ OVERDUE 76d | Defender 木馬資安複盤 | 安全複盤 |
| ⚠️ OVERDUE 42d | Codex stop-time review gate 停用 | 重新啟用 |
| ⚠️ TECH DEBT | 4 個 migration 未套用到 prod (0022/0024/0037/0057) | `apply-db-migration.mjs` |
| ⚠️ DRIFT | nginx hci.aware-wave.com 漂移 | 加進 repo 再做任何 nginx 覆蓋 |
| ⚠️ DEADLINE | Soulful hosting 硬死線 2026-11-12 | 網域轉 CF Registrar |

---

## Memory highlights

- **單一主機時代**：ks-aw-01 是自 2026-08-31 起唯一 prod 主機，所有 SG/EU IP 引用已清除或標記。

- **Cognitive OS 已全面 PostgreSQL**：SQLite 徹底退場，2026-10-10 上線。14 塊積木全部開放（OPEN_STEP=4）。平台名定為「認知工程系統／Cognitive Engineering OS」，首頁改兩道門（陪我思考／直接分析）。

- **本週最大改動**：三件 CI 紅止血（workflows-security-audit 33天、hci30-restore-drill 32天、perplexity-guard 4天）全數修復，且都是找到不變量後的根治（非補丁）。

- **Oracle 審查架構**：Claude 寫 → Codex 審；Codex 寫 → Claude 審。本週 Codex/Claude oracle 各輪均有 artifact；三輪 critic round 共 7+4+2 findings 全部閉環（除 LATER 項）。

- **物理保留設計決策**：VACUUM 不會把空間清零（PostgreSQL 頁面殘留），`VACUUM FULL` 或每人金鑰才能完全清除，目前選擇 dump 7 天保留作為補充。

- **AO lifecycle 修正（2026-09-27）**：linked worktree 的 `.git` 為檔案，正確 skip AO-RESUME 所有 junction/hook side effects（v-int2 事件已關）。
