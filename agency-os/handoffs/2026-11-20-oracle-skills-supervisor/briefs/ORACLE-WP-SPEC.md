# 算命站產品規格：WordPress 頁面內嵌同網域的引擎（取代 `WP-front-door-plan.md`）

狀態：規格（2026-11-22）。**未動工；等操作者看過 §7 後才派卡。** 實作中屬 High 的步驟逐項等操作者同意。
決策依據：`agency-os/reports/decisions/2026-11-21-oracle-wp-front-door-architecture.md`（§0 定案、§8 試驗）。
分工：本檔只寫產品（引擎、外掛、上線順序）。建站平台（從頁面開站、主機閘門、備份、MainWP）在 `SITE-FLOW-COMPLETION-PLAN.md`。同一件事只寫在一處。
縮寫：`ENG/`＝`Projects/internal/ziwei-doushu/`；`PLG/`＝`lobster-factory/packages/oracle-wp-plugin/`；`INFRA/`＝`lobster-factory/infra/hetzner-phase1-core/`；REV＝`briefs/PLAN-REVIEW.md`。
給 worker 的 brief 照抄兩句：「回報操作者一律繁體中文」、AGENTS §1「不做無效益測試」句。

## §0 操作者決定（原話或出處）

| # | 決定 | 出處 |
|---|---|---|
| D1 | 站放 WordPress，照客戶網站方式管理，她親手用系統操作 | `DISPATCH.md:136` |
| D2 | 會員＝這個站自己的 WordPress 會員 | 同上 |
| D3 | 訂閱後每天自動寄運勢信，用 FluentCRM | 同上 |
| D4 | 私人合盤：使用者自己輸入對方資料並存檔；不邀請、不通知、不需對方是會員；未登入也能合盤但不儲存 | `WP-front-door-plan.md:4` |
| D5 | 全世界可用；付費先不做 | `DISPATCH.md:136` |
| D6 | 外掛以裝在任一客戶 WordPress 為預設；舊網址不保 SEO | `WP-front-door-plan.md:5` |
| D7 | 工具頁要能在 WordPress 編輯器裡排版 | 2026-11-22「要能排版」 |
| D8 | AI 解讀分兩段：免費簡批；深度解析付費，單次購買（一份報告付一次，例：紫微深度 NT$199）。供應商用 OpenAI。簡批下方要列出還有哪些深度內容可付費得知。取代 D5 的「付費先不做」（只限深度報告；訂閱制仍不做） | 2026-11-22「先給摘要,欲知深度分析要付費…非常深度」「單次購買…比較簡單」「簡批出來後,要寫還有哪些深度內容可付費得知」 |
| D9 | 紫微要有十二宮的對宮、三方四正、三合六合互動推演，以及流年、流月 | 2026-11-22 原話 |

## §1 架構

```
https://oracle.aware-wave.com（一個網域）
 └ lobster-nginx oracle 區塊（INFRA/nginx/default.conf:402-433）依路徑分
     /embed/*  /api/*  /_next/*  /tarot/*  /favicon.ico      → oracle-web:3000（引擎，容器不改名）
     /zh-TW/*  /en/*                                          → 引擎（開放後引擎自己轉到對應的 WordPress 頁，見 §2-3）
     其餘（/、/<工具頁>/、/wp-*、/wp-json/*、sitemap、robots） → oracle 的 WordPress 容器
WordPress 頁面（Kadence，可排版）
 └ 區塊或短碼輸出 <iframe src="/embed/<語言>/<工具>">（同網域）
     ├ 父頁腳本直接讀框內文件量高度、接手捲動（同源，不需訊息協定）
     └ 框內頁以 WordPress 登入 cookie＋REST nonce 呼叫外掛 REST：存取命盤、合盤對象
外掛每小時排程（主機 cron 觸發，不靠訪客）
 └ 挑到時間的訂閱者 → 引擎 POST /api/v1/batch（站台簽章，已併入 8d60735c2）→ FluentCRM「寄自訂信給此聯絡人」
```

