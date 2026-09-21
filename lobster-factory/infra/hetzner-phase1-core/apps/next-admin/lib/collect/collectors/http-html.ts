// collect/http-html — fetch one HTML page, extract its readable text, offer its in-scope links.
//
// No dependency: a DOM parser or a readability library is a lot of surface for "find the article and
// drop the chrome", and the failure mode we care about is not exotic markup, it is boilerplate being
// stored as content — which the orchestrator's quality gate catches regardless of how it was
// extracted (DATA_COLLECTION_PLAN.md §1.3).
//
// This is the cheap tier. A JavaScript-rendered site produces almost no text here, fails the gate,
// and the orchestrator degrades to a heavier strategy when one is registered. That is the designed
// path — never a per-site exemption in the gate.

import { createHash } from "node:crypto";
import type { CollectBlock, CollectCtx, RawDoc, Target } from "@/lib/collect/types";
import { registerCollector } from "@/lib/collect/registry";
import { COLLECTED_PROVENANCE } from "@/lib/collect/provenance";

/** Elements whose text is never the document. */
const DROP_TAGS = [
  "script", "style", "noscript", "template", "svg", "nav", "header", "footer", "aside", "form",
  "iframe", "button", "select",
];

/**
 * Remove those elements with a single linear scan.
 *
 * NOT a regex with a backreference: measured on 340KB containing 20,000 unclosed <script> tags,
 * `/<(script|…)\b[\s\S]*?<\/\1\s*>/gi` took 2.6 SECONDS and scales quadratically, so a page near
 * the 5MB fetch ceiling blocks the event loop for minutes. Worse, when the payload was truncated
 * mid-element that regex matches nothing at all and the entire remaining script body flows into the
 * extracted text — where it is dense enough to pass the density check and be stored as content.
 * An unclosed element here drops everything to the end of the document instead, which is both fast
 * and the safe direction.
 */
export function stripElements(html: string, tags: readonly string[] = DROP_TAGS): string {
  let out = "";
  let i = 0;
  const lower = html.toLowerCase();
  while (i < html.length) {
    const lt = lower.indexOf("<", i);
    if (lt < 0) {
      out += html.slice(i);
      break;
    }
    const tag = tags.find(
      (t) => lower.startsWith(t, lt + 1) && /[\s/>]/.test(lower[lt + 1 + t.length] ?? ">"),
    );
    if (!tag) {
      out += html.slice(i, lt + 1);
      i = lt + 1;
      continue;
    }
    out += `${html.slice(i, lt)} `;
    const close = lower.indexOf(`</${tag}`, lt);
    if (close < 0) break; // unclosed: the rest of the document is inside it
    const closeEnd = lower.indexOf(">", close);
    i = closeEnd < 0 ? html.length : closeEnd + 1;
  }
  return out;
}
/**
 * Elements a browser never renders as text: executable code, styling, and templates. Removing ONLY
 * these (not nav/header/footer) gives the payload a rendered page's text was actually drawn from —
 * see collectors/extract-provider.ts's renderer driver for why the quality gate needs that.
 */
export const NON_RENDERED_TAGS = ["script", "style", "noscript", "template"] as const;

const SELF_CLOSING_NOISE = /<(br|hr|img|input|source|track)\b[^>]*\/?>/gi;
const BLOCK_END = /<\/(p|div|section|article|h[1-6]|li|tr|blockquote|pre)\s*>/gi;

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#160": " ",
  mdash: "—", ndash: "–", hellip: "…", laquo: "«", raquo: "»", ldquo: "“", rdquo: "”",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, name: string) => {
    const key = name.toLowerCase();
    if (ENTITIES[key]) return ENTITIES[key];
    // Bounds matter: String.fromCodePoint(0x110000) THROWS, and the page controls this number.
    // An unhandled RangeError here aborts extraction for the whole document — verified against
    // `&#x110000;` and `&#99999999999;`.
    if (key.startsWith("#")) {
      const hex = key.startsWith("#x");
      const code = Number.parseInt(hex ? key.slice(2) : key.slice(1), hex ? 16 : 10);
      if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    return whole;
  });
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? "").trim() : null;
}

function metaContent(html: string, matcher: RegExp): string | null {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = attr(tag, "property") ?? attr(tag, "name");
    if (key && matcher.test(key)) {
      const content = attr(tag, "content");
      if (content) return content;
    }
  }
  return null;
}

/** The main content region if the page marks one, otherwise the body. */
function contentRegion(html: string): string {
  for (const re of [/<main\b[^>]*>([\s\S]*?)<\/main\s*>/i, /<article\b[^>]*>([\s\S]*?)<\/article\s*>/i]) {
    const m = re.exec(html);
    if (m && m[1].length > 200) return m[1];
  }
  const body = /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(html);
  return body ? body[1] : html;
}

