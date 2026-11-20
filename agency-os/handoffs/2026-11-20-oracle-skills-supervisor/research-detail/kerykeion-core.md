# kerykeion 核心 12 區逐行閱讀報告

路徑皆相對 `kerykeion/`。範圍內 49 檔、23,193 行全部逐行讀完（見 §8）。

## 1. 各檔用途（一行一檔）

### 頂層
- `__init__.py`(405)：公開 API 匯出；v5 已移除名稱（AstrologicalSubject 等）以 ImportError 給遷移訊息（`__init__.py:370-405`），並列 v6 改變結果的預設（點 18→14、合沖 10→6、行運類 3°）`__init__.py:356-368`。

### schemas/
- `literals.py`：所有 Literal 型別（點、宮制、恆星黃道模式、視角、相位名、語言…）。
- `models.py`：全部 Pydantic 模型（點、主體、相位、圖表資料、月相、行星時、VOC、主導星、ZR、小限、法達、互容、卜卦）。
- `settings_models.py`：天體設定與 10 語系翻譯欄位模型。
- `chart_template_model.py`：SVG 模板變數模型。
- `exceptions.py`：`KerykeionException`。
- `__init__.py`：匯出 + 以 PEP 562 延遲匯出各功能模組的模型。

### astrological_subject/
- `factory.py`(4019)：主體建構（時間換算、宮位、行星、TNO、恆星、阿拉伯點、Vertex、對點、尊貴/星宿/Gauquelin/地平/OOB/運動狀態/章動）。
- `__init__.py`：匯出。

### settings/
- `config_constants.py`：預設點表、相位/orb 表、SE 編號表、恆星預設組、預設地點、Swiss 下載目錄。
- `chart_defaults.py`：天體設定（顏色、元素權重、內部 id）、相位度數表、動態恆星/中點設定。
- `translation_strings.py`：10 語系 UI 標籤（純字詞，無解讀）。
- `translations.py`：翻譯讀取/合併。
- `loader.py`：已棄用的設定載入。
- `__init__.py`：匯出。

### utilities/
- `core.py`：度數→點、宮位歸屬、月相、時區（zoneinfo、DST、LMT）、儒略日、BCE 日期、SVG CSS 內嵌、百分比分配。
- `__init__.py`：扁平匯出。

### aspects/
- `factory.py`：單盤/雙盤黃經相位、赤緯平行/反平行。
- `utils.py`：取最近相位、入出相判定、取點清單。
- `orb_utils.py`：逐點 orb 加減的合併策略。
- `__init__.py`：匯出。

### ephemeris_backend/
- `backend.py`：後端選擇、LEB 模式/離線鎖、ephe 路徑、極區宮制替代、全域鎖與 session。
- `coverage.py`：查詢後端星曆覆蓋範圍（加鎖轉呼叫）。
- `__init__.py`：匯出。

### chart_data/
- `factory.py`：組圖表資料（依圖型挑 orb、相位、宮位比較、合盤分數、元素/模式分布、角宮星、星群）。
- `__init__.py`：匯出。

### geonames/
- `fetcher.py`：GeoNames 城市搜尋/時區查詢（requests-cache sqlite 快取）。
- `__init__.py`：匯出。

### swisseph_setup/
- `download.py`：CLI 下載 Swiss 星曆檔（需確認授權）。
- `__init__.py` / `__main__.py`：匯出 / CLI 入口。

### context/
- `serializer.py`：模型→給 LLM 的 XML。
- `__init__.py`：匯出。

### report/
- `generator.py`：模型→ASCII 表格報告。
- `__init__.py`：匯出。

## 2. 「已知」逐條核對

- AGPL-3.0：確認 `astrological_subject/factory.py:30`。但 `ephemeris_backend/backend.py:22` 寫 `kerykeion[swiss] # ... (GPL)`，與同檔 `:13`、`:172` 的 AGPL 自相矛盾。
- 預設後端 libephemeris、Swiss 選配：確認。自動偵測順序 `backend.py:147-152`；`KERYKEION_BACKEND` 可強制 `backend.py:124-145`。
- 預設 orb 六／六合 5：確認 `settings/config_constants.py:605-611`。
- 日月各 +1.5：**需更正兩點**。
  - 只有 `ChartDataFactory` 的 Natal／Synastry／Composite 才自動套用（`chart_data/factory.py:219,293-296`）。直接呼叫 `AspectsFactory` 預設不套用（`aspects/factory.py:170-179`）。
  - 預設策略 `max_explicit` 取兩點中較大者，不相加：日月互相成相位是 +1.5，不是 +3（`aspects/orb_utils.py:276-279`）。
