// Lead searches resume (migration 0160, operator 2026-11-04): the same search run again starts where the last run
// stopped, so page 1 is never paid for twice and a search with nothing left says so before spending anything. Each
// source defines its own resume point (discover.ts, sources/gcis.ts, sources/people-search.ts); this file only stores it.
import type { SupabaseClient } from "@supabase/supabase-js";

export type SearchSource = "places" | "gcis" | "people";
/** Where a run starts: null = from the beginning. exhausted = an earlier run reached the end. */
export interface SearchCursor<S> { from: S | null; exhausted: boolean; runs: number }

const TABLE = "co_search_cursors";

/** The search's identity: its inputs trimmed and lower-cased, in a fixed order. JSON, not a joined string: an input may
 *  hold the separator, and two different searches must never share a cursor (Codex 2026-11-04). Inputs are ≤ 100 chars each (column check ≤ 1000). */
export const searchKey = (parts: ReadonlyArray<string | null | undefined>): string =>
  JSON.stringify(parts.map((p) => (p ?? "").trim().toLowerCase()));

/** restart = the person asked to search again from the beginning (new businesses open; an old end is not forever). */
export async function loadCursor<S>(db: SupabaseClient, org: string | null, source: SearchSource, key: string, restart = false): Promise<SearchCursor<S>> {
  const q = db.from(TABLE).select("next_state, runs").eq("source", source).eq("search_key", key);
  const { data, error } = await (org ? q.eq("organization_id", org) : q.is("organization_id", null)).maybeSingle();
  if (error) throw new Error(`search cursor read: ${error.message}`);
  const row = data as { next_state: S | null; runs: number } | null;
  if (!row) return { from: null, exhausted: false, runs: 0 };
  if (restart) return { from: null, exhausted: false, runs: row.runs };
  return { from: row.next_state, exhausted: row.next_state === null, runs: row.runs };
}

/** next = where the following run starts; null = this run reached the end. */
export async function saveCursor(db: SupabaseClient, org: string | null, source: SearchSource, key: string, prev: SearchCursor<unknown>, next: unknown): Promise<void> {
  const { error } = await db.from(TABLE).upsert(
    { organization_id: org, source, search_key: key, next_state: next ?? null, runs: prev.runs + 1, updated_at: new Date().toISOString() },
    { onConflict: "organization_id,source,search_key" });
  if (error) throw new Error(`search cursor write: ${error.message}`);
}
