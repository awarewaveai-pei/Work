// World-culture inspiration presets for the Design Studio (🌍 世界文化靈感).
// Two-layer design:
//   1. STATIC skeleton — regions (by continent) + lenses (food/motif/garment/...).
//      Rendered with the same tarot-style picker (sub-category tabs + chips).
//   2. DYNAMIC enrichment — /api/tools/studio/culture takes (region.en, lens.key)
//      and returns 12 specific, authentic items for that pairing via the LLM,
//      so the option space is effectively unbounded without a hand-authored
//      region×lens matrix (mirrors the 🔥 時事靈感 trending pattern).
//
//   zh   = Chinese chip label (what the user reads)
//   en   = English phrase inserted into the prompt (image models want English)
//   desc = short Chinese hover tooltip
// Region `en` is a culture adjective ("Japanese", "Andean Quechua") so the
// assembled prompt reads naturally as a cultural-heritage qualifier.

export interface CultureItem {
  zh: string;
  en: string;
  desc: string;
}

export interface CultureGroup {
  group: string;
  items: CultureItem[];
}

// ── 國家 / 地域 — grouped by continent. `en` = culture adjective for the prompt.
// Indigenous cultures are first-class entries (原住民), not folded into nations.
export const CULTURE_REGIONS: CultureGroup[] = [
  {
    group: "東亞",
    items: [
      { zh: "日本", en: "Japanese", desc: "和風，侘寂與浮世繪" },
      { zh: "韓國", en: "Korean", desc: "韓風，丹青與韓服" },
      { zh: "中國", en: "Chinese", desc: "中華，水墨與龍鳳" },
      { zh: "台灣", en: "Taiwanese", desc: "台灣，島嶼混融文化" },
      { zh: "台灣原住民", en: "Taiwanese indigenous Formosan", desc: "台灣原住民，菱形織紋與圖騰" },
      { zh: "蒙古", en: "Mongolian", desc: "蒙古，草原遊牧" },
      { zh: "西藏", en: "Tibetan", desc: "藏地，唐卡與經幡" },
    ],
  },
  {
    group: "東南亞",
    items: [
      { zh: "泰國", en: "Thai", desc: "泰式，金廟與蘭納" },
      { zh: "越南", en: "Vietnamese", desc: "越南，奧黛與蓮花" },
      { zh: "印尼", en: "Indonesian", desc: "印尼，蠟染與皮影" },
      { zh: "峇里島", en: "Balinese", desc: "峇里，廟宇與供品" },
      { zh: "菲律賓", en: "Filipino", desc: "菲律賓，太陽與編織" },
      { zh: "馬來", en: "Malay", desc: "馬來，宋谷與蠟染" },
      { zh: "緬甸", en: "Burmese", desc: "緬甸，金塔與漆器" },
      { zh: "柬埔寨", en: "Cambodian", desc: "高棉，吳哥與阿普莎拉" },
    ],
  },
  {
    group: "南亞",
    items: [
      { zh: "印度", en: "Indian", desc: "印度，紗麗與曼陀羅" },
      { zh: "尼泊爾", en: "Nepali", desc: "尼泊爾，佛眼與經輪" },
      { zh: "斯里蘭卡", en: "Sri Lankan", desc: "錫蘭，孔雀與寶石" },
      { zh: "不丹", en: "Bhutanese", desc: "不丹，龍紋與宗堡" },
    ],
  },
  {
    group: "中東 / 波斯",
    items: [
      { zh: "波斯", en: "Persian Iranian", desc: "波斯，地毯與細密畫" },
      { zh: "土耳其", en: "Turkish", desc: "土耳其，藍瓷與鬱金香" },
      { zh: "阿拉伯", en: "Arabian", desc: "阿拉伯，幾何與書法" },
      { zh: "摩洛哥", en: "Moroccan", desc: "摩洛哥,馬賽克與染坊" },
      { zh: "埃及", en: "Egyptian", desc: "古埃及，象形與聖甲蟲" },
      { zh: "黎巴嫩", en: "Lebanese", desc: "黎巴嫩，雪松與馬賽克" },
    ],
  },
  {
    group: "非洲",
    items: [
      { zh: "柏柏爾", en: "Berber Amazigh", desc: "柏柏爾原住民，菱紋刺青" },
      { zh: "衣索比亞", en: "Ethiopian", desc: "衣索比亞，十字與咖啡" },
      { zh: "約魯巴", en: "Yoruba Nigerian", desc: "約魯巴，靛藍與面具" },
      { zh: "迦納", en: "Ghanaian Ashanti", desc: "迦納，肯特布與金飾" },
      { zh: "馬賽", en: "Maasai", desc: "馬賽原住民，紅布與串珠" },
      { zh: "祖魯", en: "Zulu South African", desc: "祖魯，串珠與盾牌" },
      { zh: "馬利", en: "Malian", desc: "馬利，泥染布與面具" },
    ],
  },
  {
    group: "歐洲",
    items: [
      { zh: "希臘", en: "Greek", desc: "希臘，神話與迴紋" },
      { zh: "義大利", en: "Italian", desc: "義大利，文藝復興" },
      { zh: "西班牙", en: "Spanish", desc: "西班牙，佛朗明哥與磁磚" },
      { zh: "法國", en: "French", desc: "法式，新藝術與鳶尾" },
      { zh: "葡萄牙", en: "Portuguese", desc: "葡萄牙，藍瓷磚" },
      { zh: "凱爾特", en: "Celtic Irish", desc: "凱爾特，繩結與綠意" },
      { zh: "蘇格蘭", en: "Scottish", desc: "蘇格蘭，格紋與薊花" },
      { zh: "荷蘭", en: "Dutch", desc: "荷蘭，藍陶與鬱金香" },
    ],
  },
  {
    group: "北歐 / 斯堪地",
    items: [
      { zh: "北歐維京", en: "Norse Viking", desc: "維京，盧恩與神話" },
      { zh: "薩米", en: "Sami", desc: "薩米原住民，馴鹿與太陽" },
      { zh: "冰島", en: "Icelandic", desc: "冰島，火山與精靈" },
      { zh: "芬蘭", en: "Finnish", desc: "芬蘭，森林與卡勒瓦拉" },
    ],
  },
  {
    group: "東歐 / 斯拉夫",
    items: [
      { zh: "俄羅斯", en: "Russian", desc: "俄羅斯，套娃與洋蔥頂" },
      { zh: "烏克蘭", en: "Ukrainian", desc: "烏克蘭，刺繡與彩蛋" },
      { zh: "波蘭", en: "Polish", desc: "波蘭，剪紙與花卉" },
      { zh: "羅馬尼亞", en: "Romanian", desc: "羅馬尼亞，民俗刺繡" },
    ],
  },
  {
    group: "拉丁美洲",
    items: [
      { zh: "墨西哥", en: "Mexican", desc: "墨西哥，亡靈節與刺繡" },
      { zh: "阿茲特克", en: "Aztec", desc: "阿茲特克，太陽石" },
      { zh: "馬雅", en: "Mayan", desc: "馬雅，象形與羽蛇" },
      { zh: "維喬爾", en: "Huichol", desc: "維喬爾原住民，串珠藝術" },
      { zh: "安地斯", en: "Andean Quechua Inca", desc: "安地斯原住民，幾何織紋" },
      { zh: "巴西", en: "Brazilian", desc: "巴西，嘉年華與熱帶" },
      { zh: "古巴", en: "Cuban", desc: "古巴，老爺車與騷莎" },
    ],
  },
  {
    group: "北美 / 原住民",
    items: [
      { zh: "美洲原住民", en: "Native American", desc: "美洲原住民，圖騰與羽飾" },
      { zh: "因紐特", en: "Inuit", desc: "因紐特原住民，極地與石堆" },
      { zh: "夏威夷", en: "Hawaiian", desc: "夏威夷，火山與花環" },
      { zh: "美式復古", en: "American retro", desc: "美式，公路與霓虹" },
    ],
  },
  {
    group: "大洋洲 / 玻里尼西亞",
    items: [
      { zh: "毛利", en: "Maori", desc: "毛利原住民，刺青螺旋" },
      { zh: "澳洲原住民", en: "Aboriginal Australian", desc: "澳洲原住民，點畫夢幻" },
      { zh: "玻里尼西亞", en: "Polynesian", desc: "玻里尼西亞，海洋圖騰" },
      { zh: "薩摩亞", en: "Samoan", desc: "薩摩亞，塔陶刺青" },
    ],
  },
];

