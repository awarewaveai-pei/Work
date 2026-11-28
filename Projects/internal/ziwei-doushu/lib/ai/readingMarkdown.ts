/**
 * AI 解讀文字 → 排版結構(components/ReadingText.tsx 畫出來)。只認模型常用的幾種 markdown:
 * 標題 #…、段落、粗體 **x**／__x__、斜體 *x*、條列 - * + 與 1. 1)、分隔線 --- *** ___、引用 >、程式碼 `x`／```區塊```。
 * 安全邊界:結果只有「字串 + 結構種類」,沒有任何 HTML、屬性或網址;畫面端只輸出 React 文字節點,
 * 所以文字裡的 <script>、<img onerror>、javascript: 永遠只是字。連結 [字](網址) 只留字、不做成連結。
 * 不認得的語法(表格等)照原文當一般文字;未閉合的記號(串流半途、模型漏寫)照原文顯示,不吞字。
 */

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'strong'; c: Inline[] }
  | { t: 'em'; c: Inline[] };

/** 一行 = 一串行內片段;段落、引用、條列項目都可能有多行(行內換行保留)。 */
export type Line = Inline[];

export type Block =
  | { t: 'heading'; level: 1 | 2; c: Line }
  | { t: 'para'; lines: Line[] }
  | { t: 'list'; ordered: boolean; start: number; items: Line[][] }
  | { t: 'quote'; lines: Line[] }
  | { t: 'code'; lines: string[] }
  | { t: 'hr' };

const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t#]*$/;
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const BULLET = /^[ \t]*([-*+])[ \t]+(.*)$/;
const ORDERED = /^[ \t]*(\d{1,3})[.)][ \t]+(.*)$/;
const QUOTE = /^ {0,3}>[ \t]?(.*)$/;
const FENCE = /^ {0,3}(```|~~~)/;

export function parseReading(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    // 收尾只認單獨一行的同一種記號(```lang 之類帶字的行是內容,不是收尾)
    const close = fence ? lines.findIndex((l, j) => j > i && l.trim() === fence[1]) : -1;
    if (close > i) {
      out.push({ t: 'code', lines: lines.slice(i + 1, close) });
      i = close + 1;
      continue;
    } // 沒有收尾的 ``` = 未閉合記號,下面當一般段落照原文顯示
    const h = HEADING.exec(line);
    if (h) {
      out.push({ t: 'heading', level: h[1].length <= 2 ? 1 : 2, c: parseInline(h[2]) });
      i++;
      continue;
    }
    if (HR.test(line)) {
      out.push({ t: 'hr' });
      i++;
      continue;
    }
    if (QUOTE.test(line)) {
      const q: Line[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) q.push(parseInline(QUOTE.exec(lines[i++])![1]));
      out.push({ t: 'quote', lines: q });
      continue;
    }
    const bullet = BULLET.exec(line);
    const ordered = bullet ? null : ORDERED.exec(line);
    if (bullet || ordered) {
      const isOrdered = !bullet;
      // 編號清單從模型寫的第一個數字開始:空行或說明段隔開的「1. … 2. …」不會兩段都從 1 起算
      const start = ordered ? Number(ordered[1]) : 1;
      const items: Line[][] = [];
      while (i < lines.length) {
        const l = lines[i];
        const m = isOrdered ? ORDERED.exec(l) : BULLET.exec(l);
        if (m) {
          items.push([parseInline(m[2])]);
          i++;
        } else if (/^[ \t]+\S/.test(l) && !HR.test(l) && !(isOrdered ? BULLET : ORDERED).test(l)) {
          items[items.length - 1].push(parseInline(l.trim())); // 項目的續行
          i++;
        } else break;
      }
      out.push({ t: 'list', ordered: isOrdered, start, items });
      continue;
    }
    const para: Line[] = [parseInline(lines[i++].trim())]; // 第一行一定收(可能是沒收尾的 ```)
    while (i < lines.length && lines[i].trim() !== '' && !startsBlock(lines[i])) para.push(parseInline(lines[i++].trim()));
    out.push({ t: 'para', lines: para });
  }
  return out;
}

function startsBlock(l: string): boolean {
  return HEADING.test(l) || HR.test(l) || QUOTE.test(l) || BULLET.test(l) || ORDERED.test(l) || FENCE.test(l);
}

/** 行內:**粗**／__粗__、*斜*、`碼`(去掉反引號)、[字](網址)(只留字)。找不到收尾的記號照原文。 */
export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push({ t: 'text', v: buf });
    buf = '';
  };
  let i = 0;
  while (i < s.length) {
    const two = s.slice(i, i + 2);
    if (s.startsWith('***', i)) {
      const end = s.indexOf('***', i + 3);
      if (end > i + 3) {
        flush();
        out.push({ t: 'strong', c: [{ t: 'em', c: parseInline(s.slice(i + 3, end)) }] });
        i = end + 3;
        continue;
      }
    }
    if (two === '**' || two === '__') {
      const end = s.indexOf(two, i + 2);
      if (end > i + 2) {
        flush();
        out.push({ t: 'strong', c: parseInline(s.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    } else if (s[i] === '*' && s[i + 1] !== ' ' && s[i + 1] !== undefined) {
      const end = findSingle(s, i + 1);
      if (end > i + 1) {
        flush();
        out.push({ t: 'em', c: parseInline(s.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    } else if (s[i] === '`') {
      const end = s.indexOf('`', i + 1);
      if (end > i + 1) {
        buf += s.slice(i + 1, end);
        i = end + 1;
        continue;
      }
    } else if (s[i] === '[') {
      const m = /^\[([^\]\n]+)\]\((?:[^()\s]|\([^()\s]*\))*\)/.exec(s.slice(i)); // 網址可含一層括號
      if (m) {
        buf += m[1];
        i += m[0].length;
        continue;
      }
    }
    buf += s[i++];
  }
  flush();
  return out;
}

/** 單一 * 的收尾:下一個不在空白後、也不是 ** 的 *。 */
function findSingle(s: string, from: number): number {
  for (let j = from; j < s.length; j++) {
    if (s[j] === '*' && s[j + 1] !== '*' && s[j - 1] !== ' ' && s[j - 1] !== '*') return j;
  }
  return -1;
}
