// The orchestrator — the only shared, non-block code in collection (DATA_COLLECTION_PLAN.md §1.2).
//
// It owns six cross-cutting concerns, and blocks own none of them: routing, budget, politeness,
// de-duplication, resumption, retry. The reason is not tidiness. Six blocks each implementing
// "retry politely" produce six different backoff policies, five of which are wrong, and the one
// that gets your IP blocked is whichever ran last.
//
// Ordering inside the loop is load-bearing and mirrors the plan's pseudo-code:
//   pop → seen? → in scope? → pick candidates by match() → try them in order (degrading on
//   extraction failure) → grade → stamp/screen → queue discovered → flush every N → persist.

import type {
  Budget,
  CollectBlock,
  CollectCtx,
  CollectIssue,
  RawDoc,
  RunReport,
  RunState,
  RunStore,
  SinkBlock,
  SinkCtx,
  SinkReport,
  Target,
} from "@/lib/collect/types";
import { canonicalize, inScope } from "@/lib/collect/canonical";
import { collectors as registeredCollectors } from "@/lib/collect/registry";
import { grade } from "@/lib/collect/quality";
import { assessRelevance, relevanceMetadata } from "@/lib/collect/relevance";
import { rawAsText, screenForInjection, stampProvenance } from "@/lib/collect/provenance";
import { NO_RUN_STORE } from "@/lib/collect/state";
import { CollectFetchError } from "@/lib/collect/net/fetcher";
import { NO_URL_STATE, type UrlStateStore } from "@/lib/collect/url-state";

export interface SeedInput {
  uri: string;
  /** Defaults to "this host, any path" — the narrowest boundary that still crawls the site. */
  scope?: { hosts: string[]; pathPrefix?: string };
  hint?: string;
  meta?: Record<string, unknown>;
}

export interface CrawlOptions {
  sink: SinkBlock;
  budget: Budget;
  tenantRef: string;
  runId: string;
  fetch: CollectCtx["fetch"];
  /** Passed through to blocks that have a provider tier; omitted ⇒ those blocks score 0. */
  callProvider?: CollectCtx["callProvider"];
  maxDepth?: number;
  /** Flush to the sink every N documents. Storing only at the end loses everything on a crash. */
  flushEvery?: number;
  store?: RunStore;
  /**
   * Cross-RUN cache of each URL's etag/last-modified/discovered-links (migration 0080). Omitted ⇒
   * NO_URL_STATE, which behaves exactly like the code before this existed: no conditional GET ever
   * fires, and a 304 (which nothing produces without a cached etag to send) never happens either.
   */
  urlState?: UrlStateStore;
  blocks?: CollectBlock[];
  maxAttemptsPerTarget?: number;
  log?: (msg: string) => void;
}

export interface CrawlResult {
  report: RunReport;
  sink: SinkReport;
  /** Where the crawl stopped, so the next run continues instead of starting over. */
  state: RunState;
}

const ATTEMPTS_KEY = "_attempts";

/**
 * Target meta that describes the CRAWL rather than one URL, and therefore must reach the pages a
 * page links to.
 *
 * An explicit list, never a spread of the parent's whole meta: `etag` and `lastModified` are also
 * in there, they belong to ONE url, and handing a child its parent's etag makes the next fetch send
 * a conditional GET for the wrong document — a 304 on a page nobody has ever read.
 *
 *   maxDepth    — the operator's own "follow links N deep", which until now was collected by the UI,
 *                 stored, and read by nothing (run.ts passed one global 2 for every source).
 *   entity      — what this crawl is researching; lib/collect/relevance.ts refuses pages that are
 *                 about something else, and a child page must face the same test as its parent.
 *   searchQuery — which search filed this run, so sink/kb.ts can auto-file the whole run into one
 *                 folder. Without inheritance only the direct search hits were ever filed and
 *                 everything found one hop later landed unfiled (159 of 161 documents, run
 *                 manual-2026-09-20051728).
 *   sourceId    — which configured source is answerable for this document.
 */
