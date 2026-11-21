import type { Locale } from './i18n/config';
import { localToday, type Ymd } from './today';

/**
 * 塔羅 — 78 張牌庫(中英雙語)+ Fisher-Yates 抽牌(預設密碼學亂數,可注入 rng 測試)+ 每日一牌(確定性)。
 * 牌義解讀由 AI 層產生;本模組提供牌庫結構 + 抽牌(正逆位、不放回)。
 */

export type Arcana = 'major' | 'minor';
export type SuitId = 'wands' | 'cups' | 'swords' | 'pentacles';

export interface TarotCard {
  id: string;
  arcana: Arcana;
  suit?: SuitId;
  /** 大阿爾克那編號 0–21 */
  number?: number;
  name: Record<Locale, string>;
}

const SUITS: Record<SuitId, Record<Locale, string>> = {
  wands: { 'zh-TW': '權杖', en: 'Wands' },
  cups: { 'zh-TW': '聖杯', en: 'Cups' },
  swords: { 'zh-TW': '寶劍', en: 'Swords' },
  pentacles: { 'zh-TW': '錢幣', en: 'Pentacles' },
};

const RANKS: ReadonlyArray<{ id: string; name: Record<Locale, string> }> = [
  { id: 'ace', name: { 'zh-TW': '王牌', en: 'Ace' } },
  { id: '2', name: { 'zh-TW': '二', en: 'Two' } },
  { id: '3', name: { 'zh-TW': '三', en: 'Three' } },
  { id: '4', name: { 'zh-TW': '四', en: 'Four' } },
  { id: '5', name: { 'zh-TW': '五', en: 'Five' } },
  { id: '6', name: { 'zh-TW': '六', en: 'Six' } },
  { id: '7', name: { 'zh-TW': '七', en: 'Seven' } },
  { id: '8', name: { 'zh-TW': '八', en: 'Eight' } },
  { id: '9', name: { 'zh-TW': '九', en: 'Nine' } },
  { id: '10', name: { 'zh-TW': '十', en: 'Ten' } },
  { id: 'page', name: { 'zh-TW': '侍者', en: 'Page' } },
  { id: 'knight', name: { 'zh-TW': '騎士', en: 'Knight' } },
  { id: 'queen', name: { 'zh-TW': '皇后', en: 'Queen' } },
  { id: 'king', name: { 'zh-TW': '國王', en: 'King' } },
];

const MAJOR_ARCANA: ReadonlyArray<Record<Locale, string>> = [
  { 'zh-TW': '愚者', en: 'The Fool' },
  { 'zh-TW': '魔術師', en: 'The Magician' },
  { 'zh-TW': '女祭司', en: 'The High Priestess' },
  { 'zh-TW': '皇后', en: 'The Empress' },
  { 'zh-TW': '皇帝', en: 'The Emperor' },
  { 'zh-TW': '教皇', en: 'The Hierophant' },
  { 'zh-TW': '戀人', en: 'The Lovers' },
  { 'zh-TW': '戰車', en: 'The Chariot' },
  { 'zh-TW': '力量', en: 'Strength' },
  { 'zh-TW': '隱者', en: 'The Hermit' },
  { 'zh-TW': '命運之輪', en: 'Wheel of Fortune' },
  { 'zh-TW': '正義', en: 'Justice' },
  { 'zh-TW': '吊人', en: 'The Hanged Man' },
  { 'zh-TW': '死神', en: 'Death' },
  { 'zh-TW': '節制', en: 'Temperance' },
  { 'zh-TW': '惡魔', en: 'The Devil' },
  { 'zh-TW': '高塔', en: 'The Tower' },
  { 'zh-TW': '星星', en: 'The Star' },
  { 'zh-TW': '月亮', en: 'The Moon' },
  { 'zh-TW': '太陽', en: 'The Sun' },
  { 'zh-TW': '審判', en: 'Judgement' },
  { 'zh-TW': '世界', en: 'The World' },
];

function buildDeck(): TarotCard[] {
  const deck: TarotCard[] = [];
  MAJOR_ARCANA.forEach((name, i) => {
    deck.push({ id: `major-${i}`, arcana: 'major', number: i, name });
  });
  (Object.keys(SUITS) as SuitId[]).forEach((suit) => {
    RANKS.forEach((rank) => {
      deck.push({
        id: `${suit}-${rank.id}`,
        arcana: 'minor',
        suit,
        name: {
          'zh-TW': `${SUITS[suit]['zh-TW']}${rank.name['zh-TW']}`,
          en: `${rank.name.en} of ${SUITS[suit].en}`,
        },
      });
    });
  });
  return deck;
}

