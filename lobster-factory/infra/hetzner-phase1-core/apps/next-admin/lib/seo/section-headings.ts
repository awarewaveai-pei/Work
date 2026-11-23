// The fixed article sections, by the heading names an article may use for them (English or Traditional Chinese).
// One list per section: the writer prompt (lib/content/article/generate-core.ts), the SEO score
// (rankmath-checker.ts) and the WordPress excerpt (lib/content/publish/wordpress-core.ts) all read it, so a
// heading the writer is told to use is always one the readers recognise.
export const SECTION_HEADINGS = {
  quickAnswer: ["Quick Answer", "快速解答", "快速回答", "快速答案", "簡短答案"],
  keyTakeaways: ["Key Takeaways", "重點整理"],
  faq: ["FAQ", "常見問題", "問題解答", "Q&A"],
  conclusion: ["Conclusion", "結論", "結語"],
} as const;
export type ArticleSection = keyof typeof SECTION_HEADINGS;

const alt = (s: ArticleSection): string => SECTION_HEADINGS[s].map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");

/** Matches the section's H2 line start (`## <name>`), any of its names, case-insensitive. */
export function sectionHeadingRe(s: ArticleSection): RegExp {
  return new RegExp(`^##\\s+(?:${alt(s)})`, "im");
}

/** The section's body: the text under its H2 up to the next heading (or the end). Undefined when the section is absent. */
export function sectionBody(markdown: string, s: ArticleSection): string | undefined {
  return markdown.match(new RegExp(`^##\\s+(?:${alt(s)})[^\\n]*\\n([\\s\\S]+?)(?=\\n#{1,6}\\s|$)`, "im"))?.[1];
}
