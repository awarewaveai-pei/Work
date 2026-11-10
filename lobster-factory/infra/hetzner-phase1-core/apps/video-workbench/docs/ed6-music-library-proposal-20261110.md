# ED.6 內建曲庫提案（2026-11-10，給操作者決定：監工台待決 1）

**結論**：推薦方案 B「標準」：配樂 80 首（Lyria 3.5）＋音效 24＋環境音 12。生成費約 **US$21.44**（配樂 $12.80＋音效／環境音上限估 $8.64），另需 ElevenLabs 付費方案（等級待確認，見 §2 R2）。先試做 5 首（$0.80）聽品質，再整批生成。

出處規則：程式碼 `檔案:行`；`tools-editor.js` 已拆檔（ED.0，`a98153452`），行號以 commit `7f792b6ca` 為準。

## 1. 現況（AwareWave 已有什麼）

| 事實 | 出處 |
|---|---|
| 音樂工具只有表單，**沒有接生成服務**，按鈕停用：「尚未接入音樂生成服務」 | `scripts/tools-voice-music.js:260` |
| 表單預設模型是 `Lyria 3.5`，另一個選項是 `Lyria Clip Preview`，只是標示「預備接入」 | `scripts/tools-voice-music.js:250,260` |
| 只接了「AI 寫歌詞」，走文字 API，扣點 key 是 `video.script` | `backend/api.cjs:1276`、`backend/main-system.cjs:24` |
| 音效模式也未接：「音效生成尚未接入」 | `scripts/tools-voice-music.js:88` |
| 已有 16 個環境音／音效的描述範本（雨聲、海浪、咖啡廳…），可重用為曲庫名稱 | `scripts/tools-voice-music.js:9-25` |
| 價目表**沒有**音樂或音效單價；`priceOf` 碰到未知種類直接拒絕（付費功能暫停） | `backend/provider-cost.cjs:60-67`；`next-admin/lib/ai/cost-model.ts` 只有 TEXT/IMAGE/VIDEO/TTS/TRANSCRIBE/TOOL 表（`:54,94,174,187,191,279,285`） |
| Gemini API 金鑰已有欄位 `GEMINI_API_KEY` | `mcp/user-env.template.ps1:87` |
| 沒有 ElevenLabs 金鑰欄位 | grep `ELEVENLABS` 於 `mcp/`，0 筆 |
| 已排除的模型：Mureka（中國），不會接 | `docs/tools-reference-audit-20261101.md:17` |

→ 內建曲庫是**我們內部一次性生成**、成本由我們付，**不向客戶扣點**。所以不必等「音樂工具接上扣點」，用一支內部批次腳本直接呼叫 API 即可。之後客戶自己用音樂工具生成，是另一張卡（需先把 Lyria 單價加進 `cost-model.ts`）。

## 2. 供應商、單價、授權

| 用途 | 模型 | 單價 | 授權重點 | 出處 |
|---|---|---|---|---|
| 配樂 | Google `lyria-3.5`（Gemini API） | **$0.08／首**（完整歌曲；無免費層） | Google 不主張產出內容的所有權；使用責任在我們；付費層不拿提示詞與回應訓練模型；所有音訊內嵌 SynthID 浮水印（人耳聽不到） | https://ai.google.dev/gemini-api/docs/pricing ；https://ai.google.dev/gemini-api/terms （生效日 2026-03-23）；https://ai.google.dev/gemini-api/docs/music-generation |
| 短提示音（備用） | `lyria-3-clip-preview` | $0.04／首（固定 30 秒） | 同上 | 同上 |
| 音效、環境音 | ElevenLabs Sound Effects | $0.12／分鐘（FAQ 又寫「按次計費」，本提案**按每次最多 $0.12 估上限**） | 需付費方案才可商用 | https://elevenlabs.io/pricing/api |
| （不採用）配樂 | ElevenLabs Eleven Music | $0.15／分鐘 | 自助方案不可用於電影、電視、廣播、Studio Games；Free～Pro 方案限個人 | https://elevenlabs.io/music-terms （2026-10-09 版） |