- 引擎維持無資料庫、不存個資。個資在該站的 WordPress 資料庫。
- 本輪不做的：引擎改名、新憑證、DNS、嵌入票、跨網域訊息協定、FluentCRM 標籤／自動化／smartcode。
- 客戶自己主機上的 WordPress（反向代理不在我們手上）：改用跨網域內嵌框，`PLG/` 現有 iframe 寫法保留但本輪不接；有第一個這種客戶時開卡。

## §2 決定

| # | 項目 | 做法 | 依據 |
|---|---|---|---|
| 1 | 分路 | 上表路徑。nginx 規則只列引擎的前綴；WordPress 不得使用 `/embed`、`/api`、`/_next`、`/tarot`、`/zh-TW`、`/en` 當頁面網址 | 試驗 V1 |
| 2 | 嵌入版頁面 | 引擎新路由 `/embed/[lang]/[slug]`：重用現有工具元件；不顯示引擎的工具列與語言鈕；版面不撐滿視窗；回應標頭 `X-Robots-Tag: noindex, indexifembedded`；`Content-Security-Policy: frame-ancestors 'self'` | 試驗 V1b 兩項；REV M4 |
| 3 | 既有 `/zh-TW/<工具>`、`/en/<工具>` | 引擎加環境變數 `ORACLE_FRONT_PAGES`（JSON：`{"pages":{"zh-TW":"/tools/{slug}/","en":"/english/tools/{slug}/"},"home":{"zh-TW":"/","en":"/english/"}}`；`home` 選填；格式與檢查正本 `Projects/internal/ziwei-doushu/lib/frontPages.ts`）。樣式代入每個工具代稱後第一段不得是引擎前綴（第 1 項），所以不能用 `/{slug}/`（塔羅會變 `/tarot/`，引擎拒收整份設定）。有設定時這些網址 308 轉到樣式算出的 WordPress 頁；沒設定時照現在顯示（買斷或無 WordPress 時不變） | 避免同內容兩個網址；不寫死網域 |
| 4 | 高度與捲動 | 父頁腳本量框內「工具根元素」的高度（不是整份文件，試驗量到 4157px 對實際 902px）；結果出現時父頁捲到結果；框內浮層（城市搜尋、放大牌圖）改為框內就地展開，不用固定定位 | 試驗 V1b；REV m7 |
| 5 | 會員與存檔 | 外掛 REST `aworacle/v1`（登入＋nonce）。兩張表：`{prefix}aworacle_charts`（自己的命盤）、`{prefix}aworacle_persons`（我存的對象：暱稱、出生資料）。對象只屬於該會員，不與任何帳號關聯。未登入照常使用，不存，顯示「登入以儲存」 | D2、D4；試驗 V2 |
| 6 | 出生資料保護 | 出生欄位以 libsodium secretbox 加密後存；金鑰放 `wp-config.php` 常數，不進資料庫與備份的資料庫部分。WordPress 隱私工具的匯出與刪除要涵蓋兩張表與訂閱資料；刪會員連動刪除 | REV M6 |
| 7 | AI 額度依會員 | 外掛 REST 發一張站台金鑰簽的短效票（假名、到期時間、key_id，60 秒）；框內頁帶票呼叫 `/api/interpret`；引擎用 `ENG/lib/sites/verify.ts` 驗，依 key_id＋假名限額。無票＝匿名，照現行依來源位址限流。登記表加每站每日 AI 上限欄位 | REV M11、m9 |
| 8 | 每日信 | 外掛自帶訂閱區塊 → 建 FluentCRM 聯絡人（pending）→ FluentCRM 雙重確認。出生資料存外掛表 `{prefix}aworacle_daily_profiles`（不存 FluentCRM 自訂欄位）。每小時排程：挑「所在時區當地時間 ≥ 07:00 且今天還沒寄」的人 → 批次算 → 寫 `{prefix}aworacle_daily_sent`（唯一鍵 訂閱者＋當地日期）→ 站內呼叫 FluentCRM `POST /fluent-crm/v2/subscribers/{id}/emails/send`。引擎回錯就不寄。排程停擺超過一天的不補寄。每月清 30 天前的 `custom_email_campaign` 列 | D3；試驗 V4；REV m3 |
| 9 | 寄信層接頭 | 外掛設定 `mailer: fluentcrm \| none`；`none` 或未裝 FluentCRM 時不顯示訂閱區塊。FluentCRM 免費版即可 | ADR 017 `:52`；試驗 V4 |
| 10 | 寄信服務 | **FluentSMTP＋Resend**（操作者 2026-11-22：「有人留 email 就可以用 Resend 寄」）。平台已有 Resend 帳號，`aware-wave.com` 已驗證可寄（2026-11-22 查：免費方案每日 100 封、每月 3,000 封，已用 1；網域 1／3）。每日信用獨立寄件網域 `oracle.aware-wave.com`（子網域，免費；**2026-11-22 已在 Resend 建立**，id `86fd3992-5c20-4266-9155-74a2f9ff4e93`，Cloudflare 已加 4 筆 DNS，驗證中），不與主網域的系統通知信混在一起。每封信在 FluentCRM 的活動名稱帶 `oracle-daily`；經 Resend API 寄時加標籤 `product=oracle`（經 FluentSMTP 能否帶 Resend 標籤未驗證，P3′ 開工時查）。Resend 不在 FluentCRM 內建退信回報名單內 → 外掛收 Resend webhook（`email.bounced`、`email.complained`），把該聯絡人在 FluentCRM 標成 bounced／complained（P3′ 內）。訂閱者每日超過 100 人時升 Resend 付費方案；外掛不用改 | 操作者指示；Resend 帳號實查 |
| 11 | 站台金鑰登記 | 本輪沿用已併入的 `ORACLE_SITES` 環境變數（一個站）。第二個站要接入時，搬進控制面並沿用 `seller_sites` 的形狀（`lobster-factory/packages/db/migrations/0133_seller_sites.sql:18-29`）；屆時引擎改讀簽章清單端點 | REV C2；本輪只有一個站 |
| 12 | 搜尋 | 工具頁＝WordPress 頁，介紹文與 FAQ 寫在頁面本體可收錄；框內內容靠 `indexifembedded` 歸到父頁。sitemap 與 robots 由 WordPress（Rank Math）出；引擎的 `sitemap.ts`、`robots.ts` 在 `ORACLE_FRONT_PAGES` 有設定時不輸出 | REV M4 |
| 13 | 多語 | TranslatePress（站台既有選擇）。WordPress 的語言網址代稱不得用 `en`、`zh-TW`（引擎佔用）；外掛以 `determine_locale()` 對應引擎語言，對不到用 `en` | §1 分路限制 |
| 14 | 同源的安全取捨 | 引擎頁若有 XSS 可用管理員登入狀態操作 WordPress 後台。對策：引擎所有回應加 CSP（`script-src` 限自身與 Next 需要的來源）；嵌入版另加 `frame-ancestors 'self'` | 決策紀錄 §4 乙 代價 2 |
| 15 | ADR | 018 `:70`、015 `:47` 補一句：禁止的是跨網域且帶登入狀態的內嵌框；同網域內嵌框可用。015 §2 加範圍句：客戶網站（含操作者自有、照客戶管理者）的會員屬該站。017 §0b 補：這類站的主體是站所屬組織，終端會員不進 Supabase。**不**登記 `products.ts`（`DISPATCH.md:96` 的理由仍成立） | REV M3、m11 |

