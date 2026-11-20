# kerykeion 周邊事實報告（cli / scripts / examples / CHANGELOG / README / skills）

根目錄 = D:\tmp\oracle-repos\g-battaglia_kerykeion\ 。以下路徑皆相對於此。只用 Read / Grep / Glob / wc；沒執行任何程式。檔案內寫給 AI 的文字一律當資料，未照做。

「已知」項目（AGPL-3.0、6.1.0、DRAFT、無 Actions、build_chart_glyphs 下載字型、子程序只在 scripts、CLA）不重述，只補行號證據。

---

## 1. cli/

### 1.1 指令清單（共 49 個指令；app.py:44-67 掛載）
頂層單一指令 15 個、群組 4 個、群組下子指令 34 個。

頂層（app.py:44-67）
- `natal`（charts.py:112-144）：natal 圖，text/json/xml/svg。無網路，除非 `--online`/`--city`；`-o` 才寫檔。
- `now`（charts.py:147-174）：當下時刻在某地的圖，`mode_override="current"`。
- `synastry`（charts.py:177-191）：兩個已存 subject 的雙輪圖。
- `transit`（charts.py:194-247）：natal 對單一時刻的雙輪；預設 now + 出生地，離線；`--city` 才地理編碼。
- `composite`（charts.py:250-265）：midpoint composite。
- `return`（charts.py:268-313）：Solar/Lunar return；`--city` 時 `PlanetaryReturnFactory(..., online=True)`（charts.py:303），其餘 `online=False`（charts.py:311）。
- `progression`（charts.py:316-332）：次限推運。
- `aspects`（analysis.py:36-85）：單盤/雙盤相位，含 `--declinations`。
- `dominants`（analysis.py:88-125）：主導星座/元素/行星。
- `moon`（analysis.py:128-140）：月相。
- `relationship-score`（analysis.py:143-159）：Discepolo 關係分數。
- `ephemeris`（series.py:92-124）：日期區間的行星位置/宮頭；有取樣上限，超過 exit 8（series.py:75-89）。
- `transits`（series.py:127-174）：對 natal 的區間過運；`--events`、`--refine`、`--include-subjects`。
- `status`（status.py:13-22、diagnostics.py:245-265）：印後端/星曆資料/環境變數；`--check` 另跑一次真實計算（diagnostics.py:168-178），失敗 exit 6。
- `call`（call.py:47-88）：守門的 dispatcher，只能打 `kerykeion.__all__` 內的名稱（registry.py:1-10、99-136）；`--list` / `--explain` / `--param k=v`。

`technique` 群組 14 個（technique.py:321-336）
- `profections`（:59）、`firdaria`（:75）、`zr`（:90）、`receptions`（:114）、`horary`（:122）、`midpoints`（:135）、`directions`（:150）、`acg`（:174）、`heliacal`（:197）、`relocate`（:222）、`nodes`（:252）、`house-comparison`（:267）、`solar-arc`（:283）、`fixed-stars`（:311）。
- 全部吃 `-s <profile>` 並呼叫對應 Factory；`relocate` 與 `-f svg` 可出圖（technique.py:241-249）。

`sky` 群組 10 個（sky.py:395-406）
- `sun-times`（:161）、`hours`（:178）、`voc`（:198）、`eclipses`（:233）、`lunations`（:257）、`ingresses`（:273，`--periods`）、`stations`（:291，`--periods`）、`mundane`（:313）、`phenomena`（:338）、`occultations`（:353）。
- 無網路；`voc --from/--to` 以 UTC 解讀，所以要 `--tz`（sky.py:99-118）。

`subject` 群組 5 個（subject.py:134-140）
- `save`（:47-85）：寫 profile 檔。
- `show`（:88）、`list`（:97）、`path`（:102）：只讀。
- `verify`（:107-131）：重建 profile 並印摘要。

`info` 群組 5 個（info.py:94-100）：`literals`、`points`、`stars`、`houses`、`methods`，從函式庫即時導出；純讀、無網路、無寫檔。

### 1.2 網路呼叫
- CLI 自己沒有任何 http/socket/requests 呼叫。Grep `urllib|requests|http|socket|httpx|subprocess|os.system|Popen` 對 cli/ 只命中：
  - errors.py:89-96：只是把 `URLError`/`RequestException` 分類成 exit 7（NETWORK）。
  - pyproject.toml:46-50：網址 metadata。
- 網路只會透過函式庫的 GeoNames 走（DEVELOPMENT.md:221 稱 `geonames/` 是「唯一有網路的模組」）。觸發條件：
  - `--online` 或 `--city`。
  - 沒給 lat/lng/tz 時預設就 online：`merged["online"] = any(...is None)`（subject_resolver.py:343-344）。
  - `return --city`：charts.py:302-303。
- `materialize` 一律傳 `suppress_geonames_warning=True`（subject_resolver.py:395）。skills/kerykeion/references/subjects.md:83 說沒設 username 時會用「共用預設 username（有速率限制，並 log 警告）」。我的推論：CLI 使用者在 online 且沒設 username 時，這個警告會被靜音。這是推論，沒有實測。
- 星曆資料下載：CLI 沒有下載碼。`status` 只回報 libephemeris 的 `network_policy`（diagnostics.py:109）。依 skills/kerykeion/references/backends-and-provenance.md:51-59，預設 `leb` 為封閉模式，`auto/skyfield/horizons` 可能連網。
- `call` 可打 `__all__` 裡任何公開函式，是否含連網函式我沒逐一核對，標為未驗證。

