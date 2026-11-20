# kerykeion/charts 事實報告（唯讀；所有路徑相對 `kerykeion/charts/`）

## 6. 讀取範圍（先寫）
逐行讀完的 .py（Read 全文，行數 = Read 末行）：
- `__init__.py` 5、`ephemeris_notes.py` 164、`glyph_metrics.py` 189、`spreading.py` 197、`svg_metadata.py` 213、`glyph_ink_metrics.py` 725、`draw_planets.py` 1308、`draw_modern.py` 3331、`utils.py` 3644、`drawer.py` 6814
- .py 合計 16,590 行，全部讀完，無未讀 .py。
非 .py（任務範圍外，僅部分檢視，不可宣稱讀完）：
- `templates/chart.xml` 只讀 1–130 行（共 441）；`themes/classic.css` 全讀（188）。
- 未讀：`templates/wheel_only.xml`、`modern_wheel.xml`、`aspect_grid_only.xml` 全文，`themes/dark.css`、`black-and-white.css`。這些只用 Grep 查 license/font/http/script 字樣（見 §2）。
- 為驗證授權字樣另讀 repo 根 `NOTICE` 前 80 行（`D:\tmp\oracle-repos\g-battaglia_kerykeion\NOTICE:1-80`）。
- 未執行、安裝、建置任何程式。

## 1. 每檔做什麼
- `__init__.py:3-5` 只匯出 `ChartDrawer`。
- `drawer.py`（6814）：星盤 SVG 的總協調。
  - 設定 dataclass：`ChartDimensionsConfig:216`（預設寬高 870/1250/1570/1320 x 550）、`CircleRadiiConfig:242`（半徑 240；單盤 0/36/120；external 56/92/112）、`VerticalOffsetsConfig:402`、`GridPositionsConfig:493`。
  - 文字截斷／量測：`info_row_clear_width:336`、`truncate_to_width:365`。
  - 渲染策略類：`BaseChartRenderer:584`、`InfoSectionBuilder:726`；各盤種 `NatalChartRenderer:1201`、`CompositeChartRenderer:1311`、`TransitChartRenderer:1413`、`ProgressionChartRenderer:1699`、`SynastryChartRenderer:1767`、`SingleReturnChartRenderer:2027`、`DualReturnChartRenderer:2090`；登記表 `CHART_RENDERERS:2370`、工廠 `get_chart_renderer:2381`。
  - 公開類 `ChartDrawer:2400`：`generate_svg_string:6196`、`save_svg:6429`、`generate_wheel_only_svg_string:6480`、`save_wheel_only_svg_file:6558`、`generate_aspect_grid_only_svg_string:6607`、`save_aspect_grid_only_svg_file:6652`。
  - 後處理：`_apply_svg_post_processing:5375`（CSS 變數內嵌、svg_polish 壓縮、全域 `"`→`'`）。
  - 後注入 `kr:` metadata：`_rebase_glyph_centers:5979`、`_inject_projected_house_metadata:6002`、`_inject_analysis_metadata:6043`。
  - 檔案輸出：`_write_svg_to_disk:6357`。
  - `:6681` 起 `__main__` 示範區塊。
- `draw_modern.py`（3331）：「modern」同心環星盤，viewBox 100x100。
  - 五環半徑常數 `:61-90`；簇（planet cluster）尺寸檔 `ClusterProfile:651`、`GLYPH_SIZE_PROFILES:933`（small/medium/large）。
  - 環繪製：`_draw_zodiac_background_ring:1040`、`_draw_cusp_ring:1156`、`_draw_ruler_ring:1369`、`_draw_planet_ring:2024`、`_draw_house_ring:2803`、`_draw_aspect_core:2921`。
  - 避讓：`_resolve_planet_collisions:1615`；宮位／Gauquelin 熱區 `_draw_house_sectors_modern:2618`、`_draw_gauquelin_sectors_modern:2733`。
  - 進入點：`draw_modern_horoscope:3063`（單盤）、`draw_modern_dual_horoscope:3182`（雙盤）。
- `draw_planets.py`（1308）：classic 星盤的行星符號、重疊避讓、度數指示線。
  - `draw_planets:60`；`_calculate_planet_adjustments:296`；`_handle_two_point_group:411`；`_handle_multi_point_group:460`；`_determine_point_radius:526`。
  - 指示線：`_calculate_indicator_adjustments:580`；`_draw_primary_point_indicators:979`；`_draw_inner_point_indicators:1058`；`_draw_secondary_points:1133`；`_draw_external_natal_lines:920`。
