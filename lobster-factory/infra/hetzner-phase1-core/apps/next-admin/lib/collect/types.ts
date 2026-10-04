// Collection contracts (DATA_COLLECTION_PLAN.md §1.1). Pure types — no runtime imports, so a block
// can import them without pulling the fetcher, the registry, or anything network-shaped into its
// module init path.
//
// The shape of this file is the boundary the whole system rests on: a block receives a Target and
// returns RawDocs plus newly discovered Targets, and NOTHING else. Routing, budget, politeness,
// de-duplication, resumption and retry belong to the orchestrator (ADR 011 §決策 5) — a block that
// starts doing any of those is the beginning of six copies of each.

/** Where a document may be fetched from, and how far the crawl has gone to get it. */
export interface Target {
  uri: string;
  /**
   * De-duplication key. The ORCHESTRATOR fills this in before pushing, using the one canonicalize()
   * implementation (ADR 011 §決策 2). A block must never compute its own: two blocks disagreeing
   * about what the same URL is means the same page is fetched three to ten times.
   */
  canonicalUri: string;
  /** Crawl boundary, inherited from the seed. Without it, a footer link walks off into the web. */
  scope: { hosts: string[]; pathPrefix?: string };
  /**
   * How many strategies have already been ruled out for this target. The orchestrator writes it
   * when it re-queues a target mid-ladder (today: a budget stop), so the resumed run does not spend
   * its budget re-running the strategies that already failed.
   */
  tier: number;
  hint?: string;
  depth: number;
  /** cursor / etag / lastModified / hints from the previous hop. */
  meta?: Record<string, unknown>;
}

/**
 * Provenance of a collected document. The three axes are NOT defined here — they come from
 * agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/governance/epistemic-label.schema.yaml
 * (ADR-004, ACCEPTED), because the same concept already grew four incompatible vocabularies once.
 *
 * Everything fetched from the web is EVIDENCE + SOURCE_QUOTATION: the page proves that someone
 * SAID this, never that it is true. Marking it SOURCE_FACT would file marketing copy as fact.
 */
export interface ProvenanceRecord {
  epistemic_type: "EVIDENCE";
  authorship_state: "SOURCE_QUOTATION";
  locked: null;
}

/** The only output of collection. No id / organizationId / sourceId / quality — those belong downstream. */
export interface RawDoc {
  uri: string;
  canonicalUrl: string;
  /** sha256 of the extracted text. With canonicalUrl, the only two fields downstream uses as keys. */
  contentHash: string;
  mime: string;
  title: string | null;
  /**
   * Byline, when the page states one. Recorded at collection time because it is one of the things
   * that cannot be recovered afterwards. Consumed since migration 0075: sink/kb passes it to the
   * knowledge base, retrieval returns it, and the customer-service prompt shows it as the source.
   */
  author: string | null;
  /**
   * Coarse kind of document, as the SOURCE describes itself (og:type and friends) — "web_page",
   * "article", "feed_item". Deliberately not inferred: guessing that a page is a policy or an FAQ
   * is a judgement about content, which belongs to the analysis side, not to collection.
   */
  contentType: string;
  text: string;
  raw: { bytes: Uint8Array; mime: string } | null;
  fetchedAt: string;
  publishedAt: string | null;
  collector: string;
  /** Opaque tenant handle; aligns with the shared kernel's TenantContext when that lands. */
  tenantRef: string;
  /**
   * Stamped by the orchestrator, never by a block (DATA_COLLECTION_PLAN.md §1.3b). Declared as its
   * own field rather than a corner of `meta` so that dropping it is a type error rather than a
   * silently missing safety label.
   */
  provenance: ProvenanceRecord;
  meta: Record<string, unknown>;
}

/** What the budget is spent on. Every unit is optional; the orchestrator sums what it is given. */
export interface BudgetUnit {
  fetches?: number;
  bytes?: number;
  ms?: number;
}

export interface Budget {
  spend(n: BudgetUnit): void;
  ok(): boolean;
  /** What is left, for reporting and for tests that assert a run stopped for the right reason. */
  snapshot(): { spent: Required<BudgetUnit>; limits: Required<BudgetUnit>; exhausted: string | null };
}

/**
 * The only outward capability a block has. A block calling global fetch bypasses the SSRF gate, the
 * byte cap, the timeout, robots and the per-host token bucket at once — guarded mechanically by
 * lib/collect/__tests__/collect-block-hygiene.test.ts.
 */
