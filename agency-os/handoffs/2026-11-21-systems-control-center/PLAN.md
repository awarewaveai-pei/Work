# 系統總控中心 /ops/systems — 定案方案（2026-11-21）

狀態：定案，未實作。來源：Claude × GPT 三輪＋兩次自審（Claude 自讀、critic 獨立審 12 條，皆已 Grep 驗證併入）。原始 GPT 規格在操作者 Downloads `AI_Project_Control_Center_Spec.md`（未進 repo）。

## 1. 問題
15+ 系統、約 15 個監工頁（按階段開；影片一系統 4 頁）→ 操作者忘記用途／進度／下一步。操作者工作記憶 ≈ 0、很少跑 AO-CLOSE → 「人填」或「靠 AO-CLOSE」的寫入點都會失效。

## 2. 定案
| 項目 | 決策 |
|---|---|
| 位置 | next-admin `app/(shell)/ops/systems`（app 員工門）；不另開 App、不開子網域（ADR 018：子網域＝客戶產品） |
| 定義正本 | git `agency-os/systems/registry.json`：每系統 id(uuid 寫死)、slug、aliases、type(product/internal/infrastructure/governance/client)、purpose、source_paths、product_key、phases[]、features[]（id、slug、name、phase）。另有全域 `shared_paths`、`ignore_paths`。DB 的 systems／phases／features 表＝匯入器從 HEAD 投影，禁直接改 |
| 狀態正本 | DB `system_updates` 事件（append-only）；狀態、接續卡、完成度＝事件投影 |
| 歸屬 | 路徑最長前綴優先；命中 `shared_paths`（package.json、globals.css、lib/supabase-server.ts、lib/portal/products.ts 等）→ 不歸任何系統、不計覆蓋率；`ignore_paths`（WORKLOG、TASKS、memory、reports）→ 忽略。`System:` trailer 只補路徑對不到的 |
| 寫入點 | git commit；不是 AO-CLOSE、不是人填 |
| 匯入時間 | 每天 04:30 台灣＝cron `30 20 * * *`（主機 UTC，`auto-reboot/ks-aw-01-auto-reboot.conf:9`；避 04:00 auto-reboot）。v1 無「立即更新」（容器無法觸發主機，現有方向只有主機→app，`scripts/cron.d/awarewave-schedules:25`）；要更即時就改 cron 一行 |
| 寫庫通道 | 照既有 poke 模式：主機匯入器解析 git → POST 事件 JSON 到 `/api/internal/systems/ingest`（`SYSTEMS_INGEST_TOKEN`）→ route 驗 schema、只寫 4 張表。主機腳本不持 DB 憑證；筆電零 DB 憑證 |
| 權限 | 頁面預設僅擁有者；server 用 service_role（`lib/supabase-server.ts:8`），授權寫在 server code |

## 3. 資料表（migration 0174）
- `systems`、`system_phases`、`system_features`：registry 投影（欄位同 §2）
- `system_updates`：唯一鍵 `(commit_sha, event_index)`（v1 單 repo）或 migration/user 事件的確定性 id；`event_type`(handoff/feature_update/status_change/review/revert/migration/import_run)、`source`(agent/user/migration/importer)、`payload`（依 type 驗證）、`evidence`、`corrects_event_id`。審核＝新增 review 事件，不改舊列；照 `0166_vendor_invoices.sql:31-38` 用 trigger 強制 append-only
- 完成度＝verified 功能數 ÷ 規劃功能數；同時顯示 implemented 數。無功能＝「尚未盤點」。v1 不做權重
- 直接存取：照 `0166_vendor_invoices.sql:29` enable RLS 不建 policy＋`revoke all from anon, authenticated`。測試：未登入／一般員工／非授權帳號直打 PostgREST 與 `/ops/systems`、ingest route → 全拒

## 4. Trailer（全部選填）
`System:` `Phase:` `Feature: <slug>=<status>` `Next:` `Blocker:` `Blocker-Cleared:` `Test:`。可重複；`git interpret-trailers --parse` 解析。禁秘密／個資。缺席＝沿用上一個有效值；Blocker 只由 `Blocker-Cleared` 解除。未知 slug（系統／功能）→ 未分類佇列，不自動建（定義只來自 registry）

## 5. 擴張（不變量：非共用的程式改動都歸屬某系統）
- 新系統＝registry 加一條（與第一批程式同 commit）；`scripts/new-product.mjs` 寫 `products.ts` 時同時寫 registry
- 匯入器每輪產缺口清單（頁面可見）：未歸屬路徑、未分類 trailer、products.ts 有 key 但 registry 沒有、`agency-os/handoffs/*/data.mjs` 沒被 phase 認領
- 覆蓋率＝近 30 天非共用程式路徑有歸屬的比例；只顯示，不做測試或 commit 閘

