import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { runSeoCheck, type SeoCheckFailure, type SeoCheckSuccess } from "@/lib/content/quality/seo-check-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SEO 檢測 HTTP 入口（P3 積木化）。檢測核心（body coercion + 兩個必填閘 + RankMath 22 點）抽到
 * `lib/content/quality/seo-check-core.ts`，同一段邏輯也被 `quality/check` 積木 headless 呼叫
 * （一段邏輯、兩個入口、零重複）。本檔只負責 HTTP 殼：角色閘 + JSON 解析 + 結果還原成 NextResponse。
 * 行為與抽取前位元相同（失敗回 text、成功回 JSON report、400/403 狀態碼一致）。
 */
export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) {
    return new NextResponse("forbidden", { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const result = runSeoCheck(body);
  // tsconfig strict:false → `!result.ok` 不 narrow discriminated union；cast（idiom 同 publish/route.ts、
  // newsletter/route.ts:213）。失敗回 text、成功回 JSON——與抽取前位元相同。
  if (!result.ok) {
    const fail = result as SeoCheckFailure;
    return new NextResponse(fail.error, { status: fail.status });
  }
  const ok = result as SeoCheckSuccess;
  return NextResponse.json(ok.report);
}
