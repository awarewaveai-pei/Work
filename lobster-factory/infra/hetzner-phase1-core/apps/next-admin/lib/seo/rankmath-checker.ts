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
  /** Actionable improvement hint — only set on failed checks */
  suggestion?: string;
  /**
   * Not applicable to this content type — excluded from score / grade / error counts and rendered
   * neutrally in the panel. The blog flow never sets it (every check is applicable to a long article);
   * the product flow marks blog-only checks (word count, links, multi-H2 AEO …) N/A so a correctly
   * short product page isn't red-graded for lacking article structure. Additive: `checkRankMath`
   * itself never sets `na` — only downstream consumers (lib/studio/product-copy.ts) do.
   */
  na?: boolean;
}

export interface RankMathReport {
  score: number;
  grade: "green" | "orange" | "red";
  checks: RankMathCheck[];
  passed: number;
  total: number;
}

// Each CJK/kana/hangul character counts as one word (no spaces between them).
const CJK_RE = /[　-鿿ꥠ-꥿가-퟿豈-﫿︰-﹏＀-￯]/g;

function countWords(text: string): number {
  const cjkCount = (text.match(CJK_RE) ?? []).length;
  const latinCount = text
    .replace(CJK_RE, " ")
    .split(/\s+/)
    .filter(w => /[a-zA-Z0-9]/.test(w)).length;
  return cjkCount + latinCount;
}

/** True if the string contains any CJK/kana/hangul character. Resets the g-flag lastIndex first. */
function hasCjk(text: string): boolean {
  CJK_RE.lastIndex = 0;
  return CJK_RE.test(text);
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
  // For CJK/kana/hangul-dominant text, every character is a "word" — slice by char
  CJK_RE.lastIndex = 0; // reset g-flag state to avoid cross-request lastIndex drift
  if (CJK_RE.test(plain)) return plain.slice(0, count * 3).toLowerCase();
  return plain.split(/\s+/).slice(0, count).join(" ").toLowerCase();
}