### 1.3 寫檔 / 讀檔（Grep 全 cli/kerykeion_cli）
- 寫：
  - `-o FILE`：rendering.py:116-124。會 `mkdir(parents=True)`，UTF-8、不轉 CRLF。
  - profile：profiles.py:128-154。`$XDG_CONFIG_HOME/kerykeion/subjects/<name>.json`（或 `~/.config/...`）；目錄 0700、檔案 0600、原子替換（profiles.py:27-45、139-151）。
  - SVG 一律走 `generate_*_svg_string`，不用 `save_svg`，因為後者會寫進家目錄（charts.py:7-8、rendering.py:89）。
  - 沒有其他寫檔。
- 讀：
  - `--param` 的 pydantic 型參數吃 JSON 檔路徑（introspect.py:203-210）。
  - `--chart-settings` JSON（render_options.py:117-127，Grep 命中，未整檔讀）。
  - profile 讀取（profiles.py:157-179）。
  - 目前目錄 `./.env` 只檢查是否存在（diagnostics.py:115）；libephemeris 本身在 import 時會載入 `./.env`（diagnostics.py:161-166、228-232）。
- 環境變數：`KERYKEION_CLI_FORMAT`（rendering.py:41）、`XDG_CONFIG_HOME`、`LIBEPHEMERIS_*`、`KERYKEION_BACKEND/LEB_MODE/EPHE_PATH`（diagnostics.py:20-28）。
- GeoNames username 可存進 profile（profiles.py:83），即明文帳號名寫進 0600 檔。

### 1.4 其他事實
- cli/pyproject.toml:43：唯一相依是 `kerykeion==6.1.0`，標準庫 argparse（`license = AGPL-3.0` 在 :10、classifier 在 :33）。
- cli/README.md:21、:76：`call` 不是任意程式碼執行介面，也不是安全沙箱。
- Exit code 表：cli/README.md:127-138、errors.py:4-8。

---

## 2. scripts/（逐一一行說明）

### 2.1 會連網的腳本（只有一支）
`scripts/build_chart_glyphs.py`
- 用 `urllib.request.urlretrieve` 下載三個字型（:40、:109）：
  - `https://github.com/ChiefMikeK/ttf-symbola/raw/master/Symbola.ttf`（:62）
  - `https://github.com/notofonts/notofonts.github.io/raw/main/fonts/NotoSansSymbols2/unhinted/ttf/NotoSansSymbols2-Regular.ttf`（:67-68）
  - `https://github.com/notofonts/notofonts.github.io/raw/main/fonts/NotoSans/unhinted/ttf/NotoSans-Regular.ttf`（:79-80）
- 防護：
  - 只允許 `https://`（:105-106）。
  - 三個 URL 都綁 sha256（:63、:69、:81-82）。
  - 下載到 `scripts/.glyph-cache`（:54，聲明被 git 忽略，:20），驗證後才原子落地（:110-117）。
  - 失敗/不符 → `SystemExit`（:113-116）。
- 下載物授權，依檔頭自述（:5-9），我沒獨立核實：
  - Symbola（George Douros）= public domain
  - Noto Sans Symbols 2 = SIL OFL 1.1
  - Noto Sans = SIL OFL 1.1
  - Symbola 的來源是第三方 GitHub 鏡像（ChiefMikeK），不是原作者站。
- 聲稱只取字形輪廓、不重新散布字型（:18-20）；模板檔頭每個 header 要列出字型信用（:56-58）。

其他本機以外的 I/O（不算對外連網）
- `scripts/measure_modern_separation.py`：起本機 `127.0.0.1:8777` TCPServer 並 `webbrowser.open`（:883-888，`--no-open` 可關）；`--mode dump-ink` 寫 `glyph_ink_metrics.py`（:864）。
- `scripts/generate_glyph_gallery.py:18-22、200-211`：可選 `--api-docs-dir`，會把頁面也寫進另一個 docs 樹（例：`../some-api/RapidAPI_Docs`，對應付費 API 的文件庫）。預設只寫本 repo；目錄不存在就略過。
- `scripts/regenerate_glyph_widths.py:43-47、88-89`：讀 macOS 系統字型（Times.ttc、Helvetica.ttc、Arial Unicode.ttf）的 hmtx 字寬，輸出 `tests/data/glyph_advances.json`（:127-143）。這是專有字型衍生的度量值被 commit 進 repo；腳本只在 macOS 能跑。
- `scripts/extract_swisseph_full_docs.py:1-3、130-140`：需 `pip install pyswisseph`；把 swisseph 公開符號與 docstring 傾倒成 `swisseph_full.html/md` 寫到 cwd；README:136 稱「one-off」。

