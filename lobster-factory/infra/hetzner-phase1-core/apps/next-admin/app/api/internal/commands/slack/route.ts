import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { startRepairFromIncident } from "@/lib/repair-center/service";
import { blockedChangeMessage } from "@/lib/system-modes/blocked-change";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifySlackSignature(request: Request, rawBody: string): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET?.trim();
  if (!secret) return false;

  const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
  const signature = request.headers.get("x-slack-signature") ?? "";
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;

  const ageSeconds = Math.abs(Date.now() / 1000 - ts);
  if (ageSeconds > 60 * 5) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${crypto.createHmac("sha256", secret).update(base).digest("hex")}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifySlackSignature(request, rawBody)) {
    return new NextResponse("invalid slack signature", { status: 401 });
  }

  const form = new URLSearchParams(rawBody);
  const payloadRaw = form.get("payload");
  if (!payloadRaw) return new NextResponse("missing payload", { status: 400 });

  let payload: any;
  try {
    payload = JSON.parse(payloadRaw);
  } catch {
    return new NextResponse("invalid payload", { status: 400 });
  }

  const action = payload?.actions?.[0];
  const actionId = String(action?.action_id ?? "");
  const value = String(action?.value ?? "");
  const user = String(payload?.user?.username ?? payload?.user?.name ?? payload?.user?.id ?? "slack");

  if (actionId === "acknowledge_only") {
    return NextResponse.json({
      response_type: "ephemeral",
      text: "Acknowledged. No repair run was created.",
    });
  }

  if (actionId !== "approve_repair" || !value) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: "Unsupported repair action.",
    });
  }

  const result = await startRepairFromIncident({
    incidentId: value,
    actor: `slack:${user}`,
    source: "slack",
  });

  if (!result.ok) {
    const errorText =
      result.blockedMode !== undefined
        ? blockedChangeMessage(result.blockedMode)
        : result.error === "backup_failed"
          ? "Pre-repair backup failed. No GitHub issue or PR was created."
          : `Repair start failed: ${result.error ?? "unknown"}`;
    return NextResponse.json({
      response_type: "ephemeral",
      text: errorText,
    });
  }

  const run = result.run;
  return NextResponse.json({
    response_type: "ephemeral",
    text: run?.github_issue_url
      ? `Repair run started. Backup passed and GitHub issue created: ${run.github_issue_url}`
      : `Repair run updated: ${run?.state ?? "unknown"}`,
  });
}