Lyria 3.5 規格：長度約「幾分鐘」，用提示詞控制；44.1 kHz 立體聲，預設 MP3，可要 WAV；純器樂與 BPM 都寫在提示詞裡（沒有獨立參數）；一次生成，不能多輪修改（出處：music-generation 頁）。

**選 Lyria 做配樂的理由**：按首計價，一首 2 分鐘只要 $0.08（Eleven Music 要 $0.30）；金鑰欄位已存在；授權沒有電視／電影排除條款。

**風險（操作者要知道的）**
- R1：Gemini 條款沒有明文寫「可以把產出做成素材庫給客戶用」，也沒有禁止。我們只讀到「Google 不主張所有權」與「使用責任在我們」。若要百分之百確定，需要法務看條款全文。
- R2：ElevenLabs 的音樂條款把 Free～Pro 方案標為「限個人使用」。公司使用可能要 Scale 以上（<10 人）。音效是否套同一張表，**沒有讀到**。替代方案是音效／環境音先不做（方案 A），或改評估其他非中國的音效模型。
- R3：AI 生成的曲子在多數司法管轄區可能**無法取得著作權**。別人拿去用，我們也難以主張權利。這件事對「我們自用、給客戶剪片用」沒有影響。
- R4：提示詞**禁止**寫藝人名、歌名、現成歌詞（ElevenLabs 條款 §2.1 明文禁止；Lyria 一併照做），避免被說是模仿。
- R5：價格頁的 Lyria 列是由抓取工具摘要讀到，不是逐字原文。整批生成前，在瀏覽器再看一次價格頁。

## 3. 三個方案

參考站的曲風共 **17 類**、170 首（任務說明寫 16 類，但列出的是 17 類，加總正好 170）。每首生成 2 個版本（take），挑較好的一個上架，所以費用是首數 × 2。

| | A 精簡 | **B 標準（推薦）** | C 完整 |
|---|---|---|---|
| 配樂 | 34 首（17 類 × 2） | 80 首（分佈見 §4） | 170 首（照參考站分佈） |
| 音效 | 0（分類先空著） | 24 | 60 |
| 環境音 | 0 | 12 | 30 |
| 配樂費 | 34×2×$0.08 = **$5.44** | 80×2×$0.08 = **$12.80** | 170×2×$0.08 = **$27.20** |
| 音效＋環境音費（上限估） | $0 | 36×2×$0.12 = **$8.64** | 90×2×$0.12 = **$21.60** |
| **合計** | **$5.44** | **$21.44**＋ElevenLabs 方案 | **$48.80**＋ElevenLabs 方案 |
| 生成時間（估，未實測；4 路並行、每次 ≤1 分鐘） | ~20 分 | ~1 小時 | ~2 小時 |
| 人工試聽（每個版本約聽 1 分鐘；音效 10 秒） | ~1.2 小時 | ~3 小時 | ~7 小時 |

**推薦 B 的理由**
- 每個曲風都有曲子，篩選時不會出現空分類。短影音常用的曲風（流行、電音、電影、Lo-fi）加重。
- 錢不是瓶頸，瓶頸是**試聽時間**。C 要試聽約 7 小時，是 B 的兩倍多，多出來的大多是流行與電音的同質曲。
- 之後要擴充，同一支腳本加列就能補，不會重工。
- 參考站的 Lo-fi 只有 2 首，B 給 6 首，因為 vlog、讀書類影片最常用 Lo-fi。

## 4. 方案 B 曲風分佈（80 首）

流行 12、電音 10、Lo-fi 6、R&B／Funk 3、爵士／拉丁 5、木吉他／民謠 5、電影配樂 8、搖滾 5、嘻哈／Trap 4、喜劇 2、國風／在地融合 3、古典／鋼琴 4、兒童 3、氛圍／冥想 3、世界音樂 3、鄉村 2、福音／靈魂 2。

## 5. 生成腳本格式（第一批＝方案 B 全部）

