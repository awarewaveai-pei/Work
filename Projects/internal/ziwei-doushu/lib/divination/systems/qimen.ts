import { computeQimen, type Deity, type Door, type Palace, type QimenResult, type QimenTime, type Star, type Yuan } from '@/lib/qimen';
import type { Locale } from '@/lib/i18n/config';
import type { DivinationSystem, InterpretationContext } from '../types';

/**
 * 奇門遁甲(時家・轉盤・拆補法・中五寄坤)。程式排盤,AI 只依 facts 敘事。
 * 用神:每個提問主題對應一個傳統常用的門或神,其所在宮給 AI 當主線。
 */

export type QimenTopic = 'general' | 'career' | 'wealth' | 'relationship' | 'study';
export const QIMEN_TOPICS: readonly QimenTopic[] = ['general', 'career', 'wealth', 'relationship', 'study'];

/** 主題 → 用神(general 看值符值使,不另取) */
const YONG_SHEN: Record<Exclude<QimenTopic, 'general'>, { door?: Door; deity?: Deity }> = {
  career: { door: '開門' },
  wealth: { door: '生門' },
  relationship: { deity: '六合' },
  study: { door: '景門' },
};

export interface QimenInput {
  time: QimenTime;
  topic: QimenTopic;
}

export interface QimenData extends QimenResult {
  topic: QimenTopic;
  /** 用神與其所在宮;general 為 null */
  yongShen: { name: Door | Deity; palace: Palace } | null;
}

export function computeQimenReading(input: QimenInput): QimenData {
  const r = computeQimen(input.time);
  let yongShen: QimenData['yongShen'] = null;
  if (input.topic !== 'general') {
    const y = YONG_SHEN[input.topic];
    const name = (y.door ?? y.deity)!;
    const hit = r.plate.palaces.find((p) => (y.door ? p.door === y.door : p.deity === y.deity))!;
    yongShen = { name, palace: hit.palace };
  }
  return { ...r, topic: input.topic, yongShen };
}

type Words = Record<Locale, string>;

export const PALACE_NAME: Record<Palace, Words> = {
  1: { 'zh-TW': '坎一宮(北)', en: 'Kan 1 (N)' },
  2: { 'zh-TW': '坤二宮(西南)', en: 'Kun 2 (SW)' },
  3: { 'zh-TW': '震三宮(東)', en: 'Zhen 3 (E)' },
  4: { 'zh-TW': '巽四宮(東南)', en: 'Xun 4 (SE)' },
  5: { 'zh-TW': '中五宮', en: 'Center 5' },
  6: { 'zh-TW': '乾六宮(西北)', en: 'Qian 6 (NW)' },
  7: { 'zh-TW': '兌七宮(西)', en: 'Dui 7 (W)' },
  8: { 'zh-TW': '艮八宮(東北)', en: 'Gen 8 (NE)' },
  9: { 'zh-TW': '離九宮(南)', en: 'Li 9 (S)' },
};

const STAR_EN: Record<Star, string> = {
  天蓬: 'Tian Peng', 天任: 'Tian Ren', 天沖: 'Tian Chong', 天輔: 'Tian Fu', 天英: 'Tian Ying',
  天芮: 'Tian Rui', 天柱: 'Tian Zhu', 天心: 'Tian Xin', 天禽: 'Tian Qin',
};
const DOOR_EN: Record<Door, string> = {
  休門: 'Rest door', 生門: 'Life door', 傷門: 'Harm door', 杜門: 'Block door',
  景門: 'View door', 死門: 'Stillness door', 驚門: 'Alarm door', 開門: 'Open door',
};
const DEITY_EN: Record<Deity, string> = {
  值符: 'Chief', 螣蛇: 'Serpent', 太陰: 'Moon', 六合: 'Harmony',
  白虎: 'Tiger', 玄武: 'Tortoise', 九地: 'Nine Earth', 九天: 'Nine Heaven',
};
const YUAN: Record<Yuan, Words> = {
  upper: { 'zh-TW': '上元', en: 'upper cycle' },
  middle: { 'zh-TW': '中元', en: 'middle cycle' },
  lower: { 'zh-TW': '下元', en: 'lower cycle' },
};
const JIEQI_EN: Record<string, string> = {
  冬至: 'Winter Solstice', 小寒: 'Minor Cold', 大寒: 'Major Cold', 立春: 'Start of Spring',
  雨水: 'Rain Water', 驚蟄: 'Awakening of Insects', 春分: 'Spring Equinox', 清明: 'Clear and Bright',
  穀雨: 'Grain Rain', 立夏: 'Start of Summer', 小滿: 'Grain Buds', 芒種: 'Grain in Ear',
  夏至: 'Summer Solstice', 小暑: 'Minor Heat', 大暑: 'Major Heat', 立秋: 'Start of Autumn',
  處暑: 'End of Heat', 白露: 'White Dew', 秋分: 'Autumn Equinox', 寒露: 'Cold Dew',
  霜降: 'Frost Descent', 立冬: 'Start of Winter', 小雪: 'Minor Snow', 大雪: 'Major Snow',
};
export const TOPIC: Record<QimenTopic, Words> = {
  general: { 'zh-TW': '整體運勢', en: 'General outlook' },
  career: { 'zh-TW': '事業工作', en: 'Career and work' },
  wealth: { 'zh-TW': '財務收入', en: 'Money and income' },
  relationship: { 'zh-TW': '感情人際', en: 'Love and relationships' },
  study: { 'zh-TW': '考試學習', en: 'Exams and study' },
};

