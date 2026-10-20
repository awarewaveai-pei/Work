/**
 * AI product-copy generator for apparel POD (Phase 4).
 *
 * Produces SEO + GEO + AEO + RankMath-compliant WooCommerce product copy from the
 * design context. This is NOT the blog pipeline (app/api/content/* writes 2,500-word
 * articles) — product pages need short, extractable, answer-shaped copy. The output
 * structure maps 1:1 onto the wp-bridge /product payload's `seo` block
 * (rank_math_focus_keyword / _title / _description — ProductCreator.php:717) plus the
 * short_description body, so the Woo product lands RankMath-green without manual edits.
 *
 * GEO/AEO (AI Overview / answer-engine citation): the short description opens with a
 * self-contained answer capsule; bullets are discrete extractable units; the focus
 * keyword leads the meta title and appears in the first sentence + one bullet.
 *
 * Model: ANTHROPIC_MODEL (default CLAUDE_DEFAULT_MODEL, lib/ai/gateway.ts) — same client pattern as
 * lib/command-plane/handlers/_anthropic.ts.
 */
import { loadAnthropic, type Anthropic } from "@/lib/ai/gateway";
import { grantFor } from "@/lib/entitlements/grant";
import { checkRankMath, type RankMathReport, type RankMathCheck } from "../seo/rankmath-checker";
import { logAiCall } from "../ai/log-ai-call";
import { CLAUDE_DEFAULT_MODEL, claudeFallback, claudeIncomplete, claudeParams, claudeText } from "../ai/gateway";

const MODEL = process.env.ANTHROPIC_MODEL ?? CLAUDE_DEFAULT_MODEL;

export interface ProductCopyInput {
  /** Free-text design description / prompt that produced the artwork. */
  designPrompt?: string;
  /** Main subject of the design (e.g. "lotus mandala"). */
  subject?: string;
  productType?: string; // tshirt / hoodie / ...
  theme?: string; // e.g. "spiritual healing"
  brand?: string; // e.g. "Soulful Expression"
  /** Operator hint for the focus keyword; the model refines if weak. */
  focusKeywordHint?: string;
  /**
   * Free-text operator instructions for tone / language / brand voice / what to emphasise
   * (e.g. "write in Traditional Chinese", "playful tone", "stress eco-friendly fabric"). These
   * OVERRIDE the default tone/language/brand, but NEVER the mandatory safety + structure rules.
   */
  instructions?: string;
  /** Store domain, for the RankMath self-score (internal vs external links). */
  siteDomain?: string;
  /**
   * Re-generation hints: when the operator clicks "AI 自動修正 SEO" in the publish UI, the failed
   * RankMath checks' suggestions are passed back here so the model regenerates the FULL copy fixing
   * each one (product copy is structured 6 fields — it cannot be markdown-rewritten like a blog
   * article, so the fix path is a re-generate with hints, not the /api/content/seo-fix endpoint).
   */
  improveHints?: string[];
}

export interface ProductCopy {
  productTitle: string;
  focusKeyword: string;
  metaTitle: string;
  metaDescription: string;
  /** Sanitised HTML for Woo short_description (p + ul/li only). */
  shortDescriptionHtml: string;
  bullets: string[];
}

export type ProductCopyResult =
  | { ok: true; copy: ProductCopy; rankMath: RankMathReport }
  | { ok: false; error: string };

