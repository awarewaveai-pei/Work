# kerykeion tests/core 後半（字母序第 62–122 檔）審讀報告

範圍：`D:\tmp\oracle-repos\g-battaglia_kerykeion\tests\core\`。`ls *.py | LC_ALL=C sort` 共 122 檔（含 `__init__.py`、`conftest.py`、`svg_text_overlap.py`）；跳過前 61（至 `test_moon_phase_details_factory_mocked.py`），負責第 62–122 共 **61 檔**，起於 `test_moon_phase_historical_verification.py`，止於 `test_zodiacal_releasing.py`。排序在 locale 下若不同（`_` 與字母相對次序）邊界可能差 1 檔，僅影響邊界檔。

## 讀取程度（先講，避免誤信）

- 整檔讀完：`test_sidereal_model_contract.py`(34)、`test_reference_validation.py`(274)、`test_optimizer_dependency.py`(13)。
- 大部讀完：`test_sun_times_anchors.py`（1-80、205-374；中間 81-204 為資料表，用 grep 看過全部 usno/imcce 列）、`test_sun_times_altitude_invariant.py`（1-150）、`test_planetary_positions.py`（1-352）、`test_moon_phase_historical_verification.py`（1-120、560-620，其餘 grep 結構）、`test_primary_directions.py`（500-650）、`test_predictive_factories.py`（748-820）。
- 其餘 ≈50 檔：只讀檔頭（前約 45 行，含 docstring、fixture、常數）＋ 全檔 grep（skip／xfail／容差／外部來源關鍵字／tmp_path／網路／subprocess／環境變數）。**測試函式本體大多未逐行讀**，表中「測什麼」多來自 docstring 與 def 名稱，標 (頭) 者即此類。
- 61 檔總行數 **28,132**（`wc -l`）；真正逐行讀過約 1,600 行，檔頭掃過約 2,700 行。**不可宣稱 61 檔讀完。**
- 未讀本體的大檔：`test_report.py`(2951)、`test_utilities.py`(1862)、`test_planetary_return.py`(1392)、`test_predictive_factories.py`(1060 中 ~70 行)、`test_moon_phase_historical_verification.py`(1207，資料表 120-560 僅計數)、`test_timezone_correctness.py`(814)、`test_relocated_chart.py`(778)、`test_relationship_score.py`(761)、`test_subject_factory_parametrized.py`(755)、`test_polar_house_invariants.py`(728)、`test_primary_directions.py`(691 中 150 行)。
- 全 61 檔 `def test_` 合計 **1634**，`@pytest.mark.parametrize` 裝飾器 **284**（實際案例數遠大於 def 數，因資料表展開，如 moon_phase 365 筆、reference_validation 129 列×6 測試）。

## 1. 逐檔表（行號為檔內位置；def=def test_ 數，P=parametrize 裝飾器數）

基準來源代號：自產回歸＝expected 資料由 repo 腳本以本庫輸出產生；後端自比＝與同一個 `ephe`（`kerykeion/ephemeris_backend/backend.py:189` 的現用後端）直接呼叫比較；不變量＝數學／結構性質；外部＝非本庫產出之來源。

| 檔 | 測什麼 | def/P | 基準 | 容許誤差 | skip 條件 |
|---|---|---|---|---|---|
| test_moon_phase_historical_verification.py | 365 筆月相時刻（2001–2040 十數個年區塊）的日月黃經差、名稱、emoji、illum、28 相邊界、朔望月長 | 18/18 | **外部**：AstroPixels（Espenak）表，手抄（:5-12、:113-118） | 角度 ±1.0°（:48）、illum ±8 點（:49）、朔望月 29.26–29.84（:81-82） | 無；但 pyproject.toml:198 的 `test:core` 把它 `--ignore` |
| test_mundane_aspects.py | 木土大合 2020-12-21 18:2x、木海方 2019 三次完成、同日期範圍相位搜尋 | 20/2 | 事件日期（已知公開事件，未註出處）＋幾何自洽 | 事件時刻到「分」層級（:23）；分離角 5e-4°（:64,73） | 無 |
| test_nakshatra.py (頭) | 27 宿表、pada、Vimsottari 主星；3 個日期硬編 Lahiri 恆星黃經 | 50/2 | 常數表＋硬編後端值（:195-200「pre-computed with ephe.calc_ut」，:223-227 與現用後端比） | 0.01°（:223）、<0.001 | 無 |
| test_native_path_compatibility.py | 月相 helper 的 ephe path 設定；subprocess 驗真實設定檔 | 4/3 | mock；tmp_path 設定檔 | 無數值 | 無 |
| test_nutation.py (頭) | 章動/黃赤交角 model；J2000 已知值 | 12/0 | 硬編 Swiss 常數 23.4376767161 等（:77-80），以現用後端 `calc_ut(ECL_NUT)` 比 | 1e-6°（:88 起）、1e-4 | 無 |
| test_occultations.py (頭) | 月掩行星全域／本地搜尋形狀 | 34/6 | 結構性、後端自比 | 0.01° | 無 |
| test_oob_and_declination_aspects.py (頭) | 出界（OOB）與赤緯平行／反平行 | 22/1 | 結構＋Lennon/Yoko 星盤 | 1e-3、1e-9 | 無（grep 命中的 skip 皆是語意「略過」） |
| test_optimizer_dependency.py | 已安裝套件需 svg-polish ≥1.0.1 | 1/0 | 套件 metadata | — | 無 |
| test_optional_chart_marks.py (頭) | 可選 SVG 標記預設關閉＝輸出逐位元不變；開啟只增加該標記 | 42/30 | SVG 差分（自比） | 無 | :668、:861 擁擠天空時 `pytest.skip` |
| test_optional_mark_baselines.py (頭) | 20 個 SVG baseline 實際被讀＋標記確實存在 | 12/8 | 自產黃金 SVG（tests/data/svg）；`compare_svg_file` | rel 0、abs 1e-4（tests/data/compare_svg_lines.py:48,52） | 無 |
| test_performance_contracts.py (頭) | 翻譯複製、配置次數等行為界線 | 10/7 | 結構 | — | 無 |
| test_planetary_hours_factory.py | 行星時結構（週四木星、24 時、日夜各 12、無縫相接） | 9/0 | 不變量 | — | 無 |
| test_planetary_nodes.py (頭) | 行星交點／遠近日點 | 25/2 | 與 `ephe.nod_aps_ut` 現用後端直接比（:110-150） | <0.01°（:133 等）、0.1 | 無 |
| test_planetary_phenomena.py (頭) | 相角、距角、照明、視星等、晨昏星 | 34/2 | 與 `ephe.pheno_ut` 後端自比（:208-240） | 0.001°、直徑 1e-4、星等 0.01 | 無 |
| test_planetary_positions.py | 100–2200 AD 時間軸＋地理軸 ×(行星/節點/軸) 的 abs_pos/sign/逆行/速度 | 14/4（fixture 展開數百） | **自產回歸**：`tests/data/expected_positions.py` 經 `model_fixtures.positions_for_model`（:30-40）；mean node 另用 pyswisseph 比（:327-345） | swisseph 後端 0.2°／libephemeris 0.01°（:133）；速度 0.05／1e-4；赤緯 0.15／1e-2 | 整檔：資料 import 失敗（:38）；逐案：缺資料 `pytest.skip`（:157-440 共 17 處）；conftest 依 tier 跳過（tests/conftest.py:164-199）；pyproject.toml:198 `test:core` 忽略 |
| test_planetary_return.py (頭) | 太陽／月亮回歸、錯誤驗證、歷年遞進、online 閘 | 90/11 | 不變量（回歸日 Sun=natal Sun） | <0.1°／sidereal、True Geocentric <1e-3°（:837-929）、tz 差 0.01 | :1321 需 DE440 邊界核；online 測試以 monkeypatch 假資料（:1246-1260） |
| test_planetary_return_backwards.py | 往回搜尋（backwards=True）；swisseph 須報清楚錯誤 | 12/0 | 不變量（太陽年 365.2422、恆星月 27.3217） | <0.5 日 | 整檔 `skipif BACKEND_NAME=="swisseph"`（:37-40） |
| test_planetary_return_roundtrip.py | 回歸時刻當種子的往返（next(reported(N))==N+1 等） | 21/8 | 不變量；上限界 MAX_GAP_DAYS（:48-58） | <1e-3、<0.2e-3 日 | 整檔 swisseph 跳過（:41-44） |
| test_planetocentric.py (頭) | 行星中心視角確實不同於地心（防靜默退回） | 35/5 | 不變量／差異斷言 | 1e-9 | — |
| test_point_and_chartdata_enrichments.py (頭) | motion_state、星表星座、角度、群星、progressed_points、月齡 | 21/2 | 與「repo 內獨立實作」交叉（:107） | ≤12 | 無 |
| test_polar_house_invariants.py (頭) | 極圈內宮制不可定義時的不變量（ASC 與宮制無關等），緯度掃 65–89.9 | 35/3 | 不變量，非位置黃金 | 5e-5、1e-9 | 量測極圈門檻類測試 skip 非 libephemeris（:44-47） |
| test_predictive_factories.py | 推運工廠回歸；**12 組 SP＋12 組 SA 與外部推運計算器比星曆日** | 79/7 | 部分**外部**（:752-811，來源未具名「independent online progressed-chart calculator」）；其餘回歸 | SP 星曆日 <180 s（:811）；1e-9、0.1、0.5 | 無 |
| test_primary_directions.py | 主限推進；speculum 與後端 RA/Dec/RAMC；Gansten 教科書公式 | 45/8 | 教科書公式在測試內以 `math` 獨立算（:562-640）＋後端自比（:522-559） | 0.01°、1e-9、公式釘值 ±0.05（:596,617） | 無 |
| test_profections.py (頭) | 年度 profection 結構（Lennon 83 歲等） | 11/0 | 不變量（手算年齡/宮） | — | 無 |
| test_public_api_surface.py (頭) | 公開 API 匯出一致性、type hints、棄用別名 | 12/2 | 反射 | — | 少數 skip 註解 |
| test_receptions_horary.py (頭) | 互容、horary 指標、尊貴表查詢 | 14/0 | 靜態表 | — | 無 |
| test_reference_validation.py | **129 組**出生資料×6 測試：SP 星曆日對外部、day-for-year 公式、solar arc=Sun Δ、orb 單調、Ptolemaic | 7/6（展開約 774 案） | **外部**：未具名「mainstream online progressed-chart calculator」（:4-7,40）；其餘公式／不變量 | 外部比對 <180 s（:175,208）；公式 2e-3 日（:221）；solar arc 1e-6 | 無 |
| test_relationship_score.py (頭) | 合盤分數工廠規則 | 64/1 | 規則回歸 | — | 無 |
| test_relationship_score_v2.py | v2 評分數值規則；**自稱非完整 reference oracle**（:1） | 28/16 | 測試內獨立區間實作（:211） | — | 無；用 subprocess 驗惰性載入 |
| test_relocated_chart.py (頭) | 重定位星盤（宮／角度隨地點變、行星不變） | 43/2 | 不變量＋後端自比 | 1e-9、1e-4、0.01 | 無 |
| test_report.py (頭) | ReportGenerator：各類報告＋黃金文字快照 | 142/17 | **自產回歸**：`tests/fixtures/*.txt`，以 `uv run poe regenerate:reports` 重產（:74-90） | 非數字骨架須完全相同；數字 0.01（:74）/0.02（:1186） | 約 29 處「Fixture … not found」缺檔即 skip（:1194-1708）；月相總覽快照 swisseph 跳過（:916、:1308）；:2292 libephemeris sealed-mode |
| test_resource_limits.py (頭) | 子行程樹記憶體上限、清理、串並行預設 | 18/5 | 行為；用 subprocess | — | 10 處 `os.name != "posix"` skip（:121-379），Windows 全跳 |
| test_retrograde_periods.py | 2025-03 金星／水星逆行段被範圍截斷 | 12/0 | 已知事件（金星 3/5 已逆行、水星 3/15 轉）未註出處 | 日級；1 秒界 | 無 |
| test_retrograde_stations.py | 水星 2026 六個留；2/26 雙魚 SR 等 | 19/2 | 已知事件日期（未註出處）＋不變量 | 日級；15–30 日一對 | 無 |
| test_review_regressions.py (頭) | 全碼審查發現之缺陷回歸；兩個 guard 測試 | 23/3 | 回歸 | ≤37.0 | :300 附近 Skyfield 內部錯誤回歸（非依賴） |
| test_rust_backend.py | v4 原生後端契約；乾淨直譯器不得載入 skyfield／jplephem／numpy | 4/2 | subprocess 探針 | — | 整檔 `skipif BACKEND_NAME!="libephemeris"`（:15） |
| test_settings.py (頭) | settings 載入、深拷貝、棄用 | 48/2 | 結構 | — | 無 |
| test_sidereal_model_contract.py | 原生 v4 視恆星時 vs **Skyfield** IAU GAST，11 個年份（-500…2200） | 1/1 | **外部**：Skyfield builtin 時間表（:27-30） | `POSITION_TOLERANCE`=1e-2°（tests/core/conftest.py:23） | skipif 非 libephemeris（:17）；`importorskip("skyfield.api")`（:27） |
| test_sign_ingresses.py | 太陽 2026 十二入宮（春分 3/20、夏至 6/21）；冥王 2023-06-11 逆行回摩羯、2024-11-19 入水瓶；水星 1970-01-04 雙穿越 | 27/2 | 已知天象日期（未註出處）＋不變量 | 日級（startswith 日期） | 無 |
| test_sign_periods.py | 連續停留星座段被截斷 | 13/2 | 已知（2026-03 春分）＋不變量 | 1 秒界 | 無 |
| test_snapshot_requirements.py | 缺 Chiron 等單一天體失敗不可偽稱完整快照 | 5/2 | mock | — | :79 skipif 非 swisseph |
| test_subject_factory_parametrized.py | 16+ 宮制、48 恆星模式、4 視角、500BC–2200AD、66°S–66°N | 18/19 | **自產回歸**：`load_expected_positions`（:120-200）；Lahiri ≈24° 粗檢（:732-754） | swisseph 0.15／libephemeris 1e-4（:133） | 缺資料 skip（:199-444）；範圍外 skip（:525）；pyproject.toml:198 忽略 |
| test_sun_times_altitude_invariant.py | 日出入上緣在折射地平線、正午時角=0、is_diurnal 翻轉 | 6/4（10 組格點 _GRID :65-76） | **外部（半獨立）**：Skyfield + DE421（:19-30,82-96） | 上緣 -33.59′ ±0.06′（:52,57）；時角 ±2 s（:63） | 模組級 `importorskip` skyfield、skyfield_data（:43-44）；:207 無日出入對則 skip |
| test_sun_times_anchors.py | 日出／日沒／正午 19 個全球案例對 **USNO＋IMCCE** 手抄值 | 6/4 | **外部**：USNO API 4.0.1＋IMCCE Miriade，2026-08-05 手抄（:1-21,60,79-175）；無再生腳本（:3） | 日出／正午 vs USNO ±45 s（:67）；三事件落在兩源包絡 ±60 s（:73）；|緯度|≤60°（:76） | 無 |
| test_sun_times_factory.py (頭) | SunTimesFactory 結構（羅馬、極地、9999 年） | 25/0 | 不變量（日長 14.5–15.5 h） | ≤9、≤7 | :255 核不到 9999 年則 skip |
| test_svg_focus_contract.py (頭) | `kr:*` 屬性字串契約（classic＋modern） | 30/20 | SVG 解析 | 1e-9 | :591 附近文字（非 skip） |
| test_timezone_correctness.py (頭) | 時區：tzdb 轉換區外、標準時前、不存在／重複牆鐘；1893 羅馬、1883 紐約 | 41/10 | 主機 tz 資料庫（zoneinfo）＋歷史事實手算 | 秒級 | :625 單一編碼主機 skip；結果依賴主機 tzdata |
| test_timing_factories_concurrency.py | 多執行緒下 EPHEMERIS_LOCK 保護（恆星／回歸線不互相污染） | 2/0 | 與單執行緒結果比 | 共享 deadline（:26-35） | 無 |
| test_transit_exactness.py (頭) | 過運精確時刻時間線 | 25/0 | 不變量 | rel 1e-3 | 無 |
| test_transit_refinement.py (頭) | 二分法精煉（v6.0） | 17/0 | 不變量 | ≤1 | 非地心視角略過為被測行為 |
| test_transits.py (頭) | TransitsTimeRangeFactory 整合 | 33/1 | 回歸／不變量 | — | 無；用 tmp_path |
| test_translation_coverage.py (頭) | 每個標籤在 10 語言皆有 | 6/5 | 反射 | — | 無 |
| test_triplicity_lords.py | Dorothean 三分主星（靜態表） | 7/2 | 靜態表 | — | 無 |
| test_uranian_planets.py (頭) | 漢堡學派 8 個假想行星 | 10/5 | 結構；SVG 輸出 tmp_path | 1.0° | 無 |
| test_utilities.py (頭) | utilities 全面（含宮位指派、百分比分配） | 166/9 | 回歸／不變量 | 1e-9、0.001 | 少數 |
| test_v512_features.py (頭) | v5.12：宮頭速度、22 恆星＋星等、48 恆星模式、ayanamsa | 43/13 | 目測已知值（Sirius -1.46、Canopus -0.74…；Lahiri 1990≈23.7） | 星等 ±0.2/0.3（:270-274）、ayanamsa ±0.5（:482） | 無 |
| test_v5_migration_errors.py (頭) | v5 舊名稱給可行動錯誤 | 13/2 | 結構 | — | 無 |
| test_void_of_course_moon_factory.py (頭) | 月空亡：結構、2025-01 窗數 12–15、末相位／入宮用後端重算 | 26/0 | 後端自比（:87-110） | 相位 <0.1°（:100）、入宮 <0.05°（:108） | :185 需 DE440 邊界核 |
| test_wheel_growth.py (頭) | 52 點大畫布時輪盤放大，普通盤位元組不變 | 9/6 | 自產黃金＋affine 推導 | 0.01、1.0 | :135 資料不足 skip |
| test_windows_job_creation.py | Windows 啟動器 job 物件（Win32 全 mock） | 2/1 | mock | — | 無 |
| test_zodiacal_releasing.py (頭) | 黃道釋放：Lennon Fortune 在摩羯，L1 序列連續、峰期 | 13/0 | 結構／不變量；PoF ≈2° 摩羯 | abs=2°（單處） | 無 |

## 2. 彙整

### 2a. 外部獨立基準（本半部）
1. **AstroPixels（Espenak）月相表**，365 筆手抄：`test_moon_phase_historical_verification.py:5-12,113-118`；±1°／illum ±8 點。
2. **USNO（API 4.0.1）＋IMCCE（Miriade rts）日出／日沒／正午**，19 地點案例，手抄於 2026-08-05：`test_sun_times_anchors.py:14-21,60,79-175`。日出、正午對 USNO ±45 s；三事件另需落在兩源包絡 ±60 s；僅 |緯度|≤60°。
3. **Skyfield（DE421）獨立檢查太陽地平線幾何**：10 格點，上緣 -33.59′ ±0.06′、正午時角 ±2 s：`test_sun_times_altitude_invariant.py:19-30,52-63`。作者自承 backend 本身建在 Skyfield 機制上，共模誤差看不到（:19-28）。
4. **Skyfield 視恆星時（GAST）**，11 個年份 -500…2200，容差 0.01°：`test_sidereal_model_contract.py:17-34`。僅 libephemeris 後端。
5. **外部線上推運計算器**（未具名）之次限推運星曆日：`test_reference_validation.py:4-7,40,175`（129 列，±180 s）、`test_predictive_factories.py:752-811`（12 列，±180 s）。注意：被驗的是「進行推運的星曆日期」，而 `test_reference_validation.py:214-221` 的公式測試證明該日期基本上就是 `natal_jd + Δ/365.2422`；**不驗行星黃經**。
6. **pyswisseph 實跑比 mean node**（僅 libephemeris 後端且裝了 pyswisseph）：`test_planetary_positions.py:327-345`，0.01°。
7. **教科書公式（Gansten）在測試內獨立以 math 計算**：`test_primary_directions.py:562-640`；釘住 35.0°（±0.05）、216.1°（±0.05）、34.5516°（±0.01）。
8. **硬編 Swiss 常數**：`test_nutation.py:77-80`（J2000 章動，1e-6°）；`test_nakshatra.py:195-200`（3 個日期 Lahiri 月亮黃經，0.01°）。這些常數對現用後端比，所以在 libephemeris 後端下算「對 Swiss 數字的釘值」，在 swisseph 後端下是自比。
9. **tz 資料庫**（zoneinfo）歷史偏移：`test_timezone_correctness.py`（依賴主機 tzdata）。
10. 弱外部：目測已知恆星星等 ±0.2/0.3、Lahiri≈23.7±0.5（`test_v512_features.py:270-274,482`）；天象日期錨點（太陽入宮 3/20、6/21；冥王 2023-06-11／2024-11-19；水星 2026-02-26 SR；木土大合 2020-12-21）以日級斷言（`test_sign_ingresses.py`、`test_retrograde_stations.py`、`test_mundane_aspects.py:13-23`），**來源未註明**。

### 2b. 只有自產回歸／後端自比的領域
- 行星位置、宮制、恆星模式、視角：`expected_positions.py` 等自產黃金（`test_planetary_positions.py:30-40`、`test_subject_factory_parametrized.py:120-200`）。
- 報告文字快照（`test_report.py:74-112`）與 SVG baseline（`test_optional_mark_baselines.py`、`test_wheel_growth.py`）。
- 行星交點、現象、月掩、月空亡、主限 speculum 的「Swiss regression」：註解寫 Swiss，實際呼叫 `ephe`（現用後端），非外部獨立（`test_planetary_nodes.py:110`、`test_planetary_phenomena.py:208`、`test_primary_directions.py:506-559`、`test_void_of_course_moon_factory.py:20,87-110`）。
- 回歸（return）：只驗回歸時 Sun/Moon＝natal（<0.1°／1e-3°），對自己的求解器做自洽，無外部時刻。
- 過運、相位、dignities／ZR／profection／receptions／triplicity：結構與不變量（Lennon 星盤＝repo 內 fixture）。
- 行星黃經本身：本半部**沒有對 JPL Horizons**（grep jpl/horizons 僅 `test_rust_backend.py:30` 的 import 探針字串）。

## 3. 「已知」的錯誤或遺漏
- 遺漏：日出測試**不只 USNO**，還有 **IMCCE**；且僅日出＋正午對 USNO ±45 s，日沒走「兩源包絡 ±60 s」，Tromsø 起 >60° 不做時間域宣稱（`test_sun_times_anchors.py:32-47,67,73,76`）。另有 Skyfield DE421 的獨立「角度」檢查（`test_sun_times_altitude_invariant.py`）。
- 遺漏：Skyfield 不只用於 ASC/MC，還用於**視恆星時**11 個年份（`test_sidereal_model_contract.py`）與日出幾何。
- 遺漏：**外部推運計算器**比對 129＋12 列（未具名來源）。
- 遺漏：`test_planetary_positions.py:327-345` 對 mean node 使用 pyswisseph 實跑（不是自產黃金）；與「libephemeris 對 Swiss 只比一個時刻」是不同測試，`test_backend_comparison.py` 在前半部，本報告未讀。
- 月相對照 AstroPixels（±1°）屬實，但：檔案自稱 **TEMPORARY VERIFICATION TESTS**、「驗證完成後移除」（:2-10）；朔望月界 docstring 寫 29.26–29.80，程式實際 29.84（:22 vs :81-82，註解 :79-80 解釋）；資料是 2001–2040 的**稀疏年份區塊**（完整年：2001、2005、2010、2015、2020、2025 等；其餘僅 1、7 月），非連續覆蓋；且 pyproject.toml:198 `test:core` 預設忽略此檔。
- 補充：「容差 0.01° 範圍的黃金」在 swisseph 後端放寬到 0.2°（`test_planetary_positions.py:133`）、subject 工廠 0.15°（`test_subject_factory_parametrized.py:133`）。

## 4. 測試揭露的已知限制／skip 註解
- 極圈：swisseph 後端不報緯度門檻，`Placidus` 等在 66°–門檻間「stays uncast」，作者稱此為後端真實限制（`test_polar_house_invariants.py:38-47`）；36 扇區環無法替換、只能夾住並聲明（:213）。
- 往回搜尋回歸僅 libephemeris；swisseph 須拋 `KerykeionException`（`test_planetary_return_backwards.py:8-13,37-40`；`test_planetary_return_roundtrip.py:41-44`）。
- 核檔範圍：DE440 邊界（`test_planetary_return.py:1321`、`test_void_of_course_moon_factory.py:185`）、9999 年（`test_sun_times_factory.py:255`）；conftest 依 Sun 可算性自動分 base/medium/extended（tests/conftest.py:94-118），swisseph 缺 TNO 檔時整批 skip（:164-193）。
- 日出時間域錨點上限 60°，原因寫明為條件數（`test_sun_times_anchors.py:39-47`）；兩觀測站日沒本身差約 2 分鐘（:27-30）。
- `test_reference_validation.py:16-20`：130 組交叉比對，1 組（1926 初中國）因「歷史時區」不一致排除；檔內實際 129 列。
- `test_relationship_score_v2.py:1`：自述「not a complete reference-output oracle」。
- 沒有任何 `xfail`；唯一 skip 密集處：`test_report.py`（缺 fixture 檔）、`test_planetary_positions.py`／`test_subject_factory_parametrized.py`（缺資料）、`test_resource_limits.py`（POSIX）。**缺 fixture／缺資料 skip 為靜默風險**：fixture 檔消失時綠燈不減，需 CI 檢查 skip 數。

## 5. 連網／寫 repo 外／金鑰
- 連網：無實連。`online=True` 僅出現在 `test_planetary_return.py:154-170`（缺 city/nation 時預期拋錯）與 :1255（`FetchGeonames.get_serialized_data` 以 monkeypatch 換成假值，:1246-1252）。pyproject.toml:152 的 `online` marker 為 GeoNames，預設 `-m 'not online'`；本半部未見標 online 的測試。Skyfield 測試用 builtin 時間表與 `skyfield_data` 內附 de421（`test_sidereal_model_contract.py:25`、`test_sun_times_altitude_invariant.py:82-86`），註解稱不需網路。
- 寫檔：僅 `tmp_path`（`test_native_path_compatibility.py:63-76`、`test_resource_limits.py:78-300`、`test_transits.py:100`、`test_uranian_planets.py:111-129`）；`test_native_path_compatibility.py` 設環境變數 `KERYKEION_EPHE_PATH`、`KERYKEION_LEB_MODE` 於 subprocess env，不寫 repo 外固定路徑。
- 金鑰：未見需要 API key／GeoNames username；`suppress_geonames_warning=True` 反覆出現即避開。
- subprocess：`test_resource_limits.py`（12 處）、`test_native_path_compatibility.py`(3)、`test_relationship_score_v2.py`(2)、`test_rust_backend.py`(2)、`test_windows_job_creation.py`(1，Win32 全 mock)。測試會起子行程與 `time.sleep(30)` 型背景程序（`test_resource_limits.py:235` 等），屬行程管理測試。
- 讀 repo 內檔：`test_resource_limits.py:77-80` 讀 `pyproject.toml`；`test_optimizer_dependency.py` 讀已安裝套件 metadata。

## 6. 結論數字
- 檔案 61；總行數 28,132；def test_ 合計 1634；parametrize 裝飾器 284。
- 實際整檔讀完 3 檔（約 321 行）；部分逐行讀 ~10 檔（約 1,300 行）；其餘靠檔頭＋ grep。未讀本體清單見開頭。
