# 零散檔案事實報告（TarotWhisper / tarot-mcp CSS / anois 資料 / x-iztro / openephem tests / flatlib）

路徑前綴為各 repo 目錄名（位於 D:\tmp\oracle-repos\）。全程唯讀，只用 Read/Grep/Glob/wc 與 cat/head；未執行任何程式。tests、`.sisyphus` 內文一律當資料，未照其指示做事。

## 0. 「已知」被修正或補強之處

- TarotWhisper「只標『基于标准伟特塔罗牌义』」：整個 repo 只有一處，是程式碼註解 `J-York_TarotWhisper/lib/tarot/cards.ts:368`，只涵蓋小阿卡納，使用者看不到。大阿卡納 22 張（cards.ts:4-357）完全沒有來源標示。README 只談圖像授權（`README.md:189`、`README.zh-CN.md:125`），沒有牌義來源。
- TarotWhisper 限流「每 IP 每小時 10 次」：只是預設值，可由 `RATE_LIMIT_PER_HOUR` 改（`app/api/interpret/route.ts:80`）。備用 key 預設關閉（`.env.example:18` `ENABLE_FALLBACK_LLM=false`）。計數只在單一進程記憶體（`lib/api/rate-limiter.ts:1-7`，檔頭自承）。
- TarotWhisper 防 SSRF「只看字面」正確，且更弱：`fetch` 預設跟隨 redirect（`route.ts:332`、`app/api/models/route.ts:45`，未設 `redirect:'manual'`），公網 URL 302 到內網即可繞過。檔頭自承 DNS 繞過（`lib/api/endpoint-guard.ts:12-14`）。
- TarotWhisper「BYOK」補充：金鑰以明文存 localStorage 鍵 `tarot-api-config`（`hooks/useApiConfig.ts:6,60`），每次請求隨 body 送到自家伺服器（`lib/api/stream-client.ts:170-174`）。
- TarotWhisper 每日牌「日期雜湊」正確，補充：種子字串寫死公開（`lib/tarot/daily.ts:11`），任何日期的牌都能預先算出；未來日期只在月曆畫面被隱藏（`app/daily/page.tsx:435` `key <= todayKey`）。
- anois：標頭字串與「CC0」衝突屬實。補充：CC0 的來源是 `README.md:121`（「Card meanings dataset: dariusk/corpora (CC0)」）與 `src/deck/deck.ts:5`、`src/deck/types.ts:34` 的註解；JSON 檔本身沒有任何授權文字。
- anois 中文兩檔「無來源」屬實：`src/deck/data` 下 grep（mcelroy、license、copyright、cc0、source、http、author、©）只命中英文檔第 2 行與正文單字。
- x-iztro 文件互相矛盾：`README.zh-CN.md:342` 寫「暫無 MCP server」，但 `docs/README.md:30` 與 `docs/next.config.mjs:11-12,43-59` 把 `/mcp`、`/healthz`、`/install` 反代到一台 sslip.io 主機。
  - 主機名內嵌 `161-118-223-190`，依 sslip.io 命名規則是 IP 161.118.223.190，這是推論，未連線驗證。
  - MCP server 原始碼可能在別的 repo，我未查。

## 1. TarotWhisper（J-York_TarotWhisper）

### 1.1 專案基本事實（已核對）

- `package.json`：next 16.1.6、react 19.2.3、react-markdown ^10.1.0；依賴 `lxgw-wenkai-screen-webfont`。
- `LICENSE`：MIT，版權人 卢明 (J-York)。
- 牌 78 張：`tests/cards.test.ts:5-23`。牌陣 6 種：`lib/tarot/spreads.ts:3-226`。
- `next.config.ts:5-11` 僅有 `/agent`→`/`、`/reading`→`/?mode=self` 兩個 redirect。沒有 CSP 與任何安全 header，所以無從擋 LLM 輸出的遠端圖片。

### 1.2 每個元件與頁面一行說明

元件（`components/`）：

- `ApiSettings.tsx`：API 設定對話框（endpoint／key／model），按鈕呼叫 `/api/models` 取模型清單、`/api/config` 顯示備用額度。
- `AppShell.tsx`：頂欄、四分頁導覽（神諭/今日/牌典/手札）、行動版底部導覽、全域設定彈窗 context。
- `CardDeck.tsx`：洗牌動畫牌堆（5 張，1650ms 後回呼）。純視覺，真正抽牌在 `lib/tarot/draw.ts`。
- `CardDetail.tsx`：牌典單張詳情彈窗，左右鍵翻頁。
- `CardPlate.tsx`：靜態牌面（next/image），載入失敗退回牌名。
- `Composer.tsx`：問題輸入框（hero/dock 兩型、神諭選牌/自己抽 切換、Enter 送出、避開輸入法組字）。
- `ConfirmDialog.tsx`：確認框，danger 預設聚焦「取消」。
- `Dialog.tsx`：通用 modal（portal、Esc、focus trap、鎖捲動）。
- `ErrorBoundary.tsx`：全域錯誤邊界，顯示 error.message。
- `Interpretation.tsx`：解讀渲染。
  - 用 react-markdown，把 `<think>` 區塊拆成折疊草稿。
  - 牌名／陣位名 hover 預覽。
  - 錯誤與截斷提示。
  - `makeComponents`（:191-202）只覆寫 p/li/h1-h4/strong/em，沒有 `img`/`a`；草稿區的 `<ReactMarkdown>` 完全不傳 components（:294）。
