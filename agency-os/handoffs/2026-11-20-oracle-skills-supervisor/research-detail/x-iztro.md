# x-haose/x-iztro 逐行稽核報告

- 稽核方式：唯讀；只用 Read/Grep/Glob/wc（另有少量 ls/find 只列目錄與計數，未執行 repo 內任何程式）。
- 行號以 repo 根目錄為基準的相對路徑表示。
- repo 內 CLAUDE.md 是寫給 AI 的指示，本報告只把它當資料引用，沒有照它的指示做事。

## 1. 各檔做什麼

### Rust 核心 `src/`（全部讀完，24,327 行）

- `src/lib.rs`（131 行）
  - 公開 API 入口。
  - `#![deny(unsafe_code)]`；bridge 以 `allow(dead_code)` 掛載。
- `src/astro/`：排盤流程。
  - `context.rs`：推導排盤上下文，包括生效時辰、農曆年月日、兩套年干支、月索引、命身宮、五行局。
  - `builder.rs`：安星與組盤（`place_stars`／`build_palaces`／`build_pillars`）。
  - `horoscope.rs`：六層運限，以及大限列表、流年列表、流月列表。
  - `lunar_table.rs`：修正 1602 年的農曆月表。
  - `palace.rs`：宮位相關。
  - `rearrange.rs`：地盤、人盤與任意干支重排。
  - `query.rs`：輕量查詢。
  - `reverse.rs`：八字反推與盤面特徵反推。
- `src/star/`：
  - `location.rs`：各類星的落宮公式。
  - `major.rs`：`ZIWEI_GROUP`／`TIANFU_GROUP`。
  - `minor.rs`：輔星。
  - `adjective.rs`：雜耀。
  - `decorative.rs`：四組十二神。
  - `query.rs`：查詢。
  - `mod.rs`：`make_star`。
- `src/data/`：
  - `types.rs`：Config 有 6 個開關，另有不序列化的 overrides。
  - `constants`、`earthly_branches`、`heavenly_stems`：常量表。
  - `stars.rs`：162 個 StarKey。
- `src/models/`：星盤、宮位、星、運限、三方四正、夾宮（`flanking.rs`）的資料結構。
- `src/i18n/`：
  - `lookup.rs`：260 個 key 的雙向查表，`STAR_ALIASES` 14 條。
  - `patterns.rs`：格局名的六語言詞表。
  - 六個語言檔。
- `src/pattern/`：64 條格局規則。
  - `view.rs`：`ChartView` 統一本命與運限視角。
  - `rules/`：ziwei／sun_moon／major／lu／assist。
- `src/knowledge/mod.rs`：知識包的解析、合併、按盤取材。
- `src/text.rs`（1714 行）：to_text 文字輸出，共 8 種 kind。
- `src/bridge.rs`（1716 行）：以 `kind` 分派的 JSON 查詢入口，Python 與 Go 共用。
- `src/dto.rs`：camelCase DTO，譯名欄位旁並列語言無關 key。
- 綁定層：
  - `src/ffi.rs`：C ABI，用 `catch_unwind` 擋 panic。
  - `src/wasm.rs`：回傳 `(ptr<<32)|len` 打包值。
  - `src/python.rs`：PyO3，透過 pythonize 轉換。
- `src/error.rs`：錯誤分類碼。

### Python `python/`（7,828 行，全部讀完）

- `python/x_iztro/` 共 21 檔，是型別化的封裝：frozen dataclass 加 StrEnum，一律走 `_bridge`。
- `python/tests/` 共 8 檔。

### Go `go/iztro/`（8,598 行 .go，全部讀完）

- `runtime.go`：wazero 實例池。
- `iztro.go`：排盤入口。
- `types.go`：Astrolabe／Palace／Star／Horoscope，以及判斷方法（Has／FliesTo／SelfMutaged 等）。
- `keys.go`：常量。162 個星耀 key 與 64 個格局 key，見 `go/iztro/keys.go:643-769`。
- `knowledge.go`、`lists.go`（夾宮與三個運限列表）、`pattern.go`、`query.go`、`reverse.go`、`star.go`、`utils.go`、`data.go`、`errors.go`、`i18n.go`、`mutagen.go`。
- 測試 14 檔。

### 測試 `tests/`（11,681 行，全部讀完）

- `tests/*.rs` 共 25 檔，加上 `tests/common/mod.rs`。
- `tests/golden/` 下的產生器：`package.json`、`canonical.mjs`、15 支 `generate_*.mjs`。

### CI 與發版

- `.github/workflows/ci.yml`、`release.yml`、`wheels.yml`。
- `.github/scripts/release_notes.py`：把 PR 正文的「## 发布说明」一節抽出來，當成 release 描述。

### 文件站 `docs/`（Next.js + fumadocs）

- `next.config.mjs`：MDX 設定與 rewrites，包括 MCP 反代。
- `proxy.ts`：語言協商，以及 `Accept: text/markdown` 時轉到 Markdown 原文。
- `app/`：首頁、文件頁、llms.txt／llms-full.txt、單頁 `.md` 端點、sitemap、robots、搜尋。
- `components/`：首頁盤面預覽、程式碼高亮、端點顯示、頁尾、Logo、MDX 元件表。
- `lib/`：站點網址、i18n、llms 文字、fumadocs source。

