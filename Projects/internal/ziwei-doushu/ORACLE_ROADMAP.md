# EVOLUTION PLAN — oracle 進化成全球最頂規東西方命理平台

> **本檔 = 競品天花板對標 + Gap 分析 + 分階段進化路線圖。**
> 與 `ORACLE_PLAN.md`（生態系/商業/架構 SSOT）互補：ORACLE_PLAN.md 答「做什麼生意」，本檔答「功能/精度/體驗如何做到全球第一」。
> 研究基礎：2026-06-25 跨 7 領域、38+ 競品的競品情報（每節附來源）。
> 位置：`Projects/internal/ziwei-doushu/`｜分支：`claude/ziwei-doushu-chart-site-55fdaa`
> 現況：5 系統 + 真太陽時 + 深色星空 UI 已上線（oracle.aware-wave.com）；AI 解讀 / 帳號 / 金流仍是 stub。

---

## 0. 一頁摘要（Executive Summary）

**定位升級**：從「5 系統算命站」→「**全球唯一把東西方命理全整合、用 Swiss Ephemeris 精度、AI 深度解讀、頂規消費體驗一次做齊的命理平台**」。

研究後的 **3 條核心洞察**（決定整份 plan）：

1. **所有頂規競品都是 Centaur 架構**＝確定性引擎算數字 + AI 只負責敘事解讀。oracle 已經有最難的「計算層」（紫微/八字/六爻/塔羅/每日運勢都自算且正確），**只差把結構化輸出餵給 LLM 的那一步** → 這是最短、最高 ROI 的變現路徑。
2. **西方用 Swiss Ephemeris（0.001 角秒）是精度天花板；但中式系統頂尖站全部自算**（文墨天機、神機閣、桃桃喜都不外包）。所以 oracle 正確架構＝**自算東方（護城河、0 邊際成本、文化精度）＋ Swiss Eph 算西方**，不是全外包給 API。
3. **oracle 獨有、全球幾乎無對標的殺手鐧 = 「多系統融合解讀」＋「東西方互參」**（同一個問題同時調紫微＋八字＋塔羅＋西洋盤，給一份融合敘事）。只有 Selfgazer 剛起步，主流競品全做不到。**這才是「比競品強 100 倍」的真正來源**，而不是再多一個算命功能。

**變現天花板組合**（競品已驗證可行）：Freemium ＋ 月/年訂閱（$7.99–9.99/月、$79–108/年）＋ AI 問答微交易（$1.99/題）＋ 一次性高客單報告（$9.99–29.99）＋（後期）真人諮詢抽成 ＋ 開運實體電商。

**MVP 第一刀**（避免範圍膨脹）：Phase A（AI 解讀層 + 帳號 + 訂閱 + 每日推播）就能形成「能收錢的閉環」。其餘都是疊加。

---

## 1. 對標天花板 — 各領域世界第一頂在哪

| 領域 | 天花板代表 | 「頂規」由什麼定義（oracle 要追的標準） |
|------|-----------|------------------------------------|
| **西洋·消費級/AI** | Co-Star（30M 用戶）、The Pattern、CHANI、Nebula | Transit-to-Natal 個人化「一日一則」推播；好友合盤社交圖層；AI 問答（The Void，$0.99–4.99/題）；截圖即傳播的品牌聲音文案；月亮儀式習慣 loop |
| **西洋·專業/精度** | Astro.com（Swiss Eph 原廠）、Astro-Seek、Solar Fire、TimePassages、Kerykeion | 0.001 角秒精度；小行星 20,000+/Chiron/Lilith；泛音盤/龍女座/中點/恆星 parans；推運全棧 + 任意行星返照；SVG 互動盤 hover 解讀；80,000 名人盤資料庫 |
| **中式·東方** | 文墨天機、神機閣、科技紫微網、桃桃喜、測測 | 紫微「原局→大限→流年→流月→流日→流時」七層四化分色疊圖；多派切換（飛星/三合/中州）；廟旺五等級；神煞 38+；八字喜用神/格局/十二長生/合婚；AI 解讀引古籍出處 |
| **塔羅/牌占** | Labyrinthos、Biddy Tarot、Golden Thread、Galaxy Tarot、Sanctuary | 牌陣庫 70+ ＋自訂牌陣 wizard；情境化卡義（感情/職涯/靈性）；journaling + 情緒 tag + 模式分析；Symbol Explorer 符號學；角色化 AI（4 人格）＋語音；學習/認證生態 |
| **精度引擎** | Swiss Ephemeris、astrology-api.io、Prokerala、Kerykeion、sweph(Node) | JPL DE441、0.001 角秒、13201 BC–17191 AD；23 宮位系統；Synastry/Composite/Transit/Return/Progression；Astrocartography；97 阿拉伯點 |
| **AI 解讀層** | Co-Star The Void、Selfgazer、Vedic AstroGPT、deeporacle | Centaur 架構（算/解分離，零幻覺）；結構化 JSON 注入 prompt；RAG/GraphRAG 命理古籍知識庫；LangGraph 多節點；prompt caching 降本 90%；分層模型；語義快取；安全護欄 |
| **UX/留存/變現** | Co-Star、CHANI、Sanctuary、Align27、AstroTalk（FY25 ~$141M） | 深色星空 or 拼貼美學；onboarding 主題插畫 + 未知出生時間處理 + geocoding；push/widget/streak/分享圖卡；好友社交；軟付費牆；訂閱+IAP+真人按分計費+實體電商五軌 |

