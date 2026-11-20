# M1 新系統：奇門遁甲（時家・轉盤・拆補法）

先讀 `COMMON.md`。`FANzR-arch/Numerologist_skills` **沒有授權**：可讀它的 `qimen-dunjia/SKILL.md` 了解要輸出哪些盤面項目與問事流程，**不得複製其程式、規則文字或測試資料，也不要下載執行它的腳本**。演算法依傳統公開規則自己寫。

## 問題
站上沒有奇門遁甲（路線圖 `ORACLE_ROADMAP.md:107` 列為四術合一的一環）。排盤是固定演算法，適合「程式算、AI 講」。

## 定案（監工）
口徑固定一種並寫在頁面與檔頭：時家奇門、轉盤、拆補法定局、陰陽遁依節氣（冬至後陽遁、夏至後陰遁）、節氣與干支用 `lunar-javascript`（已是相依套件，用法見 `lib/bazi.ts`）。不做置閏法、飛盤、年家／月家／日家。

## 要做的
1. `lib/qimen/`（純函式，可拆數檔）：輸入國曆日期時間 → 四柱干支、節氣與上中下元、陰陽遁與局數、旬首與符頭、地盤三奇六儀、天盤、八門、九星、八神、值符、值使、空亡、馬星；輸出九宮每宮 `{ palace, earthStem, heavenStem, door, star, deity }` 加上述盤頭資訊。中五宮寄坤二。
2. `lib/divination/systems/qimen.ts`：`meta: { id: 'qimen', kind: 'chart', requiresApiKey: false }`；facts＝盤頭資訊＋九宮各一條（合併成一條 value，守 `MAX_VALUE = 300`、總數 ≤ 60）＋提問主題。
3. `components/QimenTool.tsx`＋`app/[lang]/qimen/page.tsx`：輸入起局時間（預設現在）與提問主題（按鈕）；畫九宮盤（上南下北，標方位）；`components/AiReading.tsx`。
4. `FRAMING` 的 `qimen` 項：依值符值使、用神所在宮的門／星／神組合講該主題的時機與方位；不恐嚇，不給醫療／法律／投資結論。

## 共用檔（各加一行；同批 S1 正在把清單收斂成單一來源，監工併入時處理，**不要自己去改導覽／sitemap／首頁／route 的清單**）
只加：`lib/divination/types.ts` 的 `SystemId` 一項、`lib/divination/index.ts` 註冊、`lib/ai/prompts/systems.ts` `FRAMING` 一項、`messages/*.json` 的 `nav.qimen` 與頂層 `qimen` 區塊。頁面先用網址 `/zh-TW/qimen` 直接開來驗。

## 測試（只寫這些；正確性靠黃金案例）
- 至少 4 個公開可查的完整盤（陽遁、陰遁各至少一個；含一個節氣交接日前後、一個中五宮寄宮的情況），九宮逐宮的地盤、天盤、門、星、神全對。每個案例在測試註解寫出處（書名頁碼或可查網頁）。找不到足夠的公開盤 → 回報有幾個、缺哪類，不自己造預期值。
- 局數：二十四節氣上中下元各抽樣，對照陰陽遁十八局口訣表。

## 不要做
不做擇時推薦、不做格局吉凶大全（只標值符值使與基本的門迫／擊刑／入墓若你能以案例驗證，否則不做）、不存起局紀錄。