腳本規則（ED.6 卡實作；放 `scripts/` 新檔，不碰 `backend/`）
- 讀下方 JSONL，一行就是一首。
- 配樂的提示詞依下列順序組成：`{genre_en}, {hint}, {bpm} BPM, about {sec} seconds, {vocal==="none" ? "instrumental only, no vocals" : "wordless vocals (oohs/aahs), no lyrics"}, clean ending, no artist imitation`。
- 每行生成 2 個版本，存成 `{id}-a.mp3`、`{id}-b.mp3`，同時輸出 manifest，記下每個版本的實際費用。
- 試聽後把選中的版本寫進曲庫。曲庫標籤：`usage`（music／sfx／ambience）、`genre`、`bpm`、`sec`、`vocal`、`use`，對應參考規格「依用途標籤分類，不看檔名」（`docs/editor-parity-spec-20261106.md:24`）。
- 人聲曲一律用無詞哼唱，不生成歌詞，避免歌詞品質與授權問題。

### 5.1 配樂（Lyria 3.5）

```jsonl
{"id":"m001","title":"晴天出發","genre":"pop","genre_en":"upbeat pop","hint":"bright guitar, claps, sunny","bpm":118,"sec":120,"vocal":"none","use":"旅遊 vlog 開場，輕快正向"}
{"id":"m002","title":"週末小確幸","genre":"pop","genre_en":"light pop","hint":"ukulele, soft drums, cheerful","bpm":105,"sec":90,"vocal":"none","use":"生活分享、開箱"}
{"id":"m003","title":"城市步調","genre":"pop","genre_en":"modern pop","hint":"punchy beat, synth bass, confident","bpm":122,"sec":120,"vocal":"wordless","use":"都會穿搭、街拍剪輯"}
{"id":"m004","title":"新品亮相","genre":"pop","genre_en":"commercial pop","hint":"polished, rising energy, clear hook","bpm":124,"sec":60,"vocal":"none","use":"30–60 秒產品廣告"}
{"id":"m005","title":"粉彩早晨","genre":"pop","genre_en":"soft pop","hint":"plucked synth, airy, gentle","bpm":100,"sec":90,"vocal":"none","use":"美妝教學、早晨例行"}
{"id":"m006","title":"一起往前","genre":"pop","genre_en":"anthemic pop","hint":"big drums, piano, inspiring","bpm":128,"sec":120,"vocal":"wordless","use":"品牌形象、團隊介紹"}
{"id":"m007","title":"暖陽午後","genre":"pop","genre_en":"warm acoustic pop","hint":"acoustic guitar, light percussion","bpm":95,"sec":120,"vocal":"none","use":"咖啡廳、料理影片"}
{"id":"m008","title":"跳躍節拍","genre":"pop","genre_en":"energetic pop","hint":"short punchy sections, stops for cuts","bpm":130,"sec":60,"vocal":"none","use":"快剪轉場、短影音"}
{"id":"m009","title":"小小勝利","genre":"pop","genre_en":"feel-good pop","hint":"whistle-like synth lead, bouncy","bpm":112,"sec":90,"vocal":"none","use":"教學成果、前後對比"}
{"id":"m010","title":"夏日汽水","genre":"pop","genre_en":"summer pop","hint":"tropical plucks, bright","bpm":120,"sec":120,"vocal":"wordless","use":"夏季活動、戶外"}
{"id":"m011","title":"柔光回憶","genre":"pop","genre_en":"nostalgic pop ballad","hint":"piano, soft strings","bpm":88,"sec":120,"vocal":"none","use":"回顧剪輯、紀念日"}
{"id":"m012","title":"輕鬆通勤","genre":"pop","genre_en":"easy pop","hint":"mellow groove, light keys","bpm":108,"sec":90,"vocal":"none","use":"日常 vlog 背景"}
{"id":"m013","title":"霓虹脈衝","genre":"electronic","genre_en":"electro house","hint":"pulsing synths, sleek","bpm":128,"sec":120,"vocal":"none","use":"科技產品、夜景"}
{"id":"m014","title":"數位黎明","genre":"electronic","genre_en":"corporate electronic","hint":"clean arpeggios, optimistic","bpm":122,"sec":120,"vocal":"none","use":"新創簡報、SaaS 介紹"}
{"id":"m015","title":"高速穿梭","genre":"electronic","genre_en":"drum and bass","hint":"fast breaks, driving bass","bpm":140,"sec":90,"vocal":"none","use":"運動、競速剪輯"}
{"id":"m016","title":"未來城市","genre":"electronic","genre_en":"future garage","hint":"glitchy textures, steady","bpm":110,"sec":120,"vocal":"none","use":"科技說明、資料視覺化"}
{"id":"m017","title":"浮游合成","genre":"electronic","genre_en":"downtempo electronic","hint":"soft pads, minimal beat","bpm":100,"sec":120,"vocal":"none","use":"低調背景、產品細節"}
{"id":"m018","title":"能量爆發","genre":"electronic","genre_en":"EDM","hint":"build-up and drop","bpm":128,"sec":60,"vocal":"none","use":"健身、倒數開場"}
{"id":"m019","title":"星際漫遊","genre":"electronic","genre_en":"space ambient electronic","hint":"wide pads, slow pulse","bpm":90,"sec":150,"vocal":"none","use":"太空、宇宙主題"}
{"id":"m020","title":"電光舞池","genre":"electronic","genre_en":"dance pop electronic","hint":"four-on-the-floor, party","bpm":126,"sec":120,"vocal":"wordless","use":"派對、活動精華"}
{"id":"m021","title":"像素冒險","genre":"electronic","genre_en":"chiptune","hint":"8-bit melody, playful","bpm":120,"sec":90,"vocal":"none","use":"遊戲實況、復古感"}
{"id":"m022","title":"午夜駕駛","genre":"electronic","genre_en":"synthwave","hint":"retro analog synths, night drive","bpm":98,"sec":120,"vocal":"none","use":"夜間開車、復古"}
{"id":"m023","title":"書桌時光","genre":"lofi","genre_en":"lo-fi hip hop","hint":"dusty drums, jazzy keys","bpm":80,"sec":150,"vocal":"none","use":"讀書、工作背景"}
{"id":"m024","title":"雨窗咖啡","genre":"lofi","genre_en":"lo-fi","hint":"soft rain texture, warm piano","bpm":75,"sec":150,"vocal":"none","use":"咖啡廳、雨天"}
{"id":"m025","title":"慢慢來","genre":"lofi","genre_en":"chill lo-fi","hint":"mellow guitar, vinyl crackle","bpm":85,"sec":120,"vocal":"none","use":"日常 vlog 旁白底"}
{"id":"m026","title":"黃昏散步","genre":"lofi","genre_en":"lo-fi beats","hint":"warm bass, gentle swing","bpm":78,"sec":120,"vocal":"none","use":"散步、城市空鏡"}
{"id":"m027","title":"舊唱片","genre":"lofi","genre_en":"lo-fi","hint":"tape wobble, rhodes","bpm":72,"sec":150,"vocal":"none","use":"懷舊、手作"}
{"id":"m028","title":"深夜筆記","genre":"lofi","genre_en":"sleepy lo-fi","hint":"sparse, soft","bpm":70,"sec":150,"vocal":"none","use":"深夜工作、靜態畫面"}
{"id":"m029","title":"律動午後","genre":"rnb_funk","genre_en":"modern R&B","hint":"smooth keys, laid-back groove","bpm":100,"sec":120,"vocal":"none","use":"時尚、生活風格"}
{"id":"m030","title":"絲絨夜晚","genre":"rnb_funk","genre_en":"slow R&B","hint":"velvet bass, intimate","bpm":85,"sec":120,"vocal":"wordless","use":"夜晚、香氛、精品"}
{"id":"m031","title":"放克街角","genre":"rnb_funk","genre_en":"funk","hint":"slap bass, wah guitar, horns","bpm":108,"sec":90,"vocal":"none","use":"美食、街頭"}
{"id":"m032","title":"小酒館","genre":"jazz_latin","genre_en":"swing jazz","hint":"upright bass, brushes, sax","bpm":120,"sec":120,"vocal":"none","use":"餐廳、品酒"}
{"id":"m033","title":"月光三重奏","genre":"jazz_latin","genre_en":"jazz piano trio ballad","hint":"soft, elegant","bpm":90,"sec":150,"vocal":"none","use":"高雅背景、訪談"}
{"id":"m034","title":"巴薩諾瓦午後","genre":"jazz_latin","genre_en":"bossa nova","hint":"nylon guitar, light percussion","bpm":130,"sec":120,"vocal":"none","use":"咖啡、旅遊"}
{"id":"m035","title":"拉丁熱浪","genre":"jazz_latin","genre_en":"latin pop","hint":"congas, brass stabs, dance","bpm":105,"sec":90,"vocal":"none","use":"舞蹈、夏日"}
{"id":"m036","title":"城市爵士","genre":"jazz_latin","genre_en":"smooth jazz","hint":"electric piano, muted trumpet","bpm":96,"sec":120,"vocal":"none","use":"都會訪談、商務"}
{"id":"m037","title":"木吉他晨光","genre":"acoustic_folk","genre_en":"acoustic folk","hint":"fingerpicked guitar, warm","bpm":96,"sec":120,"vocal":"none","use":"家庭、溫馨"}
{"id":"m038","title":"小路旅人","genre":"acoustic_folk","genre_en":"indie folk","hint":"strummed guitar, stomps, claps","bpm":104,"sec":120,"vocal":"wordless","use":"公路旅行"}
{"id":"m039","title":"營火夜","genre":"acoustic_folk","genre_en":"campfire folk","hint":"acoustic guitar, harmonica","bpm":88,"sec":120,"vocal":"none","use":"露營、戶外"}
{"id":"m040","title":"手作日常","genre":"acoustic_folk","genre_en":"gentle acoustic","hint":"guitar and glockenspiel","bpm":92,"sec":120,"vocal":"none","use":"手作、工藝、小店故事"}
{"id":"m041","title":"田野風","genre":"acoustic_folk","genre_en":"upbeat folk","hint":"banjo, mandolin","bpm":110,"sec":90,"vocal":"none","use":"農產、在地品牌"}
{"id":"m042","title":"史詩啟程","genre":"cinematic","genre_en":"epic orchestral","hint":"brass, taiko, choir pad","bpm":90,"sec":150,"vocal":"none","use":"品牌大片、預告"}
{"id":"m043","title":"英雄時刻","genre":"cinematic","genre_en":"heroic orchestral","hint":"strings ostinato, triumphant","bpm":120,"sec":120,"vocal":"none","use":"運動高光、勝利"}
{"id":"m044","title":"懸疑倒數","genre":"cinematic","genre_en":"suspense underscore","hint":"ticking pulse, low strings","bpm":100,"sec":90,"vocal":"none","use":"懸疑、揭曉前"}
{"id":"m045","title":"溫柔告白","genre":"cinematic","genre_en":"emotional cinematic","hint":"piano and strings, tender","bpm":70,"sec":120,"vocal":"none","use":"感人故事、公益"}
{"id":"m046","title":"遼闊大地","genre":"cinematic","genre_en":"ambient orchestral","hint":"wide horns, slow build","bpm":80,"sec":150,"vocal":"none","use":"空拍、自然風景"}
{"id":"m047","title":"黑暗逼近","genre":"cinematic","genre_en":"dark horror score","hint":"drones, dissonant strings","bpm":85,"sec":90,"vocal":"none","use":"恐怖、驚悚"}
{"id":"m048","title":"希望之光","genre":"cinematic","genre_en":"uplifting cinematic","hint":"piano build to full orchestra","bpm":95,"sec":120,"vocal":"none","use":"企業願景、片尾"}
{"id":"m049","title":"預告重擊","genre":"cinematic","genre_en":"trailer music","hint":"hits, risers, braams","bpm":110,"sec":60,"vocal":"none","use":"預告片"}
{"id":"m050","title":"引擎點火","genre":"rock","genre_en":"hard rock","hint":"distorted riffs, driving drums","bpm":140,"sec":90,"vocal":"none","use":"機車、極限運動"}
{"id":"m051","title":"車庫樂團","genre":"rock","genre_en":"garage rock","hint":"raw guitars, energetic","bpm":128,"sec":120,"vocal":"none","use":"青春、校園"}
{"id":"m052","title":"公路搖滾","genre":"rock","genre_en":"classic road rock","hint":"open chords, steady beat","bpm":118,"sec":120,"vocal":"none","use":"公路旅行"}
{"id":"m053","title":"重拍出擊","genre":"rock","genre_en":"sports rock","hint":"stomp beat, power chords","bpm":150,"sec":60,"vocal":"none","use":"健身、競技"}
{"id":"m054","title":"獨立心情","genre":"rock","genre_en":"indie rock","hint":"jangly guitars, warm","bpm":105,"sec":120,"vocal":"wordless","use":"獨立品牌"}
{"id":"m055","title":"街頭節拍","genre":"hiphop_trap","genre_en":"boom bap hip hop","hint":"vinyl drums, sample-style keys","bpm":92,"sec":120,"vocal":"none","use":"街頭時尚"}
{"id":"m056","title":"重低音","genre":"hiphop_trap","genre_en":"trap","hint":"808 bass, hi-hat rolls","bpm":140,"sec":90,"vocal":"none","use":"球鞋開箱、潮流"}
{"id":"m057","title":"自信步伐","genre":"hiphop_trap","genre_en":"modern hip hop","hint":"bouncy, confident","bpm":96,"sec":90,"vocal":"none","use":"個人品牌、創作者介紹"}
{"id":"m058","title":"夜行","genre":"hiphop_trap","genre_en":"dark trap","hint":"moody pads, sparse 808","bpm":70,"sec":120,"vocal":"none","use":"夜景、情緒"}
{"id":"m059","title":"搞怪小偷","genre":"comedy","genre_en":"comedic pizzicato","hint":"sneaky strings, bassoon","bpm":110,"sec":45,"vocal":"none","use":"惡作劇、搞笑橋段"}
{"id":"m060","title":"尷尬時刻","genre":"comedy","genre_en":"quirky comedy cue","hint":"awkward pauses, kazoo-like lead","bpm":95,"sec":30,"vocal":"none","use":"冷場、反轉笑點"}
{"id":"m061","title":"竹林清風","genre":"guofeng_fusion","genre_en":"East Asian fusion","hint":"guzheng, bamboo flute, light beat","bpm":80,"sec":120,"vocal":"none","use":"茶、文化、節慶"}
{"id":"m062","title":"夜市燈火","genre":"guofeng_fusion","genre_en":"Taiwanese pop fusion","hint":"modern beat with traditional percussion","bpm":110,"sec":90,"vocal":"none","use":"台灣在地、小吃"}
{"id":"m063","title":"山城霧","genre":"guofeng_fusion","genre_en":"East Asian cinematic","hint":"erhu and piano, misty","bpm":72,"sec":120,"vocal":"none","use":"山景、人文紀錄"}
{"id":"m064","title":"鋼琴獨白","genre":"classical_piano","genre_en":"solo piano","hint":"reflective, simple melody","bpm":70,"sec":150,"vocal":"none","use":"回憶、訪談底"}
{"id":"m065","title":"弦樂晨曲","genre":"classical_piano","genre_en":"string quartet","hint":"graceful, bright","bpm":90,"sec":120,"vocal":"none","use":"婚禮、典禮"}
{"id":"m066","title":"優雅華爾茲","genre":"classical_piano","genre_en":"classical waltz","hint":"3/4 time, chamber orchestra","bpm":150,"sec":90,"vocal":"none","use":"精品、晚宴"}
{"id":"m067","title":"小步舞曲","genre":"classical_piano","genre_en":"baroque minuet","hint":"harpsichord, strings","bpm":110,"sec":90,"vocal":"none","use":"甜點、優雅生活"}
{"id":"m068","title":"彩色積木","genre":"kids","genre_en":"children's music","hint":"xylophone, ukulele, happy","bpm":120,"sec":60,"vocal":"none","use":"兒童教學、玩具"}
{"id":"m069","title":"小動物合唱","genre":"kids","genre_en":"playful kids","hint":"bouncy, cartoon-like","bpm":110,"sec":60,"vocal":"wordless","use":"童趣、動物"}
{"id":"m070","title":"數數歌","genre":"kids","genre_en":"preschool music","hint":"glockenspiel, simple claps","bpm":100,"sec":60,"vocal":"none","use":"幼教、卡通"}
{"id":"m071","title":"呼吸練習","genre":"ambient_meditation","genre_en":"meditation ambient","hint":"slow pads, singing bowl","bpm":60,"sec":180,"vocal":"none","use":"冥想、瑜伽"}
{"id":"m072","title":"深海漂浮","genre":"ambient_meditation","genre_en":"deep ambient","hint":"underwater textures, calm","bpm":55,"sec":180,"vocal":"none","use":"放鬆、睡前"}
{"id":"m073","title":"晨光冥想","genre":"ambient_meditation","genre_en":"healing ambient","hint":"soft piano, airy","bpm":65,"sec":180,"vocal":"none","use":"療癒、正念"}
{"id":"m074","title":"沙漠商隊","genre":"world","genre_en":"Middle Eastern inspired","hint":"oud, frame drum","bpm":95,"sec":120,"vocal":"none","use":"異國旅遊"}
{"id":"m075","title":"島嶼鼓聲","genre":"world","genre_en":"Caribbean","hint":"steel drum, hand percussion","bpm":110,"sec":90,"vocal":"none","use":"海島、熱帶"}
{"id":"m076","title":"凱爾特之丘","genre":"world","genre_en":"Celtic","hint":"fiddle, tin whistle","bpm":100,"sec":120,"vocal":"none","use":"冒險、奇幻"}
{"id":"m077","title":"牧場早晨","genre":"country","genre_en":"country","hint":"acoustic guitar, pedal steel","bpm":100,"sec":120,"vocal":"none","use":"戶外、牧場"}
{"id":"m078","title":"老卡車","genre":"country","genre_en":"country rock","hint":"twangy guitar, shuffle beat","bpm":115,"sec":90,"vocal":"none","use":"公路、美式懷舊"}
{"id":"m079","title":"感恩之歌","genre":"gospel_soul","genre_en":"gospel","hint":"organ, choir pad, warm","bpm":75,"sec":120,"vocal":"wordless","use":"感謝、公益"}
{"id":"m080","title":"靈魂高歌","genre":"gospel_soul","genre_en":"soul","hint":"choir, handclaps, uplifting","bpm":90,"sec":120,"vocal":"wordless","use":"慶祝、勝利"}
```

