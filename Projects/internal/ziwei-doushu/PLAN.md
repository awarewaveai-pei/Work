# 正式專案計畫 — 東西方命理 × 內容 × 電商生態系

> **本檔 = 專案唯一正式計畫(SSOT)。** 快速接手讀 `HANDOFF.md`;完整規格、決策、路線圖看本檔。
> 位置:`Projects/internal/ziwei-doushu/`(AwareWave Work monorepo)
> 分支:`claude/ziwei-doushu-chart-site-55fdaa`
> 最後更新:2026-06-24(v2 — 全面重整:折回散落決策、消除矛盾、補 GDPR/MVP/內容引擎整合/快取四缺口)
>
> **v1→v2 變更**:原 doc 因多輪討論變主意,§0–17 舊計畫與 §18 新決策互相矛盾。v2 已把所有決策折回對應章節、刪重複、補缺口,成單一連貫版本。產品定位由「單一算命站」升級為「**以算命引流的多語言全球命理 × 內容 × 電商生態系**」。

---

## 0. 一頁摘要(Executive Summary)

打造一個**以紫微斗數/多命理系統為入口、可全球銷售的命理內容電商生態系**,目標「**最準 + 賺錢**」,要比對標競品 `stargazer.estework.site`「強 100 倍」。

- **核心差異化**:競品把解讀外包給使用者自己的 AI(收不到錢、不可規模化);**我們把 AI 解讀內建站內 → 放付費牆 → 可規模化、毛利 >80%**。再疊加多系統 + 天文精度 + 多語言 + 帳號訂閱。
- **產品三層**:① **算命引擎**(5 系統)+ **每日運勢工廠**(免費病毒漏斗)② **內容引擎**(SEO 文章/影片/社群,重用既有 next-admin)③ **電商**(數位報告自賣 + 實體 headless WooCommerce/POD)。三層由**三品牌漏斗**(soulful 身心靈 / wear the world 服飾 / 自家數位)串接變現。
- **賺錢模式**:免費輕量測算養流量 → 付費解鎖 AI 深度解讀(訂閱) + 一次性高客單(全年流年運勢報告) + 電商(數位+實體) + 導流到 soulful / wear the world。
- **全球化(地基級)**:多語言(繁中/英/簡中/日…)+ 多幣別多 provider 金流(ECPay+Stripe+PayPal)+ 全球稅務(Stripe Tax)+ GDPR。**day-1 設計進架構,事後補=全站重工。**
- **資料源**:中式系統(紫微/八字/卜卦/塔羅)**一律自算(零邊際成本)**;只有「算起來難」的**西洋占星**接 API(MVP astrology-api.io → 流量起來切自架 XALEN)。
- **託管**:自架 VPS(operator 近期 **SG→EU 遷移並新購一台 EU 機**,ziwei 直接落地新 EU 機),走 sg-deploy 式管線。
- **網址**:先 `ziwei.aware-wave.com` 子網域(零成本);**全球品牌建議提早買專屬網域**(見 §14、§22 待確認)。
- **AI**:廠商無關層,預設 GPT,可切 Claude,真命盤 A/B 選贏家;內容生成帶 `language` 參數。
- **現況**:Phase 0(紫微排盤引擎 + 真太陽時校正 + 12宮渲染)已完成、tsc/build 綠燈、已 push。
- **⚠️ 最大風險 = 範圍膨脹**:見 §18 路線圖的「MVP 第一刀」——必須先切出最小能收錢閉環,否則永遠上不了線。

---

## 1. 願景與目標

| 目標 | 衡量 |
|------|------|
| 最準 | 排盤用確定性天文算法 + **真太陽時校正**;解讀綁命盤具體星曜(非空泛) |
| 賺錢 | 訂閱 MRR + 一次性高客單 + 電商 GMV;毛利 >80%(數位) |
| 規模化 | AI 解讀/內容自動產出(競品靠人工,不可擴張) |
| 全球 | 多語言 + 多幣別 + 各地本地支付 + 稅務合規 |
| 流量 | SEO(SSR/多語 hreflang) + 每日免費測算分享圖卡(多社群病毒) |
| 生態 | 算命流量 → 導 soulful(身心靈)/ wear the world(服飾)/ 自家數位 |

---

## 2. 競品逆向結論(已完整拆解 `stargazer.estework.site`)

