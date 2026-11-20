# H1 新系統：合婚（八字合婚＋生肖配對）

先讀 `COMMON.md`。`Ming-H/yinyuan-skills` **沒有授權**：只可看它分哪幾種玩法，規則與文字一律依傳統公開規則自己寫，不得複製。

## 問題
站上沒有兩人合盤。路線圖把合婚列為高黏著功能（`Projects/internal/ziwei-doushu/ORACLE_ROADMAP.md:98`）。

## 已知事實
- 新系統的接法：實作 `DivinationSystem`（`lib/divination/types.ts:41`）→ `lib/divination/index.ts:12-15` 註冊。
- 單人八字用 `computeBazi`（`lib/bazi.ts:99`），回四柱、納音、日主、喜忌（`lib/bazi.ts:58-64`）。**直接呼叫它兩次，不重排盤、不改 `lib/bazi.ts`（B1 卡同時在改）。**
- 出生資料表單 `components/BirthForm.tsx`，頁面骨架照 `app/[lang]/bazi/page.tsx`。

## 要做的
1. 新檔 `lib/hehun.ts`（純函式）：輸入兩個 `BaziResult`，輸出各項結構化結果與原因，不給單一「幾分」的宣判式總分以外的東西時要附每項依據：
   - 年支生肖：六合／三合／六沖／相害／相刑／無
   - 日柱：日干五合、日支六合／六沖
   - 五行互補：一方喜用是否為另一方日主或旺行
   - 年柱納音五行生剋
   - 每項＝`{ key, verdict: '合'|'平'|'沖', basis }`；另給彙總（幾合幾平幾沖），不輸出 0–100 分。
2. 生肖配對：只有出生年的簡易模式，共用第 1 點的年支邏輯（生肖以立春換年，用 `lunar-javascript`，與 `lib/bazi.ts` 同源）。
3. 新檔 `lib/divination/systems/hehun.ts`：`meta: { id: 'hehun', kind: 'chart', requiresApiKey: false }`；`toContext` 把雙方四柱與各項結果寫成 facts（≤ 60 條）。
4. 新檔 `components/HehunTool.tsx`＋`app/[lang]/hehun/page.tsx`：兩組出生資料（重用 `BirthForm`，需要時小幅調整成可重複使用，不複製一份）；模式用兩顆按鈕切（完整八字／只用出生年）；結果逐項列出＋既有 `components/AiReading.tsx`。
5. 文案語氣：講相處課題與建議，不說「不能在一起」「剋夫／剋妻」這類話。

## 共用檔（各加一行，監工併入時解衝突）
`lib/divination/types.ts:11` `SystemId` 加 `'hehun'`；`lib/divination/index.ts` 註冊；`lib/ai/prompts/systems.ts` 加 `hehun` 框架（繁中／英文）；`app/api/interpret/route.ts` 的 `SYSTEM_IDS` 加一項；`components/SystemNav.tsx:8` `SYSTEMS` 加一項；`messages/*.json` 加 `nav.hehun` 與頂層 `hehun` 區塊；`app/sitemap.ts`、首頁 `app/[lang]/page.tsx` 的系統清單各加一項。

## 檔案
上列新檔＋共用檔的那幾行＋`components/BirthForm.tsx`（僅在需要重用時）。

## 既有資料
無儲存資料。`BirthForm` 若調整，既有四個使用它的頁面行為不變（實際開 bazi 頁確認一次）。

## 測試（只寫這些）
- `hehun`：六合、六沖、日干五合、納音相生各一例；立春前出生的生肖歸前一年一例。
- `lib/divination/registry.test.ts` 既有測試須仍綠。

## 不要做
不做紫微夫妻宫、桃花運、求籤（下一批）；不存任何人的出生資料；不做付費牆。
