# A1 西洋占星：本命盤相位

來源（只取規則與數值）：Kerykeion `kerykeion\settings\config_constants.py:605-611,634-637`、`aspects\utils.py:57-82,145-285`、`aspects\orb_utils.py:276-279`（AGPL，不可抄程式）；openephem `src\openephem\aspects.py`（MIT）；flatlib `flatlib\aspects.py`（MIT）。細節：`GITHUB_RESEARCH.md` §3 占星表、`research-detail/kerykeion-core.md`。
現況：`lib/astrology.ts`（`@xalen/wasm` 算行星黃經、宮位，伺服器端）、`lib/astrologyView.ts`、`components/AstrologyTool.tsx`、`/api/astrology`。

做：
1. 純函式 `computeAspects(planets)`（新檔 `lib/astrologyAspects.ts`）：五種主要相位（合 0、六合 60、刑 90、拱 120、沖 180）；容許度合／沖／拱／刑 6°、六合 5°；日或月參與時 +1.5°（兩者都在只加一次）；角距取最短弧（跨 0° 正確）；同時符合多個相位時取離準確最近的一個；回傳兩星、相位、實際偏離度數。上升點、天頂、北交點是否納入由你定並寫進檔頭。
2. 入相／出相：先確認 `@xalen/wasm` 的 `planetPositionJson` 有沒有回傳速度（讀 `node_modules/@xalen/wasm/*.d.ts` 與實際輸出）。有才做（用速度判斷偏離變大或變小），沒有就不做，不要用猜的。
3. 接到 `WesternChart`／view、頁面顯示相位表（依偏離度數由小到大）、給 AI 的 facts（每條一個相位，注意 60 條上限：超過時只取偏離最小的若干條並在檔頭寫明上限）。
4. 測試：跨 0°（359° 與 1° 合相）、容許度邊界內外各一、日月加寬、取最近相位、一張已知生辰的相位數量快照。

檔案：`lib/astrologyAspects.ts`（新）、其測試、`lib/astrology.ts`、`lib/astrologyView.ts`、`components/AstrologyTool.tsx`、占星 facts 的組裝處（先 grep `systemId: 'astrology'`）、`messages/*.json`、`THIRD_PARTY_NOTICES.md`（openephem、flatlib 各一段；Kerykeion 只取公開規則數值，寫一句說明）。