- React + Vite + **Cloudflare Pages 靜態站,無後端、無 AI**。
- 抽牌 = 純前端 `Math.random()` Fisher-Yates 洗牌取前 N 張(無種子、無玄學)。
- **不在站上解讀**:產 prompt 叫使用者貼去 GPT/Claude → operator AI 成本 0,但**解讀收不到錢**。
- 變現靠**人工**寫解讀委託(NT$300/1000)+ Buy Me a Coffee。不可規模化。
- 只有 36 張 Lenormand,無排盤天文。

**我們全部打穿**:內建 AI 解讀(可收費) + 多系統 + 真太陽時/Swiss Eph 精度 + 多語言 + 訂閱規模化 + 電商生態。

---

## 3. 產品範圍

### 3.1 算命系統(v1 五系統)
| 系統 | 排盤/抽牌方式 | 資料源 | 狀態 |
|------|------|------|------|
| 紫微斗數 | iztro(免費)+ 真太陽時校正 | 自算 | ✅ 引擎完成 |
| 八字四柱 | lunar-javascript(免費) | 自算 | ⬜ |
| 卜卦(易經) | 自寫 64 卦 + 六爻起卦 | 自算 | ⬜ |
| 塔羅 | 78 牌 JSON + 純亂數抽牌(Fisher-Yates) | 自算(**絕不接 API**) | ⬜ |
| 西洋占星本命盤 | astrology-api.io → 後切 XALEN | API/後自架 | ⬜ |

### 3.2 每日運勢工廠(免費病毒漏斗,見 §9)
今日運勢 / 幸運色 / 幸運數字 / 幸運方位 / 宜忌 / 每日塔羅 —— 演算法+免費庫+便宜 AI(快取),成本趨近零。

### 3.3 內容引擎(重用 next-admin,見 §10)
SEO 文章 / 開運影片 / 8 平台社群發佈 → 帶流量回站。

### 3.4 電商(見 §11)
數位商品(運勢報告/命書,Next.js 自賣)+ 實體商品(服飾/開運周邊,headless WooCommerce + POD/Printful)。

### 3.5 三品牌漏斗(見 §12)
算命引流 → soulful(身心靈)/ wear the world(服飾)/ 自家數位營收。

> 每個算命系統的「解讀」統一走 AI 層(§6)。

---

## 4. 系統架構

```
使用者瀏覽器(多語言 /[locale]/...)
   │  SSR HTML / API routes / hreflang
Next.js 16 App Router  ← 自架於新 EU 機 (Docker, 走 eu-deploy 管線)
   ├─ i18n 層(next-intl,UI 字串;內容走 AI language 參數)
   ├─ 排盤層(確定性,前端/伺服器皆可)
   │    紫微(iztro+真太陽時) / 八字(lunar) / 卜卦(自寫) / 塔羅(亂數)
   ├─ 每日運勢工廠(五行表+演算法+lunar黃曆+iztro流日+Haiku快取)
   ├─ 代理層(伺服器端,隱藏 key)
   │    西洋占星 → astrology-api.io(MVP)→ 自架 XALEN(後)
   ├─ AI 解讀層(廠商無關,§6;帶 language 參數)
   │    interpret() → GPT(預設) | Claude(可切)
   ├─ 內容引擎(重用 next-admin Content Pipeline Blocks,整合方式見 §10)
   ├─ 金流抽象層 pay(order, region/method)
   │    ├ ECPay(台) ├ Stripe(全球本地支付聚合+Tax) └ PayPal(國際)
   ├─ 電商:數位商品(Next.js 直生)+ 實體(headless → Woo/Printful 後端)
   ├─ 付費牆 + 計量(credits)
   └─ 資料層 → Supabase(Postgres + RLS)
金流 webhook ← ECPay / Stripe / PayPal(各自驗簽)
歸因 → soulful / wear the world(UTM + 站內事件)
```

**機密**:所有 key(OpenAI/Anthropic/astrology-api.io/三家金流/Supabase/Woo/Printful)走環境變數,**禁硬編**。西洋占星、AI、金流呼叫一律伺服器端。

---

## 5. 技術棧決策(定案)

