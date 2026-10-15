import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { listAccessibleWpSites } from "@/lib/content/wp-sites";
import { fetchSitePosts } from "@/lib/content/wp-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  // 多站畫面：不是「取一個站」而是「列出呼叫者有權看的站」。staff 取得全部（與舊行為相同），
  // client 只會看到自己的 —— 否則日曆會直接把別的客戶的文章標題攛在畫面上。
  const { sites, tokens, usernames } = await listAccessibleWpSites(req);
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
        site,
        tokens[site.id] ?? "",
        usernames[site.id] ?? "",
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
