// sink/kb — deliver collected documents to the knowledge base.
//
// This is the ONLY file in lib/collect that knows lib/kb exists (enforced by
// __tests__/collect-block-hygiene.test.ts). Collection and the knowledge base are two systems; this
// sink is the seam between them, and deleting this one file leaves both working.
//
// Division of labour, deliberately narrow (ADR 011, DATA_COLLECTION_PLAN.md §2):
//   * collection decides WHAT was fetched and whether it is worth storing;
//   * the knowledge base decides what a VERSION is — same canonical URL, changed text ⇒ version N+1,
//     unchanged text ⇒ nothing at all. This sink must not re-implement any of that, and does not.

import type { RawDoc, SinkBlock, SinkCtx, SinkReport } from "@/lib/collect/types";
import { registerSink } from "@/lib/collect/registry";
import { ingestKnowledge } from "@/lib/kb";

export interface KbSinkOptions {
  /**
   * How the collection tenantRef maps to a knowledge-base organization id. Injected rather than
   * assumed: tenantRef is documented as opaque, and today's identity is a coincidence of both being
   * the organization uuid, not a contract.
   */
  organizationIdFor?: (tenantRef: string) => string;
  /** Knowledge space to file documents in. Omitted ⇒ the KB's default space. */
  spaceId?: string | null;
  /** Cap on the text stored per document, matching the ops upload limit. */
  maxBodyChars?: number;
}

export function createKbSink(opts: KbSinkOptions = {}): SinkBlock {
  const orgOf = opts.organizationIdFor ?? ((tenantRef: string) => tenantRef);
  const maxBodyChars = opts.maxBodyChars ?? 100_000;

  return {
    id: "sink/kb",
    title: "Knowledge base",
    icon: "📚",

    async run(docs: RawDoc[], ctx: SinkCtx): Promise<SinkReport> {
      const report: SinkReport = { written: 0, skipped: 0, errors: [] };
      const organizationId = orgOf(ctx.tenantRef);

      for (const doc of docs) {
        try {
          // Truncated rather than stored: the knowledge base hashes the body it is given, so a
          // silently shortened document would (a) supersede the complete version and (b) report
          // "unchanged" forever after, because every later edit past the cut point hashes the same.
          if (doc.text.length > maxBodyChars) {
            report.errors!.push(`too_long_for_kb:${doc.canonicalUrl}:${doc.text.length}`);
            report.skipped++;
            continue;
          }
          const result = await ingestKnowledge({
            organizationId,
            kind: "url",
            // A page without a usable title still needs a stable identity, and the canonical URL is
            // exactly that. Falling back to something like "Untitled" would merge every such page
            // into one document family.
            title: (doc.title ?? doc.canonicalUrl).slice(0, 300),
            body: doc.text,
            canonicalUrl: doc.canonicalUrl,
            spaceId: opts.spaceId ?? null,
            language: typeof doc.meta.language === "string" ? doc.meta.language : null,
            docType: doc.contentType || "web_page",
            // The label the orchestrator stamped, carried the whole way (DATA_COLLECTION_PLAN §1.3b).
            // Without it a consumer cannot tell a vendor's claim scraped off the open web from a
            // policy the operator wrote, and therefore cannot wrap the first one before it reaches
            // a prompt. A locked document refuses this write outright — see lib/kb/rag.ts.
            provenance: {
              epistemicType: doc.provenance.epistemic_type,
              authorshipState: doc.provenance.authorship_state,
              locked: doc.provenance.locked,
            },
            author: doc.author,
            publishedAt: doc.publishedAt,
            venue: typeof doc.meta.venue === "string" ? doc.meta.venue : null,
            doi: typeof doc.meta.doi === "string" ? doc.meta.doi : null,
            // publishedAt is when the source says the content became true. Recorded now because it
            // is unknowable later — nobody can reconstruct it after the fact.
            validFrom: doc.publishedAt,
          });

          if (result.refused === "locked") {
            // Not a failure: the operator marked this document as theirs. Reported so a crawl that
            // silently stops updating one page does not look like a page that stopped changing.
            report.skipped++;
            report.errors!.push(`locked:${doc.canonicalUrl}`);
            continue;
          }
          if (result.unchanged) {
            report.skipped++;
            continue;
          }
          if (!result.sourceId) {
            report.errors!.push(`ingest_failed:${doc.canonicalUrl}`);
            continue;
          }
          if (result.supersedeFailed) {
            // Stored, but the previous version is still active: both can be retrieved, and they may
            // contradict each other. Loud, because the fix is a re-ingest, not a wait.
            report.errors!.push(`supersede_failed:${doc.canonicalUrl}`);
          }
          report.written++;
          ctx.log(`sink/kb: ${doc.canonicalUrl} -> v${result.version} (${result.chunks} chunks)`);
        } catch (e) {
          // One bad document must not abort a crawl's whole flush; the rest of the batch still lands.
          report.errors!.push(`${doc.canonicalUrl}:${String(e).slice(0, 160)}`);
        }
      }
      return report;
    },

    // finalize (tombstoning pages that vanished from the site) is deliberately NOT implemented yet:
    // it needs "every canonical URL this tenant had before", which the knowledge base cannot answer
    // per source system today. Implementing it against an incomplete URL set would archive
    // hand-uploaded documents that no crawl was ever going to see. C2 owns it.
  };
}

registerSink(createKbSink());
