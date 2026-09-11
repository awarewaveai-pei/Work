// sink/signal — collect, hand back, store nothing (DATA_COLLECTION_PLAN.md §2).
//
// Signal is "what is happening right now": a trend, a mention, a competitor's announcement. It has
// no version, no freshness contract and no retention, and it must never reach the knowledge base —
// mixing it into the Corpus is precisely the failure ADR 011 is built to prevent, because the
// weakest data would inherit the strongest system's authority.
//
// So this sink deliberately has no destination. The caller receives the documents in memory and
// does whatever it does; nothing is written anywhere.

import type { RawDoc, SinkBlock, SinkCtx, SinkReport } from "@/lib/collect/types";
import { registerSink } from "@/lib/collect/registry";

export interface SignalSink extends SinkBlock {
  /** Everything this run collected, in order. Cleared by the caller when it has taken them. */
  readonly collected: RawDoc[];
  take(): RawDoc[];
}

export function createSignalSink(): SignalSink {
  const collected: RawDoc[] = [];
  return {
    id: "sink/signal",
    title: "Signal (in-memory, nothing stored)",
    icon: "📈",
    collected,
    take() {
      return collected.splice(0, collected.length);
    },
    async run(docs: RawDoc[], ctx: SinkCtx): Promise<SinkReport> {
      collected.push(...docs);
      ctx.log(`sink/signal: holding ${docs.length} document(s) in memory`);
      // `written: 0` is the honest number — nothing was persisted. Counting these as written would
      // make a Signal run look like it filled a knowledge base.
      return { written: 0, skipped: docs.length };
    },
    // No finalize: tombstones mean "this used to be stored and is now gone", and nothing here was
    // ever stored.
  };
}

registerSink(createSignalSink());