const SYSTEM_PROMPT = `You write WooCommerce PRODUCT copy for a print-on-demand apparel store, optimised for SEO, GEO (Generative Engine Optimisation / AI Overview), AEO (Answer Engine Optimisation) and RankMath (target: green ≥81).

Return ONLY a single valid JSON object — no markdown fence, no prose — with exactly these keys:
{
  "productTitle": string,        // human product name, includes the focus keyword, 40-65 chars
  "focusKeyword": string,        // 2-4 words, the primary search phrase shoppers use
  "metaTitle": string,           // ≤ 60 chars, focus keyword at the FRONT, brand at end
  "metaDescription": string,     // 120-156 chars, contains the focus keyword once, ends with a call to action
  "shortDescriptionHtml": string,// see rules below
  "bullets": string[]            // 4-6 discrete benefit/feature bullets
}

RULES (every one is mandatory):
- FOCUS KEYWORD: appears in productTitle, metaTitle (at the front), metaDescription, the FIRST sentence of shortDescriptionHtml, and at least one bullet. Natural, never stuffed.
- ANSWER CAPSULE (strongest GEO signal): shortDescriptionHtml MUST open with a single <p> that is a self-contained 110-150 character answer to "what is this product?" — no links inside it.
- shortDescriptionHtml = exactly one opening <p> answer capsule, then one <ul> of the bullets as <li>. Allowed tags ONLY: <p>, <ul>, <li>, <strong>. No headings, no scripts, no inline styles, no links.
- BULLETS: each is one extractable unit (material, fit, print method, care, sustainability). Concrete, no fluff. AEO: phrase at least one bullet as a direct factual statement an AI could quote.
- TONE: warm, specific, benefit-led. No unsupported superlatives ("best", "#1"). No medical/therapeutic claims.
- ENTITIES (GEO): name concrete entities where true — e.g. "Bella+Canvas 3001", "ring-spun cotton", "DTG print", "unisex fit".
- Output language: English by default — BUT if the operator instructions request another language, write EVERY field entirely in that language.
- NEVER invent certifications, awards, or statistics.`;

function extractJson(text: string): unknown {
  // Models sometimes wrap JSON in a fence despite instructions — strip it.
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("no_json_object");
  return JSON.parse(raw.slice(start, end + 1));
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Clamp to a hard char limit at a word boundary. RankMath fails the SEO-title test
 * above 60 chars and the meta-description test above ~160 — and the LLM does NOT reliably
 * obey those limits (REALTEST 2026-06-15: it returned an 81-char title, 163-char desc).
 * So we enforce deterministically in code, never trusting the model for a hard constraint.
 * The focus keyword sits at the FRONT of both fields, so trimming the tail keeps it.
 */
function clampLen(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:|–-]+$/, "").trim();
}

/**
 * Sanitise the model's short-description HTML at the trust boundary (this server runtime).
 * The LLM output is UNTRUSTED — never rely on the prompt's tag restriction, nor on
 * WordPress kses-by-default downstream (critic 2026-06-15: that protection is implicit and
 * could vanish if the bridge ever authenticates a WP user). Keep only <p><ul><li><strong>,
 * strip ALL attributes (kills onerror=/onclick=), and drop <script>/<style> blocks entirely.
 */
const ALLOWED_HTML_TAGS = new Set(["p", "ul", "li", "strong", "/p", "/ul", "/li", "/strong"]);
function sanitizeProductHtml(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\s*(\/?)\s*([a-zA-Z0-9]+)\b[^>]*>/g, (_m, slash: string, tag: string) =>
      ALLOWED_HTML_TAGS.has(`${slash}${tag.toLowerCase()}`) ? `<${slash}${tag.toLowerCase()}>` : "",
    )
    // Final guard: a truncated/malformed tag with no ">" (e.g. "<img src=x onerror=…" at EOF) slips
    // past the pass above, and a browser tokenizer can still re-form it into a live tag. Escape every
    // residual "<" that isn't one of the four allowed tag tokens to &lt; — so the sanitizer is airtight
    // on its own (critic 2026-06-15), not reliant on downstream WordPress kses. (A "<" that DOES have a
    // later ">" is consumed as a bogus tag by the pass above; that's pre-existing and harmless here,
    // since the LLM is instructed to emit only <p>/<ul>/<li>/<strong> — no literal "<" in copy.)
    .replace(/<(?!\/?(?:p|ul|li|strong)>)/gi, "&lt;")
    .trim();
}

