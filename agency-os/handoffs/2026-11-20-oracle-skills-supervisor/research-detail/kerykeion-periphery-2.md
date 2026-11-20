## kerykeion 周邊檔案第二輪（repo：D:\tmp\oracle-repos\g-battaglia_kerykeion；以下路徑皆相對該 repo）

唯讀完成。未執行、未安裝任何程式。檔內寫給 AI 的指示一律當資料。未派 agent。

### 1. CHANGELOG.md 第 401 行到檔尾（5530 行，整段逐行讀完）

#### 1.1 6.0.0 之前的版本史（只有 5.x 與 4.x，且斷斷續續）
- CHANGELOG.md:5187 起 5.12.0（2026-03-18）、5240 5.11.0、5283 5.10.0、5317 5.9.0、5352 5.8.1、5364 5.8.0、5388 5.7.3、5396 5.7.2。5.0–5.6、5.7.0、5.7.1 沒有獨立條目；5.7.1 只被 5406 提到。
- 4.x 只有 4.2.0（5414）、4.4.0（5430）到 4.26.0（5526），順序亂（4.2.0 標 08/01/2023，4.4.0 標 05/03/2024，5414-5430）。
- 5.x 與 4.x 的條目完全沒有寫授權（grep AGPL|GPL|licen[sc]e 在 401 行後只命中 1158、1211-1212、1336、1467、2383、2385、2578-2582、4255、4326-4327、4336-4337、5172）。「5.x 以前用什麼授權」本檔無法回答。
- 5.x 後端是 swisseph：5370 `swe.azalt()`、5205 `swe.get_ayanamsa_ex_ut()`、5201 `swe.fixstar2_mag()`、5323「Swiss Ephemeris binary search」；5174「swisseph remains available via kerykeion[swiss]」暗示 6.0.0a1 之前它是預設。
- 4.x 路線（5414-5530）：pydantic 2.5（5422）、GeoNames 快取 24h 到 30 天（5498）、4.16 起主題（5483）。

#### 1.2 授權／CLA／商業授權／NOTICE（版本與行號）
- 6.0.0a1（5083，2026-03-29）：5172 寫 libephemeris 為 AGPL-3.0（預設）、swisseph 為 GPL-2.0（選配）。這是依賴的授權，不是 Kerykeion 自己的。
- 6.0.0a40（4313，2026-05-10）：4325-4327 swisseph_setup 互動確認「AGPL-3.0, Astrodienst AG」；4336-4337「PyPI classifier 現在正確寫 AGPL-3.0，與 license 欄位和 LICENSE 檔一致」。意思是 a40 之前 classifier 與 LICENSE 不一致，LICENSE 檔先於 a40 就是 AGPL。Kerykeion 自身 AGPL 的最早明文在本段是 4336。
- 6.0.0a43（4210）：4251-4260 `sefstars.txt` 屬 Swiss Ephemeris license（Astrodienst AG），不隨套件、使用者自行下載。
- 6.0.0a68（2408）內 round 48 文件修正：2578-2582「libephemeris 是 AGPL-3.0-only；LICENSING.md、COMMERCIAL-LICENSE.md、NOTICE 如此描述；它與 Kerykeion 同一維護者，商業版以其自己的商業授權一併涵蓋 libephemeris」。
- 6.0.0a73（2307）：2383-2386「Corrected backend license assignments」（沒說改了什麼）。
- 6.0.0a85（1323）：1336「typer 與 rich（MIT，見 NOTICE）；沒新增 Apache-2.0」；1467-1468 NOTICE 不再宣稱 Typer 內含的 Click 屬 MIT，維持 BSD-3-Clause。
- 6.0.0a86（1056）：1157-1159 字型 Symbola、Noto Sans Symbols 2、Noto Sans 只在 build time 下載到被 git 忽略的快取、不再散布；1210-1212 每張圖補列 Noto Sans 來源（NOTICE 已有、圖內原本沒有）。
- CLA：401 行之後 grep `CLA\b|Contributor` 零命中。
- 商業授權：401 行之後只有 2580（「commercial edition」）。無價格、無條款。

