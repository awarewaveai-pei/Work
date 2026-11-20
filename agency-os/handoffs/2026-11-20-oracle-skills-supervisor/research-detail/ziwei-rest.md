# 紫微斗數三專案補讀報告（ziwei-chart／iztro／react-iztro）

路徑縮寫：`zwc/`=`D:\tmp\oracle-repos\ziweiknows_ziwei-chart`；`iz/`=`D:\tmp\oracle-repos\SylarLong_iztro`；`riz/`=`D:\tmp\oracle-repos\SylarLong_react-iztro`。行號皆為實際 Read 所見。
標「靜態推演」= 只讀碼推理、未執行（本任務禁止執行）。

---

## 1. 「已知」有無錯誤

### 1.1 被推翻或需修正

- **「knowledge-db 47 條（S5/A6/B35/C1）、36 條 draft」錯。** 實際 **105 條**；sourceLevel 實為 **S5／A6／B89／C5**；reviewStatus 實為 **draft 94／reviewed 11**。
  - 47、36 是對 `sourceLevel: '…'`、`reviewStatus: '…'` 字面出現次數的 grep（47=5+6+35+1；36 draft、11 reviewed）。
  - 多數檔案用 factory 函式一次產生多條，字面只出現一次：`zwc/app/src/knowledge-db/entries/sihuaPalaces.ts:18-48,51-237`（17 條）、`stars.ts:18-44`（14）、`palaces.ts:18-44`（12）、`match.ts:17-44`（6）、`support.ts:18-48`（6）、`fortune.ts:18-46`（5）、`kline.ts:15-44`（5，全 C 級）。
  - 其餘：`combos.ts` 29 條（全 B、draft）、`principles.ts` 7（5 個 S + 2 個 A，reviewed）、`sihua.ts` 4（A，reviewed）。
  - 合計 7+4+17+14+12+29+6+6+5+5=105。draft 94=105−11（principles 7+sihua 4 為 reviewed）。
- **「預設 Kimi／DeepSeek」只對一半。** 預設 provider 只有 Kimi（`zwc/app/src/stores/index.ts:143`）。DeepSeek 只是下拉選項（`SettingsPanel.tsx:16-22`）與 thinking 時的 fallback 模型名（`lib/llm.ts:252-253`）。
- **「合盤與年運無 key 即報錯」程式屬實，但 README 宣稱相反。** `zwc/README.md:105-107` 說「排盤、趋势、合盘、人生 K 线…不依赖模型」。實際：`MatchAnalysis.tsx:218-221`、`YearlyFortune.tsx:200-203` 無 key 直接 `setError`、不生成。README:62「年度運勢結合限流叠宮與月度趨勢」在程式內不存在（年運純 LLM）。
- **「GPL-3.0」屬實，但 App 自己標 MIT。** App 頁尾 `components/OpenSourceLinks.tsx:60` 顯示「MIT License」，連到 LICENSE；`docs/dev/progress.md:21` 也寫「MIT License links」。與 `README.md:22,35`（GPLv3 或更高版本）矛盾。
- **「子時一律 timeIndex 12」大致對，兩處需補。**
  - 表單把「子时」option 的 value 固定為 23（`lib/astro.ts:79-87`，label 寫 `子时 (23:00-00:59)`），再經 `hourToTimeIndex(23)=12`（`lib/true-solar-time.ts:207-211`）。所以 00:00–00:59 出生者被當成「當日 23:00」排晚子時。在 `dayDivide:'forward'`（`astro.ts:25`）下日期被推到隔天，與使用者真實出生日不符。靜態推演。
  - 真太陽時校正後若落在 00:00–00:59，`dateToTimeIndex` 回 0（`true-solar-time.ts:213-218`），不是一律 12。實務上要東經 ≥135° 或 EoT 偏大才會發生。
- **「真太陽時寫死 120°E」敘述需補完整。** 120 是標準子午線常數（`true-solar-time.ts:45`），出生地經度來自本地 JSON（`:122-125` 動態 import，無網路請求，`docs/dev/decisions.md:14-26` D002）。公式 = (經度−120)×4 分 + 方程時 EoT 近似（`:193-205`，`9.87 sin2B −7.53 cosB −1.5 sinB`，B=2π(N−81)/364）。分鐘固定 0（`:47 REPRESENTATIVE_MINUTE`）。完全沒有歷史夏令時或時區規則。計算用瀏覽器本地 `Date`（`:96-100`），在有 DST 的使用者時區、剛好落在換季時刻附近會被 JS 正規化而偏移（靜態推演，低風險）。

### 1.2 屬實（附證據）

- iztro 2.5.8：`zwc/app/package.json:21` 為 `"^2.5.8"`；`package-lock.json:3650-3654` 鎖在 2.5.8。注意 `^` 允許 2.6.5，無鎖檔重裝會自動漂移。
- 全域中州派：`zwc/app/src/lib/astro.ts:21-27`（模組載入時 `astro.config`，algorithm zhongzhou；yearDivide/horoscopeDivide/ageDivide normal；dayDivide forward）。只用 `astro.bySolar(...)`（`:63`，astroType 預設天盤），從不生成地盤／人盤。
- Gemini key 在 URL：`lib/llm.ts:131`（關鍵字抽取）、`:378`（串流）`?key=${apiKey}`。
- key 明文存 localStorage：`stores/index.ts:140-179`（zustand `persist`，name `ziwei-settings`，無 `partialize`／加密，連 Tavily `searchApiKey` 一起存）。
- Vercel analytics：`App.tsx:7,335`、`app/package.json:15`。Google Fonts：`zwc/app/index.html:12-14`（不在 src）。
- K 線無 key 用 Math.random：`components/kline/LifeKLine.tsx:255-259`；LLM 失敗也靜默降級成亂數版：`:263-269`。
- iztro 最新 2.6.5（MIT）：`iz/package.json:3`、`iz/CHANGELOG.md:14`（2026.11.05）；`package-lock` 內 iztro 授權 MIT（`zwc/app/package-lock.json:3654`）。
- react-iztro 只匯出 Iztrolabe 元件（連同型別）：`riz/src/index.ts:1`、`riz/src/Iztrolabe/index.ts:1-2`。無測試：src 無 `*.test.*`，`package.json:7-20` scripts 無 test。

### 1.3 「2.5.8→2.6.5 會變的輸出」清單的遺漏（CHANGELOG 證據）

- 2.6.4：中州派地盤／人盤的**身宮**改為三盤統一按出生農曆月＋時辰安（`iz/CHANGELOG.md:33`）。地盤／人盤重排省略 `fixLeap` 時預設改 `true`（`:34`）。命宮主星、身宮標記、身宮地支欄位同步變。
- 2.6.2：非法日期、非整數或超出 0～12 的 timeIndex 現在**拋錯**（`:74`）。`language` 參數不再修改全域語言（`:71`）。chart 保存生成當下的 config／language（`:69-70`）。非中文 `lunarDate` 依語言格式化並保留閏月標記（`:72,80`）。`Option.type` 改為可選（`:75`）。
- 2.6.3：韓／日／越譯名修正（`:46,50-53`），含 `禄 権 徳 陥` 日文字形統一、韓語 `천덕`/`복덕`、越語 `Hãm`/`Mộc Dục`/`Thiên Việt`、日語 `奴僕`。
- 2.6.1：運限查詢現在遵守晚子時日期分界（`:94`）；運限宮位查詢支援混合語言宮名（`:95`）。
- 驗證：`1582-10-5`～`1582-10-14`（儒略／格里曆斷層）現在視為非法（`iz/src/__tests__/utils/validation.test.ts:27-35`）。
- 對 ziwei-chart 的實務影響：它固定 `dayDivide:'forward'` 且「子时」一律送 timeIndex 12，所以**每一張子時盤升級後都會換成整盤換日（月／年／閏月一起進位）**，這是影響面最大的一項。
- 補充：「晚子時整盤換日（#314）」只作用於 `dayDivide:'forward'`（預設值，`iz/src/__tests__/astro/default-options.test.ts:34`）；`'current'` 保持歸當日（`CHANGELOG.md:32`；`late-rat-hour.test.ts:108-116`）。

---

## 2. iztro

### 2.1 測試逐檔一行（`iz/src/__tests__/`，展開後案例數為本人逐檔計算）

