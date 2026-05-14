import { getSupabaseWriteClient } from "@/lib/supabase-server";
import type { AiDiagnosis, Incident } from "@/lib/ops-inbox/types";
import { summarizeIncidentWithClaude } from "./claude";
import { summarizeIncidentWithGemini } from "./gemini";
import { checkAndConsumeGeminiQuota } from "./quotaGuard";

type SupportedProvider = AiDiagnosis["provider"];

// Provider cascade: Claude Haiku → Gemini 2.0 Flash Lite → skip
// Each provider has its own timeout (set inside the individual module).
async function runAiSummarize(incident: Incident): Promise<{ provider: SupportedProvider; model: string; summary: string }> {
  // Try Claude first (ANTHROPIC_API_KEY in env; no quota counter needed — pay-per-token)
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const summary = await summarizeIncidentWithClaude(incident);
      return { provider: "claude", model: "claude-haiku-4-5-20251001", summary };
    } catch {
      // fall through to Gemini
    }
  }

  // Gemini fallback — only if key present; quota-guarded
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const limit = Number(process.env.OPS_INBOX_GEMINI_DAILY_LIMIT ?? "1400");
    const quota = await checkAndConsumeGeminiQuota(limit);
    if (quota.allowed) {
      const summary = await summarizeIncidentWithGemini(incident);
      return { provider: "gemini", model: "gemini-2.0-flash-lite", summary };
    }
  }

  throw new Error("no_ai_provider_available");
}

export async function triggerAutoClassify(incidentId: string): Promise<{ skipped?: string; summary?: string }> {
  // Feature flag: legacy key still works; having either API key also implies intent
  const enabled =
    process.env.OPS_INBOX_GEMINI_ENABLED === "true" ||
    Boolean(process.env.ANTHROPIC_API_KEY) ||
    Boolean(process.env.GEMINI_API_KEY);
  if (!enabled) return { skipped: "disabled" };

  const supabase = getSupabaseWriteClient();
  if (!supabase) return { skipped: "db_unavailable" };

  const { data } = await supabase.from("ops_incidents").select("*").eq("id", incidentId).single();
  if (!data) return { skipped: "incident_not_found" };
  const incident = data as Incident;

  const existing = incident.ai_diagnoses ?? [];
  if (existing.some((d) => d.role === "auto-classify")) return { skipped: "already_classified" };

  const { provider, model, summary } = await runAiSummarize(incident);

  const diagnosis: AiDiagnosis = {
    provider,
    model,
    role: "auto-classify",
    summary,
    created_at: new Date().toISOString(),
  };

  await supabase
    .from("ops_incidents")
    .update({
      ai_provider_suggested: provider,
      ai_diagnoses: [...existing, diagnosis],
    })
    .eq("id", incidentId);

  return { summary };
}
