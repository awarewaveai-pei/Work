# fzlzjerry_tarot-mcp 逐行審讀報告

路徑前綴省略：以下 `相對路徑:行號` 皆相對 `D:\tmp\oracle-repos\fzlzjerry_tarot-mcp\`。

## 1. 每個檔案做什麼（一行一檔）

### src/（伺服器）
- `src/index.ts` 進入點：解析參數、stdio 或 HTTP 啟動；ChatWise 專用 SIGTERM 延後關閉（:169-235）。
- `src/mcp/args.ts` CLI 解析；HTTP 預設 host `0.0.0.0`（:97）、port 3000。
- `src/mcp/browser-handoff.ts` stdio 客戶端無 MCP App 時，開 127.0.0.1 臨時頁面＋HMAC handoff token，原 tool call 掛起等瀏覽器確認。
- `src/mcp/http-server.ts` Express：CORS、Origin/Host 檢查、公開靜態頁、限流、Bearer、`/health`。
- `src/mcp/http/transports.ts` Streamable HTTP 與舊 SSE 的 session 生命週期、上限 100、閒置 30 分清掃。
- `src/mcp/http/api-router.ts` REST：`/api/info|spreads|cards|reading|custom-spread|visual-readings|tools/:toolName`。
- `src/mcp/http/responses.ts` JSON-RPC 錯誤回應 helper。
- `src/mcp/protocol-server.ts` MCP Server：tools/list、tools/call；begin 結果把 slots 移到 `_meta.visualDeck`、剝除所有圖片欄位；觸發 browser fallback 並發 progress 心跳。
- `src/mcp/tarot-service.ts` 組裝根：card/session/reading/visual/search/analytics 管理器、執行工具、Domain error→工具錯誤。
- `src/mcp/tool-definitions.ts` 16 個工具的 JSON Schema、annotations、outputSchema、`_meta.ui`。
- `src/mcp/tool-result.ts` `ToolResult` 型別與 ok/error helper。
- `src/mcp/public-api.ts` 端點路徑與 16 個工具名常數。
- `src/mcp/static-assets.ts` 掛 `/draw` 與牌圖靜態檔；`timingSafeStringEqual`。
- `src/mcp/visual-app-resource.ts` 讀 `dist/ui/mcp-app.html` 作為 `ui://` 資源，CSP 全空。
- `src/mcp/resources.ts` MCP 資源 `tarot://cards[/id]`、`tarot://spreads[/type]`。
- `src/mcp/prompts.ts` 兩個 MCP prompt：`perform-reading`、`daily-draw`。
- `src/mcp/handlers/index.ts` 工具名→handler 對照表。
- `src/mcp/handlers/shared.ts` language 驗證、ISO 日期解析、analytics 建議中譯。
- `src/mcp/handlers/catalog.ts` get_card_info、list_all_cards、list_available_spreads。
- `src/mcp/handlers/sessions.ts` perform_reading、create_custom_spread、get_daily_card、recommend_spread、get_moon_phase_reading、get_session_history。
- `src/mcp/handlers/visual.ts` begin_visual_reading（四種 kind 嚴格參數）、confirm_visual_reading。
- `src/mcp/handlers/analytics.ts` search_cards、find_similar_cards、get_database_analytics、get_random_cards、get_card_meanings_comparison。
- `src/tarot/cards/card-manager.ts` 載入 card-data.json（單例）、模糊查牌、Fisher-Yates 抽牌。
- `src/tarot/cards/card-schema.ts` card-data 嚴格 schema 驗證（必 78 張、major 也必有 element/number）。
- `src/tarot/cards/card-formatter.ts` 牌義/牌目錄 Markdown（中英）。
- `src/tarot/cards/card-search.ts` 關鍵字加權搜尋、相似牌評分、篩選抽牌。
- `src/tarot/cards/card-analytics.ts` 牌庫統計（完整度、關鍵字頻率、主題）。
- `src/tarot/readings/reading-manager.ts` 解讀流程：session 解析→抽牌→interpretation→formatter→寫 session。
- `src/tarot/readings/session-manager.ts` session 記憶體＋可選 JSON 檔 write-through；上限 1000 session、每 session 30 筆。
- `src/tarot/readings/visual-draw-manager.ts` 兩階段視覺抽牌：begin 預洗 78 張＋定正逆位、confirm 依 slot 對應。
- `src/tarot/readings/spreads.ts` 25 個牌陣定義（英文）。
- `src/tarot/readings/spread-localizations.ts` 25 個牌陣簡中翻譯＋選單目錄。
- `src/tarot/readings/spread-recommender.ts` 關鍵字/類別/時程→牌陣推薦表。
- `src/tarot/readings/lunar-utils.ts` 平均朔望月月相計算、月相推薦牌陣。
- `src/tarot/readings/reading-formatter.ts` 解讀 Markdown 與牌陣目錄輸出。
- `src/tarot/readings/interpretation/index.ts` 組合：逐牌牌義→牌陣分析器→整體分析。
- `src/tarot/readings/interpretation/analyzers.ts` 13 個牌陣專屬分析器＋通用分析。
- `src/tarot/readings/interpretation/patterns.ts` 牌義選擇、元素/花色/數字/宮廷/大牌模式規則。
- `src/tarot/shared/utils.ts` webcrypto 拒絕取樣、Fisher-Yates、ID 產生、50/50 正逆位。
- `src/tarot/shared/validation.ts` 參數驗證、sanitizeString（去控制字元、截 2000 字）。
- `src/tarot/shared/types.ts` 型別、`SPREAD_TYPES`（25）。
- `src/tarot/shared/i18n.ts` 中英取值 helper、花色/元素中文名。
- `src/tarot/shared/visual-reading-schema.ts` begin_visual_reading 輸入 schema（MCP 與 WebMCP 共用）。
- `src/tarot/shared/logger.ts` stderr logger。
- `src/tarot/shared/errors.ts` Domain error 類別。
- `src/tarot/shared/artwork.ts` 牌圖版本與 URI 常數。

