import type { IFunctionalAstrolabe } from 'iztro/lib/astro/FunctionalAstrolabe';
import type { PalaceName } from 'iztro/lib/i18n';
import { STAR_PROFILES, PALACE_ORDER, type PalaceKey } from './stars';

/**
 * 十二宮逐星解讀 (頂規)。
 *
 * 對每一宮:取宮內主星,查知識庫「該主星坐該宮」斷語,再依廟旺(brightness)與
 *   生年四化(mutagen)修飾語氣;無主星之宮借對宮主星論之(借星安宮,正統作法)。
 * 純確定性組裝,零幻覺。輸出供 UI 渲染 + 餵 AI 命主簡批。
 *
 * ⚠️ 呼叫端必須傳 **zh-TW** 排好的 astrolabe:star.name 與 earthlyBranch 為
 *   locale-dependent,en 盤的星名是英文 → STAR_PROFILES 全 miss、地支變拼音。
 *   (palace name 查詢經 iztro kot() 正規化,locale-safe;star.name/branch 不是。)
 */

export interface PalaceStar {
  name: string;
  brightness: string;
  mutagen: string; // '' | 祿 | 權 | 科 | 忌
}

export interface PalaceReading {
  /** 宮名(命宮…父母) */
  palace: PalaceKey;
  /** 地支(子丑寅…) */
  branch: string;
  stars: PalaceStar[];
  /** 無主星、借對宮論 */
  borrowed: boolean;
  /** 借星來源(對宮主星名) */
  borrowedFrom: string[];
  /** 逐星斷語(已含廟旺/四化修飾) */
  readings: string[];
}

const BRIGHT_GOOD = ['廟', '旺'];
const BRIGHT_OK = ['得', '利'];
const BRIGHT_WEAK = ['不', '陷'];

/** 廟旺修飾語;無資料回空字串。 */
function brightnessNote(b: string): string {
  if (BRIGHT_GOOD.includes(b)) return '（廟旺得地，吉象彰顯、發揮淋漓）';
  if (BRIGHT_OK.includes(b)) return '（入廟得地，發揮尚佳）';
  if (b === '平') return '（平和之地，中庸而行）';
  if (BRIGHT_WEAK.includes(b)) return '（落陷失輝，宜防其短、善加調節）';
  return '';
}

const MUTAGEN_NOTE: Record<string, string> = {
  祿: '【化祿】本宮事務更添順遂與福分。',
  權: '【化權】於本宮掌控力與企圖心增強。',
  科: '【化科】本宮帶名聲、貴氣與化解之力。',
  忌: '【化忌】本宮為一生較費心、易生波折之處，需用心經營。',
};

/** 組單顆主星在某宮的斷語(含廟旺/四化修飾)。 */
function composeStar(star: PalaceStar, palace: PalaceKey, borrowed: boolean): string {
  const profile = STAR_PROFILES[star.name];
  const base = profile?.palaces[palace] ?? '';
  // 借星時不顯示廟旺:brightness 是「該星在其實際所在宮」的等第,放進借入宮會是
  //   錯位資訊(critic 2026-06-27)。mutagen 為星本身屬性(生年四化隨星飛),保留。
  const head = `${star.name}${
    !borrowed && star.brightness ? `（${star.brightness}）` : ''
  }${star.mutagen ? `化${star.mutagen}` : ''}`;
  const bnote = borrowed ? '' : brightnessNote(star.brightness); // 借星不論本宮廟旺
  const mnote = star.mutagen ? MUTAGEN_NOTE[star.mutagen] ?? '' : '';
  const prefix = borrowed ? '借' : '';
  return `${prefix}${head}：${base}${bnote}${mnote}`.trim();
}

function toPalaceStars(
  stars: { name: unknown; brightness?: unknown; mutagen?: unknown }[],
): PalaceStar[] {
  return stars.map((s) => ({
    name: String(s.name),
    brightness: String(s.brightness ?? ''),
    mutagen: String(s.mutagen ?? ''),
  }));
}

export function analyzePalaceReadings(astro: IFunctionalAstrolabe): PalaceReading[] {
  const out: PalaceReading[] = [];

  for (const palace of PALACE_ORDER) {
    let p: ReturnType<typeof astro.palace> | undefined;
    try {
      p = astro.palace(palace as PalaceName);
    } catch {
      p = undefined;
    }
    if (!p) continue;

    const branch = String(p.earthlyBranch ?? '');
    const majors = toPalaceStars(p.majorStars ?? []);

    if (majors.length > 0) {
      out.push({
        palace,
        branch,
        stars: majors,
        borrowed: false,
        borrowedFrom: [],
        readings: majors
          .filter((s) => STAR_PROFILES[s.name])
          .map((s) => composeStar(s, palace, false)),
      });
      continue;
    }

    // 無主星 → 借對宮主星論之(借星安宮)
    let borrowedStars: PalaceStar[] = [];
    try {
      const opp = astro.surroundedPalaces(palace as PalaceName).opposite;
      borrowedStars = toPalaceStars(opp?.majorStars ?? []);
    } catch {
      borrowedStars = [];
    }
    out.push({
      palace,
      branch,
      stars: [],
      borrowed: true,
      borrowedFrom: borrowedStars.map((s) => s.name),
      readings: borrowedStars
        .filter((s) => STAR_PROFILES[s.name])
        .map((s) => composeStar(s, palace, true)),
    });
  }

  return out;
}
