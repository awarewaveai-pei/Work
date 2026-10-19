import { loadAnthropic, type Anthropic } from "@/lib/ai/gateway";
import { CLAUDE_DEFAULT_MODEL, claudeFallback, claudeIncomplete, claudeParams, claudeText } from "../ai/gateway";
import { selectPackage } from "./package-selector";
import type { IntakeForm, WebsiteSpec } from "./intake-form";

const SPEC_TIMEOUT_MS = 60_000; // 4096 tokens needs more headroom than incident summaries

const SYSTEM_PROMPT = `You are a senior WordPress web designer and strategist.
Given a client intake form, generate a complete website specification JSON object.
Reply with ONLY valid raw JSON — no markdown fences, no explanation, no extra text.
The output MUST use EXACTLY these top-level keys (no others, no renames):
  site_name, tagline, language, package_slug, packs, sitemap, homepage, design,
  image_requirements, plugin_config, seo, generated_at, generated_by
The "homepage" key must exist with sub-keys "hero" and "sections".
The "plugin_config" key must exist (not "plugins") with sub-keys: kadence, rankmath, fluentsmtp,
and optionally woocommerce, fluentcrm, fluentforms.
design.primary_color must be exactly "#RRGGBB" format (6 hex digits with # prefix).`;

function buildUserPrompt(form: IntakeForm, packageSlug: string, packs: string[]): string {
  return `Generate a website spec JSON for this client:

${JSON.stringify(form, null, 2)}

REQUIRED OUTPUT STRUCTURE (follow exactly):
{
  "site_name": "${form.company_name}",
  "tagline": "...",
  "language": "${form.language ?? "zh-TW"}",
  "package_slug": "${packageSlug}",
  "packs": ${JSON.stringify(packs)},
  "generated_at": "${new Date().toISOString()}",
  "generated_by": "${CLAUDE_DEFAULT_MODEL}",
  "sitemap": [{ "slug": "home", "title": "首頁", "template": "home", "is_homepage": true }, ...],
  "homepage": {
    "hero": { "headline": "...", "subheadline": "...", "cta_text": "...", "cta_url": "/" },
    "sections": [{ "type": "features", "headline": "...", "body": "..." }, ...]
  },
  "design": {
    "style_direction": "...",
    "primary_color": "#1a1a2e",
    "secondary_color": "#e94560",
    "font_suggestion": "...",
    "image_style": "..."
  },
  "image_requirements": [{ "page": "home", "section": "hero", "description": "...", "suggested_size": "1920x1080", "quantity": 1 }],
  "plugin_config": {
    "kadence": { "global_color_palette": ["#1a1a2e", "#e94560"] },
    "rankmath": { "site_title": "...", "meta_description": "...", "focus_keywords": ["..."], "schema_type": "Organization" },
    "fluentsmtp": { "from_email": "${form.contact_email ?? "noreply@example.com"}", "from_name": "${form.company_name}" }
  },
  "seo": { "meta_title": "...", "meta_description": "...", "focus_keywords": ["..."], "schema_type": "Organization" }
}

Rules:
- All text in ${form.language ?? "zh-TW"}
- sitemap must include: home + pages_needed (${(form.pages_needed ?? []).join(", ")})
- design.primary_color MUST be exactly #RRGGBB (e.g. #1a1a2e)
- If the form provides primary_color and/or secondary_color, design MUST honour them (convert any plain-language description to the closest #RRGGBB). Only invent a color when the form leaves it blank, and any derived secondary_color must be harmonious with the primary. kadence.global_color_palette should lead with [primary, secondary].
- seo.schema_type: "Store" if ecommerce, "LocalBusiness" if service/tourism, "Organization" otherwise
- Add plugin_config.woocommerce only if has_ecommerce=true
- Add plugin_config.fluentcrm only if needs_crm=true
`;
}

function validateSpec(obj: unknown): obj is WebsiteSpec {
  if (!obj || typeof obj !== "object") { return false; }
  const s = obj as Record<string, unknown>;
  if (typeof s.site_name !== "string" || !s.site_name) { return false; }
  if (!Array.isArray(s.sitemap) || s.sitemap.length === 0) { return false; }
  if (!s.homepage || typeof s.homepage !== "object") { return false; }
  const hp = s.homepage as Record<string, unknown>;
  if (!hp.hero || typeof hp.hero !== "object") { return false; }
  if (!s.design || typeof s.design !== "object") { return false; }
  const d = s.design as Record<string, unknown>;
  if (typeof d.primary_color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(d.primary_color)) {
    return false;
  }
  if (!s.plugin_config || typeof s.plugin_config !== "object") { return false; }
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
  const Anthropic = await loadAnthropic();
  const client = new Anthropic({ apiKey });

  // M4: AbortController timeout (same pattern as lib/ops-inbox/ai/claude.ts)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SPEC_TIMEOUT_MS);

  let raw: string;
  try {
    const message = await client.beta.messages.create(
      {
        ...claudeParams(CLAUDE_DEFAULT_MODEL, 4096),
        ...claudeFallback(CLAUDE_DEFAULT_MODEL),
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserPrompt(form, package_slug, packs) }],
      },
      { signal: controller.signal }
    );

    const incomplete = claudeIncomplete(message);
    if (incomplete) return { ok: false, error: incomplete };
    raw = claudeText(message).trim();
    if (!raw) return { ok: false, error: "unexpected_response_type" };
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
  parsed.generated_by = CLAUDE_DEFAULT_MODEL;
  if (intakeFormId) parsed.intake_form_id = intakeFormId;

  return { ok: true, spec: parsed };
}