export function extractText(html: string): string {
  const region = stripElements(contentRegion(html))
    .replace(SELF_CLOSING_NOISE, "\n")
    .replace(BLOCK_END, "\n\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(region)
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractTitle(html: string): string | null {
  const og = metaContent(html, /^og:title$/i);
  if (og) return og;
  const t = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  if (t) return decodeEntities(t[1]).replace(/\s+/g, " ").trim() || null;
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i.exec(html);
  return h1 ? decodeEntities(h1[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() || null : null;
}

export function extractLinks(html: string, baseUrl: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*>/gi)) {
    const href = attr(m[0], "href");
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) continue;
    try {
      const u = new URL(href, baseUrl);
      if (u.protocol === "http:" || u.protocol === "https:") out.add(u.toString());
    } catch {
      /* a malformed href is not worth a failed page */
    }
  }
  return [...out];
}

export function extractAuthor(html: string): string | null {
  const meta = metaContent(html, /^(author|article:author|dc\.creator|twitter:creator)$/i);
  if (meta) return meta.slice(0, 200);
  const rel = /<a\b[^>]*\brel\s*=\s*["']?author["']?[^>]*>([\s\S]*?)<\/a\s*>/i.exec(html);
  return rel ? decodeEntities(rel[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 200) || null : null;
}

function publishedAtOf(html: string): string | null {
  const meta =
    metaContent(html, /^(article:published_time|datePublished|publish[-_]?date|date)$/i) ??
    (() => {
      const t = /<time\b[^>]*>/i.exec(html);
      return t ? attr(t[0], "datetime") : null;
    })();
  if (!meta) return null;
  const d = new Date(meta);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export interface HtmlPageInput {
  html: string;
  /** The payload the text was extracted from — kept so the quality gate can measure density. */
  bytes: Uint8Array;
  finalUrl: string;
  target: Target;
  ctx: CollectCtx;
  /** Which strategy produced the HTML: the cheap HTTP tier, or a rendered tier that ran the page's JS. */
  collector: string;
  etag?: string | null;
  lastModified?: string | null;
}

/**
 * HTML in, one document and its in-scope links out. The ONE definition of "readable content from an
 * HTML page" in the system: the cheap tier calls it with the bytes it fetched, and the rendered tier
 * (collectors/extract-provider.ts, renderer driver) calls it with the HTML a real browser produced
 * after running the page's JavaScript. Two extractors would mean a page's text depends on which tier
 * happened to read it, and the quality gate would be judging two different things under one name.
 */
export function docFromHtml(p: HtmlPageInput): { doc: RawDoc; discovered: Target[] } {
  const { html, bytes, finalUrl, ctx } = p;
  const t = p.target;

  const text = extractText(html);
  let rejectedCanonical: string | null = null;
  // The page's own canonical link wins when it has one — but ONLY within its own origin.
  //
  // Downstream, canonicalUrl IS the document's identity (lib/kb/family.ts hashes it into the
  // document family id), so an unchecked value lets a page decide which document it supersedes.
  // Two ways that ends badly, one of them not even an attack:
  //   * a CMS misconfigured to emit `canonical=<home page>` on every page — crawl 200 pages, all
  //     200 land in one family, each archiving the last, and the knowledge base keeps exactly one
  //     of them, with no error anywhere;
  //   * a user-generated or compromised page declaring `canonical=/refund-policy`, which makes it
  //     the next version of the real refund policy and archives the real one.
  const declaredCanonical = (() => {
    for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
      if (!/rel\s*=\s*["']?canonical/i.test(m[0])) continue;
      const href = attr(m[0], "href");
      if (!href) continue;
      try {
        const claimed = new URL(href, finalUrl);
        if (claimed.origin !== new URL(finalUrl).origin) {
          ctx.log(`ignoring cross-origin canonical on ${finalUrl}: ${claimed.toString()}`);
          rejectedCanonical = claimed.toString();
          return null;
        }
        return claimed.toString();
      } catch {
        return null;
      }
    }
    return null;
  })();

  const doc: RawDoc = {
    uri: finalUrl,
    canonicalUrl: ctx.canonicalize(declaredCanonical ?? finalUrl),
    contentHash: createHash("sha256").update(text, "utf8").digest("hex"),
    mime: "text/html",
    title: extractTitle(html),
    author: extractAuthor(html),
    contentType: metaContent(html, /^og:type$/i) === "article" ? "article" : "web_page",
    text,
    raw: { bytes, mime: "text/html" },
    fetchedAt: new Date().toISOString(),
    publishedAt: publishedAtOf(html),
    collector: p.collector,
    tenantRef: ctx.tenantRef,
    provenance: { ...COLLECTED_PROVENANCE }, // re-stamped by the orchestrator; never trusted here
    meta: {
      etag: p.etag ?? undefined,
      lastModified: p.lastModified ?? undefined,
      declaredCanonicalRejected: rejectedCanonical ?? undefined,
      language: /<html\b[^>]*\blang\s*=\s*["']?([a-z-]+)/i.exec(html)?.[1] ?? undefined,
      // searchQuery used to be copied here, by this collector alone. The orchestrator now carries
      // it (and searchAngle/searchLang) from the target onto EVERY collector's documents, so a
      // page read by the rendered tier or the API tier is filed the same as one read here.
    },
  };

  const discovered: Target[] = extractLinks(html, finalUrl).map((uri) => ({
    uri,
    canonicalUri: ctx.canonicalize(uri), // the orchestrator recomputes this; kept consistent here
    scope: t.scope,
    tier: 0,
    depth: t.depth + 1,
  }));

  return { doc, discovered };
}

export const httpHtmlCollector: CollectBlock = {
  id: "collect/http-html",
  title: "網頁",
  icon: "🌐",

  describe: {
    kind: "web",
    summary: "抓一個網址，抽出正文，並跟著同網域的連結繼續走。最常用的來源。",
    entry: "url",
    options: [
      { key: "maxDepth", label: "跟著連結走幾層", type: "number", default: 2 },
      { key: "pathPrefix", label: "只收這個路徑底下", type: "string", help: "例如 /faq，留空表示整個網域。" },
    ],
  },

  /**
   * Score 1: the baseline strategy, so anything more specialised (a sitemap reader, a headless
   * renderer, a PDF extractor) outranks it and this one remains the fallback.
   */
  match(t: Target): number {
    try {
      const u = new URL(t.uri);
      if (u.protocol !== "https:" && u.protocol !== "http:") return 0;
      if (/\.(pdf|zip|jpg|jpeg|png|gif|webp|mp4|mp3|csv|xlsx?|docx?)$/i.test(u.pathname)) return 0;
      return 1;
    } catch {
      return 0;
    }
  },

  async run(t: Target, ctx: CollectCtx): Promise<{ docs: RawDoc[]; discovered: Target[]; notModified?: boolean }> {
    const res = await ctx.fetch(t.uri, {
      headers: {
        // Conditional request: an unchanged page answers 304 and costs no body, no extraction and
        // no embedding downstream (DATA_COLLECTION_PLAN.md §1.4).
        ...(typeof t.meta?.etag === "string" ? { "if-none-match": t.meta.etag } : {}),
        ...(typeof t.meta?.lastModified === "string" ? { "if-modified-since": t.meta.lastModified } : {}),
      },
    });

    if (res.headers.get("x-collect-truncated") === "1") {
      // Half a document that would go on to replace the whole one. The quality gate cannot see
      // this — a truncated page is often long and dense enough to look fine.
      throw Object.assign(new Error(`truncated_response ${t.uri}`), { status: 502 });
    }

    if (res.status === 304) {
      ctx.log(`unchanged (304): ${t.uri}`);
      // No body ⇒ no links of our own to report. The orchestrator knows to replay ITS cached
      // discoveredLinks for this URL instead of reading this as "a page with zero links" — that
      // signal is `notModified`, not the empty arrays, which look identical either way.
      return { docs: [], discovered: [], notModified: true };
    }
    // The orchestrator classifies these: 404/410 become tombstones, 429/503 become retries.
    // `status` as a FIELD, not as text in the message: the orchestrator classifies on it, and a
    // message-matching classifier would read the "404" in .../blog/404-explained as "page gone".
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} ${t.uri}`), { status: res.status });

    const contentType = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(contentType)) {
      throw Object.assign(new Error(`unsupported_content_type_${contentType.split(";")[0] || "unknown"}`), {
        status: 415,
      });
    }

    const bytes = new Uint8Array(await res.arrayBuffer());
    const html = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const finalUrl = res.url || t.uri;

    const { doc, discovered } = docFromHtml({
      html,
      bytes,
      finalUrl,
      target: t,
      ctx,
      collector: "collect/http-html",
      etag: res.headers.get("etag"),
      lastModified: res.headers.get("last-modified"),
    });
    return { docs: [doc], discovered };
  },
};

registerCollector(httpHtmlCollector);