## 2. 「已知」逐條核對

| # | 協調者給的已知 | 結論 | 證據 |
|---|---|---|---|
| 1 | MIT，v0.6.1，iztro 的 Rust 移植 | 確認 | `Cargo.toml:3,7`；`README.md:89-90` |
| 2 | 金標全部由 iztro 2.6.1 產生，不是獨立來源 | 確認 | `tests/golden/package.json:24`（`"iztro": "2.6.1"`）；`README.md:375-377` |
| 3 | astrotype 金標的 soul 與身宮地支被產生器手動覆寫 | 確認 | `tests/golden/generate_astrotype.mjs:53-57` |
| 4 | 沒跟上 iztro 2.6.4 的晚子時整盤換日（#314）與地盤人盤身宮修正 | 確認，但需補充：x-iztro 修了另一個晚子時問題 | 見下方說明 |
| 5 | tier3 金標 58 萬列標 `#[ignore]`，CI 不跑 | 確認 | 見下方說明 |
| 6 | 修了 lunar_rust 1602 年閏二月月表 | 確認 | `src/astro/lunar_table.rs:46-53`（在場探測）、`:79-86`（重映射）；`CHANGELOG.md:242-250` |
| 7 | 格局 64 個 key，規則來源 iztro-docs | 確認 | 見下方說明 |
| 8 | 知識包底本是 iztro-docs（MIT）改寫，另有 55 條自撰 | 確認，數字需修正 | 見下方說明 |
| 9 | Go 內嵌 wasm、走 wazero、編譯快取寫到 UserCacheDir | 確認 | `go/iztro/runtime.go:131-146`；`README.md:432-437` |
| 10 | 文件站把 /mcp 轉發到寫死的外部主機；函式庫本身無網路呼叫 | 確認，範圍要擴大 | 見下方說明 |

第 4 條說明：

- 晚子時沿用 2.6.1 行為：晚子時用 23:30 換算，農曆日不換。
  - 見 `src/astro/context.rs:56-68`。
  - 只有紫微起宮與日系星用次日，見 `src/astro/star/location.rs:225-232`、`:339-343`。
- 地盤／人盤仍用 `BODY_OFFSET` 表定位身宮，見 `src/astro/rearrange.rs:27,53`。
- Go 測試也把「地盤命宮 = 天盤身宮」寫死，見 `go/iztro/parity_check_test.go:419-429`。
- CHANGELOG 只提到對齊 2.6.1，見 `CHANGELOG.md:25`。
- 補充：x-iztro 另外修了「運限查詢未遵守晚子時日期分界」（`CHANGELOG.md:80-83`）。這是運限層的問題，不是 #314 的整盤換日。

第 5 條說明：

- `tests/golden_tier3.rs:21` 標了 `#[ignore]`。
- CI 只跑 `cargo test`（`.github/workflows/ci.yml:29`）。
- `ci.yml:2` 明寫「tier3 全量（586K 例）不在 CI 跑」。
- 發版門禁也不跑 tier3：`.github/workflows/release.yml:62-69` 只跑 `cargo test --locked`。

第 7 條說明：

- key 數量：`src/pattern/keys.rs:140`；`go/iztro/keys.go:643-769` 正好 64 個。
- 規則來源：`src/pattern/rules/mod.rs:2` 寫依據 iztro-docs《格局》頁、引文出自《紫微斗数全书》。
- 中文格局名：`src/i18n/patterns.rs:3` 寫「按《紫微斗数全书》原名」。

第 8 條說明：

- 55 條 = 50 條流耀 + 5 條（截路、旬中、年解、劫煞、岁破）。
  - 見 `CHANGELOG.md:209-211` 與知識包 json:854 的改寫說明。
- 知識包實際有 162 顆星。但 `README.md:321` 與 `README.zh-CN.md:251` 仍寫「107 颗星」，已過時。

第 10 條說明：

- `docs/next.config.mjs:11-12`：預設源站寫死為 `https://xziwei-xziwei-e0rno8-e6d7d0-161-118-223-190.sslip.io`。
  - sslip.io 表示 IP 是 161.118.223.190，標註為 Dokploy。
  - 可用環境變數 `ZIWEI_MCP_ORIGIN` 覆蓋，見 `:15-18`。
- 轉發的不只 `/mcp`：`/mcp/:path*`、`/healthz`、`/install` 也一起轉發，見 `:43-60`。
- `docs/proxy.ts:63-65` 把這三段從語言協商裡排除。
- repo 內沒有這個 MCP 服務的程式碼。
- 函式庫本身確實沒有網路呼叫。

## 3. 64 條格局（key／中文名／條件摘要／出處）

### 出處總述

- 總體依據：`src/pattern/rules/mod.rs:2` 寫依 iztro-docs《格局》頁，引文出自《紫微斗数全书》。
- 每個規則函式的文件註解附「来源」引文。
- 作者自承全書無載的三條：
  - #41 三奇加會：`src/pattern/rules/lu.rs:118`。
  - #48 羊陀夾命：`src/pattern/rules/assist.rs:115`。
  - #57 文貴文華：`src/pattern/rules/assist.rs:279`。
