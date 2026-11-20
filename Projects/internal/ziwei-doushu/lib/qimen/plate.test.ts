import { describe, expect, it } from 'vitest';
import { computeQimen } from './index';
import { layPlate, type Palace, type QimenPlate } from './plate';

/**
 * 黃金案例:公開排盤教學的完整轉盤盤面,逐宮比對地盤、天盤、門、星、神。
 * 例 B、C 的出處以置閏法定局,局數與本站拆補法不同 → 只用其「遁、局、時柱」驗布盤,不驗定局。
 * 出處未寫出的格子不比對。
 */
type Row = [earth: string, heaven: string | null, door: string | null, star: string | null, deity: string | null];

function expectPalaces(plate: QimenPlate, rows: Partial<Record<Palace, Row>>) {
  for (const [p, [earth, heaven, door, star, deity]] of Object.entries(rows) as [string, Row][]) {
    const got = plate.palaces[Number(p) - 1];
    const label = `宮${p}`;
    expect(got.earthStem, label).toBe(earth);
    if (heaven !== null) expect(got.heavenStem, label).toBe(heaven);
    if (door !== null) expect(got.door, label).toBe(door);
    if (star !== null) expect(got.star, label).toBe(star);
    if (deity !== null) expect(got.deity, label).toBe(deity);
  }
}

describe('奇門轉盤布盤 — 黃金案例', () => {
  // 例 A 出處:askqimen.com〈奇门遁甲排盘步骤详解〉https://www.askqimen.com/zh-CN/knowledge/qimen-dunjia-charting-steps
  // 2024-01-01 12:00 癸卯 甲子 甲子 庚午,冬至上元 陽遁一局(甲子日即符頭,拆補與置閏同局)。
  it('A 陽遁一局 庚午時(含定局、空亡、馬星、天禽寄芮)', () => {
    const r = computeQimen({ year: 2024, month: 1, day: 1, hour: 12, minute: 0 });
    expect(r.pillars).toEqual({ year: '癸卯', month: '甲子', day: '甲子', hour: '庚午' });
    expect(r.jieqi.name).toBe('冬至');
    expect([r.yuan, r.dun, r.ju]).toEqual(['upper', 'yang', 1]);
    const p = r.plate;
    expect(p.zhiFu).toEqual({ star: '天蓬', palace: 3 });
    expect(p.zhiShi).toEqual({ door: '休門', palace: 7 });
    expectPalaces(p, {
      1: ['戊', '丁', '傷門', '天柱', '九地'],
      2: ['己', '辛', '開門', '天輔', '六合'],
      3: ['庚', '戊', '景門', '天蓬', '值符'],
      4: ['辛', '丙', '死門', '天任', '螣蛇'],
      5: ['壬', null, null, null, null],
      6: ['癸', '己', '生門', '天芮', '玄武'],
      7: ['丁', '乙', '休門', '天英', '白虎'],
      8: ['丙', '癸', '杜門', '天心', '九天'],
      9: ['乙', '庚', '驚門', '天沖', '太陰'],
    });
    expect(p.palaces[1].earthStemJi).toBe('壬'); // 中五壬寄坤二(地盤)
    expect(p.palaces[5].starJi).toBe(true); // 天禽隨天芮到乾六
    expect(p.palaces[5].heavenStemJi).toBe('壬');
    expect(p.kongPalaces).toEqual([6]);
    expect(p.ma.palace).toBe(2);
  });

  // 例 B 出處:搜狐〈奇门遁甲起局排盘解析全文〉https://www.sohu.com/a/684397925_121659523
  // 2021-06-30 09:40 己酉日 己巳時,原文定「小暑上元 陰遁八局」,值符天任落七、值使生門落三。
  it('B 陰遁八局 己巳時(八神逆時針、八門不倒序)', () => {
    const p = layPlate('yin', 8, '己巳');
    expect(p.zhiFu).toEqual({ star: '天任', palace: 7 });
    expect(p.zhiShi).toEqual({ door: '生門', palace: 3 });
    expectPalaces(p, {
      1: ['丙', '壬', '開門', '天輔', '九地'],
      2: ['丁', null, '景門', null, '螣蛇'],
      3: ['癸', '丁', '生門', '天芮', '白虎'],
      4: ['壬', '己', '傷門', '天柱', '六合'],
      5: ['辛', null, null, null, null],
      6: ['庚', '癸', '驚門', '天沖', '九天'],
      7: ['己', '戊', '死門', '天任', '值符'],
      8: ['戊', '乙', '休門', '天英', '玄武'],
      9: ['乙', '庚', '杜門', '天心', '太陰'],
    });
  });

  // 例 C 出處:搜狐〈转盘奇门遁甲的起局思路跟排法〉https://www.sohu.com/a/398916929_120339516
  // 2002-04-07 08:00 壬午 甲辰 乙巳 庚辰,原文以置閏法定「春分下元 陽遁六局」,值符天柱、值使驚門到巽四。
  it('C 陽遁六局 庚辰時(天禽干隨天芮到坎一)', () => {
    const p = layPlate('yang', 6, '庚辰');
    expect(p.zhiFu).toEqual({ star: '天柱', palace: 8 });
    expect(p.zhiShi).toEqual({ door: '驚門', palace: 4 });
    expectPalaces(p, {
      1: ['壬', '癸', '杜門', '天芮', '九天'],
      2: ['癸', '丁', '休門', '天沖', '白虎'],
      3: ['丁', '戊', '死門', '天心', '螣蛇'],
      4: ['丙', '壬', '驚門', '天蓬', '太陰'],
      5: ['乙', null, null, null, null],
      6: ['戊', '辛', '傷門', '天英', '九地'],
      7: ['己', '丙', '生門', '天輔', '玄武'],
      8: ['庚', '己', '景門', '天柱', '值符'],
      9: ['辛', '庚', '開門', '天任', '六合'],
    });
    expect(p.palaces[0].heavenStemJi).toBe('乙');
  });

  // 例 D 出處:新浪〈干货来了!奇门遁甲起局完整教程〉https://k.sina.cn/article_7507386011_1bf799e9b0010103yf.html
  // 2022-03-09 20:15 壬寅 癸卯 辛酉 戊戌,原文定陽遁五局(非拆補);全盤為圖片,僅文字寫出的格子可比:
  // 時干戊在中五 → 寄坤二,值符天任帶辛到坤二(地盤丁、寄戊);值使生門到震三;甲午旬空在巽;戌時馬在坤。
  it('D 陽遁五局 戊戌時(時干落中五寄坤)', () => {
    const p = layPlate('yang', 5, '戊戌');
    expect(p.xunShou).toBe('甲午');
    expect(p.zhiFu).toEqual({ star: '天任', palace: 2 });
    expect(p.zhiShi).toEqual({ door: '生門', palace: 3 });
    expectPalaces(p, { 2: ['丁', '辛', null, '天任', '值符'] });
    expect(p.palaces[1].earthStemJi).toBe('戊');
    expect(p.kongPalaces).toEqual([4]);
    expect(p.ma.palace).toBe(2);
  });
});