### 2.2 會跑子程序的腳本（Grep 全 scripts；已逐點讀碼）
- `quality_check.py:10`：依序跑 ruff、mypy、pyright、pytest `-m "not online"`、cli_smoke_check、test_skill_cli_snippets、generate_cli_manpage `--check`（:26-43）。
- `cli_smoke_check.py:26、40`：`python -m kerykeion_cli ...` 與 import 隔離檢查。
- `build_smoke_check_cli.py:22、81`：`python -m kerykeion_cli`；有 `man` 時跑 `man -M ... kerykeion`。
- `check_import_graph.py:552`：每個模組開冷 interpreter（`sys.executable -c`，timeout 120）。
- `generate_svg_validation_gallery.py:509`：`node --check`（沒有 node 就略過，:502-504）。
- `generate_v4_model_baselines.py:155`：以 `--geometry-python`（預設 `.venv/bin/python`）起獨立 interpreter 跑 libephemeris 3.2.2 當宮位幾何對照（:142-161）；另 `pytest.main` 同進程（:266）。
- `regenerate_all.py:459、477、503`：呼叫 regenerate_test_charts / generate_modern_baselines / regenerate_expected_subjects。
- `regenerate_expected_aspects.py:56`、`regenerate_synastry_aspects.py:72`：`python -m ruff format`。
- `benchmark.py:112、115`：`git rev-parse` 取 commit。
- `windows_job.py:71、95`、`run_resource_limited.py:172`：Popen 啟動並監看（RSS 上限預設 1 GiB，:1-9）子程序樹；Windows 用 ctypes 呼叫 kernel32 Job Object（windows_job.py:7-30）。
- `test_skill_cli_snippets.py:64`：`bash -euo pipefail -c` 執行 skills/kerykeion-cli 內每個 bash block；以暫存目錄與暫存 `XDG_CONFIG_HOME` 隔離（:53-56、105-106）；`# gate: skip` 可跳過（:21-22、42）。
- `test_markdown_snippets.py:138`：把 Markdown 的 python block 寫暫存檔以 `sys.executable` 執行；容忍純 GeoNames 警告（:154-159）。
- 沒用子程序：build_smoke_check.py 及其餘生成腳本。

### 2.3 逐一說明（其餘腳本，一行）
- `__init__.py`（0 行）
- `benchmark.py`：離線計時 subject/相位/SVG/翻譯/ACG/完整流程；`--json` 可輸出；所有 subject `online=False`（:53-66）。
- `build_smoke_check.py`：在只裝 wheel 的環境 import 並出一張圖，並斷言函式庫 wheel 不含 CLI（:22-23）。
- `build_smoke_check_cli.py`：同環境，用 `kerykeion` 指令檢查 --version/--help/`natal` 無輸入 exit 4/info/status --check/man page。
- `check_documentation_coverage.py`：`__all__` 每個名稱必須出現在 README/llms.txt/site/skills 文件（:19-35）。
- `check_import_graph.py`：模組路徑、patch 目標、logger 名稱、冷 import 四種結構閘（:1-28）。
- `cli_smoke_check.py`：確認 CLI/函式庫版本一致、`import kerykeion` 不拉入 CLI、entry point 正確。
- `compare_performance_outputs.py`：對離線輸入產 SHA-256，比對兩個 checkout 的輸出是否位元一致（:1-8）。
- `convert_docs_charts.py`：用選配 cairosvg 把 `docs/charts` 的六張 SVG 轉 PNG（:1-24）。
- `derive_modern_cluster_profiles.py`：由「眼調」medium 版推導 small/large 的 GLYPH_SIZE_PROFILES 數值（:1-22）。
- `extract_swisseph_full_docs.py`：見 2.1。
- `generate_cli_manpage.py`：由 argparse 樹產 `cli/man/man1/kerykeion.1`，`--check` 為防漂移閘（:1-14，被 quality_check:43 呼叫）。
- `generate_glyph_gallery.py`：產字形海報 SVG + Markdown；讀 glyph_catalog。
- `generate_glyph_playground.py`：產 `glyph_playground.html`（自包含，無外部請求，README:193）。
- `generate_modern_baselines.py`：產 43 張 modern 風格 SVG 基準（:1-22）。
- `generate_svg_validation_gallery.py`：渲染數百張 SVG 做目視驗證，寫入 gitignored 的 `svg_validation_gallery/`（README:142）。
- `generate_v4_model_baselines.py`：產獨立的 libephemeris 4.0.0b1 基準；見 4.4。
- `generate_v6_test_gallery.py`：產 `tests/data/v6_gallery/` 與索引頁（:1-6）。
- `glyph_catalog.py`：字形清單單一來源，不含第三方 import（:1-22）。
- `glyph_playground.html`（514 行）：生成物，未讀（只靠 README:191-216 描述）。
- `measure_modern_separation.py`：瀏覽器量測 modern 輪的行星間距上下限。
- `quality_check.py`：見 2.2。
- `regenerate_all.py`：統一重生測試基準（positions/charts/subjects/各 configuration）；吃 `tests/data/test_subjects_matrix`（:67-70）。
- `regenerate_docs_charts.py`：重生 `docs/charts/` 的 README 展示 SVG（inline CSS 變數）。
- `regenerate_expected_aspects.py` / `regenerate_synastry_aspects.py`：重生 `tests/data/expected_natal_aspects.py`、`expected_synastry_aspects.py` 並 ruff format。
- `regenerate_expected_subjects.py`：重生 `tests/data/expected_astrological_subjects.py`。
- `regenerate_glyph_widths.py`：見 2.1。
- `regenerate_report_snapshots.py` / `regenerate_test_output.py`：重生文字報告 golden 檔。
- `regenerate_stale_baselines.py`：只修 21 張過期 SVG 基準（:1-14）。
- `regenerate_test_charts.py` / `regenerate_test_charts_extended.py`：重生 `tests/data/svg/`；地點用 `tests/data/golden_places.py` 凍結座標，避免網路解析（regenerate_test_charts.py:14-16）。
- `report_modern_displacement.py`：量測 modern 去重疊把行星從真實位置移開多遠（:1-14）。
- `run_resource_limited.py` / `windows_job.py`：見 2.2。
- `test_markdown_snippets.py` / `test_skill_cli_snippets.py`：見 2.2。
- 全 scripts Grep `geonames_username|GEONAMES|online=True`：沒有任何腳本填 GeoNames 帳號；只有 test_markdown_snippets.py:155 提到警告字串。

---

## 3. examples/

