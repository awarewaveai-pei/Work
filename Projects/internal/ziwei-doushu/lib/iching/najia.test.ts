import { describe, expect, it } from 'vitest';
import { allHexagramBinaries, hexagramFromSums } from '../iching';
import { PALACE_ORDER, allPalaceBinaries, dayGanZhiOf, najiaChart, palaceOf, sixSpirits, xunKong } from './najia';

/** 卦名 → 六爻(由下而上) */
const LINES_OF = new Map(
  allHexagramBinaries().map((b) => {
    const h = hexagramFromSums('', [...b].map((c) => (c === '1' ? 7 : 8))).primary;
    return [h.name, h.lines] as const;
  }),
);
const lines = (name: string) => {
  const l = LINES_OF.get(name);
  if (!l) throw new Error(`查無卦名 ${name}`);
  return l;
};

/** 八宮卦序:本宮、一世…五世、遊魂、歸魂(京房八宮傳統表) */
const PALACES: Record<string, string[]> = {
  乾: ['乾為天', '天風姤', '天山遯', '天地否', '風地觀', '山地剝', '火地晉', '火天大有'],
  坎: ['坎為水', '水澤節', '水雷屯', '水火既濟', '澤火革', '雷火豐', '地火明夷', '地水師'],
  艮: ['艮為山', '山火賁', '山天大畜', '山澤損', '火澤睽', '天澤履', '風澤中孚', '風山漸'],
  震: ['震為雷', '雷地豫', '雷水解', '雷風恆', '地風升', '水風井', '澤風大過', '澤雷隨'],
  巽: ['巽為風', '風天小畜', '風火家人', '風雷益', '天雷無妄', '火雷噬嗑', '山雷頤', '山風蠱'],
  離: ['離為火', '火山旅', '火風鼎', '火水未濟', '山水蒙', '風水渙', '天水訟', '天火同人'],
  坤: ['坤為地', '地雷復', '地澤臨', '地天泰', '雷天大壯', '澤天夬', '水天需', '水地比'],
  兌: ['兌為澤', '澤水困', '澤地萃', '澤山咸', '水山蹇', '地山謙', '雷山小過', '雷澤歸妹'],
};
const GENS = ['本宮', '一世', '二世', '三世', '四世', '五世', '遊魂', '歸魂'];

describe('八宮歸屬', () => {
  it('64 卦逐宮逐世與傳統表一致,不重不漏', () => {
    const seen = new Set<string>();
    for (const palace of PALACE_ORDER) {
      PALACES[palace].forEach((name, g) => {
        const p = palaceOf(lines(name));
        expect([name, p.palace, p.generation]).toEqual([name, palace, GENS[g]]);
        seen.add(name);
      });
    }
    expect(seen.size).toBe(64);
    expect(new Set(allPalaceBinaries()).size).toBe(64);
  });
});

/** 由上爻往下讀的「六親 干支 世應」,與通行裝卦表對照 */
const topDown = (name: string) =>
  najiaChart(lines(name), [], '甲子')
    .lines.map((l) => `${l.relative}${l.ganZhi}${l.wuxing}${l.shi ? '世' : l.ying ? '應' : ''}`)
    .reverse();

describe('整盤', () => {
  it('乾為天:乾宮金', () => {
    expect(topDown('乾為天')).toEqual([
      '父母壬戌土世', '兄弟壬申金', '官鬼壬午火', '父母甲辰土應', '妻財甲寅木', '子孫甲子水',
    ]);
  });
  it('坤為地:坤宮土', () => {
    expect(topDown('坤為地')).toEqual([
      '子孫癸酉金世', '妻財癸亥水', '兄弟癸丑土', '官鬼乙卯木應', '父母乙巳火', '兄弟乙未土',
    ]);
  });
  it('天風姤:乾宮一世', () => {
    expect(topDown('天風姤')).toEqual([
      '父母壬戌土', '兄弟壬申金', '官鬼壬午火應', '兄弟辛酉金', '子孫辛亥水', '父母辛丑土世',
    ]);
  });
  it('火水未濟:離宮三世', () => {
    expect(topDown('火水未濟')).toEqual([
      '兄弟己巳火應', '子孫己未土', '妻財己酉金', '兄弟戊午火世', '子孫戊辰土', '父母戊寅木',
    ]);
  });
  it('動爻:乾為天初爻動 → 變出巽之初爻辛丑土,六親仍以乾宮金論為父母', () => {
    const c = najiaChart(lines('乾為天'), [0], '甲子').lines[0];
    expect(c.moving).toBe(true);
    expect(c.changed).toMatchObject({ yang: false, ganZhi: '辛丑', relative: '父母' });
  });
});

describe('六神與旬空', () => {
  it('戊日:初爻勾陳起,依序上排', () => {
    expect(sixSpirits('戊')).toEqual(['勾陳', '螣蛇', '白虎', '玄武', '青龍', '朱雀']);
  });
  it('癸亥日屬甲寅旬,空子丑;乙丑日屬甲子旬,空戌亥', () => {
    expect(xunKong('癸亥')).toEqual(['子', '丑']);
    expect(xunKong('乙丑')).toEqual(['戌', '亥']);
    const l = najiaChart(lines('乾為天'), [], '癸亥').lines;
    expect(l.map((x) => x.void)).toEqual([true, false, false, false, false, false]);
  });
  it('起卦日干支以國曆日 0 時換日', () => {
    expect(dayGanZhiOf({ year: 2000, month: 1, day: 1 })).toBe('戊午');
  });
});

describe('納甲 facts', () => {
  it('六爻全動也不超過 API 上限,每爻一條', async () => {
    const { toContext, najiaOf } = await import('@/lib/divination/systems/iching');
    for (const sums of [[6, 9, 6, 9, 6, 9], [9, 9, 9, 7, 7, 7], [7, 8, 7, 8, 7, 8]]) {
      const r = hexagramFromSums('問事業', sums);
      const ctx = toContext(r, 'en', najiaOf(r, { year: 2026, month: 11, day: 21 }));
      expect(ctx.facts.filter((f) => f.label.startsWith('najia.line'))).toHaveLength(6);
      expect(ctx.facts.length).toBeLessThanOrEqual(60);
      for (const f of ctx.facts) {
        expect(f.label.length).toBeLessThanOrEqual(60);
        expect(f.value.length).toBeLessThanOrEqual(300);
      }
    }
  });
});