- `astro/analysis-boundaries.test.ts`（92 行，10 案）：不存在宮名／星曜／運限查詢的邊界與報錯、空四化篩選、運限缺流曜安全回 false。
- `astro/analyzer.test.ts`（316，18）：宮位索引／名稱、has/notHave/hasOneOf、三方四正 have/haveOneOf/notHave、夾宮、飛化 hasMutagen/haveMutagen、star.withMutagen/withBrightness/oppositePalace/surroundedPalaces。
- `astro/astro.test.ts`（1371，46）：toJSON、bySolar/byLunar（含 en/ko/vi）、horoscope、decadalList/yearlyList/monthlyList（含閏月 14／13 項）、localized lunarDate、yearDivide/horoscopeDivide、dayDivide current、withOptions 各組、fixLeap 預設／開關、生肖星座命主星、童限、nominalAge normal/birthday、地盤人盤、GitHub#242/#244、中州派。
- `astro/body-palace.test.ts`（109，13）：中州派地盤／人盤身宮按出生月＋時辰安（5 組日期×13 時辰＋6 語言）。
- `astro/context-validation.test.ts`（221，36）：config／語言隔離、getConfig 深拷貝、插件巢狀排盤不洩狀態、非法 timeIndex（5 值）、非法陽曆（9 值）、非法 config 值（6 鍵）、流月非法年（4 值）、預設運限日期、earth/human 晚子時。
- `astro/default-options.test.ts`（61，314）：12 個日期×13 時辰×男女（312）＋初始 config 斷言＋省略 type 預設 solar；比對 `withOptions` 與 `bySolar` 的 `toJSON` 與 `horoscope('2026-10-12',2)`。
- `astro/global-language.test.ts`（130，14）：6 語言全域語言對獨立四化查詢、config/setLanguage/resetConfig 互動、非法語言。
- `astro/late-rat-hour.test.ts`（177，26）：#314 晚子時整盤換日全套（見 2.2）。
- `astro/palace-language.test.ts`（78，10）：韓語福德宮／天德同名、混合語言宮名、日語新字形宮名查詢。
- `astro/palace.test.ts`（146，6）：getSoulAndBody（含 2023-2-19 ti12）、五行局、宮名循環、大限年齡表（男／女）、飛化 fliesTo。
- `astro/plugin.test.ts`（93，5）：全域插件、自訂 mutagens／brightness。
- `i18n/index.test.ts`（67，31）：譯名反查（ko/ja/vi/en 別名消歧）。
- `star/location.test.ts`（908，20）：祿羊陀馬、魁鉞、左右、昌曲、空劫、火鈴、鸞喜、年解、年系／月系／日系／時系星索引、三台八座、旬空、孤寡、華蓋咸池、大耗等位置表。
- `star/star.test.ts`（482，14）：getStartIndex、getMajorStar（zh、vi）、辅星總數 66、長生十二神、博士十二神、岁前將前、運限星、五行局起點、雜耀（default／zhongzhou 差異）。
- `utils/index.test.ts`（117，5）：fixIndex、getBrightness、timeToIndex、getAgeIndex、地支索引。
- `utils/toJSON.test.ts`（51，3）：非有限數字、循環引用、`__proto__` 過濾。
- `utils/validation.test.ts`（63，22）：日期格式、無效時間、Date 物件、曆法斷層、農曆月天數、非字串、布林嚴格。
- `version.test.ts`（9，1）：`version` 等於 package.json。
- `scripts/tests/release.test.cjs`（78，7）：release 標題／版本／tag／npm registry 失敗關閉邏輯。
- 合計：jest 展開約 594 案（CHANGELOG 於 v2.6.3 記 539，`CHANGELOG.md:63`），release 腳本 7 案。

### 2.2 回歸案例原文（輸入→期望）

#### A. 晚子時（timeIndex 12）— `late-rat-hour.test.ts`

比對基準 `chartData(x)` = `toJSON()` 去掉 `solarDate/time/timeRange/sign` 後的全盤（`:10-14`）。

- `:33-47` `bySolar('1996-8-13',12,'female')`：
  - solarDate `'1996-8-13'`、time `'晚子时'`、timeRange `'23:00~00:00'`
  - lunarDate `'一九九六年七月初一'`
  - chineseDate `'丙子 丙申 癸未 壬子'`
  - 命宮地支 `'申'`、身宮地支 `'申'`、五行局 `'火六局'`
  - `star('紫微').palace().earthlyBranch==='酉'`
  - chartData 等於 `bySolar('1996-8-14',0,'female')`
- `:49-61` `byLunar('1987-10-30',12,'female')`，另含 `astrolabeByLunarDate('1987-10-30',12,'female')` 與 `astrolabeBySolarDate(lunar2solar('1987-10-30').toString(),12,'female')`：
  - 命宮地支 `'子'`、`'木三局'`、紫微在 `'辰'`
  - chartData 等於 `byLunar('1987-11-1',0,'female')`
- `:63-84` 矩陣：每列 `(dateStr, nextDate)`，晚子（ti12）盤等於次日早子（ti0）盤。
  - 組合：gender `'女'` × algorithm {default, zhongzhou} × astroType {heaven, earth, human} × fixLeap {false, true}，共 12 組合/列。
  - 九列：
    - 月中 `2000-8-16→2000-8-17`
    - 農曆小月末 `1996-8-13→1996-8-14`
    - 農曆大月末 `1987-12-20→1987-12-21`
    - 農曆年末（除夕）`2020-1-24→2020-1-25`
    - 公曆年末 `2023-12-31→2024-1-1`
    - 進入閏月 `2023-3-21→2023-3-22`
    - 閏月十五 `2023-4-5→2023-4-6`
    - 閏月月末 `2023-4-19→2023-4-20`
    - 曆法切換 `1582-10-4→1582-10-15`
- `:86-106` dayDivide forward／current：`solarDate:'2020-1-24', timeIndex:12, fixLeap:true, gender:'女'`。early 為 forward→`'2020-1-25'` ti0、current→`'2020-1-24'` ti0。以下皆須相等：
  - `getSoulAndBody`、`getHoroscope`
  - `star.getStartIndex`、`getMajorStar`、`getAdjectiveStar`、`getchangsheng12`
  - `getMinorStar(date,12,true)`、`getDailyStarIndex`、`getYearlyStarIndex`
  - `util.fixLunarMonthIndex`
  - `getMajorStarBySolarDate(date,12)`
  - `getMajorStarByLunarDate('2019-12-30',12)` 等於 forward→`('2020-1-1',0)`／current→`('2019-12-30',0)`
- `:108-116` `byLunar('2023-2-15',12,'女',true)`：`rawDates.lunarDate.lunarDay` 在 current 為 15、forward 為 16；全盤等於 `byLunar(current?'2023-2-15':'2023-2-16',0,'女',true)`。
- `:118-131` chart=`bySolar('1996-8-14',0,'女')`，日期對 `('2020-1-24','2020-1-25')`、`('2023-4-19','2023-4-20')`。以下四者 `toJSON` 相等：
  - `horoscope(date,12)`
  - `horoscope(next,0)`
  - `horoscope(`${date} 23:30`)`
  - `horoscope(new Date(y,m-1,d,23,30))`
  - 另 `horoscope(`${date} 23:30`,0)` 等於 `horoscope(date,0)`
- `:133-141` ageDivide normal／birthday：`bySolar('2020-1-24',12,'女')` 對 `bySolar('2020-1-25',0,'女')`。`horoscope('2026-2-18',0).toJSON()`、`decadalList()`、`yearlyList(0)`、`monthlyList(2026)` 皆相等。
- `:143-154` yearDivide＋horoscopeDivide 同設 normal／exact：`('2020-1-24','2020-1-25')`、`('2000-2-3','2000-2-4')`（立春前後）。chartData 與 `horoscopeData(late,date,12)≡horoscopeData(early,next,0)`。
- `:156-170` 6 語言，config `dayDivide:'forward'`：`1996-8-13 ti12` 對 `1996-8-14 ti0`；`horoscope('2023-4-19',12)≡早子 '2023-4-20',0`；之後改全域 config／語言不影響已生成盤。
- `:172-176` `bySolar('9999-12-31',12,'女')`：forward 拋 `'invalid date'`；current 不拋。
- 同族：
  - `astro.test.ts:955-984` `withOptions{type:'solar',dateStr:'1987-9-23',timeIndex:12,gender:'female',fixLeap:true,config:{yearDivide:'normal',dayDivide:'current'}}`：time `'晚子时'`、lunarDate `'一九八七年八月初一'`、chineseDate `'丁卯 己酉 乙亥 丙子'`、zodiac `'兔'`、命／身宮 `'酉'`、soul `'文曲'`、body `'天同'`、`'土五局'`；命宮 index 7 且 `isEmpty()`、命宮 has `['火星','天钺']`、迁移 has `['太阳','天梁','右弼','八座','天贵','空亡','天哭']`。`:924-953` 為同題 ti0 版（time `'早子时'`，其餘相同）。
  - `astro.test.ts:316-323` chart `bySolar('1991-3-7',6,'女',true)`：`horoscope('2025-3-26 3:12').hourly.earthlyBranch==='寅'`；`horoscope('2025-3-26 3:12',0)` 為 `'子'`（2.6.1 修的 `0` 被誤判）。
  - `astro.test.ts:325-339` chart `bySolar('2000-8-16',2,'女',true)`：config current 時 `horoscope('2025-6-10 23:30')`、`(…,12)`、`(…,0)` 的 daily 皆 `{庚,戌}`；forward 時 `(…,12)` daily `{辛,亥}`。
  - `palace.test.ts:22-31` `yearDivide:'exact'` `getSoulAndBody({solarDate:'2023-2-19',timeIndex:12})` → `{soulIndex:1,bodyIndex:1,heavenlyStemOfSoul:'乙',earthlyBranchOfSoul:'卯'}`（正月廿九晚子歸二月初一）。
  - `star.test.ts:124-139` `getStartIndex({solarDate:'2023-08-01',timeIndex:12,fixLeap:true})` → `{ziweiIndex:4,tianfuIndex:8}`；`{solarDate:'2023-02-19',timeIndex:12}` → `{ziweiIndex:11,tianfuIndex:1}`。
  - `palace.test.ts:118-119` `bySolar('2017-12-4',12,'male')` 飛化斷言（命宮 fliesTo 兄弟 忌 等）。
  - `palace-language.test.ts:5-6` birth `{dateStr:'2023-4-6',timeIndex:12,gender:'男'}`、config `{algorithm:'zhongzhou',dayDivide:'current',ageDivide:'birthday'}`：韓語福德宮 index 4。
  - `context-validation.test.ts:211-220` earth／human＋zhongzhou＋current：`timeIndex 12` 盤與 `timeIndex 0` 盤 `fiveElementsClass` 與 `palaces.toJSON()` 相等。
  - `body-palace.test.ts:51-81` 五列 `(dateStr,fixLeap,dayDivide)`：`('1979-8-21',true,forward)`、`('2023-4-6',true,forward)`、`('2023-4-6',false,forward)`、`('2023-4-6',true,current)`、`('2023-4-19',true,forward)`，各跑 timeIndex 0..12，earth／human 的身宮 index、地支與天壽位須等於天盤。
  - `scripts/verify-umd.cjs:97-102` `bySolar('1996-8-13',12,'女')`：lunarDate `'一九九六年七月初一'`、火六局、紫微 `'酉'`，`palaces` 等於 `bySolar('1996-8-14',0,'女').palaces`。