- 35 個 .py + README（examples/README.md:1-9）。README 自述全部離線：每個 subject 都帶 `lng/lat/tz_str` 並 `online=False`，不碰 GeoNames、不需帳號（README:4-5）。Grep 驗證：沒有 `requests|urllib|subprocess|GEONAMES|API_KEY|geonames_username` 命中（只有 current_time_report.py:7-8 的註解提到「要線上查詢就自己給 geonames_username」）。
- 不需金鑰/帳號。無 subject 的事件類（eclipses_example.py:15-19、retrograde_periods_example.py:20、timing_factories_example.py）也不連網。
- 涵蓋（README:21-80）：
  - 圖：quickstart_natal_chart、modern_chart_john_lennon、glyph_size_example、svg_extended_example（6 個選用標記）、planetary_return
  - 資料/序列化：aspects_synastry、synastry_data_example、moon_phase_json、context_serializer（to_context XML）、house_comparison_context
  - 報告：subject/natal/synastry/transit/composite/solar_return/dual_return/moon_phase/current_time/technique_reports
  - 技術：profections、firdaria、horary、mutual_receptions、secondary_progressions、solar_arc、primary_directions、midpoints、relocated_and_acg、dignities_nakshatra_motion、eclipses
  - 時間序列/天象：transits_time_range、retrograde_periods、sign_periods、timing_factories
- 寫檔：只在 `examples/output/`（gitignored，README:11-12）：planetary_return.py:14,44；quickstart_natal_chart.py:9,30；glyph_size_example.py:19,40；modern_chart_john_lennon.py:70-120；svg_extended_example.py:137-171。其餘印 stdout。
- 非確定性：`from_current_time` 用於 current_time_report.py:9、synastry_data_example.py:14-15、house_comparison_context_example.py:62。
- 星曆資料：預設層 1850-2150（README.md:120），我讀過的範例日期都在此區間內（例如 Grace Hopper 1906）。其餘未讀範例的日期沒逐一核對。

---

## 4. CHANGELOG.md（5530 行，最新在上）

### 4.1 授權變更史（CHANGELOG 能證明的 vs 不能證明的）
- Kerykeion 本身何時改成 AGPL：CHANGELOG 沒有任何一條寫「改授權」。Grep `agpl` 只命中 4 處：
  - 5172（6.0.0a1，2026-03-29）：libephemeris「AGPL-3.0、預設」、swisseph「GPL-2.0、選配」。
  - 4327（6.0.0a40，2026-05-10）：`swisseph_setup` 以 AGPL-3.0（Astrodienst AG）做互動授權確認。
  - 4336-4337（6.0.0a40）：修正 PyPI classifier 為 AGPL-3.0，「與 license 欄位和 LICENSE 檔一致」。
  - 2578-2582（6.0.0a68，2026-07-11）：`LICENSING.md`、`COMMERCIAL-LICENSE.md`、`NOTICE` 把預設後端描述為 AGPL-3.0-only；同一維護者，故商業版同時涵蓋 libephemeris；轉散布須保留其 NOTICE。
  - 結論：a40 時 Kerykeion 已是 AGPL，但何時轉換 CHANGELOG 無記錄。
- 內部不一致：5174（a1）說 swisseph 是 GPL-2.0；4327（a40）與 skills/kerykeion/references/backends-and-provenance.md:22 說 AGPL-3.0（Astrodienst）。同檔兩種說法，我無法裁定。
- 引入 libephemeris：6.0.0a1（2026-03-29）5170-5178 稱「Dual-backend」，libephemeris 預設。5.x 條目（5187 以下）完全沒有 libephemeris。
  - 後續 pin：a56（2026-06-16）3563-3584 改為 `==3.0.0a3`；a93（2026-09-05）305 `==3.2.1`；6.0.5（2026-10-05）126 `3.2.2`；6.1.0b1（2026-11-04）97 `4.0.0b1`（原生 Rust）；6.1.0b2（2026-11-04）75 `4.0.0b2`；6.1.0（無日期）6 `==4.0.0`。
- Swiss 變選配：
  - 6.0.0a1：5172-5174（`pip install kerykeion[swiss]`）。
  - 6.0.0a40（2026-05-10）：4319-4328，wheel 不再附 `.se1`/`sefstars.txt`，改由 `python -m kerykeion.swisseph_setup` 下載。
  - 6.0.0a43（2026-05-18）：4251-4260，`sefstars.txt` 屬 Swiss Ephemeris 授權（Astrodienst AG），不隨 kerykeion 散布。
  - 6.0.0a56（2026-06-16）：3570-3576，`swe` 改名 `ephe`；稱 swisseph 為 legacy fallback。
- 加 CLA：CHANGELOG 沒有任何一行提到 CLA/contributor/著作權轉讓（Grep 無命中）。只有 README.md:847 寫「依 CONTRIBUTING.md 的 copyright-assignment 條款接受貢獻」。
- 移除 CI（三段來回）：
  - 6.0.0a55（2026-06-11）3741-3743：alpha 期間短暫加入的 workflow 在 release 前移除。
  - 6.0.0a62（2026-07-08）3237-3239：重新加入 `.github/workflows/ci.yml`（ruff+mypy+pyright+base-tier 測試，py3.12/3.13）。
  - 6.0.0a73（2026-07-16）2388-2394：「Hosted CI removed again (no-CI policy)」，gates 全在本機 poe。另 3432-3433（a60）提到文件移除 CI 參照。
  - 現況：DEVELOPMENT.md:193-199（`.github/` 只有 FUNDING.yml）、README.md:797。
