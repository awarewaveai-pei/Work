// Extraction quality gate (DATA_COLLECTION_PLAN.md §1.3). Computed by the orchestrator — never
// self-reported by a block, because a block that grades itself grades itself generously.
//
// The failure this exists to stop throws no exception: a navigation bar, a cookie banner or a
// soft-404 gets written into the knowledge base as if it were content, and answers degrade a little
// at a time with nothing in any log.
//
// NAMING (ADR 011 §決策 14): this is EXTRACTION quality — did we get the article or the chrome
// around it. It is a different axis from hci30's EVIDENCE quality (how many independent sources
// support a claim) and the two must never borrow each other's thresholds or vocabulary.

import type { QualityVerdict, RawDoc } from "@/lib/collect/types";

/**
 * Minimum extracted text, in UTF-8 BYTES, per script.
 *
 * Split by script on purpose: 200 Chinese characters carry about as much content as 130 English
 * words, but weigh ~600 bytes against ~800. A single threshold either rejects legitimate Chinese
 * FAQs or waves through English boilerplate — there is no value that does neither.
 */
export const MIN_TEXT_BYTES = { cjk: 600, latin: 700 } as const;

/**
 * The same floor for documents that arrived as STRUCTURED RECORDS rather than as pages.
 *
 * The thresholds above answer one question: "is this the article, or the navigation around it?" A
 * paper's abstract, a government notice from a JSON endpoint and a short FAQ record are complete
 * documents of their kind, and the chrome failure cannot happen to them — there is no chrome in a
 * JSON field. Judging them by a page's yardstick throws away real content, silently, which is the
 * same class of error as letting chrome in.
 *
 * The floor is not zero: an empty or one-line record is still refused.
 *
 * Which documents count as structured is decided HERE, by content type, not by the block — a block
 * that could lower its own bar would eventually lower it.
 */
export const MIN_STRUCTURED_BYTES = 300;
const STRUCTURED_CONTENT_TYPES = new Set(["academic_paper", "api_record"]);

/**
 * Extracted text as a fraction of the raw payload, both measured in UTF-8 bytes.
 *
 * Same unit on both sides is not a detail: counting UTF-16 code units on top of UTF-8 bytes puts
 * Chinese pages at a third of the ratio of English ones, i.e. a systematic bias against Chinese
 * content that looks like a tuning problem and is actually an arithmetic bug.
 */
export const MIN_DENSITY = 0.01;

/** Pages that answer 200 OK with "not found" — full chrome, normal length, no content. */
const SOFT_404_STRONG = [
  /^\s*404\b/,
  /\b404[\s:-]*(not found|error|page)/i,
  /page (?:you (?:are|were) looking for )?(?:could not|couldn't|can't) be found/i,
  /this page (?:no longer exists|has been (?:removed|deleted))/i,
  /頁面不存在/,
  /該頁面已(移除|刪除|下架)/,
  /お探しのページは見つかりません/,
];

/**
 * Weak markers: the page merely CONTAINS these words. They only count in the title or the opening
 * lines, and only alongside a second signal — because the cost of a false positive here is a real
 * customer FAQ silently never reaching the knowledge base, and "找不到頁面怎麼辦？" is an entirely
 * ordinary FAQ heading.
 */
const SOFT_404_WEAK = [
  /\b404\b/,
  /page not found/i,
  /not found/i,
  /找不到(這個|該|此)?(頁面|網頁|商品|產品)/,
];

const encoder = new TextEncoder();
export function utf8Bytes(s: string): number {
  return encoder.encode(s).byteLength;
}

/** Which threshold set applies. CJK if a meaningful share of the text is CJK. */
export function scriptOf(text: string): "cjk" | "latin" {
  const sample = text.slice(0, 4000);
  if (!sample.length) return "latin";
  const cjk = (sample.match(/[㐀-鿿぀-ヿ가-힯]/g) ?? []).length;
  return cjk / sample.length >= 0.2 ? "cjk" : "latin";
}

export interface GradeOptions {
  /**
   * The page declared a canonical URL pointing somewhere else — on its own that is normal
   * (syndication), but combined with 404 wording it is a soft-404 rather than a short article.
   */
  canonicalMismatch?: boolean;
}

/**
 * Decide whether a document may be stored. Refusal is reported (report.dirty) and alerted on — the
 * one outcome that is never acceptable is dropping it quietly.
 */
export function grade(doc: RawDoc, opts: GradeOptions = {}): QualityVerdict {
  const script = scriptOf(doc.text);
  const textBytes = utf8Bytes(doc.text);
  const structured = STRUCTURED_CONTENT_TYPES.has(doc.contentType);
  const minTextBytes = structured ? MIN_STRUCTURED_BYTES : MIN_TEXT_BYTES[script];

  // raw === null (an API-shaped source with no payload of its own) means density is not computable.
  // Stated explicitly because `NaN >= x` is false, which would fail EVERY such document.
  const rawBytes = doc.raw ? doc.raw.bytes.byteLength : null;
  const density = rawBytes && rawBytes > 0 ? textBytes / rawBytes : null;

  const title = doc.title ?? "";
  const opening = doc.text.slice(0, 160);
  // A strong marker stands alone. A weak one must sit in the title or the opening lines AND be
  // backed by something else: a very short body, or the page pointing its canonical elsewhere,
  // which is what a templated error page does.
  const strongMarker = SOFT_404_STRONG.some((re) => re.test(title) || re.test(opening));
  const weakMarker = SOFT_404_WEAK.some((re) => re.test(title) || re.test(opening));
  const softNotFound =
    strongMarker || (weakMarker && (textBytes < minTextBytes * 1.5 || !!opts.canonicalMismatch));

  const checks: QualityVerdict["checks"] = {
    textBytes,
    minTextBytes,
    density,
    minDensity: MIN_DENSITY,
    script,
    softNotFound,
  };

  if (softNotFound) return { ok: false, reason: "soft_404", checks };
  if (textBytes < minTextBytes) return { ok: false, reason: "too_short", checks };
  if (density !== null && density < MIN_DENSITY) return { ok: false, reason: "low_text_density", checks };
  return { ok: true, reason: null, checks };
}

// A per-host exemption for a site that fails the density check is forbidden: that is editing the
// detector until it agrees with the system, which AGENTS.md names as worse than the original bug.
// A JavaScript-rendered site whose raw HTML is mostly inline JSON belongs in a headless fetch tier,
// or is registered as a source type where density does not apply.