const INHERITED_META = ["maxDepth", "entity", "searchQuery", "sourceId"] as const;

/**
 * The depth limit for THIS target: what its source configured, else the run's default.
 *
 * Clamped rather than trusted — `options` is operator-typed jsonb, and a maxDepth of 9 on a news
 * site is a crawl that never ends. 0 is meaningful and must survive the clamp: it is how an entity
 * search says "read exactly the pages the search engine named, follow nothing".
 */
function depthLimitOf(target: Target, fallback: number): number {
  const raw = target.meta?.maxDepth;
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(Math.floor(n), 5);
}

function inheritedMeta(parent: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!parent) return out;
  for (const key of INHERITED_META) {
    if (parent[key] !== undefined) out[key] = parent[key];
  }
  return out;
}

function seedToTarget(seed: SeedInput): Target | null {
  let host: string;
  try {
    host = new URL(seed.uri).hostname;
  } catch {
    return null;
  }
  return {
    uri: seed.uri,
    canonicalUri: canonicalize(seed.uri),
    scope: seed.scope ?? { hosts: [host] },
    tier: 0,
    hint: seed.hint,
    depth: 0,
    meta: seed.meta,
  };
}

/** An HTTP status carried by an error, however it was raised. */
function statusOf(e: unknown): number | undefined {
  if (e instanceof CollectFetchError) return e.status;
  if (e && typeof e === "object" && "status" in e) {
    const n = Number((e as { status: unknown }).status);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function errorLabel(e: unknown): string {
  if (e instanceof CollectFetchError) return `${e.kind}:${e.message.slice(0, 80)}`;
  return String(e).slice(0, 100);
}

type Outcome = "retry" | "gone" | "budget" | "disallowed" | "extraction";

/**
 * What kind of failure this was — read from the error's OWN fields, never from its text.
 * A message-matching classifier records https://shop.example.com/blog/404-explained as permanently
 * gone the first time that page returns a 500, because the URL contains "404".
 */
function classify(e: unknown): Outcome {
  if (e instanceof CollectFetchError) {
    if (e.kind === "budget") return "budget";
    if (e.kind === "disallowed" || e.kind === "blocked") return "disallowed";
    if (e.kind === "network") return "retry";
  }
  const status = statusOf(e);
  if (status === 404 || status === 410) return "gone";
  if (status === 408 || status === 429 || (status !== undefined && status >= 500)) return "retry";
  if (status !== undefined && status >= 400) return "extraction"; // 401/403: this strategy cannot read it
  // Only with no structured signal at all, fall back to the shape of a transport failure.
  return /timeout|aborted|econnreset|etimedout|fetch failed/i.test(String(e)) ? "retry" : "extraction";
}

function emptySinkReport(): SinkReport {
  return { written: 0, skipped: 0 };
}

function mergeSink(a: SinkReport, b: SinkReport): SinkReport {
  return {
    written: a.written + b.written,
    skipped: a.skipped + b.skipped,
    archived: (a.archived ?? 0) + (b.archived ?? 0),
    errors: [...(a.errors ?? []), ...(b.errors ?? [])],
  };
}

export async function crawl(seeds: SeedInput[], opts: CrawlOptions): Promise<CrawlResult> {
  const maxDepth = opts.maxDepth ?? 2;
  const flushEvery = opts.flushEvery ?? 20;
  const store = opts.store ?? NO_RUN_STORE;
  const blocks = opts.blocks ?? registeredCollectors();
  const maxAttempts = opts.maxAttemptsPerTarget ?? 3;
  const log = opts.log ?? (() => {});
  const urlState = opts.urlState ?? NO_URL_STATE;

  const report: RunReport = {
    fetched: 0,
    outOfScope: 0,
    unhandled: [],
    gone: [],
    dirty: [],
    quarantined: [],
    disallowed: [],
    offEntity: [],
    retried: 0,
    stoppedBy: null,
  };

  // Resume where the last run stopped; only fall back to the seeds for a genuinely new run.
  const saved = await store.load(opts.runId);
  const seen = new Set<string>(saved?.seen ?? []);
  const queued = new Set((saved?.frontier ?? []).map((t) => t.canonicalUri));
  // Seeds registered since the last run are appended rather than dropped: resuming must not mean
  // "the seed you added yesterday will never be crawled, and nothing will tell you".
  const frontier: Target[] = [
    ...(saved?.frontier ?? []),
    ...(seeds.map(seedToTarget).filter(Boolean) as Target[]).filter(
      (t) => !seen.has(t.canonicalUri) && !queued.has(t.canonicalUri),
    ),
  ];
  if (saved) log(`resumed run ${opts.runId}: ${frontier.length} queued, ${seen.size} already seen`);

  const ctx: CollectCtx = {
    fetch: opts.fetch,
    callProvider: opts.callProvider,
    canonicalize,
    budget: opts.budget,
    tenantRef: opts.tenantRef,
    log,
  };
  const sinkCtx: SinkCtx = { tenantRef: opts.tenantRef, runId: opts.runId, log };

  let pending: RawDoc[] = [];
  let sinkTotals = emptySinkReport();
  /** Canonical URLs actually delivered to the sink — the only set a tombstone pass may compare. */
  const delivered = new Set<string>();
  let budgetStopped = false;

  const persist = () => store.save(opts.runId, { frontier: [...frontier], seen: [...seen] });
  const flush = async () => {
    if (!pending.length) return;
    const batch = pending;
    pending = [];
    sinkTotals = mergeSink(sinkTotals, await opts.sink.run(batch, sinkCtx));
  };

  while (frontier.length) {
    if (!opts.budget.ok()) {
      report.stoppedBy = "budget";
      break;
    }
    let target = frontier.shift()!;
    if (seen.has(target.canonicalUri)) continue;
    if (!inScope(target.uri, target.scope)) {
      // The footer of a customer's site links to Wikipedia. Without this the crawl follows it.
      report.outOfScope++;
      seen.add(target.canonicalUri);
      continue;
    }
    // Hydrate from what the LAST successful fetch of this exact URL learned, so a block that reads
    // meta.etag/lastModified (today: collect/http-html) can send a conditional GET. A fresh URL (or
    // one urlState knows nothing about) gets undefined here, same as every fetch before this cache
    // existed — this can only ever ADD information to a target, never remove any.
    const cachedUrlState = await urlState.get(opts.tenantRef, target.canonicalUri);
    if (cachedUrlState) {
      target = {
        ...target,
        meta: { ...target.meta, etag: cachedUrlState.etag ?? undefined, lastModified: cachedUrlState.lastModified ?? undefined },
      };
    }
    // The mark de-duplicates within this pass — and `seen` is PERSISTED, so anything that is not a
    // final answer for this target must remove it again. A target left marked after a temporary
    // failure can never be fetched again, in this run or any later one: budget runs out at page 37,
    // page 37 is skipped forever, every test still green. That is the exact failure the plan's
    // resume requirement names.
    seen.add(target.canonicalUri);
    const requeueFront = (t: Target) => {
      seen.delete(target.canonicalUri);
      frontier.unshift(t);
    };
    const requeueBack = (t: Target) => {
      seen.delete(target.canonicalUri);
      frontier.push(t);
    };

    const candidates = blocks
      .map((b) => ({ block: b, score: b.match(target) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(target.tier); // tier = how many strategies this target has already burned through

    if (!candidates.length) {
      report.unhandled.push(target.uri);
      continue;
    }

    // Shared by the live-discovery path below AND the 304-replay path: a link found just now and a
    // link replayed from cache must be filtered by the exact same depth/seen/scope rules, or the
    // cached path would silently behave more (or less) permissively than a live fetch ever does.
    const depthLimit = depthLimitOf(target, maxDepth);
    const carried = inheritedMeta(target.meta);
    const enqueueDiscovered = (items: Array<Partial<Target> & { uri: string; depth: number }>) => {
      for (const d of items) {
        // `maxDepth` counts LEVELS OF PAGES, seed included — the meaning it has had since the
        // orchestrator was written (2 = the seed and one hop), kept exactly so that raising the
        // per-source knob is the only thing that ever widens a crawl.
        //
        // Depth 0 is a ROOT the source itself named rather than a link somebody followed: a
        // `search://…` target is not a page, so its results are not one hop away from anything, and
        // without this exemption "read exactly these, follow nothing" (limit 0) could not be
        // expressed at all — it would refuse the results too.
        //
        // A non-finite depth is treated as one hop rather than trusted: collect/web-search used to
        // return targets with no depth field at all through an `as unknown as Target[]` cast, which
        // made every later comparison NaN, every comparison false, and the depth limit inoperative
        // for the entire search branch of the crawl (run manual-2026-09-20051728: 190 fetches, 159
        // of them a bookshop's browse tree, stopped only by the budget).
        const depth = Number.isFinite(d.depth) ? d.depth : target.depth + 1;
        if (depth > 0 && depth >= depthLimit) continue;
        const canonicalUri = canonicalize(d.uri);
        if (seen.has(canonicalUri)) continue;
        const scope = d.scope ?? target.scope;
        if (!inScope(d.uri, scope)) {
          report.outOfScope++;
          continue;
        }
        // The child's own meta wins: a block that deliberately stamped something (web-search's
        // per-result searchQuery, its own scope) knows more about that target than its parent does.
        frontier.push({ ...d, canonicalUri, scope, tier: 0, depth, meta: { ...carried, ...d.meta } });
      }
    };

    let handled = false;
    let lastError: string | null = null;
    for (let i = 0; i < candidates.length; i++) {
      const { block } = candidates[i];
      let result: { docs: RawDoc[]; discovered: Target[]; notModified?: boolean };
      try {
        result = await block.run(target, ctx);
      } catch (e) {
        const outcome = classify(e);

        if (outcome === "budget") {
          // The run ends here and this target goes back to the FRONT of the queue. It was never
          // attempted successfully, so recording it as seen would lose the page permanently.
          // `tier: i` means the resumed run skips the strategies already ruled out for it.
          requeueFront({ ...target, tier: i });
          report.stoppedBy = "budget";
          budgetStopped = true;
          handled = true;
          break;
        }

        if (outcome === "retry") {
          const attempts = Number(target.meta?.[ATTEMPTS_KEY] ?? 0) + 1;
          if (attempts <= maxAttempts) {
            // Back of the queue, not a sleep: a crawl that blocks on one slow host does no work at
            // all, and on a large frontier the next attempt is naturally minutes later.
            requeueBack({ ...target, meta: { ...target.meta, [ATTEMPTS_KEY]: attempts } });
            report.retried++;
          } else {
            // Out of attempts for THIS run — not forever. The mark is dropped so a later run, after
            // the site recovers, starts clean instead of skipping the page for good.
            seen.delete(target.canonicalUri);
            report.dirty.push({ uri: target.uri, reason: `retry_exhausted:${errorLabel(e)}` });
          }
          handled = true;
          break;
        }

        if (outcome === "disallowed") {
          // robots said no, or the gate refused. A settled answer, and its own bucket: mixed into
          // `dirty` it would make C2's alert fire on correct behaviour until somebody turned the
          // alert down — and then the alert is gone for the case that mattered.
          report.disallowed.push({ uri: target.uri, reason: errorLabel(e) });
          handled = true;
          break;
        }

        if (outcome === "gone") {
          // Not an error to fix — the page is gone, and a tombstone pass turns that into an archive
          // so the knowledge base stops answering with a product that no longer exists.
          report.gone.push(target.uri);
          handled = true;
          break;
        }

        lastError = errorLabel(e);
        log(`block ${block.id} failed on ${target.uri}: ${String(e).slice(0, 160)}`);
        continue; // extraction problem: fall through to the next strategy
      }

      if (result.notModified) {
        // Confirmed unchanged: nothing new to grade or store, but the LINKS this page had are not
        // "gone" — a 304 simply cannot report them. Replay whatever the last successful fetch of
        // this URL found, at THIS target's depth (not the depth they were originally discovered at,
        // which may have been a different, now-irrelevant crawl run).
        const cached = await urlState.get(opts.tenantRef, target.canonicalUri);
        enqueueDiscovered((cached?.discoveredLinks ?? []).map((uri) => ({ uri, depth: target.depth + 1 })));
        handled = true;
        break;
      }

      // A genuine fetch happened (200, regardless of what the quality gate decides below) — cache
      // what it learned so the NEXT run of this exact URL can send a conditional GET. Overwritten by
      // whichever strategy ultimately succeeds if an earlier one degrades to a heavier one below;
      // that is correct, the earlier strategy's etag belongs to a response nobody is keeping.
      const firstDoc = result.docs[0];
      await urlState.set(opts.tenantRef, target.canonicalUri, {
        etag: typeof firstDoc?.meta.etag === "string" ? firstDoc.meta.etag : null,
        lastModified: typeof firstDoc?.meta.lastModified === "string" ? firstDoc.meta.lastModified : null,
        discoveredLinks: result.discovered.map((d) => d.uri),
      });

      report.fetched++;
      const graded = result.docs.map((d) => ({
        doc: d,
        // The block reports when a page pointed its canonical somewhere else; the gate uses it as
        // the second signal for a soft-404 (a templated error page canonicalises to the home page).
        // Without passing it the option existed but nothing ever set it — a check that never ran.
        verdict: grade(d, { canonicalMismatch: typeof d.meta.declaredCanonicalRejected === "string" }),
      }));
      const hasNextTier = i + 1 < candidates.length;
      if (graded.length > 0 && graded.every((g) => !g.verdict.ok) && hasNextTier) {
        // Everything this strategy produced is chrome or a soft-404 — try a heavier strategy before
        // recording a failure.
        continue;
      }

      let admitted = 0;
      for (const { doc, verdict } of graded) {
        if (!verdict.ok) {
          // Only the identifiers and the reason: pushing the whole RawDoc would put raw page bytes
          // into memory and into logs.
          //
          // `_no_heavier_tier` when a thin extraction was the LAST word available: a JavaScript-
          // rendered profile page (a university's Pure portal, say) yields a 4KB shell, fails on
          // length, and is recorded as "too_short" — which reads as "that page had nothing on it"
          // when the truth is "nothing here can read that page". The two need different actions
          // from the operator, so they must not share a label. Block-agnostic on purpose: the
          // orchestrator states what it observed (no further strategy existed), never which vendor
          // would have to be configured.
          const thin = verdict.reason === "too_short" || verdict.reason === "low_text_density";
          const reason = thin && !hasNextTier ? `${verdict.reason}_no_heavier_tier` : (verdict.reason ?? "unknown");
          report.dirty.push({ uri: doc.uri, reason, checks: verdict.checks });
          continue;
        }
        // Relevance is judged only AFTER extraction quality, and never triggers the degrade-to-a-
        // heavier-strategy path above: a page that is about somebody else does not become about the
        // right person when a renderer extracts it more completely. Quality can be fixed by trying
        // harder; relevance cannot.
        const relevance = assessRelevance(doc, target.meta);
        if (!relevance.ok) {
          report.offEntity.push({ uri: doc.uri, reason: relevance.reason ?? "off_entity" });
          continue;
        }
        const screen = screenForInjection(doc.text, rawAsText(doc));
        if (!screen.clean) {
          report.quarantined.push({ uri: doc.uri, reason: `injection_${screen.hits.join("+")}` });
          continue; // never automatically stored; a human decides
        }
        const evidence = relevanceMetadata(relevance);
        // Which search filed this document, carried from the TARGET onto the document, once, here.
        // It used to be copied by collect/http-html alone, which meant every other collector that
        // could be reached from a search silently lost it — and losing it means sink/kb.ts cannot
        // file the document, which is how 159 of 161 documents ended up unfiled.
        const provenanceOfSearch: Record<string, unknown> = {};
        for (const key of ["searchQuery", "searchAngle", "searchLang"] as const) {
          if (doc.meta[key] === undefined && target.meta?.[key] !== undefined) provenanceOfSearch[key] = target.meta[key];
        }
        // Why this document is in the dossier, stored WITH the document: six months later the run
        // report is a row nobody opens, and "it names her and mentions La Trobe" is what makes the
        // collection auditable rather than a pile of URLs somebody has to re-read.
        const extra = { ...provenanceOfSearch, ...(evidence ?? {}) };
        pending.push(stampProvenance(Object.keys(extra).length ? { ...doc, meta: { ...doc.meta, ...extra } } : doc));
        delivered.add(doc.canonicalUrl);
        admitted++;
      }

      // A page whose every document was refused does not get to nominate the next pages. Its links
      // are the links of a navigation shell, a soft-404 or a stranger's homepage — which is how one
      // rejected think-tank profile page put its cookie policy, ethics statement and DEI strategy
      // into the crawl (run manual-2026-09-20051728). A block that produced no documents at all
      // (a search, a sitemap, a feed index) is unaffected: discovery is its entire job.
      if (graded.length === 0 || admitted > 0) enqueueDiscovered(result.discovered);
      else log(`not expanding ${target.uri}: every extracted document was refused`);

      handled = true;
      break;
    }

    if (!handled) {
      report.dirty.push({ uri: target.uri, reason: `all_strategies_failed:${lastError ?? "unknown"}` });
    }
    if (budgetStopped) break;

    if (pending.length >= flushEvery) {
      await flush();
      await persist();
    }
  }

  if (report.stoppedBy === null) report.stoppedBy = "frontier_empty";
  await flush();
  await persist();

  if (opts.sink.finalize) {
    // A tombstone pass archives whatever the sink holds and this run did NOT deliver, so it is only
    // safe when "not delivered" really can only mean "no longer on the site". Two ways it can mean
    // something else, and both have happened to crawlers:
    //   * the run stopped early — the rest was never reached;
    //   * the run finished, but the site was broken and nearly everything failed. `frontier_empty`
    //     is true then as well, and the difference would be the tenant's entire knowledge base.
    const attempted = report.fetched + report.dirty.length + report.gone.length + report.disallowed.length;
    const failed = report.dirty.length + report.disallowed.length;
    const healthy = report.stoppedBy === "frontier_empty" && attempted > 0 && failed / attempted < 0.5;
    if (healthy) {
      // Delivered canonical URLs, not the target `seen` set: those are two different key spaces
      // (a page's declared canonical, or its post-redirect URL, need not equal the URL we queued),
      // and comparing the wrong one archives documents that were collected perfectly well.
      sinkTotals = mergeSink(sinkTotals, await opts.sink.finalize(delivered, sinkCtx));
    } else {
      log(
        `skipping finalize: stoppedBy=${report.stoppedBy} attempted=${attempted} failed=${failed} — ` +
          `"not delivered" does not mean "gone"`,
      );
    }
  }

  return { report, sink: sinkTotals, state: { frontier: [...frontier], seen: [...seen] } };
}

/** Convenience for callers that just want a report of what would be collected. */
export function summarize(result: CrawlResult): string {
  const r = result.report;
  return [
    `fetched=${r.fetched}`,
    `written=${result.sink.written}`,
    `dirty=${r.dirty.length}`,
    `offEntity=${r.offEntity.length}`,
    `quarantined=${r.quarantined.length}`,
    `gone=${r.gone.length}`,
    `outOfScope=${r.outOfScope}`,
    `retried=${r.retried}`,
    `stoppedBy=${r.stoppedBy}`,
  ].join(" ");
}

export type { CollectIssue };