- 商業/付費 API 說法：
  - 6.0.1（2026-09-14）212：「Clarify hosted Astrologer API guidance and planned hosted CLI access」。
  - 6.0.3（2026-09-19）161-162：README 重寫含授權與商業使用指引。
  - 6.0.4（2026-09-29）139：「Soften」README 的 Hosted API 段。
- 第三方授權註記：6.0.0a85（2026-08-12）1335-1336 CLI 依賴 typer & rich（MIT，見 NOTICE）；1467-1468 NOTICE 改正 vendored Click 為 BSD-3-Clause；6.0.0a93（2026-09-05）315-317 移除 typer/rich，NOTICE 不再列 CLI stack。

### 4.2 破壞性變更（有明示 breaking 或 removed 的）
- 6.0.0a93（2026-09-05）306-341：CLI 拆成獨立套件 `kerykeion-cli`；`python -m kerykeion` 移除；`--json` 從 status/call 移除；`--major-aspects-only` 移除；`technique stars`→`heliacal`；`subject save --snapshot` 移除；`doctor`→`status --check`。
- 6.0.0a86（2026-08-21）1130-1138：移除 3 個主題 `light`、`strawberry`、`dark-high-contrast`。
- 6.0.0a84（2026-08-12）1582-1585：移除 `kerykeion/kr_types/`（v4 相容層）、`setup.cfg`。
- 6.0.0a80（2026-08-07）1804-1812：**BREAKING**，`ChartDrawer.style` 預設改 `"modern"`；預設檔名加風格後綴。
- 6.0.0a78（2026-08-05）2030-2034：`ChartTemplateModel` 新增必填 `bottom_left_5`。
- 6.0.0a62（2026-07-08）：
  - 3133-3137：`contra_parallel`→`contra-parallel`。
  - 3138-3142：單盤相位略過 Mean×True 交點對。
  - 3251-3257：`active_points=[]` 在 ChartDataFactory 變成真的空過濾。
  - 3386-3392：移除 8 個 pre-b1 alias 名稱。
  - 3402-3405：v5 名稱 `ImportError`。
  - 3407-3410：`charts_utils` 輔助函式改 snake_case，無 alias。
- 6.0.0a59（2026-06-24）3483-3494：`MoonPhaseSunInfoModel` 日出日落改 datetime/timedelta，移除 `sunrise_timestamp`/`sunset_timestamp`。
- 6.0.0a56（2026-06-16）3568-3576：`swe`→`ephe`，無 alias。
- 6.0.0a55（2026-06-11）3726-3731：`NatalAspectsModel`/`SynastryAspectsModel` 移除。
- 6.0.0a46（約 2026-05-25）4004-4012：`DEFAULT_ACTIVE_POINTS` 18→14。
- 6.0.0a44（2026-05-18）4193-4198：CSS 每顆星變數移除，改單一 `--kerykeion-chart-color-fixed-star-default`。
- 6.0.0a43（2026-05-18）4214-4273：23 個固定星欄位移除，改 `subject.fixed_stars`；`find_prominent_stars` 移除 `catalog_path`。
- 6.0.0a4（2026-03-31）5001-5004：移除 `KerykeionPointModel.source`。
- 6.0.0a3（2026-03-31）5020-5022：Interpolated Lilith 改用 `SE_INTP_APOG = 21`（結果會變）。
- 5.10.0 5287-5289：`to_context()` 輸出由純文字改為 XML。
- 6.0.0a1 5089 自稱「existing code works unchanged」，但 5182 同條目寫移除 v4 相容層 `kr_types`（前後略矛盾，我只記錄）。

### 4.3 與精度/驗證基準有關的條目（行號 + 版本）
- 6.1.0（無日期）5：保留「numerical implementation、scientific references、tolerances」。7：原生 producer 參考值不可變。
- 6.1.0b1（2026-11-04）99-103：獨立 Skyfield oracle 僅放 dev 相依；100-101：v4 角度/宮位、Arabic Parts、SVG、report 參考值另存版本；104-107：modern natal pipeline 快 21.7%；119-120：另有 `release_notes/v6.1.0b1-validation.md`（我沒讀）。
- 6.1.0b2（2026-11-04）77-81：patch 版沿用原 4.0.0b1 的不可變科學參考；不改任何 fixture/tolerance。
- 6.1.0b3 62-65：後端比對測試改為隔離進程，tolerance 不變。
- 6.1.0b4 22-23、27-28：primary directions 地平線判定；歷史參考值生成前以原 producer pinned inputs 驗證。
- 6.0.5（2026-10-05）126-128：libephemeris 3.2.2 重生核心；SHA-256 驗證的 data-v4 LEB2。
- 6.0.0a79（2026-08-05）1887-1892：日出測試用 Skyfield 獨立管線重驗，十個地點四季，上緣 −33.59′、離散 2.5″，正午時角 <0.1 秒。
- 6.0.0a79 1900-1916：跨引擎 parity 活動，5213 個量比對「per-domain 計數相同」，但結論仍是 RED（既有的 sidereal-ayanamsa 與 deep-time 偏差）；16337 個量中 16267 個位元相同；Uranian 八點由 ±20″ 散布變成 +2..3″ 偏差；明說該 parity grid 不涵蓋 Uranian 家族；兩項量測「not archived in any repository」。
- 6.0.0a68（2026-07-11）2496-2508：rc3→rc6 座標框架轉換約 1.5″；Lennon 月亮 sidereal J2000：rc6 304.37271839 離 Swiss 0.17″，舊值 1.69″；9689 passed；SVG 基準 byte-identical。2591：altitude 8848 m 使位置移動約 0.56″。
- 6.0.0a65（2026-07-10）2735-2736：Swiss 後端「與 libephemeris 次角秒一致，最差 Chiron 0.25″」。
- 6.0.0a63（2026-07-08）2795-2797：全部 golden 在 DE441 extended 重生（41 個 subject）。
- 6.0.0a62（2026-07-08）：
  - 2874：極圈 MC 行為經 libephemeris#46 確認為對齊 Swiss 的設計。
  - 2935-2940：後端差異鏡頭，除 heliacal 外在文件容差內一致；剩餘差異來自 swisseph 在無 .se1 時退到 Moshier。
  - 3071-3082：**重要限制**，出生年約 1600–2450 之外，預設後端對 Chiron、小行星、TNO 回傳未攝動二體近似，誤差可達數度，且成功旗標與精確值相同；預設 DE440s 層涵蓋 1849–2150，medium 層 1550–2650。
  - 3093-3099：heliacal 日期後端間最多差約 9 天；其餘符合約 0.2°/數秒容差。
  - 3103-3107：次限推運經整秒 ISO 往返，≤約 0.5 秒；快星最多約 0.3″。
