# 批 7：其餘可取用項目（批 6 併入後依序派；每節一張卡，先讀 `COMMON.md`＋`COMMON-B6.md`）

## A3 占星：行運與合盤（等 A1、A2）
來源（只取規則數值，Kerykeion 為 AGPL 不抄程式）：`research-detail/kerykeion-techniques.md` §2-3、`kerykeion-core.md`；openephem `src\openephem\aspects.py:87-159`（跨盤相位）、`returns.py:58-85`。
做：(1) 行運：今天（`lib/today.ts`）的行星對本命行星的相位，容許度一律 3°、日月不加寬、標入相／出相；(2) 合盤：兩人本命盤之間的相位，不判入出相；(3) 太陽回歸盤的時刻（回到本命太陽黃經，牛頓法或二分法，誤差 <1 角秒）。計算在伺服器端（`@xalen/wasm`）。合盤計分表（Discepolo）出處只有網址、兩版互相矛盾，**不採用**。
檔案：新 `lib/astrologyTransits.ts`、`lib/astrologySynastry.ts`＋測試、`lib/astrology.ts`、API 路由、`components/AstrologyTool.tsx`、`messages/*.json`。

## A4 占星：時間主星與其餘傳統技法（等 A2）
來源（MIT）：openephem `firdaria.py:28-38`、`zodiacal_releasing.py:37-39,75-95`、`decennials.py:30-36`；flatlib `tools\arabicparts.py:41-146`（其餘 19 個阿拉伯點）、`tools\planetarytime.py:43-96`（行星時）、`dignities\accidental.py:41-53`（日核／燃燒／光束下）。細節：第一輪占星讀者摘要在 `GITHUB_RESEARCH.md` §3 與 `research-detail/misc-rest.md`。
做：法達、黃道釋放（福點與精神點各一條線，至少兩層）、十年期、其餘阿拉伯點、行星時（需日出日落：先確認 `@xalen/wasm` 有無升落 API，沒有就不做並列 RISKS）、與太陽距離分級。年長一律 365.2425 天並寫明。每項一個已知答案測試。
檔案：`lib/astrologyTraditional.ts` 擴充或新檔＋測試、view、頁面、`messages/*.json`、`THIRD_PARTY_NOTICES.md`。

## V1 吠陀占星（等 A1）
來源：openephem `vedic.py`、`varga.py:44-141`（16 種分宮）、`vimshottari.py`（MIT；注意其 ayanamsa 係數是對照 Swiss 輸出擬合的，**不取係數**）。本站 `@xalen/wasm` 已有 `fullChartJson(…, ayanamsa_id)`、`nakshatraInfoJson`、`panchangJson`（`node_modules/@xalen/wasm/xalen_wasm.d.ts:30-43`），恆星黃道用 XALEN 自己的。
做：新系統（`SYSTEM_IDS`、`PAGE_SLUGS`、prompt 各加一項）：恆星黃道本命盤（Lahiri）、月宿（nakshatra）、九分盤（D9）、Vimśottarī 大運（年長取恆星年或回歸年二擇一並寫明，openephem 文件與程式在這點互相矛盾）、panchang。先讀 XALEN 實際輸出再定資料結構。
檔案：新 `lib/vedic.ts`＋測試、系統、頁面、元件、`messages/*.json`。

## Z3 紫微：星曜與術語知識進解讀（等 Z2）
來源：`x-haose_x-iztro\src\data\knowledge\iztro_docs.zh-CN.json`（MIT；162 星曜／64 格局／49 術語；底本 iztro-docs，55 條為 x-iztro 自撰；簡體）。現況：本站已有 `lib/ziwei/stars.ts`、`palaceReading.ts`（14 主星 × 12 宮）。
做：先列對照表（本站已有哪些星的解說、缺哪些）。缺的輔星、雜曜、四化、流耀補進本站既有的知識結構（轉繁、人工看過；自己改寫成本站語氣，不整段照抄），並在給 AI 的 facts 中附上命宮與三方四正內出現的星的一句要點（注意 60 條上限）。
檔案：`lib/ziwei/stars.ts`、`lib/ziwei/palaceReading.ts`、`lib/divination/systems/ziwei.ts`＋測試、`THIRD_PARTY_NOTICES.md`。

## T4 塔羅：追問補抽與伺服器定牌（等 T3）
來源：`J-York_TarotWhisper\lib\agent\agentTurn.ts:264-283`（追問時補抽 1–3 張）、`fzlzjerry_tarot-mcp\src\tarot\readings\visual-draw-manager.ts:183-379`（伺服器先洗整副並固定正逆位，前端只拿不透明編號）。
做：(1) 追問補抽：使用者對一次解讀追問時，可從剩餘牌堆補抽 1–3 張（由使用者按鈕決定張數，不由 AI 決定），補抽結果進 facts；(2) 伺服器定牌只在 X1 的對外介面有意義——併入 X1 的抽選類系統處理，本卡不另做。
檔案：`lib/tarot.ts`＋測試、`components/TarotTool.tsx`、`lib/divination/systems/tarot.ts`、`messages/*.json`。

## 不做及原因（已核對，不是因為缺介面）
- 佛曆、道曆節日（lunar-javascript）：與算命站主題無關。
- Kerykeion 的次限推運、主限、月亮空亡、日月食、偕日升：作者自承主限逆向為近似、次限角點取法與通行不同，且測試只有自產回歸；無可信規格可依。
- flatlib 主限向運、openephem 假想天體：前者無測試，後者驗證門檻與宣稱不符。
- 各專案的 UI、Agent 模式、BYOK 金鑰管理：與本站架構（伺服器端金鑰、確定性引擎）相反。