#### 1.3 Swiss／libephemeris 條目
- libephemeris 版本鏈：a30 ==1.1.0（4634）；a41 1.6.0（4305）；a42 2.0.0（4288）；a52 ==2.0.2（3804）；a56 ==3.0.0a3（3563）；a60 3.0.0a6（3460）；a62 改 >=3.0.0rc1,<4（3396）；a67 rc5（2618）；a68 rc6（2490）；a72 rc11（2400）；a75 rc14（2297）；a79 >=3.0.0,<4（1899）；a81 >=3.1.0（1708）。release_notes/v6.1.0-stable.md:9 寫 6.1.0 要求 `libephemeris==4.0.0`。
- a40（4319-4321）：wheel 不再附 `.se1`、`sefstars.txt`。同 a40 的 EPHE_DATA_PATH 預設改為空字串（4348）。
- a43（4246-4249）：恆星目錄只用 libephemeris；swisseph 路徑與 sefstars.txt 解析器刪除。
- a75（2286-2296）：LEB 模式強制 sealed 網路政策；2300-2305 超出範圍改拋 `EphemerisRangeError`，不再靜默用低精度來源。2293-2296 行星心座標失敗不再退回地心。
- a40（4330-4334）：swisseph 無 `EPHE_PATH` 時退 Moshier 並警告；a62 區段 3341-3345 補上自動偵測 `~/.kerykeion/sweph`。
- a30（4600-4608）：backwards 回溯搜尋只有 libephemeris 支援，swisseph 拋 `KerykeionException`。
- a75（2247-2248）：provenance 欄位只在 libephemeris 填，swisseph 不填。

#### 1.4 CI 條目
- a55（3601）：3741-3743「No hosted CI——alpha 期間短暫加入的 GitHub Actions 在發行前移除」。
- a62（2818）：3237-3239 新增 `.github/workflows/ci.yml`（ruff、mypy、pyright、離線測試、Python 3.12/3.13）。
- a73（2307）：2390-2394「Hosted CI removed again (no-CI policy)」，所有 gate 改 `poe` 本機跑。
- 文件面：3432-3433（a62 區段）「removed CI references (no-CI policy)」。

#### 1.5 精度／驗證基準
- a79（1836）：1872-1886 日出日落正午對照美國海軍天文台（USNO）與 IMCCE 手抄值（tests/core/test_sun_times_anchors.py）；1887-1896 用 Skyfield 獨立管線驗太陽高度（上緣 −33.59′）。
- a79：1903-1908 跨引擎 parity 活動 5213 個量，裁定 RED（前後兩次都 RED，「identical」= 未變動而非乾淨）；1912-1916 Uranian 點對參考從 ±20″ 變成 +2..3″ 偏差；parity 網格不含 Uranian 家族。
- a68（2457）：2497-2500 sidereal J2000 Moon 對 Swiss 差 0.17″（rc6），舊 rc3 差 1.69″。
- a60（3454）：3463-3470「matched ΔT 下與 Swiss 差 < 0.1″；遠期差異是 ΔT 外推」；全套 10617 passed。
- a46（3945）：4078-4080 新增 tests/core/test_reference_validation.py（Astro-Seek 對照）。
- a62（2818）：3069-3081 已知限制：約 1600–2450 之外，Chiron、小行星、TNO 預設後端回傳無擾動二體近似，誤差可達數度、成功旗標與準確值相同、無法偵測。a75 之後（2300-2305）sealed 模式改拋錯，所以這條在預設 leb 模式下已被取代；但 skills/kerykeion/references/backends-and-provenance.md:141-144 仍說 `source="Keplerian"` 對預設點是「NORMAL」。
- a62：3089-3099 heliacal 日期兩後端可差約 9 天（可見度模型不同）。
- a62：3108-3129 象限宮制在極圈內翻轉 MC，說明為與 Swiss 一致（非缺陷）。
- 5177（a1）：後端間行星經度差 < 0.02°、宮頭 < 0.05°。
- a62：3100-3107 次限推運經整秒 ISO 往返，月亮差約 8e-5°。

