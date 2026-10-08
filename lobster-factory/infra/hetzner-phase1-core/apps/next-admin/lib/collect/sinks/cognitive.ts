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
//
// Two wire versions: "2" only when the engine listed it at the grant exchange (an older engine refuses v2 with 422,
// so a run against it would hang to its deadline); otherwise the v1 shape.

import type { ChannelState, RawDoc, RunReport, SinkBlock, SinkCtx, SinkReport } from "@/lib/collect/types";
import { classifySource, sourceClassLabel, type SourceClass } from "@/lib/collect/source-class";
import { ANGLES, CLAIM_ANGLES, MAX_QUERIES } from "@/lib/collect/search/query-plan";
import {
  ingestSources,
  type CompletionAside,
  type CompletionChannel,
  type SourceProjection,
  type WireVersion,
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

type Rule =
  | { type: "enum"; values: ReadonlyArray<string | null> }
  | { type: "text" | "id" | "url"; max: number }
  | { type: "texts"; items: number; max: number }
  | { type: "bool"; required: true };

/**
 * Every v2 relevance key and its rule: a copy of collector.v2.json `relevance` (the one rule set; the engine checks
 * the same; collect-wire-v2.test.ts fails if the two differ). A key whose value breaks its rule is dropped, never
 * sent: the engine refuses a whole batch of 25 pages for one bad value.
 */
export const RELEVANCE_RULES: Record<string, Rule> = {
  entityConfidence: { type: "enum", values: [null, "anchored", "name_only", "weak", "peripheral"] },
  entityAnchorsHit: { type: "texts", items: 12, max: 200 },
  searchProvider: { type: "enum", values: ["serper", "brave"] },
  searchLang: { type: "enum", values: ["zh", "en"] },
  searchQuery: { type: "text", max: 500 },
  searchAngle: { type: "id", max: 40 },
  pasted: { type: "bool", required: true },
  aside: { type: "text", max: 300 },
  imageUrl: { type: "url", max: 2048 },
  outlinks: { type: "texts", items: 50, max: 253 },
};

/** The v1 shape's keys (an engine that does not list "2"); free-form there, so only what v2 also allows is sent. */
const V1_KEYS = ["entityConfidence", "entityAnchorsHit", "searchAngle", "searchQuery"] as const;

function text(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= max;
}

export function fitsRule(rule: Rule, value: unknown): boolean {
  switch (rule.type) {
    case "enum":
      return rule.values.includes(value as string | null);
    case "bool":
      return typeof value === "boolean";
    case "text":
      return text(value, rule.max);
    case "id":
      return text(value, rule.max) && /^[a-z][a-z0-9_-]*$/.test(value);
    case "url":
      return text(value, rule.max) && /^https?:\/\//.test(value);
    case "texts":
      return Array.isArray(value) && value.length <= rule.items && value.every((v) => text(v, rule.max));
  }
}

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
  budget: "這次的抓取額度或時間用完了，這一頁沒有抓",
};

export function asideWhy(code: string): string {
  if (code.startsWith("source_class:")) return `系統沒有去抓這類網頁：${sourceClassLabel(code.slice("source_class:".length) as SourceClass)}`;
  if (code.startsWith("injection_")) return ASIDE_WHY.injection;
  return ASIDE_WHY[code] ?? "系統沒有收這一頁";
}

/**
 * Which pages keep a place when more than MAX_COMPLETION_ASIDE were set aside: a page that was read and refused, or
 * could not be read, before a page that was never fetched (budget), before a search result skipped for its kind.
 */
function asidePriority(code: string): number {
  if (code.startsWith("source_class:")) return 2;
  if (code === "budget") return 1;
  return 0;
}

const ANGLE_LABELS = new Map<string, string>([
  ...Object.values(ANGLES).flat().map((a) => [a.id, a.label] as [string, string]),
  ...CLAIM_ANGLES.map((a) => [a.id, a.label] as [string, string]),
]);

export function channelWhy(c: ChannelState): string {
  if (c.state === "ok") {
    // An engine that answered, whose later angles the per-question call ceiling cut (query-plan.ts fanOut).
    const cut = c.why.startsWith("cut:") ? c.why.slice(4).split(",").filter(Boolean) : [];
    return cut.length ? `每個問題最多查 ${MAX_QUERIES} 次，這些角度沒有查：${cut.map((id) => ANGLE_LABELS.get(id) ?? id).join("、")}` : "";
  }
  if (c.state === "no_key") return "平台還沒有這個搜尋引擎的金鑰";
  if (c.why === "budget") return "這次的查詢額度或時間用完了，沒有查";
  if (c.why === "network") return "連不上這個搜尋引擎";
  const http = /^http_(\d+)$/.exec(c.why);
  return http ? `這個搜尋引擎回了錯誤（HTTP ${http[1]}）` : "這個搜尋引擎沒有回應";
}

