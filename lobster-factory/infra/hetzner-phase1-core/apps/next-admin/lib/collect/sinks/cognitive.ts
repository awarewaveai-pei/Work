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

import type { RawDoc, SinkBlock, SinkCtx, SinkReport } from "@/lib/collect/types";
import { classifySource } from "@/lib/collect/source-class";
import { ingestSources, type SourceProjection } from "@/lib/cognitive-os/research";

/** Why a document is in the dossier (orchestrator's relevance stamp + the search that found it). */
const RELEVANCE_KEYS = ["entityConfidence", "entityAnchorsHit", "searchAngle", "searchQuery"] as const;
/** = COS ingest's per-request ceiling (I-e). */
export const INGEST_BATCH = 25;
/** = COS MAX_SOURCE_CONTENT_BYTES; larger is skipped, never cut (a cut body fails COS's hash check). */
const MAX_TEXT_BYTES = 5 * 1024 * 1024;

export function toSourceProjection(doc: RawDoc): SourceProjection {
  const relevance: Record<string, unknown> = {};
  for (const key of RELEVANCE_KEYS) {
    if (doc.meta[key] !== undefined) relevance[key] = doc.meta[key];
  }
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
    // Classified from the URL actually stored, by the same rule the dossier used to pick it.
    source_class: classifySource(doc.canonicalUrl),
    relevance,
    schema_version: "1",
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
