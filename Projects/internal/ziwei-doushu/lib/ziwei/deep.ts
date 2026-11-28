import type { IFunctionalAstrolabe } from 'iztro/lib/astro/FunctionalAstrolabe';
import { Lunar } from 'lunar-javascript';
import { PALACE_ORDER, type PalaceKey } from './stars';
import { SIX_LUCKY, SIX_UNLUCKY } from './brightness';
import { hidden, mod12, opp, surround } from './patterns';

/**
 * 紫微深度計算(卡 Z1;ORACLE-WP-SPEC §8)— 純計算、不呼叫 AI,輸出是深度報告(Z2)唯一的事實來源。
 *
 * 不變量:
 *   - 每條 fact 只由本命盤 + 目標日期推導;沒有隨機、沒有 Date.now、沒有 locale 以外的外部狀態。
 *   - 同一 (astrolabe, targetDate) 輸出逐位元組相同(陣列順序固定:宮依 iztro 索引 0=寅,四化依祿權科忌)。
 *   - 呼叫端必須傳 zh-TW 排好的盤(星名、地支是 locale 相依;見 palaceReading.ts 同一警告),否則拋錯。
 * 安星、四化表、大限、流年、流月(斗君)全用 iztro 既有結果,本檔不重排盤,只做宮位關係與標記。
 */

export type ZiweiFactCategory =
  | 'surround' // 十二宮各自的三方四正會照
  | 'sanhe' // 地支三合局
  | 'liuhe' // 地支六合(暗合宮)
  | 'jia' // 相夾
  | 'decadal' // 目前大限命宮
  | 'decadal_mutagen' // 大限四化落點
  | 'decadal_timeline' // 一生各大限
  | 'yearly' // 流年命宮
  | 'yearly_overlay' // 流年十二宮疊本命
  | 'yearly_mutagen' // 流年四化引動
  | 'mutagen_stack' // 本命／大限／流年同一化疊在同宮
  | 'monthly'; // 流月

export type ZiweiFactScope = 'natal' | 'decadal' | 'yearly' | 'monthly';
/** favorable=有利、caution=留意、mixed=吉凶並見、neutral=只陳述 */
export type ZiweiFactTone = 'favorable' | 'caution' | 'mixed' | 'neutral';

export type ZiweiRuleId = keyof typeof ZIWEI_RULES;

export interface ZiweiFact {
  /** 穩定 id:同盤同日必同;由類別+宮名/四化/月份組成,不含流水號 */
  id: string;
  category: ZiweiFactCategory;
  scope: ZiweiFactScope;
  /** 涉及的本命宮(zh-TW 宮名) */
  palaces: PalaceKey[];
  /** 涉及的星(主星、輔星、四化星) */
  stars: string[];
  /** 依據規則(見 ZIWEI_RULES 的名稱與出處) */
  rule: ZiweiRuleId;
  tone: ZiweiFactTone;
  /** 鉤子挑選用權重 0–100(依類別分級,見 weightOf) */
  weight: number;
  /** 可作簡批結尾鉤子的素材(SPEC §8:四化引動、有標記的流月、化忌落點、祿忌疊) */
  hook: boolean;
  /** 一句可核對的陳述(只含 detail 與盤面已有的內容) */
  text: string;
  /** 結構化明細,值只有字串、數字、布林、null 與字串陣列 */
  detail: Record<string, string | number | boolean | null | string[]>;
}

export interface ZiweiDeepFacts {
  /** 目標國曆日期(流年、流月、大限依此日取) */
  targetDate: string;
  /** 目標日所在的農曆年(正月初一為界,同 iztro horoscopeDivide 預設 normal) */
  lunarYear: number;
  facts: ZiweiFact[];
}

