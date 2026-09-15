-- The Airtable table "輔助工具" is the sole identity authority for support_methods.
-- The same-named field on "藝術治療工具" is plain text and is preserved as content only.

alter table art_therapy.tool_localizations
  add column support_method_names_text text;

update art_therapy._migration_field_map
set disposition = 'localization',
    target = 'tool_localizations(locale=''zh-TW'').support_method_names_text',
    transform_rule = 'copy_preserving_unicode_and_linebreaks',
    approval_status = 'approved'
where source_table_id = 'tblB6B3MEjb7xa19V'
  and source_field_id = 'fldhURlARgvRxQD70';

do $$
declare
  v_source_values jsonb := $support_text$[{"source_record_id":"rec02TtPOqoShTqte","support_method_names_text":"人物建構卡, 材質感官圖, 自我投射圖卡, 敘事發展卡, 情緒層次卡"},{"source_record_id":"rec0i2inNiT0i4PwN","support_method_names_text":"視覺隱喻創作, 隱喻對話, 故事延續, 框架轉換, 同義詞替換"},{"source_record_id":"rec0mqmpT811hknik","support_method_names_text":"視覺隱喻創作, 隱喻對話, 角色扮演, 同理地圖, 心智圖"},{"source_record_id":"rec0N1AEuf5BNPdzn","support_method_names_text":"句點分析法, 同義詞替換, 框架轉換"},{"source_record_id":"rec0obNnHH93nM6gv","support_method_names_text":"流程圖, 經驗旅程圖, 故事敘說, 視覺隱喻創作, 邏輯樹"},{"source_record_id":"rec0pXcvxRk0O18Hh","support_method_names_text":"視覺隱喻創作, 心智圖, 故事敘說, 創意限制"},{"source_record_id":"rec0s205XoMEqKPHT","support_method_names_text":"原型角色圖卡, 內在導師語句卡, 賦能象徵圖, 核心價值卡, 領導特質表"},{"source_record_id":"rec0TPj9IXTDDs3z2","support_method_names_text":"轉折點分析, 故事敘說, 經驗旅程圖, 心智圖, 視覺隱喻創作"},{"source_record_id":"rec0z4k0nIQ5gLGaB","support_method_names_text":"人像構圖圖卡, 性格描寫表, 影響語錄卡, 生命導引圖, 角色鏡像卡"},{"source_record_id":"rec0zptuLdYd0Rfzn","support_method_names_text":"未來羅盤, SMART 目標設定法, 形態分析圖, GROW 模型, 動機矩陣"},{"source_record_id":"rec1B3HNG97UgQlA6","support_method_names_text":"未來羅盤, GROW 模型, SWOT分析, 決策矩陣"},{"source_record_id":"rec1EhegMX232G3cp","support_method_names_text":"學習里程碑卡, 心智地圖模板, 力量來源圖卡, 障礙轉化卡, 自我肯定語句卡"},{"source_record_id":"rec1X0OLv02T2LG9S","support_method_names_text":"流程圖, 生命之輪, 時間線／反向時間軸, SMART 目標設定法"},{"source_record_id":"rec1zKdWjvcZxheRM","support_method_names_text":"視覺隱喻創作, 同理地圖"},{"source_record_id":"rec1zTahVLVRvIow5","support_method_names_text":"生活系統圖, 視覺隱喻創作, 流程圖, 心智圖, 同理地圖"},{"source_record_id":"rec299npvdE7ArUet","support_method_names_text":"角色扮演, 視覺隱喻創作, 隱喻對話, 同理地圖, 衝突地圖"},{"source_record_id":"rec2AceraWmDuwI0i","support_method_names_text":"生活系統圖, 角色扮演, 同理地圖, 衝突地圖, 邏輯樹"},{"source_record_id":"rec2ebZQ7NJ4UcUuI","support_method_names_text":"視覺隱喻創作, 隱喻對話, 框架轉換, 故事延續, 冰山模型"},{"source_record_id":"rec2xcrvmsMBCY8Ur","support_method_names_text":"視覺隱喻創作, 心智圖, 故事敘說, 同理地圖, 冰山模型"},{"source_record_id":"rec3HfABjCV86mFXq","support_method_names_text":"視覺隱喻創作, 生命之輪, 經驗旅程圖"},{"source_record_id":"rec3LhAeLS9MZEUY2","support_method_names_text":"慾望圖像卡, 失落經驗卡, 情感對照表, 時間裂縫圖, 傷痛轉化語句卡"},{"source_record_id":"rec3rCUZZQCIhq0GQ","support_method_names_text":"視覺隱喻創作, 同理地圖, 隱喻對話, 冰山模型"},{"source_record_id":"rec3RePoPwjB6bHQ5","support_method_names_text":"視覺隱喻創作, 冰山模型, 句點分析法, 六頂思考帽"},{"source_record_id":"rec3wI7BmRfKx7frB","support_method_names_text":"視覺隱喻創作, 冰山模型"},{"source_record_id":"rec46lL5ZN5oxubbi","support_method_names_text":"生命之輪"},{"source_record_id":"rec4hHIfp6ezME0ow","support_method_names_text":"SWOT分析, 個人 SWOT 分析, 心智圖, 動機矩陣, 價值觀排序"},{"source_record_id":"rec4MyrUqXiZlOfiw","support_method_names_text":"象徵圖卡, 角色轉化圖, 內在部位圖, 劇情橋段卡, 新角色信念卡"},{"source_record_id":"rec4N99iramwoDPPu","support_method_names_text":"視覺隱喻創作, 心智圖, 故事敘說"},{"source_record_id":"rec4Q6GcYA1FMCUkm","support_method_names_text":"視覺隱喻創作, 同理地圖, 創意限制"},{"source_record_id":"rec4wVYxbmNBwjzcn","support_method_names_text":"同理地圖,角色扮演,責任分配矩陣,生活系統圖,衝突地圖"},{"source_record_id":"rec54HBzwgw8aggWy","support_method_names_text":"感官參與色塊紀錄,視覺隱喻創作,心智圖,同義詞替換,經驗旅程圖"},{"source_record_id":"rec5Cm6E42df9zGMV","support_method_names_text":"價值澄清, 心智圖, 欣賞式探詢, 視覺隱喻創作"},{"source_record_id":"rec5jHTKoISaDzYuQ","support_method_names_text":"創意限制, 視覺隱喻創作, 腦力激盪, 流程圖"},{"source_record_id":"rec5Na56yQ6XMXx3w","support_method_names_text":"學員回饋語錄卡, 視覺語言風格卡, 正向心理詞卡, 視覺排版圖, 教學成效關鍵字卡"},{"source_record_id":"rec5oC0uTaoRS93Nf","support_method_names_text":"問題樹,視覺隱喻創作,衝突地圖,邏輯樹,故事敘說"},{"source_record_id":"rec5PUMsUzs8MBXTR","support_method_names_text":"心智圖, 衝突地圖, 同理地圖"},{"source_record_id":"rec5w8D0gFlucWzTJ","support_method_names_text":"故事敘說,隱喻對話,視覺隱喻創作,句點分析法,價值澄清"},{"source_record_id":"rec62PficJDxFEZrl","support_method_names_text":"心智圖,故事延續,框架轉換,同理地圖,經驗旅程圖"},{"source_record_id":"rec62UBYWBEHbwXol","support_method_names_text":"感官參與色塊紀錄,情緒詞彙掃描,同理地圖,視覺隱喻創作,冰山模型"},{"source_record_id":"rec6JnMA2frvqTCuL","support_method_names_text":"同理地圖, 框架轉換, 故事延續, 視覺隱喻創作"},{"source_record_id":"rec6s1PShXyyTXgn7","support_method_names_text":"角色扮演,視覺隱喻創作,故事敘說,冰山模型,隱喻對話"},{"source_record_id":"rec7g0MUCFSRZpOn5","support_method_names_text":"SAGA圖卡, 故事開端句卡, 情節推進卡, 角色動機圖卡, 敘事結尾創意卡"},{"source_record_id":"rec7oobLN1UFZF4YV","support_method_names_text":"觸感素材包, 觸覺詞彙卡, 情緒區塊圖, 身體感受標示圖, 內在感官地圖"},{"source_record_id":"rec7SJlcaWfICG9bm","support_method_names_text":"時間線／反向時間軸, 轉折點分析, 冰山模型, 故事延續, 問題樹"},{"source_record_id":"rec7TtYXseMWNdg4R","support_method_names_text":"視覺隱喻創作, 價值觀排序, 未來羅盤"},{"source_record_id":"rec84d5TLMpdtKgUY","support_method_names_text":"面具象徵卡, 內在聲音圖卡, 隱藏自我對話卡, 投射圖形模板, 解密自我句卡"},{"source_record_id":"rec8jgrB2hpsbjrAm","support_method_names_text":"框架轉換, 心智圖, 衝突地圖, 視覺隱喻創作, 六頂思考帽"},{"source_record_id":"rec8NhNnH7Jy6TJYO","support_method_names_text":"感官參與色塊紀錄,心智圖,視覺隱喻創作,生命之輪,經驗旅程圖"},{"source_record_id":"rec8PbXAA0VxjLHcV","support_method_names_text":"腦力激盪,同義詞替換,故事延續,視覺隱喻創作,句點分析法"},{"source_record_id":"rec8pwQUa0bNi29oM","support_method_names_text":"故事延續,視覺隱喻創作,冰山模型,流程圖,同義詞替換"},{"source_record_id":"rec8rDD7aTOnOLGIR","support_method_names_text":"工作坊證章畫, 視覺隱喻創作, 故事敘說, 欣賞式探詢, 價值澄清"},{"source_record_id":"rec8svoZJTBZSf8bx","support_method_names_text":"經驗旅程圖,生命之輪,GROW 模型,腦力激盪,心智圖"},{"source_record_id":"rec8TTadwcTnukLUI","support_method_names_text":"經驗旅程圖,角色扮演,衝突地圖,視覺隱喻創作,同理地圖"},{"source_record_id":"rec9K6CPBK0JKXN0h","support_method_names_text":"生活系統圖, SWOT分析, 決策矩陣, 推力與阻力分析, 經驗旅程圖"},{"source_record_id":"rec9KlYNcLMivEipp","support_method_names_text":"句點分析法,視覺隱喻創作,同義詞替換,流程圖,價值觀排序"},{"source_record_id":"rec9R3PgRZCAAxF4k","support_method_names_text":"視覺隱喻創作, 隱喻對話, 經驗旅程圖, 創意思考技術, 框架轉換"},{"source_record_id":"rec9YB89GLOtdsBmK","support_method_names_text":"視覺隱喻創作, 故事敘說, 冰山模型, 角色扮演"},{"source_record_id":"recAbMaECklcJY3Uf","support_method_names_text":"情緒詞彙掃描,同義詞替換,視覺隱喻創作,句點分析法,故事敘說"},{"source_record_id":"recacdP1ZgD7tqjv1","support_method_names_text":"夢境日誌, 象徵圖像卡, 自由聯想圖, 情緒色彩盤, 夢境重現繪圖"},{"source_record_id":"recaE1LjiE9Ti5H2o","support_method_names_text":"生活平衡輪, 時間管理矩陣, 價值觀排序卡, 日常活動記錄表, 目標設定工作紙"},{"source_record_id":"recAFcHQfeD0hukiI","support_method_names_text":"限制信念語句卡, 核心信念圖, 故事重構模板, 成長轉化路徑圖, 自我賦能語卡"},{"source_record_id":"recAvebJMMCeYphCS","support_method_names_text":"視覺隱喻創作, 同義詞替換, 句點分析法"},{"source_record_id":"recavpzsMN5N0VfJW","support_method_names_text":"象徵對應圖卡,視覺隱喻創作,心智圖,故事敘說,價值澄清"},{"source_record_id":"recawGAAGqZVzW94p","support_method_names_text":"能量色彩卡, 情緒-身體對應圖, 光環形狀模板, 感覺溫度詞語卡, 靜心冥想引導卡"},{"source_record_id":"recB2smVg03FrUOaE","support_method_names_text":"心智圖, 生命之輪, 視覺隱喻創作, 價值觀排序, 隱喻對話"},{"source_record_id":"recB67t5vEZKxvDm0","support_method_names_text":"感官參與色塊紀錄,冰山模型,視覺隱喻創作,心智圖,經驗旅程圖"},{"source_record_id":"recBAPFEm3PixiUo0","support_method_names_text":"生命之輪, 未來羅盤, 動機矩陣, 時間線／反向時間軸, 經驗旅程圖"},{"source_record_id":"recbD2PtPK6qAvuSJ","support_method_names_text":"隱喻對話, 視覺隱喻創作, 心智圖, SMART 目標設定法"},{"source_record_id":"recBENRvoYNUfYDsG","support_method_names_text":"角色扮演,同理地圖,衝突地圖,PDCA,視覺隱喻創作"},{"source_record_id":"recBoFqZULXshHx2A","support_method_names_text":"故事敘說,視覺隱喻創作,框架轉換,冰山模型,同義詞替換"},{"source_record_id":"recBtRHahwj7Bie21","support_method_names_text":"隱喻對話, 句點分析法, 冰山模型, 視覺隱喻創作"},{"source_record_id":"recbzfBlFJGlD7nEm","support_method_names_text":"神聖象徵圖卡, 安全場域構圖版, 能量流動箭頭卡, 情境角色擺位圖, 心靈意圖語卡"},{"source_record_id":"reccBzPCXOBqEZcCz","support_method_names_text":"流程圖,SMART 目標設定法,GROW 模型,PDCA,視覺隱喻創作"},{"source_record_id":"recco52N5YFlQAPc3","support_method_names_text":"心智圖, 視覺隱喻創作, 隱喻對話, 同義詞替換"},{"source_record_id":"recCRruqPFhaGXrGc","support_method_names_text":"角色扮演, 故事延續, 框架轉換"},{"source_record_id":"recCvKZ7Uzv2ODHCP","support_method_names_text":"框架轉換,故事延續,隱喻對話,視覺隱喻創作,GROW 模型"},{"source_record_id":"recCyiuLYsK2OXl3I","support_method_names_text":"隱喻對話,同義詞替換,視覺隱喻創作,故事敘說,句點分析法"},{"source_record_id":"recD6ZQ3VLdp2oAEo","support_method_names_text":"隱喻對話, 心智圖, 視覺隱喻創作, 同義詞替換"},{"source_record_id":"recd8nATTqHlwJCrH","support_method_names_text":"正念呼吸卡片, 情緒詞彙卡, 身體掃描引導錄音, 自我慈悲練習手冊, 靜心音樂播放清單"},{"source_record_id":"recdJsjcPC6FwZFJ8","support_method_names_text":"視覺隱喻創作,情緒詞彙清單掃描,價值觀排序,故事敘說,象徵對應圖卡"},{"source_record_id":"recdrtSk2G3UpsvOV","support_method_names_text":"星際旅程引導手冊, 靈性象徵圖卡, 內在導引冥想錄音, 宇宙能量色彩盤, 個人生命歷程圖"},{"source_record_id":"recDSy93EaoC0aYqE","support_method_names_text":"感官參與色塊紀錄,視覺隱喻創作,心智圖,生命之輪,經驗旅程圖"},{"source_record_id":"recDTxoa1rdXxL7I8","support_method_names_text":"視覺隱喻創作,同理地圖,價值觀排序,工作坊證章畫,欣賞式探詢"},{"source_record_id":"recDYhpsZstbI7tIV","support_method_names_text":"故事延續,同義詞替換,視覺隱喻創作,句點分析法,冰山模型"},{"source_record_id":"recDZQhAYaMJf1XzP","support_method_names_text":"角色扮演,冰山模型,視覺隱喻創作,衝突地圖,TRIZ"},{"source_record_id":"recE3oKb0B0Rkk96w","support_method_names_text":"價值澄清,視覺隱喻創作,PDCA,工作坊證章畫,生命之輪"},{"source_record_id":"recE8lDODKU81hli0","support_method_names_text":"DISC風格描述卡, 行為傾向對照表, 情境反應圖卡, 自我風格鏡像圖, 組織互動分析圖"},{"source_record_id":"receDEg7sYQEP9FoF","support_method_names_text":"句點分析法,冰山模型,心智圖,情緒詞彙清單掃描,SMART 目標設定法"},{"source_record_id":"recEitCAfFtq0E1qz","support_method_names_text":"視覺隱喻創作, 隱喻對話, 冰山模型, 角色扮演, 故事敘說"},{"source_record_id":"recEjz3bM8D6yF2Fb","support_method_names_text":"SMART 目標設定法, 欣賞式探詢, 創意限制, 價值觀排序, GROW 模型"},{"source_record_id":"receVnI630XqN39z5","support_method_names_text":"情緒色彩紙張, 故事構圖模板, 感受詞語卡, 創傷釋放引導手冊, 自我重建日誌"},{"source_record_id":"recF3pP7PgCAx10zx","support_method_names_text":"角色扮演,視覺隱喻創作,感官參與色塊紀錄,生命之輪,冰山模型"},{"source_record_id":"recf7xbl3OHtEqiIQ","support_method_names_text":"視覺隱喻創作, 隱喻對話, 故事延續, 框架轉換"},{"source_record_id":"recfbZM1hf5Gesz3w","support_method_names_text":"聲波視覺化軟體, 情緒音樂播放清單, 聲音與情緒對應圖表, 創作靈感筆記本, 聲音冥想引導錄音"},{"source_record_id":"recfEbxHpP72kjXoO","support_method_names_text":"生命之輪, 心智圖, 視覺隱喻創作, 流程圖"},{"source_record_id":"recFjGOKgwWe8lacx","support_method_names_text":"感官參與色塊紀錄,視覺隱喻創作,生命之輪,心智圖,價值觀排序"},{"source_record_id":"recfJnnj1M132SV8f","support_method_names_text":"視覺隱喻創作, 框架轉換, 同理地圖, 衝突地圖"},{"source_record_id":"recFMeAeAgWSDV7tl","support_method_names_text":"挑戰象徵卡, 勇氣語句卡, 成就印記圖, 個人座右銘卡, 視覺圖騰模板"},{"source_record_id":"recfrpJpTW3ehTBqZ","support_method_names_text":"故事敘說, 隱喻對話, 冰山模型, 衝突地圖, 經驗旅程圖"},{"source_record_id":"recFtxBBUqZMDZcSQ","support_method_names_text":"視覺隱喻創作,價值澄清,形態分析圖,心智圖,生命之輪"},{"source_record_id":"recfZN8rGdxmuxexH","support_method_names_text":"流體藝術技法手冊, 情緒色彩對應表, 創作過程影片, 正念繪畫引導錄音, 情緒日誌"},{"source_record_id":"recG8zdgm0CeBWCyJ","support_method_names_text":"故事敘說,視覺隱喻創作,冰山模型,句點分析法,框架轉換"},{"source_record_id":"recgcmPbCFRqKJZxU","support_method_names_text":"情緒詞彙清單掃描,生活系統圖,冰山模型,心智圖,同理地圖"},{"source_record_id":"recGeDHVWTUIEd4Ey","support_method_names_text":"心智圖, 創意限制, 視覺隱喻創作"},{"source_record_id":"recgJR8OPQYeRjBy9","support_method_names_text":"欣賞式探詢,儀式性圖卡,故事敘說,象徵對應圖卡,價值澄清"},{"source_record_id":"recGNVwUaC70PmWiW","support_method_names_text":"水平思考, 形態分析圖, 經驗旅程圖"},{"source_record_id":"recgOWrxiDWkGnJwj","support_method_names_text":"靈數計算表, 生命任務引導手冊, 價值觀排序卡, 自我探索提問清單, 生命地圖年表"},{"source_record_id":"recGQdvgWJhXSoemS","support_method_names_text":"療癒元素圖卡, 課程願景卡, 品牌色彩板, 目標學員畫像圖, 感受詞彙雲"},{"source_record_id":"recGuLwS28lnncQfU","support_method_names_text":"價值澄清, 角色扮演, 視覺隱喻創作, 同義詞替換, GROW 模型"},{"source_record_id":"recgYpnofFOzc7IyC","support_method_names_text":"情緒詞彙清單掃描,同義詞替換,視覺隱喻創作,心智圖,價值澄清"},{"source_record_id":"rech0rAu6juEoo4cC","support_method_names_text":"GROW 模型, SMART 目標設定法, 風險矩陣, 角色扮演, 價值觀排序"},{"source_record_id":"recH1gd7sghXIg6Z1","support_method_names_text":"隱喻對話,冰山模型,視覺隱喻創作,TRIZ,故事延續"},{"source_record_id":"rech33IE81cTFrZEC","support_method_names_text":"魚骨圖, 根本原因分析, 流程圖, 冰山模型"},{"source_record_id":"rech4CicPOdBPPTOg","support_method_names_text":"創意啟發卡, 自我探索問卷, 時間線圖, 成就紀錄表, 目標設定卡"},{"source_record_id":"rech6MGo4FTTX2gto","support_method_names_text":"視覺隱喻創作, 同理地圖, 句點分析法"},{"source_record_id":"rechbe69kYwINiCz9","support_method_names_text":"情緒詞語剪報模板, 目標詞語引導卡, 情緒顏色參考表, 認知轉化句式表, 自我肯定語錄集"},{"source_record_id":"recHdd5xqA5PdCURP","support_method_names_text":"視覺隱喻創作, 隱喻對話, 同理地圖, 創意思考技術, 框架轉換"},{"source_record_id":"recHDOtrBTJHa0g3N","support_method_names_text":"故事敘說,經驗旅程圖,衝突地圖,生命之輪,價值澄清"},{"source_record_id":"recHL153K4DBDvUzh","support_method_names_text":"靈魂旅程筆記本, 生命角色轉化圖表, 靜心冥想錄音, 人格成長階段模型, 象徵圖像反思卡"},{"source_record_id":"rechMSzncKqj8RGL9","support_method_names_text":"故事構圖卡, 情緒詞彙卡, 角色扮演卡, 自我認同卡, 敘事結構圖"},{"source_record_id":"recHpzhIY12QLCHhs","support_method_names_text":"OH卡圖像組, 投射聯想句卡, 情緒詞語卡, 自我反映模板, 敘事延伸指引卡"},{"source_record_id":"recHU9n3z1mGTfgxY","support_method_names_text":"框架轉換, 欣賞式探詢, 視覺隱喻創作, 價值澄清, 工作坊證章畫"},{"source_record_id":"reci9HixohimsH4AT","support_method_names_text":"導師特質象徵卡, 生命轉折年表, 敘事重寫引導句, 自我整合反思表, 心智圖發散卡"},{"source_record_id":"recIcdJYcFTi4RDQV","support_method_names_text":"心智圖, 價值觀排序, 形態分析圖, 故事敘說, 視覺隱喻創作"},{"source_record_id":"reciKCzvAJbfHYou1","support_method_names_text":"五個為什麼"},{"source_record_id":"recIn3vHGHFCLpBfR","support_method_names_text":"視覺隱喻創作"},{"source_record_id":"reciOkoOD6I254AfK","support_method_names_text":"視覺隱喻創作, 腦力激盪, 生命之輪, 同義詞替換, 同理地圖"},{"source_record_id":"recIrm2DppEF5pUb8","support_method_names_text":"視覺隱喻創作,冰山模型,六頂思考帽,價值澄清,個人 SWOT 分析"},{"source_record_id":"recISLCb6RBGoJL7T","support_method_names_text":"視覺隱喻創作, 框架轉換, 角色扮演, 欣賞式探詢"},{"source_record_id":"recjFiBDiT6nR6Sh8","support_method_names_text":"視覺隱喻創作, 同理地圖, 價值觀排序"},{"source_record_id":"recJXMAOcB3lRNfyl","support_method_names_text":"心智圖, 經驗旅程圖, 視覺隱喻創作, 價值澄清, 衝突地圖"},{"source_record_id":"recK5wjl0xuyVBraN","support_method_names_text":"儀式設計,視覺隱喻創作,價值觀排序,生命之輪,工作坊證章畫"},{"source_record_id":"recK8wHK3EPaH88Fs","support_method_names_text":"SMART 目標設定法, GROW 模型, 甘特圖, 動機矩陣"},{"source_record_id":"reckck5H67a2t0jlB","support_method_names_text":"生活系統圖, 同理地圖, 衝突地圖, 角色扮演, 責任分配矩陣"},{"source_record_id":"reckGX2MTQbMI7PDv","support_method_names_text":"生命階段卡, 人生價值卡, 核心事件卡, 自我象徵圖, 意義對話卡"},{"source_record_id":"reckj1DeRwF69kz8O","support_method_names_text":"視覺隱喻創作, 心智圖, 故事敘說, 創意限制"},{"source_record_id":"reckQG5RrZ1tYkPcn","support_method_names_text":"角色特質分析表, 榮格原型圖譜, 人格投射卡, 心理特質詞語卡, 導師角色反思寫作引導"},{"source_record_id":"reckxRCHPrg36HMvF","support_method_names_text":"時間線／反向時間軸, 轉折點分析, 故事敘說, 冰山模型, 衝突地圖"},{"source_record_id":"recl3yAtadOMwwD7e","support_method_names_text":"視覺隱喻創作, 故事敘說, 欣賞式探詢, 同理地圖, 生命之輪"},{"source_record_id":"recl8ndmZEgl45Ssp","support_method_names_text":"視覺隱喻創作"},{"source_record_id":"reclH6iSUvkF8KhMy","support_method_names_text":"價值觀排序,象徵對應圖卡,視覺隱喻創作,形態分析圖,故事敘說"},{"source_record_id":"reclkw9OfSSziMPmr","support_method_names_text":"導師原型卡, 指導風格對照表, 回憶場景模板, 智慧語錄卡, 學習階段轉化圖"},{"source_record_id":"reclMHgLxwZ7wCOln","support_method_names_text":"價值觀排序, 生命之輪, 個人 SWOT 分析"},{"source_record_id":"reclMZaNkVCZkmkxb","support_method_names_text":"框架轉換, 角色扮演, 六頂思考帽"},{"source_record_id":"reclyW3xFXj1ZWDLQ","support_method_names_text":"動物象徵圖鑑卡, 能力特質詞語卡, 能量配色卡, 精神旅程地圖, 靈性訊息句卡"},{"source_record_id":"recm9TxjmefPY8cnu","support_method_names_text":"照顧行為卡, 情緒舒緩物件圖卡, 自我需求分類表, 結構性盒型模板, 照護語句手寫卡"},{"source_record_id":"recMc4mYoPNI6k91X","support_method_names_text":"感官參與色塊紀錄,心智圖,視覺隱喻創作,情緒詞彙清單掃描,時間線"},{"source_record_id":"recMfeuKesqLmGM7m","support_method_names_text":"故事敘說,流程圖,六頂思考帽,GROW 模型,句點分析法"},{"source_record_id":"recmGrpzvoW7uhyBJ","support_method_names_text":"視覺隱喻創作,角色扮演,價值觀排序,故事延續,同理地圖"},{"source_record_id":"recncOVudoAuPjluk","support_method_names_text":"評量指標詞語卡, 能力分類圖表, 自我評估語句庫, 具體行為對照卡, 進展階段流程圖"},{"source_record_id":"recnemZlRQs8Os8AM","support_method_names_text":"價值觀排序, 生活系統圖, 欣賞式探詢, 生命之輪, 視覺隱喻創作"},{"source_record_id":"recnsmwGcClA2JmB4","support_method_names_text":"心智圖, 同理地圖, 視覺隱喻創作, 衝突地圖"},{"source_record_id":"recnuneMmxLG6VRyr","support_method_names_text":"生命之輪,視覺隱喻創作,動機矩陣,價值澄清,故事敘說"},{"source_record_id":"recnxTJ0bHeRxRqqU","support_method_names_text":"視覺隱喻創作,情緒詞彙清單掃描,句點分析法,冰山模型,同義詞替換"},{"source_record_id":"recnzP4g8Nn465PG6","support_method_names_text":"生活系統圖, 冰山模型, 同理地圖, 角色扮演, 衝突地圖"},{"source_record_id":"recO9w9M7F9I5nVXf","support_method_names_text":"時間線／反向時間軸, 句點分析法, SMART 目標設定法, 視覺隱喻創作"},{"source_record_id":"recOd0CXxygekXi7I","support_method_names_text":"經驗旅程圖, 故事敘說, 視覺隱喻創作, 問題樹"},{"source_record_id":"recodCk8j0WVRCeD0","support_method_names_text":"生命片段重寫卡, 敘事重構模板, 情緒變化圖, 自我觀點轉換卡, 時間線拼圖圖板"},{"source_record_id":"recOeuZesceZx8xLn","support_method_names_text":"身體掃描覺察,冰山模型,感官參與色塊紀錄,生命之輪,流程圖"},{"source_record_id":"recOfGMaucaTju0SH","support_method_names_text":"衝突地圖, 角色扮演, 同理地圖, 設計思考"},{"source_record_id":"recokE5LuIiNN5MyG","support_method_names_text":"視覺隱喻創作, 故事延續"},{"source_record_id":"recOPbOFxqJjqePDc","support_method_names_text":"責任分配矩陣, 角色扮演, 同理地圖, 視覺隱喻創作, 六頂思考帽"},{"source_record_id":"recOrTXGlmFlODCLU","support_method_names_text":"價值觀排序, 未來羅盤, GROW 模型, 時間線／反向時間軸, 視覺隱喻創作"},{"source_record_id":"recoSegWIuPZfi4ne","support_method_names_text":"霍蘭德六型職業卡, 興趣動機圖譜, 角色配對拼圖板, 職涯想像句卡, 工作價值觀排序圖"},{"source_record_id":"recP5azjBUc2mu2YW","support_method_names_text":"安全空間象徵圖, 失敗經驗回顧卡, 心理支持詞語卡, 內在資源地圖, 情境練習模板"},{"source_record_id":"recP7lK30NFl1Dzvk","support_method_names_text":"價值觀排序, SMART 目標設定法, GROW 模型, 同義詞替換, 生命之輪"},{"source_record_id":"recP8CCG4kPKWC4Et","support_method_names_text":"故事延續, 欣賞式探詢, 隱喻對話, 視覺隱喻創作"},{"source_record_id":"recp8QqDHzByQRlcm","support_method_names_text":"創傷象徵詞語卡, 焚燒釋放儀式指引卡, 重生圖像拼貼卡, 生命再起敘事卡, 對比前後心境圖表"},{"source_record_id":"recP8RiZgTlBWaZP0","support_method_names_text":"情緒詞彙清單掃描,冰山模型,句點分析法,視覺隱喻創作,框架轉換"},{"source_record_id":"recPA0P60PTte7FRG","support_method_names_text":"象徵圖像卡, 投射問句卡, 角色投影表, 敘事拼圖卡, 感受顏色卡"},{"source_record_id":"recPgEs7FS4ULXL3g","support_method_names_text":"冰山模型,感官參與色塊紀錄,視覺隱喻創作,句點分析法,心智圖"},{"source_record_id":"recPjtEzfxZVXOy4U","support_method_names_text":"流程圖,GROW 模型,心智圖,SMART 目標設定法,六頂思考帽"},{"source_record_id":"recPmVELhx5qccYtV","support_method_names_text":"情緒詞彙清單掃描,句點分析法,心智圖,視覺隱喻創作,冰山模型"},{"source_record_id":"recPP8VCgE8Gc50S3","support_method_names_text":"生命之輪,感官參與色塊紀錄,視覺隱喻創作,心智圖,時間線"},{"source_record_id":"recQ0lyMBlxqjTSIu","support_method_names_text":"流程圖,心智圖,GROW 模型,SMART 目標設定法,句點分析法"},{"source_record_id":"recq7zDdIVsZmtEOQ","support_method_names_text":"未來羅盤, SMART 目標設定法, 價值澄清, GROW 模型, 動機矩陣"},{"source_record_id":"recQwG0mNGnPkyRNl","support_method_names_text":"同理地圖, 角色扮演, 責任分配矩陣, 生活系統圖, 視覺隱喻創作"},{"source_record_id":"recQZEcy7nluQgkwg","support_method_names_text":"價值澄清, 視覺隱喻創作, 生命之輪, 動機矩陣"},{"source_record_id":"recR5bzLbda03d8aj","support_method_names_text":"視覺隱喻創作,同理地圖,冰山模型,角色扮演,價值觀排序"},{"source_record_id":"recR7zN64ra2JzGg5","support_method_names_text":"情緒詞彙清單掃描,框架轉換,隱喻對話,冰山模型,故事延續"},{"source_record_id":"recRAclkzdUrNFOed","support_method_names_text":"價值卡, 優先排序圖, 抉擇模擬情境卡, 核心價值映射圖, 行動一致性反思卡"},{"source_record_id":"recrc7rHmOaeV1p2h","support_method_names_text":"對比特質圖卡, 自我映射模板, 投射面具圖樣卡, 角色情境對話卡, 矛盾特質融合語卡"},{"source_record_id":"recRDFJuiDAFpKFJK","support_method_names_text":"情緒詞彙清單掃描,心智圖,冰山模型,視覺隱喻創作,生活系統圖"},{"source_record_id":"recrHQbgk3BNuE6h4","support_method_names_text":"同理地圖, 價值澄清"},{"source_record_id":"recRPITumZPwU9Zc2","support_method_names_text":"個人 SWOT 分析,價值觀排序,視覺隱喻創作,生命之輪,GROW 模型"},{"source_record_id":"recRZK2OXICvu6Lyz","support_method_names_text":"界線卡,信念卡,防衛機轉卡,改變三角卡,鏡子卡"},{"source_record_id":"recsGeYiLypx7TI9M","support_method_names_text":"象徵對應圖卡,視覺隱喻創作,價值澄清,同理地圖,故事敘說"},{"source_record_id":"recsHkERfFY9Gt9iF","support_method_names_text":"優勢資源卡, 劣勢困境句卡, 機會可能性圖卡, 威脅情境模擬卡, 生命領域對照圖"},{"source_record_id":"recsl8doH180cN39Y","support_method_names_text":"情緒詞彙清單掃描,視覺隱喻創作,心智圖,同義詞替換,故事敘說"},{"source_record_id":"recSMcn8IhJhU01Ut","support_method_names_text":"隨機詞語卡, 概念聯想圖, 圖像創作指引卡, 語義拆解卡, 故事啟動模板"},{"source_record_id":"recsMfoGKeLckaVpW","support_method_names_text":"能量色彩詞卡, 靈魂狀態象徵圖, 感受區塊色譜卡, 願景色彩拼貼卡, 靈性色調對應圖"},{"source_record_id":"recSr9nE5FrY0ekZO","support_method_names_text":"布料感官素材包, 步伐節奏圖卡, 心路歷程繪圖板, 感官詞語卡, 創作儀式卡"},{"source_record_id":"recSs9wmpgEbbj5Sa","support_method_names_text":"情緒溫度計,情緒詞彙表,感官卡,身體地圖,正向句卡"},{"source_record_id":"recSSC5ZbS5ujcrSd","support_method_names_text":"情緒字卡,角色扮演卡,人際角色圖卡,衝突解法卡,希望卡"},{"source_record_id":"recsyu04fqenHhbyq","support_method_names_text":"視覺隱喻創作, 價值觀排序, 六頂思考帽, 形態分析圖, 同義詞替換"},{"source_record_id":"recSzl5lt3d3m3OpQ","support_method_names_text":"澄清卡句卡, 情境設定圖卡, 決策交叉點模板, 自我提問引導卡, 圖像對話卡"},{"source_record_id":"recTeoLQ2wpdJOmUn","support_method_names_text":"療癒語錄卡, 書寫風格範本, 正念書寫呼吸卡, 書寫版型卡, 情感共鳴詞語卡"},{"source_record_id":"rectiP4daKbiTtJ3N","support_method_names_text":"視覺隱喻創作, 隱喻對話, 心智圖, 故事敘說, 創意限制"},{"source_record_id":"rectxOZMXTrhwLfLJ","support_method_names_text":"冰山模型,框架轉換,隱喻對話,視覺隱喻創作,同理地圖"},{"source_record_id":"recTZqBYGWxAYoGph","support_method_names_text":"內在小孩卡,慾望卡,信念重塑卡,價值卡,資源卡"},{"source_record_id":"recU0iyqFkkNVpmT0","support_method_names_text":"事件卡,時間線卡,信念卡,小步驟卡,障礙卡"},{"source_record_id":"recu6mZjnuDOvOOI2","support_method_names_text":"角色扮演,六頂思考帽,推力與阻力分析,同理地圖,故事敘說"},{"source_record_id":"recUfgrQyTKHSjDxj","support_method_names_text":"MBTI性格敘述卡, 情境行為卡, 類型圖像符號卡, 優勢挑戰配對卡, 自我觀察日誌模板"},{"source_record_id":"recUi6hlA97Vt0iTi","support_method_names_text":"視覺隱喻創作,角色扮演,價值觀排序,同理地圖,故事敘說"},{"source_record_id":"recujT9yMDnxj7H9C","support_method_names_text":"聲音意象連結卡, 聽覺情緒對照圖, 音波視覺化模板, 感官五感擴散圖, 聲音記憶觸發卡"},{"source_record_id":"recuLMzTGZoyYY58A","support_method_names_text":"圈層結構模板, 心理需求詞卡, 互動關係角色圖卡, 治癒象徵顏色卡, 疊圖透明板"},{"source_record_id":"recuRlBGfH6xBvvn6","support_method_names_text":"框架轉換, 欣賞式探詢, 視覺隱喻創作, 形態分析圖, 句點分析法"},{"source_record_id":"recuU6CZy6r619xBb","support_method_names_text":"生命之輪, 生活系統圖, 同義詞替換, 視覺隱喻創作, 價值觀排序"},{"source_record_id":"recuXGfC4fem89Kps","support_method_names_text":"冰山模型,框架轉換,隱喻對話,視覺隱喻創作,故事延續"},{"source_record_id":"recv3mYMeRvyJHpsj","support_method_names_text":"價值觀排序, 未來羅盤, SMART 目標設定法, 生命之輪, 視覺隱喻創作"},{"source_record_id":"recvd7VTGhAGrJ5gh","support_method_names_text":"同理地圖,角色扮演,工作坊證章畫,生活系統圖,故事敘說"},{"source_record_id":"recVhPYrnLjYOTIvp","support_method_names_text":"視覺隱喻創作,心智圖,同義詞替換,隱喻對話,象徵對應圖卡"},{"source_record_id":"recVKl33EF7gS4Fpx","support_method_names_text":"價值澄清, 生命之輪, GROW 模型, 故事敘說, 工作坊證章畫"},{"source_record_id":"recVoUhpZNaoM737e","support_method_names_text":"儀式性圖卡,推力與阻力分析,故事敘說,角色扮演,工作坊證章畫"},{"source_record_id":"recvSwmwFka47H9cd","support_method_names_text":"時間線／反向時間軸, 同理地圖, 視覺隱喻創作, GROW 模型, 故事敘說"},{"source_record_id":"recvtICCgm5njQZ0p","support_method_names_text":"時間線／反向時間軸, 轉折點分析"},{"source_record_id":"recW73n2EO7tG59MD","support_method_names_text":"冰山模型,框架轉換,句點分析法,視覺隱喻創作,故事延續"},{"source_record_id":"recWqudisvEJPEzQr","support_method_names_text":"動機矩陣, 心智圖"},{"source_record_id":"recwRtsuortw6ehtX","support_method_names_text":"甘特圖, 動機矩陣, 推力與阻力分析, 風險矩陣"},{"source_record_id":"recWs9B0tUulJxOve","support_method_names_text":"視覺隱喻創作,六頂思考帽,價值澄清,隱喻對話,象徵對應圖卡"},{"source_record_id":"recwsZ19JfPrsJt4r","support_method_names_text":"故事敘說, 時間線／反向時間軸, 未來羅盤, 工作坊證章畫, 欣賞式探詢"},{"source_record_id":"recwUxwa2v0xnnUXs","support_method_names_text":"心靈旅程階段圖, 靈性轉化語句卡, 內在旅程象徵卡, 靈性經驗時間線模板, 實踐儀式指南卡"},{"source_record_id":"recWx16lsIYgRMK04","support_method_names_text":"生命線卡,價值卡,角色卡,信念卡,敘事拼圖卡"},{"source_record_id":"recX0vSlsLqz4qIEM","support_method_names_text":"隱喻句卡, 象徵圖案庫, 轉化意象模板, 語意聯想圖卡, 潛意識引導敘事卡"},{"source_record_id":"recxDcNExVE1zV0ID","support_method_names_text":"價值觀排序, SWOT分析, 心智圖"},{"source_record_id":"recXennG1G1TE0Ike","support_method_names_text":"價值觀排序,視覺隱喻創作,故事敘說,GROW 模型,角色扮演"},{"source_record_id":"recXf3hVZ46vaIwQU","support_method_names_text":"習慣追蹤卡,行為模式卡,目標設定卡,正向句卡,生活系統圖"},{"source_record_id":"recXFcFi9hDferZmi","support_method_names_text":"視覺隱喻創作, 心智圖, 同理地圖, 角色扮演, 價值觀排序"},{"source_record_id":"recXhWkKxgd6PKBwb","support_method_names_text":"隱喻對話,視覺隱喻創作,冰山模型,SCAMPER,同理地圖"},{"source_record_id":"recxIUGiyyBkpuLK5","support_method_names_text":"SMART 目標設定法, GROW 模型, 甘特圖"},{"source_record_id":"recxoxiekm9n1eQ9P","support_method_names_text":"步驟卡, 任務拆解表, 圖解思考模板, 技能建構圖, 自我教練語句卡"},{"source_record_id":"recXTG5QRXOiXDCvt","support_method_names_text":"未來羅盤, 推力與阻力分析, 邏輯樹, 同理地圖, 視覺隱喻創作"},{"source_record_id":"recXWQAgwYyjCKbpx","support_method_names_text":"感官卡,情緒詞彙表,記憶地圖,內在小孩卡,敘事拼圖卡"},{"source_record_id":"recxwrHByuNCJDMmf","support_method_names_text":"舊書頁素材, 故事重構卡, 創傷象徵圖卡, 黏貼表達圖紙, 轉化語句卡"},{"source_record_id":"recxXdzXrTs9RzUpW","support_method_names_text":"心智圖, 故事延續, 同理地圖, 隱喻對話, 經驗旅程圖"},{"source_record_id":"recXXpnXyoyRW9bBR","support_method_names_text":"冰山模型,視覺隱喻創作,心智圖,隱喻對話,同理地圖"},{"source_record_id":"recXyG4zMwCU69PR8","support_method_names_text":"榮格原型卡,陰影卡,角色卡,內在小孩卡,情緒詞彙表"},{"source_record_id":"recy6DnhuFYef9Kup","support_method_names_text":"視覺隱喻創作, 心智圖, 創意限制, 故事敘說"},{"source_record_id":"recyb0Op7tP0Mflpk","support_method_names_text":"氣味感官卡, 色彩象徵卡, 自我調和圖, 品牌語言卡, 身心感受日誌"},{"source_record_id":"recYDFnBh4eTGjGye","support_method_names_text":"情緒追蹤卡, 自我觀察日誌, 時間線繪圖, 問題重現圖, 情緒溫度計"},{"source_record_id":"recyhce5L0WotVBUm","support_method_names_text":"體驗學習階段圖, 模組轉換拼圖板, 反思問句卡, 學習困難詞語卡, 成長里程標示卡"},{"source_record_id":"recyI3EMSpkDkCMpH","support_method_names_text":"視覺隱喻創作, 創意思考技術, 隱喻對話"},{"source_record_id":"recyieZCd16na14n4","support_method_names_text":"情緒分類圖卡, 人際角色圖卡, 關係距離圖, 衝突動態箭頭卡, 心理關係地圖"},{"source_record_id":"recyiZj9r9K2inEIJ","support_method_names_text":"轉折點分析, 同義詞替換, GROW 模型, 視覺隱喻創作, 問題樹"},{"source_record_id":"recYmcyfM3wV2If9k","support_method_names_text":"視覺隱喻創作, 冰山模型, 同義詞替換, 同理地圖, 價值觀排序"},{"source_record_id":"recZa7wQ7AR4E7RAU","support_method_names_text":"故事敘說, 視覺隱喻創作, 句點分析法, 創意限制"},{"source_record_id":"reczBn6u0hNEVGNoG","support_method_names_text":"自我映照圖卡, 夢境意象卡, 對話鏡面卡, 反轉象徵卡, 潛意識訊息卡"},{"source_record_id":"recZEoiaWXgv0fbx1","support_method_names_text":"根本原因分析, 五個為什麼, 問題樹, 故事敘說"},{"source_record_id":"recZGugBEvTwYu1Bw","support_method_names_text":"SMART 目標設定法, 工作坊證章畫, 視覺隱喻創作, 欣賞式探詢, 生命之輪"},{"source_record_id":"reczigFNgENU3aOX8","support_method_names_text":"嗅覺記憶卡, 情緒對應氣味表, 氣味觸發記錄表, 色彩聯想圖, 回憶重構卡"},{"source_record_id":"reczLdjUiXgrYy5oh","support_method_names_text":"角色扮演, 視覺隱喻創作, 隱喻對話, 故事敘說"},{"source_record_id":"reczSgTDW9rY6lRqt","support_method_names_text":"創作階段卡, 成就感量表, 自我觀察問卷, 建設性回饋語卡, 成長曲線圖"},{"source_record_id":"reczYxhPfdjMtGRv5","support_method_names_text":"學習風格對照卡, 動機來源圖譜, 認知偏好圖卡, 情緒反應卡片組, 個人學習語錄卡"}]$support_text$::jsonb;
  v_updated integer;
