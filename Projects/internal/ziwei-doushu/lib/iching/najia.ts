/**
 * 六爻納甲排盤 —— 純函式。給本卦六爻、動爻與起卦日干支,算八宮、世應、納甲、六親、六神、旬空。
 *
 * 口徑:京房納甲通行口徑。
 *   納干:乾內甲外壬、坤內乙外癸;震庚、巽辛、坎戊、離己、艮丙、兌丁(內外同)。
 *   納支:乾、震 子寅辰/午申戌;坎 寅辰午/申戌子;艮 辰午申/戌子寅(陽卦順行);
 *        坤 未巳卯/丑亥酉;巽 丑亥酉/未巳卯;離 卯丑亥/酉未巳;兌 巳卯丑/亥酉未(陰卦逆行)。
 *   八宮:本宮八純卦,由初爻起逐爻變至五爻為一世~五世,五世卦四爻復變為遊魂,遊魂卦內卦全變為歸魂。
 *        世爻:本宮上爻、一~五世在該爻、遊魂四爻、歸魂三爻;應爻在世爻隔二位。
 *   六親:以卦宮五行為「我」,生我父母、我生子孫、剋我官鬼、我剋妻財、比和兄弟;變爻亦以本卦卦宮論。
 *   六神:依日干由初爻起,甲乙青龍、丙丁朱雀、戊勾陳、己螣蛇、庚辛白虎、壬癸玄武,依序上排。
 *   旬空:日干支所在旬,十干配完剩下的兩支。
 * 參考 ichingpy(MIT)six_lines.py 的規則,TypeScript 自行重寫。
 */
import { Solar } from 'lunar-javascript';
import type { Ymd } from '@/lib/today';
import {
  BRANCHES,
  KE,
  SHENG,
  branchWuXing,
  ganZhiIndex,
  type Branch,
  type Stem,
  type WuXing,
} from '@/lib/ganzhi';

export type TrigramName = '乾' | '兌' | '離' | '震' | '巽' | '坎' | '艮' | '坤';
export type SixRelative = '父母' | '兄弟' | '子孫' | '妻財' | '官鬼';
export type SixSpirit = '青龍' | '朱雀' | '勾陳' | '螣蛇' | '白虎' | '玄武';
export type Generation = '本宮' | '一世' | '二世' | '三世' | '四世' | '五世' | '遊魂' | '歸魂';

interface TrigramNajia {
  name: TrigramName;
  wuxing: WuXing;
  stems: readonly [inner: Stem, outer: Stem];
  /** 由下而上 */
  inner: readonly [Branch, Branch, Branch];
  outer: readonly [Branch, Branch, Branch];
}

/** 三爻二進位(由下而上,1=陽)→ 納甲。 */
const TRIGRAMS: Readonly<Record<string, TrigramNajia>> = {
  '111': { name: '乾', wuxing: '金', stems: ['甲', '壬'], inner: ['子', '寅', '辰'], outer: ['午', '申', '戌'] },
  '010': { name: '坎', wuxing: '水', stems: ['戊', '戊'], inner: ['寅', '辰', '午'], outer: ['申', '戌', '子'] },
  '001': { name: '艮', wuxing: '土', stems: ['丙', '丙'], inner: ['辰', '午', '申'], outer: ['戌', '子', '寅'] },
  '100': { name: '震', wuxing: '木', stems: ['庚', '庚'], inner: ['子', '寅', '辰'], outer: ['午', '申', '戌'] },
  '011': { name: '巽', wuxing: '木', stems: ['辛', '辛'], inner: ['丑', '亥', '酉'], outer: ['未', '巳', '卯'] },
  '101': { name: '離', wuxing: '火', stems: ['己', '己'], inner: ['卯', '丑', '亥'], outer: ['酉', '未', '巳'] },
  '000': { name: '坤', wuxing: '土', stems: ['乙', '癸'], inner: ['未', '巳', '卯'], outer: ['丑', '亥', '酉'] },
  '110': { name: '兌', wuxing: '金', stems: ['丁', '丁'], inner: ['巳', '卯', '丑'], outer: ['亥', '酉', '未'] },
};