/** 規則表:名稱 + 出處一行。四化表、大限、斗君都是 iztro 的實作(派別見 Z1 RISKS:iztro 預設表)。 */
export const ZIWEI_RULES = {
  SAN_FANG_SI_ZHENG: { name: '三方四正', source: '《紫微斗數全書》三方四正論法:本宮、對宮、三合二宮(三合派通行)' },
  SANHE: { name: '地支三合', source: '地支三合:申子辰、寅午戌、巳酉丑、亥卯未(通行地支關係)' },
  LIUHE: { name: '地支六合(暗合)', source: '地支六合:子丑、寅亥、卯戌、辰酉、巳申、午未;斗數稱暗合宮' },
  JIA_ZUO_YOU: { name: '左右夾', source: '《紫微斗數全書》左右夾命' },
  JIA_CHANG_QU: { name: '昌曲夾', source: '《紫微斗數全書》昌曲夾命' },
  JIA_KUI_YUE: { name: '魁鉞夾', source: '《紫微斗數全書》魁鉞夾命' },
  JIA_RI_YUE: { name: '日月夾', source: '《紫微斗數全書》日月夾命' },
  JIA_ZI_FU: { name: '紫府夾', source: '《紫微斗數全書》紫府夾命' },
  JIA_QUAN_LU: { name: '權祿夾', source: '《紫微斗數全書》權祿夾(生年化權、化祿分居兩鄰)' },
  JIA_YANG_TUO: { name: '羊陀夾', source: '《紫微斗數全書》羊陀夾;夾宮有化忌即羊陀夾忌' },
  JIA_HUO_LING: { name: '火鈴夾', source: '《紫微斗數全書》火鈴夾' },
  JIA_KONG_JIE: { name: '空劫夾', source: '《紫微斗數全書》空劫夾' },
  DECADAL: { name: '大限', source: '起大限訣:依五行局起,陽男陰女順行、陰男陽女逆行(iztro 實作)' },
  DECADAL_MUTAGEN: { name: '大限四化', source: '大限宮干依十干四化表(iztro 預設表)' },
  YEARLY: { name: '流年命宮', source: '流年命宮=流年地支所在宮,十二宮由此逆排(iztro 實作)' },
  YEARLY_MUTAGEN: { name: '流年四化', source: '流年天干依十干四化表(iztro 預設表)' },
  MUTAGEN_STACK: { name: '祿忌疊宮', source: '三合派疊宮論法:本命、大限、流年同一化落同宮(雙祿、雙忌、三忌)' },
  MONTHLY_MARK: { name: '流月與有利／留意標記', source: '流年斗君定正月、逐月順行(iztro);標記=流月化祿／化忌入流月命宮三方四正,門檻為本站約定(monthTone)' },
} as const;

type Mutagen = '祿' | '權' | '科' | '忌';
const MUTAGENS: readonly Mutagen[] = ['祿', '權', '科', '忌'];
const LUCKY = [...SIX_LUCKY, '祿存'] as const;
const DARK = ['陷', '不'];

type Astro = IFunctionalAstrolabe;
type Palace = Astro['palaces'][number];
type Detail = ZiweiFact['detail'];

/** 三合局:以 iztro 索引(0=寅)的起點分組 i、i+4、i+8。 */
const SANHE_GROUPS: { start: number; key: string; label: string }[] = [
  { start: 0, key: '寅午戌', label: '寅午戌火局' },
  { start: 1, key: '亥卯未', label: '亥卯未木局' },
  { start: 2, key: '申子辰', label: '申子辰水局' },
  { start: 3, key: '巳酉丑', label: '巳酉丑金局' },
];
/** 六合配對的起點(與 hidden(i)=9-i 成對),依子丑、寅亥、卯戌、辰酉、巳申、午未。 */
const LIUHE_STARTS = [10, 0, 1, 2, 3, 4];

const JIA_PAIRS: { rule: ZiweiRuleId; a: string; b: string; tone: ZiweiFactTone; key: string }[] = [
  { rule: 'JIA_ZUO_YOU', a: '左輔', b: '右弼', tone: 'favorable', key: '左右' },
  { rule: 'JIA_CHANG_QU', a: '文昌', b: '文曲', tone: 'favorable', key: '昌曲' },
  { rule: 'JIA_KUI_YUE', a: '天魁', b: '天鉞', tone: 'favorable', key: '魁鉞' },
  { rule: 'JIA_RI_YUE', a: '太陽', b: '太陰', tone: 'favorable', key: '日月' },
  { rule: 'JIA_ZI_FU', a: '紫微', b: '天府', tone: 'favorable', key: '紫府' },
  { rule: 'JIA_YANG_TUO', a: '擎羊', b: '陀羅', tone: 'caution', key: '羊陀' },
  { rule: 'JIA_HUO_LING', a: '火星', b: '鈴星', tone: 'caution', key: '火鈴' },
  { rule: 'JIA_KONG_JIE', a: '地空', b: '地劫', tone: 'caution', key: '空劫' },
];