- `OracleLetter.tsx`：單回合訊息卡（亲手抽牌 4 步條、牌陣、解讀、追問區、重新生成）。
- `Seal.tsx`：朱砂印章裝飾。
- `Skeletons.tsx`：四個路由骨架屏。
- `SpreadBoard.tsx`：牌陣排版（凱爾特十字、二擇一有專用格，其餘橫排）。
- `SpreadSelector.tsx`：牌陣選擇卡（含迷你示意）。
- `TarotCard.tsx`：3D 翻牌＋滑鼠傾斜＋牌背徽記 `CardMedallion`。

頁面與路由（`app/`）：

- `layout.tsx`：根版面。字型 `next/font/google`（Noto Serif SC、Cormorant，:2-22）加 LXGW 文楷 npm 套件（:6），包 ErrorBoundary＋AppShell。
- `page.tsx`：首頁＝神諭對話（useAgentChat）。空狀態有建議問題、側欄今日牌與最近 3 筆手札。
- `daily/page.tsx`：今日一牌（確定性抽牌＋翻牌、AI 解讀、札記自動存、月曆）。
- `history/page.tsx`：手札列表（按月分組、多選刪除、清空）。
- `history/[id]/page.tsx`：單筆手札詳情（牌陣、解讀、追問、刪除）。
- `library/page.tsx`：牌典（78 張、牌組篩選、搜尋、`?card=<id>` 直開）。
- `loading.tsx` ×4：各路由骨架。
- `api/interpret/route.ts`：LLM 串流轉送（備用 key、限流、端點檢查、超時、心跳）。
- `api/models/route.ts`：代查 `{base}/models`。
- `api/config/route.ts`：回報備用 LLM 是否可用與限流數。
- `globals.css`（971 行）：Tailwind v4 主題。無 `@font-face`、無外部 `url()`，只有兩個 data: URI 的 SVG 紋理（:68,70,119）。
- `favicon.ico`：二進位，未讀。

Hooks／lib：

- `hooks/useAgentChat.ts`：對話狀態機（神諭回合、追問、亲手抽牌 ritual、重新生成），模組級 store。
- `hooks/useApiConfig.ts`：API 設定 store（localStorage）。
- `hooks/useConfirm.ts`：命令式確認框。
- `lib/agent/agentTurn.ts`：回合編排（選陣→抽牌→串流解讀；追問 decide→補牌→解讀）。
- `lib/agent/spreadChoice.ts`：讓 LLM 選牌陣的 prompt 與 JSON 解析。
- `lib/api/endpoint-guard.ts`：端點字面檢查。
- `lib/api/errors.ts`：錯誤分類與中文訊息。
- `lib/api/llm-client.ts`：`fetchAvailableModels`。
- `lib/api/prompts.ts`：六種牌陣各一份 prompt、追問 prompt、每日 prompt。
- `lib/api/rate-limiter.ts`：進程內固定窗限流。
- `lib/api/stream-client.ts`：SSE 客戶端（重試、空閒超時、`<think>` 包裝）。
- `lib/api/stream-buffer.ts`：節流緩衝，死碼（見 1.6）。
- `lib/tarot/*`：`cards`（78 張資料）、`spreads`、`draw`、`daily`、`arcana`、`types`、`sseUtils`。
- 儲存與工具：`lib/readingStorage.ts`、`lib/dailyStorage.ts`、`lib/agentChatStorage.ts`、`lib/dates.ts`、`lib/lunar.ts`（Intl 中國曆）、`lib/id.ts`。

### 1.3 `lib/tarot/cards.ts` 牌義是否抄書

- 全檔無書名、作者名、引號引文。grep `Waite|Pictorial|Crowley|Papus|《|「|“` 只命中 :496 的 “成功” 強調引號。
- 22 大牌（:4-357）每張一組 4-5 個關鍵詞，加 2 句短牌義（正／逆各一句），語句泛用，無法對到任何特定著作的固定說法。
- 56 小牌（:359-540）由程式生成，關鍵詞表（:369-434）與牌義表（:437-502）各自手寫。
- 部分小牌描述 RWS 圖像，不是書中論述：
  - 劍 2「蒙住双眼的女人手持双剑」(:472)
  - 劍 3「三剑刺穿心脏」(:473)
  - 劍 4「骑士躺在石棺上」(:474)
  - 劍 8「女人被八把剑围住」(:478)
  - 劍 9「九把剑悬在床上的人头顶」(:479)
  - 劍 10「十剑刺入背部」(:482)
  - 幣 4「国王紧握四枚金币」(:490)
  - 幣 5「两个穷人在雪中经过教堂」(:491)
  - 幣 7「农夫看着七枚金币长成的植物」(:493)
  - 幣 13「脚下有兔子」(:499)
  - 杯 5「三杯洒落…剩下的两杯」(:459)
- 結論：沒有逐字抄書跡象，但我無法逐一比對任何現成書籍或網站（唯讀、未連網）。這些措辭與常見中文塔羅網站的通用說法相近，只能列為「無法排除衍生」。
- 瑕疵：幣 2 正位夾英文「双手 juggling 两个金币」(:488)。
- 小牌中文牌名用阿拉伯數字，如「权杖2」(:521)，王牌/宮廷牌有中文名。

### 1.4 網路呼叫、localStorage 鍵、遙測

