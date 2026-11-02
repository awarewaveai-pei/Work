// Card C16.4 (SPEC D24 ①③): risk-weighted sampling keeps the total and favours high-risk mail; the generation JSON takes
// only the fixed angle vocabulary; a winning angle reaches the prompt and pickVariant leans to it without fixing it.
import { describe, expect, it } from "vitest";
import { buildBrandContext } from "../brand-context";
import { parseGenerationOutput } from "../generation-schema";
import { decideSample, pickVariant, winningAngle, favouredLabel, FIRST_AUTO_APPROVALS, type SampleContext } from "../review-policy";

const N = 6000;
const PCT = 10;

describe("C16.1 risk-weighted sampling", () => {
  it("at the same pct a high-risk mail is sampled at least twice as often as a low-risk one, and the total stays pct", () => {
    // half the leads are in an industry the profile never mailed and rest on low-confidence evidence; the rest are routine
    const base: Omit<SampleContext, "meanWeight"> = { autoApproved: FIRST_AUTO_APPROVALS, mailedIndustries: new Set(["餐飲"]), angleRates: new Map(), orgBadRate: null, winner: null };
    const risky = { industry: "牙醫", minConfidence: 0.55 };
    const routine = { industry: "餐飲", minConfidence: 0.9 };
    const weightOf = (i: typeof risky) => decideSample({ ...base, meanWeight: 1 }, { leadId: "w", pct: PCT, ...i, angle: "question" }).weight;
    const meanWeight = (weightOf(risky) + weightOf(routine)) / 2;
    const ctx: SampleContext = { ...base, meanWeight };

    let high = 0, low = 0;
    for (let i = 0; i < N; i++) {
      if (decideSample(ctx, { leadId: `hi-${i}`, pct: PCT, ...risky }).sampled) high++;
      if (decideSample(ctx, { leadId: `lo-${i}`, pct: PCT, ...routine }).sampled) low++;
    }
    expect(high / N).toBeGreaterThanOrEqual(2 * (low / N));
    expect((high + low) / (2 * N)).toBeGreaterThan(0.08);
    expect((high + low) / (2 * N)).toBeLessThan(0.12);
    // the same lead always gets the same answer
    expect(decideSample(ctx, { leadId: "hi-7", pct: PCT, ...risky })).toEqual(decideSample(ctx, { leadId: "hi-7", pct: PCT, ...risky }));
  });
});

describe("C16.3 angle feedback", () => {
  const body = (label: string, angle: unknown) => ({ label, angle, text: "t", evidence_ids: ["e1"] });
  const out = (a: unknown, b: unknown) => JSON.stringify({ subjects: ["一", "二"], bodies: [body("A", a), body("B", b)], followups: [] });

  it("the schema rejects an angle outside the vocabulary", () => {
    expect(parseGenerationOutput(out("observation", "question"), ["e1"]).ok).toBe(true);
    const bad = parseGenerationOutput(out("observation", "flattery"), ["e1"]);
    expect(bad.ok).toBe(false);
    expect(bad.ok === false && bad.error).toMatch(/angle/);
  });

  it("two angles x 30 sends: the prompt names the winner, pickVariant keeps at least 20% for the other", () => {
    const rows = [{ angle: "observation", sent: 30, replied: 9 }, { angle: "question", sent: 30, replied: 3 }];
    const winner = winningAngle(rows);
    expect(winner).toBe("observation");
    expect(winningAngle([{ ...rows[0], sent: 29 }, rows[1]])).toBeNull();

    const input = { lead: { name: "小樹", consent_source: "self_published:https://a.example" }, profile: null, signature: "王小明\n好夥伴", collector: "好夥伴",
      evidence: [{ id: "e1", claim: "週末開親子課", excerpt: null, source_url: "https://a.example", status: "approved" as const }] };
    const prompt = buildBrandContext({ ...input, winningAngle: winner }).prompt;
    expect(prompt).toContain("## 有效做法");
    expect(prompt).toMatch(/有效做法[\s\S]*observation/);
    expect(buildBrandContext(input).prompt).not.toContain("## 有效做法");

    const favoured = favouredLabel(winner, [{ label: "A", angle: "question" }, { label: "B", angle: "observation" }]);
    expect(favoured).toBe("B");
    let other = 0;
    for (let i = 0; i < N; i++) if (pickVariant(`lead-${i}`, favoured) !== favoured) other++;
    expect(other / N).toBeGreaterThanOrEqual(0.2);
    expect(other / N).toBeLessThan(0.4);
  });
});