// ---------- 盤面讀取 ----------

const pal = (a: Astro, i: number): Palace => a.palaces[mod12(i)];
const pname = (a: Astro, i: number) => String(pal(a, i).name) as PalaceKey;
const pbranch = (a: Astro, i: number) => String(pal(a, i).earthlyBranch);
/** 宮名加「宮」(命宮本身已帶)。 */
const pn = (name: string) => (name.endsWith('宮') ? name : `${name}宮`);
const starsOf = (a: Astro, i: number) => [...pal(a, i).majorStars, ...pal(a, i).minorStars];
const majorNames = (a: Astro, i: number) => pal(a, i).majorStars.map((s) => String(s.name));
const hasStar = (a: Astro, i: number, name: string) => starsOf(a, i).some((s) => s.name === name);
/** 主星「名(亮度)化X」;無主星回「無主星」。 */
const majorsText = (a: Astro, i: number) => {
  const m = pal(a, i).majorStars.map(
    (s) => `${s.name}${s.brightness ? `（${s.brightness}）` : ''}${s.mutagen ? `化${s.mutagen}` : ''}`,
  );
  return m.length ? m.join('、') : '無主星';
};
/** 本宮的生年四化:「星化X」 */
const natalMutagensAt = (a: Astro, i: number) =>
  starsOf(a, i)
    .filter((s) => s.mutagen)
    .map((s) => `${s.name}化${s.mutagen}`);

/** 某星所在宮索引;四化星(十四主星+昌曲輔弼)必在盤上,找不到是排盤或語系錯,直接拋錯。 */
function locate(a: Astro, star: string): number {
  const i = a.palaces.findIndex((p) => [...p.majorStars, ...p.minorStars].some((s) => s.name === star));
  if (i < 0) throw new Error(`deep: 盤上找不到星 ${star}(盤須為 zh-TW)`);
  return i;
}

/** 本命某化所在宮索引;無則 -1。 */
function natalMutagenIndex(a: Astro, m: Mutagen): number {
  return a.palaces.findIndex((p) => [...p.majorStars, ...p.minorStars].some((s) => s.mutagen === m));
}

// ---------- 權重(鉤子挑選用;只依類別與語氣分級,不看文字) ----------

const BASE_WEIGHT: Record<ZiweiFactCategory, number> = {
  mutagen_stack: 80,
  yearly: 60,
  decadal: 60,
  yearly_mutagen: 60,
  decadal_mutagen: 55,
  jia: 45,
  surround: 35,
  monthly: 30,
  yearly_overlay: 20,
  sanhe: 15,
  liuhe: 15,
  decadal_timeline: 10,
};

function weightOf(category: ZiweiFactCategory, tone: ZiweiFactTone, extra = 0): number {
  const toneBonus = tone === 'caution' || tone === 'favorable' ? 15 : tone === 'mixed' ? 8 : 0;
  return Math.min(100, BASE_WEIGHT[category] + toneBonus + extra);
}

// ---------- 本命:三方四正、三合、六合、相夾 ----------

