// SF-P: the 客戶問卷 -> /ops/sites/new prefill keeps trigger-build's quote gate (critic M2) and never mixes another intake's spec.
import { describe, expect, it } from "vitest";
import { prefillFromIntake } from "../intake-prefill";

const intake = (quote_status: string | null) => ({
  id: "33333333-3333-4333-8333-333333333333", organization_id: null, quote_status,
  form_data: { company_name: " Moon Bakery ", domain: "https://Moon-Bakery.example/", language: "en" },
});
const spec = { intake_form_id: "33333333-3333-4333-8333-333333333333", spec_data: { packs: ["ecommerce", "nonsense"] } };

describe("prefillFromIntake", () => {
  it("an unapproved quote gives only the reason, never the prefill", () => {
    for (const q of ["draft", "pending_approval", "rejected"]) expect(prefillFromIntake(spec, intake(q))).toEqual({ blockedQuote: q });
  });

  it("no quote or an approved one prefills; unknown packs are dropped, base is always in", () => {
    for (const q of [null, "none", "approved"]) {
      expect(prefillFromIntake(spec, intake(q))).toEqual({ name: "Moon Bakery", domain: "moon-bakery.example", locale: "en", packs: ["base", "ecommerce"], organizationId: null });
    }
  });

  it("a spec of another intake gives nothing", () => {
    expect(prefillFromIntake({ ...spec, intake_form_id: "44444444-4444-4444-8444-444444444444" }, intake(null))).toBeNull();
  });
});