| 模組 | 方案 |
|------|------|
| 框架 | Next.js 16 (App Router) + Tailwind v4(已建) |
| i18n | **next-intl**,subpath `/[locale]`,禁硬編 UI 字串 |
| 紫微 | iztro + 自寫 `lib/trueSolarTime.ts`(已建) |
| 八字 | lunar-javascript(同時供每日運勢黃曆宜忌) |
| 卜卦 | 自寫 64 卦資料 + 起卦 |
| 塔羅 | 78 牌 JSON + Fisher-Yates 抽牌 |
| 西洋占星 | MVP astrology-api.io 伺服器端代理 → 後切自架 XALEN(`@xalen/wasm`,Apache-2.0) |
| **AI 解讀** | 廠商無關層,預設 GPT,可切 Claude(見 §6) |
| 內容引擎 | **重用 next-admin Content Pipeline Blocks**(整合方式見 §10) |
| 電商(數位) | Next.js + 金流抽象層直收 |
| 電商(實體) | headless WooCommerce + POD/Printful(Woo 純後端) |
| 金流 | 抽象層後掛 ECPay + Stripe + PayPal(見 §13) |
| DB | Supabase(Postgres)+ RLS |
| 部署 | 自架新 EU 機,走 sg-deploy 式管線(eu-deploy,六項 SOP,見 §14) |

---

## 6. AI 解讀引擎(賺錢核心)— 廠商無關,預設 GPT

**原則:不綁死任何一家。** 解讀=產品本身,哪家寫得好由「真命盤 A/B + 使用者品味」決定;能省錢/換家隨時切。

### 設計
- `lib/ai/interpret.ts`:單一 `interpret(input, { language }): Promise<Reading>` 介面(**帶語言參數,多語言原生輸出**)。
- `lib/ai/providers/openai.ts` + `lib/ai/providers/anthropic.ts`:同介面兩實作。
- **預設 provider = GPT**(使用者偏好其解說);Claude 為可切換備選。`AI_PROVIDER=openai|anthropic`。
- 模型分級:輕量(每日運勢)/ 深度(主力報告)/ 頂規(全年流年/合婚)。
- `lib/ai/prompts/`:各系統解讀系統提示(命理知識庫)。**可改寫競品「組合解讀 / 忠於牌義 / 不空泛安慰也不災難化」的 prompt 骨架**。
- 串流(streaming)輸出萬字報告,避免逾時。
- 支援 prompt caching(固定命理知識系統提示)→ 省成本。

### 選型流程(交付物)
1. 拿 3–5 張真命盤,GPT vs Claude 各跑同一份深度解讀。
2. 使用者讀、選贏家(可分用途:深度長文 vs 每日輕量)。
3. 依 ① 解讀品質(使用者品味,最重要)② 成本(決定時抓當下實際報價)③ 穩定度,定預設與分級。

### Key 需求
- GPT → `OPENAI_API_KEY`;Claude → `ANTHROPIC_API_KEY`。兩家都接則兩個都放。

---

## 7. 變現設計(定案)

- **訂閱**:輕量測算(每日塔羅/運勢)**無限刷**(Haiku,成本~NT$0.3/次);**深度萬字報告計量**(含 N 篇/月,超出用點數加購)→ 防重度用戶刷爆。
  - 定價:建議 NT$249/月,**但全球賣 → 需多幣別 + 區域定價**(歐美客單可較高,新興市場 PPP 調降;Stripe 可設多幣別牌價)。最終價待 operator 拍板(§22)。
- **一次性高客單**:**全年流年運勢報告**(operator 已點名);之後加八字合婚 / 寶寶起名。
- **電商營收**:數位商品(報告/命書,~100% 毛利)+ 實體(服飾/開運周邊,POD 代印代發,毛利依品項)。
- **導流分潤**:算命流量導 soulful / wear the world → 各自營收(歸因追蹤,§12)。
- **成本結構(修正舊版錯誤)**:
  - 西洋占星 API **非固定 $11 通包**(astrology-api.io $11 僅含約 1k–5k 次/月,超量升級;見 §8)→ 故鎖付費牆後按次用,流量起來切**零月費自架 XALEN**。
  - VPS 邊際 0;AI 每份深度報告依模型分級數元台幣級;每日運勢經快取趨近零。
- `lib/credits.ts` + DB 計量;`app/api/interpret/route.ts` 先驗訂閱+額度才呼叫 AI。

---

## 8. 資料源策略(自算 vs API)

