import type {
  IntakeForm, PageType, Industry, BudgetTier,
  VisualStyle, ProductType, LogoStatus, PrimaryGoal,
  ContentStatus, LaunchUrgency,
} from "./intake-form";

const TRUTHY = new Set(["yes", "true", "1", "on"]);

function toBool(v: unknown): boolean {
  return v === true || (typeof v === "string" && TRUTHY.has(v.toLowerCase()));
}

const clampStr = (v: unknown, max: number): string | undefined =>
  typeof v === "string" ? v.slice(0, max) : undefined;

/** Coerce + allow-list FluentForm webhook payload into IntakeForm.
 * FluentForm sends "yes"/"no" for booleans; pages_needed may be comma-joined.
 * Unknown keys are dropped; all string fields are length-clamped (prompt-injection guard). */
export function coerceFluentFormPayload(raw: Record<string, unknown>): IntakeForm {
  const pRaw = raw.pages_needed;
  const pages_needed = (
    Array.isArray(pRaw)
      ? pRaw
      : typeof pRaw === "string"
      ? pRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : []
  ) as PageType[];

  const refSites = Array.isArray(raw.reference_sites)
    ? (raw.reference_sites as unknown[]).slice(0, 3).map((s) => String(s).slice(0, 500))
    : undefined;

  return {
    // Required
    company_name: clampStr(raw.company_name, 200) ?? "",
    industry: raw.industry as Industry,
    pages_needed,
    has_ecommerce: toBool(raw.has_ecommerce),
    budget_tier: raw.budget_tier as BudgetTier,
    // Optional strings (length-clamped; unknown keys not forwarded)
    brand_tagline: clampStr(raw.brand_tagline, 300),
    target_audience: clampStr(raw.target_audience, 500),
    reference_sites: refSites as IntakeForm["reference_sites"],
    visual_style: Array.isArray(raw.visual_style) ? raw.visual_style as VisualStyle[] : undefined,
    primary_color: clampStr(raw.primary_color, 50),
    secondary_color: clampStr(raw.secondary_color, 50),
    logo_status: raw.logo_status as LogoStatus,
    product_type: Array.isArray(raw.product_type) ? raw.product_type as ProductType[] : undefined,
    needs_crm: toBool(raw.needs_crm),
    needs_booking: toBool(raw.needs_booking),
    contact_email: clampStr(raw.contact_email, 254),
    domain: clampStr(raw.domain, 253),
    language: clampStr(raw.language, 10),
    existing_content: raw.existing_content as ContentStatus,
    launch_urgency: raw.launch_urgency as LaunchUrgency,
    // Deprecated 2026-06-05 but kept for backward-compat with stored intake_forms
    primary_goal: Array.isArray(raw.primary_goal) ? raw.primary_goal as PrimaryGoal[] : undefined,
  };
}
