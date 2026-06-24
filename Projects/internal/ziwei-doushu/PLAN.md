# 正式專案計畫 — 紫微斗數 × 東西方命理 SaaS

> **本檔 = 專案唯一正式計畫(SSOT)。** 快速接手讀 `HANDOFF.md`;完整規格、決策、路線圖看本檔。
> 位置:`Projects/internal/ziwei-doushu/`(AwareWave Work monorepo)
> 分支:`claude/ziwei-doushu-chart-site-55fdaa`
> 最後更新:2026-06-24(本次 session 大幅擴充:電商/內容引擎/三品牌漏斗/EU 機/資料源策略 → 見 §18)

---

## 0. 一頁摘要(Executive Summary)

打造一個**以紫微斗數為核心、涵蓋東西方多系統**的命理 SaaS,目標「**最準 + 賺錢**」,要比對標競品 `stargazer.estework.site`「強 100 倍」。

- **核心差異化**:競品把解讀外包給使用者自己的 AI(收不到錢、不可規模化);**我們把 AI 解讀內建站內 → 放付費牆 → 可規模化、毛利 >80%**。再疊加多系統 + 天文精度 + 帳號訂閱。
- **賺錢模式**:免費輕量測算養流量 → 付費解鎖 AI 深度解讀(訂閱) + 一次性高客單(全年流年運勢報告 / 合婚 / 起名)。
- **託管**:**自架 SG/EU VPS(走既有 `sg-deploy.sh` 管線)為主**,Vercel 為備選。
- **網址**:**`ziwei.aware-wave.com` 子網域(零成本)**;品牌起來再買專屬網域。
- **AI**:**廠商無關 AI 層,預設 GPT,可切 Claude,用真命盤 A/B 選贏家**。
- **產品已擴為生態系(2026-06-24,見 §18)**:算命引擎 + 每日運勢工廠 + SEO 文章/影片(**重用既有 next-admin 內容引擎**)+ 8 平台社群發佈 + **三品牌漏斗(導 soulful 身心靈 / wear the world 服飾)** + **自己的 shop(headless WooCommerce + POD/Printful,金流走 Next.js 一層共用、天生無縫)**。
- **資料源策略**:中式系統(紫微/八字/卜卦/塔羅)**一律自算(免費、零邊際成本)**;只有「算起來難」的**西洋占星**接 API(MVP 用 astrology-api.io,**注意非通包、按配額計費**;流量起來切自架 **XALEN Apache-2.0** 引擎,零月費可閉源)。
- **國際化(地基級)**:**國內外都賣 → 多語言(繁中/英/簡中/日…)+ 多幣別金流(ECPay 台灣 + Stripe 國際雙軌)**,day-1 設計進架構(AI 內容帶語言參數=翻譯近零成本);事後補=全站重工(見 §18.9)。
- **部署目標更新**:使用者近期將 **SG→EU 遷移並新購一台 EU 機**;ziwei 直接落地新 EU 機(見 §18)。
- **現況**:Phase 0(紫微排盤引擎 + 真太陽時校正 + 12宮渲染)已完成、tsc/build 綠燈、已 push。

---

## 1. 願景與目標

| 目標 | 衡量 |
|------|------|
| 最準 | 排盤用確定性天文算法 + **真太陽時校正**;解讀綁命盤具體星曜(非空泛) |
| 賺錢 | 訂閱 MRR + 一次性高客單;毛利 >80% |
| 規模化 | AI 解讀自動產出(競品靠人工,不可擴張) |
| 流量 | SEO(SSR) + 每日免費測算分享圖卡(多社群病毒) |

---

## 2. 競品逆向結論(已完整拆解 `stargazer.estework.site`)

- React + Vite + **Cloudflare Pages 靜態站,無後端、無 AI**。
- 抽牌 = 純前端 `Math.random()` Fisher-Yates 洗牌取前 N 張(無種子、無玄學)。
- **不在站上解讀**:產 prompt 叫使用者貼去 GPT/Claude → operator AI 成本 0,但**解讀收不到錢**。
- 變現靠**人工**寫解讀委託(NT$300/1000)+ Buy Me a Coffee。不可規模化。
- 只有 36 張 Lenormand,無排盤天文。