export const TAROT_DECK: ReadonlyArray<TarotCard> = buildDeck();

/** 牌陣主題分組(畫面用分組按鈕,不用下拉選單)。 */
export type SpreadCategory = 'general' | 'love' | 'career' | 'spiritual' | 'time';

export const SPREAD_CATEGORIES: ReadonlyArray<{ id: SpreadCategory; name: Record<Locale, string> }> = [
  { id: 'general', name: { 'zh-TW': '一般', en: 'General' } },
  { id: 'love', name: { 'zh-TW': '感情', en: 'Love' } },
  { id: 'career', name: { 'zh-TW': '事業財運', en: 'Career & wealth' } },
  { id: 'spiritual', name: { 'zh-TW': '靈性成長', en: 'Spiritual growth' } },
  { id: 'time', name: { 'zh-TW': '時間流年', en: 'Time & cycles' } },
];

export interface TarotSpread<I extends string = string> {
  id: I;
  category: SpreadCategory;
  size: number;
  name: Record<Locale, string>;
  /** 各牌位含義(順序對應抽出的牌);長度 = size */
  positions: Record<Locale, string[]>;
}

type Pair = readonly [zh: string, en: string];

/** 牌位以 [繁中, 英文] 成對書寫,size 由牌位數決定(不會與宣告張數脫節)。 */
function def<I extends string>(
  id: I,
  category: SpreadCategory,
  zhName: string,
  enName: string,
  positions: readonly Pair[],
): TarotSpread<I> {
  return {
    id,
    category,
    size: positions.length,
    name: { 'zh-TW': zhName, en: enName },
    positions: { 'zh-TW': positions.map((p) => p[0]), en: positions.map((p) => p[1]) },
  };
}

