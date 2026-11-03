# P6 計畫：video-workbench 上線 video.aware-wave.com（ks-aw-01）

HEAD 804594c93。只讀規劃；無 SSH／無改檔。回報繁中；brief 照抄 AGENTS §1「不做無效益測試」一句。
縮寫：PC=`lobster-factory/infra/hetzner-phase1-core`，VW=`PC/apps/video-workbench`，NA=`PC/apps/next-admin`，MIG=`lobster-factory/packages/db/migrations`。

## 0. 已查證事實（file:line）

| # | 事實 | 證據 |
|---|---|---|
| F1 | **video.aware-wave.com 今天已上線，是 next-admin 的 video 門**（不是空網域）。products 列 key `video`、subdomain `video`、door next-admin page `/video`、api `/api/video`,`/api/tools/script-forge`、features video.script/image/motion/tts/transcribe、status coming_soon | `NA/lib/portal/products.ts:49-53`；頁 `NA/app/video/{page.tsx,layout.tsx,works/}` |
| F2 | 路由鏈：host nginx TLS → `127.0.0.1:8083`（lobster-nginx 容器）→ door 區塊 → `next-admin:3000` | `PC/nginx/system-sites/sg-stack.aware-wave.com.conf:23-47`（server_name 含 video :27）；`PC/nginx/default.conf:437-479`（door server，server_name :439，擋 /api/internal 等 :463，proxy :466-478） |
| F3 | 外部服務 upstream 樣板（resolve＋keepalive，容器停 = 502 而非 nginx -t 失敗）；nginx:stable 1.30.4 | `PC/nginx/default.conf:79-94`（cognitive_api/web），cognitive server 區塊 `:484-` |
| F4 | 憑證 = `*.aware-wave.com` 萬用（DNS-01） | `PC/nginx/system-sites/aware-wave-app-api-subdomains.conf:16-18`、sg-stack `:30-31` |
| F5 | 登入 cookie 不設 Domain＝每個網址各自登入；跨門用一次性碼，不共用 cookie | `NA/lib/supabase/auth-cookie-options.ts:4`；ADR 018 `agency-os/docs/architecture/decisions/018-product-doors-and-buyout-delivery.md:12,46,71`；`NA/middleware.ts:50-51` |
| F6 | middleware 驗 session → 注入 `x-ops-claims-role/x-ops-user-kind/x-ops-org-id/x-ops-user-id`，先剝客戶端偽造 header；session 快取 fast path | `NA/middleware.ts:10-24,136-140,399-416,424-431`；matcher 排除 login/api/auth/api/internal `:476` |
| F7 | `can(subject, featureKey, actor)` | `NA/lib/entitlements/can.ts:311-324`（shadow/enforce `:321`） |
| F8 | 獨立產品取許可：`POST /api/internal/entitlements/permit/<product>`，Bearer = `ISSUER_TOKENS[product]`；只簽該產品 feature、actor 須 `<product>:<id>`、org 必須是根（計費帳戶） | route `NA/app/api/internal/entitlements/permit/[product]/route.ts:9-22`；`NA/lib/entitlements/issuer.ts:9`（目前只有 cognitive）、`:18-26`；驗章 `NA/lib/entitlements/permit.ts:74`（只 import node:crypto `:1`）；ADR 017 §3/§4 `…/017-entitlements-and-self-hosted-modules.md:82,100` |
| F9 | `media_assets`：0007:40-50 建表（organization_id NOT NULL、workspace_id、storage_key NOT NULL、metadata）；0038:29-41 加 storage_backend/asset_domain/object_key/object_url/mime_type/byte_size/`checksum_sha256`(:37)/version/is_current/created_by；0038:46 workspace_id **drop not null**；asset_domain CHECK 最新 = 0151:22-27（ai_generated/wp_product/wp_blog/real_footage/mockup_*）；0138:23-26 media_project_id；比例限制在 `media_production_projects.formats` 0138:21 | MIG 各檔 |
| F10 | 最新 migration = **0158**（`0158_begin_send_test_window.sql`）；down 兩處（`*.down.sql` 與 `packages/db/scripts/*_down.sql`）；套用 `scripts/apply-db-migration.mjs`；sg-deploy migration 閘 | `PC/scripts/sg-deploy.sh:185-200`、`PC/scripts/check-migrations-applied.sh:6-8,41` |
| F11 | 已有 server-side 寫 media_assets 樣板（R2 put＋insert＋checksum＋rights metadata） | `NA/app/api/video/upload-asset/route.ts:102-156`（insert :141-151）；R2 `NA/lib/storage/r2.ts`（r2PutObject :164、env R2_ACCOUNT_ID/R2_API_TOKEN/R2_VIDEO_BUCKET/R2_VIDEO_PUBLIC_BASE） |
| F12 | 投遞鏈全在 next-admin 門 API（video 門 api 前綴 `/api/video` 已涵蓋）：技術 QA `NA/lib/content/video/qa-persistence.ts:16 persistAutomaticTechnicalQa`（呼叫點 `finalize.ts:116`）；rights QA `editorial-rights-persist.ts`；release `NA/app/api/video/release/route.ts:12-22`（canApproveMedia :13、assertOrgAccess :20）；社群草稿 `NA/app/api/video/social-drafts/route.ts:14-27` → `saveVideoSocialDrafts` `social-drafts.ts:23`；WP `NA/app/api/video/embed-to-wp/route.ts:11-26` → `embed-in-post.ts:30`；Postiz `NA/lib/content/postiz.ts:195 uploadVideo`、`:237 createSocialPost`；契約 `delivery-contract.ts:3-14`；比例 `platform-ratio.ts:5-18,22-29` | — |
| F13 | 成本 `NA/lib/ai/cost-model.ts:184`（bg-remove 0.011）；VW 手抄一份 `VW/backend/generation-policy.cjs:5-7` | — |
| F14 | sg-deploy：app 來源 `app_git_source_root` `:32-37`、容器名 `lobster-<APP>` `:42-47`、RESTORABLE 清單 `:121-126`、DEPLOY_HOLD `:169-183`、Node 型 gate 樣板（renderer）`:267-279`、app 須在 staging compose `:283-286`、rsync `--delete` `:288-310`、build `:350-355`、up `:357-371`、健康等待 `:426-445`、`_smoke_check`（--resolve 樣板）`:467-492`、rollback `:387-423`；**sg-deploy 本身不發通知**，只有 cron 包裝 `PC/scripts/auto-deploy-next-admin.sh:243-248` 呼叫 `PC/scripts/notify.sh` | — |
| F15 | rollback 映像表 `PC/scripts/rollback-phase1.sh:36-42`；runbook `agency-os/docs/operations/DEPLOY_ROLLBACK_RUNBOOK.md`；七項清單 `agency-os/docs/operations/AGENTS_APPENDIX.md:241-253` | — |
| F16 | compose 服務樣板 = renderer `PC/docker-compose.yml:617-659`（127.0.0.1 port、healthcheck node fetch、cap_drop、limits、pids）；remotion/video-service 走**自己的** compose（`apps/remotion-service/docker-compose.remotion.yml:21-62`，網路 `lobster-video-net`＋`lobster-net` external）——sg-deploy 不能部署那種（:281-286） | — |
| F17 | VW 讀 env／資料：`VW/server.cjs:29`（`SEEDSTAR_DATA_DIR`，預設 `.data`）、`:179` **寫死 listen 127.0.0.1**；`VW/backend/api.cjs:14-17`（generated/）、`:38`（jobs.json）、`:63`（**state.json 全域單一份**）、`:342` tmp-*；`media-store.cjs:44`（media/）、`compositor-render.cjs:65`、`blender-jobs.cjs:21`；env 用量：OPENAI_API_KEY、REPLICATE_API_TOKEN、MESHY_API_KEY、BLENDER_PATH、FFPROBE_PATH、AWAREWAVE_APP_DIR、REMOTION_SERVICE_URL、REMOTION_AUTH_TOKEN、MEDIA_RENDER_AUTH_TOKEN、BG_REMOVER_VERSION、SEEDSTAR_*、VW_COMPOSITOR_*、VW_MESHY_POLL_MS、PORT | — |
| F18 | Host/Origin 檢查（計畫寫 :442-446，現已位移）= `VW/backend/api.cjs:689-693`（只准 localhost/127.0.0.1、origin 必須 http://） | — |
| F19 | `/media/*`、`/generated/*` 今天**無驗證**直接送檔 | `VW/server.cjs:63-97` |
| F20 | VW 匯入 next-admin 原始檔：`appearance.cjs:3-9`（`awarewave-source.json` appDir `../next-admin`，**已支援 `bundledAppDir` 備援 :7-8**）、`remotion.cjs:40`（renderer-auth.ts）、`timeline-export.cjs:2` | — |
| F21 | 前端已有 HttpAdapter（`credentials: same-origin`）、config 目前 `mode:"local"` | `VW/shared/adapters.js:97-133`、`VW/shared/runtime.js:6-11`、`VW/config.js:1-5` |
| F22 | 員工選組織 API 已存在（client 只看自己） | `NA/app/api/video/workbench/bootstrap/route.ts:10-22`（test 用 host video.aware-wave.com） |
| F23 | 本機二進位 Windows-only：`vendor/blender/sources.json`（windows-x64 zip）、`vendor-ffprobe.cjs:13`/`vendor-blender.cjs:16` 非 win32 → 走 PATH 環境變數；`runtime/`(908M) `.data/` `node_modules/` gitignored；`engines/effectcraft/web/` 下載型 | `VW/.gitignore` |
| F24 | `seedstar` 字樣 109 檔／1837 處；package name `seedstar-app` | `VW/package.json` |
| F25 | 19 支測試純 Node、42 支用 playwright（UI） | `VW/tests/*.cjs` |
| F26 | 寫入式掛載必須登記 `PC/scripts/backup-inventory.json`（`backup-coverage-check.py` 讀） | `backup-inventory.json` `_doc` |

