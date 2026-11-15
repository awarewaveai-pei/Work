import { NextResponse } from "next/server";
import { requestActor } from "@/lib/entitlements/subject";
import { codexAllowed, workerOnline } from "@/lib/tarot/codex-bridge";

// Is the owner's laptop worker (scripts/codex-image-worker.mjs) asking for work? Drives the sidebar / AI Costs
// "啟動筆電" button (app/CodexLaptopButton.tsx). Owner only, like Codex 免費生圖 itself.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!codexAllowed(requestActor(req))) return NextResponse.json({ ok: false, error: "codex_operator_only" }, { status: 403 });
  return NextResponse.json({ ok: true, online: workerOnline() }, { headers: { "Cache-Control": "no-store" } });
}