- 作者改寫或不採的口徑：
  - #3 金輿扶駕：作者把紫微改成天府。
  - #13 日照雷門：晝生不作條件。
  - #18 日月藏輝：晝夜生口徑不採。
  - #22 月朗天門：子生、夜生不作條件。
  - #27 刑囚夾印：刑囚夾忌／刑忌夾印不實作。
  - #34 梁馬飄蕩：古書「陷」不作條件。
- 只在運限視角判定的兩條：#38 祿衰馬困、#47 風雲際會。

### ziwei.rs（10 條）

1. `jun_chen_qing_hui` 君臣慶會（`ziwei.rs:75`）
   - 4 種 variant：
     - 紫破守命 + 輔弼夾，且無煞忌。
     - 紫相守命 + 昌曲在命遷軸。
     - 天府守命 + 機陰同梁分布於命宮前後兩宮。
     - 紫微與左右同宮；遇煞忌只記 broken。
   - 全書引文在 `:70`。
2. `zi_fu_tong_gong` 紫府同宮（`:159`）：紫府同守命。
3. `jin_yu_fu_jia` 金輿扶駕（`:172`）：天府守命於丑未，且日月夾。不要求無煞。
4. `zi_fu_jia_ming` 紫府夾命（`:199`）：機陰守命，且紫府夾。
5. `ji_xiang_li_ming` 極向離明（`:225`）：紫微守命於午，且三方四正無煞忌。
6. `ji_ju_mao_you` 極居卯酉（`:238`）：紫貪守命於卯酉。
7. `ji_yue_tong_liang` 機月同梁（`:260`）
   - 命在寅申，坐同梁或機陰，可借宮。
   - variant surround：四星齊見三方四正。
8. `shan_yin_chao_gang` 善蔭朝綱（`:292`）：機梁同守命宮或身宮。
9. `ji_ju_tong_lin` 機巨同臨（`:309`）：機巨同守命；在酉時 variant=you。
10. `ji_ju_ju_mao` 機巨居卯（`:324`）：機巨守命於卯。

### sun_moon.rs（14 條）

11. `ri_yue_tong_gong` 日月同宮（`:128`）：日月同守命。
12. `ju_ri_tong_gong` 巨日同宮（`:144`）：陽巨同守命。
13. `ri_zhao_lei_men` 日照雷門（`:161`）：陽梁同坐卯，在命宮或官祿宮（variant career）。
14. `ri_yue_bing_ming` 日月並明（`:185`）：命宮三方四正的日月皆明（亮度表口徑為廟旺）。
15. `ri_yue_fan_bei` 日月反背（`:197`）：三方四正的日月皆暗（陷或不）。
16. `ri_yue_zhao_bi` 日月照壁（`:208`）：日月同守田宅。
17. `jin_can_guang_hui` 金燦光輝（`:225`）：太陽獨坐午宮為命；遇煞忌記 broken。
18. `ri_yue_cang_hui` 日月藏輝（`:241`）：日月反背，且三方四正見巨門。
19. `dan_chi_gui_chi` 丹墀桂墀（`:258`）：日月並明，且命宮坐明日或明月。
20. `ri_yue_jia_ming` 日月夾命（`:271`）：日月夾命，命宮不坐空亡類星，且命宮有吉星。
21. `ri_yue_jia_cai` 日月夾財（`:279`）：同上，改看財帛宮。
22. `yue_lang_tian_men` 月朗天門（`:286`）：太陰守命於亥。
23. `yue_sheng_cang_hai` 月生滄海（`:300`）：同陰坐子；variant soul／property。
24. `ming_zhu_chu_hai` 明珠出海（`:323`）：命宮空宮在未，對宮同巨。

### major.rs（15 條）

25. `wu_tan_tong_xing` 武貪同行（`:96`）：武貪同守命或身，於丑未。
26. `ling_chang_tuo_wu` 鈴昌陀武（`:115`）：四星齊會命宮三方四正。
27. `xing_qiu_jia_yin` 刑囚夾印（`:133`）：廉相同守命或身，且天刑或擎羊同宮。
28. `sheng_bu_feng_shi` 生不逢時（`:158`）：命坐空亡類星 + 廉貞；破軍時 variant=pojun。
29. `xiong_su_chao_yuan` 雄宿朝元（`:184`）：廉貞守命於寅申；三方見六煞記 broken。
30. `fu_xiang_chao_yuan` 府相朝垣（`:202`）：天府在官祿、天相在財帛；命宮空宮時 variant=soul_empty。
31. `huo_tan` 火貪（`:226`）：貪狼守命，火星同宮；會照時 variant=surround。
32. `ling_tan` 鈴貪（`:233`）：同上，改鈴星。
33. `shi_zhong_yin_yu` 石中隱玉（`:257`）：巨門守命或身於子午。
34. `liang_ma_piao_dang` 梁馬飄蕩（`:272`）：天梁、天馬同守命或身。
35. `yang_liang_chang_lu` 陽梁昌祿（`:290`）：四星齊會命宮三方四正。
36. `sha_po_lang` 殺破狼（`:308`）：殺破狼之一坐命或身。
37. `qi_sha_chao_dou` 七殺朝斗（`:324`）：七殺守命於子午寅申；variant yang_dou（子寅）／chao_dou（午申）。
39. `ying_xing_ru_miao` 英星入廟（`:343`）：破軍守命於子午。
40. `zhong_shui_chao_dong` 眾水朝東（`:358`）：破軍、文曲同守命於寅卯。

