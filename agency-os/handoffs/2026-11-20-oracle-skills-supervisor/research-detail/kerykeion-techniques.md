# kerykeion 預測／關係技法子目錄逐行審讀報告

- 範圍：`D:\tmp\oracle-repos\g-battaglia_kerykeion\kerykeion\` 下 35 個子目錄，93 個 .py，共 21,136 行；全部逐行讀完（清單見 §8）。
- 方法：只用 Read／Grep／wc；未執行任何 repo 程式。路徑皆相對於 `kerykeion/`。
- 子目錄外僅為查值讀了 `settings/config_constants.py:620-685`（PREDICTIVE_ACTIVE_ASPECTS、DISCEPOLO_SCORE_ACTIVE_ASPECTS）與 grep `schemas/models.py` 的 SolarPhaseThresholds；這兩檔本身未逐行讀。

## 5. 「已知」核對（先列結論）

- K1 行運「取樣點逐點算相位、可三分搜尋精修」：正確，但精修**預設關閉**（`refine_exact_moments=False`，`transits/factory.py:657`），只對 Apparent/True Geocentric 生效（`:720-729`）。行運本身**沒有取樣間隔預設**，取樣由 `EphemerisDataFactory` 決定，其預設 `step_type="days", step=1`（`ephemeris_data/factory.py:201-202`）＝1 天；預設 orb 為 3°（`settings/config_constants.py:620-626`），程式自己警告月亮需 ≤~5.5 小時步長（`transits/factory.py:20-28,540-556`）。
- K2 合盤「Discepolo ≤2° 給 11 分其餘 8 分」：**不完整／部分錯**。11/8 只適用特定三種接觸（v1：日日合／沖／刑、日月合，`relationship_score/factory.py:214-250`）；其他接觸一律 4 分，同屬性太陽（destiny sign）+5。v2 更不同：日日**合相**只給 +4，11/8 只給日日刑／沖與日月合（`relationship_score/v2/calculator.py:152-158`），且日日刑沖得分時取消 destiny +5（`:262-264`）。兩版 orb 也不同：v1 六合 4°（`settings/config_constants.py:677`），v2 六合 3°（`v2/calculator.py:45`）。
- K3 組合盤「中點與 Davison」：正確。補充：Davison 緯度是算術平均、經度是圓平均（`composite_subject/factory.py:1317-1318`），時間取兩 JD 平均（`:1314`）。
- K4 回歸「呼叫後端 solcross/mooncross」：正確（`planetary_returns/factory.py:935,952,969,986`）；另有日心回歸 `helio_cross_ut`（`:1349,1361`）與月亮過交點 `mooncross_node_ut`（`:1418,1430`）。
- K5 次限「一日一年、一年 365.24219 天」：正確（`secondary_progressions/factory.py:51,244-255`）。補充：推進後的上升／天頂用「Q2／daily houses」＝推進當日真實天空的角點（每年約 360°），**不是** astro.com 預設的太陽弧推 MC（`:131-144`）。
- K6 主導星 orb「合沖 10、拱刑 8、六合 6、梅花 3、其他 2」：正確（`dominants/data.py:203-215`）。
- K7 月亮空亡「七顆古典行星的五種托勒密相位」：**小誤**。受相位對象是 6 顆（日水金火木土，月亮本身除外，`void_of_course_moon/utils.py:34`）；五種托勒密相位正確（`:37-43`）。判定只看**精確成相**（無容許度），不是 Lilly 式 orb。

## 1. 各子目錄：功能／API／演算法／寫死數值

### transits（1,161 行）
- 功能：本命 vs 時間序列行運。API：`TransitsTimeRangeFactory(natal, ephemeris_data_points, active_points=None, active_aspects=None, settings_file=None, *, axis_orb_limit=None)`；`.get_transit_moments(include_subjects=False)`、`.get_transit_events(*, refine_exact_moments=False, refinement_iterations=21)`（`transits/factory.py:229-238,558,656-658`）。
- 演算法：每個取樣點 `AspectsFactory.dual_chart_aspects(ephemeris_point, natal, first_subject_is_fixed=False, second_subject_is_fixed=True)`（`:628-638`）。
- 數值：預設相位 `PREDICTIVE_ACTIVE_ASPECTS`＝合／沖／拱／六合／刑各 orb 3°（`settings/config_constants.py:620-626`）；欠取樣警告用平均日速表 Moon 13.2、Mercury 1.4、Venus 1.2、Sun 1.0、Mars 0.52、Jupiter 0.083、Saturn 0.033、Uranus 0.012、Neptune 0.006、Pluto 0.004（`:97-108`），門檻 = 最緊 orb ÷ 最快速度（`:536-541`）；分段門檻 1.5×中位步長（`:944`）；精修 21 次三分（`:658,966`）。
- 詳見 §2。

### relationship_score（883 行）
- API v1：`RelationshipScoreFactory(first, second, use_only_major_aspects=True, *, axis_orb_limit=None).get_relationship_score()`（`relationship_score/factory.py:112-119,343`）。API v2：`RelationshipScoreFactoryV2(first, second)`、純函式 `score_positions(first, second, *, subject_names)`（`v2/factory.py:31-63`，`v2/calculator.py:235-240`）。
- 詳見 §3。

### composite_subject（1,455 行）
- API：`CompositeSubjectFactory(first, second, chart_name=None, house_anchor="auto")`；`.get_midpoint_composite_subject_model()`、`.get_davison_composite_subject_model(*, custom_ayanamsa_t0, custom_ayanamsa_ayan_t0)`；模組函式 `composite_frame`、`composite_house_cusps`、`place_on_composite_frame`（`composite_subject/factory.py:179,492,509,638-644,1234,1277`）。
- 中點盤：行星＝`circular_mean`（短弧中點）（`:1130-1133`）；宮頭＝同號宮頭各取中點、不重排（`:251-253,885-890`）；宮頭圈不成 360° 時以「固定一個角點的中點、其他宮頭依同一框架取近／遠中點」修復（`:300-319,386-397`）；`house_anchor` auto 取兩盤該角點較接近者（`:305-318`）；對宮頭對、DSC/IC、南交點一律由對點 +180° 推導（`:279-296,1007-1008,1077-1125`）；結果標 `house_frame` = anchored／midpoints／gapped（`:924-929`）。
- 判斷容差：「是否對宮」<1e-9（`:146`）；旋轉判斷用 >90°（`:454`）。
- Davison：時間 `(jd1+jd2)/2`，緯度算術平均，經度圓平均，於該時地重新起盤（`:1314-1318,1405-1425`）；豐富化旗標兩盤都有才開（`:1345-1401`）。
- 前置：兩盤 zodiac／sidereal／宮制／宮制名稱／perspective 必須相同（`:718-752`），中點盤另要求實際生效宮制相同（`:1198-1209`）。

### house_comparison（306 行）
- API：`HouseComparisonFactory(first, second, active_points=DEFAULT_ACTIVE_POINTS).get_house_comparison()`（`house_comparison/factory.py:51-56,86`）。
- 演算法：A 的點落 B 宮、B 的點落 A 宮、雙方宮頭互投（`house_comparison/utils.py:20-100,103-165`）。**無任何計分**；只要求同參考框架，宮制可不同（`factory.py:72-77`）。

### dominants（2,233 行）
- API：`DominantsFactory.from_subject(subject, *, strategy="modern"|"almuten_figuris"|"elemental"|自訂, active_points, distribution_method="weighted", custom_weights, include_accidental_dignities=False, include_score_breakdown=False)`、`.from_birth_data(...)`、`.available_methods()`（`dominants/factory.py:60-71,108-125,161-164`）。
- modern（Astrotheme 風格近似，`dominants/strategies/modern.py`）：行星分＝角度近接＋相位活躍＋輕度尊貴＋守護（`:138-144`）。
  - 角度：orb 15°，滿分 4，線性衰減；權重 ASC 1.00／MC 0.80／DSC 0.60／IC 0.50（`dominants/data.py:152-166`，`modern.py:183-187`）。
  - 相位：基數 3.0 × 類型強度 × (1−|orb|/orb上限) × 兩體速度級平均 ×（對角點 1.5）（`data.py:176-180`，`modern.py:245-258`）。類型強度：合 1.00、沖 0.85、拱 0.85、刑 0.60、六合 0.50、梅花 0.30、半刑 0.20、補八分 0.20、半六合 0.15、五分 0.15、倍五分 0.15（`data.py:185-197`）。orb：合沖 10、拱刑 8、六合 6、梅花 3、半六合／半刑／補八分／五分／倍五分 2（`data.py:203-215`）。速度級：Moon 1.00；Mercury／Venus／Sun 0.90；Mars 0.80；Jupiter 0.60；Saturn 0.55；Uranus 0.35；Neptune／Pluto 0.30；四角 0.90；平均／真北交、Chiron 0.40；其他 0.30（`data.py:226-247`）。
  - 尊貴（輕度）：廟 1.00、旺 0.75、三分 0.40、界 0.25、面 0.15、遊走 0、陷 −1.00、落 −0.75；最高尊貴加分＋陷落另外疊加扣分（`data.py:266-275`，`modern.py:299-310`）。
  - 守護（現代守護，天蠍＝冥王、水瓶＝天王、雙魚＝海王）：ASC 主 3.0、MC 主 2.0、太陽星座主 1.5、月亮星座主 1.0（`data.py:110-123,285-288`）。
  - 衍生：主導行星前 3、星座前 3、宮位前 3；上升星座固定 +3.0（`data.py:296-304`）；宮頭星座由主導星守護者加該星分 ×0.5（`modern.py:405-407`）；東半球＝10–3 宮（`modern.py:87`）。
- almuten_figuris：五個 hylegiacal 點（日、月、ASC、福點、產前朔望）各計廟 5／旺 4／三分 3（只取當令者）／界 2／面 1（`data.py:312-323`，`strategies/almuten_figuris.py:166-184`）。選配偶然尊貴：宮位分 1宮12、10宮11、7宮10、4宮9、11宮8、5宮7、2宮6、9宮5、8宮4、3宮3、12宮2、6宮1；日主 +7（`data.py:327-343`）；日主以出生地民用日期、午夜換日（非日出），註明為刻意簡化（`almuten_figuris.py:217-247`）。平手：總分→本質分→廟旺次數→土木火日金水月順序（`:250-272`，`data.py:133`）。
  - 產前朔望：依出生時日月距角判新月／滿月，±3 天包夾後二分 60 次（`dominants/utils.py:339-370`）；滿月取「出生時在地平上」的發光體（`:384-385`）；朔望月 29.530588853 天（`:296`）。福點：日 `ASC+月−日`、夜 `ASC+日−月`（`:220-224`）。
- elemental：直接呼叫 `charts.utils.calculate_element_points/calculate_quality_points`（含恆星）（`strategies/elemental.py:92-107`）；陰陽：火風陽、土水陰（`data.py:74-79`）。

### dignities（456 行）
- API：`calculate_essential_dignity(planet_name, sign, element, position, is_diurnal)`、`get_domicile_ruler`、`get_exaltation_ruler`、`get_triplicity_lords(element, is_diurnal)`（`dignities/__init__.py:4-13`）。
- 分數：廟 +5、陷 −5、旺 +4、落 −4、三分（只當令）+3、界 +2、面 +1；`dignity_score` 為淨和，標籤取最高正尊貴，否則陷／落（`dignities/factory.py:86-142`）。
- 表：守護（傳統，`data.py:22-35`）、陷（`:40-53`）、旺與旺度數（日♈19、月♉3、木♋15、水♍15、土♎21、火♑28、金♓27；度數未被使用，`:59-73`）、落（`:78-91`）、Dorothean 三分主（火：日／木／土；土：金／月／火；風：土／水／木；水：金／火／月，日／夜／共管，`:103-109`）、埃及界（`:122-135`，已逐格對過標準埃及界，無誤）、迦勒底面（自牡羊起 火日金水月土木循環，`:143-152`）。界度數以 `floor(position)` 查（`factory.py:56-59`）。

### receptions（122 行）
- API：`MutualReceptionsFactory.from_subject(subject)`（`receptions/factory.py:45-46`）。只看 7 顆古典行星的廟互容與旺互容（`:22-30,85-109`）；拒絕非地心框架（`:64-71`）。無三分／界／面互容。

### horary（191 行）
- API：`HoraryIndicatorsFactory.from_subject(subject, *, is_moon_void=None)`（`horary/factory.py:96-102`）。
- 規則：問者＝1 宮主、所問＝**固定 7 宮**主（傳統守護）（`:64-81,173-176`）；ASC 度數 <3°「太早」、≥27°「太晚」（`:54-55,146-158`）；月亮空亡由呼叫端提供（`:160-163`）；土星在 1 宮或 7 宮列警示（`:165-171`）；附互容（`:178`）。無 via combusta、月亮晚度、其他宮位轉宮。

### firdaria（227 行）
- API：`FirdariaFactory.from_subject(subject, *, target_date=None, life_cap_years=120)`（`firdaria/factory.py:93-100`）。
- 年＝365.25 天（Julian year，`:30`）。日間序列：日10 金8 水13 月9 土11 木12 火7 北交3 南交2；夜間：月9 土11 木12 火7 日10 金8 水13 北交3 南交2（`:34-55`），合計 75 年循環展到 120 歲（`:74`）。小限：除交點外每段均分 7 份，自本段主起依序列順（＝迦勒底順）輪轉（`:166-180`）。需要布林 `is_diurnal`（`:120-126`）。

### profections（179 行）
- API：`ProfectionsFactory.from_subject(subject, *, target_date=None, years_before=3, years_after=4)`（`profections/factory.py:79-87`）。宮＝`(age % 12)+1`，星座取**該宮宮頭**星座（不是由上升整宮數），年主＝傳統守護（`:153-159`）；2/29 生日平年改 3/1（`:48-59`）。

### zodiacal_releasing（312 行）
- API：`ZodiacalReleasingFactory.from_subject(subject, *, lot="fortune"|"spirit", levels=2(1–4), target_date=None, life_cap_years=100)`（`zodiacal_releasing/factory.py:192-201,224`）。
- 小年（Valens）：♈15 ♉8 ♊20 ♋25 ♌19 ♍20 ♎8 ♏15 ♐12 ♑27 ♒30 ♓12（`:30-43`）；年＝365.2422 天（`:52`）；L(n) 單位＝年/12^(n−1)（`:132`）；L1/L2 全展，L3+ 只展目標日路徑（`:148`）。
- 解縛（LoB）：回到本輪起始星座時改跳對宮並標記（`:83-101`）；巔峰（angular）恆以**福點**星座起算 1/4/7/10（`:160,234-245`）。精神點：日 `ASC+日−月`、夜 `ASC+月−日`（`:73-76`）。

### vedic（132 行）
- API：`calculate_nakshatra(abs_pos)`（`vedic/nakshatra_utils.py:23`）。27 宿各 13°20′、4 pada 各 3°20′（`nakshatra_data.py:58-59`）；以 108 pada 整數索引計算（`nakshatra_utils.py:47-52`）；Vimsottari 主星序 Ketu, Venus, Sun, Moon, Mars, Rahu, Jupiter, Saturn, Mercury 循環（`nakshatra_data.py:20-23,62-64`）。本身不套 ayanamsa（`nakshatra_utils.py:9-15`）。**無大運（dasha）年數／期間計算**。

### motion（150 行）
- API：`classify_motion_state(point_name, speed, *, speed_sampler=None)`（`motion/state.py:62-67`）。平均日速 Sun 0.9856、Moon 13.176、Mercury 1.383、Venus 1.2、Mars 0.524、Jupiter 0.083、Saturn 0.033、Uranus 0.012、Neptune 0.006、Pluto 0.004（`:37-48`）；|v|<5% 平均＝留，<0 逆行，>120% 快，<80% 慢（`:51-53,103-118`）；第二樣本取 +1 天判 SR/SD（`:59,104-110`）。

### predictive（177 行）
- 共用：`PTOLEMAIC_ASPECTS`、`jd_to_ymd_hms`（四捨五入到秒、跨午夜進位）、`jd_to_iso_utc`、`gather_active_points`、`build_aspect_settings(orb, filter)`（統一 orb 覆寫）（`predictive/utils.py:18-20,63-161`）。

### secondary_progressions（1,129 行）
- API：`SecondaryProgressionFactory.compute(natal, *, target_iso_utc_datetime | target_year, progressed_subject_name)`、`.compute_full(..., aspect_orb=3.0, aspects=None→托勒密五相, point_orb_adjustments=None)`（`secondary_progressions/factory.py:320-326,476-488`）；`SolarArcFactory.compute(..., aspect_orb=3.0)`、`.compute_directed_subject(...)`（`solar_arc.py:155-166,368-373`）。
- 次限：`progressed_jd = birth + (target−birth)/365.24219`（`factory.py:254-255`）；於出生地重新起完整盤（`:380-440`）；BCE 走 LMT（`:442-473`）。
- 太陽弧：弧＝推進太陽 − 本命太陽（順行方向 0–360）（`solar_arc.py:337-341`）；所有點（含四角）加同一弧，宮頭不動（`:350-365,405-461`）；推進速度＝推進太陽速度/365.24219（`:392`）；同名點自合相在弧接近 0 時略過（`:263-287`）。

### planetary_returns（1,746 行）
- API：`PlanetaryReturnFactory(subject, city, nation, lng, lat, tz_str, online=True, geonames_username, *, cache_expire_after_days, altitude, custom_ayanamsa_*, 豐富化旗標...)`；`next_return_from_iso_formatted_time(iso, "Solar"|"Lunar", backwards)`、`next_return_from_date(y,m,d,*,return_type,backwards)`、（已棄用）`next_return_from_year`、`next_return_from_month_and_year`；`next_heliocentric_return(planet, start_jd, backwards)` 及 `_from_iso/_from_year/_from_date`；`next_lunar_node_crossing(...)` 及 wrappers（`planetary_returns/factory.py:440-468,764,1077,1174,1249,1274,1395,1455-1615`）。
- 演算法：在本命同 zodiac/perspective（拓樸時用回歸地點）下呼叫 `solcross_ut`／`mooncross_ut`（`:913-997`）；ISO 起點以整秒排序（向前從下一秒起，`:263-314`）；向後搜尋補查起點前一秒的過點（`:999-1015`）；日心回歸在解答 ±60 秒內二分到 0.1 ms（`:357,1378-1382`）；回歸盤以**整秒**重建（`:1619-1628`）；BCE 不支援（`:1017-1028`）。
- 寫死：重啟逃離距離 1/24 天（`:341`）；過點弧上限 90°（`:354`）；二分解析 1e-4 秒（`:357`）。

### moon_phase_details（1,666 行）
- API：`MoonPhaseDetailsFactory.from_subject(subject, *, using_default_location=False, location_precision=0)`（`moon_phase_details/factory.py:670-677`）。
- 數值：朔望月 29.530588853（`:94`）；照明度 `0.5(1−cos 日月黃經差)`（`:593`）；月齡＝距上次新月實際時間（`:603-608`）；四主相以日月距角 0/90/180/270 二分（`:221-226`，utils `compute_lunar_phase_jd`：逐日包夾 31 天＋二分 1 秒，`utils.py:520-580`）；日出入標準大氣 1013.25 hPa、15°C（`utils.py:63-64`）；太陽正午＝上中天而非日出入中點（`utils.py:291-344`）；GMST 公式（`utils.py:592-599`）。

### sun_times（660 行）
- API：`SunTimesFactory.from_date(y,m,d,*,latitude,longitude,tz_str)`（`sun_times/factory.py:42-52`）。日出入＝折射後上緣；極晝／極夜判別用 −0.833°（`utils.py:61,305-344`）；晨昏線 −6/−12/−18°（`utils.py:483-544`）；跨午夜時以下一個日落配對，day_length 可 >24h（`utils.py:382-397`）。

### planetary_hours（288 行）
- API：`PlanetaryHoursFactory.from_datetime(y,m,d,h,mi,*,latitude,longitude,tz_str)`（`planetary_hours/factory.py:70-82`）。日出→日落 12 等分、日落→次日日出 12 等分；首時主＝星期主（月火水木金土日），之後依迦勒底序（土木火日金水月）（`utils.py:20-41,78-110`）；日出前屬前一日（`factory.py:129-135`）；極區拋例外（`:15-17`）。

### lunations（323 行）
- API：`LunationFinderFactory.from_iso_range(start, end, phases=None, zodiac_type, sidereal_mode)`、`.from_julian_day(...)`（`lunations/factory.py:152-159,191-198`）。每相獨立用 `compute_lunar_phase_jd` 前進，命中後 +15 天（`:52,245-283`）；真實命中驗證容差 0.01°（`:59,281`）；上限 20 萬次（`:55`）。

### void_of_course_moon（615 行）
- API：`VoidOfCourseMoonFactory.from_datetime(y,m,d,h,mi,*,tz_str,zodiac_type,sidereal_mode)`、`.from_iso_range(start, end, ...)`（`void_of_course_moon/factory.py:104-116,171-179`）。
- 演算法：月亮進出星座時刻用牛頓法（`utils.py:88-97`）；6 顆對象 × 五相（四分相、六合、拱取 ±）以線性種子 ×3 wrap 後牛頓（`:145-166`）；空亡起點＝本座最後一次精確相位，終點＝入下一座（`:244-250,299-309`）；整座無相位則全座空亡（`:248-250`）。牛頓收斂 1e-5°、最多 6 次（`:51-52`）；月平均速 13.176（`:55`）。

### sign_ingresses（647 行）
- API：`SignIngressFactory.from_iso_range/from_julian_day(start,end,planets=None,zodiac_type,sidereal_mode)`、`sign_periods_from_iso_range/from_julian_day(...)`（`sign_ingresses/factory.py:396-534`）。預設日～冥（月亮選配，`:45-52`）；取樣步長（天）Moon 0.5、Sun 3、Mercury 0.5、Venus 1、Mars 2、Jupiter 4、Saturn 5、Uranus／Neptune／Pluto 7（`:65-76`）；中點探測細分到 15 分鐘、深 8（`:87-88`）；二分 27 次（`:79`）；邊界容差 0.05 秒（`:307`）；季節標記只在回歸黃道太陽 0/90/180/270（`:235-240,625-627`）。

### ephemeris_data（616 行）
- API：`EphemerisDataFactory(start, end, step_type="days", step=1, lat=51.4769, lng=0.0005, tz_str="Etc/UTC", is_dst=False, zodiac_type, sidereal_mode, houses_system_identifier, perspective_type, max_days=730, max_hours=8760, max_minutes=525600, custom_ayanamsa_*, active_points, active_fixed_stars, altitude, calculate_dignities)`；`.get_ephemeris_data(as_model)`、`.iter_ephemeris_data(...)`、`.get_ephemeris_data_as_astrological_subjects()`（`ephemeris_data/factory.py:197-223,382,455,494`）。日步長依當地日曆日、時／分步長依 UTC（`:259-336`）；>1000 點警告（`:341-342`）。

### primary_directions（606 行）
- API：`PrimaryDirectionsFactory.compute(subject, *, max_years=100, rate_key="ptolemy"|"naibod", aspects=None)`、`.compute_speculum(subject)`（`primary_directions/factory.py:168-175,336`）。
- 方法：Placidus 半弧「under the pole」，引 Gansten《Primary Directions》（`:5-8`）；點：日月水金火木土＋ASC、MC（`:157-158`）；相位 0/60/90/120/180，非 0/180 取左右兩點（`:160-166,273-277`）；黃道上相位點（緯度 0）（`:270-285`）；弧＝OA/OD 差；**逆向（converse）＝360−順向弧，明言是近似**（`:36-43,308-317`）；年數 Ptolemy 1°/年、Naibod 0.98564°/年（`:222`）；只保留 0.1 < 年 ≤ max_years（`:321`）。容差：子午線 1e-6、地平 1e-10（`:106,111`）。

### heliacal（587 行）
- API：`HeliacalFactory(ephe_path=None).next_heliacal_rising(jd, planet_or_star, geopos|lat/lng/altitude, atmo, observer)`、`.search_events(jd, geopos, count=5, planets, event_types, ...)`（`heliacal/factory.py:250-268,346-359`）。包 `ephe.heliacal_ut`（`:532-540`）。預設大氣 1013.25 hPa／15°C／濕度 40%／消光 0.2；觀測者 36 歲、Snellen 1、裸眼（`:91-110`）；行星：水金火木土；EVENING_FIRST/MORNING_LAST 只給水金（`:113-116,443-448`）；count 上限 200（`:408`）。

### retrograde_stations（585 行）
- API：`RetrogradeStationFactory.from_iso_range/from_julian_day(...)`、`retrograde_periods_from_iso_range/from_julian_day(...)`（`retrograde_stations/factory.py:303-494`）。預設水～冥 8 顆、Chiron 選配（`:48-56`）；速度取樣步 7 天、二分 30 次、邊界容差 0.05 秒（`:61-76`）；速度一律回歸黃道計算（`:43,112-124`）。

### eclipses（545 行）
- API：`EclipseFactory.search_from_location(lat, lng, start_year=None, count=5, ...)`、`.search_global(start_year=None, count=10, ...)`（`eclipses/factory.py:293-301,356-362`）。包 `sol_eclipse_when_loc/glob`、`lun_eclipse_when(_loc)`；每次 +10 天前進（`:435,467,497,528`）；count 上限 1,000（`:35`）；Saros 只在 libephemeris 有、Inex 刻意恆 None（`:143-169`）。

### mundane_aspects（534 行）
- API：`MundaneAspectFactory.from_iso_range/from_julian_day(start, end, points=None, aspects=None, ...)`（`mundane_aspects/factory.py:144-195`）。預設日～冥（月亮選配，`:57-59`），預設五托勒密相（`:69`）；固定 6 小時網格＋二分 27 次（`utils.py:37-40`）；相對速度變號時中點細分至深 2（`utils.py:47,141-155`）；以 pair+相位+秒去重（`utils.py:243-247`）。

### fixed_stars（522 行）
- API：`FixedStarCatalog.list_all/count/find/is_known_name/known_slugs`、`FixedStarDiscoveryFactory.find_prominent_stars(subject, orb=1.0)`（`fixed_stars/catalog.py:132-173`，`fixed_stars/factory.py:180-184`）。只找**合相**、預設 orb 1°，按星等排序（`factory.py:66-79,158,328`）。星表來自 libephemeris，不用 sefstars.txt（`catalog.py:10,113-129`）。

### relocated_chart（484 行）
- API：`RelocatedChartFactory.relocate(subject, new_lat, new_lng, new_city, new_nation, new_tz_str)`（`relocated_chart/factory.py:135-143`）。行星不動，重算宮頭／四角／宿命點、日夜（以新地點）、尊貴（三分依新日夜）、ASC 系阿拉伯點；拓樸盤拒絕（`:166-173,194-470`）。

### occultations（354 行）
- API：`OccultationFactory().search_global(jd, planet, count=5)`、`.search_local(jd, planet, lat, lng, count=5)`（`occultations/factory.py:198-203,268-275`）。可掩星體白名單（含 Sun、四小行星、Chiron、Pholus）（`:91-94`）；每次 +1 天（`:260,341`）；上限 1,000（`:51`）。

### planetary_nodes（334 行）
- API：`PlanetaryNodesFactory.from_subject(subject, method="mean"|"osculating", planets=None)`、`.from_julian_day(...)`（`planetary_nodes/factory.py:154-207`）。`nod_aps_ut` 以回歸黃道計算再減 ayanamsa（`:270-286`）；不支援太陽（`:238-243`）；月亮遠地點＝黑月莉莉絲（`:53-58`）。

### astro_cartography（325 行）
- API：`AstroCartographyFactory.compute(subject, *, step=1.0, tolerance=None(未用), lat_range=(-66,66), planets=None)`（`astro_cartography/factory.py:93-101`）。MC 線＝RA−GST，IC＝對子午線；ASC/DSC 解 `cos H = −tan φ tan δ`，幾何地平、不計折射（`:271-300`）；點數上限 1,000,000（`:91`）。

### midpoints（303 行）
- API：`MidpointFactory.compute(subject, *, active_points=None, compute_aspects=True, aspect_orb=1.0, aspects=None)`、`.compute_active_midpoint_points(subject, pair_names)`（`midpoints/factory.py:107-115,186-189`）。短弧中點（`:86-94`）、90° 盤＝`lon % 90`（`:179`）；對中點相位預設全部預設相位、orb 1°（`:113-114,138`）。

### planetary_phenomena（283 行）
- API：`PlanetaryPhenomenaFactory.from_subject(subject, planets=None, solar_phase_thresholds=None)`、`.from_julian_day(...)`、`classify_solar_phase(elong, thresholds)`（`planetary_phenomena/factory.py:49,91-148`）。cazimi 0.2833° / combust 8.5° / under the beams 17°（docstring 所述預設，`:102,137`；值定義在 schemas，本次未逐行讀）；用真實角距而非黃經差（`:55-60`）；晨星／昏星只看黃經差符號（`:222-244`）。

## 2. 行運（transits）細節

- 取樣間隔預設：本工廠不取樣；預設由 `EphemerisDataFactory` 決定＝每 1 天（`ephemeris_data/factory.py:201-202`）。模組 `__main__` 範例用 4 小時（`transits/factory.py:1121-1132`）。月亮 3° orb 下建議 ≤5.5 小時，否則發 warning（`:502-556`）。
- 事件化：以 (p1, p2, aspect) 為軌（`:700-707`）；軌內相鄰樣本間隔 >1.5×中位步長即切段（`:922-957`）；每段再找局部最小 orb，每個局部最小＝一次精確通過（`:738-747,867-919`）→ **逆行三次通過即使全程不出 orb 也會拆成多個事件**；平台（同值連續）只算一次（`:904-915`）。
- 精修：三分搜尋（每輪捨去較差的 1/3，非二分），預設 21 輪（≈(2/3)^21≈1/4990），最後再取中點一次（`:1070-1102`）；包夾為最小值前後樣本，若最小值在段邊界則外推一步、但不越出整體範圍（`:770-800`）；只在精修後 orb 更小時採用（`:815-816`）；目標函數 `| |difdeg2n(行運, 本命)| − 相位角 |`（`:1065-1068`）；只支援 STANDARD_PLANETS 與 TNO 的行運體（`:1031-1037`）。
- 輸出：`TransitsTimeRangeModel{dates, subject, transits[TransitMomentModel{date, aspects, subject?}]}`（`:640-654`）；`TransitEventsTimeRangeModel{events[TransitEventModel{p1_name, p2_name, aspect, applying_start, exact_moment, separating_end, min_orb, orb_rate}], subject}`（`:843-865`）。`applying_start`／`separating_end` 在範圍邊界截斷或取樣不足時為 None；多次通過中，入相起點只給第一個、出相終點只給最後一個（`:818-841`）。`orb_rate`＝最小值後一樣本的 orb 變化率（度/日），以粗樣本計（`:753-762`）。
- 防呆：框架不符、時間序不遞增、點只在單邊存在都只發 warning（`:404-448,374-402,296-372`）。

## 3. 合盤計分規則與出處

### v1（`relationship_score/factory.py`）
| 規則 | 條件 | 分數 | 行號 |
|---|---|---|---|
| destiny_sign | 兩人太陽星座同模式（本位／固定／變動） | +5 | `:60,150-171` |
| sun_sun_major | 日日 合／沖／刑；orb ≤2° | 11，否則 8 | `:61-63,214-233` |
| sun_moon_conjunction | 日月（任一方向）合；orb ≤2° | 11，否則 8 | `:235-250` |
| sun_sun_minor | 日日其他相位 | 4 | `:64,252-268` |
| sun_moon_other | 日月非合相 | 4 | `:270-282` |
| sun_ascendant | 日–上升任意相位 | 4 | `:65,284-299` |
| moon_ascendant | 月–上升任意相位 | 4 | `:66,301-316` |
| venus_mars | 金–火任意相位 | 4 | `:67,318-330` |
- 相位 orb（Discepolo 專用）：合 8、半六合 2、半刑 2、六合 4、刑 5、拱 7、補八分 2、沖 8（`settings/config_constants.py:673-682`）；預設 `use_only_major_aspects=True` 會濾掉半六合／半刑／補八分（`factory.py:110,183-184`）。
- 等級：<5 Minimal、<10 Medium、<15 Important、<20 Very Important、<30 Exceptional、≥30 Rare Exceptional（`:101-108,338-341`）。
- 無月月、上升上升、太陽–對方上升以外的組合。

### v2（`relationship_score/v2/calculator.py`）
- 只吃 5 個回歸地心黃經：日、月、上升、金、火（`:18-19`，`v2/factory.py:16-17`）。
- 距離量化：`floor(|a−b|)`，>190 取 360−（`:118-133`）；邊界含等號（`:140`）；依序比對第一個符合的相位：合 8、半六合 2、半刑 2、六合 3、刑 5、拱 7、補八分 2、沖 8（`:41-50`）。
- 九組「發光體」對（日月升 × 日月升，含月月、升升）一律 +4，例外：日日刑／沖、日月合依量化 orb ≤2 給 11 否則 8（取代 +4 不疊加）（`:145-158,179-189`）；金火雙向各 +4（`:192-201`）；太陽同模式 +5，但日日刑沖已拿特殊分時取消（`:259-264`）；無上限（`:246-248`）。
- `reference_verified=False`：作者自承未與參考輸出驗證（`v2/models.py:31-47`）。

### house_comparison／composite_subject
- 皆無計分（見 §1）。

### 出處
- v1 註明「Ciro Discepolo 方法」並附 URL `http://www.cirodiscepolo.it/Articoli/Discepoloele.htm`（`relationship_score/factory.py:6,37-38,97-98`），無書名。v2 未註明出處，僅寫「Discepolo」（`v2/calculator.py:1`，`__init__.py:5`）。
- 組合盤中點法引 Townley（未給書名，`composite_subject/factory.py:221-222`）、Solar Fire／Kepler／Sirius 軟體做法（`:202-206,307`）；Davison 未註出處。

