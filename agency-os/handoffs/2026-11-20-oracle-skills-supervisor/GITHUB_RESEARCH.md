# Oracle 六類 GitHub 候選：原始碼全讀報告（2026-11-21）

輸入：操作者的 `AWARE_WAVE_ORACLE_GITHUB_RESEARCH_FOR_CLAUDE.md`（17 個專案）。
方法：17 個專案 shallow clone 到 `D:\tmp\oracle-repos`（commit 見 §8），**只讀、未執行任何候選程式**；分領域派讀者逐行讀，回報附 `路徑:行號`；主線抽驗 12 個關鍵論點（§7）。
細節只在一處：`research-detail/*.md`（13 份、約 3.9 千行）。本檔只留結論與指標。路徑未註明者皆相對於各 repo 根目錄。

## 0. 結論

1. **不需要換任何引擎。** 紫微（iztro）、八字與每日（lunar-javascript）本站已在用；占星已用 Apache-2.0 的 `@xalen/wasm`。17 個候選裡沒有一個值得整包引進。
2. **真正要做的是本站自己的五件事**（§5）：兩個現有錯誤、iztro 升級（比原先以為的影響大）、易經補原文、占星補相位。
3. **可取用的外部資產只有三樣**：iching-kit 的卦爻辭資料與朱熹規則（MIT，要修 2 字）；Kerykeion／openephem／flatlib 的相位規則數值（只抄數字當規格）；tarot-mcp 的牌圖（MIT，但有條件，§4）。
4. **不可用**：anois 牌圖（78 張全印「© 1971 U.S. Games」）、anois 英文牌義（檔頭自標出自 Mark McElroy 的書）、Kerykeion（AGPL）、ziwei-chart（GPL-3.0）、flatlib 附帶的 Swiss 星曆檔。

## 1. 查核深度（照實）

| 專案 | 授權 | 逐行讀完 | 沒逐行讀 |
|---|---|---|---|
| SylarLong/iztro 2.6.5 | MIT | `src` 函式庫 47 檔 6,175 行；測試、CHANGELOG、scripts、examples 8,545 行；並逐檔對照本站安裝的 2.5.8 | 已建置的 `docs/**`；`src/i18n/locales`（腳本比對 zh-TW／en-US／zh-CN） |
| SylarLong/react-iztro | MIT | `src` 2,265 行 | README、`.github` |
| ziweiknows/ziwei-chart | GPL-3.0 | `app/src`、測試、`docs/dev` 11,748 行 | `birthplace-data.json`（只看結構）、AGENTS／CLAUDE.md |
| x-haose/x-iztro 0.6.1 | MIT | Rust／Python／Go 原始碼與測試、產生器、workflow 約 56,000 行 | 金標資料、`docs/content`（51,230 行，只計數）、知識包 JSON（讀結構） |
| 6tail/lunar-javascript 1.7.8 | MIT | 全部程式與 23 個測試 | 純數值係數與編碼表（與 Python 版腳本逐值比對相同） |
| 6tail/lunar-python 1.4.9 | MIT | 全部 | 同上 |
| cantian-ai/bazi-mcp | ISC | 全部 | lockfile |
| J-York/TarotWhisper | MIT（程式） | 全部程式、測試、設定 約 12,000 行；78 張牌圖四邊逐張看 | `favicon.ico` |
| fzlzjerry/tarot-mcp | MIT（含牌圖） | `src`、`ui`、scripts、文件 31,221 行＋CSS 2,668 行；`card-data.json` 腳本全掃；牌圖雜湊 80/80 比對 | 牌圖只親看 3 張 |
| anois/tarot | MIT（程式） | 全部程式＋三個資料檔 4,775 行；78 張牌圖邊緣逐張看 | lockfile |
| Ann1949/iching-kit 0.1.0 | MIT | 全部 | — |
| kentang2017/ichingshifa | MIT | 全部 | `data.pkl`（不載入，只抽字串） |
| JinyangWang27/ichingpy | MIT | 全部（含兩份 JSON 腳本全量比對） | lockfile |
| bonchiang96/iChing-JS | 無 LICENSE 檔 | 全部 | 壓縮後的 dist |
| g-battaglia/kerykeion 6.1.0 | AGPL-3.0 | 套件 `kerykeion/` 全部 .py 60,919 行；CHANGELOG 全文；cli、examples、skills | **`tests/core` 122 檔 66,951 行：整檔讀完 17 檔，其餘只讀檔頭、基準來源、容差、skip 條件並全檔 grep**；15 支大型 scripts 只讀檔頭；3 個 XML 範本與 3 個 CSS 只 grep |
| flatangle/flatlib | MIT（archived） | 全部 | Swiss 星曆二進位檔 |
| NoahChristian/openephem 0.5.0 | MIT | 全部 | — |

