import { NextResponse } from "next/server";
import { requestActor } from "@/lib/entitlements/subject";
import { codexAllowed, subWorkerStatus } from "@/lib/tarot/codex-bridge";

// What a subscription lane's worker can do right now (tools, online, spent-allowance blocks). Drives
// components/tools/TextChainButtons.tsx. Owner only (I1): the subscriptions are hers, so nobody else even sees the state.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!codexAllowed(requestActor(req))) return NextResponse.json({ ok: false, error: "sub_operator_only" }, { status: 403 });
  const lane = new URL(req.url).searchParams.get("lane") === "schedule" ? "schedule" : "owner";
  const { tools, online, quotaBlockedUntil } = subWorkerStatus()[lane];
  return NextResponse.json({ ok: true, lane, tools, online, quotaBlockedUntil }, { headers: { "Cache-Control": "no-store" } });
}