// 牌陣名稱與牌位用語皆為本站自寫。牌位構想參考 tarot-mcp、anois_tarot 兩個 MIT 專案(見 THIRD_PARTY_NOTICES.md)。
const SPREAD_LIST = [
  // ── 一般 ──
  def('single', 'general', '單張指引', 'Single card', [['指引', 'Guidance']]),
  def('three', 'general', '三張(過去/現在/未來)', 'Three cards (Past/Present/Future)', [
    ['過去', 'Past'],
    ['現在', 'Present'],
    ['未來', 'Future'],
  ]),
  def('situation', 'general', '情境・行動・結果', 'Situation / Action / Outcome', [
    ['情境', 'Situation'],
    ['行動', 'Action'],
    ['結果', 'Outcome'],
  ]),
  def('mindbodyspirit', 'general', '身・心・靈', 'Mind / Body / Spirit', [
    ['心智', 'Mind'],
    ['身體', 'Body'],
    ['靈性', 'Spirit'],
  ]),
  def('decision', 'general', '抉擇(現況/選A/選B)', 'Decision (Now/Option A/Option B)', [
    ['現況', 'Current situation'],
    ['選擇 A 的走向', 'If you choose A'],
    ['選擇 B 的走向', 'If you choose B'],
  ]),
  def('decision2', 'general', '二選一', 'Either / or', [
    ['選擇 A', 'Option A'],
    ['選擇 B', 'Option B'],
  ]),
  def('decisionpath', 'general', '抉擇路徑(五張)', 'Decision path (five cards)', [
    ['處境', 'The situation'],
    ['選項 A', 'Option A'],
    ['選項 B', 'Option B'],
    ['需要知道的事', 'What you need to know'],
    ['建議的方向', 'Suggested direction'],
  ]),
  def('yesno', 'general', '是非題', 'Yes / No', [['是非傾向與提醒', 'Yes/No leaning & caution']]),
  def('yesno3', 'general', '是非(三張)', 'Yes / No (three cards)', [
    ['處境', 'The situation'],
    ['影響因素', 'Influences'],
    ['答案傾向', 'Leaning of the answer'],
  ]),
  def('clarifier', 'general', '是非澄清(兩張)', 'Yes / No with clarifier', [
    ['答案', 'Answer'],
    ['補充說明', 'Clarifier'],
  ]),
  def('diamond', 'general', '鑽石(卡關決策)', 'Diamond (stuck decision)', [
    ['核心議題', 'Core issue'],
    ['根源', 'Root'],
    ['阻力', 'Resistance'],
    ['潛力', 'Potential'],
    ['建議', 'Advice'],
  ]),
  def('trend', 'general', '發展趨勢(五張)', 'Trend (five cards)', [
    ['自己', 'Yourself'],
    ['過去經驗', 'Past experience'],
    ['目前情況', 'Present situation'],
    ['即將遇見', 'What approaches'],
    ['潛在因素', 'Hidden factors'],
  ]),
  def('mirror', 'general', '真相之鏡(四張)', 'Mirror of truth (four cards)', [
    ['看見自己', 'Seeing yourself'],
    ['看見對方的心', 'Seeing their heart'],
    ['還原事情原貌', 'The situation as it is'],
    ['未來的方向', 'Direction ahead'],
  ]),
  def('horseshoe', 'general', '馬蹄(時間線)', 'Horseshoe (timeline)', [
    ['遠期過去', 'Distant past'],
    ['近期過去', 'Recent past'],
    ['當前', 'Present'],
    ['近期未來', 'Near future'],
    ['外部影響', 'External influences'],
    ['建議', 'Advice'],
    ['結果', 'Outcome'],
  ]),
  def('celtic', 'general', '凱爾特十字', 'Celtic Cross', [
    ['現況', 'Present'],
    ['阻礙/助力', 'Challenge'],
    ['潛意識根源', 'Subconscious'],
    ['過去', 'Past'],
    ['可能的未來', 'Possible future'],
    ['近期發展', 'Near future'],
    ['自我態度', 'Your attitude'],
    ['環境與他人', 'External influences'],
    ['希望與恐懼', 'Hopes & fears'],
    ['最終結果', 'Outcome'],
  ]),

  // ── 感情 ──
  def('relationship', 'love', '關係(你/對方/關係)', 'Relationship (You/Them/Bond)', [
    ['你', 'You'],
    ['對方', 'Them'],
    ['兩人關係', 'The relationship'],
  ]),
  def('relationship5', 'love', '關係(五張)', 'Relationship (five cards)', [
    ['你', 'You'],
    ['對方', 'Them'],
    ['彼此的連結', 'The bond'],
    ['挑戰', 'Challenge'],
    ['走向', 'Direction'],
  ]),
  def('relationshipcross', 'love', '關係十字(七張)', 'Relationship cross (seven cards)', [
    ['你', 'You'],
    ['對方', 'Them'],
    ['關係現況', 'State of the relationship'],
    ['你的期待', 'What you hope for'],
    ['對方的期待', 'What they hope for'],
    ['需要學習的課題', 'The lesson'],
    ['走向', 'Direction'],
  ]),
  def('crush', 'love', '桃花運(三張)', 'Romance luck (three cards)', [
    ['你的狀態', 'Your state'],
    ['桃花機緣', 'Chance of romance'],
    ['把握的方式', 'How to seize it'],
  ]),
  def('admirer', 'love', '對方的心(五張)', 'Their heart (five cards)', [
    ['對方眼中的你', 'How they see you'],
    ['對方的感受', 'How they feel'],
    ['對方的顧慮', 'Their worries'],
    ['對方的期待', 'What they hope for'],
    ['可能的行動', 'Possible next move'],
  ]),
  def('truelove', 'love', '正緣(六張)', 'True love (six cards)', [
    ['你的狀態', 'Your state'],
    ['正緣的時機', 'Timing'],
    ['對方的特質', 'Their qualities'],
    ['相遇的方式', 'How you meet'],
    ['關係的發展', 'How it develops'],
    ['建議', 'Advice'],
  ]),
  def('singleno', 'love', '脫單(五張)', 'Meeting someone (five cards)', [
    ['單身現況', 'Being single now'],
    ['阻礙', 'Obstacle'],
    ['緣分的來處', 'Where chances come from'],
    ['該怎麼做', 'What to do'],
    ['結果', 'Outcome'],
  ]),
  def('reunite', 'love', '復合(六張)', 'Reconciliation (six cards)', [
    ['你現在', 'You now'],
    ['對方現在', 'Them now'],
    ['對方還在意嗎', 'Do they still care'],
    ['阻礙', 'Obstacle'],
    ['復合的可能', 'Likelihood'],
    ['建議', 'Advice'],
  ]),
  def('situationship', 'love', '曖昧(五張)', 'Undefined ties (five cards)', [
    ['曖昧的本質', 'Nature of it'],
    ['你的心意', 'Your feelings'],
    ['對方的心意', 'Their feelings'],
    ['阻礙', 'Obstacle'],
    ['走向', 'Direction'],
  ]),
  def('venus', 'love', '金星愛情(七張)', 'Venus love (seven cards)', [
    ['目前的感情能量', 'Current love energy'],
    ['自愛與自我價值', 'Self-love & self-worth'],
    ['吸引愛的特質', 'What attracts love'],
    ['接收愛的阻礙', 'Blocks to receiving love'],
    ['讓關係更好的做法', 'Improving relationships'],
    ['內心的渴望', 'Hidden desires'],
    ['感情的潛力', 'Potential in love'],
  ]),
  def('compatibility', 'love', '契合度(八張)', 'Compatibility (eight cards)', [
    ['甲方的本質', 'Person A: core nature'],
    ['乙方的本質', 'Person B: core nature'],
    ['彼此吸引之處', 'What attracts you'],
    ['可能的挑戰', 'Possible challenges'],
    ['溝通方式', 'Communication style'],
    ['共同目標', 'Shared goals'],
    ['成長空間', 'Room to grow'],
    ['長遠的潛力', 'Long-term potential'],
  ]),

  // ── 事業財運 ──
  def('career3', 'career', '事業指引(三張)', 'Career guidance (three cards)', [
    ['現況', 'Present'],
    ['機會', 'Opportunity'],
    ['行動', 'Action'],
  ]),
  def('careercross', 'career', '事業全景(五張)', 'Career overview (five cards)', [
    ['現況', 'Present'],
    ['優勢', 'Strength'],
    ['障礙', 'Obstacle'],
    ['機會', 'Opportunity'],
    ['結果', 'Outcome'],
  ]),
  def('careerpath', 'career', '職涯路徑(六張)', 'Career path (six cards)', [
    ['目前的職涯處境', 'Current career situation'],
    ['你的技能與天賦', 'Skills & talents'],
    ['職涯的挑戰', 'Challenges'],
    ['尚未看見的機會', 'Hidden opportunities'],
    ['該採取的行動', 'Action to take'],
    ['職涯走向', 'Career outcome'],
  ]),
  def('wealth3', 'career', '財運指引(三張)', 'Wealth guidance (three cards)', [
    ['現況', 'Present'],
    ['阻礙', 'Block'],
    ['助力', 'Boost'],
  ]),
  def('wealthflow', 'career', '財運全景(五張)', 'Wealth overview (five cards)', [
    ['現況', 'Present'],
    ['收入', 'Income'],
    ['支出', 'Spending'],
    ['機會', 'Opportunity'],
    ['走向', 'Direction'],
  ]),

  // ── 靈性成長 ──
  def('pentagram', 'spiritual', '五芒星', 'Pentagram', [
    ['靈(頂)', 'Spirit (top)'],
    ['風(右上)', 'Air (upper right)'],
    ['火(右下)', 'Fire (lower right)'],
    ['土(左下)', 'Earth (lower left)'],
    ['水(左上)', 'Water (upper left)'],
  ]),
  def('elements', 'spiritual', '四元素平衡', 'Elemental balance', [
    ['火:熱情與行動', 'Fire: passion & action'],
    ['水:情緒與直覺', 'Water: emotion & intuition'],
    ['風:思考與溝通', 'Air: thought & communication'],
    ['土:穩定與落實', 'Earth: stability & grounding'],
  ]),
  def('spiritual6', 'spiritual', '靈性指引(六張)', 'Spiritual guidance (six cards)', [
    ['目前的內在狀態', 'Your inner state'],
    ['正在學習的課題', 'Lessons'],
    ['成長的阻礙', 'Blocks to growth'],
    ['你的天賦', 'Your gifts'],
    ['來自內在的指引', 'Inner guidance'],
    ['下一步', 'Next steps'],
  ]),
  def('shadow', 'spiritual', '陰影整合(五張)', 'Shadow work (five cards)', [
    ['你的陰影', 'Your shadow'],
    ['它如何顯現', 'How it shows up'],
    ['藏在其中的禮物', 'The gift within'],
    ['整合的歷程', 'Integration'],
    ['轉化', 'Transformation'],
  ]),
  def('chakra', 'spiritual', '七脈輪', 'Seven chakras', [
    ['海底輪', 'Root'],
    ['臍輪', 'Sacral'],
    ['太陽神經叢輪', 'Solar plexus'],
    ['心輪', 'Heart'],
    ['喉輪', 'Throat'],
    ['眉心輪', 'Third eye'],
    ['頂輪', 'Crown'],
  ]),
  def('mandala', 'spiritual', '曼陀羅(九張)', 'Mandala (nine cards)', [
    ['中心:核心自我', 'Center: core self'],
    ['北:靈性指引', 'North: spiritual guidance'],
    ['東北:思緒清明', 'Northeast: mental clarity'],
    ['東:新的開始', 'East: new beginnings'],
    ['東南:人際關係', 'Southeast: relationships'],
    ['南:熱情與創造', 'South: passion & creativity'],
    ['西南:療癒與放下', 'Southwest: healing & release'],
    ['西:直覺與情緒', 'West: intuition & emotion'],
    ['西北:智慧與知識', 'Northwest: wisdom & knowledge'],
  ]),
  def('treeoflife', 'spiritual', '生命之樹(十張)', 'Tree of Life (ten cards)', [
    ['王冠 Kether', 'Kether (Crown)'],
    ['智慧 Chokmah', 'Chokmah (Wisdom)'],
    ['理解 Binah', 'Binah (Understanding)'],
    ['慈悲 Chesed', 'Chesed (Mercy)'],
    ['嚴厲 Geburah', 'Geburah (Severity)'],
    ['美 Tiphareth', 'Tiphareth (Beauty)'],
    ['勝利 Netzach', 'Netzach (Victory)'],
    ['榮耀 Hod', 'Hod (Splendor)'],
    ['基礎 Yesod', 'Yesod (Foundation)'],
    ['王國 Malkuth', 'Malkuth (Kingdom)'],
  ]),
  def('pastlife', 'spiritual', '前世因緣(六張)', 'Past-life patterns (six cards)', [
    ['前世的影響', 'Past-life influence'],
    ['因緣的課題', 'Karmic lesson'],
    ['未了的債', 'Karmic debt'],
    ['靈魂的禮物', 'Soul gifts'],
    ['目前的挑戰', 'Current challenge'],
    ['化解之道', 'Path to resolution'],
  ]),

  // ── 時間流年 ──
  def('moon', 'time', '月相(月度)', 'Moon phases (monthly)', [
    ['新月・設定意圖', 'New moon: intention'],
    ['上弦月・採取行動', 'First quarter: action'],
    ['滿月・看見與覺察', 'Full moon: awareness'],
    ['下弦月・放下與釋放', 'Last quarter: release'],
  ]),
  def('newmoon', 'time', '新月許願(五張)', 'New moon intentions (five cards)', [
    ['目前的能量', 'Current energy'],
    ['要放下的事', 'What to release'],
    ['要立下的意圖', 'Intention to set'],
    ['如何實現', 'How to manifest'],
    ['可能的結果', 'Potential outcome'],
  ]),
  def('fullmoon', 'time', '滿月釋放(五張)', 'Full moon release (five cards)', [
    ['已經成形的事', 'What has manifested'],
    ['要放下的事', 'What to release'],
    ['藏著的祝福', 'Hidden blessings'],
    ['放下的方式', 'How to release'],
    ['往前走', 'Moving forward'],
  ]),
  def('weekly', 'time', '一週運勢(七張)', 'Week ahead (seven cards)', [
    ['週一', 'Monday'],
    ['週二', 'Tuesday'],
    ['週三', 'Wednesday'],
    ['週四', 'Thursday'],
    ['週五', 'Friday'],
    ['週六', 'Saturday'],
    ['週日', 'Sunday'],
  ]),
  def('yearahead', 'time', '年度之輪(十三張)', 'Year ahead (thirteen cards)', [
    ['全年主題', 'Theme of the year'],
    ['一月', 'January'],
    ['二月', 'February'],
    ['三月', 'March'],
    ['四月', 'April'],
    ['五月', 'May'],
    ['六月', 'June'],
    ['七月', 'July'],
    ['八月', 'August'],
    ['九月', 'September'],
    ['十月', 'October'],
    ['十一月', 'November'],
    ['十二月', 'December'],
  ]),
  def('houses', 'time', '十二宮位(十二張)', 'Twelve houses (twelve cards)', [
    ['第一宮:自我與形象', '1st house: self & identity'],
    ['第二宮:價值與資源', '2nd house: values & resources'],
    ['第三宮:溝通與學習', '3rd house: communication'],
    ['第四宮:家庭與根基', '4th house: home & family'],
    ['第五宮:創造與戀愛', '5th house: creativity & romance'],
    ['第六宮:工作與健康', '6th house: work & health'],
    ['第七宮:伴侶與合作', '7th house: partnerships'],
    ['第八宮:蛻變與共享', '8th house: transformation'],
    ['第九宮:信念與遠行', '9th house: beliefs & travel'],
    ['第十宮:事業與名聲', '10th house: career & reputation'],
    ['第十一宮:朋友與願景', '11th house: friends & aspirations'],
    ['第十二宮:潛意識與隱藏', '12th house: the hidden'],
  ]),
] as const;

