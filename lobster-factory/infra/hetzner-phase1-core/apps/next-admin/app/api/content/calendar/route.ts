import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { getWpSites } from "@/lib/content/wp-sites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface CalendarPost {
  siteId: string;
  siteName: string;
  siteColor: string;
  siteUrl: string;
  id: number;
  title: string;
  status: "draft" | "future" | "publish";
  date: string;     // ISO string
  editUrl: string;
  viewUrl?: string;
}

async function fetchSitePosts(
  siteId: string,
  siteName: string,
  siteColor: string,
  siteUrl: string,
  token: string,
  statuses: string[],
  after?: string,
): Promise<CalendarPost[]> {
  const params = new URLSearchParams({
    per_page: "50",
    orderby: "date",
    order: "asc",
    status: statuses.join(","),
    _fields: "id,title,status,date,link",
  });
  if (after) params.set("after", after);

  try {
    const res = await fetch(`${siteUrl}/wp-json/wp/v2/posts?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const posts = await res.json() as Array<{
      id: number;
      title: { rendered: string };
      status: string;
      date: string;
      link: string;
    }>;

    return posts.map(p => ({
      siteId,
      siteName,
      siteColor,
      siteUrl,
      id: p.id,
      title: p.title.rendered.replace(/&amp;/g, "&").replace(/&#[0-9]+;/g, "").slice(0, 120),
      status: (["draft", "future", "publish"].includes(p.status) ? p.status : "draft") as CalendarPost["status"],
      date: p.date,
      editUrl: `${siteUrl}/wp-admin/post.php?post=${p.id}&action=edit`,
      viewUrl: p.link || undefined,
    }));
  } catch { return []; }
}

export async function GET(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const { sites, tokens } = await getWpSites();
  if (sites.length === 0) {
    return NextResponse.json({ ok: false, error: "No WordPress sites configured" }, { status: 503 });
  }

  // Default: 60 days back to 30 days forward
  const url = new URL(req.url);
  const now = new Date();
  const after = url.searchParams.get("after")
    ?? new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();

  const allPosts = await Promise.all(
    sites.map(site =>
      fetchSitePosts(
        site.id, site.name, site.color, site.url,
        tokens[site.id] ?? "",
        ["draft", "future", "publish"],
        after,
      )
    )
  );

  const posts = allPosts
    .flat()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return NextResponse.json({ ok: true, posts, sites });
}
