// In-memory validated-session cache for the middleware auth gate.
//
// Problem it solves (root cause of the 2026-06-14 /tools/content "功能壞了" incident):
// middleware validates EVERY matched request via supabase.auth.getUser() — a network call to
// the Supabase auth server (supabase.aware-wave.com). A single page load fans out into dozens
// of parallel sub-requests (document + chunks + /api/content/* prefetch), all leaving from the
// one origin server IP (5.223.93.113). That burst tripped Cloudflare's per-IP rate limit on
// supabase.aware-wave.com, which replied with plain-text "Rate limit exceeded"; supabase-js
// could not JSON-parse it and surfaced an AuthUnknownError, which middleware treated as
// "not authenticated" and bounced the logged-in user to /login.
//
// This cache keys on the session's auth-token cookie value(s). After a SUCCESSFUL network
// validation it remembers the resolved ops_role for a short window, so:
//   - FRESH window: skip the auth call entirely (collapses a burst → ~1 upstream validation).
//   - STALE window: if a later validation fails *transiently* (rate-limit / network), trust the
//     last good result instead of bouncing. A forged or stale token is never network-validated,
//     so it never earns a cache entry — the gate still fails CLOSED for it.
//
// State is module-level. The console runs as a single long-running container, so the cache is
// shared across requests within the process; losing it (restart / cold isolate) only costs a
// revalidation. Nothing here is a security boundary on its own — it only re-uses a result that
// getUser() already proved over the network within the last STALE_MS.

import type { OpsRole } from "@/lib/ops-contracts";

const FRESH_MS = 15_000;   // within this window, skip network revalidation
const STALE_MS = 120_000;  // within this window, tolerate transient auth-server failures
const MAX_ENTRIES = 500;   // bound memory

type Entry = { role: OpsRole; at: number };
const cache = new Map<string, Entry>();

function prune(now: number): void {
  if (cache.size <= MAX_ENTRIES) return;
  // Drop everything already past the stale horizon first.
  for (const [k, v] of cache) {
    if (now - v.at > STALE_MS) cache.delete(k);
  }
  // Hard cap: evict oldest-inserted entries until under the limit.
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Cache hit only if validated within FRESH_MS — safe to skip the network call entirely. */
export function getFreshCachedRole(key: string, now: number = Date.now()): OpsRole | null {
  const e = cache.get(key);
  return e && now - e.at <= FRESH_MS ? e.role : null;
}

/** Cache hit within STALE_MS — use ONLY when a fresh network validation failed transiently. */
export function getStaleCachedRole(key: string, now: number = Date.now()): OpsRole | null {
  const e = cache.get(key);
  return e && now - e.at <= STALE_MS ? e.role : null;
}

/** Record a successful network validation. */
export function cacheValidatedRole(key: string, role: OpsRole, now: number = Date.now()): void {
  cache.set(key, { role, at: now });
  prune(now);
}
