// WordPress posts of one site for a calendar (content calendar and the social calendar, SOCIAL_MANAGER_PLAN.md C4).
// Read-only REST call with the site's application password; a site that does not answer gives no posts, not an error.
import { wpAuthHeader } from "@/lib/content/wp-sites";

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

export async function fetchSitePosts(
  site: { id: string; name: string; color: string; url: string },
  token: string,
  username: string,
  statuses: string[],
  after?: string,
  before?: string,
): Promise<CalendarPost[]> {
  const params = new URLSearchParams({
    per_page: "50",
    orderby: "date",
    order: "asc",
    status: statuses.join(","),
    _fields: "id,title,status,date,link",
  });
  if (after) params.set("after", after);
  if (before) params.set("before", before);

  try {
    const res = await fetch(`${site.url}/wp-json/wp/v2/posts?${params}`, {
      headers: { Authorization: wpAuthHeader(username, token) },
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
      siteId: site.id,
      siteName: site.name,
      siteColor: site.color,
      siteUrl: site.url,
      id: p.id,
      title: p.title.rendered.replace(/&amp;/g, "&").replace(/&#[0-9]+;/g, "").slice(0, 120),
      status: (["draft", "future", "publish"].includes(p.status) ? p.status : "draft") as CalendarPost["status"],
      date: p.date,
      editUrl: `${site.url}/wp-admin/post.php?post=${p.id}&action=edit`,
      viewUrl: p.link || undefined,
    }));
  } catch { return []; }
}
