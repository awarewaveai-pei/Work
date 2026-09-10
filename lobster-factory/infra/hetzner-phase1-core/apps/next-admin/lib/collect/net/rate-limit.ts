// Per-host politeness (DATA_COLLECTION_PLAN.md §1.2, ADR 011 §決策 9).
//
// A per-RUN token bucket is worthless the moment two runs are scheduled: each run politely takes
// its own 1 req/s and the target sees 2, then 5, then blocks the IP — the IP of the machine also
// serving production. So the bucket lives behind a store that CAN be shared and persisted; C3 swaps
// the in-memory default for a durable one and nothing else changes.
//
// The store's operation is TAKE, not get-then-set. A read, a decision and a write with awaits in
// between is a race: two concurrent fetches read the same state and both decide there is a token.
// Within one process that is merely impolite; across the two processes C3 introduces it makes the
// C3 DoD ("two concurrent runs stay under the per-host limit, measured") unreachable by design.
// A durable implementation satisfies this interface with a single conditional UPDATE ... RETURNING.
//
// Classified as RATE_LIMIT, not QUOTA (ADR 012 §決策 1): the risk lands on a shared external
// resource, so it must never become something a customer can buy their way past.

export interface BucketState {
  tokens: number;
  lastRefillMs: number;
}

export interface TakeRequest {
  host: string;
  ratePerSecond: number;
  burst: number;
  /** Minimum gap between two requests to this host, e.g. from robots.txt Crawl-delay. */
  minIntervalMs?: number;
  now: number;
}

export interface TakeResult {
  /** 0 ⇒ granted now. Above 0 ⇒ the caller must wait this long, then it is granted. */
  waitMs: number;
}

/**
 * One atomic operation. An implementation must apply the refill, the decision and the write without
 * another taker observing the intermediate state.
 */
export interface RateLimitStore {
  take(req: TakeRequest): Promise<TakeResult>;
}

/** Pure bucket arithmetic, shared by every store implementation so they cannot drift apart. */
export function nextBucket(
  state: BucketState | null,
  req: TakeRequest,
): { state: BucketState; waitMs: number } {
  const rate = Math.max(req.ratePerSecond, 0.001);
  const burst = Math.max(req.burst, 1);
  const prev = state ?? { tokens: burst, lastRefillMs: req.now };

  const refilled = Math.min(burst, prev.tokens + ((req.now - prev.lastRefillMs) / 1000) * rate);
  // A Crawl-delay is a floor on the GAP BETWEEN requests, independent of how many tokens the bucket
  // saved up — and there is no gap before the first one, so a fresh host is never made to wait.
  const sinceLast = req.now - prev.lastRefillMs;
  const intervalWait =
    state !== null && req.minIntervalMs && sinceLast < req.minIntervalMs ? req.minIntervalMs - sinceLast : 0;

  if (refilled >= 1 && intervalWait === 0) {
    return { state: { tokens: refilled - 1, lastRefillMs: req.now }, waitMs: 0 };
  }
  const tokenWait = refilled >= 1 ? 0 : Math.ceil(((1 - refilled) / rate) * 1000);
  const waitMs = Math.max(tokenWait, intervalWait);
  // The token is reserved NOW, at the time the wait ends — otherwise a second taker arriving during
  // the wait sees a full bucket and both go at once.
  return { state: { tokens: 0, lastRefillMs: req.now + waitMs }, waitMs };
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly map = new Map<string, BucketState>();

  // JavaScript runs this to completion with no await inside, which is what makes it atomic here.
  async take(req: TakeRequest): Promise<TakeResult> {
    const key = req.host.toLowerCase();
    const { state, waitMs } = nextBucket(this.map.get(key) ?? null, req);
    this.map.set(key, state);
    return { waitMs };
  }
}

export interface RateLimiterOptions {
  ratePerSecond?: number;
  burst?: number;
  store?: RateLimitStore;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Upper bound on a single wait; beyond it the caller is told to give up instead of hanging. */
  maxWaitMs?: number;
}

export class RateLimiter {
  private readonly rate: number;
  private readonly burst: number;
  private readonly store: RateLimitStore;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxWaitMs: number;

  constructor(opts: RateLimiterOptions = {}) {
    this.rate = opts.ratePerSecond ?? 1;
    this.burst = opts.burst ?? 2;
    this.store = opts.store ?? new MemoryRateLimitStore();
    this.now = opts.now ?? (() => Date.now());
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.maxWaitMs = opts.maxWaitMs ?? 30_000;
  }

  /** Wait until this host may be contacted. Returns how long it waited. */
  async take(host: string, opts: { minIntervalMs?: number } = {}): Promise<number> {
    const { waitMs } = await this.store.take({
      host: host.toLowerCase(),
      ratePerSecond: this.rate,
      burst: this.burst,
      minIntervalMs: opts.minIntervalMs,
      now: this.now(),
    });
    if (waitMs === 0) return 0;
    if (waitMs > this.maxWaitMs) throw new Error(`rate_limit_wait_too_long_${host}_${waitMs}ms`);
    await this.sleep(waitMs);
    return waitMs;
  }
}
