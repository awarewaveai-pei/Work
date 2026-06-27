import {
  computeChart,
  formatMutagen,
  type ChartRequest,
  type ChartResult,
  type ZiweiHoroscope,
} from '@/lib/ziwei';
import type { ZiweiAnalysis } from '@/lib/ziwei/analyze';
import type { Locale } from '@/lib/i18n/config';
import type { DivinationSystem, InterpretationContext } from '../types';

/**
 * 紫微斗數系統 adapter — 把既有 computeChart 接上統一 DivinationSystem 合約。
 * 這是 F3 的「垂直證明」:現有引擎不重寫,只用 adapter 接縫。
 *
 * Phase C 強化:facts 帶廟旺 + 生年四化 + (可選)大限/流年過運,讓 AI 解讀綁
 *   具體廟陷與四化飛星,非只列星名。
 */
export function toContext(
  result: ChartResult,
  locale: Locale,
  horoscope?: ZiweiHoroscope,
  analysis?: ZiweiAnalysis,
): InterpretationContext {
  const a = result.astrolabe;
  const facts: { label: string; value: string }[] = [
    { label: 'soul', value: String(a.soul) },
    { label: 'body', value: String(a.body) },
    { label: 'fiveElements', value: String(a.fiveElementsClass) },
    { label: 'zodiac', value: String(a.zodiac) },
    { label: 'sign', value: String(a.sign) },
    { label: 'fourPillars', value: String(a.chineseDate) },
    { label: 'solarDate', value: String(a.solarDate) },
    { label: 'lunarDate', value: String(a.lunarDate) },
  ];

  // 生年四化(命盤上帶四化的主星)→ 紫微解讀的核心線索
  const birthMutagen = a.palaces.flatMap((p) =>
    p.majorStars
      .filter((s) => s.mutagen)
      .map((s) => `${s.name}化${s.mutagen}(${p.name})`),
  );
  if (birthMutagen.length) {
    facts.push({ label: 'birthMutagen', value: birthMutagen.join('、') });
  }

  // 各宮主星帶廟旺 + 四化 → 讓 AI 綁具體廟陷與四化(非空泛巴納姆)
  for (const p of a.palaces) {
    const stars = p.majorStars
      .map(
        (s) =>
          `${s.name}${s.brightness ? `(${s.brightness})` : ''}${
            s.mutagen ? `化${s.mutagen}` : ''
          }`,
      )
      .join('/');
    facts.push({ label: `palace:${p.name}`, value: stars || '—' });
  }

  // 過運(若呼叫端提供目標日期):大限 + 流年四化飛星
  if (horoscope) {
    facts.push({
      label: 'decadal',
      value: `${horoscope.decadal.heavenlyStem}干 ${formatMutagen(horoscope.decadal.mutagenStars)}`,
    });
    facts.push({
      label: 'yearly',
      value: `${horoscope.yearly.heavenlyStem}年 ${formatMutagen(horoscope.yearly.mutagenStars)}`,
    });
  }

  // 頂規確定性分析(格局/亮度吉凶/飛宮四化)→ 讓 AI 簡批綁真實命格,非空泛
  if (analysis) {
    // 限 12 個格局 fact,確保總 fact 數不逾 route MAX_FACTS=60(critic 2026-06-27)
    for (const p of analysis.patterns.slice(0, 12)) {
      facts.push({ label: `格局:${p.name}`, value: p.desc.slice(0, 280) });
    }
    const b = analysis.brightness;
    if (b.brightnessIndex !== null)
      facts.push({ label: '主星亮度指數', value: `${b.brightnessIndex}/100` });
    if (b.fortuneIndex !== null)
      facts.push({ label: '三方四正吉凶指數', value: `${b.fortuneIndex}%` });
    if (b.luckySignals.length)
      facts.push({
        label: '吉星',
        value: b.luckySignals.map((s) => `${s.label}${s.position}`).join('、').slice(0, 280),
      });
    if (b.unluckySignals.length)
      facts.push({
        label: '煞星',
        value: b.unluckySignals.map((s) => `${s.label}${s.position}`).join('、').slice(0, 280),
      });
    // 飛宮四化:依領域歸併成數條(控制 fact 數 + 長度)
    const byDomain = new Map<string, string[]>();
    for (const f of analysis.flying) {
      const arr = byDomain.get(f.domain) ?? [];
      arr.push(f.flow);
      byDomain.set(f.domain, arr);
    }
    for (const [domain, flows] of byDomain) {
      facts.push({ label: `飛化:${domain}`, value: flows.join('、').slice(0, 280) });
    }
  }

  const topPattern = analysis?.patterns[0]?.name;
  return {
    systemId: 'ziwei',
    locale,
    headline: `${String(a.soul)} · ${String(a.fiveElementsClass)}${topPattern ? ` · ${topPattern}` : ''}`,
    facts,
  };
}

export const ziweiSystem: DivinationSystem<ChartRequest, ChartResult> = {
  meta: { id: 'ziwei', kind: 'chart', requiresApiKey: false },
  async compute(input, locale) {
    const data = computeChart({ ...input, locale });
    return { data, context: toContext(data, locale) };
  },
};