> 完整競品逐項（含定價、來源 URL）保存在研究輸出；本檔取其「對 oracle 可行動」的部分。

---

## 2. Gap 分析 — oracle vs 天花板（合併去重）

**🔴 致命缺口（沒有就無法成為頂規 / 無法收錢）**
- **AI 解讀層完全是 stub** — 5 系統都只有計算無敘事，付費牆無從成立（所有頂規競品的核心）。
- **帳號 + 訂閱金流是 stub** — 沒有收入飛輪。
- **西洋占星完全缺席** — 全球最大占星市場零覆蓋（七家西洋競品的共同地基）。
- **無對話式 AI 問答入口** — 用戶無法用自然語言問命盤（The Void 型，已驗證高 LTV 微交易）。

**🟠 重大缺口（頂規分水嶺）**
- 紫微：缺流月/流日/流時、四化飛星多層疊圖、廟旺視覺化、神煞完整清單。
- 八字：**缺喜用神**（最核心商業化功能）、格局判定、十二長生、納音、合婚。
- 無 Synastry/Composite 合盤 — 占星 SaaS 最高黏著 + 最高轉化功能。
- 無每日 push notification / widget / 分享圖卡 — 留存與病毒傳播最關鍵觸發點全缺。
- 無好友/社交圖層 — Co-Star 30M 用戶的核心護城河。
- 塔羅：牌陣庫不足、無 journaling、無自訂牌陣、無情境化卡義、無 Symbol Explorer。

**🟡 進階缺口（拉開與一般站差距、付費牆錨點）**
- 泛音盤/龍女座/中點/恆星 parans/任意行星返照/Astrocartography（西洋進階）。
- 多系統融合解讀、RAG 知識庫、prompt caching 成本控制（AI 進階）。
- streak/徽章、月亮儀式 loop、真人諮詢 marketplace、一次性高客單報告、i18n 全球化、奇門/六壬。

---

## 3. 進化路線圖（5 階段）

> 原則：先切「能收錢的最小閉環」（Phase A），再補深度與規模。每階段都可獨立上線、獨立驗收。

### Phase 0 — 現況（DONE）
5 系統 + 真太陽時校正 + 深色星空 UI（剛上線）+ i18n(zh-TW/en) + SSG/SEO 地基。

### Phase A — 變現地基 + AI 解讀層　【P0｜MVP 第一刀】
| 功能 | 說明 | effort |
|------|------|--------|
| **Centaur AI 解讀架構** | 把現有計算輸出結構化成 JSON（星曜/宮位/飛星/大運/牌義）→ 注入 LLM system prompt，LLM 只敘事不算數 → 零幻覺 | M |
| **AI 問答入口（The Void 型）** | 自然語言問命盤 → 本命盤 JSON + Claude/GPT → 個人化回答 + 截圖分享 | M |
| **每日運勢個人化行運** | 用戶本命盤 × 今日流年/流月飛星/西洋行運 → 每人每天不同（非通用文）；快模型 + prefix caching | M |
| **帳號 + Freemium 付費牆 + 訂閱金流** | Supabase Auth + Stripe/ECPay；免費 Big Three + 每日一段，付費解全盤 + 流年 + AI Chat | L |
| **每日 push notification** | 個人化、可截圖的品牌聲音文案（FCM/APNs，留存 ROI 最高的單點） | S |
| **分享圖卡生成** | Satori/Sharp 生成命盤/運勢 OG 卡（IG/TikTok/LINE） | S |
**驗收**：免費用戶能問 3 題 AI、付費可無限；每日推播到手機；首批付費訂單成交。

