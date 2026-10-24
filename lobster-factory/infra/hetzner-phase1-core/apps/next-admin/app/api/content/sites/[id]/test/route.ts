import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { siteRowGate, wpAuthHeader } from "@/lib/content/wp-sites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/content/sites/[id]/test — server-side WP connection test
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, message: "Supabase not configured" }, { status: 503 });
  const denied = await siteRowGate(req, id);
  if (denied) return denied;

  const { data, error } = await supabase
    .from("wp_sites")
    .select("url, token, username")
    .eq("id", id)
    .single();

  if (error || !data)
    return NextResponse.json({ ok: false, message: "找不到此網站" }, { status: 404 });

  const { url, token, username } = data as { url: string; token: string; username: string };

  try {
    const testUrl = `${url.replace(/\/$/, "")}/wp-json/wp/v2/users/me`;
    const res = await fetch(testUrl, {
      headers: { Authorization: wpAuthHeader(username, token) },
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      const user = await res.json() as { name?: string; roles?: string[] };
      return NextResponse.json({
        ok: true,
        message: `連線成功：${user.name ?? "未知用戶"}（${user.roles?.join(", ") ?? ""}）`,
      });
    }

    if (res.status === 401) return NextResponse.json({ ok: false, message: "Application Password 無效（請確認 WP 用戶名稱與密碼正確）" });
    if (res.status === 403) return NextResponse.json({ ok: false, message: "權限不足（需要 Author 以上）" });

    return NextResponse.json({ ok: false, message: `HTTP ${res.status}，請確認網址與 Token` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, message: `連線失敗：${msg.slice(0, 100)}` });
  }
}