## 4. 傳統與表格來源標示

- dignities：標 Ptolemy《Tetrabiblos》、Lilly《Christian Astrology》(1647)、Robert Hand《Night & Day》(2009)（`dignities/data.py:4-7`）；界明言用埃及界（Dorotheus/Valens，Lilly 亦印），刻意不用 Ptolemy 界（`:112-120`）；三分主明言 Dorothean 三主制、計分只取當令（`:93-102`）。**矛盾**：模組自稱「Ptolemaic scoring system」（`dignities/factory.py:5`），但三分主與界都不是 Ptolemy 版。
- receptions：未標出處（`receptions/factory.py:1-4`）。
- horary：未標出處；度數門檻稱「classical」（`horary/factory.py:52-55`）。
- firdaria：只稱「Persian time-lord technique」（`firdaria/__init__.py:2`）；年長選 Julian year 的理由是「與常見兩層實作對齊」（`firdaria/factory.py:26-30`）；無書名；交點放在夜間序列最後（Abu Ma'shar 式），未提 Bonatti 異說。
- zodiacal_releasing：標 Vettius Valens（小年）與 Brennan《Hellenistic Astrology》（巔峰以福點起算）（`zodiacal_releasing/factory.py:28,121-123,234-236`）；另附 kerykeion.net 文件連結（`:5`）。
- profections：只稱 Hellenistic，附 kerykeion.net 連結（`profections/factory.py:4-6`，`__init__.py:2`）。
- vedic：標 B.V. Raman《Hindu Predictive Astrology》、K.S. Charak《Elements of Vedic Astrology》（`vedic/nakshatra_data.py:12-15`）。
- dominants：modern 明言為 Astrotheme 公開準則的近似、點數自訂（`dominants/data.py:11-19`）；Almuten 引 kerykeion.net 與托勒密尊貴分（`data.py:16-19`，`almuten_figuris.py:17`）；偶然尊貴稱「common traditional scheme」無出處（`data.py:325-326`）。
- primary_directions：標 Gansten《Primary Directions》（`primary_directions/factory.py:7-8`）。