**我們全部打穿**:內建 AI 解讀(可收費) + 多系統 + 真太陽時/Swiss Eph 精度 + 訂閱規模化。

---

## 3. 產品範圍(v1 系統)

| 系統 | 排盤/抽牌方式 | 狀態 |
|------|------|------|
| 紫微斗數 | iztro(免費)+ 真太陽時校正 | ✅ 引擎完成 |
| 八字四柱 | lunar-javascript(免費) | ⬜ |
| 卜卦(易經) | 自寫 64 卦 + 六爻起卦 | ⬜ |
| 塔羅 | 78 牌 JSON + 純亂數抽牌(Fisher-Yates) | ⬜ |
| 西洋占星本命盤 | astrology-api.io(Swiss Ephemeris) | ⬜ |

每個系統的「解讀」統一走 AI 層(§6)。

---

## 4. 系統架構

```
使用者瀏覽器
   │  (SSR HTML / API routes)
Next.js 16 App Router  ← 自架於 SG/EU VPS (Docker, 走 sg-deploy.sh)
   ├─ 排盤層(確定性,前端/伺服器皆可)
   │    紫微(iztro+真太陽時) / 八字(lunar) / 卜卦(自寫) / 塔羅(亂數)
   ├─ 代理層(伺服器端,隱藏 key)
   │    西洋占星 → astrology-api.io (Swiss Eph)
   ├─ AI 解讀層(廠商無關,§6)
   │    interpret() → GPT(預設) | Claude(可切)
   ├─ 付費牆 + 計量(credits)
   └─ 資料層 → Supabase(Postgres + RLS)
金流 webhook ← 綠界 / Stripe
```

**機密**:所有 key(OpenAI/Anthropic/astrology-api.io/金流/Supabase)走環境變數,**禁硬編**。西洋占星與金流呼叫一律伺服器端。

---

## 5. 技術棧決策(定案)

| 模組 | 方案 |
|------|------|
| 框架 | Next.js 16 (App Router) + Tailwind v4(已建) |
| 紫微 | iztro + 自寫 `lib/trueSolarTime.ts`(已建) |
| 八字 | lunar-javascript |
| 卜卦 | 自寫 64 卦資料 + 起卦 |
| 塔羅 | 78 牌 JSON + Fisher-Yates 抽牌 |
| 西洋占星 | astrology-api.io(Swiss Eph),伺服器端代理 |
| **AI 解讀** | **廠商無關層,預設 GPT,可切 Claude**(見 §6) |
| DB | Supabase(Postgres)+ RLS |
| 金流 | 綠界 ECPay(台) / Stripe(國際) |
| 部署 | **自架 SG/EU VPS(sg-deploy 管線)為主**,Vercel 備選(見 §8) |

---

## 6. AI 解讀引擎(賺錢核心)— 廠商無關,預設 GPT

**原則:不綁死任何一家。** 解讀=產品本身,哪家寫得好由「真命盤 A/B + 使用者品味」決定;能省錢/換家隨時切。

### 設計
- `lib/ai/interpret.ts`:單一 `interpret(input): Promise<Reading>` 介面。
- `lib/ai/providers/openai.ts` + `lib/ai/providers/anthropic.ts`:同介面的兩個實作。
- **預設 provider = GPT**(使用者偏好其解說);Claude 為可切換備選。
- 設定:`AI_PROVIDER=openai|anthropic`(環境變數),模型分級可設(輕量/深度/頂規)。
- `lib/ai/prompts/`:各系統解讀系統提示(命理知識庫)。**可直接改寫競品那段「組合解讀 / 忠於牌義 / 不空泛安慰也不災難化」的 prompt 骨架**——品質好且省事。
- 串流(streaming)輸出萬字報告,避免逾時。
- 若該家支援 prompt caching(固定命理知識系統提示)→ 開啟省成本。

### 選型流程(交付物)
1. 拿 3–5 張真命盤,GPT vs Claude 各跑同一份深度解讀。
2. 使用者讀、選贏家(可分用途:深度長文 vs 每日輕量)。
3. 依 ① 解讀品質(使用者品味,最重要)② 成本(決定時抓當下實際報價)③ 穩定度,定預設與分級。

