# HANDOFF — 紫微斗數 × 東西方命理 SaaS

> **明天接手的 AI / 開發者：先讀完這份再動工。這是本專案的單一事實來源（SSOT）。**
> 位置：`Projects/internal/ziwei-doushu/`（AwareWave Work monorepo 內）
> 分支：`claude/ziwei-doushu-chart-site-55fdaa`

---

## 1. 這是什麼 / 為什麼做

使用者要做一個**以紫微斗數為核心、涵蓋東西方多系統**的命理網站。目標兩個字：**最準 + 賺錢**。
靈感／對標競品：`stargazer.estework.site`（Lenormand 占卜站），我們要做到「比它強 100 倍」。

**競品逆向結論（已完整拆解，重要）**：
- 它是 React + Vite + Cloudflare Pages 靜態站，**無後端、無 AI**。
- 抽牌 = 純前端 `Math.random()` Fisher-Yates 洗牌取前 N 張（無種子、無玄學）。
- 它**不在站上做解讀**——產生一段 prompt，叫使用者自己貼去 ChatGPT/Claude。→ operator AI 成本 = 0，但**無法對解讀收費**。
- 變現靠**人工**寫解讀委託（NT$300/1000）+ Buy Me a Coffee 抖內。不可規模化。

**我們贏它的點（=產品差異化核心）**：
1. **內建 Claude AI 解讀**（解讀在站內 → 可放付費牆 → 可規模化、毛利 >80%）。
2. **多系統**：紫微(真太陽時校正) + 八字 + 卜卦 + 塔羅 + 西洋占星(Swiss Ephemeris)。
3. **天文精度**：排盤是確定性算法 + 真太陽時校正（競品做不到）。
4. 帳號 / 存盤 / 訂閱 / 合盤。

---

## 2. 技術決策（已定案，勿推翻）

| 模組 | 方案 | 理由 |
|------|------|------|
| 框架 | **Next.js 16 (App Router) + Tailwind v4**（已建） | SSR=SEO=免費流量 |
| 紫微排盤 | **iztro**（已裝）+ 自寫真太陽時校正（已建） | 確定性算法已最準 |
| 八字四柱 | **lunar-javascript**（未裝） | 農曆/節氣/四柱業界標準 |
| 卜卦(易經) | 自寫 64 卦 + 六爻起卦（未做） | 簡單可控 |
| 塔羅 | 78 張牌庫 JSON + 純亂數抽牌（未做） | 抽牌邏輯照抄競品(Fisher-Yates) |
| 西洋占星 | **astrology-api.io**（Swiss Eph，~US$11/月，未接） | 天文精度黃金標準 |
| 解讀引擎 | **Claude API**：Haiku=每日輕量 / Sonnet 4.6=主力深度 / Opus 4.8=頂規；模型 ID 用最新（`claude-opus-4-8` 等）；開 prompt caching 快取命理知識系統提示 | 文案=「準」的來源 |
| 資料庫 | Supabase(Postgres)（未接） | 帳號/存盤/訂閱/點數 + RLS |
| 金流 | 綠界 ECPay(台) / Stripe(國際)（未接） | 訂閱+單筆 |

**機密**：所有 API key 走環境變數，**禁硬編**（astrology-api.io / Claude / 金流 / Supabase）。

---

## 3. 部署 / 網址（待使用者最終拍板）

- 程式碼：留在 `Projects/internal/ziwei-doushu/`。
- 託管：**Vercel**（Next.js 最順、免費）或 Cloudflare Pages。
- 網址（建議）：先用 **aware-wave.com 子網域**（如 `ziwei.aware-wave.com`，零成本，CF 加一筆 DNS）；品牌驗證後再買專屬網域。
- ⚠️ **不要**放進 `app.aware-wave.com`（那是企業佈建 console，用途不同）。

---

## 4. 變現設計（已定案）

- **訂閱（建議 NT$249/月，使用者尚未最終確認價格）**：每日塔羅/運勢等輕量測算（Haiku，~NT$0.3/次）**無限刷**；**深度萬字報告計量**（含 N 篇/月，超出用點數加購）→ 防重度用戶刷爆 Opus。
- **一次性高客單**：使用者已點名「**全年流年運勢報告**」；之後可加八字合婚 / 寶寶起名。
- 成本實算：固定 ~US$11/月(西方API) + 主機邊際 0；AI 每份深度報告 Haiku~NT$2.5 / Sonnet~NT$8 / Opus~NT$13。

---

## 5. 目前進度