- 行運類一律 3：確認並補充範圍。Transit／DualReturnChart／Progression／**SingleReturnChart（單輪回歸盤）** 都用 `PREDICTIVE_ACTIVE_ASPECTS`，五個相位全 3°、六合也是 3°、日月不加寬（`config_constants.py:620-626`；`chart_data/factory.py:219,291-296`）。
- 取最接近者、最短角距：確認 `aspects/utils.py:57,66-83`（`difdeg2n` 取絕對值）。邊界是 `<=`，含邊界。
- 入出相往前推一小步：確認 `aspects/utils.py:189-285`。
  - 步長 `dt=min(0.001 日, min(現 orb,0.5)/相對速度)`。
  - 相對速度 <1e-9 或 orb 變化 <1e-6 判 Static。
  - 兩點都是四軸點時強制 Static（`aspects/factory.py:615-616,768-769`）。
  - **新事實**：Synastry 的兩盤都標為 fixed，速度歸 0（`chart_data/factory.py:353-355`；`aspects/factory.py:759-762`），所以合盤相位**全部**是 Static。Transit／回歸／推運只把本命盤設為 fixed。
- 極區 Placidus 改 Porphyry：**需更正範圍**。
  - 觸發條件是後端對「任何」宮制丟出極區錯誤，不只 Placidus。替代用 Porphyry `b"O"`，且在真實緯度計算（`backend.py:227,328-394`）。
  - Gauquelin `G` 例外：改把緯度夾到 ±66°，或後端回報的門檻 −1e-6（`backend.py:234,254-267,374-385`；`factory.py:1635-1643`）。
  - swisseph 後端在 |lat|≤66 且沒有門檻時，直接拋出原錯誤（`backend.py:352-366`）。
  - 替代紀錄寫入 `polar_house_fallbacks`；`houses_system_identifier` 保留使用者原本要求的宮制（`factory.py:2728-2740`）。
- 時區用 zoneinfo：確認 `utilities/core.py:41,1451-1484`。
- GeoNames 共用帳號 century.boy：確認 `factory.py:101`；環境變數 `KERYKEION_GEONAMES_USERNAME` 優先（`:410-420`）；走 HTTPS `secure.geonames.org`（`geonames/fetcher.py:155-156`）。
- 預設 leb 模式離線：確認。`KERYKEION_LEB_MODE` 預設 `leb`，並設定 `set_network_policy("sealed")`（`backend.py:605-615`）。其他模式 `auto/skyfield/horizons` 不加離線鎖（`:602,609`）；它們實際是否連網由 libephemeris 決定，不在本範圍內。

## 3. 完整可設定項

### 天體清單

SE 編號（`config_constants.py:697-731`；`factory.py:126-134`）：

| 類別 | 點名 = SE 編號 |
|---|---|
| 行星 | Sun0 Moon1 Mercury2 Venus3 Mars4 Jupiter5 Saturn6 Uranus7 Neptune8 Pluto9 |
| 交點/黑月 | Mean_North_Lunar_Node10 True_North_Lunar_Node11 Mean_Lilith12 True_Lilith13 |
| 其他 | Earth14 Chiron15 Pholus16 Ceres17 Pallas18 Juno19 Vesta20 Interpolated_Lilith21 Interpolated_Perigee22 |
| 漢堡學派 | Cupido40 Hades41 Zeus42 Kronos43 Apollon44 Admetos45 Vulkanus46 Poseidon47 |
| White_Moon | 56 |
| TNO（AST_OFFSET+） | Eris136199 Sedna90377 Haumea136108 Makemake136472 Ixion28978 Orcus90482 Quaoar50000 |

- 衍生對點，一律 +180°（`factory.py:195-218`）：
  - Descendant←Asc、Imum_Coeli←MC、Anti_Vertex←Vertex：速度、赤緯不變號。
  - 南交點：速度同號，赤緯變號。
  - Mean/True_Priapus←Lilith：赤緯與黃緯都變號。
