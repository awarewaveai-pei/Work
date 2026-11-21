# A2 西洋占星：尊貴、阿拉伯點、小限（批 6b；A1 併入後才做）

來源（MIT）：flatlib `flatlib\dignities\essential.py:160-170`（計分：廟 5、旺 4、三分主 3、界 2、面 1、陷 −4、失勢 −5）、`dignities\tables.py`（表；只有 Tetrabiblos 與 Lilly 兩張界表標了書名，預設表無出處）、`tools\arabicparts.py:41-176`（21 個公式，上升＋B−A，日夜盤互換）；openephem `src\openephem\profections.py`（年小限，整宮制、古典守護星）。細節：`research-detail/misc-rest.md`、`GITHUB_RESEARCH.md` §3 占星。

做：
1. 新檔 `lib/astrologyTraditional.ts`，純函式：七顆古典行星的本質尊貴（廟、旺、陷、失勢；三分主、界、面若表的出處不明就不做，寫進 RISKS）；日夜盤判定；福點與精神點；年小限（給出生與今天，回傳當年主宮與年主星；今天用 `lib/today.ts` `localToday`）。採用的傳統（守護星表、旺位度數）在檔頭寫明出處。
2. 接到 view、頁面一個「傳統占星」區塊、facts。
3. 測試：每顆古典行星廟旺陷失勢各抽一例；日盤與夜盤的福點各一例；小限 0 歲、12 歲、25 歲三例。

檔案：`lib/astrologyTraditional.ts`（新）＋測試、`lib/astrologyView.ts`、`components/AstrologyTool.tsx`、facts 組裝處、`messages/*.json`、`THIRD_PARTY_NOTICES.md`。