### lu.rs（8 條）

38. `lu_shuai_ma_kun` 祿衰馬困（`:66`）
   - 只在運限視角判定。
   - 條件：該層命宮三方四正內，禄存與空曜或耗曜同宮，且天馬與煞或化忌同宮。
   - 見七殺時 variant=qisha。
41. `san_qi_jia_hui` 三奇加會（`:120`）：祿權科齊聚命宮三方四正。全書無此格。
42. `lu_ma_jiao_chi` 祿馬交馳（`:145`）：禄存、天馬同宮（任一宮）。
43. `lu_he_yuan_yang` 祿合鴛鴦（`:169`）：命宮禄存 + 化祿同宮；命遷對拱時 variant=opposite。
44. `ming_lu_an_lu` 明祿暗祿（`:196`）：命宮有禄存（或化祿），且六合暗合宮有化祿（或禄存）。
45. `lu_ma_pei_yin` 祿馬佩印（`:216`）：禄存、天馬、天相同宮；見空亡類星記 broken。
46. `liang_chong_hua_gai` 兩重華蓋（`:242`）：命宮禄存 + 化祿 + 地空或地劫。
47. `feng_yun_ji_hui` 風雲際會（`:291`）
   - 只在大限視角判定。
   - 大限命宮三方四正見禄存、天馬或化祿，且小限或流年亦見。

### assist.rs（17 條）

48. `yang_tuo_jia_ming` 羊陀夾命（`:116`）：陀羅在命前宮、擎羊在命後宮。全書無引文。
49. `ma_tou_dai_jian` 馬頭帶劍（`:138`）：命宮在午 + 擎羊 + 同陰；貪狼化祿時另成一個 variant。
50. `zuo_you_tong_gong` 左右同宮（`:166`）。
51. `zuo_you_jia_ming` 左右夾命（`:179`）。
52. `fu_bi_gong_zhu` 輔弼拱主（`:193`）：紫微守命 + 輔弼在三方四正（surround）或夾命（jia）。
53. `kui_yue_jia_ming` 魁鉞夾命（`:218`）。
54. `zuo_gui_xiang_gui` 坐貴向貴（`:229`）：魁鉞分坐命宮與遷移宮。
55. `jie_kong_jia_ming` 劫空夾命（`:247`）。
56. `lu_feng_liang_sha` 祿逢兩殺（`:260`）：禄存與空亡類星同守命，且三方四正見地空或地劫。
57. `wen_gui_wen_hua` 文貴文華（`:280`）：昌曲同宮於命、身或命宮三方四正。全書無此四字。
58. `wen_xing_chao_ming` 文星朝命（`:305`）：昌曲皆見命宮三方四正；遇煞忌記 broken。
59. `chang_qu_jia_ming` 昌曲夾命（`:323`）：遇煞忌記 broken。
60. `wen_xing_an_gong` 文星暗拱（`:342`）：jia／opposite／surround 三種成立方式並列回報。
61. `quan_lu_sheng_feng` 權祿生逢（`:374`）：化權、化祿同守命，且都在廟旺。
62. `ke_ming_an_lu` 科明暗祿（`:395`）：化科守命 + 暗合宮有禄存；暗合宮是化祿時另成一個 variant。
63. `ke_quan_lu_jia` 科權祿夾（`:416`）：祿權科中的兩化分居命宮前後。
64. `jia_di_deng_yong` 甲第登庸（`:438`）：化科守命 + 化權在遷移或三合；再會祿時 variant=complete。

### 測試側的分布統計

- `tests/pattern_distribution.rs` 的 `GOLDEN_TALLY` 是 x-iztro 自己的命中計數快照，不是外部來源。
- `NEVER_HIT` 名單內有 zuo_you_tong_gong 與 zuo_you_jia_ming。原因是在 tier1 全部 1,560 張盤中從未命中。

## 4. 與 iztro 行為不同之處（`src/star`、`src/astro` 及周邊）

- 紅鸞標識：本命層流耀表中，iztro 把紅鸞誤寫為 `hongluanMin`；x-iztro 改正為 `hongluan`。
  - 見 `src/astro/horoscope.rs:59-60,88`。
  - 金標測試 golden_star 記錄了 120 格差異。
  - Go 測試把這點寫死：`go/iztro/parity_check_test.go:696-703`。