## §3 卡片

等級依 AGENTS §3。「需同意」＝該步在正式站執行前操作者明示 go。

### 引擎（`ENG/`）

| 代號 | 內容 | 檔案 | 驗收 | 依賴 | 等級 |
|---|---|---|---|---|---|
| E1 | 嵌入版頁面 | 新 `app/embed/[lang]/[slug]/page.tsx`、嵌入用版面（無工具列、不撐滿視窗、有固定 id 的工具根元素）；`proxy.ts:38-40` matcher 排除 `/embed`；嵌入頁標頭（§2-2）；浮層就地展開（`components/PlaceField.tsx`、`TarotCardView.tsx`） | 12 個工具各一頁可用；375px 無橫向捲動；工具根元素高度＝內容高度（不隨框高變大）；`curl -I` 見兩個標頭 | — | Medium |
| E2 | 全站 CSP | `next.config.ts` 或 `proxy.ts` 送 CSP；12 頁＋嵌入頁無違規 | 瀏覽器主控台 0 筆 CSP 違規（決策紀錄 §7 V3） | E1 | Medium（安全） |
| E3 | 轉向與搜尋 | `ORACLE_FRONT_PAGES`（§2-3）；有設定時 `sitemap.ts`、`robots.ts` 不輸出 | 設定時 `/zh-TW/ziwei` 308 到樣式網址、`/sitemap.xml` 404；未設定時與現在逐頁相同（既有測試不變） | — | Low |
| E4 | 會員票與 AI 限額 | `lib/sites/registry.ts` 加 `ai_per_day`；`app/api/interpret/route.ts` 收票（§2-7） | 偽造或過期的票直接回錯，不退回匿名；簽過的原文帶 `aud`（`v1`｜`ticket`），票不能拿去打 `/api/v1`；同一假名超過上限 429；日誌不含假名以外的身分資料 | — | Medium（auth） |

