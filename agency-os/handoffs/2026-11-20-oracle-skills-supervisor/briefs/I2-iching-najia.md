# I2 易經：六爻納甲排盤

來源：`D:\tmp\oracle-repos\JinyangWang27_ichingpy\src\ichingpy\divination\six_lines.py`（MIT；納干 `:76-98`、納支 `:34-43,100-114`、世應 `:122-147`、六親 `:156-169`、六神 `:149-154`）、同 repo 的 `six_line_hexagram.py`（八宮歸屬 `:36-49`，先 Glob 找路徑）、`sexagenary_cycle.py:107-120`（旬空）。對照：ichingshifa 的同類規則在 `data.pkl` 內（不可載入），只能看 `ichingshifa.py` 的用法。已知 ichingpy 的缺陷：八宮歸屬只有 12 個測試、`get_judgement` 有錯（不要參考那一段）。細節：`GITHUB_RESEARCH.md` §3 易經。
現況：`lib/iching.ts`（起卦，`hexagramFromSums`）、`lib/iching/text.ts`（經文）、`lib/iching/reading.ts`（變爻讀法）、`lib/divination/systems/iching.ts`、`components/IChingTool.tsx`。

做：
1. 新檔 `lib/iching/najia.ts`，純函式：給本卦（六爻陰陽、動爻）與起卦日的日干支，算出八宮與卦宮五行、世爻應爻、每爻納甲干支、六親、六神、日旬空；動爻另給變出之爻的干支與六親。
2. 八宮歸屬必須 64 卦全驗：測試逐宮列出八個卦（本宮、一世到五世、遊魂、歸魂），64 卦不重不漏。納甲取京房通行口徑（乾內甲外壬、坤內乙外癸…），在檔頭寫明。
3. 起卦日干支：用 `lib/today.ts` `localToday` ＋ `lunar-javascript`（日柱 0 時換日，與本站八字一致），可注入日期供測試。
4. 接到 facts（每爻一條：爻位、陰陽、干支、六親、六神、世／應、是否動、是否旬空）與頁面（在卦象旁或下方一張表；沿用既有 class）。prompt（`lib/ai/prompts/systems.ts` iching 項）補一句：六親、世應、旬空只可用 facts 給的值。
5. 測試：乾為天、坤為地、天風姤、火水未濟四卦的整盤（世應、六親、納甲）；一個日干支的六神起法；一個旬空例。

檔案：`lib/iching/najia.ts`（新）＋測試、`lib/divination/systems/iching.ts`、`lib/ai/prompts/systems.ts`、`components/IChingTool.tsx`、`messages/*.json`、`THIRD_PARTY_NOTICES.md`。