- **判準:API 的價值 = 計算難度。** 確定性算法(中式)誰算都一樣準,付費 API 不會更準。
- **中式系統一律自算、零邊際成本**:紫微(iztro)、八字(lunar-javascript)、卜卦(自寫)。
- **塔羅自寫、絕不接 API**:它就是「Math.random + 靜態 78 牌 JSON」,且是免費病毒漏斗;接 API = 為三行 code 按次付錢還被配額綁,**最虧**。
- **只有西洋占星接 API**(行星位置要 Swiss Ephemeris,自算易錯):
  - **MVP**:`astrology-api.io`。**非月付 $11 通包**;$11 Starter 僅含約 1,000–5,000 次/月(≈每日 33–160 次),超量升 $37(55k)/$99(220k)。**故西洋占星鎖付費牆後**,讓付錢的人才觸發按次呼叫,成本被收入覆蓋。
  - **流量起來**:切自架 **XALEN(`@xalen/wasm`,Apache-2.0)** → 零月費、可閉源、精度同級。⚠️ **別自架原生 Swiss Ephemeris**:它是 **AGPLv3**,網路服務會傳染逼你全站開源(對付費牆 SaaS 是毒藥)。切換前用 3–5 張已知正確本命盤回歸驗證精度 + 確認 XALEN 星曆資料無夾帶 AGPL 檔。

---

## 9. 每日運勢工廠(免費病毒漏斗,成本趨近零)

今日運勢 / 幸運色 / 幸運數字 / 幸運方位 / 宜忌 —— **全是內容不是計算**:

- **共用地基:五行↔屬性對應表**(靜態 JSON):`木{綠青,3/8,東} 火{紅紫,2/7,南} 土{黃棕,5/0,中} 金{白金,4/9,西} 水{黑藍,1/6,北}`。
- **幸運色/數/方位 = 純演算法**:取使用者喜用神五行(lunar-javascript 取日主→推喜用神;簡版先用日主或當日日柱五行)→ 查表。確定性、零 AI、零成本、同盤同日可重現。
- **宜忌 = lunar-javascript 內建黃曆**(`getDayYi()`/`getDayJi()`),免寫免 AI,全站同日共用快取。
- **今日運勢評分 = 規則算分**(iztro 流日盤落宮 + 四化吉凶 → 愛情/事業/財運/健康星等)。
- **運勢文案 = 便宜 AI(Haiku)**,唯一花錢處,但**快取鍵 = `chart_id + 日期 + locale`**(⚠️ 含 locale:多語言下同盤同日不同語要分開,否則英文用戶拿到中文快取)→ 同條件只生一次。太陽星座今日運勢更只需 12(星座)× 語言數 / 日全站共用。
- **差異化**:從**真命盤(流日/過運)**算 → 千人千面,贏競品「12 星座輪播罐頭文」。

---

## 10. 內容引擎 —— 重用既有 next-admin(整合方式待定)

公司已有完整「**Content Pipeline Blocks**」引擎(`lobster-factory/.../next-admin`,SSOT:`agency-os/docs/operations/CONTENT_PIPELINE_BLOCKS_MASTER_PLAN.md` §0.5 進度總帳):
- ✅ production:AI 文章生成(7 route,`lib/content/article/generate-core.ts`)、SEO 檢查(RankMath 16 點,`quality/seo-check-core.ts`)、熱點搜尋(`trending-sources.ts`)、brand-voice、發 WordPress(wp-bridge draft-first,`wordpress-core.ts`)、ContentStudio UI。
- 🟡 收尾中:影片生成(`apps/video-service/` 圖→Edge TTS→ffmpeg,Ken Burns/中文字幕/Flux 圖/Pexels B-roll,≈$0.02/支,骨架+真機驗證過,差積木接線)、社群發佈(Postiz 已部署 `postiz.aware-wave.com`,8 平台,差整合碼)。
- **算命站重用此引擎**產 SEO 文章+開運影片→自動發各社群帶流量回站。**禁止重造一套。**
- 多語言:生成函式加 `language` 參數(現為繁中管線,AI 本能輸出他語,小改)。
- 文章後台:operator 大量寫文 → **Notion-as-CMS**(已有 Notion)或 MDX,前台仍 Next.js。

> **⚠️ 待定架構決策(§22)— 怎麼接,別含糊**:next-admin 是客戶營運 app,ziwei 是消費產品,兩者不該硬耦合。三選一:
> - **A. 當內部服務呼叫**(ziwei → next-admin content API over HTTP):最快、低耦合,但跨 app 部署依賴。
> - **B. 抽成 monorepo 共用 package**(`packages/content-engine`,兩 app 都 import):最乾淨長久,但要先重構抽取。
> - **C. 複製**:❌ 禁(違反不重造原則,雙份維護)。
> **建議:MVP 用 A(快、不動既有 code),量起來再做 B。**