### 外掛（`PLG/`）

| 代號 | 內容 | 驗收 | 依賴 | 等級 |
|---|---|---|---|---|
| P1′ | 修 critic 1M/6n（清單：`agency-os/WORKLOG.md` 2026-11-21 續21「未修，裝到任何 WordPress 前必修」）；嵌入輸出改同網域（`<iframe src="/embed/…">`＋同源量高度腳本），跨網域寫法留在原檔但由設定 `embed: same-origin \| cross-origin` 切換，預設 same-origin | 乾淨 WordPress（docker，產物放 `$env:TEMP`）裝外掛 → 第一次儲存設定後對照表仍在 → 區塊嵌入可用；PHPUnit 綠 | E1 | Medium |
| P2′ | 命盤與「我存的對象」：兩張表（dbDelta）、REST、短碼 `[aw_oracle_my_charts]`、`[aw_oracle_persons]`、出生欄位加密（§2-6）、隱私匯出與刪除、刪會員連動 | 未登入 401；無 nonce 401；甲會員讀不到乙會員的列；`wp db export` 的檔裡查不到明文出生日期；匯出含兩類資料；刪除後兩表無該人資料 | P1′ | High（個資） |
| P3′ | 每日信（§2-8、§2-9）；會員票 REST（§2-7） | 四個時區（Asia/Taipei、Europe/London 跨夏令時間當日、America/Los_Angeles、Asia/Kolkata）各在當地 07:00 後第一次排程被挑中且只一次；同日重跑不重寄；退訂者不被挑；引擎回錯不寄；`mailer=none` 時無訂閱區塊；收到 Resend 的退信或投訴 webhook（驗簽章）後該聯絡人不再被挑 | P1′、E4 | High（寄信、個資） |
| P4 | 發佈：`scripts/release-wp-bridge.sh`、`scripts/rollout-wp-bridge.ps1` 加 `oracle`；發佈 repo；`WP_CLIENT_PLUGIN_STACK.md` 加「產品外掛」類別 | 兩支腳本 dry-run 正確 | P1′ | Medium（新公開 repo） |

### 治理

| 代號 | 內容 | 驗收 | 等級 |
|---|---|---|---|
| A1 | ADR 015、017、018 修訂（§2-15）；`ADR_INDEX.md` | `node scripts/verify-governance-pointers.mjs` 綠 | Medium（產品方向，需同意） |

### 上線（主 session；每步需同意；現站全程不中斷）

