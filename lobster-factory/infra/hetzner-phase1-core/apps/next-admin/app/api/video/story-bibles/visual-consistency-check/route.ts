/**
 * POST /api/video/story-bibles/visual-consistency-check
 *
 * 用 Claude vision 比對「角色定裝照」vs「該角色場景已生成的圖」，回每一對的一致性判斷。
 * 純比對，不擋渲染——結果顯示在 VideoStudio 草稿審核面板，操作者自行判斷是否重生場景圖。
 *
 * Body: { pairs: { sceneIndex: number; referenceImageUrl: string; generatedImageUrl: string }[] }
 * Success: { ok: true, results: { sceneIndex: number; consistent: boolean | null; note: string }[] }
 * Failure: { ok: false, error }
 */

import { NextRequest, NextResponse } from "next/server";
import { loadAnthropic, type Anthropic } from "@/lib/ai/gateway";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { isDesignsAsset } from "@/lib/storage/r2";
import { CLAUDE_DEFAULT_MODEL, claudeFallback, claudeIncomplete, claudeParams, claudeText } from "@/lib/ai/gateway";

const CLAUDE_MODEL = CLAUDE_DEFAULT_MODEL;
const MAX_PAIRS = 12; // 成本閘：草稿場景數通常 3-12，超過只比對前 12 對，其餘視為未檢查
const TIMEOUT_MS = 45_000; // 多張圖 vision 比對可能較慢；逾時回明確錯誤，不讓前端 loading 卡死

interface Pair { sceneIndex: number; referenceImageUrl: string; generatedImageUrl: string }
interface Body { pairs?: Pair[] }

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be valid JSON" }, { status: 400 });
  }

  // 兩個 URL 都送進 Claude vision 當 image source（伺服器端 fetch）——不是我們 R2 designs bucket
  // 的 URL 一律丟掉，防止任何呼叫者把這條路當成「用 AwareWave 的 Anthropic 帳號去抓/描述任意網址」
  // 的 confused-deputy 通道（成本濫用 + 無歸屬）。
  const pairs = Array.isArray(body.pairs)
    ? body.pairs.filter((p) => p && typeof p.sceneIndex === "number" && isDesignsAsset(p.referenceImageUrl) && isDesignsAsset(p.generatedImageUrl)).slice(0, MAX_PAIRS)
    : [];
  if (pairs.length === 0) return NextResponse.json({ ok: false, error: "pairs 為必填非空陣列（且每個 URL 須為本站 R2 designs 資產）" }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });

  const Anthropic = await loadAnthropic();
  const client = new Anthropic({ apiKey });
  const content: Anthropic.ContentBlockParam[] = [
    { type: "text", text: "你是短劇角色連續性審核員。以下每一對圖片：第一張是角色定裝照（REFERENCE），第二張是某場景實際生成的畫面（SCENE）。判斷 SCENE 裡的人物是否看起來是同一個角色（髮型/髮色、臉型、大致年齡、服裝風格是否一致；不要求像素級相同，允許角度/表情/光線差異）。" },
  ];
  for (const p of pairs) {
    content.push({ type: "text", text: `場景 ${p.sceneIndex}：` });
    content.push({ type: "image", source: { type: "url", url: p.referenceImageUrl } });
    content.push({ type: "image", source: { type: "url", url: p.generatedImageUrl } });
  }
  content.push({
    type: "text",
    text: `純 JSON，不要其他文字：{"results":[{"sceneIndex":0,"consistent":true或false,"note":"30字內說明"}]}\n每個場景各一筆，順序不拘但 sceneIndex 要對應上面列出的場景編號。`,
  });

  try {
    const msg = await client.beta.messages.create(
      { ...claudeParams(CLAUDE_MODEL, 1024, "low"), ...claudeFallback(CLAUDE_MODEL), messages: [{ role: "user", content }] },
      { timeout: TIMEOUT_MS },
    );
    const incomplete = claudeIncomplete(msg);
    if (incomplete) return NextResponse.json({ ok: false, error: `Claude 未完成回答（${incomplete}）` }, { status: 502 });
    const text = claudeText(msg);
    if (!text) return NextResponse.json({ ok: false, error: "Claude 回應無文字內容" }, { status: 502 });
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ ok: false, error: "無法解析 Claude 回應為 JSON" }, { status: 502 });
    const parsed = JSON.parse(match[0]) as { results?: { sceneIndex?: number; consistent?: boolean; note?: string }[] };
    const results = Array.isArray(parsed.results)
      ? parsed.results.map((r) => ({
          sceneIndex: Number.isFinite(Number(r?.sceneIndex)) ? Number(r.sceneIndex) : -1,
          consistent: typeof r?.consistent === "boolean" ? r.consistent : null,
          note: String(r?.note ?? ""),
        }))
      : [];
    return NextResponse.json({ ok: true, results });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "vision 比對失敗" }, { status: 502 });
  }
}