/** 十二宮三方四正:本宮、對宮、三合二宮的主星、吉星、煞星、生年四化。 */
function surroundFacts(a: Astro): ZiweiFact[] {
  const out: ZiweiFact[] = [];
  const jiIdx = natalMutagenIndex(a, '忌');
  for (let i = 0; i < 12; i++) {
    const [self, o, t1, t2] = surround(i);
    const positions: [string, number][] = [
      ['本宮', self],
      ['對宮', o],
      ['三合', t1],
      ['三合', t2],
    ];
    const lucky: string[] = [];
    const sha: string[] = [];
    const muts: string[] = [];
    // 指數用的去重集合:同一顆吉／煞星、同一種化只算一次
    const luckySet = new Set<string>();
    const shaSet = new Set<string>();
    for (const [pos, idx] of positions) {
      for (const s of LUCKY) if (hasStar(a, idx, s)) (lucky.push(`${s}（${pos}${pname(a, idx)}）`), luckySet.add(s));
      for (const s of SIX_UNLUCKY) if (hasStar(a, idx, s)) (sha.push(`${s}（${pos}${pname(a, idx)}）`), shaSet.add(s));
      for (const st of starsOf(a, idx)) {
        if (!st.mutagen) continue;
        muts.push(`${st.name}化${st.mutagen}（${pos}${pname(a, idx)}）`);
        (st.mutagen === '忌' ? shaSet : luckySet).add(`化${st.mutagen}`);
      }
    }
    const name = pname(a, i);
    // 同 brightness.ts「三方四正吉凶指數」:吉/(吉+凶)×100 四捨五入;命宮兩處數字必相同(deep.test 對照)。
    //   不呼叫 iztro 的 surroundedPalaces().have():每宮約 26ms,十二宮會拖慢整份報告。
    const total = luckySet.size + shaSet.size;
    const fortuneIndex = total > 0 ? Math.round((luckySet.size / total) * 100) : null;
    // 門檻為本站約定(Z1 RISKS):≥60 有利、≤40 留意、其間吉凶並見;無吉無煞=只陳述
    const tone: ZiweiFactTone =
      fortuneIndex === null ? 'neutral' : fortuneIndex >= 60 ? 'favorable' : fortuneIndex <= 40 ? 'caution' : 'mixed';
    const hasJi = jiIdx === i;
    const involved = [self, o, t1, t2];
    out.push({
      id: `surround:${name}`,
      category: 'surround',
      scope: 'natal',
      palaces: involved.map((x) => pname(a, x)),
      stars: [...new Set(involved.flatMap((x) => majorNames(a, x)))],
      rule: 'SAN_FANG_SI_ZHENG',
      tone,
      weight: weightOf('surround', tone, (name === '命宮' ? 15 : 0) + (hasJi ? 10 : 0)),
      // 生年化忌落點是 SPEC §8 點名的鉤子素材
      hook: hasJi,
      text:
        `${pn(name)}（${pbranch(a, i)}）三方四正：本宮${majorsText(a, i)}；對宮${pn(pname(a, o))}${majorsText(a, o)}；` +
        `三合${pn(pname(a, t1))}${majorsText(a, t1)}、${pn(pname(a, t2))}${majorsText(a, t2)}。` +
        `吉星${lucky.length ? lucky.join('、') : '無'}；煞星${sha.length ? sha.join('、') : '無'}；` +
        `生年四化${muts.length ? muts.join('、') : '無'}。`,
      detail: {
        branch: pbranch(a, i),
        opposite: pname(a, o),
        trines: [pname(a, t1), pname(a, t2)],
        lucky,
        sha,
        mutagens: muts,
        fortuneIndex,
        natalJiHere: hasJi,
      },
    });
  }
  return out;
}

/** 三合局四組:每組三宮的主星與生年四化。 */
function sanheFacts(a: Astro): ZiweiFact[] {
  return SANHE_GROUPS.map(({ start, key, label }): ZiweiFact => {
    const idx = [start, start + 4, start + 8].map(mod12);
    const muts = idx.flatMap((i) => natalMutagensAt(a, i).map((m) => `${m}（${pname(a, i)}）`));
    const parts = idx.map((i) => `${pn(pname(a, i))}（${pbranch(a, i)}）${majorsText(a, i)}`);
    return {
      id: `sanhe:${key}`,
      category: 'sanhe',
      scope: 'natal',
      palaces: idx.map((i) => pname(a, i)),
      stars: idx.flatMap((i) => majorNames(a, i)),
      rule: 'SANHE',
      tone: 'neutral',
      weight: weightOf('sanhe', 'neutral'),
      hook: false,
      text: `${label}三宮相會：${parts.join('；')}。生年四化${muts.length ? muts.join('、') : '無'}。`,
      detail: { branches: idx.map((i) => pbranch(a, i)), mutagens: muts },
    };
  });
}

/** 六合(暗合)六對:兩宮主星與生年四化。 */
function liuheFacts(a: Astro): ZiweiFact[] {
  return LIUHE_STARTS.map((i): ZiweiFact => {
    const pair = [i, hidden(i)];
    const key = pair.map((x) => pbranch(a, x)).join('');
    const muts = pair.flatMap((x) => natalMutagensAt(a, x).map((m) => `${m}（${pname(a, x)}）`));
    return {
      id: `liuhe:${key}`,
      category: 'liuhe',
      scope: 'natal',
      palaces: pair.map((x) => pname(a, x)),
      stars: pair.flatMap((x) => majorNames(a, x)),
      rule: 'LIUHE',
      tone: 'neutral',
      weight: weightOf('liuhe', 'neutral'),
      hook: false,
      text:
        `${key}六合（暗合）：${pn(pname(a, pair[0]))}${majorsText(a, pair[0])}與${pn(pname(a, pair[1]))}${majorsText(a, pair[1])}。` +
        `生年四化${muts.length ? muts.join('、') : '無'}。`,
      detail: { branches: pair.map((x) => pbranch(a, x)), mutagens: muts },
    };
  });
}

