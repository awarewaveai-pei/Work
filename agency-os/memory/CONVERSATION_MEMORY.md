# Conversation Memory

> Historical snapshot note: this file preserves cross-session context and may include decisions from older process versions. For current operating rules, use event SSOT docs: `docs/overview/REMOTE_WORKSTATION_STARTUP.md` (AO-RESUME/startup、**§2.5 日內 Git 節奏**) and `docs/operations/end-of-day-checklist.md` + `.cursor/rules/40-shutdown-closeout.mdc` (AO-CLOSE/shutdown). Agent-enforced Git detail: `.cursor/rules/50-operator-autopilot.mdc` §7.

## Current Operating Context
- **2026-10-03 (AO-CLOSE, 視窗 2026-09-30 01:42 → 2026-10-03)** — 主線三條：(1) **Cognitive OS**：報告核准防偽造／競態、跨專案來源搜尋、字級 U22（10-01 部署 `b51095cbf`）；正式站舊專案抹除（WC-15 ⑤）、P2 DOD-2 PASS；要回 JSON 的 AI 呼叫一律帶 schema、schema 失敗只記違規路徑不記值（`118958b5f`）；新方法 生命時間線、個人 SWOT（案主版）、風險矩陣 5×5 圖、根因分析工作流（PR #28/#30），工具數 286；10-03 收工前部署 `ebbf363cc`（試跑 PASS，細節 WORKLOG 2026-10-03）。主機 checkout 改唯讀 deploy key，remote URL 不再含 token。(2) **治理／hooks**：AGENTS.md 模型路由表＋每輪觸發索引（由 TOOL_TRIGGER_MAP 產生，pointer 閘守）；file-claim-guard（同檔未提交只准一個 session 寫，含 Bash）；git-log-injector 截斷；CI perplexity 閘豁免 append-only 紀錄資料。(3) **認知主權平台**（新產品，Cognitive OS 為引擎）：13 塊積木、18 份 12 欄契約、supervisor 頁多輪重排成一頁圖；仍是設計文件，未寫程式。另：DMARC 第一階段 pct=25（10-15 升 100）、4 個漏套 migration 上 prod、0094 RLS 待 go。next-admin 自 10-01 `4fb538b5d` 後無改動，未部署。
- **2026-08-29 (AO-CLOSE, session window 2026-08-27 → 2026-08-29, 三天兩段大整併+搬家後實战抛錯修復)** — **8/28 整併**：soulful（Hostinger）+ SG（5.223.93.113）+ EU（204.168.175.41）三台全部搬入 **ks-aw-01**（OVH，149.202.64.114，SSH -p 58122）；13 筆 DNS 切換、OVH Edge Firewall、三輪 Codex 安全覆審 15 findings 閉環、換機 runbook 建立。**8/29 發現並修復的真實缺陷（非搬家造成，既有架構問題）**：① Netdata Cloud claim（Ubuntu 發行版 --disable-cloud 不能 claim，換官方 stable 版）② aware-wave.com 補 DMARC ③ **studio.aware-wave.com 500** 真根因是 `.htpasswd_studio` 搬家漏拔被 Docker 自動建成空目錄（修復途中意外打掛 SG 站 90 秒，已復原）④ **CF Rate Limit 誤封 studio/trigger**：全域規則排除清單漏內部後台 SPA（已追加 studio/trigger/n8n/uptime/mainwp/postiz）⑤ **api.aware-wave.com / oracle.aware-wave.com 從未接線**（從 2026-06 建立就漏接，錯發到 WordPress 却同樣回 200，狀態碼看不出來）⑥ **wp-admin 無限重導真根因**：`lobster-nginx`（內部只聽 80 埠）的 13 處 `X-Forwarded-Proto $scheme` 把上一跳 host nginx 已正確設的 https 覆寫成 http，导致 WordPress is_ssl() 永遠失效，全改用 `$http_x_forwarded_proto` 修復。⑦自檢發現並修正兩次 R4「聲稱即驗證」違規：(a) 自己誤判 25 處舊 nginx SSOT 檔為「死檔」（grep include 方法論錯，這類檔用 cp+ln -sf 部署非 include）(b) 否正他人的推翻說「現行 production」也錯（SSH 進舊 SG/EU 檔案對了但檔案對應的容器全滞，本機直連實測全部 502，誤把公開網域（DNS 早已指新機）的回應算給舊機）——**正確結論：既非死檔亦非現行，是搬家前架構歷史快照**。⑧ CLAUDE.md/AGENTS.md 部署規則段補上「SG=ks-aw-01非5.223.93.113」明確警告，防未來 session SSH 去已停止的舊機部署。⑨ `check-deploy-drift.ps1` 實測：真實 app-code 落差只有 1 個 commit（就是自己修的 nginx 檔，已手動驗證上線），ks-aw-01 自動部署 cron（每 4 小時）journal 確認持續正常運作。**待辦**：KS-6 付款完成後執行換機 runbook；舊 SG/EU 容器已全滞但保留待操作者說「刪吧」才真删機。
- **2026-07-05 (AO-CLOSE, session window 2026-07-04 → 2026-07-05)** — Short session focused on onboarding public intake + infrastructure fixes. Key completed: (1) **Phase 4 /intake 公開表單** — Next.js route group 重構 (shell)/(public)、5-step React form、intake-browser API with feature gate + rate limit、critic 安全閉環（2 Critical + 2 Major 全修，915245b0）; (2) **Phase 5 Cloudflare Turnstile 接入**（6306cd8e）— gate logic Critical fix（prod bypass 必須有 SECRET_KEY）+ 前端 widget explicit render + token refresh; (3) nginx /start/→intake redirect 建了再 revert — 還原 FluentForm 原始接單流程（WP→FluentCRM→Supabase→觸發建站，44da8365）; (4) **EU VPS ClickHouse OOM 根治** — mem_limit 1536m→3072m，20GB crash log 清除，restarts=0，healthy（00ea2e03）; (5) **trigger-build CF hairpin 修復**（11886d04）— 改用 http://next-admin:3000 內部路由 + fetchWithRetry（2 retries）+ failed 時 reset intake_form.status→"spec_generated"；MONGOLIA-03 手動解鎖可重試; (6) 蒙古旅遊客戶 handoff docs x4（現場開機 checklist + Cloudways 方案）; (7) repair_runs_source_check 補 'deploy'（0059 migration）; (8) human_only incident 改「已知悉」UI（70b17903）. 仍開放：Stage 4 開閘（High risk，需 go-ahead）、soulfulexpression.org CF DNS 遷移、POD Phase 4 e2e、Canvas 整輪瀏覽器實測。

- **2026-07-02 (AO-CLOSE, long session window 2026-06-12T05:27Z → 2026-07-02)** — Last AO-RESUME stamp was still `2026-06-12T05:27:33.6508893Z`, so this closeout covered a large 2,306 first-parent commit window instead of only today's work. Main completed themes: next-admin/content-studio/canvas/video/oracle/POD feature and fix batches; multi-tenant security guard rollout S1–S5; cold outreach Phase 1 and per-org Supabase routing; customer-service U0–U5 plus U6 Chatwoot handoff gated on buying the dedicated server; WordPress provisioning/catalog/tourism pipeline fixes; ops-inbox `client_slug` propagation; sg-deploy/workflows build fixes; governance hook v2, WORKLOG rotation, junk guard, and command/skill index sync. SG deploy drift was rechecked during closeout: SG `.deployed-commit` matched `origin/main` (`6751854a...`), so `SG production app-code drift` was marked done via WORKLOG `AUTO_TASK_DONE`. A final housekeeping commit removed tracked `$null` and added `/nul` to `.gitignore` to keep AO-CLOSE from staging shell artifacts.

- **2026-06-26 (AO-CLOSE retention correction)** — 使用者抓到 AO-CLOSE 仍有 `>30 days` report prune 與既有 90 天保留期不一致。已完成兩段修正並 push：`cba741aa` 把 AO-CLOSE command/prior-close guard 改回 90 天並恢復 `reports/ao-close/2026-05-25-1837.md`；`625e6442` 補齊 AO-CLOSE/AO-RESUME report README、`agency-os/README.md` archive 範例與 `scripts/archive-old-reports.ps1` 預設 `KeepDays=90`。驗證：相關 PowerShell 腳本 parse OK，current AO retention authoritative grep 對 stale 30-day tokens 為 0 matches；歷史 WORKLOG/report/log/cache 不回寫。

