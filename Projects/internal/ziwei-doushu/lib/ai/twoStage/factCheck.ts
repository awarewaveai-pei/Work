import type { Fact } from './types';

/**
 * 事實核對器(卡 Z2):解讀文字裡提到的「可核對詞」必須出現在這次給模型的 facts 文字裡,否則判定捏造、整份不顯示。
 * 可核對詞由各系統的詞表給(紫微:主星、六吉六煞、祿存天馬、格局名、「星化X」)。共用部分:四位數年份、「N–M歲」年齡區間。
 * 核不到的(宮與星的對應、流月月份、雜曜與流耀、詞表外的自創術語)見 Z2 RISKS。
 */
export interface Vocabulary {
  /** 文字中出現就必須也出現在 facts 裡的詞(星名、格局名…) */
  terms: readonly string[];
  /** 每個命中字串都必須原樣出現在 facts 裡(例:「太陽化祿」) */
  patterns: readonly RegExp[];
  /** patterns 比對前先套在 facts 文字上(紫微:去掉「武曲（平）化權」中間的亮度,才比得到「武曲化權」) */
  normalizeCorpus?: (s: string) => string;
  /** 比對前先從解讀文字遮掉的固定說法(紫微:「紫微斗數」不是提到紫微星;「天馬行空」不是天馬) */
  mask?: readonly string[];
}

export interface FactCheckResult {
  ok: boolean;
  /** 對不到 facts 的詞(去重、依出現順序) */
  unsupported: string[];
}

/** 連字號統一成 '-',全形數字轉半形,讓「26–35歲」與「26-35 歲」比得到。 */
function norm(s: string): string {
  return s
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(/[‐-―−－~～至到]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/(\d)\s+歲/g, '$1歲')
    .replace(/(\d)歲-(?=\d)/g, '$1-'); // 「26歲到35歲」→「26-35歲」
}

/** facts 裡以完整數字出現(前後不接數字),避免「6-25」借「16-25」過關。 */
const hasNumber = (corpus: string, token: string) =>
  new RegExp(`(?<!\\d)${token}(?!\\d)`).test(corpus);

const YEAR = /(?<!\d)(1[89]\d{2}|2[0-2]\d{2})(?!\d)/g;
const AGE_RANGE = /(?<!\d)(\d{1,3})-(\d{1,3})歲/g;

export function checkFacts(text: string, facts: readonly Fact[], vocab: Vocabulary): FactCheckResult {
  const corpus = facts.map((f) => f.value).join('\n');
  const nCorpus = norm(corpus);
  let masked = text;
  for (const m of vocab.mask ?? []) masked = masked.split(m).join('　');
  const nText = norm(masked);
  const bad: string[] = [];
  const miss = (token: string) => {
    if (!bad.includes(token)) bad.push(token);
  };

  // 只看最長的命中:「君臣慶會格」命中時,其中的「君臣慶會」不再另算一次
  const present = vocab.terms.filter((t) => masked.includes(t));
  for (const t of present) {
    if (present.some((o) => o !== t && o.includes(t))) continue;
    if (!corpus.includes(t)) miss(t);
  }
  const pCorpus = vocab.normalizeCorpus ? vocab.normalizeCorpus(corpus) : corpus;
  for (const re of vocab.patterns) {
    for (const m of masked.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`))) {
      if (!pCorpus.includes(m[0])) miss(m[0]);
    }
  }
  for (const m of nText.matchAll(YEAR)) if (!hasNumber(nCorpus, m[1])) miss(m[1]);
  for (const m of nText.matchAll(AGE_RANGE)) if (!hasNumber(nCorpus, `${m[1]}-${m[2]}`)) miss(`${m[1]}-${m[2]}歲`);
  return { ok: bad.length === 0, unsupported: bad };
}
