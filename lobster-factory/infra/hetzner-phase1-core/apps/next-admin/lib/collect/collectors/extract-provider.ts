// collect/extract-provider — the tier below collect/http-html.
//
// WHY IT EXISTS, measured rather than assumed: a live crawl of aware-wave.com through the cheap
// tier extracted 202 bytes at a text density of 0.0027 and was correctly refused as `too_short`.
// The page is JavaScript-rendered, so there is nothing in the HTML to extract. The quality gate did
// its job; what was missing was somewhere to degrade TO. A second class arrived with background
// research (2026-09-20): pages that answer a non-browser client with 403.
//
// The orchestrator already had the mechanism — candidates are tried in descending match() order and
// it falls through when everything a tier produced fails the gate, or the tier threw a 4xx. So this
// is one block with one driver per vendor; the orchestrator is untouched.
//
// TWO VENDORS, ONE TIER (net/providers.ts has the history of the choice):
//   renderer  — self-hosted headless Chromium (apps/renderer). Returns rendered HTML, which goes
//               through collectors/http-html.ts's docFromHtml: the SAME extractor as the cheap tier.
//               Default whenever it is configured.
//   firecrawl — hosted fetch-and-extract. Returns its own markdown. Kept as the explicit second
//               choice, and because it is the only one that reads PDFs today.
//
// INERT WITHOUT A KEY: match() returns 0 when the selected vendor is unconfigured, so a deployment
// with neither key behaves exactly as it did before this file existed.
//
// ROBOTS: this tier is only ever reached after the cheap tier fetched the SAME url through ctx.fetch,
// which evaluates robots.txt first — and a robots refusal ends the ladder (orchestrator.ts, outcome
// "disallowed"), it never degrades here. So nothing robots.txt forbids is ever rendered.

import { createHash } from "node:crypto";
import type { CollectBlock, CollectCtx, RawDoc, Target } from "@/lib/collect/types";
import { registerCollector } from "@/lib/collect/registry";
import { COLLECTED_PROVENANCE } from "@/lib/collect/provenance";
import { providerConfigured } from "@/lib/collect/net/providers";
import { NON_RENDERED_TAGS, docFromHtml, stripElements } from "@/lib/collect/collectors/http-html";

/**
 * Which vendor fills this tier: an explicit choice wins, otherwise whichever is actually configured,
 * the self-hosted renderer first. Same rule as the search vendors (search/drivers.ts): defaulting to
 * one vendor would make the tier look broken whenever it is the OTHER key that was set.
 */
export function extractProviderId(env: Record<string, string | undefined> = process.env): string {
  if (env.COLLECT_EXTRACT_PROVIDER) return env.COLLECT_EXTRACT_PROVIDER;
  if (env.RENDERER_SHARED_SECRET) return "renderer";
  return "firecrawl";
}

interface FirecrawlResponse {
  success?: boolean;
  data?: {
    markdown?: string;
    html?: string;
    metadata?: {
      title?: string;
      description?: string;
      language?: string;
      sourceURL?: string;
      author?: string;
      publishedTime?: string;
      ogType?: string;
      statusCode?: number;
    };
  };
  error?: string;
}

interface RendererResponse {
  ok?: boolean;
  status?: number;
  finalUrl?: string;
  title?: string;
  contentType?: string;
  html?: string;
  truncated?: boolean;
  error?: string;
}

/**
 * Markdown is easier to read than HTML for a model, but the link and image syntax is noise in a
 * knowledge base. Stripped here rather than in the quality gate, which measures what was extracted
 * and should not be measuring markup we chose to keep.
 */
