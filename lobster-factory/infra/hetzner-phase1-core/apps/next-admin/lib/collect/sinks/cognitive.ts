// sink/cognitive — deliver collected documents to a Cognitive OS research Project as Sources.
//
// The ONLY file in lib/collect that knows Cognitive OS exists; the wire itself is lib/cognitive-os/research.ts
// (lib/collect may not touch the network, collect-block-hygiene.test.ts). Division of labour, same as sink/kb:
// collection decides what was fetched; COS decides what a version is (same canonical URL + new sha256 =
// supersede, same sha256 = unchanged; RESEARCH_LINES_MASTER_PLAN I1).
//
// Built per run (it carries that run's grant token), so it is not in the sink registry. No finalize: for research
// "not delivered this run" is not "gone", and the run's completion is sent by the execute route after the crawl
// returns, healthy or not — the orchestrator only calls finalize on healthy runs (plan K2).

import type { ChannelState, RawDoc, RunReport, SinkBlock, SinkCtx, SinkReport } from "@/lib/collect/types";
import { classifySource, sourceClassLabel, type SourceClass } from "@/lib/collect/source-class";
import {
  ingestSources,
  type CompletionAside,
  type CompletionChannel,
  type SourceProjection,
} from "@/lib/cognitive-os/research";

/** = COS ingest's per-request ceiling (I-e). */
export const INGEST_BATCH = 25;
/** = COS MAX_SOURCE_CONTENT_BYTES; larger is skipped, never cut (a cut body fails COS's hash check). */
const MAX_TEXT_BYTES = 5 * 1024 * 1024;
/** = COS core/domain/source.py MAX_RELEVANCE_BYTES, measured on Python's json.dumps (", " and ": " separators). */
export const MAX_RELEVANCE_BYTES = 4096;
/** = COS CollectionCompleteRequest.wire_error. */
export const MAX_COMPLETION_ASIDE = 200;
export const MAX_COMPLETION_CHANNELS = 20;

/** What the person reads for each machine reason a page was set aside (GATHER 「放一旁」 shows it as is). */
const ASIDE_WHY: Record<string, string> = {
  too_short: "抓到的字太少，可能不是內文",
  too_short_no_heavier_tier: "系統只抓到很少的字，可能讀不到這種網頁",
  low_text_density: "抓到的大多是網頁框架，不是內文",
  low_text_density_no_heavier_tier: "系統只抓到很少的字，可能讀不到這種網頁",
  soft_404: "這一頁寫著找不到內容",
  entity_absent: "這一頁沒有提到要查的對象",
  entity_anchor_missing: "這一頁沒有出現分辨同名的字",
  off_entity: "這一頁講的可能不是要查的對象",
  injection: "這一頁藏有給 AI 的指令，系統沒有收內文",
  retry_exhausted: "這個網站一直沒有回應",
  fetch_failed: "系統讀不到這一頁",
  disallowed: "這個網站不讓系統抓這一頁",
  gone: "這一頁已經不在了",
  unhandled: "系統還不能讀這種檔案",
};

export function asideWhy(code: string): string {
  if (code.startsWith("source_class:")) return `系統沒有去抓這類網頁：${sourceClassLabel(code.slice("source_class:".length) as SourceClass)}`;
  if (code.startsWith("injection_")) return ASIDE_WHY.injection;
  return ASIDE_WHY[code] ?? "系統沒有收這一頁";
}

export function channelWhy(c: ChannelState): string {
  if (c.state === "ok") return "";
  if (c.state === "no_key") return "平台還沒有這個搜尋引擎的金鑰";
  if (c.why === "budget") return "這次的抓取額度用完了，沒有查";
  if (c.why === "network") return "連不上這個搜尋引擎";
  const http = /^http_(\d+)$/.exec(c.why);
  return http ? `這個搜尋引擎回了錯誤（HTTP ${http[1]}）` : "這個搜尋引擎沒有回應";
}

