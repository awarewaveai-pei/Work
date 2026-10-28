import { loadAnthropic, type Anthropic, providerUrl } from "@/lib/ai/gateway";
import { grantFor } from "@/lib/entitlements/grant";
import { DEFAULT_AI_TEXT_MODEL, isOpenAiTextModel, normalizeAiTextModel, type AiTextModel } from "../../ai/text-model-options";
import { billedOrgId, logAiCall, openaiUsageTokens, type OpenAiUsageLike } from "../../ai/log-ai-call";
import { claudeFallback, claudeParams } from "../../ai/gateway";
import { textCallCostUsd, resolveTextRate } from "../../ai/cost-calculator";
import { fetchRemotePageText } from "@/lib/collect/net/remote-file";

// Output token budgets. Raised 2026-06-16: the old medium=4096 truncated rich articles
// (tables + nested H3 + lists) mid-sentence, cutting off the trailing CONTENT_META block →
// empty SEO title/description → RankMath score collapsed. Headroom now fits article + meta.
const SIZE_TOKENS: Record<string, number> = { short: 4096, medium: 8192, long: 16384 };
const SIZE_WORDS: Record<string, string>  = { short: "~1200", medium: "~2500", long: "~4000" };

const AI_WORDS_BASIC = [
  "Additionally", "Furthermore", "Moreover", "In conclusion",
  "It's worth noting", "It's important to note", "Delve into",
  "Comprehensive", "Leverage", "Utilize", "Navigating", "Showcasing",
];
const AI_WORDS_EXTENDED = [
  ...AI_WORDS_BASIC,
  "Multifaceted", "Nuanced", "In the realm of", "In today's world",
  "In today's digital age", "Ever-evolving", "Vibrant", "Foster",
  "Facilitate", "Paramount", "Subsequently", "Accordingly",
  "Harnessing", "Elevating", "Robust", "Seamlessly", "Transformative",
];

