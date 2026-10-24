// Server read of a site's brand voice (wp_sites.content_defaults; shape and renderer in brand-voice.ts).
// A DB error throws: "no brand" must never stand in for "could not read".
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { canAccessOrg } from "@/lib/tenant-guard";
import { renderSiteVoice, type SiteContentDefaults } from "./brand-voice";

export interface SiteBrand {
  siteId: string;
  organizationId: string | null;
  name: string;
  defaults: SiteContentDefaults;
}

/** The active site's stored defaults and owning organization; the caller decides access. */
export async function loadSiteBrand(sb: SupabaseClient, siteId: string): Promise<SiteBrand | null> {
  const { data, error } = await sb
    .from("wp_sites")
    .select("id, name, organization_id, content_defaults")
    .eq("id", siteId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(`brand_voice:load:${error.message}`);
  if (!data) return null;
  const row = data as { id: string; name: string; organization_id: string | null; content_defaults: SiteContentDefaults | null };
  return { siteId: row.id, organizationId: row.organization_id, name: row.name, defaults: row.content_defaults ?? {} };
}

/**
 * A route's siteId -> that site's rendered voice for the prompt. "" = no siteId (the prompt stays as before);
 * null = no such active site or not the caller's (answer 404 either way, so ids are not probed). Throws on a DB error.
 */
export async function siteVoiceFor(req: Request, siteId: string): Promise<string | null> {
  if (!siteId) return "";
  const sb = getSupabaseWriteClient();
  if (!sb) throw new Error("brand_voice:no_supabase_client");
  const site = await loadSiteBrand(sb, siteId);
  if (!site || !canAccessOrg(req, site.organizationId)) return null;
  return renderSiteVoice(site.defaults);
}
