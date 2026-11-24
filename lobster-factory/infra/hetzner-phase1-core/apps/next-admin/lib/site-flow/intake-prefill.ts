// /ops/sites/new?spec=&intake= : the 客戶問卷 (/ops/onboarding) hands its generated spec to the one site flow (card SF-P).
// Only a prefill of the form: name, domain, locale and plugin packs. Nothing is written here; the operator still checks
// the form and presses 建立, which goes through POST /api/ops/site-flow like any other create.
// Quote gate (same rule as /api/onboarding/trigger-build): an intake whose quote is draft / pending_approval / rejected
// gives no prefill, only the reason; quote_status none or approved passes.
// Not carried (the flow's steps and API take none of it; card SF-P RISKS): the spec's content seed, its brand colours,
// binding a new client back to the intake, the intake status.
import { normalizeDomain, isPack, type Locale, type PackKey } from "./page-model";

export interface NewSitePrefill {
  name: string;
  domain: string;
  locale: Locale;
  packs: PackKey[];
  /** The client the intake is already bound to (intake_forms.organization_id): the form opens on 既有客戶 with it. */
  organizationId: string | null;
}

export const BLOCKED_QUOTE_STATES: ReadonlySet<string> = new Set(["draft", "pending_approval", "rejected"]);
export type IntakePrefillResult = NewSitePrefill | { blockedQuote: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Pure: the rows read by intakePrefill -> the form's starting values. A spec of another intake gives nothing. */
export function prefillFromIntake(
  spec: { intake_form_id: string | null; spec_data: unknown },
  intake: { id: string; form_data: unknown; organization_id: string | null; quote_status?: string | null },
): IntakePrefillResult | null {
  if (spec.intake_form_id !== null && spec.intake_form_id.toLowerCase() !== intake.id.toLowerCase()) return null;
  if (intake.quote_status && BLOCKED_QUOTE_STATES.has(intake.quote_status)) return { blockedQuote: intake.quote_status };
  const form = obj(intake.form_data);
  const data = obj(spec.spec_data);
  const packs = Array.isArray(data.packs) ? data.packs.filter(isPack) : [];
  return {
    name: typeof form.company_name === "string" ? form.company_name.trim() : "",
    domain: typeof form.domain === "string" ? normalizeDomain(form.domain) ?? "" : "",
    locale: form.language === "zh-TW" ? "zh-TW" : "en",
    packs: [...new Set<PackKey>(["base", ...packs])],
    organizationId: typeof intake.organization_id === "string" ? intake.organization_id : null,
  };
}

type Db = { from: (table: string) => any };   // eslint-disable-line @typescript-eslint/no-explicit-any

/** Reads the spec and its intake. Malformed ids or anything missing -> null (the form opens empty). */
export async function intakePrefill(db: Db, specId: string | undefined, intakeId: string | undefined): Promise<IntakePrefillResult | null> {
  if (!specId || !intakeId || !UUID_RE.test(specId) || !UUID_RE.test(intakeId)) return null;
  const [{ data: spec }, { data: intake }] = await Promise.all([
    db.from("website_specs").select("id,intake_form_id,spec_data").eq("id", specId).maybeSingle(),
    db.from("intake_forms").select("id,form_data,organization_id,quote_status").eq("id", intakeId).maybeSingle(),
  ]);
  if (!spec || !intake) return null;
  return prefillFromIntake(spec, intake);
}
