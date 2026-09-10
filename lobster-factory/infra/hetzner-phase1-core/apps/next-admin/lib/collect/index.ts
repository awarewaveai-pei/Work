// Public surface of the collection system.
//
// Collection and the knowledge base are two independent systems (ADR 011): collection runs without
// a knowledge base (sink/null, and later sink/signal and sink/hci-discovered never touch it), and
// the knowledge base runs without collection (documents are uploaded by hand today). The only
// coupling is a sink that happens to write into lib/kb — one block, replaceable, deletable.
//
// A block author needs exactly three things from here: the types, registerCollector, and the
// knowledge that ctx.fetch is the only way out to the network.

export { crawl, summarize, type CrawlOptions, type CrawlResult, type SeedInput } from "@/lib/collect/orchestrator";
export { createCollectFetch, CollectFetchError, COLLECT_USER_AGENT } from "@/lib/collect/net/fetcher";
export { createBudget, type BudgetLimits } from "@/lib/collect/budget";
export { canonicalize, inScope } from "@/lib/collect/canonical";
export { RateLimiter, MemoryRateLimitStore, type RateLimitStore } from "@/lib/collect/net/rate-limit";
export { RobotsCache, parseRobots, isAllowed } from "@/lib/collect/net/robots";
export { MemoryRunStore, NO_RUN_STORE } from "@/lib/collect/state";
export {
  registerCollector,
  registerSink,
  collectors,
  sinks,
  collectorById,
  sinkById,
} from "@/lib/collect/registry";
export { createNullSink, type NullSink } from "@/lib/collect/sinks/null";
export { grade, MIN_TEXT_BYTES, MIN_DENSITY } from "@/lib/collect/quality";
export { screenForInjection, stampProvenance, COLLECTED_PROVENANCE } from "@/lib/collect/provenance";

export type {
  Budget,
  BudgetUnit,
  CollectBlock,
  CollectCtx,
  CollectIssue,
  ProvenanceRecord,
  QualityVerdict,
  RawDoc,
  RunReport,
  RunState,
  RunStore,
  SinkBlock,
  SinkCtx,
  SinkReport,
  Target,
} from "@/lib/collect/types";
