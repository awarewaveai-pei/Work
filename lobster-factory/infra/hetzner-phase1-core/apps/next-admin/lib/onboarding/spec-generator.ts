import Anthropic from "@anthropic-ai/sdk";
import { selectPackage } from "./package-selector";
import type { IntakeForm, WebsiteSpec } from "./intake-form";

const SPEC_TIMEOUT_MS = 60_000; // 4096 tokens needs more headroom than incident summaries

const SYSTEM_PROMPT = `You are a senior WordPress web designer and strategist.
Given a client intake form, generate a complete WebsiteSpec JSON object.
Reply with ONLY the raw JSON — no markdown fences, no explanation.
The JSON must match the WebsiteSpec TypeScript interface exactly.`;

function buildUserPrompt(form: IntakeForm, packageSlug: string, packs: string[]): string {
  return `Generate a WebsiteSpec for this client:

${JSON.stringify(form, null, 2)}

Selected package: ${packageSlug}
Selected packs: ${packs.join(", ")}

Rules:
- site_name = form.company_name (keep exact)
- language = form.language ?? "zh-TW"
- package_slug = "${packageSlug}"
- packs = ${JSON.stringify(packs)}
- generated_at = "${new Date().toISOString()}"
- generated_by = "claude-sonnet-4-6"
- All text content in the same language as form.language (default zh-TW)
- design.primary_color must be a valid hex (#RRGGBB)
- sitemap must include at minimum: home page + all pages from form.pages_needed
- seo.schema_type: use "Store" if has_ecommerce, "LocalBusiness" if service/tourism, "Organization" otherwise
- image_requirements: list at least one entry per sitemap page
- fluentsmtp.from_email = form.contact_email ?? "noreply@example.com"
- Include woocommerce config only if has_ecommerce = true
- Include fluentcrm config only if needs_crm = true
`;
}

function validateSpec(obj: unknown): obj is WebsiteSpec {
  if (!obj || typeof obj !== "object") return false;
  const s = obj as Record<string, unknown>;
  if (typeof s.site_name !== "string" || !s.site_name) return false;
  if (!Array.isArray(s.sitemap) || s.sitemap.length === 0) return false;
  if (!s.homepage || typeof s.homepage !== "object") return false;
  const hp = s.homepage as Record<string, unknown>;
  if (!hp.hero || typeof hp.hero !== "object") return false;
  if (!s.design || typeof s.design !== "object") return false;
  const d = s.design as Record<string, unknown>;
  if (typeof d.primary_color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(d.primary_color)) return false;
  if (!s.plugin_config || typeof s.plugin_config !== "object") return false;
  return true;
}

export type GenerateSpecResult =
  | { ok: true; spec: WebsiteSpec }
  | { ok: false; error: string; raw?: string };

export async function generateWebsiteSpec(
  form: IntakeForm,
  intakeFormId?: string
): Promise<GenerateSpecResult> {
  // M5: explicit key check before any API call
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "missing_anthropic_api_key" };

  const { package_slug, packs } = selectPackage(form);
  const client = new Anthropic({ apiKey });

  // M4: AbortController timeout (same pattern as lib/ops-inbox/ai/claude.ts)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SPEC_TIMEOUT_MS);

  let raw: string;
  try {
    const message = await client.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserPrompt(form, package_slug, packs) }],
      },
      { signal: controller.signal }
    );

    // C2: safe content access (.find instead of [0])
    const block = message.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") {
      return { ok: false, error: "unexpected_response_type" };
    }
    raw = block.text.trim();
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  } finally {
    clearTimeout(timer);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "json_parse_failed", raw };
  }

  // M3: structural validation before accepting as WebsiteSpec
  if (!validateSpec(parsed)) {
    return { ok: false, error: "spec_validation_failed", raw };
  }

  // Overwrite non-negotiable server-side fields
  parsed.package_slug = package_slug;
  parsed.packs = packs;
  parsed.generated_by = "claude-sonnet-4-6";
  if (intakeFormId) parsed.intake_form_id = intakeFormId;

  return { ok: true, spec: parsed };
}