## 2. 本站現有錯誤（與候選無關，讀 iztro 時對照出來，已親驗）

- **E1 農曆輸入＋真太陽時算錯**：`Projects/internal/ziwei-doushu/lib/ziwei.ts:117-132` 把農曆年月日當國曆交給 `toTrueSolarTime`；表單預設開啟校正（`components/BirthForm.tsx:64`）。均時差算錯；農曆二月三十這類國曆不存在的日期被推成三月二日。
- **E2 今日運限用 UTC 日期**：`components/ZiweiTool.tsx:20-22` `new Date().toISOString().slice(0,10)`，台灣 08:00 前是前一天。
- **E3 註解與事實不符**：`lib/ziwei.ts:60-61,79` 寫「不傳 timeIndex 取呼叫當下時辰」；iztro 對不帶時間的日期字串取 0（早子時），結果確定。
- **E4 易經 facts 無原文**：`lib/divination/systems/iching.ts:12-24` 只給卦名與動爻，卦辭爻辭由模型憑記憶寫。

## 3. 各領域事實

### 紫微（細節：`research-detail/iztro-src.md`、`ziwei-rest.md`、`x-iztro.md`）

- **iztro 2.5.8 → 2.6.5 會改變本站輸出的項目**：
  - 酉宮亮度：太陽 陷→平、太陰 不→旺、七殺 廟→旺（新 `src/data/stars.ts:23,48,73` 第 8 格；舊 `node_modules/iztro/lib/data/stars.js:25,50,75`）。本站亮度直取 iztro（`lib/ziwei/brightness.ts:46`），連帶影響亮度指數、格局判定、逐宮語氣、給 AI 的 facts。
  - **晚子時整盤換日（2.6.4 #314）**：`timeIndex 12` 改成「次日早子」整張盤（`src/utils/date.ts:11-20`）。舊版只把紫微與三台八座恩光天貴的日數 +1（`lib/star/location.js:47-51`），月、年、閏月仍用原日。本站 23 點出生傳 12 → 所有晚子時盤的農曆日期顯示次日；農曆月底、閏月十五、除夕出生者命宮、五行局、紫微與月系日系星整組改變，除夕連生肖與年干支都變。
  - 非法日期改為丟錯（舊版靜默回捲）；en-US 武曲、歲破譯名與 lunarDate 格式改變。
  - 四化表、命主身主表、zh-TW 譯名：腳本比對逐字相同。
- 2.5.8 的 `language` 參數會改全域語言，伺服器並發不安全；2.6.5 每次計算後還原。本站目前只在瀏覽器排盤，無暴露。
- iztro 測試 183 個呼叫、期望值手寫、無外部金標。升級可直接用的回歸案例已抄錄：`research-detail/ziwei-rest.md` §2.2（晚子時九種日期 × 12 組合、酉宮、閏月）。
- **x-iztro**：金標全由 iztro 2.6.1 產生（`tests/golden/package.json`），astrotype 那組還被產生器手改（`generate_astrotype.mjs:53-57`）＝一致性測試，不是獨立見證；沒跟上 #314。可借的只有兩樣：差分金標的做法；64 條格局規則（每條附 iztro-docs 與《紫微斗數全書》引文，`src/pattern/rules/*`）。
- **ziwei-chart**：GPL，頁尾卻自標 MIT；預設模型是 Kimi；知識庫 105 條中 94 條 draft，且因宮名「宫」字與四化字串格式不符，多數檢索不到（靜態推演）。無可取用之處。
- **react-iztro**：單一元件、無測試、UI 選不到晚子時。本站已有 `components/ZiweiChart.tsx`。

