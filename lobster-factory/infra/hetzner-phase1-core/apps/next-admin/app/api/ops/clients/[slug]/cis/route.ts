// PATCH /api/ops/clients/[slug]/cis
// Stores per-client CIS (brandKit VI assets + csVoice BI/MI persona) inside
// organizations.metadata.client_config.{brandKit,csVoice} — same JSONB blob as brandColors, no
// schema migration. Standard colours stay in brandColors (set via the brand-colors route); this
// route does NOT touch them. Gated by canWriteTenantConfig (owner/admin), same tier as brand-colors.

import { NextResponse } from "next/server";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import type { ClientConfig } from "@/app/api/ops/clients/route";

// Length caps: these free-text fields get injected verbatim into the AI system prompt (lib/cs/cis.ts),
// so bound them to avoid an admin bloating the prompt / JSONB row.
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, 2000) : undefined;
}
function strArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim().slice(0, 500))
    .slice(0, 20);
  return out.length ? out : undefined;
}
function pick<T extends Record<string, unknown>>(obj: T, keys: string[]): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return Object.keys(out).length ? out : undefined;
}

function sanitizeBrandKit(raw: unknown): ClientConfig["brandKit"] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const b = raw as Record<string, unknown>;
  const logo = pick((b.logo as Record<string, unknown>) ?? {}, ["primary", "inverse", "icon", "clearSpace", "minWidthPx"]);
  const typography = pick((b.typography as Record<string, unknown>) ?? {}, ["headingFont", "bodyFont", "cjkFont"]);
  const graphics = pick((b.graphics as Record<string, unknown>) ?? {}, ["iconStyle", "illustrationStyle", "imageryTreatment"]);
  const kit = { ...(logo ? { logo } : {}), ...(typography ? { typography } : {}), ...(graphics ? { graphics } : {}) };
  return Object.keys(kit).length ? (kit as ClientConfig["brandKit"]) : undefined;
}

function sanitizeCsVoice(raw: unknown): ClientConfig["csVoice"] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const v = raw as Record<string, unknown>;
  const formality = ["casual", "polite", "formal"].includes(v.formality as string) ? (v.formality as "casual" | "polite" | "formal") : undefined;
  const emojiPolicy = ["none", "sparing", "friendly"].includes(v.emojiPolicy as string) ? (v.emojiPolicy as "none" | "sparing" | "friendly") : undefined;
  const out: ClientConfig["csVoice"] = {
    personaName: str(v.personaName),
    languages: strArray(v.languages),
    formality,
    honorifics: str(v.honorifics),
    emojiPolicy,
    greeting: str(v.greeting),
    signoff: str(v.signoff),
    refusalStyle: str(v.refusalStyle),
    escalationTone: str(v.escalationTone),
    askName: str(v.askName),
    servicePrinciples: strArray(v.servicePrinciples),
    mission: str(v.mission),
  };
  const cleaned = Object.fromEntries(Object.entries(out).filter(([, val]) => val !== undefined));
  return Object.keys(cleaned).length ? (cleaned as ClientConfig["csVoice"]) : undefined;
}

export async function PATCH(request: Request, context: { params: Promise<{ slug: string }> }) {
  const resolved = resolveOpsRole(request);
  if (!canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }

  const { slug } = await context.params;
  if (!slug) return NextResponse.json({ ok: false, error: "slug_required" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const brandKit = sanitizeBrandKit(body.brandKit);
  const csVoice = sanitizeCsVoice(body.csVoice);

  const supabase = getSupabaseWriteClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_write_not_configured" }, { status: 503 });
  }

  const { data: org, error: readErr } = await supabase
    .from("organizations")
    .select("id,metadata")
    .eq("slug", slug)
    .single();
  if (readErr || !org) {
    return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });
  }

  const metadata = (org.metadata && typeof org.metadata === "object" ? org.metadata : {}) as Record<string, unknown>;
  const clientConfig = (metadata.client_config && typeof metadata.client_config === "object"
    ? metadata.client_config
    : {}) as Record<string, unknown>;

  // Only touch keys explicitly present in the request; clear on empty.
  if ("brandKit" in body) {
    if (brandKit) clientConfig.brandKit = brandKit;
    else delete clientConfig.brandKit;
  }
  // csVoice: the form owns a SUBSET of keys; preserve keys it doesn't own (e.g. brandVoice synced
  // from the content engine, apologyStyle/slogan) so an admin save can't silently clobber them.
  if ("csVoice" in body) {
    const CS_FORM_KEYS = ["personaName", "languages", "formality", "honorifics", "emojiPolicy",
      "greeting", "signoff", "refusalStyle", "escalationTone", "askName", "servicePrinciples", "mission"];
    const existing = (clientConfig.csVoice && typeof clientConfig.csVoice === "object"
      ? { ...(clientConfig.csVoice as Record<string, unknown>) }
      : {}) as Record<string, unknown>;
    for (const k of CS_FORM_KEYS) delete existing[k]; // form is authoritative for its own keys (incl. clearing)
    const merged = { ...existing, ...(csVoice ?? {}) };
    if (Object.keys(merged).length) clientConfig.csVoice = merged;
    else delete clientConfig.csVoice;
  }

  const nextMetadata = { ...metadata, client_config: clientConfig };
  const { error: writeErr } = await supabase.from("organizations").update({ metadata: nextMetadata }).eq("id", org.id);
  if (writeErr) {
    return NextResponse.json({ ok: false, error: "update_failed", details: writeErr.message }, { status: 409 });
  }

  await supabase.from("ops_audit_events").insert({
    organization_id: org.id,
    actor_role: resolved.role,
    event_type: "cis_updated",
    target_type: "organizations",
    target_id: org.id,
    trace_id: crypto.randomUUID(),
    payload: { hasBrandKit: !!brandKit, hasCsVoice: !!csVoice, role_source: resolved.source },
  });

  return NextResponse.json({ ok: true, brandKit: brandKit ?? null, csVoice: csVoice ?? null });
}
