import { NextResponse } from "next/server";
import { canTriggerAiDiagnose, readOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import type { AiDiagnosis, Incident } from "@/lib/ops-inbox/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const role = readOpsRole(req);
  if (!canTriggerAiDiagnose(role)) return new NextResponse("forbidden", { status: 403 });

  let body: { incident_id?: string; summary?: string; provider?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }
  if (!body.incident_id || !body.summary) return new NextResponse("incident_id + summary required", { status: 400 });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return new NextResponse("db unavailable", { status: 503 });

  const { data } = await supabase.from("ops_incidents").select("*").eq("id", body.incident_id).single();
  if (!data) return new NextResponse("incident not found", { status: 404 });

  const incident = data as Incident;
  const diagnosis: AiDiagnosis = {
    provider: (body.provider as AiDiagnosis["provider"]) ?? "other",
    role: "manual-paste",
    summary: body.summary,
    created_at: new Date().toISOString(),
    created_by: role,
  };

  const aiDiagnoses = [...(incident.ai_diagnoses ?? []), diagnosis];
  const { error } = await supabase.from("ops_incidents").update({ ai_diagnoses: aiDiagnoses }).eq("id", body.incident_id);
  if (error) return new NextResponse("db write failed", { status: 500 });

  return NextResponse.json({ ok: true });
}
