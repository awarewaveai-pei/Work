# Oracle 部署（oracle.aware-wave.com，ks-aw-01）

oracle 是 `sg-deploy.sh` 的一個 app：`oracle-web`。主機與 SSH 見 `agency-os/AGENTS.md` §0（登入 `ubuntu`，指令加 `sudo -n`）。部署屬 High，需操作者同意。

## 部署
```bash
/root/lobster-phase1/scripts/sg-deploy.sh oracle-web
```
- 流程（CI 閘 → `npm ci`／tsc／vitest → 快照 → build → up → healthy → smoke → 失敗自動還原）與旗標見 `lobster-factory/infra/hetzner-phase1-core/scripts/sg-deploy.sh` 與 `agency-os/docs/operations/DEPLOY_ROLLBACK_RUNBOOK.md`。
- **不在每晚 03:00 自動部署內**：推上 `main` 不會上線，要手動跑上面那行。
- CI：`.github/workflows/oracle-web-ci.yml`（`check-ci-green.sh` 的 `app_workflows` 對照）。CI 未綠會被拒絕。
- 回滾：`/root/lobster-phase1/scripts/rollback-phase1.sh restore oracle-web`。

## 主機上的位置
- 原始碼（rsync 目的地）：`/root/lobster-phase1/apps/oracle-web/`；來源 `Projects/internal/ziwei-doushu/`（`sg-deploy.sh` `app_git_source_root`）。
- 容器設定：`/root/lobster-phase1/docker-compose.yml` 的 `oracle-web` 服務（機器本地；repo 對照檔 `lobster-factory/infra/hetzner-phase1-core/docker-compose.yml`）。改它用 `safe-infra-patch.sh compose`。
- 金鑰：`/root/lobster-phase1/apps/oracle-web/.env.production`（600；`OPENAI_API_KEY`；模型用 `lib/ai/models.ts` 預設，要覆寫才加 `OPENAI_MODEL_*`）。不進 git、rsync 不動、不進映像（`.dockerignore`）。
- 對外：host nginx vhost → `127.0.0.1:3010`；`lobster-nginx` 以 `oracle-web:3000` 走 `lobster-net`（容器名不可改）。範本 `deploy/nginx/oracle.aware-wave.com.conf`。

## 上線後驗證（從外部）
```bash
curl -s https://oracle.aware-wave.com/zh-TW | grep -o '<title>[^<]*'            # 東西方命理
curl -s https://oracle.aware-wave.com/sitemap.xml | grep -c 'oracle.aware-wave' # = 頁數×語言
```
AI 解讀：`POST /api/interpret`，body `{ tier: "light", context: { systemId, locale, headline, facts[] } }`，每個 `SYSTEM_IDS` 各打一次應回 200 與 `text`。

## 對外資料介面 v1
- `GET /api/v1/systems`：全部系統與輸入規格（欄位、範圍、繁中英文說明、範例）；`GET /api/v1/systems/{id}` 單一系統。
- `POST /api/v1/systems/{id}`，body `{ input, locale? }` → `{ apiVersion, system, data, context }`；只給確定性結果，不含 AI 解讀。
- 錯誤 `{ error, detail }`：400 輸入錯（逐項列出）、404 未知系統、429 限流（附 `Retry-After`）、500 計算失敗（不含內部細節）。
- 用到「今天」的系統（八字、每日運勢、合婚、易經、塔羅每日一牌、占星、吠陀）日期必填，伺服器不代填。
- 限流（`lib/http/rateLimit.ts`）：每來源位址每分鐘 v1 60 次、`/api/astrology*`與`/api/vedic` 合計 60 次、`/api/interpret` 10 次。來源位址只信 nginx 設的 `X-Real-IP`。計數在單一行程記憶體：多副本各算各的，重啟歸零。
- CORS：`/api/v1/*` 對任意來源開放 GET／POST／OPTIONS，不帶憑證。
- 沒有帳號、沒有計量；日後要收費時走 `can()`，與 oracle 的帳號卡一起做。
- 新增系統：實作 `DivinationSystem`（含 `input` 規格）並在 `lib/divination/index.ts` 註冊，REST 與文件自動出現。
- 部署煙霧測試含 `/api/v1/systems`（`sg-deploy.sh` oracle-web 段）。

## MCP 端點（AI 助理工具）
- 網址：`https://oracle.aware-wave.com/api/mcp`，MCP Streamable HTTP、無狀態、無需金鑰。在 Claude／ChatGPT 等加「自訂連接器／遠端 MCP 伺服器」填此網址即可。
- 工具：每個已註冊系統一個（名稱＝系統 id，參數＝ v1 的 `input` 欄位攤平＋選填 `locale`），外加 `list_systems`（各系統範例輸入）。工具與 JSON Schema 由 `lib/divination/input.ts` 的規格轉出（`lib/mcp/schema.ts`），新增系統自動出現。
- 回傳：`content` 一段事實純文字（`lib/mcp/text.ts`）＋ `structuredContent: { data, context }`；只給確定性結果，不含 AI 解讀。輸入錯誤回 `isError: true` 並逐項列出。
- 協定：手寫最小集合（`initialize`、`ping`、`tools/list`、`tools/call`），版本 2025-11-25／2025-06-18／2025-03-26；不開 SSE（GET／DELETE 回 405）；帶 `Origin` 必須同源，否則 403。
- 限流沿用 v1 額度（每來源每分鐘 60 次，另計 `mcp`）；body 上限同 v1。
- 部署煙霧測試 POST 一次 `initialize`（`sg-deploy.sh` oracle-web 段）。手動驗：
```bash
curl -s https://oracle.aware-wave.com/api/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -c 300
```