- **2026-06-24 (AO-CLOSE #2, CanvasEditor 匯出移右側工具欄)** — 窗：本 Claude Code session（2026-06-24 上午）。使用者要求：① PNG下載/WebP下載/存入 My Designs 全部移到右側工具欄；② PNG 不再顯示尺寸標籤。**已完成**：CanvasEditor.tsx — 頂部工具列移除 editName input + 3 顆按鈕；右側工具欄新增 SidebarPanel id="export" title="💾 匯出 / 下載" 作為第一個 Panel；移除死狀態 exportPxLabel + setExportPxLabel（state 宣告 + 2 call sites）；修 stale comment；修 WebP tooltip 150KB→200KB 對齊實際壓縮目標。**驗證**：tsc 0 + vitest 487/487 + critic Deep 0C/0M（2 minor 已修）+ BUGHUNT hits=4（全 doc 歷史紀錄，無程式碼 callsite）。**部署**：SG commit `c8d9d34f`，healthy 6s，smoke 4/4，playwright 26/32（6 skip = auth-gated 正常）。Canvas 整輪瀏覽器實測仍待操作者。

- **2026-06-24 (AO-CLOSE, UI bug fixes + SG deploy)** — 窗：本 Claude Code session（2026-06-24 凌晨）。三個 TarotStudio/CanvasEditor 介面問題修復並部署 SG。(1) **OutputTrackBar 按鍵重整**：新增 `PNG下載`（直接 triggerDownload）+ 將「🌐 網頁用 WebP」改名 `WebP下載`；JSX 重組為兩列（下載列 / 印刷+快速編輯列）；加 `hideQuickEdit?: boolean` prop（`OutputTrackBar.tsx`）。(2) **TarotStudio 快速編輯上移**：加 `buildSemanticBase`/`openInCanvas` imports；OutputTrackBar 傳 `hideQuickEdit`；在 `ImageEditPromptPanel` 正上方加獨立全寬快速編輯按鈕（`TarotStudio.tsx`）。(3) **CanvasEditor 橫向滑桿修復**：`applyCanvasSize` `MAX_DISP` 從硬編 1100 改為動態 `containerWidth`；加 `ResizeObserver` effect 追蹤容器寬；加 `sizedByCanvasApply` ref 守衛初始 image load，防 resize re-apply 破壞初始構圖（`CanvasEditor.tsx`）。**驗證**：tsc 0 errors + vitest 487/487 pass + critic Deep 0C/0M + BUGHUNT hits=0；SG deploy `36fcfd6a` healthy + smoke 26/32 pass（6 skip = auth-gated 正常）。**commit**: `fd8e088b`（code）+ `45d3b650`（WORKLOG）。**剩餘**：init-load `maxDisplay=650` 硬編 minor（純 UX 不影響 export），可後補。Canvas 編輯器整輪瀏覽器實測仍待操作者完成。

- **2026-06-16 (AO-CLOSE, Content Engine 品質鏈 + POD A2 自動轉單 dormant)** — 窗：06-15 17:30 → 06-16 08:2x（凌晨主線）。三條主線全已部署 SG（最新 `e336d5da`）。(1) **Content Engine generate 品質鏈**：品質修正包 `1e1d55cf`（截斷修正 = SIZE_TOKENS 倍增 + CONTENT_META 移文首使 body 截斷仍保 SEO 標題/描述；內連防造假護欄；新 `related-posts/route.ts` 查真站 posts+pages 回真實 permalink；streaming 截斷 marker + publish 防禦縱深）+ 結構開關「Yes」正面強制 `fd965dbc`（REQUIRED ELEMENTS 硬 MUST）+ `/api/content/title` RankMath 合規 `88da4d38`（建議標題補數字+力量詞，EN/CJK 雙語感知，與 generate H1 規則同步）。全 REALTEST 真打 Haiku 驗證。**剩**：生成草稿零持久化（重整即失，待選 Supabase 表 vs localStorage）、trending 來源擴充、清理已發佈假連結舊文 `expressive-arts-emotional-wellness`（404）。(2) **POD A2 自動轉單管線**（`ad14f5f1`/`f3c4d981`/`e336d5da`）：Woo 成交 webhook → Printful **DRAFT**（kill-switch `POD_AUTO_FULFILL_ENABLED` 預設 OFF + HMAC 驗簽）。**已上 prod 但完全 dormant**（probe 實證回 `auto_fulfill_disabled`，零金流）；333/333 test 含金流紅線守門（kill-switch off → createDraftOrderOnNative 絕不呼叫）。**confirm/送印紅線完全沒建**（測試結束 + 操作者明示批准才議）。啟用 = 操作者三步（SG .env 設 flag+secret 重啟容器 → WP 加 Woo webhook → 仍 draft-only）。另 A1 hardening（`1b081764`，transient classifier + SKU-faithful 冪等）。deploy gate 連抓兩個本機被掩蓋問題（server 無 global crypto → node:crypto；next build 拒 route 非 handler export → 純函式移 lib/studio/woo-webhook.ts）= gate 價值實證。(3) **基礎設施修**：doc-sync `Resolve-Path`/`Test-Path` 補 `-LiteralPath`（`b71f72a6`，修中括號檔名紅字閃窗）；`REGISTER_SYSTEM_GUARD_TASKS.ps1` 由 schtasks（/TR 261 字限制致隱藏任務靜默建不起）改 `Register-ScheduledTask` 模組（`c4ae159f`，Daily-only 隱藏靜默）；start-trigger-mcp pwsh7 fallback 絕對 powershell.exe（`dd18d9d4`）；wp-bridge FluentCRM newsletter draft route **WIP 未發版**（`NewsletterCreator.php` 只 draft + status 斷言、`/newsletter` 路由、版本 0.11.0，php -l 全綠；runtime REALTEST + 發版待 go-ahead，紅線=只草稿永不寄）。**明日優先**：① Defender 木馬 `Trojan:Win32/PowhidSubExec.B` 資安複盤（2026-06-17，已無 active threat，當正式事件善後）② newsletter REALTEST + 發版 ③ 公司桌機換機時重跑 SystemGuard 註冊器 + cloudflare vault token 修（cfat_ 非 cfut_）。健康 100%（372/372）。
- **2026-06-11 (AO-CLOSE, wp-bridge v0.9.0 + POD Studio 藍本全閉環)** — ① **wp-bridge v0.8.0→v0.9.0 發版**：v0.8 可變商品（WC_Product_Variable atomic+rollback）；v0.9 = WC 全可寫欄位 + **Kadence 積木商品描述**（blocks[]→BlockLibrary，與 /post 同引擎）。critic Deep 0C/4M 全修（sale<regular reject / shipping_class auto-create / term-race recovery / meta 保留鍵 blocklist）。真站驗 soulful product 7133（14 變體 + 描述 40 Kadence 積木 12 型別 + 全欄位）。範本 SSOT `agency-os/docs/wp-bridge-product-template.md`。② **Tarot 103 prompt 重寫**（結構化修飾式+去場景污染+去 negative+畫家名錨）。③ **POD Studio 藍本補完**（`lobster-factory/docs/POD_STUDIO_ROADMAP.md`）：逆向同事 Jon MEGA 全功能（附錄 B：**Mockup Studio 平拍+模特雙模式** = AI 合成擬真商品圖／Analytics／Pricing base/plus／多租戶 Users／Bella3001 印刷規格 300DPI 3600×4800）+ **P4 訂單自動履約閉環**。**核心決策：設計+建商品自建（AI 加值，用 Replicate Nano Banana 2 合成），履約用 Printful 原生 WooCommerce 整合（免費自動，不重寫）**。前端設計器原型 `d:\tmp\tshirt-designer-prototype.html`（Fabric.js 可行性已證）。衫只做白+黑。明日動工：試生一張 AI mockup 驗擬真合成 → 排 P2a→P4。handoffs: `2026-06-11-0254-pod-studio.md` + `2026-06-11-0236-add-tarot-models.md`。

- **2026-06-09 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-06-09 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:6909326a9ef153b9f74fce81dbefddc4fa1282b01e32b0a323ed7349b3ee9d6b -->
- **2026-06-09 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-06-09 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:a43a63b55d4f47cdc655b3857249b3722b722ef37fb17a309bffb8b0490c6314 -->
- **2026-06-09 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-06-09 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:623db456f797cdc58e4211cb21d25545c228ef90e213cb4ebde9c155a0ffe96a -->
- **2026-06-06 (AO-CLOSE, SEO/GEO Content Engine 產品化)** — 把 `docs/wp-kadence-ai-seo-geo-content-engine.md`（3920 行 spec）落地成可用資產（全 doc-only `.md`）。產出：通用引擎層 `docs/seo-content/`（`prompt-kit.md` 無程式產文流程 / `GEM-1-onboarding-positioning.md` + `GEM-2-seo-geo-content-engine.md` 兩顆 Gem：onboard 一次+產文多次 / `spec-review-and-gaps.md` 平台 errata / `articles/what-is-art-based-healing.md` 首篇範本）+ 客戶層 `tenants/company-soulful-expression/sites/soulfulexpression-org/content/CONTENT_STRATEGY.md`。**定位拍板（鎖定）**：公開門面 **Arts Practice for Self-Discovery** / 學術 EdD 框架 **Arts-Based Reflective Pedagogy**（理論 Schön/Kolb/Mezirow）/ 非臨床 art therapy（受規管詞避用，YMYL：禁療效保證+disclaimer+台灣危機專線 1925/1995）。域名 **保留 soulfulexpression.org**（域名關鍵字對 SEO 無影響；真風險=品牌紅海撞名 Soul Expression Arts 等 → 解法獨佔 WuSheng Healing Module™）。**未動** spec 主檔（另一 AI 並行編輯，operator 喊停）；§49 errata 暫存 spec-review 待 pull 後補。**待 operator 補真實資料**（頭銜/EdD/價格/IG/學術引用）文章才可發布。handoff: `handoffs/2026-06-06-2044-seo-geo-content.md`。
- **2026-06-05 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-06-05 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:dfb009080d41476d22c397945a259370d91cd6b57c3bd15dbc6e1b78a78895e5 -->
- **2026-06-05 (AO-CLOSE)** — **塔羅牌印刷檔生成工具上線**（並行 session 另做 wp-bridge v0.1–v0.3 / tomo packets / onboarding IA）。新功能 `app.aware-wave.com/tools/tarot`：文字/img2img 生風格樣本→鎖定→整套 78 張同風格→client canvas 組印刷牌卡（70×120mm @300DPI 含出血）→JSZip 下載 PNG。薄 server（金鑰只在 server，一張一 request），5 個模型選單（flux-schnell ~NT$8/套最省、openai-low、flux-dev 吃上傳圖、openai-medium/high）。已部署 SG `ccfbd176`。**金鑰大坑（部署後才爆）**：SG `.env` 完全沒 REPLICATE_API_TOKEN + compose 沒接 REPLICATE/OPENAI + 原 OPENAI 是假 placeholder；憑證檔原 key 全 401。修：compose 加兩 key + .env 補（多備份）+ 使用者給新 key。新 Replicate `r8_MXAU…` 實測 flux-schnell 真生圖 5s ✓；OpenAI 新 key 有效但帳號 `billing_hard_limit_reached`（使用者待加 billing）。新 key 同步憑證檔+SG+vault。**教訓**：explore agent「.env 有 key」是未驗證假設→部署後才爆；依賴 server secret 的新功能，部署前先 SSH 確認 secret 真在 target container env。critic 抓 3 High（SSRF/錯誤外洩/上傳圖驗證）全修。
- **2026-06-04 (AO-CLOSE, session 2)** — 三條主線。(1) **app.aware-wave.com 全讀 + 分析**：徹底讀完所有 codebase，產出 `agency-os/docs/operations/APP_AWARE_WAVE_COMPLETE_REFERENCE.md`（1800 行，含 §14 完整 12 問題 code evidence）；12 問題含 🔴 Auth 403（nginx 未注入 proxy-auth）、🔴 WpUpdateButtons 無樣式（Tailwind in non-Tailwind app）、🟠 Repair Center 佇列邏輯漏洞、🟠 repairs/health 每次 SSH 等。(2) **線上 webhook 緊急修復**：2.3 小時全斷（07:02–09:21 UTC），原因 PostgREST PGRST202（migration 0035 存在但 schema cache 未刷新），`NOTIFY pgrst, 'reload schema'` 修復；教訓：每次加新 function 必刷 cache。(3) **Memory 進 git + /tomo**：.gitignore 修改讓 41 個 memory 檔案被 tracked（cross-machine sync）；`/tomo` 建立大修改 handoff packet。
- **2026-06-03 (AO-CLOSE)** — 兩條主線。(1) **Provision-staging Kadence+plugins**（commit `2942cf1d`）：`route.ts` Step 6+7 加裝 Kadence 主題 + kadence-blocks/seo-by-rank-math/fluent-smtp/litespeed-cache/fluentform；SSH real-test 確認 Kadence+5 plugins active；sg-deploy exit 0，Playwright smoke 22/30（api-health 2 failures 為預存 nginx-auth 問題，非 regression）。(2) **Cloudflare WAF wp-login 403 臨時修**：操作者 IP `114.32.129.172` 不在 CIDR `114.34.0.0/15`；API patch 加入 `114.32.0.0/15`；**永久修**（改 `ip.geoip.country in {"TW" "SG"}`）存 tomo → `handoffs/2026-06-03-1749-tomo-174946.md`。
- **2026-06-02 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-06-02 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:756202b7e05e480d7a8af387cca8a2372c436d9e362ffc480933c0cd72dee1e3 -->
- **2026-06-02 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-06-02 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:5d168d0bc6f04e6102bd2d3f9a0171782f0619b09ecfd7cc72a5b81a549287b7 -->
- **2026-06-02 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-06-02 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:d47de374f44a269f34d34ea5d1ef7797137f2acf0e67d4e602d7cec9bd46e416 -->
- **2026-06-02 (AO-CLOSE)** — 兩大主線。(1) **npm audit 自動化 + GHA CI 升級**（commits 6c228230/814756ad/f0bea4f0/35ff5429/bdc23464/058d2754）：`qs 6.11.1→6.15.2` 修復 GHSA-q8mj-m7cp-5q26 DoS；GHA `weekly-workflows-security-audit.yml` + Slack+Telegram 雙語通知（每週一自動）；`upload-artifact v4→v5`；Node.js 24 強制（2026-06-16 deprecation）；TASKS 「npm audit 例行週檢」結案。(2) **Client Onboarding Portal MVP 完整落地**（commits 90ea27d2/8ca09075/35914449/8fa40926）：14 段規格 `agency-os/docs/architecture/client-onboarding-portal-spec.md`；`lib/onboarding/{intake-form,package-selector,spec-generator}.ts`；EU Supabase migration `0034_intake_forms.sql`；`/api/onboarding/{submit,generate-spec}` routes；`/ops/onboarding` UI + nginx auth；sg-deploy smoke 4/4；spec-generator JSON 結構 fix；`/tomo` → `handoffs/2026-06-02-1735-onboarding-portal-e2e.md`（§7 staging build 串接待下輪）。次要：routines SSOT backfill（aa32970c）；WeeklyReview auth 手動確認。**AO-RESUME 17:55 CST → 立即 AO-CLOSE**（無新工作）。
- **2026-06-01 (AO-CLOSE)** — 三條主線。(1) **ao-resume 設計根治**：ao-resume.ps1 health gate soft-exit + Case B1/B2 + `<WORK_ROOT>` 動態化（commits c1d1180c/610a62b5）。(2) **Phase Z8 — AO-RESUME archive 機械閘**：新 `verify-aoresume-archive.ps1` + `system-health-check.ps1` gate 12d（commit a67ac175）；health 100% (363/363)。(3) **GitHub auth 根因修復**：`gh auth switch --user awarewaveai-pei`；pull --rebase 530 commits + push 14 commits，0/0 對齊。**EU VPS ClickHouse 備份清理**：0 errors 13 天 → 906MB 刪除，disk 36%。
- **2026-05-30 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-30 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:899f9bba92a62362befff35dc2de8c4056969e6aaac1b4ee7014249510f744d7 -->
- **2026-05-30 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-30 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:1587bb790aa0a750b5207d8f67cbd7b5f05d74b087f91d7ab473279e0a8f99b3 -->
- **2026-05-30 (AO-CLOSE, app.aware-wave.com 分析 → CP950 gate → onboarding 跨機固化)** — 4 條主線。(1) **`/api/ops/summary` 客戶來源統一**（`0b992b6`，已部署 production）：移除寫死 fallback tenants（slug `awarewave`/`soulful-expression` 與真實 DB `awarewave-ops` 不符），改成只讀 `organizations`，讓 ops-console 與 ops/clients 不再分歧；sg-deploy exit 0 + Step 7 smoke 4/4 + curl 實測 `sourceOfTruth: supabase` 真實 slug；post-deploy Playwright smoke 26/0/4 PASS。(2) **playwright-runner.ps1 CP950 parse 失敗修復**（`2661e20`）：非 ASCII 裝飾字元（box-drawing/✔/→/—）全 ASCII 化（repo .ps1 走 git 不加 BOM）；解鎖被擋的 post-deploy smoke。(3) **CP950 parse-break 機械閘**（`be04f36`，防整類復發）：R0 impact scan 發現「非 ASCII + 無 BOM」天真規則會誤報 63 支正常檔 → 改用精準偵測（CP950 解碼後 `Parser::ParseInput`，全 158 支零誤報、僅 1 真壞）；新 `audit-cp950-traps.ps1 -ParseBreakOnly` + 接入 `system-health-check.ps1` 硬閘（Add-CriticalFailure）；修最後 1 支壞檔 `generate-customer-delivery-status.ps1`（CJK 是資料→加 BOM）；反例回歸 exit 1 驗證；AUDIT_REGISTRY 更正誤診。(4) **onboarding portal 研究跨機固化**（`15e00ca`+`2f893c7`）：使用者問「換機怎麼記得研究過的」→ 寫 `agency-os/docs/specs/client-onboarding-portal-CODEBASE-MAP.md`（§0 reading list + build/ops 側全 file:line + 精確 schema）+ raw fallback 副本 `docs/spec/raw/` + 更新 handoffs 1641/1644 指向它 + 更正「plan 檔不跨機」stale 註記（實為 git-tracked）。**跨機教訓**：對話 context 單次性，研究必須落地成 git 檔 + handoff 指針才會被 AO-RESUME 自動 surface（零記憶自動化）。**onboarding portal 14 段規格仍待寫**（研究完成、材料齊備）。
- **2026-05-28 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-28 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:2417d066c5a36f0811eb59320eaf7b3a8bf0179a41481eb8f2b77735ecc63b77 -->

- **2026-05-28 22:35 CST (AO-CLOSE 筆電 session, Phase Z + Z6)** — 跨機 30-year sync fragility 兩大破口連修。Phase Z (commits 4f63393/4dbaf03/25eb2e9/3ca0df4): 移除 AO-SYNC vault claude-settings.json 與 sync-claude-userlevel SSOT template 雙 SSOT 衝突 (8102794 引入); 新 scripts/ensure-claude-junction.ps1 自癒 (idempotent stress-tested) 接入兩個 hook UserPromptSubmit STEP 0 + system-health-check gate 12b (防 auto-checkpoint 在 junction broken 時誤 commit 49 tracked file 像 0d63eb9 那樣); git-align-main-aoresume-feature.ps1 加 Invoke-GitFetchWithRetry 3 attempts + git-fetch-last.json ledger; .claude/commands/ao-resume.md 加 Step 0a hook fail banner 規則。Phase Z6 (commit 58e48be): 修 archive-only items invisible to next AO-RESUME class-of-bug — 新 scripts/verify-archive-tasks-lift.ps1 (bold-token + sliding-window + 120-char anchor + archive-only escape) 接入 health-check gate 12c critical; .claude/commands/ao-close.md 加 Step 2.5 強制 lift 規則; 18:46 archive SG deploy 補 archive-only 註記。事件覆盤: 19:53 AO-RESUME hook 失敗 (DNS) 寫假結論; junction broken auto-checkpoint 誤刪 49 file (用 git checkout 2e2409d 還原 commit 4f63393); 並行 session 做 fewer-permission-prompts + 刪 13 密鑰 (50cf601 整合)。驗證: verify-build-gates ALL PASSED with 兩 gate 12b/12c active; health 100%; origin 0 0 aligned; stress-test junction 自癒可用; verify-archive-tasks-lift 對 18:46 正確抓 SG deploy missing。桌機下次: git pull + sync-claude-userlevel merge + 重啟 Claude Code。
- **2026-05-28 (AO-CLOSE)** — Session 2026-05-28 (AO-RESUME 01:31 UTC → AO-CLOSE)。**主線：Auto-Repair audit 2026-05-23 Batch 1 + Batch 2 全完成**。Batch 1（commit `c872012`）：M7 `approveRepairRun` null-check 早退（不再 `?? run` fallback stale state）；M8 `safeScriptPath` 加 `value.includes("..")` 防 path traversal；m6 新增 `isStrictTerminalState(state: string)` export（write gates 用，UI 仍用 forgiving `isTerminalState`）；m8-GHA Slack 區分 code-patch vs analysis-only；m9-doc `severityRequiresHumanReview` docstring 補 triage_needed gate。m6-ext（commit `6b9f9ea`）：`archiveRun` line 445 同樣改為 strict gate（grepping 後補發現 Batch 1 R0 遺漏）。Batch 2（commit `832c562`，tsc 0 / vitest 168/168 / critic Deep 0C/2M-fixed/3m-fixed）：m2 timing side-channel — 新建 `lib/security/timingSafeEqual.ts`（shared SSOT，HMAC-SHA256）；`verifyIngestToken.ts` + `telegramAuth.ts` 改 import 共用模組（消除拷貝漂移）；17 test 含 UTF-8 + source-level early-exit 機器驗證。m10 migration 0032 擴展 `archive_stale_repair_runs` 加 triage_needed 14 天（同簽名，零改呼叫端），已 apply EU Supabase。m11 migration 0033 `deny_anon_all` RLS policy on repair_runs，已 apply EU Supabase。AUDIT_REGISTRY 更新：4 Major（M2/M4/M9/M10）+ 1 Minor（m4）仍開放。/tomo packet `batch-3-post-phase` 建立（handoffs/2026-05-28-1807）：Batch 3 = M9 TOCTOU escalateAnalysisOnlyRun (service.ts:255)、M10 Sentry retry storm PL/pgSQL upsert (sentry/route.ts:43-71)、m4 uptime-kuma hostname；Post-Phase 4 = M2 per-source HMAC（影響 5 webhook routes）→ M4 fingerprint forgery（依賴 M2）。**Out-of-scope 安全發現**（informational，未修）：middleware.ts:20 plain `===` OPS_PROXY_SHARED_SECRET；slack/route.ts:24 length-check 洩漏（固定格式低風險）。
- **2026-05-27 (AO-CLOSE)** — Session 2026-05-26 → 2026-05-27。**4 條主線**：(1) **Hook 機械化 Plan C + exit-2 升級**（commits `4d1c3e8`, `6f55b89`, `7f3a78e`）：部署 5 個新/強化 hook — `git-log-injector.js`（M1，每 session 首次 Edit 前 exit-2 BLOCK 顯示 git log 10 lines，re-issue 通過）、`auto-repair-guard.js`（M3，auto-repair path exit-2 BLOCK 7 category × 獨立 flag，re-issue 通過）、`high-risk-bash-warn.js`（P1，docker compose down/VPS rsync/DB migration BLOCK，ACK 前置解鎖）、`code-change-tracker.js`（M2，.ps1 修改提示 /audit-encoding）、`verify-gate-stop.js`（M4，Stop 加 /review）；**架構發現**：exit-0 stderr 在 Claude Code PreToolUse 中**不可見**，exit-2 才可見 — 這是 advisory hooks 失效根因；exit-2 升級後 20/20 smoke tests pass，2 個 Critic Major fix（logFailOpen on unlink + per-category flag）。(2) **Governance SSOT cleanup P1-P8**（commits `903edf9`, `4ce8e1c`）：120s→300s stale ref 在 8 個檔案全修；§操作風險分級 從 CLAUDE.md 移到 AGENTS.md（Single Owner）；IDE boundary 混用修正；AGENTS.md 機械閘標籤 5 條更新為 exit-2 語意。(3) **bughunt-oracle.ps1**（2026-05-26，commits in prior session）：新機器驗證 gate，BUGHUNT_DONE hits=0 ASCII identifier 宣告被 oracle 驗證；staged-file exclusion + WorkRoot bounds check + param clobber fix；整合進 verify-closeout-completeness.ps1。(4) **一鍵架站 C1/C2/C3+M6+M8 apply**（commit `9b27506`）：dispatcher approval gate、siteId idempotency 409、Zod SSRF guard、manifestPath containment。**次要完成**：Claude Code 完整檔案參考清單（`febabfb`）；Cursor rules C1-I3 七項對齊（`55577e4`）+ 63.mdc 去重（`b00cd4b`）；next-admin tsconfig baseUrl 移除（TS 5.9.3 棄用）；/tomo packet for 筆電 exit-2 hook sync（`36ddc7d`）。**筆電任務開放**：bootstrap junction 修復（`- [ ]`）+ exit-2 hook 同步（`- [ ]` → handoffs/2026-05-27-1521）。
- **2026-05-25 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-25 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:715366fbedc364d91698d6343faa953dc2cf02edccda5f430edb76335510cf85 -->
- **2026-05-25 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-25 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:facd27ae4c7f7fd536a340c10fb14712b4e2f59742917644a99a0af667206f08 -->
- **2026-05-25 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-25 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:42c0dad5325deb2a8e4ed7e8e3f0d8313ffda12bead68d54a440529008dcaf21 -->
- **2026-05-25 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-25 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:134d453d8e9481cb88044cf454f3640404e6817c1b800a4863f4b0ec1a8a6510 -->
- **2026-05-25 (AO-CLOSE)**: Full session 2026-05-21 → 2026-05-25。**5 條主線**：(1) **Nginx scanner-block + limit_req 一勞永逸**（D1-D5，SG+EU 全補：scanner-block.inc 13 路徑 regex→return 444+scanner.log 隔離；3 Critic Major fix — eval-stdin 錨定、gravitysmtp 精確、.git/.aws/.ssh trailing anchor；`limit_req` false positive 以 EU burst test 反駁）；(2) **SG certbot DNS-01 Cloudflare wildcard cert**（commit `4872c7d`）：`*.aware-wave.com + aware-wave.com` 單 cert 覆蓋全子域，`certbot renew --dry-run` SG+EU 全 PASS，5 orphaned cert 清除，90 天全自動，到期 2026-08-23；(3) **/tomo v2 全鏈實作 + Critic 2C+6M+Read-first 全 apply**（commits `3f9a20d`+`8c65d19`+`1fb9179`）：7 個檔案（SCHEMA/README/tomo.md/TASKS/ao-resume/AGENTS/memory）；C1 phantom consumed 清除、C2 hint injection 改 Write tool、M1-M6 全 apply、新 Minor Read-first fallback；E2E 3 函式全 PASS；(4) **R0 四動作全機械化閘道**（今日）：REALTEST gate + REVIEW gate + BUGHUNT gate 進 verify-closeout-completeness.ps1，缺任一 marker → AO-CLOSE 擋；AGENTS.md R0/R4 同步更新 — 四動作從行為規則升級為機械閘；(5) **Backup silent-fail 根因修復**（`b791bfb`+`283b1da`）：`Invoke-LocalBackup` + `Backup-Path` 加 try/catch Stop，失敗有名 WARN，3-case real exec test PASS，AUDIT_REGISTRY FIXED。**桌機 infra**：Work/.claude junction 修建（`c7c8c38`）+ao-resume Step3 skip-guard（`987d83d`）。**筆電任務**：bootstrap junction 修復仍開放（TASKS.md `[ ]`）。
- **2026-05-24 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-24 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:884a4286e45c3065eb2b2bd9f9d7b7cf476c4a7e30438003606e4d672f82a4b6 -->
- **2026-05-23 → 2026-05-24（永久化 + /tomo plan + AO-CLOSE 鐵律驗證）**：三條主線。(1) **2026-05-23 永久化 3 patterns**（commit `4756bd7`）：新 memory `feedback_audit_shape_pattern_vs_logic.md`（Pattern audit = 機械可偵測走 Build Playbook 9 步建 detector；Logic audit = state machine/設計判斷走 `/apply-audit`）+ 新 slash command `.claude/commands/apply-audit.md`（162 行，6 步流程 + Errata fold-in 紅線 + 跨檔抓蟲 + 4-action verify per patch + AUDIT_REGISTRY 升級 + WORKLOG entry + commit/push with ack；起源 = 2026-05-23 Auto-Repair Tier 3 audit apply 三次 push-back 路徑）+ AGENTS.md 新 trigger row（操作者說「處理好所有的事/apply audit」+ 指涉 audit report → 自動 `/apply-audit`）。(2) **2026-05-24 凌晨 `/tomo` feature v2 plan**（commit `972aac9`，純規劃未實作）：plan 檔 `.claude/plans/tomo-feature-v2-plan.md` 含 7 個設計決策（trigger `/tomo` + `/tomo!`、TASKS.md `- [ ]` = pending SSOT、packet 在 `agency-os/handoffs/` git tracked、ao-resume.md 第 7 段條件式擴張 inline packet）、10 個 v1→v2 漏洞 fix、Phase 0/1/2/3、完整 4.3 抓蟲（BUG_HUNT_PROTOCOL 9-step + audit-cross-machine-bom + critic + CHANGE_IMPACT_MATRIX 6 step）、R8-R11 風險清單、Resume Instructions。v2 corrected 過程留 user push-back「抓蟲 grep 太少」→ 補完 6 step 證據鏈。(3) **2026-05-24 ~01:00 AO-CLOSE 鐵律驗證**：health 99.7%（370/371）擋 100% 門檻。根因鏈：`check-claude-sync` HARD drift → `~/.claude/mcp.json` 含 24 條 plaintext-secret MCP（違反 CLAUDE.md R1）；修完後 `validate-doc-integrity.mjs` 浮第二 critical → `WORKLOG.md:269` 死連結 `file://d:/tmp/real-exec-test-v2.ps1`。修法：backup → `sync-claude-userlevel.ps1 -Mode merge` 把 mcp.json normalize 回 `{}`（repo `.mcp.json` 41 條接手）+ 死連結改純 code 文字 + 加 TASKS entry「AO-RESUME 讀 WORKLOG tail 改為『上次 AO-RESUME → 本次』區段」（操作者凌晨提問，明天 R0 討論）+ cf-security 順手刷新 PASS。結果 health 100% (371/371)。**操作者規律**：AO-CLOSE 100% 門檻今晚證明有實效，不該帶 `-AllowNonPerfectHealth` 跳過；user-level `mcp.json` plaintext secrets 累積 = 隱性安全債（scan-for-secrets WARN 早點名被當噪音）；下次新增 MCP server 一律進 repo `.mcp.json` 不碰 user-level。
- **2026-05-22（一日大規模 audit + 治理 deploy）**：今天進度爆炸。三條主線：(1) A1+ AO-CLOSE bug 全鏈修法（cross-machine stamp、import comparison、backfill tool、daily/2026-05-21.md 補建）；(2) **verify-gate 鐵律 layer 部署**（3 hooks + `/verify-recent` + `/verify-recent --ack` atomic helper + `_verify-shared.js` + `verify-sid-shared.ps1`；commits e807984/11328cb）——任何 `.ps1/.sh/.py/.ts/.tsx/.js/.jsx` edit 進 tracker，`git commit` 過閘擋，唯一解鎖 `/verify-recent` 或 `--ack`；(3) **CP950 hardening + audit toolchain**（A+B+C+D：`scripts/audit-cp950-traps.ps1` AST detector + `/audit-encoding` + `AUDIT_REGISTRY.md` + AGENTS.md auto-trigger row）——5 個 trap sites 修，121 個 tracked。**治理 layer**：`BUG_HUNT_PROTOCOL.md`（30 年抓蟲協定：5-tier 觸發 + 9-step playbook + KPI + Step 7 FP-rate exit gate）+ memory feedback `feedback_bug_hunt_protocol.md`（28 中 + 11 英觸發詞 auto-discovery）+ TASKS Bug Hunt audit 隊列加 Auto-Repair（Tier 3 優先，6/19 前）+ 一鍵架站（Tier 3 後排）兩條。**Audit 自證**：CP950 tool 抓到我自己 ao-resume.ps1:425 git log %s 同款 bug；audit-cross-machine-bom 抓 memory 缺 BOM 自證價值。**Critic 戰績**：CP950 round 1 抓 3 Critical（SID env var 用錯、ppid fallback、regex bypass）+ Round 2 抓 1 Critical（Pattern B line-order false-negative，已修）；BUG_HUNT_PROTOCOL round 1 抓 4 Major（registration missing、KPI 不可量測、Step 7 無 FP gate、Tier 不窮盡）全修。**8+ commits pushed**（含主線 + governance + audit registry + AGENTS rules + cross-machine sync verifier `/sync-check` 另一 session 同日完成）。**操作者洞察**：「今天每件事都抓到蟲，半年 vibe coding 可能千百 latent bug」→ class-by-class 模式被永久化為 BUG_HUNT_PROTOCOL。
- **2026-05-20 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-20 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:063e4d4796f3f8745ea9851b210803d704d53350de11c1ae3a19fbf14ac53687 -->
- **2026-05-20 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-20 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:3d5c2fec7148948b6446aad4d7858f611badc01542b3e4e35e05671b108d158a -->
- **2026-05-20（CREDENTIALS 修復 + auto-repair 分類 + BOM 根治）**：(1) auto-repair 觸發分類檢討完成（commit 54b0c2f）：三條件框架（行號精確度/範圍可窄化/CI 可驗證）形式化；`can_escalate_to_pr`（uptime_kuma/grafana=true）+ `severityRequiresHumanReview`（critical→強制 human_review）；44 tests pass；plan doc §分類原則 決策表。(2) CREDENTIALS BOM 同步迴圈根治（commit fe9b1ab）：export/import 腳本改 ReadAllText+WriteAllText(utf8bom)，打破 VSCode→no-BOM→vault→import 迴圈。(3) CREDENTIALS 內容損毀回復：Desktop May-9 版為 base，May-15 backup §二十七 7 條還原，最終 594 行。**嚴重事件**：merge-credentials.ps1 只比對 `##` headers，遺漏 `###` 子節與 section 內容，導致 2026-05-09~05-20 使用者新增內容（含今日）**永久遺失**，Downloads 副本亦被覆蓋。Vault 待補同步（594 行版本）。
- **2026-05-20（Repair Center 六視角缺口修復 + sg-deploy test gate）**：R0 架構師模式分析後，三批次全部完成並部署。**批次 1**（f7b45c0）：middleware.ts `startsWith` → 精確比對；GitHub Actions 移除多餘 `id-token: write`；user-env.ps1 填入 soulful Supabase key。**批次 2**（75f3727）：next-admin 加入 vitest + policy.test.ts，rules.test.ts 復活，`npm test` 35/35 pass。**批次 3**（3a9bd21 → 部署 efb615e）：`/api/webhooks/github/route.ts` HMAC-SHA256 驗簽，PR merge → `pr_ready → deploy_pending`；SG .env 寫入 `GITHUB_WEBHOOK_SECRET`；GitHub Webhook ID `627222921` 建立。AWARE_WAVE_CREDENTIALS.md 補記 webhook 資訊。**sg-deploy test gate**（155500e）：SG `sg-deploy.sh` step 1.5 加入 npm test 門檻，失敗自動 abort；AGENTS.md 加自動規則，Claude 遇 `npm test FAILED` log 知道三步修復流程。筆電唯一待做：`mcp/user-env.ps1` A3 soulful key（gitignored，不影響生產）。
- **2026-05-19 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-19 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:a35cd5b152d2d10b88dac4ed718d2b4b17b86293168c0be036d68016887dfc85 -->
- **2026-05-19 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-19 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:a072b4d963c46e7a8d9c374342010af0ddebbed2a445055747e5c0f1d3afc842 -->
- **2026-05-19（記憶系統修復）**：全面盤點 Claude Code auto-memory 系統。發現 MEMORY.md 15 條目中 12 條指向不存在的檔案（ghost entries），2 個現有檔案未索引。根因：cross-machine export 只同步 MEMORY.md 索引，不同步個別 `*.md` 檔案本體，導致跨機同步後索引指向空文件。方案 B 修復：(1) 清理 MEMORY.md 至 5 個真實條目；(2) 補 2026-05-19 摘要至 CONVERSATION_MEMORY.md；(3) export 腳本改為 copy 全部 `*.md`；(4) import 腳本加 SHA256 衝突偵測逐一匯入 `*.md`；(5) 新建 `validate-memory-index.ps1` health gate；(6) 接入 `system-health-check.ps1`（warn-only）。下次跨機 AO-CLOSE + AO-RESUME 後可驗證記憶完整同步。
- **2026-05-18 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-18 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:dffd3868a0c7cf68c8908298600396587b78cfa24ab8f2561ed3aaaecd93571b -->
- **2026-05-18 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-18 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:93317e2f105c9b1ae44d60a1b028cca3d47a05ea4073975342b732d09de4b2c4 -->
- **2026-05-18（桌機首次開工 — Git 假分歧修復 + API 驗證）**：桌機 4 天未用（上次 2026-05-14），AO-RESUME hook 在 git pull 前 auto-commit `ao-close-last.txt`（state 檔），造成假分歧（ahead=1, behind=44）。修法：`git reset HEAD~1` + 刪除衝突 state 檔 + `git pull --ff-only` → `0 0`，fast-forward 44 commits（包含筆電全部工作）。Anthropic API $5.81 補額後確認有效：建 Issue #10 觸發 `auto-repair-claude.yml` → success。GitHub MCP "Bad credentials" 為 stale process（PAT 有效，重啟 Claude Code 自動解決）。根本改善建議：state 檔類 dirty 不應觸發 auto-checkpoint。
- **2026-05-15 17:25 → 2026-05-18 09:02（完整 session，7 個實質 commit）**：(1) AO-SYNC export mtime 修正（`baca9e4`）；(2) import 同機 local-ahead 邏輯修正（`4f58ae6`）；(3) ao-resume fallback Step 0 強制執行（`682c554`）；(4) web-researcher 強制直接引用規則（`9ce65c4`，178 行，首次版控）；(5) **200% agent 大稽核**（`b180251`）：修正 AGENTS.md 幻覺（WP volume / EU 漏列 10 容器 / 前端 stack），13 個 built-in agent .md 從 .gitignore 移出加入 git 版控（2302 行新增，15 檔案）；(6) AO-SYNC 加入 settings.json 匯出（`8102794`）；(7) Uptime Kuma fix runbook（`c74a773`，85 行）。ao-close push 完成，AO-SYNC 匯出 9 entries 含 settings.json。
- **2026-05-15 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-15 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:f0fa8c38968e640f529c5d0fb863197db9bd941920a7864b7da0d15b50e9bc15 -->
- **2026-05-15 下午（API 計費清理）**：VS Code Claude Code extension 在 console（API credits）模式下每次 git commit 自動觸發 ultrareview 平行多 agent review，導致「Failed to run review: insufficient funds」反覆彈出（API 餘額 $5.82）。修正三項：(1) 移除 claude-fast/claude-latest MCP server（registry.template.json + .mcp.json + ~/.claude/mcp.json），commit `7311689`；(2) auto-repair-claude.yml 改 Haiku + max-turns 10，降成本 ~90%，commit `016cdd6`；(3) ~/.claude/settings.json 加 `disableAgentView: true` + `forceLoginMethod: "claudeai"`，強制走 Max 訂閱額度。VS Code 尚未重開——需重啟 IDE 驗證彈窗消失。
- **2026-05-15 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-15 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:60989638bfab079696739a053830b416c5b8ebf86e493961df1aba67985c9b7f -->
- **2026-05-15 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-15 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:d28f4513e01d568c31b57c36a0f82864ea953083e2bc73d0d1b453f399e8d2ad -->
- **2026-05-15 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-15 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:3d3e90778715723cc2a1b492884f12bcb1148914dd1159774cb19313225bbc09 -->
- **2026-05-14（AO-RESUME 外部信號整合 + Slack token 修復）**：AO-RESUME 升級為七段式格式（系統快照/外部信號/已完成/目前進度/未完成待辦分類/需決策/下一步）。`fetch-external-signals.ps1`（新建）接入 Telegram digest API（`/api/ops/inbox/digest`，已部署 SG `eaa3332`）+ Slack `conversations.history`（xoxp admin token 可直讀 workspace admin 頻道）。Vault 修正：`SLACK_BOT_TOKEN`（新 token `...92084`）、`OPS_INBOX_INGEST_TOKEN` 修正為 SG `.env` 正確值；user-env.ps1 兩個 key 同步。Slack Channel IDs 入 vault：`#ops-incidents=C0B004HJYV8`、`#infra-alerts=C0AUQ7J5789`。驗證：Telegram ok (16 msg) + Slack 兩頻道 ok。未完成待辦強制分類規則（30-resume-keyword.mdc 兩份同步）。`AO_SYNC_SECRETS_ROOT` 修正為 Google Drive 路徑。AWARE_WAVE_CREDENTIALS.md 更新含新 Slack App 憑證 + Channel IDs。
- **2026-05-13 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-13 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:17d8462f92e66f93dc7dff269350ae49142439386ac6ece5ea801a6f626b282a -->
- **2026-05-12 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-12 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:9557a101b7a3e92660aa0e45572c6ff6078efaba3c9e1e6d3dbd596ab5a0db44 -->
- **2026-05-12 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-12 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:c8396eba5bbc07efb99d13c0b355bb2b0495589f6a3ab357c7a6e876708d7203 -->
- **2026-05-12 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-12 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:af2f48e17e8fb139ea47fca7f95f2a09291276d8254e4a59cb062612d7cb27bf -->
- **2026-05-12（WP Plugin Stack — 文件品質修訂 + Phase 0 實作）**：三份文件全修：`WP_CLIENT_PLUGIN_STACK.md`（加 WP.org Slug 欄、★/↩/† 標記）、`PLAN_WP_PLUGIN_STACK_AUTOINSTALL.md`（3 處 `plugin_install_runs`→`package_install_runs`、補 `alternativeSlug`／`resolvePaidPlugins`）、`BRIEF_WP_PLUGIN_STACK_AUTOINSTALL_AI.md`（Phase 1 WizardStep 型別、URL params、smokeProfileFor 位置、接受標準修正）。Phase 0：新建 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/wp-plugin-stack-catalog.ts`（36 entries，`resolvePluginStack`／`resolveInstallableSlugs`／`resolvePaidPlugins`，TypeScript SSOT）。`TASKS.md` 補 Phase 1 開工清單（5 必讀檔）。Phase 1（OnboardWizard Step 2 + 新 WizardStep type）明日開始。Commits `5dff4ce`（文件）、`b205f40`（catalog.ts）。
- **2026-05-12 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-12 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:436e906aac028720dbe07cc89a7b39e028dd16450270f443de765e8360e86cf3 -->
- **2026-05-12 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-12 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:7b9f61f39c447cd2cf4fbcaf23ba070e2309f36dc4cfd8aacad3fc1a56fac3cd -->
- **2026-05-11（Telegram Command Plane 修復 + /health 誤報根本修法）**：kill switch `emergency_stop`（使用者 5/9 自己設的）→ SQL reset `normal`。Bot 回覆路徑（sendTelegramMessage）確認全程正常（DB completed、API ok、reply_to_message_id ok）。`/health CRITICAL` 誤報：根因 `health.ts` 用 `ops_incidents` 有無當 freshness 指標，健康系統零 incident 卻報 CRITICAL。根本修法：建 `ops_health_probes` 表（EU Supabase）+ `/api/ops/probe` 端點 + `health.ts` 改查 heartbeat + SG cron `0 */6 * * *`。另 `AwareWave Ops` 客戶 DOWN 誤報：`site_url` 設 `/`（401）→ 改 `/api/ops/summary`（200）。n8n 密碼意外重設為 `PeiAI20260405!`（peijingartstudio@gmail.com）。Commits `5a3d87f`、`f718518`。
- **2026-05-11（機型修正 + memory 搬移 + 跨機同步自動化）**：使用者指出「兩台桌機」描述錯誤 → 修正為「個人筆電 + 公司桌機」（5 個檔案）。`feedback_git_push.md`、`feedback_trigger_deploy.md`、`user_devices.md` 從 user-level memory 搬入 `agency-os/memory/`（git-tracked）。新建 `export-cross-machine-memory.ps1`（AO-CLOSE 自動匯出 MEMORY.md → Desktop\AO-SYNC-date\）與 `import-cross-machine-memory.ps1`（AO-RESUME 自動匯入，有 `.imported` flag 防重複）。`ao-resume.ps1` 升級：sync-userlevel 改 merge 模式 + 新增 sync-mcp + 新增 import MEMORY.md（全 non-blocking）。兩機操作完全對稱，AO-RESUME 單指令完成一切。`CROSS_MACHINE_SYNC_RUNBOOK.md` 已建。
- **2026-05-11（CLAUDE.md 全系統精確性驗證）**：8 項修正（非存在旗標名→實際 env var、SG/EU 服務清單、死亡路徑、硬編用戶名、明文密碼→vault 指令、機器類型、Routing JSON 檔名）；新增 R4 rule（grep 精確字串而非全域掃描，省 token）。
- **2026-05-09 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-09 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:a0732676aeba440afe79a57c88a354091525aeafc081a8bc4b9c4147bdc0dd8a -->
- **2026-05-09（next-admin UI 配色層級重做）**：用戶指 sidebar 顏色大配＋Build 頁無層級。根因：sidebar 所有顏色同一 blue-gray 系，active state 白色 bar 疊白字不可見；Build 左右 panel 外觀相同，無主次。修正：sidebar section label 改極淡 `rgba(255,255,255,0.28)`，普通連結 `rgba(255,255,255,0.60)`，active 改 indigo bg+bar；Build profile grid 包成 step 1 區塊，右 gates panel 改 bg-subtle sticky，step headers 加 border-top；Submit CTA 更強陰影。Commit `241b062`，SG deploy `ff1ef68` healthy。
- **2026-05-09（ONBOARDING 發布）**：`/team-onboarding` skill 生成 `ONBOARDING.md`（30 天使用資料：Build Feature 55% / Debug Fix 20% / Plan Design 15% / Analyze Data 10%；MCP: hetzner-ssh 427 calls / awarewave-ops 84 calls）。User 補寫 7 條 Team Tips（monorepo 根目錄、vault 機器獨立、commit prefix `[claude]`、main-only、Telegram bot、health 100%、migration 不改舊檔）+ 6 步 Get Started。Share URL: https://claude.ai/claude-code/onboard/O3clJrMsjeQ5（short_code: O3clJrMsjeQ5）。
- **2026-05-09 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-09 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:ad5c8b10ec026a69dff870de57623cbf5677ee0651324828988830a551a383f1 -->
- **2026-05-08 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-08 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:f51105af91f8da83f3587bec273986d7cf30f90b1cc8de6160d932a81cb34272 -->
- **2026-05-08 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-08 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:0f3972e67288d57fe834037f0601d542267564222b93def6cc303d836131853f -->
- **2026-05-08 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-08 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:14943f18e8160246d1f98a522a83de76378d5d7f52918d9db68a0fee23f5238e -->
- **2026-05-07 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-07 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:91a66f0b3f303c58769c9d8bd1537896f764f711ce35a55e6722b4a50a712099 -->
- **2026-05-07（/onboard 精靈 + M3 + nginx 事故）**：新增 `/onboard` 4 步驟 New Client Onboarding Wizard（Step1 ClientInfo + UUID 自動生成、Step2 20 部門 DepartmentSelector、Step3 7 providers 服務佈建、Step4 summary → /build URL param 跳轉）。同步 `/build` BuildConsole 改版：Service Provisioning 整段移除，改為 URL pre-fill `useEffect`（14 params from /onboard）+ contextual banner。M3 `lib/department-catalog.ts` 為 20 部門機器可讀 SSOT（`ClusterId` / `MatrixRowKey` union types；`SMB_DEFAULT_CLUSTERS` / `buildDepartmentSelection()` / `getRequiredTemplateFiles()`）。nginx 事故：`/etc/nginx/.htpasswd_studio` 從未掛入 container（401 全站），docker-compose.yml 補永久 volume mount，生產 config 同步並暫時 comment out Basic Auth 讓 `app.aware-wave.com` 可訪問。Commit `ca4438a` 已 push。**Basic Auth 再開啟**：取消 `nginx/default.conf` `#auth_basic` 注釋，確保 htpasswd hash 與 vault 一致，`docker compose restart nginx`。
- **2026-05-07（PostHog MU SG 部署 — 根本問題修正）**：WordPress Docker image **不執行** `/docker-entrypoint.d/` 腳本（nginx 慣例，非 WP 慣例）——`mu-plugins/` 從未建立。修正：`docker-entrypoint-sentry.sh` 加 `exec apache2-foreground` 改為 **CMD** 入口；`Dockerfile` 改 `CMD ["/usr/local/bin/lobster-init.sh"]`；新增 `/usr/src/wordpress/wp-content/mu-plugins/` 種子層供 first-run volume。SG 驗證：`curl -sL http://aware-wave.com/ | grep "posthog.init"` 通過；`site_name: "Aware Wave Website"`、`app_surface: "wordpress-public"` 正確。Commits：`f9e666b`（Dockerfile+entrypoint）、`0381606`（WORKLOG 證據）。**TASKS `phase1 WordPress（SG）PostHog MU` 結案**（`AUTO_TASK_DONE` 已寫入 WORKLOG）。
- **2026-05-07（長期編纂規則）**：**Git 是否超前／落後、`main` 是否需 push**，一律以 **`git fetch origin` 後 `git rev-list --left-right --count origin/main...HEAD`** 為準（ **`REMOTE_WORKSTATION_STARTUP.md` §2.3／§2.5** ）；**不得**僅憑過去的 **`memory/daily`**、`WORKLOG` 段落、closeout **verbatim** 區、或舊版 **`integrated-status-*` 快照**內嵌摘錄推斷現況——那些為**時間切片**。結案與程序細節：**`TASKS.md` → `已完成歷程 §2026-05-07`**；**`WORKLOG.md` `## 2026-05-07`**「AO-RESUME 阻塞收口」。彙總報告請 **`scripts/generate-integrated-status-report.ps1`** 重產 **`integrated-status-LATEST.md`**（見該檔頭「Source index」）。
- **2026-05-07 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-07 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:a0864551d4aa2c1c063c13bf1ea131ccad51b79ec6948ab12ee03b5243e5efd7 -->
- **2026-05-07（AO-CLOSE）**：MCP/憑證全棧補齊。Vault 45 個 Windows user env 已同步；新增 `HETZNER_API_TOKEN`、`SENTRY_AUTH_TOKEN`、`UPTIME_KUMA_API_KEY`、`TRIGGER_ACCESS_TOKEN`（新 token，舊 March-27 失效）。Desktop app MCP 限制：`posthog`/`cloudflare` HTTP type 每次 app 重啟自動 revert，無法在 desktop app 使用。桌機換機需手動複製 5 類檔案（.claude hooks × 3、SSH keys × 2 組、credentials.md、user-env.ps1），再跑 `bootstrap-mcp-machine.ps1`。剩餘待補（與 **`TASKS.md`**「Vault」隊列對齊）：`OPS_INBOX_INGEST_TOKEN`、`SUPABASE_A_SERVICE_ROLE_KEY`、`SUPABASE_SOULFULEXPRESSION_SERVICE_ROLE_KEY`、`XAI_API_KEY`。
- **2026-05-06（AO-CLOSE 前補記）**：本輪已釐清「可信基準為 2026-05-06 08:00 前」對應 `origin/main` 的 `8158349`；下午新增提交屬後續累積（非整庫回滾覆蓋）。另外已固定主流程為單分支 `main`，並在 `AGENTS.md` 補「衝突以較新修改時間為準」規則。
- **2026-05-06 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-06 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:b0d50a564ef79b38210b6f9b39e2bcd6e57f3b1d1e9cb82f23d93f0889414ab8 -->
- **2026-05-06 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-06 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:8d7a99e64ffa6e3a1daf164db4bf776d97be98c34222849a0a07e16062795eec -->
- **2026-05-06 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-05-06 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:5998d546ad0aa731fbb0789c2181f67c848b626d6c9248e89f8753d38e9bc1af -->
- **2026-05-03（AO-CLOSE 前 — tenant integration / OAuth 澄清）**：**`tenant_integration_bindings`** 編排落地：`orchestrate-tenant-provisioning` + 真 API adapters（Sentry／GitHub／PostHog／n8n／Supabase Mgmt 等），secrets 僅 **`secret_ref`**；OAuth「用 Google 註冊」仍須使用者瀏覽器同意，不可無互動代開帳。細節 **`WORKLOG` `## 2026-05-03`**。
- **2026-05-01（Trigger／PostHog／phase1 — Cursor Agent）**：Workflows **`syncEnvVars`** + **`@trigger.dev/*` 鎖 4.4.4**；**`lobster-factory/infra/trigger/README.md`** 為 EU **`204.168.175.41`**／**`registry:5000`**／deploy 唯一長文；**`deploy-workflows.ps1`**；SG **`next-admin`** **`--no-deps`** 重啟；WP **`posthog.php` MU** + compose **`NEXT_PUBLIC_POSTHOG_*`**（**`aaee266`**）。**（歷史切片）**該日所列 **`git push`** 需求為當時快照；後續已收斂，**現況仍以 Git 機械指令為準**（見 **`Current Operating Context` → 2026-05-07（長期編纂規則）**）。完整 **`trigger.dev deploy`** 仍須 EU 或 tunnel。細節 **`WORKLOG` `## 2026-05-01`**「Cursor／phase1／Trigger／PostHog」。
- **2026-05-01（AO-CLOSE 前摘要）**：n8n MCP 在 Cursor 改 **stdio 橋接**（`scripts/run-n8n-mcp.mjs`），避開 HTTP 運輸下 **POST initialize 後 GET → 404** 造成的 MCP 面板抖動；runbook **`docs/operations/n8n-self-hosted-mcp-troubleshooting.md`** 已補段落；**`TASKS`** 已拆項——**n8n（Cursor）** 已達 DoD 並可由收工勾選，`Supabase MCP／SSH tunnel` 仍為開放。另：**`scripts/ao-close.ps1`** 補 Splatted 繫結／StrictMode 下 **`CommitMessageFile`** 安全預設。細節見 **`WORKLOG` `## 2026-05-01`**。
- **2026-04-30 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-04-30 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:68ccb8e525ff628ed06624d482c7b037952fe12ae0215db8f864793df15b6079 -->
- **2026-04-30（AO-CLOSE）**
  - 背景：使用者要求「月檢 + 收工」，並明確要保留「明天提醒：n8n / Supabase MCP 還沒好」。
  - 已完成：新增 `AgencyOS-MonthlySystemReview` 與 tenant monthly 排程基線；月檢已接入 `check-supabase-memory-monthly.ps1`，可產報告與狀態摘要。
  - 未完成：`n8n` / `Supabase` MCP 連線穩定化尚未完成，已落到 `TASKS` 未完成隊列。
  - 風險/阻塞：EU SSH forwarding 仍可能出現 `administratively prohibited`；若未先修，Supabase tunnel 路徑會不穩。
  - 下一步：明日 `AO-RESUME` 先跑 MCP smoke/tunnel 修復，再回頭處理其餘隊列。
- **2026-04-29 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-04-29 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:079cb9a0b98e15c48fb261277fe2049ed1c4450029bf4751e194e8ab8798edd5 -->
- **2026-04-29 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-04-29 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:25e58843f664d42542eab0888a7bcb1310588227b8e6eda82e50c801d2623323 -->
- **2026-04-28 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-04-28 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:c049b96016c25d4e9c6ead4b41aae65d20ad1049bd3b45620fbc98c9e64b1ab4 -->
- **2026-04-28（收件匣契約補強）**：closeout 僅六個頂層欄位；遠端無 commit 操作併入 **風險／待辦**；**對應 TASKS** 僅一行單子字串（見範本與協作規則）；歷史併入區已對齊，**`6ecd0fd`**。
- **2026-04-28 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-04-28 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:249d049468fe96e3908975a0b27baffe356a5455c9fdc60a1b47b9e466d9f3ae -->
- **2026-04-28（Cursor 晚間／收工前）**
  - **背景**：操作者要一次收斂 MCP（awarewave-ops）與 SSH；先前對話曾含 Netdata 磁碟警報與憑證曝光風險。
  - **已完成**：本機 **`mcp/user-env.ps1`** + **`bootstrap-mcp-machine.ps1`**；**`hetzner-sg`** SSH 別名與連線驗證；repo 內 **`endpoint-alert.sh`** 避免因空 **`WEBHOOK_URL`** 每分鐘失敗。
  - **未完成**：`HETZNER_API_TOKEN` 等仍待補入 env；憑證輪換與 Cursor 重載後確認 **`awarewave-ops`** 可用仍待人類執行。
  - **風險**：曾貼出之明文憑證應視為需輪換；勿再整份貼入聊天。
  - **下一步**：重開 Cursor → 用 MCP 拉 Netdata；補 Hetzner／Kuma API token；VPS 部署更新後之 `endpoint-alert.sh`。
- **2026-04-28 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-04-28 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:970fdda2d2b61eb458ffa2b76cf5bc8c34f9ebb9df281994b4ac0ce1939c6424 -->
- **2026-04-28（AO-CLOSE）**：`TASKS.md` 已新增 **（Ops Inbox Path B）生產收斂未完成 — 明日 `AO-RESUME` 須口頭＋書面報告**（health 旗標、ingest token、四來源合成腳本、Inbox「全部」、Slack／Notify Log）；細節見 **`WORKLOG` `## 2026-04-28`** 與 **`memory/daily/2026-04-28.md`**。
- **2026-04-27（主線與回補）**：白天主線為 observability/架構文件（`1ba61e5`、`a028d5f`、`36a5232`、`2431747`、`ec20634`，另含 `1e70800` 文檔改名與分析）；原先開機報告漏項已回補到 `WORKLOG` 與 `memory/daily/2026-04-27.md`。
- **2026-04-27（流程修補）**：AO-RESUME 改為 dirty 自救（checkpoint -> parity）；提醒事項必須同步落到 `TASKS.md - [ ]`；AO-CLOSE 新增 strict inbox guard，daily 含 `(TBD)` 會被 closeout gate 擋下。
- **2026-04-27（TASKS 對齊）**：`（工具建置）安裝 Grok CLI（筆電 / Codex）` 已改 `[x]`；新增公司桌機兩條未完成（Slack `#infra-alerts` 歷史訊息清理、Netdata Centralized Cloud Notifications）。
- **2026-04-27 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-04-27 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:3b1bebdf56cc5a6317e5e79bbc1034469b8df3382ed3138d0958a5eed578090c -->
- **2026-04-24 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-04-24 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:0ac1688c67e446a20bb1c003ac978fab0cbb604031436b22e483bdaf39b33093 -->
- **2026-04-24（AO-CLOSE 前）**：`system-health-check` 的 **1a2 thin-wrapper** 檢查已改為依版面區分 monorepo canonical 與 `agency-os\scripts` 轉發檔、僅在兩者為不同實體路徑時驗證，避免 monorepo 根當作 `$root` 時誤套 `..\..\scripts` 正則而假失敗；詳 **`WORKLOG` `## 2026-04-24`**、commit **`8f3c0b6`**。
- **2026-04-23 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-04-23 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:c9268e3d7c8d372582c3d43d956711bc66d646645aededda3e696ea4a5d02be9 -->
- **2026-04-23（MCP 全端一致 + Grok）**：Shared MCP 已收斂為六端同清單（workspace/cursor/claude/codex/copilot/gemini 皆 `count=27 / missing=0`）；`sync-mcp-config.ps1` 已納入 `~/.claude/mcp.json`；Grok（xAI）已接入 `run-llm-mcp.ps1`、`llm-mcp.mjs` 與 registry（`grok-fast`/`grok-latest`），本機 API smoke test 正常。`TASKS` 已新增「安裝 Grok CLI（筆電/Codex）」待辦供下次 AO-RESUME 追蹤。
- **2026-04-23（本輪 AO-CLOSE）**：使用者僅關鍵字收工；對話無新長期決策；細節見 **`WORKLOG` `## 2026-04-23`** 既有列與 **Closeout inbox** 區塊。
- **2026-04-23（AO-CLOSE = 代理必寫長期記憶）**：操作者預設**不**手寫 **`CONVERSATION_MEMORY` 長篇**；每次僅 **`AO-CLOSE`** 時，**代理**在跑 **`scripts/ao-close.ps1` 之前**必須依 **`10-memory-maintenance.mdc`** 補一段精簡蒸餾（可很短；無新長期決策時至少一行註記並指 **`WORKLOG`**）。**`merge-closeout-inbox`** 的指標列仍由腳本機械追加，**不取代**此義務。已改 **`40-shutdown-closeout`／`50-operator-autopilot`／`AGENTS.md`／`memory/MEMORY_INDEX.md`／`end-of-day-checklist.md`** 與根 **`.cursor/rules`** 鏡像；**`ao-close.ps1`** 的 **automation boundary** 文案同步。
- **2026-04-23 (AO-CLOSE)**: closeout-inbox merged verbatim into WORKLOG + memory/daily; see WORKLOG ## 2026-04-23 / subsection "Closeout inbox (AO-CLOSE auto, verbatim)". <!-- ao-close-conv-inbox:e1bae1cbbbde7615f401e62d14587d93cd50466f437c9463ea845896206c8b18 -->
- **2026-04-22（雙機前提固定）**：使用者目前為 **雙機模式**：**公司桌機** + **回家筆電**。後續凡涉及 **MCP／AI 客戶端／本機環境／AO-RESUME 對齊／Secrets／依賴安裝**，一律以「**repo 共用結構、兩台機器各自持有 env/vault/user-level config**」為前提；**不得**再假設只有單機，亦**不得**建議直接複製另一台機器的明文設定檔（如 `~/.cursor/mcp.json`、`~/.claude.json`）到本機。Shared MCP 真相為 **`mcp/registry.template.json` + `scripts/sync-mcp-config.ps1`**；舊機明文清理腳本為 **`scripts/sanitize-user-mcp-config.ps1`**。
- **2026-04-22（晚：monorepo 推送與收工）**：已將 observability／sync／`run-postgres-mcp.ps1`／template 等變更收斂為 **`32c3c85`** 並 **`git push origin main`**（含先前未推之 **`d6dbb05`**）；**`main`** 已設 **`origin/main`** upstream。本輪 **`TASKS`** 無可機讀 **`AUTO_TASK_DONE`** 之單項 DoD 完成宣告（Enterprise Phase 1／三檔巡檢仍為開放項）。收工跑 **`AO-CLOSE`** → **`ao-close.ps1`** 以產 closeout／health／guard 報告並再 push（若有 doc-sync 變更）。
- **2026-04-22（Observability 實機驗證與 Kuma 去重）**：已實機執行 `Netdata -> Slack` drill（webhook `200 ok` + Netdata `WARNING/CRITICAL/CLEAR` 測試皆成功）；以 Kuma socket API 新建 13 筆 monitor（6 public HTTP、6 SSL、1 heartbeat）且未直寫 DB；其後已做告警去重，保留 `endpoint-alert.sh -> Slack` 作 public outage 主告警，Kuma 僅保留 `SSL expiry`、`endpoint-alert-heartbeat` 與既有內部 monitor 的 Slack。`endpoint-alert.sh` 已新增 `HEARTBEAT_URL` 並同步上 VPS，heartbeat 已在 Kuma 顯示 `OK`。殘留風險：Kuma 內仍有一筆舊 monitor 的 `accepted_statuscodes_json` 歷史格式錯誤，需 UI 重存修復。
- **2026-04-21（工具建置四項收斂）**：完成 Secrets 治理、PostHog 事件基線、Cloudflare 邊界保護、`packages/workflows` `npm audit`（Critical 0；其餘 High 為 Trigger 上游）；`WORKLOG` 已補 `AUTO_TASK_DONE` 待 AO-CLOSE 自動勾選。
- **2026-04-20（MCP 紅燈修復進展）**：已建立 `578be40`（`[cursor] fix(mcp): stabilize user-level path resolution and auth troubleshooting`），內容含 user-level MCP 路徑修復腳本（Cursor/Codex）與 JSON 轉義修復、`secrets-vault` 缺 `TRIGGER_ACCESS_TOKEN` 的可執行錯誤提示、以及 quickstart 的 Trigger/Copilot 紅燈排查補充。重點根因：Windows 路徑插值與 JSON 反斜線轉義錯誤會讓 MCP 設定表面「有改但不生效」。
- **2026-04-20（Trigger/Copilot）**：Trigger 紅燈高機率因 vault 缺 `TRIGGER_ACCESS_TOKEN`（`import-mcp` 不會自動生出）；Copilot 紅燈多為 token/訂閱/權限或 endpoint 細節，需看 MCP output 的 401/403 判讀。
- **2026-04-20（Hetzner SSH）**：桌機可連到 SSH 服務但認證失敗（`Permission denied`）且曾出現 `Connection closed by <ip> port 22`；已確認本機 `hetzner_trigger` 與 `.pub` 成對。使用者正在 Hetzner Web Console 進行 root/`authorized_keys` 修復流程；尚未完成最終 SSH 回歸驗證。
- **2026-04-20（Trigger.dev 自託管 — 單一真相定案）**：營運裁定 **自託管＝已上線**（與 **`origin/main`** 一致）；已同步 **`TOOLS_DELIVERY_TRACEABILITY.md`**、**`hetzner-stack-rollout-index.md`**、**`RESUME_AFTER_REBOOT.md`**、**`TASKS.md`** 雙機子項敘述。證據索引維持 **`WORKLOG` `## 2026-04-16`～`## 2026-04-17`** 與本檔 **2026-04-16** 列；**雙機**仍指「每台 vault／`TRIGGER_*` 消費端」，非「叢集未上線」。
- **2026-04-18（Git commit 前缀）**：`50-operator-autopilot.mdc` §7 強制 **`[cursor]`／`[codex]`／`[claude]`** 第一行 subject；`rules-version-and-enforcement.md` **2026-04-18.1** 指回；Claude/Codex 不讀 `.mdc` 需另複製規則或 hook 才硬擋。
- **2026-04-17（Phase1 apex：WP 根／Next `/admin`）**：`aware-wave.com` 系統 Nginx 已改為 **`/`→WordPress（8080）**、**`/admin`→next-admin（3002）**；共用 **`lobster-aware-wave-locations.inc`** 同時掛在 **:80 與 :443**；`WORDPRESS_PUBLIC_URL` 已改 **https://aware-wave.com**；`next-admin` 設 **`basePath=/admin`** 並於 VPS 重建映像；**`location ^~ /admin`** 修正與 Next 308 之迴圈。VPS `/root/lobster-phase1` 仍非 git，需手動與 repo 對齊。
- **2026-04-17（全日收斂 commit）**：`WORKLOG` 已寫「全日收斂」含另一代理（Claude）口述之 VPS／Uptime Kuma／Netdata／PostHog 雲端決策；`next-admin` PostHog 改 `NEXT_PUBLIC_POSTHOG_*` 不入庫；EOD 前再跑 doc-sync／health／verify-build-gates。
- **2026-04-17（Secrets Phase 2 對齊完成）**：依使用者確認，n8n 舊 key 已刪除並驗證新 key 可用；`WORKLOG` 已補 §3 證據與 `AUTO_TASK_DONE: Secrets 治理升級`，`TASKS` 進度改為「待 AO-CLOSE 腳本套用勾選」。
- **2026-04-17（30 年級穩定化啟動：Sentry 基線治理化）**：已新增 `SENTRY_ALERT_POLICY.md`（DSN 契約、P1-P3 告警分級、smoke baseline、巡檢節奏），並把 `verify-build-gates` 接入 Sentry 契約檢查（政策檔存在 + phase1 `.env.example` 必備 DSN keys）；`security-secrets-policy.md` 同步補上 Sentry DSN owner/輪替契約，避免觀測與密鑰治理分離。
- **2026-04-17（Sentry 三路補齊已驗證）**：`n8n`（`N8N_SENTRY_DSN`）/ `node-api`（Supabase `Unauthorized`）/ Trigger workflow（`create-wp-site` 路徑 smoke）三者均已出現 Sentry 事件；目前觀測鏈路可用。
- **2026-04-17（Trigger 儀表板恢復可用）**：使用者確認 Trigger.dev 已可正常進入（先前 `/projects/new`／login 體感問題已解）；本機開工基線亦重驗通過（`AO-RESUME` strict PASS、`ahead=0/behind=0`、working tree clean）。
- **2026-04-16（Trigger 儀表板 UX／收工）**：使用者回報多數 URL 體感導向 **`/orgs/aware-wave/projects/new`** 或登入頁；DB 側 **`lobster-factory` / `proj_6c4f24492a705729fc2c`** 仍存在。交接重點：**未登入** vs **已登入但 Electric／WS 或 slug 路由**；建議優先書籤 **`/projects/proj_6c4f24492a705729fc2c`**。本日晚 **`AO-CLOSE`** 前已 **commit** `LAST_SYSTEM_STATUS`（`95596e8`）。
- **2026-04-16（Trigger 自託管上線完成）**：已在 VPS 實機完成 v4 閉環（服務健康、Nginx + TLS、Dashboard 可開），並完成第一個 project/bootstrap token 與 `trigger.config.ts` ref 對齊；`trigger.dev deploy --detach` 已成功初始化 deployment（曾因 artifacts bucket/上傳路由失敗，已以 `ARTIFACTS_OBJECT_STORE_*` + Nginx `/packets` 代理修復）。
- **2026-04-16（Trigger 自託管 v4）**：`lobster-factory/infra/trigger` 已對齊官方 **v4**（ClickHouse + registry + MinIO + supervisor + docker-socket-proxy）；`trigger.conf` 反代改 **3000**；`packages/workflows` 為 SDK **4.x** → 平台應跑 **v4**（小 RAM 仍建議升級或拆 worker）。VPS 需 `pull` 後依 README 重填 `.env`、重產 **registry htpasswd** 再 `docker compose up`。
- **2026-04-16（方向修正）**：本日新增 6 份 implementation artifacts 已完成「去矛盾」並改為中文；邊界固定為 **WordPress+FluentCRM / Trigger durable owner + n8n glue / Node worker / Supabase SoR / Sentry 觀測**。使用者要求已改為「完整自架自託管優先」，不再以低成本為主目標。
- **2026-04-16（Next.js 介面層收斂）**：新增 `NEXTJS_INTERNAL_OPS_CONSOLE_V1.md` 作為 UI 功能與 DoD 正本，並把 `TASKS`、`TOOLS_DELIVERY_TRACEABILITY`、`NEXT_GEN`、`operations/README` 統一指向該檔；避免「Next.js 要做什麼」散落多處。
- **2026-04-12（AO-CLOSE 一鍵前硬化）**：根／`agency-os` **`README`** 補 **`apply-closeout-task-checkmarks`** 與 **`AUTO_TASK_DONE`** 規則（連 **`end-of-day-checklist.md`** §0）；**`agency-os/README`** 加 **脈絡鏈**；**`TOOLS_DELIVERY_TRACEABILITY`** 標 **Sentry** 已證；**`diagnose-host-resources.sh`** 加 **`pipefail`**；**`apply-closeout-task-checkmarks`** 以 **`@(...)`** 避免 StrictMode 單筆命中變 scalar 導致 **`.Count`** 失敗（腳本修正已於先前 checkpoint 提交）。**`AUTO_TASK_DONE`** 仍須寫在 **當日** **`WORKLOG ##`** 且單行、勿用粗體符號包住整行（見 §0）。
- **2026-04-11（`40-shutdown-closeout` 日曆硬化）**：**`memory/daily/YYYY-MM-DD.md`** 與 **`WORKLOG ## yyyy-MM-dd`** 之收工摘要必須使用 **收工當日本機日曆**（與 **`print-today-closeout-recap`** 一致），**不得**僅依對話開始日；已更正誤置之 **4/11** 內容、更新 **`end-of-day-checklist.md`**、鏡像根 **`.cursor/rules/40`**。
- **2026-04-10（Cursor：Sentry／n8n）**：對話釐清 Sentry 專案類型與 monorepo 對應（Next／Express／PHP／Trigger→Node）；**`hetzner-phase1-core`** 之 **compose n8n** 已可經 **`SENTRY_DSN_N8N`** 等注入官方 Sentry 變數；營運者實際 n8n 可能為 **CLI／雲端另架**，與該 compose **不一定同一實例**。**`next-admin`／`node-api`** 已有 Sentry SDK；**`packages/workflows`** 尚未接。
- **2026-04-10（GitHub push）**：本機 **`gh`** 作用中帳號已設為 **awarewaveai-pei**（HTTPS）；對 **`awarewaveai-pei/Work`** 之 **`git push origin main`** 已通過；日後若再 **403** 先查 **`gh auth status`** 之 **Active account**。
- **2026-04-10（晚：README 導覽 + doc-sync 雙拷貝）**：`agency-os/README.md` 表格化連結並明確「根目錄速查 vs `docs/overview`／`docs/operations` 導覽全集」；補 ADR 目錄入口。**`agency-os/scripts/doc-sync-automation.ps1`** 與 monorepo 根一致：自動 Related **不寫入** `../lobster-factory/`、根 **`README.md`**、**`tenants/README.md`**（避免路徑座標錯位／洗版）。文件層面：`hetzner-stack-rollout-index`、`TOOLS_DELIVERY_TRACEABILITY` 宣稱 Supabase 自架已在 Hetzner；實機與憑證仍須人類維運與稽核。
- **2026-04-10（三檔長期治理收斂）**：`cursor-mcp-and-plugin-inventory.md`、`MCP_TOOL_ROUTING_SPEC.md`、`ROUTING_MATRIX.md`、`TOOLS_DELIVERY_TRACEABILITY.md` 已完成術語對齊（`task_type`/`risk_level`/`environment`/`approval_required`）與跨文件契約；新增月/季/年治理節奏與變更同提交要求，避免路由語意漂移。
- **2026-04-09（總表狀態可視化）**：`docs/operations/TOOLS_DELIVERY_TRACEABILITY.md` 已新增「目前實際狀態」與 emoji 圖例（`🟢/🟡/⚪`），並同步到「平台能力總表」與「工具建置順序（P1-P7）」兩張表；`doc-sync` 與 `system-health-check` 均 PASS（100%）。
- **2026-04-09（工具能力總表）**：`docs/operations/TOOLS_DELIVERY_TRACEABILITY.md` 已整合為「平台能力總表（自託管/非自託管/時機）」+「工具建置順序（P1-P7）」單一視圖（繁中）；用於補齊 `TASKS` 執行清單缺少全景能力地圖的落差。
- **2026-04-09（規則防漂移）**：新增單一正本 **`docs/operations/rules-version-and-enforcement.md`**（Version/Priority/Hard-fail）；`scripts/ao-resume.ps1` 新增規則一致性 precheck（驗 Owner 版本標記 + `sync-enterprise-cursor-rules-to-monorepo-root.ps1 -VerifyOnly`），失敗即中止；`30-resume-keyword.mdc` 明確：**未全列 `- [ ]` 視為無效回覆，必須重出**。
- **2026-04-09（AO-CLOSE 規則鏡像）**：**`sync-enterprise-cursor-rules-to-monorepo-root.ps1`** 已納入 **`40-shutdown-closeout.mdc`**（與 **`00`／`30`／`50`／`63–66`** 一併鏡像到 monorepo 根；**`40`** 含 **end-of-day-checklist** 路徑轉換）。**`agency-os/scripts/sync-enterprise-cursor-rules-to-monorepo-root.ps1`** 僅轉呼叫 monorepo **`scripts/`** 正本。**health／README** 敘述為 **00 + 30 + 40 + 50 + 63–66**。
- **2026-04-09（AO-RESUME 待辦可見性）**：**`print-open-tasks`** 會寫 **`agency-os/.agency-state/open-tasks-snapshot.md`**（gitignore）。**`AO-RESUME`** 代理須 **Read** 該檔並在聊天 **逐條全列** `- [ ]`（**`30-resume-keyword.mdc`**）；**>35 條**可同回合分段列完。**`sync-enterprise-cursor-rules-to-monorepo-root.ps1`** 已納入 **`00-session-bootstrap` + `30-resume-keyword`**（根目錄鏡像含路徑轉換），**health gate** 會驗證。
- **2026-04-09（AO-RESUME 預設＝完整檢查）**：**`scripts/ao-resume.ps1`** 預設即跑 **`machine-environment-audit -FetchOrigin -Strict`**（與 **`align-workstation.ps1`** 相同）；**`-SkipStrictEnvironmentAudit`** 僅 Autopilot／輕量開機。只打 **`AO-RESUME`** 時代理應跑此預設腳本。
- **2026-04-09（雙機對齊根因修復）**：`check-three-way-sync -AutoFix` 已**移除**對「known noise」路徑的 **`git restore`**（舊行為會靜默丟棄 `scripts/*.ps1` 等未提交修改，導致多機反覆對齊失敗）；白名單僅剩 **`agency-os/settings/local.permissions.json`**。`TASKS` 雙機項、`30-resume-keyword`、`REMOTE` §1.5／§6.2 與 **`machine-environment-audit -FetchOrigin -Strict`**（無 WARN 方可勾）已對齊；新增 **`agency-os/scripts/machine-environment-audit.ps1`** wrapper。
- **2026-04-07（AO-RESUME／AO-CLOSE 營運硬化）**：`check-three-way-sync` 與 `origin/main`、`ao-close` push 前落後攔截、**`ensure-lobster-workflows-deps`** 掛入 **`ao-resume`**、**`print-open-tasks`／`print-today-closeout-recap`／`apply-closeout-task-checkmarks`**（**WORKLOG `AUTO_TASK_DONE`**）；**單打 AO-CLOSE** 即授權代理代寫 **`AUTO_TASK_DONE`**（**40／50／AGENTS／TASKS 待辦原則**）；**REMOTE 2.5.1**、`40`／`30` **monorepo 根鏡像須與 `agency-os` 正本一致**；詳 **WORKLOG 2026-04-07**。
- **2026-04-02（ADR 006 migration）**：已新增 **`lobster-factory/packages/db/migrations/0010_clerk_org_mapping_and_rls_expansion.sql`**（Clerk↔org 對照表、JWT org claim、`user_has_org_access` 擴充、多表 SELECT RLS）；ADR 006 已補 JWT／staging 驗證說明。
- **2026-04-02（長期 §9–10）**：`LONG_TERM_OPERATING_DISCIPLINE.md` **§9** 為 **AI／MCP 輔助邊界**；**§10** 為 **執行節奏表**（閘道／ADR／釋出／開收工／雙機／audit + 12 個月 ADR 006 錨點）。
- **2026-04-02（ADR 006 + 閘道）**：**006** 多租戶 **RLS／租戶鍵** 與 **Clerk 對照** 原則。`verify-build-gates` 已內建 **`verify-adr-index.ps1`**。見 `docs/architecture/decisions/006-supabase-tenant-isolation-and-clerk-mapping.md`。
- **2026-04-02（工具退役）**：已將 **Linear** 從 repo **完全移除**（含腳本/文件/產物/`mcp.json` server/歷史文字），並以 `doc-sync` + health 100% + `verify-build-gates` PASS 驗證後推送 `origin/main`（避免再出現 401/衝突/殘留入口）。
- **2026-04-02（ADR 004／005）**：**004** Trigger vs n8n 編排邊界（以 `MCP_TOOL_ROUTING_SPEC.md` 為準）。**005** Supabase SoR vs WordPress 執行期 DB。見 `docs/architecture/decisions/004-trigger-vs-n8n-orchestration-boundary.md`、`005-supabase-sor-vs-wordpress-runtime-db.md`。
- **2026-04-02（ADR 002／003）**：**002** 應用層預設 **Clerk**，邊界見 `docs/architecture/decisions/002-clerk-identity-boundary.md`。**003** 否決 manifest **自動雙邊同步**，見 `003-no-automated-manifest-dual-sync.md`。
- **2026-04-02（ADR 001）**：**Manifest SSOT** = `lobster-factory/packages/manifests/`；**install／rollback shell SSOT** = `lobster-factory/templates/woocommerce/scripts/`；**`agency-os/platform-templates/woocommerce/manifests/`** 僅輔材。見 **`docs/architecture/decisions/001-wordpress-manifest-and-shell-ssot.md`**。
- **2026-04-02（長期營運正本）**：新增 **`docs/overview/LONG_TERM_OPERATING_DISCIPLINE.md`**（30 年級可驗證紀律）與 **`docs/architecture/decisions/ADR_INDEX.md`**（輕量 ADR）；已接入 `AGENTS.md`、`README`、`CHANGE_IMPACT_MATRIX`。
- **2026-04-02（租戶模板 v1）**：`tenants/templates/core/` 新增 **`DEPARTMENT_COVERAGE_MATRIX.md`**（企業多部門 → 檔案路由）與 **`CROSS_BORDER_GOVERNANCE.md`**（跨境／外包／審閱索引）；`PROFILE`／`FINANCIAL_LEDGER` 補幣別與多幣別欄；意圖是 **30 年可維護**：擴欄位不複製政策全文，政策仍在 `docs/operations/`。
- **2026-04-02（Git 節奏）**：**§2.5** 為人類可讀 SSOT——日內里程碑由代理**自動**本機 `commit`（`commit-checkpoint.ps1`，不 push）；**預設 push** 仍在 **`AO-CLOSE`**。舊敘述「平常不 commit」已廢止（見下方 2026-03-28 歷史列之註記）。
- 你正在建立多客戶網站與系統代營運模式
- 服務線：建置、維運、行銷、自動化、WordPress 客製系統
- **2026-03-31 補充**：已確立「Single Owner」為最高執行原則（除非必要，一份內容只允許一個 Owner File）；並新增 `doc-sync` 自動檢查（registry: `docs/operations/single-owner-registry.json`）避免重複內容回流。
- **2026-03-31 補充**：Single Owner registry 已擴充到開工/收工關鍵段落（AO-RESUME 主流程、30 秒自檢、AO-CLOSE 硬性 Gate），改由 closeout 自動檢查重複。
- **2026-03-31 補充**：`lobster-factory` A9 baseline 已完成（lifecycle + IAM + audit automation），並接入 bootstrap gate。
- **2026-03-31 補充**：A9 供應商策略已鎖定為 AWS-ready（R2 primary + S3 compatible，presigned PUT 單一契約），避免早期綁死供應商。
- **2026-03-31 補充**：已新增 `R2_TO_S3_MIGRATION_RUNBOOK` 並接入 A9 驗證，確保日後轉 AWS 有標準步驟與回滾，不需重做 workflow。
- **2026-03-31 補充**：已完成 P1/P2 跑道加速（Run ID 對照規格 + preflight 腳本 + 證據骨架初始化），可直接進入實跑。
- **2026-03-31 補充**：P1 最小實跑已完成：舊 `company-a` 示範資料與舊骨架已清除，改用 `company-p1-pilot` 建立新 tenant/site/project，並產生新證據路徑 `reports/e2e/onboarding-a10-2/20260331-214650-company-p1-pilot-2026-010-p1-pilot/`。
- **AO-RESUME 明日必回報提醒**：開場必先提醒並檢查 `reports/e2e/onboarding-a10-2/20260331-215507-company-p1-pilot-2026-010-p1-pilot/02-a10-2-evidence.md` 與同目錄 `03-run-id-map.md`（A10-2 pending 列），再決定是否直接啟動 A10-2。
- **AO-RESUME 雙機提醒（使用者明示 + 未勾 `TASKS` 前持續報）**：**另一台電腦**須跑完 **`docs/overview/REMOTE_WORKSTATION_STARTUP.md` §1.5**（**含 §1.5.1**：Windows 筆電須補 **MariaDB.Server + PHP.PHP.NTS.8.4 + `setup-wp-cli-windows.ps1` + `bootstrap-local-wordpress-windows.ps1 -EnsurePhpIni`**，與 Supabase／MCP **分列**），然後在 **monorepo 根**執行 `powershell -ExecutionPolicy Bypass -File .\scripts\machine-environment-audit.ps1 -FetchOrigin -Strict` 至 **PASS（無 WARN）**，再勾 **`TASKS.md` → Next**「（AO-RESUME 提醒）雙機環境對齊」。在該項**仍未勾選**期間，每次 `AO-RESUME` 回覆的 **「下一步」**（必要時 **「目前進度」**）**必含一行專門口頭提醒**上述 §1.5 + **§1.5.1** + audit（見 `.cursor/rules/30-resume-keyword.mdc` 第 7、8 點）。要點仍含：`gh`、vault／MCP 每台重設、**§2** 例行節奏。
- **2026-04-01 補充（雙機／筆電）**：使用者已表明**公司桌機基樁較完整、筆電要補**——在「雙機環境對齊」未勾選前，**每次 `AO-RESUME` 務必**提醒筆電完成 **§1.5.1**（MariaDB／PHP／WP-CLI／bootstrap）；MCP 工具庫存旁註見 **`docs/operations/cursor-mcp-and-plugin-inventory.md` §4**（強調非 MCP、不取代 Supabase）。
- **2026-04-01 補充（環境 SSOT）**：「可驗證的完美環境」定義與指令見 **`docs/overview/REMOTE_WORKSTATION_STARTUP.md` §6.2**；稽核腳本 **`scripts/machine-environment-audit.ps1`**（`-FetchOrigin`、選用 `-RunVerifyGates`、`-Strict`）。例行 **`npm ci` 目錄為 `lobster-factory\packages\workflows`**（根目錄無 package-lock，舊文件寫「在 lobster-factory 根 npm ci」為誤）。

## Today (2026-09-04) — Cognitive OS 切片變成全真堆疊（Ollama + 8420 語音 + 三階段模型 coding）

- **一句話**：研究切片的每個 AI 步驟第一次真的由模型產生，且每步都有「不存在／不逐字就拒收」的 gate；真跑三次被 gate 擋下（模型抄 code 當分類、第二 coder 引用不逐字、THEMES_V11 隱藏假設），全部修不變量，沒有放寬 gate。六個 commit 在 origin（`cbccaf03d`…`8894b5158`）。
- **基礎設施**：Ollama 0.33.3 + `gemma3:4b`（免費、本機）；`ai_lego/platform/ai_execution/gateway.py` 兩個 provider（self-hosted Ollama／Anthropic BYOK，key 由呼叫端傳，不讀 env——`user-env.ps1` 刻意留空避免撞 Claude Code 訂閱），egress 規則用 repo 既有四值詞彙（不是 GPT 文件的新詞彙）。
- **8420 重用**：`MeetingServiceTranscriber` 以檔案路徑載入 8420 的 `lib/transcribe.py`／`lib/diarize.py`；發現 8420 自己在本機早壞（speechbrain 1.1.0 `endswith("/inspect.py")` 在 Windows 永不成立 → 強制載入 k2）→ 升 1.1.1 釘進 requirements。
- **產品判斷（對話結論，未落 ADR）**：賣本機授權（資料不離機）＋線上版同一份 code 換 provider；Ollama 只在本機版有意義；線上主機 `ks-aw-01` 無 GPU → STT/LLM 走 API 或按次租 GPU；名稱不能含 LEGO；GPT 那份 Universal AI Foundry 文件只取三樣（敏感度路由、App 不直打 provider、每次呼叫記 model/prompt/trace），其餘不蓋第二套平台。
- **治理同日**：AGENTS.md 瘦身、ADR-024 spec-on-demand、`oracle-quota.ps1` 斷路器、`repeat-failure-guard.js`、RUNNABLE_DEMOS 登記表。oracle 全天撞額度 → 書面自審＋突變測試。
- **下一步**：eval dataset＋換大模型比較；`--review interactive` 真人審；多講者真音檔；抽共用 speech package；9/7 後補 `/codex-review`。詳 `memory/daily/2026-09-04.md`、TASKS ⑥、WORKLOG 續4–續9。

## Confirmed Priorities
1. 先建完整可複製框架，不做精簡版
2. 補齊財務、人力外包、SOP、資安事件應變、客戶邊界管理
3. 需要「每接一案從零到完成」模板套裝
4. 需要跨會話記憶，避免每次重講

## Progress Snapshot
- **2026-06-08 AO-CLOSE 復發三項徹查治本**（commit `762dd1b1`）：操作者問「6/5 收工卡 30min、6/6 卡但照抄 6/5 作法 10min 完成、但根因沒修」。徹查證實 6/6 = cargo-cult 照抄 6/5 workaround。#1 archive-lift 今天稍早已修(`8e77e474`)；#2 AO-RESUME archive 缺 → `ao-resume.ps1` 開工自動寫 skeleton(preventer)；#3「hooks object→array」是**誤診被照抄**(真因 `~/.claude/mcp.json` runtime 重填,object/array 5/14 已治) → `ao-close.ps1` sync 自癒 + TASKS:154 更正。協定加「禁止照抄症狀標籤,每個 fail 重新診斷」。教訓存 memory `feedback_no_cargo_cult_selfrepair.md`。
- 已建立 Agency OS v1 基礎文件與政策模板
- 已建立 project-kit 接案模板骨架
- 已建立 Cursor 規則，要求會話先讀記憶與進度文件
- 已整合同事制度中的啟動順序與日記型記憶模式
- 已新增安全政策，禁止文件保存明文憑證
- 已建立 tenants v2 骨架（tenant-template + site-template + company-a sample）
- 多租戶骨架已收斂為 `company-a` 單一實際 tenant（其餘示範 tenant 不保留）
- 已開立第一個專案：`company-a/projects/2026-001-website-system`
- 已完成 `2026-001` Discovery 初版與里程碑日期初版
- 已完成系統級操作文件（System SOP、New Tenant Onboarding SOP、Service Packages、CR Pricing）
- 已建立 MSA/SOW/CR 模板，補齊售前到變更文件鏈
- 已建立 WordPress / n8n / KPI&毛利規範文件，補齊交付與營運標準
- 已建立 docs 分類與文件連動矩陣，修正「改一份不會同步」問題
- 已建立自動同步與結案自檢流程（AutoDetect + Watch + closeout report）
- 已補上每公司排程自動化（schedule/queue/runner/register）
- 已補上國際化治理模組（global delivery/compliance/multi-currency/QA gate）
- 已建立系統健康檢查腳本，最新檢查分數 100%
- 已建立 System Guard（關機前/每日/開機後）與狀態告警檔
- 已加上桌面彈窗 PASS/FAIL 與亂碼防線（自動檢測 + 阻擋同步覆寫）
- 已建立可販售產品化藍圖、買方交接清單與打包腳本
- 已建立英文化對客模板（Proposal/SOW/Monthly Report）
- 已建立客戶風險評分模型、外包評分卡、leads/scraping 合規清單
- 已建立 release notes/upgrade path/migration checklist，補齊升級治理
- 已建立 Agency Command Center 與多平台架構，並保持 WordPress-first 策略
- 已完成一輪本機安全檢查（未見常見遠控軟體活動）
- 已確認 RDP 關閉，Lenovo Now 移除
- 已完成結構收斂：政策文件位於 `docs/operations/`，核心腳本位於 `scripts/`
- 已建立 `company-a` 客戶 package 1-4 使用指南（總司令/客戶/工具/自動化）
- 已將 `.cursor/rules` 納入 watch 與連動矩陣，規則更新可自動進入 closeout 檢查
- 已新增 health `Critical Gate` 與 guard gate 條件（關聯缺漏與缺檔不可帶過）
- 已新增完整系統介紹文件：`docs/overview/agency-os-complete-system-introduction.md`
- 已新增續接關鍵字規則 `AO-RESUME`（下次開啟可快速回到進度）
- 已新增收工關鍵字規則 `AO-CLOSE`，並固定開工摘要格式（Yesterday/Today/Confirm）
- 已新增 `.cursor/rules/README.md` 作為 rules 使用手冊
- 已修復 `AgencyOS-*` 排程路徑漂移（舊路徑 -> `D:\Work\agency-os`）與命令引號問題
- 已在健康檢查加入排程路徑存在性檢查，避免路徑失效未被偵測
- 已針對架構期停用 `company-a` adhoc 輪詢（保留可隨時重啟）
- 已完成 workspace 降載（移除高噪音根目錄 + watcher/search exclude）以降低 Cursor OOM
- 已新增 `scripts/archive-old-reports.ps1`，建立 reports 保留與歸檔機制
- 已修正 `RESUME_AFTER_REBOOT.md` 路徑與續接流程（統一 `AO-RESUME`）

## Today (2026-03-30 晚) — Cursor 規則與外掛
- 落地 **`00-CORE.md`（完整）+ `63.mdc`（精簡 alwaysApply）**；**`sync-enterprise-cursor-rules-to-monorepo-root.ps1`** 掛入 **`verify-build-gates`** 與 **`doc-sync`**；health **343** 檔包含 monorepo 根 **`63–66`** SHA256 對齊。
- **1Password**：專案採 **DPAPI vault + env/mcp**；已刪 Cursor **`plugins/cache/.../1password`**；請於 IDE **停用**外掛免再載入。

## Next Step
- 與客戶確認 `2026-001` Discovery 阻塞項（決策者/窗口、品牌定位、CR 估價基準、權限交付）
- 以新客戶實跑一次 `NEW_TENANT_ONBOARDING_SOP` 並微調
- 盤點並輪替曾出現在文本中的 API keys/token
- 先選 1 家公司完成真實資料填寫與第一案啟動
- 將 Defender 排程固定到夜間，避免白天高噪音
- 以系統管理員身分套用 Defender 排程變更（目前權限不足）
- `company-a` 真實資料填寫與流程實跑（CR/排程/報告/守護）
- 在 `README.md` 首頁加入 `AO-RESUME` / `AO-CLOSE` 快速操作卡
- 進行一次完整「開工 -> 收工」演練並回寫 WORKLOG

## Today (2026-03-25) - 重點進度
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

## Remaining - 需要接下來做完的事（依序）
1. ~~為 `lobster-factory` 接上「只寫 `workflow_runs`」的真寫入流程~~（C1-1 已 execute PASS）
2. ~~接上 `package_install_runs` 的狀態更新~~（主線 C1-2 PASS：`206bd6ee-f5e0-4b6a-810c-bbb9914844f4`；公司桌機複核：`ae8c6e48-fac9-4ac6-8721-d142c831c620`；failed/rolled_back 產品化仍待補）
3. ~~C1-3 DB 寫入韌性 execute~~（主線已 PASS，見 checklist）
4. 把 `apply-manifest` 的 shell 執行器真正串上（仍需維持 `staging-only` + guardrails），並確保 rollback 可用
5. 接回 `create-wp-site` 的 staging 環境建立流程（需要後續 hosting provider adapter）

## Tomorrow (2026-03-26) - 建議第一優先
- 先跑一個 end-to-end「乾跑」payload（不寫 DB），確認回傳的 SQL template + row payload 完整且欄位對齊
- 再開啟真寫入一次（建議只開 `LOBSTER_ENABLE_DB_WRITES=true` 並先寫 `workflow_runs`），用你手上的 Supabase UI 查表插入是否正確
- 把所有「驚險步驟」都留在人機核可/approval 設計裡，不允許 production 自動執行

## Runbook Commands (明天照跑)
你有兩種模式：`Strict`（安全最大）與 `Fast`（速度優先但仍有門檻）。
以下命令中的 `<WORK_ROOT>` 請替換為本機實際路徑（例如 `D:\Work` 或 `C:\Users\USER\Work`）。

### 開工前（雙機必做；代理在 `AO-RESUME` 時應先跑腳本再讀檔）
在 **monorepo 根**：
```
cd <WORK_ROOT>
powershell -ExecutionPolicy Bypass -File .\scripts\ao-resume.ps1
```
**預設**行為＝`fetch`、**僅 behind>0** 時 **`git pull --ff-only origin main`**、`verify-build-gates`、workflows 依賴、`print-open-tasks`、**`machine-environment-audit -FetchOrigin -Strict`**（見 `REMOTE_WORKSTATION_STARTUP` **2.5.1**）。**落後且工作樹仍有未提交變更時，預設不會自動 stash**——腳本會**非 0**；請先 commit／stash／捨棄後重跑，**勿**只打關鍵字假設已對齊。另一台 **AO-CLOSE** push 後，本機須**跑通**上述腳本（exit 0）或手動等價對齊再打 **`AO-RESUME`**。若 ff-only 失敗：`git pull --rebase origin main`（見 **REMOTE** **例行 §2**）。

### Strict Mode（推薦，確保今天/明天不出問題）
1. Phase 1 基線健檢
```
node <WORK_ROOT>\lobster-factory\scripts\bootstrap-validate.mjs
```
2. manifest 顯式驗證（只驗 JSON 結構與 guardrail）
```
node <WORK_ROOT>\lobster-factory\scripts\validate-manifests.mjs
```
3. governance 顯式驗證（驗 agent/policy JSON）
```
node <WORK_ROOT>\lobster-factory\scripts\validate-governance-configs.mjs
```
4. apply-manifest 乾跑（不寫 DB，只輸出 payload + SQL template）
```
node <WORK_ROOT>\lobster-factory\scripts\dryrun-apply-manifest.mjs --organizationId=11111111-1111-1111-1111-111111111111 --workspaceId=22222222-2222-2222-2222-222222222222 --projectId=33333333-3333-3333-3333-333333333333 --siteId=44444444-4444-4444-4444-444444444444 --environmentId=55555555-5555-5555-5555-555555555555 --wpRootPath="<WORK_ROOT>\dummy" --environmentType=staging
```
5. apply-manifest 乾跑驗收（失敗即停，`--mode=strict`）
```
node <WORK_ROOT>\lobster-factory\scripts\validate-dryrun-apply-manifest.mjs --mode=strict --organizationId=11111111-1111-1111-1111-111111111111 --workspaceId=22222222-2222-2222-2222-222222222222 --projectId=33333333-3333-3333-3333-333333333333 --siteId=44444444-4444-4444-4444-444444444444 --environmentId=55555555-5555-5555-5555-555555555555 --wpRootPath="<WORK_ROOT>\dummy" --environmentType=staging
```

### Fast Mode（快、但仍有關鍵門檻）
1. manifest 顯式驗證
```
node <WORK_ROOT>\lobster-factory\scripts\validate-manifests.mjs
```
2. governance 顯式驗證
```
node <WORK_ROOT>\lobster-factory\scripts\validate-governance-configs.mjs
```
3. apply-manifest 乾跑（不寫 DB）
```
node <WORK_ROOT>\lobster-factory\scripts\dryrun-apply-manifest.mjs --organizationId=11111111-1111-1111-1111-111111111111 --workspaceId=22222222-2222-2222-2222-222222222222 --projectId=33333333-3333-3333-3333-333333333333 --siteId=44444444-4444-4444-4444-444444444444 --environmentId=55555555-5555-5555-5555-555555555555 --wpRootPath="<WORK_ROOT>\dummy" --environmentType=staging
```
4. apply-manifest 乾跑驗收（`--mode=fast`，失敗即停）
```
node <WORK_ROOT>\lobster-factory\scripts\validate-dryrun-apply-manifest.mjs --mode=fast --organizationId=11111111-1111-1111-1111-111111111111 --workspaceId=22222222-2222-2222-2222-222222222222 --projectId=33333333-3333-3333-3333-333333333333 --siteId=44444444-4444-4444-4444-444444444444 --environmentId=55555555-5555-5555-5555-555555555555 --wpRootPath="<WORK_ROOT>\dummy" --environmentType=staging
```

## Memory Update Protocol
- 每完成一個里程碑就新增一段摘要
- 對話內容很長時，用以下格式壓縮：
  - 背景
  - 已完成
  - 未完成
  - 風險
  - 下一步

## Today (2026-03-30) - Lobster C1-2
- `validate-package-install-runs-flow.mjs --execute=1`：PASS（`installRunId=ae8c6e48-fac9-4ac6-8721-d142c831c620`，`workflowRunId=73c91be3-3663-4977-aa9a-4c2b7e24dd97`，flow pending→running→completed）。
- `bootstrap-validate.mjs`：PASS。主檢查清單 **C1-2** 已勾選。

## Today (2026-03-26) - AO-CLOSE（歷史快照；**現行順序**見 **`.cursor/rules/40-shutdown-closeout.mdc` 第 2 步**）
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

## Today (2026-03-27) - V3 規格整合
- 已匯入新文件：`D:\Work\docs\spec\raw\LOBSTER_FACTORY_MASTER_V3.md`。
- 已建立可執行整合計畫：`D:\Work\lobster-factory\docs\LOBSTER_FACTORY_MASTER_V3_INTEGRATION_PLAN.md`（20 OS 模組映射、P0/P1/P2 優先順序、驗收訊號）。
- 已在 `lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md` 新增 `H) MASTER V3 整合追蹤`，作為後續落地與完成證據掛點。
- 目前執行策略：先不打斷 `C1-2`，維持 `C1-2 -> C1-3 -> V3 skeleton sprint` 順序。

## Today (2026-03-27) - C1-2 execute 完成
- `validate-package-install-runs-flow.mjs --execute=1` 已實跑成功（目標專案 URL 已切至可連通專案）。
- 結果：`installRunId=206bd6ee-f5e0-4b6a-810c-bbb9914844f4`，狀態流 `pending -> running -> completed`。
- 阻塞修復：補齊 `environments` fixture（`environment_id=555...`），並改用已存在 `workflow_runs.id` 作為 `workflowRunId`。
- C1 目前狀態：`C1-1 ✅`、`C1-2 ✅`、`C1-3 ⏳`（下一步）。

## Today (2026-03-27) - C1-3 execute 完成
- `validate-db-write-resilience.mjs --execute=1` 已實跑成功（以 vault 自動注入 Supabase env）。
- 結果：`ok: true`、`traceId=resilience-4c1b0ea6-84a3-4a8a-8c01-5ce648dd6099`、`insertedWorkflowRunId=77f43da0-6fc6-4ce6-bc3b-f3d139fc783c`。
- C1 目前狀態：`C1-1 ✅`、`C1-2 ✅`、`C1-3 ✅`，可進入下一主線（V3 skeleton sprint / C2）。

## Today (2026-03-27) - H3 skeleton sprint Batch 1
- 已完成 V3 缺口模組第一批骨架（Sales/Marketing/Partner/Media/Decision Engine/Merchandising）。
- 落地檔案：`0007_v3_skeleton_modules.sql`、`v3-skeleton.ts`、`v3-module-skeleton-workflows.ts`、`V3_MODULE_SKELETONS.md`。
- `LOBSTER_FACTORY_MASTER_CHECKLIST`：`H3` 已勾選完成。

## Today (2026-03-27) - H4 Decision baseline 完成
- 已完成 Decision Engine recommendations baseline：
  - migration：`0008_decision_engine_recommendations.sql`
  - contract：`decision-engine-baseline.ts`
- `LOBSTER_FACTORY_MASTER_CHECKLIST`：`H4` 已勾選完成。

## Today (2026-03-27) - H5 CX baseline 完成
- 已完成 CX retention/upsell baseline（與 `workflow_runs` 串接）：
  - migration：`0009_cx_retention_upsell_baseline.sql`
  - contract：`cx-retention-upsell-baseline.ts`
- `LOBSTER_FACTORY_MASTER_CHECKLIST`：`H5` 已勾選完成。

## Today (2026-03-27) - Zero-cost Secrets Vault
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

## Today (2026-03-28) - 報表路徑收斂 + AO-CLOSE
- 已落地報表單一路徑：所有入口強制寫入 `agency-os/reports/*`，root `reports/*` 退役；commit `5128e7d`（收工腳本會一併 push）。
- 使用者關切：Cursor `user-copilot` MCP 認證重試迴圈不會等同模型 token 計費，但會耗少量本機資源；可停用該 MCP 項止刷 log。
- 收工：執行 `AO-CLOSE`（`ao-close.ps1`）完成 verify + guard + integrated status + push。
- **Git 節奏（2026-03-28 紀錄；已 superseded 2026-04-02）**：當時共識為「平常不主動 commit」——已改為 **§2.5**：里程碑本機 checkpoint + **AO-CLOSE** push。請勿再以本行為準。

## Today (2026-03-28) - Lobster operator bundle（營運套裝）
- `lobster-factory`：`npm run operator:sanity`（`validate` + `regression:staging-pipeline`）、`npm run payload:apply-manifest`（`print-apply-manifest-payload.mjs`）。
- 操作手冊：`lobster-factory/docs/operations/LOBSTER_FACTORY_OPERATOR_RUNBOOK.md`；README 頂部已掛「營運一鍵」。
- 閘道：`bootstrap-validate` 與 `validate-workflows-integrations-baseline.mjs` 已納入上述檔案與字串檢查；`npm run validate` PASS。

## Today (2026-03-29) - 續接驗證
- 使用者「好」＝執行：`git pull`（up to date）、`verify-build-gates` PASS、health **100%**（`health-20260329-221913.md`）、`npm run operator:sanity` PASS。

## Today (2026-03-28) - AO-CLOSE（晚）
- **AO-CLOSE** 完成：`verify-build-gates` PASS、health **100%**、`system-guard` PASS、integrated-status 已產出；**Git** `e04be6f` 已 **push `main`**。

## Today (2026-03-28) - A10-2 前置（SOP Step 7 + presign 範例）
- `NEW_TENANT_ONBOARDING_SOP` Step 7、presign 範例 JSON、`PRESIGN_BROKER_MINIMAL`；operable gate 綁定 monorepo SOP。

## Today (2026-03-28) - Lobster A10-1 + A9 policy
- `OPERABLE_E2E_PLAYBOOK.md`、`validate-operable-e2e-skeleton.mjs`（bootstrap）、`ARTIFACTS_LIFECYCLE_POLICY.md`；`MASTER_CHECKLIST` A10-1/A10-2、A9 更新敘述。

## Today (2026-03-28) - Monorepo spine + dashboard refresh
- Repo 根 `README.md`（AO + Lobster + `verify-build-gates`）；`EXECUTION_DASHBOARD` §2 去過期；`MASTER_CHECKLIST` A6/B5 對齊 `http_json`／`remote_put`；`verify-build-gates` + doc-sync PASS。

## Today (2026-03-28) - Lobster A9 remote_put artifacts
- `LOBSTER_ARTIFACTS_MODE=remote_put` + `REMOTE_PUT_ARTIFACTS.md`；presign URL 或 inline JSON；`apply-manifest` 寫 `logs_ref` 行為與 local 一致。

## Today（補登）- 規格原文目錄 `docs/spec/raw`
- 使用者出示 **檔案總管**：`D:\Work\docs\spec\raw\` 內四份 **.md** 為設計**原文**（含 **`LOBSTER_FACTORY_MASTER_V3`** 內 Agency OS **20 個 OS 模組** 圖，即跨國企業級職能拆分來源）。已在 monorepo 根新增 **`docs/spec/README.md`** 索引，並在根 **`README.md`**、**`agency-os/README.md`** 加上導覽；說明其與 **`MCP_TOOL_ROUTING_SPEC`**（少列＝執行閘道）為不同層級。

## Today (2026-03-30) - cursor-mcp inventory：純 Supabase／SoR 敘述
- `docs/operations/cursor-mcp-and-plugin-inventory.md`：使用者要求 **本檔不出現任何第三方表格式工具名稱**；已刪除該列與所有相關段落／SSOT／Related 連結。**supabase** 兩欄改為**自足**寫法：平台 SoR、RLS／Storage／Webhook、MCP 與 `read_only` 邊界、以及對 [`MCP_TOOL_ROUTING_SPEC`](../../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md) 中 Trigger／n8n 分工的對齊。**`change-impact-map`** 已取消本檔 ↔ migration playbook 的強制連動（health 仍 100%）。

## Today (2026-03-28) - Lobster `http_json` hosting
- `LOBSTER_HOSTING_ADAPTER=http_json` + `HTTP_JSON_HOSTING_ADAPTER.md`；`provisionHttpJsonStaging`；`create-wp-site` 支援 `vendor_staging_provisioned` 與 `vendorStaging`；`resolveStagingProvisioning` 為 async。
- **互動偏好**：可驗證範圍內代理自主推進、減少選項式追問；不可逆決策仍單點確認。

## Today (2026-05-08) - SG deploy drift 根因排除 + 機械化 + 自動告警
- **症狀**：`app.aware-wave.com` sidebar 預期 7 項只看到 5 項（缺 New Client / Build Console）。
- **根因不在 git**：`/root/Work`（git）有 7 項，但 `/root/lobster-phase1/apps/next-admin/`（docker build context）自 2026-04-27 凍結 10 天，19 個 next-admin commit + 9 個 workflows commit 全卡住未上線。SG 兩個目錄無自動同步機制是長期 bug。
- **Server 落地**：`/root/lobster-phase1/scripts/sg-deploy.sh`（rsync git→staging，`--exclude='.env*'` 保留本機機密，build + up + 寫 `.deployed-commit`）；`/root/lobster-phase1/scripts/check-drift-and-alert.sh`（每日 01:00 UTC cron，dedupe，curl 既有 Slack webhook）。
- **Client 落地**：`scripts/check-deploy-drift.ps1`、掛 `system-health-check.ps1` §7（warn-only）；`.claude/commands/sg-deploy.md`、`.claude/commands/check-drift.md` 兩個 slash command。
- **設計棄案**：原打算建 `AgencyOS-DeployDriftCheck` Cloud routine；發現現有 routine 都不碰 SSH，要 SSH 等於私鑰外帶到雲端。改 SG 本地 cron 後，零雲端依賴、私鑰永不出 SG，30 年穩固性更佳。
- **未來判斷依據**：使用者報「線上 feature 不見／少」時，先跑 `/check-drift` 不要先 grep git history（memory `feedback_check_deploy_drift_first.md`）。
- **使用者桌面 `AWARE_WAVE_CREDENTIALS.md` §24** 仍有 EU/SG 描述錯誤（next-admin 在 SG 不在 EU）；不在 git，候授權後代修。

## Today (2026-05-13 晚) - Anthropic API 成本診斷與修復
- **症狀**：使用者發現 Feb 23 買的 $5 API credits 耗盡，不記得有用 API。
- **根因**：(1) `ANTHROPIC_API_KEY` 被 vault-sync 推入 Windows 使用者環境變數，Claude Code 看到後優先走 API Key 計費，忽略 Max 訂閱。(2) repair-center GitHub Actions 在建置/測試期間多次以 `--max-turns 30` 呼叫 Claude → 3.1M tokens ≈ $10。
- **修復**：移除 Windows 使用者環境變數中的 `ANTHROPIC_API_KEY`（`SetEnvironmentVariable(..., [string]::Empty, 'User')`）；Claude Code 改走 Max 訂閱。repair-center 使用 GitHub Secrets，不受影響。
- **降成本**：`auto-repair-claude.yml` `--max-turns 30` → `15`，降低每次 repair job 約 40-50% token。
- **注意**：vault-sync 下次執行可能重推 `ANTHROPIC_API_KEY` 到 Windows env，需監控或排除。Cursor（免費額度）/ Codex / Gemini 不走 Anthropic API 帳戶，無問題。

## 2026-06-02（筆電 session）— 換機 AO-RESUME 根因治本 + onboarding ① + §7 架構更正

- **換機 AO-RESUME 失敗根因（治本）**：`LAST_SYSTEM_STATUS.md` 是 git-tracked 但 `system-guard.ps1` 每跑必重寫（內含 Time/Health/Closeout 三個每次都變的欄位）→ 開工 tree 必 dirty → AO-RESUME hook auto-checkpoint → 落後遠端時 push 被拒 → 換機手動修。修法：寫前比對「排除三易變行」的實質狀態，相同就不重寫。**兩份同步**（排程跑 `agency-os/scripts/` 版、`scripts/` 是正本，位元組相同）。commit `a205499`。教訓：先誤用 `.gitignore` 規避（治標埋雷）→ revert；正解是修 writer。
- **抓蟲副發現**：`scripts/` vs `agency-os/scripts/` 20 個核心腳本 drift（含 AO 生命週期）→ agency-os/scripts/* 應為 thin wrapper 轉呼叫 root 正本，遷移做一半。已記 TASKS。
- **Claude sync drift**：health 99.7%→100%（userlevel settings.json hooks object→array + mcp.json，`sync-claude-userlevel.ps1 -Mode merge` 修，backup 留存）。
- **onboarding portal**：① debug log 清理交付（commit `d3c7dd2`，tsc 0 + 168 tests + critic 0/0/0，未 deploy）。**②③ §7/§8 不實作的 R0 理由**：`orchestrate-tenant-provisioning` 不建 WP 站、`create-wp-site` 需 4 UUID、已有 `/build` console + dispatch-action-run + ops/organizations pipeline → ②③ 必須 reuse 既有 pipeline（設計 pass），不得另造/不得猜。packet + TASKS 已更正前任「已串接」錯誤假設。
- **行為教訓（已存 memory feedback_aoresume_execution_discipline）**：先動手才理解造成多小時混亂；不抓 ignore 捷徑、不刪操作者 signal 檔、Windows bash 用正斜線、.ps1 regex 不放字面 BOM。

### 2026-06-09 下午 — Tarot 牌卡模板改正式直線外框
- 操作者要：棄裝飾 PNG 外框（6 個從沒做好），改一般正式塔羅版式 + 三種簡單直線不同色外框（金/藏青/酒紅）；版式 = 上羅馬數字／中圖像直接嵌入／下牌名。
- 做法 pivot：`renderPrintCard.ts` 從「3-layer PNG overlay（透明中心圖檔）」改為純 canvas 繪製（雙直線外框 + 圖像細框線 + roman/name 文字），零外部圖檔依賴。CardTemplate 7→3 key。`TarotStudio.tsx` 預設改 `gold`。
- tsc：我改的兩檔 0 新錯誤（剩 jszip/@supabase/ssr 為本機缺 node_modules 既存）。canvas 像素需瀏覽器，待 staging 確認。**未部署**。
- `public/tarot-frames/*.png` + middleware 白名單現未使用，保留不刪。rollback = git revert 即還原。

## 2026-06-10 — wp-bridge v0.7.0 商品端點 + 發版工具化 + soulful 真站發文/建商品
- **新增 `/product` 端點**（v0.7.0）：`ProductCreator`（`WC_Product_Simple` atomic create + read-back verify + 失敗 `delete(true)`，鏡像 PostCreator），`POST /product` route。critic Deep 審：2 High（wp_slash 防 block-markup 損毀 / price 拒科學記號+wc_format_decimal 正規化）+ 1 Medium（category 全有或全無）全修。commit `194df13d`。
- **兩 repo 坑（重要記憶）**：外掛發佈正本 = `awarewaveai-pei/aware-wave-wp-bridge`（push tag `v*` → Action 出 zip + Release），**不是 Work**。只 push Work ≠ 發版。第一次發 v0.7.0 繞錯路。→ 工具化 `scripts/release-wp-bridge.sh` + `/wp-bridge-release` + `runbooks/WP-BRIDGE-RELEASE-RUNBOOK.md` + AGENTS 自觸發列（改 wp-bridge code+bump 版本+過 R0 → 自動發版）。commit `154e1c88`。操作者要求「全自動」。
- **soulful 真站產出**：SSH+wp-cli 直呼 Creator（同 post 7053 路徑），建 **post 7065**（draft 文章）+ **product 7066**（draft，simple，price=45，cat=Workshops）。read-back 全正確。皆 draft 不公開，待操作者後台定稿發佈。
- **下一步待辦（已 lift TASKS）**：客製化 T-shirt = WooCommerce **variable product**（顏色 白/黑 × 尺寸 3L/2L/XL/L/M/S/XS + variations + 客製圖案），`ProductCreator` 目前只做 simple，需擴 `WC_Product_Variable`。
- 平行 session 同時做 tarot 103-style catalog（非本 session）。

## Related Documents (Auto-Synced)
- `docs/overview/EXECUTION_DASHBOARD.md`
- `docs/overview/REMOTE_WORKSTATION_STARTUP.md`

_Last synced: 2026-10-03 06:57:28 UTC_

## 2026-06-16 AO-CLOSE memory — session window 2026-06-11T05:07Z → 2026-06-16 afternoon

- **POD / Printful / Woo**: POD Studio moved through generator, remove-bg, mockup, PrintProvider sync, R2 gallery, Publish page, and wp-bridge product path. A1 native product creation is live/hardened. A2 Woo paid-order webhook is deployed but dormant: it only creates Printful DRAFT orders behind `POD_AUTO_FULFILL_ENABLED`; no confirm/charge path exists and that remains a red-line future task.
- **Content engine**: major quality fixes landed: RankMath CJK/title compliance, WP Bridge publish handoff, featured hero / ILJ / power words, YouTube real embeds, keyword-enforced outline, fake internal-link prevention, real related-post lookup, truncation marker/meta-first guard, and positive enforcement for table/FAQ/quote/summary toggles.
- **Content blocks / studio**: search registry and content block registry are live; product-copy and quality/check blocks were verified; P4 headless pipeline now runs article -> quality -> publish -> WP draft; Media Hub image-generation block integration added 5 models/styles/img2img/seed; UI added AI Models guide, USD cost SSOT, FLUX Kontext Dev/Pro, structured mockup controls, Brand Voice customer auto-fill, and email teaser fixes.
- **Canvas / browser testing**: browser-test command and AGENTS trigger added; Canvas e2e and mockup studio verification debt were checkpointed as cleared. Remaining mockup task is no longer server-side health; it is waiting for operator symptom details if the UI still misbehaves.
- **Ops / infra**: closeout/archive-lift/git-log rules repaired; verify-gate risk-tier routing added; doc-sync LiteralPath fix and SystemGuard Register-ScheduledTask rewrite landed; Trigger MCP pwsh fallback fixed; self-hosted runner/workflow_dispatch deploy path and origin-lockdown scanner work landed; GHA deploy events now report to ops-inbox; Telegram `/deploy_status` command added.
- **Security**: Windows Defender incident captured as formal 2026-06-17 follow-up. Current evidence points to Claude Desktop automation invoking Git Bash + temp ps1 + ExecutionPolicy Bypass + scheduled task test, with Defender showing inactive/non-executed threat after removal and quick scan. Still treat as real incident tomorrow: delete temp script, inspect registrar/launcher, verify live scheduled task action, consider hook escalation.
- **Open next**: Postiz multi-platform + ContentStudio publish integration; FluentCRM newsletter REALTEST/release/UI; generated draft persistence; trending source expansion; clean old fake-link article; Cloudflare migration billing/DNS steps; POD A1 real e2e and A2 enablement only after operator test/approval.

## 2026-06-11 — POD Studio 全產線一日上線（P0驗證→P2a/b/c/d→Mockup→一鍵上架→兩輪部署）
- **P0 擬真合成驗證 PASS**：nano-banana-2 白衫 ~95%/黑衫鎖色後 ~90%。**三鐵則**（深色逐色鎖色／姿勢避遮胸／設計圖走 data URI）已工具化進 mockup-prompt.ts。
- **全鏈上線 app.aware-wave.com**（deploy `a4fd0e95`）：Studio 生圖（15 模型 facade 委派 tarot 引擎零重寫）→ 去背（851-labs，RGBA 驗證）→ Mockup（B9-S 平拍/模特雙模式）→ My Designs（R2 `lobster-designs` bucket + media_assets）→ Publish 頁（①誠實 300DPI 放大（探測真尺寸+2段+achievedPx 警告）②wp-bridge Ed25519 簽章建 Woo 草稿 ③sync 檢查 ④綁印刷檔）。
- **關鍵架構發現**：①Printful Woo 平台型 store 禁用 Products API → 正確鏈 = Woo 先建（wp-bridge）→ 外掛 sync → `PUT /sync/variants/{id}` 綁 catalog variant+印刷檔 ②Printful 只同步已發布商品（draft 不進清單）③wp-bridge `/product` 無 dry-run（假參數已移除；測試真建 draft #7164，SKU 唯一性擋住重複）④server compose 為本地管理（rsync 不帶），env passthrough 要直接上 server 打。
- **C1 結案**：migration 0007/0011 media_assets 雙定義 → 0038 reconcile（db-expert 審 LOW）已套 EU supabase-db，全 no-op 如預測，DR 劇本修復。
- **憑證**：REPLICATE token 三處回填（SG 6/5 輪替未同步本機=MCP 401 根因）；Printful Access+OAuth ×4 入 vault+CREDENTIALS §三十一；WPBRIDGE ×3 上 SG。vault `get` 輸出是遮罩值（設計）；`-Key`→`-Name` doc drift 修 2 檔。
- **明日**：#7164 進 Printful dashboard 後跑 ③④（link 寫路徑首驗）→ P4 試單。packet: handoffs/2026-06-11-1743-pod-publish-final-link.md。Replicate 餘額 <$5 節流，建議儲值。



## 2026-06-12 → 06-15 — POD/Content/Canvas 全產線深化 + 服飾 POD 上線 + 社群發佈
- **POD 服飾 Phase 1-4 上線 app.aware-wave.com**（deploy `37dfba85`，smoke 24 pass）：Phase 1 100% 忠實印刷檔（取代 Real-ESRGAN 預設，鐵律=圖案不被 AI 重新詮釋）+ 純圖案產品圖；Phase 2a Printful 多風格 mockup（含真人模特，全忠實）+ 一鍵存圖庫；Phase 2b 平拍真實 overlay（設計忠實，與 AI 平拍雙軌）；Phase 3 台灣本地印刷檔目的地 seam（DTG 業界預設，待實際規格回填）；Phase 4 AI 商品文案（SEO/GEO/AEO/RankMath 合規）。**後續未做見 TASKS line 81**（非 100% 完成）。
- **Canvas 編輯器 PS 功能目錄全上線**（`/tools/canvas`）：影像效果積木（Vibrance/高斯模糊/雜訊/色溫）、圖層面板（reorder/顯隱/複製/刪除/改名/群組）、Undo/Redo（Fabric v7 loadFromJSON Promise + re-applyFilters，cap 20）、生成填色/擴圖（flux-fill-pro）、Posterize、設計檔 .design.json 存載、字型庫（Google Fonts CJK+Latin+上傳）、去白底 RemoveColor、物件鎖定/形狀 blocks、WYSIWYG 調色預覽（Fabric）。**驗證債：使用者尚未瀏覽器實測**（Claude 無登入 session，TASKS line 68）。
- **Content Studio / SEO-GEO 深化**：RankMath KB 554-file 深研 → 全覆蓋規則 + Setup 向導 + Schema + SEO check panel + AI auto-fix；GEO citation mechanics 進 SYSTEM_PROMPT（answer capsule/sub-query/expert quote/FAQPage schema）；trending 多源（Google News + Reddit RSS + PTT scraping，Google Trends RSS 被 VPS IP 封→Perplexity Sonar 替代）；generate 接 Perplexity 真實外連來源；Media Hub + Structure section 擴充；移除 AI 假內連（用戶裝 Internal Link Juicer）。
- **Postiz 自架社群發佈上線 EU**（Task 1+2）：Bluesky connected（app password，pivot from Reddit，後者 dev-app 建立被擋）；端到端發佈驗證 QUEUE→PUBLISHED→feed live。**AGPL 紅線：禁 fork/改原始碼，預設 draft+人審**。計畫 SSOT=POSTIZ_SOCIAL_PUBLISHING_PLAN.md（7 task，TASKS line 57 進行中）。
- **app.aware-wave Stage 1 接通入口完成（06-14）**：trigger-build 403 修復（dual-path auth `x-ops-sync-key`，8b1d6d86）+ dispatcher kick fallback（TRIGGER_ACCESS_TOKEN）+ dispatch-action-run-schedule 每分鐘 cron。下一步 Stage 2 Fluent Form→intake 橋接。
- **其他**：WP auth 遷 Application Password + rate limit 修；admin-auth middleware 不再 bounce 已登入用戶；Printful Mockup Generator pipeline（design→R2→product photo）；可編輯 calendar（reschedule/publish-now/delete）；My Designs gallery UI redesign；tarot FLUX printQuality 422 fix。

## 2026-06-15 — workflows security fix + Content Tools AI Models guide live
- **weekly workflows security audit 修復**：esbuild advisory 由 `lobster-factory/packages/workflows` override `^0.28.0` 升到 `^0.28.1`，lockfile refreshed；`npm audit --audit-level=high`、`npm audit --audit-level=moderate`、`npm test` 75/75、`npm run audit:workflows-security` 全 PASS；GitHub issue #15 已存在追蹤。
- **AI Models 指南上線**：原本使用者想放 Tarot，後更正要放 Content Tools，因生圖工具會被多處共用。新 route `/tools/ai-models` 已加入 sidebar（SEO Content 下、Tarot 上），正式站 deploy commit `5b8c97ac59e5da7d194db7256c1db27f8a503552`。
- **頁面內容**：三個相鄰比較區：文字生成工具（OpenAI/Claude/Gemini/Perplexity/Grok）、圖片生成模型（15 個 app 現有模型，成本改成每張，不是 78 張）、Vibe Coding 工具（Codex/Claude Code/Gemini/Perplexity/Grok）。表格呈現優劣、風格、速度、成本、prompt/image input、比例與來源連結。
- **部署證據**：local `npm run typecheck` + `npm run build` PASS；SG `sg-deploy.sh next-admin` PASS；prod gates `tsc` PASS、vitest 24 files / 316 tests PASS、container healthy after 7s、smoke `/login` + `/api/ops/summary` + nginx/wordpress + node-api OK。`/tools/ai-models` 未登入時 307 到 login（符合 auth middleware）。

## 2026-06-26 AO-CLOSE memory — Codex closeout

- User asked to handle uncommitted work, push, then run AO-CLOSE. The initial dirty tree was generated AO status output only: latest auto-reboot, backup-health, cf-security, routine-freshness, smoke JSON, plus `backup-health-20260626-091634.md`. It was committed and pushed as `7a2c506c chore(status): refresh AO routine reports`.
- AO-CLOSE needed a repo-local `XDG_CONFIG_HOME` to avoid the unreadable Windows global git ignore warning from turning into a PowerShell NativeCommandError. The fetch step also needed the approved outside-sandbox run because `.git/FETCH_HEAD` was permission-denied in the sandbox.
- AO-CLOSE verify chain reached strict completeness with build gates PASS, health `100% (372/372)`, system guard PASS, integrated status refreshed, and stale `ALERT_REQUIRED.txt` removed. The remaining action is the generated AO-CLOSE sync commit/push plus final archive report overwrite.









## 2026-07-02 治理系統 v2 — hook runner 架構遷移（里程碑）

- 全面稽核證據化四風險後，操作者裁決方案 D（乾淨架構非補丁）：23 個手刻 hook + 5 inline → 單一 `runner.js` + `rules.manifest.json`（接線唯一正本）+ 26 純規則模組。fail-open/隔離/SID 統一為結構保證；測試 0 → 54 案例（`bash scripts/test-hooks.sh`）。
- 關鍵發現與修復：遠端 session 原本**零機械閘**（`scripts/wire-remote-hooks.sh` 關閉真空）；`.claude/settings.json` 絕不可 git-track（工作站 junction 相撞）；legacy inline blockers 讀錯 stdin 欄位從未生效；commit-quality 自指涉死鎖地雷；11 個垃圾檔（16d95c8 auto-checkpoint 入庫）清除 + `checkpoint-junk-guard.mjs`。
- WORKLOG 改為月度輪替（當月+上月留主檔，餘 → `WORKLOG-archive/YYYY-MM.md`），15,708→8,356 行，ao-close 自動執行。
- AGENTS.md 新增 §規則優先序（預授權 > 風險分級 > R0 逐項批准）與 §已知信任邊界（evidence 驗格式不驗真、機械閘 fail-open）。
- 完整記錄：WORKLOG `## 2026-07-02`；分支 `claude/system-feedback-t7zo8r`（M1 03d624b → M4c 4ce5e4a）。

- **2026-08-15 (AO-CLOSE 筆電 session, 窗口 08-12 AO-RESUME → 08-15)** — 10 個實質 commit，全部圍繞「反覆復發的事故」與「沉默的監控」兩個主題。
  **① EU 全機卡死根治**：症狀是「SG 服務大量 timeout」，但 SG 完全健康。鑑別關鍵是 EU→SG ICMP 0% 遺失但 TCP:80 掛 11/20、同時筆電→SG 20/20 全通 → 問題在 EU 出向。根因 `trigger-clickhouse` 吃滿 1 CPU 限額（101.79%），EU load 4.9/swap 3082MB，行程被 CPU 飢餓卡住。它在忙的是自己的遙測：system 16.89 GiB/6.4 億列 vs 應用資料 trigger_dev 僅 49 MiB/62 萬列（**345 倍**），trace_log 每小時新增 124 萬列。
  **② 為何四個月修四次又復發**（查 git log --follow override.xml）：04-20 cap 600→800MB／04-29 cap→1.6GB+首次 TTL／07-05 清 20GB 日誌+limit→3072m／08-15 才第一次關掉產生源。**不是 code 衝突或髒 code**（只有一個設定檔），是同一個病治標四次；記憶體上限推高 4 倍。04-29 的 commit 註解就已指名 trace_log —— 診斷三個半月前就對了，行動卻是調高上限。天花板墊高使瓶頸從 RAM 移到 CPU，症狀每次看起來都像新的。**TTL 治「留多久」不治「產生多快」**。
  **③ 監控沉默根治**：告警一直正確偵測（cgroup_ram_in_use 在 clickhouse 上 08-10→08-15 觸發 **483 次**、峰值 93.5%），但 `notification.to = silent`（netdata stock 模板預設）。另 EU 根本沒有通知出口（custom_sender 是原廠空殼、DEFAULT_RECIPIENT_CUSTOM 空）。兩個獨立破口都修，並發現 EU→ops-inbox 被 CF Bot Fight Mode 擋 403（與 08-12 Kuma 假 DOWN 同 class）→ 腳本加 OPS_INBOX_RESOLVE 走 curl --resolve。
  **④ Origin lockdown（差點自我封鎖）**：腳本無允許清單，而 9 個 Kuma monitor + EU netdata 剛改成直打 SG origin。允許清單由 nginx log **152 個非 CF 來源全數分類**得出，最易漏的是 docker 閘道 1,987 次（SG 自己的內部健檢）。套用後四項驗證 + 鎖定後監控存活驗證。
  **⑤ 其餘**：`Resolve-Path` 缺 `-LiteralPath` 170 處/96 檔全清（先分類確認 0 處故意用萬用字元才批改；根因是 `[slug]`/`(shell)` 路由資料夾，曾使 doc-sync 對所有呼叫者中止）；workflows 部署到 EU prod（35 漏洞修正才生效）；MCP 路由漂移歸零（一半是 glob 誤判、一半是真缺 3 個高風險 MCP）；新增 `check-clickhouse-health.ps1` 接入 AO-RESUME 監測 bug class（system/app 比值）防第五次復發。
  **⑥ Soulful**：帳單截圖推翻「$80/年」假設 —— 三筆獨立訂閱、自動續約全關、hosting **2026-11-12 到期**且操作者決定不續約 → 硬死線。信箱存續以官方文件三項證據查證（不受影響、不需開 ticket）。已備妥 DNS 13 筆對照表（AAAA 刻意不搬＝IPv6 永久解）+ DB 288 表/uploads 11,001 檔備份移出 Hostinger 三地雜湊一致。並把 2026-06-13 的 716 行 brief 作廢前提接回現況，消除三套真相。
  **⑦ 離職單機化**：公司桌機退場，治理文件改為單機（跨機機制保留休眠）；桌機憑證依操作者三項確認結案。
  **未解**：買不買 dedicated 機（擋 Soulful 去處/客服 U6/EU 搬機/退雲端）；SG load 3.2 於 2 核機器、由 dockerd+containerd 而非任何容器造成（session 開始即存在，我當時漏掉，無使用者影響，未查）。

- **2026-08-24（AO-CLOSE，窗口 08-15 AO-CLOSE → 08-24，199 commits，跨 9 天多 session）**

  **08-16～08-23（其他 session，git log 摘要，非本次對話直接經手）**：Soulful 搬站續進度——CF zone 建立+nameserver 切換驗證 14 項全 PASS、信箱實測 10/10 揪出既存寄不出信 bug 並修好（外掛自帶通知走同一條壞通道，改站外監控）、還原演練 PASS+補齊程式碼原本完全沒備份的缺口、搬站執行手冊補完。Dedicated 主機採購：規格從 64GB 上修到 128GB ECC（原機型表作廢），KS-6 對照官方文件交叉查證補兩項硬化步驟，**08-18 定案立刻買月租不觀望到 8/31**（機器本身截至 08-24 仍未買，唯一阻塞）。跨模型 oracle 系統首建（`codex-oracle.ps1` + AGENTS 讀寫分界分工規則），首戰即抓到 smoke 偵測器啞掉卻報 PASS 的 bug。ClickHouse TTL/orphan table 監控修復（critic 驗證）。安全：2026-08-15 transcript 憑證外洩記錄三項待輪換、transcript 保留期 30→365 天修正（已致 9 個 pinned session 內容永久消失，屬已知代價非本次造成）。AGENTS.md 補 session 衛生四條（context 每輪重送的槓桿）。**這 8 天期間沒有任何 AO-CLOSE**，`memory/daily/2026-08-16.md`～`2026-08-23.md` 全部停在 `(fill in at AO-CLOSE)` 骨架，本次僅回填今日檔案，不逐一回填（見下方剩餘風險）。

  **08-24（本次對話，全程參與）—— 圍繞「同一個 ORACLE gate 洞被同一顆 Codex 連續打回 8 輪」與後續「AGENTS.md 治理整理」兩個主軸**：

  **① ORACLE gate deletion 追蹤機制，8 輪修正（`verify-closeout-completeness.ps1` §ORACLE gate + `codex-oracle.ps1`）**：round1 deletion 完全繞過 gate（`$unverifiable` 收集後從未讀取）；round2 修過頭變成永久卡死（deletion 因無 mtime 無法判定，硬擋等於強制每次都要 waiver）；round3 改用 `.git/index` mtime 當 staging 時間代理（先實測確認 `git diff --cached` 不動 index、只有 `git add/rm` 才動）；round4 發現時序對得上不等於內容有被審過，改抓 `deletions-reviewed` 內容確認；round5 unicode/空格檔名因 git quoting 誤判，改用 `core.quotepath=false`（順手發現這個既有 bug 讓 REALTEST/ORACLE 三個閘對特殊字元檔名完全沒生效，影響本 repo 至少 632 個真實檔案）；round6 deletions-reviewed 只綁路徑，同日「刪除→復原→改內容→再刪除」會被舊記錄誤證，改綁 `path@blob-hash`；round7 舊格式 bare-path fallback 重新打開 round6 剛關的洞，收斂成「連我們自己都算不出 hash 才退回純路徑」；round8 補正 round7 引用了一份只存在 scratch 測試目錄、從未進 repo 的 artifact 路徑（過程中發現 Codex CLI 版本落後 26 個小版號導致卡死，`npm install -g @openai/codex` 更新後恢復正常）。全程累計 28+ 組真實整合情境測試（非模擬）。
  **反思（使用者當場點破）**：8 輪換來 3 小時，本質是同一個設計問題（「怎麼證明這次刪除真的被審過」）被拆成 8 個獨立小修，沒有在 round 3 左右停下做不變量分析。已把「同一 reviewer 連續回報 2 次 → 第 3 次前必須先做不變量分析，禁止用『範圍小』當理由跳過」寫進 AGENTS.md 明文規則，直接堵這個漏洞——round 8 自己就是用「範圍小」搪塞過去的具體反例。同時確認 critic subagent（該 session 連續 6 次 529）與 Codex-the-oracle 是兩條不同資源，前者掛掉不代表協作機制本身失敗，已把「critic 連續失敗 2 次 → 換用 `codex-oracle.ps1`」的 fallback 寫進 AGENTS.md 與 `.claude/commands/review.md`。

  **② AGENTS.md 治理整理**：原本想把 4 張 trigger table 拆去獨立懶載入檔案省 token，讀到 `reports/audit/agents-slimming-proposal-2026-07-02.md` 才發現這個方案 7 週前已被明確否決（AGENTS.md 每 session 自動載入、獨立檔案不會，外移=規則對 AI 隱形=蒸發風險比 token 成本更嚴重）——改用同一套已核准的 A/B/C/D 方法論做延續性整理（去重 4 對新增的重複列、修正過期的 ORACLE gate 描述、補 R1-R3 編號說明、修掉 `/review` 只能用 critic 無 fallback 的矛盾）。順手發現 `docs/operations/TOOL_TRIGGER_MAP.md`（AGENTS.md 自稱的「完整路由表」）已 stale 7 週，補齊並把它加進 `CHANGE_IMPACT_MATRIX.md` 的 impacted 清單防止再度 stale。

  **③ 使用者追問「這樣就夠了嗎」→ 通用漂移偵測腳本**：發現剛補的那條只是提醒等級（doc-sync 印出來、沒人看就沒用），要求「確確實實處理好、不得用補丁方式」。新增 `scripts/check-change-impact-matrix-drift.ps1`：解析 `CHANGE_IMPACT_MATRIX.md` 全部 ~85 條關係，逐對比對 mtime 漂移，>90/180 天 WARN/FAIL，parser 只認 backtick 包住的字串當候選路徑（矩陣資料混了全形逗號/括號中文註解/巢狀 backtick/樣板參照/Windows 絕對路徑佔位符等 8 種格式變異，這個原則讓它們自然被忽略）。接進 `ao-resume.ps1` 月度檢查第 5 項。真實執行抓到並修好一個路徑解析漏洞（`CLAUDE.md` 在 repo 根不在 agency-os 底下，改成雙 base fallback）。
  **後續兩輪 stop-hook 打回**：自動 review 機制本身回傳無效 JSON（機制故障非發現問題）→ 補跑真實 `codex-oracle.ps1 review`，抓到 2 個真 finding（mirror 目錄未被檢查、「01-04 guides」數字範圍縮寫解不開）；第一版修法（教程式碼用「目錄+同名檔案」推測隱含關係）又被打回「undeclared drift pairs」——自己重新推演找到具體反例（矩陣資料裡一個散文用詞被誤 backtick 包住，推測邏輯會生出完全不相關的假配對），改成**撤掉推測邏輯，回頭把矩陣資料本身寫明確**（跟修「01-04 guides」同一個原則：資料不夠明確就修資料，不要教程式碼猜）。

  **剩餘未解**：dedicated 機仍未購買（同 08-15 未解項延續）；`memory/daily/2026-08-16.md`～`2026-08-23.md` 8 個 stub 未回填（AO-CLOSE 指示只補今日檔案，這是已知、非本次引入的缺口）；`scripts/ao-resume.ps1` 有 17 個既有的、跟今天工作無關的未受保護 git 輸出擷取點，已用 spawn_task 記錄成獨立任務（task_b82a2211）未動手修。

















# AO-CLOSE 2026-09-30 session summary

- Session window opened by marker `2026-06-12T05:27:33.6508893Z`; repository history in this window includes work from multiple sessions, so only current-session evidence is attributed here.
- Current Codex work: verified the Cognitive OS research-line closure status; delivered report API lifecycle and Markdown export in commit `53dc77535` (pushed); prepared an isolated, uncommitted cross-project source-search slice with unit/golden verification; preserved unrelated shared-worktree changes.
- Current blockers remain operator/prod dependent: Cognitive OS P2-09 paid DOD gates, P1 WC-15 production verification, PI-b05/P-ARF-data, and remaining P4 exports/approval/recipe-binding work. No production mutation or Airtable import was performed.
- AO-CLOSE policy: no reset, clean, broad staging, or deletion; foreign dirty/staged work remains preserved for the owning session.