## 1. 決策（已選＋代價；不擋路，執行前操作者可推翻）

- **D1 網域分流，不換門型**：video.aware-wave.com 保留 next-admin 門（登入、`/api/video/*`、`/_next`），其餘路徑改送 VW。理由：F5 每門各自登入→VW 不必自建登入／cookie；F12 投遞鏈 API 同源可直接用，零複製。代價：next-admin 的 `/video` 門首頁與 `/works` 在此網域被 VW 遮住（status coming_soon，無客戶；員工仍有 app.aware-wave.com/tools/video）。替代（門改 external）會讓 `/api/video` 在此網域失效（doors.ts doorForHost），否決。
- **D2 身分 = nginx `auth_request`** → next-admin 新 route `GET /api/video/workbench/session` 回 204＋`X-VW-User-Id/Org-Id/Billing-Org-Id/User-Kind/Role`；組織選擇由 next-admin `assertOrgAccess` 決定（client 帶 `X-VW-Org`，staff 可選、client 鎖自己）。VW **不發布 host port**（只在 lobster-net），只信 nginx 設定的 header；nginx 先把客戶端同名 header 覆寫為空。
- **D3 VW 不持 Supabase 金鑰、不持 R2 金鑰**：DB／R2 寫入走 next-admin 新內部 route（Bearer `VW_INTERNAL_TOKEN`；`/api/internal/*` 已被 middleware matcher 排除且 door nginx 擋外部 F2/F6）。代價：大檔經 next-admin 轉一手（上限 env `VW_INGEST_MAX_BYTES`，預設 500 MB，串流不整檔進記憶體）。
- **D4 多租戶 = 依組織分目錄**：`/data/orgs/<orgId>/{state.json,jobs.json,media,generated,compositor,blender}`；createApi 每組織一份（Map 快取）。專案 state 留檔案（計畫 v4 :49 只要求資產＋任務進 DB）。
- **D5 許可**：VW 付費動作前向 F8 issuer 取 permit（`ENTITLEMENT_ISSUER_TOKEN_VIDEO`），本地 `verifyPermit` 驗；actor `video:<userId>`，tenant = Billing-Org-Id（issuer 拒子組織 F8）。
- **D6 比例 1:1／4:3 不在 P6 上線範圍**：上線時投遞只走 16x9/9x16/4x5；VW 對其他比例的投遞按鈕顯示「此比例尚不能投遞」。放寬另卡 D-R。