### 八字、每日（細節在第一輪讀者回報，重點如下）

- lunar-javascript 1.7.7 → 1.7.8 **零計算變更**（只多版本註解與 2027 假日 34 筆），升不升無差。
- 節氣為壽星天文曆演算法；八字年月柱用秒級交節時刻；全部時間當北京時間，無時區／夏令／真太陽時（本站自己在外層處理）。
- `EightChar` 預設 `sect=2`（23 點日柱仍算當天，`lunar.js:5640`），但時干一律用次日日干推（`:773`）。本站未呼叫 `setSect`（`lib/bazi.ts:146`）→ 目前是 sect 2。**這與 iztro 升級後「晚子時算次日」的口徑相反**，兩個系統對同一個 23 點出生者會給出不同的日界。
- `Solar.fromYmdHms` 不驗當月天數（`lunar.js:103`），2 月 30 日會被收下。
- 十神 100 組、納音、藏干、十二長生逐項驗算正確。宜忌與神煞表無來源標示、無測試。
- `I18n.setLanguage` 改寫全域表（`lunar.js:8338-8422`）；本站未呼叫（`lib/baziAnalysis.ts:24` 已註明依賴）。
- bazi-mcp：底層是 tyme4ts 加一個無原始碼無授權資訊的 `cantian-tymext`；零測試；改寫全域靜態變數不還原。不採用。
- lunar-python：JS 版逐行移植，無新功能。
- 每日運勢：無獨立專案；本站 `lib/daily.ts` 已是確定性算法。

### 塔羅（細節：`research-detail/tarot-mcp.md`、`misc-rest.md`）

| | TarotWhisper | tarot-mcp | anois/tarot |
|---|---|---|---|
| 牌陣 | 6 | 25（全有定義） | 25（README 寫 14） |
| 洗牌 | `sort(()=>Math.random()-0.5)`，有偏差（`lib/tarot/draw.ts:13`） | webcrypto 拒絕取樣＋Fisher-Yates（`src/tarot/shared/utils.ts:6-47`） | crypto 拒絕取樣＋Fisher-Yates（`src/mechanics/rng.ts:16-37`） |
| 牌義 | 簡體，無來源 | 英文為範本生成（10 個句型涵蓋 780 段），中文為其簡體翻譯 | 英文檔頭標 McElroy 著作卻被標成 CC0；中文簡體、無來源 |
| 牌圖 | RWS 舊牌掃描，78 張四邊無任何版權字樣，版本無法判定 | AI 生成、MIT、provenance 雜湊 80/80 吻合 | **78 張全印「© 1971 U.S. Games」** |
| AI | BYOK 經自家伺服器；備用 key 開啟時可被當通用 LLM 代理 | 伺服器不呼叫 LLM | 純前端 BYOK，預設 DeepSeek；分享連結可改 baseUrl 竊取 key |

- 規則引擎無可取：tarot-mcp 的只看正逆位與張數門檻，且有錯（"energy" 子字串使一週運勢幾乎一律出健康牌義，`patterns.ts:89`）。本站 `lib/tarotRelations.ts` 較完整。
- 可借一點：tarot-mcp 由伺服器先洗整副牌並固定正逆位，前端只拿不透明編號。
- 本站洗牌 `lib/tarot.ts:237-248` 是 Fisher-Yates＋`Math.random`：無偏，但非密碼學亂數。

### 易經（細節在第一輪讀者回報；比對腳本輸出見讀者回報）