begin
  if jsonb_array_length(v_source_values) <> 253 then
    raise exception 'Expected 253 nonempty support-method text values';
  end if;

  with source_values as (
    select *
    from jsonb_to_recordset(v_source_values)
      as x(source_record_id text, support_method_names_text text)
  )
  update art_therapy.tool_localizations tl
  set support_method_names_text = sv.support_method_names_text,
      updated_at = now()
  from source_values sv
  join art_therapy._migration_source_map sm
    on sm.source_table_id = 'tblB6B3MEjb7xa19V'
   and sm.source_record_id = sv.source_record_id
   and sm.target_table = 'tools'
  where tl.tool_id = sm.target_id
    and tl.locale = 'zh-TW';

  get diagnostics v_updated = row_count;
  if v_updated <> 253 then
    raise exception 'Expected to preserve 253 text values, updated %', v_updated;
  end if;

  if exists (
    with source_values as (
      select *
      from jsonb_to_recordset(v_source_values)
        as x(source_record_id text, support_method_names_text text)
    )
    select 1
    from source_values sv
    join art_therapy._migration_source_map sm
      on sm.source_table_id = 'tblB6B3MEjb7xa19V'
     and sm.source_record_id = sv.source_record_id
     and sm.target_table = 'tools'
    join art_therapy.tool_localizations tl
      on tl.tool_id = sm.target_id
     and tl.locale = 'zh-TW'
    where tl.support_method_names_text is distinct from sv.support_method_names_text
  ) then
    raise exception 'Support-method text round-trip mismatch';
  end if;