export function checkRankMath(input: RankMathInput): RankMathReport {
  const { markdown, focusKeyword, seoTitle, metaDescription, slug, siteDomain } = input;
  // RankMath treats comma as a separator between multiple focus keywords.
  // Use only the first term for all presence checks (matches RankMath's primary-keyword logic).
  const kwTerms = focusKeyword.toLowerCase().trim().split(/\s*,\s*/).map(s => s.trim()).filter(Boolean);
  const kw = kwTerms[0] ?? focusKeyword.toLowerCase().trim();
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
  const kwIsAsciiSlug = /^[\x00-\x7F]+$/.test(kw);
  // For non-ASCII (CJK) keywords the AI generates an English SLUG_HINT — any non-empty slug is acceptable
  const slugPass = kwIsAsciiSlug
    ? (slug.toLowerCase().includes(kwSlug) || slug.toLowerCase().includes(kw.replace(/\s+/g, "")))
    : slug.length > 0;
  checks.push({
    id: "kw-in-slug",
    label: "Focus keyword in URL slug",
    pass: slugPass,
    detail: slugPass
      ? `slug "${slug}" set (CJK keyword → English slug accepted)`
      : (kwIsAsciiSlug ? `"${kwSlug}" not found in slug "${slug}"` : "No slug set"),
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

  // 7. kw-density (RankMath: occurrences / total words; CJK uses an absolute-count band)
  const kwWords = kw.split(/\s+/);
  const kwIsAscii = /^[\x00-\x7F]+$/.test(kw);
  const kwIsCjk = hasCjk(kw);
  // Whether to judge keyword frequency by an absolute occurrence band instead of a %.
  // Key on the ARTICLE script, not just the keyword: a CJK-language article uses a broken
  // char-based word count, so even an ASCII focus keyword (e.g. an English brand term) must
  // use the occurrence band — otherwise a prompt-compliant 6× keyword reads <0.5% and the UI
  // pushes re-stuffing. Mirrors the generator's language-based isCJK (generate/route.ts).
  const articleIsCjk = kwIsCjk || hasCjk(markdown);
  let kwOccurrences = 0;
  if (kw.length > 0) {
    if (kwWords.length === 1 && kwIsAscii) {
      // ASCII single-word: word-boundary match
      kwOccurrences = (plain.match(new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g")) ?? []).length;
    } else {
      // Multi-word OR CJK: plain substring (\b doesn't work for non-ASCII)
      kwOccurrences = (plain.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
    }
  }
  const density = wordCount > 0 ? kwOccurrences / wordCount : 0;
  const densityPct = Math.round(density * 1000) / 10;
  // CJK: neither RankMath nor this checker can tokenize CJK words, so the % is unreliable.
  // Chasing a 0.5% floor on char-counted CJK forced ~12 keyword uses, which real RankMath
  // reads as ~13% (keyword stuffing). For CJK articles, judge by an absolute occurrence band.
  const densityPass = articleIsCjk
    ? (kwOccurrences >= 2 && kwOccurrences <= 8)
    : (density >= 0.005 && density <= 0.025);
  checks.push({
    id: "kw-density",
    label: articleIsCjk ? "Keyword frequency 2–8 (CJK)" : "Keyword density 0.5%–2.5%",
    pass: densityPass,
    detail: articleIsCjk
      ? `${kwOccurrences} exact occurrences (CJK % unreliable; target 2–8)`
      : `${densityPct}% (${kwOccurrences} occurrences in ${wordCount} words)`,
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
    detail: intPass
      ? `${intlinkCount} internal link(s) found`
      : `No internal links found${!siteDomain ? " (pass siteDomain to count absolute same-site links)" : ""}`,
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

  // 11. title-length (CJK glyphs are ~2× width → a shorter char budget maps to the same pixel width)
  const titleLen = seoTitle.length;
  const titleIsCjk = hasCjk(seoTitle);
  const titleLenPass = titleIsCjk ? (titleLen >= 14 && titleLen <= 30) : (titleLen >= 30 && titleLen <= 60);
  checks.push({
    id: "title-length",
    label: titleIsCjk ? "SEO title 14–30 characters (CJK)" : "SEO title 30–60 characters",
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

  // ── AEO / GEO checks ─────────────────────────────────────────────────────

  // 14. aeo-quick-answer — direct answer capsule (## Quick Answer or localized equivalent)
  const hasQuickAnswer = /^##\s+(Quick Answer|快速解答|快速回答|快速答案|簡短答案)/im.test(markdown);
  checks.push({
    id: "aeo-quick-answer",
    label: "AEO: Quick Answer section present",
    pass: hasQuickAnswer,
    detail: hasQuickAnswer ? "Quick Answer / 快速解答 section found" : "Missing Quick Answer section (or 快速解答 / 快速回答)",
  });

  // 15. aeo-subquery-coverage — ≥4 H2/H3 headings covering multiple sub-topics
  const h2h3Count = (markdown.match(/^#{2,3}\s/gm) ?? []).length;
  const subqueryPass = h2h3Count >= 4;
  checks.push({
    id: "aeo-subquery-coverage",
    label: "AEO: ≥ 4 H2/H3 sub-topic headings",
    pass: subqueryPass,
    detail: `${h2h3Count} H2/H3 headings found (min 4 for AEO coverage)`,
  });

  // 16. aeo-date-signal — content references a year (recency signal for AI engines)
  const dateSignalPass = /\b20[2-9]\d\b/.test(plain);
  checks.push({
    id: "aeo-date-signal",
    label: "AEO: Year/date signal in content",
    pass: dateSignalPass,
    detail: dateSignalPass ? "Year reference found (recency signal)" : "No year reference found",
  });

  // Attach actionable suggestions to failed checks
  const _suggestions: Record<string, string> = {
    "kw-in-title":          `在 SEO 標題前半段加入「${kw}」（例：「${kw}：完整指南」）`,
    "kw-in-meta":           `在 meta 描述前 80 字自然帶入「${kw}」`,
    "kw-in-slug":           `URL slug 加入「${kwSlug}」（例：${kwSlug}-guide）`,
    "kw-in-intro":          `在文章前 150 字的引言自然提及「${kw}」`,
    "kw-in-h2h3":           `在至少一個 H2/H3 標題中加入「${kw}」`,
    "word-count":           `擴充文章到 600+ 字：加入案例、背景說明、FAQ 段落`,
    "kw-density":           articleIsCjk
      ? (kwOccurrences < 2
          ? `精確關鍵字次數偏少（${kwOccurrences} 次）；在標題、引言、一個 H2/H3 各自然帶入一次`
          : `精確關鍵字重複過多（${kwOccurrences} 次）；CJK 密度 % 不可靠，其餘改用同義詞/代名詞，精確關鍵字控制在 2–6 次`)
      : (density < 0.005
          ? `密度偏低（${densityPct}%）；在正文中再自然提及「${kw}」幾次`
          : `密度過高（${densityPct}%）；部分重複改用同義詞或代名詞`),
    "external-links":       `加入 1+ 個外部參考連結（例：[研究來源](https://example.com)）`,
    "internal-links":       `加入 1+ 個站內連結（例：[延伸閱讀](/related-article)）`,
    "para-length":          `${longParas.length} 個段落超過 120 字；拆分成較短段落，每段聚焦一個概念`,
    "title-length":         titleIsCjk
      ? (titleLen < 14
          ? `CJK 標題過短（${titleLen} 字元）；擴展到 14–30 字元，含關鍵字＋力量詞＋阿拉伯數字`
          : `CJK 標題過長（${titleLen} 字元）；縮短到 30 字元以內，避免 RankMath 截斷`)
      : (titleLen < 30
          ? `SEO 標題過短（${titleLen} 字元）；擴展到 30–60 字元`
          : `SEO 標題過長（${titleLen} 字元）；縮短到 60 字元以內`),
    "meta-length":          metaLen < 120
      ? `Meta 描述過短（${metaLen} 字元）；補充到 120–160 字元，加入關鍵字與行動 CTA`
      : `Meta 描述過長（${metaLen} 字元）；截短到 160 字元以內`,
    "slug-length":          `URL slug 過長（${slug.length} 字元）；縮短到 75 字元以內`,
    "aeo-quick-answer":     `加入 ## Quick Answer 段落（文章開頭 2–3 句直接回答問題，方便 AI 引用）`,
    "aeo-subquery-coverage": `增加 H2/H3 小標題（涵蓋更多子問題面向，目前 ${h2h3Count} 個，需至少 4 個）`,
    "aeo-date-signal":      `在內文加入年份或「2024 年研究」等時間標記，提高 AI 引用可信度`,
  };
  checks.forEach(c => { if (!c.pass) c.suggestion = _suggestions[c.id]; });

  const passed = checks.filter(c => c.pass).length;
  const total = checks.length;
  const score = Math.round((passed / total) * 100);
  const grade: RankMathReport["grade"] = score >= 81 ? "green" : score >= 51 ? "orange" : "red";

  return { score, grade, checks, passed, total };
}