- 阿拉伯點（`factory.py:375-394`）：
  - Fortunae：日 Asc+Moon−Sun；夜 Asc+Sun−Moon。
  - Spiritus：日 Asc+Sun−Moon；夜 Asc+Moon−Sun。
  - Amoris：Asc+Venus−Sun。
  - Fidei：Asc+Jupiter−Saturn。
  - 日夜判定：太陽回歸黃道、黃緯設 0、幾何地平高度 ≥0 為日；不計大氣折射（`factory.py:3255-3265`）。
- Vertex：用 `houses_ex(hsys='V')` 的 `ascmc[3]` 取得（`factory.py:3659-3681`）。
- 預設啟用 14 點：Sun～Pluto（10 顆）、True_North_Lunar_Node、Chiron、Ascendant、Medium_Coeli（`config_constants.py:340-405`）。
- 其他預設組：
  - V5 的 18 點：再加 True_South_Lunar_Node、Mean_Lilith、Descendant、Imum_Coeli（`:411-430`）。
  - 古典組：7 星 + 真南北交點（`:324-334`）。
  - 全部點（`:454-522`）、漢堡學派（`:589-598`）。
- 恆星：v6 不放在 active_points，改用 `active_fixed_stars`；舊名會自動轉過去（`factory.py:1169-1210`）。
  - 預設組：ROYAL 4、BEHENIAN 15、DEFAULT 23（`config_constants.py:534-586`）。
  - 同名去重；底線轉空格後查詢（`factory.py:3880-3891`）。
- 元素分布權重（`chart_defaults.py:91-467`）：Sun/Moon/Asc 40、MC 20、Mercury/Venus/Mars 15、Jupiter～Pluto 10、Pars_Fortunae 5、其餘 0。
- 能參與相位的點只限 `DEFAULT_CELESTIAL_POINTS_SETTINGS`，加上動態恆星與中點（`aspects/utils.py:335-349`）。

### 宮位制代碼

共 23 種（`schemas/literals.py:355-386`；預設 P，見 `factory.py:105`）：

| 代碼 | 宮制 | 代碼 | 宮制 |
|---|---|---|---|
| A | Equal | O | Porphyry |
| B | Alcabitius | P | Placidus |
| C | Campanus | Q | Pullen SR |
| D | Equal (MC) | R | Regiomontanus |
| F | Carter poli-equ. | S | Sripati |
| H | Horizon/Azimut | T | Polich/Page |
| I | Sunshine | U | Krusinski-Pisa-Goelzer |
| i | Sunshine/alt. | V | Equal/Vehlow |
| K | Koch | W | Whole sign |
| L | Pullen SD | X | Axial rotation/Meridian |
| M | Morinus | Y | APC |
| N | Equal/1=Aries | | |

- 另有 `G`（Gauquelin 36 區）只供內部使用。

### 恆星黃道模式

共 47 個具名模式 + USER，合計 48（`literals.py:251-302`）：

- FAGAN_BRADLEY、LAHIRI、DELUCE、RAMAN、USHASHASHI、KRISHNAMURTI、DJWHAL_KHUL、YUKTESHWAR、JN_BHASIN
- BABYL_KUGLER1/2/3、BABYL_HUBER、BABYL_ETPSC、ALDEBARAN_15TAU、HIPPARCHOS、SASSANIAN
- J2000、J1900、B1950
- ARYABHATA、ARYABHATA_522、ARYABHATA_MSUN
- GALCENT_0SAG、GALCENT_COCHRANE、GALCENT_MULA_WILHELM、GALCENT_RGILBRAND
- GALEQU_FIORENZA、GALEQU_IAU1958、GALEQU_MULA、GALEQU_TRUE、GALALIGN_MARDYKS
- KRISHNAMURTI_VP291、LAHIRI_1940、LAHIRI_ICRC、LAHIRI_VP285
- SURYASIDDHANTA、SURYASIDDHANTA_MSUN、SS_CITRA、SS_REVATI
- TRUE_CITRA、TRUE_MULA、TRUE_PUSHYA、TRUE_REVATI、TRUE_SHEORAN
- BABYL_BRITTON、VALENS_MOON
- USER：需 `custom_ayanamsa_t0`（JD）與 `custom_ayanamsa_ayan_t0`（度）（`factory.py:681-687`）

相關預設與數值：
- Sidereal 未指定模式時預設 FAGAN_BRADLEY（`config_constants.py:36`）。
- 星宿在非恆星盤上預設用 LAHIRI 旋轉（`:43`；`factory.py:1541-1589`）。
- `ayanamsa_value` 取自 `get_ayanamsa_ex_ut`（含章動），`factory.py:1444-1452`。