export function markdownToText(md: string): string {
  return md
    .replace(/^```[\s\S]*?```$/gm, " ") // fenced code: never the prose of a policy page
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links keep their text
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/[*_`]{1,3}/g, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\|.*\|\s*$/gm, (row) => row.replace(/\|/g, " ").trim()) // tables to plain rows
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type TierResult = { docs: RawDoc[]; discovered: Target[] };

/**
 * Render with the self-hosted browser, then read the result exactly as the cheap tier would.
 *
 * The one deliberate difference is what the quality gate measures density AGAINST. A live DOM
 * serialised by a browser carries the framework's own code and state inline — bundles, hydration
 * JSON, style blocks — none of which is page content and none of which says anything about whether
 * the extracted text is an article or a navigation bar. Measured against that, every modern
 * JavaScript site reads as "mostly chrome", which is the exact false refusal this tier exists to fix.
 * So the payload handed to the gate is the rendered DOM minus the elements a browser never renders
 * as text (NON_RENDERED_TAGS). Navigation, headers and footers stay in: those ARE the chrome the
 * density check is there to catch. This is a definition of the payload, not a relaxed threshold —
 * MIN_DENSITY is untouched.
 */
async function renderWithBrowser(t: Target, ctx: CollectCtx): Promise<TierResult> {
  const res = await ctx.callProvider!("renderer", {
    path: "/render",
    method: "POST",
    body: { url: t.uri, timeoutMs: 40_000 },
  });
  const json = (await res.json()) as RendererResponse;
  if (!json.ok || typeof json.html !== "string") {
    throw Object.assign(new Error(`renderer_no_content_${json.error ?? "empty"}`), { status: 502 });
  }
  // The origin's own answer, as seen by a real browser. Surfaced as a status FIELD so the
  // orchestrator classifies it like any other fetch: 404/410 become tombstones, 403 ends the ladder.
  const status = json.status ?? 0;
  if (status >= 400) throw Object.assign(new Error(`HTTP ${status} ${t.uri} (rendered)`), { status });
  if (json.truncated) {
    // Half a document that would replace the whole one — same refusal as the cheap tier's.
    throw Object.assign(new Error(`truncated_response ${t.uri} (rendered)`), { status: 502 });
  }
  if (json.contentType && !/text\/html|application\/xhtml/i.test(json.contentType)) {
    throw Object.assign(new Error(`unsupported_content_type_${json.contentType.split(";")[0]}`), { status: 415 });
  }

  const { doc } = docFromHtml({
    html: json.html,
    bytes: new TextEncoder().encode(stripElements(json.html, NON_RENDERED_TAGS)),
    finalUrl: json.finalUrl || t.uri,
    target: t,
    ctx,
    collector: "collect/extract-provider:renderer",
  });
  // No link discovery, same as the hosted vendor: this tier reads ONE page the cheap tier could not.
  // A site's link graph walked page by page through a browser is how a small crawl becomes an hour.
  return { docs: [doc], discovered: [] };
}

async function extractWithFirecrawl(t: Target, ctx: CollectCtx): Promise<TierResult> {
  const res = await ctx.callProvider!("firecrawl", {
    path: "/v1/scrape",
    method: "POST",
    body: { url: t.uri, formats: ["markdown"], onlyMainContent: true },
  });

  const json = (await res.json()) as FirecrawlResponse;
  if (!json.data?.markdown) {
    throw Object.assign(new Error(`provider_no_content_${json.error ?? "empty"}`), { status: 502 });
  }
  const meta = json.data.metadata ?? {};
  const text = markdownToText(json.data.markdown);
  const finalUrl = meta.sourceURL ?? t.uri;

  const published = meta.publishedTime ? new Date(meta.publishedTime) : null;

  return {
    docs: [
      {
        uri: finalUrl,
        // Same rule as the cheap tier: identity comes from the URL WE fetched. The provider's
        // metadata is just as page-controlled as the page's own canonical link.
        canonicalUrl: ctx.canonicalize(finalUrl),
        contentHash: createHash("sha256").update(text, "utf8").digest("hex"),
        mime: "text/plain",
        title: meta.title ?? null,
        author: meta.author ?? null,
        contentType: meta.ogType === "article" ? "article" : "web_page",
        text,
        // NO raw payload: the provider returns extracted text, we never see the bytes it read.
        // The density check is therefore skipped for this vendor BY CONSTRUCTION (quality.ts states
        // that branch explicitly) — which is correct, because "text ÷ payload" is meaningless when
        // somebody else did the extraction. Length, soft-404 and injection screening still apply.
        raw: null,
        fetchedAt: new Date().toISOString(),
        publishedAt: published && !Number.isNaN(published.getTime()) ? published.toISOString() : null,
        collector: "collect/extract-provider:firecrawl",
        tenantRef: ctx.tenantRef,
        provenance: { ...COLLECTED_PROVENANCE }, // re-stamped by the orchestrator
        meta: { provider: "firecrawl", language: meta.language, description: meta.description },
      },
    ],
    // No link discovery: crawling a site's link graph through a paid rendering API, page by page,
    // is how a bill gets surprising.
    discovered: [],
  };
}

/** What each vendor can read. The browser renders web pages; it does not extract PDFs. */
const UNREADABLE: Record<string, RegExp> = {
  renderer: /\.(pdf|zip|jpg|jpeg|png|gif|webp|mp4|mp3|csv|xlsx?|docx?)$/i,
  firecrawl: /\.(zip|jpg|jpeg|png|gif|webp|mp4|mp3)$/i,
};

const DRIVERS: Record<string, (t: Target, ctx: CollectCtx) => Promise<TierResult>> = {
  renderer: renderWithBrowser,
  firecrawl: extractWithFirecrawl,
};

export const extractProviderCollector: CollectBlock = {
  id: "collect/extract-provider",
  title: "JS 渲染網頁（瀏覽器後備層）",
  icon: "🛰️",

  describe: {
    kind: "rendered",
    summary:
      "便宜階讀不到的頁面（要跑 JavaScript 才有內容、或拒絕非瀏覽器的連線）改用真瀏覽器讀。預設用自架瀏覽器（不計費）；設定 Firecrawl 金鑰時也可改用它讀 PDF。",
    entry: "url",
    // Either vendor makes the tier usable. Listed together so the catalogue names both when neither
    // is set, rather than implying the one it happens to list first is the only option.
    requiresAny: ["RENDERER_SHARED_SECRET", "FIRECRAWL_API_KEY"],
  },

  /**
   * 0.5 — below collect/http-html's 1, so the cheap tier always goes first and this one only ever
   * runs for pages the cheap tier could not read. That ordering is the cost control: a render costs
   * seconds of browser time (or money, for a hosted vendor); an HTTP GET does not.
   */
  match(t: Target): number {
    const vendor = extractProviderId();
    if (!DRIVERS[vendor] || !providerConfigured(vendor)) return 0;
    try {
      const u = new URL(t.uri);
      if (u.protocol !== "https:" && u.protocol !== "http:") return 0;
      if (UNREADABLE[vendor]?.test(u.pathname)) return 0;
      return 0.5;
    } catch {
      return 0;
    }
  },

  async run(t: Target, ctx: CollectCtx): Promise<TierResult> {
    if (!ctx.callProvider) {
      throw Object.assign(new Error("provider_call_unavailable"), { status: 501 });
    }
    const vendor = extractProviderId();
    const driver = DRIVERS[vendor];
    if (!driver) throw Object.assign(new Error(`unknown_extract_provider_${vendor}`), { status: 501 });
    return driver(t, ctx);
  },
};

registerCollector(extractProviderCollector);
