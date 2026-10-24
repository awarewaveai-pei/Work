import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { getWpSites } from "@/lib/content/wp-sites";
import { canAccessOrg } from "@/lib/tenant-guard";
import type { SiteContentDefaults } from "@/lib/content/brand-voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export interface ManagedSite {
  id: string;
  name: string;
  url: string;
  color: string;
  active: boolean;
  tokenSet: boolean;
  usernameSet: boolean;
  note: string | null;
  source: "db" | "env";
  createdAt?: string;
  contentDefaults?: SiteContentDefaults;
  org_slug?: string | null;
  /** The owning organization (0061); the social manager's brand id. Env sites have none. */
  organization_id?: string | null;
}

// GET /api/content/sites — list sites (no tokens in response)
//
// **預設只回 active 的站**（2026-08-26）。在此之前這條 GET 回傳全部站並把 `active` 當成一個
// 欄位交出去，由每個消費端自己決定要不要濾 —— 而那條規則只要放在消費端就會分岔，實際上也
// 分岔了：`ScriptForge` 濾了、`ContentStudio` 沒濾，所以三個已停用的死站仍出現在主要內容
// 工具的站別下拉選單裡。這和 `resolveWpSite` 收斂 8 個取站點是同一個 class（同一條規則抄在
// N 個地方）。
//
// 修法是把預設翻成 fail-safe：不帶參數 = 只看得到 active，唯一真的需要看見停用站的畫面
// （`SiteManager`，站別管理頁本身）以 `?includeInactive=1` **明示** opt-in。未來新增的消費端
// 忘記處理 active 時拿到的是安全的那一邊，而不是危險的那一邊。
export async function GET(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const includeInactive = new URL(req.url).searchParams.get("includeInactive") === "1";

  const supabase = getSupabaseWriteClient();
  if (supabase) {
    let sitesQuery = supabase
      .from("wp_sites")
      .select("id, name, url, color, active, note, created_at, token, username, content_defaults, organization_id");
    if (!includeInactive) sitesQuery = sitesQuery.eq("active", true);

    const [sitesResult, orgsResult] = await Promise.all([
      sitesQuery.order("created_at"),
      supabase
        .from("organizations")
        .select("id, slug")
        .order("created_at"),
    ]);

    if (!sitesResult.error && sitesResult.data) {
      // org_slug 直接來自 wp_sites.organization_id（migration 0061），**不再用 hostname 猜**。
      //
      // 舊做法是「把 organizations.metadata.client_config.site_url 的 hostname 對上 wp_sites.url
      // 的 hostname」。兩個問題：① 同一個 hostname 下的多個站會全部對到同一個 org —— 實測 EU prod
      // 的 3 個 staging 站都是 aware-wave.com/staging/<slug>，hostname 完全相同，first-writer-wins
      // 直接把它們標成錯的租戶 ② 這是「把身分編碼進字串再反解」的同一類問題，和影片 out_name 那條
      // 是同一個 class。既然 wp_sites 現在有權威的 organization_id，就沒有理由再猜。
      const orgSlugById = new Map<string, string>();
      for (const org of (orgsResult.data ?? []) as Array<{ id: string; slug: string }>) {
        orgSlugById.set(org.id, org.slug);
      }

      const sites: ManagedSite[] = (sitesResult.data as Array<{
        id: string; name: string; url: string; color: string;
        active: boolean; note: string | null; created_at: string; token: string; username: string;
        content_defaults: SiteContentDefaults | null; organization_id: string | null;
      }>)
        // 租戶過濾：staff 看全部（canAccessOrg 恆真），client 只看自己的站。列表若不過濾，
        // 客戶會直接在下拉選單裡看到其他客戶的網域名稱。
        .filter(r => canAccessOrg(req, r.organization_id))
        .map(r => {
        const org_slug: string | null = r.organization_id ? (orgSlugById.get(r.organization_id) ?? null) : null;
        return {
          id: r.id,
          name: r.name,
          url: r.url,
          color: r.color,
          active: r.active,
          tokenSet: Boolean(r.token),
          usernameSet: Boolean(r.username),
          note: r.note,
          source: "db" as const,
          createdAt: r.created_at,
          contentDefaults: r.content_defaults ?? {},
          org_slug,
          organization_id: r.organization_id,
        };
      });
      return NextResponse.json({ ok: true, sites });
    }
  }

  // Fallback: env vars (read-only, shown as "env" source)
  const { sites: envSites } = await getWpSites();
  const sites: ManagedSite[] = envSites.map(s => ({
    ...s,
    active: true,
    tokenSet: true,
    usernameSet: Boolean(s.username),
    note: null,
    source: "env" as const,
  }));
  return NextResponse.json({ ok: true, sites });
}

// POST /api/content/sites — add new site
export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }

  const name     = typeof body.name     === "string" ? body.name.trim()  : "";
  const url      = typeof body.url      === "string" ? body.url.trim().replace(/\/$/, "") : "";
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const token    = typeof body.token    === "string" ? body.token.trim() : "";
  const color    = typeof body.color    === "string" ? body.color.trim() : "#5855d0";
  const note     = typeof body.note     === "string" ? body.note.trim() || null : null;

  if (!name)     return NextResponse.json({ ok: false, error: "name required" }, { status: 400 });
  if (!url)      return NextResponse.json({ ok: false, error: "url required" }, { status: 400 });
  if (!username) return NextResponse.json({ ok: false, error: "username required" }, { status: 400 });
  if (!token)    return NextResponse.json({ ok: false, error: "Application Password required" }, { status: 400 });
  if (!/^https?:\/\//i.test(url))
    return NextResponse.json({ ok: false, error: "url 必須以 http:// 或 https:// 開頭" }, { status: 400 });

  const { data, error } = await supabase
    .from("wp_sites")
    .insert({ name, url, username, token, color, note, active: true })
    .select("id, name, url, color, active, note, created_at")
    .single();

  if (error) {
    const msg = error.code === "23505" ? "此網址已存在" : error.message;
    return NextResponse.json({ ok: false, error: msg }, { status: 409 });
  }

  const row = data as { id: string; name: string; url: string; color: string; active: boolean; note: string | null; created_at: string };
  const site: ManagedSite = {
    id: row.id,
    name: row.name,
    url: row.url,
    color: row.color,
    active: row.active,
    tokenSet: true,
    usernameSet: true,
    note: row.note,
    source: "db",
    createdAt: row.created_at,
  };
  return NextResponse.json({ ok: true, site }, { status: 201 });
}