### 觀測視角

共 11 種（`literals.py:389-402`；旗標在 `backend.py:802-813`）：

| 視角 | 旗標 / 算法 |
|---|---|
| Apparent Geocentric（預設） | SWIEPH\|SPEED |
| True Geocentric | +TRUEPOS |
| Heliocentric | +HELCTR |
| Topocentric | +TOPOCTR，並 set_topo(lng,lat,alt) |
| Barycentric | +BARYCTR |
| Selenocentric／Mercurycentric／Venuscentric／Marscentric／Jupitercentric／Saturncentric | `calc_pctr`，日期先以 deltat 換成 TT（`factory.py:2978-2988`） |

非地心盤的處理：
- 剔除中心天體：`factory.py:308-338,2966-2969`。
- 剔除交點與黑月系列：`:275-305`。
- 不計算阿拉伯點、月相、Gauquelin、地平座標、OOB、運動狀態：`:1461-1465,1598-1603,1736-1741,1784-1803,3641`。

### 相位度數

來源 `chart_defaults.py:470-537`。

| 相位 | 度數 | 主要相位 |
|---|---|---|
| conjunction | 0 | 是 |
| semi-sextile | 30 | 否 |
| semi-square | 45 | 否 |
| sextile | 60 | 是 |
| quintile | 72 | 否 |
| square | 90 | 是 |
| trine | 120 | 是 |
| sesquiquadrate | 135 | 否 |
| biquintile | 144 | 否 |
| quincunx | 150 | 否 |
| opposition | 180 | 是 |

### 各情境 orb 表

| 情境 | 合 | 沖 | 拱 | 刑 | 六合 | 次要相位 | 逐點加減 | 出處 |
|---|---|---|---|---|---|---|---|---|
| ChartDataFactory Natal/Synastry/Composite | 6 | 6 | 6 | 6 | 5 | 不啟用 | Sun、Moon 各 +1.5（max_explicit） | `config_constants.py:605-611,634-637`；`chart_data/factory.py:291-296` |
| ChartDataFactory Transit/DualReturn/SingleReturn/Progression | 3 | 3 | 3 | 3 | 3 | 不啟用 | 無 | `config_constants.py:620-626,647` |
| AspectsFactory 直接呼叫 | 6 | 6 | 6 | 6 | 5 | 不啟用 | 無（需自己傳） | `aspects/factory.py:205,335` |
| ALL_ACTIVE_ASPECTS（需自選） | 6 | 6 | 6 | 6 | 5 | 五種次要相位各 2 | — | `config_constants.py:655-667` |
| DISCEPOLO 評分 | 8 | 8 | 7 | 5 | 4 | 半六合 2、半刑 2、補八分相 2 | — | `config_constants.py:673-682` |
| 赤緯平行/反平行 | — | — | — | — | — | — | 預設 orb 1.0（以正負號區分平行或反平行） | `aspects/factory.py:962,1163-1206` |

其他可調參數：
- 軸點 orb 上限 `axis_orb_limit`：預設 None。設定後，與四軸相關且 orb ≥ 上限的相位會被濾掉（`aspects/factory.py:873-884`）。
- 逐點加減策略：max_explicit／min_explicit／sum／none。可依相位分別設定，`"*"` 為萬用值；有效 orb 下限 0（`orb_utils.py:48-56,224-293`；`utils.py:76`）。
- 角宮星：古典 7 星距四軸 ≤8°（`chart_data/factory.py:80`）。
- 星群：同宮 ≥3 顆古典星（`:81`）。

自動略過、不算相位的組合：
- 同盤內的固定對點組：`aspects/factory.py:64-83`。
- 恆星對恆星：`:567-570,713-714`。

## 4. 時區與曆法邊界

- **DST 重疊與跳空**（`utilities/core.py:1577-1680`）：
  - 判定方式：fold=0 與 fold=1 的 UTC 偏移不同即為邊界；從 UTC 來回換算回不到原時刻即為跳空（`:1498-1542`）。
  - `is_dst=None` 時，1902-01-01 以後的重疊或跳空一律丟 `KerykeionException`（`:1655-1668`）。
  - `is_dst=True` 取「較大的 UTC 偏移」，`False` 取較小的；判定依偏移量，不看 `dst()` 旗標（`:1679-1680`）。
  - 有給 `is_dst` 時跳空不報錯，直接取一側的偏移。
