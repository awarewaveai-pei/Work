// Categorized prompt presets for the Design Studio (主圖 / 題材 / 氛圍).
// Rendered as the tarot-style picker: sub-category tabs + chips + hover tooltip.
//   zh   = Chinese chip label (what the user reads)
//   en   = English phrase actually inserted into the prompt (image models want English)
//   desc = short Chinese description shown in the hover tooltip
// The component stores `en` in the subject/theme/vibe text field, so the assembled
// prompt stays English while the UI stays bilingual + categorized.

export interface PresetItem {
  zh: string;
  en: string;
  desc: string;
}

export interface PresetCategory {
  group: string;
  items: PresetItem[];
}

// ── 主圖 Subject — the central image ──────────────────────────────────────
export const SUBJECT_CATEGORIES: PresetCategory[] = [
  {
    group: "動物",
    items: [
      { zh: "狼", en: "lone wolf howling at the moon", desc: "對月嚎叫，野性與自由" },
      { zh: "獅王", en: "majestic lion with a crown", desc: "戴冠雄獅，王者威嚴" },
      { zh: "猛虎", en: "fierce tiger spirit", desc: "猛虎之靈，力量象徵" },
      { zh: "蛟龍", en: "coiling oriental dragon", desc: "盤旋東方龍，祥瑞氣勢" },
      { zh: "鳳凰", en: "phoenix rising from flames", desc: "浴火重生，不滅之火" },
      { zh: "錦鯉", en: "koi fish swimming upstream", desc: "逆流錦鯉，吉祥躍動" },
      { zh: "貓頭鷹", en: "wise owl with wide eyes", desc: "睿智貓頭鷹，靜夜守望" },
      { zh: "靈熊", en: "powerful spirit bear", desc: "強壯靈熊，守護力量" },
      { zh: "狐狸", en: "mystic nine-tailed fox", desc: "神秘狐狸，靈巧多變" },
      { zh: "巨蛇", en: "coiled serpent", desc: "盤蛇，蛻變與重生" },
      { zh: "蒼鷹", en: "soaring eagle with spread wings", desc: "展翅蒼鷹，自由翱翔" },
      { zh: "蝴蝶", en: "butterfly with mandala wings", desc: "曼陀羅翅蝶，蛻變之美" },
      { zh: "雄鹿", en: "majestic stag with great antlers", desc: "巨角雄鹿，森林之王" },
      { zh: "章魚", en: "deep sea octopus", desc: "深海章魚，神秘觸手" },
      { zh: "蜂鳥", en: "hovering hummingbird", desc: "懸停蜂鳥，輕盈靈動" },
      { zh: "宇宙鯨", en: "cosmic whale among the stars", desc: "宇宙鯨，浩瀚與寧靜" },
    ],
  },
  {
    group: "人物角色",
    items: [
      { zh: "武士", en: "armored samurai warrior", desc: "武士，榮譽與紀律" },
      { zh: "藝伎", en: "elegant geisha", desc: "藝伎，東方優雅" },
      { zh: "太空人", en: "astronaut drifting in space", desc: "漂浮太空人，孤獨探索" },
      { zh: "維京戰士", en: "fierce viking warrior", desc: "維京戰士，北境之勇" },
      { zh: "女武神", en: "winged warrior goddess", desc: "戰鬥女神，天界戰士" },
      { zh: "骷髏王", en: "crowned skull king", desc: "骷髏之王，死亡威儀" },
      { zh: "女巫", en: "mysterious witch with potions", desc: "女巫，魔法與占卜" },
      { zh: "僧侶", en: "meditating monk", desc: "冥想僧侶，內在平靜" },
      { zh: "海盜", en: "rugged pirate captain", desc: "海盜船長，無拘冒險" },
      { zh: "機械人", en: "futuristic cyborg", desc: "機械改造人，人機合一" },
      { zh: "忍者", en: "shadow ninja", desc: "暗影忍者，隱匿迅捷" },
      { zh: "牛仔", en: "wild west cowboy", desc: "西部牛仔，荒野不羈" },
    ],
  },
  {
    group: "神話靈性",
    items: [
      { zh: "天女", en: "celestial goddess", desc: "天界女神，神聖之美" },
      { zh: "天使", en: "angel with spread wings", desc: "展翅天使，守護與光" },
      { zh: "惡魔", en: "dark demon", desc: "暗黑惡魔，誘惑與恐懼" },
      { zh: "佛陀", en: "serene meditating Buddha", desc: "寧靜佛陀，覺悟慈悲" },
      { zh: "美杜莎", en: "medusa with serpent hair", desc: "美杜莎，致命魅惑" },
      { zh: "死神", en: "hooded grim reaper", desc: "死神，生死輪迴" },
      { zh: "美人魚", en: "deep sea mermaid", desc: "美人魚，海洋傳說" },
      { zh: "精靈", en: "forest fairy", desc: "森林精靈，自然魔力" },
      { zh: "神聖幾何", en: "sacred geometry pattern", desc: "神聖幾何，宇宙秩序" },
      { zh: "曼陀羅", en: "intricate mandala", desc: "曼陀羅，圓滿與冥想" },
      { zh: "生命之樹", en: "tree of life", desc: "生命之樹，萬物相連" },
      { zh: "第三隻眼", en: "all-seeing third eye", desc: "第三隻眼，覺知與洞見" },
    ],
  },
  {
    group: "自然植物",
    items: [
      { zh: "蓮花", en: "blooming lotus flower", desc: "蓮花，純淨與覺醒" },
      { zh: "月下山巒", en: "mountain range under a full moon", desc: "月下山巒，靜謐遼闊" },
      { zh: "巨浪", en: "great cresting ocean wave", desc: "巨浪，自然之力" },
      { zh: "玫瑰", en: "blooming rose", desc: "綻放玫瑰，愛與激情" },
      { zh: "魔法蘑菇", en: "glowing magic mushrooms", desc: "魔法蘑菇，迷幻奇境" },
      { zh: "水晶簇", en: "glowing crystal cluster", desc: "水晶簇，能量與療癒" },
      { zh: "銀河", en: "galaxy and starfield", desc: "銀河繁星，浩瀚宇宙" },
      { zh: "仙人掌", en: "desert cactus at sunset", desc: "沙漠仙人掌，堅韌生命" },
      { zh: "楓葉", en: "autumn maple leaves", desc: "秋楓葉，季節流轉" },
      { zh: "向日葵", en: "bright sunflower", desc: "向日葵，希望與陽光" },
      { zh: "棕櫚", en: "tropical palm leaves", desc: "熱帶棕櫚，度假氣息" },
      { zh: "雷暴", en: "lightning storm", desc: "雷暴，狂烈與震撼" },
    ],
  },
  {
    group: "物件符號",
    items: [
      { zh: "骷髏與花", en: "skull adorned with flowers", desc: "骷髏與花，生死共存" },
      { zh: "解剖心臟", en: "anatomical heart with flowers", desc: "解剖心臟，生命與情感" },
      { zh: "羅盤", en: "ornate compass rose", desc: "羅盤，方向與冒險" },
      { zh: "雙劍", en: "crossed swords", desc: "交叉雙劍，戰鬥與榮耀" },
      { zh: "沙漏", en: "antique hourglass", desc: "沙漏，時間流逝" },
      { zh: "黑膠", en: "vinyl record", desc: "黑膠唱片，復古音樂" },
      { zh: "咖啡", en: "steaming coffee cup", desc: "咖啡杯，日常療癒" },
      { zh: "復古相機", en: "vintage film camera", desc: "復古相機，捕捉瞬間" },
      { zh: "鑰匙", en: "ornate antique key", desc: "華麗鑰匙，秘密與開啟" },
      { zh: "月相", en: "moon phases cycle", desc: "月相，週期與變化" },
      { zh: "塔羅牌", en: "mystical tarot cards", desc: "塔羅牌，命運與占卜" },
      { zh: "復古火箭", en: "retro rocket ship", desc: "復古火箭，探索夢想" },
    ],
  },
];