### Phase B — 西洋占星引擎　【P0→P1】
| 功能 | 說明 | effort |
|------|------|--------|
| 接 astrology-api.io（MVP 跳板） | 本命盤 + Transit + Synastry + Composite + Solar Return；23 宮位 | S |
| 西洋盤 UI（SVG 互動盤 + aspect grid） | Kerykeion MIT SVG 或自繪；hover 解讀（TimePassages 標準） | M |
| 真太陽時貫穿西洋盤 | 把紫微已有的真太陽時校正套到西洋出生圖 | S |
| 自架 Swiss Ephemeris（精度護城河） | 見 §5；流量 >55K/月後切，0 邊際成本 + 解鎖動態宮位/固定星 | M |
| 小行星基礎包 | Chiron + Ceres/Pallas/Juno/Vesta + Lilith + Eris（競品免費標配） | S |
**驗收**：西洋本命盤 + 合盤上線，精度可對外聲稱（Swiss Eph）。

### Phase C — 東方深度補完　【P1】
| 系統 | 補完項 | effort |
|------|------|--------|
| 紫微 | 流月/流日/流時（iztro v6 已支援）；四化飛星多層分色疊圖；廟旺五等級；神煞 38+ | M |
| 八字 | **喜用神**（最高優先）；格局判定；十二長生；納音；八字合婚 | M |
| 塔羅 | 牌陣庫 40+（含情境/月相）；journaling + 情緒 tag；自訂牌陣；Clarifying Card；情境化卡義；角色化 AI | M |
| 紫微多派 | 飛星/三合 切換（台灣市場剛需） | S |
**驗收**：紫微/八字達中式天花板「基本達標」；塔羅有回訪黏性。

### Phase D — 留存與病毒　【P1】
好友合盤（社交護城河，邀請→填生辰→看合盤）｜streak + 徽章｜Home Screen Widget｜月亮儀式 loop（黃曆朔望 + 西洋月相 + 八字喜用神整合，**東西方獨家**）｜品牌聲音 push 文案庫。

### Phase E — 頂規與規模　【P2】
**多系統融合解讀（旗艦差異化）**｜RAG 命理古籍知識庫（防幻覺）｜Astrocartography 占星地圖｜Vedic 補完（Prokerala）｜真人命理師 marketplace（按分計費，最高 ARPU）｜年度付費報告（PDF 白標）｜i18n 全球化（繁/簡/英/日 + 文化本地化非直譯）｜奇門遁甲 + 大六壬（四術合一）。

---

## 4. AI 解讀架構（頂規做法，落地到 oracle）

oracle 已有 `lib/ai/interpret.ts`（stub）+ 正確計算層 → 只需補以下管線：

1. **Centaur 架構**：確定性引擎算 → 結構化 JSON/純文字表格（行星+星座+宮位+逆行+相位+容許度／紫微星曜+四化+廟旺）→ 注入 system prompt；prompt 明令 `NO CALCULATIONS`。LLM 只敘事。
2. **RAG + GraphRAG 知識庫**：把古籍（子平真詮/滴天髓/卦爻辭/塔羅牌意詞典/宮位星曜組合）向量化，先 retrieve 再生成 → 防 LLM 對東方命理的幻覺（訓練資料稀少）。GraphRAG 建星曜/宮位/相位知識圖做多層推理。
3. **LangGraph 多節點**：Node1 計算 → Node2 單系統解讀 → Node3 多系統融合，各節點獨立 prompt，避免 context drift。
4. **成本控制**：prompt caching（固定段落放最前，降 70–90%）＋ 分層模型（每日運勢用 Gemini Flash/GPT nano $0.1–0.4/M；本命盤用 Claude Sonnet；Premium 深度報告用 Opus）＋ 語義快取（cosine 相似度命中歷史答案，~31% query 可省）＋ Redis 快取預計算本命盤。
5. **安全護欄**：輸入驗證生辰格式；輸出過濾醫療/法律/自殘類；娛樂免責聲明。
6. **多語本地化**：各語言獨立 system prompt 模板（命理術語體系不同，**不能直譯**）；亞太本地化可提升留存 15–25%。
7. **心理學框架包裝（拓 TAM）**：可選「以榮格/心理洞察語言重述，避免宿命論」→ 同時吸引信與不信的用戶（The Pattern / Selfgazer 路線）。

---

## 5. 精度引擎決策（直接回答你的問題）