export interface CollectCtx {
  fetch(url: string, opts?: { headers?: Record<string, string>; method?: string }): Promise<Response>;
  /**
   * Call a configured extraction provider. A SECOND door, with different rules from `fetch` and for
   * a different situation: one fixed vendor origin, authenticated, POST — see net/providers.ts for
   * why those rules cannot be the crawling rules. The block passes a path, never a URL, and never
   * sees the API key. Absent when no provider is configured, which is why a provider-backed block
   * must return 0 from match() in that case rather than failing at run time.
   */
  callProvider?: (
    providerId: string,
    init: { path: string; method?: "GET" | "POST"; body?: unknown; headers?: Record<string, string> },
  ) => Promise<Response>;
  canonicalize(url: string): string;
  budget: Budget;
  tenantRef: string;
  log(msg: string): void;
}

export interface SinkCtx {
  tenantRef: string;
  runId: string;
  log(msg: string): void;
}

export interface SinkReport {
  written: number;
  skipped: number;
  archived?: number;
  errors?: string[];
}

/**
 * What KIND of source a block reads. This is what an operator picks from — "a web page", "a feed",
 * "an academic registry" — not the implementation behind it.
 */
export type SourceKind = "web" | "feed" | "sitemap" | "file" | "api" | "video" | "academic" | "rendered";

/** One configurable knob a source exposes to whoever sets it up. */
export interface SourceOption {
  key: string;
  label: string;
  /**
   * `multiselect` is several of `choices` at once, stored as ONE comma-separated string rather than
   * an array: `collection_sources.options` is jsonb that other code already reads as flat scalars,
   * and a type that is a string here and an array there is the shape every downstream reader
   * eventually gets wrong. Blocks parse it with entity.ts's parseTermList.
   */
  type: "string" | "number" | "boolean" | "select" | "multiselect";
  required?: boolean;
  default?: string | number | boolean;
  /** For `select` and `multiselect` — the allowed values, each with a label. */
  choices?: Array<{ value: string; label: string }>;
  help?: string;
}

/**
 * How a block presents itself in the source catalogue. Declared BY the block, so adding a source is
 * still one file: a separate list of "sources we support" would be a second place to forget.
 */
export interface SourceDescriptor {
  kind: SourceKind;
  /** One line an operator reads when choosing. Plain language, not implementation. */
  summary: string;
  /**
   * What the entry point looks like. `url` = the operator supplies an address; `query` = a search
   * string (an academic registry, a discovery provider); `path` = a local file or folder.
   *
   * A `query` source is not a URL crawl: ADR 013 makes "this registry plus this query" the unit a
   * human approves, and configuring it in the catalogue IS that approval.
   */
  entry: "url" | "query" | "path";
  /**
   * For `entry: "query"` only — the URI scheme its queries are wrapped in (`academic`, `search`, …).
   * Routing is decided by match() alone, so this is what gets a query to the right block; two query
   * sources sharing a scheme would silently contend for each other's work. Guarded in
   * __tests__/collect-block-hygiene.test.ts.
   */
  queryScheme?: string;
  /** Environment variables without which this source cannot run — ALL are needed. */
  requires?: string[];
  /**
   * Interchangeable credentials: ANY ONE of these makes the source usable. For a source with more
   * than one possible vendor, listing them under `requires` would report it unavailable whenever
   * the other vendor's key is the one that is set.
   */
  requiresAny?: string[];
  options?: SourceOption[];
  /** Set when the source costs money per call, so the catalogue can say so out loud. */
  metered?: boolean;
}

