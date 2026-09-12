// Per-URL fetch state — what a conditional GET needs remembered between crawl runs.
//
// Without this, every run starts every URL from zero: no etag to send, so no 304 ever happens, so
// the budget is spent re-fetching and re-grading pages that have not changed since yesterday. It
// also closes TASKS.md 2026-09-11 "蒐集 C3 前必修": a 304 has no body, so it cannot carry the page's
// outbound links, and the orchestrator replays THIS store's cached list instead of losing them.
//
// Optional everywhere it is used (migration 0080, table added 2026-09-12): a caller that does not
// pass a store gets NO_URL_STATE, which behaves exactly like the code before this file existed —
// conditional GET simply never fires, same as every run before now.

import { getSupabaseWriteClient } from "@/lib/supabase-server";

export interface UrlState {
  etag: string | null;
  lastModified: string | null;
  /** Capped at MAX_LINKS — see the constant's own comment. */
  discoveredLinks: string[];
}

export interface UrlStateStore {
  get(organizationId: string, canonicalUrl: string): Promise<UrlState | null>;
  set(organizationId: string, canonicalUrl: string, state: UrlState): Promise<void>;
}

/**
 * A page with more outbound links than this is rare, and the ones beyond the cap are lost only on
 * the specific day a 304 happens to land for that page — any other response (a normal 200)
 * re-discovers the full set fresh. A cache with a bounded, documented miss is preferable to an
 * unbounded jsonb column that grows without limit on whatever page has the most links.
 */
const MAX_LINKS = 500;

export function cappedLinks(links: string[]): string[] {
  return links.slice(0, MAX_LINKS);
}

/** For tests — and the shape any real store must match. */
export class MemoryUrlStateStore implements UrlStateStore {
  private readonly rows = new Map<string, UrlState>();
  private key(organizationId: string, canonicalUrl: string): string {
    return `${organizationId} ${canonicalUrl}`;
  }
  async get(organizationId: string, canonicalUrl: string): Promise<UrlState | null> {
    const s = this.rows.get(this.key(organizationId, canonicalUrl));
    return s ? { ...s, discoveredLinks: [...s.discoveredLinks] } : null;
  }
  async set(organizationId: string, canonicalUrl: string, state: UrlState): Promise<void> {
    this.rows.set(this.key(organizationId, canonicalUrl), { ...state, discoveredLinks: cappedLinks(state.discoveredLinks) });
  }
}

/** A store that remembers nothing — the default. Conditional GET never fires; nothing else changes. */
export const NO_URL_STATE: UrlStateStore = {
  async get() {
    return null;
  },
  async set() {
    /* intentionally nothing */
  },
};

interface Row {
  etag: string | null;
  last_modified: string | null;
  discovered_links: unknown;
}

/** Production store — migration 0080's collection_url_state, service_role only. */
export function createSupabaseUrlStateStore(): UrlStateStore {
  return {
    async get(organizationId, canonicalUrl) {
      const sb = getSupabaseWriteClient();
      if (!sb) return null;
      const { data, error } = await sb
        .from("collection_url_state")
        .select("etag,last_modified,discovered_links")
        .eq("organization_id", organizationId)
        .eq("canonical_url", canonicalUrl)
        .maybeSingle();
      // A read failure must look like "no cached state" (unconditional fetch), never like a crash —
      // this cache is an optimization, and losing it for one lookup must not lose the crawl.
      if (error || !data) return null;
      const row = data as Row;
      const links = Array.isArray(row.discovered_links)
        ? (row.discovered_links as unknown[]).filter((x): x is string => typeof x === "string")
        : [];
      return { etag: row.etag, lastModified: row.last_modified, discoveredLinks: links };
    },
    async set(organizationId, canonicalUrl, state) {
      const sb = getSupabaseWriteClient();
      if (!sb) return;
      // Best-effort: a failed write here means the NEXT run for this URL does an unconditional
      // fetch instead of a conditional one — wasted budget, not a wrong answer anywhere.
      await sb.from("collection_url_state").upsert(
        {
          organization_id: organizationId,
          canonical_url: canonicalUrl,
          etag: state.etag,
          last_modified: state.lastModified,
          discovered_links: cappedLinks(state.discoveredLinks),
          last_fetched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,canonical_url" },
      );
    },
  };
}