- 瀏覽器到自家伺服器：
  - `POST /api/interpret`（`lib/api/stream-client.ts:170`）
  - `POST /api/models`（`lib/api/llm-client.ts:55`）
  - `GET /api/config`（`components/ApiSettings.tsx:40`、`hooks/useApiConfig.ts:73`）
- 伺服器到外部：
  - `fetch(requestUrl)`（`route.ts:332`），URL 為使用者或備用端點加 `/chat/completions`，Header `Authorization: Bearer <key>`（:336）。
  - `fetch(modelsUrl)`（`models/route.ts:45`），`{base}/models`。
- 全 repo `fetch(` 只有上述 6 處。grep `XMLHttpRequest|sendBeacon|WebSocket|EventSource` 無命中。
- 遙測：grep `analytics|gtag|sentry|posthog|umami|plausible|vercel/analytics|speed-insights|telemetry|googletagmanager` 在 ts/tsx/json/mjs 無命中（排除 package-lock）。
  - Next.js CLI 內建匿名遙測未見關閉設定（`package.json` scripts、`.env.example` 無 `NEXT_TELEMETRY_DISABLED`），屬框架行為，未驗證。
- localStorage 鍵共 4 個，沒有 sessionStorage、cookie、IndexedDB：
  - `tarot-api-config`（`hooks/useApiConfig.ts:6`，含 apiKey 明文）
  - `mystic-tarot-readings-v1`（`lib/readingStorage.ts:3`，上限 50 筆）
  - `mystic-tarot-daily-notes-v1`（`lib/dailyStorage.ts:8`，上限 60 筆）
  - `mystic-tarot-chat-v1`（`lib/agentChatStorage.ts:14`，上限 60 則訊息）
- URL query：`?mode=self`（`app/page.tsx:40`）、`?card=<id>`（`app/library/page.tsx:39`）。
- 執行期第三方請求：程式內無。Google Fonts 由 `next/font` 在建置期抓取並自託管（`layout.tsx:2-22`）。牌圖在 `public/cards`，由 `scripts/download-cards.js:5` 從 archive.org 下載（開發期，只讀了前 30 行）。

### 1.5 `.sisyphus/plans` 是什麼

- 兩份 AI agent 規劃文件：`.sisyphus/plans/history-feature.md`（211 行）、`localization.md`（197 行）。
  - 文中出現 "Metis Review"、"Category: `visual-engineering`"、"Skills: [`typescript-programmer`]"、Wave 並行圖等 agent 派工用語。
  - 依這些用語推斷是 AI 編碼 harness 的產物；我未查證是哪個工具。
- 內容與現況已脫節：
  - `history-feature.md:53` 寫 `lib/storage.ts`，實際是 `lib/readingStorage.ts`。
  - `history-feature.md:84` 寫 `hooks/useReading.ts`，該檔不存在。
  - `localization.md:47,165` 寫 `app/reading/page.tsx`，現在是 redirect（`next.config.ts:9`）。
  - 所有 checkbox 仍是 `[ ]`，但功能已實作。
  - 文中的 "Mystical Glassmorphism" 風格與現行 `globals.css` 的「紙本手札」風格不同。
- 內文沒有對讀者下指令的文字，只是任務清單。

### 1.6 程式缺陷（皆已讀碼，未執行）

- 缺陷 1（高）`/api/models` 是無限流開放代理，加 redirect 繞過：
  - `models/route.ts:26-47` 不經備用 key 與限流，接受任意公網 `endpoint`。
  - 先行 `checkEndpoint`（:38）只檢查初始 URL。
  - 失敗時回傳上游前 200 字（:59-60）。成功時回傳 `data` 陣列內容（:63-65）。
  - 加上 redirect 不受控，若 `ALLOW_PRIVATE_ENDPOINTS` 為預設，公網 URL 轉內網仍會通。
- 缺陷 2（高）備用 key 被當通用 LLM 轉發：
  - `route.ts:124-130` agent 模式只驗 `prompt` 非空字串，無長度與內容限制，直接透傳（:152-154）。
  - 備用 key 啟用時，任何人可用它跑任意 prompt。
  - 限流鍵取整串 `x-forwarded-for`（:283-285），可偽造；無此 header 時全部共用 `'unknown'` 桶。
- 缺陷 3（中）daily 模式 payload 只驗 `cardName`/`cardNameCn` 是字串（`route.ts:115-121`）。`keywords`、`meaning` 未驗證，`keywords.join`（`prompts.ts:414`）若傳非陣列會拋 TypeError，路由未捕捉，回 500。
- 缺陷 4（中）串流中途出錯仍標為完成並存檔：
  - `agentTurn.ts:131-138,176-179,315-322` 回傳值丟掉 `StreamResult.receivedError`。
  - `useAgentChat.ts:381-398` 因此把中斷的解讀存成 `done` 並寫入手札。
- 缺陷 5（中）`useApiConfig.ts:33` 的 `localStorage.getItem` 在 try 之外；`:60` 的 `setItem` 無 try。在禁用儲存的瀏覽器，訂閱階段就會拋錯。其他儲存模組都包了 try。
- 缺陷 6（低）寫入配額錯誤只 `console.error`（`readingStorage.ts:28-32`），畫面仍說「每次解讀都會自動存進手札」（`app/page.tsx:144`）。
- 缺陷 7（低）洗牌 `sort(() => Math.random() - 0.5)` 出現在 `draw.ts:13,46`（實際使用）與 `cards.ts:572`（未使用）。
- 缺陷 8（低）死碼：
  - `drawRandomCards`（cards.ts:571）
  - `getMajorArcana`（cards.ts:566）
  - `buildSimplePrompt`（prompts.ts:379）
  - `getRecentDailyDraws`（daily.ts:75，只被測試用）
  - `createStreamTextBuffer`（stream-buffer.ts:35，只被測試與註解提及）
