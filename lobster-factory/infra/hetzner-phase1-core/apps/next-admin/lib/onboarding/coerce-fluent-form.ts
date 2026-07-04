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

// Prompt-injection guard: enum tokens are short (longest: "booking_service"=15 chars, 7 pages max).
const MAX_CSV_ITEMS = 20;
const MAX_CSV_ITEM_LEN = 50;

// FluentForm sends checkbox multi-selects as comma-separated strings in JSON webhook bodies.
// Both branches clamp length + cap count to honour the injection guard this file promises.
function toCommaSplit<T extends string>(v: unknown): T[] | undefined {
  if (Array.isArray(v)) {
    const items = v
      .filter((x): x is string => typeof x === "string")
      .slice(0, MAX_CSV_ITEMS)
      .map((s) => s.slice(0, MAX_CSV_ITEM_LEN))
      .filter(Boolean);
    return items.length ? (items as T[]) : undefined;
  }
  if (typeof v === "string" && v.trim()) {
    const items = v
      .split(",")
      .map((s) => s.trim().slice(0, MAX_CSV_ITEM_LEN))
      .filter(Boolean)
      .slice(0, MAX_CSV_ITEMS);
    return items.length ? (items as T[]) : undefined;
  }
  return undefined;
}

/** Coerce + allow-list FluentForm webhook payload into IntakeForm.
 * FluentForm sends "yes"/"no" for booleans; checkbox fields are comma-separated strings.
 * Unknown keys are dropped; all string fields are length-clamped (prompt-injection guard). */
export function coerceFluentFormPayload(raw: Record<string, unknown>): IntakeForm {
  const pages_needed = (toCommaSplit(raw.pages_needed) ?? []) as PageType[];

  // reference_sites: textarea (one URL per line) or array
  const refSites = Array.isArray(raw.reference_sites)
    ? (raw.reference_sites as unknown[]).slice(0, 3).map((s) => String(s).slice(0, 500))
    : typeof raw.reference_sites === "string" && raw.reference_sites.trim()
    ? raw.reference_sites.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, 3).map((s) => s.slice(0, 500))
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
    visual_style: toCommaSplit<VisualStyle>(raw.visual_style),
    primary_color: clampStr(raw.primary_color, 50),
    secondary_color: clampStr(raw.secondary_color, 50),
    logo_status: raw.logo_status as LogoStatus,
    product_type: toCommaSplit<ProductType>(raw.product_type),
    needs_crm: toBool(raw.needs_crm),
    needs_booking: toBool(raw.needs_booking),
    contact_email: clampStr(raw.contact_email, 254),
    domain: clampStr(raw.domain, 253),
    language: clampStr(raw.language, 20),
    existing_content: raw.existing_content as ContentStatus,
    launch_urgency: raw.launch_urgency as LaunchUrgency,
    // Deprecated 2026-06-05 but kept for backward-compat with stored intake_forms
    primary_goal: toCommaSplit<PrimaryGoal>(raw.primary_goal),
  };
}