// ── 鏡頭 Lenses — the cultural facet to draw from.
//   key      = stable id (used by the dynamic API + cache key)
//   hint     = English fragment telling the LLM what specifics to surface
//   fallback = a few generic chips shown before / instead of a live fetch
export interface CultureLens {
  key: string;
  zh: string;
  emoji: string;
  hint: string;
  fallback: CultureItem[];
}

export const CULTURE_LENSES: CultureLens[] = [
  {
    key: "garment", zh: "服飾", emoji: "👘",
    hint: "traditional garments, dress, costume and clothing silhouettes",
    fallback: [
      { zh: "傳統服飾", en: "traditional costume", desc: "傳統服飾輪廓" },
      { zh: "頭飾", en: "traditional headdress", desc: "頭飾與冠帽" },
      { zh: "刺繡服", en: "embroidered garment", desc: "刺繡裝飾" },
    ],
  },
  {
    key: "pattern", zh: "紋樣", emoji: "🧩",
    hint: "traditional decorative patterns, motifs and ornamental designs",
    fallback: [
      { zh: "幾何紋", en: "geometric pattern", desc: "幾何紋樣" },
      { zh: "花卉紋", en: "floral motif", desc: "花卉紋樣" },
      { zh: "圖騰", en: "totem pattern", desc: "圖騰符號" },
    ],
  },
  {
    key: "palette", zh: "配色", emoji: "🎨",
    hint: "signature traditional color palettes and named color combinations",
    fallback: [
      { zh: "大地色", en: "earthy ochre palette", desc: "大地土色" },
      { zh: "靛藍", en: "indigo and white palette", desc: "靛藍配色" },
      { zh: "鮮豔對比", en: "vivid contrasting palette", desc: "鮮豔對比" },
    ],
  },
  {
    key: "weave", zh: "織法工藝", emoji: "🧵",
    hint: "traditional textile techniques, weaving, dyeing and craft methods",
    fallback: [
      { zh: "手織布", en: "handwoven textile", desc: "手織布工藝" },
      { zh: "蠟染", en: "batik wax-resist dye", desc: "蠟染工藝" },
      { zh: "刺繡", en: "folk embroidery", desc: "刺繡工藝" },
    ],
  },
  {
    key: "symbol", zh: "符號", emoji: "🔯",
    hint: "iconic cultural symbols, emblems and sacred signs",
    fallback: [
      { zh: "護身符", en: "protective amulet", desc: "護身符號" },
      { zh: "神聖幾何", en: "sacred geometry", desc: "神聖幾何" },
      { zh: "吉祥符", en: "auspicious symbol", desc: "吉祥符號" },
    ],
  },
  {
    key: "food", zh: "食物", emoji: "🍜",
    hint: "iconic dishes, street food, desserts and drinks",
    fallback: [
      { zh: "招牌料理", en: "signature dish", desc: "招牌料理" },
      { zh: "街頭小吃", en: "street food", desc: "街頭小吃" },
      { zh: "傳統甜點", en: "traditional dessert", desc: "傳統甜點" },
    ],
  },
  {
    key: "music", zh: "音樂", emoji: "🎵",
    hint: "traditional musical instruments, genres and dances",
    fallback: [
      { zh: "傳統樂器", en: "traditional instrument", desc: "傳統樂器" },
      { zh: "民俗舞", en: "folk dance", desc: "民俗舞蹈" },
      { zh: "節奏音樂", en: "rhythmic folk music", desc: "節奏音樂" },
    ],
  },
  {
    key: "art", zh: "藝術", emoji: "🖼️",
    hint: "representative art forms, painting styles and visual mediums",
    fallback: [
      { zh: "代表畫風", en: "traditional painting style", desc: "代表畫風" },
      { zh: "工藝美術", en: "decorative folk art", desc: "工藝美術" },
      { zh: "壁畫", en: "mural art", desc: "壁畫藝術" },
    ],
  },
  {
    key: "architecture", zh: "建築", emoji: "🏛️",
    hint: "iconic architecture, building styles and structural motifs",
    fallback: [
      { zh: "傳統建築", en: "traditional architecture", desc: "傳統建築" },
      { zh: "宗教建築", en: "temple architecture", desc: "宗教建築" },
      { zh: "屋頂線條", en: "distinctive rooflines", desc: "屋頂線條" },
    ],
  },
  {
    key: "landmark", zh: "知名景點", emoji: "📍",
    hint: "famous landmarks, natural wonders and iconic places",
    fallback: [
      { zh: "地標", en: "famous landmark", desc: "知名地標" },
      { zh: "自然奇景", en: "natural wonder", desc: "自然奇景" },
      { zh: "古蹟", en: "historic site", desc: "歷史古蹟" },
    ],
  },
  {
    key: "festival", zh: "節慶", emoji: "🎉",
    hint: "traditional festivals, ceremonies and celebrations",
    fallback: [
      { zh: "傳統節慶", en: "traditional festival", desc: "傳統節慶" },
      { zh: "宗教儀式", en: "sacred ceremony", desc: "宗教儀式" },
      { zh: "豐收祭", en: "harvest celebration", desc: "豐收祭典" },
    ],
  },
  {
    key: "myth", zh: "神話", emoji: "🐉",
    hint: "mythology, folklore creatures, gods and legends",
    fallback: [
      { zh: "神話生物", en: "mythical creature", desc: "神話生物" },
      { zh: "神祇", en: "mythological deity", desc: "神話神祇" },
      { zh: "民間傳說", en: "folklore legend", desc: "民間傳說" },
    ],
  },
  {
    key: "people", zh: "代表人物", emoji: "👤",
    hint: "iconic figures, folk heroes and representative people including indigenous elders and leaders",
    fallback: [
      { zh: "民族英雄", en: "folk hero", desc: "民族英雄" },
      { zh: "傳統工匠", en: "traditional artisan", desc: "傳統工匠" },
      { zh: "部落長老", en: "tribal elder", desc: "部落長老" },
    ],
  },
  {
    key: "nature", zh: "自然", emoji: "🏞️",
    hint: "signature landscapes, plants and natural elements",
    fallback: [
      { zh: "代表植物", en: "iconic native plant", desc: "代表植物" },
      { zh: "地景", en: "signature landscape", desc: "代表地景" },
      { zh: "花卉", en: "national flower", desc: "代表花卉" },
    ],
  },
  {
    key: "animal", zh: "動物", emoji: "🦁",
    hint: "culturally iconic and symbolic animals",
    fallback: [
      { zh: "神聖動物", en: "sacred animal", desc: "神聖動物" },
      { zh: "圖騰獸", en: "totem animal", desc: "圖騰動物" },
      { zh: "代表鳥", en: "national bird", desc: "代表鳥類" },
    ],
  },
  {
    key: "script", zh: "文字書法", emoji: "✒️",
    hint: "traditional scripts, calligraphy styles and lettering",
    fallback: [
      { zh: "書法", en: "traditional calligraphy", desc: "傳統書法" },
      { zh: "古文字", en: "ancient script", desc: "古老文字" },
      { zh: "裝飾字體", en: "ornamental lettering", desc: "裝飾字體" },
    ],
  },
];
