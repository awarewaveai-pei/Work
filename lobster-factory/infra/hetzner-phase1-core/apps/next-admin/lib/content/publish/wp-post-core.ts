// Changes one existing WordPress post (status, date, title, content): the one core behind PATCH /api/content/wp-post
// (the calendar) and the content pipeline's auto publish (lib/content/topics/make.ts). The site is resolved with the
// caller's identity (resolveWpSite: a customer, or orgIdentity for headless work, reaches only its own sites) and the
// system mode is checked before the write, so both entries pass the same two checks.
import { resolveWpSite } from "@/lib/content/wp-sites";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { checkProductionChangeAllowed } from "@/lib/system-modes/production-change-gate";
import { blockedChangeMessage } from "@/lib/system-modes/blocked-change";

export const WP_POST_STATUSES = ["draft", "publish", "future", "pending"] as const;

/** Only the fields given are changed. */
export interface WpPostPatch {
  status?: (typeof WP_POST_STATUSES)[number];
  date?: string;
  title?: string;
  /** Replaces the whole post_content: only send the full patched HTML (video embedding). */
  content?: string;
}

export type WpPostUpdate =
  | { ok: true; post: { id: number; status: string; date: string; link: string } }
  | { ok: false; status: number; error: string; mode?: undefined }
  /** The system mode blocked the write: the HTTP shell answers with the shared 423 contract (blockedChangeResponse). */
  | { ok: false; mode: string; error: string; status?: undefined };

/** The patch fields of a request body, coerced as the calendar sends them; unknown or empty values are left out. */
export function wpPostPatch(body: Record<string, unknown>): WpPostPatch {
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const status = s(body.status) as WpPostPatch["status"];
  const patch: WpPostPatch = {
    date: s(body.date), title: s(body.title), content: s(body.content),
    status: status && WP_POST_STATUSES.includes(status) ? status : undefined,
  };
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as WpPostPatch;
}

/** @throws OrgAccessError when the identity may not reach the site (the HTTP shell answers 403). */
export async function updateWpPost(identity: Request | { headers: Headers }, siteId: string, postId: number, patch: WpPostPatch): Promise<WpPostUpdate> {
  const wp: Record<string, unknown> = {};
  if (patch.status) wp.status = patch.status;
  if (patch.date) wp.date = patch.date;
  if (patch.title) wp.title = patch.title;
  if (patch.content) wp.content = patch.content;
  if (!Object.keys(wp).length) return { ok: false, status: 400, error: "No fields to update" };

  const site = await resolveWpSite(identity, siteId);
  if (!site || !site.token) return { ok: false, status: 404, error: "Site not found or token missing" };

  const gate = await checkProductionChangeAllowed(getSupabaseWriteClient(), site.site.organizationId);
  if (!gate.allowed) return { ok: false, error: blockedChangeMessage(gate.mode), mode: gate.mode };

  let res: Response;
  try {
    res = await fetch(`${site.site.url}/wp-json/wp/v2/posts/${postId}`, {
      method: "POST",   // WP REST updates with POST (+ the override header some proxies need)
      headers: { "Content-Type": "application/json", Authorization: site.authHeader, "X-HTTP-Method-Override": "PUT" },
      body: JSON.stringify(wp),
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    return { ok: false, status: 502, error: "WordPress connection failed" };
  }
  const json = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, status: res.status, error: typeof json.message === "string" ? json.message.slice(0, 200) : `WP error ${res.status}` };
  }
  return { ok: true, post: { id: json.id as number, status: json.status as string, date: json.date as string, link: json.link as string } };
}

