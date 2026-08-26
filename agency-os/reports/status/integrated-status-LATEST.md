# Integrated status report (assembled)

- Generated: 2026-08-26 13:47:32
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
- [ ] **【⚠️ 逾期 69 天｜原排 2026-06-17｜資安複盤】Defender 嚴重木馬 `Trojan:Win32/PowhidSubExec.B` 來源查清與善後** — **來龍去脈**：2026-06-16 02:33:49 Windows Defender 跳出嚴重威脅，名稱 `Trojan:Win32/PowhidSubExec.B`；02:34:42 Defender 已執行「移除」，`ActionSuccess=True`，`CurrentThreatExecutionStatusID=0`。後續 Codex 已更新 Defender 病毒碼到 `1.453.108.0`，Quick Scan 於 02:59:26 開始、03:13:41 結束；`Get-MpThreat` 顯示 `Trojan:Win32/PowhidSubExec.B` 與 `Trojan:Win32/PShellDlr.HD!MTB` 皆 `IsActive=False`、`DidThreatExecute=False`，目前沒有 active threat。**來源證據**：Defender 的 `Resources/Path` 不是下載檔或 exe，而是一條命令列：`C:\Program Files\Git\bin\bash.exe` 載入 `C:\Users\user1115\.claude\shell-snapshots\snapshot-bash-1781544836335-9sl8s6.sh`，建立 `D:\tmp\realtest-reg.ps1`，再跑 `powershell -NoProfile -ExecutionPolicy Bypass -File "D:/tmp/realtest-reg.ps1"`。`.claude\bash-commands.log` 第 9296/9299 行與 `.claude\projects\D--Work\b0dfd505-590d-4b54-9b3a-52c275a46f87.jsonl` 對上同一事件：entrypoint=`claude-desktop`，session=`b0dfd505-590d-4b54-9b3a-52c275a46f87`，tool=`Bash`，permission_mode=`bypassPermissions`，description=`Syntax-check + run new registrar + verify both tasks hidden + run Daily`。**暫存腳本內容**：`D:\tmp\realtest-reg.ps1` 先 parse `D:\Work\agency-os\automation\REGISTER_SYSTEM_GUARD_TASKS.ps1`，再用 `ExecutionPolicy Bypass` 執行 registrar，查 `AgencyOS-SystemGuard-*` scheduled tasks，最後 `Start-ScheduledTask -TaskName "AgencyOS-SystemGuard-Daily"`。**目前判斷**：這比較像 Claude Desktop 自動化測試命令觸發 Defender 行為偵測，不像外部下載木馬；觸發特徵是「Git Bash + temp ps1 + PowerShell ExecutionPolicy Bypass + scheduled task + hidden launcher + Start-ScheduledTask」。但因為它確實碰到排程任務且 Claude session 是 `bypassPermissions`，明天仍需當正式資安事件善後。**明天處理步驟**：① 刪除暫存檔 `D:\tmp\realtest-reg.ps1`（刪前可保留 hash：`1D57CD353937BEEBEDFE37E40AAB987F14A8C1294FD9901D144F3E7E2D8C873D`，內容已在本 task 摘要）② 審 `D:\Work\agency-os\automation\REGISTER_SYSTEM_GUARD_TASKS.ps1` 與 `scripts\scheduled-task-launcher.ps1`，確認只註冊預期的 Daily guard、沒有 downloader/encoded payload/外連 ③ 查 live scheduled task：`AgencyOS-SystemGuard-Daily` 的 action 應只指向 repo 內 launcher + system-guard，且符合 `WindowStyle Hidden` / `scheduled-task-launcher` 預期；若有 `OnStartup`/`OnLogoff` 殘留或奇怪 action，移除或重註冊 ④ 決定是否調整 Claude hook/policy：`high-risk-bash-warn` 對 `ExecutionPolicy Bypass` + `Register-ScheduledTask` + `Start-ScheduledTask` 應升級為 block/explicit approval，不要只 warn ⑤ 若 Windows Security UI 仍顯示「開始動作」，按一次；若重開機後仍顯示，跑 Defender Offline Scan。**DoD**：暫存檔清掉；scheduled task action 驗證乾淨；Defender `Get-MpThreat` 仍 `IsActive=False`；WORKLOG 記錄本事件結論；必要時補 hook 阻擋規則，避免 AI 工具再次用 bypass 權限直接跑排程任務測試。
- [ ] **【未開始｜2026-08-25 開｜到期日 2026-08-31】重新啟用 Codex stop-time review gate** — 2026-08-25 05:08 UTC **暫時停用**（`node ~/.claude/plugins/cache/openai-codex/codex/1.0.6/scripts/codex-companion.mjs setup --disable-review-gate`，走官方開關非改檔；已驗證 `stopReviewGate: True → False`）。**原因不是它報錯，是它跑不起來**：Codex 用量額度用罄，job `task-mt87cnhq-4oqkk0` 回 `You've hit your usage limit ... try again at Aug 31st, 2026 12:41 PM`。認證正常（`ChatGPT login active`、`codex-cli 0.149.1`），純粹是額度。**為何停用而非留著**：閘每次收工都失敗，會訓練出「看到它失敗就略過」的習慣——那正是本日整場事故的核心機制（`Trigger infra config guard` 紅 10 天沒人看）。**額度是本日消耗的**：為第 5 次 ClickHouse 事故跑了四輪對抗式覆審（11 條 finding、10 條為真），是紀律的真實成本。**DoD**：2026-08-31 12:41 之後執行 `setup --enable-review-gate`，並實跑一次確認 `stopReviewGate: True` 且 review 能正常完成 → 打勾。**⚠️ 禁止**：因為「這樣比較順」而讓它保持停用；若 8/31 後額度仍不足，改為評估用量而非延長停用。
- [ ] **⏭️ Soulful 搬站：機器買到後的接手點（硬死線 2026-11-12，買機死線 9/30）** —— DNS/信箱/備份/演練皆已完成，**唯一阻塞是機器還沒買**。**規格已定案（2026-08-17）：128GB ECC / ≥8C16T / ≥1TB NVMe RAID1；首選 OVH KS-6 $59.80，Hetzner auction ≤€65（128G ECC + ≥2TB）則改選 Hetzner；~~觀望截止 8/31~~ **⛔ 該條已於 2026-08-18 被推翻**（見下）** —— 決策正本 [`reports/decisions/2026-08-17-dedicated-host-spec-upgrade.md`](reports/decisions/2026-08-17-dedicated-host-spec-upgrade.md)（取代 DR runbook §0b 機型表）。 **【訂正 2026-08-25】「觀望截止 8/31」已被 [`reports/decisions/2026-08-18-dedicated-host-purchase-timing.md`](reports/decisions/2026-08-18-dedicated-host-purchase-timing.md) 明文取代**（該決策 §「與 2026-08-17 的關係」表列 🔄 取代：決策規則第 1–3 條 + 觀望截止日）。**現行結論＝C6：立刻下單 OVH KS-6、用月租不簽 12 個月，觀望期改由月租的退出權承載，不由日曆餘裕承載**；理由是觀望的「獎品」（2TB 碟 + Robot/RMA，€445–484／3 年）在月租架構下未來 36 個月任一天都能買，不需拿死線餘裕當入場費。同時關閉前一份唯一未驗證項（Backup Agent 免費容量 → 移除依賴，備份一律走既有 R2）。**Pre-mortem 首要風險**：機器買了、soulful 也切了，但 EU/SG 整併從未完成，2028 年仍三台並存。
- [ ] **🔴【硬死線 2026-11-12】Soulful 網站搬離 Hostinger（hosting 不續約，操作者 2026-08-15 決定）** —— **【進行中】** Hostinger `Premium Web Hosting` $215.76/年，**自動續約已關閉**，**2026-11-12 到期**。什麼都不做 = 客戶網站當天下線。
      - [ ] EU①Supabase（**High-risk，需操作者本人在線**，六服務中風險最高、放最後搬）
      - [ ] EU②Trigger.dev（含 ClickHouse——**搬前先確認 `override.xml` 產生源設定已生效**，2026-08-19 在原機實測過這個坑，同一套修法要複製過去）
      - [ ] EU③n8n
      - [ ] EU④Postiz
      - [ ] EU⑤MainWP（Dashboard 端；child site token 需隨遷移重新確認連線）
      - [ ] EU⑥Uptime Kuma
      - [ ] SG⑦next-admin（app.aware-wave.com；DNS 見 DR runbook §5 SG 表）
      - [ ] SG⑧WordPress + WordPress-DB（一對搬，DB 緊耦合；apex/www 指向這裡）
      - [ ] SG⑨Node API（api.aware-wave.com）
      - [ ] SG⑩oracle-web（oracle.aware-wave.com；**✅ 2026-08-19 SSH 查證用途：真實產品「Oracle」紫微斗數命理 app**，`Projects/internal/ziwei-doushu/`，有 DNS+TLS+health check，非測試殘留——**搬遷時發現環境變數含明文 OpenAI API key，務必改走 vault 引用**）
      - [ ] SG⑪Redis（共用快取層，隨最後一個依賴它的服務一起搬，不單獨排波；**檢查現況是否有密碼，新機多服務共用建議補上**）
      - [ ] SG⑫觀測堆疊（Loki/Grafana/Promtail；**✅ 2026-08-19 SSH 查證用途：SG 主機自己的日誌監控**，loopback-only + SSH tunnel 存取，有正式文件 [`OBSERVABILITY_P1_P2_ROLLOUT.md`](docs/operations/OBSERVABILITY_P1_P2_ROLLOUT.md)，為防過去 502 事故而建——**要搬，不是退役項**；搬遷後 SSH tunnel 指令要改指新機 IP）
      - [ ] 兩台雲端主機確認已無流量 → 安全關閉 → 帳單確認只剩一台在計費（呼應 Pre-mortem「切換 +120 天仍 &gt;1 台在跑」的預警指標）