## 已登記站台（WordPress 外掛的伺服器呼叫）
- 環境變數 `ORACLE_SITES`（容器的 `.env.production`；`sg-deploy.sh` 不同步 `.env*`，部署不會蓋掉）：JSON 陣列，每筆
  `{"key_id":"…","public_key":"-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----\n","embed_origins":["https://站台網域"],"requests_per_minute":600,"ai_per_day":20}`。
  - `key_id`：`[a-z0-9][a-z0-9-]{1,23}`；`public_key`：該站 Ed25519 公鑰 SPKI PEM（外掛產生，私鑰只在站上；放進 JSON 時換行寫成 `\n`，寫成真的換行整串 JSON 會解析失敗、全部站台一起失效）；`embed_origins`：允許嵌入的來源（W2 用）；`requests_per_minute`：選填，預設 600；`ai_per_day`：選填，預設 20（1–100000），每個會員假名每 24 小時可用的 AI 解讀次數（見下方會員票）。
  - 不寫死任何網域；引擎不存任何個資，站台只以 key_id 識別。格式錯的那筆略過並在啟動後首次請求記錄原因（不記金鑰內容）。
  - 輪替金鑰＝改該筆 `public_key` 後重啟容器；停用站台＝刪掉該筆。
- 簽章（沿用 WordPress 換手的構造，next-admin `lib/auth/sources/awarewave-wp.ts`）：body 為 JSON 並含 `key_id`、`ts`（unix 秒）、`nonce`（16–100 個 `[A-Za-z0-9_-]`）、`aud`（用途：`/api/v1` 請求寫 `"v1"`，會員票寫 `"ticket"`；同一把鑰匙兩種用途，一份原文只對一個用途有效）；標頭 `X-AwareWave-Oracle-Signature: base64(Ed25519(原始 body))`；ts 須在 ±60 秒內、nonce 每站只能用一次。
- 回應：錯簽、`aud` 不符（`wrong_audience`，不消耗 nonce、不扣額度）、過期、重送 401；未知 key 404；超過站台額度 429（`Retry-After`）。帶簽章的請求在驗簽前先以來源位址計一次（每分鐘 600 次），亂帶簽章標頭不能免費消耗驗簽與解析。
- `POST /api/v1/batch`（只限站台）：`{key_id, ts, nonce, aud:"v1", system, items:[input…]（1–200 筆）, locale?}` → `{apiVersion, system, results:[{ok,data,context}|{ok:false,error,detail}]}`，與 items 同序，額度按筆數計。
- `POST /api/v1/systems/{id}` 帶簽章時改用站台額度（body 另含 key_id、ts、nonce、aud:"v1"）。
- `GET /api/v1/places?q=&locale=&limit=`：出生地搜尋的跨網域版（CORS 任意來源），依來源位址限流。
- 會員票（`POST /api/interpret`，框內頁從瀏覽器帶上；`lib/sites/ticket.ts`）：外掛替登入會員簽一次性短效票。
  - 原文 JSON 只含 `{"key_id","ts","nonce","aud":"ticket","member"}`（多一個欄位就不算票）；`member` = 站台給的假名，16–64 個 `[A-Za-z0-9_-]`，不放 email、user id 等可辨識資料。簽法同上（ts ±60 秒、nonce 一次＝一張票只能用一次）。
  - 標頭：`X-AwareWave-Oracle-Ticket: base64url(原文)`、`X-AwareWave-Oracle-Signature: base64(Ed25519(原文))`；body 照舊是解讀請求。
  - 先照匿名請求依來源位址限流（每分鐘 10 次）；帶了票標頭就必須驗過，失敗不退回匿名：400 `invalid_ticket`（標頭不是 base64url、`member` 格式錯或多欄位）／`invalid_json`／`invalid_key_id`／`invalid_nonce`；401 `invalid_signature`／`wrong_audience`／`stale_request`／`replayed_request`；404 `unknown_site`。
  - 驗過後以 `<key_id>:<member>` 計每 24 小時 AI 次數（輸入驗過、要呼叫 AI 才計；AI 端回 502／503 也算一次），超過 `ai_per_day` 回 429 `daily_limit_reached`（`Retry-After`）。計數在單一行程記憶體，重啟歸零。
  - 沒帶票 = 匿名，行為不變。