end
$$;

do $$
declare
  v_derived_ids uuid[];
  v_derived_junction_ids uuid[];
  v_deleted integer;
begin
  select array_agg(distinct target_id order by target_id)
    into v_derived_ids
  from art_therapy._migration_source_map
  where target_table = 'support_methods'
    and disposition = 'derived_from_relationship_token';

  if cardinality(v_derived_ids) <> 352 then
    raise exception 'Expected 352 incorrectly promoted support methods, found %', cardinality(v_derived_ids);
  end if;

  select array_agg(id order by id)
    into v_derived_junction_ids
  from art_therapy.tool_support_methods
  where support_method_id = any(v_derived_ids);

  if cardinality(v_derived_junction_ids) <> 401 then
    raise exception 'Expected 401 derived support-method relationships, found %', cardinality(v_derived_junction_ids);
  end if;

  delete from art_therapy._migration_source_map
  where target_table = 'tool_support_methods'
    and target_id = any(v_derived_junction_ids);
  get diagnostics v_deleted = row_count;
  if v_deleted <> 401 then
    raise exception 'Expected 401 derived relationship mappings deleted, got %', v_deleted;
  end if;

  delete from art_therapy._migration_source_map
  where target_table = 'support_methods'
    and target_id = any(v_derived_ids)
    and disposition = 'derived_from_relationship_token';
  get diagnostics v_deleted = row_count;
  if v_deleted <> 352 then
    raise exception 'Expected 352 derived entity mappings deleted, got %', v_deleted;
  end if;

  delete from art_therapy.support_methods
  where id = any(v_derived_ids);
  get diagnostics v_deleted = row_count;
  if v_deleted <> 352 then
    raise exception 'Expected 352 derived support methods deleted, got %', v_deleted;
  end if;