#### B. 閏月

- `astro.test.ts:437-468` `bySolar('2000-8-16',2,'女',true).monthlyList(2025)`（閏六月）：
  - 長度 14；閏月兩項 `{month:6,isLeapMonth:true,part:'first',dayRange:[1,15]}`、`{month:6,isLeapMonth:true,part:'second',dayRange:[16,29]}`；`second.index===(first.index+1)%12`。
  - `monthlyList(2025,false)`：長度 13，閏月 1 項 `{month:6,part:'normal',dayRange:[1,29]}`。
  - 無閏年 `monthlyList(2002)`（`:413-435`）：12 項，首項 `{age:3,year:2002,month:1,isLeapMonth:false,part:'normal',dayRange:[1,30],heavenlyStem:'壬',earthlyBranch:'寅',mutagen:['天梁','紫微','左辅','武曲']}`。
- `astro.test.ts:1062-1126`（2023 閏二月）：
  - `bySolar('2023-4-10',4,'女',true)`、`bySolar('2023-4-10',4,'女')`（省略 fixLeap）、`byLunar('2023-2-20',4,'女',true,true)`：命宮地支 `'子'`、身宮 `'申'`、soul `'贪狼'`、body `'天同'`、`'金四局'`、紫微在 `'迁移'`。
  - `bySolar('2023-4-10',4,'女',false)`、`byLunar('2023-2-20',4,'女')`（省略 isLeapMonth）、`byLunar('2023-2-20',4,'女',true,false)`：命宮 `'亥'`、身宮 `'未'`、soul `'巨门'`、body `'天同'`、`'水二局'`、紫微在 `'命宫'`。
- `astro.test.ts:470-474`：`bySolar('2023-4-7',0,'female',true,'en-US').lunarDate==='Lunar 2023-leap-2-17'`；`bySolar('2000-8-16',2,'female',true,'en-US')`→`'Lunar 2000-7-17'`；ja-JP→`'旧暦2000年7月17日'`。
- `astro.test.ts:1143-1161`：
  - `getSignByLunarDate('2023-2-3')`→`'双鱼座'`，`('2023-2-3',true)`→`'白羊座'`
  - `getMajorStarBySolarDate('2023-4-7',0)`→`'贪狼'`，`(…,false)`→`'紫微,贪狼'`，`(…,0,true,'ko-KR')`→`'탐랑'`
  - `getMajorStarByLunarDate('2023-2-17',0)`→`'紫微,贪狼'`，`(…,0,true)`→`'贪狼'`，`(…,0,true,false)`→`'紫微,贪狼'`
- `astro.test.ts:1318-1341`（yearDivide normal，`withOptions('1979.08.21',6,'male')`，GitHub#242/#244，2020 閏四月、2025 閏六月）：
  - `horoscope('2025-06-10 12:00')` monthly.index 7、daily.index 9
  - `horoscope('2020-6-6')` 1／3；`'2020-6-7'` 2／5
- `default-options.test.ts:14-18` 閏二月日期：`2023-3-22`（初一）、`2023-4-5`（十五）、`2023-4-6`（十六）、`2023-4-19`（末）。
- `validation.test.ts:37-43`：`validateDate('2023-2-30','lunar')` 不拋；`('2023-2-29','lunar',true)` 不拋；`('2023-2-30','lunar',true)` 拋 `'invalid lunar date.'`；`('2023-2-31','lunar')` 拋；`('2023-3-1','lunar',true)` 不拋（非閏月忽略閏標記）。`context-validation.test.ts:139-148` 同旨。
- `scripts/verify-umd.cjs:74-78` 日期集 `2000-8-16, 2000-2-4, 2023-1-22, 2023-4-5, 2023-4-6, 2024-2-29`×13 時辰×男女。

#### C. 月末／除夕

- `astro.test.ts:827-859`（農曆 1999 腊月廿九＝除夕；`byLunar('1999-12-29',2,'女',true,true)`）：solarDate `'2000-2-4'`、lunarDate `'一九九九年腊月廿九'`、time `'寅时'`、命宮 `'亥'`、身宮 `'卯'`、soul `'巨门'`。
  - yearDivide exact：chineseDate `'庚辰 己丑 壬辰 壬寅'`、zodiac `'龙'`、body `'文昌'`、`'土五局'`。
  - yearDivide normal：chineseDate `'己卯 丁丑 壬辰 壬寅'`、zodiac `'兔'`、body `'天同'`、`'火六局'`。
- 同一輸入的不一致斷言（疑似上游行為差異）：`:986-1011` `withOptions{type:'lunar',dateStr:'1999-12-29',timeIndex:2,config:{yearDivide:'exact',horoscopeDivide:'exact'}}` 的 chineseDate 為 `'庚辰 丁丑 壬辰 壬寅'`，月柱 `丁丑`，與 `:834` 的 `己丑` 不同（年柱同為庚辰）。差別只在是否同時設 `horoscopeDivide:'exact'`。升級後務必加這組回歸。
- `astro.test.ts:898-922`（withOptions lunar `'1999-12-29'`，yearDivide normal）：同 normal 結果。
- `astro.test.ts:1013-1060`（`withOptions lunar '1979-12-28' ti0` normal）：solarDate `'1980-2-14'`、lunarDate `'一九七九年腊月廿八'`、chineseDate `'己未 丁丑 丁巳 庚子'`、time `'早子时'`、zodiac `'羊'`、命／身宮 `'丑'`、soul `'巨门'`、body `'天相'`、`'水二局'`。`horoscope('1980-2-14').yearly.earthlyBranch`：horoscopeDivide normal→`'未'`，exact→`'申'`。
- `astro.test.ts:861-882`：`bySolar('1980-2-14',0,'male',true)`（normal／normal）→ `palaces[0].decadal.range` 為 `[112,121]`，`horoscope('1980-2-14').yearly` 為 `{己,未}`。
- `astro.test.ts:884-896`（農曆 1995 二月三十大月末）：`bySolar('1995-03-30',0,'male',true)`（yearDivide normal）→ lunarDate `'一九九五年二月三十'`；`byLunar('1995-2-30',0,'male',true)`→ solarDate `'1995-3-30'`。
- `astro.test.ts:1356-1370`：horoscopeDivide normal，`'1999.05.03' ti8 male`，`horoscope('2025-02-02 10:00')`：monthly.index 9、daily.index 1。

#### D. 酉宮亮度

- `utils/index.test.ts:30-41` `getBrightness(星, fixEarthlyBranchIndex(支))`（酉＝index 7，寅＝0：`:97-115`）：
  - `('破军','午')→'庙'`
  - `('太阳','酉')→'平'`
  - `('太阴','酉')→'旺'`
  - `('七杀','酉')→'旺'`
  - `('天机','未')→'陷'`
  - `('天府','申')→'得'`
  - `('廉贞','子')→'平'`
  - `('陀罗','亥')→'陷'`
  - `('擎羊','亥')→''`
  - `('擎羊','酉')→'陷'`
- `star.test.ts:147-178` `getMajorStar({solarDate:'2023-03-06',timeIndex:4,fixLeap:true})`，以寅起 12 宮（`[name,brightness,mutagen]`）：
  - 0 七杀庙；1 天同平；2 武曲庙；3 太阳旺
  - 4 破军庙/禄；5 天机陷；6 紫微旺＋天府得；**7（酉）太阴 旺/科**
  - 8 贪狼庙/忌；9 巨门旺/权；10 廉贞平＋天相庙；11 天梁旺
  - vi-VN 版同盤 `:180-213`。
- `analyzer.test.ts:282-290` chart `bySolar('2013-8-21',4,'女',true)`：`紫微.withBrightness('庙')` false；`['庙','得']` true；`巨门.withBrightness('庙')` true；`太阴.withBrightness(['不','陷'])` false；`贪狼.withBrightness('平')` true。
- 目前資料表（grep 命中，`iz/src/data/stars.ts:23,48,73`）：太阳 index7=`ping`、太阴 index7=`wang`、七杀 index7=`wang`，與上述測試一致。舊版值不在本 repo，無法列出「變了什麼」。
- `plugin.test.ts:40-46,79-80` 自訂 `brightness.贪狼=12×旺` 後 `贪狼.withBrightness('旺')` true（自訂表機制）。

### 2.3 CHANGELOG：2.5.8 之後每一版每一條（`iz/CHANGELOG.md`）

- `:10-12` 未发布：清理 `terser-webpack-plugin` 遺留的 `serialize-javascript` 版本覆蓋與鎖檔條目（`:12`）。
- v2.6.5（2026.11.05，`:14-18`）
  - `:18` feature：`astro.config({language})` 統一設定後續排盤／日期輔助／獨立工具的預設輸出語言；`getConfig()` 返回之；`resetConfig()` 回 `zh-CN`；`withOptions({config:{language}})` 只覆蓋當前盤；顯式 `language` 參數優先；保留 `astro.setLanguage()`，新增 `astro.getLanguage()`。
- v2.6.4（2026.11.02，`:20-39`）
  - enhancement `:24`：排盤複用同次干支結果、安星與主星查詢複用已歸一化日期，減少晚子時重複換日計算，結果與公共介面不變。
  - feature `:28`：新增 `version` 匯出（ESM／CJS／UMD 全域 `iztro.version`），UMD 檔頭保留版本、MIT、專案位址（#319）。
  - fix `:32`：`dayDivide:'forward'` 下晚子時只進日、未同步農曆月年的混合盤（#314、#82）；排盤、天地人盤重排、安星輔助查詢、運限統一用換日後日期，正確處理月末、年末、閏月；`current` 保持歸當日；陽曆輸入日期、出生時段、星座保留原意，農曆日期與干支反映實際排盤日。
  - fix `:33`：中州派地盤、人盤身宮不再隨新命宮平移，三盤統一按出生農曆月＋時辰安身宮，同步身宮標記、查詢與身宮地支欄位。
  - fix `:34`：地盤、人盤重排省略 `fixLeap` 預設 `true`，與天盤一致。
  - chore `:38`：Codecov 改 Node 24。
  - chore `:39`：發布技能補 CI Node 版本一致、npm Trusted Publisher 失敗恢復、registry 快取延遲驗收。
