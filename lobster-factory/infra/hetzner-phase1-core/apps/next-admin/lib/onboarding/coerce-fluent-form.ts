import type { IntakeForm, PageType } from "./intake-form";

const TRUTHY = new Set(["yes", "true", "1", "on"]);

function toBool(v: unknown): boolean {
  return v === true || (typeof v === "string" && TRUTHY.has(v.toLowerCase()));
}

/** Coerce FluentForm webhook strings into proper IntakeForm types.
 * FluentForm sends "yes"/"no" for booleans; pages_needed may be comma-joined. */
export function coerceFluentFormPayload(raw: Record<string, unknown>): IntakeForm {
  const pRaw = raw.pages_needed;
  const pages_needed = (
    Array.isArray(pRaw)
      ? pRaw
      : typeof pRaw === "string"
      ? pRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : []
  ) as PageType[];

  return {
    ...(raw as unknown as IntakeForm),
    has_ecommerce: toBool(raw.has_ecommerce),
    needs_crm: toBool(raw.needs_crm),
    needs_booking: toBool(raw.needs_booking),
    pages_needed,
  };
}