## 2. 卡片（執行順序）

### A. 本機可建可測（Low/Medium；不碰 prod）

**L0 內部名稱 SeedStar → video-workbench**（Medium，機械；派 `refactor-specialist`，建議模型 Sonnet）
- 檔：VW 全部（F24）。`package.json` name→`video-workbench`；env `SEEDSTAR_*`→`VW_*`（`server.cjs:29`、`generation-policy.cjs:8`、api.cjs JOB_HISTORY）；路由 `/api/seedstar`→`/api/vw`（`api.cjs:686-687`、`config.js:3`）；全域 `window.SeedStar*`/`SEEDSTAR_CONFIG`/`data-seedstar-root`→`VideoWorkbench*`/`VW_CONFIG`/`data-vw-root`；`start.cmd` 同步。**保留**：`.gitignore` 與 assets 對第三方站 seedstar.ai 的出處註記。
- 先做的理由：之後每張卡都改這些檔，先改名避免二次碰。
- 驗收：`grep -rio seedstar VW --exclude-dir={node_modules,vendor,engines,runtime,.data} | grep -v "seedstar\.ai"` = 0；`node tests/backend.cjs && node tests/test-isolation.cjs` 綠；UI 抽 `node tests/interactions.cjs` 綠。
- rollback：`git revert`。

