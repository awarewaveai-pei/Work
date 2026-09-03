# Integrated status report (assembled)

- Generated: 2026-08-29 10:44:59
- agency-os root: `D:\Work\agency-os`

> Assembled from canonical sources only; edit those files to change truth. Chinese legend: `docs/overview/INTEGRATED_STATUS_REPORT.md`
>
> Regenerate: `powershell -ExecutionPolicy Bypass -File .\scripts\generate-integrated-status-report.ps1`

## Source index
- `TASKS.md`
- `../lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md`
- `memory/CONVERSATION_MEMORY.md`
- `memory/daily/YYYY-MM-DD.md`
- `LAST_SYSTEM_STATUS.md`, `WORKLOG.md`

## 1) TASKS.md - Next (unchecked)
- [ ] **【⚠️ 逾期 69 天｜原排 2026-06-17｜資安複盤】Defender 嚴重木馬 `Trojan:Win32/PowhidSubExec.B` 來源查清與善後**
- [ ] **【未開始｜2026-08-25 開｜到期日 2026-08-31】重新啟用 Codex stop-time review gate** — 2026-08-25 05:08 UTC **暫時停用**（`node ~/.claude/plugins/cache/openai-codex/codex/1.0.6/scripts/codex-companion.mjs setup --disable-review-gate`，走官方開關非改檔；已驗證 `stopReviewGate: True → False`）。
- [ ] **🔴【資安】2026-08-27 `HF_TOKEN` 明文進入對話紀錄 — 待輪換** —— 驗證 WSL2 環境變數轉送時讀取 `/proc/<pid>/environ`，遮罩用的 `sed` 比對條件寫錯未生效，HuggingFace token 完整值印進 transcript。**與 2026-08-15 三項外洩同根因**（遮罩「輸出後才套用」而非「不讀取值」），第三次發生。
- [ ] **⏭️ Soulful 搬站：機器買到後的接手點（硬死線 2026-11-12，買機死線 9/30）**
- [ ] **🔴【硬死線 2026-11-12】Soulful 網站搬離 Hostinger（hosting 不續約，操作者 2026-08-15 決定）**
      - [ ] EU①Supabase（**High-risk，需操作者本人在線**，六服務中風險最高、放最後搬）
      - [ ] EU②Trigger.dev（含 ClickHouse——**搬前先確認 `override.xml` 產生源設定已生效**，2026-08-19 在原機實測過這個坑，同一套修法要複製過去）
      - [ ] EU③n8n
      - [ ] EU④Postiz
      - [ ] EU⑤MainWP（Dashboard 端；child site token 需隨遷移重新確認連線）
      - [ ] EU⑥Uptime Kuma
      - [ ] **EU⑥b Remotion/Video 服務（`lobster-remotion-service`＋`lobster-video-service`）**——2026-08-26 SSH 實查 `docker ps` + nginx `server_name` 逐一比對 EU 27 個容器才發現，**先前 EU①-⑥ 清單漏列**；不是內部輔助服務，nginx 有掛外部網域 `remotion-svc.aware-wave.com`／`video-svc.aware-wave.com`，屬對外服務，整併時須比照其他六項排班次，不可漏搬
      - [ ] SG⑦next-admin（app.aware-wave.com；DNS 見 DR runbook §5 SG 表）
      - [ ] SG⑧WordPress + WordPress-DB（一對搬，DB 緊耦合；apex/www 指向這裡）
      - [ ] SG⑨Node API（api.aware-wave.com）
      - [ ] SG⑩oracle-web（oracle.aware-wave.com；**✅ 2026-08-19 SSH 查證用途：真實產品「Oracle」紫微斗數命理 app**，`Projects/internal/ziwei-doushu/`，有 DNS+TLS+health check，非測試殘留——**搬遷時發現環境變數含明文 OpenAI API key，務必改走 vault 引用**）
      - [ ] SG⑪Redis（共用快取層，隨最後一個依賴它的服務一起搬，不單獨排波；**檢查現況是否有密碼，新機多服務共用建議補上**）
      - [ ] SG⑫觀測堆疊（Loki/Grafana/Promtail；**✅ 2026-08-19 SSH 查證用途：SG 主機自己的日誌監控**，loopback-only + SSH tunnel 存取，有正式文件 [`OBSERVABILITY_P1_P2_ROLLOUT.md`](docs/operations/OBSERVABILITY_P1_P2_ROLLOUT.md)，為防過去 502 事故而建——**要搬，不是退役項**；搬遷後 SSH tunnel 指令要改指新機 IP）
      - [ ] 兩台雲端主機確認已無流量 → 安全關閉 → 帳單確認只剩一台在計費（呼應 Pre-mortem「切換 +120 天仍 &gt;1 台在跑」的預警指標）
