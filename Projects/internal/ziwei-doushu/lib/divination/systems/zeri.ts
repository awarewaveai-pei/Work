import { computeZeri, MAX_RANGE_DAYS, ZERI_ACTIVITIES, type ZeriActivity, type ZeriDay, type ZeriRequest, type ZeriResult } from '@/lib/zeri';
import { branchIndex } from '@/lib/ganzhi';
import type { Locale } from '@/lib/i18n/config';
import type { DivinationSystem, InterpretationContext } from '../types';
import { DATE, toYmd } from '../fields';
import { YEAR_MAX, YEAR_MIN, type InputSpec } from '../input';

/** 擇日:程式依 lib/zeri.ts 規則逐日判定,AI 只依吉日清單敘事。 */

type Words = Record<Locale, string>;

export const ACTIVITY: Record<ZeriActivity, Words> = {
  ruZhai: { 'zh-TW': '入宅', en: 'Moving into a new home' },
  banJia: { 'zh-TW': '搬家', en: 'Moving house' },
  kaiShi: { 'zh-TW': '開市', en: 'Opening a business' },
  dongTu: { 'zh-TW': '動土', en: 'Breaking ground' },
  jiaQu: { 'zh-TW': '嫁娶', en: 'Wedding' },
  chuXing: { 'zh-TW': '出行', en: 'Setting out on a trip' },
  qianYue: { 'zh-TW': '簽約', en: 'Signing a contract' },
  anChuang: { 'zh-TW': '安床', en: 'Placing a new bed' },
};

const ZHI_XING_EN: Record<string, string> = {
  建: 'Establish', 除: 'Remove', 滿: 'Full', 平: 'Balance', 定: 'Stable', 執: 'Hold',
  破: 'Break', 危: 'Danger', 成: 'Success', 收: 'Receive', 開: 'Open', 閉: 'Close',
};
const TIAN_SHEN_EN: Record<string, string> = {
  青龍: 'Azure Dragon', 明堂: 'Bright Hall', 天刑: 'Heavenly Punishment', 朱雀: 'Vermilion Bird',
  金匱: 'Golden Coffer', 天德: 'Heavenly Virtue', 白虎: 'White Tiger', 玉堂: 'Jade Hall',
  天牢: 'Heavenly Prison', 玄武: 'Black Tortoise', 司命: 'Life Keeper', 勾陳: 'Hooked Array',
};
const ANIMAL_EN = ['Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake', 'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig'];

export function zhiXingName(z: string, locale: Locale): string {
  return locale === 'en' ? (ZHI_XING_EN[z] ?? z) : z;
}
export function tianShenName(t: ZeriDay['tianShen'], locale: Locale): string {
  if (locale === 'en') return `${TIAN_SHEN_EN[t.name] ?? t.name} (${t.huangDao ? 'auspicious' : 'inauspicious'} day)`;
  return `${t.name}${t.huangDao ? '黃道' : '黑道'}`;
}
export function animalName(zhi: string, shengXiao: string, locale: Locale): string {
  return locale === 'en' ? ANIMAL_EN[branchIndex(zhi)] : shengXiao;
}

/** facts 只列前 10 個吉日 */
export const MAX_GOOD_FACTS = 10;

function dayFact(d: ZeriDay, locale: Locale): string {
  const zh = locale !== 'en';
  const chong = animalName(d.chong.zhi, d.chong.shengXiao, locale);
  return zh
    ? `${d.date}(農曆${d.lunarDate})${d.ganZhi}日,${d.zhiXing}日,${tianShenName(d.tianShen, locale)},沖${chong}`
    : `${d.date} (lunar ${d.lunarDate}) ${d.ganZhi} day, officer ${zhiXingName(d.zhiXing, locale)}, ${tianShenName(d.tianShen, locale)}, clashes with ${chong}`;
}