/** 八宮傳統次序 */
export const PALACE_ORDER: readonly TrigramName[] = ['乾', '坎', '艮', '震', '巽', '離', '坤', '兌'];

const GENERATIONS: readonly Generation[] = ['本宮', '一世', '二世', '三世', '四世', '五世', '遊魂', '歸魂'];
/** 各世卦的世爻位置(0=初爻) */
const SHI_INDEX: readonly number[] = [5, 0, 1, 2, 3, 4, 3, 2];

export interface PalaceInfo {
  palace: TrigramName;
  wuxing: WuXing;
  generation: Generation;
  /** 世爻位置(0=初爻) */
  shi: number;
  /** 應爻位置 */
  ying: number;
}

/** 八宮表:六爻二進位 → 卦宮。建表一次。 */
const PALACE_OF = new Map<string, PalaceInfo>();
for (const palace of PALACE_ORDER) {
  const [binary, trigram] = Object.entries(TRIGRAMS).find(([, t]) => t.name === palace)!;
  const lines = [...binary, ...binary].map(Number);
  const flip = (i: number) => (lines[i] = 1 - lines[i]);
  // 本宮 → 一世…五世(逐爻變初至五爻) → 遊魂(四爻復變) → 歸魂(內卦三爻全變)
  const steps: ReadonlyArray<readonly number[]> = [[], [0], [1], [2], [3], [4], [3], [0, 1, 2]];
  steps.forEach((flips, g) => {
    flips.forEach(flip);
    const shi = SHI_INDEX[g];
    PALACE_OF.set(lines.join(''), {
      palace,
      wuxing: trigram.wuxing,
      generation: GENERATIONS[g],
      shi,
      ying: (shi + 3) % 6,
    });
  });
}

function checkLines(lines: readonly number[]): void {
  if (lines.length !== 6 || lines.some((l) => l !== 0 && l !== 1)) {
    throw new Error(`六爻須為六個 0/1: ${lines.join(',')}`);
  }
}

/** 六爻(由下而上,1=陽)→ 卦宮、世應。 */
export function palaceOf(lines: readonly number[]): PalaceInfo {
  checkLines(lines);
  return PALACE_OF.get(lines.join(''))!;
}

/** 測試用:八宮表全部卦的二進位。 */
export function allPalaceBinaries(): string[] {
  return [...PALACE_OF.keys()];
}

/** 六爻每爻的干支(由下而上)。 */
export function najiaGanZhi(lines: readonly number[]): string[] {
  checkLines(lines);
  const inner = TRIGRAMS[lines.slice(0, 3).join('')];
  const outer = TRIGRAMS[lines.slice(3).join('')];
  return [
    ...inner.inner.map((b) => inner.stems[0] + b),
    ...outer.outer.map((b) => outer.stems[1] + b),
  ];
}

/** 以卦宮五行為我,論爻支五行的六親。 */
export function sixRelative(palace: WuXing, branch: string): SixRelative {
  const el = branchWuXing(branch);
  if (el === palace) return '兄弟';
  if (SHENG[el] === palace) return '父母';
  if (SHENG[palace] === el) return '子孫';
  if (KE[el] === palace) return '官鬼';
  return '妻財'; // 五行五種關係,前四種不是即為我剋
}

const SPIRITS: readonly SixSpirit[] = ['青龍', '朱雀', '勾陳', '螣蛇', '白虎', '玄武'];
/** 日干 → 初爻六神序 */
const SPIRIT_START: Readonly<Record<Stem, number>> = {
  甲: 0, 乙: 0, 丙: 1, 丁: 1, 戊: 2, 己: 3, 庚: 4, 辛: 4, 壬: 5, 癸: 5,
};