### src/__tests__/
- `args.test.ts` CLI 解析（6 it）。
- `browser-handoff.test.ts` handoff sidecar、token/Origin/Host 拒絕、過期、取消、MCP App 能力分流（9 it）。
- `card-analytics.test.ts` 牌庫統計（5）。
- `card-manager.test.ts` formatter、模糊查牌、抽牌（18）。
- `card-search.test.ts` 篩選交集、硬篩、相似度（8）。
- `data-integrity.test.ts` 牌序、schema、RWS 錨點詞、禁用舊詞、Golden Dawn 占星、zh 完整度與全形標點（11）。
- `http-server.test.ts` 子行程起 HTTP：REST、視覺兩階段、Origin、413、Streamable/SSE、Bearer、429（14）。
- `interpretation-dispatch.test.ts` 25 牌陣×中英分析器路由（4 個 it，其中 2 個 it.each×25）。
- `lunar-utils.test.ts` 已知新月/滿月/上下弦日期（11 宣告，含 it.each）。
- `mcp-tool-behavior.test.ts` schema 規則、comparison、history、zh（14）。
- `modern-rws-fixtures.ts` 78 張標準牌序、每張正逆位錨點詞、禁用舊詞（非測試）。
- `protocol-server.test.ts` MCP 錯誤契約、structuredContent、無圖片、資源、prompt、annotations（13）。
- `random-utils.test.ts` 拒絕取樣、範圍（3）。
- `reading-manager.test.ts` 解讀/session/上限/規則回歸（32）。
- `session-persistence.test.ts` JSON 檔持久化（6）。
- `spread-recommender.test.ts` 推薦規則特性測試（11）。
- `stdio-browser-lifecycle.test.ts` stdin 半關閉、ChatWise SIGTERM 延後（2）。
- `stdio-transport.test.ts` stdout 純淨、掛起 tool call 回傳、取消/關閉（3 宣告）。
- `visual-app-resource.test.ts` App HTML 缺檔/權限錯誤（4）。
- `visual-draw-manager.test.ts` slot 不洩漏、驗證、冪等、過期、容量、保留、併發（13）。
- `visual-reading-service.test.ts` begin 參數嚴格、daily/moon 不建 session、月相跨午夜冪等（5）。

### ui/src/（React 前端）
- `DrawApp.tsx` 舞台組合、洗牌 seed（`crypto.getRandomValues`，:159）、選牌/撤銷、widget checkpoint。
- `useDrawSession.ts` 請求/取消/重試/階段狀態機。
- `RitualStage.tsx` 洗牌（22 層牌背動畫）、切牌 slider、跳過。
- `DrawStage.tsx` 選牌台：牌布暫存位、位置清單、工具列。
- `ArcFan.tsx` 78 張弧形扇面、鍵盤/拖曳、proximity lift。
- `ReadingBoard.tsx` 翻牌、詳情、解讀、交回主機對話。
- `ReadingCloth.tsx` 牌布＋FLIP 飛入飛出 slot。
- `ReadingInterpretation.tsx` 把解讀 Markdown 以 React 文字安全渲染（無 innerHTML）。
- `CardDetails.tsx` 牌詳情 modal（focus trap）。
- `PositionKey.tsx` 牌位清單（無障礙替代目標）。
- `RitualProgress.tsx` 六步驟進度列。
- `SetupForm.tsx` 問題/類型/牌陣/月相日期/自訂牌位表單。
- `SetupShell.tsx` 首頁版型與牌組預覽圖。
- `ConnectionSettings.tsx` Bearer token 輸入（存 sessionStorage）。
- `web-client.ts` REST client、handoff token 從 URL fragment 擷取後清除。
- `mcp-client.ts` MCP Apps client、交回對話（ui/message／ChatGPT sendFollowUpMessage）、widgetState 存檔。
- `mcp-card-art.ts` 以 Vite inline 打包 78+1 張 MCP 尺寸牌圖。
- `normalize.ts` 各傳輸 payload 正規化、`assertCompleteVisualDeck`、錯誤擷取。
- `ui-state.ts` 主機存檔快照驗證/還原、送模型用的閱讀摘要（去圖去 slot）。
- `deck-order.ts` 切牌、seed Fisher-Yates（mulberry32）、弧形幾何。
- `selection.ts` 選牌 toggle、鍵盤索引。
- `spreads.ts` 25 牌陣牌布座標＋自動網格。
- `flip.ts` FLIP 動畫 helper。
- `i18n.ts` UI 中英字串。
- `types.ts` UI 型別。
- `useCardImage.ts`／`useFullscreen.tsx`／`card-style.ts` 圖片解析、全螢幕、牌背 CSS 變數。
- `webmcp/registration.ts` `document.modelContext.registerTool` 偵測與回滾註冊。
- `webmcp/useWebMcp.ts` 註冊 3 個瀏覽器 WebMCP 工具。
- `main-web.tsx`／`main-mcp.tsx` 兩個入口。
- `ui/index.html`／`ui/mcp-app.html` HTML 殼；`ui/vite.web.config.ts`（base `/draw/`）、`ui/vite.mcp.config.ts`（singlefile、全 inline）、`ui/vitest.config.ts`（jsdom）。
- `ui/src/styles/*.css` 9 檔樣式（**未讀**，見 §10）。

### ui/src/__tests__/
- `DrawApp.test.tsx` widget 復原、凍結確認、切牌影響選中牌、全流程（15 it）。
- `DrawStage.test.tsx` 拖曳後點擊抑制、鎖定、位置清單、全螢幕（6）。
- `ReadingBoard.test.tsx` 逐張翻、隱藏名、批次翻、交回對話（10）。
- `RitualStage.test.tsx` 手動洗切、減少動態（2）。
- `PositionKey.test.tsx`（2）、`deck-order.test.ts`（19）、`normalize.test.ts`（4）、`selection.test.ts`（2）、`spreads.test.ts`（3）、`mcp-card-art.test.ts`（1）、`ui-state.test.ts`（8 宣告，含 it.each×15）、`useDrawSession.test.tsx`（8 宣告，含 it.each）、`web-client.test.ts`（4）、`webmcp.test.tsx`（7）、`mcp-client.test.ts`（20）、`setup.ts` 空殼。