### Key 需求
- GPT → `OPENAI_API_KEY`;Claude → `ANTHROPIC_API_KEY`。兩家都接則兩個都放。

---

## 7. 變現設計(定案)

- **訂閱(建議 NT$249/月,價格待使用者最終確認)**:輕量測算(每日塔羅/運勢)**無限刷**(成本~NT$0.3/次);**深度萬字報告計量**(含 N 篇/月,超出用點數加購)→ 防重度用戶刷爆。
- **一次性高客單**:**全年流年運勢報告**(使用者已點名);之後加八字合婚 / 寶寶起名。
- **成本實算**:固定 ~US$11/月(西方 API)+ VPS 邊際 0;AI 每份深度報告依模型分級數元台幣級。
- `lib/credits.ts` + DB 計量;`app/api/interpret/route.ts` 先驗訂閱+額度才呼叫 AI。

---

## 8. 部署 / 網址(定案)

### 託管:自架 SG/EU VPS 為主(走既有 sg-deploy 管線)
- **理由**:你已在 VPS 上跑 Next.js(next-admin)且有成熟 `sg-deploy.sh`(npm test gate → docker healthcheck → HTTP smoke → 失敗自動 rollback)。自架 = **零新廠商、零新成本、資料自主、與既有 stack 一致**。
- **新部署 SOP(6 項,依 AGENTS.md 強制)**:① unit test gate ② docker healthcheck ③ HTTP smoke check ④ rollback runbook ⑤ Slack/TG 通知 ⑥ typecheck gate + `.github/workflows`。
- **備選 Vercel**:只在「想完全免維運、肯付 Pro $20/月商用、可接受資料外流」時用。

### 網址:`ziwei.aware-wave.com` 子網域(零成本)
- 你已擁有 `aware-wave.com`,Cloudflare 加一筆 DNS 指向 VPS 即可。
- 品牌驗證後再**買專屬命理網域**(消費品牌與 agency 分開較好,~NT$300-500/年)。
- ⚠️ **不要**做在 `aware-wave.com` 主站,也**不要**進 `app.aware-wave.com`(企業佈建 console)。

---

## 9. 資料模型(Supabase,草案,含 RLS)

- `users`(auth)
- `charts`:id, user_id, system, birth_input(jsonb), result(jsonb), created_at
- `subscriptions`:user_id, plan, status, period, provider, provider_ref
- `credit_ledger`:user_id, delta, reason, created_at
- `readings`:id, chart_id, system, provider, model, tokens_in/out, cost, created_at
- `attribution_events`:visitor_id, channel, utm(jsonb), landed_at, converted_at
- RLS:使用者只能讀自己的 charts/readings/subscriptions。

---

## 10. SEO / 獲客引擎

- SSR + 各系統頁 JSON-LD 結構化資料 → 自然流量。
- `app/api/og/route.tsx` 動態 OG 分享圖卡(命盤縮圖 / 每日牌)。
- 每日免費抽牌/運勢 → 一鍵分享 IG / TikTok / Threads / FB / LINE / YouTube Shorts / 小紅書。
- UTM/referral 歸因 → `attribution_events` → 儀表(知道哪渠道帶來付費)。

---

## 11. 安全 / 合規

- key 全環境變數,禁硬編。
- 西洋占星 / AI / 金流呼叫一律伺服器端,前端不碰 key。
- 金流 webhook 驗簽;訂閱狀態以 webhook 為準。
- 出生資料屬個資 → RLS + 最小揭露 + 隱私頁。
- 防濫用:Cloudflare Turnstile + rate limit(抄競品做法)。

---

## 12. 路線圖(Phased Roadmap)

### Phase 0 — 紫微排盤地基 ✅(已完成,commit e02796c)
排盤引擎 + 真太陽時校正 + 12宮渲染 + 輸入表單;tsc/build 綠燈;排盤正確性已驗。

### Phase 1 — 紫微 MVP 上線
- 命盤 UI:三方四正連線、大限/流年盤切換、四化飛星標示、**手機 RWD**。
- SEO metadata(`app/layout.tsx`)+ 動態 OG 圖卡。
- **部署到 SG/EU VPS**(走 sg-deploy 管線,補齊新部署 6 項 SOP)+ 掛 `ziwei.aware-wave.com`。
- 驗收:公開可瀏覽、手機正常、命盤正確。