## 站前面有 WordPress（`ORACLE_FRONT_PAGES`）
- 執行期環境變數（容器的 `.env.production`，改後重啟容器；不必重 build）。未設定＝沒有 WordPress：引擎照現在顯示所有頁、自己出 sitemap 與 robots（買斷、無 WordPress 的站都是這樣）。
- 格式：`{"pages":{"zh-TW":"/tools/{slug}/","en":"/english/{slug}/"},"home":{"zh-TW":"/","en":"/english/"}}`；`home` 選填；只收 `lib/i18n/config.ts` `locales` 內的語言鍵。
- 有設定時：`/<語言>/<工具>`（`lib/site.ts` `PAGE_SLUGS`，可帶結尾斜線）與 `/<語言>`（有 `home` 時）308 轉到樣式算出的路徑，`{slug}` 換成工具代稱，保留查詢字串；`Location` 是同網域相對路徑。`/sitemap.xml`、`/robots.txt` 回 404（改由 WordPress／Rank Math 出）。`/embed/*`、`/api/*` 不受影響。該語言沒有樣式的照常顯示引擎頁。
- 路徑規則：以 `/` 開頭；`pages` 恰含一次 `{slug}`、`home` 不含；不得含 `//`、`:`、`\`、`?`、`#`、`%`、`.`／`..` 段、空白或非 ASCII；`{slug}` 逐一代入每個工具後，第一段都不得是引擎佔用的 `zh-TW`、`en`、`embed`、`api`、`_next`、`tarot`（否則轉回引擎自己、無限轉向）。所以 `/{slug}/` 不合法：塔羅會算出 `/tarot/`。任何一處不合法＝整個視為未設定，容器 log 記一行 `ORACLE_FRONT_PAGES ignored: <原因>`（不印值）。
- 驗證：`curl -sI https://<站>/zh-TW/ziwei` → 308、`location: /tools/ziwei/`；`curl -sI https://<站>/embed/zh-TW/ziwei` → 200。
- 規格：`agency-os/handoffs/2026-11-20-oracle-skills-supervisor/briefs/ORACLE-WP-SPEC.md` §2-3、§2-12；程式 `lib/frontPages.ts`、`proxy.ts`。

## 內容安全政策（CSP）
- 引擎與 WordPress 同網域（ORACLE-WP-SPEC §2-14）：引擎頁一個 XSS 就能帶管理員登入狀態操作 WP 後台，所以頁面只執行帶本次 nonce 的腳本。
- 唯一定義：`lib/http/csp.ts`。頁面（`/<語言>/…`、`/embed/…`、404）由 `proxy.ts` 逐請求產生 nonce 送出；API（`/api/*`）由 `next.config.ts` 送 `API_CSP`。同一回應只能有一個 CSP 標頭（兩個都會生效），不要在 nginx 或別處再加。
- 頁面政策（production）：`default-src 'self'; script-src 'self' 'nonce-<每請求>' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'`。dev 另加 `'unsafe-eval'`。
  - `'strict-dynamic'` 使 `'self'` 對腳本失效：同網域的 WordPress 上傳區檔案不能當腳本跑。
  - `style-src 'unsafe-inline'`：工具元件用 React `style` 屬性排版（數百處），伺服端輸出成 `style="…"`；行內樣式不能執行腳本。
- `frame-src 'none'`：引擎頁不框任何東西，防注入的 HTML 框住同網域 WP 後台做點擊誘騙。`frame-ancestors 'self'`：只准同網域（WordPress 頁）框引擎；客戶自己主機的跨網域內嵌（ORACLE-WP-SPEC §1 末段）開卡時要改這一條。
- proxy 刻意不排除 prefetch 與 `/tarot/*` 等靜態檔請求（官方範例會排除）：所有經過的回應都帶 CSP，matcher 與 `next.config.ts` 的 `/api/:path*` 互補，不留沒有 CSP 的 HTML。
- API 政策：`default-src 'none'; frame-ancestors 'none'`。`/embed/*` 另有 `X-Robots-Tag: noindex, indexifembedded`。
- 代價：nonce 需逐請求渲染（兩個 root layout `await connection()`），頁面不再預生成；本機量首頁中位數 3.7ms → 20.6ms（2026-11-22，操作者選此做法）。`/_not-found` 仍是靜態頁，其腳本被擋、內容照顯示。
- 加外部來源（例：新的分析腳本、外部圖片或 API）：只改 `lib/http/csp.ts` 對應指令＋`lib/http/csp.test.ts`；外部腳本用 Next `<Script nonce={(await headers()).get('x-nonce')}>` 或確保由帶 nonce 的腳本載入（`'strict-dynamic'`）。不要加 `'unsafe-inline'`／`'unsafe-eval'` 到 `script-src`。
- 驗證：`curl -sI https://<站>/zh-TW/ziwei | grep -ic content-security-policy` → `1`；`/embed/zh-TW/ziwei` 另有 `x-robots-tag`；`/api/v1/systems` 的 CSP 是 `default-src 'none'…`。

## 注意
- `NEXT_PUBLIC_*` 在 build 時內嵌；網域預設值在 `lib/site.ts`。
- 付費牆：`/api/interpret` 的 `premium` 回 402；`light`／`deep` 放行；每日次數計量未接。
- 歷史：2026-11-20 前在 `/opt/oracle` 以獨立 compose 執行（`deploy/DEPLOY-SG.md`、`deploy/oracle-deploy.sh` 見 git 歷史）。
