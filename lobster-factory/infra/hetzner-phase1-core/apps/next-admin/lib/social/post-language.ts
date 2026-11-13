// The language a social post is written in (2026-11-13: a pipeline post came back in English from a Chinese article).
// Invariant: a post's language = its source text's language, read here from the writing system with no AI and no
// library; the site's content language (brand-voice siteLanguage, default 繁體中文) decides only when the source is
// too short to tell. The writer states it in the prompt and every answer is checked with the same reading
// (write-posts.ts), so a post in another language is never handed out as usable.

export type Script = "zh" | "ja" | "ko" | "latin";

const MIN_UNITS = 3;

/** Code, URLs, @handles, #hashtags and the [LINK] placeholder say nothing about the language a post is written in. */
const strip = (text: string) => text.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ").replace(/https?:\/\/\S+/g, " ")
  .replace(/[#@][^\s#@]+/g, " ").replace(/\[LINK\]/g, " ");

/** The writing system most of the text is in; null = too little to tell. Counted in word-sized units: two Han
 *  characters (a Chinese word is about two), each kana or Hangul syllable, and each Latin word that starts lower case.
 *  A capitalised Latin word is a name (Claude, TypeScript, React) and says nothing about the sentence around it;
 *  English sentences are carried by lower-case words (can, the, and). Measured on both 2026-11-13 cases:
 *  「萬聖節親子活動 can teach feelings, not just fun ...」 = English, 「用 Claude Code 和 Cursor 寫 TypeScript，效率翻倍」 = Chinese. */
export function scriptOf(text: string): Script | null {
  const s = strip(text);
  const n = (re: RegExp) => s.match(re)?.length ?? 0;
  const han = n(/\p{Script=Han}/gu) / 2, kana = n(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu), hangul = n(/\p{Script=Hangul}/gu);
  const latin = n(/(?<!\p{Script=Latin})\p{Ll}[\p{Script=Latin}'’]*/gu);
  const total = han + kana + hangul + latin;
  if (total < MIN_UNITS) return null;
  if (kana / total >= 0.1) return "ja";
  if (hangul / total >= 0.3) return "ko";
  if (han / total >= 0.3) return "zh";
  return latin > 0 ? "latin" : null;
}

/** The script a language name is written in: the site setting is free text (繁體中文, English, 日本語, zh-TW ...). */
export function scriptOfLanguage(language: string): Script {
  const l = language.trim().toLowerCase();
  if (/中文|繁中|簡中|简中|漢語|汉语|華語|华语|華文|华文|chinese|^zh\b/.test(l)) return "zh";
  if (/日本|日文|日語|日语|japanese|^ja\b/.test(l)) return "ja";
  if (/한국|韓|korean|^ko\b/.test(l)) return "ko";
  return "latin";
}

const NAME: Record<Script, string> = { zh: "繁體中文", ja: "日本語", ko: "한국어", latin: "English" };

/** The language to write posts in: the source's, named the site's way when the site's language is in the same script. */
export function postLanguage(source: string, siteLanguage: string): string {
  const s = scriptOf(source);
  if (!s) return siteLanguage;
  return scriptOfLanguage(siteLanguage) === s ? siteLanguage : NAME[s];
}

/** A text too short to read counts as matching: the check refuses only what is clearly in another language. */
export function inLanguage(text: string, language: string): boolean {
  const s = scriptOf(text);
  return s === null || s === scriptOfLanguage(language);
}