- 地盤／人盤的 soul 與身宮地支：金標由產生器手動覆寫（`generate_astrotype.mjs:53-57`），表示 x-iztro 的輸出與 iztro 原值不同。
- 運限晚子時日期分界：在 `day_divide=Current` 時，x-iztro 修了運限層日柱進位錯誤（`CHANGELOG.md:80-83`）。這點宣稱 iztro 2.6.1 也同修。
- `horoscope_divide=Exact` 的月柱：改用整點後 30 分比對節氣，與 lunar-lite 對齊（`CHANGELOG.md:72-79`）。
  - 產生器跳過節氣落在 HH:29:30–HH:30 的日子（`generate_config.mjs:301`），所以這個邊界沒有金標。
- `ChartView::at` 在大限視角刻意不併入流曜（`src/pattern/view.rs:150-155`）。這屬於格局層，iztro 沒有這一層。
- API 與設定差異：
  - 把 astroType 收進 Config；不提供全域 config。
  - 閏月參數改成三態 `LeapMonth`（`CHANGELOG.md:341-342`）。
  - DTO 有擴充鍵。
- iztro 的 en-US 缺 `childhood` 譯名，x-iztro 補上了（golden_i18n）。
- `CHILDHOOD_PALACES` 與取模照 iztro 保留，只在註解點明末項不可達（`CHANGELOG.md:17-19`）。
- 反推（`src/astro/reverse.rs`）、格局、知識包、to_text、夾宮文字、大限一覽文字都是 iztro 沒有的功能。

## 5. text.rs 的格式與內容，知識包如何被引用

### 格式

- 輸出 Markdown 子集（自 v0.5.0 起，`CHANGELOG.md:89-93`）。結構如下：
  - `# 命盤`
  - `## 基本信息`：生年四化帶落宮；身宮與來因宮帶宮名。
  - `## 十二宮總覽`：表格，欄位為宮位／主星／輔星／大限。
  - `## 格局`
  - `## 十二宮`：從命宮順排，每宮標題為 `### 宮名 (干支) · 大限`。
- 每宮的事實行：
  - 三方四正行。
  - 宮干飛化行。
  - 十二神標組名（長生·／博士·／歲前·／將前·）。
  - 空宮寫明「空宮」。
- 四化寫全稱：`天同(平)化权`；英文用 `[A]`–`[D]`。
- 運限文字：每層一個 `## 大限 · 命宮: 本命X (干支)` 節。大限與流年展開十二宮表；其餘層用「命宮→本命官祿」這種成對映射。

### 共 8 種 kind

- astrolabe、horoscope、patterns、palace、surrounded、flanking、decadalList，再加 horoscopePatterns。
- bridge 定義在 `src/bridge.rs:546-553`。

### 文字語言

- 與排盤語言解耦：zh-CN 盤用 en-US 渲染，與原生 en-US 盤逐位元組一致（`CHANGELOG.md:206-208`）。
- 例外：農曆日期永遠用中文數字（`src/astro/builder.rs:597-602`、`text.rs:694`；`README.md:82-83` 有聲明）。

### 知識包引用方式

- 傳入 `TextOptions.knowledge`；bridge 收 `"builtin"` 或整個包物件。
- 有知識包時：
  - 每宮事實之後接該宮星耀釋義，同宮主星的組合解讀排在前。
  - 格局列表之後接格局釋義，含成立條件。
  - 文末附四化釋義。
  - 運限文字附流耀釋義，取用處在 `text.rs:1143` 的 `pack.star_intro(flow key)`。
- 按盤取材：`for_astrolabe`／`for_horoscope` 裁出只含本盤內容的子包。
- 內嵌包只有 zh-CN；其他語言要求 builtin 時報 invalid_argument，不會靜默回退（`go/iztro/knowledge_test.go:53-60`）。

### 快照

- 21 份：7 類 × zh-CN/en-US，加 7 類帶釋義 × zh-CN（`tests/text_snapshot.rs:73-103`）。
- Rust、Python、Go 三側讀同一批，逐位元組比對。
- 只在設 `UPDATE_TEXT_SNAPSHOTS=1` 時重寫（`tests/text_snapshot.rs:24-46`）。

## 6. 測試與 CI

### 金標分層（`README.md:390-400`）

| 層 | 案例數 | 測試檔 | 說明 |
|---|---|---|---|
| Tier1 | 1,560 | `tests/golden_tier1.rs` | 逐欄比對 |
| Tier2 | 37,440 | `tests/golden_tier2.rs` | |
| Tier3 | 586,430 | `tests/golden_tier3.rs` | `:21` 標 `#[ignore]`，比對雜湊 |
| Edge | 46,228 | `tests/golden_edge.rs` | |
| Horoscope | 5,760 | `tests/golden_horoscope.rs` | |
| Variants | 14,268 | `tests/golden_variants.rs` | |
| Config | 9,696 | `tests/golden_config.rs` | |
| Astrotype | 12,488 | `tests/golden_astrotype.rs` | |
| 1602 | 2,444 | `tests/golden_1602.rs` | |

- 總計 716,314 例，與 README 一致。
- tier1 檔頭註解寫 780 例，產生器實為 1,560（`tests/golden_tier1.rs:1,5`），註解過時。

### 其他 Rust 測試