- v2.6.3（2026.10.16，`:41-63`）
  - enhancement `:45`：建置改生產模式、統一 `lunar-typescript` 1.8.6 並指向同一 CJS 入口避免重複打包，保留瀏覽器目標、UMD 檔名、公共欄位、sourcemap。
  - enhancement `:46`：日語常用字形統一（`禄 権 徳 陥` 等）、修正運限星名混用簡體 `钺 鸾`，有爭議異名暫留。
  - fix `:50`：韓語福德宮與天德星同名造成混合語言宮位查詢、運限宮位查詢、人盤排盤失敗；宮位反查只匹配宮位名稱。
  - fix `:51`：韓語截空、岁破、天德、鈴星、童限譯名；區分天德 `천덕`／福德 `복덕`。
  - fix `:52`：日語仆役宮譯名改 `奴僕`。
  - fix `:53`：越語亮度「陷」`Hãm`、沐浴 `Mộc Dục`、月日時天鉞 `Thiên Nguyệt`→`Thiên Việt`；調整童限說明。
  - fix `:54`：Jest 工具鏈 `js-yaml` 3.15.2、ESLint 工具鏈 4.3.2（CVE-2026-84375）。
  - chore `:58-63`：Release 工作流以 npm OIDC Trusted Publishing 在推送版本 tag 後自動發布（校驗 tag／checkout／包版本，已發布跳過，registry 異常中止，預發布走 `next`）；新增「發布版本」技能；新增 `verify:umd`；同步 `astro-docs` 多語言正文／API 取值列表／術語記錄／站點產物；Codecov 統一 Yarn 快取、`--frozen-lockfile`、`yarn test`；補多語言名稱反查、宮位查詢、天鉞與天月區分回歸測試，總 539 項。
- v2.6.2（`:65-80`，無日期）
  - enhancement `:69`：排盤與後續運限、四化分析保存生成時的配置與語言，不受其他排盤或全域變化影響。
  - `:70`：`withOptions({config})` 只覆蓋當前盤；改後續預設需顯式 `astro.config()`。
  - `:71`：排盤與日期輔助方法的 `language` 參數不再修改全域語言；省略時預設簡中。
  - `:72`：非中文盤農曆日期按指定語言格式化並保留閏月標記。
  - `:73`：`getConfig()` 回獨立副本；新增 `resetConfig()` 恢復預設並清除自訂四化、亮度表。
  - `:74`：統一校驗日期、性別、語言、時辰；非法日期及非整數或超出 0～12 的時辰拋錯。
  - `:75`：`Option.type` 改可選，預設陽曆；測試顯式初始化配置。
  - `:76`：補參數邊界、配置隔離、運限分析、JSON 轉換測試，總 517 項；行覆蓋 99.87%、分支 98.17%。
  - fix `:80`：`fix: localize lunarDate output - #308`。
- v2.6.1（`:82-95`，無日期）
  - enhancement `:86`：韓文、越南語同名星曜新增帶漢字限定別名以準確反查。
  - `:87`：武曲、岁破英文名改 `warrior`、`breaker`（避免與將軍、大耗重名）。
  - fix `:91`：修正太陽、太陰、七殺在酉宮的亮度資料。
  - `:92`：以生日為分界時，後續年份在農曆生日同月、生日之後虛歲少算一歲。
  - `:93`：`horoscope()` 顯式傳入早子時索引 `0` 被誤判為未傳入而取目標時間小時數。
  - `:94`：運限查詢未遵守晚子時日期分界配置。
  - `:95`：運限宮位查詢和分析方法不支援混合語言宮名輸入。
- v2.6.0（`:97-110`，無日期）
  - enhancement `:101`：UMD 新增帶版本號產物（`iztro-v2.6.0.min.js`＋sourcemap），保留 `iztro.min.js`。
  - feature `:105`：所有 `Functional*` 類新增 `toJSON()`（去功能方法與運行時引用，安全處理循環引用）。
  - `:106`：`FunctionalAstrolabe.flankingPalaces()`。
  - `:107`：`decadalList()`（含起止虛歲／年份、大限流耀、大限四化、大限十二宮）。
  - `:108`：`yearlyList()`（依大限序號或本命宮名）。
  - `:109`：`monthlyList(year,fixLeap)`。
  - `:110`：閏月處理：無閏 12 項；有閏且 `fixLeap:false` 13 項；有閏且 `fixLeap:true` 拆前後半月 14 項。
- v2.5.8（基準，`:112-116`）：中州派晚子時人盤排盤錯誤。

### 2.4 其他事實

- 文件過期：`README-en_US.md:254`、`README-zh_TW.md:314` 仍寫「version API 將從下一版本開始提供」，但 2.6.4 已含；`README-zh_TW.md:245,255,269,274` 仍引 `iztro-v2.6.0`。
- iztro 的 README 推廣託管 AI 服務（`chat-api.iztro.com`、`api-doc.iztro.com`、四個 `iztro-ziwei/qimen-v3*` 模型，`README-en_US.md:38-134`），需 API key，不屬於 npm 套件本體（`:69-70`）。
- 發布技能（`iz/skills/iztro-release/SKILL.md`）是給 AI agent 的操作手冊，內含 `gh`、`npm`、git tag 推送指令。本次只當資料讀，未執行。

---

## 3. ziwei-chart

### 3.1 `lib/fortune-score.ts` 計分規則全表（1393 行全讀）

**UI 實際只用兩條路徑：** `generateLifetimeKLines`（無 key 或 LLM 失敗時，`LifeKLine.tsx:255-269`）與 `generateKLinesWithLLM`（有 key）。`calculatePeriodScore`、`generateDecadalKLines`、`generateYearlyKLines`、`generateMonthlyKLines` 與 `EventCard` 僅被匯出、無呼叫者（全專案 grep 僅命中定義與 index 匯出）。

**星曜基礎分**（`:92-156`，`STAR_BASE_SCORE`）：
- 主星：紫微18、天機10、太陽12、武曲11、天同9、廉貞8、天府16、太陰11、貪狼10、巨門6、天相12、天梁11、七殺7、破軍6
- 六吉：左輔10、右弼10、文昌9、文曲9、天魁11、天鉞11
- 六煞：擎羊−12、陀羅−10、火星−8、鈴星−8、地空−9、地劫−9
- 祿存12、天馬8
- 其他：紅鸞6、天喜6、天刑−4、天姚3、天哭−3、天虛−3、龍池4、鳳閣4、華蓋2、咸池−2、天德5、月德5、天官4、天福4、解神5、天巫3、天月−2、陰煞−5、台輔3、封誥3、三台4、八座4、恩光3、天貴3

**亮度係數**（`:162-170`）：廟1.5、旺1.3、得1.1、利1.0、平0.9、不0.7、陷0.5。缺亮度視為「平」；表外字串回 1.0（`|| 1.0`）。

**四化修正**（`:176-181`）：祿+15、權+12、科+10、忌−18。

**維度宮位**（`:187-192`）：事業［官祿、命宮、遷移］、財運［財帛、福德、田宅］、感情［夫妻、子女、兄弟］、健康［疾厄、父母、命宮］（無「宮」後綴，與 iztro 宮名一致）。

**`normalize`**（`:352-358`）：`round((x−20)/70×100)` 夾 0–100。

**UI 路徑 `generateLifetimeKLines`**（`:1066-1147`，1–100 歲）：
- `decadalBase`（`:972-1010`，依 `findDecadalForAge` 找到的大限宮位）：`45 + Σ主星[base×coef×1.2 + 該星本命化象(祿+18/權+15/科+12/忌−22)] + Σ輔星 base×0.8`；按大限年齡區間快取。此處用原始星名查表，禄存／天馬有效。
- `yearlyModifier`（`:1015-1060`）：流年四化（祿+20/權+16/科+12/忌−25；**實際不會觸發**，見 3.1.1）＋流年命宮宮位 Σ主星 base×0.5 + Σ輔星 base×0.3 ＋ `(random−0.5)×15`。
- `yearTarget = decadalBase + yearlyModifier`；`open = 上年 close`（首年 50）；`moveRatio = 0.3 + random×0.4`；`close = open + (target−open)×moveRatio + (random−0.5)×15`。
- `volatility = |target−open|×0.3 + random×10`；`high = max(o,c) + vol×(0.5+random×0.5)` 上限 100；`low = min(o,c) − vol×(0.5+random×0.5)` 下限 0。
- `score = round((open+close+high+low)/4)` 夾 0–100。四維度：`normalize(mid)`、`mid×0.95`、`mid×0.9`、`mid×0.92`，各加 `(random−0.5)×15`。
- 流年干支 `(year−1984)%60` 查六十甲子（`:937-941`）；大限範圍外回 `{daYun:'童限',range:'1-5'}`（`:966`）。
- **`open`、`close` 未夾 0–100**（只夾 high／low 與 score，`:1096-1120`）。`decadalBase` 例如紫微廟＋天府廟＋輔星可 >100；圖軸固定 `[0,100]`（`LifeKLine.tsx:411`），且會出現 `high < close`，違反知識庫自己的規則（`kline.ts:101`）。靜態推演。