**L1 伺服器可部署化**（Medium）
- `server.cjs:179`：`listen(PORT, process.env.VW_HOST || "127.0.0.1")`（本機預設不變，容器設 0.0.0.0）。
- 新 `GET /healthz`（不需身分，回 `{ok:true,version}`，不碰檔案系統以外資源）；容器 healthcheck 用。
- `api.cjs:689-693` 改：允許 host = `VW_ALLOWED_HOSTS`（逗號清單，預設 `localhost:*,127.0.0.1:*`）；origin 比對 `VW_PUBLIC_ORIGIN`（容器 `https://video.aware-wave.com`），本機維持 `http://`+host。
- 身分：`VW_TRUST_PROXY_IDENTITY=1` 時每個 `/api/vw/*`、`/media/*`、`/generated/*` 必須有 `X-VW-User-Id`＋`X-VW-Org-Id`，否則 401；本機模式（未設）用固定 `local` 組織。
- D4 分目錄：`createApi` 改 `forOrg(orgId)`（orgId 驗 UUID 或 `local`），`server.cjs:63-97` 的 `/media`、`/generated` 改讀該組織目錄（跨組織 = 404）。舊 `.data/*` 首次啟動搬到 `.data/orgs/local/`（保留原檔＋寫 `migrated-from.json`）。
- 資料目錄 env 改名 `VW_DATA_DIR`（L0 後）。
- 驗收（新測試只寫守衛突變：跨組織讀檔、缺身分 header）：`node tests/tenancy.cjs`：org A 上傳 → org B GET `/media/<sha>/original.mp4` = 404；無 header（trust 模式）= 401；突變拔掉 org 檢查 → 紅；還原 → 綠。`node tests/backend.cjs` 綠。
- rollback：revert。

**L2 next-admin 內部介面＋session 端點＋許可**（Medium；auth 相關 → critic Deep）
- `NA/app/api/video/workbench/session/route.ts`（新）：讀 middleware 注入的 x-ops-*（F6），`X-VW-Org` 有值 → `assertOrgAccess`（同 `release/route.ts:20`）；client 無 org → 用自己 org；回 204＋D2 headers；Billing-Org = `resolveSubject` 根（`NA/lib/entitlements/subject.ts:58`）。未登入由 middleware 本身轉 401/302。
- `NA/lib/entitlements/issuer.ts:9` 加 `video: "ENTITLEMENT_ISSUER_TOKEN_VIDEO"`。
- `NA/app/api/internal/video/workbench/assets/route.ts`（新，Bearer `VW_INTERNAL_TOKEN`，timingSafeEqual 同 permit route `:14`）：串流收檔 → `r2PutObject`（video bucket，key `video/workbench/<org>/<sha256>.<ext>`）→ insert `media_assets`（organization_id、storage_backend r2、asset_domain 依 origin：ai_generated／real_footage／`workbench_render`(D1 migration)、object_key/url、mime、byte_size、checksum_sha256、metadata `{source:"video_workbench", rightsSources, parentAssetIds, costUsd, vwJobId}`；同 org＋checksum 已存在 → 回既有 id（冪等）→ 對影片呼叫 `persistAutomaticTechnicalQa`（`qa-persistence.ts:16`）＋ rights QA（`editorial-rights-persist.ts`）。失敗刪 R2 物件（同 upload-asset :153）。
- `NA/app/api/internal/video/workbench/jobs/route.ts`（新）：upsert／取消／列表（D1 表）。
- `products.ts:49-53` video 列：features 補 VW 付費動作（對照 `VW/backend/generation-policy.cjs` 類型：image→`video.image`、video→`video.motion`、audio→`video.tts`、text/director→`video.script`、transcribe→`video.transcribe`，新增 `video.bg-remove`、`video.3d`）；door 加選填欄 `uiService: "video-workbench"`（型別 `products.ts:11`），`products.test.ts` 加：有 uiService 的門，`PC/nginx/default.conf` 必有該 host 的獨立 server 區塊且不在共用 door server_name（`:439`）。
- `cost-model.ts`：`TOOL_RATES` 加 VW 的 3D／Meshy 列；VW 改成 import 而非手抄（L3）。
- 驗收：`cd NA && npx tsc --noEmit && npx vitest run app/api/video/workbench lib/entitlements/__tests__ lib/portal/__tests__ app/api/internal/video/workbench`；守衛突變：session route 拔 assertOrgAccess → 「client 不能指定別的 org」測試紅；internal route 拔 Bearer 比對 → 紅。
- rollback：revert；新 route 無資料副作用。

