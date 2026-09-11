import { NextResponse } from "next/server";
import { resolveOpsRole, canManageOutreach } from "@/lib/ops-role";
import { getOrgSupabaseWriteClient } from "@/lib/org-client";
import { getSecret } from "@/lib/secret-vault";
import { checkColdGate, buildEvidenceSnapshot, lintMessage } from "@/lib/outreach/cold-gate";
import { generateWithGemini } from "@/lib/outreach/ai-gemini";
import { effectiveOrgId, assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { generateWithClaude } from "@/lib/outreach/ai-claude";
import { generateWithOpenAI } from "@/lib/outreach/ai-openai";

// Cold Outreach — message generation (task T8) + list (task T9). Table: co_messages (migration 0048).
// Flow: Cold Gate (block if no observation/source_url/do_not_contact) → router ladder resolves the
// best available AI connector (claude > openai > gemini > gemini_agency > manual_prompt) →
// getSecret(vault) → generate; if no key anywhere, fall back to a manual_prompt the operator pastes
// into ChatGPT/Claude. Output is linted, carries evidence_snapshot, and is stored as a DRAFT — never
// auto-sent. Writes ops-role gated; GET authed-only.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "co_messages";
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
// Guard uuid-typed columns up front so a bad id returns a clean 400, not a raw PG 22P02 leak.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface LeadRow {
  id: string;
  organization_id: string | null;
  service_profile_id: string | null;
  name: string | null;
  industry: string | null;
  observation: string | null;
  source_url: string | null;
  pain_guess: string | null;
  recommended_angle: string | null;
  do_not_contact: boolean | null;
}
interface ProfileRow {
  service_name: string | null;
  positioning: string | null;
  usp: string | null;
  tone: string | null;
  forbidden_words: string[] | null;
}

function buildPrompt(lead: LeadRow, sp: ProfileRow | null, forbidden: string[]): string {
  const tone = sp?.tone ?? "溫和專業";
  const lines = [
    `你是${sp?.service_name ? `「${sp.service_name}」` : "一位服務提供者"}的業務助理，要寫一封「冷開發」email 給「${lead.name ?? "對方"}」。`,
    `嚴格規則：`,
    `- 只能根據以下事實，不得編造任何資訊。`,
    `  觀察：「${lead.observation ?? ""}」`,
    `  來源：${lead.source_url ?? ""}`,
    lead.pain_guess ? `  推測痛點：${lead.pain_guess}` : "",
    lead.recommended_angle ? `  切入角度：${lead.recommended_angle}` : "",
    sp?.usp ? `  我們的賣點：${sp.usp}` : "",
    `- 繁體中文，120–180 字，語氣${tone}，低壓不推銷。`,
    `- 開場用上面的具體觀察點，不要寫罐頭句。`,
    `- 結尾一句低壓 CTA（詢問是否能分享一個簡短合作點子），並加一句拒收：「如果不適合，我就不再打擾。」`,
    `- 嚴禁誇大或承諾成效。嚴禁使用這些詞：${forbidden.join("、")}`,
    `- 只輸出 email 內文，不要主旨行、不要任何解釋或標註。`,
  ];
  return lines.filter(Boolean).join("\n");
}

export async function GET(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const supabase = await getOrgSupabaseWriteClient(params.get("orgSlug"));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const leadId = params.get("leadId");
  if (leadId && !UUID_RE.test(leadId)) return NextResponse.json({ ok: false, error: "leadId must be a uuid" }, { status: 400 });
  const rawOrgId = params.get("organizationId");
  if (rawOrgId && !UUID_RE.test(rawOrgId)) return NextResponse.json({ ok: false, error: "organizationId must be a uuid" }, { status: 400 });
  let orgFilter: string | null;
  try { orgFilter = effectiveOrgId(req, rawOrgId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  let query = supabase.from(TABLE).select("*").order("created_at", { ascending: false }).limit(100);
  if (leadId) query = query.eq("lead_id", leadId);
  if (orgFilter) query = query.eq("organization_id", orgFilter);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, messages: data ?? [] });
}

