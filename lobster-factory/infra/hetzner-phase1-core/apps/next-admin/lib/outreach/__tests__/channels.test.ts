// channels.ts: the consent_source prefix picks the channel; a form tag always fits FluentCRM's 192-byte tag slug.
import { describe, expect, it } from "vitest";
import { channelOfConsentSource, channelTags } from "../channels";

describe("channels", () => {
  it.each([["meta_lead_ad:123", "meta_lead_ad"], ["meta_lead_ad_csv:Spring", "meta_lead_ad"], ["replied", null], [null, null], ["", null]])(
    "%s -> %s", (src, ch) => expect(channelOfConsentSource(src)).toBe(ch));

  it("is the channel tag, plus the form tag when a form is named", () => {
    expect(channelTags("cold_outreach")).toEqual(["來源：冷信開發"]);
    expect(channelTags("meta_lead_ad", "  塔羅免費解讀 ")).toEqual(["來源：Meta 名單廣告", "表單：塔羅免費解讀"]);
    expect(channelTags("meta_lead_ad", "   ")).toEqual(["來源：Meta 名單廣告"]);
  });

  it("cuts a long form name by whole characters so the slug fits 192 bytes", () => {
    for (const name of ["塔".repeat(40), "🔮".repeat(40), "a".repeat(400)]) {
      const tag = channelTags("meta_lead_ad", name)[1];
      expect(encodeURIComponent(tag).length).toBeLessThanOrEqual(192);
      expect(tag.length).toBeGreaterThan(3);
    }
  });

  it("drops a lone surrogate instead of throwing", () => {
    expect(channelTags("meta_lead_ad", "春\ud800季")).toEqual(["來源：Meta 名單廣告", "表單：春季"]);
  });
});