- `utils.py`（3644）：classic 繪圖元件與格式化的雜燴。
  - 數學／座標：`wheel_x/wheel_y:767/787`、`degree_difference:706`。
  - 環與盤面：`draw_zodiac_slice:812`、`draw_house_sectors:951`、`draw_houses_cusps_and_text_number:1723`、`draw_aspect_line:1237`、`draw_degree_ring:1416`、`draw_transit_ring:1456`、`draw_*_circle:1476/1522/1549`。
  - 表格：`draw_aspect_grid:1573`、`draw_transit_aspect_grid:2609`、`draw_transit_aspect_list:1923`、行星格 `draw_main/secondary_planet_grid:2418/2507`、宮位格 `draw_main/secondary_house_grid:2112/2150`、Gauquelin `draw_gauquelin_unified_grid:2230`、`draw_gauquelin_sectors:3503`、`draw_gauquelin_sector_hit_areas:3579`、比較格 `draw_house_comparison_grid:2970` 等 4 個。
  - 月相：`make_lunar_phase:3271`。
  - 元素／性質分布計算：`calculate_element_points:2807`、`calculate_quality_points:3374`、synastry 版；權重表 `DEFAULT_WEIGHTED_POINT_WEIGHTS:221`。
  - 工具：`escape_svg_text:129`、`convert_decimal_to_degree_string:1340`、`format_datetime_with_timezone:2744`、`abbreviate_point_name:515`。
- `spreading.py`（197）：`isotonic_non_decreasing:38`（PAVA）與 `spread_around_wheel:62`（沿圓周把均勻尺寸／各自半寬的標籤用最小總位移法拉開）。用於宮位數字：`utils.py:1806,1829`、`draw_modern.py:2859`。
- `glyph_metrics.py`（189）：逐字元寬度表（取 Times／Helvetica／Arial Unicode 最大值，向上取 1/50 em）+ 無表字元的 256 碼位區塊上限；`estimate_text_width:171`。
- `glyph_ink_metrics.py`（725）：瀏覽器光柵化量測出的 modern 符號／文字「墨水」半寬半高與中心偏移表（資料檔，由 `scripts/measure_modern_separation.py` 產生，見 `:3-5`）。
- `svg_metadata.py`（213）：`kr:` 命名空間的屬性輸出 `point_state_attributes:84`，與反向解析 `parse_chart_points:163`、`parse_indicators:198`。
- `ephemeris_notes.py`（164）：選用的 SVG 頁尾註記（「不可用的星體／近似位置」），10 種語言標籤寫死於 `:14-25`；`collect_ephemeris_notes:43`、`append_ephemeris_notes:118`。

## 2. 繪圖資產來源（字型／字符／圖示／色票／範本）
- 字型：程式碼內不內嵌任何字型檔。全盤文字 `font-family` 固定為 `"Arial, Helvetica, Liberation Sans, sans-serif"`（`utils.py:103`；模板用 `$chart_font_family`，`drawer.py:5890`）。系統無該字型就由檢視端回退。
- 字符（glyph）：`<symbol>` 以路徑形式內嵌在 3 個 XML 範本（`templates/chart.xml`、`modern_wheel.xml`、`wheel_only.xml`），由 `scripts/build_chart_glyphs.py` 產生（`wheel_only.xml` 內 `GLYPHS:BEGIN … 手動勿改` 註解，Grep 確認；本 repo 未檢視該腳本）。
  - 範本首行授權字樣（三檔 Grep 同）：「Chart glyphs: Symbola (public domain) + Noto Sans Symbols 2 (SIL OFL 1.1) + Noto Sans (SIL OFL 1.1) + Kerykeion clean-room originals. See the NOTICE file.」（`templates/wheel_only.xml:1`；`chart.xml:1`；`modern_wheel.xml:1`）。
  - `NOTICE:19-63` 詳述：Symbola 用於十二星座、月水金火木土海、Chiron、Lilith/Priapus 系、四大行星小行星、逆行符號；Noto Sans Symbols 2（OFL 1.1）用於 Pholus/Sedna/Haumea/Makemake/Orcus/Quaoar/Eris 及 Uranian 八點；Noto Sans（OFL 1.1）用於 As/Mc/Ds/Ic/Vx/Av 六個字母標記；其餘（Sun、Earth、Uranus、Pluto、Ixion、四個月交點、White Moon、Interpolated Perigee、FixedStar、Midpoint、East Point、Arabic parts、全部相位符號）為「clean-room 原創」。
  - 相位符號 id 為 `orb0/30/45/60/72/90/120/135/144/150/180`（`wheel_only.xml` Grep 行 313-343）；星座 `Ari…Pis`；點位符號 id 與 `glyph_ink_metrics.py:44-101` 的 key 一致；`FixedStar`、`Midpoint` 為通用符號。
  - 我們只查到「宣稱」，未對路徑與字型輪廓做比對，授權正確性無法由本讀取證實。