- **iching-kit**：64 卦辭＋384 爻辭＋用九用六（簡體古文，自述公有領域，不含英譯）；朱熹七種變爻讀法與通行說法一致（`src/reading.ts:32-137`）；銅錢機率正確。瑕疵：三動時自訂 `primaryWeight: 0.7`（`:77`，古書無）、未做貞悔前十後十；與 ichingpy 逐條比對 450 條得 19 處差異，其中 iching-kit 疑錯 2 字＋1 處斷句：復初九「祗」應「祇」（`src/data/classic.ts:476`）、豐九三「沫」應「沬」（`:1067`）、井九五斷句（`:936`）。兩邊同錯的字此法抓不到。
- **ichingshifa**：0／3／6 動讀的是彖傳不是卦辭；蓍草機率不正確（6=0.06、7=0.31、8=0.44、9=0.19）；互卦算錯；每次建物件都 `pickle.load`；零測試。有納甲、世應、六親、六獸、伏神，規則表在 pkl 內。
- **ichingpy**：`get_judgement` 在 2／4／5／6 動讀錯段落；蓍草機率不正確；有納甲、八宮、世應、六親、六神、旬空的程式（`divination/six_lines.py`），是納甲規則較好的對照來源；另含榮格序言英文全文，無授權字樣。
- **iChing-JS**：無 LICENSE 檔（只在 package.json 與 README 寫 MIT）；無任何卦辭爻辭；起卦是數字取餘，四種爻各 1/4，不是銅錢機率。不可用。

### 西洋占星（細節：`research-detail/kerykeion-*.md`）

- 星曆鏈：flatlib 呼叫並附帶 Swiss Ephemeris 檔；Kerykeion 預設用同作者的 libephemeris（AGPL），Swiss 選配；openephem 用 Skyfield＋JPL DE440，但恆星時修正、平均黑月、ayanamsa 係數是「對照 Swiss 輸出擬合」的。三者星曆本站都不需要。
- Kerykeion 商用：AGPL；`LICENSING.md`、`COMMERCIAL-LICENSE.md` 自標 DRAFT；README 導向 RapidAPI 付費 API；CLA 為著作權轉讓。測試基準幾乎全是自產回歸，行星黃經未對 JPL Horizons；a79 的跨引擎比對結論仍是 RED（`CHANGELOG.md:1906-1908`）。
- **相位規格可參考的數值**（只抄規則，不抄程式）：

| 來源 | 合 | 沖 | 拱 | 刑 | 六合 | 日月加寬 | 備註 |
|---|---|---|---|---|---|---|---|
| Kerykeion 本命（`settings/config_constants.py:605-611`） | 6 | 6 | 6 | 6 | 5 | 各 +1.5，兩星取大 | 行運、推運一律 3、不加寬（`:620-626`） |
| openephem（`src/openephem/aspects.py:17-33`） | 8 | 8 | 8 | 7 | 6 | +2 | 跨盤一律 5 |
| flatlib（`flatlib/props.py:199-216`） | 每顆星一個 orb：日 15、月 12、水金 7、火 8、木土 9、外行星 5 | | | | | — | 任一方 orb 內即成立 |

  共同規則：角距取最短弧；多個相位都符合時取離準確最近者（Kerykeion）；入相／出相用「往前推一小步看偏離變大或變小」判定；合盤兩盤之間不判入出相。
- 極區：Kerykeion 後端報錯時改 Porphyry；openephem 直接省略宮位；本站 `lib/astrology.ts` 已帶 `fallbackHouses` 旗標。

## 4. 授權與權利

- **可直接用（MIT／Apache，來源清楚）**：iztro、lunar-javascript、@xalen/wasm、iching-kit 的古文資料。
- **有條件**：tarot-mcp 牌圖。`assets/ASSET_LICENSE.md:11-14` 原文是「在著作權存在的範圍內」授權，`:38-42` 不保證不侵權；全 repo 無一句提到 OpenAI 使用條款；生成步驟不在 repo 內，雜湊只能證明檔案與紀錄一致，不能證明生成來源；QA 審查欄位由腳本直接寫成 true。
- **不可用**：anois 牌圖與英文牌義；TarotWhisper 牌圖（版本不明，作者自己要求商用前自行確認，`LICENSE:25-33`）；ziwei-chart（GPL-3.0）；Kerykeion（AGPL）；iChing-JS（無 LICENSE 檔）；ichingpy 的英譯 4 卦與榮格序言（無出處）。
- **需專業確認**：AI 生成圖的著作權地位與 OpenAI 條款；Rider-Waite 1909 原版 vs 1971 重新上色版的判定；openephem「用 Swiss 輸出擬合係數」是否構成衍生；iching-kit 英文關鍵詞與 Wilhelm/Baynes 卦名部分重疊（本站不用英文關鍵詞即可避開）。