### scripts/
- `scripts/copy-assets.mjs` 複製 card-data、ASSET_LICENSE、provenance、牌圖到 dist（排除 qa）。
- `scripts/verify-build-assets.mjs` dist 與原檔 sha256 一致、尺寸、單檔 App 內嵌 79 張、≤1.5MB。
- `scripts/art/*` 見 §7。

### 文件/設定
- `README.md` 總覽、執行、部署（ChatGPT Secure MCP Tunnel、Claude 反向代理）。
- `SPEC.md` 視覺抽牌規格與相容性。
- `PRODUCT.md` 產品定位（品牌語氣、無障礙）。
- `DESIGN.md` 設計系統（色票、字體、動效）。
- `docs/api.md` 端點與 16 工具表、錯誤碼→UI 復原。
- `docs/configuration.md` 環境變數、各客戶端設定、部署。
- `docs/webmcp.md` WebMCP 實作說明。
- `.impeccable/design.json` 設計系統機器可讀版（色票/動效/元件 CSS）；`.impeccable/live/config.json` 某工具注入設定（files `ui/*.html`、insertBefore `</body>`）。兩檔內無對 AI 下指令的文字。
- `Dockerfile` 兩階段 node:22-alpine（digest 釘選）、非 root、HEALTHCHECK。
- `docker-compose.yml` 埠綁 `127.0.0.1:3000`、`SESSION_STORE_PATH=/data/sessions.json`。
- `docker-compose.tunnel.yml` 強制 `MCP_AUTH_TOKEN`、`ALLOWED_HOSTS` 預設 `tarot-mcp,localhost,127.0.0.1`、OpenAI tunnel-client v0.0.14。
- `deploy.sh` config→up --build→health→tunnel readyz。
- `.github/workflows/ci.yml` 與 `.gitea/workflows/ci.yml` 內容相同。
- `package.json` 名稱 `tarot-mcp-server`、MIT、作者 Morax、`prepare` 會自動 build。
- `assets/ASSET_LICENSE.md`（範圍外但與牌圖授權直接相關，已讀）。
- `LICENSE` MIT, Copyright (c) 2024 Morax。

## 2. 「已知」逐條確認或更正

- MIT：確認，`LICENSE:1-3`；牌圖另以同一 MIT 授權 `assets/ASSET_LICENSE.md:5-14`。注意版權年不一致：程式 2024（`LICENSE:3`）、牌圖 2026（`assets/ASSET_LICENSE.md:3`）。
- MCP server＋React UI：確認（`src/mcp/protocol-server.ts:109-330`、`ui/src/DrawApp.tsx`）。
- 78 張、25 牌陣：確認；78 由 schema 強制 `src/tarot/cards/card-schema.ts:254-256`，25 見 `src/tarot/shared/types.ts:125-151`、`src/tarot/readings/spreads.ts:8-832`。
- 16 個 MCP 工具：確認 `src/mcp/public-api.ts:28-45`、`src/mcp/handlers/index.ts:33-50`。
- webcrypto 拒絕取樣＋Fisher-Yates：確認 `src/tarot/shared/utils.ts:16-47`。正逆位 50/50：確認 `:59-61`。可注入：確認 `src/tarot/readings/reading-manager.ts:35-38`、`src/tarot/readings/visual-draw-manager.ts:135-143`。
- 不呼叫 LLM、本機規則引擎：伺服器端確認（無任何 LLM 依賴，`package.json:44-52`）。**補充**：MCP App 在使用者按「Interpret in chat」後，會把整份已確認牌面與本機解讀文字送進主機對話給主機的 LLM（`ui/src/mcp-client.ts:225-291`、`:72-109`）；server 本身仍不呼叫。
- 每日牌每次重抽：確認，`get_daily_card` 每次呼叫 `performReadingWithDetails`、無日期種子 `src/mcp/handlers/sessions.ts:116-137`。
- HTTP 可選 Bearer：確認 `src/mcp/http-server.ts:275-287`。限流每分 120：確認但可由 `RATE_LIMIT_MAX`/`RATE_LIMIT_WINDOW_MS` 調整 `:255-271`。預設綁 0.0.0.0：確認 `src/mcp/args.ts:97`（Docker compose 改在主機端綁 127.0.0.1 `docker-compose.yml:5`）。沒設 token 即全開：確認 `src/mcp/http-server.ts:276`；**補充** `/draw`、牌圖、`/health` 無論有沒有 token 都公開（`:187-198`、`:237-240`、`:275-277`）。
- session 存記憶體或 JSON 檔、ID 約 30 bit：確認 `src/tarot/readings/session-manager.ts:40-52`；ID = `prefix_毫秒時間戳_` + `getSecureRandomInt(1e9)`（≈29.9 bit）`src/tarot/shared/utils.ts:52-56`。
- 牌圖 AI 生成、MIT：確認 `assets/ASSET_LICENSE.md:5-22`、`scripts/art/README.md:3-5`。provenance 雜湊 80/80 吻合：本次未重算（JSON 不在範圍），但 `scripts/art/validate-deck.mjs:159-239` 的確逐張比對 source/web/mcp 雜湊與 provenance。QA 審查人「Codex visual QA」：本次未讀 `assets/cards/qa/manual-review.json`，無法確認；**補充**：manual review 的 5 個布林欄位是人工填的，腳本只檢查為 true（`validate-deck.mjs:119-127`），`cardBackExactDecodedSymmetryVerified` 由 `finalize-manual-review.mjs:34` 直接寫死 true，OCR 的 `manual-review-completed` 只靠 `--mark-reviewed` 旗標（`build-ocr-audit.mjs:12`、`:50-52`）——「審查完成」是自我宣告，非機械證明。
- 美術腳本不呼叫 OpenAI、不下載：確認（7 支腳本只用 fs、crypto、sharp、本機 `tesseract` 子行程 `build-ocr-audit.mjs:13-27`）。
- 英文牌義範本套出、中文為簡體：英文部分本次無法驗證（card-data.json 不在範圍）；data-integrity 測試只要求每欄 ≥60 字＋錨點詞（`src/__tests__/data-integrity.test.ts:98-127`）。中文簡體確認（`src/tarot/shared/i18n.ts:9-31`、所有 pick 的 zh 字串）。
- 無遙測、無 eval：確認；只有 stderr logger（`src/tarot/shared/logger.ts:27-43`），無任何 analytics 依賴；沒有 LLM 評測，只有單元/整合測試。