**L3 VW 接主系統**（Medium）
- `VW/config.js`：容器以 `VW_CONFIG_MODE=http` 由 server 注入 `mode:"http"`（server 回 `/config.js` 時依 env 產生，檔案本身維持 local 預設）。
- 生成前取 permit（D5）：`backend/entitlement.cjs`（新）POST `${VW_NEXT_ADMIN_INTERNAL_URL}/api/internal/entitlements/permit/video`，`import()` `permit.ts` 驗章（`ENTITLEMENT_PUBLIC_KEYS`），快取至到期前 30 s（ADR 017 :100）；拒絕 → 403 中文訊息（no_entitlement／no_credits）。entitlement shadow 期間 allowed=shadow 照做。
- 資產帳冊（①）：生成／匯入／渲染成功後呼叫 L2 assets route，回存 `assetId`＋`checksum` 到 state 資產；`rightsSources` 由 `asset-origin.ts:45/53 rightsSourcesFor/FromOrigins` 產生。舊資產搬遷 = L4。
- 任務帳冊（②）：`api.cjs:38-58` jobs.json 改為「本地快取＋L2 jobs route 為準」；冪等鍵沿用 M2 欄位。
- 成本：`generation-policy.cjs:5-7` 改 import `cost-model.ts` `TOOL_RATES`（type stripping，同 F20 作法），刪手抄常數。
- 投遞 UI：輸出完成 → 「送審」= 前端同源呼叫 `/api/video/release`（F12；需 canApproveMedia，client 看到「待員工核准」）→ `/api/video/social-drafts`（Postiz 草稿）＋`/api/video/embed-to-wp`（WP 草稿）；比例用 `ratioFor`（`platform-ratio.ts:22`），非 16x9/9x16/4x5 → D6 訊息。
- next-admin 檔清單：新增 `VW/awarewave-files.txt`（每行一個 next-admin 相對路徑：`app/globals.css`、`public/awarewave/forms.css`、`lib/content/video/{asset-origin,platform-ratio,delivery-contract,caption-formats,timeline-v1,renderer-auth}.ts`、`lib/entitlements/permit.ts`、`lib/ai/cost-model.ts`＋它們的相對 import）；`awarewave-source.json` 加 `"bundledAppDir": ".awarewave"`（F20 已支援）；新測試 `tests/awarewave-files.cjs`：掃 VW 所有 `appDir`/`../next-admin` 匯入，必須都在清單（防漏件）。
- 驗收：本機兩個 server（`npm run dev` NA:3002 + VW 以 `VW_TRUST_PROXY_IDENTITY=1` 手動帶 header）跑 `node tests/p6-chain.cjs`：生成一張圖（OPENAI 用測試替身）→ NA 本機 DB（`scripts/apply-db-migration.mjs` 對本機 schema）出現 media_assets 列含 checksum_sha256＋metadata.rightsSources；`node tests/awarewave-files.cjs` 綠。
- rollback：revert；本機 DB 列可刪。

**L4 `.data/media` → R2 搬移腳本**（Medium）
- `VW/scripts/migrate-media-to-r2.cjs --org <uuid> [--dry-run]`：走 `.data/orgs/<org>/media/<sha>/original.*`，每檔呼叫 L2 assets route（冪等：同 checksum 回既有 id），寫 `migrate-report.json`（sha → assetId／錯誤），回填 state 資產 `assetId`；不刪本地檔。
- 驗收：本機 dry-run 列數 = media 目錄數；實跑兩次第二次全部 `existing`。
- rollback：本機 DB 刪 `metadata->>source='video_workbench'` 列＋R2 前綴 `video/workbench/<org>/`（腳本附 `--undo report.json`）。