#### 1.6 破壞性變更（挑與授權、後端、輸出有關者；行號為條目起點）
- a80（1729）：1804 預設圖樣式 classic 改 modern；1807-1816 預設檔名加樣式後綴。
- a86（1056）：1130-1149 刪三個主題 light、strawberry、dark-high-contrast（刪 40 個基準檔）；1269-1275 `MotionState` 新增 stationary_retrograde／stationary_direct，窮舉 match 會壞。
- a87（938）：1037-1041 不再裝 root logger handler；1046-1054 midpoint composite 在 a86 錯的地方結果改變。
- a78（1959）：2030-2038 `ChartTemplateModel` 新增必填欄位 bottom_left_5。
- a76（2154）：2158-2165 pytz 換 zoneinfo，tzdata 變硬依賴（2211）；2184-2192 極地宮制 fallback 改為 Porphyry、不再把緯度夾到 ±66° 污染上升點；2228-2235 組合盤拒絕不同宮制來源的兩人。
- a75（2237）：2271-2278 `get_ephemeris_data()` 每個樣本新增 `ephemeris_warnings` 鍵。
- a62（2818）：3133-3137 `contra_parallel` 改名 `contra-parallel`；3140-3144 單盤跳過 mean×true 節點假相位；3166-3171 GeoNames 改 HTTPS、快取目錄改 `~/.kerykeion/cache/`；3386-3392 移除 6.0.0b1 前的舊別名（ACGLine 等）；3407-3415 charts_utils 駝峰改蛇形。
- a59（3479）：3485-3495 `MoonPhaseSunInfoModel` 日出日落等欄位型別改 datetime/timedelta；3496-3506 `axis_orb_limit` 開始過濾雙盤。
- a56（3559）：3568-3576 `swe` 改名 `ephe`；3588-3593 White Moon 週期由約 8.8 年改約 7 年（可差一個星座）。
- a46（3945）：4006-4019 `DEFAULT_ACTIVE_POINTS` 18 → 14、預設相位 6 → 5、預設容許度全面改（Astro-Seek 對齊）。
- a43（4210）：4214-4278 23 個具名恆星欄位移除，改 `fixed_stars` 列表；a44（4147）：4193-4202 per-star CSS 變數移除。
- a4（4991）：5003-5004 移除 `source` 欄位；a3（5006）：5022 Interpolated Lilith 公式改變。
- 5.10.0（5283）：5289 `to_context()` 輸出改 XML。
- a84（1542）：1550-1562 `kr_` 前綴模組改名，頂層只剩 `__init__.py`。

#### 1.7 「已知」有無錯誤
- 無明顯錯誤；以下為補充與細微差異：
  - 「AGPL 最早出現在 6.0.0a1」：5172 的 AGPL 指 libephemeris 的授權。Kerykeion 自己的 AGPL 在本段最早明文是 a40 的 4336（且暗示更早就已是 AGPL）。
  - 「swisseph 授權前後矛盾」：本段可補行號：GPL-2.0（5172）對 AGPL-3.0（4327、skills/kerykeion/references/backends-and-provenance.md:22）；a73 的 2383 說「已修正」卻未說明結論。
  - 「a62 精度 1600–2450」：成立（3069-3072），但 a56 在 3595-3599 另稱 SPK 涵蓋約 1900–2100、誤差 1–2°；數字不一致；a75 起預設 sealed 模式改拋錯（2300-2305）。
  - CI 的 a55 移除、a62 加回、a73 再移除：全部對（3741、3237、2390）。a55 的描述是「發行前移除」，不是版本內曾經存在。
  - a79 RED：成立（1906-1908）。
  - 本段沒有 a74、a58、a53、a8–a12、a21 等版本條目（a67 與 a66 內容重複，2614-2653 兩節同一段文字）。

### 2. cli 其餘檔案