- `golden_contract`：DTO 的鍵與 JS `JSON.stringify` 逐鍵比對。
- `golden_data`：常量表比對。
- `golden_i18n`：260 個 key 與 iztro 的 `kot` 比對。
- `golden_star`：安星入口比對。
- `golden_chart_lists`：夾宮與三個列表，比對 JS 產生的資料。
- `chart_lists`：列表行為測試。
- `binding_coverage`：綁定覆蓋表。
- `config_overrides`：自訂四化表與亮度表。
- `error_paths`：錯誤碼。
- `extension`：插件擴充。
- `ffi_safety`：FFI 的 panic 防護。
- `reverse`：反推來回一致性。
- `regression`：迴歸測試。
- `knowledge_pack`：知識包完整性與合併規則。
- `lunar_table`：`:200` 全域 614 萬例標 `#[ignore]`。
- `pattern_api`、`pattern_distribution`（GOLDEN_TALLY 是自身快照）、`pattern_snapshot`（24 份 DTO 快照）、`pattern_examples`（32 張示例盤）。
- `semantic_contract`：zh-CN 與 en-US 兩份 DTO 平行走訪，所有譯文欄位都必須配語言無關 key。
- `text_snapshot`：21 份文字快照。

### 全部 `#[ignore]`（共 3 處）

- `tests/golden_tier3.rs:21`
- `tests/lunar_table.rs:200`
- `src/astro/lunar_table.rs:218`

### Python 測試

- tier1 抽 60 例、horoscope 抽 40 例，步長 101（`python/tests/test_golden.py:50,83`）。

### Go 測試

- tier1 只抽 20 例，比對 soul／body／五行局／干支／宮名（`go/iztro/iztro_test.go:57`）。
- 安星金標只比第 1 例（`go/iztro/star_golden_test.go:76,118`）。
- 讀共用快照：pattern 24 份、text 21 份、chart_lists。
- 另測：64 個 goroutine 混合呼叫、Close 競態、取消、零值與 nil 安全、500 次非法輸入轟炸（`concurrency_test.go`、`robustness_test.go`、`iztro_test.go:170-201`）。

### CI 各 job（`.github/workflows/ci.yml`）

- `rust`：
  - `cargo fmt --check`。
  - `clippy -D warnings`。
  - `cargo test`（不含 ignore）。
  - 建置 wasm32-wasip1 並上傳成品。
- `msrv`：用 1.88 跑 `cargo check --all-targets`。
- `go`：依賴 rust job。
  - 先用 repo 內嵌的 wasm 跑一次 `go test`。
  - 再換成新編譯的 wasm 跑一次。
  - 建置 `examples/go`。
- `python-tests`：用 3.10 與 3.12，經 `maturin develop` 後跑 pytest；`python` job 是聚合門。
- `docs`：`npm ci`，接著型別檢查與建置。
- `release.yml`：PR 合併到 main 且版本號有變時執行。
  - `cargo test --locked`。
  - crates.io 可信發布。
  - 打 `v*` 與 `go/iztro/v*` 兩個 tag。
  - 從 PR 抽發布說明，建 GitHub Release。
  - `gh workflow run wheels.yml`。
- `wheels.yml`：
  - 4 平台 abi3 wheel 與 sdist。
  - 只在 tag ref 上做 PyPI 可信發布。
  - 不設 skip-existing。

## 7. unsafe／FFI／wasm 邊界、網路、檔案寫入、環境變數

### unsafe

- 核心以 `#![deny(unsafe_code)]` 禁止（`src/lib.rs`）。
- 只有 `src/ffi.rs` 與 `src/wasm.rs` 豁免。
- FFI 用 `catch_unwind`。
- wasm 用打包指標回傳；wasm 上若 panic 會 trap，並損耗實例（`go/iztro/iztro_test.go:167-169` 有說明）。

### 網路

- 函式庫（Rust／Python／Go）完全沒有網路呼叫。
- 文件站會反代 `/mcp`、`/healthz`、`/install` 到 sslip.io 主機（`docs/next.config.mjs:11-12,43-60`）。
- 文件站的 `Endpoint` 元件只讀 `window.location.origin`（`docs/components/endpoint.tsx:16`）。

### 檔案寫入

- Go 會把編譯快取寫到 `os.UserCacheDir()/x-iztro/<hash>`（`go/iztro/runtime.go:131-146`）。
- Rust 測試只在設 `UPDATE_TEXT_SNAPSHOTS` 或 `UPDATE_PATTERN_SNAPSHOTS` 時寫入快照（`tests/text_snapshot.rs:41-45`）。
- `tests/error.rs` 等測試在執行期讀 `tests/golden/error_codes.json`。

### 時鐘

- `horoscope_now` 用 `chrono::Local`（`src/astro/horoscope.rs:890-896`）。
- Python 用 `datetime.now()`（`astrolabe.py:489-496`）。
- Go 的 `HoroscopeNow` 用本地時鐘。
- 結果都依賴執行機器的時區。

### 環境變數

- 建置與測試：`UPDATE_TEXT_SNAPSHOTS`、`UPDATE_PATTERN_SNAPSHOTS`、`PYO3_USE_ABI3_FORWARD_COMPATIBILITY`。
- 文件站：`ZIWEI_MCP_ORIGIN`、`NEXT_PUBLIC_SITE_URL`、`NODE_ENV`（`docs/lib/site.ts:14-17`）。

