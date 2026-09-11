// collect/video — what a web video actually says.
//
// THE POINT IS THE TRANSCRIPT. A video's page metadata is a title, a channel name and a blurb: about
// forty words, which the quality gate refuses and should refuse. Storing that would put "我們的退貨
// 政策說明影片" into the knowledge base as if the policy were in there. So this block collects the
// caption track, and when there is no caption track it FAILS with a reason rather than storing the
// stub — a refusal an operator can see beats a document that quietly says nothing.
//
// HOW THE CAPTIONS ARE FOUND, and how fragile that is: YouTube publishes no free captions API, so
// the track list is read out of the watch page's own player payload. That is an undocumented field
// and it will break one day. It fails loudly when it does (a classified error, a `dirty` row, an
// incident if a whole run is affected) — which is the difference between a source that broke and a
// source that silently went quiet. A paid provider tier is the alternative when that day comes.
//
// Platforms with a public captions URL in the page (a <track> element) work the same way, which
// covers self-hosted video and most embedded players.

import { createHash } from "node:crypto";
import type { CollectBlock, CollectCtx, RawDoc, Target } from "@/lib/collect/types";
import { registerCollector } from "@/lib/collect/registry";
import { COLLECTED_PROVENANCE } from "@/lib/collect/provenance";
import { captionsToText } from "@/lib/collect/collectors/local-file";

const VIDEO_HOSTS = [
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "vimeo.com",
  "player.vimeo.com",
];

export function isVideoUrl(uri: string): boolean {
  try {
    const u = new URL(uri);
    const host = u.hostname.toLowerCase();
    if (VIDEO_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return true;
    return /\.(mp4|webm|m3u8)$/i.test(u.pathname);
  } catch {
    return false;
  }
}

/** Meta tags carry what the platform is willing to say about a video without an API key. */
export function videoMetadata(html: string): { title: string | null; description: string | null; author: string | null; published: string | null } {
  const meta = (names: string[]): string | null => {
    for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
      const tag = m[0];
      const key = /(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
      if (key && names.includes(key)) {
        const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
        if (content) return content.replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim();
      }
    }
    return null;
  };
  return {
    title: meta(["og:title", "twitter:title", "name", "title"]),
    description: meta(["og:description", "twitter:description", "description"]),
    author: meta(["author", "og:video:director", "channelname"]),
    published: meta(["uploaddate", "datepublished", "og:video:release_date"]),
  };
}

/**
 * Caption track URLs, in the two places a page can offer them.
 *
 * The first is a standard `<track>` element — self-hosted players and many embeds. The second is
 * YouTube's player payload, which is not an API and is not promised to anybody; see the file header.
 */
export function captionTrackUrls(html: string): string[] {
  const urls: string[] = [];

  for (const m of html.matchAll(/<track\b[^>]*>/gi)) {
    if (!/kind\s*=\s*["']?(captions|subtitles)/i.test(m[0])) continue;
    const src = /src\s*=\s*["']([^"']+)["']/i.exec(m[0])?.[1];
    if (src) urls.push(src);
  }

  for (const m of html.matchAll(/"captionTracks":\s*(\[[^\]]*\])/g)) {
    for (const b of m[1].matchAll(/"baseUrl":"([^"]+)"/g)) {
      urls.push(b[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/"));
    }
  }
  return [...new Set(urls)];
}

/** YouTube's timedtext XML, which is neither VTT nor SRT. */
export function timedTextToText(xml: string): string {
  const parts = [...xml.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((m) =>
    m[1]
      .replace(/&amp;#39;/g, "'")
      .replace(/&amp;quot;/g, '"')
      .replace(/&amp;amp;/g, "&")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
  return parts.filter(Boolean).join("\n").trim();
}

export const videoCollector: CollectBlock = {
  id: "collect/video",
  title: "網路影片（字幕逐字）",
  icon: "🎬",

  describe: {
    kind: "video",
    summary: "收 YouTube／Vimeo／自架影片的字幕逐字稿。沒有字幕的影片會被明確報錯，不會只存標題。",
    entry: "url",
    options: [
      {
        key: "requireTranscript",
        label: "沒有字幕就不收",
        type: "boolean",
        default: true,
        help: "關掉的話，只有標題與簡介的影片也會進庫——通常會被品質閘擋下。",
      },
      { key: "language", label: "偏好字幕語言", type: "string", help: "例如 zh-TW、en。留空表示取第一個。" },
    ],
  },

  /** 3 — a video URL fetched by the HTML tier yields a page of player chrome and nothing else. */
  match(t: Target): number {
    return isVideoUrl(t.uri) ? 3 : 0;
  },

  async run(t: Target, ctx: CollectCtx): Promise<{ docs: RawDoc[]; discovered: Target[] }> {
    const res = await ctx.fetch(t.uri);
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} ${t.uri}`), { status: res.status });
    const html = await res.text();
    const finalUrl = res.url || t.uri;

    const meta = videoMetadata(html);
    const preferred = typeof t.meta?.language === "string" ? t.meta.language.toLowerCase() : null;
    const tracks = captionTrackUrls(html);
    const chosen =
      (preferred && tracks.find((u) => u.toLowerCase().includes(`lang=${preferred}`) || u.toLowerCase().includes(preferred))) ??
      tracks[0] ??
      null;

    let transcript = "";
    if (chosen) {
      const absolute = new URL(chosen, finalUrl).toString();
      const capRes = await ctx.fetch(absolute);
      if (capRes.ok) {
        const body = await capRes.text();
        transcript = body.trimStart().startsWith("<") ? timedTextToText(body) : captionsToText(body);
      } else {
        ctx.log(`video captions ${absolute} -> HTTP ${capRes.status}`);
      }
    }

    if (!transcript && t.meta?.requireTranscript !== false) {
      // Deliberately an error, not an empty document: "this video has no captions" is something an
      // operator can act on (upload a transcript, turn on auto-captions), and a stub document is not.
      throw Object.assign(new Error(`video_no_transcript:${tracks.length}_track(s)`), { status: 415 });
    }

    const text = [meta.title, meta.description, transcript].filter(Boolean).join("\n\n").trim();
    const published = meta.published ? new Date(meta.published) : null;

    return {
      docs: [
        {
          uri: finalUrl,
          canonicalUrl: ctx.canonicalize(finalUrl),
          contentHash: createHash("sha256").update(text, "utf8").digest("hex"),
          mime: "text/plain",
          title: meta.title,
          author: meta.author,
          contentType: "video_transcript",
          text,
          // The page HTML is not this document's payload — the captions are, and they arrived
          // separately. Density therefore does not apply (see quality.ts).
          raw: null,
          fetchedAt: new Date().toISOString(),
          publishedAt: published && !Number.isNaN(published.getTime()) ? published.toISOString() : null,
          collector: "collect/video",
          tenantRef: ctx.tenantRef,
          provenance: { ...COLLECTED_PROVENANCE },
          meta: {
            hasTranscript: transcript.length > 0,
            captionTracks: tracks.length,
            // Auto-generated captions mishear things. Recorded so a consumer can weigh it, since
            // nothing downstream can tell a machine transcript from a human one by looking.
            transcriptIsMachineGenerated: chosen?.includes("kind=asr") ?? null,
          },
        },
      ],
      discovered: [],
    };
  },
};

registerCollector(videoCollector);
