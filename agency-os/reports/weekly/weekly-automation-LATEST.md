# Weekly Summary 2026-10-19

> Period: 2026-10-13 → 2026-10-19 | Generated: 2026-10-19 01:12 UTC by remote-weekly-agent

---

## Completed this week

### 備份與監控 (2026-10-14/15)
- **備份覆蓋 B1–B11 全上線**：8 庫全從 Cloudflare R2 演練 PASS（WORKLOG 2026-10-14 續21、續25；2026-10-15 續5、續6）
- **Cognitive OS 專案 ID 懸空（19/19）修復**：匯入前先向 Cognitive OS 確認；19 筆改「未匯入」（WORKLOG 2026-10-15 續11、續13）

### 治理 / 腳本清理 (2026-10-14)
- **automation/ 兩套排程腳本合一**：刪根目錄 automation/、docs/CHANGE_IMPACT_MATRIX.md 舊副本、.agency-state/；REGISTER_SYSTEM_GUARD_TASKS 改用 repo-roots.ps1（WORKLOG 2026-10-14 續18）
- **M3 客戶交付報告腳本刪除**（操作者授權）
- **smoke-status-digest Case1 修正**：HEAD 就紅問題，改成「無報告＝PASS」，19 case 全過
- **按鈕字級 13px → 14px**（`.btn-primary`/`.btn-secondary`，2026-10-14 操作者同意）

### ADR 017 客戶怎麼買 — 計畫強化 (2026-10-16~18)
- **Codex 第一輪審閱 25 條全修**：點數許可分支、取消狀態機、授權檔款項落定閘、API key 到期輪替等（WORKLOG 2026-10-18 續2）
- **Codex 第二輪審閱 13 條全修**：max_tenants 交易鎖、install_id 保留、woo-billing 路由等（WORKLOG 2026-10-18 續5）
- **新增順序 8「每個產品長成單一產品的樣子」**：cs/collect/outreach 補登記列，開門三步規範（WORKLOG 2026-10-18 續6、續7）
- **AwareWave 積木目錄整合 System Foundry**：`sync-foundry-catalog.mjs`，`Q-AW-<KEY>` 問卷節，ADR 017 §0b 第 7 條（WORKLOG 2026-10-18 續8）
- **白牌網址支援**：ADR 018 §2 加 `custom_domains` 表、DNS TXT 驗證、自動憑證；待決 4（Cloudflare for SaaS vs ACME）；監工台 9 步版重發（WORKLOG 2026-10-18 續11）
- **TASKS 打勾：EU/SG 搬遷 14 項 + staging 孤兒**（操作者 2026-10-18 確認完成，開放待辦 142→127）

### System Foundry v1.7 計畫 (2026-10-18)
- 實測發現 74 節藍圖只有 3 種內容（62 節同一段樣板），範例 intake 過期；六張執行卡 V17-1…V17-6（WORKLOG 2026-10-18 續9）

### 社群管理平台 V1.5 (2026-10-17~18)
- **C19 骨架與路由**：頂部六區、六分頁、左側頻道清單（WORKLOG 2026-10-17 續24）
- **C20 撰寫頁 API 骨架**（WORKLOG 2026-10-17 續18）
- **C21 撰寫頁**：左選頻道＋中撰寫＋右預覽，N 則留言延遲送出，標籤、週期性安排、自動回覆，tsc 0 + 276 files / 2562 tests green（WORKLOG 2026-10-18 續10）
- **C22 日曆**：卡片、疊放、三欄篩選、批次動作、已刪除（誰刪的）、月換月、週期展開，LogView ACTION_NAMES 補 0105 動作名（WORKLOG 2026-10-18 續4）

### 客服 UI (2026-10-18)
- **客服分頁頂部重做**：狀態改純文字、分頁改底線式（續3）
- **SubTabs 改用 .tab-bar 元件**：去黑框、去捲軸（續12）

---

## Open tasks

### A ⏰ 有外部時鐘
- `【🔴 硬死線 2026-11-12】` Soulful 網站搬離 Hostinger — 剩③ 網域轉 CF Registrar（④ 到期無需管）
- `【⚠️ 逾期 76 天｜原 2026-06-17】` Defender 木馬 `Trojan:Win32/PowhidSubExec.B` 來源查清
- `【⚠️ 逾期 49 天｜到期 2026-08-31】` 重新啟用 Codex stop-time review gate
- `【2026-10-15 觸發】` aware-wave.com DMARC 升級（pct=25 → pct=100）

### B 🔒 卡在操作者
- `【資安】` staging WP admin 密碼明文在 Trigger.dev run output — 輪換 2 站 + redact 9 run + deploy
- `【ADR 017 待決 1】` 訂閱定期扣款用哪個 WooCommerce 外掛（擋第 4 步）
- `【ADR 017 待決 2】` Postiz AGPL-3.0 買斷交付前律師確認（擋第 5 步）
- `【ADR 017 待決 3】` 點數不退、不轉讓條款寫法及會計確認（擋第 4 步）
- `【ADR 017 待決 4】` 白牌憑證走 Cloudflare for SaaS 還是 on-demand ACME（擋第 9 步）
- `【Postiz Task 2】` OAuth app 審核：Meta IG+FB / Reddit / LinkedIn
- `【Cognitive OS P4】` 報告核准角色 + 每日 token 額度決策
- `【Soulful 排程頁驗收】` 台灣 03:00 部署後改一格，確認 ops_audit_events 有寫入