**L5 容器映像＋compose 區塊＋nginx 區塊（只寫檔，不上機）**（Medium）
- `VW/Dockerfile`（新）：`node:24.14.0-bookworm-slim`（對齊本機 v24.14.0；type stripping 需要）；apt `ffmpeg`（FFPROBE_PATH=/usr/bin/ffprobe）＋ Blender 執行庫（libxi6 libxxf86vm1 libxfixes3 libxrender1 libgl1 libxkbcommon0 libsm6）；Blender 4.5.9 linux-x64 tarball，`vendor/blender/sources.json` 加 linux 條目（官方 .sha256 驗）→ `BLENDER_PATH=/opt/blender/blender`；`npm ci --omit=dev`；跑 `scripts/vendor-effectcraft.cjs`、`vendor-three.cjs`（sha 驗）；`COPY .awarewave/`；非 root 使用者；`ENV VW_HOST=0.0.0.0 VW_DATA_DIR=/data`。`.dockerignore`：`runtime/ .data* node_modules tests/ docs/ handoff/`。
- `PC/docker-compose.yml` 加 `video-workbench`（照 renderer `:617-659`）：`container_name: lobster-video-workbench`、`image: lobster-phase1-video-workbench:local`、**不設 ports**、networks `lobster-net` + `lobster-video-net`（external，連 remotion `lobster-remotion-service:8733`）、volume `video_workbench_data:/data`、env（只列名，值在主機 .env）：OPENAI_API_KEY、REPLICATE_API_TOKEN、MESHY_API_KEY、REMOTION_SERVICE_URL、REMOTION_AUTH_TOKEN、MEDIA_RENDER_AUTH_TOKEN、VW_INTERNAL_TOKEN、ENTITLEMENT_ISSUER_TOKEN_VIDEO、ENTITLEMENT_PUBLIC_KEYS、VW_NEXT_ADMIN_INTERNAL_URL=http://next-admin:3000、VW_PUBLIC_ORIGIN、VW_ALLOWED_HOSTS=video.aware-wave.com、VW_TRUST_PROXY_IDENTITY=1、VW_CONFIG_MODE=http、VW_BLENDER_ENABLED=0（H5 前關）；healthcheck `node -e fetch('http://127.0.0.1:4178/healthz')`；limits 起始 memory 4G、cpus 3.00、pids 512（H5 量測後定）；next-admin 服務 env 加 `VW_INTERNAL_TOKEN`、`ENTITLEMENT_ISSUER_TOKEN_VIDEO`。頂層 volumes 加 `video_workbench_data`。
- `PC/nginx/default.conf`：`:439` 共用 door server_name 移除 `video.aware-wave.com`；新 upstream `video_workbench`（`server video-workbench:4178 resolve;`，照 `:80-94`）；新 server 區塊 video.aware-wave.com：沿用 door 區塊的 `$is_trusted_source`、編碼路徑拒絕 `:469`、`/api/internal` 等 404 `:463`；`location = /healthz` → VW（無驗證）；`/login`、`/_next/`、`/api/` → `next-admin:3000`（**`/api/vw/` 除外**）；`location /api/vw/`、`/media/`、`/generated/`、`= /`、`~ \.html$` → `auth_request /_vw_session` ＋ `auth_request_set` 五個 header ＋ `proxy_set_header X-VW-*`（覆寫客戶端值）→ `video_workbench`；其餘靜態（pages/shared/styles/assets/vendor/engines，公開程式碼）直送 VW 不驗；`location = /_vw_session { internal; proxy_pass http://next-admin:3000/api/video/workbench/session; proxy_pass_request_body off; proxy_set_header Content-Length ""; proxy_set_header Host $host; proxy_set_header Cookie $http_cookie; proxy_set_header X-VW-Org $http_x_vw_org; }`；`error_page 401 = @vw_login` → `return 302 /login?next=$request_uri`；`client_max_body_size 500M`、`proxy_read_timeout 300s`、`limit_req zone=admin`。
- host nginx（sg-stack.aware-wave.com.conf）**不用改**（video 已在 :27，直送 8083）；`client_max_body_size 100m`（:45）若要 >100 MB 上傳 → 同卡把 video 拆獨立 server 或整體調高（建議只拆 video）。
- `PC/scripts/backup-inventory.json`：`lobster-video-workbench:/data` 登記到現有 volume 備份 store（或 not_backed_up 附理由——建議備份，含專案 state）。
- 驗收（本機 Docker，一個 compose project 全程）：`docker build -t vw-test VW_with_.awarewave`；`docker run --rm vw-test node -e "require('child_process').execFileSync(process.env.BLENDER_PATH,['-b','--version'],{stdio:'inherit'})"` 印 4.5.9；`docker run --rm vw-test ffprobe -version`；`docker compose -f PC/docker-compose.yml config --quiet`；nginx 語法：`docker run --rm -v PC/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro nginx:stable nginx -t`（需 stub upstream 主機名 → 用 `--add-host`）。
- rollback：revert（純檔案）。

**L6 部署管線七項（只寫檔）**（Medium；改共用 sg-deploy → critic Standard＋`/codex-review`）
1. test gate：sg-deploy 在 build 後、up 前加 step「3.5 post-build gate (video-workbench)」：`docker run --rm --network none lobster-phase1-video-workbench:local node tests/gate.cjs`（`gate.cjs` 跑 19 支純 Node 測試中與部署相關者＋`awarewave-files.cjs`＋`tenancy.cjs`；不依賴主機 node 版本）。失敗 → fail（尚未 up，prod 不受影響）。
2. healthcheck：L5 compose 已有；sg-deploy `:426-445` 自動等待（容器名 `lobster-video-workbench` 合 `:42-47` 預設）。
3. smoke：`:492` 後加 `if [[ " ${APPS[*]} " =~ " video-workbench " ]]`：`_smoke_check "video-workbench healthz" https://video.aware-wave.com/healthz "" video.aware-wave.com`；`_smoke_check "video door /login" https://video.aware-wave.com/login "" video.aware-wave.com`；新 `_smoke_expect_status "vw api unauthenticated" 401 https://video.aware-wave.com/api/vw/state video.aware-wave.com`（負向：未登入必須 401，2xx = 身分閘壞 = smoke 失敗）。
4. rollback：`sg-deploy.sh:123` RESTORABLE 加 `video-workbench`；`rollback-phase1.sh:36-42` IMAGE_MAP 加 `[video-workbench]="lobster-phase1-video-workbench"`；`DEPLOY_ROLLBACK_RUNBOOK.md` 加一節（映像 restore＋volume 不動＋nginx 回退＝safe-infra-patch 自動還原）。
5. notification：sg-deploy 結尾加 `notify_result SUCCESS|FAIL|SMOKE_WARN|ROLLBACK`（經 `notify.sh`）；`auto-deploy-next-admin.sh` 呼叫時設 `SG_DEPLOY_NOTIFY=0` 避免重複（它自己在 `:243-248` 通知）。用 EXIT trap 帶狀態碼，涵蓋 fail()。測試照 notify.sh 檔頭要求設 `NOTIFY_ENV_FILE`。
6. typecheck：VW 為純 JS → `node --check` 全部 `backend/*.cjs server.cjs scripts/*.cjs`（renderer 前例 `sg-deploy.sh:267-279`「no tsc: plain .mjs」），放進 gate.cjs；CI `.github/workflows/video-workbench-ci.yml`（同 `next-admin-typecheck.yml` 結構）：checkout → node 24.14.0 → `npm ci --omit=dev --ignore-scripts` → `node tests/gate.cjs`。
7. 產品登記列：已存在（F1），L2 補 features＋uiService。
- 驗收：`bash -n PC/scripts/sg-deploy.sh PC/scripts/rollback-phase1.sh`；`bash scripts/test-hooks.sh` 不相干可略；sg-deploy 若有既有 bats/sh 測試（`PC/tests/`）跑之；`node scripts/verify-governance-pointers.mjs`（runbook 改動）。
- rollback：revert。

