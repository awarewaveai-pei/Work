// The cover image rows of videos (0163 cover_media_id), always a SECOND plain query, never a PostgREST embed.
// Invariant: no select embeds social_media into itself. prod PostgREST v14.6 (2026-11-15) answers
// an embed of social_media hinted by social_media_cover_fk -- and by the cover_media_id / cover_kind / organization_id
// column hints -- with 400 PGRST200 on the composite self-referencing FK's many-to-one side; without a hint it exposes only
// the reverse direction (image -> the videos using it). That 400 emptied every media list in the app (SocialManager
// `.catch(() => setMedia([]))`) and would have kept the sender from loading a due post. Guard: __tests__/no-self-embed.test.ts.
import type { SupabaseClient } from "@supabase/supabase-js";

export type CoverRef = { organization_id: string; cover_media_id: string | null };
export type CoverRow = { id: string; organization_id: string; postiz_media_id: string | null; postiz_path: string | null };

/** PostgREST `in.(...)` lives in the URL; 100 UUIDs ≈ 3.8 KB, well under the gateway's line limit. */
const CHUNK = 100;

export const coverKey = (organizationId: string, coverMediaId: string) => `${organizationId}/${coverMediaId}`;

/** The cover rows the refs point at, keyed by coverKey(org, id). Only a row in the same organization as the video that
 *  points at it is returned (the FK guarantees this in the database; the check here keeps a stale cache honest). */
export async function loadCoverRows(sb: SupabaseClient, refs: readonly CoverRef[]): Promise<Map<string, CoverRow>> {
  const wanted = new Map<string, Set<string>>();   // cover id -> organizations whose videos point at it
  for (const r of refs) {
    if (!r.cover_media_id) continue;
    const orgs = wanted.get(r.cover_media_id) ?? new Set<string>();
    orgs.add(r.organization_id);
    wanted.set(r.cover_media_id, orgs);
  }
  const out = new Map<string, CoverRow>();
  const ids = [...wanted.keys()];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await sb.from("social_media").select("id, organization_id, postiz_media_id, postiz_path")
      .in("id", ids.slice(i, i + CHUNK));
    if (error) throw new Error(`cover rows: ${error.message}`);
    for (const row of (data ?? []) as CoverRow[]) {
      if (wanted.get(row.id)?.has(row.organization_id)) out.set(coverKey(row.organization_id, row.id), row);
    }
  }
  return out;
}