### Phase 2 — AI 解讀(賺錢核心,最高槓桿)
- `lib/ai/interpret.ts` 廠商無關介面 + `providers/openai.ts`(預設)+ `providers/anthropic.ts`。
- `lib/ai/prompts/` 紫微系統提示(改寫競品骨架)。
- `app/api/interpret/route.ts`(streaming + 付費牆雛形)。
- 真命盤 A/B 選贏家。
- 需 `OPENAI_API_KEY`(及/或 `ANTHROPIC_API_KEY`)。
- 驗收:輸入命盤 → 產出綁該盤具體星曜的萬字解讀。

### Phase 3 — 多系統
- `lib/bazi.ts`(lunar)+ `app/bazi/page.tsx`。
- `lib/iching.ts` + `app/iching/page.tsx`。
- `lib/tarot.ts`(78 牌 + 亂數抽牌)+ `app/tarot/page.tsx`。
- `app/api/astrology/route.ts`(代理 astrology-api.io)+ `app/astrology/page.tsx`。

### Phase 4 — 帳號 / 金流 / 計量
- Supabase 帳號 + schema(§9)+ RLS。
- 綠界/Stripe 訂閱 + 單筆 + webhook;`lib/credits.ts` 計量。
- 全年流年運勢報告購買流程。

### Phase 5 — 獲客引擎
- 分享圖卡一鍵多社群 + UTM/referral 歸因儀表。

---

## 13. 抽牌原理(Phase 3 塔羅/卜卦用)

純前端、無種子、無後端:牌堆陣列 → **Fisher-Yates 洗牌(`Math.random()`,每種排列等機率)** → 取前 N 張(不放回)。紫微/八字是確定性排盤,不抽牌。

---

## 14. 怎麼跑 / 驗證

```bash
cd Projects/internal/ziwei-doushu
npm install
npm run dev          # http://localhost:3000
npx tsc --noEmit     # 型別 gate(改 .ts/.tsx 後必跑)
npm run build        # production build gate
```
排盤正確性:對照 iztro 標準輸出(2000-08-16 女 → 命主破軍/身主文昌/木三局)。
真太陽時:對照已知經度校正分鐘數(台北 121.5、UTC+8)。

---

## 15. 風險與緩解

| 風險 | 緩解 |
|------|------|
| AI 解讀品質不穩/不準 | 廠商無關層 + 真命盤 A/B + 好 prompt(組合解讀、忠於牌義) |
| 重度用戶刷爆 AI 成本 | 深度報告計量 + 輕量走便宜模型 + caching |
| 第三方 API 漲價/斷線(astrology-api.io) | 代理層隔離,可換家或改本地西方庫 |
| 個資外洩 | RLS + 伺服器端 + 最小揭露 |
| 部署 ops 負擔 | 走既有 sg-deploy 管線(test/healthcheck/smoke/rollback 都現成) |

---

## 16. 待使用者拍板的開放決策

- 訂閱價(建議 NT$249,深度報告計量)。
- AI 預設家(目前定 GPT)+ 提供 `OPENAI_API_KEY`(及/或 `ANTHROPIC_API_KEY`)。
- astrology-api.io key、Supabase 專案、金流商(綠界 vs Stripe)。
- 何時買專屬命理網域(先用 `ziwei.aware-wave.com`)。
- **本次 session 新增的開放決策見 §18.8**(soulful 定位 / Woo 店位置 / 新 EU 機 IP / 金流商 / API keys)。

---

## 17. 接手紀律(必守)

- 改 `.ts/.tsx` → `npx tsc --noEmit` 過才算完成。
- 完成一塊 → commit(訊息含根因+驗證)+ push 到 `claude/ziwei-doushu-chart-site-55fdaa`。
- 機密一律環境變數,禁硬編。
- 排盤邏輯改動 → 已知生辰回歸驗證。
- 部署走 sg-deploy 管線,補齊新部署 6 項 SOP。

---

## 18. 2026-06-24 擴充決策(本次 session 鎖定,優先級高於前文衝突處)

