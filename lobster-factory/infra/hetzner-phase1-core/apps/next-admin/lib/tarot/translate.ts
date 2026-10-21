// Subject / style text → English, once per deck. Image models read English only; the UI calls this
// before the preview and at lock time, keeps the result in state, and every card reuses it.
// Never call it per card: 78 calls for one phrase is waste and can drift between cards.

export const TRANSLATE_MAX_CHARS = 500;

// Any letter outside the Latin script (Han, kana, Hangul, Cyrillic, Thai…). RegExp constructor because
// tsconfig targets ES2017, which rejects u-flag property escapes in a regex literal.
const NON_LATIN_LETTER = new RegExp(String.raw`(?!\p{Script=Latin})\p{L}`, "u");

export function needsEnglish(text: string): boolean {
  return NON_LATIN_LETTER.test(text);
}

export type TranslateFn = (text: string) => Promise<string>;

/** Translates each non-empty field that has non-Latin letters; English fields pass through without a call. */
export async function translateForDeck(
  input: { subject: string; style: string },
  translate: TranslateFn,
): Promise<{ subject: string; style: string }> {
  const one = async (t: string) => (needsEnglish(t) ? (await translate(t.trim())).trim() : t);
  return { subject: await one(input.subject), style: await one(input.style) };
}