- [ ] **🔴【資安】2026-08-15 transcript 憑證外洩 — 三項待輪換** —— **【待操作者處理】** 本次 session 有三組憑證因我的疏失進入對話紀錄，若 transcript 會離開本機（雲端記錄／報告存檔）即視為外洩：
- [ ] **【人工｜Postiz Task 2 OAuth app 審核】各平台 dev app 提交** — Meta IG+FB（一個 Meta app，App Review，最高價值）/ Reddit / LinkedIn。callback = `https://postiz.aware-wave.com/integrations/social/<slug>`；client_id/secret 加進 EU `/root/postiz/.env`（`<PLATFORM>_CLIENT_ID/SECRET`）+ restart。**X 跳過**（API $100/月）。非 Claude 可做，等各平台審核通過再接線。
- [ ] **【人工｜Postiz 測試草稿清理】** 登入 `https://postiz.aware-wave.com` → Posts → Drafts → 刪 draft ID `cmqo1wijz0005p58ncl1mtssr`（Gate C 測試用，content 含「Delete this draft」）。
- [ ] **【操作者｜Postiz 帳號 → 客戶 Hub 連結】** `app.aware-wave.com/ops/clients/[slug]` → 社群頻道 tab → 點「連結」→ 選 Bluesky integration（soulfulexpression.bsky.social）→ 儲存。完成後 ContentStudio 才能看到 channel selector 顯示帳號。
- [ ] **既有站接手 Day 1（Soulful Expression）** —— **【進行中 2026-05-08】§1.2 ✅ §1.3 DB dump ✅**。§1.2 機讀基線完成（commit `b5cef4c`：WP 6.9.4 / PHP 8.2.30 / MariaDB 11.8.6 / Kadence 1.3.6 / 35 active plugins (16 有更新) / 2 admins / 138MB DB / 風險 Top 3）。§1.3 DB dump 完成（`soulful_db_20260508_160734.sql.gz`，15 MB，SHA256 `849db784…`，本機 + `BACKUP_RESTORE_PROOF.md #1`；restore drill 待 staging 建立後執行）。**仍開放（操作者必做）**：§1.1 帳號層級權限確認（Hostinger panel / DNS panel / WP admin browser login，純 SSH 無法驗證 panel-level access）。Day 2 staging 操作指引已備：`DAY2_STAGING_OPERATOR_GUIDE.md`；Day 3 更新計劃已備：`DAY3_SECURITY_PATCH_PLAN.md`。
- [ ] **【診斷】Mockup Studio 功能異常 — server-side 已排除（2026-06-16），卡操作者症狀**：操作者回報 mockup 有問題未提供細節（2026-06-13）。MockupStudio.tsx 實走 `/api/tools/studio/generate`（nano-banana-2 + referenceImages）。**本輪已排除（步驟③④完成）**：container `Up healthy` + full docker log **零 error**（generate/mockup/nano-banana 皆無）；Replicate token 實打 `/v1/account`=ok（非 429/402/auth）→ **server-side 健康，最常見因全排除**。**剩下（卡操作者）**：① 操作者給「什麼操作、什麼錯誤畫面、F12 console + network tab」②（拿到後）Claude 依 `file:line` 對症修 `MockupStudio.tsx`/`lib/studio/mockup-prompt.ts`/`app/api/tools/studio/generate/route.ts`。R0 紅線：不憑猜改 code。
- [ ] **【驗證債】Canvas 編輯器 `/tools/canvas` 整輪瀏覽器實測** — 整個 PS 功能目錄已全部 build+deploy（HEAD 含 `09b81ee4`/`5b73b77d`，tsc 0+build 0+critic 過），但**使用者尚未瀏覽器實測**（Claude 無登入 session 無法測）。主檔 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/tools/canvas/CanvasEditor.tsx`。待驗清單：① **Undo/Redo**（Fabric v7 loadFromJSON Promise + re-applyFilters，最易壞）② **排版 / 橡皮擦→文字**（前幾批修，可能只是瀏覽器快取，先 **Ctrl+Shift+R**）③ **生成填色 / 擴圖**（flux-fill-pro，需 `POD_DESIGNS_ENABLED=true` + operator role + 花費；route `/api/tools/studio/genfill` 已掛載驗 401）④ **群組/解散、Posterize、設計檔 .design.json 存載**（純前端互動）。**下一步**：① 使用者硬重整後逐項點測 ② 壞的給截圖 + 開 console（F12）貼 error ③ Claude 依 `file:line` 定位修。**注意**：lib+route 層已是 inpaint faithful mirror（production-clean），剩風險全在 client handler 的 Fabric 互動。 **【範圍訂正 2026-08-25】部分待驗項已在 2026-06-27 由真機 e2e 覆蓋**（WORKLOG-archive/2026-06.md `feat(canvas): 畫布自動適應一頁…`，`REALTEST_EVIDENCE: tool=mcp__Claude_in_Chrome | 部署版 470e10ba`）：自動適應（1000×2000→顯示 248×495，real 保留全解析度）、**Ctrl+Z undo**、Delete 刪除、工具列進側欄（canvas top 181→86px）皆已實測 PASS。**故本條剩餘待驗＝** ①「Redo」與 `loadFromJSON` 後的 re-applyFilters（undo 已驗、redo 未驗）② 排版／橡皮擦→文字 ③ 生成填色／擴圖（flux-fill-pro，需 flag + operator role + 花費）④ 群組/解散、Posterize、`.design.json` 存載。
- [ ] **【POD A1 已完工｜剩 e2e + A2】** A1（一鍵 native 建品）後端+UI+hardening 全 live。剩：① **真實 e2e 開賣驗證**（操作者驅動瀏覽器：app.aware-wave.com → 建品 → 🚀一鍵上 Printful → 驗 native store 商品+變體+印刷檔全綁 → 清理測試商品）② **A2 自動轉單 webhook ✅ 已建+已部署 draft-only dormant（2026-06-16，deployed `e336d5da`）**：`app/api/webhooks/woo-order/route.ts` = Woo 付款 → Printful DRAFT（kill-switch `POD_AUTO_FULFILL_ENABLED` 預設 OFF + HMAC 驗簽；333/333 test；critic PASS）。**✅ 2026-06-16 啟用 draft-only LIVE**（SG flag+secret+compose passthrough、soulful 2 webhook、端到端 401/400 實測過；見下方獨立任務行）。**confirm/送印紅線未建**（測試結束+批准才議）。
- [ ] **【POD A2 confirm phase — 🔴 金流紅線，測試結束 + 操作者明示批准才做】** A2 draft-only 管線已上 prod dormant。真正「自動扣款 + 送印」需未來明確建 confirm step（目前 code 完全沒有）。**動工前置（同一批做）**：① 改用 Woo webhook topic header（`order.created` vs `order.updated`）判別狀態，並顯式處理 `refunded`/partial-refund-still-processing edge（critic 2026-06-16 Minor）② confirm 必須有獨立 flag（與 draft flag 分離）+ 操作者每筆/批次審核閘，**禁止**裸自動 confirm ③ High-risk：需操作者 go-ahead + 先 draft 模式試單對帳通過。SSOT：`app/api/webhooks/woo-order/route.ts` + `lib/studio/print-provider.ts createDraftOrderOnNative`（⚠ DO NOT add confirm 註解）。
- [ ] **【未開始｜待使用者明確下指令】會議服務網路版安裝** — 客戶筆電無 NVIDIA GPU（2026-08-20 確認），本機版 CPU 路線慢 20-27 倍不可用。**完整安裝手冊（含動工前三題決策 + 方案比較 + T1-T7 步驟 + DoD）已寫好**：[`lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/NETWORK_VERSION_INSTALL_RUNBOOK.md`](../lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/NETWORK_VERSION_INSTALL_RUNBOOK.md)。**觸發方式**：使用者說「網路版繼續」等義詞，AI 直接讀該檔依序執行，不用重述背景。**動工前必答三題**（該檔已列）：① 客戶是否同意錄音上傳到伺服器（本機版音檔不外流原則會被推翻）② GPU 伺服器方案（推薦先租雲端 GPU instance，如 RunPod/Vast.ai）③ 服務幾個客戶（決定要不要現在就做多租戶隔離）。同日已完成的相關工作：本機版 API 自動處理選項（`lib/settings.py` + `summarize_via_api()` + 網頁設定頁，給客戶「自己貼上」或「填自己 API key」二選一，已驗證上線）。
- [ ] **（出國前必做）Termius 手機 SSH 設定 + cheat sheet 書籤** —— **【未開始】**
- [ ] **【已知限制｜2026-08-25 開｜2026-08-31 自動解除】Codex 額度耗盡，跨模型 oracle 路徑不可用** — `codex exec` 直測回 `You've hit your usage limit ... try again at Aug 31st, 2026 12:41 PM`。影響：① AGENTS.md §跨模型 oracle 把 R0 [驗證計畫] 的 Review 動作路由給 Codex —— 該路徑至 8/31 不可用，期間 Review 改走 `critic` subagent ② codex plugin 的 **stop-time review gate 每次收工都會失敗並擋住 session 結束**，且它顯示的錯誤是誤導的（`DEP0190 DeprecationWarning` 只是 stderr 上唯一的文字，真正的額度錯誤在空的 stdout 裡）。若擋住工作流程，用 `/codex:setup` 暫時關掉 stop-time review gate，8/31 後再開。**根因不在本 repo**（vendor plugin + 訂閱額度），不要去改 `~/.claude/plugins/cache/` 底下的 vendor code。⚠️ 額度是本 session 五次 oracle 覆審燒掉的 —— 之後 oracle 用量要節制：prompt 只放 Decision/Constraints/Acceptance（AGENTS.md 已有此規則，本 session 第一次呼叫因塞了整段推理而 timeout），且避免對同一份大 diff 反覆重跑。
- [ ] **【gated｜8月｜等買二手機才繼續建 customer service U6 Chatwoot】** — 軟體層(cs-engine U0–U5 + widget U4)已上 prod 並 live 驗；只剩裝 Chatwoot + 接線（建 `app/api/cs/chatwoot-webhook` 呼叫 `handleInbound`、MockTransport 換 ChatwootTransport）。**買機=操作者刷卡(High risk)，7月出國→8月回來辦**。完整冷啟動步驟序、接線 file:line、8 通道現實全在接手包 → handoffs/2026-06-27-customer-service-u6-chatwoot-handoff.md
- [ ] **【gated｜8月｜EU→Dedicated 搬機 + 整併退雲端】** — **動機**：上 Chatwoot（CS U6）需 ~8GB，EU 8GB(已吃 3G swap)/SG 4GB 都塞不下。**決策**（runbook §0b，2026-06-27）：買**二手 dedicated**（FSN i7-7700/64GB/2×512SSD/~€48.70）當主力，Chatwoot greenfield 先上 → EU 服務照 §5 逐台搬（Supabase/Trigger/n8n/Postiz/MainWP/Uptime）→ 退 SG+EU 兩台雲端。單台+RAID 1+R2 夠用，HA 第二台延後。**搬家/RAID/還原 SSOT**：[`runbooks/HETZNER-SERVER-MIGRATION-AND-DISASTER-RECOVERY-RUNBOOK.md`](../runbooks/HETZNER-SERVER-MIGRATION-AND-DISASTER-RECOVERY-RUNBOOK.md)（§0b 決策/§3 RAID/§5 遷移/§7 checklist）。**§7 gate（5 項，現卡）**：❌ 買機（**操作者刷卡，High risk**）❌ auction 機 RAID 1+SMART+mdadm 告警 ❌ Chatwoot greenfield+接線 ✅ 每容器 `mem_limit`（2026-08-15 實測：EU 29 個執行中容器有 **27 個已設限**，僅 `buildx_buildkit_trigger0` / `trigger-registry` 兩個 build 用容器未設；此項實質已完成）❌ 第二異地取代 SG-offsite。**已綠**：備份補漏全補 / `.env` 加密 / 還原演練過(2026-06-26) / R2 真 3-2-1 / 救援鑰 off-machine / DNS 9 record 清單 / §4 端到端驗。**時程**：7月出國→8月回來辦。冷啟動接手包：[`handoffs/2026-06-27-customer-service-u6-chatwoot-handoff.md`](handoffs/2026-06-27-customer-service-u6-chatwoot-handoff.md)。
- [ ] **蒙古客戶 Cloudways 實際建站**：待客戶刷卡配合 —— **【未開始】** 現場開機 checklist 與 Cloudways 方案已備（`handoffs/2026-07-05-mongolia-client-onsite-checklist.md`；網域在 Namecheap 買，Cloudways 不賣網域）。**阻塞**：需客戶本人刷卡開 Cloudways 帳號。（2026-08-12 從 AO-CLOSE 2026-07-05 封存補回 TASKS）
- [ ] **新站建置（Scenery Travel Mongolia）** —— **【進行中】** **進度（2026-05-07）：**tenant 骨架完整；**Day 2 書面**：canonical staging **提案** `https://staging.scenery-travel.mn/` 已寫入 registry／SITE_PROFILE。**下一步：**選定主機商後 Runbook §2 建置實機 + 客戶訪談補 Discovery。
- [ ] **新站建置 Day 1（Scenery Travel Mongolia）** —— **【進行中】** **進度（2026-05-07）：**tenant 骨架 + Discovery 骨架完成。**下一步：**與客戶確認素材與頂級網域，選定主機商 → 銜接 **`TASKS`**「Day 2 雲端 staging 實機驗收」。
- [ ] **Next-Gen 試點 — Day 2 雲端 staging 實機驗收（~~兩案~~ → 僅剩 Scenery）** —— **【未完成｜範圍已縮 2026-08-25】** **DoD：**Scenery：`https://staging.scenery-travel.mn/` 後台可登入 + 關鍵頁可開（Pilot A §2 同等驗收；若網域變更須先更新 registry）。**阻塞：**須選定主機商操作與 DNS／SSL；代理無法代登入第三方面板，且蒙古案本身卡在客戶刷卡開 Cloudways（見該條）。 **⛔ Soulful 半邊已作廢，不要再排**：~~Soulful：`https://staging.soulfulexpression.org/` 後台可登入 + 關鍵頁可開~~ —— 2026-08-16 決議 **abandon staging**，理由是 Hostinger hosting 2026-11-12 到期不續約，不在即將退場的主機上建 staging（WORKLOG 2026-08-16「補上搬站執行手冊 + 清掉 5 份文件的過期 staging 主張」，`ENVIRONMENT_REGISTRY.md` 與 `02_EXECUTION_PLAN.md` Day 2 兩行均已加刪除線並註「⛔ 不再執行」）。Soulful 的等價驗收改由**搬站後在新主機上做**，見「Soulful 網站搬離 Hostinger」條。
- [ ] `tenants/templates/` v2 —— **【未開始】** **進度：**依試點回填後再開；見 Pilot 條目。
- [ ] **【2026-08-25 開出｜類別級重設計】影片歸屬改為持久化 `outName → organization_id` mapping，停止從 object key 反解** — critic（2026-08-25）指出 2026-08-25 那批修正裡的三條 finding（crafted legacy prefix / 大小寫不一致 / ctx 缺欄位 fallback）是**同一類問題的三個實例**：「把租戶身分編碼進一個有損字串、再從字串反解回來」。真正的不變量是「**歸屬在 submit 當下就已知且權威，不該事後從 object key 猜**」。**治本**：out_name 產生時歸屬已知，落一張持久表（`video_jobs` 有 1h TTL 且不存 out_dir，不能用），`reconcile` 改成 join 該表、解不到就 skip。**一次關掉整類**，並可移除 32-bit 前綴命名空間與 public URL 上的租戶指紋。**警告**：逐點修這三個實例會再被打回（critic 明講）。目前三個危險實例已各自修掉，所以這是「改善」不是「救火」。
- [ ] **【2026-08-25 開出｜critic Minor 7 條】影片管線租戶邊界收尾** — 皆來自 2026-08-25 critic Deep review，**已驗證屬實但未修**：① `/api/video/status` 是實際寫入 `media_assets` 的路徑卻無 `assertOrgAccess`（`route.ts:87` 之前應補；jobId 是 122-bit `randomUUID` 故枚舉不可行，風險低但形狀不對）② reconcile 從「大聲失敗」變「安靜成功」——舊行為 org 未設回 500 讓 cron 看得見，現在回 200 + `skippedLegacy=N` 無告警（`reconcile.ts:28` 註解自己寫「必須可見」卻沒有東西讓它可見）③ `checked: groups.size` 語義已變（含被 skip 的組），以 `recorded/checked` 判健康的監控會誤判 ④ `skippedLegacy` 是垃圾桶指標（吸收舊 backlog + 大寫前綴 + `noorg_` + sanitizer 邊角），建議拆兩個計數器 ⑤ `buildVideoOutName` 註解「前綴固定 20 字元」對 `noorg_` 分支（17 字元）不成立 ⑥ `video/history` 對 staff 是 `effectiveOrgId(req,null)`→看全部 org，`designs` 是帶 `defaultOrganizationId()`→只看預設 org，同一批 `media_assets` 兩個畫面顯示不同集合 ⑦ `docs/operations/MULTI_TENANT_ISOLATION_AUDIT_AND_PLAN.md:61,62` 行號已漂移，且**從未收錄** `/api/video/{generate,render-draft,status,reconcile}` 四條 route（R4 聲稱即驗證：這份 inventory 現在會誤導下一個 reviewer）。
- [ ] **【2026-08-25 開出｜偵測器說謊】Repair Center Phase 4 週巡檢 Check 3 誤報 `restore drill overdue`** — `agency-os/reports/repair-center/phase4-LATEST.md`（2026-08-21）回 `Check 3 BACKUP_RESTORE_PROOF: WARNING — company-soulful-expression: restore drill overdue (due 2026-08-06)`，**但還原演練 Drill #1 已於 2026-08-16 PASS**（WORKLOG 2026-08-16「Soulful 還原演練 PASS + 補上備份缺口」；TASKS「機器買到後的接手點」條亦列為已完成不要重做）。故 verdict 與真實狀態不符。**兩種可能，需查**：① `BACKUP_RESTORE_PROOF.md` 的演練紀錄未回寫／欄位格式不被 checker 認得 ② checker 讀的是 `due` 欄位而非最後一次 PASS 時戳。**為何要修而不是忽略**：這是本 repo 反覆記載的最惡樣態的鏡像 —— 偵測器長期掛著一個假 WARNING，操作者會學會略過它，真的逾期時就看不見了（同 ClickHouse canary / archive-lift 誤報）。**DoD**：修正資料或 checker 後，`phase4` 週巡檢回 `Check 3: PASS`，且刻意造一筆真逾期時仍能 WARN（不可靠「永遠 PASS」達成）。
- [ ] **【2026-08-25 開出｜小｜文件一致性】Soulful staging「abandon」決策未傳播到 3 份仍在宣告它的文件** — 2026-08-16 已決議不在即將退場的 Hostinger 上建 staging，`ENVIRONMENT_REGISTRY.md` / `02_EXECUTION_PLAN.md` 均已加刪除線，但下列**仍以肯定語氣宣告要建 staging**，冷啟動的代理或操作者照著做就會白工：① `docs/operations/NEXT_GEN_DELIVERY_BLUEPRINT_V1.md:141`（「Canonical staging URL … https://staging.soulfulexpression.org/」）② `docs/operations/PRODUCTION_RUNBOOK_PILOT_A_EXISTING_SITE_SOULFUL_EXPRESSION.md:33,35`（§Day 2「建立 staging 子網域」未標作廢）③ `tenants/company-soulful-expression/projects/2026-011-existing-site-handover-soulful/DAY2_STAGING_OPERATOR_GUIDE.md:14,33`（整份的「目標」就是建那個子網域）。**注意**：2026-08-16 WORKLOG 聲稱「命中 5 份 soulful 文件全部處理」，本輪 grep 證明**未涵蓋這 3 份** —— 屬「聲稱已修但沒修」樣態，故修法要連同**當初那個 grep 的範圍**一起檢討（為何 `staging.soulfulexpression` 掃不到 DAY2 guide）。**DoD**：三份各自加刪除線或 ⛔ 作廢註記並指向搬站主線；`grep -rn "staging\.soulfulexpression" agency-os/ --include=*.md | grep -v "~~"` 僅剩 `SITES_INDEX.md:13` 通用規則說明。
- [ ] **【2026-08-25 開出】`ao-resume-last.txt` 錨點卡在 2026-06-12，AO-CLOSE 視窗計算長期失真** — `agency-os/.agency-state/ao-resume-last.txt` 實測值 `2026-06-12T05:27:33.6508893Z`，距今 2.5 個月未推進；`ao-close-prev.txt`=`2026-08-24T12:13:10Z`、`ao-close-last.txt`=`2026-08-24T12:14:06Z` 兩者只差 56 秒（同日兩次 close 嘗試）。後果：`.claude/commands/ao-close.md` 要求存檔涵蓋「上次 AO-RESUME → 本次 AO-CLOSE」，但依錨點算出的視窗是 6/12→今天，與實際工作區間對不上，**逼得每次收工都要手選「真實區間」繞過**（2026-08-24-2014.md 就是這樣寫的，敘述誠實但錨點沒修）。CONVERSATION_MEMORY 2026-07-02 已記過同一現象，**未修**。**根因待查**：`ao-resume.ps1` 只在「寫出真實 AO-RESUME 存檔」時推進 stamp，而 hook 自動觸發那輪印的是 `AO-RESUME stamp NOT advanced (auto-refresh / non-interactive)` —— 代理事後補寫存檔時沒有回頭推進錨點。**DoD**：確認推進條件、補上代理寫完 archive 後推進 stamp 的路徑（或改由 `verify-aoresume-archive.ps1` 帶動），並讓 AO-CLOSE 視窗不再需要人工手選。（2026-08-25 Codex round-5 覆審抓到，經讀三個錨點檔實測確認）
- [ ] **【2026-08-24 開出】CHANGE_IMPACT_MATRIX 漂移偵測腳本首輪 7 個 WARN 待人工確認** — `scripts/check-change-impact-matrix-drift.ps1` 2026-08-24 首次接進月度巡檢（`ao-resume.ps1` monthly check #5），真實跑出 7 對 WARN（全部是 `docs/operations/cursor-enterprise-rules-index.md` / `docs/operations/cursor-mcp-and-plugin-inventory.md` / `../docs/spec/raw/Cursor  Rules for AI/README-部署說明.md` 宣告的 impacted，vs `.cursor/rules/64-architecture-mcp-routing.mdc` / `65-build-standards-data-state.mdc` / `66-skills-observability-protocol.mdc` 三個 `.mdc` 檔案，4 月未更新但主文件近期持續改動，drift 127-141 天）。這是純資訊性快照非 build gate，**待下次月度巡檢時人工判斷**這三個 `.mdc` 是否真的過期需要更新，或只是穩定未變不需動。報告：`agency-os/reports/governance/impact-matrix-drift-LATEST.md`。
- [ ] **【2026-08-25 開出｜小】`scripts/rebuild-content-studio-4cards.ps1:185` CP950 parse-break** — `audit-cp950-traps.ps1 -ParseBreakOnly` 持續回報唯一一筆 drift：非 ASCII 無 BOM，在 CP950 下 parse 出 46 個錯誤（等於這支腳本在預設 console 編碼下**根本跑不起來**）。既有問題非新引入，本 session 兩度出現在掃描結果中。**修法**（該檔已列出）：裝飾性字元 ASCII 化，或若 CJK 是資料就加 UTF-8 BOM。掃描 166 支中其餘 165 支皆 clean。
- [ ] **【2026-08-25 開出｜小｜非阻塞】CP950 backlog 其餘 84 個 site：套用 ao-close 那套分類法** — 2026-08-25 關掉 27 個（`ao-resume.ps1` 17／`lib/git-safe-ops.ps1` 4／`ao-close.ps1` 6），repo-wide drift 111→84。**`ao-close.ps1` 已無未知**：剩餘 17 個逐項列了消費端與判定在 `AUDIT_REGISTRY.md`。**這條要做的是把同一套判準套到其餘檔案**（`check-three-way-sync.ps1` 16、`git-align-main-aoresume-feature.ps1` 9、`git-audit-tracked-remote.ps1` 7 等）。判準：捕獲**值**若流入任何 gate／條件／迴圈／寫入 → 必包；只進 `Out-Host`/`Out-Null` → 可留白但須在 registry 寫明消費端。**教訓（別重蹈）**：原 registry 用「看起來像 ASCII metadata」一句話帶過 23 個 site，藏了一個閘級 bypass 三個月；也別反過來 —— `ao-close.ps1:318` 跟出事的 `:203` 是同一支 `git log %s`，驗證後並非同型。兩個方向都要驗。**觸發**：`powershell -File scripts/audit-cp950-traps.ps1`。
- [ ] TASKS [x] 自動歸檔 + 重複行偵測閘（archive-completed-tasks.ps1，**R0 已批方案A**，照 packet 直接動工免重提案）→ handoffs/2026-06-11-1738-tomo-173818.md
- [ ] **smoke 04-onboard spec 補 app session 登入**：`95e80904` login hard-nav 後未登入導登入頁，spec 只帶 nginx basic-auth → 永久 fail。修法＝spec 加 app 登入步驟（Email/密碼從 env），或改用 `x-ops-sync-key` header。佐證 WORKLOG 2026-06-11 部署段。
- [ ] **【進行中｜Phase 1 ungated 全完成，剩 T10 gated】Cold Outreach Workbench — 冷開發完整鏈** — SSOT：[`agency-os/docs/cold_email/COLD_OUTREACH_WORKBENCH_INTEGRATED_SPEC_v1.md`](docs/cold_email/COLD_OUTREACH_WORKBENCH_INTEGRATED_SPEC_v1.md)（三份草稿已整合並 superseded）；實作排程：[`COLD_OUTREACH_PHASE1_BUILD_PLAN.md`](docs/cold_email/COLD_OUTREACH_PHASE1_BUILD_PLAN.md)（T1–T12 依賴排序）。**已拍板決策**：代操冷信用客戶 Gmail / 名單你幫找 / 訂閱制 / 不用 SES / schema prefix `co_`。**架構對齊**：org-tenant + **service-role RLS + ops-role RBAC**（已驗證現況 §B0.1，runtime 非 Clerk；賣的 per-login 隔離留 Phase 5）；暖層走既有 wp-bridge（+小擴充 FluentCRM contact/tag endpoint，非新建 connector）；暖信走客戶 FluentSMTP 或 Brevo free；self-host Supabase/Trigger.dev/n8n = $0；**Free-Plan Router + 客戶 BYO-key 乘數**為第一級設計（PART H）。**關鍵路徑**：T1 schema → T2 module 殼 → T4 Connector/Router/BYO-key → T5 Inbox → T6 AI scoring → T8 Message gen(Cold Gate) → T9 Review → T10 Gmail draft(⚠High，等 go-ahead)。**DoD**：操作者跑完「Service Profile→Inbox(dedup+suppression)→AI 評分→生冷信→審核→客戶 Gmail 草稿→follow-up」，全程 org-scoped、人工寄、不碰金流。**⚠️ 待補**：免費額度數字（PART H）需上線前以官方頁確認；驗證 workflow 撞 session limit 未跑完，可重置後補跑。 —— **進度（2026-06-23）**：✅ **T1 完成** — migration `0048_co_outreach_core`（12 表 + service-role RLS）已 **apply 到 EU prod Supabase 並驗證**（12 表 RLS 全開 + 12 policy + co_leads FK 正確 + 0 個 enabled-no-policy；`PSQL_EXIT=0`）；db-expert 審 pass（W1 BEGIN/COMMIT + W2 NOTIFY pgrst + N2 已套）。**✅ T2 完成**（`app/outreach/` 9 頁 + nav + canManageOutreach + 資料層；tsc 0）。**✅ T3 完成**（Service Profile CRUD route + 表單；tsc 0 + DB round-trip）。**✅ T4 完成**（Free-Plan Router + Quota Guard 純邏輯 + 15 vitest 全過 + connector metadata CRUD 含密鑰值防呆 + UI；tsc 0 + DB round-trip）。**✅ T5–T12 完成（2026-06-24）**：T5 Inbox（normalize/dedup/suppression+機械評分）、T6 deterministic scoring、T7 Leads+Approve、**密鑰骨幹 migration 0049 Supabase Vault**（`secret_put/get/delete`，已 apply EU prod + round-trip + anon 提權測試）、T8 Message 生成（Cold Gate+vault key+Gemini+lint）、T9 Review（approve，不自動寄）、T11 Follow-ups（Asia/Taipei 日期）、T12 Suppression。全程 tsc 0 + 37 vitest + critic Deep pass（密鑰骨幹 textbook-correct）+ 6 個 EU-prod DB round-trip。**Phase 1 ungated 全完成**。**唯一剩 T10 Gmail per-org OAuth = gated High-risk（另案，會重用 0049 vault）**。ops 待辦：續期 agency `GEMINI_API_KEY`（或靠 BYO client key）；leads/route.ts uuid-into-column 小修（critic pre-existing）。 **【狀態訂正 2026-08-25｜原標【未開始】為過期】實際進度**：T1 schema 已落（`lobster-factory/packages/db/migrations/0048_co_outreach_core.sql`）、T2–T9/T11/T12 已實作 —— `apps/next-admin/lib/outreach/`（`connectors/`、`scoring.ts`、`cold-gate.ts`、`normalize.ts`、`db.ts`、`ai-claude/ai-gemini/ai-openai.ts`）+ 7 條 API route（`app/api/outreach/{leads,inbox,messages,followups,suppression,connectors,service-profiles}`）+ UI `app/(shell)/outreach`。**唯一剩餘＝T10 Gmail per-org OAuth + 建草稿(n8n) + sender daily limit**（⚠️High auth/憑證，gated）。`memory/daily/` 自 2026-07-05 起即持續註記「Phase 1 ungated 全完成」，僅 TASKS 標籤未同步。**附帶待修**：`docs/cold_email/COLD_OUTREACH_PHASE1_BUILD_PLAN.md:5` 檔頭仍寫「狀態：未開始」，同批訂正。
- [ ] **【進行中｜軟體先行·U0–U5 + widget U4 完成並 prod live，剩 U6 gated】全自動客服系統** — **執行 SSOT**：[`Customer_service_BUILD_PLAN.md`](docs/Customer_service/Customer_service_BUILD_PLAN.md)（單元 U0–U6/順序/進度/gate）；**設計 SSOT**：[`Customer_service_automation_plan.md`](docs/Customer_service/Customer_service_automation_plan.md)（v2.1）；附錄 `_competitive_research.md`（頂規競品證據）+ `_uiux_design.md`（清新自然 UX + CIS §2.6/2.7）。**建置原則**：軟體先行（U0–U5 現有機器 $0）、硬體後搬（U6 Chatwoot 搬大記憶體）。**進度**：✅ U0 資料地基（migration 0051 **已 apply EU prod**：8表/8RLS/8policy/RPC/pgvector live 驗證）+ ✅ **U1 cs-engine**（`lib/cs/` 13 檔；tsc 0 / vitest 35 / critic 2-High 修訖）+ ✅ **U2 CIS「品牌識別」tab**（client hub tab + cis route；tsc 0 / critic 0C0M）+ ✅ **U3 客服 tab + 頂層「客服」section**（cs-config route + /ops/cs + sidebar；critic 抓到 kill-switch inert→接進 engine 修訖）+ ✅ **U5 eval/護欄 harness**（lib/cs/eval + route + 7 測；critic 抓到 eval 用 lossy 子集→改跑真實 decideAnswerAction）+ 🟡 **U4 headless 清新自然 widget 程式碼完成**（lib/cs-widget 6 檔 + demo 頁；tsc 0/vitest 49/critic XSS-clean+4 Major 修；transport 抽象 Mock/Chatwoot）；⏭ **僅剩 U6 Chatwoot 載體 — gate 在「買二手 dedicated 機」**（決策已定 2026-06-27 runbook §0b：FSN i7-7700/64GB/2×512SSD/~€48.70）→ RAID 1 → Chatwoot greenfield 先上 → 接線（建 `app/api/cs/chatwoot-webhook` 呼叫已存在的 `handleInbound`、MockTransport 換 ChatwootTransport）→ EU 服務照 runbook §5 逐台搬 → 退 SG+EU 雲端。**8 月冷啟動接手包**：[`handoffs/2026-06-27-customer-service-u6-chatwoot-handoff.md`](handoffs/2026-06-27-customer-service-u6-chatwoot-handoff.md)；搬家 SSOT：[`runbooks/HETZNER-SERVER-MIGRATION-AND-DISASTER-RECOVERY-RUNBOOK.md`](../runbooks/HETZNER-SERVER-MIGRATION-AND-DISASTER-RECOVERY-RUNBOOK.md)。**已拍板決策（§0 D1–D12）**：雙軸漸進 L1→L2 × A1→A2（money/身分 code 硬閘永不自動）/ 三維一起建（自用+客戶自用+代操，自家 Account#0 先金絲雀）/ OpenAI embeddings 可插拔 / 商業軌主幹+個人軌隔離 / **獨立 Chatwoot VPS** / Chatwoot 擁有對話 / **自建 Claude+RAG+agentic（非 Captain）** / Pattern A AgentBot + Community 版 / **headless 自建 widget（清新自然）** / **CIS 重用既有 `brandColors`+`BrandVoiceProfile`**。**IA 落點（已驗證 `SidebarNav.tsx`）**：per-client hub `/ops/clients/[slug]` 加「品牌識別(CIS)」tab + 「客服」tab（吃掉散在設定/內容的品牌東西）；跨客戶營運開**頂層 sidebar section「客服」**（仿 Cold Outreach）；客戶自用 Phase 5 重用同元件不重造。**Phase 0 DoD**：① ✅ 機器/區域/成本拍板（改為**買二手 dedicated**，FSN，runbook §0b，2026-06-27）② Anthropic+OpenAI DPA 到位 ③ Phoenix/Langfuse tracing 選址 ④ 域名/備份策略。**⚠️ 租 VPS = High risk，等操作者明示 go-ahead 才執行 provision。** 後續 Phase 1–9（載體+副駕→RAG+eval→唯讀行動→受閘寫入→Meta→LINE→產品化→進階→個人軌）見主計畫 §11。 **【狀態訂正 2026-08-25｜原標「U0 完成」為過期】**WORKLOG-archive/2026-06.md 2026-06-27 `feat(cs)`：「規劃→建置 U0–U5→操作 UI→prod 上線 + live 實測 ✅（U6 Chatwoot 待買機）」。本條標籤停在 U0，實際 U0–U5 + widget U4 均已上 prod 並 live 驗；剩餘全部集中在 U6，見下方獨立 gated 條目。
- [ ] **【進行中｜POD 一鍵自動上架】設計圖 → Woo + Printful 多款多色全自動** — 計畫 SSOT = `lobster-factory/docs/PLAN-pod-one-click-auto-publish-design-to-woo-printful.md`（5 階段）。目標：操作者**只做設計圖**、一鍵自動 合成商品圖(白背/2模特/平拍,分長短袖,<100KB) + 建 3 款 Woo 草稿(Gildan 2400 **長袖** id57 / Stanley-Stella STTU169 id456 / Gildan 5000 id438，各 4 色 × S-2XL) + Printful native 建品綁設計稿。**對接用 hex(color_code) 不用顏色名**（同名 Sport Grey 跨款 hex 不同）。**紅線**：止於 WP draft，開賣/扣款人工（守 A2 金流紅線）。**現況**：研究完成（三款 Printful ID + 12 色 hex 已實機查證）、今日選圖器已修（WORKLOG 2026-06-20）。
- [ ] **【進行中｜內容引擎積木化】搜尋積木 registry 已 live，剩來源/UI/第二批** — ✅ **已完成並部署（2026-06-16，commit `e336d5da`）**：後端積木註冊骨架 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/blocks/registry.ts`（`register/byKind/listAll/geoMatch` + `ContentBlock` 契約，前端 `AB.registerBlock` 後端鏡像）+ 搜尋家族 5 source 自註冊 `lib/content/trending-sources.ts`（google-news/reddit/ptt/perplexity/env-custom-rss）+ 契約 SSOT `lib/content/blocks/README.md`（修好 `public/vector-editor.html:902` 斷裂參照）。`app/api/content/trending/route.ts` 改走 `runTrending()`=`byKind("search")`。驗證：tsc 0 + critic Deep 0C/0M + node registry 語意斷言 + SG compiled bundle 含 `search/perplexity`/`CONTENT_TRENDING_FEEDS` + 容器 `PERPLEXITY_API_KEY` SET(53)=Perplexity 積木啟用。**剩餘未做**：
- [ ] **wp-bridge plugin 補 `/product` dry_run 支援**：現只有 /option 有（RestController:167）；2026-06-11 一鍵上架測試因此真建了 draft #7164。plugin 端改 → bump AWBRIDGE_VERSION → release flow（WP-BRIDGE-RELEASE-RUNBOOK）。
- [ ] **wp-bridge 續做 operation：featured image** / update-existing-post / product update+delete（v0.7.0 只做 product CREATE，其餘端點仍待補）。
- [ ] **【POD Studio 自建動工】** plan=`.claude/plans/pod-studio-p2a-p4-execution-PLAN.md`；藍本=`lobster-factory/docs/POD_STUDIO_ROADMAP.md`。✅ ① 擬真合成驗證 PASS（nano-banana-2 白 ~95%/黑鎖色 ~90%，prompt 三鐵則進 plan §0）✅ 先決小修（REPLICATE token 回填 + vault doc drift）✅ ② **P2a 儲存層完成 2026-06-11**（`lib/storage/r2.ts`+route+My Designs 頁，REALTEST 全過，flag OFF **未部署**；deploy 時 SG 設 `POD_DESIGNS_ENABLED=true`+`POD_DESIGNS_DEFAULT_ORG_ID=2bf60452-…`）。✅ ③ P2b 生成器（facade+Studio 頁，fbc1b7b1）✅ ④ P2c 去背（851-labs，RGBA 驗證）✅ Printful 憑證落定（vault ×4；store 18314943 已綁 Woo — P2d 先決解除）。✅ ⑤ Mockup Studio（B9-S 雙模式+鎖色，REALTEST 目視 PASS）✅ ⑥ P2d PrintProvider（Woo 平台改道 sync API；讀路徑實測過）✅ ⑦ 一鍵上架鏈+Publish 頁（upscaler 誠實合約+Ed25519 client；兩輪部署 a4fd0e95 全上線）。**下一步 = link 寫路徑首驗（見【明日優先】packet）→ P3 上架定案（主站 Woo 已可用）→ P4 試單對帳**
- [ ] **【POD 服飾 Phase 1-4 後續｜2026-06-15 已部署 37dfba85】** 服飾 POD 全功能（忠實印刷檔 / Printful 多風格+真人模特 mockup+存圖庫 / 平拍真實 overlay 雙軌 / 台灣本地印刷檔 seam / AI 商品文案 SEO-GEO-AEO-RankMath）已 **live on app.aware-wave.com**（smoke 24 pass）。剩餘未做：
- [ ] **🎨 Image Output Pipeline**（SSOT: `lobster-factory/docs/PLAN-tarot-pod-image-output-pipeline-plus.md`）Tarot/POD: 色調→WebP/CMYK PDF(Japan Color 2001 Coated)/Fabric.js Canvas；Printful 走 sRGB `upscaler.ts` 不動；Canva Phase 1.5 POC
  - [ ] **[5-a~d]** Canva API POC → OutputTrackBar 接線（plan §17）
  - [ ] **Phase 2** customer-facing Canvas + WooCommerce + Printful；整副牌多頁 PDF（PrintNinja offset）
- [ ] SEO/GEO 引擎產品化 + Soulful 定位/文章（2-Gem: onboarding+content；定位鎖定 Arts Practice for Self-Discovery / Arts-Based Reflective Pedagogy；填真資料→文章可發布；spec §49 errata 待補）→ handoffs/2026-06-06-2044-seo-geo-content.md
- [ ] wp-bridge 外掛：接進 app.aware-wave.com Ops Dashboard + aware-wave.com 展示頁 + 販售 → handoffs/2026-06-05-1948-wp-bridge-deploy-sell.md
- [ ] **【2026-06-05 開出】塔羅牌工具 → MEGA → WooCommerce 三階段路線圖**（操作者 2026-06-06 確認方向） — 終點：全部接 WooCommerce 賣貨（參考同事 jonjonesai 的 MEGA「Mass E-commerce Generator & Automator」Streamlit 工具：Research→Idea→Generate(多模型並行)→Select→Process(去背 removal.ai/Tinify)→Mockup(Printful)→Published(WooCommerce+Claude 文案+定價)）。
- [ ] **【進行中｜app.aware-wave 一鍵架站總藍圖】MASTER PLAN = `docs/operations/APP_AWARE_WAVE_PROVISIONING_MASTER_PLAN.md`**（5 階段路線圖 SSOT）。✅ Stage 0 建站引擎閉環已驗（run 655197bf completed + curl 200，2026-06-06）。✅ **Stage 1 接通入口完成 2026-06-14**：trigger-build 403 修復（dual-path auth, 8b1d6d86）+ dispatcher kick fallback（TRIGGER_ACCESS_TOKEN, 000f068c）+ dispatch-action-run-schedule 部署（每分鐘 cron）。✅ **Stage 2 n8n 橋接完成 2026-07-03**（workflow `RbrHNu3BUEmpNWeT` active，e2e 驗過；剩 WP 端裝 Fluent Forms+建表單+webhook feed+FluentCRM）。✅ Stage 3 程式+migration 0055 均已套（剩前端報價頁）。🟡 **Stage 4 程式完成、idle 已驗（2026-07-03）**：開閘 = SG .env 三 flag + `HETZNER_STAGING_TOKEN`（vault 現無，需決定專用 token vs 主 token）+ 重啟 next-admin（High/billable，需明示 go-ahead）→ Stage 5 串接監控。
- [ ] **既有站接手（Soulful Expression Art Therapy）** —— **【進行中】** **進度（2026-05-07）：**tenant 骨架完整；**Day 2 書面** staging canonical URL 已入 registry／SITE_PROFILE／`02_EXECUTION_PLAN`。**下一步：**Day 1 Runbook §1.1–1.3（操作者登入）+ **`TASKS`**「Day 2 實機驗收」。 **【下一步訂正 2026-08-25】原「下一步：Day 1 §1.1–1.3 + Day 2 實機驗收」已部分作廢** —— Day 2 staging 於 2026-08-16 決議 **abandon**（hosting 2026-11-12 到期，不在退場主機上建 staging；`ENVIRONMENT_REGISTRY.md` 該列已加刪除線）。**現行主線＝搬站**：見本檔「Soulful 網站搬離 Hostinger」與「機器買到後的接手點」兩條；本條僅剩 Day 1 §1.1 帳號層級權限確認（操作者必做）。
- [ ] `lobster-factory` A10-2 商業閉環實跑 —— **【未開始】**
- [ ] **【2026-05-30 開出】endpoint-alert.sh 自動化部署機制** —— **【未開始】** **背景**：`lobster-factory/infra/hetzner-phase1-core/scripts/endpoint-alert.sh`（SG 公網告警器）**無 repo→SG 自動部署路徑**，靠手動 scp 到 `/usr/local/bin/endpoint-alert.sh`。`sync-hetzner-slack-alert-webhooks.ps1` 只寫 env 不部署腳本本體。30 年風險：SG 重建 / `.bak` 被清 → 腳本回退舊版且無人知。**DoD**：(a) 新 `scripts/sync-hetzner-endpoint-alert-script.ps1`（仿 `sync-hetzner-endpoint-alert-heartbeat.ps1`：base64 ship + backup + `bash -n` verify + sha 比對 + 一輪 `systemctl start` 驗收）；(b) 接入既有 infra sync 流程；(c) repo SSOT sha == SG sha 的 drift 檢查可選接 system-health-check。**參考**：本日 WORKLOG `## 2026-05-30 endpoint-alert.sh debounce`（debounce 部署即走此手動路徑）。
- [ ] **【2026-08-15 開出】SG dockerd/containerd 持續吃 CPU（2 核機器 load 3.2）** —— **【未查】** `top` 顯示 `containerd` 66.7%／`dockerd` 58.3%（生命週期平均），但**所有容器都 <1%**；context switch 約 1.6 萬/秒。vmstat 瞬時 idle 72%、IO wait 0、blocked 0，**無使用者影響**（Kuma 近 1 小時 0 DOWN、服務全 healthy）。**同樣數字在 2026-08-15 07:29 session 開始時就存在**（當時追磁碟問題漏掉），故為長期狀態非新事件。**推測**：有東西在密集輪詢 Docker API（netdata docker collector 或 promtail service discovery 最可能）。**DoD**：找出輪詢來源 → 降低頻率或改用事件訂閱 → 確認 containerd/dockerd CPU 下降。**注意**：SG 只有 2 核，容器執行層自身開銷佔比過高會壓縮實際服務可用資源。
- [ ] Auto-Repair Post-Phase 4 (M2 per-source HMAC + M4 fingerprint) — Batch 3 已完成（9f862d82）→ handoffs/2026-05-28-1807-batch-3-post-phase.md
- [ ] M2/M4 Phase 1 code 完成；剩 Phase 2 rollout + Phase 3 constraint swap + 3 side item（Phase4Weekly 錯 repo / incidents API 藏 open / 5 webhook 零流量）→ handoffs/2026-06-05-2017-tomo-201752.md
- [ ] **Hetzner dispatcher 上線前 follow-up（啟用 LOBSTER_EXECUTE_* 前必做，現 gated OFF）**：① M10 orphan reaper（claim 後 trigger 前 crash→卡 running 終態；需 claimed_at 時戳+reaper `dispatch-action-run.ts:157-180`）② partial index `create index concurrently idx_ops_action_runs_pending_dispatch on ops_action_runs(started_at) where status='pending'` **【狀態訂正 2026-08-25】② partial index 已存在**，見 `lobster-factory/packages/db/migrations/0037_ops_action_runs_pending_dispatch_index.sql:18`（`create index concurrently if not exists idx_ops_action_runs_pending_dispatch`）→ 本條剩餘只有 ① M10 orphan reaper（`claimed_at` 時戳 + reaper），勿重複建 index。
- [ ] **【READY，未做】把 Hetzner 一鍵租機嵌進 app.aware-wave.com 一鍵架站按鈕（Phase 5）** — 程式+真機已驗過，**直接呼叫 `provisionClient()` 勿重寫**。recipe：`lobster-factory/docs/hosting/EMBED_PROVISION_INTO_APP.md`（app 端 `onboarding/trigger-build/route.ts` 頂部已留指標）。等 app 校正完再接。
- [ ] **【計畫完成，未實作】客戶機「開機後全棧部署+維護」層（provider 無關）** — 讓新機/客戶自帶機自動部署成 production 等級（Docker+Grafana/Loki/Netdata/Sentry+快取+swap+備份+限速/WAF/fail2ban）。**料件 90%+ 現成**，缺一個編排器 `provision-stack.sh`（串既有腳本，純 SSH，Vultr/DO/客戶自帶機通用）+ BYO adapter + swap。完整 R0 計畫：`lobster-factory/docs/hosting/SERVER_STACK_DEPLOYMENT_PLAN.md`。**禁止重寫既有 compose/腳本，只編排**。→ handoffs/2026-06-06-1925-postboot-stack-deploy.md
- [ ] app.aware-wave onboarding/provisioning IA 重整 — Phase 1 退役 ops-console（已規劃、Q1-Q3 已決、未動 code）+ verify intake 觸發建站 + Phase 2/3 → handoffs/2026-06-05-2028-onboarding-ia-consolidation.md
- [ ] **【🟠 Major M2-M4/M7-M10 + 🟡 Minor m2-m6/m8-m11】** —— **【未開始】** 剩餘 7 Major + 9 Minor — 排 Phase 4 觀察期後（2026-06-19+）
- [ ] **【已知風險｜操作者已決定不輪換｜2026-08-17】`~/.codex/config.toml` 明文憑證** — 該檔以明文存約 30 組正式憑證（Supabase `service_role`、Hetzner API token、Cloudflare API token、Resend、Slack、Sentry、n8n、Grafana 密碼、Trigger prod token 等）。2026-08-17 稽核 Codex 設定時另被印入 session transcript（transcript 保留期已於 `75512998` 改為 365 天）。**操作者 2026-08-17 明確決定不輪換**，理由：站台新、資料量少。⚠️ 該理由**不涵蓋** Hetzner（可刪伺服器）與 Cloudflare（可改 DNS 指向）——這兩者風險與資料量無關。**未做的補救**：① 輪換 ② 移出明文改用 `mcp/user-env.ps1` 既有的環境變數引用模式。前一次同類事件見 `0961263f`（2026-08-15 三項待輪換，狀態未確認）。重啟此項的時機：任何一把 token 疑似外流、或客戶資料量成長後重新評估。
- [ ] **【已知缺陷｜第三方 plugin，不在本 repo｜2026-08-25 開】`stop-review-gate-hook.mjs` 的失敗訊息會遮住真正原因** — `~/.claude/plugins/cache/openai-codex/codex/1.0.6/scripts/stop-review-gate-hook.mjs:121` 寫 `String(result.stderr || result.stdout || "")`。子行程的**真正錯誤在 stdout**（`{"status":1,...}` 與 usage-limit 訊息），stderr 只有一句無害的 `DEP0190 DeprecationWarning`（該 plugin 自己用 `shell: true` 傳參造成）。`||` 讓 stderr 優先 → **操作者看到的是雜訊，真正的原因被丟掉**。本次就是靠手動分離兩個串流才查出是額度問題。**這是本日同一個 bug class 的又一變體**：診斷取錯來源，把答案藏起來。**不修的理由**：檔案位於 plugin 快取目錄，更新即被覆蓋，非本 repo 資產。**可做的**：回報上游（openai-codex plugin）。**繞過方式**（若再遇到）：`node <companion> status --all --json` 讀 `latestFinished.summary` 拿真正原因。

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