// ── 題材 Theme — the conceptual topic ─────────────────────────────────────
export const THEME_CATEGORIES: PresetCategory[] = [
  {
    group: "文化次文化",
    items: [
      { zh: "街頭潮流", en: "street fashion", desc: "街頭潮流，都會態度" },
      { zh: "音樂文化", en: "music culture", desc: "音樂文化，節奏與靈魂" },
      { zh: "遊戲電玩", en: "gaming culture", desc: "遊戲電玩，像素與冒險" },
      { zh: "滑板文化", en: "skateboard culture", desc: "滑板文化，自由滑行" },
      { zh: "刺青文化", en: "tattoo culture", desc: "刺青文化，身體藝術" },
      { zh: "重機文化", en: "motorcycle culture", desc: "重機文化，引擎與公路" },
      { zh: "嘻哈", en: "hip hop culture", desc: "嘻哈，街頭節奏" },
      { zh: "龐克搖滾", en: "punk rock", desc: "龐克搖滾，叛逆吶喊" },
      { zh: "動漫宅", en: "anime fandom", desc: "動漫宅，二次元熱愛" },
    ],
  },
  {
    group: "精神情緒",
    items: [
      { zh: "靈性修行", en: "spiritual journey", desc: "靈性修行，內在旅程" },
      { zh: "心理情緒", en: "psychology and mind", desc: "心理情緒，心靈探索" },
      { zh: "藝術療癒", en: "art therapy", desc: "藝術療癒，創作撫慰" },
      { zh: "正念冥想", en: "mindfulness meditation", desc: "正念冥想，當下覺察" },
      { zh: "自我成長", en: "personal growth", desc: "自我成長，蛻變前行" },
      { zh: "夢境潛意識", en: "dreams and the subconscious", desc: "夢境潛意識，深層心象" },
      { zh: "占星", en: "astrology and zodiac", desc: "占星，星象與命運" },
      { zh: "神秘學", en: "occult mysticism", desc: "神秘學，隱秘智慧" },
      { zh: "內在覺察", en: "inner awareness", desc: "內在覺察，自我洞見" },
    ],
  },
  {
    group: "自然科技",
    items: [
      { zh: "自然生態", en: "nature and ecology", desc: "自然生態，萬物共生" },
      { zh: "未來科技", en: "future technology", desc: "未來科技，前瞻想像" },
      { zh: "太空探索", en: "space exploration", desc: "太空探索，星際旅程" },
      { zh: "動物保育", en: "animal conservation", desc: "動物保育，守護生命" },
      { zh: "海洋生態", en: "ocean life", desc: "海洋生態，藍色世界" },
      { zh: "賽博龐克", en: "cyberpunk", desc: "賽博龐克，霓虹未來" },
      { zh: "環保永續", en: "sustainability", desc: "環保永續，地球未來" },
      { zh: "末日廢土", en: "post-apocalyptic wasteland", desc: "末日廢土，荒蕪重生" },
      { zh: "蒸汽龐克", en: "steampunk", desc: "蒸汽龐克，齒輪復古" },
    ],
  },
  {
    group: "歷史生活",
    items: [
      { zh: "古代神話", en: "ancient mythology", desc: "古代神話，諸神傳說" },
      { zh: "歷史傳承", en: "historical heritage", desc: "歷史傳承，文化記憶" },
      { zh: "運動競技", en: "sports and competition", desc: "運動競技，熱血拼搏" },
      { zh: "美食生活", en: "food and lifestyle", desc: "美食生活，味蕾日常" },
      { zh: "奢華時尚", en: "luxury lifestyle", desc: "奢華時尚，精緻品味" },
      { zh: "旅行冒險", en: "travel and adventure", desc: "旅行冒險，遠方探索" },
      { zh: "社會議題", en: "social commentary", desc: "社會議題，批判思考" },
      { zh: "復古懷舊", en: "retro nostalgia", desc: "復古懷舊，舊日時光" },
      { zh: "民俗信仰", en: "folk beliefs and symbols", desc: "民俗信仰，傳統符號" },
    ],
  },
];