export type SpreadId = (typeof SPREAD_LIST)[number]['id'];

export const SPREADS = Object.fromEntries(SPREAD_LIST.map((s) => [s.id, s])) as Record<
  SpreadId,
  TarotSpread<SpreadId>
>;

/** 依主題分組、保留宣告順序,供畫面逐組顯示。 */
export const SPREAD_GROUPS: ReadonlyArray<{
  id: SpreadCategory;
  name: Record<Locale, string>;
  spreads: ReadonlyArray<TarotSpread<SpreadId>>;
}> = SPREAD_CATEGORIES.map((c) => ({
  ...c,
  spreads: SPREAD_LIST.filter((s) => s.category === c.id),
}));

/** 抽牌情境(情境化卡義:同一張牌在不同主題語意不同)。 */
export type TarotTopic =
  | 'general'
  | 'love'
  | 'career'
  | 'wealth'
  | 'spiritual';

export const TOPICS: Record<TarotTopic, Record<Locale, string>> = {
  general: { 'zh-TW': '綜合', en: 'General' },
  love: { 'zh-TW': '感情', en: 'Love' },
  career: { 'zh-TW': '事業', en: 'Career' },
  wealth: { 'zh-TW': '財運', en: 'Wealth' },
  spiritual: { 'zh-TW': '靈性成長', en: 'Spiritual' },
};

