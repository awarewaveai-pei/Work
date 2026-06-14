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
 * Model: ANTHROPIC_MODEL (default claude-sonnet-4-6) — same client pattern as
 * lib/command-plane/handlers/_anthropic.ts.
 */
import Anthropic from "@anthropic-ai/sdk";
import { checkRankMath, type RankMathReport } from "../seo/rankmath-checker";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

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
  /** Store domain, for the RankMath self-score (internal vs external links). */
  siteDomain?: string;
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
- Output language: English (the store is English-language).
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

  const client = new Anthropic({ apiKey });
  let text: string;
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Product design brief:\n${JSON.stringify(brief, null, 2)}` }],
    });
    const block = response.content.find((c) => c.type === "text");
    if (!block || block.type !== "text") return { ok: false, error: "empty_response" };
    text = block.text;
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
    ? parsed.bullets.map(asString).filter((b) => b.length > 0).slice(0, 8)
    : [];
  const copy: ProductCopy = {
    productTitle: asString(parsed.productTitle),
    focusKeyword: asString(parsed.focusKeyword),
    metaTitle: asString(parsed.metaTitle),
    metaDescription: asString(parsed.metaDescription),
    shortDescriptionHtml: asString(parsed.shortDescriptionHtml),
    bullets,
  };
  if (!copy.productTitle || !copy.shortDescriptionHtml || !copy.focusKeyword) {
    return { ok: false, error: "copy_incomplete" };
  }

  // Self-score with the same RankMath checker the blog pipeline uses. The body we score
  // is the title + answer capsule + bullets rendered as plain markdown (link-free).
  const markdown = [
    `# ${copy.productTitle}`,
    copy.shortDescriptionHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    ...copy.bullets.map((b) => `- ${b}`),
  ].join("\n\n");
  const rankMath = checkRankMath({
    markdown,
    focusKeyword: copy.focusKeyword,
    seoTitle: copy.metaTitle,
    metaDescription: copy.metaDescription,
    slug: copy.productTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
    siteDomain: input.siteDomain,
  });

  return { ok: true, copy, rankMath };
}