**Q：astrology-api.io 是最好的嗎？有更便宜/更讚的嗎？**
- **西洋 + 功能最廣**：`astrology-api.io` 最完整（23 宮位、100+ 端點、~287ms 最快、內建 AI 層、Astrocartography）。價格 Free(50)/Pro $11/Ultra $37/Business $99。
- **更便宜/更專的替代**：`Prokerala`（$19/mo，**5,000 credits 免費層**，Vedic 最強）；`VedicAstroAPI`（21 語含**繁中**，Tarot+Western+Vedic 三合一）；`AstrologyAPI.com`（300+ 端點、白標 PDF 強）。
- **結論**：西洋盤 + 功能廣度 → astrology-api.io；要省錢/要 Vedic → Prokerala 免費層先測。

**Q：中西方 astrology-api.io 都有了，根本不用自寫自架吧？**
- **錯，要分工**。① **中式系統（紫微/八字/六爻/塔羅）繼續自算** — 0 邊際成本 + 文化精度護城河，頂尖中式站全自算，API 反而做不好、還要付費。② **西洋先用 astrology-api.io 當跳板**，流量起來再切自架 Swiss Ephemeris。把命脈（東方）外包給第三方 API 是戰略錯誤。

**Q：自架 + 完整星曆檔（.se1）怎麼做？記憶體？維護？**
- **技術棧**：Node.js `sweph`（N-API 原生綁定）或 `swisseph-wasm`（WASM，零外部檔、可跑瀏覽器/edge）；Docker 化（原生 addon 需匹配 Linux x64）。
- **磁碟**：`.se1` 行星 + 月亮約 **97MB**（全套也才幾百 MB）。
- **記憶體**：**極低** — C 函式庫 per-call，非常駐大記憶體；10,000 組完整行星計算 < 3 秒（~0.3ms/次）。SG 共用 4GB 機完全吃得下（甚至比一個 Node 進程還省）。
- **授權**：AGPL 免費（須**全站開源**）**或**一次性 **CHF 700（≈US$800）商業授權**（閉源合法、無年費）。
- **維護**：**極低** — 基於 JPL DE441（2022 最新），星曆穩定，幾乎不需更新。
- **回本**：API 費用約在 **~300K req/月**後即被自架（0 邊際成本）反超。
- **精度**：**0.001 角秒 = NASA JPL DE441**，業界天花板，可正當對外聲稱「最準」。
- **⚠️ 陷阱**：別用純 Moshier 的庫（如 circular-natal-horoscope-js）抄捷徑 — 月亮精度只有 3 角秒，會明顯影響上升星座/宮位。要嘛 Swiss Eph 要嘛別聲稱「最準」。

> **路線**：Phase B 先 astrology-api.io（最快上線）→ 流量驗證後 Phase B 尾段切自架 Swiss Ephemeris（精度護城河 + 省 API 費 + 解鎖動態宮位/固定星自選）。

---

## 6. 「比競品強 100 倍」的真正 moat（oracle 獨有）

1. **東西方全整合單一平台** — 競品要嘛純西洋（Co-Star…）要嘛純中式（文墨天機…），沒有人兩邊都頂規。
2. **多系統融合解讀** — 同一問題同時調紫微＋八字＋塔羅＋西洋盤給融合敘事；全球僅 Selfgazer 起步，**這是旗艦差異化**。
3. **跨系統互參** — 抽到某塔羅牌 → 顯示對應五行屬性/易經卦象/紫微宮位類比；oracle 先天 5 系統具備，競品零對標。
4. **真太陽時貫穿東西方** — 西洋競品常忽略真太陽時，oracle 紫微已做，套到西洋盤即差異化精度。
5. **確定性自算引擎** — 非 `Math.random()`（競品 stargazer 就是亂數）、非外包；可正當聲稱精度。

---

## 7. 變現模型（具體定價，競品校準）

| 層級 | 內容 | 定價（參考競品） |
|------|------|----------------|
| Free | 每日運勢一段 + Big Three + 基本排盤 + 3 次 AI 問答 | $0 |
| 訂閱 | 全盤 + 流年 + 無限 AI Chat + 合盤 + 進階圖表 | **$7.99–9.99/月、$79–108/年**（Co-Star/CHANI/Align27 帶） |
| AI 問答 IAP | 超出免費額度的單題 | **$1.99/題**（Co-Star The Void $0.99–4.99 已驗證） |
| 一次性報告 | 全年流年詳批/八字喜用神精算/合盤 PDF | **$9.99–29.99/份**（桃桃喜 NT$498、Align27 $19.99 帶） |
| 真人諮詢（後期） | 命理師按分計費或固定場次 | $4.99–19.99/min 或 30 分 $30–50（Sanctuary/AstroTalk） |
| 實體電商（後期） | 開運道具/服飾（接 soulful / wear the world） | 高 AOV（AstroMall FY25 ₹140 Cr） |