// POST { leadId, orgSlug? } — generate a cold-email draft.
export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const supabase = await getOrgSupabaseWriteClient(str(body.orgSlug));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const leadId = str(body.leadId);
  if (!leadId) return NextResponse.json({ ok: false, error: "leadId required" }, { status: 400 });
  if (!UUID_RE.test(leadId)) return NextResponse.json({ ok: false, error: "leadId must be a uuid" }, { status: 400 });

  const { data: leadData, error: leadErr } = await supabase.from("co_leads").select("*").eq("id", leadId).maybeSingle();
  if (leadErr) return NextResponse.json({ ok: false, error: leadErr.message }, { status: 500 });
  if (!leadData) return NextResponse.json({ ok: false, error: "lead not found" }, { status: 404 });
  const lead = leadData as LeadRow;
  try { assertOrgAccess(req, lead.organization_id); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  // Cold Gate — refuse to generate without evidence.
  const gate = checkColdGate(lead);
  if (gate.status === "block") {
    return NextResponse.json({ ok: false, blocked: true, blockers: gate.blockers }, { status: 422 });
  }

  // Service profile (for tone / usp / forbidden words).
  let sp: ProfileRow | null = null;
  if (lead.service_profile_id) {
    const { data } = await supabase
      .from("co_service_profiles")
      .select("service_name, positioning, usp, tone, forbidden_words")
      .eq("id", lead.service_profile_id)
      .maybeSingle();
    sp = (data as ProfileRow) ?? null;
  }
  const forbidden = Array.isArray(sp?.forbidden_words) ? sp!.forbidden_words!.filter(Boolean) : [];
  const prompt = buildPrompt(lead, sp, forbidden);

  // Resolve AI connector via router ladder: claude → openai → gemini → gemini_agency → manual_prompt.
  // For each paid provider: try client BYO key first, then agency default (null org).
  const AI_PROVIDERS = ["claude", "openai", "gemini", "gemini_agency"] as const;
  type AiProvider = (typeof AI_PROVIDERS)[number];
  let resolvedProvider: AiProvider | null = null;
  let apiKey: string | null = null;
  let vaultError: string | null = null;

  for (const provider of AI_PROVIDERS) {
    const pickRef = async (orgFilter: "client" | "agency"): Promise<string | null> => {
      let q = supabase
        .from("co_connector_accounts")
        .select("credentials_ref")
        .eq("connector_name", provider)
        .eq("is_enabled", true)
        .not("credentials_ref", "is", null)
        .limit(1);
      q = orgFilter === "client" && lead.organization_id
        ? q.eq("organization_id", lead.organization_id)
        : q.is("organization_id", null);
      const { data } = await q.maybeSingle();
      return (data as { credentials_ref?: string | null } | null)?.credentials_ref ?? null;
    };
    const ref = (lead.organization_id ? await pickRef("client") : null) ?? (await pickRef("agency"));
    if (!ref) continue;
    try {
      apiKey = await getSecret(ref);
      resolvedProvider = provider;
      break;
    } catch (e) {
      vaultError = e instanceof Error ? e.message.slice(0, 80) : "vault read error";
      // vault error on one provider → try next rather than hard-fail
    }
  }

  const evidence = buildEvidenceSnapshot(lead);
  let mode: AiProvider | "manual_prompt";
  let bodyText: string;
  let aiModel: string | null = null;

  if (apiKey && resolvedProvider) {
    try {
      let out: { text: string; model: string };
      if (resolvedProvider === "claude") {
        out = await generateWithClaude(apiKey, prompt);
      } else if (resolvedProvider === "openai") {
        out = await generateWithOpenAI(apiKey, prompt);
      } else {
        out = await generateWithGemini(apiKey, prompt);
      }
      bodyText = out.text;
      aiModel = out.model;
      mode = resolvedProvider;
    } catch (e) {
      bodyText = prompt;
      mode = "manual_prompt";
      aiModel = `${resolvedProvider}_failed:${e instanceof Error ? e.message.slice(0, 80) : "error"}`;
    }
  } else {
    bodyText = prompt; // operator pastes into ChatGPT/Claude (極省模式 fallback)
    mode = "manual_prompt";
    aiModel = vaultError ? `vault_read_failed:${vaultError}` : null;
  }

  const isAiGenerated = mode !== "manual_prompt";
  const lint = lintMessage(isAiGenerated ? bodyText : "", forbidden); // only lint real AI output
  const { data: created, error: createErr } = await supabase
    .from(TABLE)
    .insert({
      organization_id: lead.organization_id ?? null,
      lead_id: lead.id,
      channel: "email",
      output_type: "cold_email",
      subject: null,
      body: bodyText,
      ai_model: aiModel,
      personalization_score: null,
      safety_score: isAiGenerated ? lint.safety_score : null,
      quality_gate_status: isAiGenerated ? lint.quality_gate_status : null,
      evidence_snapshot: evidence,
      prompt_snapshot: { prompt, mode },
      status: "draft",
    })
    .select("*")
    .single();
  if (createErr) return NextResponse.json({ ok: false, error: createErr.message }, { status: 500 });

  if (isAiGenerated) {
    await supabase.from("co_leads").update({ status: "message_generated", updated_at: new Date().toISOString() }).eq("id", lead.id);
  }

  return NextResponse.json({ ok: true, mode, message: created, lint: isAiGenerated ? lint : null });
}

// PATCH { id, status, body?, orgSlug? } — human review action (approve / edit / skip). Never sends.
const ALLOWED_STATUS = new Set(["draft", "approved", "needs_edit", "skipped"]);
export async function PATCH(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const supabase = await getOrgSupabaseWriteClient(str(body.orgSlug));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const id = str(body.id);
  const status = str(body.status);
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  if (!UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "id must be a uuid" }, { status: 400 });
  if (!status || !ALLOWED_STATUS.has(status)) {
    return NextResponse.json({ ok: false, error: "valid status required (draft|approved|needs_edit|skipped)" }, { status: 400 });
  }

  const { data: cur, error: curErr } = await supabase.from(TABLE).select("organization_id").eq("id", id).maybeSingle();
  if (curErr) return NextResponse.json({ ok: false, error: curErr.message }, { status: 500 });
  if (!cur) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  try { assertOrgAccess(req, (cur as Record<string, unknown>).organization_id as string | null); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  const patch: Record<string, unknown> = { status };
  const editedBody = str(body.body);
  if (editedBody) patch.body = editedBody;
  if (status === "approved") patch.approved_at = new Date().toISOString();

  const { data, error } = await supabase.from(TABLE).update(patch).eq("id", id).select("*").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, message: data });
}

export async function DELETE(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });
  const params = new URL(req.url).searchParams;
  const supabase = await getOrgSupabaseWriteClient(params.get("orgSlug"));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const id = params.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  if (!UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "id must be a uuid" }, { status: 400 });
  const { data: cur, error: readErr } = await supabase.from(TABLE).select("organization_id").eq("id", id).maybeSingle();
  if (readErr) return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 });
  if (!cur) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  try { assertOrgAccess(req, (cur as Record<string, unknown>).organization_id as string | null); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