> 本節是與 operator 多輪討論後鎖定的方向。與 §0–§17 衝突處**以本節為準**。產品從「單一算命網站」擴為「以算命引流的多品牌變現生態系」。

### 18.1 資料源策略(自算 vs API)
- **判準:API 的價值 = 計算難度。** 確定性算法(中式)誰算都一樣準,付費 API 不會更準。
- **中式系統一律自算、零邊際成本**:紫微(iztro)、八字(lunar-javascript)、卜卦(自寫)、**塔羅(自寫 78 牌 JSON + Fisher-Yates,絕不接 API)**。
- **塔羅特別註記**:它就是「Math.random + 靜態 JSON」,且是免費病毒漏斗;接 API = 為三行 code 按次付錢還被配額綁,**最虧,禁接**。
- **西洋占星才接**(行星位置要 Swiss Ephemeris,自算易錯):
  - MVP:`astrology-api.io`。**重要:不是月付 $11 通包**;$11 Starter 僅含約 1,000–5,000 次/月(≈每日 33–160 次),超量要升 $37(55k)/$99(220k)。**故西洋占星鎖在付費牆後,讓付錢的人才觸發按次呼叫,成本被收入覆蓋。**
  - 流量起來:切自架 **XALEN(`@xalen/wasm`,Apache-2.0)** → 零月費、可閉源、精度同級。⚠️ 別自架原生 Swiss Ephemeris:它是 **AGPLv3**,網路服務會傳染逼你全站開源(對付費牆 SaaS 是毒藥)。切換前用 3–5 張已知正確本命盤回歸驗證精度。

### 18.2 每日運勢工廠(免費病毒漏斗,成本趨近零)
今日運勢 / 幸運色 / 幸運數字 / 幸運方位 / 宜忌 —— **全是內容不是計算**,做法:
- **共用地基:一張五行↔屬性對應表**(靜態 JSON):`木{綠青,3/8,東} 火{紅紫,2/7,南} 土{黃棕,5/0,中} 金{白金,4/9,西} 水{黑藍,1/6,北}`。
- **幸運色/數/方位 = 純演算法**:取使用者喜用神五行(lunar-javascript 取日主→推喜用神;簡版先用日主或當日日柱五行)→ 查表。確定性、零 AI、零成本、同盤同日固定可重現。
- **宜忌 = lunar-javascript 內建黃曆**(`getDayYi()`/`getDayJi()`),免寫免 AI,全站同日共用快取。
- **今日運勢評分 = 規則算分**(iztro 流日盤落宮 + 四化吉凶 → 愛情/事業/財運/健康星等)。
- **運勢文案 = 便宜 AI(Haiku)**,唯一花錢處,但**快取鍵 = `chart_id + 日期`**:同盤同日只生一次 → 海量免費流量仍零增量成本。太陽星座今日運勢更只需 12 份/日全站共用。
- **差異化**:從**真命盤(流日/過運)**算 → 千人千面,贏競品「12 星座輪播罐頭文」。

### 18.3 內容引擎 —— 重用既有 `next-admin`,不要重造
公司已有完整「**Content Pipeline Blocks**」引擎(`lobster-factory/.../next-admin`,SSOT:`agency-os/docs/operations/CONTENT_PIPELINE_BLOCKS_MASTER_PLAN.md` §0.5 進度總帳):
- ✅ production:AI 文章生成(7 route,`lib/content/article/generate-core.ts`)、SEO 檢查(RankMath 16 點,`quality/seo-check-core.ts`)、熱點搜尋(`trending-sources.ts`)、brand-voice、發 WordPress(wp-bridge draft-first,`wordpress-core.ts`)、ContentStudio UI。
- 🟡 收尾中:影片生成(`apps/video-service/` 圖→Edge TTS→ffmpeg,Ken Burns/中文字幕/Flux 圖/Pexels B-roll,≈$0.02/支,骨架+真機驗證過,差積木接線)、社群發佈(Postiz 已部署 `postiz.aware-wave.com`,8 平台,差整合碼)。
- **算命站重用此引擎**產 SEO 文章+開運影片→自動發各社群帶流量回站。**禁止重造一套。**
- 文章後台:operator 大量寫文 → **Notion-as-CMS**(已有 Notion)或 MDX,前台仍 Next.js。