### B. DB（High；另卡，先過 db-expert）

**D1 migration 0159：任務帳冊表＋asset_domain**（High）
- `MIG/0159_video_workbench_jobs.sql`＋`0159_video_workbench_jobs.down.sql`＋`packages/db/scripts/0159_video_workbench_jobs_down.sql`（兩處，F10）。
- 表 `public.media_workbench_jobs`：id uuid pk、organization_id uuid NOT NULL fk organizations on delete cascade、created_by uuid（auth user）、idempotency_key text NOT NULL、kind text CHECK(image/video/audio/text/remove-bg/3d/render/transcribe)、status text CHECK(queued/running/succeeded/failed/cancelled)、input jsonb、result_asset_id uuid fk media_assets on delete set null、cost_usd numeric(10,4)、error text、attempt int default 1、cancel_requested boolean default false、created_at/updated_at；`unique(organization_id, idempotency_key)`；index (organization_id, created_at desc)；RLS enable＋只允許 service role 寫（照 `0136_control_plane_tables_writes_only.sql` 模式）。
- `media_assets_asset_domain_check`：drop＋重建 `not valid`，在 0151:24-27 清單加 `'workbench_render'`（照 0151:15-27 寫法）。
- 先：`db-expert` 審（鎖、相容、RLS）；本機 `node scripts/apply-db-migration.mjs` 對本機/staging schema 跑 up→down→up。
- 上機：`node scripts/apply-db-migration.mjs`（prod，High，`# CONFIRMED-HIGH-RISK:` 首行）；`--status` 顯示 0159 applied；sg-deploy 閘 `:185-200` 之後才放行依賴它的 next-admin。
- rollback：down 檔（drop 表＝僅 P6 新資料；constraint 還原 0151 清單——若已有 workbench_render 列則 down 會失敗，down 檔先檢查並拒絕，需人工）。

**D-R 比例 1:1／4:3（不擋 P6）**（High；另卡）
- 範圍：`0138:21` formats CHECK、`platform-ratio.ts:5-18,28`（`ratioOfUrl` regex）、`RATIO_PREFERENCE` 各平台排序、`VW/backend/delivery-ratios.cjs`、remotion 輸出名。先 `db-expert`，再 Fable 定各平台偏好。

### C. 上機（全部 High；操作者已預授權 P6；每步首行 `# CONFIRMED-HIGH-RISK: P6 <步驟>`）

**H0 預檢（唯讀 SSH）**
- `ssh -p 58122 root@145.239.195.47`：`docker compose -f /root/lobster-phase1/docker-compose.yml config --services`；`docker network ls | grep -E 'lobster-net|lobster-video-net'`；`df -h /var/lib/docker`、`free -g`、`nproc`（Blender 映像 ~1.5 GB；對照 `agency-os/reports/status/capacity-LATEST.md`）；`curl -sk --resolve video.aware-wave.com:443:127.0.0.1 -o /dev/null -w '%{http_code}' https://video.aware-wave.com/login`（預期 200＝現況 next-admin 門）；`ls /root/lobster-phase1/DEPLOY_HOLD`、repo `DEPLOY_HOLD`。
- 停止條件：磁碟 < 10 GB 或記憶體可用 < 6 GB → 停，回報。

**H1 套 D1 migration**（見 D1）。驗：`node scripts/apply-db-migration.mjs --status | grep 0159`。

**H2 主機 secrets**（High：憑證）
- 產生 `VW_INTERNAL_TOKEN`、`ENTITLEMENT_ISSUER_TOKEN_VIDEO`（`openssl rand -hex 32`），寫 `/root/lobster-phase1/.env`（不進 git；同步寫本機 `mcp/user-env.ps1` 名稱）；`ENTITLEMENT_PUBLIC_KEYS` 沿用 next-admin 現值。
- 驗：`grep -c '^VW_INTERNAL_TOKEN=' /root/lobster-phase1/.env` = 1（不印值）。