end
$$;

insert into art_therapy._migration_exceptions (
  id, run_id, exception_code, source_table_id, source_field_id,
  detail, resolution, approved
)
select
  gen_random_uuid(), id, 'PLAIN_TEXT_NOT_IDENTITY',
  'tblB6B3MEjb7xa19V', 'fldhURlARgvRxQD70',
  'A singleLineText field was incorrectly tokenized into 352 support-method identities and 401 relationships.',
  'The 253 source strings are preserved in tool_localizations.support_method_names_text; only the 54 records from the authoritative 輔助工具 table remain identities.',
  true
from art_therapy._migration_runs
where not exists (
  select 1 from art_therapy._migration_exceptions
  where exception_code = 'PLAIN_TEXT_NOT_IDENTITY'
    and source_table_id = 'tblB6B3MEjb7xa19V'
    and source_field_id = 'fldhURlARgvRxQD70'
);

update art_therapy._migration_runs
set counts = counts || jsonb_build_object(
  'support_methods', (select count(*) from art_therapy.support_methods),
  'support_method_localizations', (select count(*) from art_therapy.support_method_localizations),
  'tool_support_methods', (select count(*) from art_therapy.tool_support_methods),
  '_migration_source_map', (select count(*) from art_therapy._migration_source_map),
  '_migration_exceptions', (select count(*) from art_therapy._migration_exceptions)
);

do $$
begin
  if (select count(*) from art_therapy.support_methods) <> 54
     or (select count(*) from art_therapy.support_method_localizations) <> 108
     or (select count(*) from art_therapy.support_method_localizations where locale = 'zh-TW') <> 54
     or (select count(*) from art_therapy.support_method_localizations where locale = 'en') <> 54
     or (select count(*) from art_therapy.tool_support_methods) <> 765
     or (select count(*) from art_therapy.tool_localizations where locale = 'zh-TW' and support_method_names_text is not null) <> 253 then
    raise exception 'Support-method authority count verification failed';
  end if;

  if exists (
    select 1
    from art_therapy.support_methods sm
    where not exists (
      select 1 from art_therapy._migration_source_map m
      where m.target_table = 'support_methods'
        and m.target_id = sm.id
        and m.disposition = 'canonical'
        and m.source_table_name = '輔助工具'
    )
  ) then
    raise exception 'A support-method identity does not originate from the authoritative source table';
  end if;

  if exists (
    select 1 from art_therapy._migration_source_map
    where disposition = 'derived_from_relationship_token'
       or target_table like 'clinical%'
  ) then
    raise exception 'Invalid derived or clinical mapping remains';
  end if;
end
$$;
