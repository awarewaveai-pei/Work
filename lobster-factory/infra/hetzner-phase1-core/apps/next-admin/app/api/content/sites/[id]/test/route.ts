import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

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

  const { data, error } = await supabase
    .from("wp_sites")
    .select("url, token")
    .eq("id", id)
    .single();

  if (error || !data)
    return NextResponse.json({ ok: false, message: "找不到此網站" }, { status: 404 });

  const { url, token } = data as { url: string; token: string };

  try {
    const testUrl = `${url.replace(/\/$/, "")}/wp-json/wp/v2/users/me`;
    const res = await fetch(testUrl, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      const user = await res.json() as { name?: string; roles?: string[] };
      return NextResponse.json({
        ok: true,
        message: `連線成功：${user.name ?? "未知用戶"}（${user.roles?.join(", ") ?? ""}）`,
      });
    }

    if (res.status === 401) return NextResponse.json({ ok: false, message: "JWT Token 無效或已過期" });
    if (res.status === 403) return NextResponse.json({ ok: false, message: "Token 權限不足（需要 Author 以上）" });

    return NextResponse.json({ ok: false, message: `HTTP ${res.status}，請確認網址與 Token` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, message: `連線失敗：${msg.slice(0, 100)}` });
  }
}