- 缺陷 9（低）`regenerateAgentMessage` 一開始就清空 content（`useAgentChat.ts:535-536`），失敗時畫面上的舊解讀消失；手札中舊版仍保留。
- 缺陷 10（低）凱爾特十字位置語意為自訂（`spreads.ts:163-224`，3=過去、4=近期未來、5=目標…），與常見編號不同，未見說明。
- 缺陷 11（測試覆蓋）無測試涵蓋 `route.ts`、`models/route.ts`、`stream-client.ts`、`prompts.ts`、`useAgentChat.ts`。`tests/errors.test.ts:6` 用的路由訊息字串與真實訊息（`route.ts:291`）不同。
- 防護現況：
  - 錯誤訊息脫敏有做（`route.ts:241-247`、`errors.ts:183-188`）。
  - react-markdown 預設不渲染原始 HTML、會過濾 `javascript:` 連結。
  - 唯一外洩面是 `![](url)` 遠端圖。

## 2. tarot-mcp 的 CSS（fzlzjerry_tarot-mcp）

### 2.1 範圍

- `ui/src/styles/` 實際是 10 個檔，不是 9 個：base 201、controls 190、draw 597、index 9、overlays 232、reading 221、responsive 220、ritual 553、setup 433、waiting 12 行，共 2668 行，全部讀完。`DESIGN.md` 258 行讀完。
- `index.css` 只是 9 行本地 `@import`。

### 2.2 外部資源與字型

- 外部資源：無。全 CSS 無 `url()`、無 `@font-face`、無 `http` 字串，`@import` 只引本地檔（`index.css:1-9`）。
- 牌背圖經 CSS 變數 `--deck-back-image` 由 TSX 內聯設定（`ui/src/card-style.ts:6`、`ArcFan.tsx:371`、`RitualStage.tsx:282`）。
- `ui/index.html` 圖示是 data: URI。我只讀了其頭部，未全檔審。
- 字型全為系統字型堆疊：UI `ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei"`（`base.css:15-17`），display `"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "Songti SC", "Source Han Serif SC", "Noto Serif CJK SC"`（`base.css:18-20`）。沒有任何字型被載入。

### 2.3 與 DESIGN.md 一致之處（已核對數值）

- 11 個色彩 token 與 `base.css:22-35` 的 oklch 值逐一相同。
- 陰影：
  - Card Rest `0 6px 12px /52%` 對 `draw.css:405`。
  - Card Placed `0 6px 14px /50%` 對 `draw.css:260`。
  - Card Lift `0 14px 24px /62%` 對 `draw.css:486,497`。
  - Card Reveal `0 8px 18px /55%` 對 `reading.css:91`。
  - Dialog `0 28px 70px /68%` 對 `overlays.css:23`。
- 動效時間：
  - 420ms 飛行：`draw.css:179,200,279`。
  - 820ms 燈光掃過、只播一次：`draw.css:370`（`both`，無 `infinite`）。
  - 洗牌 1500ms：`RitualStage.tsx:29`。分段 0–450/480–1035/1050–1478ms，由 `ritual.css:318-325` 的比例算出，與註解（:362-364）相符。
  - 620ms match cut：`RitualStage.tsx:32`。
  - 22 層牌背：`--stack-step: 2px`（`ritual.css:48`）與註解「22 layers ≈ 42px」自洽。
- 無 backdrop-filter、無 repeating-gradient、無漸層文字。燈光為單一 radial（`reading.css:91-96`）。
- 圓角上限 14px：`draw.css:82`、`overlays.css:21`。
- 偏好動態降級 `responsive.css:163-220` 與 DESIGN §6 一致。
- Dialog 內顯示完整牌圖（`reading.css:137-144` `object-fit: contain`）。
- 選中的牌不永久抬高（`draw.css:506-508` `z-index:auto`）。

### 2.4 與 DESIGN.md 的不一致

1. 字型：DESIGN 的 body/label 字體列 `Inter`（`DESIGN.md:24,29`），`base.css:15-17` 沒有 Inter。
2. 輸入框：DESIGN 寫圓角 10px、內距 `13px 14px`（`DESIGN.md:66-67,186`）；`setup.css:227-229` 是 7px 圓角、12px 內距。
3. 面板圓角：DESIGN 寫 panel 14px、notice 12px（:178）；`setup.css:127` 的 `.setup-panel` 是 12px。
4. 停用態：DESIGN 寫「Never fade the whole control」（:169）；`controls.css:44-48` 的通用 `button:disabled` 用 `opacity:.42`。只有 `.primary-action` 被覆寫（:55-61）。`overlays.css:168-171` 也是 `opacity:.6`。
5. Setup 標題字距與字級：
   - DESIGN 寫字距「never tighter than -0.02em」、display `clamp(2rem,4.4vw,3.5rem)`（:133）。
   - `setup.css:51-56` 是 `clamp(3.6rem,5.6vw,5.2rem)`、字距 `-0.035em`。