## 6. 隔離（不變量：追蹤工具故障只會讓資料過時，不擋 commit／部署／其他服務）
| 元件 | 失敗模式 | 防護 |
|---|---|---|
| 匯入器本體 | 語法錯 → `sync-host-scripts.sh` 整批不裝、部署被拒（`:11-13`、`:48-58`） | 寫成 `scripts/systems-import.py`（非 `.sh`，不受 `bash -n` 閘）；cron 行直接 `python3` 呼叫 |
| 匯入排程 | 吃資源、卡住 | 走 `cron-run.sh`（`:3`，進 /ops/schedules、紅燈由 schedule_alerts 通知一次）；`flock -n`＋`timeout 300`＋`nice -n 19 ionice -c3`；獨立 bare mirror（不碰 `/root/Work` 部署工作樹）；`SYSTEMS_IMPORT_ENABLED` 預設 OFF；重試＝下一輪補跑，不在單輪內迴圈 |
| 寫庫 | bug 寫壞其他表 | 匯入器只能打 ingest route；route 只寫 4 表 |
| migration | 推上 main 未套 prod → 每晚部署被 migration 閘擋（`sg-deploy.sh:220-244`） | **先套後推**：經操作者同意後從筆電 ssh psql 套 0174，確認 `check-migrations-applied.sh` 綠，才推含 0174 的 commit；只新增表，不動既有表 |
| next-admin 測試 | 頁面／route 的 test、tsc、build 紅 → 擋每晚部署（前例 `acf182549`） | 解析／歸屬／投影邏輯放匯入器，用自己的測試（不進 next-admin npm test）；next-admin 只留 route schema＋授權＋頁面讀取，量最小；推前本機 `npm test`＋`npx tsc --noEmit` 綠 |
| 頁面 | 錯誤拖垮後台 | 路由 error boundary；查詢有上限＋索引；寫入只限 status_change／review 事件 |

## 7. 匯入器規則
- 記 `last_imported_head`（import_run 事件）；`git merge-base --is-ancestor` 不成立 → 停增量、標「Git 歷史異常」，不刪事件，消失的 commit 標 orphaned（Claude 已 deny force push `.claude/settings.json:658-659`，GitHub main 無分支保護 → 必做）
- revert commit → revert 事件，投影重算
- trailer 格式錯 → 保留原文＋解析錯誤；重跑不重複（唯一鍵）
- 頁面顯示最後成功匯入時間、HEAD

## 8. 舊監工頁切換（一次一個階段，無雙正本）
未切換的階段：頁面只顯示「舊監工頁（未切換）」＋連結，不顯示狀態。切換＝一個 commit：agent 一次性匯入該 data.mjs（每功能一筆 `source=migration` 事件，帶原狀態、證據等級、來源路徑＋commit SHA；無證據→implemented，不降 todo；建 uuid＋slug 映射）→ 同 commit 讓該頁 `check.mjs` 擋再寫 data.mjs、頁首加「已移到 /ops/systems」。先查明 data.mjs 13 個 vs 監工頁約 15 個的差異

## 9. 證據分級
commit＝有改動；agent 宣稱＝implemented；CI 指定測試在該 SHA 通過＝技術驗收（v1.1：GitHub Checks API 唯讀 token，綁 feature＋sha＋test＋run＋result，為獨立第二事件）；主觀驗收＝操作者在頁面按（review 事件）。commit 不得自稱 verified；不在 prod 主機跑 commit 指定的測試

## 10. 實作順序
1. 垂直切片：Outbound OS（`agency-os/handoffs/2026-10-31-outbound-os/data.mjs`），3–5 功能：registry 條目 → 匯入器＋測試 → 0174（先套後推）→ ingest route → 頁面 → 切換該監工頁
2. 主機安裝：cron.d 檔隨 sync 鏡像後，跑一次 `install-host-schedules.sh` 才寫進 `/etc/cron.d`（`sync-host-scripts.sh:91-98` 只鏡像）
3. 系統盤點：寫全部 registry；驗收＝近 90 天非共用程式路徑 100% 有歸屬；清單給操作者看一次
4. 其餘監工頁逐一切換
5. AO-RESUME 加一行頁面連結；`EXECUTION_DASHBOARD.md` 改一行指向新頁
6. v1.1：CI 驗收事件

## 11. 風險 / rollback
- 套 0174、裝 cron＝High／Medium，逐次問操作者
- 匯入器 bug → git 來源事件可重放；user／migration 事件靠 DB 備份
- 停用（不刪資料）：`SYSTEMS_IMPORT_ENABLED=false` → 刪 cron.d 檔 → 跑 `install-host-schedules.sh` → 關頁面入口；已切換的監工頁移除 check.mjs 擋寫即恢復。四表保留；down migration 只在無真實事件時用，之後刪資料須備份＋操作者同意
- 不做：GitHub 全面同步、AI 對話匯入、多租戶、JSON 匯出 UI（保留「四表可完整匯出、測試環境可還原」）、pre-commit 閘、立即更新、權重