## 5. Backlog（依收益／成本）

1. **修 E1、E2、E3**（本站現有錯誤）。驗：農曆二月三十＋真太陽時一例；UTC 23:00 的今日運限一例。
2. **定日界口徑，再升 iztro 到 2.6.5**。先決定 23 點出生算當日或次日，並讓紫微與八字一致（iztro `dayDivide`、lunar `setSect`）；這是命理流派決定，由操作者定。回歸案例用 `research-detail/ziwei-rest.md` §2.2；另加酉宮三主星前後對照。上線後所有晚子時使用者的盤可能改變，要有說明文字。
3. **易經補原文（E4）**：取 iching-kit 的卦辭、爻辭、用九用六與七種讀法進 facts；修 2 字；簡轉繁；另找通行本做第三方校對；三動不採 0.7 權重。於 `THIRD_PARTY_NOTICES.md` 註記。
4. **占星相位**：用現有行星黃經自算五種主要相位；orb 口徑從 §3 表選一套（建議 Kerykeion 本命那組，數值最保守）；之後才是行運、合盤。
5. **塔羅牌圖**：外觀決定，操作者選——用 tarot-mcp 那副（接受 §4 的條件）、自己生成一副、或維持純文字。
6. 納甲六爻：獨立一張卡，規則對照 ichingpy `divination/six_lines.py` 與 ichingshifa。
7. 低優先：塔羅洗牌改用密碼學亂數；格局解讀素材參考 x-iztro 的 64 條規則出處。

不做：升 lunar-javascript（無變更）；引進任何 Python／Rust 引擎；bazi-mcp；react-iztro。

## 6. 對輸入文件的勘誤

- TarotWhisper、anois、openephem：GitHub API 顯示 NOASSERTION，LICENSE 檔實為 MIT（僅限程式）。
- 「Kerykeion 為占星首選」不成立：本站已有可商用引擎，且 Kerykeion 自己的測試未對 JPL Horizons。
- 「x-iztro 大量 golden-case」屬實但對象是 iztro 2.6.1 自己。
- 「tarot-mcp 25 種牌陣」屬實；「TarotWhisper 6 種牌陣」屬實；anois README 寫 14 種，程式是 25 種。
- 「ichingshifa 為易經首選」不成立：變爻規則與蓍草機率都有錯，且是 Python。
- iChing-JS 並非完全沒有授權聲明（package.json 與 README 寫 MIT），但沒有 LICENSE 檔與版權人。

## 7. 主線抽驗（2026-11-21，Bash `sed`／`grep` 對 clone 與本站程式）

- 屬實：iztro `utils/date.ts:11-20`、舊 `location.js:47-51`；iching-kit `classic.ts:476,936,1067`、`reading.ts:72-81`；tarot-mcp `ASSET_LICENSE.md:11-14`；Kerykeion `config_constants.py:605-611,620-626`；lunar.js `:5640-5644`；TarotWhisper `draw.ts:13`；anois `public/deck/LICENSE.txt:15-21` 與 `tarot_interpretations.json:2`；anois 牌圖邊緣裁切圖親看；本站 E1、E2、E3。
- 更正一處：讀者報 iztro 亮度在 `stars.ts:108,133,158`，實為 `:23,48,73`（內容正確）。
- 未抽驗的讀者結論以 `research-detail` 內標註為準；標「靜態推演」「推論」者皆未執行驗證。

## 8. Clone 版本

iztro `b53f634`、react-iztro `007688b`、ziwei-chart `614d6e1`、x-iztro `2fad09a`、lunar-javascript `5c92e62`、lunar-python `1645ad3`、bazi-mcp `61b9012`、TarotWhisper `e3a47f0`、tarot-mcp `6eb280d`、anois/tarot `43eb6f8`、ichingshifa `6526fe4`、ichingpy `4eb8c0f`、iChing-JS `1e1cfd7`、iching-kit `6a32e5f`、kerykeion `b8e10c6`、flatlib `d983057`、openephem `5153b82`。