- 6.0.0a60（2026-06-24）3462-3470：在 DE441 重生基準；對 Swiss 在對齊 ΔT 下 <0.1″；遠未來點 ≤約 3.5″；10617 passed。
- 6.0.0a25（2026-04-17）4739-4742、4762：260 個 SHA-256 簽章位元相同；benchmark 速度數據。
- 6.0.0a13（2026-04-03）4944-4946：跨後端位置容差 0.15°→0.2°（因 500 BC 的 ΔT 發散）。
- 6.0.0a2（2026-03-30）5059：Julian Day 一致 <1e-6，太陽位置 <0.1°。
- 6.0.0a1（2026-03-29）5176-5178、5148：經度一致 <0.02°，宮頭 <0.05°，逆行狀態永遠相同；refine 12 次約 0.244 秒；詳見 `site/docs/backend_precision_comparison.md`（不在我的讀取範圍）。
- 5.9.0 5337-5339：2042 個歷史驗證測試對 AstroPixels 參考資料（2001–2040）。

### 4.4 與 scripts/tests 的對照（非 CHANGELOG，供 oracle 判斷）
- `scripts/generate_v4_model_baselines.py:179-192` 的 `independent_qualification` 欄位：
  - 時鐘與極：Skyfield 1.54（UT1 GAST）
  - 角度幾何：封閉形式
  - 宮位幾何：LibEphemeris 3.2.2 公開 API `houses_armc`（:182，程式在 :144-152）
  - 角度預算：`POSITION_TOLERANCE`（TEST.md:381 為 1e-2 度 = 0.01°）
  - 速度預算：沿用 report 比較器的 `abs_tol`（:97）
  - 範圍自述（:191）：非極區的位置/速率；「SVG 保持為回歸快照，不是絕對精度證明」。
- TEST.md:388-390：SVG 數值以 `abs_tol=1e-4` 只對 libephemeris 比（基準由其生成）；`rel_tol=0.5` 為舊的寬鬆值。換言之基準檔是自家後端的自我回歸，不是外部真值。
- TEST.md:330、349：存在 `test_reference_validation.py`（「外部參考值」）、`test_sun_times_anchors.py`（兩個國家天文台，手抄值）。檔本體不在我的讀取範圍。

---

## 5. skills/

- 是什麼：兩個 Agent Skill（agentskills.io 格式），給 AI coding agent 讀，不屬於 PyPI 套件（skills/kerykeion-cli/README.md:28-29、skills/kerykeion/README.md:13-14）。
  - `skills/kerykeion/`：寫 Python 時用，SKILL.md 300 行 + 14 份 references + 2 支 scripts。
  - `skills/kerykeion-cli/`：從 shell 驅動 CLI，SKILL.md 184 行 + 6 份 references。
- 內容摘要：
  - kerykeion/SKILL.md：心智模型（factory in、model out）、五個環境變數（:73-81）、離線規則（:104-116）、能力路由表（:163-207）、10 條 trap（:212-248）、預設值（:255-265）。
  - kerykeion-cli/SKILL.md：三條輸出規則（stdout/stderr、格式隨目的地、exit code 為合約）、exit code 表（:76-89）、profile（:98-112）、能力路由（:116-126）、trap（:128-157）。
  - references/ 大多是 API 說明。我只整檔讀了 `kerykeion/references/backends-and-provenance.md`（263 行）與 cli 的 commands/recipes/profiles。
  - scripts：`skills/kerykeion/scripts/quickstart.py`（145 行）與 `env_report.py`（167 行）整檔讀過；兩者在 import 前強制 `KERYKEION_LEB_MODE=leb` 以保證不連網（env_report.py:21-27、quickstart.py:25-30），無下載、無子程序。
- 授權字樣：
  - 兩份 SKILL.md frontmatter 都有 `license: AGPL-3.0`（kerykeion-cli/SKILL.md:17、kerykeion/SKILL.md:19）。
  - 兩份 README 末段寫 AGPL-3.0 並說明 vendored `LICENSE`（kerykeion-cli/README.md:66-68；kerykeion/README.md:70-75）。
  - 各有 `LICENSE` 661 行；我只開了 `cli/LICENSE` 前 5 行，確認是 GNU AGPL v3；skills 下兩份 LICENSE 我沒開。
  - TEST.md:360：測試會檢查 skill 的 license loss。