## 3. 本機規則引擎完整規則（`src/tarot/readings/interpretation/*`）

### 3.0 組裝順序 `interpretation/index.ts:12-64`
1. 開頭 `This {spreadName} reading addresses your question: "{q}"`（:19-23）。
2. 逐牌：`**{position}**: {name}{(upright|reversed)}` ＋ `selectRelevantMeaning` 選一段牌義（:26-48）。
3. 牌陣專屬分析器；回 "" 且 >1 張則用通用分析（:53-58）。
4. 整體分析 `generateOverallInterpretation`（:61）。

### 3.1 牌義欄位選擇 `patterns.ts:45-117`
- 比對字串 = `question + position + positionMeaning` 小寫，**子字串比對**（:51、:115-117）。依序第一個命中即採用：
  - love：love, relationship, romance, partner, marriage, affection, 爱情, 感情, 恋爱, 关系, 伴侣, 婚姻（:54-68）
  - career：career, job, work, business, money, finance, study, 事业, 工作, 职业, 财务, 金钱, 学习（:69-84）
  - health：health, wellness, body, energy, rest, 健康, 身体, 精力, 休息（:85-96）
  - spirituality：spiritual, purpose, meaning, soul, growth, 灵性, 精神, 意义, 使命, 成长（:97-109）
  - 其他 → general（:112）

### 3.2 整體分析 `patterns.ts:122-192`
- 大牌比例：`major > total/2` → "heavily influenced by Major Arcana … karmic influences"；`major==0` → "only Minor Arcana … within your control"；其餘 → "balance of Major and Minor … spiritual guidance and practical action"（:134-152）。
- 正位比例（%）：≥80 正面順流；≥60 大致正面；≥40 喜憂參半；≥20 逆位居多、內在阻礙；<20 深層轉化/靈性危機（:155-186）。
- 接著依序：元素→花色→數字→宮廷→大牌模式，最後固定句 "Trust your intuition…"（:197-230）。

### 3.3 元素 `patterns.ts:235-308`
- 計數所有牌的 `element`（大牌也有 element，schema 強制 `card-schema.ts:231-233`）。
- 主導元素 `count > total/2` 才出句：fire=行動創造、water=情緒直覺、air=思考溝通、earth=務實物質（:261-292）。
- 缺席元素（count 0）一律列出 "The absence of X and Y energy…"（:295-305）——3 張以下的牌陣幾乎必觸發。

### 3.4 花色 `patterns.ts:313-361`
- 只看小牌；最多的花色數 ≤1 不出句；否則 wands=創意事業行動、cups=情感關係、swords=心智衝突溝通、pentacles=物質財務（:326-358）。平手時取 sort 後第一個（無決勝規則）。

### 3.5 數字 `patterns.ts:366-433`
- 取**所有牌**（含大牌 0–21）的 number，<2 張不出句（:370-374）。
- 平均 ≤3 起步；≤6 發展；≤9 接近完成；>9 "high numbers and court cards … significant people"（:380-404）——大牌拉高平均，常誤觸最後一句。
- 重複數字（count>1）→ 主題表 1–14（:8-40）："The repetition of {nums} emphasizes the themes of {themes}."（:424-430）。大牌與小牌同號也算重複（如 Magician=1 與 Ace=1）。

### 3.6 宮廷牌 `patterns.ts:438-464`
- 以英文名含 Page/Knight/Queen/King 判定；1 張 → "a specific person or personality aspect"；≥2 → "{n} court cards … multiple people"。

### 3.7 大牌模式 `patterns.ts:469-521`
- ≥2 張大牌：號碼跨度 >10 → "significant life transformation"；<5 → "specific phase"（:484-499）。
- 組合：Fool+Magician（:504-510）、High Priestess+Hierophant（:512-518）。僅此兩組。

### 3.8 牌陣專屬分析器 `analyzers.ts`（以 spreadType id 路由 :14-45；張數不符回 ""）
- three_card（3）：過去/現在/未來正逆組合：逆正正→困境到成功；正逆正→暫時挫折；正正正→持續向好；其他→複雜旅程（:169-222）。
- celtic_cross（10）：現在與挑戰同向→挑戰清楚可直面，異向→表裡反差；可能結果 vs 最終結果「相似能量」（同向且同花色或同大小阿卡納 `:1177-1186`）→不需劇變，否則需修正；近未來正→助力、逆→挑戰；另兩句固定敘述遠過去/近過去、態度/外在/希望恐懼（:50-144）。
- relationship_cross（7）：你/伴侶同向→相似情緒；前 4 張正位 ≥3 → 正面支持，否則需經營（:227-278）。
- career_path（6）：技能與機會皆正→有利時機；否則挑戰位逆→障礙消散；否則先提升技能（:283-323）。
- spiritual_guidance（6）：第 1 張正/逆兩句；阻礙位逆→阻礙消融（:328-369）。
- chakra_alignment（7）：正位比 ≥70%/≥50%/其餘三句；下三輪 vs 上三輪正位數比較兩句（第 4 張心輪不計）（:374-430）。
- year_ahead（13）：主題牌正/逆；12 月切 4 季，每季正位 ≥2 → 正面，否則耐心（:435-505）。
- venus_love（7）：目前能量、自愛、未來 正/逆各兩句；吸引與阻礙固定句（:510-593）。
- tree_of_life（10）：嚴厲柱（Binah/Geburah/Hod）vs 慈悲柱（Chokmah/Chesed/Netzach）正位數比較；Kether 與 Malkuth 同向→對齊（:598-663）。
- astrological_houses（12）：火/土/風/水三宮正位數取最大（平手取先出現者）；四角宮正位 ≥3/≥2/其餘（:668-741）。
- mandala（9）：中心正/逆；8 方位正位 ≥6/≥4/其餘；4 組對位同向數 ≥3 → 整合良好（:746-842）。
- pentagram（5）：四元素位正位數 4/≥3/≥2/其餘；靈位正逆；各元素位正位各加一句（:847-949）。
- mirror_of_truth（4）：四束光各依正逆兩句；你/對方同向、事實/指引同向；正位數 4/3/2/1/0 五句（:954-1159）。
- 無專屬（horseshoe、decision_making、shadow_work、yes_no、weekly_forecast、new/full moon、elemental_balance、past_life_karma、compatibility、所有自訂）→ 通用：「從首位到末位…以牌位、正逆位、元素平衡、問題語境作框架」（:146-164；路由表見 `src/__tests__/interpretation-dispatch.test.ts:12-38`）。
- 評語：全部規則只用「正/逆位」二元＋計數門檻，不看具體牌義；yes_no 不給是/否答案。