const SYSTEM_PROMPT = `You are a professional SEO/GEO content writer. Write a complete, publication-ready article in Markdown.

⚠️ NON-NEGOTIABLE RULES (enforce BEFORE writing any section):
A. ## Quick Answer MUST be the FIRST H2 in every article — regardless of article type (listicle, how-to, pillar, comparison) — UNLESS the user instructions explicitly say "DO NOT include a Quick Answer section". If no such instruction appears, do NOT skip it, do NOT reorder it. If you feel tempted to start directly with a numbered list or body section, STOP — insert ## Quick Answer first.
B. EXACT KEYWORD CAP: write the exact focus keyword at most 4–6 times in the WHOLE article. After 6 uses, replace every further occurrence with a synonym, partial phrase, or pronoun. NEVER exceed 6 exact occurrences total.
C. META DESCRIPTION LENGTH (for CJK): must be exactly 60–80 characters — count every character before writing. A 47-char meta is too short; a 160-char meta is truncated. Aim for 65–75 chars.

DEFAULT OUTPUT FORMAT (follow unless overridden in user instructions):
1. # H1 title — the article's ONLY H1: use "# " exactly once, on the very first line, and NEVER use "# " (single-hash heading) again anywhere in the body. MUST satisfy all 4 RankMath Title Readability tests:
   • Primary keyword in first 50% of the title
   • Include a POWER WORD matching the article's LANGUAGE — English: ultimate / proven / essential / expert / complete / effective / simple / step-by-step / critical / best. For CJK languages, a localized power-word list is supplied in the instructions below — use one of those (the English list will not register).
   • Include a NUMBER — write it as an Arabic digit (7, 5, 10, 2026), never spelled out or as a CJK numeral (七/五), because RankMath's number test only detects digits. Required for list/how-to articles; omit only when a number would genuinely distort the topic.
   • SENTIMENT (separate from the power word): the title must LITERALLY contain at least one word RankMath scores as sentiment — English positive: best / amazing / essential / proven / surprising / effective / powerful / remarkable; English negative: avoid / mistake / warning / stop / worst. RankMath matches a fixed wordlist, not the overall vibe, so include an actual listed word (one word may satisfy both power-word and sentiment). For CJK use a localized emotion word per the CJK compliance block below.
   • Length: 50–60 characters for Latin-script languages, 14–30 characters for CJK; descriptive, not clickbait
2. ## Quick Answer ← MANDATORY FIRST H2 (80–150 words; FIRST SENTENCE directly answers the main question — no buildup; see rule A above)
3. ## Key Takeaways (4–5 bullet points)
4. Main body sections — each H2 opens with a 1–2 sentence direct answer BEFORE elaborating (optimises for AI Overview citation and Featured Snippets); use H3 sub-sections where helpful
5. At least one comparison or evaluation table
6. ## FAQ (5–8 questions; each answer is 40–120 words; first sentence directly answers; no vague pronouns)
7. ## Conclusion — REQUIRED STRUCTURE (minimum 180 words; do NOT rehash the intro or copy Key Takeaways verbatim):
   a) 2–3 sentence synthesis of the single most important takeaway — new framing, not repetition
   b) 1 forward-looking sentence: what the reader should do or think about next
   c) CTA: if a primary marketing objective or service is stated in the instructions, write a specific CTA tied to it (e.g. "Book a free consultation", "Download the guide"); if none is provided, write a soft, genuine next-step sentence instead — NEVER fabricate a service name or promise that wasn't in the brief
   d) Social proof signal if applicable ("practitioners find…", "clients report…", "research shows…")
   e) Optional: 1 closing sentence that makes the reader feel seen / understood — emotional resonance increases time-on-page

RULES:
- Output clean Markdown only — no preamble, no "here is your article" opener
- Use brand facts from the instructions provided; mark any unverified brand claim with <!-- NEEDS_BRAND_VERIFY --> inline
- Mark any statistic, superlative, or claim requiring a source with <!-- NEEDS_FACT_CHECK -->
- YMYL (health/wellness/mental health): include a brief disclaimer that this is educational content — not medical treatment, psychotherapy, or a substitute for professional care. Add crisis line if content is Taiwan-facing: 台灣安心專線 1925 / 生命線 1995
- FORBIDDEN: cure / treat illness / heal illness / diagnose / guaranteed results / therapy (unless drawing a clear distinction from your own service) / therapist (same rule)
- No keyword stuffing — use the primary keyword naturally; each repetition must serve the reader
- FAQ answers must be self-contained; spell out names/brand/place instead of using "it", "this approach", "above"
- Sentences ≤25 words; 2–4 sentences per paragraph (supports mobile readability and Google's mobile-first indexing)

E-E-A-T (Experience · Expertise · Authoritativeness · Trustworthiness):
- Include at least one first-person or practitioner-level insight per major section ("In practice…", "Practitioners find…", or use the point-of-view voice set in instructions)
- Cite the source name and year for every external fact: "according to [Source Name] ([Year])" — do NOT leave bare assertions (same format applies to inline external link anchors)
- Mark unverified superlatives or statistics with <!-- NEEDS_FACT_CHECK -->
- Trustworthiness is the most critical E-E-A-T signal: never overstate claims, never omit key caveats, disclose limitations openly
- For YMYL topics: apply stricter sourcing — every health/financial/safety claim must have a named source or disclaimer
- AI content transparency: do NOT insert any AI-disclosure sentence into the article body — that is handled by the human editor outside this output. Internally: treat every factual claim as requiring verification; human review is required before publishing
- 製作者信號 (Creator signal): if an author name or brand is provided in instructions, weave their perspective and credentials naturally into the opening section — "According to [Author Name], who has worked with…" or first-person if POV is first-person. This helps Google attribute authorship and supports E-E-A-T. If no author is provided, write from the brand's voice.
- 原因信號 (Purpose signal): the primary reason for this article must be visible — every section exists to genuinely help the reader, not to accumulate keywords or rank for its own sake

GEO / AI SEARCH OPTIMISATION (optimise for AI Overview, AI Mode, RAG-based citation):
- Non-commodity content only: include specific data points, original insights, unique angles — avoid generic statements any article could make
- Each section opening (first 1–2 sentences after the H2) must be a complete, citable answer to the section's question
- Write for entity clarity: spell out full names, locations, and concepts on first mention; never use ambiguous pronouns
- Include specific numbers, percentages, or dates where relevant (AI systems prefer concrete facts over vague qualifiers)
- Answer multi-part and complex questions fully — AI search rewards comprehensive coverage over brevity
- Unique value rule: every paragraph must add information the reader cannot find in the first three Google results — if it cannot, cut it

GEO / AI CITATION MECHANICS (2026 research-backed — mandatory):
- ANSWER CAPSULE (single most important GEO signal — 72% of ChatGPT-cited pages have this): the opening 1–2 sentences of EVERY H2 section must form a self-contained answer capsule of 120–150 characters. CRITICAL RULE: never place a hyperlink inside the answer capsule sentence — links in direct-answer text reduce AI citation likelihood. Place any supporting links in the paragraph that follows, not in the capsule itself.
- SUB-QUERY COVERAGE: anticipate 3–5 sub-questions users might ask about the topic and give each a dedicated H2 or H3 section. AI engines (ChatGPT, Perplexity, Gemini) decompose complex queries into sub-queries and cite the best per-sub-query answer — an article covering more sub-queries earns more citation slots.
- ORIGINAL PERSPECTIVE (2nd strongest citation predictor): include at least one section with first-hand insight, original data, a unique angle, or a named case study that no generic article would contain. Label it implicitly by the voice: "In practice…", "Our experience shows…", "What most guides miss…"
- NAMED EXPERT ATTRIBUTION: include at least one quote or finding attributed to a real person with name + title + organization (e.g., "According to Dr. Jane Lim, researcher at NUS, …"). AI systems treat named expert attribution as a strong trustworthiness signal. If no external expert, the author's own credentials must be stated explicitly.
- RECENCY SIGNAL: at least one statistic or data point must be from within the last 12 months — cite with year. AI citation rates drop sharply for content older than 3 months; fresh data signals the article is current and worth citing.
- GEO ANTI-PATTERNS (never do these in this article): ❌ No hyperlinks inside direct-answer capsule sentences ❌ No content hidden behind accordions/tabs (AI cannot see JavaScript-toggled content) ❌ No walls of text — even one bulleted sub-point breaks dense prose into extractable units ❌ No unsourced statistics — every number needs "according to [Source] ([Year])"

AEO / ANSWER-ENGINE OPTIMISATION (for voice assistants, AI Overviews, and "People Also Ask"):
- PAA ALIGNMENT: phrase at least 3 H2/H3 headings as the exact natural-language questions a reader would type or speak (who/what/why/how/when/"is X worth it"/"how much does X cost") — these map directly to Google's "People Also Ask" and to voice-search queries. Answer each in the first sentence beneath the heading.
- DEFINITION CAPSULE: if the topic has a core term, include a one-sentence "X is …" definition early — answer engines lift these verbatim for featured snippets and voice answers.
- LIST & TABLE EXTRACTABILITY: where a question has a step sequence or a set of options, present it as a numbered list or table — answer engines extract these structurally far more often than prose.
- SCANNABILITY: keep answer sentences self-contained and under 30 words so they survive being lifted out of context into an AI answer.

RANK MATH COMPLIANCE (24-test scoring system — target ≥81 green):

BASIC SEO — 7 tests:
- Primary keyword in H1 title (already covered above) AND in the first 10% of body text (≈ first 150 words)
- Primary keyword (or a close variant / partial phrase / LSI term) must appear in EVERY H2, H3 AND H4 heading — every sub-heading should signal the topic, not just one. RECONCILE with the CJK exact-keyword cap below: write the EXACT focus keyword in only 1–2 headings; in all the other headings use a synonym, a shorter partial phrase, or a closely-related term, so each heading reinforces the topic WITHOUT breaching the 4–6× exact-keyword limit (keyword-stuffing penalty)
- All focus keywords must appear naturally throughout the body — not clustered
- Keyword density 1%–1.5%; exceeding 2.5% triggers a keyword-stuffing penalty — never exceed. For CJK languages (Chinese/Japanese/Korean) RankMath cannot tokenize the text, counts very few "words", and reports density 5–10× higher than reality — so DO NOT chase a percentage; instead obey the hard exact-keyword-repetition cap given in the CJK compliance block in the instructions below
- Minimum 600 words; 2,500+ words = RankMath content-length 100% score

ADDITIONAL SEO — 10 tests:
- At least 1 external link with DOFOLLOW (standard href link, no rel="nofollow"); cite as "[Source Name] ([Year])"
- Primary keyword must appear in at least one image's ALT text in the article body
- Emit <!-- SLUG_HINT: primary-keyword-slug --> at end of article — CMS uses this as URL slug (must contain keyword; ideally ≤75 total URL characters)

CONTENT READABILITY — 3 tests:
- Do NOT write a manual Table of Contents. The WordPress theme (Kadence) auto-generates the TOC from the heading structure; a hand-written list would duplicate it. Just produce a clean, well-ordered H2/H3 outline so the automatic TOC is correct.
- All paragraphs strictly < 120 words — split any long passage into multiple shorter paragraphs, no exceptions
- Media: include at least 4 image placeholder blocks throughout the article body (1 image passes the test; 4+ earns 100% for this test)

IMAGE PLACEHOLDERS (when images are requested):
- Alt text rule: describe the image content concisely + include the primary keyword ONCE where it fits naturally; NEVER keyword-stuff alt text
- First image alt text: must include the primary keyword (e.g. "instructor guiding a small-group creative expression session using watercolour")
- Filename format (add as a comment): <!-- filename: descriptive-words-with-hyphens.jpg --> — max 5 words, hyphens ONLY (no underscores, no spaces), all lowercase, naturally includes primary keyword ONCE
- Google Discover optimisation: recommend 16:9 format at 1280×720 px minimum (>300k total pixels); avoid images with heavy text overlays
- Use descriptive alt text for accessibility: describe what is literally shown, not what you want it to say
- NEVER use CSS background for SEO-critical images — always use the ![alt](url) Markdown img format

STRUCTURED DATA HINTS (for the CMS to apply):
- Include a visible date placeholder (do NOT guess a date): emit exactly <!-- PUBLISH_DATE --> where the byline date should appear — the CMS will replace it with the real publish date to keep it consistent with datePublished in the Article schema
- For Article/BlogPosting schema: the CMS datePublished and dateModified must match visible dates — so never emit a literal month/year in the article body
- For topic pages: include clear who/what/where/when entity signals that structured data can reinforce
- URL slug hint: emit <!-- SLUG_HINT: primary-keyword-slug --> at the very end of the article (after the last section) — use lowercase, hyphens only, no stop words; total URL including domain must be ≤75 characters
- Schema type: articles should use BlogPosting (more specific than Article — Google recommends using the most specific applicable type)
- FAQPage schema: every ## FAQ section the CMS will convert to FAQPage JSON-LD — write each FAQ answer as a standalone paragraph (no "see above", no cross-references) because AI engines cite FAQ Q&A pairs directly. Each FAQ answer must fully answer its question in 40–120 words without referencing other parts of the article.

CONTENT FRESHNESS SIGNALS:
- When citing research or statistics, always include the year (e.g. "a 2024 study by…")
- Use "As of [year]" when describing a current state that may change
- Avoid phrases like "recently" or "currently" — they become inaccurate quickly

GEO 在地化（台灣 / 亞太地區文章必須）：
- 在文章中加入至少一個台灣在地地名或機構（如台北、高雄、台灣師範大學、衛生福利部）
- 引用台灣官方數據或在地研究（例：衛福部統計、教育部資料、台灣指數等）
- 至少一個段落提及台灣人的常見情境或生活脈絡（非泛稱亞洲）
- 英文文章：如有多語言 SEO 需求，加一句說明台灣地區差異即可

SCHEMA MARKUP HINTS（CMS 會自動產生 JSON-LD，以下信號決定品質）：
- Article / BlogPosting：H1 是 Article.headline；## Quick Answer 第一句是 Article.description
- FAQPage：已由 ## FAQ 觸發，答案必須自含、可獨立閱讀（不引用「上方」「如前所述」）
- BreadcrumbList：確保 ## 段落標題能清楚描述所屬子分類（breadcrumb 從 H2 推斷）
- HowToStep（操作指南類型）：如果文章是 How-to，每個步驟段落必須含明確動詞開頭（「安裝…」「打開…」「設定…」）
- Article.author：若 instructions 有作者名，第一段必須自然帶入作者姓名與一句資歷描述
- Article.datePublished：由 <!-- PUBLISH_DATE --> 替換（上方已說明，勿重複寫日期）

READING EASE — 3 額外通過條件（RankMath Readability 評分）：
- 被動語態 < 10%：用主動語態。錯誤：「方法被用來…」；正確：「你可以用這個方法…」
- 連接詞開頭句 < 30%：避免每段第一句都是「所以…」「因此…」「此外…」
- 轉換詞（Transition words）> 30%：在段落間用「首先…其次…最後…」「相較之下…」「舉例來說…」連接邏輯`;


