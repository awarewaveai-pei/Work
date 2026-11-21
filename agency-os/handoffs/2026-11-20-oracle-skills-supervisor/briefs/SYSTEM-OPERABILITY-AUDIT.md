# 系統能否從頁面完成「開一個客戶 WordPress 站並接進來」——盤點（2026-11-21，唯讀；以程式為準）

操作者要用 oracle.aware-wave.com 當練習。縮寫：`NA/`＝`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`、`INFRA/`＝`lobster-factory/infra/hetzner-phase1-core/`、`WF/`＝`lobster-factory/packages/workflows/src/`。

**結論**：頁面只能在 ks-aw-01 建出 `https://aware-wave.com/staging/<slug>/` 測試站（`NA/app/api/internal/hosting/provision-staging/route.ts:33-34,433-434`）。架在獨立網域、DNS／nginx／SSL、正式站容器、MainWP、備份、wp-bridge 連線、發金鑰，頁面都做不到。

| 步驟 | 頁面 | 頁面可完成 | 實際行為 | 缺口（證據） |
|---|---|---|---|---|
| 1 客戶紀錄 | `/onboard`、`/ops/onboarding` | 部分 | 真寫 DB | SSH、wp_path、waves、MainWP 無編輯頁（`NA/app/api/ops/tenants/[id]/config/route.ts:12` 只收 status／locale／timezone）；同 slug 重跑會覆蓋 `client_config`（`NA/app/api/ops/organizations/route.ts:42-53`）；tenant 資料夾與 `ENVIRONMENT_REGISTRY.md` 全手動（`agency-os/tenants/NEW_TENANT_ONBOARDING_SOP.md:11-36`）；精靈文案過期（`OnboardWizard.tsx:940`、`onboard/page.tsx:16` 寫 4 步實為 5 步） |
| 2a 用 ks-aw-01 | 固定 | 是 | 真的 | provider 選單的值沒被使用（`NA/app/api/build/runs/route.ts:324-331`） |
| 2b 租新主機 | `/build` 機層面板 | 否 | 永遠 idle | `LOBSTER_SERVER_ADAPTER`、`LOBSTER_SERVER_PROVISION_ENABLED` 沒經 compose 進容器；route 派的 Trigger 任務 `provision-machine` 不存在（`NA/app/api/provision/route.ts:85-96,120,162`）；只有 Hetzner |
| 3 DNS／SSL | 無 | 否 | — | next-admin 無 DNS／vhost／憑證程式；網域欄位必填但建站端點不收（`provision-staging/route.ts:391`）；只寫進 `sites.primary_domain`、`client_config.site_url` |
| 4 安裝 WP | `/build`「Run local build」、`/ops/onboarding`「觸發建站」 | 部分（只到 staging 子目錄） | `local_direct` 真的 SSH | 語系沒設（`:391,461`）；管理員固定 `admin`；從頁面新建站的正式紀錄未找到（2026-09-21 曾 handshake 逾時，`agency-os/WORKLOG.md:19541-19542`） |
| 5 外掛 | `/onboard` Step 2 | 部分（只能選包） | 真裝 WordPress.org 免費外掛 | wp-bridge 不會自動裝（`NA/lib/wp-plugin-stack-catalog.ts:69-70,295`）；付費 zip 手動；自訂外掛只能改 catalog 再部署；發佈腳本只認 bridge、store（`scripts/rollout-wp-bridge.ps1:45-48`）且找不到 staging 子目錄站（`:12-14`）；佈景 slug `kadence` 被放進外掛清單（`catalog.ts:72`） |
| 6 MainWP／備份／健康 | `/build` 勾選框、`/ops/backup`（唯讀）、客戶頁 | 否 | `local_direct` 不接 MainWP、Uptime、Sentry | 勾選無效（`build/runs/route.ts:324-331`、`provision-staging/route.ts:308-309`）；客戶頁「佈建步驟」五項寫死打勾（`ClientHubTabs.tsx:642-656`）；`agency-os/TASKS.md:434-440` 仍開 |
| 7 wp-bridge 連線 | 無 | 否 | — | app 端只靠 `WPBRIDGE_SITE_<n>_*` 環境變數，compose 只傳到 SITE_1（`INFRA/docker-compose.yml:468-474`）；無註冊或測試頁 |
| 8 日常代操 | 客戶頁「維護」、`/ops/schedules`、`/tools/content` | 部分 | 更新按鈕需 DB 內有 SSH 欄位＋`SSH_KEY_<NAME>` | 欄位頁面填不了；實際更新靠 PowerShell 腳本 |
| 9 發金鑰／嵌入服務 | `/ops/integrations`（只登記） | 否 | — | 無發金鑰頁 |
| 10 一鍵與狀態 | `/ops/onboarding`、`/onboard`、`/build` 三頁、兩條不同流程 | 否 | — | 無逐步狀態頁；Build Console 的階段清單是計畫非實況（`WF/trigger/create-wp-site.ts:375-376` smoke、handoff 仍 TODO） |

**oracle 案例特有**：網域已被 `oracle-web` 佔用（`INFRA/nginx/default.conf:401-433`，`:415` 帶 `X-Frame-Options SAMEORIGIN`——嵌入方案要處理；主機 nginx `INFRA/nginx/system-sites/sg-stack.aware-wave.com.conf:16-17,25-26`；煙霧測試 `INFRA/scripts/sg-deploy.sh:786`）。建站流程不查重：照現況跑會把 `site_url` 記成 `https://oracle.aware-wave.com`，客戶頁健康檢查打到現有引擎回 200，看起來像 WP 站健康（`NA/app/(shell)/ops/clients/[slug]/page.tsx:73`）。

**總計畫與程式不符**（`agency-os/docs/operations/APP_AWARE_WAVE_PROVISIONING_MASTER_PLAN.md`）：`:145` 說 route 呼叫 `provisionClient()`，實際派不存在的任務；`:92` 說 Uptime／Sentry 部分接，`local_direct` 已不走；`:84-87` 引用的 2026-07-04 證據在 WORKLOG 找不到；`:4` 與 `:105-150` 自相矛盾；`:148` 要設的環境變數進不了容器。`lobster-factory/docs/hosting/EMBED_PROVISION_INTO_APP.md:1` 說 Phase 5 未做，route 已存在但與其 §3 不同。

**與 `WP-front-door-plan.md` 的關係**：該計畫 G1–G8 已涵蓋 4、5、6 的部分缺口；本檔新增的缺口（1 的設定編輯頁、3、7、9、10、2b）尚無卡片。