6. Eyebrow：DESIGN 寫「Do not transform every label to uppercase」、label 字距 0.02em 上限（:137）；`setup.css:44-50` 的 `.setup-eyebrow` 是 `text-transform:uppercase` 加 `letter-spacing:.15em`。
7. 觸控目標：DESIGN 寫 44px 最小（:216）；`ritual.css:464-477` 的切牌拖曳帶高 26px（該元件 `role="slider"` 在 `RitualStage.tsx:328`）。
8. 金色用途：DESIGN 的 Lamplight Rule 寫金色不裝飾非作用區（:120）；以下是靜態裝飾用金：
   - `.wordmark > span`（`setup.css:24-27`）
   - `.setup-eyebrow`（:44-47）
   - `.interpretation-panel h2::before` 的「✦」（`reading.css:190-195`）
   - `.waiting-symbol`（`waiting.css:9-12`）
9. DESIGN §5 提到 Chip padding 5px 10px 與 `overlays.css:94` 一致，不算不一致。

## 3. anois_tarot 三個資料檔

### 3.1 `src/deck/data/tarot_interpretations.json`（2593 行，全讀）

- 結構：頂層 `{ "description": string, "tarot_interpretations": [ ... ] }`，陣列共 78 筆（grep `"name":` 計數 78）。
- 每筆欄位：
  - `fortune_telling`：字串陣列，1–4 條。
  - `keywords`：字串陣列，約 3–7 個。
  - `meanings.light`：字串陣列，約 4–9 條。
  - `meanings.shadow`：字串陣列，約 3–8 條。
  - `name`、`rank`、`suit`。
- `rank`：大牌為整數 0–21；小牌為 1–10 整數，或字串 `"page"|"knight"|"queen"|"king"`。
- `suit` 取值 `"major"|"wands"|"cups"|"swords"|"coins"`（用 coins，不是 pentacles）。
- 命名：小牌名全小寫，如 `"ace of wands"`（:776）；大牌有 `"The Papess/High Priestess"`（:104）、`"The Pope/Hierophant"`（:208）、`"The Wheel"`（:369）。
- 全檔來源／授權字樣只有第 2 行一處（`description` 欄位，原文）：
  `"Tarot card interpretations, from Mark McElroy's _A Guide to Tarot Meanings_ (http://www.madebymark.com/a-guide-to-tarot-card-meanings/)"`
- 全檔無「license/copyright/CC0」字樣。
- 內容特徵：
  - 宮廷牌的 `fortune_telling` 含星座與出生日期區間（如 :1107「likely born between July 12th and August 11th」）。
  - 文字為完整句式，且有大量慣用語。
- 專案如何標示：`README.md:121` 稱資料集來自 `dariusk/corpora`（CC0）。`src/deck/types.ts:34` 註解「light = upright, shadow = reversed」。
  - 這個對應與原資料語意不符：`light/shadow` 是「正向／負向表現」，不是牌的正逆位。
  - 例：Five of Wands 的 shadow 是「Picking fights」（:898），而中文檔 reversed 是「避免无谓争执」（`card-meanings-zh.json:603-608`）。

### 3.2 `src/mechanics/types.ts`（10 行，全讀）

- 僅一個介面 `DrawnCard { positionId, index, cardId, reversed }`（:2-10）。無來源字樣。

### 3.3 `card-meanings-zh.json`（1858 行）與 `card-lore.json`（314 行），全讀

- 兩檔都是 78 筆（grep 鍵數各 78）。鍵為 `major_00..21`、`wands_01..10`、`wands_page/knight/queen/king`，cups/swords/pentacles 同（zh 用 `pentacles`，英文檔用 `coins`）。
- `card-meanings-zh.json`：每筆 `{keywords[], upright[], reversed[]}`。
  - 大牌固定 4 個 keywords、5 條 upright、5 條 reversed。
  - 小牌 4–5 個 keywords、各 6 條 upright/reversed。
  - 每條多為 4–8 個字的短語。數量與句式高度整齊，疑似模板化產生，但我無法證明是 AI 撰寫。
  - 簡體中文。檔內無來源／授權字樣。
- `card-lore.json`：每筆 `{symbolism, story}`。
  - `symbolism` 描述 RWS 圖像（如 major_16「火星如二十二點散落」、wands_page「衣袍绣着火蜥蜴」），我核對的圖像細節大致符合 RWS。
  - `story` 是泛用解說。
  - 簡體。標點混用：wands_page/knight/queen/king（:131-144）與 cups_page/knight/king（:188,192,199-200）用半形逗號，其餘用全形，顯示來源或產生過程不一。
  - 無來源／授權字樣。
- 與英文檔是否為翻譯：不是逐項翻譯。抽 10 張對照：