**其餘（死碼）路徑**：
- `calculatePalaceScore`（`:201-247`）：`50 + 主星 base×coef + 化象 + 輔星 base + 雜曜 base×0.5`。
- `calculatePeriodScore`（`:252-329`）：總分 `= 事業×0.30+財運×0.25+感情×0.25+健康×0.20+流年加成`，夾 0–100；流年取 `new Date('${year}-6-15')`（`:256`）。
- `calculatePalaceBaseScore`（`:507-536`）：`50 + 主星 base×coef×0.5 + 化象(+8/+6/+5/−10) + 輔星 base×0.3`，夾 20–90。
- 月度：流月四化 +10/+8/+6/−12、流年四化 +6/+5/+4/−8，夾 15–95（`:468-499`）；另一版 `calculateRealMonthlyScores` 流月 +12/+10/+8/−15、流年 +8/+6/+5/−10＋`getPalaceModifier`（`:708-742`，主星×coef×0.3、化象 +5/+4/+3/−8、輔星×0.2），夾 15–95（`:660-703`）。
- 週度流日四化 +3/+2/+2/−5，夾 10–95，日期取 `min(week×7,28)`（`:747-781`）。
- `generateDecadalKLines` 硬編 `birthYear = currentYear − 30`（`:374`），並非真實出生年。

**分級帶**（註解 `:6-14`；Tooltip `LifeKLine.tsx:49-52`）：80+大吉、60–79吉、40–59平、20–39凶、0–19大凶。

**亂數用在哪**（`Math.random`）：`:545-548`（大限維度，死碼）、`:802-805`（月維度，死碼）、`:1057`（流年修正）、`:1100`（moveRatio）、`:1102`（close 擾動）、`:1107`（波動）、`:1109-1110`（影線）、`:1124-1127`（四維度）、`:1376-1379`（**LLM 路徑的四維度也是亂數**）。

#### 3.1.1 計分規則的結構性缺陷（靜態推演，核對過 iztro 測試輸出格式）

- **四化加成以「星名含 禄/权/科/忌」判斷，但 `horoscope.yearly.mutagen` 等是星名陣列**（iztro 測試：`iz/src/__tests__/astro/astro.test.ts:130` `['破军','巨门','太阴','贪狼']`）。四化星名不含這四個字，所以 `:290-296`、`:479-492`、`:677-691`、`:766-771`、`:1032-1035` 全部不會觸發；`yearlyMutagens`（`:1030`）只是被塞進星名。K 線裡「流年四化」實質貢獻為 0，僅 Tooltip 顯示星名。
- `calculatePalaceScore` 先 `star.name.replace(/[化禄权科忌]/,'')`（`:210,229`）：禄存→「存」、查不到，**禄存 +12 分在該路徑失效**（死碼路徑，但另三處用原名則有效）。

### 3.2 `knowledge/` 與 `knowledge-db/` 結構

**`knowledge/`**（靜態字典＋提示詞組裝）：
- `stars/majorStars.ts:6-232`：十四主星 `StarInfo{name,group,wuxing,yinyang,traits,keywords,description,palaceEffects}`，檔頭註「来源：02-星曜体系/01-十四主星.md」。
- `palaces/index.ts:6-143`：十二宮 `{domain,description,sanfang,duigong,keywords}`，註「来源：03-宫位系统/01-十二宫详解.md」。
- `sihua/index.ts:6-79`：四化性質＋十干四化表（`SIHUA_BY_GAN`）。
- `knowledge/index.ts`：`extractKnowledge`（`:75-223`）→`buildPromptContext`（`:296-407`）。
- **註記的來源檔（numbered root folders）不在 repo**（`docs/dev/project-map.md:53` 稱「Domain knowledge is stored in the numbered root folders」，實際根目錄沒有），無法驗證出處。
- 沒有書名、頁碼、引文；描述為通用概述句。未見直接抄錄（全文 grep `《|云：|曰：|赋|骨髓|全书云|原文` 僅命中 `sources.ts` 三行聲明）。
- `getPalaceInfo`、`getSanfangSizheng`、`parseMutagen`、`getSihuaByGan`、`getAllStars` 全專案無呼叫者。

**`knowledge-db/`**：
- schema（`schema.ts:8-71`）：`KnowledgeEntry{id,domain[principle|concept|star|palace|sihua|pattern|combo|fortune],title,entities,appliesTo,topics,priority,guidance{focus,likelyThemes,nuance,avoid},taskFit,sourceRefs,sourceLevel S/A/B/C,confidence,reviewStatus draft/reviewed/verified}`。
- 來源目錄（`sources.ts:10-68`）共 8 筆：
  - `project.analysis-position`（project-principle：專案自訂口徑）
  - `book.ziwei-doushu-quanshu`（classic：《紫微斗数全书》，url 為博客來商品頁 `books.com.tw`）
  - `book.lu-wang-star-nature`（陸斌兆、王亭之《紫微斗数讲义：星曜性质》，豆瓣）
  - `book.wang-tingzhi-basic`（王亭之《中州派紫微斗数初级讲义》，豆瓣）
  - `book.wang-tingzhi-stars`（王亭之《王亭之谈星》，Google Books）
  - `book.ziwei-doushu-jingcheng`（《紫微斗数精成》，豆瓣）
  - `author.cross-check`（author-note：專案整理）
  - `web.ziwei-learn-cross-check`（`https://www.ziwei.pro/zh/learn`）
  - 引用只到書目（商品頁／豆瓣條目），無頁碼、章節、原文片段；`sources.ts:22,59,66` 自述「只做項目化歸納，不複製原文／網頁原文」。
  - 條目文字讀完（combos/palaces/stars/sihua/principles/fortune/kline/match/support/sihuaPalaces）：全為「focus／likelyThemes／nuance／avoid」格式的改寫式護欄語句，語氣統一、含大量「不要直接斷…」；**沒有逐字古籍或現代著作原文跡象，但風格與出處無法由 repo 驗證**（沒有來源文本可比對）。
- 每條來源等級與引用（abbr. refs；詳見各檔 `SOURCE_REFS`）：
  - principles（7）：`S`×5＝chart-facts-first、guidance-not-verdict、no-absolute-fate、domain-safety、share-quote-specificity；`A`×2＝sihua-dynamic-weight、layered-time-reading。refs＝project.analysis-position＋全書＋王亭之初級＋author.cross-check（`principles.ts:10-15`；guidance-not-verdict／domain-safety／share-quote 只引 project＋author）。
  - sihua（4）：A。refs 同 principles（`sihua.ts:10-15`）。
  - sihuaPalaces（17）：B，draft，confidence 0.72；refs＝project＋全書＋王亭之初級＋ziwei.pro＋author（`sihuaPalaces.ts:10-16,36-46`）。
  - stars（14）：B，draft，0.72；refs＝project＋陸王＋王亭之初級＋王亭之談星＋author（`stars.ts:10-16`）。
  - palaces（12）：B，draft，0.72；refs＝project＋全書＋王亭之初級＋ziwei.pro＋author（`palaces.ts:10-16`）。
  - combos（29）：B，draft，confidence 0.68–0.76；refs＝project＋陸王＋王亭之初級＋談星＋精成＋author（`combos.ts:10-17`）。
  - match（6）：B，draft，0.68；refs＝project＋王亭之初級＋ziwei.pro＋author（`match.ts:10-15`）。
  - support（6）：B，draft，0.7；refs＝project＋全書＋陸王＋ziwei.pro＋author（`support.ts:10-16`）。
  - fortune（5）：B，draft，0.7；refs＝project＋全書＋王亭之初級＋ziwei.pro＋author（`fortune.ts:10-16`）。
  - kline（5）：**C**，draft，0.66；refs＝project＋author（`kline.ts:10-13,40-42`）。
  - 「S」代表專案自訂原則，不是「經典書籍」；「reviewed」僅 principles 與 sihua 共 11 條。
- 檢索（`retrieval/retrieve.ts:91-123`）分數＝`priority + DOMAIN_WEIGHT(combo20/pattern16/sihua12/star10/palace6/fortune6/concept4/principle0) + 實體命中×40 + appliesTo×20 + topics×10 + (taskFit 命中+15) + (單實體 star/palace/sihua 命中+18) + 訊號權重/10`。
  - combo／pattern 必須單一訊號內實體命中 ≥2；含「未命中的特定主星」之 combo／pattern 直接跳過（`:103-104`）。
  - 全域三原則（chart-facts-first、guidance-not-verdict、no-absolute-fate，`:43-47`）強制先佔名額。
  - 訊號由 `deriveGuidanceSignals`（`context.ts:78-86`）產生：每顆星 `[星名,宮名]`、有四化再加 `[星名,四化,宮名]`（權重100）、格局提示（只認「杀破狼」「机月同梁」，`:46-65`）、時間訊號。

#### 3.2.1 「檢索實際命不中」缺陷（靜態推演；證據為 iztro 輸出格式＋本 repo 自寫 fixture）

- **宮名後綴不一致。** iztro zh-CN 宮名為 `命宫、兄弟、夫妻、子女、财帛、疾厄、迁移、仆役、官禄、田宅、福德、父母`（`iz/src/i18n/locales/zh-CN/palace.ts:7,11`、`analyzer.test.ts:8-21`、`astro.test.ts:96-108`）。
  - 而 `knowledge-db` 條目、`HIGH_VALUE_PALACES`（`context.ts:18`）、`knowledge/palaces/index.ts`、`YearlyFortune.tsx:149` 全用帶「宫」的 `财帛宫/官禄宫/夫妻宫…`。`extractKnowledge` 取的是 `String(palace.name)`（`knowledge/index.ts:91`）。
  - 結果：除「命宫」外，所有以宮名作實體／appliesTo 的條目從真實盤無法命中；`YearlyFortune.buildYearlyContext`（`:151-153`）只會找到「命宫」，其餘五宮 `continue` 跳過（流年提示詞少了財、官、夫、疾、遷）。
  - 對照：`fortune-score.ts:187-192` 用不帶「宫」的宮名，是正確的。