- **1902 以前**（`_PRE_DAYLIGHT_SAVING_HORIZON=1902-01-01`，`:1574`）：非唯一的時刻固定取 fold=0，也就是轉換前的偏移，並記 info log（`:1639-1646`）。
- **LMT**：時區資料若落在合成的 `LMT` 記錄，改用觀測者經度 ×(1h/15°)、四捨五入到秒；具名的歷史時制（RMT、BMT 等）保留不動（`:1683-1717`；`factory.py:2513-2518`）。
- **from_iso_utc_time**（`factory.py:2083-2107`）：
  - 先把 UTC 換成當地時間，再把算出的偏移秒數直接帶入，`is_dst` 實際不起作用（`:2490-2500`）。
  - 換算後再驗證儒略日誤差在 2 秒內（`:2151-2159`）。
  - 沒有時區資訊的輸入一律當 UTC（`:2031-2035`）。
- **from_current_time**：同樣帶入「現在」的偏移秒數（`:2333-2351`）。
- **西元前（year<1，天文年號：0=1 BCE）**（`factory.py:2553-2643`）：
  - 用儒略曆 `ephe.julday(...,JUL_CAL)`。
  - 時區完全忽略，一律用經度 LMT：經度/15，四捨五入到秒（`:2629`）。
  - 依儒略曆月長驗證日期，2 月 29 日只在 year%4==0 時合法（`core.py:1957-1967`）。
- **儒略／格里曆切換：沒有 1582 切換**。
  - year≥1 一律用 proleptic Gregorian，包含 1–1582 年（`factory.py:2434-2449`；`core.py:2050-2090`）。
  - 歷史上的儒略曆日期要由呼叫端自行先轉換。
  - 在 1 CE 處有曆法接縫，日期約差兩天（`core.py:1180-1186`）。
- **範圍邊界**：
  - UTC 換算超出 datetime 可表示範圍（1 CE 前、9999 CE 後）時拋錯（`factory.py:2537-2550`）。
  - 日月因超出星曆範圍算不出來時拋錯；其他天體只略過並寫入 `ephemeris_warnings`（`:3015-3035,2830-2899`）。
- **時區鍵無效**：轉成 `KerykeionException`（`core.py:1451-1484`）。
- **緯度**：|lat|>90 拒絕，不再夾到 66°（`core.py:973-1003`）。
- **經度**：自動換算回 [-180,180)（`core.py:1436-1448`）。

## 5. 網路、檔案、執行、環境變數

- **網路**：
  - GeoNames `https://secure.geonames.org/searchJSON`（取第 1 筆，featureClass 限 A、P）與 `timezoneJSON`；逾時 (3.05, 10) 秒（`geonames/fetcher.py:30,155-156,294-301`）。
  - 使用者名稱放在查詢參數中，log 只記錄端點、不記完整 URL（`:212-214`）。
  - CLI `swisseph_setup` 從 `raw.githubusercontent.com/aloistr/swisseph/master/ephe` 下載 seas_18/semo_18/sepl_18.se1 與 sefstars.txt（`download.py:36-43,119`）；Dropbox 網址只印出來，不自動下載（`:55-58`）。
- **檔案寫入**：
  - GeoNames 快取：`~/.kerykeion/cache/kerykeion_geonames_cache_{N}d`（sqlite，會自動建目錄）；可用 `KERYKEION_GEONAMES_CACHE_NAME` 或 `set_default_cache_name` 改路徑（`fetcher.py:25-26,130-146,176-193`）。
  - 暫時性錯誤碼 13/18/19/20/22 與認證錯誤 10 不寫入快取（`:36-52`）。
  - 下載器寫入 `~/.kerykeion/sweph/`，先寫 `.part` 再改名（`download.py:105-131`；`config_constants.py:826`）。
  - `factory.py` 的 `__main__` 示範程式會寫 `~/kerykeion_subject_example.json`（`:4018-4019`）。
  - 讀取方面：`os.listdir` 檢查 ephe 目錄裡有沒有 `.se1`（`backend.py:545-549`）。
- **eval/exec/subprocess**：範圍內都沒有（grep 0 命中）。阿拉伯點公式是寫死的 lambda，不是 eval（`factory.py:375-394`）。
- **環境變數**：