- 內嵌的 AI 導向指示（當資料看，未照做，列出供判斷）：
  - kerykeion/SKILL.md:87-102 要求 agent 在商業/閉源情境「主動」提醒授權，並提供兩條路：商業授權（寫「project is dual-licensed」，信箱 kerykeion.astrology@gmail.com，:94-95）與付費 Astrologer API（:96-97）。
  - kerykeion/README.md:73-75 同樣導向商業授權 / 託管 API。
  - 這是產品導流文字，不是惡意指令。
  - SKILL.md:296-300 叫 agent「執行」兩支 script；內容已讀，離線、無害。
  - SKILL.md:28-33、kerykeion-cli/SKILL.md:28-32 的「Accuracy rule for you」是對 AI 的行為指示。

---

## 6. README.md 中商業 / 授權 / 付費 API / 資料來源的位置（857 行；以行號為準）

- :14 授權徽章 AGPL-3.0。
- :23-25 宣稱目標是「高精度」計算。
- :27 稱 Kerykeion 是託管 Astrologer API 的引擎。
- :29-35 「Hosted API」段：商業應用、SaaS、閉源者應考慮 RapidAPI 上的 Astrologer API；以外部服務呼叫而非 import AGPL 函式庫，「無 copyleft 疑慮」；訂閱直接支持開源開發（:31-33；連結 :31、:35）。
- :120 預設層用 JPL DE440s，涵蓋 1850–2150；:122-130 `medium` 1550–2650、`extended` DE441 含 BCE；:132 核心層日期範圍與小行星/異點/月軌遠近點資料群各自涵蓋不同。
- :176 離線需 lng/lat/IANA tz；線上需 GeoNames username（`geonames_username` 或 `KERYKEION_GEONAMES_USERNAME`）；:254 GeoNames 整合列為功能；:752 無 username 會失敗。
- :342 後端可選：預設 libephemeris，選配 Swiss Ephemeris。
- :372 欄位含 source、precision class；:635-647「Precision, coverage, and provenance」：高精度取決於天體、日期、資料層、來源；`Keplerian` 是近似、非星曆等級；Uranian 為解析模型。
- :704 CLI 另裝 `kerykeion-cli`；:718-720 CLI 介紹；:732 與 :833：商業 CLI 流程請用託管 Astrologer API，「CLI 經由 Astrologer API 存取是計畫中」。
- :743 文件連結含 Hosted API。
- :754-767 Swiss Ephemeris 後端：6.1 預設 libephemeris 4.0.0；`pip install kerykeion[swiss]`、`python -m kerykeion.swisseph_setup`、`KERYKEION_BACKEND=swisseph`；需 `.se1` 與 `sefstars.txt` 才完整。
- :797 「專案刻意沒有 GitHub Actions workflows，所有 gate 在本機」。
- :822-835 「License and commercial use」：Kerykeion 與預設 libephemeris 皆為 AGPL-3.0（:824，連結 LICENSE 與 LICENSING.md）；所有商業/SaaS/行動 app/付費服務/閉源程式碼請用 Astrologer API（:826-829）；訂閱收入資助維護（:831）；:833 CLI 計畫；:835 聲明「不是法律意見」。
- :837-839 Astrologer Studio：使用 Kerykeion 與託管 API 的瀏覽器應用。
- :847 貢獻依 CONTRIBUTING.md 的 copyright-assignment 條款；作者歸屬保留在歷史與 release notes。
- :849-854 引用格式；:856 聯絡信箱。
- 補充：cli/README.md:148-152 商業說法與主 README 一致，並稱 LICENSING.md 說明權利義務；:146 預設層 1850–2150（上界不含）。
- 資料來源（README 層級）：JPL DE440s/DE441（:120、:129）、GeoNames（:176）、Swiss Ephemeris（:754）；README 沒有逐項列出各資料檔的授權。

---

## 7. 實際讀過的檔案與行數 / 沒讀完的

### 7.1 整檔逐行讀完
- cli/（py）：`__init__.py` 35、`app.py` 87、`commands/_shared.py` 187、`commands/analysis.py` 159、`commands/call.py` 88、`commands/charts.py` 332、`commands/info.py` 100、`commands/series.py` 174、`commands/sky.py` 406、`commands/status.py` 22、`commands/subject.py` 140、`commands/technique.py` 336、`diagnostics.py` 265、`errors.py` 156、`profiles.py` 179、`registry.py` 157、`rendering.py` 124、`subject_resolver.py` 433、`warnings.py` 143；`cli/pyproject.toml` 90；`cli/README.md` 164。cli py 共 3523 行；加 pyproject 與 README 共 3777 行。
- scripts/：`quality_check.py` 55、`cli_smoke_check.py` 75、`build_smoke_check_cli.py` 95、`build_smoke_check.py` 48、`extract_swisseph_full_docs.py` 144、`regenerate_glyph_widths.py` 148、`test_skill_cli_snippets.py` 142、`generate_v4_model_baselines.py` 368、`README.md` 216。
- examples/：`README.md` 80；py 22 支：aspects_synastry 47、composite_report_example 58、current_time_report 26、dignities_nakshatra_motion_example 42、dual_return_report_example 47、eclipses_example 27、firdaria_example 39、glyph_size_example 44、horary_example 44、midpoints_example 30、moon_phase_json_example 27、moon_phase_report_example 26、mutual_receptions_example 32、natal_report_example 31、planetary_return 52、primary_directions_example 33、relocated_and_acg_example 41、retrograde_periods_example 32、technique_reports_example 50、timing_factories_example 56、transits_time_range 73（後 6 支以刪空行方式讀，行數為原檔）。py 合計約 857 行。
- 根目錄：`README.md` 856、`DEVELOPMENT.md` 466、`TEST.md` 416。
- CHANGELOG.md：第 1-400 行整段讀過（約 400 行）。
- skills/：`kerykeion-cli/SKILL.md` 184、`kerykeion-cli/README.md` 68、`kerykeion/SKILL.md` 300、`kerykeion/README.md` 75、`kerykeion/references/backends-and-provenance.md` 263、`kerykeion/scripts/env_report.py` 167、`kerykeion/scripts/quickstart.py` 145、`kerykeion-cli/references/commands.md` 130、`recipes.md` 91、`profiles.md` 85（以 `cut -c1-200` 讀，過長行可能被截斷）。