- **化象值不一致。** iztro 的 `star.mutagen` 是單字 `'禄'|'权'|'科'|'忌'`（`iz/.../star.test.ts:159-171`）。`knowledge/index.ts:101,163,176` 把它原樣字串化，但：
  - `getSihuaInfo` 的 key 是 `'化禄'…`（`sihua/index.ts:13-38`）→ `四化分布` 永遠為空（提示詞「本命四化分布」段不會出現；K 線提示詞 `## 本命四化` 為空）。
  - `detectPatterns` 比對 `=== '化忌'`（`knowledge/index.ts:284`）→「化忌入命」格局提示永遠不出。
  - 訊號 `entities:[星名,'忌',宮名]`（`context.ts:35-38`）永遠命不中條目實體 `'化忌'`；所有 sihuaPalaces（17）與含 `'化忌'` 的 combos（武曲／太陰／太陽／巨門／廉貞／天機／貪狼化忌，7）不可達；`sihua.ts` 4 條只靠 topics `'四化'` 命中，彼此無法區分哪一化。
- **測試是假綠。** `context.test.ts:19,21,44` 手寫 fixture 用 `name:'财帛宫'` 與 `mutagen:'化忌'`，`retrieve.test.ts` 的訊號也手寫 `'化忌','财帛宫'`（`:10,98,201,218`）；沒有任何一個測試吃真實 `extractKnowledge(chart)` 輸出。
- **其他不可達：**
  - 格局訊號只處理「杀破狼／机月同梁」，而 `detectPatterns` 只會產生紫府同宮／紫杀同宮／機月同梁／空宮／化忌入命（`knowledge/index.ts:250-290`）。所以 `pattern.sha-po-lang`、`pattern.zi-fu-tong-gong`、`pattern.zi-sha-tong-gong` 不可達。
  - 日月反背、昌曲、羊陀、空劫、左右、魁鉞、火鈴、祿存：需 ≥2 實體但訊號一次只有一顆星＋宮名。
  - 空宮借對宮（entities 空宫/对宫/借星）永不被訊號帶入。
  - `principle.domain-safety…`（appliesTo「全局」）無訊號帶入。
  - 實際能到的主體：三原則（強制）、十四主星 star 條目、`palace.life.guidance`、`combo.ziwei.life-palace`、命宮巨門、機月同梁格局、時間訊號帶出的 `layered-time-reading` 與 fortune 條目、有四化星時的 sihua 4 條。
- `detectPatterns`（`knowledge/index.ts:250-290`）的「機月同梁」只要命宮同時有（天機或太陰）與（天同或天梁）就成立，並非傳統三方組合定義；`ShareCard.getPatternName`（`:68-82`）把「天機＋太陰」稱「機月同梁格」，另有紫貪、紫相、日月、廉貪、武貪同宮，自行定名。

### 3.3 AI prompt 全文位置與組成

- 系統提示詞全文（逐字在這些行）：
  - 命盤解讀「星图先生」：`components/AIInterpretation.tsx:19-63`。角色＝精通三合派、飛星派、欽天門；禁用「灵魂底色／磁场／能量」；輸出壹–陸（命格總斷、事業財運、婚姻、六親、隱憂建議、命格金句）。
  - 年度運勢：`components/fortune/YearlyFortune.tsx:29-63`（限流疊宮、流年四化、月令）。
  - 合盤：`components/match/MatchAnalysis.tsx:33-63`（星情對看、四化互飛、宮位參合）。
  - K 線：`lib/fortune-score.ts:1156-1212`（規則含 `open=上年close`、80+ 大吉…、杀破狼起伏大、輸出 JSON 陣列含 `brief`）。
  - 搜尋關鍵詞抽取：`lib/llm.ts:107-118`。
- 使用者訊息組成：
  - 命盤：`AIInterpretation.tsx:211-222` = 基本資訊（**陽曆年月日、性別、五行局，不送時辰、出生地、校正後時間**）＋ `buildPromptContext`（`knowledge/index.ts:296-407`：命宮主星描述、身宮、十二宮星曜含亮度／四化／輔星／雜曜／大限、本命四化分布（實為空，見 3.2.1）、十二大限＋四化、流年（今年−10 至 +5）、格局提示）＋ `buildGuidancePromptContext(task:'natal',limit:12)`。
  - 年運：`YearlyFortune.tsx:225-239` = 基本資訊＋natalContext＋`buildYearlyContext`（`:121-175`）＋guidance（limit 14）。
  - 合盤：`MatchAnalysis.tsx:248-268` = 兩人各自 `基本資訊＋buildPromptContext＋guidance(task:'match',limit 8)`。
  - K 線：`fortune-score.ts:1217-1282` = 出生年、命宮主星、身宮、本命四化（空）、十二宮、大限走向、近期流年、guidance（`task:'kline',limit 8`）、要求輸出 100 年 JSON。
  - guidance 區塊格式：`context.ts:92-123`，抬頭「【专业知识导向】…不是机械判词…不要逐条复述知识库」。
- **提示詞資料錯誤**：`YearlyFortune.tsx:137,144` 與 `knowledge/index.ts:211` 用 `palaceNames[0]` 當「流年命宮位置／大限命宮位置」。`palaceNames[i]` 是「宮位 index i 在該運限的名稱」，index 0=寅宮；流年命宮在 `palaceNames` 中值為「命宫」的位置（iztro `astro.test.ts:116-129`：yearly `palaceNames[0]==='兄弟'`、`[1]==='命宫'`）。
- 解讀文字處理：逐字動畫 35ms/字（`AIInterpretation.tsx:69,147-164`），`react-markdown + remark-gfm`；分享卡用正則抽「陸·命格金句」（`share/ShareCard.tsx:36-52`），只認直引號與 `>` 引用。
- 年份日期：`new Date('${year}-6-15')`（非 ISO，月份未補零）出現在 `YearlyFortune.tsx:211`、`fortune-score.ts:256,1023`、`knowledge/index.ts:203`；Safari 歷來對此格式回 Invalid Date（本環境未驗證）。

### 3.4 合盤流程（`components/match/MatchAnalysis.tsx`）

- 兩人各一組 `BirthInfo`（預設 1990-1-1 12 時男／1992-6-15 14 時女，`:207-212`），`PersonInput` 只有年／月／日／時辰（子時 value=23）／性別，**無出生地、無真太陽時**（`:113-197`）。
- `handleAnalyze`（`:217-295`）：
  - 無 key 即報錯（`:218-221`）
  - `generateChart(person1|2)`（`lib/astro.ts:48-64`，同一全域中州派＋天盤）
  - 各自 `extractKnowledge`＋`buildPromptContext`＋`buildGuidancePromptContext(task:'match',limit 8)`
  - 合成一則 user message＋`MATCH_PROMPT` system，走 `streamChat` 串流顯示（不快取、不經 `useContentCacheStore`）
- **沒有計算四化互飛、沒有分數、沒有宮位互看。** 提示詞要求 LLM「推演 A 的命宮四化飛入 B 的宮位」（`:38`），但輸入資料只含兩張各自的盤，互飛由模型自行推導，與知識庫 `principle.chart-facts-first`（不得自行推算）相悖。
- `match.ts` 的 6 條 `domain:'combo'`、entities 含「合盤」，但訊號從不帶「合盤」→ 6 條幾乎不可達（靜態推演）。

### 3.5 其他事實

- 資料來源：城市座標來自 `88250/city-geo`（Mulan PSL v2，`docs/dev/project-map.md:51-52`、`docs/licenses/city-geo-MulanPSL2.txt` 存在）。
- 工程：App 版本 0.2.0（`app/package.json:4`）；`docs/dev/progress.md:51-58` 記 28 測試（我核對：8＋16＋2＋2＝28）。progress.md:65-66 自述 `CLAUDE.md` 為亂碼。
- 同步工作流 `.github/workflows/sync-zwknows.yml:1-37`：push main 後以 classic PAT（secret `ZWKNOWS_SYNC_TOKEN`，需 repo＋workflow，`docs/dev/workflow.md:83-90`）對 `ruijayfeng/zwknows` 做 `--force-with-lease` 推送（`:34-37`），僅 `ziweiknows/ziwei-chart` 執行（`:15`）。
- README 致謝 `AICryptoHK/lifekline`（`README.md:165`）——「人生 K 線」概念來源，授權未查；`README.md:35` 版權 `ruijayfeng`、GPL v3 或更高版本。若我們要借用程式，GPL-3.0 條款會傳染；概念或自寫公式則不受限。

---

## 4. react-iztro（`riz/`，版本 1.5.1、`iztro ^2.6.5`、`iztro-hook ^1.3.5`、`lunar-lite ^0.2.9`：`package.json:3,68-73`）

### 4.1 元件結構

- 入口 `src/index.ts:1`→`Iztrolabe/index.ts:1-2` 匯出 `Iztrolabe`、`IztrolabeProps`、`Algorithm`、`AstroType`（`Iztrolabe.type.ts:4-15`）。
- `Iztrolabe`（`Iztrolabe.tsx:25-51`）：包一層管理 `algorithm`／`astroType` state；`key={algorithm}` 切算法時整個 `IztrolabeContent` 重掛（`:43`）。
- `IztrolabeContent`（`:53-218`）：用 `iztro-hook` 的 `useIztro`（`:67-80`）取 `astrolabe/horoscope/setHoroscope`；管理 taichi 點、四化干 active／hover、五個運限 scope 開關、`horoscopeDate`／`horoscopeHour`。
  - 12 個 `Izpalace` ＋ 1 個 `IzpalaceCenter`；CSS grid 4×4（`Iztrolabe.css:1-14`）。