### ✅ 已完成（Phase 0，commit `e02796c`，已 push）
- Next.js 16 + Tailwind scaffold。
- `lib/trueSolarTime.ts`：真太陽時校正（經度差 + 均時差 → 修正時辰；可跨日；含 `hourToTimeIndex`）。
- `lib/ziwei.ts`：iztro 封裝；`computeChart(req)` → 真太陽時校正 → 安星。
- `components/BirthForm.tsx`：生辰輸入（國/農曆、性別、城市經度、真太陽時開關）。
- `components/ZiweiChart.tsx`：12 宮固定方位渲染（主星廟旺+四化、大限、身宮、中宮命主資訊）。
- `app/page.tsx`：表單 + 命盤組合（client component）。
- **驗證**：`npx tsc --noEmit` ✅、`npm run build` ✅；排盤對照 iztro 範例 2000-08-16 女 → 命主破軍/身主文昌/木三局 ✅。

### ⬜ 待做（依優先序）

**Phase 1 — 紫微 MVP 上線**
- 命盤 UI 完善：三方四正連線、大限/流年盤切換、四化飛星標示、RWD 手機版。
- `app/layout.tsx` SEO metadata（title/description/OG）；`app/api/og/route.tsx` 動態分享圖卡。
- 部署到 Vercel + 掛子網域。

**Phase 2 — AI 解讀（賺錢核心，最高槓桿）**
- `lib/ai/interpret.ts`：Claude API 封裝，模型分流(Haiku/Sonnet/Opus) + prompt caching + streaming(萬字)。
- `lib/ai/prompts/`：各系統解讀系統提示（**可直接改寫競品那段「組合解讀/忠於牌義/不空泛安慰」的 prompt 骨架**，品質好且省事）。
- `app/api/interpret/route.ts`：付費牆 + 額度檢查後才呼叫 Claude。
- 需要 `ANTHROPIC_API_KEY`（環境變數）。

**Phase 3 — 多系統**
- `lib/bazi.ts`(lunar-javascript) + `app/bazi/page.tsx`。
- `lib/iching.ts` + `app/iching/page.tsx`。
- `lib/tarot.ts`(78 牌 + 純亂數抽牌，Fisher-Yates) + `app/tarot/page.tsx`。
- `app/api/astrology/route.ts` 代理 astrology-api.io（隱藏 key）+ `app/astrology/page.tsx`。

**Phase 4 — 帳號/金流/變現**
- Supabase 帳號 + schema（users / charts / subscriptions / credit_ledger / readings）+ RLS。
- 綠界/Stripe 訂閱 + 單筆 + webhook；`lib/credits.ts` 計量。

**Phase 5 — 獲客引擎**
- 每日免費抽牌分享圖卡 → 一鍵分享 IG/TikTok/Threads/FB/LINE/小紅書。
- UTM/referral 歸因儀表。

---

## 6. 怎麼跑 / 怎麼驗證

```bash
cd Projects/internal/ziwei-doushu
npm install          # 首次
npm run dev          # 本地開發 http://localhost:3000
npx tsc --noEmit     # 型別檢查（改 .ts/.tsx 後必跑，型別錯不得宣告完成）
npm run build        # production build gate
```

**排盤正確性驗證**：用已知生辰對照 iztro 標準輸出（命主/身主/五行局/四化）。
**真太陽時驗證**：對照已知經度的校正分鐘數（台北經度 121.5、UTC+8）。

---

## 7. 抽牌原理（Phase 3 塔羅/卜卦用，照抄競品即可）

純前端、無種子、無後端：
1. 牌堆 = 陣列（塔羅 78 / 雷諾曼 36）。
2. **Fisher-Yates 洗牌**（`Math.random()`，從尾往前每張跟前面隨機一張交換 → 每種排列等機率）。
3. 取前 N 張；不放回（排除已抽）。
紫微/八字是**確定性排盤**，不用抽牌。

---

## 8. 待使用者拍板的開放問題
- 訂閱價（建議 NT$249，深度報告計量）。
- 專屬網域 vs 先用 `ziwei.aware-wave.com` 子網域。
- 金流商（綠界台灣 vs Stripe 國際）。
- `ANTHROPIC_API_KEY` / `astrology-api.io` key / Supabase 專案 → 由使用者提供後才能接 Phase 2/3。

---

## 9. 紀律提醒（接手者必守）
- 改 `.ts/.tsx` → 跑 `npx tsc --noEmit`，過了才算完成。
- 完成一塊 → commit（訊息含根因+驗證）+ push 到 `claude/ziwei-doushu-chart-site-55fdaa`。
- 機密一律環境變數，禁硬編。
- 排盤邏輯改動 → 用已知生辰回歸驗證，別憑感覺。
