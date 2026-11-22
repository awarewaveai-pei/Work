import { NextResponse } from "next/server";
import { requestActor } from "@/lib/entitlements/subject";
import { cancelCodexWork, codexAllowed, takeCodexResult } from "@/lib/tarot/codex-bridge";
import { friendlyImageError } from "@/lib/studio/image-errors";

// GET /api/tools/codex-laptop/jobs/<id>: the browser's poll for a Codex picture a generate route answered 202 for
// (lib/tarot/codex-bridge.ts deferCodexWork; client public/editor-shared/codex-wait.js).
//   202 {pending}           still drawing
//   <route's own status/body>  done: exactly what that route would have answered in-request (taken = dropped)
//   200 {ok:false, codex_job_gone}  unknown, expired, taken, or another person's job (never says which)
// DELETE /api/tools/codex-laptop/jobs/<id>: 停止 -- the route's detached work is aborted and its result dropped.
//   200 {ok:true} cancelled; 404 {ok:false, codex_job_gone} unknown, done and taken, or another person's job
// Owner only, like Codex 免費生圖 itself.
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = requestActor(req);
  if (!codexAllowed(actor)) return NextResponse.json({ ok: false, error: "codex_operator_only" }, { status: 403 });
  const r = takeCodexResult((await params).id, actor);
  if (r.state === "running") return NextResponse.json({ pending: true }, { status: 202, headers: NO_STORE });
  if (r.state === "unknown") {
    return NextResponse.json({ ok: false, error: friendlyImageError("codex_job_gone"), code: "codex_job_gone" }, { headers: NO_STORE });
  }
  return NextResponse.json(r.body, { status: r.status, headers: NO_STORE });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = requestActor(req);
  if (!codexAllowed(actor)) return NextResponse.json({ ok: false, error: "codex_operator_only" }, { status: 403 });
  if (!cancelCodexWork((await params).id, actor)) return NextResponse.json({ ok: false, code: "codex_job_gone" }, { status: 404, headers: NO_STORE });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