---

## 11. 電商 —— headless WooCommerce + POD,金流共用一層(天生無縫)

- **店核心 = WooCommerce**(operator 已熟、已有 POD→Printful+Woo 管線:`lib/studio/pod-product.ts`、`docs/PLAN-pod-one-click-auto-publish-design-to-woo-printful.md`)。**WooCommerce 不差,差的是把算命互動 app 塞進 WP** → 故分層。
- **架構(一次蓋對,不重工)**:
  - 前台(逛商品/購物車/**結帳/付款**)= **Next.js 算命站**,使用者全程不跳走、看不到 WordPress。
  - 金流 = **Next.js 金流抽象層**(§13),同時收「訂閱 + 數位報告 + 實體商品」三種 → **只接一次,服務三者**。
  - **不使用 Woo 的結帳/金流**(那才是會被丟掉重做的東西)。Woo 退居純後端:商品/庫存/訂單記錄/觸發 POD(Printful)。
  - 付款成功後經 Woo REST/Store API 建訂單 → Woo 發 POD 出貨。
  - **這是「天生無縫 headless」,非「先有縫再無縫」** → 滿足 operator「不重工、直接做好」原則。
- **數位商品**(運勢報告/命書/解讀)= Next.js + 同一金流層直收,零庫存 ~100% 毛利,即買即 AI 生成。
- **WP/Woo 更新維護**:把自家 Woo 店納入既有 **MainWP + WPvivid 備份 + `/wp-maintenance safe-update` + Playwright 驗站** 流程(operator 本業強項)。headless 下 Woo 不需頁面建構器/佈景/前台外掛 → 攻擊面更小、要更新的更少。

---

## 12. 三品牌共生漏斗(算命引流 → 變現三路)

```
免費算命/今日運勢(Next.js)
  ├─ 幸運色/開運穿搭 ──當場買實體(Next.js 結帳, Woo+POD 後端)──→ wear the world(服飾)
  ├─ 身心靈/療癒解讀 ───────────────────────────────────────→ soulful(身心靈)
  └─ 深度報告付費牆 ──數位商品(Next.js 金流直收)──→ 自家營收
全程 UTM + 站內事件歸因(lib/attribution.ts)→ 看哪條金流最強 → 加碼
```
- **殺手橋樑**:「今日幸運色 → 開運穿搭推薦」是命理與服飾的天然接點,不突兀、轉換高。
- 「悄悄導流」靠內容原生橋樑(文末 CTA / 推薦)+ UTM,不靠生硬廣告。
- ⚠️ **待確認(§22)**:soulful 確切定位(身心靈/課程/商品?)以校準橋樑文案。

---

## 13. 國際化 i18n + 全球金流 + 稅務(地基級,day-1 設計,事後補=全站重工)

operator 要求:**國內外都賣(歐美+全球),需英文版 + 各國語言。**

### 13.1 i18n
- **i18n 是地基不是功能** → 一開始就架,否則每頁/路由日後都要回頭改 = 重工。
- **翻譯成本趨近零**:解讀/運勢/SEO 文章皆 **AI 生成** → 加 `language` 參數即原生輸出,免人工翻譯。
  | 內容層 | 多語做法 | 成本 |
  |---|---|---|
  | 算命解讀 / 每日運勢文案 | AI `language` 參數原生生成 | ~零 |
  | SEO 文章 / 影片字幕 | 內容引擎 + 語言參數 | ~零 |
  | UI 介面(按鈕/選單) | 翻譯檔(next-intl),翻一次 | 小 |
  | 命理專名(星曜/卦/牌名) | 本地化對應表 JSON;西方概念直譯、中式概念附解釋 | 一次性 |
  | 商品 | headless → 多語在 Next.js 資料層管(不依賴 WPML) | 小 |
- **三件 day-1 必做**:① 語言路由 subpath `/[locale]`(`/zh` `/en` `/ja` `/zh-cn`)+ hreflang ② 金流多區(下)③ 禁硬編任何 UI 字串。
- **語言順序**:① 繁中(台/港,主場)② 英文(國際+西洋占星/塔羅英語圈大)③ 簡中 ④ 日文 → 之後韓/西/泰…。
- **語言 ≠ 市場定位**:西方語版主打西洋占星/塔羅,紫微/八字當異國特色;同站不同語言首頁可主推不同系統。

### 13.2 全球金流(抽象層 + 多 provider)
Next.js **金流抽象層** `pay(order, region/method)` 後掛多家,**加一家 = 加一個 adapter,前台/結帳/商品零改動**:
- **台灣/中文圈 → 綠界 ECPay**(本地卡/超商/ATM)
- **國際 → Stripe**(主力,**全球本地支付聚合器**,一接即解鎖各國方式,後台開關不寫 code):
  | 區域 | Stripe 一接即有 |
  |---|---|
  | 美國 | 卡、Apple/Google Pay、ACH、Cash App Pay、BNPL(Klarna/Afterpay/Affirm) |
  | 歐洲 | 卡、SEPA 直扣、iDEAL(荷)、Bancontact(比)、Sofort/Giropay(德)、Przelewy24/BLIK(波)、Multibanco(葡)、Klarna |
  | 英國 | 卡、Apple/Google Pay、Klarna、PayPal |
  | 拉美 | Pix/Boleto(巴西)、OXXO(墨) |
  | 亞洲 | Alipay/微信(中國+海外華人)、GrabPay 等 |
  | 全球 | ~135 幣別,以當地幣別顯示價 |
- **國際 → PayPal**(自有網絡 200+ 國,部分地區/年齡層只認 PayPal,缺了漏單)
- **未來可插(同層零重工)**:LINE Pay/街口(台)、印度 Razorpay(UPI)、中國境內 PSP…
- **BNPL 先買後付**(Klarna/Afterpay/Affirm):歐美澳普及,**對高客單(全年運勢報告/服飾)顯著提升轉換**;走 Stripe/PayPal 開通。

### 13.3 全球稅務合規(global 最易漏的雷,day-1 開)
跨國賣**數位商品**觸發各地稅務 —— 歐盟 **VAT**(按買家國課+VAT OSS 申報)、英國 VAT、美國各州 **sales tax**、澳/日 GST… → **開 Stripe Tax** 自動依買家所在地算稅率+產合規發票。事後補稅算=重工,故一開始就開。

---

## 14. 部署 / 網址

### 託管:自架新 EU 機(走 sg-deploy 式管線)
- operator 近期將 **SG → EU 遷移,並新購一台 EU 機** 託管。**ziwei 直接落地新 EU 機**(免日後從 SG 再搬一次)。
- 新機是**第三台**,容器/網路/secrets 獨立登記(ENVIRONMENT_REGISTRY);SG/EU **不可混用**。
- 部署管線:複製 `sg-deploy.sh` 為 `eu-deploy.sh`(或參數化目標主機),**保留新部署六項 SOP**:① unit test gate ② docker healthcheck ③ HTTP smoke ④ rollback runbook ⑤ Slack/TG 通知 ⑥ typecheck gate + `.github/workflows`。**禁止**在新機直接 git pull 繞 gate。
- SG→EU 遷移本身是另一個 High-risk 大任務,需另開規劃。
- **備選 Vercel**:只在「想完全免維運、肯付商用、可接受資料外流」時用。

### 網址:先子網域,全球品牌建議提早買專屬網域
- **MVP**:`ziwei.aware-wave.com` 子網域(零成本,CF 加一筆 DNS 指新 EU 機 IP)。
- ⚠️ **不要**做在 `aware-wave.com` 主站,也**不要**進 `app.aware-wave.com`(企業佈建 console)。
- **⚠️ 全球考量(§22 待確認)**:做全球消費品牌,子網域對 SEO/品牌/社群帳號偏弱,**建議比原計畫提早買專屬命理網域**(且先想好國際好記的品牌名);子網域僅作 MVP 驗證期過渡。

---

## 15. 資料模型(Supabase,草案,含 RLS)

- `users`(auth)
- `charts`:id, user_id, system, birth_input(jsonb), result(jsonb), created_at
- `subscriptions`:user_id, plan, status, period, **provider(ecpay/stripe/paypal)**, provider_ref, currency
- `credit_ledger`:user_id, delta, reason, created_at
- `readings`:id, chart_id, system, provider, model, **locale**, tokens_in/out, cost, created_at
- `daily_fortune_cache`:key(`chart_id|date|locale` 或 `sign|date|locale`), payload(jsonb), created_at
- `orders`:id, user_id, kind(digital/physical), items(jsonb), amount, currency, provider, provider_ref, **woo_order_id?**, tax(jsonb), status, created_at
- `attribution_events`:visitor_id, channel, utm(jsonb), **target_brand(self/soulful/wtw)**, landed_at, converted_at
- `consents`(GDPR):user_id, type, granted_at, revoked_at, ip, locale
- RLS:使用者只能讀自己的 charts/readings/subscriptions/orders。

---

## 16. SEO / 獲客引擎

- SSR + 各系統頁 JSON-LD 結構化資料 + **多語 hreflang** → 各國自然流量。
- **內容引擎**(§10)量產 SEO 文章/開運影片 → Postiz 發 8 平台 → 帶流量回站。
- `app/api/og/route.tsx` 動態 OG 分享圖卡(命盤縮圖 / 每日牌,多語)。
- 每日免費抽牌/運勢 → 一鍵分享 IG / TikTok / Threads / FB / LINE / YouTube Shorts / 小紅書。
- UTM/referral 歸因 → `attribution_events` → 儀表(知道哪渠道/哪品牌帶來付費)。

---

## 17. 安全 / 合規

- key 全環境變數,禁硬編。西洋占星 / AI / 金流呼叫一律伺服器端,前端不碰 key。
- 金流 webhook 驗簽(ECPay/Stripe/PayPal 各自);訂閱狀態以 webhook 為準。
- **個資 / GDPR(全球賣必做,舊版缺)**:出生資料屬個資(賣到歐盟受 GDPR)→ ① 明確同意(`consents` 表)② 可匯出/可刪除(被遺忘權)③ 各語言隱私政策 + Cookie 同意 ④ 資料最小揭露 + RLS。
- **稅務合規**:Stripe Tax(§13.3)。
- **占卜免責**:部分司法管轄要求「僅供娛樂參考」聲明 → 各語言頁尾加免責。
- 防濫用:Cloudflare Turnstile + rate limit(抄競品做法)。

---

## 18. 路線圖(單一版,已調和舊 §12 與 §18.7 衝突)

> **原則(operator)**:地基一次蓋對、永不打掉;功能按序一塊塊蓋到好(≠ 先做小再做好)。
> **地基(任何功能前先立對,不重工)**:i18n 路由 + 金流抽象層 + 廠商無關 AI 層 + Supabase/RLS + 部署管線。

### Phase 0 — 紫微排盤地基 ✅(已完成,commit e02796c)
排盤引擎 + 真太陽時校正 + 12宮渲染 + 輸入表單;tsc/build 綠燈;排盤正確性已驗。

### 🎯 MVP 第一刀(最小能收錢閉環,先做這個!— §22 待 operator 確認範圍)
**目標:一個語言地基 + 一個系統 + 一條現金流先上線驗證,而非等整個生態系。**
1. **i18n 地基**(繁中+英,subpath 路由,UI 字串外部化)——地基,先立。
2. **紫微 MVP UI** 完善(三方四正、大限/流年、手機 RWD)+ 每日運勢工廠 + SEO/OG。
3. **金流抽象層**(先接 Stripe + ECPay)+ **數位商品付費牆**(全年運勢報告)→ **第一條現金流**。
4. **AI 解讀引擎**(廠商無關,GPT 預設,帶 language)— 賺錢核心。
5. 部署新 EU 機 + 掛 `ziwei.aware-wave.com`。
> 這一刀做完 = 能收錢、能驗證市場、地基不用重來。

### Phase 2 — 內容引擎 + 獲客
- 重用 next-admin 內容引擎(§10,先用整合方式 A)產文章/影片 → Postiz 8 平台。
- 多語 SEO/hreflang + 分享圖卡一鍵多社群 + 歸因儀表。

### Phase 3 — 電商 + 三品牌漏斗
- headless 接 Woo 店(無縫結帳,共用金流)+ POD/Printful。
- 加 PayPal + BNPL + Stripe Tax;三品牌漏斗(soulful / wear the world)+ 歸因。

### Phase 4 — 多系統擴張
- `lib/bazi.ts`、`lib/iching.ts`、`lib/tarot.ts`、`app/api/astrology/route.ts`(astrology-api.io)+ 各頁。
- 訂閱制 + 合盤 + 更多高客單(合婚/起名)。

### Phase 5 — 規模化優化
- 西洋占星切自架 XALEN(零月費)。
- 加更多語言(簡中/日…)、更多金流(LINE Pay/Razorpay…)、無縫 headless 深化。

---

## 19. 抽牌原理(塔羅/卜卦用)

純前端、無種子、無後端:牌堆陣列 → **Fisher-Yates 洗牌(`Math.random()`,每種排列等機率)** → 取前 N 張(不放回)。紫微/八字是確定性排盤,不抽牌。

---

## 20. 怎麼跑 / 驗證

```bash
cd Projects/internal/ziwei-doushu
npm install
npm run dev          # http://localhost:3000
npx tsc --noEmit     # 型別 gate(改 .ts/.tsx 後必跑)
npm run build        # production build gate
```
- 排盤正確性:對照 iztro 標準輸出(2000-08-16 女 → 命主破軍/身主文昌/木三局)。
- 真太陽時:對照已知經度校正分鐘數(台北 121.5、UTC+8)。
- ⚠️ **本專案 Next.js 有破壞性改動**(見 `AGENTS.md`):寫 code 前先讀 `node_modules/next/dist/docs/` 對應指南。

---

## 21. 風險與緩解

| 風險 | 緩解 |
|------|------|
| **範圍膨脹→永遠不上線(最大風險)** | §18 MVP 第一刀:一語言+一系統+一現金流先上;地基一次立對,功能按序加 |
| AI 解讀品質不穩/不準 | 廠商無關層 + 真命盤 A/B + 好 prompt(組合解讀、忠於牌義) |
| 重度用戶刷爆 AI 成本 | 深度報告計量 + 輕量走便宜模型 + 快取(含 locale) |
| 西洋 API 漲價/斷線/配額爆 | 鎖付費牆按次用 + 代理層隔離 + 規劃切自架 XALEN(零月費) |
| **全球法遵(GDPR/各國稅/占卜免責)** | §17:consents 表 + Stripe Tax + 各語言隱私/免責頁 |
| **內容引擎與 next-admin 耦合** | §10:MVP 當服務呼叫(A),量起來抽共用 package(B);禁複製 |
| 個資外洩 | RLS + 伺服器端 + 最小揭露 |
| 部署 ops 負擔 | 走 sg-deploy 式管線(test/healthcheck/smoke/rollback 現成)|
| 多品牌稀釋 | 語言/品牌分頁定位;漏斗用內容原生橋樑不硬廣告 |

---

## 22. 待 operator 拍板的開放決策(單一清單,已去重)

**動工前需 operator 決定/提供:**
1. **MVP 第一刀範圍確認**(§18:繁中+英 / 紫微+每日運勢 / Stripe+ECPay / 數位報告現金流;可調)。
2. **內容引擎整合方式**(§10:建議 A 服務呼叫 → 後 B 共用 package)。
3. **網域策略**(§14:先子網域過渡,全球品牌是否提早買專屬網域 + 品牌名)。
4. **soulful 定位**(§12,校準身心靈漏斗文案);wear the world / 自家 shop 的 Woo 站位置與網址(`shop.aware-wave.com`?)。
5. **訂閱價 + 區域定價策略**(建議 NT$249 起,多幣別 PPP)。
6. **新 EU 機規格 / IP**(部署目標)。

**需 operator 提供的憑證/帳號(env vars,禁硬編):**
- 金流:ECPay、Stripe、PayPal 三家帳號/key。
- AI:`OPENAI_API_KEY`(預設)、選配 `ANTHROPIC_API_KEY`。
- 西洋占星:astrology-api.io key(MVP)。
- 電商:Woo 站 + Printful 帳號。
- Supabase 專案。

---

## 23. 接手紀律(必守)

- 改 `.ts/.tsx` → `npx tsc --noEmit` 過才算完成;寫 code 前讀本專案 Next.js 文件(§20)。
- 完成一塊 → commit(訊息含根因+驗證)+ push 到 `claude/ziwei-doushu-chart-site-55fdaa`。
- 機密一律環境變數,禁硬編。
- 排盤邏輯改動 → 已知生辰回歸驗證。
- 部署走 sg-deploy 式管線,補齊新部署六項 SOP。
- UI 字串一律走 i18n 翻譯檔,禁硬編任何語言文字。
