import { degInSign, signName } from '@/lib/astrologyView';
import type { Locale } from '@/lib/i18n/config';
import type { Ymd } from '@/lib/today';
import {
  GRAHA_NAMES,
  dashaAt,
  jdToYmd,
  karanaName,
  nakshatraName,
  tithiName,
  varaName,
  yogaName,
  ymdString,
  ymdToJd,
  type GrahaKey,
  type NakshatraPos,
  type VedicChart,
} from '@/lib/vedic';
import type { InterpretationContext } from '../types';

/**
 * 吠陀本命盤 → AI context(獨立於西洋本命 context,自己的解讀按鈕;上限 60 條,實際約 30)。
 * 盤由 /api/vedic 在伺服器端算(XALEN wasm);本檔只排版,client 可用。
 */

export const grahaName = (k: GrahaKey, locale: Locale): string => GRAHA_NAMES[k][locale];
export const rashiName = (sign: number, locale: Locale): string =>
  locale === 'zh-TW' ? `${signName(sign, locale)}座` : signName(sign, locale);

export function nakshatraLine(n: NakshatraPos, locale: Locale): string {
  const name = nakshatraName(n.index, locale);
  const lord = grahaName(n.lord, locale);
  return locale === 'zh-TW' ? `${name}第${n.pada}足,宿主${lord}` : `${name} pada ${n.pada}, ruled by ${lord}`;
}

export function dashaDate(jd: number, chart: VedicChart): string {
  return ymdString(jdToYmd(jd, chart.tzOffsetHours));
}

/** 今天(使用者所在地日期)所在的大運與小運 */
export function currentDasha(chart: VedicChart, today: Ymd) {
  return dashaAt(chart.dasha.mahadashas, ymdToJd(today, chart.tzOffsetHours));
}

export function vedicContext(chart: VedicChart, locale: Locale, today: Ymd): InterpretationContext {
  const zh = locale === 'zh-TW';
  const facts: { label: string; value: string }[] = [];
  const push = (label: string, value: string) => facts.push({ label, value });

  push(
    'zodiac',
    zh
      ? `恆星黃道,Lahiri 歲差 ${chart.ayanamsa.toFixed(2)}°;宮位用整宮制(上升所在星座為第一宮)`
      : `Sidereal zodiac, Lahiri ayanamsa ${chart.ayanamsa.toFixed(2)}°; whole-sign houses (the rising sign is house 1)`,
  );
  const asc = chart.ascendant;
  push(
    'lagna',
    `${rashiName(asc.sign, locale)} ${degInSign(asc.longitude)}°, ${nakshatraLine(asc.nakshatra, locale)}`,
  );
  for (const g of chart.grahas) {
    const retro = g.retrograde ? (zh ? ',逆行' : ', retrograde') : '';
    push(
      `graha.${g.key}`,
      zh
        ? `${rashiName(g.sign, locale)} ${degInSign(g.longitude)}°,第${g.house}宮,${nakshatraLine(g.nakshatra, locale)}${retro}`
        : `${rashiName(g.sign, locale)} ${degInSign(g.longitude)}°, house ${g.house}, ${nakshatraLine(g.nakshatra, locale)}${retro}`,
    );
  }
  push(
    'navamsaD9',
    [
      `${zh ? '上升' : 'Lagna'} ${rashiName(asc.navamsa, locale)}`,
      ...chart.grahas.map((g) => `${grahaName(g.key, locale)} ${rashiName(g.navamsa, locale)}`),
    ].join(zh ? ';' : '; '),
  );

  const p = chart.panchang;
  push('panchang.tithi', tithiName(p.tithi, locale));
  push('panchang.vara', varaName(p.vara, locale));
  push('panchang.nakshatra', nakshatraName(p.nakshatra, locale));
  push('panchang.yoga', yogaName(p.yoga, locale));
  push('panchang.karana', karanaName(p.karana, locale));

  push(
    'dasha.rule',
    zh
      ? `Vimśottarī 大運,由出生時月亮所在月宿的宿主起運;一年取恆星年 ${chart.dasha.yearDays} 日`
      : `Vimshottari dasha, starting from the lord of the Moon's birth nakshatra; one year = sidereal year of ${chart.dasha.yearDays} days`,
  );
  chart.dasha.mahadashas.forEach((m, i) =>
    push(`dasha.maha${i + 1}`, `${grahaName(m.lord, locale)} ${dashaDate(m.startJd, chart)} → ${dashaDate(m.endJd, chart)}`),
  );
  const now = currentDasha(chart, today);
  if (now) {
    push(
      'dasha.current',
      zh
        ? `今天(${ymdString(today)})在${grahaName(now.maha.lord, locale)}大運、${grahaName(now.antar.lord, locale)}小運(${dashaDate(now.antar.startJd, chart)} → ${dashaDate(now.antar.endJd, chart)})`
        : `Today (${ymdString(today)}): ${grahaName(now.maha.lord, locale)} mahadasha, ${grahaName(now.antar.lord, locale)} antardasha (${dashaDate(now.antar.startJd, chart)} → ${dashaDate(now.antar.endJd, chart)})`,
    );
  }

  const moon = chart.grahas.find((g) => g.key === 'moon')!;
  return {
    systemId: 'vedic',
    locale,
    headline: `${rashiName(asc.sign, locale)} · ${nakshatraName(moon.nakshatra.index, locale)}`,
    facts,
  };
}
