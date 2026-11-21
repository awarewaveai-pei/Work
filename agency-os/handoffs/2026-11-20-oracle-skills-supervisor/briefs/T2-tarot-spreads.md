# T2 塔羅：牌陣擴充、密碼學亂數、每日一牌

來源（皆 MIT 程式）：`fzlzjerry_tarot-mcp\src\tarot\readings\spreads.ts`（25 種，`:9-827`）、`anois_tarot\src\spreads\builtins.ts`（25 種，`:655-681` 清單）、亂數 `fzlzjerry_tarot-mcp\src\tarot\shared\utils.ts:6-47` 與 `anois_tarot\src\mechanics\rng.ts:16-37`、每日牌 `J-York_TarotWhisper\lib\tarot\daily.ts`。細節：`research-detail/tarot-mcp.md`、`misc-rest.md`。
現況：`lib/tarot.ts`（`SPREADS`、Fisher-Yates＋`Math.random` 可注入）、`lib/tarotRelations.ts`、`components/TarotTool.tsx`。

做：
1. 牌陣：兩個來源合併去重，扣掉本站已有的，其餘全部加入 `SPREADS`。每個牌位的名稱與說明自己寫，繁中＋英文。用一個測試鎖住：每個牌陣 `positions.length` 與宣告張數相等、id 不重複。
2. 畫面：牌陣變多，不可用下拉選單——依主題分組（一般、感情、事業財運、靈性成長、時間流年…），用看得到的按鈕；手機寬度可換行。
3. 亂數：預設來源改為 `crypto.getRandomValues`＋拒絕取樣的無偏整數；保留可注入 `rng` 供測試。正逆位同一來源。瀏覽器與 Node 測試環境都要能跑。
4. 每日一牌：同一本地日期（`lib/dates.ts` `localToday`）固定同一張牌與正逆位，確定性雜湊；不同日期不同。頁面加一個入口，facts 標明是每日一牌。兩個測試：同日同結果、連續 30 天不全相同。
5. 不取：任何牌圖（另一張卡 T3）、anois 的英文牌義（出處有著作權疑慮）、TarotWhisper 的洗牌寫法（有偏差）。

檔案：`lib/tarot.ts`、`lib/tarot.test.ts`、`components/TarotTool.tsx`、`lib/divination/systems/tarot.ts`、`messages/*.json`、`THIRD_PARTY_NOTICES.md`。
