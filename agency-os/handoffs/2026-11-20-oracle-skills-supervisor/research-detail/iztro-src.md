# iztro 2.6.5 src 逐行審讀（對照已安裝 2.5.8 lib 與本站呼叫端）

路徑縮寫：`src/` = `D:\tmp\oracle-repos\SylarLong_iztro\src\`；`lib258/` = `D:\Work\Projects\internal\ziwei-doushu\node_modules\iztro\lib\`；`site/` = `D:\Work\Projects\internal\ziwei-doushu\`。

## 1. 每個檔案做什麼

- `src/index.ts`：對外匯出 data / star / util / astro / version。
- `src/version.ts`：`require('../package.json').version`。
- `src/astro/index.ts`：匯出 palace、astro，再加 `setLanguage`、`getLanguage`。
- `src/astro/astro.ts`：排盤入口 `bySolar`、`byLunar`、`withOptions`、`rearrangeAstrolable`（地盤／人盤）、生肖、星座、命宮主星、插件載入。
- `src/astro/config.ts`：全域預設設定、單次覆蓋 `resolveConfig`、同步範圍內切換設定 `withConfig`、`resetConfig`。
- `src/astro/context.ts`：把星盤和它回傳的功能物件綁回產生時的設定與語言（`bindContext`）。
- `src/astro/palace.ts`：命宮、身宮、五行局、宮名、大限與小限。
- `src/astro/analyzer.ts`：查宮位、三方四正、夾宮，判斷有沒有某些星或四化，四化對應到哪些星。
- `src/astro/FunctionalAstrolabe.ts`：星盤類別。`horoscope()` 算運限，另有 `decadalList`、`yearlyList`、`monthlyList`、`star`、`palace`、`surroundedPalaces`、`flankingPalaces`。
- `src/astro/FunctionalHoroscope.ts`：運限類別，可取運限宮位、三方四正、流耀、運限四化。
- `src/astro/FunctionalPalace.ts`：宮位類別，提供 has、hasMutagen、isEmpty、fliesTo、selfMutaged、mutagedPlaces。
- `src/astro/FunctionalSurpalaces.ts`：三方四正類別，提供 have、haveOneOf、haveMutagen。
- `src/astro/FunctionalFlankingPalaces.ts`：夾宮類別（2.6.0 新增）。
- `src/star/index.ts`：`initStars()` 產生 12 個空陣列，並重新匯出各安星模組。
- `src/star/location.ts`：各星落宮的索引演算法，包括紫微、祿羊陀馬、魁鉞、左右、昌曲、日系、時系、空劫、火鈴、鸞喜、年系、月系、流昌流曲。
- `src/star/majorStar.ts`：安十四主星，同時算亮度和生年四化。
- `src/star/minorStar.ts`：安十四輔星（含祿存、天馬）。
- `src/star/adjectiveStar.ts`：安雜曜，中州派會加減部分星。
- `src/star/decorativeStar.ts`：長生十二神、博士十二神、歲前與將前十二神。
- `src/star/horoscopeStar.ts`：流耀（魁鉞昌曲祿羊陀馬鸞喜，流年另加年解）。
- `src/star/FunctionalStar.ts`：星曜類別，可取所在宮、對宮、三方四正，判斷亮度與四化。
- `src/data/constants.ts`：語言清單、天干、地支、生肖、宮序、性別陰陽、五行局、時辰、五虎遁、五鼠遁。
- `src/data/stars.ts`：四化順序、主星與部分輔星的亮度表（從寅宮起排）。
- `src/data/heavenlyStems.ts`：十天干的陰陽、五行、相沖、四化表。
- `src/data/earthlyBranches.ts`：十二地支的陰陽、五行、相沖、命主、身主、身體部位。
- `src/data/index.ts`、`src/data/types/index.ts`：匯出。
- `src/data/types/general.ts`：Language、Scope、StarType 等型別。
- `src/data/types/star.ts`：Star 型別。
- `src/data/types/palace.ts`：SoulAndBody、Palace、SurroundedPalaces、FlankingPalaces 型別。
- `src/data/types/astro.ts`：Horoscope、Astrolabe、Config、Option、AstrolabeParam 型別。
- `src/i18n/index.ts`：i18next 初始化、`setLanguage`、`withLanguage`、`t`、`kot`（用譯名反查 key）。
- `src/i18n/starAliases.ts`：韓文、越南文同名星的別名對照。
- `src/i18n/types/*.ts`（8 檔）：由各語系推導的 Name 與 Key 型別。
- `src/utils/index.ts`：fixIndex、亮度、四化、農曆月份與日期索引、小時轉時辰、小限起點、干支字串。
- `src/utils/date.ts`：`normalizeDayBoundary`，晚子時換日的唯一入口。
- `src/utils/validation.ts`：檢查日期、時辰、性別、布林值。
- `src/utils/toJSON.ts`：把功能物件轉成純 JSON，去掉方法、循環引用和 `_` 開頭的欄位。

## 2. 已知 (a)–(h) 逐條核對，以及補充的輸出差異

- **(a) 確認。** 差異只在 index 7（酉宮）。2.6.5 為太陽 `ping`、太陰 `wang`、七殺 `wang`（`src/data/stars.ts:23,48,73`）；2.5.8 為太陽 `xian`、太陰 `bu`、七殺 `miao`（`lib258/data/stars.js` taiyangMaj、taiyinMaj、qishaMaj 的第 8 項）。其他亮度陣列逐項相同。
- **(b) 確認，並補充細節。**
  - 2.6.5 做法：先把整個日期換到次日、時辰改為 0（`src/utils/date.ts:11-19`），每個安星函式入口都再過一次同一個函式（例：`src/astro/astro.ts:127`、`src/astro/palace.ts:45,186`、`src/star/location.ts:38,293,633`）。
  - 2.5.8 做法：
    - 紫微起星日數 +1，超過月底回捲（`lib258/star/location.js` getStartIndex 的 `_day`）。
    - 三台、八座、恩光、天貴用 `fixLunarDayIndex(lunarDay,12)`，等於日數 +1，但月底不回捲（`lib258/star/location.js:280`、`lib258/utils/index.js:121`）。
    - 月份用原日，且晚子時不套閏月修正（`lib258/utils/index.js:110`，`timeIndex !== 12`）。
    - 年干支是把 timeIndex 12 傳進 lunar-lite，換算成原日 23:30（`node_modules/lunar-lite/lib/ganzhi.js:32`），所以年、月是原日；日、時則用 `getDayGanExact` 與 `dayGanIndexExact`，已經是次日。
  - 結論：日柱和時柱兩版相同。年柱、月柱、生肖、博士十二神、歲前與將前（`src/astro/astro.ts:156-157`，改用次日）只在換年、換月的邊界才不同。
- **(c) 部分確認。** 非中文的 `lunarDate` 改走 `t('lunarDate')` 模板（`src/astro/astro.ts:43-55`，en-US 模板為 `"Lunar {{year}}-{{leapMonth}}{{month}}-{{day}}"`，見 `src/i18n/locales/en-US/common.json:2`）；2.5.8 一律輸出中文 `toString(true)`（`lib258/astro/astro.js:216`）。武曲、歲破的英譯屬於 locales 範圍，本次沒有重讀，沿用前一位的腳本比對結果。
- **(d) 確認。**
  - 2.6.5（`src/astro/FunctionalAstrolabe.ts:64-69`）：生月較大，或同月且日數較大，就 +1 歲。
  - 2.5.8（`lib258/astro/FunctionalAstrolabe.js` ageDivide 段）：「同月較晚日」只在同一個農曆年才成立，跨年同月就漏算。
  - 只在 `ageDivide:'birthday'` 時生效，預設 normal 不受影響。
- **(e) 確認，但對日期字串無實際差異。** 2.5.8 寫成 `timeIndex || convertTimeIndex`（`lib258/astro/FunctionalAstrolabe.js:42`），2.6.5 改成 `??`（`src/astro/FunctionalAstrolabe.ts:43`）。傳入不帶時間的 `YYYY-MM-DD` 時，`dayjs(...).hour()` 是 0，換算結果本來就是 0，所以兩版一樣。
- **(f) 確認。** 運限查詢也會換日（`src/astro/FunctionalAstrolabe.ts:44`）。2.6.5 另有兩處改動：
  - 本命生日改取 `$.rawDates.lunarDate`，也就是換日後的日期（`:41`）；2.5.8 是 `solar2lunar($.solarDate)`，原日。對晚子時出生者，月底或年底出生時，虛歲與流月索引會不同（`:56,137-145`）。
  - 會驗證日期，非法日期直接丟錯（`:39-40`）。
- **(g) 確認，另補一項。**
  - 身宮不再平移：2.6.5 見 `src/astro/palace.ts:66-69`；2.5.8 有 `bodyOffset`（`lib258/astro/palace.js:44-45`）。
  - 重排時 `fixLeap` 預設 true：2.6.5 見 `src/astro/astro.ts:291`；2.5.8 為 undefined（`lib258/astro/astro.js:274`）。
  - 補：重排後 2.6.5 會更新 `earthlyBranchOfBodyPalace`（`src/astro/astro.ts:378`），並對 `astrolable.solarDate` 做換日（`:292`）。
- **(h) 確認。**
  - 2.5.8 傳 `language` 會改全域語言（`lib258/astro/astro.js:144,397,414,429,447`）；`withOptions` 的 config 也會寫進全域（`:357-359`）。
  - 2.6.5 改用 `withConfig`、`withLanguage`，只在當次計算內生效（`src/astro/astro.ts:124-125,397-398`）。
  - 非法輸入會丟錯：日期、時辰、性別、布林值（`src/utils/validation.ts:13-75`），語言（`src/i18n/index.ts:44,69`、`src/astro/config.ts:95`），`astroType`（`src/astro/astro.ts:394-396`）。
- **補充的差異：**
  1. 晚子時出生的 `lunarDate` 和 `rawDates.lunarDate` 每張盤都顯示次日（`src/astro/astro.ts:194,205,207`）。不只邊界日，所有晚子時盤都會變。
  2. `getZodiacBySolarDate` 改用換日後日期（`src/astro/astro.ts:211`），星座仍用原日（`:210`）。除夕晚子時的生肖會變。
  3. `kot` 先查 STAR_ALIASES（`src/i18n/index.ts:104-108`），只影響韓文、越南文。
  4. `getPalace` 用名稱查時只比對 Palace 類 key（`src/astro/analyzer.ts:161-171`）；2.5.8 不限類別（`lib258/astro/analyzer.js:100-110`）。繁中結果相同。
  5. 運限的 `palace(…,'origin')` 改用 kot 正規化（`src/astro/FunctionalHoroscope.ts:12-13`）；2.5.8 是字面比對（`lib258/astro/FunctionalHoroscope.js:6-14`）。
  6. 新增 API：`toJSON`、`flankingPalaces`、`decadalList`、`yearlyList`、`monthlyList`（2.6.0）、`resetConfig`、`version`。`getConfig()` 改回傳深拷貝（`src/astro/config.ts:60-61`）。
  7. 四化表、命主身主表兩版逐字相同（以腳本 diff `heavenlyStems`、`earthlyBranches` 的 mutagen、soul、body 三欄，輸出 SAME）。
  8. 依賴：`lunar-typescript` 從 ^1.7.8 升到 ^1.8.6，新增直接 import `Solar`、`LunarYear`、`SolarUtil`（`src/utils/date.ts:2`、`src/utils/validation.ts:1`、`src/astro/FunctionalAstrolabe.ts:4`）。本站已裝 1.8.6。

## 3. 對本站的具體影響

### 實際用到的 API

- `astro.bySolar`、`astro.byLunar`（`site/lib/ziwei.ts:139-155`）
- `astrolabe.horoscope(date, timeIndex?)`（`site/lib/ziwei.ts:87`）
- `palace(name)`、`surroundedPalaces(name)`（`site/lib/ziwei/brightness.ts:42-43`、`site/lib/ziwei/patterns.ts:54,58`、`site/lib/ziwei/palaceReading.ts:88,114`、`site/lib/ziwei/flying.ts:94`）
- `palace.has`、`hasOneOf`、`hasMutagen`、`selfMutaged`、`mutagedPlaces`
- `surpalaces.have`、`haveOneOf`、`haveMutagen`
- 欄位：`palaces[].majorStars[].name/brightness/mutagen`、`earthlyBranch`、`name`，以及 `soul`、`body`、`fiveElementsClass`、`zodiac`、`sign`、`chineseDate`、`solarDate`、`lunarDate`、`time`

### 傳入參數

- **timeIndex**：`hourToTimeIndex(hour)`（`site/lib/trueSolarTime.ts:83-87`），23 時轉成 **12**，會傳晚子時。真太陽時校正後落在 23 時同樣是 12。
- **language**：只會是 `'zh-TW'` 或 `'en-US'`（`site/lib/i18n/config.ts:28-31`）。
- **fixLeap**：明確傳 `true`。
- **isLeapMonth**：取自表單。
- **未使用**：config、withOptions、astroType、插件。

### 升到 2.6.5 後各呼叫點的變化

1. **computeChart，一般時辰**：只有酉宮的太陽、太陰、七殺亮度會變。連帶影響：
   - 星盤顯示（`site/components/ZiweiChart.tsx`）。
   - 亮度分數（`site/lib/ziwei/brightness.ts:11-12`）：太陽陷 25→平 50、太陰不 40→旺 85、七殺廟 100→旺 85。
   - 格局判定：「丹墀桂墀格」中太陰坐酉時改為「亮」（`site/lib/ziwei/patterns.ts:210`）；「天梁拱月格」中太陰坐酉時不再算陷，可能不再命中（`:226`）。
   - 逐宮解讀的語氣修飾（`site/lib/ziwei/palaceReading.ts:42-47`），以及 AI facts（`site/lib/divination/systems/ziwei.ts:52-60`）。
   - 測試 `site/lib/ziwei/analyze.test.ts:42-44` 斷言「丹墀桂墀格」，判定只會更寬，不會因此失敗。但本次沒有執行，未驗證。
2. **computeChart，23 時出生（timeIndex 12）**：
   - 每張盤的 `lunarDate` 都變成次日（顯示於 `site/components/ZiweiChart.tsx:139`，AI fact 於 `site/lib/divination/systems/ziwei.ts:34`）。
   - 一般日子的命盤星曜不變。
   - 農曆月底晚子時：命宮、身宮、五行局、紫微、左右、月系星、三台八座整體換月。
   - 閏月十五晚子時：現在會套閏月修正。
   - 除夕晚子時：年干支相關的一切都變。
3. **英文盤**：`lunarDate` 從中文改成 `Lunar Y-M-D`；武曲、歲破英譯改變（依前一位比對）。
4. **byLunar 傳入不存在的農曆日**：例如小月 30 日，現在會丟錯（`src/utils/validation.ts:31-35`），ZiweiTool 顯示「計算失敗」（`site/components/ZiweiTool.tsx:70-73`）。2.5.8 會悄悄回捲成另一天排盤。
5. **computeHoroscope(today)**：不傳 timeIndex、日期為字串時，兩版都取 0（早子時），結果不變。晚子時出生者在換年或月底出生時，虛歲與流月索引才會變（見 (f)）。
6. **語言不再外洩**：2.5.8 中 ZiweiTool 先排英文盤（全域被改成 en-US），`useMemo` 再排繁中分析盤（全域又改成 zh-TW）。2.6.5 起各盤互不影響（`src/astro/context.ts:47-57`）。

### 本站註解或假設與 iztro 實際行為不符之處

- `site/lib/ziwei.ts:60-61,79-80` 寫「未傳 timeIndex 時 iztro 取『呼叫當下時辰』，hourly 非確定」，這是**錯的**。實際是 `timeToIndex(dayjs(targetDate).hour())`（`src/astro/FunctionalAstrolabe.ts:42`；2.5.8 同在 `lib258/astro/FunctionalAstrolabe.js:41`）。`YYYY-MM-DD` 會被解析成當地 0 時，固定得到 0（早子時），結果是確定的。只有完全不傳日期時，才會用「現在」。
- `site/lib/ziwei.ts:81` 寫「timeIndex 0–11」。iztro 實際接受 0–12；傳 12 時在 2.6.5 會換到次日。
- `site/lib/ziwei.ts:118` 註解說「真太陽時校正只在國曆有意義」，但程式碼對農曆也照做（`:119-133`），而 `site/components/BirthForm.tsx:64,74` 預設開啟校正。**這是本站自己的 bug，與升版無關**：
  - `toTrueSolarTime` 把農曆年月日當成國曆，用 `Date.UTC` 計算（`site/lib/trueSolarTime.ts:60,64`）。
  - 均時差用錯年中日，誤差可達十幾分鐘。
  - 農曆 2 月 29、30 日或 X 月 31 日會被國曆規則回捲成 3/1、3/2（`:64-71`），排出錯的盤。2.6.5 的日期驗證也擋不住，因為回捲後的日期本身合法。
- `site/lib/i18n/config.ts:25-26` 說「傳 'en' 會回傳 i18n key」。2.6.5 起改為丟錯 `invalid language.`（`src/i18n/index.ts:69`）。
- `site/components/ZiweiTool.tsx:20-21` 的 `todayStr()` 用 `toISOString()` 取 UTC 日期。台灣 08:00 前算出的是前一天的運限。這是本站 bug。
- 其餘假設與實際相符：
  - 四化順序為祿、權、科、忌（`site/lib/ziwei.ts:41` 對應 `src/data/stars.ts:2`、`src/data/heavenlyStems.ts`）。
  - 宮名查詢經 kot 正規化，與語言無關（`site/lib/ziwei/palaceReading.ts:14` 對應 `src/astro/analyzer.ts:161`）。
  - majorStars 只含 14 顆主星（`src/star/majorStar.ts`），祿存、天馬在 minorStars（`src/star/minorStar.ts:93-108`），所以 brightness.ts 的平均分數不會混入輔星。

## 4. 設定項與預設值

- **language**：預設 `zh-CN`（`src/i18n/index.ts:34`、`src/astro/config.ts:61`），可選值見 `src/data/constants.ts:2`。影響所有 `t()` 輸出與 `formatLunarDate`。
- **mutagens**：預設 `{}`。覆蓋各天干的四化（`src/utils/index.ts:21-32`），影響生年四化、運限四化、飛化。
- **brightness**：預設 `{}`。覆蓋亮度表（`src/utils/index.ts:74-84`）。
- **yearDivide**：預設 `normal`（正月初一分界），另一值 `exact`（立春分界）。影響：
  - 盤面年柱（`src/astro/astro.ts:129-131`）、命宮天干的五虎遁（`src/astro/palace.ts:46-48`）
  - 大限順逆與小限（`src/astro/palace.ts:189-192`）
  - 主星與輔星的生年四化、魁鉞、祿羊陀馬、火鈴（`src/star/majorStar.ts:28`、`src/star/minorStar.ts:28`）
  - 鸞喜（`src/star/adjectiveStar.ts:27`）、長生與博士的順逆（`src/star/decorativeStar.ts:75,127`）、生肖（`src/astro/astro.ts:443`）
- **horoscopeDivide**：預設 `normal`。影響：
  - 盤面月柱（`src/astro/astro.ts:131`）
  - **年系雜曜**（天才、天壽、華蓋、咸池、孤寡、龍鳳、哭虛、天官天福、旬空等），年份分界走的是這個開關而不是 yearDivide（`src/star/location.ts:634-638`）
  - 歲前與將前（`src/star/decorativeStar.ts:210-213`）
  - 運限的年與月（`src/astro/FunctionalAstrolabe.ts:46-54`）
- **ageDivide**：預設 `normal`，另一值 `birthday`。影響虛歲，進而影響大限、小限、童限的選取（`src/astro/FunctionalAstrolabe.ts:60-73`）。
- **dayDivide**：預設 `forward`，另一值 `current`。只作用於 timeIndex 12（`src/utils/date.ts:13-19`）。
- **algorithm**：預設 `default`，另一值 `zhongzhou`。影響：
  - 命主改以年支取（`src/astro/astro.ts:198-200`）
  - 天使、天傷在陰男陽女時互換（`src/star/location.ts:759-764`）
  - 雜曜增減：去截路、空亡，加龍德、截空、劫殺、大耗（`src/star/adjectiveStar.ts:70-88`）
  - 歲前十二神的大耗改為歲破（`src/star/decorativeStar.ts:216-245`）
- **每次呼叫的參數**：
  - `fixLeap`：預設 true，作用於 `src/utils/index.ts:126-134`，影響命身宮、左右、月系星、日系星。
  - `isLeapMonth`：預設 false。
  - `astroType`：heaven、earth、human（`src/astro/astro.ts:407-426`）。
  - `monthlyList(year, fixLeap=true)`：`src/astro/FunctionalAstrolabe.ts:489`。

## 5. 排盤規則摘要（含所在檔）

- **命宮、身宮**：寅起正月順數到生月，逆數生時為命宮、順數生時為身宮；命宮天干用五虎遁（`src/astro/palace.ts:43-90`、`src/data/constants.ts:142-153`）。
- **五行局**：命宮干支納音取數法（`src/astro/palace.ts:135-152`）。
- **紫微、天府**：局數除日數，補數奇數逆行、偶數順行；天府 = 12 − 紫微（`src/star/location.ts:36-86`）。
- **十四主星**：紫微系逆排、天府系順排（`src/star/majorStar.ts:25-87`）。
- **輔星**：左右（`src/star/location.ts:245-250`）、昌曲（`:268-273`）、魁鉞（`:195-229`）、祿羊陀馬（`:108-181`）、空劫（`:338-345`）、火鈴（`:363-404`），組裝在 `src/star/minorStar.ts`。
- **雜曜**：鸞喜（`src/star/location.ts:417-423`）、日系三台八座恩光天貴（`:292-307`）、時系台輔封誥（`:315-320`）、年系（`:631-746`）、月系解神天姚天刑陰煞天月天巫（`:813-843`），組裝在 `src/star/adjectiveStar.ts`。
- **長生十二神**：依五行局起長生，陽男陰女順行（`src/star/decorativeStar.ts:32-114`）。
- **博士十二神**：從祿存起（`src/star/decorativeStar.ts:125-160`）。
- **歲前、將前**：依年支起（`src/star/decorativeStar.ts:172-277`）。
- **生年四化**：`src/data/heavenlyStems.ts:26-85`、`src/utils/index.ts:86-99`。
- **大限**：從命宮起，陽男陰女順行；起運歲數 = 局數（`src/astro/palace.ts:184-215`）。
- **小限**：起點用 `src/utils/index.ts:193-208`，男順女逆（`src/astro/palace.ts:217-230`）。
- **運限**：`src/astro/FunctionalAstrolabe.ts:34-214`。
  - 童限：命、財、疾、夫、福、官（`:107-122`）。
  - 流年：取年支所在宮（`:84`）。
  - 流月：流年宮逆數到生月、再順數到生時為正月，含閏月處理（`:135-145`）。
  - 流日、流時：`:148`、`:151`。
- **流耀**：`src/star/horoscopeStar.ts:21-131`，流年另加年解（`:113-117`）。
- **命主、身主、來因宮**：命主身主見 `src/astro/astro.ts:198-215`，來因宮見 `:172-174`。
- **流派選項**：只有 `algorithm`（default 或 zhongzhou）與 `astroType`（中州派的地盤、人盤），其餘差異靠第 4 節的設定開關。

## 6. 疑似錯誤、邊界未處理、全域狀態與並發

### 疑似錯誤與邊界

1. `src/astro/FunctionalAstrolabe.ts:159` 的 `kot(…,'Heavnly')` 是拼字錯誤，沒有任何 key 會命中，靠 `t()` 找不到 key 時原樣回傳才不出錯（2.5.8 也一樣）。
2. **虛歲超出範圍時回傳錯誤資料。** 目標日早於出生（虛歲 ≤ 0），或虛歲超過最後一個大限時：
   - 大限與小限的預設值是 raw 值 `'jia'`、`'zi'`（`:78-80,92-94`）。
   - 大限天干會輸出拼音 `jia`（經過 `t(kot('jia','Heavnly'))`），四化給甲干的四化，`ageIndex=-1`。
   - 結果是錯資料而不是丟錯。本站若有人填未來日期，就會出現這種情況。
3. 傳入的四化空陣列時，`selfMutaged` 回傳 true，因為 `_includeAll` 對空陣列 `every` 為 true（`src/astro/FunctionalPalace.ts:297-302`、`src/astro/analyzer.ts:17-21`）。`fliesOneOfTo`、`notFlyTo` 在空集合時也回傳 true（`:273-275,290-292`）。語意不一致。
4. 流月的閏月修正永遠套用，不看本盤的 `fixLeap`（`src/astro/FunctionalAstrolabe.ts:137-139`）。
5. `getHoroscopeStar` 的 origin 分支用了不存在的 key `hongluanMin`（`src/star/horoscopeStar.ts:48`；全部 locales 用 grep 查都無此 key）。目前沒有任何路徑會走到這裡。
6. `rearrangeAstrolable` 只重算主星、長生、大限、小限、天使、天傷、天才（`src/astro/astro.ts:303-375`）。其餘依命宮的星仍是天盤結果，屬設計限制。
7. `copyright` 欄位內含 `new Date().getFullYear()`（`src/astro/astro.ts:218`），輸出不完全確定，會影響快照測試。
8. 效能：`kot` 每次都線性掃過 6 個語系的全部譯名（`src/i18n/index.ts:110-117`）；`getConfig()` 每次都深拷貝（`src/astro/config.ts:60-61`），而 `getBrightness`、`getMutagen` 每顆星都呼叫一次。這只影響 CPU 用量，不影響正確性。

### 全域可變狀態

- `_plugins`（`src/astro/astro.ts:36`）
- `globalConfig`、`activeConfig`（`src/astro/config.ts:50-51`）
- `activeLanguage`（`src/i18n/index.ts:48`）
- i18next 全域語言（`src/i18n/index.ts:34,45`）
- `functionalPrototypes`（`src/astro/context.ts:4`，只在載入時寫入）

### 並發結論（Node 多請求）

- 2.6.5 的計算全部是同步的；`withConfig` 與 `withLanguage` 用 try/finally 設定並還原（`src/astro/config.ts:136-144`、`src/i18n/index.ts:68-77`）。單執行緒下不會有交錯。
- 回傳物件的方法被 `bindContext` 包成固定使用產生時的設定與語言（`src/astro/context.ts:24-67`）。
- 結論：**只要不在請求中呼叫 `astro.config`、`setLanguage`、`resetConfig`、`loadPlugin`，就是並發安全的。**
- 仍有風險的情況：
  - 這四個函式會改變全行程的預設值。
  - 非同步插件的後續步驟會跑到 context 之外。
- 2.5.8 不安全：
  - 帶 language 的每次排盤都會改 i18next 全域語言（`lib258/astro/astro.js:144`）。
  - `withOptions({config})` 會永久改全域設定（`:357-359`）。
  - 盤物件之後呼叫 `horoscope()`、`palace()` 時，用的是「當下」的全域語言與設定。
- 本站現況：iztro 只在瀏覽器的 ZiweiTool 執行（`site/components/ZiweiTool.tsx:1,59,68`）。`ziweiSystem.compute` 只有測試在呼叫，app 端沒有用 `getSystem`（grep `ziweiSystem|getSystem` 在 `app/` 無命中），所以目前伺服器端沒有並發暴露。

## 7. 讀取範圍

- **iztro 2.6.5 src**：範圍內 47 個 .ts 檔、共 6175 行，全部逐行讀完。行數依 `wc`：
  - astro.ts 549、FunctionalAstrolabe 587、FunctionalPalace 348、analyzer 346、FunctionalHoroscope 227、palace 233、config 144、FunctionalFlankingPalaces 93、FunctionalSurpalaces 92、context 67、astro/index 3
  - location 899、decorativeStar 277、minorStar 159、FunctionalStar 151、horoscopeStar 131、adjectiveStar 109、majorStar 87、star/index 10
  - data/types/astro 282、constants 176、earthlyBranches 142、data/types/palace 109、stars 100、heavenlyStems 85、data/types/star 25、data/types/general 22、data/index 4、data/types/index 4
  - utils/index 233、validation 75、toJSON 63、date 20
  - i18n/index 124、starAliases 25、i18n/types 共 8 檔 147 行
  - index 5、version 4
- **README.md**：400 行，讀完。
- **2.5.8 lib**：
  - 全讀：astro/astro.js 480、astro/palace.js 186、utils/index.js 210、data/stars.js、astro/FunctionalAstrolabe.js 第 1-200 行（horoscope 全段）。
  - 部分讀：star/location.js 第 1-90 行，以及 getDailyStarIndex、getYearlyStarIndex、getMonthlyStarIndex 段；i18n/index.js（前段）；analyzer.js 的 getPalace 段；FunctionalHoroscope.js 的 `_getHoroscopePalaceIndex`。
  - 只用 grep 比對：star/majorStar、minorStar、adjectiveStar、decorativeStar、horoscopeStar 的日期與時辰用法；heavenlyStems 與 earthlyBranches 的四化、命主、身主欄位（腳本 diff 結果 SAME）。
  - **未讀**：FunctionalPalace.js、FunctionalSurpalaces.js、FunctionalStar.js 全文；calendar/**；locales/**。
- **本站呼叫端**：
  - 全讀：lib/ziwei.ts 158、lib/trueSolarTime.ts 87、lib/divination/systems/ziwei.ts 133、lib/ziwei/flying.ts 134、brightness.ts 84、analyze.ts 36、palaceReading.ts 132、patterns.ts 246、lib/i18n/config.ts 36。
  - 部分讀：components/ZiweiTool.tsx 第 1-90 行（共 268）、components/BirthForm.tsx 第 40-89 行（共 197）。
  - grep：lib/ziwei/stars.ts、analyze.test.ts 第 42-44 行。
- **lunar-lite 0.2.8**：只讀 `ganzhi.js` 的 getHeavenlyStemAndEarthlyBranchBySolarDate；lunar-typescript 只 grep 了 timeGanIndex。
- **未執行任何程式**，所有結論皆來自閱讀原始碼。
