import { describe, it, expect } from "vitest";
import { normalizeLead, dedupKey, domainOf, isSuppressed, flagDuplicatesInBatch } from "../normalize";
import { scoreLead, scoreLeadQuality, scoreContactability, computePriority } from "../scoring";

describe("normalize", () => {
  it("trims, lowercases email + industry, empty → null", () => {
    const n = normalizeLead({ name: "  Acme  ", email: "  HI@Acme.COM ", industry: " Yoga ", website: "" });
    expect(n.normalized_name).toBe("Acme");
    expect(n.email).toBe("hi@acme.com");
    expect(n.normalized_industry).toBe("yoga");
    expect(n.website).toBeNull();
  });

  it("domainOf strips protocol/www from url and email", () => {
    expect(domainOf("https://www.Acme.com/contact")).toBe("acme.com");
    expect(domainOf("hi@Acme.com")).toBe("acme.com");
    expect(domainOf(null)).toBeNull();
  });

  it("dedupKey prefers email > domain > name", () => {
    expect(dedupKey(normalizeLead({ email: "a@b.com", website: "x.com", name: "X" }))).toBe("email:a@b.com");
    expect(dedupKey(normalizeLead({ website: "https://x.com", name: "X" }))).toBe("domain:x.com");
    expect(dedupKey(normalizeLead({ name: "X Co" }))).toBe("name:x co");
    expect(dedupKey(normalizeLead({}))).toBeNull();
  });

  it("flagDuplicatesInBatch keeps first occurrence", () => {
    const batch = [
      normalizeLead({ email: "a@b.com" }),
      normalizeLead({ email: "a@b.com" }),
      normalizeLead({ email: "c@d.com" }),
      normalizeLead({}), // no key → unique
      normalizeLead({}),
    ];
    expect(flagDuplicatesInBatch(batch)).toEqual([false, true, false, false, false]);
  });

  it("isSuppressed matches email, domain, and global scope", () => {
    const n = normalizeLead({ email: "x@blocked.com" });
    expect(isSuppressed(n, [{ email: "x@blocked.com" }])).toBe(true);
    expect(isSuppressed(n, [{ domain: "blocked.com", scope: "domain" }])).toBe(true);
    expect(isSuppressed(n, [{ scope: "global" }])).toBe(true);
    expect(isSuppressed(n, [{ email: "other@x.com" }])).toBe(false);
  });
});

describe("scoring — mechanical (no LLM)", () => {
  it("full-data lead scores high quality + contactability", () => {
    const lead = {
      name: "Acme Yoga", website: "https://acme.com", social_url: "https://instagram.com/acme",
      email: "hi@acme.com", phone: "0900",
      industry: "yoga", observation: "常辦週末小班", source_url: "https://dir.com/acme",
      contact_name: "Jane", contact_role: "Owner",
    };
    expect(scoreLeadQuality(lead, { isDuplicate: false })).toBe(100);
    expect(scoreContactability(lead, { emailVerified: true, doNotContact: false })).toBe(100);
  });

  it("duplicate loses the non-duplicate 10 points", () => {
    const lead = { name: "A", website: "x.com", email: "a@x.com", industry: "y", observation: "o", source_url: "s" };
    expect(scoreLeadQuality(lead, { isDuplicate: true })).toBe(90);
  });

  it("do_not_contact loses contactability 10 points", () => {
    const lead = { email: "a@x.com" };
    expect(scoreContactability(lead, { doNotContact: true })).toBe(25);
    expect(scoreContactability(lead, { doNotContact: false })).toBe(35);
  });

  it("ICP rewards industry match against the service profile", () => {
    const lead = { industry: "yoga-wellness", recommended_angle: "週末活動" };
    const sp = { industry: "yoga", target_audiences: ["wellness", "studio"] };
    const r = scoreLead(lead, { serviceProfile: sp });
    expect(r.icp_score).toBeGreaterThanOrEqual(25);
  });

  it("priority thresholds (§8.4)", () => {
    expect(computePriority(85)).toBe("high");
    expect(computePriority(70)).toBe("medium");
    expect(computePriority(45)).toBe("low");
    expect(computePriority(20)).toBe("not_recommended");
  });

  it("scoreLead returns all three + overall + priority", () => {
    const r = scoreLead({ name: "A", email: "a@b.com", website: "b.com", industry: "yoga", observation: "o", source_url: "s", contact_role: "Owner" }, { emailVerified: false });
    expect(r).toHaveProperty("lead_quality_score");
    expect(r).toHaveProperty("contactability_score");
    expect(r).toHaveProperty("icp_score");
    expect(r.score).toBe(Math.round((r.lead_quality_score + r.contactability_score + r.icp_score) / 3));
    expect(["high", "medium", "low", "not_recommended"]).toContain(r.priority);
  });
});