**H3 next-admin 先上（L2 程式）**：L2 已在 main → `bash /root/lobster-phase1/scripts/sg-deploy.sh next-admin`；compose 的 next-admin env 新增兩變數走 `safe-infra-patch.sh compose /root/lobster-phase1/docker-compose.yml next-admin`（§0：sg-deploy 不同步 compose）。驗：`docker exec lobster-next-admin printenv VW_INTERNAL_TOKEN >/dev/null && echo ok`；`ENTITLEMENT_ISSUER_TOKEN_VIDEO` 同。
- rollback：sg-deploy 自動 rollback；compose 由 safe-infra-patch 自動還原。

**H4 VW 服務上線**
1. `mkdir -p /root/lobster-phase1/apps/video-workbench`（sg-deploy `:292` 要求 DST 存在）。
2. compose 加 `video-workbench` 服務＋volume：`safe-infra-patch.sh compose /root/lobster-phase1/docker-compose.yml video-workbench`（stdin = L5 完整 compose）。首次 `up -d --no-build` 會因無映像失敗 → 先 `docker compose build video-workbench`（在 rsync 後）；順序改為：先 `sg-deploy.sh --dry-run video-workbench` 確認服務名被接受 → `sg-deploy.sh video-workbench`（rsync＋.awarewave 複製＋build＋gate＋up＋健康＋smoke；首部署 `Saved: NONE` 正常 `rollback-phase1.sh:110-111`）。
3. nginx：`safe-infra-patch.sh nginx /root/lobster-phase1/nginx/default.conf`（stdin = L5 版本；腳本跑 nginx -t＋reload＋自動還原）。若拆 host 100m 上限：`safe-infra-patch.sh host-nginx /etc/nginx/sites-available/sg-stack.aware-wave.com video.aware-wave.com/healthz`。
- 驗收（全部 `--resolve video.aware-wave.com:443:127.0.0.1`）：`/healthz` 200；`/login` 200；未登入 `/api/vw/state` 401、`/` 302→/login；`docker exec lobster-video-workbench printenv VW_TRUST_PROXY_IDENTITY` = 1；`docker port lobster-video-workbench` 空（無發布 port）；偽造 header：`curl … -H 'X-VW-User-Id: x' -H 'X-VW-Org-Id: <uuid>' /api/vw/state` 仍 401。
- rollback：nginx 由 safe-infra-patch 還原（video 回到共用 door server_name＝回到 next-admin 門）；VW 容器 `docker compose stop video-workbench`（High 閘）；volume 保留。

**H5 Blender CPU 量測（開 3D 前）**
- `docker exec lobster-video-workbench` 跑 P5 的 render job（`backend/blender-jobs.cjs` 標準場景，1080p 5 s）：記秒數、峰值記憶體（`docker stats --no-stream`）、對其他容器 CPU 影響（同時看 `capacity-LATEST`）。
- 判準：單支 ≤ 10 min 且峰值 < limits → `VW_BLENDER_ENABLED=1`（safe-infra-patch compose）＋併發 1；否則保持 0，3D 按鈕顯示「主機不足」，寫 TASKS 一行。

**H6 全鏈實測（P6 驗收條件 plan :72）**
- 員工帳號在 video.aware-wave.com 登入 → 選組織 → 生成一張圖＋一支 Remotion 片 → 輸出 → 送審 → release → Postiz 草稿＋WordPress 草稿。
- DB（`timeout 60 ssh … docker exec … psql`，唯讀）：`select id, checksum_sha256, metadata->'rightsSources' from media_assets where metadata->>'source'='video_workbench' order by created_at desc limit 3;` 有值；`media_releases`、`media_delivery_attempts`（destination postiz＋wordpress，status drafted）各一列；`media_workbench_jobs` 對應列 succeeded。
- `/playwright smoke`；Uptime Kuma 加 `https://video.aware-wave.com/healthz` 監控（public reachability，§0 監控分工）。
- L4 搬移：操作者筆電 `.data` 由 `migrate-media-to-r2.cjs --org <AwareWave 自用 org>` 打 prod internal route？→ **不行**（internal route 不對外）。改：`scp` 筆電 `.data/orgs/local/` 到 volume 後在容器內跑腳本（High：scp 到 VPS）。

## 3. 唯一阻擋性問題
- 無。D1–D6 已選並寫代價；操作者若要 video 門的 `/works`（next-admin 我的作品頁）在此網域仍可見，只需在 L5 nginx 加 `location /works` → next-admin，一行。

## 4. 下一步
- L0 → L1 → L2 ∥ D1(db-expert) → L3 → L4 → L5 → L6 → H0…H6。建議模型：L0 Sonnet（refactor-specialist），L1–L6 Opus 5.5，D1 審 db-expert，H 段 Opus 5.5。