| 牌 | 英文 keywords（原文） | 中文 keywords | 重疊 |
|---|---|---|---|
| The Fool | freedom, faith, inexperience, innocence | 新开始/冒险/天真/自由 | 自由、天真 2/4 |
| The Hermit | solitude, experience, stillness, withdrawal | 内省/独处/探寻/智慧 | 獨處 1/4 |
| Death | ending, conclusion, transition, passage, departure | 结束/转化/更新/蜕变 | 結束、轉化 約 2 |
| The Tower | demolition, upheaval, deconstruction, disaster, destruction | 突变/崩解/觉醒/释放 | 突變、崩解 約 2 |
| The Sun | joy, brilliance, validation, attention, energy | 喜悦/成功/活力/明朗 | 喜悅、活力 2 |
| Judgement | revival, renewal, resurrection, evaluation, invitation | 觉醒/审视/召唤/重生 | 重生、審視、召喚 約 3 |
| Five of Wands | confrontation, disruption, distinction, objection, strife | 竞争/分歧/摩擦/磨合/活力 | 分歧 約 1 |
| Five of Cups | loss, despair, re-evaluation, regret, uncertainty, repentance | 失落/遗憾/哀伤/释怀 | 失落、遺憾 2 |
| Three of Swords | variance, difference, dissatisfaction, heartache, rejection | 心碎/伤痛/分离/释放/真相 | 心碎≈heartache 1 |
| Four of Coins | protection, conservation, preservation, safety | 保有/稳固/掌控/保守 | 保守≈conservation 1 |

- 結論：中文是獨立撰寫的經典義，不是英文檔的譯本。
  - 英文檔有 fortune_telling 與長句式，中文檔沒有。
  - 中文檔有 reversed 短語集，英文檔只有 shadow。
  - 只有在古典義相近時才自然重疊。
- 授權觀察（僅敘述，非法律意見）：英文檔標頭歸屬 McElroy，但檔內沒有 McElroy 的授權說明。專案的 CC0 標示來自 corpora 倉庫，我沒驗證 McElroy 的授權。中文兩檔沒有來源，`README.md:117-122` 也沒涵蓋。

## 4. x-iztro（x-haose_x-iztro）

### 4.1 授權與來源字樣

- `LICENSE`：MIT，`Copyright (c) 2026 昊色居士 (x-haose)`（:3）。
- `Cargo.toml:7`、`pyproject.toml:10` 標 MIT。
- `README.zh-CN.md:86-87`「排盘算法移植自 JavaScript 的 iztro」；:251-252「整理自 iztro-docs（MIT，Sylar Long）」；:449-450 致謝兩者皆 MIT；:454-456 License MIT。
- 內嵌知識包 `src/data/knowledge/iztro_docs.zh-CN.json:853-861`（只讀此 source 區塊，其餘未讀）：`name: iztro-docs`、`author: Sylar Long`、`commit: ec2d58bb8b2a0d243d91212a1e3c87ab866858ee`、`license: MIT`、`retrievedAt: 2026-08-19`、`adapted` 為長篇改寫說明。
- `knowledge/SCHEMA.md` 要求 `source` 保留作者／許可證／出處（:46-58、:237-238），非逐字轉載必須填 `source.adapted`；:185 重申預設包 MIT、作者 Sylar Long。
- 觀察：頂層無 NOTICE／THIRD_PARTY 檔（`ls` 確認）。`LICENSE` 只有 x-haose 的版權行，沒有上游 iztro 的版權聲明。致謝只寫在 README（:449-450）。
  - 這可能不符合 MIT「在副本或實質部分中保留版權聲明」的要求，因為這是由 iztro 移植的演算法。
  - 這是我的讀法，不是法律結論。知識包 JSON 內有保留署名（:853-861）。

### 4.2 各檔要點

- `README.zh-CN.md`（456 行）：
  - 專案定位「排盤歸它算，解讀歸 AI」。
  - 與 iztro v2.6.1 逐欄位零差異，716,314 例金標、九層（表 :358-370）。
  - 格局 64 條、知識包 107 星/64 格局/12 宮/4 化/49 術語。
  - 六種輸出語言（:418）。
  - 公告 MSRV 1.88、Python 3.10+、Go 無 cgo（WASM+wazero，:125-126）。
  - 與 SCHEMA §8（:184）的 107 星 = 14+14+34+45 相符。
  - 與矛盾點：:342 的「暫無 MCP server」見第 0 節。
- `.github/pull_request_template.md`（26 行）：三節（改動／驗證／發布說明）。「發布說明」節會原樣成為 GitHub Release 描述，只有改 `Cargo.toml` 版本才發版（:11-14）。
- `knowledge/SCHEMA.md`（238 行）：知識包 v1 格式。
  - 頂層欄位 schema/id/version/language/extends/source/stars/patterns/palaces/mutagens/concepts。
  - 鍵為語言無關標識，未知鍵不報錯但查不到（:72-73）。
  - 合併規則（:142-168）：覆蓋包只能新增或覆寫，不能刪除；陣列整體替換；`source` 整體替換。
  - 正文不得含 HTML、圖片、站外連結（:138）。
- `examples/`：
  - `python/main.py` 175 行：9 段示範（排盤、十二宮、運限、to_text、JSON、錯誤）。
  - `go/main.go` 147 行：Warmup、排盤、類型化查詢、中州派、結構化錯誤。
  - `rust/src/main.rs` 205 行。
  - 設定檔：`go.mod`（go 1.22、wazero v1.8.2、`replace ... => ../../go/iztro`）、`go.sum` 2 行、`pyproject.toml`（依賴 `x-iztro`）、`Cargo.toml`（edition 2024、path 依賴 `../..`、serde_json）。
  - 瑕疵：`rust/src/main.rs:128` 標題「流年运限 (2026-10-01)」，但實際傳 `"2027-10-1"`（:130）；殘留註解掉的測試值（:28,:31）。
