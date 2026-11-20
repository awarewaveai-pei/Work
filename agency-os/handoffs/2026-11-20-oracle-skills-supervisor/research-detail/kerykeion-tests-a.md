# kerykeion tests/core 前 61 檔（字母序，LC_ALL=C）報告

根目錄：`D:\tmp\oracle-repos\g-battaglia_kerykeion\`，下文路徑一律相對此根。唯讀，只用 Read/Grep/Glob/wc/sed。

## 0. 我負責的清單與「實際讀到多深」

`tests/core/` 共 122 個 .py，按檔名 C-locale 排序取前 61（含 `__init__.py`、`conftest.py`、`svg_text_overlap.py` 三個非測試檔；最後一個是 `test_moon_phase_details_factory_mocked.py`）。清單檔：scratchpad `list.txt`。

61 檔：`__init__`, `conftest`, `svg_text_overlap`, test_agent_skill_contract, test_arabic_parts, test_aspects, test_astro_cartography, test_astrological_subject, test_astrological_subject_jyotish, test_backend_comparison, test_barycentric, test_baseline_freshness, test_bce_dates, test_chart_data_factory, test_chart_drawer, test_chart_parametrized, test_cli, test_composite_subject, test_context_serializer, test_coverage_cache, test_davison_composite, test_deep_check_regressions, test_dignities, test_diurnality_svg, test_docs_chart_previews, test_dominants, test_draw_planets, test_dynamic_fixed_stars, test_eclipses, test_ephemeris_backend_path, test_ephemeris_data, test_ephemeris_notes, test_ephemeris_provenance, test_ephemeris_tracing, test_every_baseline_has_a_reader, test_fetch_geonames, test_firdaria, test_gauquelin, test_glyph_playground, test_glyph_system, test_golden_charts_are_hermetic, test_grid_point_labels, test_heliacal, test_heliocentric_returns, test_house_comparison, test_house_number_spread, test_house_sector_wedges, test_houses_positions, test_http_dependency_security, test_json_dump, test_lilith_variants, test_local_space, test_lunar_phase_search_directions, test_lunar_phase_svg, test_lunar_phase_windows, test_lunations, test_memory_lifecycle, test_model_baselines, test_modern_cusp_dimming, test_modern_decluttering, test_moon_phase_details_factory_mocked。

**閱讀深度（誠實分級，沒有宣稱全部讀完）**

- 整檔讀完（14 檔）：`tests/core/conftest.py`(297)、`tests/core/svg_text_overlap.py`(125)、`tests/core/test_model_baselines.py`(287)、`tests/core/test_backend_comparison.py`(285)、`tests/conftest.py`(731)、`tests/data/` 的 `compare_svg_lines.py`(232)、`ephemeris_requirements.py`(43)、`golden_drive.py`(237)、`golden_places.py`(71)、`model_fixtures.py`(222)、`model_oracle.py`(53)、`native_path_probe.py`(161)、`reference_recipes.py`(127)、`regeneration_guard.py`(75)。合計約 2946 行。
- 部分讀（開頭約 40 行 docstring/fixture/import + 針對性 grep + 關鍵段落）：其餘 57 個 core 檔 + `tests/data/test_subjects_matrix.py`（只讀 1–120/817）。其中較深的段落：test_bce_dates 40–165/198–235/430–470/660–735、test_astro_cartography 236–300、test_astrological_subject 1205–1245/2965–3010/2230–2250/2430–2550、test_eclipses 190–200/392–460、test_lunations 120–200、test_lunar_phase_windows 170–215、test_moon_phase_details_factory_mocked 870–1000、test_houses_positions 1–130、test_dominants 45–75、test_aspects 85–135、test_arabic_parts 736–784、test_chart_drawer 56–130、test_chart_parametrized 30–70。
- **測試函式本體內的斷言細節大多沒逐行讀**（61 檔合計 38,819 行，`def test_` 共 2242 個，`parametrize` 出現 261 次）。下表「案例數」是 grep 計數，不是人工核對；`parametrize` 欄是裝飾器出現次數，每個展開成幾個 case 多數沒數（house×subject、subject×part 這類是乘積，實際數百）。
- 未讀（只用 wc 報行數）：`tests/data/expected_*.py`（arabic_parts 2264、astrological_subjects 772、natal_aspects 855、positions 14974、synastry_aspects 1569）、`tests/data/configurations/`；只讀了前 12 行確認檔頭是「auto-generated」。`tests/data/__init__.py`(11)、`tests/__init__.py`(5)、`tests/core/__init__.py`(0) 未讀。

## 1. 逐檔表

欄位：def test_ 數 / parametrize 裝飾器數。基準來源：自產＝以本專案程式（libephemeris）產生的黃金檔回歸；不變量＝性質/結構檢查，無數值基準；mock＝monkeypatch 後測邏輯。「讀」欄：全＝整檔、部＝部分。

| 檔（行數） | 測什麼 | def/param | 基準來源 | 容許誤差 | skip 條件 | 讀 |
|---|---|---|---|---|---|---|
| `conftest.py`(297) | 共用 fixture、容差常數、SVG 良構檢查 | 0/0 | — | POSITION 1e-2°、SPEED 1e-4、DECL 1e-2、ORB 1e-2、百分比 ±2 (`conftest.py:23-27`) | `reference_backend_only` marker 在非 baseline backend 時 skip (`conftest.py:274-297`) | 全 |
| `svg_text_overlap.py`(125) | 工具：偵測同基線文字重疊 | 0/0 | 以 `estimate_text_width` 估寬 | TOUCH_TOLERANCE 0.5px (`:48`) | — | 全 |
| test_agent_skill_contract(325) | skills/kerykeion 的 frontmatter、授權、版本釘、腳本能跑 | 13/8 | 檔案/文字不變量 | — | — | 部 |
| test_arabic_parts(784) | 阿拉伯點公式、日夜判斷、golden 絕對位置 | 55/8 | 公式不變量 + 自產 `expected_arabic_parts.py`（註解稱 DE441 產生 `:737-740`） | 0.01°（swisseph 0.2°）(`:765`)、少數 0.1 | `EXPECTED_ARABIC_PARTS` 空則 skip (`:767`)；swisseph 時不比 sign (`:780`) | 部 |
| test_aspects(1862) | 本命/合盤相位、相位進出(movement) | 147/16 | 自產 `expected_natal_aspects.py`/`expected_synastry_aspects.py`＋手寫特例 | 位置 1e-2°（swisseph 0.15°）(`:~40`)；相位數 swisseph 容 ±5 (`:~106`) | 資料缺 skip；swisseph 時整體逐項比對 skip (`:122`)；Pluto–Chiron 邊界 skip (`:168`) | 部 |
| test_astro_cartography(357) | ACG 線（MC/IC/ASC/DSC）、in-mundo 真赤經 | 20/6 | 不變量＋用 `ephe` 自己算的赤經/高度角交叉檢查（`:285-300` Sun ASC 線上高度≈0） | 經度 0.01°；Sun 地平高度 ≤0.2° (`:300`) | — | 部 |
| test_astrological_subject(3263) | Subject 工廠：golden 位置、LMT、DST、極區、online/mock | 160/9 | 自產 `expected_astrological_subjects.py`（檔頭 "Auto-generated"）＋手寫（Einstein LMT） | `_POS_TOL` 0.15°（swisseph）/1e-2、速度 0.05/1e-4、宮 `_STRICT_HOUSE` (`:3-6`)；JD 精確相等 | `@pytest.mark.online` 僅 `:2435` 一處；極區 backend 無 error type skip (`:3025`) | 部 |
| test_astrological_subject_jyotish(436) | Lahiri 恆星 + 整宮 golden | 32/0 | 自產 `EXPECTED_JYOTISH_SUBJECT` | 1e-2×59 | 無 | 部 |
| test_backend_comparison(284) | Swiss vs libephemeris 同一時刻比較 | 14/3 | 兩 backend 互比（單一 JD `:48`） | 行星 0.01、月 0.02、冥 0.02、真交點 0.1 (`:86-96`)；速度 0.01°/日 (`:119`)；緯度 0.01 (`:133`)；ASC/MC 0.02 (`:176,186`)；12 宮 0.05 (`:197`)；Sun 0.02/Moon 0.05 (`:272,280`) | 兩庫未同時安裝 skip (`:40`) | 全 |
| test_barycentric(189) | Barycentric 視角位移 | 8/0 | 不變量（與地心比較位移大小） | 角差量級 | Sun 因缺 `sepl_18.se1` 為 None 時 skip (`:77-80`) | 部 |
| test_baseline_freshness(406) | 每個 SVG 基準含完整資訊面板列 | 9/3 | 以模板結構為準（不比繪圖） | — | `CANNOT_REGENERATE_HERE`（目前空 `:69`） | 部 |
| test_bce_dates(761) | BCE 日期：JD、LMT、ISO、星位、SVG | 42/12 | 自產 libephemeris baseline（`:50-110` 寫 "libephemeris, computed once"）＋Swiss vs lib 太陽互比 | 黃經 0.5° (`:49`)；JD 1e-3；太陽互比 0.1° (`:687`，註解稱 Meeus 多項式 vs 完整星曆) | 大量 `@extended`（非 extended tier skip）；`reference_backend_only`；`both_installed`；kernel 不可算 skip (`:681`) | 部 |
| test_chart_data_factory(1193) | ChartDataFactory 各型 | 84/0 | 不變量/結構 | 1e-6 | — | 部 |
| test_chart_drawer(4003) | ChartDrawer 各型 SVG golden + 選項 | 332/8 | 自產 SVG 基準 → `compare_svg_file` | 數字 abs 1e-4，rel 0（`compare_svg_lines.py:49-52`）；僅 baseline backend 比數字 | `@extended`、`reference_backend_only` (`:1560-1563`)、`skipif` `:908` | 部 |
| test_chart_parametrized(372) | 25 時間×16 地點×主題/宮制 SVG golden | 9/14 | 自產 SVG | 同上；舊 rel_tol=0.5 只剩註解 (`:119`) | 預設 `test:swe` 任務 ignore 本檔 (`pyproject.toml:229,235`) | 部 |
| test_cli(2128) | `kerykeion[cli]` CLI | 166/14 | 與 model_dump_json 恆等（不用 golden，`:3-8`） | — | libephemeris 未裝 skip (`:690`) | 部 |
| test_composite_subject(2550) | 中點/Davison 合成盤 | 125/24 | 不變量（中點公式） | 1e-9×50、1e-6×13、1e-4×6 | — | 部 |
| test_context_serializer(1838) | XML context 序列化 | 92/1 | 結構 | — | — | 部 |
| test_coverage_cache(81) | coverage 查詢不快取 | 5/1 | mock | — | — | 部 |
| test_davison_composite(389) | Davison 盤 | 25/1 | 不變量 | 0.01° | 部分 `@extended` (`:257-283`) | 部 |
| test_deep_check_regressions(140) | 恆星盤方位/Gauquelin 不隨黃道變、fold DST | 10/0 | 不變量（tropical vs sidereal 方位差<0.01°） | 0.01° / 1e-6 | — | 部 |
| test_dignities(347) | 古典尊貴表完整性/判定 | 32/0 | 手寫表 | — | — | 部 |
| test_diurnality_svg(1489) | 日/夜行行 SVG | 61/23 | 字串/結構 | — | — | 部 |
| test_docs_chart_previews(198) | README 預覽、轉換選項 | 16/4 | 合成輸入 | — | CairoSVG/PIL 缺則 skip (`:140-141`) | 部 |
| test_dominants(536) | Almuten、現代加權、元素平衡 | 33/0 | 手算：Lennon 五地點 vs 庫內 `dignities.data` 表 (`:51-75`，Saturn 19、Mercury 17…) | 百分比和 100±0.5 (`:245`) | — | 部 |
| test_draw_planets(1281) | 行星字符排版/去疊 | 76/0 | 結構 | — | — | 部 |
| test_dynamic_fixed_stars(674) | 固定星動態加入 | 38/2 | 不變量 | 1e-6/0.01 | `skipif` `:524` | 部 |
| test_eclipses(560) | 日月食搜尋、分類、Saros | 52/3 | 外部事實（未具名）：2025-03-14 月全食 umbral 1.178、penumbral 2.262 (`:435-441`)；其餘不變量/mock | 0.01 | — | 部 |
| test_ephemeris_backend_path(176) | EPHE_DATA_PATH 解析（子行程） | 12/0 | 子行程環境探針 | — | pyswisseph 未裝 skip (`:90,138`) | 部 |
| test_ephemeris_data(1104) | EphemerisDataFactory | 57/6 | 不變量（太陽 30 天 28–32° `:257`） | 1/86400 s | `@medium` (`:122`) | 部 |
| test_ephemeris_notes(215) | 頁尾限制揭露不改繪圖 | 12/12 | SVG 結構 | — | — | 部 |
| test_ephemeris_provenance(337) | 來源標示、sealed LEB | 11/2 | mock + provenance 表 | — | 非 libephemeris skip（多處）；非 medium tier skip (`:26`) | 部 |
| test_ephemeris_tracing(126) | trace scope 還原 | 3/5 | 行為 | — | 非 libephemeris skip (`:23,87`) | 部 |
| test_every_baseline_has_a_reader(145) | 每個 SVG 基準都被某測試讀 | 3/0 | 以 `golden_drive` 實跑統計 | — | — | 部 |
| test_fetch_geonames(308) | FetchGeonames 與快取 | 25/0 | 線上測試 vs 假資料 | 精確字串（如 lat "41.89193" `:~40`） | online 測試 `@pytest.mark.online` (`:27`) | 部 |
| test_firdaria(189) | Firdaria 週期 | 13/0 | 不變量（75 年週期連續） | ±1 日 (`:68`) | — | 部 |
| test_gauquelin(443) | Gauquelin 36 sectors | 28/1 | 數學 + 不變量 | 0.01°、1e-3 | — | 部 |
| test_glyph_playground(261) | 遊樂頁 diff round-trip | 11/8 | 真實渲染 | — | — | 部 |
| test_glyph_system(335) | 字符目錄/模板一致 | 19/0 | 目錄 vs 模板 | 0.001/0.01 | 字型快取冷時 skip (`:263`) | 部 |
| test_golden_charts_are_hermetic(146) | 黃金圖不得連網 | 2/3 | 禁網 monkeypatch | — | — | 部 |
| test_grid_point_labels(103) | 格點名稱縮寫 | 7/2 | 結構 | — | — | 部 |
| test_heliacal(434) | 偕日升落 | 34/6 | 不變量/mock（`ephe.heliacal_ut`） | 無數值基準 | 非 medium 2650 邊緣 skip (`:403`) | 部 |
| test_heliocentric_returns(448) | 日心回歸、節點穿越 | 37/0 | 不變量（回歸時黃經=本命） | 角度容差（未逐一讀） | 不支援倒搜 skip (`:394`) | 部 |
| test_house_comparison(262) | 互換宮位工具 | 10/0 | 結構 | — | — | 部 |
| test_house_number_spread(663) | 宮號散開 | 26/3 | 幾何 | 1e-9/1e-6/0.5px | — | 部 |
| test_house_sector_wedges(1183) | 宮區楔形 vs 宮線 | 28/13 | 幾何 | 1e-12…1e-4 | — | 部 |
| test_houses_positions(414) | 宮頭 golden（時間×地點×12 宮） | 16/7 | 自產 `expected_positions.py` ＋ v4 overlay | 0.01°（swisseph 0.2°）(`:78`)；個別 0.1 | 模組缺資料 `skip(allow_module_level)` (`:33`)；缺項 skip（多處） | 部(1–130) |
| test_http_dependency_security(20) | certifi/urllib3 版本下限 | 1/1 | metadata | — | — | 部 |
| test_json_dump(113) | model_dump_json 內容 | 24/0 | 手寫值（JD 2449270.97 round 2） | round(…,2) | 無 | 部 |
| test_lilith_variants(261) | Lilith/Priapus | 17/0 | 不變量 | — | 緯度太小 skip (`:255`) | 部 |
| test_local_space(165) | 方位/高度（azalt） | 11/0 | 直接呼叫 `ephe.azalt` 對照（`:106,129`） | 未逐一讀 | — | 部 |
| test_lunar_phase_search_directions(78) | 月相搜尋方向 | 1/2 | 性質式（角度誤差 ≤0.0015° `:~24`、朔望間隔 29–30 日） | 0.0015° | — | 全（60/78） |
| test_lunar_phase_svg(109) | 8 個月相圖標 | 5/0 | 自產 `Moon Phases.svg` | 同 SVG | — | 部 |
| test_lunar_phase_windows(370) | 月相名稱窗口 | 13/6 | 邊界 ±0.001°；「2026-08-28 04:18:32 UTC 滿月」取自 LunationFinderFactory (`:~176`) 自產 | 0.001° | — | 部 |
| test_lunations(244) | 朔望搜尋 | 25/2 | 不變量；「2026-08-12 新月 ~20° Leo」(`:125-134`) 手寫事實 | 年內朔望數 48–51、位置 19–21° | — | 部 |
| test_memory_lifecycle(110) | reader 重用、路徑 | 4/7 | mock | — | `skipif` `:38` | 部 |
| test_model_baselines(287) | v4 模型基準的雜湊清單、Skyfield ASC/MC | 20/3 | SHA256 清單 + 獨立 Skyfield 幾何 (`:188-195`) | 0.01°（`POSITION_TOLERANCE`） | `@extended` + 非 libephemeris skip (`:185-186`) | 全 |
| test_modern_cusp_dimming(190) | 宮線變暗 | 11/0 | 幾何 | 1e-6 | — | 部 |
| test_modern_decluttering(1379) | 行星去擁擠 | 38/8 | 對獨立 PAVA 實作 (`:442-472`) | 1e-9 | — | 部 |
| test_moon_phase_details_factory_mocked(1333) | MoonPhaseDetails 工廠（mock + 真實類別） | 62/4 | mock；真實類：Greenwich 2026-08-28 月出 18:56:01 / 月落 05:15:21 UTC「independently checked」(`:933-945`，來源未具名) | ±1 秒 (`:944-945`) | 2649 年超 base kernel skip (`:1131`)；sealed-LEB 僅 libephemeris (`:1159`) | 部 |

tests/data 輔助檔（全讀）：

- `compare_svg_lines.py`：唯一的 SVG 比較器。結構（行數、數字個數、去數字骨架）必須完全一致；數字 `max(rel*|b|, 1e-4)`，rel 預設 0 (`:46-52,149-154`)。數字僅在 `BASELINE_BACKEND="libephemeris"` (`:44`) 比；其他 backend 只比結構然後 `pytest.skip` (`:227-232`)。缺基準會 FAIL (`:201-205`)。
- `model_oracle.py`：Skyfield 獨立 ARMC/obliquity/ASC/MC，`|lat|>=60` 直接 raise (`:36-37`)；僅 `skyfield` `load.timescale(builtin=True)` (`:20`)。
- `model_fixtures.py`：版本→模型選擇；libephemeris 3.x → 舊基準 (`:34`)，4.0.0b1…4.0.0 → `libephemeris-4.0.0b1` 凍結集（SHA256 驗證 `:45-63`），其他版本 raise (`:40`)。
- `golden_places.py`：18 個城市座標凍結（GeoNames 當時答案），避免黃金盤連網 (`:1-71`)。
- `golden_drive.py`、`regeneration_guard.py`、`reference_recipes.py`、`ephemeris_requirements.py`、`native_path_probe.py`：驅動/防呆/重建配方/Swiss 缺點判定/原生路徑探針（後者建 tempdir，`:21`，無下載）。
- `test_subjects_matrix.py`：24+ 時間受試者(含 -500 年)、地理受試者、20 恆星模式；`SIDEREAL_MODES` 約 20 個而庫定義 48（`tests/conftest.py:464-469` 註解）；PERSPECTIVE_TYPES 只涵蓋 4 個地面視角、庫定義 11 個（`tests/conftest.py:501-506`）。

## 2. 彙整

### 2.1 外部獨立基準（我這一半看得到的）

1. **Skyfield 1.54 ASC/MC 獨立幾何**：`tests/core/test_model_baselines.py:188-195` ＋ `tests/data/model_oracle.py:28-53`。比對對象 38 個受試者（manifest `independent_qualification.subject_ids`，含 oslo_60n 緯度 59.91、ushuaia 54.80，無極區）。容許 0.01°，manifest 記錄實測最大誤差 ASC 0.00026°、MC 0.00017°。**範圍細節（對「已知」的補充）**：只在 `@extended` tier、只在 libephemeris backend 跑 (`:185-186`)；測試只斷言 ASC 與 MC，**沒有斷言宮頭與速度**——宮頭/速度的獨立檢查在 `scripts/generate_v4_model_baselines.py:164-182`（產生基準時跑，結果寫進 manifest），且宮頭參考是「LibEphemeris 3.2.2 公開 `houses_armc` + 獨立定向輸入」（manifest `house_geometry`），不是第三方庫。Skyfield 只提供恆星時/真黃赤交角，行星位置沒有。
2. **Swiss vs libephemeris**：`tests/core/test_backend_comparison.py`（單一時刻 `JD_LENNON` `:48`；容差見 §1 表）＋ `tests/core/test_bce_dates.py:687`（4 個 BCE 日期，太陽 0.1°，`@extended`）。兩庫須同時安裝才跑 (`:40`)。
3. **`ephe.azalt` 對照**：`test_local_space.py:106,129`、`test_astro_cartography.py:285-300`——用同一個 backend 的另一個函式交叉檢查，不是第三方。
4. **手寫外部事實（來源都沒具名）**：
   - 2025-03-14 月全食 umbral 1.178 / penumbral 2.262（±0.01）`tests/core/test_eclipses.py:430-441`。
   - Greenwich 2026-08-28 月出 18:56:01 / 月落 05:15:21 UTC，「independently checked」±1 秒 `tests/core/test_moon_phase_details_factory_mocked.py:933-945`；註解稱觀測站緯度 51.4779（`:884-886`）。
   - 2026-08-12 新月約 20° Leo（19–21°）`tests/core/test_lunations.py:125-134`，及 Lahiri 下落入 Cancer (`:186-195`)。
   - Einstein 1879 LMT：「astro.com uses Ulm's longitude (+00:39:58 → 10:50 UTC)」斷言 `10:50:02` `tests/core/test_astrological_subject.py:1215-1224`（只驗時間轉換，不驗星位）。
5. **手算/公開表**：`test_dominants.py:51-75` Almuten 分數（來源是庫內 `kerykeion.dignities.data` 表，非外部數據）；`test_dignities.py` 表完整性。
6. **`test_arabic_parts.py` 等的「golden」不是外部基準**（見 2.2）。

### 2.2 只有自產回歸的領域

- 行星/角/宮位的 golden：`expected_positions.py`、`expected_arabic_parts.py`（`tests/data/*.py` 檔頭 "auto-generated by scripts/regenerate_all.py"）→ `test_houses_positions.py`、`test_arabic_parts.py:741-784`、`test_astrological_subject*.py`、`test_aspects.py`（相位 golden 由 `expected_natal_aspects.py`/`expected_synastry_aspects.py`）。唯一例外是上述 Skyfield 對 ASC/MC。
- 所有 SVG（`test_chart_drawer`、`test_chart_parametrized`、`test_bce_dates` SVG 部分、`test_lunar_phase_svg`、`test_optional_*` 不在我這半）：自產基準，數字僅 libephemeris 比。
- 日月食、朔望、回歸、偕日升落、Gauquelin、Local Space、Firdaria、Dominants、合成盤、ACG、Lilith/Priapus、固定星、恆星模式（ayanamsa 數值我這半沒找到外部對照，`test_astrological_subject.py:565` 只有 Lahiri 回歸）：以不變量/性質/回歸為主，沒有外部星曆表數值。
- 行星黃經沒有對 JPL Horizons（本半 grep `horizons|jpl|nasa|usno|meeus` 只命中 `test_bce_dates.py:687` 註解、`test_ephemeris_provenance.py:103,332-333` 的 provider 名稱字串，與數值比對無關）。

### 2.3 「已知」是否有誤或遺漏

沒有發現「已知」寫錯的地方，但有遺漏：

1. **Skyfield 範圍**：只有 ASC/MC，且僅 `@extended` + libephemeris 才會跑（`test_model_baselines.py:185-186`）。base/medium tier 或 swisseph 時這個獨立檢查整個被 skip。宮頭/速度另在生成腳本裡驗，不在 pytest 裡。
2. **Swiss 容差在 golden 上遠寬於 0.01°**：swisseph 時位置 0.15°（`test_aspects.py:~40`、`test_astrological_subject.py:3`）、宮頭/阿拉伯點 0.2°（`test_houses_positions.py:78`、`test_arabic_parts.py:765`）、速度 0.05°/日；相位數容 ±5（`test_aspects.py:~106`）；阿拉伯點 sign 不比 (`test_arabic_parts.py:780`)；逐項相位比對直接 skip (`test_aspects.py:122`)。這是「Swiss 能過 golden」的真實鬆緊度，與 libephemeris 對 Swiss 單一時刻的 0.01/0.02 是兩回事。
3. **月相 AstroPixels / 日出 USNO**：本半只在 `test_lunar_phase_search_directions.py:26` 以註解提到 AstroPixels（只用來訂「朔望間隔 29–30 日」的性質界，非數值比對）；USNO 在本半 grep 零命中。這些外部比對若存在，應在另一半（如 `test_moon_phase_historical_verification.py`，不在我清單）。
4. **有外部事實但來源未具名**：月出月落 ±1 秒、月食食分 ±0.01、新月位置（§2.1 第 4 點）。這些是手貼的值，沒註明 NASA/USNO/timeanddate 之類。
5. 黃金基準名稱混用：`test_arabic_parts.py:737` 稱 "DE441-generated baseline"，但 `model_fixtures.py:34-42` 顯示舊基準來自 libephemeris 3.x 模型、v4 走凍結 `libephemeris-4.0.0b1` 覆蓋；`tests/core/conftest.py:108-122` 還有兩個同名 "Paul McCartney" 不同時間（14:00 vs 15:30）的 fixture 互相遮蔽。
6. `tests/conftest.py:69-91`：`KERYKEION_BACKEND=swisseph` 無 `.se1` 檔直接 `pytest.exit`；Swiss 上 TNO 測試以 regex 整批 skip (`:142-148,183-193`)。

### 2.4 測試揭露的已知限制 / xfail / skip

- **xfail**：本半 grep `xfail` 零命中。
- 限制註解：
  - Sun 在 barycentric 需 `sepl_18.se1`，缺則回 None (`test_barycentric.py:11,77-80`)。
  - libephemeris ≤2.0.2 的 inex 恆為 50 不可信 → 一律回 None；2027-02-06 環食不在 saros 表 → saros=None (`test_eclipses.py:~398-420`)。
  - 500 BC/200 BC 兩個 ephemeris 相差超過精度（相位進出軌道、元素數變）→ `reference_backend_only` (`test_bce_dates.py:470-473,493-496`)。
  - 極區：Placidus 在極圈內退而求其次並發 WARNING (`test_astrological_subject.py:~2990-3010`)；ASC/MC 獨立檢查要求 |lat|<60° (`model_oracle.py:36-37`)。
  - 月亮每約 30 天有一天沒有月出/月落，回傳 None (`test_moon_phase_details_factory_mocked.py:951-965`)。
  - 2649 年超出 base kernel (1849–2150)、sealed-LEB 範圍僅 libephemeris (`:1131,1159`)；heliacal 2650 邊緣 skip (`test_heliacal.py:403`)。
  - TNO 在 swisseph 需手動 `.se1` (`tests/conftest.py:133-141`)。
  - 工具/路徑：Priapus 緯度小到分不出 skip (`test_lilith_variants.py:255`)；倒搜不支援 skip (`test_heliocentric_returns.py:394`)。
  - 受試者覆蓋：恆星模式約 20/48、視角 4/11 (`tests/conftest.py:464-469,501-506`)。
- skip 條件總表：tier（`@extended` / `@medium` / subject 的 tier）、backend（`BACKEND_NAME != "libephemeris"`、`reference_backend_only`）、套件缺（pyswisseph、libephemeris、PIL、CairoSVG）、資料缺（expected 檔、字型快取冷）。

### 2.5 連網 / 寫檔 / 金鑰

- **連網**：
  - 明確標 `online` 的只有 `test_fetch_geonames.py:27`（整個 TestGeonamesOnline）與 `test_astrological_subject.py:2435`。預設任務都帶 `-m 'not online'`（`pyproject.toml:198,202…`）。
  - **未標 online 但會連 GeoNames 的**（因 `from_birth_data(..., "城市", "國碼")` 預設 `online=True`，`kerykeion/astrological_subject/factory.py:948`）：`test_astrological_subject.py:21-23`（`TestAstrologicalSubject.setup_class`，Owensboro/US）、`test_astrological_subject_jyotish.py:~8-20`（Owensboro/US）、`test_json_dump.py:7-9`（London/GB）；`test_astrological_subject.py:470-490`（`xdist_group` 但無 online mark，`online=True` 且無 mock）、`:1389-1410`（`online=True, geonames_username=None`）。這些在 `-m 'not online'` 下仍會執行 → 需要網路（或 `~/.kerykeion/cache` 既有快取）。其餘 `online=True` 的測試（`:2332` patch、`:2500-2550` `_mock_geonames` monkeypatch）已 mock。
  - 黃金 SVG 測試明確禁網：`test_golden_charts_are_hermetic.py` 以 `_NetworkWasAsked`（`:38-45`）擋；座標用 `golden_places.py`。`test_ephemeris_provenance.py:323-324` 封 socket。
- **金鑰**：不需要使用者提供金鑰。GeoNames 用函式庫內建預設帳號 `"century.boy"`（`kerykeion/geonames/fetcher.py:126`）；`test_astrological_subject.py:1856` 也寫死該帳號字串；`test_cli.py:1777` 清掉 `KERYKEION_GEONAMES_USERNAME` 環境變數；`test_fetch_geonames.py` 用假帳號 "test_user"。
- **寫檔到 repo 外**：
  - 多數寫 `tmp_path`（`test_cli.py`、`test_docs_chart_previews.py`、`test_model_baselines.py:59-85`、`test_chart_data_factory.py:846`）。
  - **會寫 `~/.kerykeion/cache/kerykeion_geonames_cache*`**：GeoNames 請求經 `requests_cache.CachedSession`（`kerykeion/geonames/fetcher.py:16,25`），上述未 mock 的連網測試會建立。`test_fetch_geonames.py:270` 設 `/tmp/test_cache` 只用 monkeypatch 環境變數。
  - `test_cli.py:43-50` 把 `XDG_CONFIG_HOME` 指到 tmp。
  - `test_agent_skill_contract.py:302` 以 `sys.executable` 實跑 skill 內附腳本（子行程）；`test_ephemeris_backend_path.py` 用子行程；`test_backend_comparison.py:243` 子行程各跑一個 backend。
  - 重建基準只有 `KERYKEION_REGEN_BASELINES` 設定時才寫 `tests/data/svg/`（`compare_svg_lines.py:177-197`，repo 內，非預設）。
  - `native_path_probe.py:21` 用 tempdir，非測試本體。
- 下載：`test_glyph_system.py:263` 明言「never downloads」。

## 3. 統計

- 清單 61 檔（含 3 個非測試輔助檔）：38,819 行；`def test_` 共 2242；`parametrize` 裝飾器 261 次。
- 整檔讀完：core 4 檔 + `tests/conftest.py` + `tests/data` 9 檔 = 14 檔、約 2946 行；`test_subjects_matrix.py` 讀 120/817 行。
- 其餘 57 個 core 檔：只讀開頭 + grep + 上列區段，**未逐行讀完**。每個檔的 docstring/fixture/基準來源/容差/skip 都已掃到（以 grep 保證涵蓋 `skip|xfail|importorskip|skipif|abs=|rel=|TOL`），但「測試本體內的個別斷言與期望值」多數沒讀；若 `heliocentric_returns`、`composite_subject`、`context_serializer`、`diurnality_svg`、`draw_planets` 等有隱藏的外部數值，我這份可能漏。
- 這份報告所有數字（案例數、容差）若與實際斷言不符，以原始檔為準。
