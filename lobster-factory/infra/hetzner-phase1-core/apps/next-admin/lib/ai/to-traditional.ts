// Convert live LLM output (which often comes back Simplified despite the prompt) to
// Traditional Chinese, server-side, before it reaches the UI. Mirrors the offline curated
// converter (scripts/convert-curated-traditional.py): OpenCC cn→t (standard Traditional, which
// does NOT over-correct proper nouns like 里約/岳飛/濃郁) + a couple of safe Taiwan preferences.
import * as OpenCC from "opencc-js";

const convert = OpenCC.Converter({ from: "cn", to: "t" });

// Safe global Taiwan-preference swaps (each source char has ONE Taiwan target, no context risk).
const TW_PREF: ReadonlyArray<readonly [RegExp, string]> = [
  [/麪/g, "麵"],
  [/裏/g, "裡"],
];

/** S→T for a single string. ASCII/English passes through unchanged. */
export function toTraditional(s: string): string {
  if (!s) return s;
  let t = convert(s);
  for (const [re, rep] of TW_PREF) t = t.replace(re, rep);
  return t;
}
