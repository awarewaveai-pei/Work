import { describe, expect, it } from 'vitest';
import { toTraditional } from './s2t';
import { ACTIVITY_TERMS } from './zeri';

describe('toTraditional(擇日用字)', () => {
  it('事項對應詞(含諸事不宜)', () => {
    const raw = [...Object.values(ACTIVITY_TERMS).flat(), '诸事不宜'];
    expect(raw.map(toTraditional)).toEqual(['入宅', '移徙', '開市', '動土', '嫁娶', '出行', '立券', '交易', '安床', '諸事不宜']);
  });

  it('建除十二值', () => {
    const raw = ['建', '除', '满', '平', '定', '执', '破', '危', '成', '收', '开', '闭'];
    expect(raw.map(toTraditional)).toEqual(['建', '除', '滿', '平', '定', '執', '破', '危', '成', '收', '開', '閉']);
  });

  it('十二天神與黃道/黑道', () => {
    const raw = ['青龙', '明堂', '天刑', '朱雀', '金匮', '天德', '白虎', '玉堂', '天牢', '玄武', '司命', '勾陈', '黄道', '黑道'];
    expect(raw.map(toTraditional)).toEqual([
      '青龍', '明堂', '天刑', '朱雀', '金匱', '天德', '白虎', '玉堂', '天牢', '玄武', '司命', '勾陳', '黃道', '黑道',
    ]);
  });
});
