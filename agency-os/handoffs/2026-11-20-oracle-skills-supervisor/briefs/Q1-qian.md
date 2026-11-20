# Q1 新系統：求籤（觀音靈籤一百首）

先讀 `COMMON.md`。`Ming-H/yinyuan-skills` **沒有授權**，它的籤詩與解說一律不用。

## 問題
站上沒有求籤。求籤是「抽選系」，接法與塔羅相同（`lib/divination/systems/tarot.ts`、`lib/tarot.ts` `drawCards` 的可注入亂數）。

## 定案（監工）
- 籤種：觀音靈籤一百首。只收**公版的傳統內容**：籤號、籤題（典故名）、吉凶等第、四句籤詩。
- 各網站的白話「解曰／聖意」是今人文字，不抄；解說交給 AI 依籤詩與提問主題敘事。
- **資料正確性是這張卡的全部風險**：一百首逐首要有兩個彼此獨立的公開來源，逐字比對一致才收。兩來源不一致的那幾首列清單回報，不自行挑一個、不憑記憶補字。找不到兩個可比對的完整來源 → 停下回報，不要做出一份查不到出處的籤詩。

## 要做的
1. `lib/qian/data.ts`：一百首（`{ no, title, grade, poem: [四句] }`），檔頭註明兩個來源網址與擷取日期。繁體；異體字以來源為準並在比對清單註明。
2. `lib/qian.ts`（純函式）：`drawQian(rng = Math.random)` 均勻抽 1–100；主題沿用塔羅的 `TOPICS` 概念但自己定義（綜合／感情／事業／財運／健康／出行）。
3. `lib/divination/systems/qian.ts`：`meta: { id: 'qian', kind: 'draw', requiresApiKey: false }`；facts＝籤號、籤題、等第、四句籤詩各一條、主題。
4. `components/QianTool.tsx`＋`app/[lang]/qian/page.tsx`：主題按鈕、一顆「求籤」按鈕、顯示籤號／籤題／等第／籤詩（英文頁保留中文原詩，介面文字英文）＋`components/AiReading.tsx`。
5. `FRAMING` 的 `qian` 項：依籤詩意象與典故對應提問主題，下下籤寫成提醒與可調整的方向，不恐嚇；健康主題不給醫療結論。

## 共用檔（各加一行；同批 S1 正在把這些清單收斂成單一來源，監工併入時處理，**不要自己去改導覽／sitemap／首頁／route 的清單**）
只加：`lib/divination/types.ts` 的 `SystemId` 一項、`lib/divination/index.ts` 註冊、`lib/ai/prompts/systems.ts` `FRAMING` 一項、`messages/*.json` 的 `nav.qian` 與頂層 `qian` 區塊。頁面先用網址 `/zh-TW/qian` 直接開來驗。

## 測試（只寫這些）
- 資料：共 100 首、`no` 1–100 不重複、每首四句、每句七個字（來源若有非七言的籤，列出例外並註明來源）。
- `drawQian`：注入亂數 0 與 0.999… 分別得到第 1 與第 100 籤。

## 不要做
不做擲筊流程、不做姻緣專用籤、不存抽籤紀錄、不做付費牆。
