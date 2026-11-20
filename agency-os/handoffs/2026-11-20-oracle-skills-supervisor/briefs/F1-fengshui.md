# F1 新系統：風水（玄空飛星＋八宅）

先讀 `COMMON.md`。`voidforall/fengshui.skill` **沒有授權**：只可看它的功能範圍與輸入項，演算法依傳統公開規則（《沈氏玄空學》《八宅明鏡》）自己寫，不得複製程式或文字。

## 問題
站上沒有風水。飛星與八宅都是固定演算法，適合「程式算、AI 講」。

## 已知事實
- 新系統的接法：實作 `DivinationSystem`（`lib/divination/types.ts:41`）→ `lib/divination/index.ts:12-15` 註冊。
- 節氣與立春換年用 `lunar-javascript`（已是相依套件，用法見 `lib/bazi.ts:99` 起）。
- 頁面骨架照 `app/[lang]/tarot/page.tsx`；九宮格可參考 `components/ZiweiChart.tsx` 的格狀排法。

## 要做的
1. 新檔 `lib/fengshui/feixing.ts`（純函式）：輸入「坐向（二十四山，由度數 0–359 換算，含兼向判定）＋入伙／建成年」→ 元運（三元九運，立春換年）→ 運盤、山盤、向盤九宮飛布（陽順陰逆）→ 每宮 `{ palace, period, mountain, facing }`；判定旺山旺向／上山下水／雙星到向／雙星到坐。另給流年飛星（年紫白入中）。
2. 新檔 `lib/fengshui/bazhai.ts`（純函式）：輸入出生年＋性別 → 命卦（立春換年；男女公式；五黃寄坤／艮）→ 東四／西四命 → 八方的生氣／天醫／延年／伏位／絕命／五鬼／六煞／禍害。
3. 新檔 `lib/divination/systems/fengshui.ts`：`meta: { id: 'fengshui', kind: 'chart', requiresApiKey: false }`；`toContext` 把格局、九宮三盤、流年星、命卦與八方吉凶寫成 facts（≤ 60 條，必要時每宮併成一條）。
4. 新檔 `components/FengshuiTool.tsx`＋`app/[lang]/fengshui/page.tsx`：輸入坐向度數（數字輸入＋八個方位快捷按鈕）、入伙年、（選填）居住者出生年與性別；結果畫九宮飛星盤（上南下北，標示方位）＋八宅八方表＋`components/AiReading.tsx`。
5. 文案語氣：講方位運用（床、書桌、大門的擺放方向），不恐嚇煞氣、不推銷擺件、不給醫療或投資結論。

## 共用檔（各加一行，監工併入時解衝突）
`lib/divination/types.ts:11` `SystemId` 加 `'fengshui'`；`lib/divination/index.ts` 註冊；`lib/ai/prompts/systems.ts` 加 `fengshui` 框架（繁中／英文）；`app/api/interpret/route.ts` 的 `SYSTEM_IDS` 加一項；`components/SystemNav.tsx:8` `SYSTEMS` 加一項；`messages/*.json` 加 `nav.fengshui` 與頂層 `fengshui` 區塊；`app/sitemap.ts`、首頁 `app/[lang]/page.tsx` 的系統清單各加一項。

## 檔案
上列新檔＋共用檔的那幾行。

## 既有資料
無儲存資料，無遷移。

## 測試（只寫這些）
- 飛星：兩個公開可查的標準盤（例：八運子山午向、九運壬山丙向）九宮三盤逐宮對得上；來源（書名或可查網頁）寫在測試註解。兼向一例。立春前一天歸前一年一例。
- 八宅：男女各兩個出生年的命卦；五黃男寄坤、女寄艮各一例；八方吉凶一例。

## 不要做
不做擇日（下一批）、不做城市五行地圖、不做替卦以外的進階派別、不做外煞圖像辨識；不動其他系統。