## 6. 網路、檔案寫入、eval/exec、子程序

- 網路：`PlanetaryReturnFactory` 預設 `online=True`，缺座標或時區時呼叫 `FetchGeonames`（Geonames API，`planetary_returns/factory.py:448,735-747`），未給帳號用 `DEFAULT_GEONAMES_USERNAME` 並警告（`:688-690`）；`__main__` 寫死帳號 `"century.boy"`（`:1694`）。其他子目錄無網路呼叫。
- 動態匯入：`relationship_score/__init__.py:12,26`（lazy `import_module(".v2.models")`）；`heliacal/factory.py:50`（只在 libephemeris v3 時 import skyfield）；`fixed_stars/catalog.py:116`（import libephemeris）。
- 檔案寫入、eval、exec、subprocess、pickle：grep 全範圍零命中。Geonames 快取寫入在 `geonames/`（範圍外，未讀）。
- 星表警告訊息含外部 URL（只是文字，`fixed_stars/factory.py:313-321`）。

## 7. 缺陷／與註解不符

- D1 `sun_times/utils.py:463-469`：晨昏線 `_next_event_jd` 只接 `RuntimeError`；同庫另一處明言「no backend raises RuntimeError」要接 `ephe.Error`（`moon_phase_details/utils.py:35-41`）。後端拋 `swisseph.Error`／libephemeris `Error` 時會直接冒出，`SunTimesFactory` 與 `PlanetaryHoursFactory`（不用晨昏線，不受影響）不一致。
- D2 DST 回撥時「午夜發生兩次」的取法不一致：`sun_times/utils.py:239-244` 取較小偏移（後者），`moon_phase_details/factory.py:256-261` 明言應取較大偏移（前者）且稱前者寫法是 bug。同一天兩模組的日界差 1 小時。
- D3 `transits/factory.py:889-894` 註解前後顛倒：「下一個樣本較低＝前一次通過的出相尾巴」，實際 orb 遞減是入相；程式邏輯本身合理，註解誤導。
- D4 `transits/factory.py:779-800`：精修外推包夾用 `datetime.fromisoformat`，BCE 時為 None 即放棄精修；`_refine_exact_moment` 也用 `fromisoformat`（`:1017-1018`），BCE 一律不精修，與其他處「BCE-safe」設計不一致（只是退化，非錯值）。
- D5 relationship_score v1 與 v2 規則不同（日日合相 8/11 vs 4；六合 orb 4 vs 3；v2 多月月、升升、太陽–上升對稱九組；v2 destiny 可被取消），同名「Discepolo」兩套分數；v2 自標 `reference_verified=False`（`v2/models.py:47`）。
- D6 `house_comparison/utils.py:74-77`：點投宮未接 `ValueError`，宮頭投宮卻有接（`:140-145`）；對方若是有缺口的宮頭圈（極區、組合盤 gapped）點投宮會整個拋錯。
- D7 `dignities/data.py:20`：註解「Traditional + modern rulerships」，表內只有傳統守護。`dignities/factory.py:5` 自稱 Ptolemaic，實用 Dorothean 三分＋埃及界（見 §4）。旺度數欄位從未被使用（`data.py:59-73`）。
- D8 `retrograde_stations/factory.py:45-46,54-55`：註解說預設「seven」顆，實際 8 顆（水～冥）。
- D9 `lunations/factory.py:10-12`：docstring 說「每步找所有相位中最近者」，實作是各相位獨立迴圈（`:245-283`）。
- D10 `zodiacal_releasing/factory.py:50-52,132`：用回歸年 365.2422 並稱「符合現代 ZR 實作慣例」；常見現代實作（Brennan 系）子期用 360 天年／30 天月，L3 約 2.5 天，此處 L3≈2.54 天、L4≈0.21 天。屬慣例差異，註解斷言未附證據（我未查外部來源，列為待驗）。另 `target_date` 用 `datetime.fromisoformat`（`:255`），與 firdaria／profections 的 BCE-safe 解析不一致。
- D11 `profections/factory.py:65-68,154`：星座取宮頭，在象限宮制有截奪時會跳過截奪星座、重複某星座；與希臘化整宮法不同（docstring 有說明，屬設計選擇）。
- D12 `primary_directions/factory.py:36-43,308-317`：逆向方向是算術補角近似，作者已警告不可精用；但結果仍與順向並列輸出，只靠 `is_converse` 區分。Naibod 用 0.98564（常用值 0.98565），差異可忽略。
- D13 `fixed_stars/factory.py:236-241`：開 session 時未傳 `perspective_type`，非地心本命會與恆星位置框架不一致（只影響合相判定）。
- D14 `moon_phase_details/factory.py:589-595`：照明度用黃經差而非真實相位角，註解稱「standard phase-angle formula」；忽略月亮黃緯，最多數個百分點誤差。
- D15 `dominants/__init__.py:22-23` 與 `dominants/factory.py:56-57` 對同一範例（Lennon）給出不同的 dominant_planet（'Pluto' vs 'Mars'），皆標 SKIP；文件不一致。`DominantsConfig.dominant_planet_count` 無法經 `from_subject` 設定（`dominants/factory.py:98-104`）。
- D16 `composite_subject/factory.py:1337-1343` `_point_has` 只看第一顆存在的行星就回傳，若該行星恰好沒有該欄位但其他有，會關閉該旗標（與 returns 的 `_any_point_has` 掃全部點不同，`planetary_returns/factory.py:613-617`）。
- D17 `solar_arc.py:457-461`：方向點落入宮頭缺口時保留**本命**宮位（stale），註解自承。
- D18 `heliacal/factory.py:332-343`：拼錯的星名與「搜尋窗內無事件」無法分辨，作者註明為已知限制。

