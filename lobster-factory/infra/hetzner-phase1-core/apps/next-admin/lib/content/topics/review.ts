// The rule check a topic's drafts pass before anything may go out without a person (plan I5). Pure: each part is checked
// when it is made and its checks are stored with it (content_topics.artifacts), so a retry that keeps a made part keeps
// its checks too; the topic's review (content_topics.review) is all parts' checks together.
import type { RankMathReport } from "@/lib/seo/rankmath-checker";

/** Below this the article is a broken generation, not a short one (CJK and Latin both: characters of body text). */
export const MIN_BODY_CHARS = 1000;

export type ReviewCheck = { name: "complete" | "length" | "seo" | "forbidden" | "social" | "social_forbidden"; pass: boolean; detail: string };
/** A type, not an interface: it is stored in content_topics.review (Topic.review is a plain record). */
export type TopicReview = { pass: boolean; checks: ReviewCheck[]; at: string };

/** Text as a reader sees it, without spaces and markdown marks: what length counts and what a forbidden term is matched in. */
const norm = (s: string) => s.toLowerCase().replace(/[\s#>*_`|~-]/g, "");
const bodyText = (md: string) => norm(md.replace(/<!--[\s\S]*?-->/g, "").replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1"));
const hits = (forbidden: string[], text: string) => forbidden.filter((t) => norm(t) && text.includes(norm(t)));
const forbiddenDetail = (found: string[]) => (found.length ? `出現禁用說法：${found.join("、")}` : "沒有禁用說法");

export function articleChecks(markdown: string, report: RankMathReport | null, forbidden: string[]): ReviewCheck[] {
  const marker = /<!-- GENERATION_(ERROR|TRUNCATED):/.test(markdown);
  const text = bodyText(markdown);
  const found = hits(forbidden, text);
  return [
    { name: "complete", pass: !marker, detail: marker ? "文章沒有寫完" : "文章完整" },
    { name: "length", pass: text.length >= MIN_BODY_CHARS, detail: `內文 ${text.length} 字（至少 ${MIN_BODY_CHARS}）` },
    { name: "seo", pass: report?.grade === "green", detail: report ? `SEO ${report.score} 分（綠燈才算過）` : "沒有 SEO 檢測結果" },
    { name: "forbidden", pass: !found.length, detail: forbiddenDetail(found) },
  ];
}

/** texts = the channels' own posts; problems = what the writer could not do. */
export function socialChecks(s: { texts: string[]; channels: number; problems: string[] }, forbidden: string[]): ReviewCheck[] {
  const found = hits(forbidden, s.texts.map(norm).join("\n"));
  return [
    { name: "social", pass: s.channels > 0 && !s.problems.length,
      detail: s.channels ? (s.problems.length ? s.problems.join("；") : `${s.channels} 個頻道都有貼文`) : "沒有已連接的社群頻道" },
    { name: "social_forbidden", pass: !found.length, detail: forbiddenDetail(found) },
  ];
}

export function reviewOf(checks: ReviewCheck[], now: Date): TopicReview {
  return { pass: checks.length > 0 && checks.every((c) => c.pass), checks, at: now.toISOString() };
}