### 祕密與發版

- 發版走 OIDC 可信發布，repo 內沒有長期憑證（`release.yml:11,19-24`）。

## 8. 程式缺陷，與註解／README 不符之處

### 真缺陷（行為錯誤或有風險）

1. 反推固定用男性，卻宣稱與性別無關。
   - 固定男性：`src/astro/reverse.rs:384-391`。
   - 「與性別無關」的宣稱：`reverse.rs:9-10`、`go/iztro/reverse.go:7`、`CHANGELOG.md:272`。
   - 實際上中州派的天傷天使會依性別陰陽對調（`src/astro/star/location.rs:476-481`；`go/iztro/star.go:440-444` 自己也寫明）。
   - 後果：中州派下，用天傷或天使當條件反推女命，可能錯殺真解。
   - 沒有測試覆蓋（`tests/reverse.rs` 的條件從未用天傷天使）。
2. 發版流程可能半途卡死。
   - `release.yml` 的順序是：先發 crates.io（`:79-83`）並推 tag（`:88-97`），之後才抽發布說明（`:99-103`）。
   - 若 PR 正文缺「## 发布说明」，`release_notes.py:24` 以非零碼退出。後果：
     - 沒有 GitHub Release。
     - `wheels.yml` 不會被派發，PyPI 不發版。
   - 重跑時 tag 已存在，會被判定「跳過」（`release.yml:54-56`），PyPI 永遠補不上，只能人工處理。
3. `ConfigPatch` 沒設 `deny_unknown_fields`（`src/dto.rs:447-460`），拼錯的設定鍵會被靜默忽略。PatternConfig 與 reverseCriteria 都會拒收未知鍵，兩邊不一致。
4. `ConfigDto` 不含 overrides（`src/dto.rs:187-200`），序列化後無法還原自訂四化表與亮度表。
   - Go 與 Python 都要另外保存呼叫時傳入的原始設定才能補救：`go/iztro/types.go:473-484`、`python/x_iztro/astrolabe.py:205-210`。
5. 自訂四化表若含魁鉞等輔星，本命星的四化欄位不會反映（`src/astro/star/minor.rs:40-49` 的 with_mutagen=false），但宮干飛化會用到這張表，兩者不一致。
6. 公開函式 `translate_time` 遇到 index>12 會 panic（`src/i18n/zh_cn.rs:305`），違反 README「never panics」的承諾（`README.md:103,423`）。
7. 年齡超過最後一個大限時，會落入童限取模分支（`src/astro/horoscope.rs:520-538`）；`find_age_palace` 找不到時回傳 0（`:543-550`）。
8. `monthly_list` 沒有先驗證年份範圍（`horoscope.rs:841-848`）。若 lunar_rust 會 panic，在 wasm 上就會 trap（未驗證）。
9. 格局 #48 羊陀夾命在運限視角，可能把本命與流曜的羊陀混用（`src/pattern/rules/assist.rs:116-129`，搭配 `view.rs:81-90`）。註解說「必坐禄存」，只在本命成立。
10. Go `Close` 有競態：在 Close 之前已取得 engine 的呼叫可能永遠等待（`go/iztro/runtime.go:319-334`）。
11. Go 的 `(*Palace).SelfMutaged` 在四化清單為空時回傳 true。
    - 原因：`Has()` 不帶參數時為真（`go/iztro/types.go:179-187,327-329`）。
    - 因此 nil 宮位或未知四化 key 都會得到 true。這與 iztro 行為一致，但違反 `robustness_test.go:173-174`「nil 宮位的包含判斷應為 false」的精神，且沒有測試。
12. 韓文、越南文有同形譯名歧義（천상 可以是天相或天傷）。Python 的 `has()` 接受譯名（`star_object.py:97-103`），Go 的 `Has` 同樣接受（`types.go:178-187`）。用譯名判斷可能誤命中。

### 註解、文件與實作不符

- 「流耀沒有知識包條目」的說法錯誤，JSON 實有 50 條 flow 條目。出現位置：
  - `src/astro/horoscope.rs:97`、`src/bridge.rs:1392`
  - `python/x_iztro/data.py:123`、`python/x_iztro/knowledge.py:165`
  - `go/iztro/data.go:105-106`
- `go/iztro/knowledge.go:66`、`knowledge.py` 的類別清單漏了 `flow`。
- 「Prompt 生成」已在 v0.4.0 改名為 to_text，以下仍是舊說法：
  - `src/ffi.rs:273`、`src/bridge.rs:186,538`、`python/x_iztro/astrolabe.py:4,208`。
  - 文件站首頁範例仍呼叫已刪除的 `astro.astrolabe_to_prompt(chart)`（`docs/app/[lang]/(home)/page.tsx:87,187`；刪除記錄在 `CHANGELOG.md:164`），照抄會出錯。
