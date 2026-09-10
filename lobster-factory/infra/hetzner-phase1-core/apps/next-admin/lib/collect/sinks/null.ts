// sink/null — accepts everything, stores nothing (DATA_COLLECTION_PLAN.md §2).
//
// This is the dry run every new collector goes through first: it exercises routing, the budget, the
// quality gate and the screening step against a real site without a single row being written
// anywhere. It also keeps the documents it was handed in memory so a test (or an operator running a
// dry crawl) can inspect exactly what WOULD have been stored.

import type { RawDoc, SinkBlock, SinkCtx, SinkReport } from "@/lib/collect/types";
import { registerSink } from "@/lib/collect/registry";

export interface NullSink extends SinkBlock {
  /** Everything handed to this sink, in the order the crawl produced it. */
  readonly received: RawDoc[];
  reset(): void;
}

export function createNullSink(): NullSink {
  const received: RawDoc[] = [];
  return {
    id: "sink/null",
    title: "Discard (dry run)",
    icon: "🧪",
    received,
    reset() {
      received.length = 0;
    },
    async run(docs: RawDoc[], ctx: SinkCtx): Promise<SinkReport> {
      received.push(...docs);
      ctx.log(`sink/null: discarded ${docs.length} document(s)`);
      return { written: 0, skipped: docs.length };
    },
    async finalize(seen: Set<string>, ctx: SinkCtx): Promise<SinkReport> {
      ctx.log(`sink/null: finalize saw ${seen.size} url(s)`);
      return { written: 0, skipped: 0, archived: 0 };
    },
  };
}

registerSink(createNullSink());