### 3.9 spread-recommender `spread-recommender.ts:44-312`
- 規則觸發 = 類別相符 OR 時程相符 OR 問題小寫含任一關鍵字（子字串）（:296-301）；匯集→去重→信心降冪→最多 3 個（:305-311）；全無命中→three_card 0.6、celtic_cross 0.5（:268-281）。
- love：love, relationship, partner, 爱情, 恋爱, 感情, 关系, 伴侣, 对象, 婚姻 → venus_love .9、relationship_cross .8、compatibility .7（:45-79）
- career：job, career, work, 工作, 事业, 职业, 求职, 升职, 职场 → career_path .9（:80-101）
- spiritual：spiritual, soul, purpose, 灵性, 灵魂, 使命, 人生目的 → spiritual_guidance .9、tree_of_life .8（:102-127）
- decision：should i, decision, choose, 应该, 决定, 抉择, 选择 → decision_making .9、yes_no .7（:128-153）
- immediate：today, now, 今天, 现在, 当下 → daily_guidance .8、single_card .7（:154-171）
- short_term：week, month, 本周, 这周, 一周, 本月, 这个月 → weekly_forecast .8、three_card .7（:172-189）
- long_term：year, future, 今年, 明年, 一年, 未来, 长期 → year_ahead .9、celtic_cross .8（:190-207）
- past life, karma, 前世, 业力, 因果 → past_life_karma .9（:208-218）
- moon, lunar, cycle, 月亮, 月相, 月球, 周期 → new_moon_intentions .8、full_moon_release .8（:219-235）
- balance, element, 平衡, 元素 → elemental_balance .8（:236-246）
- shadow, hidden, unconscious, 阴影, 隐藏, 潜意识, 无意识 → shadow_work .9（:247-265）
- 月相解讀另外用 `lunar-utils.ts:40-97` 各月相 recommendedSpreads 第一個。

## 4. 視覺兩階段抽牌：狀態機與防作弊

### 4.1 伺服器狀態機 `src/tarot/readings/visual-draw-manager.ts`
- 狀態 `pending | confirming | confirmed | expired`（:113）。
- begin（:183-305）：sweep→冪等鍵檢查（同鍵不同參數 409 `IDEMPOTENCY_CONFLICT`，已過期 410）→容量檢查（pending+confirming ≥1000 或 confirmed+expired ≥1000 → 503 `DRAW_CAPACITY_REACHED`，:219-231）→`getRandomCards(78)` 全副洗牌（:234）→每張配 `slot_<UUID>` 與**當下即定**的正逆位（:236-244）→回傳只有 `{slotId, order}`（:245、:277-283）；pending TTL 30 分、保留 24 小時（:152-153）。
- confirm（:307-379）：不存在 404；過期 410；已 confirmed 且同順序→回快取結果，不同→409 `DRAW_ALREADY_CONFIRMED`；confirming 中同順序→共用 promise，不同→409；驗證張數/重複/歸屬（400 `INVALID_SELECTION_COUNT|DUPLICATE_SLOT|INVALID_SLOT`，:381-412）→ `performPreparedReadingWithDetails`（才建 session，:414-427）→ confirmed，刪 deck（:367-371）；例外則回 pending（:373-378）。
- sweep：pending 過期→expired（刪 deck）；expired/confirmed 超過 retainUntil→刪除（:465-482）。
- 防作弊要點：牌與正逆位在 begin 時伺服器端固定；前端只拿到不透明 slot（UUID）；MCP 傳輸再把 slots 移出 model 可見的 structuredContent，只放 `_meta.visualDeck`（`src/mcp/protocol-server.ts:140-154`）；所有圖片欄位在 MCP 邊界剝除（:38-60、:299-301）；`performPreparedReadingWithDetails` 不接受任意牌 ID（`reading-manager.ts:176-208`）。
- 前端洗/切只重排呈現：`ui/src/deck-order.ts:1-9` 明說不增加隨機性；洗牌 seed 用 `crypto.getRandomValues`（`ui/src/DrawApp.tsx:158-162`），切牌 `cutDeck` 旋轉順序（`ui/src/deck-order.ts:30-35`）；但因選的是「位置」，切點確實改變拿到哪張（`src/__tests__/..`對應 UI 測試 `ui/src/__tests__/DrawApp.test.tsx:486-536`）。
- 未防的：同一使用者可不斷開新 draw 直到滿意（每次新冪等鍵）；confirm 後整副結果（含未翻開的牌）一次送到前端，「逐張翻」純屬呈現（`ui/src/ReadingBoard.tsx:188-194`）。