| 變數 | 用途 | 出處 |
|---|---|---|
| `KERYKEION_BACKEND` | 指定後端 | `backend.py:124` |
| `KERYKEION_EPHE_PATH` | 星曆檔路徑 | `:552` |
| `KERYKEION_LEB_MODE` | LEB 計算模式 | `:605` |
| `KERYKEION_GEONAMES_USERNAME` | GeoNames 帳號 | `factory.py:102,420` |
| `KERYKEION_GEONAMES_CACHE_NAME` | GeoNames 快取路徑 | `fetcher.py:26,189` |

- **全域狀態**：
  - `EPHEMERIS_LOCK`（RLock）；同執行緒巢狀 session 會拋 RuntimeError；session 結束時重設，並重新套用 LEB 模式（`backend.py:523,644-668,767-839`）。
  - 模組層旗標 `_swisseph_star_warning_emitted`（`factory.py:98`）。

## 6. context/ 與 report/

- **context/**：專門產生給 LLM 讀的 XML，`to_context()` 是入口（`serializer.py:1-16,1162-1259`；`__init__.py:3-7`）。
  - 宣稱「純事實、不含解讀」；實際讀完確認只輸出：位置、星座全名、宮位、速度、赤緯、來源、相位類型/orb/角度/入出相、宮位疊盤、元素/模式百分比、極區替代紀錄、重合宮頭、合盤分數數值與等級名、月相、太陽弧、中點。
  - 有防護：去除控制字元（`:77-94`；`core.py:64-72`）。
  - 四軸與交點一定會輸出，不受 active_points 限制（`:595-607`）。
  - **沒有寫死的解讀文字**。唯一的固定字詞：星座全名表（`:51-64`）、「Transit」代稱、`relationship_score` 的 description 等級字。
  - 月相的 `recommendations` 等欄位只是轉印模型內容，其文字來源在範圍外（moon_phase_details）。
  - 角宮星、星群不輸出到 context。
- **report/**：ASCII 表格報告（`simple_ascii_tables`），用 `print` 輸出到 stdout（`generator.py:260-269`）。
  - 沒有解讀段落。唯一的固定字詞：
    - 卜卦考量的事實標籤 7 條，如「Ascendant below 3°」（`:97-105`）。
    - 相位符號（`:57-71`）、入出相符號（`:73-77`）、互容表的固定句（`:609`）。
  - `report/__init__.py:6` 宣稱有「narrative sections」，但實際讀完沒有敘述性段落。
- **settings/translation_strings.py**：10 語系的 UI 標籤（EN/FR/PT/IT/CN/ES/RU/TR/DE/HI），只有名詞，沒有解讀。
  - CN 簡繁混用：「宫」「質/质心」「个点」（`:912,948-949,958-959`）。
  - 「tropical」譯為「熱帶」（`:934`）。
  - Synastry 與 composite_chart 都譯成「合盤」，撞名（`:928,985`）。

## 7. 缺陷與註解/docstring 不符

- D1：視角常數的說明寫錯。「Apparent Geocentric = 含大氣折射」「True = 不含折射」都不對；實際差別是光行時/光行差（TRUEPOS），與折射無關（`config_constants.py:59-63`）。
- D2：`backend.py:22` 把 Swiss 標為「(GPL)」，同檔其他處寫 AGPL。
- D3：`from_birth_data` 在日期省略、改用「現在」時，`seconds` 因預設值是 0 而非 None，不會取到現在的秒數（`factory.py:968,1377-1384`）。
- D4：阿拉伯點的 log 說「自動加入必需點」，實際只加進過濾清單；`_ensure_point_calculated` 算出的 Sun/Moon 等不會加入 `calculated_planets`，最後的 active_points 沒有它們，因此不參與相位與報告表（`factory.py:3307-3316,3156-3226,3748-3751`）。
- D5：`from_iso_utc_time` 線上查詢時只取 lat/lng，不取時區。`tz_str` 預設 `Etc/GMT`，即使給了城市，本地時間、星期幾、ISO local 仍以 GMT 呈現（`factory.py:1878,2041-2065,2076`）。
  - 同檔 `__main__`（`serializer.py:1286-1293`）的紐約範例就是這種情況。
  - 該函式與 `from_current_time` 也忽略 `cache_expire_after_days`（`factory.py:2048-2052,2304`）。
- D6：「布林 is_dst 無法分辨雙夏令時」的守衛與註解已過時：偏移量已直接帶入，這個驗證實際上幾乎不會觸發（`factory.py:2090-2107,2146-2159`）。
- D7：合盤的兩盤都標 fixed，相位全部變成 Static；入出相資訊對合盤是空的（`chart_data/factory.py:353-355`；`aspects/factory.py:759-762`；`utils.py:216-218`）。這是設計結果，不是報錯。
- D8：設定模型註明 id「according to Pyswisseph」，但 `chart_defaults` 的 id 與 SE 不同（例如 Chiron 12 對 SE 15、Ascendant 13 對 SE Mean_Lilith 12），而 `AspectModel.p1/p2` 用的是這組 id（`settings_models.py:16`；`chart_defaults.py:177-189`；`aspects/factory.py:530,605`）。
- D9：日夜判定用幾何地平高度 ≥0、不計折射，太陽黃緯設 0；與 sun_times 的日出定義（上緣、含折射）不同，日出日落前後數分鐘內兩者可能不一致（`factory.py:3255-3265`；`models.py:497-498`）。
- D10：靜默吞掉例外：Gauquelin 宮頭（`factory.py:1685-1686`）、各點 `gauquelin_sector`（`:1705-1706`）、azalt 只記 debug（`:1765-1766`）。
- D11：`chart_data/factory.py:411` 用根 logger 的 `logging.warning`，沒有模組 logger。
- D12：報告的「No aspects data available.」永遠執行不到，因為前一行的空 list 已先 return（`report/generator.py:1428-1434`）。
- D13：西元前的星期幾用未取整的 lng/15，與西元前時間換算時四捨五入到秒的處理不一致（`factory.py:3943` 對 `:2629`）；影響可忽略。
- D14：Topocentric 的 docstring 寫「requires altitude」，實際 altitude 預設 0、可以省略（`factory.py:1015` 對 `:573`）。
- D15：v6 星宿預設用 LAHIRI 旋轉；舊版（`nakshatra_ayanamsa=None`）結果偏約 24°，只發警告（`factory.py:1556-1568`）。
- D16：`AstrologicalSubjectModel` 沒有 `seconds` 欄位，秒數只保留在 ISO 字串（`models.py:1386-1391`）；`core.py:1297-1303` 用 regex 從 ISO 取回。
- D17：`report/__init__.py:6` 宣稱有 narrative sections，實際沒有。
- D18：曆法接縫：西元 1 年前後分別用儒略曆與格里曆，日期不連續約 2 天；docstring 已有說明，但對使用者是陷阱（`factory.py:2434-2449`；`core.py:1180-1186`）。

## 8. 讀完清單與行數

全部逐行讀完，未讀 0 行。

| 範圍 | 檔案（行數） | 小計 |
|---|---|---|
| 頂層 | `__init__.py`(405) | 405 |
| schemas/ | chart_template_model 453、exceptions 20、literals 582、models 2534、settings_models 602、`__init__` 421 | 4,612 |
| astrological_subject/ | factory 4019、`__init__` 15 | 4,034 |
| settings/ | chart_defaults 714、config_constants 826、loader 59、translations 180、translation_strings 2213、`__init__` 35 | 4,027 |
| utilities/ | core 2306、`__init__` 165 | 2,471 |
| aspects/ | factory 1225、orb_utils 293、utils 374、`__init__` 13 | 1,905 |
| ephemeris_backend/ | backend 849、coverage 27、`__init__` 57 | 933 |
| chart_data/ | factory 965、`__init__` 14 | 979 |
| geonames/ | fetcher 384、`__init__` 30 | 414 |
| swisseph_setup/ | download 249、`__init__` 28、`__main__` 7 | 284 |
| context/ | serializer 1299、`__init__` 49 | 1,348 |
| report/ | generator 1750、`__init__` 31 | 1,781 |
| **合計** | **49 檔** | **23,193** |

範圍外、未讀（任務未要求）：
- 呼叫到但不在範圍內的模組：`fixed_stars/`、`vedic/`、`dignities/`、`motion/`、`charts/`、`house_comparison/`、`relationship_score/`、`moon_phase_details/` 等。
- 第三方套件 libephemeris。

報告中涉及這些模組的行為，只引用呼叫端程式，不推論被呼叫端內部。