- `Izpalace`（`Izpalace.tsx`）：主星／輔星／雜曜（切 5＋其餘）／大小運限流耀／運限名稱 span／footer（長生、博士、宮名、太極點、身宮、小限年齡、大限範圍、運限宮名、岁前將前、宮干支）。
  - hover 高亮三方四正（`:134-146`，`fixIndex(focus±4,+6)`）。
- `IzpalaceCenter`（`IzpalaceCenter.tsx`）：基本資訊 12 項、算法／盤型 `<select>`（`:232-270`）、運限日期、十個時間按鈕、`Line` canvas 三方四正連線、「Powered by iztro」連結（`:368-376`）。
- `Izstar`（`Izstar.tsx`）：星名＋亮度＋本命四化＋各運限四化徽章；四化干 active／hover／自化三種樣式（`:15-58`）。
- `Line`（`Line.tsx`）：canvas 畫三方四正線，顏色來自 CSS 變數（`:13-25`）。

### 4.2 樣式／主題

- 單一主題 `theme/default.css`：以 `.iztro-astrolabe-theme-default` 綁 `--iztro-*` CSS 變數（星字大小、色票 `major/quan/tough/awesome/active/happy/nice/decorator-1/2/text/border`、五個運限色，`:1-21`）。
  - class 名在 `Iztrolabe.tsx:176` 寫死，**沒有 theme prop**；`IztrolabeProps.width`、`NestedProps.className/children`（`Iztrolabe.type.ts:9-15`、`config/types.ts:44-47`）宣告但元件內未使用（grep 無讀取）。
- 另有硬編色：`#fff`、`rgba(0,0,0,0.2)`（`.iztro-copyright`，`IzpalaceCenter.css:88-96`）、focus 背景（`Izpalace.css:15-23`）；`.iztro-palace{text-transform:capitalize}`（`:4`）；`.iztro-astrolabe` 字型堆疊寫在 `Iztrolabe.css:2`。`#palace-line` 用 id 選擇器（`IzpalaceCenter.css:98-105`）。
- 多語系：`src/locales/*`（6 語，各 30 行）以 `i18next.addResources(lang,'react',…)` 註冊到 **iztro 的全域 i18next 實例**（`locales/index.ts:11-16`）。農曆字串自行重格式化（`:27-45`）。
- 無 storybook 以外的展示；`Iztrolabe.stories.tsx` 為唯一 story（含 6 語、`options` 物件控制）。

### 4.3 與 iztro 的耦合點

- 深層 import `iztro/lib/*`：`Iztrolabe.tsx:13-15`（`Scope`、`HeavenlyStemKey`、`getPalaceNames`）、`Izpalace.tsx:6-8`、`IzpalaceCenter.tsx:3-12`（`FunctionalAstrolabe`、`fixEarthlyBranchIndex`、`IFunctionalHoroscope`、`i18next` 預設匯出、`kot`、`t`、`CHINESE_TIME`）、`Izstar.tsx:4-6`（`MUTAGEN`、`kot`、`t`、`getMutagensByHeavenlyStem`）、`Izstar.type.ts`、`Izpalace.type.ts`；以及 `lunar-lite`（`normalizeDateStr`、`solar2lunar`）。lib 目錄結構一變即壞。
- 讀取的欄位：`palace.{index,name,majorStars,minorStars,adjectiveStars,changsheng12,boshi12,jiangqian12,suiqian12,decadal.range,ages,isBodyPalace,heavenlyStem,earthlyBranch}`、`horoscope.{decadal,yearly,monthly,daily,hourly,age}.{index,name,heavenlyStem,palaceNames,mutagen,stars}`、`horoscope.yearly.yearlyDecStar`、`astrolabe.{fiveElementsClass,chineseDate,solarDate,lunarDate,rawDates.lunarDate,time,timeRange,zodiac,sign,soul,body,earthlyBranchOf*Palace,gender}`。
- 全域 i18n 語言為預設前提：`t("bodyPalace")`（`Izpalace.tsx:240`）、`i18next.t("react:…")`、`t(CHINESE_TIME[hour])`（`IzpalaceCenter.tsx:335`）、`getMutagensByHeavenlyStem(t(stem))`（`Izstar.tsx:20,35,50`）。

### 4.4 程式缺陷（靜態推演；`iztro-hook` 不在 repo，標 † 者依賴其實作，無法確認）

- † **iztro ≥2.6.1 後流時預設變成「子時」。** `props.horoscopeHour ?? 0`（`Iztrolabe.tsx:148-149`）使預設小時索引永遠是 0，再傳給 `setHoroscope(date, hour)`（`:152-154`）。iztro 2.6.1 起顯式 `0` 被視為早子時（`iz/CHANGELOG.md:93`、`astro.test.ts:316-323`），2.5.8 時 `0` 被當未傳入而改用日期的實際小時。若 hook 原樣轉傳，升級後「今」的流時固定落子時（行為悄悄改變）。
- **晚子時不可達。** 時辰步進 `>11` 進日、`<0` 退日（`IzpalaceCenter.tsx:132-145,177-184`），小時 state 只在 0–11；`CHINESE_TIME[horoscopeHour]`（`:335`）。操作員無法在 UI 選到 index 12。
- **月／年步進溢出。** `dt.setMonth(+1)`（`:149-151,189-191`）自 1/31 變 3/2 或 3/3；`setFullYear(+1)` 自 2/29 變 3/1（`:152-154`）。
- † **四化高亮在非預設語言可能壞。** `Izstar.tsx:20-26,35-41,50-56` 以「全域語言」的 `getMutagensByHeavenlyStem(t(stem))` 結果去 `indexOf(star.name)`，而 `star.name` 是盤生成時語言。2.6.2 起排盤 `language` 不再改全域（`iz/CHANGELOG.md:71`；`global-language.test.ts:32-48` 顯示獨立查詢吃全域語言）。除非 hook 同步全域語言，否則 `lang !== 全域` 時不匹配。
- `Line.tsx:15-18`：以 `document.getElementsByClassName("iztro-astrolabe-theme-default")[0]` 取全域第一個節點算色，多實例取到別人的；若找不到節點 `getComputedStyle(undefined)` 拋錯。`id="palace-line"`（`:88`）固定，多實例會重複 id；CSS 以 `#palace-line` 選（`IzpalaceCenter.css:98`）。
- `IzpalaceCenter.tsx:115` `prevDecadalDisabled: dt.setFullYear(...)`：無人使用卻有副作用運算。
- `Iztrolabe.tsx:152-154` `useEffect` 依賴缺 `setHoroscope`；`Izstar.tsx:30-58`、`Izpalace.tsx:29-130` `useMemo` 依賴缺語言相關函式。
- `IzpalaceCenter.tsx:368-372` `<a target="_blank">` 無 `rel`；「Powered by iztro」寫死、無開關。
- `locales/index.ts:27-45` en-US／ja／ko／vi 農曆字串自行拼接，不使用 iztro 2.6.2 起的本地化 `lunarDate`，格式與 iztro 不一致（例如 `2000-7-17` 對 iztro `Lunar 2000-7-17`）。
- `scripts/check-release.cjs:12-14` 無 `GITHUB_OUTPUT` 時 `appendFileSync(undefined,…)` 拋錯（只能在 CI 跑）；`package.json:19-20` `version`／`postversion` 會 `git add -A src`、`git push && git push --tags`；`prepare` 會建置。
- 無任何測試（`package.json` 無 test script，src 無測試檔）。

---

## 5. 三者網路／遙測／eval／寫入

### ziwei-chart（`app/src/**`）
- **網路（瀏覽器直連）**，全在 `lib/llm.ts`：
  - Kimi `https://api.moonshot.ai/v1`（`:35`）
  - Gemini `https://generativelanguage.googleapis.com/v1beta`（`:39`；key 在 query，`:131,378`）
  - Claude `https://api.anthropic.com/v1`（`:43`；請求頭只有 `x-api-key`、`anthropic-version`，`:148-154,471-478`，**沒有 `anthropic-dangerous-direct-browser-access`**，瀏覽器直連多半被 CORS 擋，靜態推演）
  - DeepSeek `https://api.deepseek.com/v1`（`:47`）
  - 使用者自訂 `baseUrl`（`:259,171,148`；設定頁鼓勵填中轉，`SettingsPanel.tsx:176`）
  - Tavily `https://api.tavily.com/search`，`api_key` 放 JSON body（`:68-79`）
  - 開啟聯網搜尋時，先把「第一則 user 訊息（含完整命盤上下文）」送給 LLM 抽關鍵詞（`:210-214`），再把關鍵詞送 Tavily。
- 設定頁宣稱「API Key 僅保存在你的浏览器本地，不会上传到任何服务器」（`SettingsPanel.tsx:376-378`）；實際會送往選定的 LLM 供應商／自訂中轉／Tavily。
- Kimi 內建 `$web_search`（`llm.ts:269-274`）：回應解析只吃 `delta.content`（`:340-341`），沒有 tool_calls 回圈，開啟時可能得到空回應（靜態推演）。Gemini 串流用正則 `/\{[^{}]*"text"\s*:\s*"[^"]*"[^{}]*\}/g`（`:415`），文字含跳脫引號 `\"` 或巢狀物件時抓不到。Claude `max_tokens` 4096（`:457`）對 K 線 100 年 JSON 可能被截斷→解析失敗→靜默降級亂數版（靜態推演）。
- **遙測**：Vercel Analytics（`App.tsx:7,335`）；Google Fonts preconnect 與樣式表（`app/index.html:12-14`）。
- **eval／動態執行**：無（grep `eval(`、`new Function` 無命中）；`dangerouslySetInnerHTML` 無；`react-markdown` 渲染 LLM 輸出。
- **寫入**：`localStorage`（zustand persist，`stores/index.ts:176-178`，含所有 provider 的 apiKey 與 searchApiKey 明文）；分享圖經 `<a download>` 下載 PNG（`ShareCard.tsx:123-131`）；`html2canvas` 設 `logging:true,allowTaint:true`（`:115-121`）；`console.log('Search keywords:')`（`llm.ts:221`）、多處 `console.error`。排盤失敗只 `console.error`，UI 不顯示（`BirthForm.tsx:99-101`）。
- 出生地資料為本地 JSON 動態 import（`true-solar-time.ts:122-125`），不對外查詢。
- CI：push main 時對另一個 repo 強制推送（`.github/workflows/sync-zwknows.yml:34-37`）。