export interface DrawnCard {
  card: TarotCard;
  reversed: boolean;
}

export interface TarotResult {
  spread: SpreadId;
  cards: DrawnCard[];
  /** 每日一牌時為抽牌當天(本地日期);一般抽牌不帶 */
  daily?: Ymd;
}

/** 可注入的亂數源:回傳 [0,1)。測試注入固定值;預設改用密碼學亂數(見 secureInt)。 */
export type Rng = () => number;

/**
 * 密碼學亂數的無偏整數 [0, n)。拒絕取樣:丟掉 2^32 尾端不足一整輪的區段,避免 % n 偏向小值。
 * globalThis.crypto 在瀏覽器與 Node ≥ 19 皆有。
 */
export function secureInt(n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > 2 ** 32) throw new Error(`secureInt 範圍錯誤: ${n}`);
  const limit = 2 ** 32 - (2 ** 32 % n);
  const buf = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % n;
}

/** 洗牌與正逆位共用同一個整數來源:有注入 rng 就以它換算,沒有就用 secureInt。 */
function intSource(rng?: Rng): (n: number) => number {
  return rng ? (n) => Math.floor(rng() * n) : secureInt;
}

/** Fisher-Yates 洗牌(不變動原陣列)。 */
function shuffle<T>(arr: ReadonlyArray<T>, int: (n: number) => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = int(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 抽 count 張(不放回),每張隨機正逆位(int(2)===0 為逆位,與舊版 rng()<0.5 同向)。 */
export function drawCards(count: number, rng?: Rng): DrawnCard[] {
  if (count < 1 || count > TAROT_DECK.length) {
    throw new Error(`抽牌數須介於 1–${TAROT_DECK.length}: ${count}`);
  }
  const int = intSource(rng);
  return shuffle(TAROT_DECK, int)
    .slice(0, count)
    .map((card) => ({ card, reversed: int(2) === 0 }));
}

export function drawSpread(spread: SpreadId, rng?: Rng): TarotResult {
  return { spread, cards: drawCards(SPREADS[spread].size, rng) };
}

/** FNV-1a 32 位元雜湊。 */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32:以 32 位元種子產生確定性 [0,1) 序列。 */
function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 每日一牌:同一本地日期永遠同一張牌與正逆位(確定性雜湊,不用亂數、不存任何東西)。 */
export function dailyCard(date: Ymd = localToday()): DrawnCard {
  const rng = mulberry32(fnv1a(`tarot-daily:${date.year}-${date.month}-${date.day}`));
  const int = intSource(rng);
  return { card: TAROT_DECK[int(TAROT_DECK.length)], reversed: int(2) === 0 };
}

export function drawDaily(date: Ymd = localToday()): TarotResult {
  return { spread: 'single', cards: [dailyCard(date)], daily: date };
}