interface ArticleStructure {
  quickAnswer?: boolean;
  keyTakeaways?: boolean;
  comparisonTable?: boolean;
  faq?: boolean;
  conclusion?: boolean;
  tables?: boolean;
  h3?: boolean;
  lists?: boolean;
  italics?: boolean;
  quotes?: boolean;
  bold?: boolean;
  // Extended structure options
  expertQuote?: boolean;   // named expert attribution with title/org (E-E-A-T)
  prosCons?: boolean;      // pros and cons section / table
  stepByStep?: boolean;    // numbered step-by-step instructions
  calloutBox?: boolean;    // tip / warning / note callout (> **💡 Tip:** text)
  caseStudy?: boolean;     // real-world example or mini case study
  statCallout?: boolean;   // standalone data / stat highlight block
}

interface MediaHub {
  aiImages?: string;
  imageCount?: number;
  imageSize?: string;
  imageStyle?: string;
  imageInstructions?: string;
  brandName?: string;
  includeKeywordAlt?: boolean;
  autoAltText?: boolean;
  youtubeSource?: string;
  youtubeCount?: number;
  youtubeLayout?: string;
  strictUnderHeadings?: boolean;
}

// Allowed generation models across providers live in lib/ai/text-model-options.ts so Content Studio,
// article generation, and image prompt tools share one Claude/OpenAI menu.

/** Call Serper (Google Search) to get 3–5 authoritative external source URLs for the keyword. */
async function fetchRealSources(keyword: string, language: string): Promise<{ sources: string[]; costUsd: number }> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return { sources: [], costUsd: 0 };
  const isCjk = /chinese|taiwanese|japanese|korean/i.test(language);
  const q = isCjk ? `${keyword} 權威來源` : `${keyword} authoritative source site:gov OR site:edu OR site:org`;
  const gl = isCjk ? "tw" : "us";
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q, gl, num: 5 }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { sources: [], costUsd: 0 };
    const data = await res.json() as { organic?: Array<{ link?: string }> };
    const sources = (data.organic ?? [])
      .map(r => r.link)
      .filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u) && !/[\s\n\r]/.test(u))
      .slice(0, 5);
    return { sources, costUsd: 0 }; // Serper free tier: 2500 req/month
  } catch {
    return { sources: [], costUsd: 0 };
  }
}

/** The pasted reference pages (at most 3) as prompt context. They go through collect's address gate on every redirect
 *  hop (lib/collect/net/remote-file.ts): a pasted URL must never reach an internal host and come back in the article.
 *  https only; a refused or failed page is skipped. */
export async function referenceContext(urls: readonly string[], deps: Parameters<typeof fetchRemotePageText>[2] = {}): Promise<string> {
  const fetched = await Promise.all(urls.slice(0, 3).map(async (url) => {
    const text = await fetchRemotePageText(url, { maxBytes: 2_000_000, timeoutMs: 8000, maxChars: 3000 }, deps).catch(() => "");
    return text ? `--- Source: ${url} ---\n${text}` : "";
  }));
  return fetched.filter(Boolean).join("\n\n");
}