## 8. 讀完清單（93 檔，21,136 行；未讀：無）

| 子目錄 | 檔案：行數 |
|---|---|
| dominants (2,233) | base.py 298, data.py 343, factory.py 195, strategies/almuten_figuris.py 295, strategies/elemental.py 145, strategies/modern.py 479, strategies/__init__.py 23, utils.py 391, __init__.py 64 |
| planetary_returns (1,746) | factory.py 1732, __init__.py 14 |
| moon_phase_details (1,666) | factory.py 937, utils.py 709, __init__.py 20 |
| composite_subject (1,455) | factory.py 1441, __init__.py 14 |
| transits (1,161) | factory.py 1147, __init__.py 14 |
| secondary_progressions (1,129) | factory.py 618, solar_arc.py 477, __init__.py 34 |
| relationship_score (883) | factory.py 408, v2/calculator.py 297, v2/factory.py 63, v2/models.py 65, v2/__init__.py 13, __init__.py 37 |
| sun_times (660) | factory.py 101, utils.py 544, __init__.py 15 |
| sign_ingresses (647) | factory.py 628, __init__.py 19 |
| ephemeris_data (616) | factory.py 602, __init__.py 14 |
| void_of_course_moon (615) | factory.py 268, utils.py 332, __init__.py 15 |
| primary_directions (606) | factory.py 592, __init__.py 14 |
| heliacal (587) | factory.py 562, __init__.py 25 |
| retrograde_stations (585) | factory.py 566, __init__.py 19 |
| eclipses (545) | factory.py 529, __init__.py 16 |
| mundane_aspects (534) | factory.py 273, utils.py 247, __init__.py 14 |
| fixed_stars (522) | catalog.py 174, factory.py 329, __init__.py 19 |
| relocated_chart (484) | factory.py 470, __init__.py 14 |
| dignities (456) | data.py 155, factory.py 189, rulers.py 44, triplicity_lords.py 55, __init__.py 13 |
| occultations (354) | factory.py 343, __init__.py 11 |
| planetary_nodes (334) | factory.py 328, __init__.py 6 |
| astro_cartography (325) | factory.py 312, __init__.py 13 |
| lunations (323) | factory.py 309, __init__.py 14 |
| zodiacal_releasing (312) | factory.py 287, __init__.py 25 |
| house_comparison (306) | factory.py 134, utils.py 165, __init__.py 7 |
| midpoints (303) | factory.py 286, __init__.py 17 |
| planetary_hours (288) | factory.py 162, utils.py 111, __init__.py 15 |
| planetary_phenomena (283) | factory.py 277, __init__.py 6 |
| firdaria (227) | factory.py 216, __init__.py 11 |
| horary (191) | factory.py 179, __init__.py 12 |
| profections (179) | factory.py 168, __init__.py 11 |
| predictive (177) | utils.py 161, __init__.py 16 |
| motion (150) | state.py 118, __init__.py 32 |
| vedic (132) | nakshatra_data.py 64, nakshatra_utils.py 62, __init__.py 6 |
| receptions (122) | factory.py 111, __init__.py 11 |

- 範圍外被引用但未逐行讀：`aspects/`、`astrological_subject/factory.py`、`utilities/core.py`、`schemas/models.py`、`ephemeris_backend/`、`charts/utils.py`、`geonames/`。凡結論依賴它們的行為（例如 `get_aspect_from_two_points` 的 orb 判定、`circular_mean` 的對點平手規則、SolarPhaseThresholds 的預設值）皆未獨立驗證。
