/**
 * 黃曆英文(lib/daily.ts 的英文介面與 /api/v1 locale=en 用)。鍵 = lunar-javascript 輸出經改正字、轉繁體後的字串。
 * 每份表的鍵列在 `as const` 清單,表型別是 Record<清單, string>:清單有、表漏寫 → tsc 紅。
 * 清單是否涵蓋該庫所有可能輸出,由 lib/almanacEn.test.ts 窮舉庫的全部組合檢查(升級庫多了新詞 → 測試紅)。
 * 英文是依通行意思自寫的說明式譯名,不是逐字直譯;沒有通行英文名的神煞取意譯。
 * 值 null = 英文刻意不列:醫療類事項(求醫、治病、針灸、探病)在英文讀者眼中會讀成健康建議,違反站規不給醫療結論;
 *   中文讀者懂黃曆慣例,中文照列。凶煞名取中性意譯,不用 Death／Ghost 這類字眼(站規不恐嚇)。
 */

/** 宜忌事項(庫 getDayYi／getDayJi 可能出現的全部,不含表示「無」的「無」)。 */
export const YIJI_TERMS = [
  '祭祀', '祈福', '求嗣', '開光', '塑繪', '齋醮', '酬神', '造廟', '謝土', '出火', '雕刻', '沐浴', '普渡',
  '嫁娶', '納采', '問名', '納婿', '歸寧', '安床', '合帳', '冠笄', '訂盟', '進人口', '裁衣',
  '修墳', '啟鑽', '破土', '安葬', '立碑', '成服', '除服', '開生墳', '合壽木', '入殮', '移柩', '行喪',
  '入宅', '安香', '安門', '修門', '修造', '起基', '動土', '上梁', '豎柱', '開柱眼', '定磉', '作梁', '合脊',
  '蓋屋', '拆卸', '破屋', '壞垣', '補垣', '修飾垣牆', '塞穴', '斷蟻', '作灶', '開廁', '造倉', '平治道塗',
  '造橋', '築堤', '開池', '開渠', '掘井', '放水', '伐木', '架馬', '掃舍', '造畜稠', '解除', '歸岫',
  '開市', '掛匾', '納財', '開倉', '置產', '雇傭', '出貨財', '交易', '立券', '安機械', '造車器', '經絡',
  '安碓磑', '造船', '割蜜', '栽種', '取漁', '結網', '牧養', '納畜', '教牛馬', '捕捉', '畋獵',
  '習藝', '入學', '理髮', '整手足甲', '探病', '求醫', '治病', '針灸', '乘船', '出行', '移徙', '分居',
  '會親友', '赴任', '詞訟', '諸事不宜', '餘事勿取',
] as const;
export type YiJiTerm = (typeof YIJI_TERMS)[number];