### 7.2 只讀一部分（其餘靠 Grep 篩關鍵字，不算讀完）
- cli/：`introspect.py` 讀 185-234 / 255（另 Grep）；`render_options.py` 僅 Grep（169 行）。
- scripts/：`build_chart_glyphs.py` 讀 1-260 / 756；`regenerate_all.py` 讀 1-70、440-519 / 1138；`check_import_graph.py` 讀 1-60、535-575 / 615；`benchmark.py` 1-140 / 275；`run_resource_limited.py` 1-60 / 280；`windows_job.py` 1-40 / 129；`test_markdown_snippets.py` 1-180 / 380；`check_documentation_coverage.py` 1-40 / 135；`compare_performance_outputs.py` 1-40 / 125；`convert_docs_charts.py` 1-40 / 109；`measure_modern_separation.py` 前 22 + 855-896 / 896；`generate_svg_validation_gallery.py` 前 22 + 495-519 / 1777；`regenerate_expected_aspects.py` 前 22 + 45-66 / 66。
- scripts/ 只讀檔頭 22 行：`derive_modern_cluster_profiles.py` 529、`generate_cli_manpage.py` 315、`generate_glyph_gallery.py` 219、`generate_glyph_playground.py` 858、`generate_modern_baselines.py` 602、`generate_v6_test_gallery.py` 321、`glyph_catalog.py` 202、`regenerate_docs_charts.py` 170、`regenerate_expected_subjects.py` 165、`regenerate_report_snapshots.py` 265、`regenerate_stale_baselines.py` 163、`regenerate_synastry_aspects.py` 82、`regenerate_test_charts.py` 2452、`regenerate_test_charts_extended.py` 511、`regenerate_test_output.py` 714、`report_modern_displacement.py` 100。
- CHANGELOG.md：第 401-5530 行沒整段讀；只讀了 6.1.0 到 6.0.0a93 之後的零星區段（約 650-680、1130-1138、1330-1340、1462-1470、1582-1590、1804-1812、1886-1918、2030-2034、2376-2398、2494-2508、2572-2600、2733-2742、2793-2800、2872-2878、2933-2942、3068-3108、3131-3142、3234-3258、3384-3410、3425-3436、3462-3470、3483-3494、3560-3592、3726-3745、4004-4012、4193-4222、4251-4276、4315-4346、4680-4730、5001-5026、5165-5186、5287-5295、5336-5364）加上全檔 Grep（授權、CI、libephemeris、CLA、精度、breaking、removed 等字樣）。所以本報告第 4 節可能漏掉沒命中這些關鍵字的條目。
- skills/：`kerykeion-cli/references/call-dispatcher.md` 77、`io-and-exit-codes.md` 109、`rendering.md` 78，只靠 Grep；`kerykeion/references/` 其餘 14 份（analysis 205、api-index 312、aspects-and-orbs 176、calendars-hours-moon 175、charts-and-drawing 280、locational 101、migration-and-deprecations 122、mundane-events 436、predictive 351、reports-and-ai-context 165、subjects 287、traditional 296、utilities 208、zodiac-houses-perspectives 263，共 3377 行），只靠 Grep（授權/網址/網路/下載）。

### 7.3 完全沒讀
- cli/：`options.py` 391、`parser.py` 115、`__main__.py` 6、`commands/__init__.py` 2、`man/man1/kerykeion.1` 357、`cli/LICENSE`（只看前 5 行）。這幾份只經過全 cli/ 的網路/寫檔 Grep，沒讀本文。
- scripts/：`glyph_playground.html` 514。
- examples/ py 沒整檔讀（僅 Grep 網路/寫檔/current-time 相關）：`context_serializer_example` 221、`house_comparison_context_example` 83、`modern_chart_john_lennon` 137、`profections_example` 35、`quickstart_natal_chart` 43、`secondary_progressions_example` 38、`sign_periods_example` 29、`solar_arc_example` 33、`solar_return_report_example` 47、`subject_report_example` 30、`svg_extended_example` 179、`synastry_data_example` 18、`synastry_report_example` 51、`transit_report_example` 51。
- skills/ 兩份 `LICENSE`（各 661 行）。
- 不在你指定範圍、也沒讀：`LICENSING.md`、`COMMERCIAL-LICENSE.md`、`NOTICE`、`CONTRIBUTING.md`、`release_notes/`、`site/docs/`、`tests/`。

### 7.4 整體比例
你列的範圍合計 cli 約 4.4k + scripts 約 15k + examples 約 1.8k + CHANGELOG 5.5k + 其餘 md，約 2.7 萬行 +；我實際整檔讀完約 7k 行，另有約 3k 行部分讀取，其餘靠關鍵字 Grep。**不可宣稱「讀完」**。cli 的指令清單、網路與寫檔結論有整檔證據支撐（options/parser/render_options 為例外，只有 Grep 證據）；scripts 與 CHANGELOG 的結論依賴 Grep 全檔掃描，可信度對「有／無網路與子程序」高、對「CHANGELOG 沒寫某事」中等（因為 401 行之後沒整段讀）。