### 4.2 前端狀態機
- 頁面階段 `setup | waiting | ritual | selecting | confirming | reading`（`ui/src/useDrawSession.ts:17-18`）。web 起始 setup，MCP 或帶 handoff 起始 waiting（:34-38）。
- 儀式子階段 `ready | shuffling | shuffled | cut | opening`（`ui/src/RitualStage.tsx:81-83`）。
- 確認：送出前凍結 `{drawId, selectedSlotIds}`、寫 widget checkpoint（`useDrawSession.ts:236-269`）；只有 `INVALID_SELECTION_COUNT|DUPLICATE_SLOT|INVALID_SLOT` 解鎖允許改牌（:288-296），其餘錯誤保持鎖定只能以原順序重試（:297-308）；過期/衝突只能重新開始（`DrawApp.tsx:226-262`）。

### 4.3 handoff token `src/mcp/browser-handoff.ts`
- token = `HMAC-SHA256(每行程 32 bytes 隨機 secret, drawId)` base64url（:192、:412-414）；伺服器只存 `sha256(token)` 為 key（:225-246）。
- URL `http://127.0.0.1:{port}/draw/#handoff={token}`（fragment，不進伺服器 log，:249）；前端擷取後存 sessionStorage 並清掉網址（`ui/src/web-client.ts:38-62`）。
- 驗證：`Authorization: Tarot-Handoff <token>`，缺→401、錯→404、未確認且過期→410（:641-661）。只開兩個 POST：resolve（回 draw 或已確認結果）、confirm（呼叫同一 `confirm_visual_reading`，:663-729）。
- 監聽 127.0.0.1、Host 必等於 baseUrl host、非 GET 的 Origin 必等於 baseUrl（:555-576）；resolve/confirm 限流 120/分（:577-588）；body 上限 32kb（:589）；CSP `frame-ancestors 'none'`（:631-639）。
- 生命週期：過期隨 draw expiresAt（:428-456）；確認後記錄保留 24 小時（:85、:716-717）；原 MCP tools/call 掛起，確認後 resolve，期間每 15 秒 progress 心跳（`protocol-server.ts:190-231`）；waiter 期間 listener `ref()` 防 stdio 子行程退出（:491-513）。
- 模式 `auto|off|force|link`（:21、:102-130）；auto 在 CI/HEADLESS/SSH/NODE_ENV=test/無 DISPLAY 的 Linux 不自動開瀏覽器。開瀏覽器 `spawn` 不經 shell，只允許 loopback `/draw/` URL（:133-181）。

## 5. HTTP／MCP 傳輸層

### 5.1 端點（`src/mcp/public-api.ts:8-26`）
- 公開不需 token：`GET /health`（回 session 數、transport 數、端點表 `http-server.ts:296-305`）、`GET /draw`、`/draw/*`、`/assets/cards/midnight-art-nouveau-v1/*`（`static-assets.ts:43-106`）。
- 需 token（若設定）：`/mcp`（POST/GET/DELETE）、`/sse`、`/messages`、`/api/info`、`/api/spreads`、`/api/cards[/:cardName]`、`POST /api/reading`、`POST /api/custom-spread`、`POST /api/visual-readings`、`POST /api/visual-readings/:drawId/confirm`、`POST /api/tools/:toolName`（`api-router.ts:61-182`）。
- handoff 專用（只在 stdio 行程的 127.0.0.1 sidecar）：`POST /api/visual-handoff/resolve|confirm`。

### 5.2 中介層順序（`http-server.ts:203-290`）
1. request log＋`X-Request-Id`（:205-219）。
2. CORS：無 Origin 或允許清單（`*`、`ALLOWED_ORIGINS`、localhost/127.0.0.1/::1）才回 CORS 標頭；暴露 `Mcp-Session-Id` 等（:221-233）。
3. Origin/Host 守門（`/health` 除外）：Origin 不在清單且**不等於 Host**→403；`ALLOWED_HOSTS` 有設時 Host 必在清單或本機名，**沒設則任何 Host 都過**（:129-140、:237-251）。
4. 公開靜態（:253）。
5. 限流（express-rate-limit，預設 120/60s，套用 `/api`、`/mcp`、`/sse`、`/messages`）（:255-271）；**在 auth 之前**，未授權請求也吃同一配額。
6. Bearer（timing-safe）（:275-287）。
7. JSON body 上限 4mb（:289）；解析錯誤回 JSON（MCP 路徑 -32700）（:146-180）。
- Streamable HTTP：`enableJsonResponse: true`、session ID `randomUUID`、未知 session 404、上限 `MCP_MAX_TRANSPORT_SESSIONS` 預設 100、閒置 30 分、每 5 分清掃、有 SSE 串流則送 keepalive（`transports.ts:13-14`、:37-38、:102-202）。舊 SSE 同上限（:255-297）。
- CSP（公開 /draw）：`default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'`、快取 300 秒（`http-server.ts:21-27`）。

### 5.3 已知弱點
- **DNS rebinding 防護在預設設定下失效**：同源放行 `isSameOrigin` 只比 Origin host 與 Host 標頭相等（`http-server.ts:108-118`）；`ALLOWED_HOSTS` 未設時 Host 不檢查（:130-132）。攻擊網域 rebinding 到 127.0.0.1 時 Origin 與 Host 都是攻擊網域 → 放行。測試甚至以任意 `tarot.example` 驗證會 200（`src/__tests__/http-server.test.ts:371-377`）。tunnel compose 有設 `ALLOWED_HOSTS` 所以生產例外（`docker-compose.tunnel.yml:7`），但 README 的本機 `npm run start:http` 沒有。
- 限流以 IP 計但未設 `trust proxy`；文件建議的 nginx 反代（`docs/configuration.md:321-338`）與 Docker 埠映射下所有人共用一個來源 IP → 實際是全域 120/分，且未授權請求也消耗配額（`http-server.ts:255-287`）。
- 視覺 draw 容量可被灌滿：1000 pending 或 1000 已確認/過期記錄即全站 503，保留 24 小時（`visual-draw-manager.ts:219-231`、:152-155）；在 120/分下約 9 分鐘可打滿。
- session 上限 1000，超過逐出最舊（`session-manager.ts:58-60`）→ 任何人大量 perform_reading 可逐出他人 session。
- `get_session_history` 只憑 session ID（≈30 bit＋時間戳）即可讀他人問題全文（`handlers/sessions.ts:276-383`）。
- `/health` 公開洩漏 session 數與 transport 數（`http-server.ts:296-305`）。
- `getSession` 每次讀都同步寫整份 JSON 檔（`session-manager.ts:81-88`、:230-257），讀放大成寫。
- 冪等鍵是全域命名空間，不綁呼叫者（`visual-draw-manager.ts:194-217`）；schema 已註明當作 capability（`visual-reading-schema.ts:17-22`）。
- handoff token 確認後 24 小時內仍可 resolve 讀回結果（`browser-handoff.ts:85`、:663-676），SPEC 說「short-lived」（`SPEC.md:228`）。
- Windows 開瀏覽器以 `explorer.exe` 結束碼 0 判定成功（`browser-handoff.ts:149-171`）；explorer 常回非 0，可能誤判為未開啟（推論，未實測）。