export const YIJI_EN: Record<YiJiTerm, string | null> = {
  祭祀: 'Offerings and worship', 祈福: 'Praying for blessings', 求嗣: 'Praying for children',
  開光: 'Consecrating sacred images', 塑繪: 'Making sacred images', 齋醮: 'Taoist rites',
  酬神: 'Thanking the gods', 造廟: 'Building a temple', 謝土: 'Thanking the earth god',
  出火: 'Moving the household shrine out', 雕刻: 'Carving', 沐浴: 'Bathing', 普渡: 'Rites for wandering souls',
  嫁娶: 'Weddings', 納采: 'Betrothal gifts', 問名: 'Exchanging birth details for a match',
  納婿: 'Taking in a son-in-law', 歸寧: "A bride's visit home", 安床: 'Setting up a bed',
  合帳: 'Making bed curtains', 冠笄: 'Coming-of-age rites', 訂盟: 'Engagement agreements',
  進人口: 'Welcoming new household members', 裁衣: 'Tailoring',
  修墳: 'Repairing a grave', 啟鑽: 'Exhuming for reburial', 破土: 'Breaking ground for a grave',
  安葬: 'Burial', 立碑: 'Erecting a tombstone', 成服: 'Putting on mourning clothes',
  除服: 'Ending mourning', 開生墳: 'Preparing a grave in advance', 合壽木: 'Making a coffin in advance',
  入殮: 'Encoffining', 移柩: 'Moving a coffin', 行喪: 'Funeral rites',
  入宅: 'Moving into a new home', 安香: 'Setting up a family altar', 安門: 'Installing a door',
  修門: 'Repairing a door', 修造: 'Building and repairs', 起基: 'Laying foundations',
  動土: 'Breaking ground for building', 上梁: 'Raising the ridge beam', 豎柱: 'Raising pillars',
  開柱眼: 'Cutting pillar joints', 定磉: 'Setting pillar bases', 作梁: 'Making beams',
  合脊: 'Closing the roof ridge', 蓋屋: 'Roofing a house', 拆卸: 'Dismantling', 破屋: 'Tearing down a house',
  壞垣: 'Knocking down walls', 補垣: 'Mending walls', 修飾垣牆: 'Decorating walls', 塞穴: 'Sealing holes',
  斷蟻: 'Termite control', 作灶: 'Building a stove', 開廁: 'Building a toilet', 造倉: 'Building a storehouse',
  平治道塗: 'Road repairs', 造橋: 'Building a bridge', 築堤: 'Building embankments', 開池: 'Digging a pond',
  開渠: 'Digging channels', 掘井: 'Digging a well', 放水: 'Draining or releasing water', 伐木: 'Felling trees',
  架馬: 'Setting up carpentry trestles', 掃舍: 'House cleaning', 造畜稠: 'Building animal pens',
  解除: 'Cleansing rites', 歸岫: 'Returning home to rest',
  開市: 'Opening a business', 掛匾: 'Hanging a shop sign', 納財: 'Receiving money', 開倉: 'Opening a storehouse',
  置產: 'Buying property', 雇傭: 'Hiring help', 出貨財: 'Shipping goods', 交易: 'Trading',
  立券: 'Signing contracts', 安機械: 'Installing machinery', 造車器: 'Building vehicles and tools',
  經絡: 'Setting up a loom', 安碓磑: 'Installing a mortar or millstone', 造船: 'Boatbuilding',
  割蜜: 'Harvesting honey', 栽種: 'Planting', 取漁: 'Fishing', 結網: 'Making nets', 牧養: 'Raising livestock',
  納畜: 'Buying livestock', 教牛馬: 'Training draught animals', 捕捉: 'Catching pests', 畋獵: 'Hunting',
  習藝: 'Learning a craft', 入學: 'Starting school', 理髮: 'Haircut', 整手足甲: 'Trimming nails',
  探病: null, 求醫: null, 治病: null, 針灸: null,
  乘船: 'Boat trips', 出行: 'Travel', 移徙: 'Moving house', 分居: 'Dividing a household',
  會親友: 'Visiting family and friends', 赴任: 'Taking up a new post', 詞訟: 'Lawsuits',
  諸事不宜: 'Nothing major is favored', 餘事勿取: 'Nothing else is advised',
};

/** 日吉神／日凶煞(庫 getDayJiShen／getDayXiongSha 可能出現的全部,不含「無」)。 */
export const SPIRIT_TERMS = [
  '天德', '月德', '天德合', '月德合', '天赦', '天願', '月恩', '四相', '時德', '天恩', '母倉', '天倉', '三合',
  '六合', '五合', '五富', '天喜', '天醫', '天馬', '驛馬', '天巫', '福德', '福生', '陽德', '陰德', '聖心',
  '益後', '續世', '要安', '敬安', '普護', '玉宇', '金堂', '寶光', '六儀', '解神', '除神', '鳴吠', '鳴吠對',
  '不將', '王日', '官日', '守日', '相日', '民日', '吉期', '時陽', '時陰', '生氣', '月空', '臨日',
  '青龍', '明堂', '金匱', '玉堂', '司命', '天刑', '朱雀', '白虎', '天牢', '元武', '勾陳',
  '月建', '小時', '土府', '月破', '大耗', '月煞', '月虛', '月刑', '月害', '月厭', '厭對', '招搖',
  '災煞', '劫煞', '天火', '地火', '天賊', '天吏', '致死', '死氣', '死神', '五虛', '九空', '九坎', '九焦',
  '土符', '大煞', '五離', '河魁', '天罡', '大時', '大敗', '咸池', '往亡', '游禍', '血支', '血忌', '重日',
  '復日', '小耗', '四廢', '四擊', '四忌', '四耗', '四窮', '四離', '八專', '八風', '八龍', '七鳥', '九虎',
  '六蛇', '歸忌', '逐陣', '觸水龍', '陽錯', '陰錯', '地囊', '大會', '小會', '五墓', '孤辰', '陰位', '行狠',
  '了戾', '歲薄', '絕陰', '絕陽', '純陰', '純陽', '孤陽', '單陰', '三陰', '陰神', '陰道沖陽',
  '陽破陰沖', '陽錯陰沖', '陰陽交破', '陰陽俱錯', '陰陽擊沖', '天狗', '成日', '三喪', '鬼哭', '大退',
  '解除', '天符', '七符', '天后',
] as const;
export type SpiritTerm = (typeof SPIRIT_TERMS)[number];

