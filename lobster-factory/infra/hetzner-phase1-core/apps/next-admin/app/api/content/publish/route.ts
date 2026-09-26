import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import {
  publishToWordPress,
  type WordPressPublishInput,
  type WordPressPublishFailure,
} from "@/lib/content/publish/wordpress-core";
import { blockedChangeResponse } from "@/lib/system-modes/blocked-change";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WordPress 發佈 HTTP 入口。核心邏輯（site 解析 + Bridge↔REST 雙路徑 + markdown→HTML/blocks）抽到
 * `lib/content/publish/wordpress-core.ts`，同一段邏輯也被 `publish/wordpress` 積木 in-process 呼叫
 * （一段邏輯、兩個入口、零重複）。本檔只負責 HTTP 殼：角色閘 + JSON 解析 + 結果還原成 NextResponse。
 * 行為與抽取前位元相同（含成功 JSON 形狀、失敗的 text↔json 序列化差異）。
 */
export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) {
    return new NextResponse("forbidden", { status: 403 });
  }

  let body: WordPressPublishInput;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const result = await publishToWordPress(body, req);
  if (result.ok) {
    // 成功一律 JSON；result 只含該路徑實際產生的鍵（post_id/edit_url + featured_set 或 view_url），
    // 與舊版兩種成功回應位元相同。
    return NextResponse.json(result);
  }
  // 失敗：保留原 route 的 text vs json 序列化（wire 欄位，見 wordpress-core 說明）。text 回應會讓
  // 單篇 UI 的 res.json() throw → 顯示「網路錯誤」，這是現行行為，刻意不改。
  const fail = result as WordPressPublishFailure;
  if (fail.mode !== undefined) return blockedChangeResponse(fail.mode); // gate block: the shared 423 contract
  return fail.wire === "text"
    ? new NextResponse(fail.error, { status: fail.status })
    : NextResponse.json({ ok: false, error: fail.error }, { status: fail.status });
}