function buildUserPrompt(params: {
  keyword: string;
  title: string;
  language: string;
  targetCountry: string;
  articleType: string;
  articleSize: string;
  tone: string;
  pointOfView: string;
  readability: string;
  removeAiWords: string;
  details: string;
  nlpKeywords: string;
  outline: string;
  externalLinks: string[];
  realSources: string[];
  internalLinks: string[];
  referenceContext: string;
  structure: ArticleStructure;
  introHookBrief: string;
  introHookType: string;
  media: MediaHub | null;
  generateMeta: boolean;
  existingCategories: string[];   // #3 — real category names already on the target site
  marketContext: string;          // #5 — competitor + pain-point research block
  patterns: { id: number; title: string }[]; // #6 — saved Kadence synced patterns on the site
  patternCount: number;           // #6 — how many funnel patterns to weave in (0 = none)
  insertAllPatterns?: boolean;    // #6 — true in manual mode: insert ALL listed patterns (not AI's choice)
}): string {
  const lines: string[] = [];

  if (params.details.trim()) {
    lines.push("=== BRAND / ADDITIONAL INSTRUCTIONS ===");
    lines.push(params.details.trim());
    lines.push("=== END INSTRUCTIONS ===");
    lines.push("");
  }

  lines.push(`Primary keyword: ${params.keyword}`);
  if (params.title.trim()) lines.push(`Article title: ${params.title.trim()}`);
  lines.push(`Language: ${params.language}`);
  const isGlobalAudience = !params.targetCountry || params.targetCountry === "Global" || params.targetCountry === "全球（不指定）";
  if (!isGlobalAudience) {
    lines.push(`Target country/audience: ${params.targetCountry}`);
  }
  lines.push(`Article type: ${params.articleType}`);
  lines.push(`Target length: ${SIZE_WORDS[params.articleSize] ?? "~2500"} words`);
  lines.push(`Tone of voice: ${params.tone}`);
  if (params.pointOfView !== "none") lines.push(`Point of view: ${params.pointOfView}`);
  lines.push(`Text readability: ${params.readability}`);

  // CJK RankMath compliance — RankMath cannot tokenize Chinese/Japanese/Korean, so its
  // English power-word list, sentiment list, and density % all misfire. Emit a targeted,
  // language-aware reinforcement block when the article language is CJK.
  const isCJK = /chinese|mandarin|cantonese|japanese|korean|zh-tw|zh-cn|zh-hk|zh-mo|ja-jp|ko-kr|中文|繁體|繁体|简体|簡體|漢語|汉语|粵語|廣東話|國語|国语|台語|台语|日本|日語|日语|한국|韓國|韩国|국어/i.test(params.language);
  if (isCJK) {
    lines.push("");
    lines.push("=== CJK RANKMATH COMPLIANCE (this article is in a CJK language — follow strictly) ===");
    lines.push("• TITLE power word: use ONE of these localized power words in the H1/SEO title (RankMath's English list will not match CJK; a matching server-side list is registered for the site): 終極 / 必備 / 實證 / 專家 / 完整 / 有效 / 簡單 / 關鍵 / 最佳 / 免費 / 立即 / 秘訣 / 揭密 / 一次搞懂 / 高效 / 避免 / 不可不知 / 獨家 / 快速 / 突破。CRITICAL FORMAT: RankMath detects the power word by splitting the title on SPACES, so the chosen word MUST stand alone as its own space-separated token — write 「兒童藝術治療 完整 指南」(✓ 完整 is its own token), NOT 「完整指南」(✗ glued, will not register). Put a half-width space before and after the power word. Do NOT use overclaim words like 保證／治癒 in YMYL (health) titles — they violate the trust rules above.");
    lines.push("• TITLE number: include an Arabic digit in the title (例：「7 個」「5 步驟」「2026 年」) — do NOT use CJK numerals（七、五、十）, RankMath only detects 0-9 digits.");
    lines.push("• TITLE sentiment: include a localized emotion word as its OWN space-separated token (正面：驚人／必看／有效／實用／安心；負面：避免／別再／小心／錯誤). RankMath's built-in sentiment list is English so this test may still warn for CJK unless a localized list is registered server-side — include the emotion word regardless so the title reads compellingly and stays ready if the list is added.");
    lines.push("• KEYWORD FREQUENCY (critical — this SUPERSEDES both the density % rule AND the earlier 'keyword must appear throughout the body / not clustered' rule): RankMath cannot count CJK words, so it undercounts total words and the focus-keyword density reads 5–10× too high (a prior article hit 13.04%). Use the EXACT focus keyword AT MOST 4–6 times in the WHOLE article: once in the H1, once in the first paragraph, once in a single H2/H3, and 1–3 times in the body. For every other reference use a synonym, a shorter partial phrase, or a pronoun（它／這套方法／本服務／該工具）. NEVER write the exact keyword more than 6 times total.");
    lines.push("• HEADINGS keyword coverage: every H2/H3/H4 must carry the topic, but to stay under the 4–6× exact-keyword cap, put the EXACT focus keyword in only 1–2 headings and use a synonym / shorter partial phrase / related term（同義詞、部分詞、相關詞）in all the rest. Example for focus「兒童藝術治療」: H2「兒童藝術治療 的核心原理」(exact, ✓ space-tokenised) → H2「為什麼 繪畫表達 能療癒情緒」(variant) → H3「家長如何在家陪伴 創作」(related). Never repeat the exact keyword in every heading — that breaches the cap and reads as stuffing.");
    lines.push("=== END CJK RANKMATH COMPLIANCE ===");
  }

  // Structure overrides
  const s = params.structure;
  if (s.quickAnswer === false)     lines.push("DO NOT include a Quick Answer section.");
  if (s.keyTakeaways === false)    lines.push("DO NOT include a Key Takeaways section.");
  if (s.comparisonTable === false) lines.push("DO NOT include a comparison or evaluation table.");
  if (s.faq === false)             lines.push("DO NOT include a FAQ section.");
  if (s.conclusion === false)      lines.push("DO NOT include a Conclusion section.");
  if (s.tables === false)          lines.push("DO NOT include any data tables.");
  if (s.h3 === false)              lines.push("DO NOT use H3 sub-headings.");
  if (s.lists === false)           lines.push("DO NOT use bullet lists or numbered lists.");
  if (s.italics === false)         lines.push("DO NOT use italic text.");
  if (s.quotes === false)          lines.push("DO NOT include block quotes.");
  if (s.bold === false)            lines.push("DO NOT use bold text for emphasis.");
  // Extended structure opt-outs
  if (s.expertQuote === true)      lines.push("INCLUDE at least one named expert quote with full attribution (Name, Title, Organization/Year). Example: > \"[Quote].\" — Dr. Jane Lim, Clinical Psychologist, NUS (2024)");
  if (s.expertQuote === false)     lines.push("DO NOT include named expert quotes or external authority attributions.");
  if (s.prosCons === true)         lines.push("INCLUDE a dedicated Pros and Cons section (use a 2-column markdown table with ✅ Pros and ❌ Cons headers).");
  if (s.prosCons === false)        lines.push("DO NOT include a Pros and Cons section or table.");
  if (s.stepByStep === true)       lines.push("INCLUDE a step-by-step numbered instruction section (use ordered list 1. 2. 3. …; each step has a bold action label and 2–3 sentences of detail).");
  if (s.stepByStep === false)      lines.push("DO NOT include a numbered step-by-step section.");
  if (s.calloutBox === true)       lines.push("INCLUDE at least 2 callout boxes using markdown blockquote format: > **💡 Tip:** [actionable tip] or > **⚠ Warning:** [important caution]. Place them at high-value moments in the article.");
  if (s.calloutBox === false)      lines.push("DO NOT include callout boxes (💡 Tip / ⚠ Warning blockquotes).");
  if (s.caseStudy === true)        lines.push("INCLUDE a real-world example or mini case study section (H2 or H3 labelled 'Real-World Example', 'Case Study', or '實際案例'). Use a specific scenario with concrete details — not a generic hypothetical.");
  if (s.caseStudy === false)       lines.push("DO NOT include a dedicated case study or real-world example section.");
  if (s.statCallout === true)      lines.push("INCLUDE at least 2 standalone stat/data callouts formatted as markdown blockquotes: > **📊 Data:** [statistic — source, year]. These highlight key numbers for scanning and AI citation.");
  if (s.statCallout === false)     lines.push("DO NOT include standalone stat callout blocks.");

  // Positive enforcement — the negative `=== false` opt-outs above are NOT enough. When these
  // sections are enabled the model still silently skips them, relying on the system prompt default
  // (user-reported 2026-06-16: TABLES/FAQ/QUOTES toggled Yes but absent from the output). List the
  // enabled-but-skip-prone elements as hard REQUIRED items so they actually appear.
  const required: string[] = [];
  if (s.comparisonTable !== false)      required.push("at least one comparison or evaluation table using markdown table syntax (| column | column |)");
  else if (s.tables !== false)          required.push("at least one data table where it genuinely helps the reader, using markdown table syntax");
  if (s.faq !== false)                  required.push("a \"## FAQ\" section near the end with 5-8 question-and-answer pairs; each answer 40-120 words and self-contained (RankMath converts this to FAQPage schema)");
  if (s.quotes !== false)               required.push("at least one markdown blockquote — a line beginning with \"> \" — highlighting a key insight or a sourced quotation");
  if (s.keyTakeaways !== false)         required.push("a \"## Key Takeaways\" section with 4-5 bullet points");
  if (required.length > 0) {
    lines.push("");
    lines.push("REQUIRED ELEMENTS — the finished article MUST contain EVERY item below. Do NOT skip any; if one feels redundant include it anyway in the most natural place:");
    required.forEach(r => lines.push(`- ${r}`));
  }

  // Introductory hook
  if (params.introHookType || params.introHookBrief.trim()) {
    lines.push("");
    const hookParts: string[] = [];
    if (params.introHookType) hookParts.push(`type: ${params.introHookType}`);
    if (params.introHookBrief.trim()) hookParts.push(params.introHookBrief.trim());
    lines.push(`Opening hook for the article's first sentence — ${hookParts.join(". ")}`);
  }

  // Remove AI words
  if (params.removeAiWords === "basic") {
    lines.push(`\nAVOID these overused AI filler words: ${AI_WORDS_BASIC.join(", ")}`);
  } else if (params.removeAiWords === "extended") {
    lines.push(`\nAVOID these overused AI filler words: ${AI_WORDS_EXTENDED.join(", ")}`);
  }

  // NLP keywords
  if (params.nlpKeywords.trim()) {
    lines.push("");
    lines.push("SEO/NLP keywords to include naturally (do not keyword-stuff):");
    lines.push(params.nlpKeywords.trim());
  }

  // Custom outline
  if (params.outline.trim()) {
    lines.push("");
    lines.push("Custom article outline (follow this heading structure exactly):");
    lines.push(params.outline.trim());
  }

  // Reference context (Connect to Web)
  if (params.referenceContext.trim()) {
    lines.push("");
    lines.push("=== REFERENCE CONTENT (use as factual context, cite appropriately) ===");
    lines.push(params.referenceContext.trim());
    lines.push("=== END REFERENCE CONTENT ===");
  }

  // #5 — Competitor & pain-point market context. Researched up-front (AI market analysis) and injected so
  // the article is positioned against real competitors and speaks to real reader pains, not generic
  // filler. The model must USE this to differentiate; it must NOT name competitors disparagingly or
  // copy their copy — synthesise a stronger, reader-first angle.
  if (params.marketContext.trim()) {
    lines.push("");
    lines.push("=== MARKET CONTEXT (competitor landscape + reader pain points — use to sharpen positioning) ===");
    lines.push(params.marketContext.trim());
    lines.push("HOW TO USE THIS: address the reader pain points directly (ideally in the Quick Answer and FAQ); carve out a differentiated angle vs the competitor landscape WITHOUT naming or disparaging competitors; lead with the unique value this brand offers that the alternatives miss.");
    lines.push("=== END MARKET CONTEXT ===");
  }

  // External links — user-provided first, then Serper-sourced real URLs
  const validLinks = params.externalLinks.filter(u => /^https?:\/\//.test(u.trim()));
  if (validLinks.length > 0) {
    lines.push("");
    lines.push("External links to include naturally as contextual anchors:");
    validLinks.forEach(u => lines.push(`- ${u.trim()}`));
    lines.push("IMPORTANT: Only use the URLs listed above for external links. Do NOT invent or guess other URLs.");
  } else if (params.realSources.length > 0) {
    const safeSources = params.realSources.filter(u => /^https?:\/\//.test(u.trim()) && !/[\s\n\r]/.test(u));
    if (safeSources.length > 0) {
    lines.push("");
    lines.push("VERIFIED EXTERNAL SOURCES (real URLs found via web search — use ONLY these for external links, do NOT invent other URLs):");
    safeSources.forEach(u => lines.push(`- ${u}`));
    lines.push("Cite each source naturally in the body text where contextually relevant. Do not cluster all citations in one place.");
    }
  }

  // Internal links — provide REAL site URLs to weave; HARD-forbid the model from inventing any.
  // Root cause (2026-06-16, user-reported live bug): unlike the external-links block which carries
  // an anti-invention guard, this block had none → when no internal links were supplied the model
  // fabricated fake internal URLs (e.g. /related-article) to satisfy RankMath's internal-link test.
  const validInternal = params.internalLinks.filter(u => /^(https?:\/\/|\/)/.test(u.trim()));
  if (validInternal.length > 0) {
    lines.push("");
    lines.push("Internal links — weave these REAL existing site URLs naturally into the body using descriptive anchor text (never 'click here'). CRITICAL: use ONLY these exact URLs for internal links; NEVER invent, guess, modify, or fabricate any other internal or relative URL:");
    validInternal.forEach(u => lines.push(`- ${u.trim()}`));
  } else {
    lines.push("");
    lines.push("Internal links: NONE provided. Do NOT add any internal links, and NEVER invent, guess, or fabricate internal/relative URLs (e.g. /related-article, /some-page). The site auto-links internally via a plugin — leave internal linking entirely to it. An article with zero internal links is correct here; a fabricated internal link is a serious error.");
  }

  // Media instructions
  const m = params.media;
  if (m) {
    if (m.aiImages && m.aiImages !== "none") {
      const count = m.imageCount ?? 3;
      const ratioLabel = m.imageSize?.trim() ?? ""; // now an aspect ratio (e.g. "16:9"), not a px size
      lines.push("");
      lines.push("IMAGE PLACEHOLDERS:");
      lines.push(`- Include ${count} image placeholder(s) in the article${ratioLabel ? ` (aspect ratio: ${ratioLabel})` : ""}`);
      if (m.imageStyle)        lines.push(`- Image style: ${m.imageStyle}`);
      if (m.imageInstructions) lines.push(`- Creative direction: ${m.imageInstructions}`);
      if (m.brandName)         lines.push(`- Brand: ${m.brandName}`);
      if (m.includeKeywordAlt) lines.push(`- First image alt-text must include the primary keyword`);
      if (m.autoAltText)       lines.push(`- Write descriptive SEO alt-text for every image placeholder`);
      if (m.strictUnderHeadings) lines.push(`- Place all images strictly under an H2 or H3 heading`);
      lines.push(`- Format each placeholder as: ![alt-text here](IMAGE_PLACEHOLDER_N) where N = 1, 2, 3...`);
    }
    if (m.youtubeSource && m.youtubeSource !== "none") {
      const layoutMap: Record<string, string> = {
        distribute: "distributed evenly throughout the article",
        after_intro: "after the introduction",
        after_h2: "after each major H2 section",
      };
      const count = m.youtubeCount ?? 1;
      const placement = layoutMap[m.youtubeLayout ?? "distribute"] ?? "distributed evenly";
      lines.push("");
      lines.push("YOUTUBE VIDEO PLACEHOLDERS:");
      lines.push(`- Include ${count} YouTube embed placeholder(s), ${placement}`);
      if (m.strictUnderHeadings) lines.push(`- Place under headings only`);
      lines.push(`- Format each as: [YOUTUBE_PLACEHOLDER_N: <suggested search query for a relevant video>]`);
      // The publish pipeline resolves/embeds (or drops) a placeholder only when it is ALONE on its
      // line; an inline placeholder would leak raw "[YOUTUBE_PLACEHOLDER_N: ...]" text to the live post.
      lines.push(`- CRITICAL: put each placeholder ALONE on its own line, with a blank line before and after. Never inline inside a sentence. Never use the "]" character inside the search query.`);
    }
  }

  // #6 — Kadence synced patterns (funnels / CTAs). The site owner has hand-designed reusable
  // patterns (wp_block posts, e.g. "btn_Explore Collaboration Paths"). We let the writer drop 2-4 of
  // them at high-intent moments so each article funnels readers toward a real conversion block. The
  // model only emits a placeholder by id; the publish pipeline resolves it to <!-- wp:block ref --> so
  // the live, brand-styled pattern renders. Never invent ids — use ONLY the ids listed here.
  if (params.patternCount > 0 && params.patterns.length > 0) {
    lines.push("");
    lines.push("=== KADENCE FUNNEL PATTERNS (insert real call-to-action blocks at high-intent moments) ===");
    if (params.insertAllPatterns) {
      lines.push(`Insert ALL ${params.patterns.length} of the following pre-built patterns into the article body (use every one of them):`);
    } else {
      lines.push(`Insert ${params.patternCount} of the following pre-built patterns into the article body. Choose the ones most relevant to the topic and reader intent:`);
    }
    params.patterns.forEach(p => lines.push(`- id ${p.id}: ${p.title}`));
    lines.push("PLACEMENT RULES:");
    lines.push("- Put each chosen pattern ALONE on its own line, with a blank line before and after — NEVER inline inside a sentence or heading.");
    lines.push("- Format each EXACTLY as: [KADENCE_PATTERN: <id>] using ONLY an id from the list above (e.g. [KADENCE_PATTERN: 7207]). Do NOT add the title, do NOT invent ids.");
    lines.push("- Place them at natural funnel points: typically one after the introduction / Quick Answer (awareness→interest), one mid-article after a value-rich section (consideration), and one near the Conclusion (decision). Space them out — never two in a row.");
    lines.push("- The pattern IS the call-to-action — do NOT also write a separate text CTA right next to it.");
    lines.push("=== END KADENCE FUNNEL PATTERNS ===");
  }

  // Meta generation — emit the meta block FIRST, before the article body. Root cause fix
  // (2026-06-16): it was previously appended LAST, so when a long article hit the token limit
  // the body truncated and the meta block was never produced → empty SEO title/description →
  // RankMath score collapsed. extractMeta() locates the block by regex regardless of position,
  // so emitting it first guarantees the SEO title/desc survive even if the body is cut short.
  if (params.generateMeta) {
    lines.push("");
    lines.push("OUTPUT ORDER (follow EXACTLY): FIRST output the meta block below verbatim (keep the exact comment markers and KEY: prefixes, one field per line). THEN, immediately after the <!-- CONTENT_META_END --> line, write the complete article. Do NOT place the meta block at the end.");
    lines.push("<!-- CONTENT_META_START -->");
    lines.push("SEO_TITLE: [SEO title — 50-60 chars for Latin scripts / 14-30 chars for CJK; primary keyword in first half; include a power word AND an Arabic-digit number]");
    lines.push("META_DESC: [meta description — RULES: (1) LENGTH: exactly 145-155 chars for Latin / 60-80 chars for CJK — count carefully, do not exceed 160 (2) KEYWORD: place the PRIMARY KEYWORD within the FIRST 60 characters — RankMath checks the first 80 chars for keyword presence (3) VOICE: write as a compelling benefit-driven statement or question that makes a reader click — NOT a bland restatement of the title (4) NEVER truncate with ellipsis or leave a sentence unfinished]");
    lines.push("FOCUS_KEYWORD: [the primary keyword exactly as provided]");
    if (params.existingCategories.length > 0) {
      // #3 — feed the site's REAL category list so the model classifies into an existing taxonomy
      // instead of inventing a near-duplicate ("Art Therapy" vs an existing "Art therapy").
      lines.push(`CATEGORIES: [pick the 1-2 BEST-FITTING categories for this article from the site's EXISTING categories below — copy the names EXACTLY (same spelling/case), comma-separated. Only if NONE genuinely fit, propose one broad new category. EXISTING CATEGORIES: ${params.existingCategories.join(", ")}]`);
    } else {
      lines.push("CATEGORIES: [1-2 broad, conventional WordPress category names for this article, comma-separated — prefer terms a site would already have; do NOT invent narrow one-off categories]");
    }
    lines.push("TAGS: [4-6 specific topical tags, comma-separated]");
    lines.push("<!-- CONTENT_META_END -->");
    lines.push("");
    lines.push("Now output the meta block above, then write the complete article below it.");
  } else {
    lines.push("");
    lines.push("Write the complete article now.");
  }

  return lines.join("\n");
}


// ─────────────────────────────────────────────────────────────────────────────
// Core entry points (P2 積木化). Shared by the streaming HTTP route
// (app/api/content/generate/route.ts) and the headless block
// (lib/content/blocks/article-generate.ts): 一段邏輯、兩個入口、零重複.
// Everything ABOVE this line is the verbatim original route logic (lines 9-423),
// moved unchanged so behaviour is byte-identical.
// ─────────────────────────────────────────────────────────────────────────────

export type ArticleGenerateInput = Record<string, unknown>;

export interface ArticlePreparedConfig {
  model: string;
  maxTokens: number;
  system: string;
  userPrompt: string;
  sourcesCostUsd?: number;
  jobId?: string | null;
}

export interface ArticleGenerateFailure {
  ok: false;
  status: number;
  error: string;
}

export interface ArticlePrepareSuccess {
  ok: true;
  config: ArticlePreparedConfig;
}

export type ArticlePrepareResult = ArticlePrepareSuccess | ArticleGenerateFailure;

/**
 * Validate + coerce the request body into a ready-to-stream Anthropic config. Byte-identical to the
 * original route POST preamble (old lines 441-528): same str/bool/sarr coercion, same defaults, same
 * Serper real-source fetch and reference-URL fetch. Returns a discriminated result; the only
 * validation failure is an empty keyword (400), matching the original route exactly.
 */
export async function prepareArticleGeneration(body: ArticleGenerateInput): Promise<ArticlePrepareResult> {
  const str  = (v: unknown, fb = "") => (typeof v === "string" ? v : fb);
  const bool = (v: unknown, fb = true) => (typeof v === "boolean" ? v : fb);
  const sarr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  const keyword = str(body.keyword).trim();
  if (!keyword) return { ok: false, status: 400, error: "keyword required" };

  const rawStruct = (body.structure ?? {}) as Record<string, unknown>;
  const structure: ArticleStructure = {
    quickAnswer:     bool(rawStruct.quickAnswer),
    keyTakeaways:    bool(rawStruct.keyTakeaways),
    comparisonTable: bool(rawStruct.comparisonTable),
    faq:             bool(rawStruct.faq),
    conclusion:      bool(rawStruct.conclusion),
    tables:          bool(rawStruct.tables),
    h3:              bool(rawStruct.h3),
    lists:           bool(rawStruct.lists),
    italics:         bool(rawStruct.italics),
    quotes:          bool(rawStruct.quotes),
    bold:            bool(rawStruct.bold),
    expertQuote:     bool(rawStruct.expertQuote,  false), // off by default — requires real expert
    prosCons:        bool(rawStruct.prosCons,     false),
    stepByStep:      bool(rawStruct.stepByStep,   false),
    calloutBox:      bool(rawStruct.calloutBox,   false),
    caseStudy:       bool(rawStruct.caseStudy,    false),
    statCallout:     bool(rawStruct.statCallout,  false),
  };

  const rawMedia = (body.media ?? {}) as Record<string, unknown>;
  const media: MediaHub = {
    aiImages:           str(rawMedia.aiImages, "none"),
    imageCount:         typeof rawMedia.imageCount === "number" ? Math.min(Math.max(1, rawMedia.imageCount), 10) : 3,
    imageSize:          str(rawMedia.imageSize, "16:9"), // flux aspect_ratio (px-size format retired)
    imageStyle:         str(rawMedia.imageStyle),
    imageInstructions:  str(rawMedia.imageInstructions),
    brandName:          str(rawMedia.brandName),
    includeKeywordAlt:  bool(rawMedia.includeKeywordAlt, true),
    autoAltText:        bool(rawMedia.autoAltText, false),
    youtubeSource:      str(rawMedia.youtubeSource, "none"),
    youtubeCount:       typeof rawMedia.youtubeCount === "number" ? Math.min(Math.max(1, rawMedia.youtubeCount), 5) : 1,
    youtubeLayout:      str(rawMedia.youtubeLayout, "distribute"),
    strictUnderHeadings: bool(rawMedia.strictUnderHeadings, false),
  };

  const maxTokens  = SIZE_TOKENS[str(body.articleSize, "medium")] ?? 4096;
  // Fetch reference URLs (Connect to Web)
  const referenceText = await referenceContext(sarr(body.referenceUrls).filter(u => /^https?:\/\//.test(u)));

  // Internal links
  const internalLinks = sarr(body.internalLinks).filter(u => /^(https?:\/\/|\/)/.test(u.trim())).slice(0, 10);

  // Serper real sources — only when user hasn't provided their own external links
  const userExternalLinks = sarr(body.externalLinks);
  const { sources: realSources, costUsd: sourcesCostUsd } = userExternalLinks.length === 0
    ? await fetchRealSources(keyword, str(body.language, "English"))
    : { sources: [], costUsd: 0 };

  // Model selection (default: sonnet)
  const requestedModel = str(body.model, DEFAULT_AI_TEXT_MODEL);
  const model: AiTextModel = normalizeAiTextModel(requestedModel);

  // #3 / #5 / #6 inputs — all best-effort: the UI fetches existing categories + patterns and runs the
  // market analysis up-front, then forwards them here. Missing/empty just disables that enhancement.
  const existingCategories = sarr(body.existingCategories).map(s => s.trim()).filter(Boolean).slice(0, 40);
  const marketContext = str(body.marketContext).slice(0, 6000);
  const rawPatterns = Array.isArray(body.patterns) ? body.patterns : [];
  const patterns = rawPatterns
    .map((p): { id: number; title: string } | null => {
      const o = p as Record<string, unknown>;
      const id = typeof o.id === "number" ? o.id : Number(o.id);
      const title = typeof o.title === "string" ? o.title : "";
      return Number.isInteger(id) && id > 0 ? { id, title: title.slice(0, 120) } : null;
    })
    .filter((p): p is { id: number; title: string } => p !== null)
    .slice(0, 20);
  const insertAllPatterns = body.patternMode === "manual" && Array.isArray(body.patterns) && body.patterns.length > 0;
  const patternCount = typeof body.patternCount === "number"
    ? Math.min(Math.max(0, Math.floor(body.patternCount)), insertAllPatterns ? 20 : 4)
    : 0;

  const userPrompt = buildUserPrompt({
    keyword,
    title:         str(body.title),
    language:      str(body.language, "English"),
    targetCountry: str(body.targetCountry, "Global"),
    articleType:   str(body.articleType, "Pillar Article"),
    articleSize:   str(body.articleSize, "medium"),
    tone:          str(body.tone, "Friendly"),
    pointOfView:   str(body.pointOfView, "none"),
    readability:   str(body.readability, "8th grade"),
    removeAiWords: str(body.removeAiWords, "none"),
    details:       str(body.details),
    nlpKeywords:   str(body.nlpKeywords),
    outline:       str(body.outline),
    externalLinks: userExternalLinks,
    realSources,
    internalLinks,
    referenceContext: referenceText,
    structure,
    introHookBrief: str(body.introHookBrief),
    introHookType:  str(body.introHookType),
    media,
    generateMeta: bool(body.generateMeta, false),
    existingCategories,
    marketContext,
    patterns,
    patternCount,
    insertAllPatterns,
  });

  const jobId = typeof body._jobId === "string" ? body._jobId : null;
  return { ok: true, config: { model, maxTokens, system: SYSTEM_PROMPT, userPrompt, sourcesCostUsd: sourcesCostUsd > 0 ? sourcesCostUsd : undefined, jobId } };
}

/**
 * Stream the article as text deltas. Byte-identical to the original route ReadableStream body
 * (old lines 533-575): same Anthropic stream call, same abort wiring, same max_tokens truncation
 * marker and same error marker under the same conditions. The route wraps this generator in a
 * ReadableStream; the block collects it into a string. `signal` is the request abort signal —
 * Next.js aborts it on client disconnect, equivalent to the original route cancel() → abort().
 */
export async function* streamArticleGeneration(
  config: ArticlePreparedConfig,
  apiKey: string,
  signal?: AbortSignal,
): AsyncGenerator<string, void, unknown> {
  // Provider routing (P2 積木化 — multi-provider). GPT models stream through the OpenAI Chat
  // Completions SSE path; everything else stays on the byte-identical Anthropic path below. The
  // system + user prompt are provider-agnostic, so only the transport differs.
  if (isOpenAiTextModel(config.model as AiTextModel)) {
    yield* streamOpenAiGeneration(config, signal);
    return;
  }
  const articleGrant = await grantFor("content.article");
  const Anthropic = await loadAnthropic(articleGrant);
  const client = new Anthropic({ apiKey });
  let anthropicStream: ReturnType<typeof client.beta.messages.stream> | null = null;
  try {
    anthropicStream = client.beta.messages.stream({
      ...claudeParams(config.model, config.maxTokens),
      ...claudeFallback(config.model),
      system: config.system,
      messages: [{ role: "user", content: config.userPrompt }],
    });

    signal?.addEventListener("abort", () => {
      anthropicStream?.abort();
    });

    for await (const event of anthropicStream) {
      if (signal?.aborted) break;
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text;
      }
    }

    // Truncation guard: surface a max_tokens cutoff instead of silently shipping a
    // half-written article (the old 4096 budget truncated invisibly — 2026-06-16 root cause).
    if (!signal?.aborted) {
      const finalMsg = await anthropicStream.finalMessage().catch(() => null);
      // Cost ledger: record exact token usage from the completed stream (best-effort, never throws).
      if (finalMsg) {
        void logAiCall({ route: "content/article-generate", response: finalMsg, jobId: config.jobId, tool: "content", organizationId: billedOrgId(articleGrant) });
        const costUsd = textCallCostUsd({ model: finalMsg.model, inputTokens: finalMsg.usage.input_tokens, outputTokens: finalMsg.usage.output_tokens, cacheReadTokens: finalMsg.usage.cache_read_input_tokens, cacheWriteTokens: finalMsg.usage.cache_creation_input_tokens });
        const { rate } = resolveTextRate(finalMsg.model);
        if (config.sourcesCostUsd) {
          yield `\n[COST_JSON]${JSON.stringify({ usd: config.sourcesCostUsd, model: "search", vendor: "Serper", route: "content/fetchRealSources" })}`;
        }
        yield `\n[COST_JSON]${JSON.stringify({ usd: costUsd, model: finalMsg.model, vendor: rate.vendor, route: "content/article-generate" })}`;
      }
      if (finalMsg?.stop_reason === "refusal") {
        yield "\n\n<!-- GENERATION_ERROR: the model declined this request -->";
      }
      if (finalMsg?.stop_reason === "max_tokens") {
        yield "\n\n<!-- GENERATION_TRUNCATED: hit the output length limit; pick a shorter article size or split the topic -->";
      }
    }
  } catch (err) {
    if (!signal?.aborted) {
      const isAnthropicErr = err instanceof Error && err.message.length > 0;
      const msg = isAnthropicErr ? "Claude API error" : "Unknown error";
      yield `\n\n<!-- GENERATION_ERROR: ${msg} -->`;
    }
  }
}

/**
 * Headless one-shot: prepare → collect the full generation into a markdown string. Used by the
 * article/generate block. Returns the same validation-failure shape as prepare. The streamed markers
 * (GENERATION_TRUNCATED / GENERATION_ERROR) are kept verbatim in the markdown — the caller decides
 * how to surface them, exactly as the streaming UI does after reading the stream.
 */
export async function generateArticleMarkdown(
  body: ArticleGenerateInput,
  apiKey: string,
  signal?: AbortSignal,
): Promise<{ ok: true; markdown: string } | ArticleGenerateFailure> {
  const prepared = await prepareArticleGeneration(body);
  if (!prepared.ok) return prepared as ArticleGenerateFailure;
  const { config } = prepared as ArticlePrepareSuccess;
  let markdown = "";
  for await (const chunk of streamArticleGeneration(config, apiKey, signal)) {
    markdown += chunk;
  }
  return { ok: true, markdown };
}

/**
 * Stream an article from OpenAI via the Chat Completions SSE endpoint (zero new npm dependency —
 * raw fetch, mirroring fetchRealSources' Serper call). Yields the same text-delta contract as
 * the Anthropic path and emits the same GENERATION_TRUNCATED / GENERATION_ERROR markers under the
 * same conditions so the UI + headless block handle both providers identically.
 *
 * Param notes: `max_completion_tokens` (not the deprecated `max_tokens`) is the universal budget
 * field accepted by both gpt-4o and the gpt-5.x reasoning models — the latter REJECT `max_tokens`.
 * Temperature is intentionally omitted: reasoning models 400 on any non-default temperature.
 */
async function* streamOpenAiGeneration(
  config: ArticlePreparedConfig,
  signal?: AbortSignal,
): AsyncGenerator<string, void, unknown> {
  const grant = await grantFor("content.article");
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    yield "\n\n<!-- GENERATION_ERROR: OPENAI_API_KEY not configured -->";
    return;
  }
  try {
    const res = await fetch(providerUrl(grant, "openai", "/v1/chat/completions"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        max_completion_tokens: config.maxTokens,
        stream: true,
        // Ask OpenAI to emit a final usage frame so the cost ledger gets exact token counts
        // (parallel to Anthropic's finalMessage().usage). Without this, streamed responses carry no usage.
        stream_options: { include_usage: true },
        messages: [
          { role: "system", content: config.system },
          { role: "user", content: config.userPrompt },
        ],
      }),
      signal,
    });
    if (!res.ok || !res.body) {
      yield `\n\n<!-- GENERATION_ERROR: OpenAI API error (${res.status}) -->`;
      return;
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let finishReason = "";
    let openaiUsage: OpenAiUsageLike | null = null;
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      // OpenAI Chat Completions emits each event as a SINGLE-line `data: {json}` frame (the JSON never
      // contains a raw newline), so line-based parsing is correct here. We split on "\n" and keep the
      // trailing partial line in `buf` so a frame split across two network chunks reassembles. (If the
      // provider ever emitted multi-line `data:` payloads per the SSE spec, this would need event-based
      // accumulation on "\n\n" — not the case for OpenAI today; critic 2026-06-16 Major, documented.)
      const frames = buf.split("\n");
      buf = frames.pop() ?? ""; // keep the trailing partial line for the next read
      for (const line of frames) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const j = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
            usage?: OpenAiUsageLike;
            error?: { message?: string };
          };
          // Mid-stream error frame (content filter / quota exhausted mid-generation). Surface it as a
          // GENERATION_ERROR — matching the Anthropic path — instead of silently shipping a partial
          // article as "done" (critic 2026-06-16 Major).
          if (j.error) {
            yield `\n\n<!-- GENERATION_ERROR: OpenAI stream error -->`;
            return;
          }
          const choice = j.choices?.[0];
          const piece = choice?.delta?.content;
          if (piece) yield piece;
          if (choice?.finish_reason) finishReason = choice.finish_reason;
          if (j.usage) openaiUsage = j.usage; // final usage frame (stream_options.include_usage)
        } catch { /* skip a partial/non-JSON keepalive frame */ }
      }
    }

    // Cost ledger: log exact OpenAI token usage from the final usage frame (best-effort).
    if (!signal?.aborted && openaiUsage) {
      void logAiCall({
        route: "content/article-generate",
        organizationId: billedOrgId(grant),
        model: config.model,
        ...openaiUsageTokens(openaiUsage),
        jobId: config.jobId,
        tool: "content",
      });
      const costUsd = textCallCostUsd({ model: config.model, ...openaiUsageTokens(openaiUsage) });
      const { rate } = resolveTextRate(config.model);
      if (config.sourcesCostUsd) {
        yield `\n[COST_JSON]${JSON.stringify({ usd: config.sourcesCostUsd, model: "search", vendor: "Serper", route: "content/fetchRealSources" })}`;
      }
      yield `\n[COST_JSON]${JSON.stringify({ usd: costUsd, model: config.model, vendor: rate.vendor, route: "content/article-generate" })}`;
    }

    // Truncation guard — parallel to the Anthropic stop_reason==="max_tokens" check.
    if (!signal?.aborted && finishReason === "length") {
      yield "\n\n<!-- GENERATION_TRUNCATED: hit the output length limit; pick a shorter article size or split the topic -->";
    }
  } catch (err) {
    if (!signal?.aborted) {
      const msg = err instanceof Error && err.message.length > 0 ? "OpenAI API error" : "Unknown error";
      yield `\n\n<!-- GENERATION_ERROR: ${msg} -->`;
    }
  }
}