/** Bullets must be plain text — strip any markup the model slipped in. */
function plainText(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

// RankMath checks that actually apply to a short PRODUCT page. The checker is tuned for
// 600+ word blog posts, so blog-only checks (word count, external/internal links, multi-H2
// AEO coverage, article date) would cap any product at "red" regardless of copy quality —
// a misleading grade. We score the product-relevant subset instead (critic 2026-06-15).
const PRODUCT_RELEVANT_CHECKS = new Set([
  "kw-in-title",
  "kw-in-meta",
  "kw-in-slug",
  "kw-in-intro",
  "kw-density",
  "para-length",
  "title-length",
  "meta-length",
  "slug-length",
  "aeo-quick-answer",
]);

/** Generate SEO/GEO/AEO/RankMath product copy. Never throws — returns ok:false on failure. */
export async function generateProductCopy(input: ProductCopyInput): Promise<ProductCopyResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "missing_anthropic_key" };

  const brief = {
    design_prompt: input.designPrompt ?? null,
    subject: input.subject ?? null,
    product_type: input.productType ?? "tshirt",
    theme: input.theme ?? null,
    brand: input.brand ?? "Soulful Expression",
    focus_keyword_hint: input.focusKeywordHint ?? null,
  };

  // On a fix re-generation, tell the model exactly which RankMath checks the previous copy failed
  // (the checker's suggestions are human-readable, often zh-TW) — it produces a full fresh copy that
  // resolves them while keeping every base rule. Bounded to 12 hints (a report has 22 checks max).
  const hints = Array.isArray(input.improveHints)
    ? input.improveHints.map((h) => (typeof h === "string" ? h.trim() : "")).filter((h) => h.length > 0).slice(0, 12)
    : [];
  // Operator free-text style/content instructions (publish UI「文案指示／品牌語氣」). Highest priority
  // for STYLE — may override the default tone/language/brand — but the SYSTEM_PROMPT's mandatory RULES
  // (valid JSON, 6 keys, structure, char limits, no medical claims, no invented facts) still bind.
  const instructions = typeof input.instructions === "string" ? input.instructions.trim().slice(0, 600) : "";
  const directive = instructions
    ? `\n\nOPERATOR INSTRUCTIONS — highest priority for tone, language and brand voice; override the defaults where they conflict, but you MUST still obey every mandatory RULE above (valid JSON with the 6 keys, the answer-capsule + bullets structure, the char limits, and the safety rules — no medical/therapeutic claims, no invented certifications/stats):\n${instructions}`
    : "";
  const fixBlock = hints.length > 0
    ? `\n\nThe previous copy FAILED these RankMath / SEO / AEO checks. Regenerate the FULL copy so every one passes, while still obeying all the base RULES above:\n${hints.map((h) => `- ${h}`).join("\n")}`
    : "";
  const userContent = `Product design brief:\n${JSON.stringify(brief, null, 2)}${directive}${fixBlock}`;

  const Anthropic = await loadAnthropic(await grantFor("studio.product-copy"));
  const client = new Anthropic({ apiKey });
  let text: string;
  try {
    const response = await client.beta.messages.create({
      ...claudeParams(MODEL, 1200),
      ...claudeFallback(MODEL),
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userContent }],
    });
    const incomplete = claudeIncomplete(response);
    if (incomplete) return { ok: false, error: incomplete };
    text = claudeText(response);
    if (!text) return { ok: false, error: "empty_response" };
    void logAiCall({ route: "lib/studio/product-copy", response });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      if (err.status === 401 || err.status === 403) return { ok: false, error: "anthropic_auth_error" };
      if (err.status === 429) return { ok: false, error: "anthropic_rate_limit" };
      if (err.status === 529) return { ok: false, error: "anthropic_overloaded" };
      return { ok: false, error: `anthropic_api_${err.status}` };
    }
    return { ok: false, error: "anthropic_network_error" };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = extractJson(text) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "copy_parse_failed" };
  }

  const bullets = Array.isArray(parsed.bullets)
    ? parsed.bullets.map((b) => plainText(asString(b))).filter((b) => b.length > 0).slice(0, 8)
    : [];
  const copy: ProductCopy = {
    productTitle: asString(parsed.productTitle),
    focusKeyword: asString(parsed.focusKeyword),
    // Hard SEO limits enforced in code — the LLM does not obey them reliably (see clampLen).
    metaTitle: clampLen(asString(parsed.metaTitle), 60),
    metaDescription: clampLen(asString(parsed.metaDescription), 156),
    // Untrusted LLM HTML — sanitise at this boundary, not downstream (see sanitizeProductHtml).
    shortDescriptionHtml: sanitizeProductHtml(asString(parsed.shortDescriptionHtml)),
    bullets,
  };
  if (!copy.productTitle || !copy.shortDescriptionHtml || !copy.focusKeyword) {
    return { ok: false, error: "copy_incomplete" };
  }

  // Self-score with the same RankMath checker the blog pipeline uses. The body we score
  // is the title + answer capsule + bullets rendered as plain markdown (link-free).
  // The opening <p> IS the AEO answer capsule (SYSTEM_PROMPT mandates it), but the
  // `aeo-quick-answer` check scans for a `## Quick Answer` HEADING (rankmath-checker.ts:393)
  // that this product markdown never emitted — so the check failed for EVERY product despite
  // the capsule being present (operator report 2026-06-23: "Missing Quick Answer section").
  // Extract the capsule and label it under the heading the checker recognises, so the score
  // reflects the AEO answer the page actually carries. The live product short_description stays
  // a plain capsule <p> (no odd heading on the storefront) — answer engines extract the opening
  // sentence regardless; this only makes the SELF-SCORE honest. (aeo-subquery-coverage counts the
  // new H2 but is blog-only → marked N/A below, so no scoring side effect beyond this check.)
  // Score each content unit EXACTLY ONCE. The short_description is structurally `<p>capsule</p>` +
  // `<ul>` of the bullets; the bullets are already scored as the markdown list below, so when the
  // capsule is present we represent the body as `## Quick Answer` + capsule ONLY and do NOT also strip
  // the whole shortDescriptionHtml (which re-includes the same capsule AND the bullets) — that double
  // count inflated kw-density and could flip a clean copy to a false "keyword stuffing" FAIL, which the
  // AI-fix loop would then "correct" by degrading good copy (critic 2026-06-23, empirically reproduced).
  // Fallback (no capsule matched — degenerate, the prompt mandates one): score the stripped body so no
  // copy goes unscored.
  const capsuleMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(copy.shortDescriptionHtml);
  const capsule = (capsuleMatch ? capsuleMatch[1] : "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const markdown = [
    `# ${copy.productTitle}`,
    ...(capsule
      ? [`## Quick Answer`, capsule]
      : [copy.shortDescriptionHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()]),
    ...copy.bullets.map((b) => `- ${b}`),
  ].join("\n\n");
  const full = checkRankMath({
    markdown,
    focusKeyword: copy.focusKeyword,
    seoTitle: copy.metaTitle,
    metaDescription: copy.metaDescription,
    // Seed the slug from the focus keyword (truthful kw-in-slug score; Woo derives the real slug).
    slug: copy.focusKeyword.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
    siteDomain: input.siteDomain,
  });
  // Keep ALL 22 checks so the publish UI shows the familiar full RankMath panel, but mark the
  // blog-only ones N/A: the checker is tuned for 600+ word articles, so word-count / external+internal
  // links / multi-H2 AEO coverage / article date would cap a (correctly) short product page at "red"
  // regardless of copy quality. N/A checks are excluded from score / grade / error counts (critic
  // 2026-06-15). Score is computed on the product-relevant subset only — same result as the prior
  // filtered report (e.g. 9/10 → 90 / green), just now carrying the N/A rows for the panel.
  const checks: RankMathCheck[] = full.checks.map((c) =>
    PRODUCT_RELEVANT_CHECKS.has(c.id)
      ? c
      : { ...c, na: true, suggestion: undefined, detail: "不適用於商品頁（此項為長文部落格指標）" },
  );
  const applicable = checks.filter((c) => !c.na);
  const passed = applicable.filter((c) => c.pass).length;
  const total = applicable.length || 1;
  const score = Math.round((passed / total) * 100);
  const grade: RankMathReport["grade"] = score >= 81 ? "green" : score >= 51 ? "orange" : "red";
  const rankMath: RankMathReport = { score, grade, checks, passed, total };

  return { ok: true, copy, rankMath };
}