### C 🔒 卡在外部
- Cognitive OS P2 研究線：操作者定門檻後才能做成 Project 工作流
- System Foundry v1.7 執行：等 V17-1 開工授權

### D–G ▶️ 可直接做（依優先序）
- 【D 安全】`video/[id] DELETE 無引用檢查` — 客戶站已破圖（Soulful post 7393 嵌壞 MP4）
- 【D 安全】`cloudflare-realip.conf` 網段清單靜態、無偵測器
- 【E 治理】共用 git index 停在舊版（`git-commit-scope-guard.js` 未涵蓋路徑）
- 【E 治理】SSH 腳本無存活檢查（10 支 ssh 中只有 1 支有 `ServerAliveInterval`）
- 【E 治理】`verify-governance-pointers` 未接進 commit hook
- 【F 產品】ADR 017 順序 1–7 開卡做（等待決 1/2/3 解鎖即可開第 1、2、3 步）
- 【F 產品】社群 V1.5 C23–C31（撰寫頁後半）
- 【G 基建】主機 nginx `hci.aware-wave.com` 區塊漂移（覆蓋會讓 hci 下線）
- 【G 基建】MainWP E2E（next-admin DEPLOY_HOLD 解除後）
- 【G 基建】Cognitive OS run lock 只增不刪
- 【G 基建】4 個 migration 從未套用到 prod（0022/0024/0037/0057）
- 【G 基建】`REGISTER_AUTOPILOT_PHASE1_TASKS.ps1` PS 5.1 param bug

---

## System health

> Source: `reports/status/integrated-status-LATEST.md` (generated 2026-10-14) + 2026-10-13 monthly review

| 項目 | 狀態 |
|------|------|
| ks-aw-01 主機 | 唯一主機，無報告本週異常 |
| Supabase memory | 33.26% (2026-10-13 monthly review，< 85% 正常) |
| Backup B1–B11 | ✅ 全上線，R2 演練 PASS (2026-10-14/15) |
| CI / GitHub Actions | 上週 2026-10-10 修復後無新紅燈報告 |
| Cognitive OS | 正式站上線；P4 待操作者決策 |
| social.aware-wave.com | C21/C22 待 03:00 部署 |
| 排程頁 audit 寫入修正 | 已 commit，待下次 03:00 部署生效 |

> **注意**：integrated-status 報告已 5 天未更新，建議手動或觸發 `generate-integrated-status-report.ps1` 確認最新狀態。

---

## Risks & blockers

| 等級 | 項目 | 說明 |
|------|------|------|
| 🔴 Critical | Soulful 硬死線 2026-11-12 | 只剩域名轉移③，須操作者在 Cloudflare Registrar 執行 |
| 🔴 Critical | 客戶站破圖 | Soulful post 7393 嵌壞 MP4，`video/[id] DELETE` 無引用檢查 |
| 🔴 高 | Defender 木馬逾期 76 天 | `Trojan:Win32/PowhidSubExec.B` 來源未查 |
| 🔴 高 | staging 密碼外洩 | Trigger.dev run output 有明文，需操作者輪換 |
| 🟠 中 | DMARC 升級觸發 | pct=25→100，需確認 rua 報表 |
| 🟠 中 | ADR 017 四個待決 | 擋第 4、5、9 步，計畫可先做第 1、2、3 步 |
| 🟡 低 | Codex gate 停用 49 天 | 無機械 stop-time review，靠手動 `/codex-review` 補 |
| 🟡 低 | integrated-status 報告 5 天未更新 | blind spot |

---

## Memory highlights

- **ADR 017 三軸定案**：部署（hosted/self_hosted）、商業（contract/credits/perpetual）、操作（actor + on_behalf_of）；五種客戶方式＝三軸組合，不改程式；許可只問 `can()`
- **ADR 018 白牌網址**：新增 `custom_domains(host, organization_id, product_key, verified_at)`，DNS TXT 驗證，憑證自動；待決 4 決定後才能做第 9 步
- **AwareWave products ↔ System Foundry**：`products.ts` 是唯一產品清單（ADR 012 §5），`sync-foundry-catalog.mjs` 匯出成問卷節 `Q-AW-<KEY>`
- **System Foundry v1.7 判定**：留選擇引擎，刪 74 節樣板；補每模組一張可執行卡（六張 V17-1…6）
- **社群 V1.5 進度**：C19（骨架）、C20（API 骨架）、C21（撰寫頁）、C22（日曆）本週完成；待 C23–C31
- **EU/SG 搬遷正式關閉**：15 個 TASKS 條目操作者確認打勾，開放待辦 142→127
- **客服 tab UI**：改用 `.tab-bar`/`.tab-count`，全 app 的 `.tab` 補 `:focus-visible`