**付費牆原則**：軟牆，在用戶**嘗到價值後**出現（非首屏即彈）；3–7 天試用，trial-to-paid 可達 18–40%。

---

## 8. 技術架構增量（要新增的東西）

- **lib/**：`ai/`（interpret 管線、prompt 模板、provider 抽象、RAG retriever）、`astro/`（西洋盤 — astrology-api.io client → 後 sweph）、`ziwei/` 補流月流日流時+四化+廟旺+神煞、`bazi/` 補喜用神+格局+合婚、`tarot/` 補牌陣+journaling、`synastry/`（合盤）。
- **API routes**：`/api/ai/ask`（問答）、`/api/astro/*`（西洋）、`/api/synastry`、`/api/og/[type]`（分享圖卡 Satori）、金流 webhook（Stripe/ECPay 驗簽）。
- **基礎設施**：Supabase（Auth + Postgres + RLS：帳號/存盤/訂閱/credits）；Redis（快取本命盤 + 語義快取）；向量 DB（pgvector on Supabase 即可）做 RAG；LLM provider（Claude 預設可切 GPT，開 prompt caching）；FCM/APNs 推播；Stripe + ECPay。
- **部署**：沿用 SG/EU Docker 管線（補新部署 6 項 SOP：test gate/healthcheck/smoke/rollback/通知/typecheck）。

---

## 9. 整合 backlog（可直接開工，依優先序）

**P0**：① Centaur AI 解讀架構 ② AI 問答入口 ③ 每日運勢個人化行運 ④ 帳號+訂閱金流+付費牆 ⑤ 每日 push ⑥ astrology-api.io 西洋盤 MVP
**P1**：⑦ 西洋 SVG 互動盤 ⑧ Synastry 合盤 ⑨ 八字喜用神/格局/合婚 ⑩ 紫微流月流日流時+四化+廟旺+神煞 ⑪ 塔羅牌陣+journaling+情境卡義+角色化AI ⑫ 分享圖卡 ⑬ 好友合盤社交 ⑭ streak/徽章 ⑮ 自架 Swiss Ephemeris ⑯ RAG 知識庫 ⑰ prompt caching+分層模型 ⑱ 一次性報告 ⑲ onboarding（未知出生時間+geocoding）
**P2**：⑳ 多系統融合解讀 ㉑ Astrocartography ㉒ Vedic(Prokerala) ㉓ 真人 marketplace ㉔ widget ㉕ i18n 全球化 ㉖ 奇門/六壬 ㉗ 泛音/龍女座/中點/恆星 ㉘ 心理學框架輸出

---

## 10. 風險與「不做什麼」

- **範圍膨脹**（最大風險）：嚴守 Phase A 為 MVP 第一刀，先有能收錢的閉環再疊加。其餘照階段走。
- **Swiss Eph 授權**：自架前先決策 AGPL（全開源）vs CHF 700 商業授權（閉源）。
- **AI 幻覺**：東方命理 LLM 幻覺率高 → RAG 知識庫是品質護城河，不是 optional。
- **合規**：娛樂免責聲明、GDPR、WCAG 2.1 AA（深色主題對比度 4.5:1，歐盟無障礙法 2025-06 已生效）。
- **不做**：① 不重寫已驗證的東方計算引擎（紫微/八字/六爻/塔羅自算是護城河）。② 不把東方系統外包給第三方 API。③ 不用 Moshier 捷徑卻聲稱「最準」。

---

_研究來源：Co-Star/The Pattern/CHANI/Nebula/Sanctuary/Stellium/Astrology Zone、Astro.com/Astro-Seek/Solar Fire/TimePassages/Kerykeion/AstroApp、科技紫微網/桃桃喜/測測/靈匣/神機閣/文墨天機/靈爻妙解、Labyrinthos/Biddy Tarot/Golden Thread/Galaxy Tarot/Tarot.com、Swiss Ephemeris/astrology-api.io/Prokerala/AstrologyAPI/VedicAstroAPI/sweph、Selfgazer/Vedic AstroGPT/deeporacle、Align27/AstroTalk/Aurae 等 38+ 站完整 URL 清單存於研究輸出。生成：2026-06-25。_
