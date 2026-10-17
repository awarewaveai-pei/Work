// Rotation lists (SOCIAL_MANAGER_PLAN.md C7; migration 0101). A list's items are its rotation posts; each day the task
// social-rotation (POST /api/internal/social/rotation) materialises the next ROTATION_DAYS of the list's weekday x
// time slots (0105 social_list_slots), in the brand's time zone, into ordinary scheduled posts that the sender
// (dispatch.ts) sends. The same run makes the repeat series' children (0105).
// The database keeps "once per slot", "the schedule follows the list" and "reorder = permutation" (0101 header); this
// file only computes the slots and calls it. Saving a list (API) materialises it again right away.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { addDays, instantAt, weekday, zoned } from "./time";
import { selectAll } from "@/lib/supabase-paging";
import { POST_COLUMNS, SERIES_COLUMNS, SocialStoreError, materializeSeries, type ListSlot, type PostRow, type SeriesRow } from "./store";

export const ROTATION_DAYS = 7;
const ACTOR = "system:social-rotation";

function db(): SupabaseClient {
  const sb = getSupabaseWriteClient();
  if (!sb) throw new SocialStoreError(500, "Supabase client not configured");
  return sb;
}

function fail(error: { code?: string; message: string }, what: string): never {
  const status = error.code === "SC404" ? 404 : error.code === "SC409" ? 409 : 500;
  throw new SocialStoreError(status, `${what}: ${error.message}`);
}

/** The list's send times (its weekday x time slots, 0105 social_list_slots) from now through the next `days` days,
 *  oldest first, as instants. The items go out in this order. */
export function listSlots(slots: ReadonlyArray<ListSlot>, tz: string, now: Date, days = ROTATION_DAYS): string[] {
  const today = zoned(now, tz).date;
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(today, i);
    for (const s of slots) {
      if (s.weekday !== weekday(d)) continue;
      const at = instantAt(d, s.send_time.slice(0, 5), tz);
      if (Date.parse(at) > now.getTime()) out.push(at);
    }
  }
  return [...new Set(out)].sort();   // ISO strings from toISOString sort as instants; one DST hour can map two times to one
}

interface ListForRun { id: string; active: boolean; slots: ListSlot[]; organization: { default_timezone: string } | null }

async function materialize(sb: SupabaseClient, list: ListForRun, now: Date): Promise<number> {
  if (!list.active) return 0;
  const slots = listSlots(list.slots ?? [], list.organization?.default_timezone ?? "UTC", now);
  const { data, error } = await sb.rpc("social_materialize_list", { p_list: list.id, p_slots: slots, p_actor: ACTOR });
  if (error) fail(error, "materialise list");
  return (data as number) ?? 0;
}

const LIST_FOR_RUN = "id, active, slots:social_list_slots(weekday, send_time), organization:organizations(default_timezone)";

/** One list, right after it was saved (the save withdrew what it had materialised: 0101 social_save_list). */
export async function materializeList(brandId: string, listId: string, now = new Date()): Promise<number> {
  const sb = db();
  const { data, error } = await sb.from("social_lists").select(LIST_FOR_RUN).eq("id", listId).eq("organization_id", brandId).maybeSingle();
  if (error) fail(error, "list");
  if (!data) throw new SocialStoreError(404, "no such list in this brand");
  return materialize(sb, data as unknown as ListForRun, now);
}

/** The daily run: every active list of every brand, then every repeat series (0105; the run after a person's change
 *  is store.ts refreshSeries). One list or series failing does not stop the others. */
export async function runRotation(now = new Date()): Promise<{ lists: number; series: number; posts: number; errors: string[] }> {
  const sb = db();
  const { data, error } = await sb.from("social_lists").select(LIST_FOR_RUN).eq("active", true);
  if (error) fail(error, "lists");
  const out = { lists: 0, series: 0, posts: 0, errors: [] as string[] };
  for (const list of (data ?? []) as unknown as ListForRun[]) {
    try {
      out.posts += await materialize(sb, list, now);
      out.lists++;
    } catch (e) {
      out.errors.push(`${list.id}: ${String(e).slice(0, 200)}`);
    }
  }
  // the database decides which templates may send (0105 social_repeat_materialize); the ones that never can (draft,
  // review, deleted before it went out) are skipped here. Paged: PostgREST answers at most 1000 rows.
  const templates = await selectAll((f, t) => sb.from("social_posts").select(SERIES_COLUMNS)
    .not("repeat", "is", null).not("state", "in", "(draft,review)").or("state.neq.deleted,published_at.not.is.null")
    .order("id").range(f, t), (e) => fail(e, "repeat series"));
  for (const t of templates as unknown as SeriesRow[]) {
    try {
      out.posts += await materializeSeries(sb, t, false, now);
      out.series++;
    } catch (e) {
      out.errors.push(`${t.id}: ${String(e).slice(0, 200)}`);
    }
  }
  return out;
}

/** The list's items in order, and what it has put on the calendar that has not gone out yet. */
export async function listQueue(brandId: string, listId: string): Promise<{ items: PostRow[]; upcoming: PostRow[] }> {
  const sb = db();
  const [items, upcoming] = await Promise.all([
    sb.from("social_posts").select(POST_COLUMNS).eq("organization_id", brandId).eq("list_id", listId).eq("state", "rotation").order("list_position"),
    // every one not sent yet, a due one the sender has not claimed included (review 2026-10-15)
    sb.from("social_posts").select(POST_COLUMNS).eq("organization_id", brandId).eq("list_id", listId).in("state", ["scheduled", "queued"])
      .order("scheduled_at").limit(50),
  ]);
  if (items.error) fail(items.error, "list items");
  if (upcoming.error) fail(upcoming.error, "list posts");
  return { items: (items.data ?? []) as unknown as PostRow[], upcoming: (upcoming.data ?? []) as unknown as PostRow[] };
}

/** Where a new item goes: after the last one. */
export async function nextPosition(brandId: string, listId: string): Promise<number> {
  const { data, error } = await db().from("social_posts").select("list_position").eq("organization_id", brandId).eq("list_id", listId)
    .eq("state", "rotation").order("list_position", { ascending: false }).limit(1);
  if (error) fail(error, "list items");
  return data?.length ? (data[0].list_position as number) + 1 : 0;
}

export async function reorderList(brandId: string, listId: string, postIds: string[], actor: string): Promise<void> {
  const { error } = await db().rpc("social_reorder_list", { p_org: brandId, p_list: listId, p_post_ids: postIds, p_actor: actor });
  if (error) fail(error, "reorder list");
}

/** 409 while it holds items; withdraws its unsent materialised posts (0101 social_delete_list). */
export async function deleteList(brandId: string, listId: string, actor: string): Promise<void> {
  const { error } = await db().rpc("social_delete_list", { p_org: brandId, p_list: listId, p_actor: actor });
  if (error) fail(error, "delete list");
}
