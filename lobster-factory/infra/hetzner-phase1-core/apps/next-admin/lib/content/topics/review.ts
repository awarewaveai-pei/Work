// The rule check a topic's drafts pass before anything may go out without a person (plan I5). Pure: each part is checked
// when it is made and its checks are stored with it (content_topics.artifacts), so a retry that keeps a made part keeps
// its checks too; the topic's review (content_topics.review) is all parts' checks together.
import type { RankMathReport } from "@/lib/seo/rankmath-checker";
import { parseArticleMeta } from "@/lib/content/article/meta";
import { unspacedWordGaps } from "@/lib/seo/keyword-match";

/** Below this the article is a broken generation, not a short one (CJK and Latin both: characters of body text). */
export const MIN_BODY_CHARS = 1000;

export type ReviewCheck = { name: "complete" | "length" | "seo" | "forbidden" | "social" | "social_forbidden" | "required" | "title_spacing" | "cover"; pass: boolean; detail: string };
/** A type, not an interface: it is stored in content_topics.review (Topic.review is a plain record). */
export type TopicReview = { pass: boolean; checks: ReviewCheck[]; at: string };

/** Text as a reader sees it, without spaces and markdown marks: what length counts and what a forbidden term in a script
 *  written without spaces (Chinese, Japanese) is matched in. */
const norm = (s: string) => s.toLowerCase().replace(/[\s#>*_`|~-]/g, "");
/** Markdown without what a reader never sees: comments and link targets. */
const shownText = (md: string) => md.replace(/<!--[\s\S]*?-->/g, "").replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1");
const bodyText = (md: string) => norm(shownText(md));
/** A term of Latin letters only ("treat", "guaranteed results") is matched as whole words, the last one with its common
 *  endings (treats, treated, treating, curing): the space-blind match would also stop "treatment", "retreat" and "secure"
 *  (for "cure"), and a site on auto publish would never publish. Any other term keeps the space-blind match. */
const LATIN_TERM = /^[a-z0-9]+(?:[\s'-]+[a-z0-9]+)*$/;
function wordPattern(term: string): RegExp {
  const words = term.split(/[\s'-]+/);
  const last = words.pop() as string;
  const tail = last.endsWith("e") ? `(?:${last}(?:s|d)?|${last.slice(0, -1)}ing)` : `${last}(?:s|es|d|ed|ing)?`;
  return new RegExp(`(?<![a-z0-9])${[...words, tail].join("[\\s'-]+")}(?![a-z0-9])`);
}
/** shown = text with its spaces; emphasis marks are dropped so "**treat**" is still the word. */
function hits(forbidden: string[], shown: string): string[] {
  const words = shown.toLowerCase().replace(/[*_`~]/g, "");
  const packed = norm(shown);
  return forbidden.filter((t) => {
    const term = t.trim().toLowerCase();
    if (!norm(term)) return false;
    return LATIN_TERM.test(term) ? wordPattern(term).test(words) : packed.includes(norm(term));
  });
}
const forbiddenDetail = (found: string[]) => (found.length ? `出現禁用說法：${found.join("、")}` : "沒有禁用說法");

/** Width-folded too (NFKC: full-width letters, digits and punctuation = half-width), for the must-carry paragraphs only, so
 *  "１９２５" in the article matches "1925" in the setting; the other checks keep norm() as it was. */
const normWide = (s: string) => norm(s.normalize("NFKC"));
/** A required paragraph's short name for the reason line. */
const blockLabel = (b: string) => (b.length > 20 ? `${b.slice(0, 20)}…` : b);

/** The titles a reader sees: the SEO title and every heading (H1–H4). Stray spaces between Chinese/Japanese words in any
 *  of them = the keyword was pasted in instead of written into the sentence (keyword-match.ts UNSPACED_TITLE_RULE). */
function titleSpacingCheck(markdown: string): ReviewCheck {
  const titles = [parseArticleMeta(markdown)?.seoTitle ?? "", ...markdown.split("\n").filter((l) => /^#{1,4}\s/.test(l)).map((l) => l.replace(/^#+\s+/, ""))];
  const gaps = titles.flatMap(unspacedWordGaps);
  return { name: "title_spacing", pass: !gaps.length,
    detail: gaps.length ? `標題的中文詞之間有空格（像硬塞關鍵字）：${gaps.slice(0, 3).map((g) => `「${g}」`).join("、")}` : "標題是自然的句子" };
}

/** required = the site's must-carry paragraphs (requiredBlocks()); none set = no check added, the list is as before. */
export function articleChecks(markdown: string, report: RankMathReport | null, forbidden: string[], required: string[] = []): ReviewCheck[] {
  const marker = /<!-- GENERATION_(ERROR|TRUNCATED):/.test(markdown);
  const text = bodyText(markdown);
  const found = hits(forbidden, shownText(markdown));
  const checks: ReviewCheck[] = [
    { name: "complete", pass: !marker, detail: marker ? "文章沒有寫完" : "文章完整" },
    { name: "length", pass: text.length >= MIN_BODY_CHARS, detail: `內文 ${text.length} 字（至少 ${MIN_BODY_CHARS}）` },
    { name: "seo", pass: report?.grade === "green", detail: report ? `SEO ${report.score} 分（綠燈才算過）` : "沒有 SEO 檢測結果" },
    { name: "forbidden", pass: !found.length, detail: forbiddenDetail(found) },
    titleSpacingCheck(markdown),
  ];
  const wanted = required.filter((b) => normWide(b));
  if (wanted.length) {
    // Counts only if a reader sees it whole in the published post: the meta block publishing drops (markdown-to-blocks.ts:87,
    // wordpress-core.ts:110) and link targets are not shown, and it must sit inside one paragraph (Codex 274b1c6e F2, effcd83c F1/F2).
    const shown = markdown.replace(/<!-- CONTENT_META_START -->[\s\S]*?<!-- CONTENT_META_END -->/g, "");
    const paragraphs = shown.split(/\n\s*\n/).map((p) => normWide(bodyText(p)));
    const missing = wanted.filter((b) => !paragraphs.some((p) => p.includes(normWide(b))));
    checks.push({ name: "required", pass: !missing.length,
      detail: missing.length ? `缺少必附段落：${missing.map((b) => `「${blockLabel(b)}」`).join("、")}` : `必附段落 ${wanted.length} 段都有` });
  }
  return checks;
}

/** The site's paragraphs now that the article's check did not look for (checked = what it looked for; absent = made
 *  before N1b, looked for none), short-labelled. A site with none set = [], so auto publish is as before (Codex 274b1c6e F1). */
export function uncheckedRequired(checked: string[] | undefined, now: string[]): string[] {
  const had = new Set((checked ?? []).map(normWide));
  return now.filter((b) => normWide(b) && !had.has(normWide(b))).map((b) => `「${blockLabel(b)}」`);
}

/** texts = the channels' own posts; problems = what the writer could not do. */
export function socialChecks(s: { texts: string[]; channels: number; problems: string[] }, forbidden: string[]): ReviewCheck[] {
  const found = hits(forbidden, s.texts.join("\n"));
  return [
    { name: "social", pass: s.channels > 0 && !s.problems.length,
      detail: s.channels ? (s.problems.length ? s.problems.join("；") : `${s.channels} 個頻道都有貼文`) : "沒有已連接的社群頻道" },
    { name: "social_forbidden", pass: !found.length, detail: forbiddenDetail(found) },
  ];
}

export function reviewOf(checks: ReviewCheck[], now: Date): TopicReview {
  return { pass: checks.length > 0 && checks.every((c) => c.pass), checks, at: now.toISOString() };
}