// ── 氛圍 Vibe — the emotional mood ─────────────────────────────────────────
export const VIBE_CATEGORIES: PresetCategory[] = [
  {
    group: "強烈力量",
    items: [
      { zh: "強悍有力", en: "bold and powerful", desc: "強悍有力，氣場全開" },
      { zh: "史詩宏大", en: "epic and grand", desc: "史詩宏大，磅礴震撼" },
      { zh: "叛逆狂野", en: "rebellious and wild", desc: "叛逆狂野，不受拘束" },
      { zh: "銳利現代", en: "sharp and modern", desc: "銳利現代，俐落前衛" },
      { zh: "電感鮮活", en: "electric and vibrant", desc: "電感鮮活，活力四射" },
      { zh: "兇猛強勢", en: "fierce and aggressive", desc: "兇猛強勢，凌厲攻擊" },
      { zh: "熱血激昂", en: "passionate and intense", desc: "熱血激昂，燃燒鬥志" },
      { zh: "王者霸氣", en: "regal and commanding", desc: "王者霸氣，威儀統御" },
    ],
  },
  {
    group: "暗黑深沉",
    items: [
      { zh: "神秘暗黑", en: "dark and mysterious", desc: "神秘暗黑，幽深難測" },
      { zh: "憂鬱深沉", en: "melancholic and deep", desc: "憂鬱深沉，沉靜內斂" },
      { zh: "詭譎驚悚", en: "eerie and haunting", desc: "詭譎驚悚，不安懸疑" },
      { zh: "冷冽孤寂", en: "cold and lonely", desc: "冷冽孤寂，疏離寂寥" },
      { zh: "哥德陰鬱", en: "gothic and brooding", desc: "哥德陰鬱，華麗陰沉" },
      { zh: "末世蒼涼", en: "bleak and desolate", desc: "末世蒼涼，荒蕪寂滅" },
      { zh: "暗潮洶湧", en: "ominous and tense", desc: "暗潮洶湧，壓抑張力" },
      { zh: "沉鬱壓抑", en: "somber and heavy", desc: "沉鬱壓抑，沉重氛圍" },
    ],
  },
  {
    group: "柔和靈性",
    items: [
      { zh: "寧靜空靈", en: "calm and ethereal", desc: "寧靜空靈，飄渺出塵" },
      { zh: "浪漫夢幻", en: "romantic and dreamy", desc: "浪漫夢幻，柔美如夢" },
      { zh: "禪意平和", en: "zen and peaceful", desc: "禪意平和，安定自在" },
      { zh: "溫柔親密", en: "tender and intimate", desc: "溫柔親密，柔軟貼近" },
      { zh: "懷舊溫暖", en: "nostalgic and warm", desc: "懷舊溫暖，舊日暖意" },
      { zh: "療癒舒心", en: "healing and soothing", desc: "療癒舒心，撫慰人心" },
      { zh: "神聖莊嚴", en: "sacred and divine", desc: "神聖莊嚴，崇敬肅穆" },
      { zh: "崇高靈性", en: "sublime and spiritual", desc: "崇高靈性，超然神聖" },
    ],
  },
  {
    group: "趣味繽紛",
    items: [
      { zh: "趣味俏皮", en: "playful and whimsical", desc: "趣味俏皮，輕鬆逗趣" },
      { zh: "可愛甜美", en: "cute and sweet", desc: "可愛甜美，萌系療癒" },
      { zh: "幽默諷刺", en: "humorous and satirical", desc: "幽默諷刺，機智嘲諷" },
      { zh: "繽紛歡樂", en: "colorful and joyful", desc: "繽紛歡樂，色彩躍動" },
      { zh: "復古趣味", en: "retro and quirky", desc: "復古趣味，懷舊玩味" },
      { zh: "迷幻奇趣", en: "psychedelic and trippy", desc: "迷幻奇趣，奇想幻境" },
      { zh: "清新自然", en: "fresh and natural", desc: "清新自然，純淨舒朗" },
      { zh: "活潑明亮", en: "lively and bright", desc: "活潑明亮，陽光朝氣" },
    ],
  },
];
