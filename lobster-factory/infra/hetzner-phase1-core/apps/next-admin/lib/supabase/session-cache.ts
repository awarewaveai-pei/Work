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
// SECURITY TRADEOFF — read this before widening the windows. Cache hits SKIP the revocation /
// role-downgrade check that getUser() performs against the auth server. Worst-case staleness of
// a privileged credential after the admin revokes/downgrades it:
//   - up to FRESH_MS with NO check at all (any request inside the fresh window), PLUS
//   - up to STALE_MS of transient-failure fallback IF the attacker can also keep the auth server
//     throttled (the rate-limit condition this very change is built around — an attacker can
//     deliberately induce it by fanning out requests).
// To bound that, stale fallback for a given token is capped at MAX_STALE_USES consecutive uses;
// once exceeded the key fails CLOSED until a fresh network validation succeeds (which resets the
// counter and would itself catch the revocation). Net worst-case privileged exposure ≈ FRESH_MS
// + MAX_STALE_USES requests, not the full STALE_MS. For this single-owner console that is an
// accepted availability-over-immediacy tradeoff; tighten the windows for multi-tenant use.
//
// State is module-level. The console runs as a single long-running container, so the cache is
// shared across requests within the process; losing it (restart / cold isolate) only costs a
// revalidation. Nothing here is a security boundary on its own — it only re-uses a result that
// getUser() already proved over the network within the last STALE_MS.

import type { OpsRole } from "@/lib/ops-contracts";

const FRESH_MS = 15_000;     // within this window, skip network revalidation
const STALE_MS = 120_000;    // within this window, tolerate transient auth-server failures
const MAX_STALE_USES = 8;    // consecutive transient-failure fallbacks before failing closed
const MAX_ENTRIES = 500;     // bound memory

// Tenant identity is cached alongside the role so that the fresh-hit and stale-fallback paths
// can inject x-ops-user-kind / x-ops-org-id without calling getUser() again. A missing entry
// (first request, cache eviction) always forces a fresh getUser() which fills both fields.
export type UserKind = "staff" | "client";
// tools: the staff tool grant (app_metadata.staff_tools, lib/staff-access.ts); null = never set. Cached with the role, so a
// changed grant reaches a session within FRESH_MS, the same bound as a role change.
export interface CachedIdentity { role: OpsRole; userKind: UserKind; orgId: string; userId: string; tools: readonly string[] | null }
type Entry = CachedIdentity & { at: number; staleUses: number };
const cache = new Map<string, Entry>();

function prune(now: number): void {
  if (cache.size <= MAX_ENTRIES) return;
  // Drop everything already past the stale horizon first.
  for (const [k, v] of cache) {
    if (now - v.at > STALE_MS) cache.delete(k);
  }
  // Hard cap: evict oldest-inserted entries until under the limit. cacheValidatedRole re-inserts
  // (delete-before-set) so a re-validated hot session moves to the tail and survives this loop.
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

const identityOf = (e: Entry): CachedIdentity => ({ role: e.role, userKind: e.userKind, orgId: e.orgId, userId: e.userId, tools: e.tools });

/**
 * Cache hit only if validated within FRESH_MS — safe to skip the network call entirely.
 * Returns the full identity (role + tenant) so the middleware can inject all headers without
 * a getUser() call.
 */
export function getFreshCachedRole(key: string, now: number = Date.now()): CachedIdentity | null {
  const e = cache.get(key);
  return e && now - e.at <= FRESH_MS ? identityOf(e) : null;
}

/**
 * Stale fallback — use ONLY when a fresh network validation just failed transiently. Returns the
 * last good identity if still inside STALE_MS AND under the consecutive-use cap; otherwise null
 * (fail closed). Each call consumes one allowance; a successful validation resets it.
 */
export function consumeStaleCachedRole(key: string, now: number = Date.now()): CachedIdentity | null {
  const e = cache.get(key);
  if (!e || now - e.at > STALE_MS) return null;
  if (e.staleUses >= MAX_STALE_USES) return null;
  e.staleUses += 1;
  return identityOf(e);
}

/** Record a successful network validation. Resets the stale-use allowance and moves to LRU tail. */
export function cacheValidatedRole(
  key: string,
  identity: CachedIdentity,
  now: number = Date.now()
): void {
  cache.delete(key); // re-insert so re-validated entries sort to the tail (true LRU-ish ordering)
  cache.set(key, { ...identity, at: now, staleUses: 0 });
  prune(now);
}
