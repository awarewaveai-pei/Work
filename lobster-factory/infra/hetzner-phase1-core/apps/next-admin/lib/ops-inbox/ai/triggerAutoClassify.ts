import { getSupabaseWriteClient } from "@/lib/supabase-server";
import type { AiDiagnosis, Incident } from "@/lib/ops-inbox/types";
import { collectEvidence, renderEvidenceText } from "@/lib/repair-center/evidence";
import { CLAUDE_FAST_MODEL } from "@/lib/ai/gateway";
import { GEMINI_LITE_MODEL } from "@/lib/ai/gemini-models";
import { summarizeIncidentWithClaude } from "./claude";
import { summarizeIncidentWithGemini } from "./gemini";
import { checkAndConsumeGeminiQuota } from "./quotaGuard";

type SupportedProvider = AiDiagnosis["provider"];

// Provider cascade: Claude Haiku → Gemini 2.0 Flash Lite → skip
// Each provider has its own timeout (set inside the individual module).
async function runAiSummarize(
  incident: Incident,
  evidenceText?: string,
): Promise<{ provider: SupportedProvider; model: string; summary: string }> {
  // Try Claude first (ANTHROPIC_API_KEY in env; no quota counter needed — pay-per-token)
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const summary = await summarizeIncidentWithClaude(incident, evidenceText);
      return { provider: "claude", model: CLAUDE_FAST_MODEL, summary };
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
      const summary = await summarizeIncidentWithGemini(incident, evidenceText);
      return { provider: "gemini", model: GEMINI_LITE_MODEL, summary };
    }
  }

  throw new Error("no_ai_provider_available");
}

export async function triggerAutoClassify(incidentId: string): Promise<{ skipped?: string; summary?: string; error?: string }> {
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

  // Evidence engine (A1, 2026-07-03): gather correlated alerts / fingerprint
  // history / recent deploys / repair history / host snapshot BEFORE asking the
  // model, so "auto-classify" is a grounded root-cause hypothesis instead of a
  // title paraphrase. This runs awaited inside the webhook request path, so the
  // whole collection is fail-open and the SSH host probe inside collectEvidence
  // only fires for platform incidents (client_slug null); DB collectors are
  // four cheap indexed queries.
  let evidenceText: string | undefined;
  try {
    const bundle = await collectEvidence(supabase, incident);
    evidenceText = renderEvidenceText(bundle);
  } catch (e) {
    console.warn("[ops-inbox] evidence collection failed (fail-open):", e);
  }

  let aiResult: { provider: SupportedProvider; model: string; summary: string };
  try {
    aiResult = await runAiSummarize(incident, evidenceText);
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "ai_summarize_failed";
    // best-effort: tag incident so ops can see classify failed without checking Sentry
    await supabase
      .from("ops_incidents")
      .update({ tags: { ...(incident.tags ?? {}), auto_classify_error: errorMsg } })
      .eq("id", incidentId)
      .then(() => {}, () => {});
    return { error: errorMsg };
  }

  const { provider, model, summary } = aiResult;
  const now = new Date().toISOString();

  const entries: AiDiagnosis[] = [];
  if (evidenceText) {
    entries.push({
      provider: "other",
      role: "evidence",
      summary: evidenceText,
      created_at: now,
      created_by: "system",
    });
  }
  entries.push({
    provider,
    model,
    role: "auto-classify",
    summary,
    created_at: now,
  });

  await supabase
    .from("ops_incidents")
    .update({
      ai_provider_suggested: provider,
      ai_diagnoses: [...existing, ...entries],
    })
    .eq("id", incidentId);

  return { summary };
}