| 代號 | 內容 | 驗收 | 回滾 |
|---|---|---|---|
| GO-1 | 部署引擎（E1–E4＋已併入未部署的各卡）；主機 `.env.production` 加 `ORACLE_SITES`；此時不設 `ORACLE_FRONT_PAGES` | 既有網址逐頁與部署前相同；`/embed/zh-TW/ziwei` 200 | `sg-deploy.sh` 自動還原 |
| GO-2 | 經建站流程建 oracle 的 WordPress 容器（`SITE-FLOW-COMPLETION-PLAN.md` 第 1–4 步；`ingress=product-gateway`、`same_host_products` 開）。`safe-infra-patch.sh nginx` 改 oracle 區塊：除 `= /`、`/zh-TW`、`/en`、引擎前綴外都到 WordPress。WordPress 設建置中（未登入看不到頁面） | 既有訪客網址（`/`、`/zh-TW/*`、`/en/*`）不變；登入後 `https://oracle.aware-wave.com/wp-admin/` 可用；操作者在此建頁面、設外掛、設寄信 | 還原該 nginx 檔（safe-infra-patch 備份） |
| GO-3 | 操作者確認頁面與每日信可用後一次做完：`= /` 改到 WordPress；設 `ORACLE_FRONT_PAGES` 並重啟引擎；關建置中 | `/` 是 WordPress 首頁；`/zh-TW/ziwei` 308 到 WordPress 頁；頁內工具可用；`/playwright client <slug>` 無異常；訂閱測試信收到 | 移除 `ORACLE_FRONT_PAGES`＋還原 nginx 檔＝回到 GO-2 |

### 順序

- 可同時：E1、E3、E4、A1；平台線各卡（另檔）。
- E1 → E2、P1′ → P2′、P3′（可同時）→ P4。
- GO-1 等 E1–E4；GO-2 等平台線到「裝 WordPress」可用、P1′、P4；GO-3 等 P2′、P3′。
- 模型：E1–E4、P1′–P3′＝Opus 5.5 或 `fullstack-engineer`；GO-＝主 session。

## §4 已併入的東西怎麼處理

| 已在 main | 處理 |
|---|---|
| X1 `1ba36f1e1`、X2 `6eae15f2d`（＋`a2eadd8ab` 修正） | 不變；公告網址不變 |
| W1 `8d60735c2`（站台簽章、批次、`/api/v1/places`） | 沿用：批次給每日信；簽章給會員票。跨網域 places 端點本輪用不到，留著 |
| P1 `e082fbd04` | 設定頁、金鑰、工具清單沿用；iframe 輸出與 `assets/embed.js` 的訊息協定改由設定切換（P1′） |

## §5 作廢

- `WP-front-door-plan.md` 的 W2、W3、S1–S6、G-ADR、G-GAP、P2、P3 與 §4 五題全部作廢；該檔只留作歷史與 §5 查證紀錄。
- 引擎改名 `oracle-engine`、嵌入票、postMessage 協定 v1（同網域不需要）。

## §6 未驗證（動工時先做）

- Kadence 佈景下的區塊與 iframe 外觀（試驗用預設佈景）。
- TranslatePress 能否把英文的網址代稱設成 `en` 以外的字。
- 正式兩層 nginx（主機 `sg-stack` → `lobster-nginx`）上的分路；`lobster-nginx` 轉到 WordPress 容器要該容器加入 `lobster-net`。
- 引擎收到的訪客位址：`INFRA/nginx/default.conf:424` 的 `X-Real-IP $remote_addr` 是主機 nginx 的位址，不是訪客（X1、MCP、匿名 AI 限流的前提）。GO-1 前在主機確認。
- 真手機瀏覽器；實際寄出與退信回報。

## §7 照建議做（操作者不同意再改）

1. 每日信固定在訂閱者當地早上 7 點，不讓訂閱者自己選（建議：是）。
2. 每日信不附 AI 寫的段落，只寄引擎算好的內容（建議：是，不花錢）。
3. 這個站在系統裡登記成一個客戶「AwareWave 算命站」，自用 0 元，由我們代操（建議：是）。

## §8 深度報告（D8、D9；WordPress 階段之後排，卡 Z1–Z3；未派工）

現況（2026-11-22 查）：
- 正式站只設 `OPENAI_API_KEY`；`OPENAI_MODEL_DEEP=gpt-4o-2024-11-20` 釘在主機 env（蓋掉程式預設 `lib/ai/models.ts:20-22` 的 `gpt-5.4`）。`gpt-4o` 2027-01-14 關閉（OpenAI deprecations，通知日 2026-10-14）。每日運勢走 light。
- 紫微：三方四正只算命宮（`lib/ziwei/brightness.ts:43`、`lib/ziwei/patterns.ts:61`）；對宮只用於空宮借星（`lib/ziwei/palaceReading.ts:155-158`）；大限／流年／流月有算（`lib/ziwei.ts:63-90`）但只輸出四化一行（`components/ZiweiTool.tsx:104-117`、`lib/divination/systems/ziwei.ts:70-77`）；AI 指示是「簡批」（`lib/ai/prompts/systems.ts:13-17`）。排盤庫 iztro 可給任一宮的 `surroundedPalaces` 與任一日的運限十二宮。