- docs 設定檔（皆讀）：
  - `docs/README.md`：Fumadocs（Next.js 16、Tailwind v4、React 19）、部署 Vercel、`/mcp` 反代（:30-32）。
  - `docs/next.config.mjs`：`DEFAULT_MCP_ORIGIN`（:11-12）、rewrites（:40-72）、`agentRules:false`（:24）。
  - `docs/proxy.ts`：`Accept: text/markdown` 內容協商，導向 `.md` 原文端點；matcher 排除 mcp/healthz/install。
  - `docs/source.config.ts`：`includeProcessedMarkdown`，shiki 主題 github-light/dark。
  - `docs/package.json`、`postcss.config.mjs`、`tsconfig.json`：標準設定。

## 5. openephem 的 6 個測試

- 檔案與行數：decennials 148、firdaria 106、profections 199、varga 89、vimshottari 222、zodiacal_releasing 192，共 956 行，全讀。
- 共通結構：純函數單元測試加 `assemble()` 整合測試，後者用假引擎（猴子補丁 `SkyfieldPlanetEngine`/`SkyfieldAsteroidEngine`）。
- 重複與私有依賴：
  - `_FakePlanet/_FakeAst/_moment/_patch` 在五個檔案各複製一份（decennials:81-109、firdaria:57-85、profections:126-154、vimshottari:129-157、zodiacal:127-155），沒有共用 fixture。
  - 五個檔案都 import 私有函數 `openephem.profections._calendar_to_jd as jd`（decennials:10、firdaria:5、vimshottari:4、zodiacal:4、profections:9）。
- 授權／來源字樣：無授權字樣。傳統來源只有註解：`test_zodiacal_releasing.py:21`「Valens' total」、`test_varga.py:21,51`「verified by hand」。
- 各檔斷言的常數：
  - decennials：小年數 Saturn30 Jupiter12 Mars15 Sun19 Venus8 Mercury20 Moon25，每輪 129 個月＝10 年 9 個月，Chaldean 順序（:18-21）。
  - firdaria：日夜序各合計 75 年，日序首 Sun、夜序首 Moon（:13-15）。
  - vimshottari：九星年數合計 120、序列 Ketu→Mercury（:14-21）；年長預設等於恆星年 365.256363（:199-201）；預設 lahiri（:167）。
  - zodiacal_releasing：Lesser Years 合計 211、Aquarius 30、Cancer 25（:19-24）；Fortune/Spirit 依日夜對調（:36-42）；Loosing of the Bond 跳到對宮（:58-68）。
  - varga：ESSENTIALS＝(1,2,3,9,10,12)、SHODASHAVARGA 16 個（:15-18）。
  - profections：傳統主星（Scorpio=Mars、Aquarius=Saturn、Pisces=Jupiter，:40-47）。
- 我手算核對（未執行程式）：
  - varga：月亮 Libra 19.47° 的 D1/2/3/9/10/12＝6/3/10/11/0/1（:22）一致；Trimshamsha 奇偶宮分段（:58-62）一致；Aries 3° 的十個分盤（:51-55）一致。
  - firdaria：夜盤 1970-09-14 出生、2026-06-01 → Venus 大運 49–57 歲，Mars 副運（:24-29）一致。
  - decennials：Saturn 起、同日 → Mercury 大運（53.75–64.5）、Moon 副運（:62-67）一致。
- 弱點與瑕疵：
  - `test_zodiacal_releasing.py:173`：`assert zr["peak_from"] != zr["lot_sign"] or True`，永遠為真。
  - varga 的 16 個分盤只有在 Aries 3° 與 Libra 19.47° 兩個點上有具體期望值；其餘只驗證落在 0–11（:44-48）。D2 只驗屬於 Cancer/Leo（:32-34）。
  - 未知出生時間：decennials/firdaria/profections/zodiacal 的 `assemble` 都省略結果並警告，vimshottari 仍計算並警告（`test_vimshottari.py:180-184`）。
  - 假引擎經度固定（`_LON`），不測真實星曆。

## 6. flatlib（flatangle_flatlib）

### 6.1 `flatlib/dignities/tables.py`（490 行）

- 檔頭只有 `(C) FlatAngle`、作者 João Ventura（:1-9），沒有整體來源。
- 表與傳統：
  - `CHALDEAN_FACES`（:23-37）：面（decan）用 Chaldean 序，Aries 面為 Mars/Sun/Venus。
  - `TRIPLICITY_FACES`（:39-53）：面依三分性元素的主星輪轉。
  - `EGYPTIAN_TERMS`（:57-155）：Egyptian 界，如 Aries 6/12/20/25/30。我逐宮核對，每宮 5 段、連續、末端 30。
  - `TETRABIBLOS_TERMS`（:157-256）：註解「Ptolemaic terms from Tetrabiblos (F.E. Robbins translation)」（:157-158）。
  - `LILLY_TERMS`（:258-357）：註解「Ptolemaic terms as described in Christian Astrology (W. Lilly)」（:258-259）。
  - `ESSENTIAL_DIGNITIES`（:361-472）：預設表（不含界）。
    - 廟/旺：Sun 旺 Aries 19°、Moon 旺 Taurus 3°、Jupiter 旺 Cancer 15°、Mercury 旺 Virgo 15°、Saturn 旺 Libra 21°、Mars 旺 Capricorn 28°、Venus 旺 Pisces 27°。陷／弱為對宮。
    - `trip` 為 [日, 夜, 共同] 三主星序：火 Sun/Jupiter/Saturn、土 Venus/Moon/Mars、風 Saturn/Mercury/Jupiter、水 Venus/Mars/Moon。這是常見的 Dorothean 三分主（Lilly 表同），是我的辨認，檔案內沒有標明。
    - `faces` 欄用 Chaldean。