- 圖示：僅上述 `<symbol>`；月相為純幾何（圓＋橢圓 lune 路徑）`utils.py:3271-3371`。無 `<image>`、base64、外部 URL（模板 Grep 只命中 xmlns 命名空間 URL）。
- 色票：由 `themes/{classic,dark,black-and-white}.css` 以 CSS 變數 `--kerykeion-*` 提供（`drawer.py:4576-4589` 讀檔後塞入 `<style>`）。`classic.css:1-188` 定義 paper-0/1、modern 環色、zodiac 背景色、相位色（conjunction `#5757e2`…opposition `#510060`，`classic.css:102-112`）、行星色、元素／性質百分比色。modern 繪圖另帶 fallback 十六進位（`draw_modern.py:556-584`）。classic 色由 `settings.chart_defaults` 的 `DEFAULT_CHART_COLORS` 等（本目錄外）傳入。
  - 例外：硬寫 `#F00` 的轉運環度數刻度（`utils.py:1410`）。
- SVG 範本：4 個 `string.Template`（`$var` 替換）：`chart.xml`、`wheel_only.xml`、`modern_wheel.xml`、`aspect_grid_only.xml`，由 `_load_cached_file`（`drawer.py:135`，`lru_cache(8)`）讀入。

## 3. 網路／檔案寫入／eval/exec／子程序／動態 import
- 網路呼叫：無（Grep `urllib|requests|socket|http.client` 在 charts/*.py 0 命中）。
- eval/exec/compile/pickle/importlib/`__import__`/subprocess/os.system：0 命中。
- 檔案讀取：`drawer.py:143` 以 UTF-8 讀套件內範本／主題；路徑固定在 `_MODULE_DIR`（`drawer.py:30`）。
- 檔案寫入：僅 `drawer.py:6419-6421`（`open(chartname,"wb")`），經 `_sanitize_output_basename:6335`（去 `/ \ \x00 ..` 與前導點）＋ `resolve().relative_to()` 檢查不逃出輸出目錄（`:6395-6402`）；預設目錄 `Path.home()`（`:6384`）。成功時 `print(...)`（`:6426`）。
- 其他副作用：`drawer.py:32` 匯入 `kerykeion.ephemeris_backend.backend.ephe`，`_get_zodiac_info` 呼叫 `ephe.get_ayanamsa_name`（`:4649`）；`drawer.py:33` 匯入第三方套件 `svg_polish.optimize`（`:5399`）。
- 函式內延遲 import（非動態 import，靜態字串）：`utils.py:409`（`kerykeion.fixed_stars.catalog.star_slug`）、`drawer.py:3116,3163`（`settings.chart_defaults.build_dynamic_*`）、`drawer.py:3308,4940,5157`（同包 utils）。
- `drawer.py:6681-6814` `__main__` 範例：用 `AstrologicalSubjectFactory.from_birth_data(... "Liverpool","GB")` 等建盤並存檔；是否連網取決於 charts 目錄外的工廠（本讀取未涉入）。僅 `python drawer.py` 直接執行才跑。

## 4. 繪圖裡的占星規則
### 相位線（classic）
- 選取：`drawer.py:5442-5472` 逐一走 `aspects_list`；以 `aspects_settings` 名稱查色，**查不到色／色為空就不畫**（`:5458-5459`）。相位本身（誰跟誰、容許度）來自 `chart_data.aspects`，目錄內不計算。
- 上色：線 `stroke:<settings color>; stroke-width:1; stroke-opacity:.9`（`utils.py:1334`）。
- 端點：`first_offset = -int(seventh) + int(p1_abs_pos)`（`utils.py:1268,1272`）即端點取整數度；半徑 `ar = main_radius - third_circle`（單盤 120 內圈；雙盤 `main_radius-160`，`drawer.py:630,636`）。
- 圖示：中點放 `orb<度數>` 符號；合相（0°）改放在圓平均角、半徑 `ar+4`（`utils.py:1280-1292`，用 sin/cos 平均處理 0/360 繞回）；同相位種類、距離 < 16px 的符號略過（`utils.py:1244-1245,1299-1310`）。
- separating 相位可選虛線（`show_aspect_movement`，`utils.py:1326-1330`，`SEPARATING_DASH_ARRAY = "5 3.2"`，`:78`）。
- orb 顯示：輪盤上不顯示 orb 數字；只寫入 `kr:orb`（`utils.py:1333`）。orb 文字僅出現在雙盤相位清單：`convert_decimal_to_degree_string(aspect["orbit"])` → `度°分'秒"`（`utils.py:2052`）。清單符號由 `aspects_settings[].degree` 決定（`utils.py:2042-2044`）；無設定的相位（例如 parallel）跳過符號，避免 `#orbNone`。
### 相位線（modern）
- `draw_modern.py:2921-3055`：色取自 settings、無色跳過（`:2962-2970`）；端點用**精確**度數（非取整）`:2976-2989`；線寬 0.32（`:104`）；符號 id 由寫死的 `ASPECT_DEGREE_MAP`（`:2905-2918`）決定，**不看 settings 的 `degree`**，未列名稱（如自訂相位）會有線無符號（`:2996-2997,3033`）；同種符號 < 8.0 單位去重（`:2959`）；separating 虛線 `"1.5 1"`（`:438`）。
- 相位格：`draw_aspect_grid:1573`（三角形，單盤）、`draw_transit_aspect_grid:2609`（NxN，雙盤；鍵為有序 (p1,p2)，p1=第一主體）；皆先濾掉 settings 沒有的相位（`:1615,2651`）。
### 宮位線／數字
- classic：每條宮線 `stroke-dasharray:3,2; opacity .4`（`utils.py:1909`）；ASC/MC/DSC/IC 用行星設定中同名點的顏色（`drawer.py:4835-4855` `_axis_cusp_colors`，缺則 `houses_radix_line`）。
- 宮位偏移取整數度：`-int(first[6].abs_pos)+int(cusp)`（`utils.py:1842`）；數字位置為宮中點（依宮走向 `house_spans` 處理極圈內逆向宮），再以 `spread_around_wheel`（`spreading.py:62`）依各自 |sin|/|cos| 投影出的半寬拉開（`utils.py:1690-1720,1806-1810`）。
- 不可點擊的薄宮處理：`MINIMUM_WEDGE_SPAN_DEGREES=1.0`（`utils.py:868`）、`separate_collapsed_wedges:872`；重疊環時「窄的畫在上」（`utils.py:1166-1170`；modern 同 `:2724-2728`）。
- modern：角宮（1/4/7/10）線寬 0.6，其餘 0.07（`draw_modern.py:113-114`）；有讀數壓過的宮線段改成純色淡色（`_reading_span_on_line:2383`、`_cusp_line_svg:2436`）；cusp 環讀數過擠時三段式處理：縮放→兩軌交錯→下限 `CUSP_MIN_SCALE=0.62`（`:1211-1237`、`_cusp_lanes:218`）。
- Gauquelin：36 扇區替代 12 宮（`utils.py:3503`、`draw_modern.py:1995,2524,2580,2733`），有 `gauquelin_sector` 才啟用（`drawer.py:4933-4970`）。
### 行星重疊避讓
- classic（`draw_planets.py`）：
  - 行星按黃經排序，相鄰距離 < `PLANET_GROUPING_THRESHOLD=3.4°`（`:40`）視為一組，從最大空隙之後開始掃（處理 0/360 繞回，`:340-352`）。
  - 2 點組：依兩側餘裕分 5 種位移（`:429-457`）；≥3 點組：以 `needed_space = 3t + 1.2(n-1)t` 均分，空間不足則平均分配（`:475-514`）。
  - 兩條半徑車道交替（單盤 94/74；雙盤 130/110；external_view 全為 10 並畫兩段連接線 `:526-572,920-971`）。
  - 度數指示線另有 `INDICATOR_GROUPING_THRESHOLD=2.5°` 的分組與固定位移表（主：2→±1.5；3→−2/0/+2；4→−3/−1/+1/+3；≥5→1.5 間隔 `:675-703`；外環：較緊 `:706-745`）。
  - 縮放：雙盤或 external 為 0.8（`:179`）。**位置也取整數度**：`int(point_degree + adjustment)`（`:523`）。
- modern（`draw_modern.py:1615-1894`）：
  - 內容感知：每個簇按列（glyph/度/星座/分/RX）算墨水半寬半高（`:1474-1523`，表在 `glyph_ink_metrics.py`），逐對依兩簇所在方位取較省的那軸（水平看寬、垂直看高）換算成度數（`_pair_required_separation:1564`），上限 `PLANET_MIN_SEPARATION=7.75°`（`:150`；雙盤 5.75/9.0，`:530-531`；small/large 另有值）。
  - 放置：沿最大空隙切開，對（座標−累積間距）做最小平方保序迴歸（PAVA）→ 擁擠群以真位置為中心展開（`:1697-1790`）。
  - 圓周總量 > 320° 時先壓縮「空氣」（clearance 二分法 40 步，預設 0.45）再等比壓縮（`:1442,1825-1852`）。
  - 迭代到每對需求不再增加，上限 32 輪，未收斂則 `logger.warning`（`:1860-1889`）。
  - 偏離真位置 ≥ 0.5° 時畫「弧形 tether」連回真度數（`STRAIGHT_TETHER_THRESHOLD:461`、`_draw_indicator_line:1897`）。
### 雙盤／合盤／行運盤差異
- 常數：`DOUBLE_CHART_TYPES = ("Synastry","Transit","DualReturnChart","Progression")`（`utils.py:427`）。Composite、SingleReturn、Natal 為單盤（`drawer.py:3083`）。
- classic 雙盤：內環為第一主體（natal）、外環（transit ring）為第二主體；第一圈半徑 `r-36`、第二 `r-72`、第三 `r-160` 固定（`utils.py:1494,1539,1565`）；第二主體的宮線畫在 `r-36…r`（`utils.py:1869-1872`）；行星符號縮 0.5、車道半徑 26/18（`draw_planets.py:1205-1253`）；度數刻度改 72 條紅色（`utils.py:1386-1413`）。
- Transit 與 Synastry 差：Transit 的第二主體宮線／宮數字透明度 0，Synastry 為 .3/.4（`utils.py:1881,1889`）；Transit 不畫第二宮格（`drawer.py:1615`）、Synastry／DualReturn 畫兩個宮格（`:1903-1904,2246-2247`）；Transit/Progression 抬頭只用第二主體名並左移 50（`utils.py:2547-2551`）；Transit 外環排除「宮頭點」（`draw_planets.py:105,1189`）。
- 版面寬：Natal 870、Transit/Progression 1250、Synastry 1570（無比較格 1250）、DualReturn 1320（`drawer.py:233-238,1419,1773,2096`）；點 > 24 時雙盤改右側面板（`:2641`）。
- 比較格：Transit/Progression 單格「Transit Point / House Position」；Synastry 與 DualReturn 雙格（`drawer.py:1641,1929,2273`）。
- 資訊面板：Transit 與 Progression 同類渲染器（`ProgressionChartRenderer` 繼承 Transit，`:1699`）；Progression 還會在「同一時刻（iso utc）」判為象徵推運（solar arc）而隱藏 diurnality（`:1038-1061,1098`）。
- modern 雙盤：兩個等寬行星環（內環＝第一主體，`r 15.5–29.5`；外環＝第二主體，`r 29.5–R_RULER_INNER=44.652`），共用 cusp/ruler/house 環與第一主體的宮線，相位核心縮為 `r=12.5`（`draw_modern.py:313-331,3182-3331`）。不支援 Gauquelin（`draw_modern_dual_horoscope` 無該參數）。

## 5. 缺陷／與註解不符（皆有 file:line，已讀原文）
1. **整數度截斷與「精確位置」不一致**：classic 的相位線端點與行星角度用 `int()`（`utils.py:1268,1272`；`draw_planets.py:523`；宮扇區 `utils.py:1016`），線端最多偏約 1°；但合相符號用精確圓平均角（`utils.py:1287`），符號不一定落在線端上。modern 用精確值（`draw_modern.py:2976`），兩種風格在同資料下位置不同。程式內有承認（`utils.py:1006-1013` 的註解）但未統一。
2. **svg_metadata 文件與 classic 不符**：`svg_metadata.py:1-26` 稱三個序列器都輸出 `rotate(-ANGLE 50.0 50.0)`；實際 classic ChartPoint 用 `transform="translate(-…) scale(…)"`（`draw_planets.py:893`）、classic Indicator 根本沒有 transform（`:1045-1052`）。因此 `parse_chart_points/parse_indicators`（`svg_metadata.py:43-50,163,198`）對 classic 輸出一律解析不到。
3. **spreading.py 文件宣稱「兩處共用 PAVA」不實**：`spreading.py:3-20` 說 `isotonic_non_decreasing` 為二者共用；`draw_modern.py:1543` 自帶另一份 `_isotonic_non_decreasing`（回傳 block 而非展開列表），只匯入 `spread_around_wheel`（`:27`）。
4. **殘留／孤立註解**：`utils.py:72-77` 關於「兩個渲染器標示 station」的註解掛在 `SEPARATING_DASH_ARRAY` 之上，與其無關；`draw_modern.py:422-438` 同樣把 station 與虛線註解疊在 `HOUSE_NUMBER_FONT_SIZE` 上，並稱描邊 0.25，但 `ASPECT_LINE_WIDTH=0.32`（`:104`）。
5. **常數與 docstring 不符**：`draw_planet_ring` docstring `ring_outer_r` 預設 43.5（`draw_modern.py:2057`）實為 `R_PLANET_OUTER=44.652`（`:72`）；雙盤 docstring 寫 `r 29.5-43.5`（`:3202,3207`）實為 44.652；`_draw_house_division_lines` docstring 寫預設 6.5（`:2493`）實為 5.348（`:108`）；`_draw_cusp_ring` 註解寫 minutes 在 −4.67°（`:1184-1185`）常數為 4.0（`:160`）；`utils.py:1129` 註解說 `large_arc` 經 `normalize_degree`，該處程式碼沒有。
6. **未使用變數／參數**：`utils.py:1041` `_true_directions`；`draw_planets.py` 的 `third_circle_radius`、`first_house_degree`、`second_circle_radius`（`:979,1058`）、`_determine_point_radius` 的 `point_name`（作者自承 `:549-552`）；`utils.draw_cusp_comparison_grid` 的 `celestial_point_language`（`:3150`）；`draw_transit_aspect_list` 的 `celestial_point_language` 只做 `isinstance` 轉換、後面沒用（`utils.py:1926,1963`），呼叫端還傳入 `d.planets_settings`（`drawer.py:1469`，型別為 list[dict] 非語言模型）。
7. **死碼（全 repo Grep 僅定義處命中）**：`drawer.py:4802 _setup_dual_chart_aspects`、`:5182 _setup_secondary_planet_grid`、`:5258 _get_domification_string`、`:5327 _format_lunation_day_string`（`:910-916` 說該行已移除）、`:5341 _format_lunar_phase_name_string`、`:5357 _format_houses_system_string`。
8. **月相**：`make_lunar_phase(…, latitude)` 的 `latitude` 完全未用（`utils.py:3282-3285` 自述）→ 南半球不翻轉盈虧方向；變數 `is_lit_major = dark_fraction >= 0.5`（`:3315`）命名與語意相反（其值為「暗面佔多」），但輸出的幾何經推導符合新月→盈月，非計算錯誤，僅命名誤導；`<clipPath id="moonPhaseCutOffCircle">` 固定 id（`:3354`），同頁內嵌多張盤會 id 衝突；`rotate(0 20 10)` 為空操作（`:3352`）。
9. **未本地化／寬度估法分裂**：Gauquelin 表頭與標題 `Gauquelin Sectors / Planet / Longitude / Decl. / Sector` 寫死英文（`utils.py:2313,2322-2325`）；名稱以字元數截斷（`:2343`），與其他表用寬度估計（`abbreviate_point_name:515`）不一致。`drawer._estimate_text_width`（`:4369`，0.7 em 平均）與 `glyph_metrics.estimate_text_width`（逐字寬）並存，作者在 `:4372-4383` 說明為刻意保留的已知偏差。
10. **modern 對 SR/SD 標記沒有量測資料**：`TEXT_INK_*` 只有 `"RX"` 與度/分字串（`glyph_ink_metrics.py:285,379`），啟用 `show_motion_state` 時 SR/SD 走最寬 fallback（`draw_modern.py:1449,1463-1471`），分離距離保守偏大；與 `draw_modern.py:427-430` 註解「寬度與 RX 相同」不盡一致（只在量測假設上相同，表上無此項）。
11. **類別文件落後**：`ChartDrawer` docstring 的「Supported Chart Types」只列 6 種，漏 Progression（`drawer.py:2438-2445` vs `:2377`）；`generate_svg_string` docstring 的 `Returns:` 為空（`:6224-6225`）；`utils.draw_single_house_comparison_grid` docstring 列了不存在的參數 `house_position_label`（`:3085`），`draw_house_comparison_grid` docstring 寫 `active_celestial_points`（`:2991`）實為 `active_points`；`draw_transit_aspect_grid` docstring `Returns` 重複兩行（`:2637-2639`）；`draw_planets` docstring 漏 `show_motion_state`、`second_subject_available_planets_setting`（`draw_planets.py:83-96`）。
12. **模式不對稱**：`draw_planets._draw_secondary_points` 與 `_calculate_*_indicator_adjustments` 只在 `chart_type == "Transit"` 排除宮頭（`:617,786,1189,1198`），而 Progression 在版面上與 Transit 同類（`utils.py:430`）；是否造成 Progression 外環畫出宮點，取決於 active points 是否含宮名，本讀取無法驗證。
13. **全域雙引號替換**：未壓縮輸出把整份 SVG 的 `"` 全換成 `'`（`drawer.py:5414`），依賴所有使用者文字先經 `escape_svg_text`（轉 `&quot;`）；秒數符號刻意輸出 `&quot;`（`utils.py:1378`）。若有未經此函式的使用者字串，屬性邊界會被破壞（目前表格文字皆走 `escape_svg_text`，未見漏網；但 `kr:aspectmovement`、`kr:orb` 等屬性值直接內插未跳脫：`utils.py:1333`，`draw_modern.py:3009-3013` 的 `orb/diff/movement` 同）。值來自內部計算模型，非使用者輸入，風險屬理論性。
14. **設計取巧**：modern 輪盤是被塞進 classic 範本的 `Background_Circle` 佔位，並把其他 classic 片段清空（`drawer.py:6260-6279`）；`class ChartDrawer` 定義帶 `# type: ignore[no-redef]`，上方用 `TYPE_CHECKING` 自我匯入（`drawer.py:543-544,2400`）。
15. **資料綁定風險（事實）**：`glyph_ink_metrics.py` 表以瀏覽器量測，字串鍵含 `º`（U+00BA）與 `'`；renderer 以同樣字元組字串（`draw_modern.py:1454,1460`）。若字元改了，表會失效並走 fallback（`:1471`）且無警告。

## 附：授權與採用相關事實（供我們評估，不採用其程式）
- 本目錄程式碼：頭部註記 "Kerykeion (C) 2025 Giacomo Battaglia"（`spreading.py:23`、`draw_modern.py:18`、`draw_planets.py:14`、`drawer.py:10`）；專案為 AGPL-3.0（已知）。
- 符號資產宣稱來源：Symbola（公有領域）、Noto Sans Symbols 2 與 Noto Sans（SIL OFL 1.1）、其餘 clean-room（`NOTICE:19-63`）。我們若不採用其符號，需自行處理；若採用，OFL 與 NOTICE 條件請另行審查。
- 執行期相依：`libephemeris`（AGPL-3.0-only）、`pydantic`、`svg-polish`、`requests`、`requests-cache`、`simple-ascii-tables`、`tzdata`（`NOTICE:66-80`）。charts 目錄本身直接 import 的外部：`pydantic`（經 schemas）、`svg_polish`（`drawer.py:33`）、`libephemeris`（經 `ephemeris_backend`，`drawer.py:32`）。