### 5.2 音效與環境音（ElevenLabs Sound Effects；名稱沿用 `scripts/tools-voice-music.js:9-25`）

```jsonl
{"id":"s001","title":"轉場呼嘯","usage":"sfx","sec":2,"use":"轉場","prompt":"fast whoosh transition"}
{"id":"s002","title":"快速掃過","usage":"sfx","sec":1,"use":"快剪","prompt":"short swish"}
{"id":"s003","title":"叮","usage":"sfx","sec":1,"use":"重點提示","prompt":"bright notification ding"}
{"id":"s004","title":"按鈕點擊","usage":"sfx","sec":1,"use":"介面操作","prompt":"soft UI click"}
{"id":"s005","title":"錯誤提示","usage":"sfx","sec":1,"use":"錯誤、NG","prompt":"short error buzz"}
{"id":"s006","title":"成功音","usage":"sfx","sec":2,"use":"完成、達標","prompt":"positive success chime"}
{"id":"s007","title":"打字聲","usage":"sfx","sec":3,"use":"字卡出現","prompt":"keyboard typing"}
{"id":"s008","title":"相機快門","usage":"sfx","sec":1,"use":"拍照、定格","prompt":"camera shutter click"}
{"id":"s009","title":"收銀機","usage":"sfx","sec":2,"use":"價格、促銷","prompt":"cash register ka-ching"}
{"id":"s010","title":"彈出","usage":"sfx","sec":1,"use":"圖示跳出","prompt":"cartoon pop"}
{"id":"s011","title":"掌聲","usage":"sfx","sec":4,"use":"喝采","prompt":"small audience applause"}
{"id":"s012","title":"群眾笑聲","usage":"sfx","sec":3,"use":"笑點","prompt":"audience laughter"}
{"id":"s013","title":"冷笑話鼓點","usage":"sfx","sec":2,"use":"冷笑話","prompt":"drum rimshot ba-dum-tss"}
{"id":"s014","title":"心跳","usage":"sfx","sec":4,"use":"緊張","prompt":"slow heartbeat"}
{"id":"s015","title":"腳步聲","usage":"sfx","sec":4,"use":"走動","prompt":"slow footsteps on wooden floor"}
{"id":"s016","title":"開關門","usage":"sfx","sec":3,"use":"進出場","prompt":"wooden door opens and closes"}
{"id":"s017","title":"玻璃碎裂","usage":"sfx","sec":2,"use":"意外","prompt":"glass shattering on floor"}
{"id":"s018","title":"遠方爆炸","usage":"sfx","sec":3,"use":"動作場面","prompt":"distant cinematic explosion"}
{"id":"s019","title":"雷鳴","usage":"sfx","sec":4,"use":"天氣、轉折","prompt":"distant rolling thunder"}
{"id":"s020","title":"敲擊三下","usage":"sfx","sec":2,"use":"敲門、提示","prompt":"three knocks on wood"}
{"id":"s021","title":"上升音","usage":"sfx","sec":3,"use":"揭曉前","prompt":"tension riser"}
{"id":"s022","title":"重擊","usage":"sfx","sec":2,"use":"標題出現","prompt":"deep cinematic impact hit"}
{"id":"s023","title":"倒帶","usage":"sfx","sec":2,"use":"回到過去","prompt":"tape rewind"}
{"id":"s024","title":"時鐘滴答","usage":"sfx","sec":4,"use":"倒數","prompt":"clock ticking"}
{"id":"a001","title":"雨聲","usage":"ambience","sec":60,"use":"雨天、放鬆","prompt":"gentle rain on window, no music, no voices, seamless loop"}
{"id":"a002","title":"海浪","usage":"ambience","sec":60,"use":"海邊","prompt":"waves lapping on sand, seamless loop"}
{"id":"a003","title":"溪流","usage":"ambience","sec":60,"use":"山林","prompt":"clear stream over pebbles, seamless loop"}
{"id":"a004","title":"風聲","usage":"ambience","sec":60,"use":"戶外","prompt":"wind through leaves, seamless loop"}
{"id":"a005","title":"森林鳥鳴","usage":"ambience","sec":60,"use":"清晨","prompt":"morning forest birdsong, seamless loop"}
{"id":"a006","title":"城市街景","usage":"ambience","sec":60,"use":"都會","prompt":"city street ambience, distant traffic, seamless loop"}
{"id":"a007","title":"咖啡廳","usage":"ambience","sec":60,"use":"室內","prompt":"quiet cafe ambience, cups, murmur, no clear words, seamless loop"}
{"id":"a008","title":"人群","usage":"ambience","sec":60,"use":"活動","prompt":"distant crowd murmur, no clear words, seamless loop"}
{"id":"a009","title":"夜晚蟲鳴","usage":"ambience","sec":60,"use":"夜景","prompt":"night crickets, seamless loop"}
{"id":"a010","title":"辦公室","usage":"ambience","sec":60,"use":"職場","prompt":"office room tone, light typing, seamless loop"}
{"id":"a011","title":"機械運轉","usage":"ambience","sec":60,"use":"工廠、科技","prompt":"steady machine hum, seamless loop"}
{"id":"a012","title":"營火","usage":"ambience","sec":60,"use":"露營","prompt":"crackling campfire, seamless loop"}
```

## 6. 操作者要決定的事

1. 選 A／B／C 哪個方案（推薦 B）。
2. 音效與環境音用 ElevenLabs 嗎？若要用，需要開付費方案，並先確認哪個等級可以給公司使用（R2）。若不想處理，選 A＋配樂 80 首，費用 $12.80，音效與環境音分類先空著。
3. 同意先試做 5 首（m001、m023、m042、m061、m079，費用 $0.80），聽過品質再整批生成。