- 出處標示：只有 Tetrabiblos 與 Lilly 兩張有書名註解（無版本、頁碼）；Egyptian 界、兩張面表、`ESSENTIAL_DIGNITIES` 沒有出處。
- 兩張「Ptolemaic」界表彼此不同：Taurus、Gemini、Leo、Libra、Scorpio、Capricorn 六宮不同（例：Taurus 土星 22–24 對 22–26，:173 與 :274；Leo 首段 Jupiter 對 Saturn，:194 與 :295；Capricorn 末兩段 Saturn/Mars 對調，:237-238 與 :338-339）。我無法對照原書確認哪張準確。
- 預設變體在 `flatlib/dignities/essential.py:27-28`：`FACES=Chaldean`、`TERMS=Egyptian`。
  - `setFaces`（:33-41）任何未知值都落到 Triplicity；`setTerms`（:44-54）未知值被靜默忽略。兩者以模組全域變數保存，非執行緒安全。
  - `termLons`（tables.py:477-490）只回傳起點，`end` 未使用。

### 6.2 `docs/source/conf.py`（286 行）

- sphinx-quickstart 2015 年範本：`project='flatlib'`、`copyright='2015, João Ventura'`（:51）、`html_theme='sphinx_rtd_theme'`（:112）、`extensions=[]`（:33）。
- 版本三處不一致：`conf.py:59-61` 為 0.2／0.2.0，`setup.py:13` 為 0.2.5，`flatlib/__init__.py:9` 為 0.2.3。
- 過時或未用：`language=None`（:68）、`html_theme_path`（:120-121）、未用 import `sys/os/shlex`（:16-18）、texinfo 描述仍是預設「One line description of project.」（:272）。
- 授權：`LICENSE` MIT（c）2015 FlatAngle；`setup.py:31` MIT。conf.py 無授權資訊。

### 6.3 `docs/source/tutorials/*`（index 8、intro-python 167、create-chart 128、chart-properties 195）

- `chart-properties.rst:29` 用 `const.SUN` 但前面 import（:14-16）沒有 `from flatlib import const`，照抄會報錯。
- `create-chart.rst:110-111` 說預設物件是「Sun 到 Saturn、Pars Fortuna、月交點」，但 `flatlib/const.py:262-265` 的 `LIST_OBJECTS_TRADITIONAL` 另含 SYZYGY，`chart-properties.rst:159` 的輸出也有 Syzygy。
- 預設宮制 Alcabitius 與 `const.py:162` 相符。
- 範例數值自洽：JD 2457095.2083 我手算相符；`dayofweek()` 回 5＝週五，`flatlib/datetime.py:78-80` 以週日為 0；`chart.isDiurnal()` 為 True 與太陽在第 7 宮相容。
- `intro-python.rst`：
  - :84、:132 的 REPL 輸出缺引號。
  - :19 `.. Cimage::` 是錯字，實際成為註解，Windows 圖不會顯示。
  - :159、:168 連到 Python 3.4 文件。
- 無授權或來源字樣。

## 7. 實際讀完的檔案與行數

- A TarotWhisper 共 11,895 行：
  - `components/*.tsx` 16 檔。
  - `app/**`：page/layout/daily/history/history-[id]/library、4 個 loading、globals.css 971、3 個 api route。
  - `hooks/*` 3 檔。
  - `lib/**` 28 檔（含 cards.ts 574）。
  - `tests/*.ts` 12 檔。
  - `.sisyphus/plans` 2 檔。
  - 設定檔：next.config、eslint、tsconfig、postcss、vitest、.env.example、package.json。
  - 另讀 LICENSE 前 5 行，README 以 grep 檢視相關行。
- B 共 2,926 行：10 個 CSS 檔 2,668 加 `DESIGN.md` 258。
- C 共 4,775 行：`tarot_interpretations.json` 2,593、`types.ts` 10、`card-meanings-zh.json` 1,858、`card-lore.json` 314。
- D 共 1,592 行：`README.zh-CN.md` 456、LICENSE 21、PR 模板 26、`SCHEMA.md` 238、examples（go main 147、go.mod 9、go.sum 2、python main 175、pyproject 6、rust Cargo.toml 8、main.rs 205）、docs 設定 299。
- E 共 956 行：6 個測試檔。
- F 共 1,274 行：tables.py 490、conf.py 286、tutorials 498。
- 合計約 23,418 行，皆為逐行讀過。

沒讀完或沒讀的：

- `J-York_TarotWhisper/app/favicon.ico`：二進位。
- `scripts/download-cards.js`：只讀前 30 行。
- `x-haose_x-iztro/examples/rust/Cargo.lock`（496 行，鎖檔）：未讀。
- `x-iztro/src/data/knowledge/iztro_docs.zh-CN.json`：只看了開頭與 source 區塊。
- `x-iztro/docs/` 的 content、app、lib、components、scripts：不在範圍，未讀。
- `NoahChristian_openephem` 的 `references.txt`、LICENSE：不在範圍，未讀。
- 其餘 repo 根目錄的 README/LICENSE 只以 grep 取用相關行。
