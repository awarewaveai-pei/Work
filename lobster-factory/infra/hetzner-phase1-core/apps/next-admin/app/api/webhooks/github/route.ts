import { NextResponse } from "next/server";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { appendAudit } from "@/lib/repair-center/audit";
import type { RepairRun } from "@/lib/repair-center/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function verifyGitHubSignature(req: Request, body: string): Promise<boolean> {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return false;

  const sigHeader = req.headers.get("x-hub-signature-256");
  if (!sigHeader || !sigHeader.startsWith("sha256=")) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const computed = "sha256=" + Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");

  // Constant-time comparison
  if (computed.length !== sigHeader.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ sigHeader.charCodeAt(i);
  return diff === 0;
}

export async function POST(req: Request) {
  const body = await req.text();

  const valid = await verifyGitHubSignature(req, body);
  if (!valid) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const event = req.headers.get("x-github-event");
  if (event !== "pull_request") {
    return NextResponse.json({ ignored: true, event });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const p = payload as Record<string, unknown>;
  if (p.action !== "closed" || !(p.pull_request as Record<string, unknown>)?.merged) {
    return NextResponse.json({ ignored: true, action: p.action });
  }

  const prNumber = (p.pull_request as Record<string, unknown>)?.number as number | undefined;
  if (!prNumber) {
    return new NextResponse("missing pr number", { status: 400 });
  }

  const supabase = getSupabaseWriteClient();
  if (!supabase) {
    return new NextResponse("db unavailable", { status: 503 });
  }

  const { data: run, error: fetchErr } = await supabase
    .from("repair_runs")
    .select("*")
    .eq("github_pr_number", prNumber)
    .eq("state", "pr_ready")
    .maybeSingle();

  if (fetchErr) {
    return new NextResponse("db read failed", { status: 500 });
  }

  if (!run) {
    // No matching repair_run — legitimate (PR unrelated to repair center)
    return NextResponse.json({ matched: false, pr_number: prNumber });
  }

  const r = run as RepairRun;
  const newAudit = appendAudit(r.audit_log, {
    actor: "github-webhook",
    action: "pr_merged",
    detail: `PR #${prNumber} merged — transitioning pr_ready → deploy_pending`,
  });

  const { error: updateErr } = await supabase
    .from("repair_runs")
    .update({
      state: "deploy_pending",
      audit_log: newAudit,
      updated_at: new Date().toISOString(),
    })
    .eq("id", r.id)
    .eq("state", "pr_ready");

  if (updateErr) {
    return new NextResponse("db write failed", { status: 500 });
  }

  return NextResponse.json({ matched: true, repair_run_id: r.id, pr_number: prNumber, new_state: "deploy_pending" });
}