## 6. 文件與程式不一致；授權/來源/OpenAI 原文位置

### 6.1 不一致
- `docs/configuration.md:25` 寫「Rate limit per IP」：未設 trust proxy，反代/Docker 後實為共用（見 5.3）。
- `SPEC.md:228` handoff token「short-lived」：確認後保留 24 小時（`browser-handoff.ts:85`、:717）。
- `README.md:4` 稱「complete 78-card Rider–Waite–Smith deck」：牌義依 RWS，但牌圖是自製 Art Nouveau（`assets/ASSET_LICENSE.md:24-26`）。
- `docs/api.md:64-71` 把「Context-Aware Interpretations」列為進階功能：實作是子字串關鍵字，`energy` 等詞會誤判（見 §9）。
- `DESIGN.md:194-205` 的 820ms 扇面掃光等動效數值：TS 端 1500/620/420 對得上（`RitualStage.tsx:29-32`、`flip.ts:22`），820ms 在 CSS，未讀無法核對。
- `LICENSE:3`（2024）與 `assets/ASSET_LICENSE.md:3`（2026）版權年不同。
- 其餘 SPEC/api/configuration 的狀態碼、TTL、容量、錯誤→復原表與程式一致（`visual-draw-manager.ts:152-155`、`useDrawSession.ts:288-308`、`DrawApp.tsx:226-262`）。

### 6.2 牌圖來源/授權原文位置（每一句）
- `README.md:4-5` "original Midnight Art Nouveau artwork"。
- `README.md:101-104` 原始 PNG、provenance、QA 檔保留說明。
- `README.md:167` 連結 Artwork license and provenance。
- `README.md:169-170` "Code is licensed under MIT … Artwork has its own documented provenance and licensing terms."
- `assets/ASSET_LICENSE.md:3` Copyright (c) 2026 Morax。
- `assets/ASSET_LICENSE.md:5-14` `assets/cards/`、`assets/artwork/` 以同一 MIT 授權；「To the extent that copyright or related rights subsist」條件句（:11）。
- `assets/ASSET_LICENSE.md:18-22` 以 OpenAI 內建 `image_gen` 依自寫 prompt 生成、腳本後製；未下載、未複製第三方牌組。
- `assets/ASSET_LICENSE.md:24-26` 傳統象徵為描述性題材，構圖/配色/邊框/牌背為原創。
- `assets/ASSET_LICENSE.md:28-36` prompt/雜湊所在、無生成文字、點數與 rank 為確定性後製、牌背對稱法。
- `assets/ASSET_LICENSE.md:38-42` AS IS 無擔保（含 noninfringement）。
- `scripts/art/README.md:3-5` 不下載/不熱連結；每張經一次獨立 OpenAI `image_gen` 呼叫。
- `SPEC.md:212-214` "generated for this project without third-party card imagery"。
- `scripts/art/generate-prompt-plan.mjs:109`、`generate-provenance.mjs:69-73`、`process-deck.mjs:317-323` 機器欄位 `generator: "OpenAI built-in image_gen"`、`thirdPartyDownloads: false`、`createdDate: "2026-08-05"`。
- **OpenAI 使用條款**：全 repo `.md` 無任何一句提及（Grep `OpenAI|terms` 只命中上列與 tunnel 部署文字）。
- 商用判斷事實：MIT 允許商用（`LICENSE:5-10`）；但授權方自己承認版權未必成立（`ASSET_LICENSE.md:11`），且無擔保不侵權（:38-42）；生成過程（實際 `image_gen` 呼叫）不在 repo 內，無法獨立驗證「無第三方圖」宣稱。

## 7. scripts/art 與可重現程度
- `generate-prompt-plan.mjs`：由 card-data 產生每張 prompt（大牌用 symbolism＋前 3 關鍵詞，小牌用 rank 場景表＋花色主題、明令禁止畫出花色物件），寫 `assets/artwork/prompt-plan.json`；記 style board 雜湊（:15-61、:71-87、:89-125）。
- `generate-provenance.mjs`：合併 plan 與 `prompt-overrides.json`，計算 style board／牌背／78 張 source PNG 的 sha256 與 prompt 雜湊，寫 `prompt-provenance.json`；style board 與牌背的 prompt 原文寫在腳本內（:16-26、:47-83）。
- `process-deck.mjs`：sharp 把 1024×1536 source 裁成 512×768 Web、192×288 MCP WebP（品質自降至合乎 180KB/24KB），疊 SVG 邊框＋羅馬數字 rank＋1–10 點數或宮廷 1 個徽記；牌背與其 180° 旋轉逐像素平均→128 色→無損 WebP；寫 manifest（:42-61、:107-135、:154-197、:207-362）。
- `build-contact-sheets.mjs`：產 7 張 QA 拼貼（Web、MCP、3 張細節、牌背對稱、代表樣本）（:21-214）。
- `build-ocr-audit.mjs`：有 tesseract 就 OCR 每張 source 找文字；`--mark-reviewed` 直接標「已人工審」（:12-62）。
- `finalize-manual-review.mjs`：把 7 張 QA 圖雜湊寫進 manual-review.json，並寫死 `cardBackExactDecodedSymmetryVerified = true`（:21-41）。
- `validate-deck.mjs`：78 id/順序、雜湊、尺寸、去重、預算、牌背解碼後逐像素對稱、QA 雜湊、人工欄位為 true（:80-351）。
- 可重現到哪：prompt 文字可重現（確定性）；**生成步驟不在 repo**（無呼叫程式碼，靠外部手動/agent），source PNG 直接提交；source→WebP、邊框、點數、牌背對稱可完整重跑（位元組是否相同取決於 sharp/libvips 版本）；人工審查結論無法重現，只有旗標。

