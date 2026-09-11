// collect/extract-provider — the tier below collect/http-html.
//
// WHY IT EXISTS, measured rather than assumed: a live crawl of aware-wave.com through the cheap
// tier extracted 202 bytes at a text density of 0.0027 and was correctly refused as `too_short`.
// The page is JavaScript-rendered, so there is nothing in the HTML to extract. The quality gate did
// its job; what was missing was somewhere to degrade TO.
//
// The orchestrator already had the mechanism — candidates are tried in descending match() order and
// it falls through when everything a tier produced fails the gate. So this is one file and one
// registration; the orchestrator is untouched, which is the whole point of the block contract.
//
// WHY A PROVIDER AND NOT A HEADLESS BROWSER: a browser farm is permanent infrastructure, plus
// an anti-bot arms race that never ends, plus a memory profile that does not belong next to a web
// app. A per-call API has none of that standing cost. Self-hosted is not free — CPU, RAM, bandwidth
// and the hours spent keeping it alive are the expensive part.
//
// INERT WITHOUT A KEY: match() returns 0 when the provider is unconfigured, so a deployment with no
// FIRECRAWL_API_KEY behaves exactly as it did before this file existed.

import { createHash } from "node:crypto";
import type { CollectBlock, CollectCtx, RawDoc, Target } from "@/lib/collect/types";
import { registerCollector } from "@/lib/collect/registry";
import { COLLECTED_PROVENANCE } from "@/lib/collect/provenance";
import { providerConfigured } from "@/lib/collect/net/providers";

/** Which vendor fills this tier. One environment variable, no vendor name in any caller. */
export function extractProviderId(env: Record<string, string | undefined> = process.env): string {
  return env.COLLECT_EXTRACT_PROVIDER || "firecrawl";
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

export const extractProviderCollector: CollectBlock = {
  id: "collect/extract-provider",
  title: "JS 渲染網頁 / PDF（外部供應商）",
  icon: "🛰️",

  describe: {
    kind: "rendered",
    summary: "便宜階讀不到的頁面（JavaScript 渲染、PDF）交給外部抽取供應商。按次計費。",
    entry: "url",
    requires: ["FIRECRAWL_API_KEY"],
    metered: true,
  },

  /**
   * 0.5 — below collect/http-html's 1, so the cheap tier always goes first and this one only ever
   * runs for pages the cheap tier could not read. That ordering is the cost control: a rendering
   * call costs money, an HTTP GET does not.
   */
  match(t: Target): number {
    if (!providerConfigured(extractProviderId())) return 0;
    try {
      const u = new URL(t.uri);
      if (u.protocol !== "https:" && u.protocol !== "http:") return 0;
      // Unlike the cheap tier, PDFs are fair game: the provider extracts them and we cannot.
      if (/\.(zip|jpg|jpeg|png|gif|webp|mp4|mp3)$/i.test(u.pathname)) return 0;
      return 0.5;
    } catch {
      return 0;
    }
  },

  async run(t: Target, ctx: CollectCtx): Promise<{ docs: RawDoc[]; discovered: Target[] }> {
    if (!ctx.callProvider) {
      throw Object.assign(new Error("provider_call_unavailable"), { status: 501 });
    }
    const providerId = extractProviderId();
    const res = await ctx.callProvider(providerId, {
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
          // The density check is therefore skipped for this tier BY CONSTRUCTION (quality.ts states
          // that branch explicitly) — which is correct, because "text ÷ payload" is meaningless when
          // somebody else did the extraction. Length, soft-404 and injection screening still apply.
          raw: null,
          fetchedAt: new Date().toISOString(),
          publishedAt: published && !Number.isNaN(published.getTime()) ? published.toISOString() : null,
          collector: `collect/extract-provider:${providerId}`,
          tenantRef: ctx.tenantRef,
          provenance: { ...COLLECTED_PROVENANCE }, // re-stamped by the orchestrator
          meta: { provider: providerId, language: meta.language, description: meta.description },
        },
      ],
      // No link discovery: this tier exists to read one page the cheap tier could not. Crawling the
      // site's link graph through a paid rendering API, page by page, is how a bill gets surprising.
      discovered: [],
    };
  },
};

registerCollector(extractProviderCollector);