## 5) memory/daily/2026-08-26.md
# Daily Note - 2026-08-26

## Done today
(fill in at AO-CLOSE)

## Current state
(fill in at AO-CLOSE)

## Next steps
(fill in at AO-CLOSE)

## Open tasks (auto-generated at 08:00 TPE)
- 【未開始｜2026-08-25 開｜到期日 2026-08-31】重新啟用 Codex stop-time review gate
- 【已知缺陷｜第三方 plugin，不在本 repo｜2026-08-25 開】`stop-review-gate-hook.mjs` 的失敗訊息會遮住真正原因
- 【已知限制｜2026-08-25 開｜2026-08-31 自動解除】Codex 額度耗盡，跨模型 oracle 路徑不可用
- 【已知風險｜操作者已決定不輪換｜2026-08-17】`~/.codex/config.toml` 明文憑證
- 【2026-08-25 開出｜小｜非阻塞】CP950 backlog 其餘 84 個 site：套用 ao-close 那套分類法
- 【2026-08-25 開出｜小】`scripts/rebuild-content-studio-4cards.ps1:185` CP950 parse-break
- 【2026-08-25 開出｜類別級重設計】影片歸屬改為持久化 `outName → organization_id` mapping，停止依賴 tenant context
- 【2026-08-25 開出｜critic Minor 7 條】影片管線租戶邊界收尾
- 【進行中｜Phase 1 ungated 全完成，剩 T10 gated】Cold Outreach Workbench — 冷開發完整鏈
- 【進行中｜軟體先行·U0–U5 + widget U4 完成並 prod live，剩 U6 gated】全自動客服系統
- 【gated｜8月｜EU→Dedicated 搬機 + 整併退雲端】
- 【未開始｜待使用者明確下指令】會議服務網路版安裝
- 🔴【資安】2026-08-15 transcript 憑證外洩 — 三項待輪換（待操作者處理）
- ⏭️ Soulful 搬站：機器買到後的接手點（硬死線 2026-11-12，買機死線 9/30）
- 【gated｜8月｜等買二手機才繼續建 customer service U6 Chatwoot】
- 【⚠️ 逾期 69 天｜原排 2026-06-17｜資安複盤】Defender 嚴重木馬 `Trojan:Win32/PowhidSubExec.B` 來源調查
- 【進行中｜POD 一鍵自動上架】設計圖 → Woo + Printful 多款多色全自動
- 【人工｜Postiz Task 2 OAuth app 審核】各平台 dev app 提交
- 【人工｜Postiz 測試草稿清理】登入 postiz.aware-wave.com → Posts → Drafts → 刪 draft
- 【操作者｜Postiz 帳號 → 客戶 Hub 連結】app.aware-wave.com/ops/clients/[slug] → 社群頻道 tab
- 【進行中｜內容引擎積木化】搜尋積木 registry 已 live，剩來源/UI/第二批
- 【驗證債】Canvas 編輯器 `/tools/canvas` 整輪瀏覽器實測
- 【進行中｜app.aware-wave 一鍵架站總藍圖】MASTER PLAN
- wp-bridge plugin 補 `/product` dry_run 支援
- 【POD A1 已完工｜剩 e2e + A2】
- 【POD A2 confirm phase — 🔴 金流紅線，測試結束 + 操作者明示批准才做】
- smoke 04-onboard spec 補 app session 登入
- wp-bridge 續做 operation：featured image / update-existing-post / product update+delete
- 【POD Studio 自建動工】
- 【POD 服飾 Phase 1-4 後續｜2026-06-15 已部署 37dfba85】
- TASKS [x] 自動歸檔 + 重複行偵測閘（archive-completed-tasks.ps1，R0 已批方案A）
- 【診斷】Mockup Studio 功能異常 — server-side 已排除（2026-06-16），卡操作者症狀
- 🎨 Image Output Pipeline（Tarot/POD）
- SEO/GEO 引擎產品化 + Soulful 定位/文章
- Auto-Repair Post-Phase 4 (M2 per-source HMAC + M4 fingerprint)
- wp-bridge 外掛：接進 app.aware-wave.com Ops Dashboard + aware-wave.com 展示頁 + 販售
- M2/M4 Phase 1 code 完成；剩 Phase 2 rollout + Phase 3 constraint swap + 3 side item
- Hetzner dispatcher 上線前 follow-up（啟用 LOBSTER_EXECUTE_* 前必做，現 gated OFF）
- 【READY，未做】把 Hetzner 一鍵租機嵌進 app.aware-wave.com 一鍵架站按鈕（Phase 5）
- 【計畫完成，未實作】客戶機「開機後全棧部署+維護」層（provider 無關）
- app.aware-wave onboarding/provisioning IA 重整 — Phase 1 退役 ops-console
- （出國前必做）Termius 手機 SSH 設定 + cheat sheet 書籤
- 🔴【硬死線 2026-11-12】Soulful 網站搬離 Hostinger（hosting 不續約）
- 既有站接手（Soulful Expression Art Therapy）
- 【2026-08-25 開出｜小｜文件一致性】Soulful staging「abandon」決策未傳播到 3 份仍在宣告它的文件
- 既有站接手 Day 1（Soulful Expression）
- 蒙古客戶 Cloudways 實際建站：待客戶刷卡配合
- 新站建置（Scenery Travel Mongolia）
- 新站建置 Day 1（Scenery Travel Mongolia）
- Next-Gen 試點 — Day 2 雲端 staging 實機驗收（僅剩 Scenery）
- `tenants/templates/` v2
- `lobster-factory` A10-2 商業閉環實跑
- 【2026-08-25 開出】`ao-resume-last.txt` 錨點卡在 2026-06-12，AO-CLOSE 視窗計算長期失真
- 【2026-08-24 開出】CHANGE_IMPACT_MATRIX 漂移偵測腳本首輪 7 個 WARN 待人工確認
- 【2026-08-25 開出｜偵測器說謊】Repair Center Phase 4 週巡檢 Check 3 誤報 `restore drill overdue`
- 【2026-06-05 開出】塔羅牌工具 → MEGA → WooCommerce 三階段路線圖
- 【2026-05-30 開出】endpoint-alert.sh 自動化部署機制
- 【2026-08-15 開出】SG dockerd/containerd 持續吃 CPU（2 核機器 load 3.2）
- 【🟠 Major M2-M4/M7-M10 + 🟡 Minor m2-m6/m8-m11】剩餘 7 Major + 9 Minor
- 建立跨國稅務與法遵顧問審核流程（法律文件外部審核）

## Yesterday context
最後 WORKLOG 記錄（2026-08-17）：自動週報代理生成 weekly-summary-2026-08-17.md，無程式碼改動（DOC_ONLY）。最近一次實質任務係 2026-08-25 Codex 額度耗盡後停用 stop-time review gate，並開出多條待辦（CP950 backlog、影片歸屬重設計、ao-resume 錨點失真等）。

## 6) LAST_SYSTEM_STATUS.md (appendix)
# System Guard Status

- Mode: `manual`
- Time: `2026-08-26 12:37:31`
- Health score: **100%**
- Threshold: **100%**
- Health gate exit code: **0**
- Closeout report exists: **YES**
- Result: **PASS**
- Auto-repair attempted: **NO**
- Auto-repair result: **N/A**

## Latest Reports
- Health: `reports/health/health-20260826-123728.md`
- Closeout: `reports/closeout/closeout-20260826-123532.md`

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