/** 相夾:十二宮逐一看左右兩鄰是否分坐成對的星(兩側不限),外加生年權祿夾。 */
function jiaFacts(a: Astro): ZiweiFact[] {
  const out: ZiweiFact[] = [];
  for (let i = 0; i < 12; i++) {
    const [p, n] = [i - 1, i + 1];
    const name = pname(a, i);
    const neighbours = [pname(a, p), pname(a, n)];
    const flank = (x: string, y: string) =>
      (hasStar(a, p, x) && hasStar(a, n, y)) || (hasStar(a, p, y) && hasStar(a, n, x));
    const jiHere = natalMutagensAt(a, i).find((m) => m.endsWith('化忌'));
    for (const { rule, a: x, b: y, tone: baseTone, key } of JIA_PAIRS) {
      if (!flank(x, y)) continue;
      let tone = baseTone;
      const extra: Detail = {};
      let note = '';
      if (rule === 'JIA_RI_YUE') {
        // 日月任一落陷(陷/不)時不論吉夾,標吉凶並見
        const bright = [x, y].map((s) => String(starsOf(a, locate(a, s)).find((t) => t.name === s)?.brightness ?? ''));
        extra.brightness = `太陽${bright[0]}、太陰${bright[1]}`;
        note = `；${extra.brightness}`;
        if (bright.some((b) => DARK.includes(b))) tone = 'mixed';
      }
      if (rule === 'JIA_YANG_TUO' && jiHere) {
        extra.yangTuoJiaJi = true;
        note = `，本宮${jiHere}，成羊陀夾忌`;
      }
      out.push({
        id: `jia:${name}:${key}`,
        category: 'jia',
        scope: 'natal',
        palaces: [name, ...neighbours],
        stars: [x, y],
        rule,
        tone,
        weight: weightOf('jia', tone, extra.yangTuoJiaJi ? 15 : 0),
        hook: false,
        text: `${pn(name)}（${pbranch(a, i)}）被${x}、${y}相夾（鄰宮${neighbours.map(pn).join('、')}）${note}。`,
        detail: { branch: pbranch(a, i), neighbours, ...extra },
      });
    }
    // 權祿夾:兩鄰分別有生年化權、化祿(星不限)
    const find = (idx: number, m: Mutagen) => natalMutagensAt(a, idx).find((s) => s.endsWith(`化${m}`));
    const ql =
      find(p, '權') && find(n, '祿')
        ? [find(p, '權')!, find(n, '祿')!]
        : find(p, '祿') && find(n, '權')
          ? [find(p, '祿')!, find(n, '權')!]
          : null;
    if (ql) {
      out.push({
        id: `jia:${name}:權祿`,
        category: 'jia',
        scope: 'natal',
        palaces: [name, ...neighbours],
        stars: ql.map((s) => s.slice(0, -2)),
        rule: 'JIA_QUAN_LU',
        tone: 'favorable',
        weight: weightOf('jia', 'favorable'),
        hook: false,
        text: `${pn(name)}（${pbranch(a, i)}）被${ql.join('、')}相夾（鄰宮${neighbours.map(pn).join('、')}），成權祿夾。`,
        detail: { branch: pbranch(a, i), neighbours },
      });
    }
  }
  return out;
}

// ---------- 運限:大限、流年、疊宮、流月 ----------

interface ScopeItem {
  /** 運限名:大限／童限／流年(iztro horoscope name) */
  label: string;
  heavenlyStem: string;
  palaceNames: string[];
  mutagen: string[];
}