/** 日干 → 初爻至上爻的六神。 */
export function sixSpirits(dayStem: string): SixSpirit[] {
  const start = SPIRIT_START[dayStem as Stem];
  if (start === undefined) throw new Error(`未知天干: ${dayStem}`);
  return Array.from({ length: 6 }, (_, i) => SPIRITS[(start + i) % 6]);
}

/** 日干支所在旬的兩個空亡地支。 */
export function xunKong(dayGanZhi: string): [Branch, Branch] {
  const n = ganZhiIndex(dayGanZhi);
  const head = n - (n % 10); // 旬首(甲X)在六十甲子的序
  return [BRANCHES[(head + 10) % 12], BRANCHES[(head + 11) % 12]];
}

/** 某國曆日的日干支(以 0 時換日,與本站每日運勢、擇日同一口徑)。 */
export function dayGanZhiOf(d: Ymd): string {
  return Solar.fromYmd(d.year, d.month, d.day).getLunar().getDayInGanZhi();
}

export interface NajiaLine {
  /** 0=初爻 … 5=上爻 */
  index: number;
  yang: boolean;
  ganZhi: string;
  wuxing: WuXing;
  relative: SixRelative;
  spirit: SixSpirit;
  shi: boolean;
  ying: boolean;
  moving: boolean;
  void: boolean;
  /** 動爻變出之爻(六親仍以本卦卦宮論) */
  changed?: { yang: boolean; ganZhi: string; wuxing: WuXing; relative: SixRelative; void: boolean };
}

export interface NajiaChart extends PalaceInfo {
  dayGanZhi: string;
  xunKong: [Branch, Branch];
  /** 由下而上 */
  lines: NajiaLine[];
}

/** 本卦六爻(由下而上)、動爻位置、起卦日干支 → 整盤。 */
export function najiaChart(
  lines: readonly number[],
  movingLines: readonly number[],
  dayGanZhi: string,
): NajiaChart {
  const palace = palaceOf(lines);
  const kong = xunKong(dayGanZhi);
  const spirits = sixSpirits(dayGanZhi[0]);
  const gz = najiaGanZhi(lines);
  const changedLines = lines.map((l, i) => (movingLines.includes(i) ? 1 - l : l));
  const changedGz = najiaGanZhi(changedLines);
  const isVoid = (g: string) => (kong as string[]).includes(g[1]);

  return {
    ...palace,
    dayGanZhi,
    xunKong: kong,
    lines: gz.map((g, i) => ({
      index: i,
      yang: lines[i] === 1,
      ganZhi: g,
      wuxing: branchWuXing(g[1]),
      relative: sixRelative(palace.wuxing, g[1]),
      spirit: spirits[i],
      shi: i === palace.shi,
      ying: i === palace.ying,
      moving: movingLines.includes(i),
      void: isVoid(g),
      changed: movingLines.includes(i)
        ? {
            yang: changedLines[i] === 1,
            ganZhi: changedGz[i],
            wuxing: branchWuXing(changedGz[i][1]),
            relative: sixRelative(palace.wuxing, changedGz[i][1]),
            void: isVoid(changedGz[i]),
          }
        : undefined,
    })),
  };
}

export const LINE_NAMES = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'] as const;

/** 給 AI 的每爻一句事實(中文術語,與其他卜卦事實一致)。 */
export function lineFact(l: NajiaLine): string {
  const parts = [LINE_NAMES[l.index], l.yang ? '陽' : '陰', `${l.ganZhi}${l.wuxing}`, l.relative, l.spirit];
  if (l.shi) parts.push('世');
  if (l.ying) parts.push('應');
  if (l.void) parts.push('旬空');
  if (l.changed) {
    const c = l.changed;
    parts.push(`動,變${c.yang ? '陽' : '陰'} ${c.ganZhi}${c.wuxing} ${c.relative}${c.void ? ' 旬空' : ''}`);
  } else {
    parts.push('靜');
  }
  return parts.join(' ');
}
