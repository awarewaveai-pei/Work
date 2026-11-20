import { describe, expect, it } from 'vitest';
import { computeBazhai } from './bazhai';

/**
 * 命卦以《八宅明鏡》通行算法核對:1900–1999 男 (100 − 年尾兩位) mod 9、
 *   女 (年尾兩位 − 4) mod 9;2000 後男 (99 − yy) mod 9、女 (yy + 6) mod 9;
 *   五黃男寄坤、女寄艮。
 */
const mid = (year: number) => ({ year, month: 6, day: 1 });

describe('八宅命卦', () => {
  it('男命', () => {
    expect(computeBazhai({ birth: mid(1984), gender: '男' }).gua).toBe(7);
    expect(computeBazhai({ birth: mid(1990), gender: '男' }).gua).toBe(1);
  });
  it('女命', () => {
    expect(computeBazhai({ birth: mid(1984), gender: '女' }).gua).toBe(8);
    expect(computeBazhai({ birth: mid(2000), gender: '女' }).gua).toBe(6);
  });
  it('五黃:男 1995 寄坤、女 1990 寄艮', () => {
    expect(computeBazhai({ birth: mid(1995), gender: '男' }).gua).toBe(2);
    expect(computeBazhai({ birth: mid(1990), gender: '女' }).gua).toBe(8);
  });
  it('坎命八方(東四命)', () => {
    const r = computeBazhai({ birth: mid(1990), gender: '男' });
    expect(r.group).toBe('east');
    expect(r.stars).toEqual({
      shengQi: 'SE', tianYi: 'E', yanNian: 'S', fuWei: 'N',
      jueMing: 'SW', wuGui: 'NE', liuSha: 'NW', huoHai: 'W',
    });
  });
});