export interface CollectBlock {
  id: string;
  title: string;
  icon?: string;
  enabled?: boolean;
  /** Catalogue entry. Absent ⇒ the block is internal machinery, not an operator-selectable source. */
  describe?: SourceDescriptor;
  /** 0 = cannot handle. Above 0 = candidate; the orchestrator tries candidates in descending order. */
  match: (t: Target) => number;
  /**
   * Failure contract: throw with a numeric `status` field when the failure has an HTTP status
   * (`Object.assign(new Error(msg), { status })`, or a CollectFetchError from ctx.fetch). The
   * orchestrator decides retry / gone / give-up from that field and NEVER from the message text —
   * a message-matching classifier reads the "404" in .../blog/404-explained as "page gone". A throw
   * with no status is treated as an extraction failure, so the next strategy gets a turn.
   */
  run: (
    t: Target,
    ctx: CollectCtx,
  ) => Promise<{
    docs: RawDoc[];
    discovered: Target[];
    /**
     * True only for a 304 (or equivalent "confirmed unchanged") response. `docs`/`discovered` are
     * empty either way on a 304 — a body-less response has neither — but the ORCHESTRATOR needs to
     * tell that apart from "fetched a real page with zero links", because only the first case should
     * replay a cached discoveredLinks list instead of recording an empty result (lib/collect/url-state.ts).
     */
    notModified?: boolean;
    /** Pages a query block chose not to read (a shop, a social profile), with why. */
    aside?: AsideEntry[];
    /** The search channels a query block used or could not use. */
    channels?: ChannelState[];
  }>;
  /**
   * A query block's channels for a target the run stopped before reaching (`why` = "budget"): "never searched" must not
   * read as "searched, found nothing". Called by the orchestrator only; never calls out.
   */
  notRun?: (t: Target, why: string) => { channels: ChannelState[] };
}

/** A page the run did not deliver with text. `reason` is a machine code; sink/cognitive words it for the person. */
export interface AsideEntry {
  url: string;
  title: string;
  reason: string;
}

/**
 * One search engine in one language, as this run found it. `why` is a machine code (`no_key`, `budget`,
 * `http_<status>`, `network`, `error`; "" when ok); sink/cognitive words it for the person.
 */
export interface ChannelState {
  provider: string;
  lang: string;
  state: "ok" | "unreachable" | "no_key";
  why: string;
}

export interface SinkBlock {
  id: string;
  title: string;
  icon?: string;
  enabled?: boolean;
  /** Called repeatedly as the crawl flushes, so it must be idempotent. */
  run: (docs: RawDoc[], ctx: SinkCtx) => Promise<SinkReport>;
  /**
   * Tombstones: what the sink holds that this run did NOT deliver. The argument is the set of
   * canonical URLs actually handed to `run()` — not the URLs the crawl visited, which is a
   * different key space (a page's declared canonical, or its URL after redirects, need not equal
   * the URL that was queued). The orchestrator calls this only after a run that both finished and
   * looks healthy; see its finalize block for why "finished" alone is not enough.
   */
  finalize?: (deliveredCanonicalUrls: Set<string>, ctx: SinkCtx) => Promise<SinkReport>;
}

/** Why a document was refused. Reported, never silently dropped. */
export interface QualityVerdict {
  ok: boolean;
  reason: string | null;
  checks: {
    textBytes: number;
    minTextBytes: number;
    density: number | null;
    minDensity: number;
    script: "cjk" | "latin";
    softNotFound: boolean;
  };
}

export interface CollectIssue {
  uri: string;
  reason: string;
  checks?: QualityVerdict["checks"];
}

/** Everything the run produced that is not a document. */
export interface RunReport {
  fetched: number;
  outOfScope: number;
  unhandled: string[];
  gone: string[];
  dirty: CollectIssue[];
  quarantined: CollectIssue[];
  /** Refused by robots.txt or by the SSRF gate — correct behaviour, kept out of `dirty` so an
   *  alert on extraction failures does not fire on it. */
  disallowed: CollectIssue[];
  /**
   * Fetched and extracted cleanly, then refused for not being about the entity the source asserted
   * (lib/collect/relevance.ts). Its own bucket for the same reason `disallowed` has one: this is
   * the system working — a search engine returning something irrelevant — and counting it as a
   * failure would raise an incident on correct behaviour until somebody muted the alert.
   */
  offEntity: CollectIssue[];
  retried: number;
  stoppedBy: "frontier_empty" | "budget" | null;
  /**
   * keepAside runs only (a research run, STEP2_SHARED_RULES §4.1): every page that did not reach the sink with
   * text — refused with no text, unreadable, gone, disallowed, quarantined, skipped by a query block, or still queued
   * when the run stopped (reason "budget"). The buckets above keep the operator's detail and also count the pages
   * delivered with `aside`; this is the list the person sees and can take pages back from.
   */
  aside: AsideEntry[];
  /** One entry per (search engine, language) any query block used or could not use; merged across seeds. */
  channels: ChannelState[];
}

/** Resumable crawl state. Without it a budget-limited crawl re-reads page 1 forever. */
export interface RunState {
  frontier: Target[];
  seen: string[];
}

export interface RunStore {
  load(runId: string): Promise<RunState | null>;
  save(runId: string, state: RunState): Promise<void>;
}