#### 2.1 選項全表（cli/kerykeion_cli/options.py，391 行）
- 主體識別：-s/--subject、--name、--date、--time、--seconds、--iso-utc、--lat、--lng、--tz/--tz-str、--city、--nation、--altitude、--online/--no-online、--offline（40-60）。
- 進階：--zodiac、--sidereal-mode、--houses、--perspective、--points、--fixed-stars、--with、--without、--set（63-100）。
- 輸出：-f/--format、-o/--output、--envelope（103-113）。
- 第二人／回歸／推運／過境：-S/--subject2、--type、--year、--month、--day、--target-year、--to-date、--to-time（116-129）。
- 技法：--target-date、--lot、--levels、--life-cap-years、--years-before、--years-after、--rate、--max-years、--moon-void/--no-moon-void、--method、--planets、--orb、--step、--lat-range、--new-city、--new-nation、--new-tz、--new-lat、--new-lng、--target-iso、--compute-aspects、--aspect-orb（132-183）。
- 分析：--aspects、--declinations、--orb、--axis-orb-limit、--method、--distribution-method、--custom-weights、--accidental-dignities、--score-breakdown、--all-aspects、--using-default-location、--location-precision（186-223）。
- 天象：--from、--to、--start-year、--count、--phase、--periods、--zodiac、--sidereal-mode、--planet（226-259）。
- 時間序列：--step-type、--step、--no-limit、--calculate-dignities、--include-subjects、--events、--refine（262-293）。
- call：--list、--explain、--param、-S（297-313）。
- 報告：--no-aspects、--max-aspects（316-319）。
- 圖：--theme、--chart-language、--style、--custom-title、--padding、--external-view、--transparent-background、--cusp-position-comparison、--auto-size、--degree-indicators、--aspect-icons、--zodiac-ring、--diurnality、--show-ephemeris-notes、--house-position-comparison、--aspect-grid-type、--svg-variant、--chart-settings（324-391）。
- parser.py（115 行）：純標準庫 argparse，由函式簽名生成參數（docstring 8 行寫 nothing imports kerykeion）。
- render_options.py（169 行）：`RenderOptions` 凍結 dataclass；`--chart-settings` 只允許 colors_settings、celestial_points_settings、aspects_settings、language_pack 四個鍵（19、136-140）。
- introspect.py（255 行）：`--param` 型別轉換；`--explain` 分類 cli／json-only／subject／unsupported（22-25、222-238）。
- man 頁（cli/man/man1/kerykeion.1，357 行）：標題「kerykeion-cli 6.1.0」（3）；指令樹 47-221；環境變數 247-260（KERYKEION_CLI_FORMAT、XDG_CONFIG_HOME、KERYKEION_BACKEND、KERYKEION_LEB_MODE、KERYKEION_EPHE_PATH、LIBEPHEMERIS_MODE、LIBEPHEMERIS_DATA_DIR、LIBEPHEMERIS_LEB、LIBEPHEMERIS_PRECISION）；退出碼 265-299（7 = NETWORK: GeoNames unreachable，287-288）；說明引擎「in-process and offline: no key, no server」（24-26）。
- cli/LICENSE（661 行）：標準 GNU AGPL v3 全文（1-2 標題、619 END OF TERMS、621-661 套用說明）。無附加條款。

#### 2.2 網路／寫檔
- 這四個 .py 與 man 頁本身無網路程式碼。唯一與網路相關的是旗標 --online（options.py:52-60）、--city 地理編碼、退出碼 7；實際連線在 library，不在本批檔案。
- 檔案讀取：render_options.py:127 讀 `--chart-settings` JSON；introspect.py:204-210 讀 `--param` 指向的 JSON 檔（pydantic 模型）。
- 寫檔：這些檔案本身不寫；`-o`、`subject save` 的寫入在未讀的 commands 模組（不在本任務範圍）。man 頁 241-246 稱 profile 以 0600 寫在 0700 目錄 `$XDG_CONFIG_HOME/kerykeion/subjects/`。
- 無新的連網或寫檔行為。

### 3. scripts（一行一檔；網路／子程序／寫檔）