/** 某運限四化各落在哪個本命宮、是該運限的哪一宮,並附該星的生年四化。 */
function scopeMutagenFacts(a: Astro, scope: 'decadal' | 'yearly', item: ScopeItem): ZiweiFact[] {
  const label = item.label;
  const category: ZiweiFactCategory = scope === 'decadal' ? 'decadal_mutagen' : 'yearly_mutagen';
  return MUTAGENS.map((m, k): ZiweiFact => {
    const star = String(item.mutagen[k]);
    const i = locate(a, star);
    const natal = starsOf(a, i).find((s) => s.name === star)?.mutagen;
    const scopePalace = String(item.palaceNames[i]);
    const tone: ZiweiFactTone = m === '忌' ? 'caution' : 'favorable';
    return {
      id: `${scope}:化${m}`,
      category,
      scope,
      palaces: [pname(a, i)],
      stars: [star],
      rule: scope === 'decadal' ? 'DECADAL_MUTAGEN' : 'YEARLY_MUTAGEN',
      tone,
      weight: weightOf(category, tone, m === '忌' ? 10 : m === '祿' ? 5 : 0),
      hook: m === '忌' || m === '祿',
      text:
        `${label}${item.heavenlyStem}干${star}化${m}，入本命${pn(pname(a, i))}（${pbranch(a, i)}），` +
        `即${label}${pn(scopePalace)}${natal ? `；此星生年化${natal}` : ''}。`,
      detail: {
        stem: item.heavenlyStem,
        mutagen: m,
        branch: pbranch(a, i),
        scopePalace,
        natalMutagen: natal ? String(natal) : null,
      },
    };
  });
}

/** 本命、大限、流年同一化(祿或忌)落在同一本命宮。 */
function stackFacts(a: Astro, decadal: ScopeItem, yearly: ScopeItem): ZiweiFact[] {
  const out: ZiweiFact[] = [];
  for (const m of ['祿', '忌'] as const) {
    const k = MUTAGENS.indexOf(m);
    const layers: [string, number, string][] = [];
    const n = natalMutagenIndex(a, m);
    if (n >= 0) layers.push(['本命', n, String(starsOf(a, n).find((x) => x.mutagen === m)!.name)]);
    layers.push([decadal.label, locate(a, String(decadal.mutagen[k])), String(decadal.mutagen[k])]);
    layers.push(['流年', locate(a, String(yearly.mutagen[k])), String(yearly.mutagen[k])]);
    for (let i = 0; i < 12; i++) {
      const here = layers.filter(([, idx]) => idx === i);
      if (here.length < 2) continue;
      const name = pname(a, i);
      const kind = `${here.length === 3 ? '三' : '雙'}${m}`;
      const tone: ZiweiFactTone = m === '忌' ? 'caution' : 'favorable';
      out.push({
        id: `stack:${m}:${name}`,
        category: 'mutagen_stack',
        scope: 'yearly',
        palaces: [name],
        stars: here.map(([, , s]) => s),
        rule: 'MUTAGEN_STACK',
        tone,
        weight: weightOf('mutagen_stack', tone, here.length === 3 ? 5 : 0),
        hook: true,
        text: `${pn(name)}（${pbranch(a, i)}）${here.map(([l, , s]) => `${l}${s}化${m}`).join('、')}同落，成${kind}。`,
        detail: { mutagen: m, kind, layers: here.map(([l]) => l), branch: pbranch(a, i) },
      });
    }
  }
  return out;
}

/**
 * 流月標記(本站約定,Z1 RISKS):流月化祿／化忌落入流月命宮三方四正即算「引動」(三合派以祿忌為主,權科只陳述);
 * 只見祿=有利、只見忌=留意、兩者皆有=吉凶並見、都沒有=只陳述。
 */
function monthTone(luckyHits: number, jiHits: number): ZiweiFactTone {
  if (luckyHits && jiHits) return 'mixed';
  if (luckyHits) return 'favorable';
  if (jiHits) return 'caution';
  return 'neutral';
}

