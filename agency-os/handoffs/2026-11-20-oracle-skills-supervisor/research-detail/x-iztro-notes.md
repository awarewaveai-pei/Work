NOTES (interim)
READ: CLAUDE.md 324, Cargo.toml 47, pyproject 38, lib.rs 131, astro/{builder 851,mod 22,context 131,horoscope 1208,lunar_table 241,palace 224,rearrange 171,query 333,reverse 820}, star/{location 788,major 103,minor 100,mod 54,adjective 189,decorative 251,query 255}
- late zi: context.rs:56-68 uses hour 23 for t=12 under Forward -> lunar day unchanged; location.rs:225-232 next-day only for ziwei start; daily stars location.rs:339-343 => iztro 2.6.1 behaviour (no whole-chart day change)
- rearrange.rs:27 BODY_OFFSET table, rearrange.rs:53 body = soul+offset (iztro 2.6.1)
- horoscope.rs:186 duplicates builder::time_index_to_hour (builder.rs:253)
- horoscope.rs:59-60,88 hongluan fix vs iztro hongluanMin
- horoscope.rs:520-538 ages beyond last decadal -> childhood modulo; find_age_palace returns 0 if not found (543-550)
- horoscope.rs:890-896 horoscope_now uses chrono::Local (local clock, TZ dependent)
- reverse: Gender::Male fixed reverse.rs:384-391; claim gender-free reverse.rs:9-10; but location.rs:476-481 tianshang/tianshi swap by gender under Zhongzhou -> reverse_chart w/ zhongzhou+tianshang/tianshi criterion gender-dependent
- lunar_table.rs:46-53 defect probe; 79-86 remap
- builder.rs:222-224 fix_lunar_day_index unused
READ more: data/{types 1054,constants 145,earthly 151,heavenly 130,mod 10,stars 1239}, models/* all, utils 221, error 202, ffi 323, wasm 139, python 122, bridge 1716, dto 1050, i18n/* all (mod171 lookup247 patterns119 + 6 lang), knowledge/mod 594, pattern/{mod345,keys302,view580,rules/mod46,rules/ziwei874}
- bridge.rs:538 & ffi.rs:273 mention "Prompt 生成"/"AI prompt generators" – no such kind in dispatch (stale)
- ffi.rs:96-98 config keys list omits astroType/mutagens/brightness (stale)
- dto.rs:447-460 ConfigPatch no deny_unknown_fields -> typo keys ignored (vs PatternConfig deny_unknown_fields pattern/mod.rs:44, reverseCriteria rejects unknown bridge.rs:290)
- dto ConfigDto (dto.rs:187-200) omits mutagens/brightness overrides -> DTO config not round-trippable
- bridge.rs:895 patternsToText re-parses pattern_config (dup of 855)
- CLAUDE.md:95 says 6 to_text kinds; bridge.rs:546-553 has 8 (flanking, decadalList added)
- horoscope.rs:97 & bridge.rs:1392 say 流耀 no knowledge entry; CLAUDE.md:233-235 says 55 self-written incl 50 flow entries -> check JSON
- i18n time_name panics idx>12 (zh_cn.rs:305) via pub translate_time
- i18n/patterns.rs:3 names 「按《紫微斗数全书》原名」
- rules/mod.rs:2 says 引文为《紫微斗数全书》
PATTERNS ziwei.rs:
1 jun_chen_qing_hui 君臣庆会 :75 4 variants zi_po_zuo_you_jia(紫破守命+辅弼夹,无煞忌) / zi_xiang_chang_qu_axis(紫相守命+昌曲命迁对) / tian_fu_ji_yin_tong_liang_jia(天府守命,机阴同梁四星分布命宫前后两宫可借对宫) / zi_zuo_you_tong_gong(紫左右同宫,煞忌只记broken) 出处全书引文 :70
2 zi_fu_tong_gong :159 紫府同守命 「紫府同宫终身福厚」
3 jin_yu_fu_jia :172 天府守命丑未+日月夹 (作者改紫微为天府) 不要求无煞
4 zi_fu_jia_ming :199 机阴守命+紫府夹
5 ji_xiang_li_ming :225 紫微守命午+三方四正无煞忌
6 ji_ju_mao_you :238 紫贪守命卯酉
7 ji_yue_tong_liang :260 命寅申 同梁或机阴(借宫) ; variant surround 四星齐见三方四正
8 shan_yin_chao_gang :292 机梁同守命或身宫
9 ji_ju_tong_lin :309 机巨同守命, 酉 variant you
10 ji_ju_ju_mao :324 机巨守命卯
sun_moon.rs (788 read):
11 ri_yue_tong_gong :128 日月同守命 「日月同临 官居侯伯」
12 ju_ri_tong_gong :144 阳巨同守命 「巨日同宫 官封三代」
13 ri_zhao_lei_men :161 阳梁同坐卯, 命宫(None)或官禄(variant career) 昼生不作条件
14 ri_yue_bing_ming :185 命三方四正日月皆明(表:庙旺)
15 ri_yue_fan_bei :197 命三方四正日月皆暗(陷/不)
16 ri_yue_zhao_bi :208 日月同守田宅
17 jin_can_guang_hui :225 太阳独坐午命; 煞忌->broken
18 ri_yue_cang_hui :241 日月反背+三方四正见巨门; 昼夜生口径不采
19 dan_chi_gui_chi :258 日月并明且命宫坐明日或明月
20 ri_yue_jia_ming :271 日月夹命+命不坐空亡星(旬空/空亡/截路/截空)+命有吉星(六吉或禄权科)
21 ri_yue_jia_cai :279 同上换财帛
22 yue_lang_tian_men :286 太阴守命亥 (子生夜生不作条件)
23 yue_sheng_cang_hai :300 同阴坐子, variant soul/property
24 ming_zhu_chu_hai :323 命空宫在未,对宫同巨
major.rs (819 read):
25 wu_tan_tong_xing :96 武贪同守命或身(丑未)
26 ling_chang_tuo_wu :115 铃昌陀武四星齐会命三方四正
27 xing_qiu_jia_yin :133 廉相同守命/身 + 天刑或擎羊同宫 (刑囚夹忌/刑忌夹印不实现)
28 sheng_bu_feng_shi :158 命坐空亡星+廉贞; 破军 variant pojun
29 xiong_su_chao_yuan :184 廉贞守命寅申; 三方见六煞->broken
30 fu_xiang_chao_yuan :202 天府在官禄+天相在财帛; 命空宫 variant soul_empty
31 huo_tan :226 贪狼守命+火星同宫; 三方四正会照 variant surround (未要求庙旺)
32 ling_tan :233 同上铃星
33 shi_zhong_yin_yu :257 巨门守命/身于子午
34 liang_ma_piao_dang :272 天梁天马同守命/身 (古书「陷」不作条件)
35 yang_liang_chang_lu :290 阳梁昌禄四星齐会命三方四正
36 sha_po_lang :308 杀破狼之一坐命或身, 证据三星
37(页序) qi_sha_chao_dou :324 七杀守命子午寅申 variant yang_dou(子寅)/chao_dou(午申)
39 ying_xing_ru_miao :343 破军守命子午
40 zhong_shui_chao_dong :358 破军文曲同守命寅卯
lu.rs (826 read):
38 lu_shuai_ma_kun :66 行运only; 限命三方四正内 禄存同宫空曜(天空地空截空旬空)或耗曜(大耗小耗地劫,含博士12大耗小耗) 且 天马同宫煞忌(羊陀天刑阴煞或该层化忌); 见七杀 variant qisha
41 san_qi_jia_hui :120 禄权科齐聚命三方四正 (作者自述全书无此格); variant ke_soul_lu_wealth_quan_career
42 lu_ma_jiao_chi :145 禄存天马同宫(任一宫,主); variant surround 命三方四正俱见
43 lu_he_yuan_yang :169 命宫禄存+化禄同宫; 命迁对拱 variant opposite
44 ming_lu_an_lu :196 命禄存(化禄)+暗合宫(六合)化禄(禄存)
45 lu_ma_pei_yin :216 禄存天马天相同宫任一宫; 见空亡星->broken
46 liang_chong_hua_gai :242 命宫禄存+化禄+地空/地劫; variant kong_yao 天空截空旬空
47 feng_yun_ji_hui :291 大限视角only; 大限命三方四正见禄存/天马/化禄 且 小限(None/same_palace)或流年(yearly/yearly_same_palace)亦见; 小限化禄按大限四化
assist.rs (1032 read): count total 10+14+15+8+17=64
48 yang_tuo_jia_ming :116 陀罗命前宫+擎羊命后宫 (作者说明全书无引文) 禄存入证据
49 ma_tou_dai_jian :138 命午+擎羊同宫+同阴同宫(空宫借对宫); variant tanlang_lu 贪狼化禄+擎羊
50 zuo_you_tong_gong :166 辅弼同守命或身
51 zuo_you_jia_ming :179 辅弼夹命
52 fu_bi_gong_zhu :193 紫微守命+辅弼皆在三方四正(surround)或夹(jia)
53 kui_yue_jia_ming :218 魁钺夹命
54 zuo_gui_xiang_gui :229 魁钺分坐命迁
55 jie_kong_jia_ming :247 劫空夹命
56 lu_feng_liang_sha :260 禄存+空亡星同守命 且三方四正见地空或地劫
57 wen_gui_wen_hua :280 昌曲同宫于命/身/命三方四正之一 (作者说明全书无此四字)
58 wen_xing_chao_ming :305 昌曲皆见命三方四正; 煞忌->broken
59 chang_qu_jia_ming :323 昌曲夹命; 煞忌->broken
60 wen_xing_an_gong :342 variants jia/opposite/surround 并报
61 quan_lu_sheng_feng :374 化权化禄同守命且皆庙旺
62 ke_ming_an_lu :395 化科守命+暗合宫禄存; variant hua_lu 暗合宫化禄
63 ke_quan_lu_jia :416 禄权科两化分居命前后
64 jia_di_deng_yong :438 化科守命+化权在迁移或三合; 再会禄 variant complete
- assist.rs:116-129 yang_tuo_jia_ming in horoscope view: flow 陀/羊 count (view.rs:81-90) so mixed natal/flow pair possible; doc claim 「必坐禄存」 only holds natally
text.rs 1714 read. knowledge JSON: 2487 lines, top keys concepts(49) extends id language mutagens(4) palaces(12) patterns(64; 60 have quotes+conditions) schema source stars(162; 50 category flow); version 2026-08-19+ec2d58b; source commit ec2d58bb..., license MIT author Sylar Long; adapted note json:854
- JSON concepts da-xian-pan 「又叫地盘」:20, liu-nian-pan「又叫人盘」:88 vs AstroType Earth/Human = 身宫/福德宫重排 (types.rs:405-411) terminology conflict
- horoscope.rs:97 & bridge.rs:1392 comment "流耀没有知识包条目" contradicted by 50 flow entries; text.rs:1143 flow_notes uses pack.star_intro(flow key)
- text: astrolabe.lunar_date always Chinese numerals (builder.rs:597-602) even in en-US text (text.rs:694)
GENERATORS all read (canonical 64, 15 generate_*). package.json iztro "2.6.1" exact; imports lunar-lite/lunar-typescript not declared (transitive)
- generate_astrotype.mjs:53-57 overrides earthlyBranchOfBodyPalace + soul (confirmed)
- generate_config.mjs:301 skips 节气 at HH:29:30-HH:30 (two astro libs differ seconds)
- generate_variants.mjs:66-68 excludes 闰月 days beyond normal month length (JS unreachable)
- tier1 generator 1560 cases; tests/golden_tier1.rs:1,5 says 780 (stale)
- tier3 comment :8 "release ~2 min" vs CLAUDE ~70s
- hash canonical sorts minor/adjective (order unchecked except tier1 sets/astrotype_full); flow star lists sorted in horoscope golden
- golden data incl tier3 CSVs committed in git (60 tier3, 60 tier2, 48 tier_edge files)
tests read: common/mod 357, golden_tier1 457, tier2 220, tier3 28 (#[ignore]), edge 27, 1602 22, horoscope 51
TESTS all tests/*.rs read (25 files). #[ignore]: golden_tier3.rs:21; lunar_table.rs:200 (full domain 614万); src/astro/lunar_table.rs:218 (month table)
- reverse.rs tests: criteria_of never uses Tianshang/Tianshi; Zhongzhou case (reverse.rs:254) -> gender bug untested
- config_overrides.rs:233 comment "五个开关" (actually 6); custom mutagens on Kui/Yue/Lucun etc not applied to natal star.mutagen because minor.rs:40-49 with_mutagen=false, while palace.mutagen_stars uses table -> inconsistent
- golden_i18n: 260 keys; iztro en-US missing childhood
- golden_star: iztro hongluanMin typo 120 cells at origin
- pattern_distribution GOLDEN_TALLY self-snapshot (not external); NEVER_HIT zuo_you_tong_gong/zuo_you_jia_ming
- pattern_examples: 32 example charts from iztro-docs page, searched 1950-2020
- regression has_horoscope_stars probe uses 武曲 (natal, not flow) -> weak
- text snapshots: 7 kinds x zh/en + 7 knowledge zh = 21 files
PYTHON pkg all 21 files read (7,867 incl tests? no: pkg only). Notes:
- python/x_iztro/astrolabe.py:4,208 mention "Prompt" (no such API, stale)
- python/x_iztro/data.py:123 & knowledge.py:165 stale ("流耀没有独立知识包条目", category list lacks flow)
- python horoscope(): datetime.now() local (astrolabe.py:489-496)
- python plugin monkey-patches Astrolabe class globally (plugin.py:51)
- Astrolabe._input_config keeps overrides because DTO config drops them (astrolabe.py:205-210) -> confirms DTO lossy
- has()/have() accept translated names (star_object.py:97-103) -> ko/vi homonyms ambiguity (천상 天相/天伤)
PYTHON tests all 8 read (test_parity 1010 etc). Python tests sample tier1 60 & horoscope 40 (test_golden.py:50,83) using stride 101.
- monthly_list(year) no year-range validation before lunar_rust LunarYear::from_lunar_year (horoscope.rs:841-848); python test expects IztroError for 99999 (test_chart_lists.py:209-211) -> relies on catch/err; on wasm a panic would trap (unverified whether lunar_rust panics)
