import { NextResponse } from "next/server";
import { triggerAutoClassify } from "@/lib/ops-inbox/ai/triggerAutoClassify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { incident_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }
  if (!body.incident_id) return new NextResponse("incident_id required", { status: 400 });

  const out = await triggerAutoClassify(body.incident_id);
  if (out.skipped) return NextResponse.json({ ok: true, skipped: out.skipped });
  return NextResponse.json({ ok: true, summary: out.summary });
}