### iztro（我讀的範圍）
- 函式庫 `src/**`（非測試）grep 無 `fetch/XMLHttpRequest/eval/new Function(/localStorage/sessionStorage/writeFile/process.env/document./window./navigator.`（無命中；此為 grep，非逐行讀 src）。
- `scripts/check-release.cjs`：呼叫 `npm view …`（`:29-37`，連 `registry.npmjs.org`）與 `git rev-parse`（`:20-26`），寫 `GITHUB_OUTPUT`（`:53-55`）與 `release-notes.md`（`:88`）。
- `scripts/verify-umd.cjs`：讀 `dist/*.min.js`、`vm.runInNewContext` 於沙盒執行建置產物（`:29`）。
- `examples/`：
  - `chat-api/*` 以 `IZTRO_API_KEY` 呼叫 `https://chat-api.iztro.com/v2/…`（`chat-completion.js:7`、`chat-session.js:8` 等）。
  - `fullstack-demo` 後端 Node／Python 代理轉發並串流 SSE（`server.js:31-49,71-115`；`main.py:75-87,166-211`），key 只在後端。
  - **CORS 全開**（`server.js:10` `origin:true`；`main.py:19-24` `allow_origins=["*"]`）且端點無驗證／限流，若直接上線會被盜刷額度。
  - 前端只呼叫自己的 `/api/*`，無遙測。
- `skills/iztro-release/*`：agent 指令文件，非程式。

### react-iztro
- `src/**`、`.storybook`、`scripts/`（grep `fetch(|XMLHttp|eval(|localStorage|sessionStorage|document.cookie|new Function|dangerouslySetInnerHTML|import(`）：無命中（`scripts/check-release.cjs` 的 `npm view` 與 `GITHUB_OUTPUT` 寫入不算元件）。
- 對外連結只有 `Powered by iztro` → `https://github.com/sylarlong/iztro`（`IzpalaceCenter.tsx:368-372`）。
- 副作用：載入即改寫 iztro 全域 i18next（`locales/index.ts:11-16`）。

---

## 6. 實際逐行讀完的檔案與行數；未讀

**做法聲明**：我違反了「只用 Read/Grep/Glob 與 wc」，另用 Bash 跑了 `ls/find/wc/cat/grep` 作唯讀列檔與讀小檔；沒有執行、安裝、建置任何專案程式；沒有派其他 agent。

### A. ziwei-chart（全文逐行讀完，合計 11,748 行，不含 birthplace-data.json）
- `app/src/App.tsx` 376、`main.tsx` 10、`index.css` 406
- `components/`：`AIInterpretation.tsx` 351、`BirthForm.tsx` 322、`OpenSourceLinks.tsx` 64、`SettingsPanel.tsx` 382；`chart/ChartDisplay.tsx` 444＋`index.ts` 1；`fortune/YearlyFortune.tsx` 398＋`index.ts` 1；`icons/KLineIcon.tsx` 121；`kline/EventCard.tsx` 176、`LifeKLine.tsx` 554、`ScoreRadar.tsx` 157、`index.ts` 7；`match/MatchAnalysis.tsx` 420＋`index.ts` 1；`share/ShareCard.tsx` 368＋`index.ts` 1；`ui/Button.tsx` 89、`Input.tsx` 67、`Select.tsx` 95、`index.ts` 3
- `knowledge/`：`index.ts` 415、`palaces/index.ts` 143、`sihua/index.ts` 79、`stars/majorStars.ts` 232
- `knowledge-db/`：`index.ts` 24、`schema.ts` 71、`sources.ts` 72；`entries/`：`combos` 711、`fortune` 99、`index` 35、`kline` 104、`match` 107、`palaces` 179、`principles` 192、`sihua` 118、`sihuaPalaces` 238、`stars` 201、`support` 112；`retrieval/`：`context.ts` 123、`context.test.ts` 63、`retrieve.ts` 149、`retrieve.test.ts` 280
- `lib/`：`astro.ts` 95、`birth-date.ts` 39、`fortune-score.ts` 1393、`llm.ts` 565、`true-solar-time.ts` 226、`true-solar-time.test.ts` 122
- `stores/index.ts` 180
- `app/tests/sync-zwknows.test.ts` 23
- `docs/dev/decisions.md` 71、`progress.md` 87、`project-map.md` 63、`workflow.md` 117
- `README.md` 169、`.github/workflows/sync-zwknows.yml` 37
- **只做 grep 取單點事實（不算讀完）**：`app/index.html`（字型連結）、`app/package.json`（相依版本／授權行）、`app/package-lock.json`（iztro 2.5.8 條目）。
- **未讀**：`app/src/lib/birthplace-data.json`（26,356 行，題目排除）、`app/src/assets/react.svg`（0 行）、`LICENSE`、`AGENTS.md`、`CLAUDE.md`、`docs/README.*.md`、`docs/images/*`、`.github/ISSUE_TEMPLATE/*`、`.github/PULL_REQUEST_TEMPLATE.md`、`docs/licenses/*`（僅確認存在）、`.claude/**`、`docs/superpowers`、`docs/plans`（題目排除）、lockfile 其餘部分、`app/` 下其他設定檔（vite/tsconfig/eslint）。

### B. iztro（所列範圍全文逐行讀完，合計 8,545 行，不含 example lockfile 與 png）
- `src/__tests__/`（18 檔，4,491 行）：`astro/analysis-boundaries` 92、`analyzer` 316、`astro` 1371、`body-palace` 109、`context-validation` 221、`default-options` 61、`global-language` 130、`late-rat-hour` 177、`palace-language` 78、`palace` 146、`plugin` 93；`i18n/index` 67；`star/location` 908、`star` 482；`utils/index` 117、`toJSON` 51、`validation` 63；`version` 9
- `src/data/`：`constants.ts` 176、`earthlyBranches.ts` 142、`types/astro.ts` 282、`general.ts` 22、`index.ts` 4、`palace.ts` 109、`star.ts` 25
- `scripts/`：`check-release.cjs` 99、`tests/release.test.cjs` 78、`verify-umd.cjs` 163
- `README-en_US.md` 318、`README-zh_TW.md` 386、`CHANGELOG.md` 601
- `examples/`：`chat-api/README.md` 48、`chat-completion.js` 30、`chat-session.js` 36、`chat_completion.py` 31、`chat_session.py` 44；`fullstack-demo/README.md` 83、`backend/src/server.js` 208、`backend/package.json` 16、`backend/.env.example` 3、`frontend/src/App.tsx` 356、`main.tsx` 10、`styles.css` 361、`vite-env.d.ts` 1、`vite.config.ts` 10、`index.html` 12、`package.json` 23、`tsconfig.json` 21、`.env.example` 2、`python-backend/app/main.py` 211、`app/__init__.py` 1、`requirements.txt` 4、`.env.example` 2
- `skills/iztro-release/SKILL.md` 92、`references/release-recovery.md` 41、`agents/openai.yaml` 3
- **只做 grep 取單點事實（不算讀完）**：`src/data/stars.ts`（太陽／太陰／七殺亮度三行）、`src/i18n/locales/zh-CN/palace.ts`（宮名兩行）、`package.json`（版本與依賴行）、`src/**` 非測試檔（只掃 fetch／eval／storage 等字樣，無命中）。
- **未讀**：`src/**` 函式庫實作（astro／star／utils／i18n 等，非本題範圍）、`src/data/stars.ts` 其餘、`docs/**`、`src/i18n/locales/**`（題目排除）、`README.md`（zh-CN）、`AGENTS.md`、`CONTRIBUTING.md`、`SECURITY.md`、`CODE_OF_CONDUCT.md`、`.github/**`、`webpack.config.js`、`jestconfig.json`、`examples/**/package-lock.json`、`examples/fullstack-demo/assets/chat-session-workbench.png`、`yarn.lock`。

### C. react-iztro（全文逐行讀完，`src/**`＋`.storybook`＋`scripts/` 共 2,265 行）
- `src/`：`config/types.ts` 47、`index.ts` 1、`Izpalace/`（`index.ts` 1、`Izpalace.css` 147、`Izpalace.tsx` 329、`Izpalace.type.ts` 28）、`IzpalaceCenter/`（`index.ts` 1、`Item.tsx` 18、`IzpalaceCenter.css` 129、`IzpalaceCenter.tsx` 379、`Line.tsx` 102）、`Izstar/`（`index.ts` 1、`Izstar.tsx` 103、`Izstar.type.ts` 16）、`Iztrolabe/`（`index.ts` 2、`Iztrolabe.css` 47、`Iztrolabe.stories.tsx` 116、`Iztrolabe.tsx` 218、`Iztrolabe.type.ts` 15）、`locales/`（`en-US` 30、`index` 44、`ja-JP` 30、`ko-KR` 30、`vi-VN` 30、`zh-CN` 31、`zh-TW` 30）、`theme/default.css` 242
- `.storybook/main.ts` 19、`preview.ts` 15、`scripts/check-release.cjs` 64
- 另讀 `package.json` 78 行（相依與腳本）。
- **未讀**：`README.md`、`.github/**`、`.babelrc.json`、`.eslintrc.json`、`.eslintignore`、`tsconfig.json`、`yarn.lock`、`LICENSE`。`iztro-hook`（外部相依，不在 repo）未能核對，標 † 的缺陷結論受此限制。
