# 正式專案計畫 — 紫微斗數 × 東西方命理 SaaS

> **本檔 = 專案唯一正式計畫(SSOT)。** 快速接手讀 `HANDOFF.md`;完整規格、決策、路線圖看本檔。
> 位置:`Projects/internal/ziwei-doushu/`(AwareWave Work monorepo)
> 分支:`claude/ziwei-doushu-chart-site-55fdaa`
> 最後更新:2026-06-23

---

## 0. 一頁摘要(Executive Summary)

打造一個**以紫微斗數為核心、涵蓋東西方多系統**的命理 SaaS,目標「**最準 + 賺錢**」,要比對標競品 `stargazer.estework.site`「強 100 倍」。

- **核心差異化**:競品把解讀外包給使用者自己的 AI(收不到錢、不可規模化);**我們把 AI 解讀內建站內 → 放付費牆 → 可規模化、毛利 >80%**。再疊加多系統 + 天文精度 + 帳號訂閱。
- **賺錢模式**:免費輕量測算養流量 → 付費解鎖 AI 深度解讀(訂閱) + 一次性高客單(全年流年運勢報告 / 合婚 / 起名)。
- **託管**:**自架 SG/EU VPS(走既有 `sg-deploy.sh` 管線)為主**,Vercel 為備選。
- **網址**:**`ziwei.aware-wave.com` 子網域(零成本)**;品牌起來再買專屬網域。
- **AI**:**廠商無關 AI 層,預設 GPT,可切 Claude,用真命盤 A/B 選贏家**。
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

---

## 17. 接手紀律(必守)

- 改 `.ts/.tsx` → `npx tsc --noEmit` 過才算完成。
- 完成一塊 → commit(訊息含根因+驗證)+ push 到 `claude/ziwei-doushu-chart-site-55fdaa`。
- 機密一律環境變數,禁硬編。
- 排盤邏輯改動 → 已知生辰回歸驗證。
- 部署走 sg-deploy 管線,補齊新部署 6 項 SOP。
