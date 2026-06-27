import type { IFunctionalAstrolabe } from 'iztro/lib/astro/FunctionalAstrolabe';

/**
 * 主星亮度吉凶指數 (頂規)。
 *
 * - 亮度指數:命宮主星廟旺等第(廟/旺/得/利/平/不/陷)→ 分數平均。
 * - 吉凶指數:命宮三方四正 六吉星 + 三吉化 + 祿存(吉) vs 六煞星 + 化忌(凶)→
 *   吉/(吉+凶)×100%。競品招牌指標,確定性可驗。
 */

const BRIGHTNESS_SCORE: Record<string, number> = {
  廟: 100, 旺: 85, 得: 75, 利: 65, 平: 50, 不: 40, 陷: 25,
};

const SIX_LUCKY = ['文昌', '文曲', '左輔', '右弼', '天魁', '天鉞'] as const;
const SIX_UNLUCKY = ['擎羊', '陀羅', '火星', '鈴星', '地空', '地劫'] as const;

export interface StarBrightness {
  name: string;
  brightness: string;
  score: number;
}

export interface FortuneSignal {
  /** 星名或四化(如「文昌」「化祿」) */
  label: string;
  /** 同宮 | 會照(三方四正) */
  position: '同宮' | '會照';
}

export interface ZiweiBrightness {
  soulStars: StarBrightness[];
  /** 命宮主星廟旺平均(0–100);無主星時為 null */
  brightnessIndex: number | null;
  luckySignals: FortuneSignal[];
  unluckySignals: FortuneSignal[];
  /** 吉/(吉+凶)×100,四捨五入;無吉凶時 null */
  fortuneIndex: number | null;
}

export function analyzeBrightness(astro: IFunctionalAstrolabe): ZiweiBrightness {
  const soul = astro.palace('命宮');
  const sur = astro.surroundedPalaces('命宮');

  const soulStars: StarBrightness[] = (soul?.majorStars ?? []).map((s) => {
    const b = String(s.brightness ?? '');
    return { name: String(s.name), brightness: b, score: BRIGHTNESS_SCORE[b] ?? 50 };
  });
  const brightnessIndex =
    soulStars.length > 0
      ? Math.round(soulStars.reduce((sum, s) => sum + s.score, 0) / soulStars.length)
      : null;

  const luckySignals: FortuneSignal[] = [];
  const unluckySignals: FortuneSignal[] = [];

  // 六吉 / 六煞:分「同宮(命宮)」與「會照(三方四正)」
  for (const star of SIX_LUCKY) {
    if (soul?.has([star])) luckySignals.push({ label: star, position: '同宮' });
    else if (sur.have([star])) luckySignals.push({ label: star, position: '會照' });
  }
  for (const star of SIX_UNLUCKY) {
    if (soul?.has([star])) unluckySignals.push({ label: star, position: '同宮' });
    else if (sur.have([star])) unluckySignals.push({ label: star, position: '會照' });
  }
  // 祿存(吉)
  if (soul?.has(['祿存'])) luckySignals.push({ label: '祿存', position: '同宮' });
  else if (sur.have(['祿存'])) luckySignals.push({ label: '祿存', position: '會照' });

  // 三吉化(祿權科)/ 化忌
  const mutagenLabel: Record<string, string> = { 祿: '化祿', 權: '化權', 科: '化科', 忌: '化忌' };
  for (const m of ['祿', '權', '科'] as const) {
    if (soul?.hasMutagen(m)) luckySignals.push({ label: mutagenLabel[m], position: '同宮' });
    else if (sur.haveMutagen(m)) luckySignals.push({ label: mutagenLabel[m], position: '會照' });
  }
  if (soul?.hasMutagen('忌')) unluckySignals.push({ label: '化忌', position: '同宮' });
  else if (sur.haveMutagen('忌')) unluckySignals.push({ label: '化忌', position: '會照' });

  const total = luckySignals.length + unluckySignals.length;
  const fortuneIndex =
    total > 0 ? Math.round((luckySignals.length / total) * 100) : null;

  return { soulStars, brightnessIndex, luckySignals, unluckySignals, fortuneIndex };
}