export const SPIRIT_EN: Record<SpiritTerm, string> = {
  天德: 'Heavenly Virtue', 月德: 'Monthly Virtue', 天德合: 'Heavenly Virtue Union', 月德合: 'Monthly Virtue Union',
  天赦: 'Heavenly Pardon', 天願: 'Heavenly Wish', 月恩: 'Monthly Grace', 四相: 'Four Ministers',
  時德: 'Seasonal Virtue', 天恩: 'Heavenly Grace', 母倉: 'Mother Granary', 天倉: 'Heavenly Granary',
  三合: 'Three Harmonies', 六合: 'Six Harmonies', 五合: 'Five Unions', 五富: 'Five Riches',
  天喜: 'Heavenly Joy', 天醫: 'Heavenly Healer', 天馬: 'Heavenly Horse', 驛馬: 'Post Horse',
  天巫: 'Heavenly Shaman', 福德: 'Blessed Virtue', 福生: 'Blessing Born', 陽德: 'Yang Virtue',
  陰德: 'Yin Virtue', 聖心: 'Sage Heart', 益後: 'Heirs Blessed', 續世: 'Lineage Continued',
  要安: 'Essential Peace', 敬安: 'Reverent Peace', 普護: 'Universal Protection', 玉宇: 'Jade Palace',
  金堂: 'Golden Hall', 寶光: 'Precious Light', 六儀: 'Six Rites', 解神: 'Releasing Spirit',
  除神: 'Cleansing Spirit', 鳴吠: 'Cock and Dog Day', 鳴吠對: 'Cock and Dog Pair', 不將: 'Unopposed Day',
  王日: 'King Day', 官日: 'Official Day', 守日: 'Guardian Day', 相日: 'Minister Day', 民日: 'People Day',
  吉期: 'Auspicious Date', 時陽: 'Seasonal Yang', 時陰: 'Seasonal Yin', 生氣: 'Vital Energy',
  月空: 'Monthly Void', 臨日: 'Arrival Day',
  青龍: 'Azure Dragon', 明堂: 'Bright Hall', 金匱: 'Golden Casket', 玉堂: 'Jade Hall',
  司命: 'Master of Fate', 天刑: 'Heavenly Punishment', 朱雀: 'Vermilion Bird', 白虎: 'White Tiger',
  天牢: 'Heavenly Prison', 元武: 'Black Tortoise', 勾陳: 'Hooked Array',
  月建: 'Month Establishment', 小時: 'Lesser Hour', 土府: 'Earth Palace', 月破: 'Month Breaker',
  大耗: 'Great Loss', 月煞: 'Monthly Malice', 月虛: 'Monthly Hollow', 月刑: 'Monthly Punishment',
  月害: 'Monthly Harm', 月厭: 'Monthly Loathing', 厭對: 'Loathing Opposite', 招搖: 'Flaunting Star',
  災煞: 'Disaster Malice', 劫煞: 'Robbery Malice', 天火: 'Heavenly Fire', 地火: 'Earth Fire',
  天賊: 'Heavenly Thief', 天吏: 'Heavenly Officer', 致死: 'Ending Star', 死氣: 'Withering Air',
  死神: 'Stillness Spirit', 五虛: 'Five Hollows', 九空: 'Nine Voids', 九坎: 'Nine Pits', 九焦: 'Nine Scorches',
  土符: 'Earth Talisman', 大煞: 'Great Malice', 五離: 'Five Partings', 河魁: 'River Chief',
  天罡: 'Heavenly Dipper', 大時: 'Great Hour', 大敗: 'Great Defeat', 咸池: 'Salty Pool',
  往亡: 'Ill-fated Departure', 游禍: 'Roaming Misfortune', 血支: 'Blood Branch', 血忌: 'Blood Taboo',
  重日: 'Double Day', 復日: 'Repeat Day', 小耗: 'Lesser Loss', 四廢: 'Four Wastes', 四擊: 'Four Strikes',
  四忌: 'Four Taboos', 四耗: 'Four Losses', 四窮: 'Four Exhaustions', 四離: 'Four Separations',
  八專: 'Eight Exclusives', 八風: 'Eight Winds', 八龍: 'Eight Dragons', 七鳥: 'Seven Birds',
  九虎: 'Nine Tigers', 六蛇: 'Six Snakes', 歸忌: 'Homecoming Taboo', 逐陣: 'Routed Ranks',
  觸水龍: 'Water Dragon Offence', 陽錯: 'Yang Error', 陰錯: 'Yin Error', 地囊: 'Earth Sack',
  大會: 'Great Assembly', 小會: 'Lesser Assembly', 五墓: 'Five Tombs', 孤辰: 'Lonely Star',
  陰位: 'Yin Seat', 行狠: 'Harsh Deeds', 了戾: 'Ended Strife', 歲薄: 'Thin Year',
  絕陰: 'Severed Yin', 絕陽: 'Severed Yang', 純陰: 'Pure Yin', 純陽: 'Pure Yang', 孤陽: 'Lone Yang',
  單陰: 'Single Yin', 三陰: 'Three Yin', 陰神: 'Yin Spirit', 陰道沖陽: 'Yin Path Clashing Yang',
  陽破陰沖: 'Yang Broken, Yin Clashed', 陽錯陰沖: 'Yang Error, Yin Clash', 陰陽交破: 'Yin and Yang Both Broken',
  陰陽俱錯: 'Yin and Yang Both Err', 陰陽擊沖: 'Yin and Yang Strike and Clash', 天狗: 'Heavenly Dog',
  成日: 'Completion Day', 三喪: 'Three Mournings', 鬼哭: 'Wailing Spirit', 大退: 'Great Retreat',
  解除: 'Release', 天符: 'Heavenly Talisman', 七符: 'Seven Talismans', 天后: 'Heavenly Empress',
};

