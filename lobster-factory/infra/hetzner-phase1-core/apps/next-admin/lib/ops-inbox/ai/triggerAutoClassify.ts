import { getSupabaseWriteClient } from "@/lib/supabase-server";
import type { AiDiagnosis, Incident } from "@/lib/ops-inbox/types";
import { summarizeIncidentWithGemini } from "./gemini";
import { checkAndConsumeGeminiQuota } from "./quotaGuard";

export async function triggerAutoClassify(incidentId: string): Promise<{ skipped?: string; summary?: string }> {
  if (process.env.OPS_INBOX_GEMINI_ENABLED !== "true") return { skipped: "disabled" };
  const supabase = getSupabaseWriteClient();
  if (!supabase) return { skipped: "db_unavailable" };

  const { data } = await supabase.from("ops_incidents").select("*").eq("id", incidentId).single();
  if (!data) return { skipped: "incident_not_found" };
  const incident = data as Incident;

  const existing = incident.ai_diagnoses ?? [];
  if (existing.some((d) => d.role === "auto-classify")) return { skipped: "already_classified" };

  const limit = Number(process.env.OPS_INBOX_GEMINI_DAILY_LIMIT ?? "1400");
  const quota = await checkAndConsumeGeminiQuota(limit);
  if (!quota.allowed) return { skipped: "quota_exhausted" };

  const summary = await summarizeIncidentWithGemini(incident);
  const diagnosis: AiDiagnosis = {
    provider: "gemini",
    model: "gemini-1.5-flash",
    role: "auto-classify",
    summary,
    created_at: new Date().toISOString(),
  };

  await supabase
    .from("ops_incidents")
    .update({
      ai_provider_suggested: "gemini",
      ai_diagnoses: [...existing, diagnosis],
    })
    .eq("id", incidentId);

  return { summary };
}
