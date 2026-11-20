// One definition of "the focus keyword is in this text", shared by the Rank Math checker (rankmath-checker.ts), the topic
// review (topics/review.ts) and the article prompt (generate-core.ts), so the prompt never asks for what the check
// would not count. Chinese and Japanese are written without spaces between words: a keyword stored as 「感恩節 心理學」
// counts in 「感恩節的心理學」, so the model never has to copy the space into a title to pass (2026-11-20 live article
// 「感恩節 心理學：7 個 有效 感恩任務…」). Keywords without Han/kana (English, Korean, …) match verbatim, as before.

/** Scripts written without spaces between words. Hangul is left out: Korean separates words with spaces. */
const UNSPACED = "\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}";
const UNSPACED_CHAR = new RegExp(`[${UNSPACED}]`, "u");
/** Half-width spaces between two Han/kana characters: the gap a reader sees as a stray space. The full-width space
 *  (U+3000) is left out: Japanese titles use it as a deliberate separator. */
const UNSPACED_GAP = new RegExp(`[${UNSPACED}][ \\t]+(?=[${UNSPACED}])`, "gu");
/** At most two Han/kana characters between the keyword's words (的／之／與／中的); punctuation never joins them, so
 *  「感恩節。心理學」 is two sentences, not the keyword. */
const JOIN = `[${UNSPACED}]{0,2}?`;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True when the keyword is written in a script without spaces between words (Chinese, Japanese). */
export const isUnspacedKeyword = (kw: string) => UNSPACED_CHAR.test(kw);

/** For an unspaced keyword: text and keyword compared with every space removed, the keyword's words in order with JOIN
 *  between them. Otherwise null (verbatim substring, the old behaviour). */
function unspacedPattern(kw: string): RegExp | null {
  if (!isUnspacedKeyword(kw)) return null;
  const parts = kw.toLowerCase().split(/\s+/).filter(Boolean);
  return parts.length ? new RegExp(parts.map(esc).join(JOIN), "gu") : null;
}
const squash = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/** Where the keyword first starts, and the length of the text it was looked for in (both in the compared form, so a
 *  "first half of the title" check stays consistent); index -1 = not there. */
export function keywordPosition(text: string, kw: string): { index: number; length: number } {
  const re = unspacedPattern(kw);
  if (!re) return { index: text.toLowerCase().indexOf(kw.toLowerCase()), length: text.length };
  const t = squash(text);
  return { index: t.search(re), length: t.length };
}

export const containsKeyword = (text: string, kw: string) => kw.trim() !== "" && keywordPosition(text, kw).index >= 0;

/** Non-overlapping occurrences. Verbatim keywords: plain substring count, as the checker counted them before. */
export function countKeyword(text: string, kw: string): number {
  const re = unspacedPattern(kw);
  if (!re) return kw ? (text.toLowerCase().match(new RegExp(esc(kw.toLowerCase()), "g")) ?? []).length : 0;
  return (squash(text).match(re) ?? []).length;
}

/** Each place a space sits between two Han/kana characters, with a little context (「感恩節 心理學」). [] = none. */
export function unspacedWordGaps(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(UNSPACED_GAP)) {
    const end = (m.index ?? 0) + m[0].length;
    found.push(text.slice(Math.max(0, (m.index ?? 0) - 2), end + 3).trim());
  }
  return found;
}

/** The rule as the article prompt states it; the review's title check (topics/review.ts) enforces the same thing. */
export const UNSPACED_TITLE_RULE =
  "• NATURAL CJK WRITING (overrides any formatting advice elsewhere): titles (H1, SEO_TITLE) and headings are one natural sentence a person reads — never put a space between two Chinese/Japanese words. A space in the primary keyword only separates its words: write them the way a native writer would, e.g. keyword「感恩節 心理學」→ title「感恩節的心理學：…」, never「感恩節 心理學：…」. The SEO checker counts the keyword with spaces ignored and up to two joining characters（的／之／與）between its words, so no space is needed for it to count. Power words, emotion words and numbers sit inside the sentence too（「7個有效的感恩練習」, not「7 個 有效 感恩練習」）. FOCUS_KEYWORD stays exactly as provided.";
