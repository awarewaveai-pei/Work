export interface RankMathInput {
  markdown: string;
  focusKeyword: string;
  seoTitle: string;
  metaDescription: string;
  slug: string;
  /** Optional: base domain used to distinguish internal vs external links, e.g. "soulfulexpression.org" */
  siteDomain?: string;
}

export interface RankMathCheck {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
}

export interface RankMathReport {
  score: number;
  grade: "green" | "orange" | "red";
  checks: RankMathCheck[];
  passed: number;
  total: number;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function stripMarkdown(md: string): string {
  return md
    .replace(/!\[.*?\]\(.*?\)/g, "")  // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")  // links → anchor text
    .replace(/#{1,6}\s+/g, "")        // headings
    .replace(/[`*_~>|]/g, "")         // inline markup
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function getHeadingLines(md: string, level: 2 | 3 | "both"): string[] {
  const lines = md.split("\n");
  return lines.filter(line => {
    if (level === 2) return /^##\s/.test(line);
    if (level === 3) return /^###\s/.test(line);
    return /^##\s/.test(line) || /^###\s/.test(line);
  });
}

function getParagraphs(md: string): string[] {
  // Paragraphs are blocks separated by blank lines, excluding heading/list/code lines
  return md
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(block =>
      block.length > 0 &&
      !/^#{1,6}\s/.test(block) &&
      !/^```/.test(block) &&
      !/^\|/.test(block) &&
      !/^[-*+]\s/.test(block) &&
      !/^\d+\.\s/.test(block)
    );
}

function getIntroWords(md: string, count = 150): string {
  const plain = stripMarkdown(md);
  return plain.split(/\s+/).slice(0, count).join(" ").toLowerCase();
}

export function checkRankMath(input: RankMathInput): RankMathReport {
  const { markdown, focusKeyword, seoTitle, metaDescription, slug, siteDomain } = input;
  const kw = focusKeyword.toLowerCase().trim();
  const kwSlug = kw.replace(/\s+/g, "-");
  const plain = stripMarkdown(markdown).toLowerCase();
  const checks: RankMathCheck[] = [];

  // 1. kw-in-title
  checks.push({
    id: "kw-in-title",
    label: "Focus keyword in SEO title",
    pass: seoTitle.toLowerCase().includes(kw),
    detail: seoTitle.toLowerCase().includes(kw)
      ? `"${kw}" found in title`
      : `"${kw}" not found in title: "${seoTitle}"`,
  });

  // 2. kw-in-meta
  checks.push({
    id: "kw-in-meta",
    label: "Focus keyword in meta description",
    pass: metaDescription.toLowerCase().includes(kw),
    detail: metaDescription.toLowerCase().includes(kw)
      ? `"${kw}" found in meta description`
      : `"${kw}" not found in meta description`,
  });

  // 3. kw-in-slug
  const slugPass = slug.toLowerCase().includes(kwSlug) || slug.toLowerCase().includes(kw.replace(/\s+/g, ""));
  checks.push({
    id: "kw-in-slug",
    label: "Focus keyword in URL slug",
    pass: slugPass,
    detail: slugPass ? `"${kwSlug}" found in slug "${slug}"` : `"${kwSlug}" not found in slug "${slug}"`,
  });

  // 4. kw-in-intro
  const intro = getIntroWords(markdown, 150);
  const introPass = intro.includes(kw);
  checks.push({
    id: "kw-in-intro",
    label: "Focus keyword in first 150 words",
    pass: introPass,
    detail: introPass ? `"${kw}" appears in intro` : `"${kw}" not found in first 150 words`,
  });

  // 5. kw-in-h2h3
  const headings = getHeadingLines(markdown, "both");
  const headingPass = headings.some(h => h.toLowerCase().includes(kw));
  checks.push({
    id: "kw-in-h2h3",
    label: "Focus keyword in H2 or H3 heading",
    pass: headingPass,
    detail: headingPass
      ? `"${kw}" found in heading`
      : `"${kw}" not found in any H2/H3 (${headings.length} headings total)`,
  });

  // 6. word-count
  const wordCount = countWords(plain);
  const wcPass = wordCount >= 600;
  checks.push({
    id: "word-count",
    label: "Content length ≥ 600 words",
    pass: wcPass,
    detail: `${wordCount} words (min 600)`,
  });

  // 7. kw-density
  const kwWords = kw.split(/\s+/);
  let kwOccurrences = 0;
  if (kwWords.length === 1) {
    kwOccurrences = (plain.match(new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g")) ?? []).length;
  } else {
    kwOccurrences = (plain.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
  }
  const density = wordCount > 0 ? (kwOccurrences * kwWords.length) / wordCount : 0;
  const densityPct = Math.round(density * 1000) / 10;
  const densityPass = density >= 0.005 && density <= 0.025;
  checks.push({
    id: "kw-density",
    label: "Keyword density 0.5%–2.5%",
    pass: densityPass,
    detail: `${densityPct}% (${kwOccurrences} occurrences in ${wordCount} words)`,
  });

  // 8. external-links
  const externalLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  const externalLinks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = externalLinkPattern.exec(markdown)) !== null) {
    const url = m[2];
    if (!siteDomain || !url.includes(siteDomain)) {
      externalLinks.push(url);
    }
  }
  const extPass = externalLinks.length >= 1;
  checks.push({
    id: "external-links",
    label: "At least 1 external link",
    pass: extPass,
    detail: extPass ? `${externalLinks.length} external link(s) found` : "No external links found",
  });

  // 9. internal-links
  const internalLinkPattern = /\[([^\]]+)\]\((\/[^)]*|https?:\/\/(?:[^)]*?))\)/g;
  let intlinkCount = 0;
  while ((m = internalLinkPattern.exec(markdown)) !== null) {
    const url = m[2];
    if (url.startsWith("/") || (siteDomain && url.includes(siteDomain))) {
      intlinkCount++;
    }
  }
  const intPass = intlinkCount >= 1;
  checks.push({
    id: "internal-links",
    label: "At least 1 internal link",
    pass: intPass,
    detail: intPass ? `${intlinkCount} internal link(s) found` : "No internal links found",
  });

  // 10. para-length
  const paragraphs = getParagraphs(markdown);
  const longParas = paragraphs.filter(p => countWords(p) > 120);
  const paraPass = longParas.length === 0;
  checks.push({
    id: "para-length",
    label: "All paragraphs ≤ 120 words",
    pass: paraPass,
    detail: paraPass
      ? `All ${paragraphs.length} paragraphs within limit`
      : `${longParas.length} paragraph(s) exceed 120 words`,
  });

  // 11. title-length
  const titleLen = seoTitle.length;
  const titleLenPass = titleLen >= 30 && titleLen <= 60;
  checks.push({
    id: "title-length",
    label: "SEO title 30–60 characters",
    pass: titleLenPass,
    detail: `${titleLen} characters`,
  });

  // 12. meta-length
  const metaLen = metaDescription.length;
  const metaLenPass = metaLen >= 120 && metaLen <= 160;
  checks.push({
    id: "meta-length",
    label: "Meta description 120–160 characters",
    pass: metaLenPass,
    detail: `${metaLen} characters`,
  });

  // 13. slug-length
  const slugLenPass = slug.length <= 75;
  checks.push({
    id: "slug-length",
    label: "URL slug ≤ 75 characters",
    pass: slugLenPass,
    detail: `${slug.length} characters`,
  });

  const passed = checks.filter(c => c.pass).length;
  const total = checks.length;
  const score = Math.round((passed / total) * 100);
  const grade: RankMathReport["grade"] = score >= 81 ? "green" : score >= 51 ? "orange" : "red";

  return { score, grade, checks, passed, total };
}
