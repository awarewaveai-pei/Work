# T1 塔羅：牌間關係＋解讀規則

先讀 `COMMON.md`。參考：`daman-ovo-0404/tarot-skill`（MIT）的 `SKILL.md`、`references/card-relations.md`、`references/combinations.md`、`references/spreads.md`、`references/cards.md`。

## 問題
- AI 只拿到牌陣名、主題、每個牌位的牌名與正逆位（`lib/divination/systems/tarot.ts:36-46`），沒有牌與牌的關係，多張牌的解讀只能逐張講。
- 塔羅的角色框架只有一句（`lib/ai/prompts/systems.ts:28-32`），沒有「建議要具體」「不宣判命運」的寫法。
- 牌陣 6 種（`lib/tarot.ts:92-98`），缺卡關決策、月度、時間線這三類。

## 要做的
1. 新檔 `lib/tarotRelations.ts`（純函式）：輸入 `DrawnCard[]`，輸出結構化關係：花色／元素分布（3 張以上同花色＝主導、缺席花色）、大阿卡納比例分級（>50%／30–50%／<30%）、相鄰牌關係（同花色數字升降、大阿卡納編號升降、元素相助或相剋、同數字不同花色、大牌編號和為 21、宮廷牌＋事件牌）。單張牌回空結果。
2. `lib/divination/systems/tarot.ts` 的 `toContext` 把第 1 點結果加進 `facts`（label 用穩定英文鍵，value 依 locale）；注意 `app/api/interpret/route.ts` 的 `MAX_FACTS = 60`、`MAX_VALUE = 300`，凱爾特十字 10 張也不能超過。
3. `lib/tarot.ts` 加三個牌陣：`diamond`（卡關決策）、`moon`（月度）、`horseshoe`（時間線），牌位名繁中／英文各寫；順手刪掉已標 `@deprecated` 的 `SPREAD_SIZE`（先 grep 確認無引用，有引用就改用 `SPREADS[id].size`）。
4. `lib/ai/prompts/systems.ts` 只改 `tarot` 一項：加入解讀寫法（逐牌用「當前狀態／盲點／行動／固定信念」擇一二個角度；多張牌必須用 facts 裡的牌間關係；結尾給一個本週可執行、具體到時間或動作的建議；不說「你一定會」；最後一句把選擇權交還提問者）。繁中、英文各自寫。
5. `components/TarotTool.tsx`：新牌陣出現在既有的牌陣按鈕列；結果區多一塊「牌間關係」（用第 1 點的結果，不經 AI）。字串進 `messages/*.json` 的 `tarot` 區塊。

## 檔案
`lib/tarotRelations.ts`（新）、`lib/tarotRelations.test.ts`（新）、`lib/tarot.ts`、`lib/tarot.test.ts`、`lib/divination/systems/tarot.ts`、`lib/ai/prompts/systems.ts`（只動 tarot 項）、`components/TarotTool.tsx`、`messages/zh-TW.json`／`en.json`（只動 `tarot` 區塊）、`THIRD_PARTY_NOTICES.md`。

## 既有資料
站上沒有存任何抽牌紀錄，無遷移。既有 6 個牌陣的 id 與牌位不改（`lib/tarot.test.ts` 既有測試須仍綠）。

## 測試（只寫這些）
- `tarotRelations`：每一類關係一個固定牌組案例；單張回空；10 張時 facts 總數 ≤ 60。
- 三個新牌陣：`positions` 長度＝`size`，兩語言都是。

## 不要做
不改抽牌亂數；不加牌義資料庫；不加 journaling、自訂牌陣、角色化 AI；不動其他系統。