/** Byte length as COS measures it: Python json.dumps(ensure_ascii=False), whose separators are ", " and ": ". */
export function pyJsonBytes(value: unknown): number {
  const text = (v: unknown): string =>
    Array.isArray(v)
      ? `[${v.map(text).join(", ")}]`
      : v !== null && typeof v === "object"
        ? `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${text(x)}`).join(", ")}}`
        : JSON.stringify(v);
  return Buffer.byteLength(text(value), "utf8");
}

function texts(value: unknown, items: number, chars: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((v): v is string => typeof v === "string" && v.length >= 1 && v.length <= chars).slice(0, items);
}

/**
 * How the source was found and why it is in the case (wire v2). Keys, types and limits =
 * Projects/internal/cognitive-engineering-os/specs/wire/collector.v2.json `relevance`, which COS enforces: one bad
 * value refuses the whole batch, so every value is cut to its limit here and the whole fits MAX_RELEVANCE_BYTES.
 */
export function relevanceOf(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (meta.entityConfidence !== undefined) out.entityConfidence = meta.entityConfidence;
  const anchors = texts(meta.entityAnchorsHit, 12, 200);
  if (anchors) out.entityAnchorsHit = anchors;
  for (const key of ["searchProvider", "searchLang", "searchAngle"] as const) {
    if (typeof meta[key] === "string") out[key] = meta[key];
  }
  if (typeof meta.searchQuery === "string" && meta.searchQuery.trim()) out.searchQuery = meta.searchQuery.slice(0, 500);
  out.pasted = meta.pasted === true;
  if (typeof meta.aside === "string") out.aside = asideWhy(meta.aside);
  if (typeof meta.imageUrl === "string" && meta.imageUrl.length <= 2048) out.imageUrl = meta.imageUrl;
  const outlinks = texts(meta.outlinks, 50, 253);
  if (outlinks) out.outlinks = outlinks;
  // Over the cap, the least telling parts go first: links one at a time, then the image, the anchors, the query.
  while (pyJsonBytes(out) > MAX_RELEVANCE_BYTES) {
    if (Array.isArray(out.outlinks) && out.outlinks.length) out.outlinks = out.outlinks.slice(0, -1);
    else if ("imageUrl" in out) delete out.imageUrl;
    else if ("entityAnchorsHit" in out) delete out.entityAnchorsHit;
    else if ("searchQuery" in out) delete out.searchQuery;
    else break;
  }
  return out;
}

/** The run's completion, wire v2: pages set aside with no text (each URL once, the first 200) and the channels. */
export function completionOf(report: Pick<RunReport, "aside" | "channels">): { aside: CompletionAside[]; channels: CompletionChannel[] } {
  const aside: CompletionAside[] = [];
  const seen = new Set<string>();
  for (const a of report.aside) {
    if (aside.length >= MAX_COMPLETION_ASIDE) break;
    if (a.url.length > 2048 || seen.has(a.url)) continue;
    seen.add(a.url);
    aside.push({ url: a.url, title: a.title.slice(0, 300), reason: asideWhy(a.reason) });
  }
  const channels = report.channels
    .slice(0, MAX_COMPLETION_CHANNELS)
    .map((c) => ({ provider: c.provider, lang: c.lang, state: c.state, why: channelWhy(c) }));
  return { aside, channels };
}

export function toSourceProjection(doc: RawDoc): SourceProjection {
  return {
    canonical_url: doc.canonicalUrl,
    source_uri: doc.uri,
    content_sha256: doc.contentHash,
    mime: doc.mime,
    content_type: doc.contentType,
    title: (doc.title ?? doc.canonicalUrl).slice(0, 300),
    author: doc.author,
    published_at: doc.publishedAt,
    fetched_at: doc.fetchedAt,
    text: doc.text,
    provenance: doc.provenance,
    collector: doc.collector,
    // A document collect/academic actually fetched IS academic literature -- that is a fact about
    // where it came from, not a guess from its URL shape (which the fallback below still is).
    // RESEARCH_LINES_MASTER_PLAN WC-P2-07b, P-K11.
    source_class: doc.collector.startsWith("collect/academic:") ? "academic" : classifySource(doc.canonicalUrl),
    relevance: relevanceOf(doc.meta),
    schema_version: "2",
  };
}

export interface CognitiveSinkOptions {
  projectId: string;
  runId: string;
  grantToken: string;
}

export function createCognitiveSink(opts: CognitiveSinkOptions): SinkBlock {
  return {
    id: "sink/cognitive",
    title: "Cognitive OS research project",
    icon: "🧭",

    async run(docs: RawDoc[], ctx: SinkCtx): Promise<SinkReport> {
      const report: SinkReport = { written: 0, skipped: 0, errors: [] };
      const sendable: SourceProjection[] = [];
      for (const doc of docs) {
        if (!doc.text || Buffer.byteLength(doc.text, "utf8") > MAX_TEXT_BYTES) {
          report.errors!.push(`too_large_or_empty:${doc.canonicalUrl}`);
          report.skipped++;
          continue;
        }
        sendable.push(toSourceProjection(doc));
      }
      for (let i = 0; i < sendable.length; i += INGEST_BATCH) {
        const batch = sendable.slice(i, i + INGEST_BATCH);
        const result = await ingestSources(opts.projectId, opts.runId, opts.grantToken, batch);
        if (result.ok === false) {
          // One refused batch must not stop the rest; the status is what the execute route reads to fail the run.
          report.errors!.push(`ingest_${result.status}:${result.error.slice(0, 120)}`);
          continue;
        }
        for (const r of result.value.results) {
          if (r.outcome === "unchanged") report.skipped++;
          else report.written++;
        }
        ctx.log(`sink/cognitive: batch of ${batch.length} -> ${result.value.results.length} results`);
      }
      return report;
    },
  };
}