已整檔讀：
- scripts/README.md（216）：說明文件；無執行。
- benchmark.py（275）：離線計時；子程序 `git rev-parse`（112-117）；寫 `--json PATH`（268）。
- build_smoke_check.py（48）：斷言 library wheel 不含 CLI；離線；不寫檔。
- build_smoke_check_cli.py（95）：子程序 `python -m kerykeion_cli`、`man`（22、81）；不寫檔。
- check_documentation_coverage.py（135）：讀 README、llms.txt、site/docs、skills 比對 `__all__`；唯讀。（30-34 註記 skill 會被逐字複製到第三方 repo。）
- cli_smoke_check.py（75）：子程序 python（26、40）；唯讀。
- compare_performance_outputs.py（125）：離線；寫雜湊檔（120）。
- convert_docs_charts.py（109）：SVG 轉 PNG（可選 cairosvg）；寫 docs/charts/*.png（85）。
- extract_swisseph_full_docs.py（144）：`import swisseph`；寫 swisseph_full.html/.md 到目前目錄（134-139）；無網路。
- glyph_catalog.py（202）：純資料，無 I/O。第 4-8 行說明它修正圖示集清單漂移。字體來源分類 S=Symbola、N=Noto Symbols 2、L=Noto Sans、C=clean-room（80-84）。
- quality_check.py（55）：子程序 ruff、mypy、pyright、pytest、cli_smoke、skill snippets、man（25-43）；唯讀。
- regenerate_expected_aspects.py（66）：離線；寫 tests/data/expected_natal_aspects.py（53）；子程序 ruff format。
- regenerate_synastry_aspects.py（82）：同上，寫 expected_synastry_aspects.py（69）。
- regenerate_expected_subjects.py（165）：寫 tests/data/expected_astrological_subjects.py（160）。注意 118-145 兩個 `from_birth_data` 傳城市名「Owensboro」「US」而沒帶 `online=False`；依 skills/kerykeion/SKILL.md:106 預設 online=True，所以此腳本會連 GeoNames（CHANGELOG a88 的 731-737 正是此類問題，這支沒被改）。
- regenerate_report_snapshots.py（265）：離線；寫 tests/fixtures/*.txt（62）。
- regenerate_stale_baselines.py（163）：離線（用 golden_place）；寫 tests/data/svg（61、85、109、152）。
- regenerate_docs_charts.py（170）：離線；寫 docs/charts/*.svg（149、159）。
- report_modern_displacement.py（100）：離線；只印表。
- windows_job.py（129）：Windows Job Object（ctypes kernel32、psutil）；子程序（95）。
- test_skill_cli_snippets.py（142）：對 skills/kerykeion-cli 的 bash 區塊執行 `bash -euo pipefail`（64）；在暫存目錄與暫存 XDG_CONFIG_HOME 內跑；不寫 repo。這等於會執行 skill 內的 shell 範例。

只讀部分（grep／標頭，未逐行讀完）：
- generate_cli_manpage.py（315）：寫 cli/man/man1/kerykeion.1（309）；有 `--check`；字串含 kerykeion.net 網址（284-285），僅寫入文字。
- measure_modern_separation.py（896）：grep 見 `http.server`、`socketserver`、`webbrowser`（63-69）、本機 `http://127.0.0.1:{port}/index.html`（884），寫 `charts/glyph_ink_metrics.py`（740）與探針頁（804-845）。README:135 說它「Interactive: it opens a page」。
- generate_svg_validation_gallery.py（1777）：子程序 `node --check`（509）；寫 svg_validation_gallery/（586、615、1756）；離線（641、1144、1165）。
- regenerate_all.py（1138）：子程序（459、477、503）；寫 tests/data。
- run_resource_limited.py（280）：`subprocess.Popen`（172）、psutil。
- test_markdown_snippets.py（380）：`subprocess.run` 執行 Markdown 內 python 區塊（138）。
- check_import_graph.py（615）：AST 掃描；子程序（552）。
- regenerate_test_charts.py（2452）、regenerate_test_charts_extended.py（511）、regenerate_test_output.py（714）、generate_modern_baselines.py（602）、generate_v6_test_gallery.py（321）、generate_glyph_playground.py（858）、derive_modern_cluster_profiles.py（529）：只 grep；均為寫 tests／docs 輸出，未見網路。
- scripts/__init__.py：0 行。
- glyph_playground.html（514）：未讀。scripts/README.md:193-195 稱「self-contained page, no external requests」。
- 前一位已處理、本輪略過：build_chart_glyphs.py（grep 見 62、67、79 行下載字型 URL：github.com/ChiefMikeK/ttf-symbola 與 notofonts.github.io，並有 https 檢查 105）、regenerate_glyph_widths.py、generate_glyph_gallery.py、generate_v4_model_baselines.py。

### 4. examples（35 支 .py + README，全部整檔讀）
全部離線：README.md:3-5 與逐檔確認，每支 `online=False` 並給 lng/lat/tz。無帳號、金鑰。輸出到 examples/output/ 者另註。
- aspects_synastry.py：雙盤相位數與首個相位。
- composite_report_example.py：中點組合盤報告。
- context_serializer_example.py（221）：13 種 `to_context()` XML；第 3 行 header 寫「Kerykeion (C) 2025 Giacomo Battaglia」。
- current_time_report.py：現在時刻報告（Rome，離線；7-8 行註解提到線上需自備 geonames_username）。
- dignities_nakshatra_motion_example.py：尊貴、nakshatra、運動狀態。
- dual_return_report_example.py：雙輪太陽回歸報告。
- eclipses_example.py：全球與地點日月食（EclipseFactory，無 subject）。
- firdaria_example.py：波斯 firdaria。
- glyph_size_example.py：寫 3 張 SVG 到 examples/output/。
- horary_example.py：卜卦指標。
- house_comparison_context_example.py：宮位疊加 XML；用 `from_current_time`（離線）。
- midpoints_example.py：中點。
- modern_chart_john_lennon.py：三主題各多張 SVG，寫 examples/output/。
- moon_phase_json_example.py、moon_phase_report_example.py：月相 JSON／報告。
- mutual_receptions_example.py：互容。
- natal_report_example.py、subject_report_example.py、synastry_report_example.py、transit_report_example.py、solar_return_report_example.py：各類報告。
- planetary_return.py：太陽回歸並寫 SVG。
- primary_directions_example.py：主限。
- profections_example.py：流年。
- quickstart_natal_chart.py：本命盤並寫 SVG。
- relocated_and_acg_example.py：移位盤與 ACG 線。
- retrograde_periods_example.py、sign_periods_example.py：逆行期、星座停留（RetrogradeStationFactory／SignIngressFactory，無 subject）。
- secondary_progressions_example.py、solar_arc_example.py：推運、太陽弧。
- svg_extended_example.py：6 個選用標記，寫 SVG（第 25 行聲明離線）。
- synastry_data_example.py：以「現在時刻」建兩人合盤並印 JSON。
- technique_reports_example.py：多技法文字報告。
- timing_factories_example.py：日出日落、行星時、空亡月、朔望、天象相位。
- transits_time_range.py：過境範圍。
- 結論：無網路、無帳號、無金鑰；寫檔只限 examples/output/。

### 5. skills references

#### 5.1 skills/kerykeion（README 75、SKILL.md 300、15 個 reference、2 個 script，整檔讀；LICENSE 只 grep 驗證）
- SKILL.md:87-102「Licensing — AGPL-3.0 (surface this for commercial use)」：寫給 AI 的指示，要它在使用者像是商業／閉源時主動提醒，並列兩條出路：商業授權（聯絡 kerykeion.astrology@gmail.com，SKILL.md:94-95、README.md:74-75）與託管 Astrologer API（https://www.kerykeion.net/astrologer-api/subscribe，SKILL.md:97）。屬導流與授權相關指示，已當資料摘錄，未照做。同段 101-102 自稱「不是法律意見」。
- README.md:47、72-75：LICENSE 為 AGPL-3.0（skill 與 library 同授權）；frontmatter license: AGPL-3.0（SKILL.md:19）。
- README.md:11-34：安裝指令含 `git clone`、`cp -r`、`npx skills add g-battaglia/kerykeion`。
- README.md:50-68：說明 docs:check、docs:snippets、tests/core/test_agent_skill_contract.py 三道關卡。
- references/backends-and-provenance.md：兩後端表（22 列：libephemeris「AGPL-3.0（Kerykeion project）」、swisseph「AGPL-3.0（Astrodienst AG），third-party」）；環境變數 47-70；sealed leb 72-100；provenance 132-188；swisseph setup 190-205。95-100 的下載片段標 `# doc-snippet: no-run (network download)`。
- references/subjects.md：64、83、98-99 寫 GeoNames 預設共用帳號 `"century.boy"`（無使用者名時會用並警告）；快取 `~/.kerykeion/cache/`。
- references/mundane-events.md:397-399：恆星目錄來自 libephemeris，「Swiss sefstars.txt is NOT used, for licensing reasons」。
- 其餘為 API 摘要：analysis、api-index（124 個頂層匯出）、aspects-and-orbs、calendars-hours-moon、charts-and-drawing、locational、migration-and-deprecations、predictive、reports-and-ai-context、traditional、utilities、zodiac-houses-perspectives。
- scripts/env_report.py（167）與 quickstart.py（145）：強制 `KERYKEION_LEB_MODE=leb` 以保證不連網、不下載（env_report:27、quickstart:30）；quickstart 可 `--svg DIR` 寫檔（138）。

#### 5.2 skills/kerykeion-cli（README 68、SKILL.md 184、6 個 reference，整檔讀；LICENSE 只 grep 驗證）
- 內容：指令樹、退出碼、profile 儲存、渲染旗標、`call` 派發器、recipes。
- 授權：README.md:66-68、SKILL.md:17 AGPL-3.0；LICENSE 標準 AGPL v3 標頭與 619 行 END OF TERMS（grep 驗證，與 skills/kerykeion/LICENSE 相同位置）。
- 導流：README.md:23-24、SKILL.md:183-184 導向姊妹 skill `kerykeion`。無商業授權導流。
- 與 CHANGELOG 的細節差異：SKILL.md:44「interface is built on the standard library alone」，與 a85 條目 1336（typer/rich）對照，後者在 401 行之前 CHANGELOG:317 已說明移除。
- call-dispatcher.md:7-14 安全模型：目標限 `kerykeion.__all__`、拒私有成員、用 `inspect.getattr_static`。
- profiles.md:7-12：0600／0700、原子寫入。
- 所有 skill 內 bash 區塊由 scripts/test_skill_cli_snippets.py 執行，`# gate: skip` 者略過（README.md:32、49 等）。

### 6. charts 的 XML 範本與 CSS

#### 6.1 來源聲明原文位置（四個 XML 第 1 行完全相同）
- chart.xml:1、wheel_only.xml:1、modern_wheel.xml:1、aspect_grid_only.xml:1：`<!--- This file is part of Kerykeion. Chart glyphs: Symbola (public domain) + Noto Sans Symbols 2 (SIL OFL 1.1) + Noto Sans (SIL OFL 1.1) + Kerykeion clean-room originals. See the NOTICE file. -->`
- 各檔標示「GLYPHS:BEGIN (generated by scripts/build_chart_glyphs.py — do not edit by hand)」：chart.xml:185（END 439）、wheel_only.xml:96（END 350）、modern_wheel.xml:47（END 301）、aspect_grid_only.xml:31（END 285）。
- 符號分組（chart.xml 的註解行；其他三檔分組相同）：Planets 186、Lunar nodes 217、Lunar apsides 230、Centaurs 252、Asteroids 259、Trans-Neptunian objects 272、Uranian points 294、Arabic parts 319、Angles 332、Axes and other points 345、Signs 364、Aspects 401、Retrograde 435。
- 符號清單（chart.xml 已讀 187-317，與 scripts/glyph_catalog.py:91-178 的 SPEC 對照）：Sun、Moon、Mercury、Venus、Mars、Jupiter、Saturn、Uranus、Neptune、Pluto；四個月交點；Mean/True/Interpolated Lilith、Mean/True Priapus、Interpolated Perigee、White Moon；Chiron、Pholus；Ceres、Pallas、Juno、Vesta；Eris、Sedna、Haumea、Makemake、Ixion、Orcus、Quaoar；Cupido 到 Poseidon 八個 Uranian 點；之後 Arabic parts、四軸、Vertex／Anti-Vertex、East Point、Earth、FixedStar、Midpoint、十二星座、11 個相位（orb0–orb180）、retrograde（glyph_catalog.py:145-178）。SPEC 總計 80 個符號（CHANGELOG:1154-1155 稱 80 個 `<symbol>`）。
- 來源種類（glyph_catalog.py:80-84）：S=Symbola 輪廓、N=Noto Sans Symbols 2、L=Noto Sans 字母（As/Mc/Ds/Ic/Vx/Av）、C=clean-room 自繪。
- 已讀 chart.xml:187-317 的實際形態：Moon、Mercury、Venus、Mars、Saturn、Neptune、Lilith、Ceres 等是描摹的路徑（`<g transform=...><path d="M...">`）；Sun、Jupiter、Uranus、Pluto、節點、Priapus、Chiron、Pholus、Eris、Ixion 為 circle／line 自繪（188、203、209、215、219、241、254、257、274、286）。無 `<text>` 字型依賴（CHANGELOG:1154-1156 稱字母符號已描成輪廓）。

#### 6.2 外部資源引用
- XML：grep `https?://|@import|url\(|href="http|src=` 只命中 xmlns 命名空間（`http://www.w3.org/2000/svg`、`http://www.w3.org/1999/xlink`、`https://www.kerykeion.net/` 作為 `xmlns:kr`）。無外部圖片、字型、樣式表。
- XML 的 `font-family="$chart_font_family"` 是佔位符（chart.xml:12）。
- CSS（classic.css 188 行、dark.css 199 行、black-and-white.css 192 行）：grep `url\(|@import|@font|http|font-family` 零命中；只有 `:root{}` 自訂屬性與 `/* */` 註解（如 dark.css:2-4 General、50 Zodiac、112 Planets、159 Arab Parts）。classic.css:48 註記「不透明 pastel：舊元素色對白色的逐通道合成」（對應 CHANGELOG:568-574）。

### 7. 實際逐行讀完的檔案與行數；沒讀完的檔案

#### 7.1 逐行讀完
- CHANGELOG.md 401–5530（5130 行）。
- cli/kerykeion_cli/options.py 391；parser.py 115；render_options.py 169；introspect.py 255；cli/man/man1/kerykeion.1 357；cli/LICENSE 661。
- scripts：README.md 216、benchmark.py 275、build_smoke_check.py 48、build_smoke_check_cli.py 95、check_documentation_coverage.py 135、cli_smoke_check.py 75、compare_performance_outputs.py 125、convert_docs_charts.py 109、extract_swisseph_full_docs.py 144、glyph_catalog.py 202、quality_check.py 55、regenerate_expected_aspects.py 66、regenerate_expected_subjects.py 165、regenerate_report_snapshots.py 265、regenerate_stale_baselines.py 163、regenerate_docs_charts.py 170、regenerate_synastry_aspects.py 82、report_modern_displacement.py 100、test_skill_cli_snippets.py 142、windows_job.py 129。
- examples：README.md 80 + 35 支 .py（共約 1,950 行，全部整檔）。
- skills/kerykeion：README 75、SKILL.md 300、references 15 檔（共 3,830 行）、scripts/env_report.py 167、scripts/quickstart.py 145。
- skills/kerykeion-cli：README 68、SKILL.md 184、references 6 檔（570 行）。
- kerykeion/charts/templates/chart.xml 第 1–317 行（共 441 行）。
- release_notes/v6.1.0-stable.md 129 行、v6.1.0-validation.json 64 行。

#### 7.2 沒讀完（照實列出）
- chart.xml 第 318–441 行（Uranian 之後的 Arabic parts、四軸、其他點、星座、相位、retrograde 與結尾）：未讀，僅靠註解 grep 確認分組與結構。
- wheel_only.xml（351）、modern_wheel.xml（303）、aspect_grid_only.xml（286）：未讀，只做 grep（第 1 行聲明、xmlns、註解分組）。
- classic.css（188）、dark.css（199）、black-and-white.css（192）：未逐行讀，只做 grep（無 url／@import／@font／http；註解標題）。
- skills/kerykeion/LICENSE、skills/kerykeion-cli/LICENSE（各 661 行）：未逐行讀，只 grep 驗證標題（1-2）與 END OF TERMS（619），其餘靠與 cli/LICENSE 同結構推定。
- scripts（只 grep／標頭）：check_import_graph.py 615、derive_modern_cluster_profiles.py 529、generate_cli_manpage.py 315、generate_glyph_playground.py 858、generate_modern_baselines.py 602、generate_svg_validation_gallery.py 1777、generate_v6_test_gallery.py 321、measure_modern_separation.py 896、regenerate_all.py 1138、regenerate_test_charts.py 2452、regenerate_test_charts_extended.py 511、regenerate_test_output.py 714、run_resource_limited.py 280、test_markdown_snippets.py 380、glyph_playground.html 514。這些檔的網路／寫檔結論只來自 grep 命中，沒有逐行確認，可能漏掉 grep 沒涵蓋的行為。
- release_notes：共 102 個檔；最新三份依 `sort -V` 為 v6.1.0-validation.json、v6.1.0-stable.md、v6.1.0-artifacts.sha256（4 行）。artifacts.sha256 未讀；v6.1.0b4.md（33）、v6.1.0b3-*.md 未讀。
- scripts/__init__.py：0 行。
- 未處理（本輪範圍外）：build_chart_glyphs.py、regenerate_glyph_widths.py、generate_glyph_gallery.py、generate_v4_model_baselines.py。

### 附：release_notes 摘要（已讀的兩份）
- release_notes/v6.1.0-stable.md:8-9：兩個發行都是 6.1.0；CLI 要求 `kerykeion==6.1.0`，library 要求 `libephemeris==4.0.0`。
- v6.1.0-stable.md:34-39：舊版（v3 後端）的歷史上升點、宮位可能與新結果不同；小型內附核心不是完整天體／日期涵蓋，更廣資料集是明確前置條件。
- v6.1.0-stable.md:72-94：certifi >=2026.10.18、urllib3 >=2.8.0 的安全下限，四個 GHSA 編號。
- v6.1.0-stable.md:112、126：「不證明已在 PyPI」「準備不執行上傳」；v6.1.0-validation.json:63 `"publication_performed": false`。
- v6.1.0-stable.md:47-54：14,798 / 14,799 案例通過；v6.1.0-validation.json:8-12 14662 beta 案例、1470 輸出比對、0 不符。
