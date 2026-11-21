/**
 * 每來源位址固定視窗限流(記憶體計數)。
 *
 * 來源位址只信 X-Real-IP:正式環境的 nginx(lobster-factory/infra/hetzner-phase1-core/nginx/default.conf
 *   oracle.aware-wave.com 段)設 `X-Real-IP $remote_addr`,而 $remote_addr 已由 aware-wave-security.conf 的
 *   real_ip(CF-Connecting-IP,只信 Cloudflare 網段)還原成真實訪客。X-Forwarded-For 可被訪客偽造,不讀。
 *   沒有這個標頭(本機開發、直連容器埠)時全部算同一個來源 'unknown'。
 * 限制:計數在單一行程的記憶體裡;多副本或多行程時各算各的,總量最多放大成副本數倍。重啟歸零。
 */

export interface RateRule {
  /** 同一來源在一個視窗內最多幾次 */
  limit: number;
  windowMs: number;
}

/** 對外資料介面 v1 與占星計算:每分鐘 60 次。 */
export const API_RULE: RateRule = { limit: 60, windowMs: 60_000 };
/** AI 解讀(花錢):每分鐘 10 次。 */
export const INTERPRET_RULE: RateRule = { limit: 10, windowMs: 60_000 };

interface Bucket {
  start: number;
  count: number;
}

/** 插入順序即建立順序:滿了就丟最舊的(硬上限,不會無限長大,也不做全表掃描)。 */
const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 50_000;

export type RateResult = { ok: true } | { ok: false; retryAfterSec: number };

/** scope 區分各組端點的額度(v1、interpret…),同一來源各自計數。 */
export function hit(scope: string, source: string, rule: RateRule, now = Date.now()): RateResult {
  const key = `${scope}|${source}`;
  let b = buckets.get(key);
  if (!b || now - b.start >= rule.windowMs) {
    buckets.delete(key); // 新視窗重新插到最後,維持「越前面越舊」
    if (buckets.size >= MAX_BUCKETS) buckets.delete(buckets.keys().next().value as string);
    b = { start: now, count: 0 };
    buckets.set(key, b);
  }
  b.count += 1;
  if (b.count <= rule.limit) return { ok: true };
  return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.start + rule.windowMs - now) / 1000)) };
}

/**
 * 計數用的來源鍵:IPv4 用整個位址;IPv6 只取前 64 位元(一個用戶通常握有整個 /64,逐址計數可輪換繞過)。
 * 解析不了的字串原樣使用。
 */
export function sourceKey(ip: string): string {
  const v = ip.trim().toLowerCase();
  if (!v.includes(':')) return v;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return mapped[1];
  const [head, tail] = v.split('::');
  if (v.split('::').length > 2) return v;
  const h = head ? head.split(':') : [];
  const t = tail === undefined ? [] : tail ? tail.split(':') : [];
  const groups = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return v;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

export function clientSource(request: Request): string {
  const ip = request.headers.get('x-real-ip')?.trim();
  return ip ? sourceKey(ip) : 'unknown';
}

/** 超過額度時回 429 + Retry-After;未超過回 null。 */
export function rateLimited(request: Request, scope: string, rule: RateRule, headers: HeadersInit = {}): Response | null {
  const r = hit(scope, clientSource(request), rule);
  if (r.ok) return null;
  return Response.json(
    { error: 'rate_limited', detail: `too many requests; retry in ${r.retryAfterSec}s` },
    { status: 429, headers: { ...Object.fromEntries(new Headers(headers)), 'Retry-After': String(r.retryAfterSec) } },
  );
}

/** 僅供測試。 */
export function __resetRateLimit(): void {
  buckets.clear();
}