function monthlyFacts(a: Astro, lunarYear: number): ZiweiFact[] {
  return a.monthlyList(lunarYear).map((m): ZiweiFact => {
    const ming = m.index;
    const sur = surround(ming);
    const hits = MUTAGENS.map((mu, k) => {
      const star = String(m.mutagen[k]);
      const i = locate(a, star);
      return { mu, star, i, inSur: sur.includes(i) };
    });
    const lucky = hits.filter((h) => h.mu === '祿' && h.inSur);
    const ji = hits.filter((h) => h.mu === '忌' && h.inSur);
    const tone = monthTone(lucky.length, ji.length);
    const half = m.part === 'first' ? '上' : m.part === 'second' ? '下' : '';
    const idKey = m.isLeapMonth ? `閏${m.month}${half}` : `${m.month}`;
    const monthLabel = m.isLeapMonth ? `閏${m.month}月${half ? `${half}半` : ''}` : `${m.month}月`;
    const name = pname(a, ming);
    const landing = hits.map((h) => `${h.star}化${h.mu}入${pn(pname(a, h.i))}`);
    return {
      id: `monthly:${lunarYear}-${idKey}`,
      category: 'monthly',
      scope: 'monthly',
      palaces: [...new Set([name, ...hits.map((h) => pname(a, h.i))])],
      stars: hits.map((h) => h.star),
      rule: 'MONTHLY_MARK',
      tone,
      weight: weightOf('monthly', tone, ji.length ? 5 : 0),
      hook: tone !== 'neutral',
      text:
        `農曆${lunarYear}年${monthLabel}（${m.heavenlyStem}${m.earthlyBranch}）流月命宮在本命${pn(name)}（${pbranch(a, ming)}），` +
        `本月重心在${pn(name)}；流月四化：${landing.join('、')}。` +
        (lucky.length ? '化祿入流月命宮三方四正。' : '') +
        (ji.length ? '化忌入流月命宮三方四正。' : ''),
      detail: {
        lunarYear,
        month: m.month,
        isLeapMonth: m.isLeapMonth,
        part: m.part,
        stem: String(m.heavenlyStem),
        branch: String(m.earthlyBranch),
        monthPalace: name,
        mutagenLanding: landing,
        luHit: lucky.length > 0,
        jiHit: ji.length > 0,
      },
    };
  });
}

/** 解析 'YYYY-M-D'(國曆),回目標日所在農曆年。 */
function lunarYearOf(targetDate: string): number {
  const mt = /^(\d{1,4})-(\d{1,2})-(\d{1,2})$/.exec(targetDate);
  if (!mt) throw new Error(`deep: 目標日期格式須為 YYYY-M-D,收到 ${targetDate}`);
  const [y, m, d] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) throw new Error(`deep: 無此國曆日期 ${targetDate}`);
  // 該國曆年的正月初一;目標日早於它 = 仍在上一個農曆年
  const ny = Lunar.fromYmdHms(y, 1, 1, 0, 0, 0).getSolar();
  const before = m < ny.getMonth() || (m === ny.getMonth() && d < ny.getDay());
  return before ? y - 1 : y;
}

/**
 * Z2 進入點:zh-TW 本命盤 + 目標國曆日期('YYYY-M-D')→ 全部深度 facts。
 * 流年、流月取目標日所在農曆年;大限取目標日虛歲所在的大限(未起大限為童限,iztro 口徑)。
 */