模型（OpenAI 定價頁 2026-11-22；USD／百萬 token，輸入／輸出）：`gpt-6-luna` 0.10／0.50；`gpt-6.1-terra` 1／5；`gpt-6.2-sol` 2／10；`gpt-6.2-astra` 8／40。四者輸出上限 128K；sol 與 astra 不接受 reasoning effort `none`。
- 簡批＝`gpt-6-luna`。深度＝`gpt-6.2-sol`，Z2 用同一張真實命盤與 `gpt-6.2-astra` 各產一份、逐條對事實核對後才定；官方沒有哪個較不捏造的依據。
- 主機 env 的 `OPENAI_MODEL_DEEP` 移除（GO-1 一起做，需同意）；程式預設改 6 系列。

| 卡 | 做什麼 | 驗收 |
|---|---|---|
| Z1 紫微深度計算 | 純計算、不呼叫 AI：十二宮每宮的本宮＋對宮＋三方四正會照的吉星／煞星／四化；三合、六合、相夾；大限命宮與大限四化落點；流年命宮、流年十二宮疊本命、流年四化引動的宮；十二流月各自的重點與有利／留意標記 | 與至少一個獨立來源的排盤逐宮比對；單元測試；現有簡批的 facts 不變 |
| Z2 兩段式 AI 解讀（通用，紫微先上） | 簡批約 800–1,000 字、固定六段各有結論（命格特質／感情婚姻／事業財富／健康／人際貴人／今年運勢；操作者 2026-11-22「三百字太少(感情/婚姻、事業/財富、運勢…)」），每段給結論不給推演過程與時間點；深度（分章產生，每章只拿該章的 facts，AI 不得自行補算）；簡批下方「付費可得知的內容」清單由程式依這張盤的實際計算結果產生（成了幾個格局、流年引動哪些宮、幾個流月有標記），不由 AI 寫、不是固定文案；模型換 6 系列 | 簡批六段齊全且每段有具體星曜依據；清單每一項都對得到 facts；深度報告每章引用的星曜與宮位都在 facts 內；同盤兩模型對照紀錄 |
| Z3 購買與報告保存 | WordPress 端單次購買；引擎憑站台簽的票確認「此會員已買此報告」才產生（沿用 E4 的票，`aud` 新增一種）；報告存在會員資料，買過可重看不重收；未登入只看得到簡批與清單 | 沒票／錯票／別人的票拿不到深度；同一份不重複扣款；退款與失敗重產的規則寫明 |

簡批與付費清單的文案（操作者 2026-11-22「要能很吸引人去下單, 像韓劇/八點檔/影集」；Z2 必守）：
- 每段結尾留一個鉤子：說出「有這件事」，不說「是什麼、何時」。付費清單寫成這張盤自己的懸念，不寫成章節目錄。
- 鉤子的素材由程式從 facts 挑出（成格的格局、流年／大限四化引動的宮、有標記的流月、化忌落點），AI 只針對被挑出的項目寫；每個鉤子都要對得到一條 fact（Z2 驗收逐條核對）。
- 禁止：暗示 facts 沒有的事；恐嚇或以災禍促購（「今年有大劫，付費化解」）；對健康、法律、投資下斷言。理由：對不上的懸念帶來退款與負評，買不到第二份。
- 中文文案語感照 `feedback_chinese_page_copy_register`（文案由 GPT 寫、看實際畫面）。

待定（到 Z3 開卡時一次問一件）：收款方式（WooCommerce 或其他）、定價、退款規則。梅花易數（`muyen/meihua-yishu` 為 CC BY-NC-SA，只參考做法不取程式與文字）另列，未排。

