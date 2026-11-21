import { describe, it, expect } from 'vitest';
import { HEXAGRAM_TEXTS, USE_NINE, USE_SIX } from './text';
import ref from './fixtures/wikisource-zhouyi.json';

/**
 * 外部基準:維基文庫《周易》64 卦子頁的經文(出處、revid、取得日期在 fixture)。
 * 比對忽略標點、爻題後的分隔符與卦辭開頭的卦名;維基的 {{另|正文|異文、異文}} 任一讀法都算相符。
 * 其餘差異逐條列在 RULINGS(本站採哪個字與理由);新出現或消失的差異都會讓測試變紅。
 */

/** 本站與維基文庫不同、經裁定保留本站寫法的條目。key = `卦序-位置`(0=卦辭,1–6=爻,7=用九/用六) */
const RULINGS: Record<string, string> = {
  '1-7': '羣/群 異體字,本站用通行字「群」。',
  '10-6': '維基「考詳」;本站「考祥」(iching-kit、ichingpy 同),保留。',
  '13-1': '維基此句「無咎」是繁簡轉換漏標,同頁他處作「无」;周易用「无」。',
  '13-5': '啕/咷 異體;ichingshifa 作「咷」,保留。',
  '13-6': '同 13-1,「無悔」為轉換漏標。',
  '20-2': '維基「窺」;ichingshifa 作「闚」,I1 裁定「闚」,保留。',
  '21-3': '維基正文「昔」、異文「臘」;本站「腊」(乾肉義,ichingshifa 同),保留。',
  '22-5': '維基「於」;三個 I1 來源皆「于」,保留。',
  '26-3': '維基「利艱貞,吉。日閑」;三個 I1 來源皆無「吉」、作「曰」,保留,見 RISKS。',
  '38-6': '涂/塗 異體;本站「塗」,保留。',
  '44-1': '維基「系」是簡體漏轉;本站「繫」(ichingshifa 同),保留。',
  '45-0': '維基卦辭無開頭「亨」;iching-kit、ichingpy 皆有,保留,見 RISKS。',
  '47-2': '維基「亨祀」;iching-kit、ichingpy 作「享祀」,保留,見 RISKS。',
  '48-2': '瓮/甕 異體,保留。',
  '48-5': '維基「冽」與 iching-kit 同;ichingpy、ichingshifa 作「洌」,二比二,暫保留「洌」,見 RISKS。',
  '49-0': '維基「已日」;監工裁定「巳日」,與維基不合,見 RISKS。',
  '49-2': '同 49-0。',
  '55-6': '維基「窺」「觌」(後者簡體漏轉);ichingpy、ichingshifa 作「闚」,保留。',
  '59-1': '維基多「悔亡」;三個 I1 來源皆無,保留。',
};

const PUNCT = /[，。：；、！？「」\s,.;:]/g;
const bare = (s: string) => s.replace(PUNCT, '');
const LINE_TITLE = /^(初[六九]|[六九][二三四五]|上[六九]|用[六九])[：，]/;

/** 展開 {{另|a|b、c}} → 所有讀法 */
function readings(s: string): string[] {
  const m = s.match(/\{\{另\|([^|}]*)\|([^}]*)\}\}/);
  if (!m) return [s];
  const options = [m[1], ...m[2].split('、')];
  return options.flatMap((o) => readings(s.replace(m[0], o)));
}

function normalise(s: string, hexName: string, kind: 'judgment' | 'line'): string {
  let t = kind === 'line' ? s.replace(LINE_TITLE, '') : s;
  t = bare(t);
  // 卦辭:去掉開頭卦名(本站「乾，元亨…」、維基「乾：元亨…」;艮、履等卦辭本身以卦名起頭,兩邊同去一次)
  if (kind === 'judgment' && t.startsWith(hexName)) t = t.slice(hexName.length);
  return t;
}

function compare(ours: string, wiki: string, hexName: string, kind: 'judgment' | 'line') {
  const o = normalise(ours, hexName, kind);
  const titleOk = kind === 'judgment' || ours.match(LINE_TITLE)?.[1] === wiki.match(LINE_TITLE)?.[1];
  // 卦辭本身以卦名起頭而本站不重複卦名時(艮其背、履虎尾),本站整句對維基去卦名後
  const whole = kind === 'judgment' ? bare(ours) : o;
  return titleOk && readings(wiki).some((w) => [o, whole].includes(normalise(w, hexName, kind)));
}

describe('周易經文 vs 維基文庫(450 條)', () => {
  it('fixture 完整:64 卦辭 + 384 爻 + 用九用六', () => {
    expect(ref.hexagrams).toHaveLength(64);
    expect(ref.hexagrams.reduce((n, h) => n + h.lines.length, 0)).toBe(386);
  });

  it('差異恰為 RULINGS 所列', () => {
    const diffs: Record<string, string> = {};
    ref.hexagrams.forEach((h, idx) => {
      const ours = HEXAGRAM_TEXTS[idx];
      const name = h.name.replace('恒', '恆');
      if (!compare(ours.judgment, h.judgment, name, 'judgment') && !compare(ours.judgment, h.judgment, h.name, 'judgment'))
        diffs[`${h.n}-0`] = `本站 ${ours.judgment} | 維基 ${h.judgment}`;
      const lines = h.lines.filter((l) => !l.startsWith('用'));
      lines.forEach((w, i) => {
        if (!compare(ours.lines[i], w, name, 'line')) diffs[`${h.n}-${i + 1}`] = `本站 ${ours.lines[i]} | 維基 ${w}`;
      });
      h.lines
        .filter((l) => l.startsWith('用'))
        .forEach((w) => {
          const u = h.n === 1 ? USE_NINE : USE_SIX;
          if (!compare(u, w, name, 'line')) diffs[`${h.n}-7`] = `本站 ${u} | 維基 ${w}`;
        });
    });
    expect(Object.keys(diffs).sort(), JSON.stringify(diffs, null, 1)).toEqual(Object.keys(RULINGS).sort());
  });
});