- [ ] **🔴【資安】2026-08-15 transcript 憑證外洩 — 三項待輪換**
- [ ] **【人工｜Postiz Task 2 OAuth app 審核】各平台 dev app 提交** — Meta IG+FB（一個 Meta app，App Review，最高價值）/ Reddit / LinkedIn。callback = `https://postiz.aware-wave.com/integrations/social/<slug>`；client_id/secret 加進 EU `/root/postiz/.env`（`<PLATFORM>_CLIENT_ID/SECRET`）+ restart。
- [ ] **【人工｜Postiz 測試草稿清理】** 登入 `https://postiz.aware-wave.com` → Posts → Drafts → 刪 draft ID `cmqo1wijz0005p58ncl1mtssr`（Gate C 測試用，content 含「Delete this draft」）。
- [ ] **【操作者｜Postiz 帳號 → 客戶 Hub 連結】** `app.aware-wave.com/ops/clients/[slug]` → 社群頻道 tab → 點「連結」→ 選 Bluesky integration（soulfulexpression.bsky.social）→ 儲存。完成後 ContentStudio 才能看到 channel selector 顯示帳號。
- [ ] **既有站接手 Day 1（Soulful Expression）**
- [ ] **【診斷】Mockup Studio 功能異常 — server-side 已排除（2026-06-16），卡操作者症狀**：操作者回報 mockup 有問題未提供細節（2026-06-13）。MockupStudio.tsx 實走 `/api/tools/studio/generate`（nano-banana-2 + referenceImages）。
- [ ] **【驗證債】Canvas 編輯器 `/tools/canvas` 整輪瀏覽器實測** — 整個 PS 功能目錄已全部 build+deploy（HEAD 含 `09b81ee4`/`5b73b77d`，tsc 0+build 0+critic 過），但**使用者尚未瀏覽器實測**（Claude 無登入 session 無法測）。主檔 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/tools/canvas/CanvasEditor.tsx`。待驗清單：
- [ ] **【POD A1 已完工｜剩 e2e + A2】** A1（一鍵 native 建品）後端+UI+hardening 全 live。剩：
- [ ] **【POD A2 confirm phase — 🔴 金流紅線，測試結束 + 操作者明示批准才做】** A2 draft-only 管線已上 prod dormant。真正「自動扣款 + 送印」需未來明確建 confirm step（目前 code 完全沒有）。
- [ ] **【未開始｜待使用者明確下指令】會議服務網路版安裝** — 客戶筆電無 NVIDIA GPU（2026-08-20 確認），本機版 CPU 路線慢 20-27 倍不可用。
- [ ] **（出國前必做）Termius 手機 SSH 設定 + cheat sheet 書籤**
- [ ] **【已知限制｜2026-08-25 開｜2026-08-31 自動解除】Codex 額度耗盡，跨模型 oracle 路徑不可用** — `codex exec` 直測回 `You've hit your usage limit ... try again at Aug 31st, 2026 12:41 PM`。影響：
- [ ] **【gated｜8月｜等買二手機才繼續建 customer service U6 Chatwoot】** — 軟體層(cs-engine U0–U5 + widget U4)已上 prod 並 live 驗；只剩裝 Chatwoot + 接線（建 `app/api/cs/chatwoot-webhook` 呼叫 `handleInbound`、MockTransport 換 ChatwootTransport）。
- [ ] **【gated｜8月｜EU→Dedicated 搬機 + 整併退雲端】**
- [ ] **蒙古客戶 Cloudways 實際建站**：待客戶刷卡配合
- [ ] **新站建置（Scenery Travel Mongolia）**
- [ ] **新站建置 Day 1（Scenery Travel Mongolia）**
- [ ] **Next-Gen 試點 — Day 2 雲端 staging 實機驗收（~~兩案~~ → 僅剩 Scenery）**
- [ ] `tenants/templates/` v2
- [ ] **🟠 EU origin 仍未鎖 Cloudflare（步驟 A 已完成，B 待做）**
- [ ] **【2026-08-26 開出｜我自己留下的漂移風險】`cloudflare-realip.conf` 的網段清單是靜態的，無偵測器**
- [ ] **【2026-08-26 開出｜🔴 客戶站已破圖｜刪影片會靜默弄破已發布的文章】`video/[id]` DELETE 無引用檢查** — **現行損害（實測）**：Soulful Expression 上線文章 `感恩日記：改變人生的五分鐘習慣`（post id 7393，`https://soulfulexpression.org/insights/general/...`）嵌著 `https://pub-bd79a1c3b4554025bd92a6192b032427.r2.dev/video/感恩日記_改變人生的五分鐘習慣/16x9.mp4`，該物件 **HTTP 404**（陰性對照：仍存在的 `三個習慣_...` 回 200）。客戶頁面上是一個壞掉的影片。
- [ ] **【2026-08-26 開出｜小】R2 裡 8 個 `remotion/` 物件（~200MB）從未被任何對帳涵蓋** — `reconcile.ts` 的 `FORMAT_SUFFIX_RE = /^video\/(.+)\/([^/]+)\.mp4$/` 只收 `video/` 前綴，而 remotion-service 寫的是 `remotion/YYYY-MM-DD/<uuid>.mp4`（`apps/remotion-service/src/server.ts:293`）。實測 R2 有 8 個此類物件（2026-06-24 五個、2026-07-02 三個，最大 113MB），**全部不在 media_assets、也不在任何清理排程**（`video/cleanup` 也只刪 media_assets 有列的）。等於一個持續長大且無人看管的儲存桶分區。**先決定要不要留**：remotion 產出目前有無使用者可見的入口？沒有的話直接刪比補對帳便宜。
- [ ] **【2026-08-26 開出｜等一個決定】R2 `video/蒙古旅遊___熱情分享型主持人稿/4x5.mp4` 是真孤兒（23MB）** — 無 media_assets 列、目錄名無 org 前綴（2026-08-25 之前的格式）→ reconcile 一律 fail-closed 不猜擁有者。**告警上線後會持續報 `orphanUnattributable=1` 直到處理掉**（這是正確行為，它確實是孤兒）。選項：① 補記到某個 org（`organizations` 有 `d6d1e845 mongolia-03` 這個測試租戶，名稱吻合但**不可據此推定**）② 直接刪除物件。**需操作者判斷這支影片還要不要**。
- [ ] **🔴 EU 的保留政策把「還原演練證明過的備份」刪掉了**
- [ ] **【2026-08-26 開出｜已知風險｜操作者決定不處理】WPvivid 的 Google Drive refresh_token 曾進入對話紀錄**
- [ ] **`cf-iprefresh` 偵測器已 error 14 天，而且沒有任何讀者**
- [ ] **【2026-08-25 開出｜類別級重設計】影片歸屬改為持久化 `outName → organization_id` mapping，停止從 object key 反解** — critic（2026-08-25）指出 2026-08-25 那批修正裡的三條 finding（crafted legacy prefix / 大小寫不一致 / ctx 缺欄位 fallback）是
- [ ] **【2026-08-25 開出｜critic Minor 7 條｜2026-08-26 部分結案】影片管線租戶邊界收尾** — 原 7 條逐條重驗結果如下（重驗而非沿用）：
- [ ] **【2026-08-26 開出｜中】next-admin 沒有 DOM 測試基礎設施，接線層的 bug 測不到** — repo 無 `jsdom` / `happy-dom` / `@testing-library/react`，vitest 全域 `environment: "node"`。實證代價：同一天 Codex 三輪覆審抓到的 3 條 CONFIRMED finding **全部在 React 元件的接線層**（mount-only effect 讀 URL state、`if (sites.length)` 讓決策分支被跳過、`?? wpSites[0]` 靜默替換），而純函式測試對它們一律綠燈 —— 突變測試證實：把 `ContentStudio` 改回舊寫法完全繞過 `pickInitialSite`，5 個測試照樣全過。**決策點**：要不要引進 DOM 測試依賴。影響 `sg-deploy.sh` 的 `npm test` gate 與 57 個現有測試檔的執行環境，屬於操作者的決定，不該塞在功能 commit 裡。
- [ ] **【2026-08-26 開出｜中】現存 10 個 staging 孤兒 / 1969.7 MB 待清理（拆除路徑已就緒，清理是決策）** — 見 `agency-os/reports/status/staging-orphans-LATEST.md`。**4 個 unregistered**（`fresh-brew-coffee-f2a3b4` 93MB、`green-valley-farm-28ba09` 217MB、`ssasd-8ebcd4` 306MB、`test-pilot` 93MB）有目錄有 DB 但從未進過 `wp_sites` —— 佈建 wiring 是 best-effort，失敗只回 WARN 不擋佈建。**3 個 complete 但已停用**（`e2e-verify-0704` 357MB、`mongolia-03` 549MB、`test-wp-webhook-co` 355MB），WP REST 實測 404。**6 個 db_only** 只剩資料庫沒有目錄，`deprovision-staging.sh` **刻意拆不動**（要求目錄存在且含 wp-config.php，否則無法證明要 DROP 哪一個），需人工確認後手動處理。SG 根磁碟 67%（48G/75G）。**注意 `test-pilot` 的 DB 叫 `wp_staging_testpilot`，命名規則與自動佈建不同，可能是更早的手工產物，不該和自動佈建的混在一起判斷。**
- [ ] **【2026-08-26 開出｜中】手動新增的站拿不到租戶歸屬
- [ ] **【2026-08-26 開出｜小｜跟著
- [ ] **MCP 執行期可用性偵測器：讀實際 connected/failed 計數，不再只驗設定檔語法**
- [ ] **`claude_desktop_config.json` 至今無人治理，且正握著 6 把明文 API key**
- [ ] **`codex-oracle.ps1 -Path` 一用就炸，等於大 repo 沒有可行的 review 路徑**
- [ ] **Cursor 散文殘留：10 份文件仍叫操作者「用 Cursor 開 monorepo 根」**
- [ ] **【2026-08-26 開出｜偵測器說謊｜第三顆】Phase 4 Check 1／Check 2 至少 12 週在回報假綠燈 —— 雲端容器沒有 `gh`** — 2026-08-26 把檢查邏輯換成 `scripts/phase4-checks.py` 後第一次雲端實跑，Check 1／2 回 `SKIP — gh not installed`（`RemoteTrigger get_run_log cse_01BAKre3odz4KUbP1jUDxaFS`，容器內 `python3` 有、`gh` 沒有）。但 `agency-os/reports/repair-center/phase4-2026-06-08.md` 到 `phase4-2026-08-21.md` **連續 12 份全部是 `Check 1: PASS`**（逐檔 grep 確認）。舊 prompt 明文寫 `If gh exit != 0: CHECK1_STATUS = "SKIP"`，所以要嘛容器映像近期拿掉 `gh`，要嘛散文規格被執行成了 PASS —— 兩者結論相同：**那兩項檢查有 12 週沒有真的在量任何東西**。**現況不是退步**：SKIP 是誠實的「我沒量到」，比假 PASS 好；且 SKIP 會進 `整體` 顯示（今天是「⚠️ 1 項需注意, 2 項 SKIP」），不會被當健康。**要決定的是取捨不是 bug**：① 給 routine 配 setup script 裝 `gh`（目前 `No setup script configured`）② 改走 GitHub REST API + token —— 但 routine 刻意無 env vars（與另外三支 routine 同 pattern），加 token 會讓四支分叉 ③ 接受 SKIP，把 auto-repair PR 重複偵測改由本機 `/health` 或 `.ps1` fallback 負責（本機有 `gh`，今天實測 Check 1 正常回 PASS）。**建議③**：這兩項本來就不是時效性檢查，而雲端加 secret 的代價高於收益。
- [ ] **建立 `detector-contract` audit class：偵測器必須申報「這輪量到什麼」**
- [ ] **Phase 4 雲端 routine 仍在解析已退役的 `restore_drill_due_after`**
- [ ] **`check-backup-health.ps1` 把「無法證明可還原」當成健康**
- [ ] **統一 TASKS 條目的標籤詞彙**
- [ ] **【2026-08-26 開出｜🔴 交叉污染｜第 4 個 `git add -A`】AO-CLOSE 的 `git add -A` 會掃走其他 session 進行中的檔案**
- [ ] **【2026-08-26 開出｜營運｜搬站前必處理】soulful 週備份近 10 次有 5 次失敗，最新一次就是失敗** — `agency-os/tenants/company-soulful-expression/core/BACKUP_AUTO_STATUS.json`：`last_failure` = **2026-08-24 Failed**（最新一次）；`backup_history_since_last_sync` 近 10 次為 F/S/F/F/S/S/S/F/S/F = **5 敗**。
- [ ] **【2026-08-26 開出｜治理｜機械閘誤判】`verify-gate-commit.js` 對 Bash 指令做純文字比對，heredoc 內容含 `git commit` 就被 BLOCK** — 本 session 撰寫 routine prompt（內文本身就含 `git commit -m ...` 這一行指令範例）時，`python3 - <<'EOF'` 的 heredoc **內容**被當成「要執行 git commit」而 exit-2 擋下。閘沒有區分「要執行的指令」與「被當作資料寫入檔案的內容」。
- [ ] **【2026-08-26 開出｜治理｜✅ 根因已定位 2026-08-26】廣域 `git add -A` 把別的 session 未驗證的工作掃進不相干的 commit**
- [ ] **【2026-08-26 開出｜治理｜具名 add 也擋不住】兩個 session 編輯同一檔案時，`git add -- <file>` 一樣會帶走對方未提交的編輯**
- [ ] **【2026-08-26 開出｜小｜人體工學，非安全機制】`record-restore-drill` 一鍵記錄還原演練** — 目前記錄一次演練要手寫兩處（frontmatter `restore_drills` + 敘述段落）。
- [ ] **【2026-08-25 開出｜小｜文件一致性】Soulful staging「abandon」決策未傳播到 3 份仍在宣告它的文件** — 2026-08-16 已決議不在即將退場的 Hostinger 上建 staging，`ENVIRONMENT_REGISTRY.md` / `02_EXECUTION_PLAN.md` 均已加刪除線，但下列**仍以肯定語氣宣告要建 staging**，冷啟動的代理或操作者照著做就會白工：
- [ ] **【2026-08-25 開出】`ao-resume-last.txt` 錨點卡在 2026-06-12，AO-CLOSE 視窗計算長期失真** — `agency-os/.agency-state/ao-resume-last.txt` 實測值 `2026-06-12T05:27:33.6508893Z`，距今 2.5 個月未推進；`ao-close-prev.txt`=`2026-08-24T12:13:10Z`、`ao-close-last.txt`=`2026-08-24T12:14:06Z` 兩者只差 56 秒（同日兩次 close 嘗試）。
- [ ] **【2026-08-24 開出】CHANGE_IMPACT_MATRIX 漂移偵測腳本首輪 7 個 WARN 待人工確認** — `scripts/check-change-impact-matrix-drift.ps1` 2026-08-24 首次接進月度巡檢（`ao-resume.ps1` monthly check #5），真實跑出 7 對 WARN（全部是 `docs/operations/cursor-enterprise-rules-index.md` / `docs/operations/cursor-mcp-and-plugin-inventory.md` / `../docs/spec/raw/Cursor  Rules for AI/README-部署說明.md` 宣告的 impacted，vs `.cursor/rules/64-architecture-mcp-routing.mdc` / `65-build-standards-data-state.mdc` / `66-skills-observability-protocol.mdc` 三個 `.mdc` 檔案，4 月未更新但主文件近期持續改動，drift 127-141 天）。
- [ ] **【2026-08-29 開出｜中】`system-health-check.ps1` 7)deploy-drift(:520) 與 9)cloudflare(:~610) 兩個 check 從未真正執行過** — 同一 session 修 CP950 第三 class 時發現：`$root` 恆等於 `agency-os`（`Resolve-WorkspaceRoot` 的 monorepo guardrail），但 `check-deploy-drift.ps1` / `check-cloudflare-security.ps1` 只存在於 monorepo-root `scripts/`，從未存在於 `agency-os/scripts/`，故這兩個 `Join-Path $root "scripts/..."` 恆指向不存在路徑，`Test-Path` 恆 false，兩個 check 永遠走 `Pass=$true "Skipped: ... not present"` 分支——跟 7b（CP950 parse-break）2026-05-30 上線後從未真正跑過是同一款缺陷，本次已修 7b/7c（改用 `$monoRoot`），這兩個刻意未動（不同 check，需各自驗證改用 `$monoRoot` 後的實際輸出是否正確，不能照搬 7b/7c 的 fail-closed 處理，因為這兩個目前是 informational/warn-only 不是 hard gate）。
- [ ] **【2026-08-25 開出｜小｜非阻塞】CP950 backlog 其餘 84 個 site：套用 ao-close 那套分類法** — 2026-08-25 關掉 27 個（`ao-resume.ps1` 17／`lib/git-safe-ops.ps1` 4／`ao-close.ps1` 6），repo-wide drift 111→84。
- [ ] TASKS [x] 自動歸檔 + 重複行偵測閘（archive-completed-tasks.ps1，**R0 已批方案A**，照 packet 直接動工免重提案）→ handoffs/2026-06-11-1738-tomo-173818.md
- [ ] **smoke 04-onboard spec 補 app session 登入**：`95e80904` login hard-nav 後未登入導登入頁，spec 只帶 nginx basic-auth → 永久 fail。修法＝spec 加 app 登入步驟（Email/密碼從 env），或改用 `x-ops-sync-key` header。佐證 WORKLOG 2026-06-11 部署段。
- [ ] **【進行中｜Phase 1 ungated 全完成，剩 T10 gated】Cold Outreach Workbench — 冷開發完整鏈** — SSOT：[`agency-os/docs/cold_email/COLD_OUTREACH_WORKBENCH_INTEGRATED_SPEC_v1.md`](docs/cold_email/COLD_OUTREACH_WORKBENCH_INTEGRATED_SPEC_v1.md)（三份草稿已整合並 superseded）；實作排程：[`COLD_OUTREACH_PHASE1_BUILD_PLAN.md`](docs/cold_email/COLD_OUTREACH_PHASE1_BUILD_PLAN.md)（T1–T12 依賴排序）。
- [ ] **【進行中｜軟體先行·U0–U5 + widget U4 完成並 prod live，剩 U6 gated】全自動客服系統**
- [ ] **【進行中｜POD 一鍵自動上架】設計圖 → Woo + Printful 多款多色全自動** — 計畫 SSOT = `lobster-factory/docs/PLAN-pod-one-click-auto-publish-design-to-woo-printful.md`（5 階段）。目標：操作者**只做設計圖**、一鍵自動 合成商品圖(白背/2模特/平拍,分長短袖,<100KB) + 建 3 款 Woo 草稿(Gildan 2400 **長袖** id57 / Stanley-Stella STTU169 id456 / Gildan 5000 id438，各 4 色 × S-2XL) + Printful native 建品綁設計稿。
- [ ] **【進行中｜內容引擎積木化】搜尋積木 registry 已 live，剩來源/UI/第二批** — ✅ **已完成並部署（2026-06-16，commit `e336d5da`）**：後端積木註冊骨架 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/blocks/registry.ts`（`register/byKind/listAll/geoMatch` + `ContentBlock` 契約，前端 `AB.registerBlock` 後端鏡像）+ 搜尋家族 5 source 自註冊 `lib/content/trending-sources.ts`（google-news/reddit/ptt/perplexity/env-custom-rss）+ 契約 SSOT `lib/content/blocks/README.md`（修好 `public/vector-editor.html:902` 斷裂參照）。
- [ ] **wp-bridge plugin 補 `/product` dry_run 支援**：現只有 /option 有（RestController:167）；2026-06-11 一鍵上架測試因此真建了 draft #7164。plugin 端改 → bump AWBRIDGE_VERSION → release flow（WP-BRIDGE-RELEASE-RUNBOOK）。
- [ ] **wp-bridge 續做 operation：featured image** / update-existing-post / product update+delete（v0.7.0 只做 product CREATE，其餘端點仍待補）。
- [ ] **【POD Studio 自建動工】** plan=`.claude/plans/pod-studio-p2a-p4-execution-PLAN.md`；藍本=`lobster-factory/docs/POD_STUDIO_ROADMAP.md`。✅
- [ ] **【POD 服飾 Phase 1-4 後續｜2026-06-15 已部署 37dfba85】** 服飾 POD 全功能（忠實印刷檔 / Printful 多風格+真人模特 mockup+存圖庫 / 平拍真實 overlay 雙軌 / 台灣本地印刷檔 seam / AI 商品文案 SEO-GEO-AEO-RankMath）已 **live on app.aware-wave.com**（smoke 24 pass）。剩餘未做：
- [ ] **🎨 Image Output Pipeline**（SSOT: `lobster-factory/docs/PLAN-tarot-pod-image-output-pipeline-plus.md`）Tarot/POD: 色調→WebP/CMYK PDF(Japan Color 2001 Coated)/Fabric.js Canvas；Printful 走 sRGB `upscaler.ts` 不動；Canva Phase 1.5 POC
  - [ ] **[5-a~d]** Canva API POC → OutputTrackBar 接線（plan §17）
  - [ ] **Phase 2** customer-facing Canvas + WooCommerce + Printful；整副牌多頁 PDF（PrintNinja offset）
- [ ] SEO/GEO 引擎產品化 + Soulful 定位/文章（2-Gem: onboarding+content；定位鎖定 Arts Practice for Self-Discovery / Arts-Based Reflective Pedagogy；填真資料→文章可發布；spec §49 errata 待補）→ handoffs/2026-06-06-2044-seo-geo-content.md
- [ ] wp-bridge 外掛：接進 app.aware-wave.com Ops Dashboard + aware-wave.com 展示頁 + 販售 → handoffs/2026-06-05-1948-wp-bridge-deploy-sell.md
- [ ] **【2026-06-05 開出】塔羅牌工具 → MEGA → WooCommerce 三階段路線圖**（操作者 2026-06-06 確認方向） — 終點：全部接 WooCommerce 賣貨（參考同事 jonjonesai 的 MEGA「Mass E-commerce Generator & Automator」Streamlit 工具：Research→Idea→Generate(多模型並行)→Select→Process(去背 removal.ai/Tinify)→Mockup(Printful)→Published(WooCommerce+Claude 文案+定價)）。
- [ ] **【進行中｜app.aware-wave 一鍵架站總藍圖】MASTER PLAN = `docs/operations/APP_AWARE_WAVE_PROVISIONING_MASTER_PLAN.md`**（5 階段路線圖 SSOT）。✅ Stage 0 建站引擎閉環已驗（run 655197bf completed + curl 200，2026-06-06）。
- [ ] **既有站接手（Soulful Expression Art Therapy）**
- [ ] `lobster-factory` A10-2 商業閉環實跑
- [ ] **【2026-05-30 開出】endpoint-alert.sh 自動化部署機制**
- [ ] **【2026-08-15 開出】SG dockerd/containerd 持續吃 CPU（2 核機器 load 3.2）**
- [ ] Auto-Repair Post-Phase 4 (M2 per-source HMAC + M4 fingerprint) — Batch 3 已完成（9f862d82）→ handoffs/2026-05-28-1807-batch-3-post-phase.md
- [ ] M2/M4 Phase 1 code 完成；剩 Phase 2 rollout + Phase 3 constraint swap + 3 side item（Phase4Weekly 錯 repo / incidents API 藏 open / 5 webhook 零流量）→ handoffs/2026-06-05-2017-tomo-201752.md
- [ ] **Hetzner dispatcher 上線前 follow-up（啟用 LOBSTER_EXECUTE_* 前必做，現 gated OFF）**：
- [ ] **【READY，未做】把 Hetzner 一鍵租機嵌進 app.aware-wave.com 一鍵架站按鈕（Phase 5）** — 程式+真機已驗過，**直接呼叫 `provisionClient()` 勿重寫**。recipe：`lobster-factory/docs/hosting/EMBED_PROVISION_INTO_APP.md`（app 端 `onboarding/trigger-build/route.ts` 頂部已留指標）。等 app 校正完再接。
- [ ] **【計畫完成，未實作】客戶機「開機後全棧部署+維護」層（provider 無關）** — 讓新機/客戶自帶機自動部署成 production 等級（Docker+Grafana/Loki/Netdata/Sentry+快取+swap+備份+限速/WAF/fail2ban）。
- [ ] app.aware-wave onboarding/provisioning IA 重整 — Phase 1 退役 ops-console（已規劃、Q1-Q3 已決、未動 code）+ verify intake 觸發建站 + Phase 2/3 → handoffs/2026-06-05-2028-onboarding-ia-consolidation.md
- [ ] **【🟠 Major M2-M4/M7-M10 + 🟡 Minor m2-m6/m8-m11】**
- [ ] **【2026-08-29 開出，同日更正】nginx system-sites 三檔 drift（🟢 小，SG 那半已作廢，只剩 EU 兩檔待抄）**
- [ ] **【已知風險｜操作者已決定不輪換｜2026-08-17】`~/.codex/config.toml` 明文憑證** — 該檔以明文存約 30 組正式憑證（Supabase `service_role`、Hetzner API token、Cloudflare API token、Resend、Slack、Sentry、n8n、Grafana 密碼、Trigger prod token 等）。2026-08-17 稽核 Codex 設定時另被印入 session transcript（transcript 保留期已於 `75512998` 改為 365 天）。
- [ ] **【已知缺陷｜第三方 plugin，不在本 repo｜2026-08-25 開】`stop-review-gate-hook.mjs` 的失敗訊息會遮住真正原因** — `~/.claude/plugins/cache/openai-codex/codex/1.0.6/scripts/stop-review-gate-hook.mjs:121` 寫 `String(result.stderr || result.stdout || "")`。

## 2) TASKS.md - Backlog (unchecked)
- [ ] 建立跨國稅務與法遵顧問審核流程（法律文件外部審核）

## 3) Lobster Factory Master Checklist - open items (sections A-C, before section D)
- [ ] A7. 串接 WordPress 真正 provision/shell execution（仍須 guardrails；**manifest 套用 shell 已具備**，全站自動建站仍待 hosting adapter）→ 對應 v1.2 Phase 4
- [ ] A10-2. **商業閉環**：新客戶從建立→驗收 + 生產 Trigger 全鏈固定證據（對齊 `agency-os/tenants/NEW_TENANT_ONBOARDING_SOP.md` 實跑）→ 對應 v1.2 Phase 4 + Section 8
- [ ] A11. **制度治理層**（v2.0 新增）：補齊 v1.2 新增 12 個制度章節對應的 schema、policy、docs → 見 C6、C7
- [ ] **C5-1.** Observability：Sentry（錯誤追蹤）+ PostHog（產品分析）→ v1.2 Phase 7
- [ ] **C5-2.** Edge/Security：Cloudflare（WAF/CDN/Rate limit）→ v1.2 Section 3 + 22
- [ ] **C5-3.** Secrets：1Password Secrets Automation（或同級）→ v1.2 Section 3 Secrets Manager
- [ ] **C5-4.** Identity/Org：Clerk/WorkOS/Auth0（三選一）→ v1.2 Section 15.1
- [ ] **C5-5.** Cost/Decision：成本與決策引擎可觀測化（budget/ROI guardrails）→ v1.2 Section 25 + 36
- [ ] **C5-6.** 後續建議：Langfuse / Upstash / Stripe / Object Storage / Search
- [ ] **C6-1.** Canonical Naming Policy 文件 + 命名 audit script
- [ ] **C6-2.** Environment & Release Policy + Change Freeze 機制
- [ ] **C6-3.** Backup & DR Policy + restore 測試程序
- [ ] **C6-4.** Idempotency Keys + Resource Locking
- [ ] **C6-5.** Plugin Registry + Plugin License Governance
- [ ] **C6-6.** Domain / DNS / Email Deliverability Policy
- [ ] **C6-7.** Testing Strategy — Contract Tests for ProviderAdapters
- [ ] **C6-8.** Client Data Lifecycle + Offboarding Workflow
- [ ] **C6-9.** Cost Allocation + Profitability Snapshots
- [ ] **C6-10.** Client Communication Policy + Notification Templates
- [ ] **C6-11.** Architecture Decision Records（第一批 10 個）
- [ ] **C6-12.** Known Conflicts Log 文件（跨版本矛盾追蹤）
- [ ] **`0010_release_freezes.sql`**（C6-2）
- [ ] **`0011_restore_runs.sql`**（C6-3）
- [ ] **`0012_idempotency_and_locks.sql`**（C6-4）
- [ ] **`0013_plugin_registry.sql`**（C6-5）
- [ ] **`0014_domains_dns.sql`**（C6-6）
- [ ] **`0015_client_offboarding.sql`**（C6-8）

*Checklist path:* `D:\Work\lobster-factory\docs\LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md`

## 4) memory/CONVERSATION_MEMORY.md (excerpts)

### Today (2026-03-30 晚) — Cursor 規則與外掛
- 落地 **`00-CORE.md`（完整）+ `63.mdc`（精簡 alwaysApply）**；**`sync-enterprise-cursor-rules-to-monorepo-root.ps1`** 掛入 **`verify-build-gates`** 與 **`doc-sync`**；health **343** 檔包含 monorepo 根 **`63–66`** SHA256 對齊。
- **1Password**：專案採 **DPAPI vault + env/mcp**；已刪 Cursor **`plugins/cache/.../1password`**；請於 IDE **停用**外掛免再載入。

### Next Step
- 與客戶確認 `2026-001` Discovery 阻塞項（決策者/窗口、品牌定位、CR 估價基準、權限交付）
- 以新客戶實跑一次 `NEW_TENANT_ONBOARDING_SOP` 並微調
- 盤點並輪替曾出現在文本中的 API keys/token
- 先選 1 家公司完成真實資料填寫與第一案啟動
- 將 Defender 排程固定到夜間，避免白天高噪音
- 以系統管理員身分套用 Defender 排程變更（目前權限不足）
- `company-a` 真實資料填寫與流程實跑（CR/排程/報告/守護）
- 在 `README.md` 首頁加入 `AO-RESUME` / `AO-CLOSE` 快速操作卡
- 進行一次完整「開工 -> 收工」演練並回寫 WORKLOG

### Today (2026-03-25) - 重點進度
- 已修復會話記憶檔案遺失：恢復 `agency-os/memory/CONVERSATION_MEMORY.md`（確保 `AO-RESUME/AO-CLOSE` 快速操作卡仍可用）
- 已建立 `lobster-factory` 的 Phase 1 工程骨架（先安全、可驗證、可逐步接上真寫入）
  - Supabase migrations：`packages/db/migrations/0001_core.sql` ~ `0006_seed_catalog.sql`
  - Manifest：`packages/manifests/wc-core.json`（Phase 1 目前只支援 `wc-core`）
  - Durable workflows（Trigger.dev 風格骨架）：
    - `packages/workflows/src/trigger/create-wp-site.ts`
    - `packages/workflows/src/trigger/apply-manifest.ts`
  - 安全與治理：
    - `scripts/validate-manifests.mjs`、`scripts/validate-governance-configs.mjs`
    - `scripts/bootstrap-validate.mjs`（整體健檢基線）
- 已修復 `agency-os` 的 Critical Gate FAIL：在 `agency-os/.cursor` 建 junction 指向 `D:\Work\.cursor`
- 已完成跨電腦 pull 相容修正：`system-health-check.ps1` 新增 `.cursor` 規則路徑 fallback（`agency-os/.cursor` 缺失時可改由 `../.cursor` 驗證）
- 已完成 AO-CLOSE 收工檢查三步：doc-sync / health / guard 全 PASS（最新 health score 100%，Critical Gate PASS）
- 已重讀 `docs/spec/raw` 三份 master 規格並完成差距盤點；已把缺口回寫到 `lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md`
- 已完成 raw spec 差距第一批落地（C4-1~C4-3）：
  - `templates/woocommerce/scripts/install-from-manifest.sh`
  - `templates/woocommerce/scripts/smoke-test.sh`
  - `infra/github/workflows/validate-manifest.yml`
- 已完成 raw spec 差距第二批落地（C4-4~C4-5）：
  - `infra/n8n/exports/client-onboarding-flow.json`
  - `docs/ROUTING_MATRIX.md`
- 已新增 C1-1 寫入驗證腳本：`lobster-factory/scripts/validate-workflow-runs-write.mjs`
  - 預設 dryrun（安全）
  - `--execute=1` + Supabase env 時可執行 `workflow_runs` 真寫入驗證
- 已新增 C1-2 狀態流驗證腳本：`lobster-factory/scripts/validate-package-install-runs-flow.mjs`
  - 預設 dryrun（安全）
  - `--execute=1` + Supabase env 時可執行 `package_install_runs` 的 pending -> running -> completed 流程
- 已完成 C1-3 第一版：DB 寫入韌性（重試/補償/可觀測）
  - `supabaseRestInsert` 已加入 retry/backoff + traceId header（`x-lobster-trace-id`）
  - 新增 `lobster-factory/scripts/validate-db-write-resilience.mjs`（dryrun/execute）
- 已新增 C1 一次性實戰流程文件：`lobster-factory/docs/C1_EXECUTION_RUNBOOK.md`
  - 固定順序：dryrun -> execute -> acceptance -> rollback-safe handling
- 目前已確認缺口（尚未實作）：
  - Enterprise 工具層（Sentry/PostHog/Cloudflare/Secrets/Identity）

### Remaining - 需要接下來做完的事（依序）
1. ~~為 `lobster-factory` 接上「只寫 `workflow_runs`」的真寫入流程~~（C1-1 已 execute PASS）
2. ~~接上 `package_install_runs` 的狀態更新~~（主線 C1-2 PASS：`206bd6ee-f5e0-4b6a-810c-bbb9914844f4`；公司桌機複核：`ae8c6e48-fac9-4ac6-8721-d142c831c620`；failed/rolled_back 產品化仍待補）
3. ~~C1-3 DB 寫入韌性 execute~~（主線已 PASS，見 checklist）
4. 把 `apply-manifest` 的 shell 執行器真正串上（仍需維持 `staging-only` + guardrails），並確保 rollback 可用
5. 接回 `create-wp-site` 的 staging 環境建立流程（需要後續 hosting provider adapter）

### Tomorrow (2026-03-26) - 建議第一優先
- 先跑一個 end-to-end「乾跑」payload（不寫 DB），確認回傳的 SQL template + row payload 完整且欄位對齊
- 再開啟真寫入一次（建議只開 `LOBSTER_ENABLE_DB_WRITES=true` 並先寫 `workflow_runs`），用你手上的 Supabase UI 查表插入是否正確
- 把所有「驚險步驟」都留在人機核可/approval 設計裡，不允許 production 自動執行

### Today (2026-03-30) - Lobster C1-2
- `validate-package-install-runs-flow.mjs --execute=1`：PASS（`installRunId=ae8c6e48-fac9-4ac6-8721-d142c831c620`，`workflowRunId=73c91be3-3663-4977-aa9a-4c2b7e24dd97`，flow pending→running→completed）。
- `bootstrap-validate.mjs`：PASS。主檢查清單 **C1-2** 已勾選。

### Today (2026-03-26) - AO-CLOSE（歷史快照；**現行順序**見 **`.cursor/rules/40-shutdown-closeout.mdc` 第 2 步**）
- **`AO-CLOSE` 關鍵字與四段收工回覆格式不變**；**monorepo 根 `scripts/ao-close.ps1`** 為正本（**`agency-os/scripts/ao-close.ps1`** 為 thin wrapper）。**現行**另含：**`print-today-closeout-recap`**、**`apply-closeout-task-checkmarks`**（**WORKLOG `AUTO_TASK_DONE`**）；閘道仍為 **`verify-build-gates` → `system-guard` → `generate-integrated-status-report`**；push 前 **`git fetch`**／落後攔截；旗標見 **`end-of-day-checklist`**。
- AO-CLOSE 預設新增硬門檻：`system-health-check` 分數需為 **100%**，未達 100% 直接視為收工未完成（需修復或經使用者明確授權才可放寬）。
- **他處電腦開機**：固定閱讀 **`docs/overview/REMOTE_WORKSTATION_STARTUP.md`**（**§1.5** 新機、**§2** 例行；與 `RESUME_AFTER_REBOOT.md` 分機情境）；綜合報告以 **`agency-os/reports/status/integrated-status-LATEST.md`** 為準。
- **報表路徑收斂**：腳本已加 monorepo guardrail，從 repo 根執行也會強制寫入 `agency-os/reports/*`；root `reports/*` 已退役為相容用途。
- **2026-03-27**：使用者授權代理於不在現場時執行完整 AO-CLOSE（含 push），並落地上述須知文件。
- **Enterprise 工具層（C5）決策**：`Identity = Clerk`；`Secrets` 先採 `env/mcp`（1Password 因付費方案暫不採用）。
- **工具連通現況**：`Cloudflare`、`Sentry`、`PostHog`、`Slack`、`Clerk` 可用；`Supabase` plugin OAuth 回傳 `Unrecognized client_id`，暫以既有 `mcp.json` 連線運行。
- **Operator Autopilot**：已新增 `50-operator-autopilot` 規則與 Phase1 自動化（startup preflight / alert auto-repair / closeout optional push / Slack notify）。
- **Autopilot 佈署策略**：排程註冊若受限則用 Startup fallback（本機已安裝啟動項），確保無管理員權限也可運作。
- `AGENTS.md`、`.cursor/rules/40-shutdown-closeout.mdc`、`end-of-day-checklist.md`、`EXECUTION_DASHBOARD` 已對齊（一鍵與分部手動擇一）。
- 先前晚間收工：doc-sync（無新差異／沿用 `closeout-20260326-015712.md`）、health、`system-guard` PASS；當時約定 Git 次日處理。
- MCP：`mcp.json` 為伺服器設定；整庫同步以本機 **git** 為主。

### Today (2026-03-27) - V3 規格整合
- 已匯入新文件：`D:\Work\docs\spec\raw\LOBSTER_FACTORY_MASTER_V3.md`。
- 已建立可執行整合計畫：`D:\Work\lobster-factory\docs\LOBSTER_FACTORY_MASTER_V3_INTEGRATION_PLAN.md`（20 OS 模組映射、P0/P1/P2 優先順序、驗收訊號）。
- 已在 `lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md` 新增 `H) MASTER V3 整合追蹤`，作為後續落地與完成證據掛點。
- 目前執行策略：先不打斷 `C1-2`，維持 `C1-2 -> C1-3 -> V3 skeleton sprint` 順序。

### Today (2026-03-27) - C1-2 execute 完成
- `validate-package-install-runs-flow.mjs --execute=1` 已實跑成功（目標專案 URL 已切至可連通專案）。
- 結果：`installRunId=206bd6ee-f5e0-4b6a-810c-bbb9914844f4`，狀態流 `pending -> running -> completed`。
- 阻塞修復：補齊 `environments` fixture（`environment_id=555...`），並改用已存在 `workflow_runs.id` 作為 `workflowRunId`。
- C1 目前狀態：`C1-1 ✅`、`C1-2 ✅`、`C1-3 ⏳`（下一步）。

### Today (2026-03-27) - C1-3 execute 完成
- `validate-db-write-resilience.mjs --execute=1` 已實跑成功（以 vault 自動注入 Supabase env）。
- 結果：`ok: true`、`traceId=resilience-4c1b0ea6-84a3-4a8a-8c01-5ce648dd6099`、`insertedWorkflowRunId=77f43da0-6fc6-4ce6-bc3b-f3d139fc783c`。
- C1 目前狀態：`C1-1 ✅`、`C1-2 ✅`、`C1-3 ✅`，可進入下一主線（V3 skeleton sprint / C2）。

### Today (2026-03-27) - H3 skeleton sprint Batch 1
- 已完成 V3 缺口模組第一批骨架（Sales/Marketing/Partner/Media/Decision Engine/Merchandising）。
- 落地檔案：`0007_v3_skeleton_modules.sql`、`v3-skeleton.ts`、`v3-module-skeleton-workflows.ts`、`V3_MODULE_SKELETONS.md`。
- `LOBSTER_FACTORY_MASTER_CHECKLIST`：`H3` 已勾選完成。

### Today (2026-03-27) - H4 Decision baseline 完成
- 已完成 Decision Engine recommendations baseline：
  - migration：`0008_decision_engine_recommendations.sql`
  - contract：`decision-engine-baseline.ts`
- `LOBSTER_FACTORY_MASTER_CHECKLIST`：`H4` 已勾選完成。

### Today (2026-03-27) - H5 CX baseline 完成
- 已完成 CX retention/upsell baseline（與 `workflow_runs` 串接）：
  - migration：`0009_cx_retention_upsell_baseline.sql`
  - contract：`cx-retention-upsell-baseline.ts`
- `LOBSTER_FACTORY_MASTER_CHECKLIST`：`H5` 已勾選完成。

### Today (2026-03-27) - Zero-cost Secrets Vault
- 已落地免費本機祕密庫：`scripts/secrets-vault.ps1`（Windows DPAPI）。
- 預設儲存位置：`%LOCALAPPDATA%\AgencyOS\secrets\vault.json`（不入庫）。
- 操作方式已文件化：`docs/operations/local-secrets-vault-dpapi.md`。
- 既有政策與 runbook 已對齊（`security-secrets-policy`、`mcp-secrets-hardening-runbook`、`README`）。
- 已完成實際匯入：`mcp.json` 主要機密 + `LOBSTER_SUPABASE_*` + `AGENCY_OS_SLACK_WEBHOOK_URL`。
- 已新增復原手冊與揭示入口：`local-secrets-vault-dpapi.md` + `EXECUTION_DASHBOARD` + `REMOTE_WORKSTATION_STARTUP`。
- 已新增高頻「MCP 新增快速手冊」：`mcp-add-server-quickstart.md`，並掛到 README / Dashboard / Startup。
- 已加入長期溝通規則：後續操作一律用「去哪裡 / 做什麼 / 看到什麼」新手格式。
- 文件層也已對齊：`quickstart`、`修復`、`重灌` 都改為同格式步驟句。
- 已補 Autopilot 可見性：新增 `AUTOPILOT_PROGRESS.md` + dashboard/README 入口 + visibility 規則。
- 已追加長任務防呆規則：3 層防呆 + 每 15 分鐘心跳回報 + `進度?` 即時回覆。
- 已完成 `H6` baseline：V3 合規/治理要求已轉為可執行 gate（policy + runner + bootstrap 整合 + 文件）。
- 已完成 `C3-3` baseline：新增 PR release gate + prod deploy 前 gate（未過 gate 不執行 deploy）。
- 已進入 `AO-CLOSE`：收工前四檔進度同步已完成，下一步執行 `scripts/ao-close.ps1`。
- Trigger 經過多輪修復後已收斂：GitHub Actions deploy 成功、`project ref` 對齊、缺失 `uid` 已補、Cursor `user-trigger` MCP 的 `--api-key` 錯參數已修正為 vault 啟動腳本路徑。
- 已落地工具路由治理：新增 `MCP_TOOL_ROUTING_SPEC.md` 與 `workflow-risk-matrix.json`，固定 Trigger / n8n / GitHub / Supabase / WordPress 的強制分工與風險邊界。
- 已落地 `WORDPRESS_FACTORY_EXECUTION_SPEC.md` 細部規格（固定執行步驟、approval gate、rollback、audit trail）。
- 已將 WordPress Factory 規範轉為可執行 gate：新增 execution policy JSON + routing validation script，並納入 `bootstrap-validate` 與 `npm validate`。

### Today (2026-03-28) - 報表路徑收斂 + AO-CLOSE
- 已落地報表單一路徑：所有入口強制寫入 `agency-os/reports/*`，root `reports/*` 退役；commit `5128e7d`（收工腳本會一併 push）。
- 使用者關切：Cursor `user-copilot` MCP 認證重試迴圈不會等同模型 token 計費，但會耗少量本機資源；可停用該 MCP 項止刷 log。
- 收工：執行 `AO-CLOSE`（`ao-close.ps1`）完成 verify + guard + integrated status + push。
- **Git 節奏（2026-03-28 紀錄；已 superseded 2026-04-02）**：當時共識為「平常不主動 commit」——已改為 **§2.5**：里程碑本機 checkpoint + **AO-CLOSE** push。請勿再以本行為準。

### Today (2026-03-28) - Lobster operator bundle（營運套裝）
- `lobster-factory`：`npm run operator:sanity`（`validate` + `regression:staging-pipeline`）、`npm run payload:apply-manifest`（`print-apply-manifest-payload.mjs`）。
- 操作手冊：`lobster-factory/docs/operations/LOBSTER_FACTORY_OPERATOR_RUNBOOK.md`；README 頂部已掛「營運一鍵」。
- 閘道：`bootstrap-validate` 與 `validate-workflows-integrations-baseline.mjs` 已納入上述檔案與字串檢查；`npm run validate` PASS。

### Today (2026-03-29) - 續接驗證
- 使用者「好」＝執行：`git pull`（up to date）、`verify-build-gates` PASS、health **100%**（`health-20260329-221913.md`）、`npm run operator:sanity` PASS。

### Today (2026-03-28) - AO-CLOSE（晚）
- **AO-CLOSE** 完成：`verify-build-gates` PASS、health **100%**、`system-guard` PASS、integrated-status 已產出；**Git** `e04be6f` 已 **push `main`**。

### Today (2026-03-28) - A10-2 前置（SOP Step 7 + presign 範例）
- `NEW_TENANT_ONBOARDING_SOP` Step 7、presign 範例 JSON、`PRESIGN_BROKER_MINIMAL`；operable gate 綁定 monorepo SOP。

### Today (2026-03-28) - Lobster A10-1 + A9 policy
- `OPERABLE_E2E_PLAYBOOK.md`、`validate-operable-e2e-skeleton.mjs`（bootstrap）、`ARTIFACTS_LIFECYCLE_POLICY.md`；`MASTER_CHECKLIST` A10-1/A10-2、A9 更新敘述。

### Today (2026-03-28) - Monorepo spine + dashboard refresh
- Repo 根 `README.md`（AO + Lobster + `verify-build-gates`）；`EXECUTION_DASHBOARD` §2 去過期；`MASTER_CHECKLIST` A6/B5 對齊 `http_json`／`remote_put`；`verify-build-gates` + doc-sync PASS。

### Today (2026-03-28) - Lobster A9 remote_put artifacts
- `LOBSTER_ARTIFACTS_MODE=remote_put` + `REMOTE_PUT_ARTIFACTS.md`；presign URL 或 inline JSON；`apply-manifest` 寫 `logs_ref` 行為與 local 一致。

### Today（補登）- 規格原文目錄 `docs/spec/raw`
- 使用者出示 **檔案總管**：`D:\Work\docs\spec\raw\` 內四份 **.md** 為設計**原文**（含 **`LOBSTER_FACTORY_MASTER_V3`** 內 Agency OS **20 個 OS 模組** 圖，即跨國企業級職能拆分來源）。已在 monorepo 根新增 **`docs/spec/README.md`** 索引，並在根 **`README.md`**、**`agency-os/README.md`** 加上導覽；說明其與 **`MCP_TOOL_ROUTING_SPEC`**（少列＝執行閘道）為不同層級。

### Today (2026-03-30) - cursor-mcp inventory：純 Supabase／SoR 敘述
- `docs/operations/cursor-mcp-and-plugin-inventory.md`：使用者要求 **本檔不出現任何第三方表格式工具名稱**；已刪除該列與所有相關段落／SSOT／Related 連結。**supabase** 兩欄改為**自足**寫法：平台 SoR、RLS／Storage／Webhook、MCP 與 `read_only` 邊界、以及對 [`MCP_TOOL_ROUTING_SPEC`](../../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md) 中 Trigger／n8n 分工的對齊。**`change-impact-map`** 已取消本檔 ↔ migration playbook 的強制連動（health 仍 100%）。

### Today (2026-03-28) - Lobster `http_json` hosting
- `LOBSTER_HOSTING_ADAPTER=http_json` + `HTTP_JSON_HOSTING_ADAPTER.md`；`provisionHttpJsonStaging`；`create-wp-site` 支援 `vendor_staging_provisioned` 與 `vendorStaging`；`resolveStagingProvisioning` 為 async。
- **互動偏好**：可驗證範圍內代理自主推進、減少選項式追問；不可逆決策仍單點確認。

### Today (2026-05-08) - SG deploy drift 根因排除 + 機械化 + 自動告警
- **症狀**：`app.aware-wave.com` sidebar 預期 7 項只看到 5 項（缺 New Client / Build Console）。
- **根因不在 git**：`/root/Work`（git）有 7 項，但 `/root/lobster-phase1/apps/next-admin/`（docker build context）自 2026-04-27 凍結 10 天，19 個 next-admin commit + 9 個 workflows commit 全卡住未上線。SG 兩個目錄無自動同步機制是長期 bug。
- **Server 落地**：`/root/lobster-phase1/scripts/sg-deploy.sh`（rsync git→staging，`--exclude='.env*'` 保留本機機密，build + up + 寫 `.deployed-commit`）；`/root/lobster-phase1/scripts/check-drift-and-alert.sh`（每日 01:00 UTC cron，dedupe，curl 既有 Slack webhook）。
- **Client 落地**：`scripts/check-deploy-drift.ps1`、掛 `system-health-check.ps1` §7（warn-only）；`.claude/commands/sg-deploy.md`、`.claude/commands/check-drift.md` 兩個 slash command。
- **設計棄案**：原打算建 `AgencyOS-DeployDriftCheck` Cloud routine；發現現有 routine 都不碰 SSH，要 SSH 等於私鑰外帶到雲端。改 SG 本地 cron 後，零雲端依賴、私鑰永不出 SG，30 年穩固性更佳。
- **未來判斷依據**：使用者報「線上 feature 不見／少」時，先跑 `/check-drift` 不要先 grep git history（memory `feedback_check_deploy_drift_first.md`）。
- **使用者桌面 `AWARE_WAVE_CREDENTIALS.md` §24** 仍有 EU/SG 描述錯誤（next-admin 在 SG 不在 EU）；不在 git，候授權後代修。

### Today (2026-05-13 晚) - Anthropic API 成本診斷與修復
- **症狀**：使用者發現 Feb 23 買的 $5 API credits 耗盡，不記得有用 API。
- **根因**：(1) `ANTHROPIC_API_KEY` 被 vault-sync 推入 Windows 使用者環境變數，Claude Code 看到後優先走 API Key 計費，忽略 Max 訂閱。(2) repair-center GitHub Actions 在建置/測試期間多次以 `--max-turns 30` 呼叫 Claude → 3.1M tokens ≈ $10。
- **修復**：移除 Windows 使用者環境變數中的 `ANTHROPIC_API_KEY`（`SetEnvironmentVariable(..., [string]::Empty, 'User')`）；Claude Code 改走 Max 訂閱。repair-center 使用 GitHub Secrets，不受影響。
- **降成本**：`auto-repair-claude.yml` `--max-turns 30` → `15`，降低每次 repair job 約 40-50% token。
- **注意**：vault-sync 下次執行可能重推 `ANTHROPIC_API_KEY` 到 Windows env，需監控或排除。Cursor（免費額度）/ Codex / Gemini 不走 Anthropic API 帳戶，無問題。

> Full runbook: see `## Runbook Commands` in the source file.

## 5) memory/daily/2026-08-29.md
# Daily Note - 2026-08-29

## Done today
(fill in at AO-CLOSE)

## Current state
(fill in at AO-CLOSE)

## Next steps
(fill in at AO-CLOSE)

## Open tasks (auto-generated at 08:00 TPE)
- [ ] **【⚠️ 逾期 69 天｜原排 2026-06-17｜資安複盤】Defender 嚴重木馬 `Trojan:Win32/PowhidSubExec.B` 來源查清與善後**
- [ ] **【未開始｜2026-08-25 開｜到期日 2026-08-31】重新啟用 Codex stop-time review gate**
- [ ] **🔴【資安】2026-08-27 `HF_TOKEN` 明文進入對話紀錄 — 待輪換**
- [ ] **⏭️ Soulful 搬站：機器買到後的接手點（硬死線 2026-11-12，買機死線 9/30）**
- [ ] **🔴【硬死線 2026-11-12】Soulful 網站搬離 Hostinger（hosting 不續約，操作者 2026-08-15 決定）**
- [ ] **【人工｜Postiz Task 2 OAuth app 審核】各平台 dev app 提交**
- [ ] **【人工｜Postiz 測試草稿清理】**
- [ ] **【操作者｜Postiz 帳號 → 客戶 Hub 連結】**
- [ ] **既有站接手 Day 1（Soulful Expression）**
- [ ] **【診斷】Mockup Studio 功能異常 — server-side 已排除（2026-06-16），卡操作者症狀**
- [ ] **【驗證債】Canvas 編輯器 `/tools/canvas` 整輪瀏覽器實測**
- [ ] **【POD A1 已完工｜剩 e2e + A2】**
- [ ] **【POD A2 confirm phase — 🔴 金流紅線，測試結束 + 操作者明示批准才做】**
- [ ] **【未開始｜待使用者明確下指令】會議服務網路版安裝**
- [ ] **（出國前必做）Termius 手機 SSH 設定 + cheat sheet 書籤**
- [ ] **【已知限制｜2026-08-25 開｜2026-08-31 自動解除】Codex 額度耗盡，跨模型 oracle 路徑不可用**
- [ ] **【gated｜8月｜等買二手機才繼續建 customer service U6 Chatwoot】**
- [ ] **【gated｜8月｜EU→Dedicated 搬機 + 整併退雲端】**
- [ ] **蒙古客戶 Cloudways 實際建站**：待客戶刷卡配合
- [ ] **新站建置（Scenery Travel Mongolia）**
- [ ] **新站建置 Day 1（Scenery Travel Mongolia）**
- [ ] **Next-Gen 試點 — Day 2 雲端 staging 實機驗收（~~兩案~~ → 僅剩 Scenery）**
- [ ] `tenants/templates/` v2
- [ ] **🟠 EU origin 仍未鎖 Cloudflare（步驟 A 已完成，B 待做）**
- [ ] **【2026-08-26 開出｜我自己留下的漂移風險】`cloudflare-realip.conf` 的網段清單是靜態的，無偵測器**
- [ ] **【2026-08-26 開出｜🔴 客戶站已破圖｜刪影片會靜默弄破已發布的文章】`video/[id]` DELETE 無引用檢查**
- [ ] **【2026-08-26 開出｜小】R2 裡 8 個 `remotion/` 物件（~200MB）從未被任何對帳涵蓋**
- [ ] **【2026-08-26 開出｜等一個決定】R2 `video/蒙古旅遊___熱情分享型主持人稿/4x5.mp4` 是真孤兒（23MB）**
- [ ] **🔴 EU 的保留政策把「還原演練證明過的備份」刪掉了**
- [ ] **【2026-08-26 開出｜已知風險｜操作者決定不處理】WPvivid 的 Google Drive refresh_token 曾進入對話紀錄**
- [ ] **`cf-iprefresh` 偵測器已 error 14 天，而且沒有任何讀者**
- [ ] **【2026-08-25 開出｜類別級重設計】影片歸屬改為持久化 `outName → organization_id` mapping，停止從 object key 反解**
- [ ] **【2026-08-25 開出｜critic Minor 7 條｜2026-08-26 部分結案】影片管線租戶邊界收尾**
- [ ] **【2026-08-26 開出｜中】next-admin 沒有 DOM 測試基礎設施，接線層的 bug 測不到**
- [ ] **【2026-08-26 開出｜中】現存 10 個 staging 孤兒 / 1969.7 MB 待清理（拆除路徑已就緒，清理是決策）**
- [ ] **【2026-08-26 開出｜中】手動新增的站拿不到租戶歸屬**
- [ ] **MCP 執行期可用性偵測器：讀實際 connected/failed 計數，不再只驗設定檔語法**
- [ ] **`claude_desktop_config.json` 至今無人治理，且正握著 6 把明文 API key**
- [ ] **`codex-oracle.ps1 -Path` 一用就炸，等於大 repo 沒有可行的 review 路徑**
- [ ] **Cursor 散文殘留：10 份文件仍叫操作者「用 Cursor 開 monorepo 根」**
- [ ] **【2026-08-26 開出｜偵測器說謊｜第三顆】Phase 4 Check 1／Check 2 至少 12 週在回報假綠燈 —— 雲端容器沒有 `gh`**
- [ ] **建立 `detector-contract` audit class：偵測器必須申報「這輪量到什麼」**
- [ ] **Phase 4 雲端 routine 仍在解析已退役的 `restore_drill_due_after`**
- [ ] **`check-backup-health.ps1` 把「無法證明可還原」當成健康**
- [ ] **統一 TASKS 條目的標籤詞彙**
- [ ] **【2026-08-26 開出｜🔴 交叉污染｜第 4 個 `git add -A`】AO-CLOSE 的 `git add -A` 會掃走其他 session 進行中的檔案**
- [ ] **【2026-08-26 開出｜營運｜搬站前必處理】soulful 週備份近 10 次有 5 次失敗，最新一次就是失敗**
- [ ] **【2026-08-26 開出｜治理｜機械閘誤判】`verify-gate-commit.js` 對 Bash 指令做純文字比對，heredoc 內容含 `git commit` 就被 BLOCK**
- [ ] **【2026-08-26 開出｜治理｜✅ 根因已定位 2026-08-26】廣域 `git add -A` 把別的 session 未驗證的工作掃進不相干的 commit**
- [ ] **【2026-08-26 開出｜治理｜具名 add 也擋不住】兩個 session 編輯同一檔案時，`git add -- <file>` 一樣會帶走對方未提交的編輯**
- [ ] **【2026-08-26 開出｜小｜人體工學，非安全機制】`record-restore-drill` 一鍵記錄還原演練**
- [ ] **【2026-08-25 開出｜小｜文件一致性】Soulful staging「abandon」決策未傳播到 3 份仍在宣告它的文件**
- [ ] **【2026-08-25 開出】`ao-resume-last.txt` 錨點卡在 2026-06-12，AO-CLOSE 視窗計算長期失真**
- [ ] **【2026-08-24 開出】CHANGE_IMPACT_MATRIX 漂移偵測腳本首輪 7 個 WARN 待人工確認**
- [ ] **【2026-08-25 開出｜小】`scripts/rebuild-content-studio-4cards.ps1:185` CP950 parse-break**
- [ ] **【2026-08-25 開出｜小｜非阻塞】CP950 backlog 其餘 84 個 site：套用 ao-close 那套分類法**
- [ ] TASKS [x] 自動歸檔 + 重複行偵測閘（archive-completed-tasks.ps1，R0 已批方案A）
- [ ] **smoke 04-onboard spec 補 app session 登入**

## Yesterday context
最後 WORKLOG 記錄（2026-08-17）：自動週報代理生成 weekly summary，DOC_ONLY 操作，無程式碼改動。2026-08-28 daily note 含三筆 verify-recent --ack（ao-close-mem.py、netdata-close.py、dmarc-log.py、runbook-append-log.py scratchpad 一次性腳本，均執行成功）。

---
<!-- preserved from previous session -->

### verify-recent --ack (2026-08-28T16:43:39.9470212Z)

**Reason**: scratchpad one-shot patchers, already executed successfully with printed ok + grep-verified output (ao-close-mem.py conversation memory prepend / netdata-close.py TASKS+WORKLOG patch)

**Acknowledged unverified files** (count=2):

- `C:\Users\user1115\AppData\Local\Temp\claude\D--Work\4b82b3aa-3828-4251-9cd1-81fcad16e6ea\scratchpad\ao-close-mem.py`
- `C:\Users\user1115\AppData\Local\Temp\claude\D--Work\4b82b3aa-3828-4251-9cd1-81fcad16e6ea\scratchpad\netdata-close.py`


### verify-recent --ack (2026-08-28T16:47:02.1626466Z)

**Reason**: one-shot WORKLOG patcher dmarc-log.py, executed successfully (ok printed)

**Acknowledged unverified files** (count=1):

- `C:\Users\user1115\AppData\Local\Temp\claude\D--Work\4b82b3aa-3828-4251-9cd1-81fcad16e6ea\scratchpad\dmarc-log.py`


### verify-recent --ack (2026-08-28T17:02:14.5567896Z)

**Reason**: one-shot WORKLOG patcher runbook-append-log.py, executed successfully (ok printed)

**Acknowledged unverified files** (count=1):

- `C:\Users\user1115\AppData\Local\Temp\claude\D--Work\4b82b3aa-3828-4251-9cd1-81fcad16e6ea\scratchpad\runbook-append-log.py`


### verify-recent --ack (2026-08-29T00:20:56.9188451Z)

**Reason**: one-shot TASKS.md patcher domain-note.py, executed successfully (ok printed)

**Acknowledged unverified files** (count=1):

- `C:\Users\user1115\AppData\Local\Temp\claude\D--Work\4b82b3aa-3828-4251-9cd1-81fcad16e6ea\scratchpad\domain-note.py`


### verify-recent --ack (2026-08-29T00:45:40.5856867Z)

**Reason**: one-shot WORKLOG patcher studio-fix-log.py executed successfully (ok printed); runbook trap table edit is prose-only doc addition to an existing runbook, no logic change

**Acknowledged unverified files** (count=1):

- `C:\Users\user1115\AppData\Local\Temp\claude\D--Work\4b82b3aa-3828-4251-9cd1-81fcad16e6ea\scratchpad\studio-fix-log.py`


### verify-recent --ack (2026-08-29T01:10:59.1072082Z)

**Reason**: one-shot WORKLOG patchers (runbook-selfcheck-log.py, cf-ratelimit-log.py) executed successfully (ok printed); runbook edits are prose-only doc additions

**Acknowledged unverified files** (count=2):

- `C:\Users\user1115\AppData\Local\Temp\claude\D--Work\4b82b3aa-3828-4251-9cd1-81fcad16e6ea\scratchpad\runbook-selfcheck-log.py`
- `C:\Users\user1115\AppData\Local\Temp\claude\D--Work\4b82b3aa-3828-4251-9cd1-81fcad16e6ea\scratchpad\cf-ratelimit-log.py`


### verify-recent --ack (2026-08-29T01:37:20.1211936Z)

**Reason**: one-shot WORKLOG patcher nginx-routing-fix-log.py + debug-headers.php (temp diagnostic, deleted from container after use) + nginx default.conf edits (real-tested via curl 5x + browser screenshot + full 12-endpoint regression sweep, documented above)

**Acknowledged unverified files** (count=1):

- `C:\Users\user1115\AppData\Local\Temp\claude\D--Work\4b82b3aa-3828-4251-9cd1-81fcad16e6ea\scratchpad\nginx-routing-fix-log.py`

**[!] HIGH-RISK acknowledged WITHOUT full verification** (count=1):

- `C:\Users\user1115\AppData\Local\Temp\claude\D--Work\4b82b3aa-3828-4251-9cd1-81fcad16e6ea\scratchpad\nginx-routing-fix-log.py` -- **infra (nginx)** (auth/payment/RLS/migration/deploy class -- full verify was skipped)


### verify-recent --ack (2026-08-29T01:43:34.7068695Z)

**Reason**: one-shot WORKLOG patcher executed successfully (ok printed); runbook edits are prose-only doc additions with self-verified cross-references

**Acknowledged unverified files** (count=1):

- `C:\Users\user1115\AppData\Local\Temp\claude\D--Work\4b82b3aa-3828-4251-9cd1-81fcad16e6ea\scratchpad\runbook-nginx-fix-log.py`

**[!] HIGH-RISK acknowledged WITHOUT full verification** (count=1):

- `C:\Users\user1115\AppData\Local\Temp\claude\D--Work\4b82b3aa-3828-4251-9cd1-81fcad16e6ea\scratchpad\runbook-nginx-fix-log.py` -- **infra (nginx)** (auth/payment/RLS/migration/deploy class -- full verify was skipped)


### verify-recent --ack (2026-08-29T02:10:32.1578516Z)

_... 29 lines omitted._

## 6) LAST_SYSTEM_STATUS.md (appendix)
# System Guard Status

- Mode: `manual`
- Time: `2026-08-29 10:42:51`
- Health score: **100%**
- Threshold: **100%**
- Health gate exit code: **0**
- Closeout report exists: **YES**
- Result: **PASS**
- Auto-repair attempted: **NO**
- Auto-repair result: **N/A**

## Latest Reports
- Health: `reports/health/health-20260829-104247.md`
- Closeout: `reports/closeout/closeout-20260829-104251.md`

## Action
- No blocking issue detected.

## 7) WORKLOG.md tail (~60 lines)

**已修改**:
- `app/api/content/social-publish/route.ts` — POST：`clientId`（org UUID → `social_postiz_connections.client_id`）加 `assertOrgAccess(req, clientId)` after role gate + string validate
- `app/api/content/social-channels/route.ts` — GET：同樣呼叫 `listIntegrations(clientId)` → 加 `assertOrgAccess(req, clientId)` after query param validate
- `app/api/content/social-admin/connections/route.ts` — POST + DELETE：`clientId`（same FK）→ 各加 `assertOrgAccess(req, clientId)`
- `app/api/ops/integrations/route.ts` — POST：`organizationId` body param → 加 `assertOrgAccess(req, organizationId)` after `verifyOwnership`；PATCH：fetch record by `id` → 加 `assertOrgAccess(req, current.organization_id)` post-fetch

**guard 語意**：
- `staff`（`x-ops-user-kind` absent/staff）→ `assertOrgAccess` no-op，保持跨租戶管理能力
- `client`（`x-ops-user-kind: client` + `x-ops-org-id: <uuid>`）→ `targetOrgId ≠ ctx.orgId` 時 throw OrgAccessError → 403
- null/undefined targetOrgId 對 client fail-closed（`String(null)` = `"null"` ≠ real UUID）

**驗證結果**:
- REALTEST_EVIDENCE: tool=Bash | cmd=npx tsc --noEmit | exit=0 | ms=~8000 — 0 type errors
- REALTEST_EVIDENCE: tool=Bash | cmd=npm test --run | exit=0 | ms=1710 — 568/568 pass
- REVIEW_DONE: critic=Deep | verdict=pass | findings=0c/0m/0n — 6 focus areas all clean: guard ordering correct in all 4 files, null-safe inputs, assertOrgAccess null targetOrgId fails-closed, PATCH TOCTOU safe (immutable PK), no role-gate bypass path, all routes covered by middleware matcher
- BUGHUNT_DONE: scope=agency-os,scripts,lobster-factory | grep=listIntegrations,social_postiz_connections,tenant_integration_bindings | hits=1 new finding (social-channels was also calling listIntegrations with unguarded clientId → patched same batch; webhooks/tenant-integration has no clientId param — safe)
- WORKLOG: 本條目

---


### Agent dispatch log
- critic: Critic review hook runner v2
- Explore: 調查三個 ops 頁面真實狀態

## Related Documents (Auto-Synced)
- `.cursor/rules/00-session-bootstrap.mdc`
- `.cursor/rules/20-doc-sync-closeout.mdc`
- `.cursor/rules/30-resume-keyword.mdc`
- `.cursor/rules/40-shutdown-closeout.mdc`
- `docs/metrics/kpi-margin-dashboard-spec.md`
- `docs/operations/airtable-to-supabase-migration-playbook.md`
- `docs/operations/system-operation-sop.md`
- `docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`
- `docs/overview/30_YEAR_AI_CODING_EXEC_CHARTER.md`
- `docs/releases/release-notes.md`
- `tenants/NEW_TENANT_ONBOARDING_SOP.md`

_Last synced: 2026-08-24 19:21:02 UTC_

## 2026-08-17
- 自動週報代理：weekly summary 生成 → reports/weekly/weekly-summary-2026-08-17.md
  - REALTEST_WAIVED: DOC_ONLY -- automated report generation, no code change
  - REVIEW_WAIVED: DOC_ONLY -- report content verified against WORKLOG/TASKS source files
  - BUGHUNT_WAIVED: DOC_ONLY -- no code change