## 8. 測試與 CI
- 測試宣告數（Grep `it(`/`it.each`，it.each 只算 1）：伺服器 20 檔、UI 15 檔，共 303；展開 it.each 後實際案例更多（例：`interpretation-dispatch.test.ts:109-163` 為 25×2；`ui-state.test.ts:143-175` 為 15）。各檔數見 §1。
- 涵蓋：視覺抽牌伺服器規則完整（`visual-draw-manager.test.ts`）、HTTP 端對端以子行程跑（`http-server.test.ts:94-129`）、stdio 真子行程（`stdio-*.test.ts`）、UI 復原/鎖定/交回對話很細。
- 未涵蓋：規則引擎內容正確性（只驗標題與少數句子，`reading-manager.test.ts:293-491`）；`selectRelevantMeaning` 誤判（§9）；DNS rebinding；容量 DoS；Windows 開瀏覽器。
- CI（`.github/workflows/ci.yml:8-30` 與 `.gitea/workflows/ci.yml:8-30` 完全相同）：Node 20/22 矩陣 `npm ci`（觸發 prepare build）→`verify:build`→`test:coverage`→`test:ui`→`lint`；另一 job `docker build`。覆蓋率門檻 lines 64/functions 72/branches 56/statements 64（`vitest.config.ts:16-24`）。

## 9. 程式缺陷
- C1 牌義選擇子字串誤判：`"energy"` 屬 health（`patterns.ts:89`），而 weekly_forecast 每個牌位意義都含 "Energy and focus"（`spreads.ts:652-676`）、new_moon 第 1 位 "Current Energy"（:687）→ 除非命中 love/career，這些牌位一律顯示**健康**牌義；`rest` 命中 interest/forest、`work` 命中 network、`body` 命中 somebody（`patterns.ts:115-117`）。
- C2 推薦器子字串誤判：`now` 命中 "know"（"What do I need to know" → daily_guidance）、`cycle` 命中 bicycle、`work` 命中 network（`spread-recommender.ts:156`、:220、:85、:300）。
- C3 數字平均混入大牌：大牌 0–21 拉高平均，常輸出 ">9 … court cards" 句（`patterns.ts:370-404`）；重複數字把大牌與同號小牌視為重複。
- C4 元素缺席句：所有牌含大牌都有 element，3 張內的牌陣幾乎一定輸出「缺少 X 與 Y 能量」（`patterns.ts:295-305`）。
- C5 容量 DoS／session 逐出／歷史外洩（§5.3）。
- C6 DNS rebinding 預設放行（§5.3）。
- C7 冪等紀錄 retainUntil 在 confirm 後未更新（`visual-draw-manager.ts:297-302` vs :371），可能比結果記錄早刪；影響小。
- C8 `isValidSpreadType` 用 `in` 判斷（`spreads.ts:849-851`），`toString`/`constructor` 會被當有效；目前所有入口先過 `validateSpreadType` 白名單（`handlers/sessions.ts:37`、`handlers/visual.ts:120`），屬潛伏缺陷。
- C9 模糊查牌回第一個子字串命中（`card-manager.ts:101-109`）：`get_card_info "Cup"`、`tarot://cards/a`（`resources.ts:93-99`）會靜默回傳某張牌而非報錯。
- C10 `get_card_meanings_comparison` 的「組合訊息」只依張數套 3 種範本（`handlers/analytics.ts:521-539`）；schema language 無 enum（`tool-definitions.ts:693-697`）。
- C11 中文字串混半形逗號 `,`（`analyzers.ts:645`），資料測試只檢查牌庫與牌陣，不檢查分析器字串（`data-integrity.test.ts:271-293`）。
- C12 `getSession` 讀即寫檔（§5.3）。
- C13 QA 結論自我宣告（§2、§7）。

## 10. 實際逐行讀完／未讀
- 已逐行讀完（行數＝wc）：
  - `src/**/*.ts` 全部 67 檔（不含 card-data.json）：17,700 行（測試 21 檔 5,428、mcp 22 檔 5,369、tarot 24 檔 6,903）。含先前讀者已讀之 6 檔重讀。
  - `ui/src/**/*.ts|tsx` 非測試 32 檔 5,687 行；UI 測試 16 檔 4,131 行；`ui/index.html`、`ui/mcp-app.html`、`ui/vite.*.config.ts`、`ui/vitest.config.ts` 共 128 行。
  - `scripts/**`（含 art README）10 檔 1,535 行。
  - `docs/*.md` 650、`SPEC.md`＋`PRODUCT.md`＋`DESIGN.md`＋`README.md` 697、`.impeccable/*` 288。
  - `Dockerfile` 52、`docker-compose.yml` 23、`docker-compose.tunnel.yml` 25、`deploy.sh` 54、兩個 workflow 60、`package.json` 100、根 `vitest.config.ts` 27、`LICENSE` 21、`assets/ASSET_LICENSE.md` 43。
  - 合計 31,221 行。
- 範圍內未讀：`ui/src/styles/*.css` 9 檔 2,668 行（base 201、controls 190、draw 597、index 9、overlays 232、reading 221、responsive 220、ritual 553、setup 433、waiting 12）——為控制 context 留給報告，判定對所問 10 題影響低；DESIGN.md 的 CSS 動效數值因此未核對。
- 範圍外未讀：`ui/tsconfig.json`、`tsconfig.json`、`eslint.config.js`、`.dockerignore`、`.gitignore`、`.env.example`、`assets/**/*.json`（含 manual-review.json、prompt-overrides.json）、card-data.json、lockfile、圖片。