export function computeZiweiDeepFacts(astro: IFunctionalAstrolabe, targetDate: string): ZiweiDeepFacts {
  if (astro.palaces.some((p) => !(PALACE_ORDER as readonly string[]).includes(String(p.name)))) {
    throw new Error('deep: 需要 zh-TW 排的盤(computeChart locale=zh-TW)');
  }
  const lunarYear = lunarYearOf(targetDate);
  const h = astro.horoscope(targetDate);
  // 目標日早於出生或超出最後一個大限時 iztro 回 index=-1、天干未翻譯;不讓 mod12 把 -1 吞成丑宮
  if (h.age.nominalAge < 1 || h.decadal.index < 0) {
    throw new Error(`deep: 目標日 ${targetDate} 不在命主大限範圍內(虛歲 ${h.age.nominalAge})`);
  }
  const decadal: ScopeItem = { label: String(h.decadal.name), heavenlyStem: String(h.decadal.heavenlyStem), palaceNames: h.decadal.palaceNames.map(String), mutagen: h.decadal.mutagen.map(String) };
  const yearly: ScopeItem = { label: '流年', heavenlyStem: String(h.yearly.heavenlyStem), palaceNames: h.yearly.palaceNames.map(String), mutagen: h.yearly.mutagen.map(String) };
  const facts: ZiweiFact[] = [
    ...surroundFacts(astro),
    ...sanheFacts(astro),
    ...liuheFacts(astro),
    ...jiaFacts(astro),
  ];

  // 大限命宮
  const dIdx = h.decadal.index;
  const dName = pname(astro, dIdx);
  const childhood = decadal.label !== '大限';
  const range = pal(astro, dIdx).decadal.range;
  facts.push({
    id: 'decadal:命宮',
    category: 'decadal',
    scope: 'decadal',
    palaces: [dName],
    stars: majorNames(astro, dIdx),
    rule: 'DECADAL',
    tone: 'neutral',
    weight: weightOf('decadal', 'neutral'),
    hook: false,
    text: childhood
      ? `目標日虛歲${h.age.nominalAge}，尚未起大限（${h.decadal.name}），運限命宮在本命${pn(dName)}（${pbranch(astro, dIdx)}）。`
      : `目標日虛歲${h.age.nominalAge}，行${decadal.heavenlyStem}${h.decadal.earthlyBranch}大限（${range[0]}–${range[1]}歲），` +
        `大限命宮在本命${pn(dName)}（${pbranch(astro, dIdx)}），本宮${majorsText(astro, dIdx)}。`,
    detail: {
      childhood,
      nominalAge: h.age.nominalAge,
      stem: decadal.heavenlyStem,
      branch: String(h.decadal.earthlyBranch),
      ageRange: childhood ? null : `${range[0]}-${range[1]}`,
    },
  });
  facts.push(...scopeMutagenFacts(astro, 'decadal', decadal));

  // 一生各大限(時間點)
  for (const d of astro.decadalList()) {
    const nm = pname(astro, d.index);
    facts.push({
      id: `decadal_timeline:${d.ageRange[0]}`,
      category: 'decadal_timeline',
      scope: 'decadal',
      palaces: [nm],
      stars: d.mutagen.map(String),
      rule: 'DECADAL',
      tone: 'neutral',
      weight: weightOf('decadal_timeline', 'neutral'),
      hook: false,
      text:
        `${d.ageRange[0]}–${d.ageRange[1]}歲（${d.yearRange[0]}–${d.yearRange[1]}）行${d.heavenlyStem}${d.earthlyBranch}大限，` +
        `大限命宮在本命${pn(nm)}；大限四化${MUTAGENS.map((m, k) => `${d.mutagen[k]}化${m}`).join('、')}。`,
      detail: {
        ageRange: `${d.ageRange[0]}-${d.ageRange[1]}`,
        yearRange: `${d.yearRange[0]}-${d.yearRange[1]}`,
        stem: String(d.heavenlyStem),
        branch: String(d.earthlyBranch),
      },
    });
  }

  // 流年命宮
  const yIdx = h.yearly.index;
  const yName = pname(astro, yIdx);
  facts.push({
    id: 'yearly:命宮',
    category: 'yearly',
    scope: 'yearly',
    palaces: [yName],
    stars: majorNames(astro, yIdx),
    rule: 'YEARLY',
    tone: 'neutral',
    weight: weightOf('yearly', 'neutral'),
    hook: false,
    text:
      `農曆${lunarYear}年（${yearly.heavenlyStem}${h.yearly.earthlyBranch}）流年命宮在本命${pn(yName)}（${pbranch(astro, yIdx)}），` +
      `本宮${majorsText(astro, yIdx)}。`,
    detail: { lunarYear, stem: yearly.heavenlyStem, branch: String(h.yearly.earthlyBranch) },
  });

  // 流年十二宮疊本命(附大限宮名與流年流耀)
  for (let i = 0; i < 12; i++) {
    const nm = pname(astro, i);
    const yp = yearly.palaceNames[i];
    const dp = decadal.palaceNames[i];
    const flowStars = (h.yearly.stars?.[i] ?? []).map((s) => String(s.name));
    facts.push({
      id: `yearly_overlay:${nm}`,
      category: 'yearly_overlay',
      scope: 'yearly',
      palaces: [nm],
      stars: majorNames(astro, i),
      rule: 'YEARLY',
      tone: 'neutral',
      weight: weightOf('yearly_overlay', 'neutral'),
      hook: false,
      text:
        `本命${pn(nm)}（${pbranch(astro, i)}）＝大限${pn(dp)}＝流年${pn(yp)}；本宮${majorsText(astro, i)}` +
        `${flowStars.length ? `；流年星${flowStars.join('、')}` : ''}。`,
      detail: { branch: pbranch(astro, i), decadalPalace: dp, yearlyPalace: yp, yearlyStars: flowStars },
    });
  }
  facts.push(...scopeMutagenFacts(astro, 'yearly', yearly));
  facts.push(...stackFacts(astro, decadal, yearly));
  facts.push(...monthlyFacts(astro, lunarYear));

  return { targetDate, lunarYear, facts };
}
