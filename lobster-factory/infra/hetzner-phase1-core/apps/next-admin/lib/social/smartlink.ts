// The smart link page (SOCIAL_MANAGER_PLAN.md C26): one public page per brand at social.aware-wave.com/smartlink/<slug>.
// Tables and writes: migration 0105 §7 (social_smart_links / _items / _clicks, social_save_smart_link, social_smart_link_click);
// the slug rule and the reserved words live in 0105's check constraint, mirrored here only to say what is wrong in words.
// The editor (/api/social/smartlink) and the public page + its click route (app/(public)/smartlink) read through here.
// The public side returns only what the brand typed onto the page: no ids of the brand, no urls before the click.

import { createHash, randomBytes } from "node:crypto";
import { SLUG_RE, slugProblem } from "./smartlink-rules";
import { SocialStoreError, db, fail } from "./store";

export { SLUG_RE, slugProblem, urlProblem } from "./smartlink-rules";

export const MAX_ITEMS = 50;
/** the editor's click counts cover the brand's last 28 calendar days, today included */
export const CLICK_DAYS = 28;

export type Colour = "a" | "b" | "c" | "d" | "e";
export const COLOURS: readonly Colour[] = ["a", "b", "c", "d", "e"];
export interface SmartLink { slug: string; title: string; bio: string; colour: Colour; published: boolean }
export interface SmartLinkItem { id: string; title: string; url: string; active: boolean; clicks: number }
export interface ItemInput { id?: string; title: string; url: string; active: boolean }

/** The brand's calendar day `back` days before today (YYYY-MM-DD), the way 0105 counts a click's day. */
export function brandDay(tz: string, back = 0, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(now.getTime() - back * 86_400_000));
}

/** The editor's view: the brand's page (null = none yet; suggested = the brand's own slug when it is a valid one). */
export async function getSmartLink(brandId: string): Promise<{ link: SmartLink | null; items: SmartLinkItem[]; suggested: string }> {
  const sb = db();
  const [org, link, items] = await Promise.all([
    sb.from("organizations").select("slug, default_timezone").eq("id", brandId).maybeSingle(),
    sb.from("social_smart_links").select("slug, title, bio, colour, published").eq("organization_id", brandId).maybeSingle(),
    sb.from("social_smart_link_items").select("id, title, url, active").eq("organization_id", brandId).order("position"),
  ]);
  if (org.error) fail(org.error, "smart link brand");
  if (link.error) fail(link.error, "smart link");
  if (items.error) fail(items.error, "smart link items");
  const rows = (items.data ?? []) as Omit<SmartLinkItem, "clicks">[];
  const clicks = new Map<string, number>();
  if (rows.length) {
    const since = brandDay(org.data?.default_timezone ?? "UTC", CLICK_DAYS - 1);
    const { data, error } = await sb.from("social_smart_link_clicks").select("item_id, n").in("item_id", rows.map((r) => r.id)).gte("day", since);
    if (error) fail(error, "smart link clicks");
    for (const c of (data ?? []) as Array<{ item_id: string; n: number }>) clicks.set(c.item_id, (clicks.get(c.item_id) ?? 0) + c.n);
  }
  const own = String(org.data?.slug ?? "").toLowerCase();
  return {
    link: (link.data as SmartLink | null) ?? null,
    items: rows.map((r) => ({ ...r, clicks: clicks.get(r.id) ?? 0 })),
    suggested: slugProblem(own) ? "" : own,
  };
}

/** Saves the page and its items in page order (an item left out is removed with its clicks; one without id is new).
 *  A slug another brand has is a 409 with words the editor shows. */
export async function saveSmartLink(brandId: string, link: SmartLink, items: ItemInput[], actor: string): Promise<string> {
  const { data, error } = await db().rpc("social_save_smart_link", {
    p_org: brandId, p_link: link, p_items: items.map((i) => (i.id ? i : { title: i.title, url: i.url, active: i.active })), p_actor: actor,
  });
  if (error?.code === "23505") throw new SocialStoreError(409, "這個名字已經有其他品牌在用，請換一個。");
  if (error) fail(error, "save smart link");
  return data as string;
}

// ---- the public side -------------------------------------------------------------------------------------------

export interface PublicPage { title: string; bio: string; colour: Colour; items: Array<{ id: string; title: string }> }

/** A published page: its title, bio, colour and the links that are on; null = no such page or not published (the
 *  visitor sees the same 「這頁還沒開放」 either way, so a closed page does not say it exists). */
export async function publicPage(slug: string): Promise<PublicPage | null> {
  if (slugProblem(slug)) return null;
  const sb = db();
  const { data: link, error } = await sb.from("social_smart_links").select("organization_id, title, bio, colour, published").eq("slug", slug).maybeSingle();
  if (error) fail(error, "public smart link");
  if (!link || !link.published) return null;
  const { data: items, error: e2 } = await sb.from("social_smart_link_items").select("id, title")
    .eq("organization_id", link.organization_id).eq("active", true).order("position");
  if (e2) fail(e2, "public smart link items");
  return { title: link.title, bio: link.bio, colour: link.colour as Colour, items: (items ?? []) as PublicPage["items"] };
}

/** Counts one click (0105: on the brand's own day, one row per item and day) and returns where to send the visitor;
 *  null = no such published page, or the link is off or not on it. */
export async function countClick(slug: string, itemId: string): Promise<string | null> {
  const { data, error } = await db().rpc("social_smart_link_click", { p_slug: slug, p_item: itemId });
  if (error) fail(error, "smart link click");
  return (data as string | null) ?? null;
}

/** Where to send the visitor without counting (a repeat click, a link preview robot, a HEAD). */
export async function itemUrl(slug: string, itemId: string): Promise<string | null> {
  const sb = db();
  const { data: link, error } = await sb.from("social_smart_links").select("organization_id, published").eq("slug", slug).maybeSingle();
  if (error) fail(error, "smart link");
  if (!link?.published) return null;
  const { data: item, error: e2 } = await sb.from("social_smart_link_items").select("url")
    .eq("id", itemId).eq("organization_id", link.organization_id).eq("active", true).maybeSingle();
  if (e2) fail(e2, "smart link item");
  return (item?.url as string | undefined) ?? null;
}

// One visitor counts once per link per day, so a reload loop or a script cannot run a count up (nginx limit_req on the
// door caps the request rate on top). The memory is this process's: a restart forgets, which can count a visitor twice
// that day, never more. Visitors are keyed by a salted hash of their address; the raw address is never kept.
const ROBOT_RE = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|skype|curl|wget|python|headless/i;
const SALT = randomBytes(16).toString("hex");

export class ClickGate {
  private seen = new Map<string, string>();   // visitor+item -> day counted
  constructor(private readonly cap = 50_000) {}

  /** true = count this click. `day` is the day it would count on; a robot or an empty user agent never counts. */
  shouldCount(ip: string, userAgent: string, itemId: string, day: string): boolean {
    if (!userAgent || ROBOT_RE.test(userAgent)) return false;
    const key = createHash("sha256").update(`${SALT}:${ip}:${itemId}`).digest("base64url").slice(0, 22);
    if (this.seen.get(key) === day) return false;
    if (this.seen.size >= this.cap) this.seen.clear();   // a flood of distinct addresses: forget, do not grow
    this.seen.set(key, day);
    return true;
  }
}

/** The visitor's address as the door's nginx sets it (X-Real-IP = $remote_addr after the Cloudflare real-ip module). */
export function visitorAddress(headers: Headers): string {
  return headers.get("x-real-ip")?.trim() || headers.get("cf-connecting-ip")?.trim()
    || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