/** 彭祖百忌:天干句、地支句(鍵為改正字後的繁體全句)。 */
export const PENGZU_TERMS = [
  '甲不開倉財物耗散', '乙不栽植千株不長', '丙不修灶必見災殃', '丁不剃頭頭必生瘡', '戊不受田田主不祥',
  '己不破券二比並亡', '庚不經絡織機虛張', '辛不合醬主人不嘗', '壬不汲水更難提防', '癸不詞訟理弱敵強',
  '子不問卜自惹禍殃', '丑不冠帶主不還鄉', '寅不祭祀神鬼不嘗', '卯不穿井水泉不香', '辰不哭泣必主重喪',
  '巳不遠行財物伏藏', '午不苫蓋屋主更張', '未不服藥毒氣入腸', '申不安床鬼祟入房', '酉不會客醉坐顛狂',
  '戌不吃犬作怪上床', '亥不嫁娶不利新郎',
] as const;
export type PengZuTerm = (typeof PENGZU_TERMS)[number];

export const PENGZU_EN: Record<PengZuTerm, string> = {
  甲不開倉財物耗散: 'Jia days: tradition says not to open the storehouse, lest wealth drain away.',
  乙不栽植千株不長: 'Yi days: tradition says not to plant, lest the seedlings fail to grow.',
  丙不修灶必見災殃: 'Bing days: tradition says not to repair the stove, lest trouble follow.',
  丁不剃頭頭必生瘡: 'Ding days: tradition says not to shave the head, lest the scalp break out in sores.',
  戊不受田田主不祥: 'Wu (stem) days: tradition says not to take on land, lest it bode ill for the owner.',
  己不破券二比並亡: 'Ji (stem) days: tradition says not to break a contract, lest both parties lose.',
  庚不經絡織機虛張: 'Geng days: tradition says not to set up a loom, lest the weaving come to nothing.',
  辛不合醬主人不嘗: 'Xin days: tradition says not to make sauce, lest the host never taste it.',
  壬不汲水更難提防: 'Ren days: tradition says not to draw water, lest trouble be hard to guard against.',
  癸不詞訟理弱敵強: 'Gui days: tradition says not to go to court, lest a fair case lose to a strong opponent.',
  子不問卜自惹禍殃: 'Zi days: tradition says not to consult a diviner, lest one invite trouble.',
  丑不冠帶主不還鄉: 'Chou days: tradition says not to hold coming-of-age rites, lest one stay far from home.',
  寅不祭祀神鬼不嘗: 'Yin days: tradition says not to make offerings, lest the spirits not receive them.',
  卯不穿井水泉不香: 'Mao days: tradition says not to dig a well, lest the water not run sweet.',
  辰不哭泣必主重喪: 'Chen days: tradition says not to weep, lest mourning come twice.',
  巳不遠行財物伏藏: 'Si days: tradition says not to travel far, lest belongings go astray.',
  午不苫蓋屋主更張: 'Wu (branch) days: tradition says not to thatch a roof, lest the household have to move.',
  未不服藥毒氣入腸: 'Wei days: an old saying about remedies; it is folklore, not health advice.',
  申不安床鬼祟入房: 'Shen days: tradition says not to set up a bed, lest restless spirits enter the room.',
  酉不會客醉坐顛狂: 'You days: tradition says not to host guests, lest the drinking get out of hand.',
  戌不吃犬作怪上床: 'Xu days: tradition says not to eat dog meat, lest odd things trouble one\'s sleep.',
  亥不嫁娶不利新郎: 'Hai days: tradition says not to marry, lest it bode ill for the groom.',
};