### 18.4 自己的 shop —— headless WooCommerce + POD,金流共用一層(天生無縫)
- **店核心 = WooCommerce**(operator 已熟、已有 POD→Printful+Woo 管線:`lib/studio/pod-product.ts`、`docs/PLAN-pod-one-click-auto-publish-design-to-woo-printful.md`)。**WooCommerce 不差,差的是把算命互動 app 塞進 WP** → 故分層。
- **架構(一次蓋對,不重工)**:
  - 前台(逛商品/購物車/**結帳/付款**)= **Next.js 算命站**,使用者全程不跳走、看不到 WordPress。
  - 金流 = **Next.js 一層 ECPay/Stripe**,同時收「訂閱 + 數位報告 + 實體商品」三種 → **只接一次,服務三者**。
  - **不使用 Woo 的結帳/金流**(那才是會被丟掉重做的東西)。Woo 退居純後端:商品/庫存/訂單記錄/觸發 POD(Printful)。
  - 付款成功後經 API 在 Woo 建訂單 → Woo 發 POD 出貨。
  - **這是「天生無縫 headless」,非「先有縫再無縫」** → 滿足 operator「不重工、直接做好」原則。
- **數位商品**(運勢報告/命書/解讀)= Next.js + 同一金流層直收,零庫存 ~100% 毛利,即買即 AI 生成 → 高客單主力。
- **WP/Woo 更新維護**:把自家 Woo 店納入既有 **MainWP + WPvivid 備份 + `/wp-maintenance safe-update` + Playwright 驗站** 流程(operator 本業強項,邊際負擔小)。headless 下 Woo 不需頁面建構器/佈景/前台外掛 → 攻擊面更小、要更新的更少。

### 18.5 三品牌共生漏斗(算命引流 → 變現三路)
```
免費算命/今日運勢(Next.js)
  ├─ 幸運色/開運穿搭 ──當場買實體(Next.js 結帳, Woo+POD 後端)──→ wear the world(服飾)
  ├─ 身心靈/療癒解讀 ───────────────────────────────────────→ soulful(身心靈)
  └─ 深度報告付費牆 ──數位商品(Next.js 金流直收)──→ 自家營收
全程 UTM + 站內事件歸因(lib/attribution.ts)→ 看哪條金流最強 → 加碼
```
- 殺手橋樑:「今日幸運色 → 開運穿搭推薦」是命理與服飾的天然接點,不突兀、轉換高。
- 「悄悄導流」靠內容原生橋樑(文末 CTA / 推薦)+ UTM,不靠生硬廣告。
- ⚠️ 待確認:soulful 確切定位(身心靈/課程/商品?)以校準橋樑文案。

### 18.6 部署目標更新(SG→EU 遷移 + 新 EU 機)
- operator 近期將 **SG → EU 遷移,並新購一台 EU 機** 託管。
- **ziwei 直接落地新 EU 機**(免日後從 SG 再搬一次)。新機是**第三台**,容器/網路/secrets 獨立登記(ENVIRONMENT_REGISTRY);SG/EU **不可混用**。
- 部署管線:複製 `sg-deploy.sh` 為 `eu-deploy.sh`(或參數化目標主機),**保留六項 SOP**(test gate / healthcheck / smoke / rollback / 通知 / typecheck),**禁止**在新機直接 git pull 繞 gate。
- DNS:`ziwei.aware-wave.com` A record 指新 EU 機 IP(機器/IP 確定後)。SG→EU 遷移本身是另一個 High-risk 大任務,需另開規劃。

### 18.7 範圍與順序提醒(operator 原則:地基一次蓋對、不重工;但功能仍按序蓋)
- **不重工 = 地基(金流層 / headless 架構 / 廠商無關 AI 層 / 每日運勢工廠 / 內容引擎重用)一次設計對,永不打掉重做。**
- **「一塊一塊蓋到好、不回頭拆」≠「先做小再做好」**:前者是必要的施工順序(先紫微→八字→…→合盤),不是重工;後者(同一塊做兩遍)才是浪費 → 避免。
- 建議施工順序(先賺錢的最小閉環,但每塊一次蓋到好):
  1. 紫微 MVP + 每日運勢工廠 → 上 `ziwei.aware-wave.com`(新 EU 機)
  2. Next.js 金流層(ECPay/Stripe)+ 數位商品付費牆(運勢報告)→ 第一條現金流
  3. 重用 next-admin 內容引擎產文章/影片導流 + Postiz 社群
  4. headless 接 Woo 店(無縫結帳,共用金流)+ 三品牌漏斗 + 歸因
  5. 訂閱、合盤、其餘系統(八字/卜卦/塔羅/西洋占星)

### 18.9 國際化 i18n + 多幣別金流(地基級,必須 day-1 設計,事後補=全站重工)
operator 要求:**國內外都賣,需英文版 + 各國語言。**
- **i18n 是地基不是功能** → 一開始就架,否則每個頁面/路由日後都要回頭改 = 正是要避免的重工。
- **翻譯成本趨近零的關鍵**:解讀/運勢/SEO 文章都是 **AI 生成** → 加 `language` 參數即原生輸出該語言,免人工翻譯。
  | 內容層 | 多語做法 | 成本 |
  |---|---|---|
  | 算命解讀 / 每日運勢文案 | AI `language` 參數原生生成 | ~零 |
  | SEO 文章 / 影片字幕 | 重用內容引擎 + 語言參數 | ~零 |
  | UI 介面(按鈕/選單) | 翻譯檔(**next-intl**),翻一次 | 小 |
  | 命理專名(星曜/卦/牌名) | 本地化對應表 JSON;西方概念直譯、中式概念附解釋 | 一次性 |
  | 商品 | headless → 多語在 Next.js 資料層管(不依賴 WPML) | 小 |
- **三件 day-1 必做(否則重工)**:
  1. **語言路由**:Next.js 原生 i18n,subpath `/[locale]/...`(`/zh` `/en` `/ja` `/zh-cn`)+ `hreflang` 標籤 → 各語言分別被 Google 收錄。
  2. **金流多幣別/多區/多 provider(升級 §7、§5 的金流決策)**:Next.js **金流抽象層** `pay(order, region/method)` 後掛多家 provider,**加一家 = 加一個 adapter,前台/結帳/商品零改動(operator 不重工原則的回報)**:
     - **台灣/中文圈 → 綠界 ECPay**(本地卡/超商/ATM)
     - **國際 → Stripe**(各國卡/Apple/Google Pay/多幣別)
     - **國際 → PayPal**(PayPal 帳號/餘額、品牌信任、買家保護;部分地區/年齡層只用 PayPal,缺了會漏單)
     - **未來可插(同層零重工)**:LINE Pay / 街口(台)、Alipay / 微信支付(中國+海外華人)
     - 依使用者地區自動路由預設方式,並列出其可用方式。
  3. **禁止硬編任何 UI 文字字串** → 第一行 code 就抽到翻譯檔 / AI 參數。
- **語言上線順序**(架構支援無限語言,AI 加參數即擴):① 繁中(台/港,主場)② 英文(國際+西洋占星/塔羅英語圈大)③ 簡中 ④ 日文(占い付費意願高)→ 之後韓/西/泰…。
- **語言 ≠ 市場定位**:西方語版主打西洋占星/塔羅(他們熟),紫微/八字當「異國神秘」特色;同站不同語言首頁可主推不同系統。
- **對既有資產影響**:next-admin 內容引擎現為繁中管線 → 生成函式加 `language` 參數(AI 本能輸出他語,小改);Woo 走 headless,商品多語在資料層管。

### 18.8 本次新增的開放決策(待 operator 提供才能動工)
- soulful 定位(校準身心靈漏斗文案)。
- wear the world / 自家 shop 的 Woo 站位置與網址(`shop.aware-wave.com`?)、Printful 帳號。
- 新 EU 機規格 / IP(部署目標)。
- ~~金流商(綠界 vs Stripe)~~ → **已定:ECPay + Stripe + PayPal 多 provider 抽象層**(見 §18.9);仍待 operator 提供各家帳號/key。
- 各 API key:`OPENAI_API_KEY`(AI 預設)、astrology-api.io key(MVP 西洋占星)。
- **語言上線清單最終確認**(預設 繁中→英→簡中→日,可調)。
