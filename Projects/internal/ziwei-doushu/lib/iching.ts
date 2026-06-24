/**
 * 卜卦(易經)— 自寫 64 卦 + 六爻銅錢起卦。零依賴、確定性可測。
 *
 * 起卦法(銅錢):每爻擲 3 枚銅錢,陰面=2、陽面=3,三枚和:
 *   6 老陰(動,變陽) / 7 少陽(靜) / 8 少陰(靜) / 9 老陽(動,變陰)
 * 六爻由下(初爻)而上(上爻)。動爻翻面 → 本卦 + 變卦。
 * 解卦文字由 AI 層產生(本模組提供卦象結構:卦名/卦序/上下卦/動爻)。
 */

/** 八卦三爻二進位(由下而上,1=陽 0=陰) */
const TRIGRAM_BINARY: Record<string, string> = {
  乾: '111', 兌: '110', 離: '101', 震: '100',
  巽: '011', 坎: '010', 艮: '001', 坤: '000',
};

/** 64 卦(King Wen 序):[卦序] = [下卦, 上卦, 卦名] */
const HEXAGRAMS: ReadonlyArray<readonly [string, string, string]> = [
  ['乾', '乾', '乾為天'], ['坤', '坤', '坤為地'], ['震', '坎', '水雷屯'], ['坎', '艮', '山水蒙'],
  ['乾', '坎', '水天需'], ['坎', '乾', '天水訟'], ['坎', '坤', '地水師'], ['坤', '坎', '水地比'],
  ['乾', '巽', '風天小畜'], ['兌', '乾', '天澤履'], ['乾', '坤', '地天泰'], ['坤', '乾', '天地否'],
  ['離', '乾', '天火同人'], ['乾', '離', '火天大有'], ['艮', '坤', '地山謙'], ['坤', '震', '雷地豫'],
  ['震', '兌', '澤雷隨'], ['巽', '艮', '山風蠱'], ['兌', '坤', '地澤臨'], ['坤', '巽', '風地觀'],
  ['震', '離', '火雷噬嗑'], ['離', '艮', '山火賁'], ['坤', '艮', '山地剝'], ['震', '坤', '地雷復'],
  ['震', '乾', '天雷無妄'], ['乾', '艮', '山天大畜'], ['震', '艮', '山雷頤'], ['巽', '兌', '澤風大過'],
  ['坎', '坎', '坎為水'], ['離', '離', '離為火'], ['艮', '兌', '澤山咸'], ['巽', '震', '雷風恆'],
  ['艮', '乾', '天山遯'], ['乾', '震', '雷天大壯'], ['坤', '離', '火地晉'], ['離', '坤', '地火明夷'],
  ['離', '巽', '風火家人'], ['兌', '離', '火澤睽'], ['艮', '坎', '水山蹇'], ['坎', '震', '雷水解'],
  ['兌', '艮', '山澤損'], ['震', '巽', '風雷益'], ['乾', '兌', '澤天夬'], ['巽', '乾', '天風姤'],
  ['坤', '兌', '澤地萃'], ['巽', '坤', '地風升'], ['坎', '兌', '澤水困'], ['巽', '坎', '水風井'],
  ['離', '兌', '澤火革'], ['巽', '離', '火風鼎'], ['震', '震', '震為雷'], ['艮', '艮', '艮為山'],
  ['艮', '巽', '風山漸'], ['兌', '震', '雷澤歸妹'], ['離', '震', '雷火豐'], ['艮', '離', '火山旅'],
  ['巽', '巽', '巽為風'], ['兌', '兌', '兌為澤'], ['坎', '巽', '風水渙'], ['兌', '坎', '水澤節'],
  ['兌', '巽', '風澤中孚'], ['艮', '震', '雷山小過'], ['離', '坎', '水火既濟'], ['坎', '離', '火水未濟'],
];

/** 六爻二進位(由下而上)→ {卦序, 卦名}。建表一次。 */
const BINARY_TO_HEXAGRAM = new Map<string, { number: number; name: string }>();
for (let i = 0; i < HEXAGRAMS.length; i++) {
  const [lower, upper, name] = HEXAGRAMS[i];
  const binary = TRIGRAM_BINARY[lower] + TRIGRAM_BINARY[upper];
  BINARY_TO_HEXAGRAM.set(binary, { number: i + 1, name });
}

export interface Hexagram {
  number: number;
  name: string;
  /** 六爻由下而上,1=陽 0=陰 */
  lines: number[];
}

export interface IChingResult {
  question: string;
  primary: Hexagram;
  /** 變卦(有動爻時);無動爻則 undefined */
  changed?: Hexagram;
  /** 動爻位置(0=初爻 … 5=上爻) */
  movingLines: number[];
}

function lookup(lines: number[]): { number: number; name: string } {
  const found = BINARY_TO_HEXAGRAM.get(lines.join(''));
  if (!found) throw new Error(`查無對應卦象: ${lines.join('')}`);
  return found;
}

/**
 * 起卦。rng 預設 Math.random(無種子,符合 PLAN §19);可注入以利測試。
 */
export function castHexagram(
  question: string,
  rng: () => number = Math.random,
): IChingResult {
  const lines: number[] = [];
  const moving: number[] = [];
  for (let i = 0; i < 6; i++) {
    // 三枚銅錢:陰面=2、陽面=3
    const sum = [0, 0, 0].reduce((acc) => acc + (rng() < 0.5 ? 2 : 3), 0);
    const yang = sum === 7 || sum === 9 ? 1 : 0; // 7少陽/9老陽=陽
    lines.push(yang);
    if (sum === 6 || sum === 9) moving.push(i); // 老陰/老陽=動爻
  }

  const primaryMeta = lookup(lines);
  const primary: Hexagram = { ...primaryMeta, lines: [...lines] };

  let changed: Hexagram | undefined;
  if (moving.length > 0) {
    const changedLines = lines.map((l, i) => (moving.includes(i) ? 1 - l : l));
    changed = { ...lookup(changedLines), lines: changedLines };
  }

  return { question, primary, changed, movingLines: moving };
}

/** 測試/驗證用:回傳全部 64 卦的二進位(供唯一性檢查)。 */
export function allHexagramBinaries(): string[] {
  return [...BINARY_TO_HEXAGRAM.keys()];
}