- `README.md:116` 與 `README.zh-CN.md:113` 寫 `x-iztro = "0.3"`，實際版本是 0.6.1。
- `README.md:321`、`README.zh-CN.md:251` 寫「107 颗星」，實際 162。
- `README.md:366-367`、`README.zh-CN.md:342` 寫「No MCP server yet」，但文件站已把 `/mcp` 反代到外部主機。
- `README.md:103,423` 承諾「never panics」，與第 6 條真缺陷矛盾。
- `CLAUDE.md:95` 寫 to_text 有 6 種，實為 8 種。
- `src/ffi.rs:96-98` 列出的 config 鍵漏了 astroType。
- tier3 的耗時：`tests/golden_tier3.rs:8` 寫約 2 分鐘，`README.md:384` 寫約 70 秒。
- `tests/config_overrides.rs:233` 寫「五个开关」，實為 6 個。
- `go/iztro/coverage_test.go:8` 引用不存在的 `tests/golden/prompt_snapshots/`，已改名為 text_snapshots。
- `go/iztro/config_overrides_test.go:120` 的註解函式名 `...RearrangedAndPrompt` 與實際函式名 `TestCustomMutagensApplyToRearranged` 不符。
- 知識包概念條目與程式定義衝突：
  - `da-xian-pan` 寫「又叫地盘」（json:20），`liu-nian-pan` 寫「又叫人盘」（json:88）。
  - 程式裡 AstroType 的地盤／人盤是指以身宮或福德宮重排（`go/iztro/keys.go:610-618`）。
- 重複或死碼：
  - `horoscope.rs:186` 重複定義 `time_index_to_hour`（`builder.rs:253` 已有）。
  - `builder.rs:222-224` 的 `fix_lunar_day_index` 未被使用。
  - `bridge.rs:895` 重複解析 pattern_config（`:855` 已解析）。

### 測試本身的弱點

- `go/iztro/knowledge_test.go:371-374`：`ParseKnowledgePack(schema 99)` 已經回傳 nil，接著 `Merged(nil)` 失敗的原因是「nil overlay」。所以「newer schema must error」這條斷言實際沒測到版本檢查。
- `tests/regression.rs` 的 has_horoscope_stars 探針用本命主星武曲，是弱斷言。
- `go/iztro/lists_test.go:32`：用 `soul.Index-1` 取前一宮，命宮在寅時會拿到 nil；這張盤剛好不在寅。
- `go/iztro/lists_test.go:210-212`：五行局沒變時直接 `t.Skip`，可能靜默跳過。
- `go/iztro/parity_check_test.go:568-596`：HoroscopeNow 的比對跨整點或跨日時可能不穩定。
- 雜湊型金標會先排序輔星與雜耀，所以這兩類的順序只在 tier1 與 astrotype_full 受檢查（`canonical.mjs` 與 `tests/common/mod.rs` 一致）。
- `tests/golden/package.json` 有 import lunar-lite 與 lunar-typescript，但沒有宣告為相依，靠間接依賴取得。

## 9. 實際讀完的檔案與未讀的檔案

### 整檔逐行讀完（約 56,000 行）

- `src/**/*.rs`：全部，24,327 行。
- `python/x_iztro/*.py`、`.pyi` 與 `python/tests/*.py`：全部，7,828 行。`py.typed` 為 0 行。
- `go/iztro/*.go`：全部 31 檔，8,598 行；另有 `go.mod` 5 行。
- `tests/*.rs`、`tests/common/mod.rs`、`tests/golden/*.mjs`、`tests/golden/package.json`：全部，11,681 行。
- `.github/workflows/ci.yml` 119 行、`release.yml` 122 行、`wheels.yml` 86 行；`.github/scripts/release_notes.py` 44 行。
- `README.md` 501 行、`CHANGELOG.md` 382 行、`CLAUDE.md` 324 行、`Cargo.toml` 47 行、`pyproject.toml` 38 行。
- `docs` 程式檔，共 1,480 行：
  - `next.config.mjs` 75、`proxy.ts` 66、`source.config.ts` 27、`postcss.config.mjs` 5。
  - `app/` 下全部 13 個 .ts/.tsx。
  - `components/` 6 檔、`lib/` 7 檔。

### 部分讀

- `src/data/knowledge/iztro_docs.zh-CN.json`（2,487 行）：讀了 1-290 與 848-867，加上欄位結構統計。這是依指示只讀結構與前段。
- 條目數：stars 162（其中 flow 50）、patterns 64（其中 60 條有 quotes 與 conditions）、palaces 12、mutagens 4、concepts 49。

### 依指示不讀

- `tests/golden` 的 CSV／JSON 資料。只抽看了 `text_snapshots/astrolabe_zh-CN.txt` 前 45 行與 `patterns_knowledge_zh-CN.txt`。
- `docs/content/**`：186 檔、51,230 行，只用 wc 計數。
- `go/iztro/x_iztro.wasm`（二進位）。

### 不在指定範圍、未讀

- `README.zh-CN.md`：只 grep 了 3 個關鍵字。
- `go/iztro/go.sum`、`LICENSE`、`.github/pull_request_template.md`、`knowledge/SCHEMA.md`。
- `examples/**`：go／python／rust 各一組。
- `docs/README.md`、`docs/package.json`、`docs/package-lock.json`、`docs/tsconfig.json`、`docs/app/global.css`。