/** 胎神占方的組成字:所在物件(「占」只是「占據」,英文不譯)。 */
const FETUS_PLACE_EN: Readonly<Record<string, string>> = {
  大門: 'main gate', 倉庫: 'storehouse', 門: 'door', 戶: 'household door', 窗: 'window', 房: 'room', 床: 'bed',
  爐: 'stove', 灶: 'cooking range', 碓: 'mortar', 磨: 'millstone', 棲: 'roost', 廚: 'kitchen', 廁: 'toilet',
  倉: 'granary', 堂: 'hall',
};
const FETUS_SIDE_EN: Readonly<Record<string, string>> = {
  正東: 'east', 東南: 'southeast', 正南: 'south', 西南: 'southwest', 正西: 'west', 西北: 'northwest',
  正北: 'north', 東北: 'northeast', 東: 'east', 南: 'south', 西: 'west', 北: 'north', 中: 'center',
};

/**
 * 胎神占方(如「占門床 外正南」「房床棲 房內北」)→ 英文;有任何一段認不得 → null(呼叫端不輸出中文)。
 * 物件段以最長字優先切(「倉庫」「大門」先於「倉」「門」)。
 */
export function fetusGodEn(tw: string): string | null {
  const m = /^(.+) (外|房內)(.+)$/.exec(tw);
  if (!m) return null;
  const [, placesRaw, where, sideRaw] = m;
  const side = FETUS_SIDE_EN[sideRaw];
  if (!side) return null;
  const keys = Object.keys(FETUS_PLACE_EN).sort((a, b) => b.length - a.length);
  const places: string[] = [];
  let rest = placesRaw.startsWith('占') ? placesRaw.slice(1) : placesRaw;
  while (rest) {
    const k = keys.find((key) => rest.startsWith(key));
    if (!k) return null;
    places.push(FETUS_PLACE_EN[k]);
    rest = rest.slice(k.length);
  }
  if (!places.length) return null;
  const list = places.length === 1 ? places[0] : `${places.slice(0, -1).join(', ')} and ${places[places.length - 1]}`;
  const loc = where === '外' ? `outside the house, ${side}` : side === 'center' ? 'inside the bedroom, center' : `inside the bedroom, ${side} side`;
  return `${list[0].toUpperCase()}${list.slice(1)}; ${loc}`;
}

/** 天干、地支拼音(沖煞干支的英文,如「Gui-Hai」)。 */
const STEM_PINYIN: Readonly<Record<string, string>> = {
  甲: 'Jia', 乙: 'Yi', 丙: 'Bing', 丁: 'Ding', 戊: 'Wu', 己: 'Ji', 庚: 'Geng', 辛: 'Xin', 壬: 'Ren', 癸: 'Gui',
};
const BRANCH_PINYIN: Readonly<Record<string, string>> = {
  子: 'Zi', 丑: 'Chou', 寅: 'Yin', 卯: 'Mao', 辰: 'Chen', 巳: 'Si', 午: 'Wu', 未: 'Wei', 申: 'Shen', 酉: 'You', 戌: 'Xu', 亥: 'Hai',
};
export function ganZhiPinyin(gz: string): string | null {
  const [g, z] = [...gz];
  const a = STEM_PINYIN[g];
  const b = BRANCH_PINYIN[z];
  return a && b && gz.length === 2 ? `${a}-${b}` : null;
}

/** 查表;表裡沒有或刻意不列(null)→ null(呼叫端略過,英文輸出不夾中文;是否漏詞由測試窮舉把關)。 */
export function lookupEn<K extends string>(table: Readonly<Record<K, string | null>>, tw: string): string | null {
  return Object.prototype.hasOwnProperty.call(table, tw) ? table[tw as K] : null;
}