export function starName(s: Star, locale: Locale): string {
  return locale === 'en' ? STAR_EN[s] : s;
}
export function doorName(d: Door, locale: Locale): string {
  return locale === 'en' ? DOOR_EN[d] : d;
}
export function deityName(d: Deity, locale: Locale): string {
  return locale === 'en' ? DEITY_EN[d] : d;
}
export function jieqiName(name: string, locale: Locale): string {
  return locale === 'en' ? (JIEQI_EN[name] ?? name) : name;
}
/** 用神名(門或神) */
export function shenName(n: Door | Deity, locale: Locale): string {
  return n in DOOR_EN ? doorName(n as Door, locale) : deityName(n as Deity, locale);
}

export function toContext(r: QimenData, locale: Locale): InterpretationContext {
  const zh = locale !== 'en';
  const p = r.plate;
  const pn = (x: Palace) => PALACE_NAME[x][locale];
  const t = r.time;
  const pad = (n: number) => String(n).padStart(2, '0');
  const dunWord = zh ? (r.dun === 'yang' ? '陽遁' : '陰遁') : r.dun === 'yang' ? 'Yang' : 'Yin';
  const juWord = zh ? `${dunWord}${'一二三四五六七八九'[r.ju - 1]}局` : `${dunWord} Dun, chart ${r.ju}`;

  const facts: { label: string; value: string }[] = [
    {
      label: 'time',
      value: `${t.year}-${pad(t.month)}-${pad(t.day)} ${pad(t.hour)}:${pad(t.minute)} (UTC+8)`,
    },
    {
      label: 'pillars',
      value: `${r.pillars.year} ${r.pillars.month} ${r.pillars.day} ${r.pillars.hour}`,
    },
    {
      label: 'jieqi',
      value: zh
        ? `${r.jieqi.name}${YUAN[r.yuan]['zh-TW']}(符頭${r.futou})`
        : `${jieqiName(r.jieqi.name, 'en')}, ${YUAN[r.yuan].en} (head day ${r.futou})`,
    },
    { label: 'ju', value: juWord },
    { label: 'xunShou', value: zh ? `${p.xunShou}旬,遁${p.xunYi}` : `${p.xunShou} decade, hidden in ${p.xunYi}` },
    {
      label: 'zhiFu',
      value: zh
        ? `值符${p.zhiFu.star}落${pn(p.zhiFu.palace)}`
        : `Chief star ${starName(p.zhiFu.star, 'en')} in ${pn(p.zhiFu.palace)}`,
    },
    {
      label: 'zhiShi',
      value: zh
        ? `值使${p.zhiShi.door}落${pn(p.zhiShi.palace)}`
        : `Chief door ${doorName(p.zhiShi.door, 'en')} in ${pn(p.zhiShi.palace)}`,
    },
    {
      label: 'kong',
      value: zh
        ? `旬空${p.kongZhi},在${p.kongPalaces.map(pn).join('、')}`
        : `Void branches ${p.kongZhi} in ${p.kongPalaces.map(pn).join(', ')}`,
    },
    { label: 'ma', value: zh ? `馬星${p.ma.zhi}在${pn(p.ma.palace)}` : `Horse star ${p.ma.zhi} in ${pn(p.ma.palace)}` },
    { label: 'topic', value: TOPIC[r.topic][locale] },
  ];
  if (r.yongShen) {
    facts.push({
      label: 'yongShen',
      value: zh
        ? `用神${r.yongShen.name}落${pn(r.yongShen.palace)}`
        : `Focus element ${shenName(r.yongShen.name, 'en')} in ${pn(r.yongShen.palace)}`,
    });
  }

  for (const c of p.palaces) {
    const earth = c.earthStem + (c.earthStemJi ?? '');
    if (c.palace === 5) {
      facts.push({
        label: 'palace_5',
        value: zh ? `${pn(5)}:地盤${earth}(寄坤二)` : `${pn(5)}: earth ${earth} (lodged in Kun 2)`,
      });
      continue;
    }
    const heaven = (c.heavenStem ?? '') + (c.heavenStemJi ?? '');
    const marks = [c.kong ? (zh ? '空亡' : 'void') : '', c.ma ? (zh ? '馬星' : 'horse') : ''].filter(Boolean);
    const star = c.star ? starName(c.star, locale) + (c.starJi ? (zh ? '(禽寄)' : ' (+Tian Qin)') : '') : '';
    facts.push({
      label: `palace_${c.palace}`,
      value: zh
        ? `${pn(c.palace)}:天盤${heaven} 地盤${earth} ${c.door} ${star} ${c.deity}${marks.length ? ` 〔${marks.join('、')}〕` : ''}`
        : `${pn(c.palace)}: heaven ${heaven} · earth ${earth} · ${doorName(c.door!, 'en')} · ${star} · ${deityName(c.deity!, 'en')}${marks.length ? ` [${marks.join(', ')}]` : ''}`,
    });
  }

  const headline = zh
    ? `${juWord} · ${r.jieqi.name}${YUAN[r.yuan]['zh-TW']} · 值符${p.zhiFu.star} 值使${p.zhiShi.door}`
    : `${juWord} · ${jieqiName(r.jieqi.name, 'en')} · Chief ${starName(p.zhiFu.star, 'en')} / ${doorName(p.zhiShi.door, 'en')}`;

  return { systemId: 'qimen', locale, headline, facts };
}

export const qimenSystem: DivinationSystem<QimenInput, QimenData> = {
  meta: { id: 'qimen', kind: 'chart', requiresApiKey: false },
  async compute(input, locale) {
    const data = computeQimenReading(input);
    return { data, context: toContext(data, locale) };
  },
};