/** Byte length as COS measures it: Python json.dumps(ensure_ascii=False), whose separators are ", " and ": ". */
export function pyJsonBytes(value: unknown): number {
  const serial = (v: unknown): string =>
    Array.isArray(v)
      ? `[${v.map(serial).join(", ")}]`
      : v !== null && typeof v === "object"
        ? `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${serial(x)}`).join(", ")}}`
        : JSON.stringify(v);
  return Buffer.byteLength(serial(value), "utf8");
}

function texts(value: unknown, items: number, chars: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((v): v is string => typeof v === "string" && v.length >= 1 && v.length <= chars).slice(0, items);
}

/**
 * How the source was found and why it is in the case (wire v2): each value cut to its limit, each key checked against
 * RELEVANCE_RULES (a key that breaks its rule is dropped), a pasted page without search keys, the whole within
 * MAX_RELEVANCE_BYTES.
 */
export function relevanceOf(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (meta.entityConfidence !== undefined) out.entityConfidence = meta.entityConfidence;
  const anchors = texts(meta.entityAnchorsHit, 12, 200);
  if (anchors) out.entityAnchorsHit = anchors;
  for (const key of ["searchProvider", "searchLang", "searchAngle"] as const) {
    if (meta[key] !== undefined) out[key] = meta[key];
  }
  if (typeof meta.searchQuery === "string" && meta.searchQuery.trim()) out.searchQuery = meta.searchQuery.slice(0, 500);
  out.pasted = meta.pasted === true;
  if (typeof meta.aside === "string") out.aside = asideWhy(meta.aside);
  if (meta.imageUrl !== undefined) out.imageUrl = meta.imageUrl;
  // The engine reads a list of fewer than 50 hosts with room left for one more as EVERY host the page links to (its
  // 只互相引用 check; collector.v2.json `reading`): a host dropped here for its length would hide a link, so the list
  // goes whole or not at all. The two cuts the engine can see stay: the 50th host, and hosts trimmed to fit below.
  const rule = RELEVANCE_RULES.outlinks as { items: number; max: number };
  if (Array.isArray(meta.outlinks) && meta.outlinks.every((v) => text(v, rule.max))) out.outlinks = meta.outlinks.slice(0, rule.items);
  for (const [key, value] of Object.entries(out)) {
    const rule = RELEVANCE_RULES[key];
    if (!rule || !fitsRule(rule, value)) delete out[key];
  }
  if (out.pasted) for (const key of Object.keys(out)) if (key.startsWith("search")) delete out[key];
  // Over the cap, the least telling parts go first: links one at a time, then the image, the anchors, the query. A list
  // cut here keeps no room for one more host, which is how the engine knows it may be cut (outlinks_whole).
  while (pyJsonBytes(out) > MAX_RELEVANCE_BYTES) {
    if (Array.isArray(out.outlinks) && out.outlinks.length) out.outlinks = out.outlinks.slice(0, -1);
    else if ("imageUrl" in out) delete out.imageUrl;
    else if ("entityAnchorsHit" in out) delete out.entityAnchorsHit;
    else if ("searchQuery" in out) delete out.searchQuery;
    else break;
  }
  return out;
}

/** The run's completion, wire v2: pages set aside with no text (each URL once, the first 200 by asidePriority) and
 *  the channels. */
export function completionOf(report: Pick<RunReport, "aside" | "channels">): { aside: CompletionAside[]; channels: CompletionChannel[] } {
  const aside: CompletionAside[] = [];
  const seen = new Set<string>();
  const ordered = report.aside.map((a, i) => ({ a, i })).sort((x, y) => asidePriority(x.a.reason) - asidePriority(y.a.reason) || x.i - y.i);
  for (const { a } of ordered) {
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

export function toSourceProjection(doc: RawDoc, wire: WireVersion = "2"): SourceProjection {
  const relevance = relevanceOf(doc.meta);
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
    relevance: wire === "2" ? relevance : Object.fromEntries(V1_KEYS.filter((k) => k in relevance).map((k) => [k, relevance[k]])),
    schema_version: wire,
  };
}

export interface CognitiveSinkOptions {
  projectId: string;
  runId: string;
  grantToken: string;
  /** What the engine listed at the grant exchange; "1" when it did not list "2". */
  wire: WireVersion;
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
        sendable.push(toSourceProjection(doc, opts.wire));
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