export function toContext(r: ZeriResult, locale: Locale): InterpretationContext {
  const zh = locale !== 'en';
  const act = ACTIVITY[r.activity][locale];
  const good = r.days.filter((d) => d.verdict === 'good');
  const avoid = r.days.filter((d) => d.verdict === 'avoid');
  const ok = r.days.filter((d) => d.verdict === 'ok');
  const n = (xs: ZeriDay[], reason: ZeriDay['reasons'][number]) => xs.filter((d) => d.reasons.includes(reason)).length;

  const facts: { label: string; value: string }[] = [
    { label: 'activity', value: act },
    { label: 'range', value: `${r.from} ~ ${r.to}(${r.days.length}${zh ? ' 天' : ' days'})` },
  ];
  if (r.resident) {
    const a = animalName(r.resident.zhi, r.resident.shengXiao, locale);
    facts.push({ label: 'resident', value: zh ? `居住者生肖${a}(${r.resident.zhi})` : `Resident's zodiac: ${a} (${r.resident.zhi})` });
  }
  facts.push({
    label: 'rule',
    value: zh
      ? '吉日=通書宜此事且黃道日,且不忌此事、不沖居住者生肖'
      : 'Good day = the almanac lists this activity as favourable on an auspicious (yellow-path) day, without listing it as unfavourable or clashing with the resident\'s zodiac',
  });
  facts.push({
    label: 'counts',
    value: zh
      ? `吉日 ${good.length}、可用 ${ok.length}、宜避開 ${avoid.length}`
      : `${good.length} good, ${ok.length} usable, ${avoid.length} best avoided`,
  });
  facts.push({
    label: 'excluded',
    value: zh
      ? `宜避開原因:通書忌此事 ${n(avoid, 'jiHit')} 天、沖居住者生肖 ${n(avoid, 'chongResident')} 天;可用但非吉日:宜未列此事 ${n(ok, 'yiMissing')} 天、黑道日 ${n(ok, 'heiDao')} 天`
      : `Best avoided: almanac lists the activity as unfavourable on ${n(avoid, 'jiHit')} days, clash with the resident's zodiac on ${n(avoid, 'chongResident')} days. Usable but not good: activity not listed as favourable on ${n(ok, 'yiMissing')} days, inauspicious (black-path) day on ${n(ok, 'heiDao')} days`,
  });
  good.slice(0, MAX_GOOD_FACTS).forEach((d, i) => facts.push({ label: `good_${i + 1}`, value: dayFact(d, locale) }));

  const headline = zh
    ? `擇日 · ${act} · ${r.from} ~ ${r.to} · 吉日 ${good.length} 天`
    : `Date selection · ${act} · ${r.from} to ${r.to} · ${good.length} good days`;
  return { systemId: 'zeri', locale, headline, facts };
}

const dayNumber = (d: unknown) => {
  const x = d as Record<string, number>;
  return Date.UTC(x.year, x.month - 1, x.day) / 86_400_000;
};

const ZERI_INPUT: InputSpec<ZeriRequest> = {
  fields: {
    activity: { type: 'enum', values: ZERI_ACTIVITIES, doc: { 'zh-TW': '事項', en: 'Event' } },
    from: DATE('起始日', 'First day'),
    to: DATE(`結束日(區間最長 ${MAX_RANGE_DAYS} 天)`, `Last day (at most ${MAX_RANGE_DAYS} days in all)`),
    birthYear: {
      type: 'integer',
      min: YEAR_MIN,
      max: YEAR_MAX,
      required: false,
      doc: { 'zh-TW': '選填:居住者出生的立春年(避開沖本命的日子)', en: 'Optional: occupant birth year by Lichun (skips days that clash with it)' },
    },
  },
  check: (v) => {
    const n = dayNumber(v.to) - dayNumber(v.from) + 1;
    if (n < 1) return ['to: before from'];
    return n > MAX_RANGE_DAYS ? [`to: at most ${MAX_RANGE_DAYS} days in all`] : [];
  },
  build: (v) => ({
    activity: v.activity as ZeriActivity,
    from: toYmd(v.from),
    to: toYmd(v.to),
    birthYear: v.birthYear as number | undefined,
  }),
  example: { activity: 'ruZhai', from: { year: 2026, month: 12, day: 1 }, to: { year: 2026, month: 12, day: 31 }, birthYear: 1985 },
};

export const zeriSystem: DivinationSystem<ZeriRequest, ZeriResult> = {
  meta: { id: 'zeri', kind: 'chart', requiresApiKey: false },
  input: ZERI_INPUT,
  async compute(input, locale) {
    const data = computeZeri(input);
    return { data, context: toContext(data, locale) };
  },
};
